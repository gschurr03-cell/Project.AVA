# Coach Report audit

Audit date: 2026-07-17

## Finding

AVA already has five versioned evidence layers: the explainable analysis result,
Observation Engine, Interpretation Engine, Recommendation Engine, and Priority Engine.
They are the only permitted sources for a Coach Report. The report layer must not
recalculate biomechanics or rank a second set of priorities.

The session page previously composed the four intelligence layers only for the current
working analysis. There was no dedicated report contract, report route, print layout, or
immutable saved report snapshot. Saved versions correctly withheld regenerated
interpretations, recommendations, and priorities.

## Dependencies and debt

- Working reports depend on a valid `ava-explainability-v1` result payload and all four
  enabled intelligence engines.
- The current persisted result does not include immutable snapshots of observations,
  interpretations, recommendations, priorities, or reports.
- Athlete training age, competition level, pain status, session phase, goals, compatible
  baselines, and persistence signals are not available through the current report query.
  They remain unknown and cannot increase confidence or specificity.
- Recording-quality and asymmetry values derived live in the video page are not
  persisted in the result contract. The report does not recreate them.
- Browser print is available. Server PDF generation, public links, email delivery, and
  share tokens remain intentionally disabled.

## Decision

Use a deterministic composition layer and a dedicated RLS-scoped route. Regenerate only
working reports. A saved analysis without a stored immutable report snapshot fails closed
with an explanatory state. This preserves existing architecture and historical integrity.

## Completed vertical slice

- Added a strongly typed, versioned Coach Report contract, composer, language guard,
  lifecycle resolver, and composition trace.
- Added athlete and coach projections at `/sessions/[id]/report`, guarded by existing
  authentication and RLS ownership.
- Added explicit processing, failed, invalid-contract, no-analysis, and legacy saved
  snapshot states.
- Added the session entry point, audience switch, print/save-PDF control, responsive
  report surface, semantic structure, focus styling, and print CSS.
- Added six report feature flags. Shareable reports remain off.
- Added deterministic contract, composition, linking, unavailable-data, language,
  persistence, and cross-analysis checks plus authenticated browser coverage.

## Still open

- Persist immutable upstream intelligence and report snapshots when a working analysis is
  saved. Until then, legacy/current saved reports remain unavailable by design.
- Add a seeded valid explainable result fixture to exercise the complete rendered report
  in browser E2E; current browser coverage verifies auth, RLS, and fail-closed behavior,
  while the full composition is covered by the deterministic engine sanity suite.
- Add reviewed server-side PDF generation and revocable sharing only after the required
  privacy and access-control contracts exist.
