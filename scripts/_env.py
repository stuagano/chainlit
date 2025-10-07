"""Helpers for reading and writing repository `.env` files."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List

from . import REPO_ROOT

ENV_TEMPLATE = REPO_ROOT / ".env.example"
ENV_FILE = REPO_ROOT / ".env"


def parse_env_file(path: Path) -> Dict[str, str]:
    """Return key/value pairs from an env-style file."""

    values: Dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text().splitlines():
        if raw_line.strip().startswith("#") or "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def merge_template(
    template_lines: Iterable[str],
    values: Dict[str, str],
    extras: List[str],
) -> str:
    """Render env content based on template lines and provided values."""

    rendered: List[str] = []
    for raw_line in template_lines:
        if raw_line.strip().startswith("#") or "=" not in raw_line:
            rendered.append(raw_line.rstrip())
            continue
        key = raw_line.split("=", 1)[0].strip()
        rendered.append(f"{key}={values.get(key, '')}")

    if extras:
        rendered.append("")
        rendered.append("# Additional entries preserved from existing .env")
        rendered.extend(extras)

    return "\n".join(rendered).strip() + "\n"


def preserve_extra_lines(
    existing_lines: Iterable[str], template_keys: Iterable[str]
) -> List[str]:
    template_key_set = {key.strip() for key in template_keys}
    extras: List[str] = []
    for raw_line in existing_lines:
        if raw_line.strip().startswith("#") or "=" not in raw_line:
            continue
        key = raw_line.split("=", 1)[0].strip()
        if key not in template_key_set:
            extras.append(raw_line.rstrip())
    return extras


__all__ = [
    "ENV_FILE",
    "ENV_TEMPLATE",
    "merge_template",
    "parse_env_file",
    "preserve_extra_lines",
]
