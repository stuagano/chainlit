# Chainlit + ADK Agent WYSIWYG Editor Concept

This document outlines a proposed approach for wrapping the ADK Web backend and a Chainlit-based frontend into a unified **"build, preview, and deploy"** experience. The goal is to enable non-technical operators to configure agents using a graphical editor while still following engineering best practices such as DRY configuration, centralized secrets management, and repeatable deployment.

## High-Level Architecture

| Layer | Responsibilities | Notes |
| --- | --- | --- |
| **Admin/WYSIWYG Editor (Chainlit)** | Collect agent metadata, prompt snippets, tool definitions, testing scenarios, and deployment targets. | Build on Chainlit components; persist state via backend API. |
| **ADK Web Backend** | Validates agent definitions, stores reusable components, runs dry-run evaluations, and orchestrates deployments. | Implement REST/GraphQL endpoints secured by OAuth2 or IAM-backed service accounts. |
| **Agent Runtime (Agent Engine)** | Executes deployed agents with versioned configs, centralized secrets, and monitoring hooks. | Recommend Cloud Run or GKE for autoscaling and IAM integration. |
| **Shared Services** | Configuration registry, secret manager, observability stack, artifact storage, CI/CD pipeline. | Prefer managed GCP services: Secret Manager, Artifact Registry, Cloud Build, Cloud Logging/Monitoring. |

## Editor UX Building Blocks

### 1. Agent Interaction Studio (implemented)

The `/agent-editor` route now exposes a full-featured **Agent Interaction Studio**:

- **Turn composer** – curate a list of agent turns, reorder them, duplicate drafts, and persist them locally (auto-saved to the key defined by `VITE_AGENT_EDITOR_STORAGE_KEY`).
- **Rich text WYSIWYG** – craft scripted responses with bold, italics, lists, headings, and hyperlinks using a toolbar backed by a sanitized `contentEditable` surface.
- **Metadata inputs** – capture the agent display name, runtime role, summary, and runtime variables (one per line). Variables are deduplicated and kept in sync with your shared config service.
- **Preview pane** – renders the scripted Markdown/HTML using Chainlit's Markdown renderer so stakeholders can review the final conversational layout before promotion.
- **Shared config hydration** – when `VITE_AGENT_EDITOR_API_BASE_URL` is set, the editor attempts to hydrate from your shared configuration service first, falling back to local drafts if the endpoint is unreachable.
- **Import/export** – JSON import validates shape via `deserializeInteractions`, while export copies JSON to the clipboard and triggers a download for GitOps hand-off.
- **Remote publish** – when `VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED=true`, a guarded **Publish to remote service** action pushes the current draft to the shared configuration API via `PUT /agent-interactions`. Customize the confirmation copy with `VITE_AGENT_EDITOR_REMOTE_PUBLISH_CONFIRMATION`.

> ⚠️ Drafts remain in the browser. Promote only reviewed configurations by syncing them to a central database (Firestore, Cloud SQL, or your config registry) through automated pipelines.

### 2. Reusable Snippets Library (roadmap)
- Enable product teams to curate prompt snippets and tool templates stored in a central registry (`/shared/prompts/*.md`).
- Editor references these snippets by ID; runtime resolves latest versions, ensuring updates propagate automatically.
- Guardrails can be expressed in Markdown front matter (YAML) to declare required environment variables, IAM roles, or quotas.

### 3. Scenario Testing Harness (roadmap)
- Allow authors to define test cases in Markdown:
  ```markdown
  ---
  id: onboarding_flow
  objective: Validate welcome script alignment
  input:
    user_message: "I forgot my password"
  expected_outcomes:
    - contains: "password reset"
    - metric: latency_ms < 1500
  ---
  ```
- Editor triggers backend dry-run execution using recorded fixtures. Results surface inline with metrics and logs.

### 4. Deployment Panel (roadmap)
- Surface target environments (e.g., `dev`, `staging`, `prod`) sourced from a centrally managed configuration service.
- Require selection of a runtime version and config snapshot before enabling **Deploy to Agent Engine**.
- Deployments invoke Cloud Build to package the agent bundle, push to Artifact Registry, and roll out to Cloud Run / GKE with blue-green or canary strategies.

## Running the editor locally

1. Create a `.env` file inside `frontend/` (or copy `.env.example`) and set the agent editor flags:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
   Adjust values so they align with the shared configuration service you plan to use in higher environments.

2. Start the frontend with pnpm:
   ```bash
   pnpm --filter @chainlit/app dev
   ```
   The app serves at `http://localhost:5173`. The agent editor lives at `http://localhost:5173/agent-editor`.

3. Draft interactions, then use **Export JSON** to persist them to your configuration repo or API.
4. (Optional) Hydrate from and publish to a shared configuration service by setting `VITE_AGENT_EDITOR_API_BASE_URL`. Leave `VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED=false` until you are ready to route publishes through CI/CD or a lower environment.

## Deploying to Cloud Run

To keep the workflow reproducible and DRY, use Cloud Build to build the frontend image and deploy to Cloud Run:

1. **Build the container** (from repository root):
   ```bash
   gcloud builds submit \
     --tag gcr.io/PROJECT_ID/chainlit-frontend:latest \
     --config cloudbuild.yaml
   ```
   Ensure your `cloudbuild.yaml` pulls environment variables (like `VITE_AGENT_EDITOR_ENABLED`) from a centralized config source such as Config Connector or Cloud Build substitutions.

