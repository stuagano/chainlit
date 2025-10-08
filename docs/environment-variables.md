# Environment Variable Checklist

This reference captures the environment variables Chainlit supports so you can
keep configuration DRY across local shells, CI, and GCP deployments. Populate
[`.env`](../.env.example) locally, sync it to Secret Manager with
[`scripts/sync_env_to_gcp.py`](../scripts/sync_env_to_gcp.py), and mount the same
secret in Cloud Build, Cloud Run, or Cloud Functions to avoid drift.

> **Tip:** Store production values in Google Secret Manager and grant Cloud Run
> and Cloud Build service accounts access instead of pasting credentials into
> build steps. Locally, rely on tools like `direnv` or `dotenvx` to hydrate the
> same `.env` file.

## Core runtime

| Variable | Required | Purpose | GCP guidance |
| --- | --- | --- | --- |
| `CHAINLIT_HOST` | No | Override the bind address when not using the default `127.0.0.1`. | Leave empty for Cloud Run; the platform injects the correct host/port. |
| `CHAINLIT_PORT` | No | Local development port (defaults to `8000`). | Prefer the `$PORT` provided by Cloud Run instead of forcing a value. |
| `CHAINLIT_URL` | No | Public base URL used in callbacks and invites. | Point to your Cloud Run custom domain or HTTPS Load Balancer endpoint. |
| `CHAINLIT_ROOT_PATH` | No | Path prefix when the service is behind a reverse proxy. | Set when deploying behind Cloud Run service routes or API Gateway. |
| `CHAINLIT_DEBUG` | No | Enables verbose logging for troubleshooting. | Disable in production to keep logs tidy and reduce noise in Cloud Logging. |
| `CHAINLIT_AUTH_SECRET` | Yes (when auth is enabled) | Secret used to sign auth cookies/JWTs. | Store only in Secret Manager and mount as an env var at runtime. |
| `CHAINLIT_CUSTOM_AUTH` | No | Toggle for custom auth backends. | Keep false unless you have a bespoke auth service hosted on GCP. |

## LLM providers

Populate the values for the providers you actually use. Leave unused providers
blank to avoid unnecessary secret sprawl.

| Provider | Variables | Notes |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | Mirror to Secret Manager and reference from Cloud Run jobs. |
| Google Vertex AI | `VERTEX_PROJECT_ID`, `VERTEX_LOCATION` | Use the same project/location as your Vertex endpoint. |
| Google Gemini | `GEMINI_API_KEY` | Keep in Secret Manager; do not embed in source. |
| Anthropic | `ANTHROPIC_API_KEY` |  |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY` | Endpoint should match the regional resource URL. |

## Messaging connectors

| Connector | Variables | Notes |
| --- | --- | --- |
| Discord | `DISCORD_BOT_TOKEN` | Restrict secrets using Secret Manager IAM bindings. |
| Slack | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_WEBSOCKET_TOKEN` | Required for Socket Mode support. |
| Microsoft Teams | `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` | Rotate periodically; store only in Secret Manager. |

## Persistence and storage

| Integration | Variables | Notes |
| --- | --- | --- |
| Database | `DATABASE_URL` | Use Cloud SQL with a private connection or connect through Cloud SQL Proxy. |
| Object storage | `BUCKET_NAME`, `DEV_AWS_ENDPOINT`, `AWS_REGION` | For GCS, leave `DEV_AWS_ENDPOINT` blank and rely on the default endpoint. |
| Literal AI | `LITERAL_API_KEY`, `LITERAL_API_URL` | Keep API keys centralized in Secret Manager. |

## OAuth providers

Only set the providers you plan to expose. Consider using Secret Manager with
[Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
when GitHub Actions needs temporary access to these secrets.

| Provider | Variables |
| --- | --- |
| GitHub | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` |
| Google | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` |
| Okta | `OAUTH_OKTA_DOMAIN`, `OAUTH_OKTA_CLIENT_ID`, `OAUTH_OKTA_CLIENT_SECRET` |
| Auth0 | `OAUTH_AUTH0_DOMAIN`, `OAUTH_AUTH0_CLIENT_ID`, `OAUTH_AUTH0_CLIENT_SECRET` |
| Amazon Cognito | `OAUTH_COGNITO_DOMAIN`, `OAUTH_COGNITO_CLIENT_ID`, `OAUTH_COGNITO_CLIENT_SECRET` |
| Generic OAuth | `OAUTH_GENERIC_CLIENT_ID`, `OAUTH_GENERIC_CLIENT_SECRET`, `OAUTH_GENERIC_AUTH_URL`, `OAUTH_GENERIC_TOKEN_URL`, `OAUTH_GENERIC_USER_INFO_URL` |

Add additional provider-specific prompts (for example `OAUTH_PROMPT` or
`OAUTH_<PROVIDER>_PROMPT`) as needed; keep the entire list in `.env.example` so
all engineers share the same baseline.

## Secret synchronization workflow

1. Copy `.env.example` to `.env` and populate the variables relevant to your
   deployment.
2. Run `python3 scripts/set_gcloud_project.py` to keep the Cloud SDK aligned with
   the project defined in `.env`. This guarantees local shells, automation, and
   Cloud Build workers operate against the same project without hand-maintained
   `gcloud config` calls.
3. Run `python3 scripts/sync_env_to_gcp.py --create` to upload the populated
   values to Secret Manager (`CHAINLIT_SECRET_NAME`). When the project ID is not
   provided via flags or `.env`, the helper falls back to the active `gcloud`
   configuration established by the previous step.
4. Reference the secret from Cloud Build triggers or Cloud Run revisions instead
   of re-declaring the variables manually.
5. When credentials rotate, update `.env`, rerun the sync script, and redeploy
   so every environment receives the same update.

This workflow keeps environment configuration DRY and aligns with GCP security
best practices.

### GCP Secret Manager configuration

Add the following values to `.env` when you want the sync helper to provision
and manage a Secret Manager secret automatically:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GCP_PROJECT_ID` | Yes | Project that hosts the Secret Manager secret. |
| `CHAINLIT_SECRET_NAME` | Yes | Secret resource name populated with key/value pairs from `.env`. |
| `GCP_SECRET_MANAGER_REPLICA_LOCATION` | No | Secondary region for Secret Manager replicas (for example `us`). Leave blank to use automatic (multi-region) replication. |

To keep CI pipelines DRY, reference the same secret from automation instead of
redeclaring variables in YAML. When you prefer to configure replication from the
CLI, pass `--replica-location <region>` to `scripts/sync_env_to_gcp.py`. For
Cloud Build, add a `secretEnv` section that mounts the secret created by the
sync helper:

```yaml
availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_NUMBER/secrets/${CHAINLIT_SECRET_NAME}/versions/latest
      env: CHAINLIT_ENV
steps:
  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: bash
    secretEnv: ['CHAINLIT_ENV']
    args:
      - -c
      - |
        printf '%s' "$${CHAINLIT_ENV}" > /workspace/.env.from_secret
        set -o allexport
        source /workspace/.env.from_secret
        set +o allexport
        pnpm run smoke-test
```

The example above hydrates the environment from Secret Manager at build time so
Cloud Build, local shells, and production deployments remain synchronized.

> **Preview without gcloud:** Use `--dry-run` to render the payload without
> invoking the Secret Manager API or requiring the `gcloud` CLI. This is useful
> when reviewing diffs locally or on contributors' machines that do not have
> Cloud SDK installed yet.
