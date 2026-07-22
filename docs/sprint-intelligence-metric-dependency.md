# Sprint Intelligence — Phase 4: Metric Dependency Engine

Sprint metrics are not independent — changing one changes several others. Phase 4
builds the **interconnected sprint performance model**: a causal graph of signed,
confidence-tagged relationships plus sensitivity, tradeoff, diminishing-returns, and
athlete-specific analysis. It is the backbone future systems (What-If Simulator,
performance prediction, season forecasting, training prioritization) will consume.

Location: [`src/lib/intelligence/performanceGap/dependency/`](../src/lib/intelligence/performanceGap/dependency/).
Entry: `buildMetricDependencyReport(model, { context })`.

## Core concept

```
groundContact → flightTime → strideLength → averageVelocity → finishTime
acceleration  → transition  → peakVelocity → averageVelocity → finishTime
strideLength  ⇄ strideFrequency            (negative — a tradeoff)
```

AVA *understands* these relationships (traversable graph + reasoning), not merely
displays them.

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Dependency Graph | `dependencyGraph.ts` | Builds nodes (primary/secondary influences, dependents) + edges; finds cycle-safe multi-layer influence paths. |
| Sensitivity | `sensitivity.ts` | Which metrics produce the largest downstream effects toward the finish (sum of path couplings, normalized). |
| Tradeoff Detection | `tradeoffs.ts` | Negative relationships between two increase-desired metrics (stride length ⇄ frequency); excludes beneficial negatives. |
| Diminishing Returns | `diminishingReturns.ts` | Marginal gain relative to a population optimal band — larger far from the ceiling, smaller near it. |
| Athlete Modifiers | `athleteModifiers.ts` | Per-relationship multipliers from height / leg length / mass / training age; returns an adapted relationship set. |
| Config | `graphConfig.ts` | The relationship set, diminishing curves, and modifier rules — all editable data. |

## Dependency objects

Every relationship (`MetricRelationship`) stores `from → to`, a **type**
(`positive | negative | threshold | plateau | nonlinear | unknown`), a **signed
strength** in [-1, 1], **confidence**, **evidence** (with a Phase-5 research seam), and
the athlete attributes it is **sensitive to**. Example: stride length → peak velocity,
strength 0.8, positive, measured (via `v = SL × F`).

## Multi-layer dependencies

`findInfluencePaths(graph, from, to)` returns every path (cycle-safe), each with a
coupling = product of |strength| and a net sign. `groundContactTime` reaches
`finishTime` through `flightTime → strideLength → averageVelocity`.

## Athlete-specific dependencies

Relationships adapt to the athlete: a tall athlete's stride-length→velocity coupling is
strengthened; a novice's reactive-strength→ground-contact coupling is weakened. Two
different athletes get different sensitivity results. The adaptation is transparent
(`AthleteModifier` records the factor + reason) and never asserted as measured.

## Diminishing returns

Marginal gain is modelled RELATIVE to a configurable population optimal band (never the
athlete's goal target): 2.05 → 2.15 m yields a larger `marginalGainFactor` than
2.35 → 2.45 m; regimes are `rising | diminishing | plateau | unknown`.

## Tradeoff detection

A tradeoff is a negative relationship between two metrics the athlete wants to increase
(stride length ⇄ frequency). The beneficial `averageVelocity → finishTime` negative and
lower-is-better couplings are correctly excluded.

## Sensitivity analysis

Ranks metrics by normalized total downstream influence toward the finish (sum of path
couplings), each with its affected downstream metrics and propagated confidence.

## Causal graph as the backbone

`DependencyGraph` (nodes + edges + version) is the internal representation future
intelligence systems traverse. Adding a metric = adding its relationships in
`graphConfig.ts`; the graph picks up the new node automatically (tested).

## Confidence

Reuses the Phase 1 primitives: edge confidences propagate (weakest category, product of
scores) into sensitivity/tradeoff confidence, and sensitivity is always capped at
`estimated`. No arbitrary numbers.

## Data models

`MetricRelationship`, `RelationshipType`, `RelationshipEvidence`, `DependencyNode`,
`DependencyEdge`, `DependencyGraph`, `InfluencePath`, `InfluenceScore`,
`SensitivityScore`, `Tradeoff`, `DiminishingReturns`, `AthleteModifier`,
`MetricDependencyReport`.

## Out of scope (per Phase 4 brief)

No UI, no What-If Simulator, no workout plans, no unrelated-system edits. (Phase 3's
simpler `rootCause/interactions.ts` is left intact; this is the richer, dedicated
engine.)

## Tests

`npm run metric-dependency:sanity` — 25 checks: graph construction, multi-layer
chaining, tradeoff detection, sensitivity analysis, diminishing returns, athlete
adaptation, graph integrity, serialization, and extensibility. Phases 1–3 suites remain
green.
