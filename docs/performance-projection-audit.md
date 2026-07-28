# Performance Projection Engine audit

Audit date: 2026-07-17

## Release conclusion

AVA has most upstream evidence producers required by a conservative projection engine,
but it does not have a production-ready athlete trajectory model. The existing
`src/lib/prediction` module is a deterministic race-time estimator derived from current
velocity, and `pbForecast.ts` is an honest unimplemented scaffold. Neither should be
expanded into the requested engine: their contracts center race times rather than
longitudinal evidence, compatible history, limiters, uncertainty, and invalidation
conditions.

The new engine must remain separate, consume only versioned structured outputs, and stay
off athlete-facing surfaces until field validation establishes calibration and error
bounds. Existing working biomechanics, observation, interpretation, recommendation,
priority, research, benchmark, and report systems will not be rewritten.

## Component findings

| Component | Exists | Readiness | Decision | Dependencies and debt |
| --- | --- | --- | --- | --- |
| Legacy performance predictor | Yes | Not suitable for this mission | Preserve, do not reuse | Generates 60/100/200 m estimates from a physics-lite velocity ratio. The panel is removed from the session page, but the result still feeds legacy Sprint Intelligence goal-gap context. It has no longitudinal trajectory, benchmark compatibility, limiter contract, interval calibration, or invalidation model. |
| PB forecast | Stub | Intentionally unavailable | Preserve as a separate roadmap stub | Returns `available: false`; its race-target contract conflicts with the instruction not to guess future race times. |
| Athlete history | Partial | Good compatible-trend foundation | Reuse | Benchmark trends group history by compatibility key and exclude mixed measurement protocols. Immutable projection snapshots do not yet exist. |
| Mechanical fingerprint | Yes | Experimental / validation required | Consume only as supporting evidence | Versioned fingerprint comparisons fail closed for incompatible keys. Fingerprints must never be treated as genetic ceilings. |
| Observation Engine | Yes | Production foundation | Consume summaries only | Provides measurement-derived observations and confidence. Raw pose landmarks must never enter projection inputs. |
| Interpretation Engine | Yes | Production foundation | Consume summaries only | Supplies evidence-linked interpretations. Projection must not invent new biomechanical causality. |
| Recommendation Engine | Yes | Production foundation | Consume summaries only | Supplies intervention context; a recommendation is not evidence that an athlete will respond. |
| Priority Engine | Yes | Production foundation | Consume summaries only | Supplies ranked priorities and unresolved conflicts. Projection limiter ranking must preserve upstream uncertainty. |
| Research Knowledge Engine | Yes | Reviewer-gated foundation | Reuse confidence/provenance only | Versioned sources and claims exist. Production evidence must be approved and applicable; no web lookup or invented claim may enter calculation. |
| Elite Benchmark Engine | Yes | Good foundation, no real datasets seeded | Reuse compatible results only | Explicit protocol, timing, FPS, metric-definition, phase, event, and population compatibility checks exist. An unavailable or mismatched comparison must lower confidence, never be coerced into a percentile. |
| Limiter model | Partial, fragmented | Not production ready | Add a projection-specific adapter | Current intelligence modules contain overlapping limiter concepts and some hard-coded “elite” constants. The new model will normalize only supplied upstream findings and will not estimate causal impact numerically. |
| Trajectory model | No | Blocking | Add deterministic versioned model | Must isolate compatible history, expose residual uncertainty, classify trend shape, damp extrapolation with horizon, and fail closed with sparse/noisy evidence. |
| Confidence model | No unified model | Blocking | Add weakest-link model | Measurement, history, consistency, benchmark compatibility, session quality, and research confidence currently live in separate contracts. |
| Persistence | No | Blocking for history/auditability | Add immutable snapshots | Store exact input/output contracts and engine version under athlete ownership. Never overwrite old projections when the model changes. |
| UI | No projection workspace | Missing | Add restricted developer view | Reuse AVA carbon/premium primitives. No athlete-facing claims, guarantees, genetic language, injury forecast, or fabricated sample projection. |

## Production blockers

### Critical

- No versioned projection output or immutable audit snapshot.
- No deterministic, compatibility-aware trajectory and uncertainty model.
- No unified confidence degradation for sparse history, incompatible benchmarks, poor
  measurement quality, missing variables, or inconsistent progression.
- No structured limiter adapter that prevents new unsupported causal claims.
- No safe policy for career/peak/return-from-injury requests.

### High

- Real benchmark population datasets and projection error calibration are absent.
- Athlete records do not consistently capture training age, training consistency,
  competition history, or injury/return-to-play clearance.
- Legacy race estimates still feed an internal intelligence path, although their visible
  session panel is disabled.
- No prospective validation links projected intervals to later observed outcomes.

### Medium

- No reviewer UI for comparing prior projections with realized compatible measurements.
- No shared upstream orchestration object composes observation through benchmark evidence
  into a single projection input.

### Low

- Legacy “Day” comments and prediction naming create conceptual ambiguity.

## Internal implementation plan

1. Add strict versioned contracts that accept only structured evidence references,
   compatible metric history, optional fingerprint summaries, benchmark results, and
   contextual confidence. Explicitly exclude landmarks and race-time synthesis.
2. Add deterministic trajectory, confidence, and limiter services. Use centralized model
   policy, weakest-link confidence caps, horizon damping, evidence-bounded scenarios, and
   unavailable results when safety requirements are not met.
3. Add an immutable athlete-owned projection snapshot table and reviewer-only developer
   summary. Do not seed projections or benchmarks.
4. Add a feature-gated `/projections` developer workspace for trajectory curves, intervals,
   limiters, confidence, assumptions, unknowns, history, and benchmark context.
5. Add deterministic synthetic-fixture tests for rapid improvement, steady progress,
   plateau, regression, noise, sparse history, benchmark mismatch, repeatability,
   unsupported race-time targets, and persistence boundaries.
6. Document the model, confidence policy, and trajectory definitions; then run focused
   upstream regression checks plus typecheck, lint, build, and restricted-route E2E.

## Completed in this pass

- Added versioned projection, evidence, limiter, trajectory, confidence, and immutable
  snapshot contracts.
- Added compatible-history isolation and deterministic classifications for rapid
  improvement, steady improvement, plateau, regression, inconsistency, and unknown state.
- Added horizon damping, bounded extrapolation, evidence-case ranges, explicit assumptions,
  required conditions, unknowns, and invalidation conditions.
- Added confidence degradation for sparse history, incompatible benchmarks, missing
  training context, inconsistent measurements, and uncalibrated interval coverage.
- Added hard stops for race-time synthesis, unvalidated career peak, and
  return-from-injury projection.
- Added immutable athlete-owned projection persistence with reviewer-gated developer
  access and no seeded projection values.
- Added the restricted `/projections` workspace while leaving athlete-facing projections
  disabled.
- Added deterministic synthetic-only sanity coverage and permanent model, confidence, and
  trajectory documentation.
- Verified the projection, benchmark, research, priority, and recommendation sanity
  suites; typecheck; lint; production build; and the focused restricted-route E2E test.
  Lint retains only the pre-existing `VideoOverlay` exhaustive-deps warning.

## Deferred validation work

Numeric outputs remain development-only. Before athlete-facing release, AVA needs genuine
compatible longitudinal cohorts, prospective interval calibration, outcome backtesting,
reviewed benchmark datasets, reliable training-context capture, and governance for model
version promotion. Adaptive Training Intelligence is the highest-priority next engine once
these projection foundations have sufficient validation data.
