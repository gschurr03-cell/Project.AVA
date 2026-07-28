# Performance Optimization Layer audit

Audit date: 2026-07-17

## Conclusion

AVA has no Performance Optimization Layer. Adaptive Coaching currently receives normalized
Recommendation/Priority candidates and performs deterministic ranking itself. That
implementation is production-safe for the previous pipeline, but the new architecture
requires ranking to move one layer earlier:

`Priority + longitudinal evidence → Performance Optimization → Adaptive Coaching`

The optimizer must not create recommendations or predicted race times. It should estimate
relative, evidence-bounded return on limited training attention, preserve every component
of the score, and emit ordered dispositions that Adaptive Coaching can translate into the
cached athlete-facing `CoachingState`.

## Component audit

| Component | Exists | Readiness | Decision | Dependencies and debt |
| --- | --- | --- | --- | --- |
| Normalized coaching candidate | Yes | Good foundation | Reuse | Carries upstream recommendation/priority identity, confidence, impact class, safety, applicability, evidence, history, monitoring, and versions. It lacks explicit ROI components. |
| Adaptive focus ranking | Yes | Must move | Preserve lifecycle rendering; remove duplicate ranking | Current ranking combines impact, confidence, history, recurrence, regression, competition, development stage, and overrides. Optimizer should own these choices. |
| Digital Twin | Yes | Strong input | Reuse | Supplies maturity, adaptation, recommendation memory, adherence, trends, archetypes, unknowns, and history. |
| Projection evidence | Yes | Development-only | Consume confidence/identity only | Never convert development projections into guaranteed race gains. |
| Benchmark evidence | Yes | Compatibility-aware | Consume explicit similarity/confidence | Incompatible comparisons must reduce or withhold support. |
| Research evidence | Yes | Reviewer/version foundation | Consume explicit support only | The optimizer cannot invent dependencies or interactions from generic research. |
| ROI/impact model | No | Blocking | Add deterministic normalized model | Must expose every component and modifier separately. |
| Dependency graph | No | Blocking | Add versioned evidence-linked DAG | Cycles and missing nodes must fail closed. |
| Interaction model | No | Blocking | Add explicit evidence-linked edges | Unknown is neutral; no implicit causal relationships. |
| Diminishing returns | No | Blocking | Add | Must use exposure, captured benefit, plateau/adaptation, and response history. |
| Opportunity cost | No | Blocking | Add | Selected and deferred alternatives need score gaps and deterministic deferral reasons. |
| Coach overrides | Partial | Extend | Move ranking actions into optimizer | Existing force/maintain/monitor/retire actions differ from requested accept/reject/lower/raise/lock/disable. |
| Cache/persistence | CoachingState only | Missing optimization cache | Add immutable optimization state and invalidation queue | App open must serve cached optimization through cached CoachingState, not recompute. |
| Dashboard | No | Missing | Add `/coaching/optimization` | Must display cached state and trace only. |

## Production blockers

### Critical

- No versioned `PerformanceOptimizationState`.
- No explainable ROI/impact components, dependency/interaction graph, diminishing returns,
  or opportunity-cost model.
- Adaptive Coaching still ranks Priority candidates directly.
- No immutable optimization cache or explicit invalidation boundary.

### High

- No evidence-linked coach-override audit in optimization results.
- No competition/season modifier trace.
- No offline-portable optimization summary.

## Internal implementation plan

1. Extend normalized candidates with a strict optimization-evidence envelope covering
   potential influence, probability, specificity, research, benchmarks, projections,
   transfer, persistence, maintenance cost, historical response, adherence, adaptation,
   plateau, unknowns, and preferred season context.
2. Add validated directed dependency and interaction graphs. Reject missing nodes, cycles,
   self-edges, and unsupported edges.
3. Add centralized deterministic impact, diminishing-return, interaction, season,
   competition, confidence, and unknown-variable modifiers.
4. Rank eligible focuses, cap active improvement investment at two, and record maintenance,
   monitoring, ignored, retired, and deferred dispositions plus opportunity cost.
5. Add deterministic templates and a complete development trace.
6. Change Adaptive Coaching input to require Optimization output and remove independent
   candidate scoring/override/competition ranking.
7. Add immutable cached optimization state, invalidations, active pointer, audit, offline
   envelope, and a cache-only dashboard.
8. Add the four requested documents and synthetic-only deterministic tests, then run all
   upstream and full regressions.

## Completed implementation

- Added versioned `PerformanceOptimizationState`, strict candidate evidence envelope,
  normalized expected-gain interval, confidence boundary, full score/modifier trace, and
  deterministic input fingerprint.
- Added centralized impact weights and bounded modifiers for probability, specificity,
  persistence, maintenance cost, diminishing returns, adaptation, dependencies,
  interactions, season, competition timing, unknowns, confidence, and coach overrides.
- Added evidence-linked DAG and interaction validation. Missing nodes, self-dependencies,
  and cycles fail closed; no implicit biomechanical relationship is invented.
- Added explicit investment, maintenance, monitoring, deferred, ignored, and retired
  dispositions. Improvement investment is capped at two and opportunity cost is stored.
- Moved ranking and all requested coach override actions into Optimization. Adaptive
  Coaching now consumes ordered optimizer decisions and performs no independent scoring.
- Added immutable owner-scoped snapshot/active-pointer/invalidation/audit persistence in
  migration 0044 and a feature-gated cache-only `/coaching/optimization` inspector.
- Added the requested architecture/model documents and deterministic coverage for
  reproducibility, component trace, two-focus allocation, dependencies, cycles,
  interactions, diminishing returns, overrides, competition behavior, offline/cache
  policy, and token independence.

## Remaining production work

- Wire the upstream server orchestration that assembles real Priority, Recommendation,
  Research, Benchmark, Projection, Digital Twin, schedule, and override records into the
  optimizer and atomically activates Optimization before Coaching.
- Apply migration 0044 in a staged environment and validate RLS/RPC behavior against real
  authenticated athlete ownership.
- Validate policy weights and expected-return classifications against longitudinal field
  outcomes. Current outputs are conservative relative allocations, not calibrated race
  time predictions.
- Add native iOS cache synchronization once the release delivery architecture is chosen.
