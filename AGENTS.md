# Repository Guidance for AI Contributors

- Treat the root `.env` (and any `.env.*` variants) as the single source of truth for runtime configuration. Do **not** hardcode secrets or service identifiers in code samples—reference environment variables instead.
- When documenting workflows, favor reusable commands (e.g., `make` targets or scripts) that can run identically on developer machines, CI, and GCP build systems to preserve DRY principles.
- Highlight GCP-aligned practices (Secret Manager, Cloud Build, Cloud Run, etc.) whenever you introduce configuration or deployment guidance.
- Keep documentation concise but actionable: prefer checklists or tables that engineers can follow without guesswork.
