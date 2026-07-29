# Elite Benchmark and Comparison Engine audit

Audit date: 2026-07-17

## Existing systems

AVA currently has three different comparison concepts:

1. `public.benchmarks` stores single-video validation references such as an external
   timing/measurement result. This validates AVA accuracy; it is not a peer population.
2. `lib/biomechanics/validation` contains static engineering fixtures used to compare
   AVA outputs against known recordings. These are test data, not elite norms.
3. Customer-facing limiting-factor code contains manually configured “elite benchmark”
   thresholds. Those values have no versioned population, protocol, distribution, or
   Research Knowledge source contract and must not be migrated into the new engine as
   verified data.

History compatibility already enforces exact FPS, pose model, pipeline, metric schema,
timing policy, recording mode, camera model, compatibility group, and timing group.
Research Knowledge provides canonical metric definitions, comparability rules, source
review, and benchmark-evidence foundations. The Discovery Engine provides experimental
movement fingerprints but no validated elite fingerprint database.

## Readiness

| Component | State | Decision |
| --- | --- | --- |
| Population benchmark dataset | Missing | Add a separate versioned contract and persistence boundary. Do not overload validation benchmarks. |
| Distribution/percentiles | Missing | Add deterministic empirical/interpolated percentile logic that fails closed. |
| Population matching | Missing | Add transparent weighted matching with required hard filters. |
| Personal baselines | Partial | Reuse compatible saved history through a new normalized comparison input. |
| Trends | Partial | Existing coaching trends mix legacy metrics; add comparison-specific compatible trends. |
| Fingerprint matching | Experimental foundation | Add normalized similarity only for matching metric definitions and compatibility keys. |
| Visualization | Missing | Add protected developer pages with empty states and SVG/CSS visuals. |
| Verified elite data | Missing | Add no values or seeded populations. |

## Production blockers and debt

- Athlete profiles lack reliable age, training age, competition level, team/university,
  conference, surface, environment, and preferred-event fields.
- No verified collegiate, professional, Olympic, or world-championship distribution has
  been reviewed into Research Knowledge.
- Existing “elite” constants are unsupported and must not feed this engine.
- Existing benchmark tables represent validation recordings, not peer cohorts.
- No organizational/team authorization model exists.
- Fingerprints are experimental and cannot be labeled elite without a verified cohort.

## Implementation plan

1. Add one versioned population dataset and entry contract linked to reviewed research.
2. Centralize protocol, metric, FPS, phase, event, timing, and population compatibility.
3. Implement deterministic hard filtering followed by transparent similarity scoring.
4. Calculate percentiles only from compatible distributions and return an explicit
   unsupported result otherwise.
5. Add compatible personal/season/lifetime/phase/mechanical/velocity/consistency trends.
6. Add fingerprint similarity with shared metrics and compatibility requirements.
7. Add reviewer-gated storage with no seeded values.
8. Add protected `/benchmarks` and `/comparisons` developer surfaces.
9. Add deterministic tests and documentation.

## Completed in this pass

- Added versioned dataset, population, metric-definition, distribution-entry, athlete
  context, compatibility, similarity, comparison-result, trend, and fingerprint contracts.
- Added hard protocol/technology/timing/FPS/metric/phase/event/sex compatibility gates.
- Added deterministic similarity scoring, percentile interpolation, closest-group
  selection, unsupported-comparison tracing, and descriptive strengths/opportunities.
- Added personal/season/lifetime/phase/mechanical/velocity/consistency trend support with
  current, best, rolling-baseline, change, and consistency outputs.
- Added compatible fingerprint similarity with shared characteristics and differences.
- Added reviewer-gated population dataset storage and audit tables without seed values.
- Added protected `/benchmarks` and `/comparisons` pages with real-data distribution
  rendering and honest empty states for percentile, radar, trend, and similarity views.
- Added focused tests, security E2E, and three policy/architecture documents.
