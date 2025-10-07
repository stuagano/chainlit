#!/usr/bin/env python3
"""Execute the standard Chainlit smoke test across environments."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from contextlib import suppress
from pathlib import Path
from typing import Optional, Sequence
from urllib.error import URLError
from urllib.request import urlopen

if __package__ is None:  # pragma: no cover - executed when run as a script
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts import REPO_ROOT
from scripts._command_utils import attempt_with_fallback

READINESS_PHRASE = "Your app is available at"
DEFAULT_PYTHON_EXTRAS: tuple[str, ...] = ("mypy",)


def _build_uv_sync_command(*, frozen: bool, extras: Sequence[str]) -> list[str]:
    """Construct a ``uv sync`` command that installs optional extras."""

    command: list[str] = ["uv", "sync"]
    if frozen:
        command.append("--frozen")
    for extra in extras:
        command.extend(["--extra", extra])
    return command


def _probe_http(url: str, timeout: float) -> bool:
    """Poll ``url`` until it responds with a 2xx/3xx status."""

    deadline = time.monotonic() + timeout
    last_error: Optional[Exception] = None
    while time.monotonic() < deadline:
        try:
            with urlopen(url) as response:  # nosec - internal smoke test
                if 200 <= response.status < 400:
                    return True
        except URLError as exc:  # pragma: no cover - exercised in runtime smoke tests
            last_error = exc
            time.sleep(0.5)
        except Exception as exc:  # pragma: no cover - broad guard for CI environments
            last_error = exc
            time.sleep(0.5)

    if last_error:
        print(f"  ! HTTP readiness probe failed for {url}: {last_error}")
    return False


def _terminate_process(
    process: subprocess.Popen[bytes], *, timeout: float = 10.0
) -> None:
    """Attempt to stop ``process`` gracefully, falling back to kill."""

    if process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:  # pragma: no cover - defensive guard
        process.kill()
        process.wait(timeout=timeout)


def _run_chainlit_hello(timeout: float) -> bool:
    """Launch ``chainlit hello`` and verify it serves HTTP before shutting down."""

    command = ["uv", "run", "chainlit", "hello", "--ci", "--headless"]
    print(f"\n→ {' '.join(command)}")

    try:
        process = subprocess.Popen(
            command,
            cwd=REPO_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except FileNotFoundError:
        print(
            "  ! Command 'uv' is not available. Install uv before running the smoke test."
        )
        return False

    host = os.environ.get("CHAINLIT_HOST", "127.0.0.1")
    raw_port = os.environ.get("CHAINLIT_PORT", "8000")
    try:
        port = int(raw_port)
    except ValueError:
        print(
            "  ! CHAINLIT_PORT must be an integer. Update your environment configuration and rerun the smoke test."
        )
        return False
    base_url = f"http://{host}:{port}/"

    readiness_deadline = time.monotonic() + timeout
    ready = False
    assert process.stdout is not None

    try:
        while time.monotonic() < readiness_deadline:
            if process.poll() is not None:
                break

            line = process.stdout.readline()
            if line:
                print(f"   {line.rstrip()}")
                if READINESS_PHRASE in line:
                    ready = True
                    break
            else:
                time.sleep(0.1)

        if not ready:
            print(
                "  ! Chainlit did not report readiness before the timeout elapsed. "
                "Check the logs above for details."
            )
            return False

        if not _probe_http(base_url, timeout=15):
            return False

        print(f"   Confirmed Chainlit is serving {base_url}. Shutting it down...")
        return True
    finally:
        with suppress(Exception):
            _terminate_process(process)
        with suppress(Exception):
            process.stdout.close()


def run_smoke_test(
    *,
    install: bool = True,
    timeout: float = 120.0,
    python_extras: Sequence[str] | None = None,
) -> bool:
    """Run pnpm/uv installs and verify ``chainlit hello`` serves traffic.

    By default the helper syncs the ``mypy`` extra so dmypy has the stubs it
    needs for the Husky `pnpm run lintPython` hook. Override ``python_extras``
    to install a custom set of extras or pass an empty tuple to skip them
    entirely.
    """

    extras = tuple(python_extras) if python_extras is not None else DEFAULT_PYTHON_EXTRAS
    success = True
    if install:
        js_success = attempt_with_fallback(
            ["pnpm", "install", "--frozen-lockfile"],
            ["pnpm", "install"],
            cwd=REPO_ROOT,
        )
        py_success = attempt_with_fallback(
            _build_uv_sync_command(frozen=True, extras=extras),
            _build_uv_sync_command(frozen=False, extras=extras),
            cwd=REPO_ROOT / "backend",
        )
        success = js_success and py_success
        if not success:
            print(
                "\nDependency installation failed. Resolve the issues above and rerun the smoke test."
            )
            return False

    return _run_chainlit_hello(timeout)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the repository smoke test so local, CI, and Cloud Build workflows stay DRY."
    )
    parser.add_argument(
        "--skip-installs",
        action="store_true",
        help="Skip pnpm install and uv sync (useful when dependencies are already prepared).",
    )
    parser.add_argument(
        "--python-extra",
        dest="python_extras",
        action="append",
        help=(
            "Install the given pyproject extra via `uv sync --extra` before running the smoke test. "
            "Provide multiple times to include more than one extra. Defaults to 'mypy' so dmypy "
            "has the necessary type stubs."
        ),
    )
    parser.add_argument(
        "--no-python-extras",
        action="store_true",
        help="Skip installing additional Python extras when syncing dependencies.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Seconds to wait for Chainlit to report readiness before failing the smoke test.",
    )
    args = parser.parse_args()

    extras_arg: Sequence[str] | None
    if args.no_python_extras:
        extras_arg = ()
    elif args.python_extras:
        extras_arg = tuple(args.python_extras)
    else:
        extras_arg = None

    success = run_smoke_test(
        install=not args.skip_installs,
        timeout=args.timeout,
        python_extras=extras_arg,
    )
    if success:
        print(
            "\nSmoke test completed successfully. Chainlit was started, probed, and "
            "shut down automatically."
        )
    else:
        print(
            "\nOne or more smoke test steps failed. Resolve the issue and rerun the helper "
            "or execute the commands manually."
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
