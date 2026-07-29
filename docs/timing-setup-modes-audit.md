# Timing setup modes audit

Audit date: 2026-07-16

## Findings before implementation

| Component | Exists | Readiness | Decision and debt |
| --- | --- | --- | --- |
| Measurement profile | Yes (`timing_mode`: fly/split/custom) | Working | Preserve. It describes the requested measurement, not how boundaries are defined. |
| Marked gates | Yes | Partial | Preserve gate drawing, immutable versions, world anchors, and local tracker. Selection still requires precise endpoints and has no production line-snap service. |
| Local line tracking | Yes | Partial | Preserve. It already fails closed with locked/limited/lost states. Runtime evidence is not persisted on the session draft. |
| Fixed landmarks | No explicit contract | Missing | Add safe plane-construction types. Reject one-point geometry without an independently defined lane normal. |
| Manual crossings | No | Missing | Add immutable brackets, timestamps, interpolation method, uncertainty, body reference, and experimental-only trust. |
| Technique-only | Implicit | Partial | Analysis can run without gates, but there is no explicit intent or timing-output prohibition. |
| Distance evidence | Distance value only | Partial | Add status, method, uncertainty, evidence, and confirmation date. |
| Analysis snapshots | Yes | Good foundation | Preserve. Capture the new timing setup alongside existing calibration inputs at queue time. |
| History compatibility | Version/FPS exact matching exists | Partial | Extend identity with timing compatibility group; legacy behavior remains isolated. |
| Session UI | Calibration workspace exists | Partial | Add four boundary-setup choices before mode-specific configuration without replacing premium AVA components. |
| Invalid V1 result | Yes | Production-safe | Preserve `invalid_gate_propagation` and every downstream exclusion. |

## Dependencies

- Session draft persistence for the selected setup.
- A versioned runtime-independent schema shared by server actions, snapshots, trust, history,
  and tests.
- Existing gate geometry and local-lock evidence for marked mode.
- Source frame timestamps for manual brackets.
- Independently known distance evidence for fixed-landmark automated timing.

## Technical debt intentionally not rewritten

- The overlay’s endpoint drawing workflow remains the marked-line fallback.
- Automatic image line detection belongs beside the existing OpenCV local tracker; browser
  heuristics must not silently claim a physical line.
- Existing `timing_mode` naming is retained for backwards compatibility.
- Current results are not retroactively reclassified. New compatibility metadata applies to
  new immutable snapshots.

## Implementation plan

1. Add a centralized timing-setup schema, readiness/trust rules, landmark plane safeguards,
   deterministic manual interpolation, and compatibility groups.
2. Persist one JSON setup draft on the session and capture it in every new analysis snapshot.
3. Add four visible setup choices and mode-specific evidence fields to the existing
   calibration workspace.
4. Keep technique analysis available while withholding timing when setup is incomplete,
   limited, lost, unsupported, or technique-only.
5. Add focused sanity coverage and run existing static, panning, FPS-tier, worker, type,
   lint, and build regressions.

## Implemented

- Added `ava-timing-setup-v1` with marked-zone, fixed-landmark, manual-crossing, and
  technique-only variants.
- Added distance evidence, readiness, trust, reason-code, and exact history-compatibility
  rules without changing the existing fly/split/custom measurement profile.
- Added safe landmark construction contracts. Two-point constructions require two distinct
  points; a one-point construction is rejected without explicit lane orientation.
- Added deterministic manual bracket interpolation and conservative single-frame fallback.
  Manual results are always labelled experimental and velocity uses the conservatively
  reported time.
- Added the four choices, mode-specific fields, immutable-save action, and readiness/result
  card to the existing session workflow.
- Added migration 0032 and applied it to the local database. New analysis input snapshots
  capture the setup and analysis rows carry a timing compatibility group.
- Preserved the validated-60 and experimental-30 pipeline implementations and the invalidated
  V1 result.

## Remaining blocker

The marked-zone UI can reuse existing endpoint selection and the production local tracker,
and the shared candidate scorer always requires confirmation. It does not yet have a
browser-to-frame detection endpoint that turns a near-line click into actual OpenCV
candidates and lets the user cycle them. Consequently marked-zone automatic setup is not
end-to-end production-ready, and no real marked fixture passed crossing-local lock in this
pass.

Because the completion rule requires every setup mode, timing setup completion remains
approximately **15%**, physical gate-lock completion remains **70%**, and overall MVP
completion remains **83%**. The implemented foundation is not used to inflate release
readiness.