2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy chainlit-frontend \
     --image gcr.io/PROJECT_ID/chainlit-frontend:latest \
     --region REGION \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars \
      VITE_AGENT_EDITOR_ENABLED=true,\
      VITE_AGENT_EDITOR_STORAGE_KEY=chainlit.agent-editor.draft,\
      VITE_AGENT_EDITOR_API_BASE_URL=https://config.example.com,\
      VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED=true
  ```
  Prefer referencing Secret Manager or Config Controller for secrets/IDs instead of inline literals. Cloud Run supports `--set-secrets` to mount Secret Manager versions directly, and Config Connector/Cloud Deploy can templatize `VITE_AGENT_EDITOR_API_BASE_URL` so every environment resolves the same service endpoint.

3. **Enforce policy**: back the deployment with Cloud Deploy or Terraform to ensure every environment promotes the same container digest and `.env` values. This keeps the editor consistent across dev/staging/prod while maintaining compliance.

## Configuration & Secrets Management

- Never embed secrets or environment-specific constants inside Markdown. Instead, reference environment variables (e.g., `${LLM_API_KEY}`) that are resolved server-side.
- Store secrets in **GCP Secret Manager** with automated rotation; expose read-only versions to runtimes through IAM.
- Keep shared configuration (e.g., tool endpoints, dataset IDs) in a dedicated `config` service or GitOps repo, referenced by immutable IDs from the editor.

## Recommended GCP Services

| Requirement | GCP Service | Rationale |
| --- | --- | --- |
| Centralized secrets | Secret Manager | Versioned secrets with IAM-based access. |
| Config storage | Firestore or Cloud SQL | Choose based on transaction/relational needs. |
| Artifact packaging | Cloud Build + Artifact Registry | Automated builds and image storage. |
| Runtime hosting | Cloud Run (serverless) or GKE (custom scaling) | Supports HTTPS, IAM auth, and monitoring. |
| Observability | Cloud Logging, Cloud Monitoring, Error Reporting | Unified monitoring with dashboards/alerts. |
| CI/CD | Cloud Build triggers or Cloud Deploy | Managed pipelines and progressive delivery. |

## Remote Configuration Service Contract

- **Endpoint expectations:** expose `GET /agent-interactions` and `PUT /agent-interactions` (or equivalent) behind IAM/IAP so the editor can hydrate drafts and push approved updates via `VITE_AGENT_EDITOR_API_BASE_URL`.
- **Validation:** enforce schema checks server-side (Zod/pydantic) and reject missing variables, duplicate IDs, or unapproved runtime roles.
- **Versioning & history:** persist previous revisions (Firestore document history, Cloud SQL audit tables) and surface change metadata for compliance reviews.
- **GCP deployment:** host the service on Cloud Run with Workload Identity, storing secrets in Secret Manager and configuration in Firestore/Cloud SQL for DRY reuse across environments.

## Suggested Markdown Schema for Agent Instructions

The editor can expose a Markdown-based schema with explicit sections. Below is a starter template to guide authors:

```markdown
---
id: customer_support_v1
version: 2024-05-01
runtime:
  engine: agent-engine
  image: ${AGENT_IMAGE_TAG}
  environment:
    - SECRET_REF: projects/${PROJECT_ID}/secrets/customer_support
    - DATASET_ID: ${DATASET_ID}
monitoring:
  alerts:
    - latency_p95 > 2000ms
    - error_rate > 1%
---

# Purpose
Outline the primary objectives of this agent and key success metrics.

# System Prompt
```prompt
You are an empathetic customer support specialist...
```

# Behavioral Policies
- Always confirm the customer account.
- Escalate billing disputes to human agent if unresolved after two exchanges.

# Tools
| Name | Description | Invocation |
| --- | --- | --- |
| `lookup_user` | Queries CRM by email. | `POST https://crm.internal/api/users` |
| `create_ticket` | Opens Zendesk ticket. | `POST https://zendesk.internal/api/tickets` |

# Test Scenarios
- `onboarding_flow` (see scenario harness above)
- `billing_dispute`

# Rollout Checklist
- ✅ Stakeholder review
- ✅ QA dry-run passed
- ✅ Observability dashboards updated
```

## Pushback & Recommendations

1. **Avoid per-agent hardcoding:** Centralize all endpoint URLs, model names, and secrets. The editor should only reference keys that the backend resolves at deploy time.
2. **Version every artifact:** Track prompt versions, test suites, and deployment manifests. Consider GitOps (e.g., Config Sync) for auditable changes.
3. **Add automated guardrails:** Enforce validation rules (naming conventions, required test coverage) before enabling deployment. This prevents drift and encourages quality gates.
4. **Leverage infrastructure-as-code:** Define Cloud Build triggers, IAM roles, and runtime infrastructure using Terraform or Google Cloud Deploy to maintain reproducibility.
5. **Establish observability standards:** Require latency/error SLO definitions and integrate with Cloud Monitoring dashboards before promoting to production.

By following this structure, the WYSIWYG editor can remain declarative, auditable, and tightly integrated with ADK Web and the downstream agent engine while keeping operations DRY and cloud-native.
