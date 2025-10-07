# Local Development Smoke Test

This guide documents the minimal steps required to verify that Chainlit starts locally without any custom configuration.

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (the repo is configured for pnpm workspaces)
- [uv](https://docs.astral.sh/uv/) for managing the Python environment

We recommend storing any credentials or API keys in a project-level `.env` file and loading them via your shell rather than hardcoding values in code or scripts.

## Steps

1. Install JavaScript dependencies once for the monorepo:

   ```bash
   pnpm install
   ```

2. Sync the Python environment inside `backend/`:

   ```bash
   cd backend
   uv sync
   ```

3. Launch the bundled "hello" example to confirm the server boots:

   ```bash
   uv run chainlit hello
   ```

   The command creates default config files under `.chainlit/` (which are ignored via `.gitignore`) and serves the app at `http://localhost:8000`.

4. Stop the server with `Ctrl+C` when finished.

## Recommended Next Steps

- **Centralize environment configuration**. Commit a lightweight `.env.example` (or reuse an existing shared config repo) and
  load it with a tool such as [`direnv`](https://direnv.net/) or [`dotenvx`](https://dotenvx.com/) so every contributor sources the
  same variables automatically. On GCP, mirror those values in Secret Manager and reference them from Cloud Run, Cloud Functions, or
  Cloud Build instead of re-declaring them per environment.
- **Codify the smoke test**. Wrap the commands above in a `make smoke-local` (or Taskfile) target that your CI/CD pipeline can
  invoke. Using the same entry point locally and in automation keeps the workflow DRY and avoids configuration drift.
- **Keep installs reproducible**. Prefer `pnpm install --frozen-lockfile` and `uv sync --frozen` once your locks are up to date so
  the dependencies resolved locally match what you deploy. This prevents accidental upgrades when Cloud Build or GitHub Actions runs
  the same smoke test.
- **Bootstrap GCP credentials early**. Run `gcloud auth application-default login` and `gcloud config set project <project-id>` in
  your local shell (or `.env`) so the hello app can reuse Application Default Credentials when you later connect it to managed
  services. Keeping these values in `.env` makes it trivial to hydrate the same settings in Secret Manager or Config Connector.
- **Add continuous verification**. Schedule a lightweight Cloud Build (or GitHub Actions) job that executes the `smoke-local`
  target on every merge and nightly. This catches lockfile or dependency regressions before they reach production environments.

## Troubleshooting

- If ports are occupied, export `CHAINLIT_PORT` in your shell (for example via `.env`) before running the hello app.
- For GCP deployments, prefer using Secret Manager or Cloud Run service variables instead of embedding secrets in code. Keeping the workflow `.env`-driven locally makes it easy to map to those services later.

Following these steps keeps the setup DRY by relying on shared package managers and environment variables instead of ad-hoc configuration files.
