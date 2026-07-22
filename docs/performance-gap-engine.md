# Athlete Intelligence — Performance Gap Engine (Part A)

The intelligence layer that lets AVA move from **"what happened?"** to
**"what must change to reach your goal?"** Every future coaching feature
(Path To Goal, What-If Simulator, weekly tracking, training priorities, coach
reports, season planning) consumes this subsystem's output — it renders nothing
itself.

Location: [`src/lib/intelligence/performanceGap/`](../src/lib/intelligence/performanceGap/).
Entry point: `buildAthletePerformanceModel(input)` → `AthletePerformanceModel`.

## Design principles (enforced in code)

- **Deterministic** — pure functions; inject `now` for reproducible output; identical
  input → byte-identical JSON (asserted in tests).
- **Modular** — five independent engines + a thin orchestrator.
- **Configurable** — all model parameters live in `config.ts`; swapping research
  means editing weights/elasticities/templates, never engine logic.
- **Evidence-aware** — every conclusion is `measured | estimated | inferred | unknown`;
  every estimate carries a 0–1 confidence score; confidence propagates by taking the
  **weakest** category and multiplying scores.
- **Expandable** — engines iterate the metric registry, so new metrics (or future
  device-measured ones) plug in with a single registry entry.
- **No hardcoded targets** — a metric requirement is always **derived** from the
  athlete's own current value × the goal's velocity ratio; there is no
  `strideLength = 2.45` anywhere.
- **Never diagnoses** — reasoning-tree nodes are framed *"commonly associated with…"*.

## The five engines

| # | Engine | File | Purpose |
|---|--------|------|---------|
| 1 | Performance Gap | `performanceGap.ts` | Current vs required per metric: absolute/percent gap, importance, confidence, estimated contribution + time gain. |
| 2 | Goal Requirement | `goalRequirement.ts` | Derives the likely required value of each metric from the goal's velocity ratio (configurable models; never a hardcoded number). |
| 3 | Limiter Prioritization | `limiterPrioritization.ts` | Ranks limiters by **estimated impact** (contribution × confidence), **not** raw gap size; each carries reason, evidence, associated metrics, estimated time gain, expected-improvement band. |
| 4 | Performance Tree | `performanceTree.ts` | Expands a metric into an associative reasoning tree (Vertical Force → Ground Strike → Front-side → Hip Extension → Projection → Elastic Stiffness → interventions). Non-diagnostic. |
| 5 | Recommendation Impact | `recommendationImpact.ts` | Estimates each recommendation's per-metric effects + a **ranged** race-time gain, with confidence, evidence source, and reasoning — never a guarantee. |

## Goal-requirement model (why it needs no hardcoded targets)

For the velocity identity `v = strideLength × strideFrequency`:

```
velocityRatio = requiredAvgVelocity / currentAvgVelocity        (from goal time)
requiredMetric = currentMetric × velocityRatio^(w / Σw)          (multiplicative metrics)
```

The exponent weights `w` are configurable and normalized across the multiplicative
metrics present, so `strideLength_req × strideFrequency_req = velocityRatio × current
product` **exactly** (asserted in tests). Velocity metrics scale proportionally;
ground-contact/flight/acceleration use configurable **elastic** responses at lower
confidence (`inferred`). Nothing is asserted more confidently than the model warrants.

## Shared data models (`models.ts`, UI-independent)

`Confidence`, `MetricValue`, `PerformanceTarget`, `RequiredMetric`, `GoalRequirement`,
`GapContribution`, `PerformanceGap`, `PriorityLimiter`, `PerformanceNode`,
`PerformanceTree`, `MetricEffect`, `RecommendationImpact`, `AthletePerformanceModel`.

Helpers: `measured/estimated/inferred/unknown()` constructors and
`propagateConfidence()` (weakest-category, product-of-scores).

## Supported metrics (registry-driven, extensible)

Stride length, stride frequency, peak velocity, average velocity, ground contact
time, flight time, acceleration quality, transition efficiency, max-velocity
maintenance, and left/right stride length + frequency. Adding a metric = one
`METRIC_REGISTRY` entry.

## Extension points (declared, NOT implemented)

Each registry entry has an `externalSources` field reserving clean seams for future
integrations — **AVA Lift, Motion IQ, force plates, Freelap, Brower, jump testing,
strength testing, wearables** — to feed `measured` metric values into the same
pipeline. No integration code exists yet; only the seam.

## Scientific honesty

AVA never says "your hamstrings are weak." Tree nodes say *"commonly associated with
reactive strength / vertical force production / front-side mechanics / projection /
elastic stiffness / hip-extension timing / mobility"*. Every recommendation
distinguishes measured vs estimated vs associated vs unknown, and every estimate is a
range or a confidence-scored value.

## Tests

`node scripts/performance-gap-sanity.mjs` (`npm run performance-gap:sanity`) — 35
checks: goal-requirement derivation + identity preservation, gap math, impact-based
(not raw-gap) prioritization, confidence propagation, associative/non-diagnostic tree
generation, ranged recommendation impact, serialization determinism, registry-driven
architecture integrity, and missing-data honesty.

## Explicitly out of scope for Part A

No UI changes; the Limiting Factors page, Path To Goal page, and What-If Simulator are
**not** built here. This sprint is the intelligence foundation those features consume.
