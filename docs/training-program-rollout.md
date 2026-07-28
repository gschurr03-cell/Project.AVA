# Training Program rollout

Allowed modes: disabled (default), fixture-only, plan-only, shadow, internal draft, coach-
reviewed beta, bounded athlete beta and production. Prompt 14A permits at most controlled
internal draft generation. No athlete-facing automatic programming is enabled.

The registered orchestration adapter supports typed prepare/validate/execute/persist,
fingerprints, staging, cache inspection, shadow/replay compatibility and version failure.
Draft snapshots use a linked planning lifecycle, not the authoritative analysis manifest.
Database persistence, API authorization, review UI, real shadow parity and production
rollout are blocked.

Invalidation impact is centralized: manifest/restriction/catalog/rule changes regenerate
fully; competition/availability regenerate the microcycle; readiness changes adjust the
day; telemetry has no material impact.
