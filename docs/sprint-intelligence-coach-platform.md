# Sprint Intelligence — Phase 11: Coach Intelligence & Team Platform

Turns AVA from an athlete-analysis app into a coaching platform — organizations, teams,
role-based access, dashboards, alerts, reports, and an audit trail — **while keeping the
coach in control.** Every AI conclusion is explainable, editable, acceptable, and
rejectable. AVA assists coaches; it never replaces them.

Location: [`src/lib/intelligence/performanceGap/coach/`](../src/lib/intelligence/performanceGap/coach/).
Entry: `buildCoachDashboard(input)` plus the individual engines below. Layered over the
prior phases (esp. Phase 10 progress); no measured data is recomputed here.

## Engines

| Area | File | Purpose |
|------|------|---------|
| Access control | `rbac.ts` | Role → permission matrix + **organization isolation**; every denial explains why. |
| Org structure | `organization.ts` | Organizations, teams, training groups, memberships — isolation-safe lookups. |
| Coach review | `review.ts` | Accept / reject / modify / annotate / override, with stored reasoning + audit; the coach's edit is what the athlete sees. |
| Knowledge layer | `preferences.ts` | Org/coach philosophy reshapes **wording + ordering only** — never a number. |
| Athlete cards | `athleteCard.ts` | At-a-glance `AthleteSummary` from prior-phase outputs + status band. |
| Team analytics | `analytics.ts` | Most common limitation, most improved metric, asymmetry/acceleration issues, averages. |
| Alerts | `alerts.ts` | Plateau, regression, asymmetry, quality, confidence-drop, missing-data, repeated-issue — each explains **why**. |
| Dashboard | `dashboard.ts` | Aggregates cards + alerts + analytics + queue + notes + reviews + **team health**. |
| Reports | `report.ts` | Athlete/team/season/progress/meeting/recruiting — sections + chart specs, presentation-free. |
| Collaboration | `collaboration.ts` | Coach/athlete notes, pins, read state, threads (messaging is a future hook). |
| Audit | `audit.ts` | Append-only, org-scoped trail; every recommendation traceable creation → edits. |
| Export | `export.ts` | CSV + PDF-ready portable structure; wearable/timing/recruiting **seams only**. |

## Core philosophy — coach in control

`reviewRecommendation` records the AI's original text immutably and lets the coach
accept/reject/modify/annotate/override with reasoning; `resolveRecommendationText` returns
what the athlete sees (coach text wins; rejected is hidden). Every decision writes an
`AuditEntry`.

## Coach knowledge layer (wording, never data)

`resolvePreferences` merges organization defaults with a coach's overrides;
`applyTerminology` rephrases text with the coach's vocabulary; `reorderByEmphasis` reorders
by metric emphasis. Numeric/measured payloads pass through byte-for-byte unchanged — proven
in the test suite.

## Role-based access + isolation

Roles: owner, head coach, assistant coach, athlete, viewer. `authorize` enforces
permission **and** same-organization **and** athlete-owns-own-data **and** assistant-coach
team scoping — all with explainable reasons. A new role plugs in via the config matrix.

## Alerts always explain why

Each `Alert` carries a `why` string and `evidence[]`, sourced from the Phase 10 progress
output (plateaus, declining/rapid-regression trends, asymmetry), recording-quality history,
confidence deltas, and analysis recency. Anomalies never assume injury.

## Data models

`Organization`, `Team`, `TrainingGroup`, `Coach`, `AthleteMembership`, `CoachReview`,
`CoachPreference`, `TeamDashboard`, `AthleteSummary`, `TeamAnalytics`, `Alert`, `Report`,
`ChartSpec`, `CoachNote`, `AuditEntry`/`AuditLog`, `OrganizationRole`.

## Out of scope (per Phase 11 brief)

No Premium Coaching, no unrelated UI redesign, no external integrations (CSV/PDF/wearable/
timing/recruiting are prepared seams only).

## Tests

`npm run coach-platform:sanity` — 36 checks: RBAC + org isolation, coach review workflows,
knowledge-layer wording-not-data, athlete cards, team analytics, alert engine (explains
why), dashboard + team health, report generation, audit traceability + isolation,
collaboration notes, export (CSV/portable), determinism, serialization, and architecture
stability. Phases 1–10 stay green.
