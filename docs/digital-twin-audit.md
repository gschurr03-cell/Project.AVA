# Athlete Digital Twin audit

Audit date: 2026-07-17

## Conclusion

AVA has versioned session-level intelligence engines but no central, longitudinal athlete
object. The correct implementation is an append-only aggregation layer over existing
outputs—not another biomechanics engine and not a replacement for session history.

The twin must preserve the exact source identity and version of every event. It may
describe stable patterns, compatible trends, recurring priorities, and observed
recommendation follow-up. It must not regenerate historical conclusions with current
rules, infer recommendation causality, create recommendations, predict performance, or
rewrite old events.

## Component audit

| Component | Exists | Readiness | Decision | Dependencies and debt |
| --- | --- | --- | --- | --- |
| Athlete identity/profile | Yes | Partial | Reuse | Athlete ownership and basic anthropometrics/PBs exist. Event, competition level, training age, and longitudinal identity changes are not versioned. |
| Analyses and sessions | Yes | Strong historical source | Reuse immutable saved analyses | Working analyses are mutable by design; saved versions and input/result snapshots are immutable. Exclusion and compatibility flags must be honored. |
| Mechanical fingerprint | Yes | Experimental | Reuse as source, not truth | Fingerprints are versioned, compatibility-aware, and explicitly require validation. They are not yet persisted per athlete as a promoted production baseline. |
| Progress/trends | Partial | Not adequate for twin | Add compatible longitudinal engine | Current progress compares two sessions and includes legacy hard-coded elite limiter thresholds. Benchmark trends isolate compatibility groups but have a narrower classification set. |
| Recommendations | Yes | Strong contract, weak longitudinal persistence | Accumulate immutable source results | Saved recommendation lifecycle is defined, but athlete-level adherence, follow-up evidence, and observed effect memory do not exist. |
| Priorities | Yes | Strong contract, weak longitudinal persistence | Accumulate immutable source results | Priority recurrence can be derived only after append-only history exists. |
| Coach Reports | Yes | Strong snapshot semantics | Accumulate report references | Saved reports fail closed when their immutable snapshot is absent. No athlete-level report history exists. |
| Benchmarks | Yes | Good compatible foundation | Accumulate result snapshots | Population datasets are reviewer-gated and no genuine values are seeded. Compatibility must remain attached to every comparison. |
| Projections | Yes | Development-only foundation | Accumulate immutable snapshots | Projection snapshots exist, but athlete-facing results remain disabled pending calibration. Migration `0041` incorrectly references `athletes.user_id`; actual ownership is `coach_id`. |
| Performance memory | Partial | Not production ready | Add explicit events | Profile PB fields overwrite current values. Meet results, splits, season bests, readiness, blocks, and interruptions lack immutable history. |
| Injury history | No | Sensitive / context only | Add reported-context events | Store coach/athlete-reported facts only. Do not diagnose, score injury risk, or predict injury. |
| Coach memory | No | Missing | Add append-only interactions | Accepted/ignored recommendations, notes, corrections, priorities, overrides, ratings, and reminders need typed, auditable events. |
| Baselines | Partial | Missing unified engine | Add deterministic compatible statistics | Mean exists in experimental fingerprints; median, sample variance, sample size, confidence, and updated time are not unified. |
| Archetypes | No | Missing | Add evidence-signal classifier | Must be deterministic, multi-label, versioned, and descriptive. No genetic or performance-potential inference. |
| Confidence evolution | No | Missing | Add evidence/recency model | Confidence should rise with compatible evidence and decay transparently after inactivity. |
| Snapshot/rollback | Partial | Session-only | Add immutable twin snapshots plus active pointer | Rollback must select an old snapshot; it must never delete or rewrite later truth. |
| Dashboard | No | Missing | Add protected athlete intelligence view | Must use owner-scoped data, show empty states, and fabricate no timeline or charts. |

## Production blockers

### Critical

- No versioned `AthleteDigitalTwin` contract or append-only athlete event ledger.
- No immutable twin snapshot and active-version pointer.
- Projection snapshot RLS references a nonexistent athlete ownership column.
- No compatibility-aware baseline, trend, confidence-decay, or recommendation-memory model.

### High

- No durable coach interaction, competition, season, training-block, interruption, or
  recommendation-follow-up history.
- No ingestion orchestration that promotes finalized upstream snapshots into the athlete
  ledger exactly once.
- No validated production fingerprint or genuine longitudinal benchmark cohort.

### Medium

- Existing two-session progress logic and newer compatible-trend logic overlap.
- Athlete PB profile values are current-state fields rather than immutable performance
  events.
- Sensitive reported health context needs retention, access, and product-language review.

## Internal implementation plan

1. Correct projection snapshot ownership to `athletes.coach_id`.
2. Add strict versioned contracts for identity, competition profile, event-support,
   append-only timeline events, baselines, trends, recommendation/coach memory,
   archetypes, quality, risk flags, twin state, and snapshots.
3. Add pure deterministic aggregation: deduplication, compatibility-isolated baselines,
   trend classification, recommendation follow-up memory, priority recurrence,
   evidence-signal archetypes, and recency-aware confidence.
4. Add append-only timeline and twin-snapshot tables with owner RLS, a mutable active
   snapshot pointer, and an audited rollback function that only changes the pointer.
5. Add an owner-protected `/athlete/intelligence?athleteId=…` dashboard showing real stored
   data or honest empty states.
