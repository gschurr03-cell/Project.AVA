# Database schema audit

The repository contains 52 ordered migrations. Core entities include profiles, athletes,
sessions, analyses, analysis jobs, benchmarks, validation fixtures, permanent/working
analysis snapshots, research knowledge, projections, Digital Twin, adaptive coaching,
performance optimization, root cause, recommendation adapters and intelligence
orchestration/operations.

## Strengths

- RLS is enabled broadly.
- Private storage policy follows athlete ownership.
- Durable analysis claims include leases, heartbeat, retries and atomic completion.
- Immutable snapshot/activation patterns and service-role orchestration functions are
  represented.
- Schema evolution is incremental rather than destructive.

## Debt and blockers

- No durable training program, revision, approval, session-execution, readiness, adherence,
  safety-event or longitudinal event tables.
- Numerous JSON/JSONB snapshot contracts require explicit schema/version validation at reads.
- Generated TypeScript database types are modified manually/in the worktree; regenerate
  against a clean applied schema and detect drift in CI.
- No staging apply/rollback proof, migration checksum registry, restore rehearsal or
  production data-volume query evidence.
- Retention, erasure, artifact cascade and orphan reconciliation are incomplete.
- Multiple direct engine snapshot schemas plus orchestration manifests create dual read
  models during transition.

The schema is a strong foundation, but it is not an operationally proven database.
