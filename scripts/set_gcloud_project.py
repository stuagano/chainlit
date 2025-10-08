#!/usr/bin/env python3
"""Ensure the gcloud CLI uses the project configured in the shared .env."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict

if __package__ is None:  # pragma: no cover - executed when run as a script
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts import REPO_ROOT
from scripts._env import ENV_FILE, parse_env_file
from scripts._gcp import (
    PROJECT_ENV_CANDIDATES,
    gcloud_available,
    log_source,
    read_gcloud_project,
    resolve_setting,
    run_gcloud,
)


def _load_env(source: Path) -> Dict[str, str]:
    """Read key/value pairs from the provided env file."""

    if not source.exists():
        return {}
    return parse_env_file(source)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Align the local gcloud config with the project specified in the shared .env so "
            "Secret Manager syncs and other helpers stay DRY across shells."
        )
    )
    parser.add_argument(
        "--project",
        default=None,
        help=(
            "Optional project ID. When omitted the script falls back to environment variables "
            f"{', '.join(PROJECT_ENV_CANDIDATES)} or their entries in .env."
        ),
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=ENV_FILE,
        help="Path to the .env file to read (defaults to the repository .env).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the gcloud command without executing it.",
    )
    args = parser.parse_args()

    source_path = args.source if args.source.is_absolute() else REPO_ROOT / args.source
    env_values = _load_env(source_path)

    project, project_source = resolve_setting(
        args.project,
        candidate_keys=PROJECT_ENV_CANDIDATES,
        env_file_values=env_values,
    )
    if not project:
        existing = read_gcloud_project()
        if existing:
            current_project, key = existing
            raise SystemExit(
                "Populate .env with GCP_PROJECT_ID (or VERTEX_PROJECT_ID) or pass --project so the CLI matches the shared "
                f"configuration. gcloud currently targets '{current_project}' via {key}."
            )
        raise SystemExit(
            "Populate .env with GCP_PROJECT_ID (or VERTEX_PROJECT_ID) or pass --project so the CLI matches the shared configuration."
        )

    log_source("project", project_source, source_path)

    if args.dry_run:
        print("\nDry run – would execute:\n")
        print(f"gcloud config set project {project} --quiet")
        return

    if not gcloud_available():
        raise SystemExit("gcloud CLI is required. Install it and authenticate before setting the project.")

    result = run_gcloud(["config", "set", "project", project, "--quiet"])
    if result.returncode != 0:
        raise SystemExit("Failed to set the gcloud project. Review the output above for details.")

    print(
        f"\nConfigured gcloud to use project '{project}'. Future Secret Manager syncs and build steps will now reuse the same "
        "project ID defined in .env."
    )


if __name__ == "__main__":
    main()
