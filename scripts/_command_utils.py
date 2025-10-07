"""Lightweight wrappers for running shell commands from helper scripts."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Sequence


def run_command(command: Sequence[str], cwd: Path | None = None) -> bool:
    """Execute a command, returning ``True`` on success."""

    print(f"\n→ {' '.join(command)}")
    try:
        subprocess.run(command, cwd=cwd, check=True)
    except FileNotFoundError:
        print(
            f"  ! Command '{command[0]}' is not available. Install it or rerun without the current option."
        )
        return False
    except subprocess.CalledProcessError as exc:
        print(f"  ! Command failed with exit code {exc.returncode}.")
        return False
    return True


def attempt_with_fallback(
    primary: Sequence[str],
    fallback: Sequence[str],
    *,
    cwd: Path | None = None,
) -> bool:
    """Run ``primary`` and fall back to ``fallback`` if it fails."""

    if run_command(primary, cwd=cwd):
        return True

    print(f"  ! Falling back to '{' '.join(fallback)}' for developer convenience.")
    return run_command(fallback, cwd=cwd)


__all__ = ["attempt_with_fallback", "run_command"]
