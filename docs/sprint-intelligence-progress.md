# Sprint Intelligence — Phase 10: Progress Intelligence Engine

AVA evolves from analysing **one** sprint to understanding an athlete's **entire
development journey**. Instead of "how did this sprint look?" it answers "how are you
changing over weeks, months, and seasons?" — surfacing meaningful trends, never
overreacting to a single analysis.

Location: [`src/lib/intelligence/performanceGap/progress/`](../src/lib/intelligence/performanceGap/progress/).
Entry: `buildProgressIntelligence(input)` → `ProgressIntelligence`.

## Core philosophy

Every analysis becomes part of a longitudinal profile. The engine distinguishes
short-term variation, day-to-day noise, meaningful adaptation, regression, and
measurement uncertainty — and keeps **observations** separate from **hypotheses**.

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Athlete History | `history.ts` | Chronological record store + per-metric series extraction. Future metadata/metrics plug in automatically. |
| Trend Analysis | `trends.ts` | A trend per metric: improving / stable / declining / inconsistent / plateaued / rapid improvement / rapid regression, with confidence. |
| Plateau Detection | `plateau.ts` | Flags no-meaningful-change spans, with likely factors **linked** to Root Cause / Dependency / Intervention. |
| Adaptation Assessment | `adaptation.ts` | Technical / physical adaptation vs noise / variability / fatigue / incomplete evidence — observation vs ranked hypotheses. |
| Anomaly Detection | `anomaly.ts` | Robust median/MAD outlier flags — **without assuming injury**. |
| Improvement Attribution | `attribution.ts` | Which metric gains drove a performance change (weighted by improvement × Phase 4 sensitivity), with an honest "other" residual. |
| Forecasting | `forecast.ts` | Short-term trajectory as a **widening range** — never guaranteed. |
| Timeline | `timeline.ts` | Chronological, filterable (competition vs training) metric overlays + annotations. |
| Goal Progress | `goals.ts` | Current vs previous toward goal PB, blueprint, development score, potential, benchmarks, targets. |

Shared statistics (`stats.ts`): OLS regression + R², median, MAD — deterministic, no deps.

## Trend detection

"Better" is metric-aware (lower is better for contact time, symmetry, finish time). Small
changes fall inside a noise band, so AVA never overreacts. Rapid changes require both a
large per-analysis move **and** a clean fit; inconsistent series (moving without a clear
direction) are labelled as such rather than forced into improving/declining.

## Adaptation: observation vs hypothesis

Each assessment states a measured **observation** (e.g. "Peak Velocity changed +4.1% across
6 analyses, fit 0.95, status improving") and then ranked **hypotheses** (technical /
physical adaptation, measurement noise, natural variability, temporary fatigue, incomplete
evidence) — clearly the possibilities, never a diagnosis.

## Anomaly detection

A reading beyond `k × MAD` from the local median is flagged with its expected range and a
severity, always noted as "a prompt to review context — not an assumption of injury."

## Improvement attribution

Contributions are weighted by each metric's own improvement and its Phase 4 downstream
sensitivity, normalized to ~100% with a reserved unattributed "other" share, each with
confidence and direction.

## Forecasting

Linear-trend extrapolation over the next N analyses, each step a range that **widens** with
the horizon and narrows with a cleaner fit. Confidence falls with distance; every forecast
lists its assumptions and states outcomes are never guaranteed.

## Data models

`AthleteHistory`, `AnalysisRecord`, `MetricHistory`, `TrendPoint`, `ProgressTrend`,
`Plateau`, `AdaptationAssessment`, `Anomaly`, `ImprovementContribution` /
`ImprovementAttribution`, `Forecast`, `PerformanceTimeline`, `GoalProgress`.

## Out of scope (per Phase 10 brief)

No unrelated UI redesign, no workout plans, no coach collaboration yet.

## Tests

`npm run progress-intelligence:sanity` — 24 checks: history integrity, trend generation +
detection, plateau detection, adaptation (observation vs hypothesis), anomaly detection (no
injury assumption), improvement attribution (~100% with residual), forecasting (widening +
no guarantee), timeline filtering, goal progress, determinism, serialization, and
architecture stability (reuses Phase 4). Phases 1–9 stay green.
