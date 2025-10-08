"""Helpers for interacting with the gcloud CLI and resolving shared config."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

from scripts import REPO_ROOT

PROJECT_ENV_CANDIDATES = ("GCP_PROJECT_ID", "VERTEX_PROJECT_ID")
GCLOUD_CONFIG_PROJECT_KEYS = ("core/project", "core/project_id")


def run_gcloud(args: Iterable[str], *, capture_output: bool = False) -> subprocess.CompletedProcess:
    """Execute a gcloud command while echoing the invocation."""

    command = ["gcloud", *args]
    print(f"\n→ {' '.join(command)}")
    return subprocess.run(
        command,
        check=False,
        capture_output=capture_output,
        text=True,
    )


def gcloud_available() -> bool:
    """Return True when the gcloud CLI is present on PATH."""

    return shutil.which("gcloud") is not None


def read_gcloud_project() -> Optional[Tuple[str, str]]:
    """Return the active gcloud project and the config key it came from."""

    if not gcloud_available():
        return None

    for key in GCLOUD_CONFIG_PROJECT_KEYS:
        result = run_gcloud(
            ["config", "get-value", key, "--quiet"],
            capture_output=True,
        )
        candidate = result.stdout.strip()
        if result.returncode == 0 and candidate:
            return candidate, key

    result = run_gcloud(["config", "list", "--format=value(core.project)", "--quiet"], capture_output=True)
    if result.returncode == 0:
        candidate = result.stdout.strip()
        if candidate:
            return candidate, "config list"

    return None


def resolve_setting(
    cli_value: Optional[str],
    *,
    candidate_keys: Iterable[str],
    env_file_values: Dict[str, str],
    allow_gcloud_fallback: bool = False,
) -> Tuple[Optional[str], Optional[Tuple[str, str]]]:
    """Determine a configuration value and where it originated."""

    if cli_value:
        return cli_value, None

    for key in candidate_keys:
        env_value = os.environ.get(key)
        if env_value:
            return env_value, ("env", key)

        file_value = env_file_values.get(key, "")
        if file_value:
            return file_value, ("file", key)

    if allow_gcloud_fallback:
        gcloud_project = read_gcloud_project()
        if gcloud_project:
            project, config_key = gcloud_project
            return project, ("gcloud", config_key)

    return None, None


def log_source(name: str, source: Optional[Tuple[str, str]], source_path: Path) -> None:
    """Print where a resolved value originated for auditability."""

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
    elif origin == "gcloud":
        print(f"Using {name} from gcloud config value {key}.")


__all__ = [
    "PROJECT_ENV_CANDIDATES",
    "GCLOUD_CONFIG_PROJECT_KEYS",
    "gcloud_available",
    "log_source",
    "read_gcloud_project",
    "resolve_setting",
    "run_gcloud",
]
