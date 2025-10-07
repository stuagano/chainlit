#!/usr/bin/env python3
"""Bootstrap the local Chainlit development environment."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

if __package__ is None:  # pragma: no cover - executed when run as a script
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts import REPO_ROOT
from scripts._env import (
    ENV_FILE,
    ENV_TEMPLATE,
    merge_template,
    parse_env_file,
    preserve_extra_lines,
)
from scripts.smoke_test import run_smoke_test


def _collect_env_values(non_interactive: bool) -> Tuple[Dict[str, str], List[str]]:
    template_values = parse_env_file(ENV_TEMPLATE)
    if not template_values:
        raise SystemExit(
            "Expected .env.example to describe environment variables. "
            "Please add variables to the template before running this script."
        )

    existing_values = parse_env_file(ENV_FILE)
    collected: Dict[str, str] = {}
    missing_required: List[str] = []

    mode_msg = "non-interactively" if non_interactive else "interactively"
    print(
        "Configuring environment variables defined in .env.example "
        f"{mode_msg}. Press Enter to keep defaults when prompted."
    )
    for key, default in template_values.items():
        current = existing_values.get(key, "")
        if current:
            collected[key] = current
            print(f"- {key}: using existing value")
            continue

        env_value = os.environ.get(key, "")
        if env_value:
            collected[key] = env_value
            print(f"- {key}: using value from current shell environment")
            continue

        prompt = f"Enter value for {key}"
        if default:
            prompt += f" [{default}]"
        prompt += ": "

        if non_interactive:
            value = default
        else:
            try:
                value = input(prompt).strip()
            except KeyboardInterrupt:  # pragma: no cover - interactive guard
                print("\nSetup interrupted by user.")
                raise SystemExit(1)

        if not value:
            if default:
                value = default
            else:
                missing_required.append(key)
        collected[key] = value
    return collected, missing_required


def write_env_file(values: Dict[str, str]) -> None:
    template_lines = ENV_TEMPLATE.read_text().splitlines()
    extras = preserve_extra_lines(
        ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else [],
        parse_env_file(ENV_TEMPLATE).keys(),
    )
    content = merge_template(template_lines, values, extras)
    try:
        ENV_FILE.write_text(content)
    except OSError as exc:
        raise SystemExit(
            f"Failed to write {ENV_FILE.relative_to(REPO_ROOT)}: {exc}"
        ) from exc
    print(f"Updated {ENV_FILE.relative_to(REPO_ROOT)} with {len(values)} variables.")


def _summarize_missing(missing: Iterable[str]) -> None:
    missing_list = list(missing)
    if not missing_list:
        return

    print("\n⚠️  The following variables remain empty in .env:")
    for key in missing_list:
        print(f"   - {key}")
    print(
        "Populate them later (for example via `direnv`, Secret Manager, or by rerunning this script) "
        "before connecting to providers that require them."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare a local Chainlit development environment."
    )
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Run pnpm install, uv sync, and uv run chainlit hello after writing .env.",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Use defaults and existing environment variables without prompting. Intended for CI or bootstrap scripts.",
    )
    args = parser.parse_args()

    if not ENV_TEMPLATE.exists():
        raise SystemExit(
            "Missing .env.example. Create it with the required variables before running this script."
        )

    values, missing = _collect_env_values(non_interactive=args.non_interactive)
    write_env_file(values)
    _summarize_missing(missing)

    # Ensure child processes inherit the configured environment variables.
    for key, value in values.items():
        os.environ[key] = value

    if args.smoke_test:
        success = run_smoke_test()
        if success:
            print(
                "\nSmoke test completed successfully. Chainlit was started, probed, and "
                "shut down automatically."
            )
        else:
            print(
                "\nOne or more smoke test steps failed. Resolve the issue and rerun the script "
                "or execute the commands manually."
            )
            raise SystemExit(1)
    else:
        print(
            "\nNext steps:\n"
            "  1. pnpm install --frozen-lockfile\n"
            "  2. cd backend && uv sync --frozen --extra mypy\n"
            "  3. uv run chainlit hello\n"
            "Run with --smoke-test or python3 scripts/smoke_test.py to execute these commands automatically."
        )


if __name__ == "__main__":
    try:
        main()
    except SystemExit as exc:
        if exc.code not in (0, 1):
            raise
        sys.exit(exc.code)
