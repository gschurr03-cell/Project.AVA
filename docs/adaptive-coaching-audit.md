# Adaptive Coaching Intelligence Engine audit

Audit date: 2026-07-17

## Conclusion

AVA does not yet have a longitudinal coaching orchestrator. The legacy `lib/coaching`
stack and newer Recommendation/Priority engines are session-oriented. They should not be
rewritten: the Adaptive Coaching Engine belongs after the Athlete Digital Twin and should
select, maintain, monitor, or retire existing structured coaching candidates.

The engine must be pure, deterministic, token-free, and independently useful when every
external AI provider is disabled. It must never consume landmarks, pixels, frames,
debugging metrics, raw chat, or LLM summaries.

## Component audit

| Component | Exists | Readiness | Decision | Dependencies and debt |
| --- | --- | --- | --- | --- |
| Session Recommendation Engine | Yes | Strong foundation | Reuse immutable outputs | Produces safe, evidence-linked recommendations but does not own longitudinal focus. |
| Session Priority Engine | Yes | Strong foundation | Reuse as candidate source | Ranks one analysis and caps priorities. It cannot determine multi-month focus lifecycle. |
| Coach Report Engine | Yes | Strong foundation | Preserve | Deterministic and snapshot-aware. Adaptive state may reference reports but must not regenerate them on app open. |
| Digital Twin | Yes | Strong development foundation | Primary input | Contains history, baselines, trends, recommendation memory, priorities, overrides, seasons, projections, benchmarks, confidence, and unknowns. |
| Recommendation effectiveness | Partial | Descriptive only | Reuse conservatively | Twin stores observed before/after association with `causalClaimAllowed: false`. |
| Focus lifecycle | No | Blocking | Add | No primary/secondary/maintenance/monitoring/retired longitudinal state exists. |
| Competition/season awareness | Partial context | Missing decision policy | Add | Twin stores seasons and performance context; no schedule-aware focus constraint exists. |
| Coaching confidence | No unified contract | Blocking | Add weakest-link calculation | Must combine Twin confidence, candidate confidence, freshness, history, and unknowns. |
| Cache/invalidation | No | Blocking | Add | Pages recompute other intelligence at read time. No persisted active CoachingState or trigger receipt exists. |
| Offline/mobile | No native implementation | Program blocker | Define cache envelope only | No Xcode project, service worker, offline database, upload queue, or sync conflict policy exists. A precomputed portable state is necessary but not sufficient. |
| Optional LLM boundary | No formal boundary | Add policy/flags | Core repository currently needs no LLM. Future optional capability must be isolated and replaceable. |
| Dashboard | No | Missing | Add restricted cached-state inspector | Must render persisted state only and never invoke evaluation on page open. |

## Production blockers

### Critical

- No versioned `CoachingState` contract or deterministic focus lifecycle.
- No cached active state, immutable state history, or explicit invalidation policy.
- No guarantee that opening the application serves cache instead of recomputing.
- No formal boundary excluding raw/experimental/LLM-derived inputs.

### High

- No competition-safe focus adjustment, season context, recommendation retirement, or
  maintenance policy.
- No longitudinal confidence/freshness calculation or next-evaluation contract.
- No token-free notification and offline cache envelope.

### Medium

- No operational adapter that promotes saved Priority/Recommendation results into
  normalized longitudinal coaching candidates.
- No mobile sync, offline mutation queue, service worker, or native storage.

## Internal implementation plan

1. Add strict versioned contracts for normalized validated candidates, structured evidence,
   schedule/season context, overrides, invalidation triggers, coaching focus, confidence,
   notifications, portable cache envelope, and `CoachingState`.
2. Add centralized deterministic ranking and lifecycle rules. Select no more than two
   active improvement focuses; preserve maintenance, monitoring, and retirement separately.
3. Add competition and development-stage eligibility checks without creating new
   recommendations.
4. Add input fingerprinting, trigger-based invalidation, freshness, next evaluation, and
   deterministic notification generation. `app_open` must never invalidate.
5. Add immutable state snapshots, one active cached pointer, trigger receipts, owner RLS,
   and atomic append/activation RPCs.
6. Add a feature-gated cached-state inspector that performs no evaluation.
7. Add deterministic synthetic-only coverage and permanent architecture/cache/LLM-boundary
   documentation, then run upstream and full regressions.

## Completed in this pass

- Added strongly typed validated candidate, evidence, override, schedule, invalidation,
  focus, confidence, notification, offline envelope, and `CoachingState` contracts.
- Added deterministic focus ranking and primary/secondary/maintenance/monitoring/retired
  lifecycle with no more than two active improvement focuses.
- Added recommendation-effectiveness memory, recurrence, regression, development-stage,
  competition-protection, season, override, freshness, and uncertainty handling.
- Added deterministic input fingerprints, notifications, next evaluation, and explicit
  zero-external-model-call compute policy.
- Added app-open cache preservation and idempotent trigger invalidation.
- Added immutable cached-state history, active-state pointer, pending invalidations, audit,
  and atomic append/activation persistence.
- Added the feature-gated `/coaching?athleteId=…` cached-state inspector; it performs no
  evaluation.
- Added portable offline cache metadata and queued-mutation declarations without claiming
  that native offline synchronization is complete.
- Added focused token-independence, determinism, lifecycle, competition, override,
  freshness, cache, invalidation, offline, and persistence tests.
- Added permanent engine, cache, token-boundary, and offline-policy documentation.

## Verification

- Adaptive Coaching sanity passes determinism, focus limits, lifecycle, evidence chain,
  coaching evolution, competition protection, override, freshness, confidence,
  invalidation, offline envelope, token independence, persistence, and cache-read checks.
- Digital Twin, Projection, Priority, Recommendation, and Coach Report regression suites
  remain green.
- Typecheck, lint, and production build pass. Lint retains only the pre-existing
  `VideoOverlay` exhaustive-deps warning.
- Focused cache-inspector authorization E2E passes on desktop; the duplicate mobile run is
  intentionally skipped.

## Remaining operational work

- Migration `0043` must be applied to the target Supabase environment.
- Finalized upstream events still need a deployable orchestration job that normalizes
  saved recommendations/priorities into coaching candidates and processes pending
  invalidations.
- The portable offline envelope is complete, but native encrypted storage, mutation
  queues, sync conflict handling, background upload, and offline report/drill asset
  caching are not implemented in this web repository.
- Athlete-facing activation needs longitudinal field validation of focus transitions,
  retirement behavior, competition protection, notification timing, and confidence.
