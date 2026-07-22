# Sprint Intelligence — Phase 5: Athlete Blueprint Engine

AVA estimates what an **elite version of THIS athlete** would likely look like — an
individualized performance blueprint from their own build + goal. Never generic elites,
never world records, never averages, never one-size-fits-all targets.

Location: [`src/lib/intelligence/performanceGap/blueprint/`](../src/lib/intelligence/performanceGap/blueprint/).
Entry: `buildAthleteBlueprint(input)` → `AthleteBlueprint`.

## Answers

> "What does someone built like me generally need to reach my goal?"

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Target-range | `targetModel.ts` | Derives each metric's individualized [min,max] from anthropometrics + goal. |
| Body Profile | `bodyProfile.ts` | Target mass/BMI, lean-mass range, estimated strength/power level. |
| Strength Benchmark | `bodyProfile.ts` | Estimated strength ranges relative to bodyweight, scaled by level. |
| Elite Comparison | `eliteComparison.ts` | Matches a **similar-build archetype** (never a named athlete/record). |
| Development Score | `developmentScore.ts` | How close the athlete is to their blueprint, per area + overall. |
| Config | `config.ts` | Target models, body bands, strength ratios, archetypes, areas — all data. |

## Individualized targets (no one-size-fits-all)

- **Stride length** = trochanter height × configured ratio band (≈ 2.4–2.6×), falling
  back to a height ratio when trochanter is unavailable → a tall and a short athlete get
  **different** ranges.
- **Peak / average velocity** = goal-required average velocity × configured factor
  (average velocity is `measured` from the goal; peak is `estimated`).
- **Stride frequency** = a base band shifted by height (shorter → higher).
- **Ground contact / flight / acceleration** use configurable population bands (weakly
  individualized) at lower confidence — clearly `estimated`.

Every range carries `measured | estimated | inferred | unknown` + confidence; missing
inputs yield `unknown` (nothing fabricated).

## Body profile

Current BMI computed; target mass/BMI and lean-mass expressed as **ranges** from
sex-specific sprinter bands × height²; estimated strength/power level from the goal.
Presented as individualized estimates — **never requirements**.

## Strength benchmarks

Back squat, front squat, power clean, trap-bar deadlift, RDL, hip thrust, Nordic, calf,
jump performance, reactive-strength index — each an estimated **range** relative to
bodyweight, scaled by estimated level, every one labelled *"estimated benchmark — not a
requirement or a mandate."* Future tests plug in via `STRENGTH_BENCHMARKS`.

## Elite comparison (similar builds only)

Instead of "you should look like a world-record holder", AVA matches the athlete to the
closest **archetype** (tall power / balanced 100 m / compact high-frequency) by height,
mass, and event similarity. Below a minimum similarity it **declines to compare**. Every
comparison notes it is a similar-build archetype, not a specific athlete or record.

## Development score

Per-area progress (Sprint Mechanics, Acceleration, Top Speed, Symmetry, Reactive
Strength) 0–100 from current metrics vs the blueprint ranges, plus a weighted overall
completion. Development areas are ranked by the **largest remaining difference** first.
These are coaching metrics, not absolute truths — each carries confidence and excludes
un-scorable metrics rather than guessing.

## Data models

`AthleteBlueprint`, `BlueprintMetric`, `TargetRange`, `BodyProfile`, `StrengthBenchmark`,
`EliteComparison`, `ProgressScore`, `DevelopmentArea`, `PerformanceBlueprint`.

## Confidence

Reuses the Phase 1 primitives; every target/benchmark/score stores measured/estimated/
unknown + confidence and never hides uncertainty.

## Future systems (consume, not built here)

Progress dashboard, coach reports, performance potential, season planning, premium
coaching, Motion IQ, AVA Lift.

## Out of scope (per Phase 5 brief)

No UI, no workout plans, no What-If Simulator.

## Tests

`npm run athlete-blueprint:sanity` — 27 checks: individualized target generation, body
profile, strength benchmarks, similar-build elite comparison, development scores, athlete
adaptation, confidence propagation, serialization, and architecture integrity. Phases 1–4
suites remain green.
