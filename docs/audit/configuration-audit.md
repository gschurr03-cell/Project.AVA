# Configuration audit

Configuration is split across `.env.local.example`, `src/lib/config/env.ts`,
`src/lib/config/features.ts`, worker environment parsing, three iOS xcconfig examples,
Next configuration and CI placeholders.

## Findings

- Managed environments are validated to reject local Supabase URLs, but no real managed
  environment configuration is committed or evidenced.
- `ANALYSIS_WORKER_SECRET` supports the legacy callback while the production worker uses
  service-role RPC completion. Keeping both paths increases operational ambiguity.
- Orchestration defaults to `OFF`/`LEGACY_ONLY`; training and longitudinal modes default to
  `DISABLED`. These conservative defaults are correct.
- Experimental 30 FPS, experimental interpretations and experimental recommendations default
  to true. They must not become authoritative or athlete-facing in beta.
- iOS identifiers use `com.placeholder.*`, `DEVELOPMENT_TEAM` is empty, and configuration
  files are examples rather than release settings.
- No authoritative environment/feature manifest is persisted with a release artifact.
- Feature flags are mostly build/server-process environment values, not remotely audited
  rollout controls.

P0: create an environment manifest and fail deployment when release identity, database,
worker model, callback/read mode, safety flags, or training mode are ambiguous.
