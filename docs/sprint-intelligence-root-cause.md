# Sprint Intelligence — Phase 3: Root Cause Intelligence Engine

AVA already knows *what must improve* (Phases 1–2). Phase 3 answers **"why is that
metric limiting performance?"** — with a weighted, evidence-backed reasoning model,
never a single guessed cause and never a diagnosis.

Location: [`src/lib/intelligence/performanceGap/rootCause/`](../src/lib/intelligence/performanceGap/rootCause/)
(kept inside the Sprint Intelligence subsystem, separate from the unrelated
`src/lib/rootCause/`). Entry: `buildRootCauseReport(model, { rawMetrics, context })`.

## Core principle

Every limiter is evaluated against **all plausible contributors**. Each contributor
receives a relative **likelihood %**, propagated **confidence**, **supporting
metrics**, an **evidence chain**, **reasoning**, **associated muscle groups**, and
**intervention categories**. AVA never says "this is the cause" — it estimates
relative likelihood.

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Root Cause | `rootCauseEngine.ts` | Combines priors + matched rules + context into normalized weighted contributors per limiter. |
| Rule Engine | `ruleEngine.ts` | Deterministically evaluates configurable rules against metric states + left/right values. |
| Rules (config) | `rules.ts` | Coaching logic as DATA, not code. Each rule has conditions, contributor boosts, reasoning, and a **research-metadata seam**. |
| Metric Interaction | `interactions.ts` | Directed metric dependency graph + a tracer from any metric to finish time. |
| Athlete Context | `athleteContext.ts` | Adapts contributor weights from height, leg length, mass, training age, etc. — never identical for every athlete. |
| Catalog (config) | `catalog.ts` | Contributors, muscle groups, intervention categories, per-limiter candidate sets. |

## Weighted reasoning

`likelihood = normalize( prior + Σ(matched-rule boost × evidence-confidence) × context-modifier )`.
Example (stride length): Reactive Strength 36% · Front-side Mechanics 27% · Projection
18% · Elastic Stiffness 10% · Ground Strike 9% — the exact split depends on the
athlete's metric pattern and context.

## Evidence chains

Each contributor's chain lists the metric-state observations that support it
(e.g. "Stride length below requirement → Ground contact above requirement → Frequency
at requirement") and concludes with the associative pattern ("commonly associated with
reduced reactive force production"). Every step carries an evidence category.

## Configurable rule engine (no hardcoded coaching logic)

Rules are data in `rules.ts`. Metric-state conditions (`deficient | met | unknown`) and
side conditions (`left_shorter`, `left_longer`, …) gate contributor boosts. Adding or
editing a rule changes AVA's reasoning without touching engine code. Example:

```
IF strideLength deficient AND groundContactTime deficient AND strideFrequency met
→ boost reactiveStrength (0.40), projection (0.25), verticalForce (0.20)
```

## Metric interaction models

Directed dependencies model influence toward the finish:
`groundContact → flightTime → strideLength → averageVelocity → finishTime` and
`acceleration → transitionEfficiency → peakVelocity → averageVelocity → finishTime`.
`traceInteraction(metric)` returns the chain + a coupling-to-finish strength.

## Athlete context adaptation

Contributor weights are multiplied by context modifiers derived from anthropometrics +
profile (height, leg length, body mass, training age, …), so a tall, experienced
athlete and a short novice never receive identical reasoning. The adaptation is
`inferred`, not measured.

## Confidence propagation

`measurement quality → metric confidence → root-cause confidence → recommendation
confidence`. A contributor supported only by its prior (no matching rule) is `inferred`
with low confidence; a rule-matched contributor propagates from the measured metrics'
confidence. No arbitrary numbers.

## Scientific honesty

Muscle groups and patterns are **associations** ("commonly associated with…"), never
diagnoses. A test forbids diagnostic words (weak/damaged/injured/tear). Interventions
are **categories** with purpose + typical implementation (fly zones, hill distances,
drill purposes) — **never** weekly schedules or prescribed programs.

## Research-ready architecture (Phase 4 seam)

Every `ReasoningRule` accepts optional `research: { source, publication, evidenceQuality,
internalValidation }`. Phase 4's research engine can populate and grade these without
changing the rule structure.

## Data models

`RootCause`, `EvidenceChain`, `EvidenceStep`, `ReasoningRule`, `Confidence`,
`MetricDependency`, `InteractionModel`, `AssociatedPattern`, `AssociatedMuscleGroup`,
`InterventionCategory`, `ReasoningExplanation`, `MetricStatus`, `AthleteContext`.

## Out of scope (per Phase 3 brief)

No UI changes, no workout plans, no What-If Simulator, no unrelated-system edits.

## Tests

`npm run root-cause-intelligence:sanity` — 27 checks covering root-cause generation,
rule evaluation, confidence propagation, evidence chains, metric interactions, athlete
context adaptation, intervention generation, and architecture integrity. Phases 1–2
suites remain green.
