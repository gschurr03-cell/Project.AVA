# Environment architecture

`AVA_ENVIRONMENT` supports local, test, preview, shared development, staging, closed beta,
and future production. Local/test may use fixtures. Preview and shared development must
use nonproduction data. Staging mirrors beta topology with synthetic accounts. Closed beta
requires `AVA_BETA_ALLOWLIST_ENABLED=true` and a versioned release. Public production
disables internal diagnostics.

Staging, beta, and production must have separate Supabase projects, databases, storage
buckets, service keys, worker secrets, signing credentials, notification credentials,
analytics projects, telemetry destinations, backups, and admin sessions. No production
secret is a `NEXT_PUBLIC_` value. Current repository configuration validates these
combinations but the remote environments are not provisioned.