6. Add deterministic synthetic-only tests for accumulation, baseline updates, trends,
   archetype stability, recommendation memory, confidence evolution/decay, snapshots,
   rollback semantics, deduplication, and RLS.
7. Add the four requested engineering documents and run upstream plus full regressions.

## Completed in this pass

- Added the versioned `AthleteDigitalTwin`, timeline-event, baseline, trend, archetype,
  recommendation-memory, confidence, quality, risk-flag, and snapshot contracts.
- Added append-only event accumulation with deterministic ordering, replay deduplication,
  and fail-closed event-identity collision handling.
- Added compatible mechanical baselines with mean, median, sample variance, confidence,
  sample size, source event IDs, and last-update time.
- Added deterministic improving, stable, regressing, plateau, highly-variable,
  rapid-adaptation, delayed-adaptation, and unknown trend classifications.
- Added multi-label experimental archetypes driven only by explicit versioned evidence
  signals, with confidence and snapshot history.
- Added recommendation follow-up memory that records observed associations while
  permanently prohibiting causal claims.
- Added typed coach interactions, performance/season/training/reported-health event
  support, priority recurrence, non-clinical flags, and unknown-variable tracking.
- Added evidence-breadth confidence growth and explicit inactivity decay.
- Added immutable twin snapshots, comparison, append-only timeline/snapshot/audit tables,
  and audited active-pointer rollback semantics.
- Added the owner-protected, feature-gated `/athlete/intelligence?athleteId=…` dashboard
  with timeline, mechanical evolution graphs, priorities, recommendation memory, coach
  memory, fingerprint/archetypes, confidence, and data-quality states.
- Corrected projection snapshot ownership from the nonexistent `athletes.user_id` to
  `athletes.coach_id`.
- Added the four requested permanent documents and deterministic synthetic-only coverage.

## Verification

- Digital Twin sanity: passes history, baseline, trend, archetype, recommendation memory,
  coach memory, confidence, snapshot, rollback, idempotency, compatibility, event support,
  ownership, and no-generation checks.
- Projection, Benchmark, Priority, Recommendation, and Coach Report regression suites pass.
- Typecheck, lint, and production build pass. Lint retains only the pre-existing
  `VideoOverlay` exhaustive-deps warning.
- Focused dashboard authorization E2E passes on desktop; the duplicate mobile execution is
  intentionally skipped.

## Remaining operational work

The persistence and aggregation boundaries are complete, but automatic promotion must be
wired only when each upstream result has a finalized immutable snapshot. Working analyses
must not be auto-ingested. Real athlete-facing promotion also requires retention review
for coach notes/reported health context, field validation of archetype signals, and
longitudinal reconciliation jobs for pre-twin historical records.

## Continuation re-audit

Re-audit date: 2026-07-17

The repeated Digital Twin specification was checked against the implementation above.
The existing contracts, compatible baselines, metric trends, archetypes, recommendation
and coach memory, confidence evolution, append-only tables, dashboard, and snapshot
comparison/rollback are sound and must not be rebuilt.

Four production-readiness gaps remain:

| Gap | Priority | Finding | Narrow correction |
| --- | --- | --- | --- |
| Atomic persistence interface | Critical | Tables exist, but callers would need to coordinate raw inserts, duplicate detection, snapshot insertion, active state, and audit themselves. | Add owner-scoped idempotent append and atomic snapshot/activation functions plus typed persistence serializers. |
| Major-update snapshot policy | High | Snapshots can be created, but no deterministic policy identifies a major change. | Add a pure policy that detects first snapshot, season/health context, compatibility changes, archetype changes, confidence-band changes, and material event accumulation. |
| Non-metric longitudinal trends | High | Metric trends exist; recommendation adherence and priority recurrence are stored but not represented in `trendHistory`. | Extend the existing trend contract and add deterministic memory-trend aggregation. |
| Strength evolution view | Medium | Strength evidence may exist as validated improvements or strength priorities, but the dashboard does not display it explicitly. | Add a stored-evidence-only strength evolution panel and general trend summary. |

### Continuation implementation plan

1. Preserve all existing Digital Twin behavior and extend the trend contract compatibly.
2. Add recommendation-adherence, priority-recurrence, and strength-history trend adapters.
3. Add major-update snapshot assessment and typed persistence boundaries.
4. Add transactional database functions for idempotent event append and immutable
   snapshot creation/activation/audit.
5. Complete the missing dashboard views and extend focused tests before rerunning the full
   verification set.

### Continuation work completed

- Added typed recommendation-adherence, priority-recurrence, and strength-evolution
  entries to the existing trend history.
- Added strength and general longitudinal trend panels to the existing dashboard.
- Added deterministic major-update assessment and suppression of redundant snapshots.
- Added validated persistence serializers.
- Added an owner-scoped, idempotent timeline append function with replay acceptance and
  identity-collision rejection.
- Added an atomic immutable snapshot append, active-pointer update, and audit function.
- Removed direct authenticated insert policies for timeline events and twin snapshots so
  callers cannot bypass those invariants.

### Continuation verification

- Expanded Digital Twin sanity checks pass, including adherence, recurrence, strength
  evolution, major-update decisions, redundant-snapshot suppression, persistence
  serialization, atomic append/activation, and collision handling.
- Projection, Benchmark, Priority, Recommendation, and Coach Report regression suites
  remain green.
- Typecheck, lint, and production build pass. The only lint warning remains the
  pre-existing `VideoOverlay` exhaustive-deps warning.
- Focused dashboard authorization E2E passes on desktop with the duplicate mobile run
  intentionally skipped.
