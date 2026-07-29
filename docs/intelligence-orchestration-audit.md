# Intelligence orchestration audit

Audit date: 2026-07-18

## Findings before implementation

AVA has thirteen registered deterministic intelligence services, versioned contracts,
immutable-snapshot conventions, feature flags, and a durable production-analysis job
queue. It does not have one authority that validates the registry, creates a reproducible
execution plan, coordinates cache decisions and retries, or commits a coherent set of
intelligence outputs.

The existing engines are substantial and remain the source of domain behavior. They must
not be rewritten or allowed to activate themselves through the new layer.

| Area | Current state | Decision | Debt / dependency |
| --- | --- | --- | --- |
| Engine registry | Production-quality foundation | Consume directly | `dependencies` include asynchronous/support services; `pipelinePredecessor` and the exported edges describe the synchronous chain. |
| Pipeline calls | Distributed among product flows | Add adapters around existing calls | Cutover is feature-gated; this pass does not change existing engine behavior. |
| Snapshots | Mature per-engine immutable snapshot patterns | Preserve | Per-engine active pointers cannot be atomically changed as a generic set. The pipeline manifest becomes the atomic read boundary. |
| Analysis jobs | Durable claims, leases, retries and service-only RPCs | Reuse its security/lifecycle conventions | Intelligence jobs need separate types because one plan contains a DAG of jobs. |
| Cache | Policies and fingerprints are registered | Centralize cache decisions | Adapters remain responsible for locating their engine-specific immutable snapshot. |
| Invalidation | Owned by individual subsystems | Add a central invalidation ledger and graph propagation | Existing invalidators remain until feature-gated cutover. |
| Retry | Production worker policy exists | Add orchestration-specific deterministic classification | Validation, dependency, contract and version failures never retry. |
| Security | Supabase Auth, RLS, service-role workers | Keep | No platform-admin role exists. Dashboard reads are owner-scoped, not fleet-wide administration. |
| UI | Premium cached intelligence dashboards | Reuse primitives | Dashboard is flag-gated and read-only. |
| Offline | Cached snapshots are supported | Keep cache-only | Offline clients never enqueue or activate. |

## Production blockers

1. There is no validated DAG or immutable execution plan.
2. Engine persistence and activation are not coordinated transactionally.
3. There is no orchestration job/trace/retry/audit persistence.
4. Invalidation and failure isolation are not centrally represented.
5. There is no queue-neutral worker contract or restart/idempotency model.
6. A generic adapter catalog for the existing engines is still required before live
   execution can replace current call sites.

## Internal implementation plan

1. Add versioned orchestration contracts and registry-derived graph validation.
2. Add deterministic planning, progress, cache, retry, invalidation and worker primitives.
3. Add service-only persistence and atomic pipeline-manifest activation/rollback.
4. Add a flag-gated, owner-scoped read-only dashboard.
5. Add focused sanity coverage and permanent lifecycle documentation.
6. Leave orchestration in shadow mode until every engine has a validated adapter and
   consumers read through the active pipeline manifest.

## Prompt 12B integration audit — 2026-07-18

The 12A foundation is structurally sound but not a live production integration. Its
`OrchestrationStore` is an interface, adapters have minimal metadata, migration 0047
stores only snapshot IDs in the manifest, and existing consumers still read six
engine-specific active pointers directly.

| Component | Exists | Readiness | Decision / debt |
| --- | --- | --- | --- |
| Adapter lifecycle | Yes | Partial | Extend metadata and use one thin typed adapter implementation. `activate` must remain staging-only. |
| Callable engine entry points | 11/13 | Partial | Observation, Interpretation, Root Cause, RCI Adapter, Recommendation, Priority, Optimization, Adaptive Coaching, Coach Report, Projection and Digital Twin have deterministic public evaluators. |
| Research adapter | Domain callable, operational input unavailable | Deferred | `retrieveResearch` requires a reviewed `ResearchCatalog`; no orchestration catalog loader exists. |
| Benchmark adapter | Domain callable, operational input unavailable | Deferred | Comparison requires a metric-specific athlete context plus activated dataset collection; no single registered engine input contract exists. |
| Database store | Interface only | Blocking | Add a trusted-server Supabase implementation with bounded serialization and RPC-only transitions. |
| Migration 0047 | Foundation | Needs forward hardening | Do not rewrite an assumed-applied migration. Add 0048 for manifests, staged snapshots, progress, transition RPCs and read resolution. |
| Active manifest | Basic ID map | Partial | Add registry/adapter versions, provenance, integrity fingerprint, activation status and staged-reference validation. |
| Legacy consumers | Four direct UI RPC consumers found | Partial | Centralize reads and migrate these safe internal dashboards first. |
| Restart recovery | Lease reclamation exists | Partial | Add bounded/paginated recovery RPC and coordinator. |
| Telemetry | Trace rows only | Partial | Add vendor-neutral redacted event contracts/sink. |
| Live gate | Boolean flags only | Blocking | Add server-only rollout gate with OFF/PLAN_ONLY/SHADOW/INTERNAL/BOUNDED_PRODUCTION; default OFF. |
| Local DB validation | Unknown | Must verify | Run static SQL checks and inspect local Supabase availability. Never claim live validation without a successful reset/test. |

### Internal 12B implementation plan

1. Extend adapter metadata and create an allowlisted catalog derived from the engine
   registry, with explicit unavailable adapters where operational input assembly is
   missing.
2. Add a database store, transition RPCs, staged snapshot manifests and recovery through
   forward-only migration 0048.
3. Add one typed activated-snapshot resolver and compatibility modes; migrate the four
   direct cached-state dashboards without allowing page-open computation.
4. Add telemetry and layered server-side rollout gates.
5. Add adapter/store/manifest/recovery/security/compatibility tests, validate the
   migration as far as the local environment permits, and run all regressions.
