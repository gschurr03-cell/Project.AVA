# R5B.4V — Production Validation Closeout

## A. R5B.4 Result

**PARTIAL.** R5B.4's production transition and deterministic tracker tests
remain passing. This environment cannot complete the native ROI locator pass
through frame 61 before its execution lifecycle terminates, so a real-video
post-change artifact is not available and R5B.4 cannot be closed honestly.

## B. Validation approach

Added an opt-in, pass-1-only validation output to
`mediapipe_pose_runner.py`:

- it executes the exact production decoder, rotation, full-frame detector,
  candidate construction, `AthleteBoxTracker`, and `AthleteTracker` loop;
- after pass 1 finishes, it writes per-frame `BoxTrackFrame` records and the
  real box-tracker summary;
- it skips only the later crop/pose/render work, which is not needed to
  validate R5B.4 localization/cadence behaviour;
- it is inert unless `AVA_TRACKING_VALIDATION_OUTPUT` is set.

`AVA_TRACKING_VALIDATION_ROTATION_DEGREES=180` is also opt-in and supplies
the already-forensically-established source rotation when the constrained
environment lacks usable `ffprobe` discovery. Normal production behaviour is
unchanged.

## C–G. Vanni before/after, transition, recovery, identity, and ROI

**Before:** the authoritative artifact has a frame-61 confidence collapse,
nominal `tracking` state through frame 104, and a stale/frozen ROI.

**Implemented production path:** when a retained flow box has zero inlier
support, R5B.4 records `trackingUnreliable=true`, reason
`zero_optical_flow_inliers`, preserves the verified identity/box, marks the
unreliable observation invalid, and enters `reacquiring`. Existing code then
requests a full-frame detector call every frame and restores the existing
`reacquired`/`verified` path if a candidate is accepted.

The exact real-video transition/recovery frame and latency remain unobserved
in the new production artifact. The independent R5B.3b source replay still
proves that the retained frame-60 identity accepts Vanni at frame 61 with
score 0.954 and no identity switch; the R5B.4 tracker test proves the same
production state/cadence transition around an accepted candidate.

## H. Gav regression

The protected persisted Gav artifact has 0 zero-confidence frames across 142
frames. The new condition is dormant on it. Automated healthy-flow coverage
also reports zero unreliable transitions. A fresh full production Gav
artifact remains part of the pending host-capable validation batch.

## I. Performance

The bottleneck is pass-1 localization, specifically repeated MediaPipe
full-frame/tile locator work—not crop/pose/render: the validation-only mode
does not reach its artifact write before the native process lifecycle ends.
The focused 65-frame run reached 25 pass-1 frames after roughly 14 seconds
and then was terminated by the execution environment before completion.
This is a validation-host limitation, not evidence that R5B.4 creates an
unacceptable production performance regression.

## J. Remaining uncertainty

Only this remains: capture the post-change real Vanni pass-1 artifact through
at least frame 105 and a comparable Gav artifact on a host without the native
execution cutoff. Then compare the recorded state, detector invocation, box
origin, unreliable reason, reacquisition, and identity-switch fields.

## K. P0 next batch

Once the host-capable Vanni/Gav closeout runs, immediately available clips
include Vanni 60/120/240 (`tmp/phase50e/sources`) and the stationary Gav
reference. Existing panning fixtures under `validation/fixtures/panning`
provide the smallest next camera-motion control; run that four-clip batch
before opening a new long single-video investigation.

## L. Files changed

- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — opt-in
  tracker-validation artifact output and validation-only rotation override.
- `docs/r5b4v-production-validation-closeout.md` — this closeout report.

## M. Commands/tests

- `.venv/bin/python -m py_compile src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — passed.
- `.venv/bin/python scripts/box-tracker-sanity.py` — all passed (R5B.4
  transition, cadence, identity retention, recovery, healthy path).
- `npx tsc --noEmit --pretty false` — passed.
- Focused ROI production tracker run, frames 0–64, with validation-only
  output and 180° source orientation — started correctly but terminated by
  the native execution environment before artifact serialization.

**Phase:** P0 — Athlete Tracking Reliability  
**Phase completion:** 4.57%  
**Core MVP completion:** unchanged  
**Launch readiness:** unchanged  
**Overall AVA Sprint launch completion:** unchanged
