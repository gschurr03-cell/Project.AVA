# Sprint Intelligence — Phase 6: Performance Potential Engine

Answers the question every athlete asks — **"what am I capable of?"** — honestly: an
informed projection, never a guarantee, never certainty. Every output is a RANGE with
confidence and an explanation, tagged measured / estimated / projected / unknown.
Longer-horizon projections carry lower confidence by construction.

Location: [`src/lib/intelligence/performanceGap/potential/`](../src/lib/intelligence/performanceGap/potential/).
Entry: `buildPerformancePotential(input)` → `PerformancePotential`.

> Note: Phase 6 was built after Phases 7–8 (it had been skipped). It consumes Phase 1
> (gaps/target), Phase 3 (root causes), Phase 4 (sensitivity), and Phase 5 (blueprint).

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Ceiling | `ceiling.ts` | Individualized ceiling from the blueprint stride-length × frequency targets, preserving the athlete's average-to-peak ratio. |
| Projection | `projection.ts` | Near-/long-term time-velocity RANGES from the current→ceiling headroom, with evidence + assumptions. |
| Bottlenecks | `bottlenecks.ts` | Ranks what constrains higher projections (contribution × sensitivity), linked to the source engine. |
| Scenarios | `scenarios.ts` | Current / conservative / expected / optimistic development scenarios. |
| Confidence + Uncertainty | `confidence.ts` | Confidence from six factors; explicit uncertainty sources. |

## Ranges, never single numbers

Projections are `[minTime, maxTime]` / `[minVelocity, maxVelocity]`. The near- and
long-term ranges close a configurable fraction of the **current → ceiling** velocity
headroom (near-term 18–35%, long-term 55–82%), so long-term is faster than near-term,
and every projection stays between the ceiling and the current PB.

## Individualized ceiling (never destiny)

The ceiling top speed is derived from the athlete's own blueprint stride-length ×
frequency targets (v = SL × F), floored at their current top speed, then converted to
an average-velocity ceiling using their current average-to-peak ratio — so the ceiling
reflects *this* athlete's build and profile, not a generic elite time. It is capped for
safety and explicitly labelled an informed projection, "not a destiny or a guarantee."

## Explainability

Every projection answers *why*: e.g. "Stride frequency already matches projected
requirements", "Peak velocity is within X% of the projected requirement", "Ground
contact remains above its estimated target", "Reactive-strength improvements could
reasonably close part of the remaining gap" — plus its assumptions.

## Development scenarios

Current trajectory (no change → current PB), conservative, expected, and optimistic —
each a headroom fraction with an estimated time, a range, confidence, its largest
limiting factors, and its greatest uncertainty.

## Bottlenecks

What prevents higher projections, blending Phase 1 limiter contribution and Phase 4
downstream sensitivity (not simply the largest gap), each linked back to
`performance-gap` / `metric-dependency` / `root-cause`.

## Confidence model

Confidence depends on measurement quality, data completeness, athlete similarity,
projection distance, and historical consistency (weighted). The projection-distance
factor is lower for long-term, so **longer projections are naturally less confident.**

## Uncertainty model

Explicitly surfaces: limited historical analyses, rapid recent improvement, missing
anthropometrics, incomplete velocity profile, no similar-build comparison, and a goal
at/beyond the estimated ceiling.

## Data models

`PerformancePotential`, `PotentialRange`, `DevelopmentScenario`, `PerformanceCeiling`,
`PerformanceProjection`, `ProjectionConfidence`, `ProjectionEvidence`,
`ProjectionAssumption`, `ProjectionConstraint`, `UncertaintySource`.

## Out of scope (per Phase 6 brief)

No UI, no workout plans, no What-If Simulator.

## Tests

`npm run performance-potential:sanity` — 24 checks: range projections, individualized
ceiling, scenarios (ordered), bottlenecks (engine-linked), confidence (longer = lower),
uncertainty surfacing, honesty taxonomy, determinism, serialization, and architecture
integrity. Phases 1–5, 7, 8 suites remain green.
