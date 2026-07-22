# Sprint Intelligence — Phase 9: Performance Simulation Engine (What-If Simulator)

An interactive **scenario-exploration** engine — *not* a prediction engine. It answers
"what happens if this metric improves?" by **reusing** the existing intelligence engines
rather than duplicating their logic, and surfaces every estimate with confidence,
sensitivity, the dependencies it activated, and the assumptions behind it.

Location: [`src/lib/intelligence/performanceGap/simulation/`](../src/lib/intelligence/performanceGap/simulation/).
Entry: `runSimulation(input)` → `SimulationScenario`; `compareScenarios(...)`; a pure
scenario store.

## What it reuses (no duplicated logic)

| Consumed engine | Used for |
|-----------------|----------|
| Phase 4 — Metric Dependency (`dependencyGraph`, `findInfluencePaths`, `computeSensitivity`) | Dependency-aware propagation + per-metric sensitivity. |
| Phase 5 — Athlete Blueprint (`metricScore`, `buildProgressScores`, `overallCompletion`) | Recomputed development score + blueprint completion; anthropometric stride cap. |
| Shared confidence model | Evidence-tagged confidences on every propagated change. |

## Pipeline

`runSimulation` = **constrain → propagate → estimate outcomes → score confidence → explain**:

1. **Constraint engine** (`constraints.ts`) — clamps each requested adjustment to a
   physiologically plausible range. Frequency can't rise indefinitely, ground contact
   can't approach zero, and stride length is capped by the athlete's **own leg length**
   (trochanter height × ratio), never a fixed number.
2. **Propagation** (`propagation.ts`) — walks the Phase 4 causal graph from each adjusted
   metric to estimate downstream relative changes, honouring **independent locking**
   (locked and user-set metrics never receive propagation). The classic stride ⇄
   frequency tradeoff falls out automatically.
3. **Outcomes** (`outcomes.ts`) — velocity flows from the exact identity
   `v = stride length × frequency`; 60/100/200 m times apply transparent top-speed
   transfer factors; development score + blueprint completion are recomputed via Phase 5.
4. **Confidence** (`confidence.ts`) — a seven-factor `ScenarioConfidence`.
5. **Explainability** (`index.ts`) — assumptions for every scenario.

## Inputs (registry-driven)

Peak/average velocity, stride length, stride frequency, ground contact, flight time,
acceleration, transition efficiency, reactive strength, symmetry, braking distance,
projection — plus any **future metric**, which simulates via the default relative bound
without touching engine code.

Supports single adjustments, multiple simultaneous adjustments, independent metric
locking, and dependency-aware propagation.

## Outputs

Per-metric estimated change (with source, sensitivity, confidence); estimated 60/100/200 m
times (with per-event confidence + measured/estimated baseline tag); velocity profile
(speed ratio, peak, average); development score; blueprint completion — every value with
**estimated change + confidence + sensitivity**.

## Constraint engine (plausibility rails)

Prevents unrealistic scenarios: frequency ceiling, ground-contact floor, anthropometric
stride-length cap, bounded velocities. Rails are wide plausibility limits, **not** goal
targets.

## Confidence model

Measurement quality, evidence strength, projection distance, athlete similarity,
dependency confidence, research support, historical consistency (weighted). **Larger
adjustments and thinner data lower confidence.**

## Comparison mode

`compareScenarios` builds a side-by-side table — Current vs Scenario A vs Scenario B —
of estimated event times, deltas, and development-score change, and flags the best
(fastest primary-event) scenario.

## Saveable scenarios

Pure, serializable store operations (`store.ts`): scenarios can be **named, saved,
reopened, renamed, compared, deleted, and exported** (JSON round-trip). Persistence is a
UI/DB concern layered on later.

## Data models

`SimulationScenario`, `SimulationInput`, `SimulationOutput`, `SimulationConstraint`,
`SimulationAssumption`, `SimulationComparison`, `ScenarioConfidence`, `DependencyActivation`
(plus `SimulatedMetricChange`, `SimulatedEventOutcome`, `ScenarioStore`).

## Out of scope (per Phase 9 brief)

No analysis-workflow redesign, no workout plans, no UI beyond what the engine needs.

## Tests

`npm run performance-simulation:sanity` — 27 checks: scenario generation, dependency
propagation, the tradeoff, independent locking, multi-metric scenarios, constraint
enforcement (frequency ceiling / contact floor / anthropometric stride cap), explainability,
event/velocity/development-score outputs, confidence (larger = less confident), comparison,
saveable scenarios (name/save/rename/delete/export), determinism, serialization, and
architecture integrity (reuses Phase 4 + 5, no duplicated engines). Phases 1–8 stay green.
