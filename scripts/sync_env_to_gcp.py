#!/usr/bin/env python3
"""Mirror the local `.env` file into GCP Secret Manager for automation."""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

if __package__ is None:  # pragma: no cover - executed when run as a script
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts import REPO_ROOT
from scripts._env import ENV_FILE, ENV_TEMPLATE, parse_env_file
from scripts._gcp import (
    PROJECT_ENV_CANDIDATES,
    gcloud_available,
    log_source,
    resolve_setting,
    run_gcloud,
)

DEFAULT_PROJECT_ENV = "GCP_PROJECT_ID"
DEFAULT_SECRET_ENV = "CHAINLIT_SECRET_NAME"
DEFAULT_REPLICA_ENV = "GCP_SECRET_MANAGER_REPLICA_LOCATION"


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
def _secret_exists(project: str, secret: str) -> bool:
    result = run_gcloud(
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


def _resolve_setting(
    cli_value: Optional[str],
    *,
    candidate_keys: Iterable[str],
    env_file_values: Dict[str, str],
) -> Tuple[Optional[str], Optional[Tuple[str, str]]]:
    """Determine the effective configuration value and where it came from."""

    if cli_value:
        return cli_value, None

    for key in candidate_keys:
        env_value = os.environ.get(key)
        if env_value:
            return env_value, ("env", key)

        file_value = env_file_values.get(key, "")
        if file_value:
            return file_value, ("file", key)

    return None, None


def _log_source(name: str, source: Optional[Tuple[str, str]], source_path: Path) -> None:
    if not source:
        return

    origin, key = source
    if origin == "env":
        print(f"Using {name} from environment variable {key}.")
    elif origin == "file":
        try:
            relative = source_path.relative_to(REPO_ROOT)
        except ValueError:
            relative = source_path
        print(f"Using {name} from {relative} entry {key}.")


def _create_secret(project: str, secret: str, replica_location: str | None) -> None:
    command = [
        "secrets",
        "create",
        secret,
        "--project",
        project,
    ]
    if replica_location:
        command.extend(["--replication-policy=user-managed", f"--locations={replica_location}"])
    else:
        command.append("--replication-policy=automatic")

    result = run_gcloud(command)
    result = _run_gcloud(command)
    if result.returncode != 0:
        raise SystemExit(f"Failed to create secret '{secret}' in project '{project}'.")


def _add_secret_version(project: str, secret: str, data_path: Path) -> None:
    result = run_gcloud(
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
        "--replica-location",
        default=None,
        help=(
            "Optional Secret Manager replica location (for example 'us'). "
            f"Defaults to the environment variable {DEFAULT_REPLICA_ENV}. When omitted the secret uses automatic replication."
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

    project, project_source = resolve_setting(
        args.project,
        candidate_keys=PROJECT_ENV_CANDIDATES,
        env_file_values=env_values,
        allow_gcloud_fallback=not args.dry_run,
    project, project_source = _resolve_setting(
        args.project,
        candidate_keys=(DEFAULT_PROJECT_ENV, "VERTEX_PROJECT_ID"),
        env_file_values=env_values,
    )
    if not project:
        raise SystemExit(
            "Set --project, GCP_PROJECT_ID, or VERTEX_PROJECT_ID (for Vertex AI workloads) so the script knows which project to target."
        )
    log_source("project", project_source, source_path)

    secret, secret_source = resolve_setting(
    _log_source("project", project_source, source_path)

    secret, secret_source = _resolve_setting(
        args.secret,
        candidate_keys=(DEFAULT_SECRET_ENV,),
        env_file_values=env_values,
    )
    if not secret:
        raise SystemExit(
            "Set --secret, CHAINLIT_SECRET_NAME, or define the key in your .env so the script can identify the Secret Manager entry."
        )
    log_source("secret", secret_source, source_path)

    replica_location, replica_source = resolve_setting(
    _log_source("secret", secret_source, source_path)

    replica_location, replica_source = _resolve_setting(
        args.replica_location,
        candidate_keys=(DEFAULT_REPLICA_ENV,),
        env_file_values=env_values,
    )
    log_source("replica location", replica_source, source_path)
    _log_source("replica location", replica_source, source_path)

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

    if not gcloud_available():
        raise SystemExit("gcloud CLI is required. Install it and authenticate before syncing secrets.")

    if not _secret_exists(project, secret):
        if not args.create:
            raise SystemExit(
                f"Secret '{secret}' does not exist in project '{project}'. Pass --create to provision it automatically."
            )
        _create_secret(project, secret, replica_location)

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
