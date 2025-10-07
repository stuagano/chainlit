"""Shared helpers for repository scripts."""

from pathlib import Path

# The repository root acts as the anchor for all script paths so helpers can
# be reused from local shells, CI, or Cloud Build without recomputing the
# location.
REPO_ROOT = Path(__file__).resolve().parents[1]

__all__ = ["REPO_ROOT"]
