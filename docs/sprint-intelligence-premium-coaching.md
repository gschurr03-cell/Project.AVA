# Sprint Intelligence — Phase 12: AVA Coaching Premium & Adaptive Intelligence

The premium coaching companion — the **one** phase permitted to generate individualized
coaching recommendations. It produces training blocks, sessions, and weekly/monthly plans;
adapts after every analysis; manages load; plans toward goals and competitions; explains at
any depth; and keeps the coach in control. Everything stays explainable, evidence-aware,
coach-reviewable — and it never alters measured biomechanics or guarantees outcomes.

Location: [`src/lib/intelligence/performanceGap/premium/`](../src/lib/intelligence/performanceGap/premium/).
Entry: `buildPremiumCoachingPlan(input)` plus the individual generators. Consumes Phases 1,
3–8, 10, 11.

## Core philosophy — explain everything

Every `PremiumRecommendation` answers **why** (the limiter/root cause), **why now** (phase +
progress), the **expected benefit** (direction + qualitative magnitude, never a guaranteed
number), **confidence**, **evidence**, **alternatives**, and ships with a pending **coach
override**. AVA proposes; the coach disposes.

## Engines

| Area | File | Purpose |
|------|------|---------|
| Recommendations | `recommendation.ts` | Individualized, explainable recs from limiters × the Phase 7 intervention library. |
| Blocks | `blocks.ts` | Training blocks for all 7 phases (GPP → return-to-play), individualized by limiters. |
| Sessions | `sessions.ts` | All 10 session types — exercises, volumes, recoveries, cues, monitoring, evidence. |
| Adaptation | `adaptation.ts` | Auto-decide continue / progress / reduce / change-emphasis / new-intervention / recover / maintain — every change explained. |
| Load | `load.ts` | Cumulative-stress estimate; **never diagnoses, never guarantees injury prevention**. |
| Goals | `goals.ts` | Season/championship/performance/strength/technical goals, continuously aligned. |
| Competition | `competition.ts` | Countdown, taper, technical priorities, warm-up, recovery. |
| Planning | `planning.ts` | Weekly plan (hard/easy distribution) + monthly plan with a deload week. |
| Communication | `communication.ts` | Athlete / coach / summary / detailed explanation depths. |
| Override | `override.ts` | Approve / modify / replace / adjust-priority / lock / reject + audit; AVA learns wording, never data. |

## Auto-adaptation

Driven by the Phase 10 progress picture + the load estimate: very-high load → increase
recovery; rapid regression → reduce volume; decline → increase recovery; **plateau → change
emphasis, escalating to a new intervention** if emphasis was already shifted without progress;
rapid improvement → progress difficulty; improving → continue; else maintain. No unexplained
changes.

## Coach in control

`applyOverride` records every decision to the Phase 11 audit trail; `resolveRecommendation`
shows the coach's edit (rejected = hidden); locked recommendations are protected from
auto-adaptation. `learnOrgPreference` merges learned terminology/emphasis — **language and
ordering only, never a measured value.**

## Load management (guidance only)

Cumulative stress from frequency, recent intensity, regression, and trend, banded low →
very-high, with fatigue indicators and guidance. Every estimate carries the explicit
disclaimer: *coaching guidance only — not a medical assessment; AVA never diagnoses and cannot
guarantee injury prevention.*

## Data models

`TrainingBlock`, `TrainingSession`, `ExerciseRecommendation`, `WeeklyPlan`, `MonthlyPlan`,
`AdaptiveDecision`, `LoadEstimate`, `GoalPlan`, `CompetitionPlan`, `CoachingExplanation`,
`PremiumRecommendation` (+ `CoachOverrideState`, `PremiumCoachingPlan`).

## Premium features supported

Daily/weekly/monthly planning, competition preparation, goal tracking, adaptive coaching,
coach collaboration + override, simulation-ready structure, season reviews via the report
layer (Phase 11). Volumes are always suggestions.

## Tests

`npm run premium-coaching:sanity` — 31 checks: full plan generation, all 7 block types, all
10 session types, adaptation logic (incl. plateau escalation), load (no diagnosis/guarantee),
goal alignment, competition prep, weekly/monthly planning, coach override (approve/modify/
lock/learn), communication depths, determinism, serialization, and architecture (reuses the
prior phases). Phases 1–11 stay green.
