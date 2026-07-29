# Intelligence architecture consolidation audit

Audit date: 2026-07-18

## Executive finding

AVA's intelligence engines have coherent boundaries and strong deterministic contracts,
but their rapid addition created infrastructure drift. The largest safe duplication is
not domain scoring; it is fingerprinting, confidence terminology, cache metadata,
version discovery, trace vocabulary, dashboard primitives, and architecture
documentation.

Domain confidence and scoring formulas must remain engine-owned because they represent
different questions. Consolidating those weights would change outputs. This pass therefore
centralizes infrastructure and validation while leaving every domain policy intact.

## Boundary audit

| Boundary | Status | Finding |
| --- | --- | --- |
| Observation → Interpretation | Validated | Version and source IDs are explicit. |
| Interpretation → Root Cause | Validated foundation | Real orchestration still needs reviewed structured candidate assembly. |
| Root Cause → Adapter | Validated | Immutable state and fingerprint are required. |
| Adapter → Recommendation | Safe post-eligibility wrapper | Default is shadow; baseline remains authoritative. |
| Recommendation → Priority | Validated | Optional RCI context is provenance only. |
| Priority → Optimization | Normalization boundary | Application orchestration still assembles optimization envelopes. |
| Optimization → Adaptive | Enforced | Adaptive consumes dispositions and does not rerank. |
| Adaptive → Coach Report | Partial | Current Coach Report remains analysis-oriented rather than CoachingState-oriented. |
| Cached intelligence → Mobile | Contract foundation only | No native iOS client exists. |

The declared pipeline is acyclic. Root Cause reads Digital Twin history, and feedback later
updates the Twin; this is an event-driven longitudinal loop, not a synchronous evaluation
cycle.

## Duplication and drift

### Safe to consolidate now

- Identical FNV-1a deterministic fingerprint implementations in Interpretation,
  Recommendation, Priority, Adaptive, Optimization, Root Cause, and the RCI adapter.
- Repeated High/Moderate/Low/Insufficient threshold terminology.
- Repeated cache compute-policy fields and invalidation metadata concepts.
- Repeated version discovery and undocumented dependency metadata.
- Repeated dashboard Stat/Panel/Empty components.
- Repeated deterministic template lookup mechanics.

### Must remain domain-owned

- Interpretation, Priority, Projection, Twin, Root Cause, Optimization, and Adapter
  confidence formulas and weights.
- Recommendation safety, eligibility, duplicate, conflict, contraindication, and catalog logic.
- Priority scoring and Optimization ROI scoring.
- Engine-specific trace payloads and state invalidation fields.

### Persistence debt

Migrations 0041–0046 use the same immutable snapshot pattern but differ in active-pointer
column names, audit shapes, invalidation types, comments, and RPC argument conventions.
Retrofitting old migrations is unsafe. A shared metadata contract and documented SQL
template should govern future migrations; existing deployed shapes need compatibility
views or incremental migrations rather than rewrites.

### Feature-flag debt

Flags are centralized in one module, but the object is long and lacks metadata describing
owner, lifecycle, exposure, and dependency. Some old experimental flags may be unused;
removal requires production analytics/config confirmation and is not safe in this pass.

### Performance findings

- Cached dashboards correctly read one active state and do not recompute.
- Multiple sanity scripts compile overlapping TypeScript graphs independently; this is
  development overhead, not runtime overhead.
- Large state schemas repeatedly serialize full evidence and trace payloads. Immutable
  snapshots are correct, but future storage measurement should consider separately
  compressed archival trace without changing active cache contracts.
- Registry validation can run once per server process/build rather than on every athlete
  read. Current adapter accepts injected registries for tests and validates per evaluation;
  production orchestration should cache the validated static result.
- Session page remains the largest UI orchestration allocation hotspot and is outside this
  behavior-preserving consolidation.

## Internal implementation plan

1. Add shared deterministic fingerprint, confidence vocabulary, engine metadata, cache
   policy, trace envelope, provenance, version, and explanation-template infrastructure.
2. Register every intelligence engine and validate dependency cycles, contract metadata,
   cache policy, documentation, dashboards, tests, ownership, and lifecycle.
3. Define the canonical pipeline separately from longitudinal support dependencies.
4. Replace only byte-equivalent fingerprint and confidence-label duplicates.
5. Consolidate repeated intelligence dashboard primitives without changing markup semantics.
6. Add registry/pipeline/contract/cache sanity validation.
7. Generate the six requested authoritative architecture documents.
8. Run every intelligence sanity suite plus typecheck, lint, build, and diff checks.

## Completed consolidation

- Added the authoritative 13-engine machine-readable registry and acyclic pipeline
  validator with contract, cache, ownership, lifecycle, documentation, dashboard, flag,
  and test metadata.
- Added shared byte-compatible FNV fingerprinting and replaced seven duplicated main
  decision-pipeline implementations. Research Discovery retains its local unprefixed
  variant to avoid a Research → Intelligence Registry → Research module cycle.
- Added shared confidence vocabulary/threshold utilities and adopted them in Digital Twin,
  Optimization, Root Cause, and Adaptive Coaching without changing thresholds.
- Added shared engine/cache/contract/compute-policy/trace/provenance schemas and a
  deterministic explanation-template renderer.
- Added shared intelligence dashboard Stat, Panel, and Empty primitives and adopted them
  in the newest cached intelligence dashboards.
- Added architecture sanity coverage for registry completeness, cycles, dependency
  integrity, offline/cache compatibility, exact fingerprint compatibility, confidence
  thresholds, declared docs/tests, centralized flags, snapshot RLS/immutability, and
  provider/randomness exclusion.
- Added the six requested authoritative root architecture documents.

## Deliberately unchanged

- All domain weights, scoring, confidence formulas, safety rules, recommendation content,
  eligibility, priorities, optimization allocation, coaching dispositions, and athlete
  outputs.
- Existing deployed migration names and RPC shapes.
- Feature flags whose production usage cannot be proven from repository inspection alone.

## Remaining consolidation debt

- Migrate remaining older dashboard primitives when those pages next receive product work.
- Add compatibility views or a future generic snapshot service only after staged database
  profiling demonstrates operational value; do not rewrite migrations 0041–0046.
- Standardize engine-specific traces through additive adapters rather than replacing their
  current public trace contracts.
- Cache the static adapter registry validation result in production orchestration.
- Split the oversized session page and measure active snapshot/trace serialization size.
- Connect Adaptive Coaching state to a future longitudinal Coach Report contract and native
  mobile cache consumer.
