# Local Development Smoke Test

This guide documents the minimal steps required to verify that Chainlit starts locally without any custom configuration. For a
complete inventory of supported environment variables, review the
[environment variable checklist](./environment-variables.md) before wiring
Chainlit to external services.

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (the repo is configured for pnpm workspaces)
- [uv](https://docs.astral.sh/uv/) for managing the Python environment

We recommend storing any credentials or API keys in a project-level `.env` file and loading them via your shell rather than hardcoding values in code or scripts.

## Steps

1. Run the bootstrap helper to collect environment variables defined in
   [`.env.example`](../.env.example) and optionally execute the smoke test
   automatically:

   ```bash
   python3 scripts/start_local.py --smoke-test
   ```

   The helper reuses any values already stored in `.env` or exported in your
   current shell so secrets stay DRY across tools like `direnv`. Pass
   `--non-interactive` (for example in CI) to accept defaults automatically
   while still warning when required values remain blank and summarizing any
   fields you should fill later. The `--smoke-test` flag now defers to
   [`scripts/smoke_test.py`](../scripts/smoke_test.py) so local shells, GitHub
   Actions, and Cloud Build all run the exact same workflow. The helper waits
   for `chainlit hello --ci --headless` to report readiness, probes the served
   URL, and then shuts the process down automatically so automation never hangs.
   If you prefer to run the commands manually, omit the flag and continue with
   the next steps or call the smoke test helper directly:

   ```bash
   python3 scripts/smoke_test.py
   ```

   Pass `--timeout` to adjust how long the helper should wait for readiness.

2. Install JavaScript dependencies once for the monorepo:

   ```bash
   pnpm install --frozen-lockfile
   ```

   If your lockfile is out of date the helper will fall back to `pnpm install`
   and prompt you to reconcile the change.

3. Sync the Python environment inside `backend/`:

   ```bash
   cd backend
   uv sync --frozen --extra mypy
   ```

   As above, the helper automatically retries with `uv sync --extra mypy`—
   dropping the `--frozen` flag on a second attempt—when drift is detected so
   you can update the lock under version control. Installing
   the `mypy` extra upfront gives the Husky `pnpm run lintPython` hook the type
   stubs it needs to pass on a clean checkout.

   > Need a slimmer runtime check? Run `python3 scripts/smoke_test.py --no-python-extras`
   > to skip optional extras entirely or add `--python-extra <name>` when you
   > want to install additional bundles beyond `mypy`.

4. Launch the bundled "hello" example to confirm the server boots:

   ```bash
   uv run chainlit hello
   ```

   The command creates default config files under `.chainlit/` (which are
   ignored via `.gitignore`) and serves the app at `http://localhost:8000`.

5. When running the command manually, stop the server with `Ctrl+C` when
   finished. The smoke test helper shuts the process down for you.

6. (Optional) Mirror the populated `.env` file to GCP Secret Manager so Cloud
   Build and other environments reuse the same configuration. Run the project
   alignment helper first to guarantee the Cloud SDK targets the same project
   as your `.env`:

   ```bash
   python3 scripts/set_gcloud_project.py
   ```

   Then sync the secret payload:

   ```bash
   python3 scripts/sync_env_to_gcp.py --create
   ```

   The helper reads [`.env.example`](../.env.example) to determine which keys
   to upload, skips empty values by default, and provisions the secret when you
   pass `--create`. Populate `GCP_PROJECT_ID`, `CHAINLIT_SECRET_NAME`, and (optionally)
   `GCP_SECRET_MANAGER_REPLICA_LOCATION` in `.env` so local shells, CI, and Cloud Build all
   reuse the same configuration without additional flags. If you already export those
   variables (for example via `direnv`), the script will continue to honor them while
   falling back to the shared `.env` for DRY defaults and user-managed replication settings
   required by your data residency policy. When the `.env` and shell are both missing the
   project ID, the helper now pulls the active `gcloud` configuration instead of failing once
   [`scripts/set_gcloud_project.py`](../scripts/set_gcloud_project.py) establishes the shared
   default, and `--dry-run` skips the Cloud SDK requirement entirely so you can preview payloads on fresh
   machines before installing the CLI.
   required by your data residency policy.

## Recommended Next Steps

- **Centralize environment configuration**. Commit a lightweight `.env.example` (or reuse an existing shared config repo) and
  load it with a tool such as [`direnv`](https://direnv.net/) or [`dotenvx`](https://dotenvx.com/) so every contributor sources the
  same variables automatically. On GCP, mirror those values in Secret Manager with
  [`scripts/sync_env_to_gcp.py`](../scripts/sync_env_to_gcp.py) and reference the secret from Cloud Run, Cloud Functions, or Cloud
  Build instead of re-declaring them per environment.
- **Codify the smoke test**. The repository now exposes [`scripts/smoke_test.py`](../scripts/smoke_test.py) so local shells, GitHub
  Actions, and Cloud Build execute the same sequence. Use it directly or wrap it in a task runner (for example `make` or `just`) to
  keep orchestration DRY.
- **Keep installs reproducible**. The bootstrap helper already prefers
  `pnpm install --frozen-lockfile` and `uv sync --frozen --extra mypy` so local setups and
  CI resolve the same dependencies. When those commands fail, reconcile the
  lockfiles (or intentionally fall back) rather than committing ad-hoc
  upgrades.
- **Bootstrap GCP credentials early**. Run `gcloud auth application-default login`, then
  `python3 scripts/set_gcloud_project.py` so the Cloud SDK always targets the project stored in
  `.env`. Keeping these values in `.env` makes it trivial to hydrate the same settings in Secret
  Manager or Config Connector.
- **Add continuous verification**. Wire the new smoke test into automation. We provide a reusable [GitHub Actions workflow](../.github/workflows/smoke-test.yaml) and a
  [Cloud Build configuration](../cloudbuild/smoke-test.yaml) so merges and nightly jobs exercise the same helper used by
  contributors. This catches lockfile or dependency regressions before they reach production environments.

## Troubleshooting

- If ports are occupied, export `CHAINLIT_PORT` in your shell (for example via `.env`) before running the hello app.
- For GCP deployments, prefer using Secret Manager or Cloud Run service variables instead of embedding secrets in code. Keeping the workflow `.env`-driven locally makes it easy to map to those services later.

Following these steps keeps the setup DRY by relying on shared package managers and environment variables instead of ad-hoc configuration files.
