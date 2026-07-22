# Sprint Intelligence — Phase 7: Intervention Intelligence Engine

AVA knows what is limiting performance (P1), why (P3), how much improvement is needed
(P1), and what may be possible (P6). Phase 7 answers: **"what types of training
interventions are commonly used to improve these specific limitations?"**

AVA **educates**; it does **not** prescribe. No weekly schedules, no Monday–Sunday
programming, no sets/reps assigned to the athlete.

Location: [`src/lib/intelligence/performanceGap/intervention/`](../src/lib/intelligence/performanceGap/intervention/).
Entry: `buildInterventionReport({ model, rootCauses, level })`.

## Flow

```
Performance Gap → Root Cause → Metric Dependencies → Intervention Categories
  → Expected Direction of Improvement → Confidence
```

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Intervention Library | `library.ts` | A structured, configurable database of interventions with full educational metadata. |
| Matching Engine | `matching.ts` | Ranks interventions by relevance to the athlete's limiters + root causes + level. |
| Explanation | `matching.ts` | "Why this?" — associative, educational reasoning + supporting evidence. |
| Expected Improvement | `matching.ts` | Expected metric DIRECTION (↑/↓), direct vs indirect, with confidence — never a guaranteed magnitude. |
| Educational Guidance | `matching.ts` | Typical distances / volume / rest / cues — concepts, not a program. |

## Intervention library

Includes flying sprints, sprint-float-sprint, hill/resisted/assisted accelerations,
wicket runs, straight-leg + alternate bounds, pogo series, depth + drop jumps, wall
drills, A/B-skips, dribble/switch drills, medicine-ball throws, hip-projection drills,
core stability, mobility, foot/ankle stiffness. Every entry stores: name, category,
primary/secondary qualities, common uses, typical level, typical phase, typical
distances/volume/rest, coaching cues, common mistakes, associated muscle groups,
evidence strength, contraindications, associated sprint metrics (with direction), root
causes addressed, and confidence. New interventions plug in by adding an entry.

## Matching

Given the Phase 1 limiters (ranked, with contribution %), the Phase 3 root causes
(leading contributors), and the Phase 5 level, the engine scores each intervention by:

```
relevance = Σ limiter-contribution (metric match, correct direction)
          + Σ root-cause-likelihood (contributor match)
score     = relevance × intervention.confidence × levelFit × evidenceWeight
```

and returns a ranked `InterventionPriority[]`, each with reasoning, supporting evidence,
associated metrics, addressed limiters + root causes, expected improvements, and
educational guidance. Novice vs advanced produce different orderings.

## Expected direction of improvement (never guaranteed)

Each intervention lists the metrics it commonly moves and in which direction (e.g.
Flying Sprint → ↑ peak velocity, ↑ stride length, ↓ ground contact). Indirect effects
(via the Phase 4 dependency chain, e.g. → improved finish time) are surfaced at lower
confidence. AVA never estimates a guaranteed magnitude.

## Educational guidance only

Guidance is typical fly zones, hill distances, wicket-spacing philosophy, bounding
purpose, progression concepts, coaching cues, and recovery emphasis. A test asserts the
output never contains days ("Monday"), week numbers, or prescribed sets/reps.

## Confidence

Reuses the Phase 1 primitives: interventions with moderate/strong evidence are
`estimated`; limited/anecdotal are `inferred`. Indirect effects propagate lower than
direct ones. No arbitrary numbers.

## Data models

`Intervention`, `InterventionCategory`, `InterventionRelationship`,
`ImplementationGuidance`, `CoachingCue`, `ExpectedImprovement`, `EvidenceStrength`
(as a field type), `AssociatedMetric`, `AssociatedPattern`, `InterventionPriority`,
`InterventionReport`.

## Dependencies

Consumes Phase 1 (gaps), Phase 3 (root causes), Phase 5 (level). It works **without**
Phase 6 (Performance Potential), which is not required for matching.

## Out of scope (per Phase 7 brief)

No UI, no individualized workout plans, no Monday–Sunday programming, no Premium
Coaching, no What-If Simulator.

## Tests

`npm run intervention-intelligence:sanity` — 19 checks: library integrity, matching,
priority ordering, explanations (educational, not prescriptive), expected direction,
educational-only guidance (never a program), coaching cues, confidence propagation,
level adaptation, graceful empty case, serialization, and architecture integrity.
Phases 1–5 suites remain green.
