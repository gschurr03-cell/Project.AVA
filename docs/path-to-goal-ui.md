# Path To Goal Experience (Part B) — UI documentation

The primary coaching experience. It **consumes** the Part A Athlete Intelligence
engines (unchanged) and presents them as a personalized roadmap from the athlete's
current performance to their goal, while staying scientifically honest about
uncertainty.

Route: [`/sessions/[id]/path-to-goal`](../src/app/sessions/[id]/path-to-goal/) (a NEW
route — the existing analysis page is not modified).

## Layers

```
Part A engines (unchanged)      →  AthletePerformanceModel
presentation/ (pure, tested)    →  PathToGoalView + LeftRight + Progress
app/.../path-to-goal (React)    →  PathToGoalExperience + AnalysisProgressExperience
```

- **`src/lib/intelligence/performanceGap/presentation/`** — pure, UI-independent:
  - `pathToGoalView.ts` — `buildPathToGoalView(model, lrMetrics)` → headline, breakdown,
    quantified limiter cards, target rows, recommendation cards.
  - `leftRight.ts` — classified L/R analysis (`normal_variation | moderate_asymmetry |
    performance_limiter | review_recommended`).
  - `progress.ts` — `computeAnalysisProgress()` maps the real worker status → 10 stages
    + percent + estimated remaining.
  - `presentationConfig.ts` — associated muscle groups / technical patterns / drills /
    strength / mobility / sprint work (additive; no engine change).
- **Components** (`src/app/sessions/[id]/path-to-goal/`):
  - `PathToGoalExperience.tsx` (server) — renders the whole roadmap.
  - `AnalysisProgressExperience.tsx` (client) — polls real job status, renders stages.
  - `page.tsx` (server) — loads session/athlete/analysis (RLS), composes goal + metrics,
    runs the engines, renders.

## What the athlete sees (visual hierarchy)

1. **Current → Goal → Remaining Gap** headline (e.g. 10.36 → 10.05 = 0.31).
2. **Performance Breakdown** — each limiter's estimated % contribution to the gap.
3. **Training Priorities** — quantified limiter cards: current, estimated target,
   remaining gap, gap %, priority rank, confidence, contribution %, estimated time gain,
   why it matters, associated patterns + muscle groups, and an **expandable "Why?"**
   with supporting evidence + the associative reasoning tree + suggested interventions.
4. **Required Targets** — every metric: current → estimated requirement → gap, tagged
   with its evidence category.
5. **Left / Right Analysis** — per side, difference, target band, classification, note.
6. **Recommended Interventions** — cards with reason, confidence, per-metric estimated
   effects, **ranged** race-time gain, muscle groups, drills, strength, mobility, sprint
   sessions.

## Scientific honesty in the UI

Every value carries an **evidence badge**: `measured` (green), `estimated` (gold,
with %), `inferred` (grey), `unknown`. Estimates always say "estimated · not
guaranteed"; time gains are ranges. L/R never implies perfect symmetry is optimal — a
small difference is "normal variation", and a large one is "review recommended" (never
a diagnosis). No node says "your X is weak"; nodes say "commonly associated with…".

## Stage-based progress (replaces the spinner)

Ten stages: Uploading Video → Preparing Frames → Detecting Athlete → Tracking Pose →
Detecting Contacts → Calculating Metrics → Running Athlete Intelligence → Building
Path To Goal → Generating Coaching Report → Complete. The active stage comes from the
**real** queue status (which is the fine-grained worker stage); a long-running stage is
labelled "still running…"; time remaining is explicitly an estimate. **Progress is
never faked** — it advances on the real signal only.

## Future-feature seams (declared, not implemented)

The view-model + config are the plug-in points for Motion IQ, AVA Lift, force plates,
Freelap, Brower, wearables, jump/strength testing, weekly trend analysis, season
planning, and the What-If Simulator. Each recommendation card reserves a
`progressTrackingKey` for weekly tracking. No integration code exists yet.

## Wiring note

The Path To Goal page is a standalone route. To honor "do not modify existing analysis
pages", the current session page is unchanged; making Path To Goal the primary entry
(a link/redirect, and replacing the in-page Limiting Factors panel) is a one-line
follow-up left to the team's discretion.

## Tests

`npm run path-to-goal:sanity` (`node scripts/path-to-goal-sanity.mjs`) — 29 checks:
headline, breakdown ordering, quantified limiter cards, target rows, recommendation
cards (muscle groups/drills/ranged gains), L/R classification, the 10-stage progress
model (queued/processing/completed/stalled/failed), determinism, and serialization.
Part A's `npm run performance-gap:sanity` (35 checks) remains green.
