#!/usr/bin/env python3
"""Mirror the local `.env` file into GCP Secret Manager for automation."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List

if __package__ is None:  # pragma: no cover - executed when run as a script
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts import REPO_ROOT
from scripts._env import ENV_FILE, ENV_TEMPLATE, parse_env_file

DEFAULT_PROJECT_ENV = "GCP_PROJECT_ID"
DEFAULT_SECRET_ENV = "CHAINLIT_SECRET_NAME"


def _build_payload(
    template: Dict[str, str],
    values: Dict[str, str],
    *,
    include_empty: bool,
) -> List[str]:
    """Render a Secret Manager payload honoring the template order."""

    payload: List[str] = []
    for key in template:
        value = values.get(key, "")
        if value or include_empty:
            payload.append(f"{key}={value}")

    for key, value in values.items():
        if key in template:
            continue
        if value or include_empty:
            payload.append(f"{key}={value}")

    return payload


def _run_gcloud(args: Iterable[str], *, capture_output: bool = False) -> subprocess.CompletedProcess:
    command = ["gcloud", *args]
    print(f"\n→ {' '.join(command)}")
    return subprocess.run(
        command,
        check=False,
        capture_output=capture_output,
        text=True,
    )


def _secret_exists(project: str, secret: str) -> bool:
    result = _run_gcloud(
        [
            "secrets",
            "describe",
            secret,
            "--project",
            project,
            "--format=value(name)",
            "--quiet",
        ],
        capture_output=True,
    )
    return result.returncode == 0


def _create_secret(project: str, secret: str) -> None:
    result = _run_gcloud(
        [
            "secrets",
            "create",
            secret,
            "--project",
            project,
            "--replication-policy=automatic",
        ]
    )
    if result.returncode != 0:
        raise SystemExit(f"Failed to create secret '{secret}' in project '{project}'.")


def _add_secret_version(project: str, secret: str, data_path: Path) -> None:
    result = _run_gcloud(
        [
            "secrets",
            "versions",
            "add",
            secret,
            "--project",
            project,
            f"--data-file={data_path}",
        ]
    )
    if result.returncode != 0:
        raise SystemExit(
            f"Failed to add a new version for secret '{secret}'. See the gcloud output above for details."
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload .env values to Secret Manager so Cloud Build and CI reuse the same configuration."
    )
    parser.add_argument(
        "--project",
        default=None,
        help=(
            "GCP project ID. Defaults to the environment variable "
            f"{DEFAULT_PROJECT_ENV} or VERTEX_PROJECT_ID if available."
        ),
    )
    parser.add_argument(
        "--secret",
        default=None,
        help=(
            "Secret Manager name that should store the .env payload. Defaults to the environment variable "
            f"{DEFAULT_SECRET_ENV}."
        ),
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=ENV_FILE,
        help="Path to the .env file to mirror (defaults to the repository .env).",
    )
    parser.add_argument(
        "--include-empty",
        action="store_true",
        help="Include keys with empty values. By default empty fields are omitted to avoid overwriting populated secrets.",
    )
    parser.add_argument(
        "--create",
        action="store_true",
        help="Create the Secret Manager entry if it does not exist yet.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the payload instead of uploading it. Useful for validating which keys will sync.",
    )
    args = parser.parse_args()

    if shutil.which("gcloud") is None:
        raise SystemExit("gcloud CLI is required. Install it and authenticate before syncing secrets.")

    project = (
        args.project
        or os.environ.get(DEFAULT_PROJECT_ENV)
        or os.environ.get("VERTEX_PROJECT_ID")
    )
    if not project:
        raise SystemExit(
            "Set --project, GCP_PROJECT_ID, or VERTEX_PROJECT_ID so the script knows which project to target."
        )

    secret = args.secret or os.environ.get(DEFAULT_SECRET_ENV)
    if not secret:
        raise SystemExit(
            "Set --secret or the CHAINLIT_SECRET_NAME environment variable to identify the Secret Manager entry."
        )

    if not ENV_TEMPLATE.exists():
        raise SystemExit("Missing .env.example. Populate it before mirroring secrets to GCP.")

    template_values = parse_env_file(ENV_TEMPLATE)
    if not template_values:
        raise SystemExit(".env.example is empty. Define the expected keys before syncing to Secret Manager.")

    source_path = args.source if args.source.is_absolute() else REPO_ROOT / args.source
    if not source_path.exists():
        raise SystemExit(f"{source_path} does not exist. Run scripts/start_local.py first to generate it.")

    env_values = parse_env_file(source_path)
    if not env_values:
        raise SystemExit(f"No key/value pairs found in {source_path}. Populate it before syncing to GCP.")

    missing_required = [key for key in template_values if not env_values.get(key)]
    if missing_required and not args.include_empty:
        print(
            "\n⚠️  The following keys are empty and will be skipped. Rerun the local bootstrapper or pass --include-empty if you "
            "intend to clear them in Secret Manager:"
        )
        for key in missing_required:
            print(f"   - {key}")

    payload_lines = _build_payload(template_values, env_values, include_empty=args.include_empty)
    if not payload_lines:
        raise SystemExit("Nothing to upload after filtering empty values. Populate .env and rerun.")

    if args.dry_run:
        print("\nDry run – payload that would be uploaded:\n")
        print("\n".join(payload_lines))
        return

    if not _secret_exists(project, secret):
        if not args.create:
            raise SystemExit(
                f"Secret '{secret}' does not exist in project '{project}'. Pass --create to provision it automatically."
            )
        _create_secret(project, secret)

    with tempfile.NamedTemporaryFile("w", delete=False) as tmp:
        tmp.write("\n".join(payload_lines) + "\n")
        tmp_path = Path(tmp.name)

    try:
        _add_secret_version(project, secret, tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    print(
        "\nSecret Manager updated successfully. Reference this secret from Cloud Build via availableSecrets and write the "
        "payload to .env before invoking scripts/smoke_test.py."
    )


if __name__ == "__main__":
    main()
