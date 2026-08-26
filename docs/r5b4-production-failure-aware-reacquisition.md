# R5B.4 — Production Failure-Aware Reacquisition

## A. Result

**PARTIAL.** The minimal production behaviour and automated coverage are
implemented and pass. The local ROI-enabled end-to-end Vanni runner did not
finish within the available execution window, so the production artifact
acceptance criteria are not claimed complete.

## B. Production implementation

`AthleteBoxTracker` now treats a retained optical-flow box with zero inlier
support as an unreliable observation when it follows `tracking` or
`verified`. It preserves the last verified identity/box, marks that frame
`invalid` (therefore no stale pose evidence), records
`trackingUnreliable: true`, and enters existing `reacquiring`.

`wants_detector_frame()` already invokes the unchanged full-frame detector
on every `reacquiring` frame. The existing `AthleteTracker` receives those
candidates unchanged; an accepted candidate produces the existing
`reacquired` origin and `verified` state, after which normal detector
cadence resumes.

## C. Failure signal

Exact condition:

`detector_candidates is None AND state in {tracking, verified} AND optical-flow inlier ratio == 0.0`

This is a non-athlete-specific evidence boundary: zero supporting flow points
cannot justify treating a carried box as an observation. It matches the
authoritative Vanni frame-61 confidence cliff and has zero occurrences in
the persisted Gav baseline.

## D. Vanni regression

R5B.3b established the authoritative target: failure at frame 61, where the
unchanged detector/candidate logic accepts Vanni with score 0.954 when given
the retained frame-60 lock. R5B.4 now makes the box tracker enter
`reacquiring` on that zero-inlier condition, so the next detector decision is
an every-frame full-frame invocation while retaining identity.

The automated transition fixture proves the exact production sequence:

`verified/tracking -> reacquiring (zero inliers, identity retained) -> reacquired/verified (existing accepted candidate)`.

The full source rerun was started with ROI enabled but did not reach JSON
serialization before the execution timeout. Therefore exact post-change Vanni
artifact fields (transition frame, detector-frame count, and pose intervals)
remain to be captured before this report may be upgraded to PASS.

## E. Gav regression

Persisted Gav evidence has 0 confidence-zero frames across 142 frames.
The new branch is dormant on that baseline; the automated healthy-flow test
also confirms zero unreliable transitions. No metric output is changed by
this branch in a healthy run.

## F–G. Identity and pose behaviour

The transition does not mutate `AthleteTracker` identity state or discard its
last verified box. The unreliable frame has `boxOrigin: invalid`, so it does
not create pose/metric evidence. A subsequent existing accepted candidate is
marked `reacquired`; short pose blindness therefore does not imply identity
loss.

## H. Detector cadence and performance

Healthy `tracking` retains its existing cadence. Once `reacquiring`, the
existing code requests detection every frame; once recovered it returns to
normal cadence. The normal path adds one constant-time inlier-ratio branch.
The temporary added detector work is one full-frame invocation per
reacquisition frame; exact Vanni invocation counts require the pending full
artifact rerun.

## I–J. Tests

- `.venv/bin/python scripts/box-tracker-sanity.py` — **ALL PASSED**.
  New checks cover unreliable transition, identity retention, every-frame
  reacquisition cadence, recovery with existing candidate acceptance, and no
  healthy-flow transition.
- `npx tsc --noEmit --pretty false` — passed.
- The R5B.3b locked-state replay remains the direct evidence that the
  unchanged detector/candidate system accepts Vanni from frame 61.

## K. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — production
  zero-inlier unreliable transition and diagnostic counter.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — emits
  additive unreliable-transition diagnostics.
- `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts` and
  `src/lib/biomechanics/pose.ts` — validate those optional diagnostics.
- `scripts/box-tracker-sanity.py` — R5B.4 state/cadence/identity tests.

## L–M. Remaining P0 issue and next recommendation

The only open R5B.4 item is the ROI-enabled end-to-end source artifact
capture. Complete that bounded verification first; then the next highest-value
P0 validation is the same full production run on Gav, comparing its tracking
summary and metrics against the protected baseline.

**Phase:** P0 — Athlete Tracking Reliability  
**Phase completion:** 4.57%  
**Core MVP completion:** unchanged  
**Launch readiness:** unchanged  
**Overall AVA Sprint launch completion:** unchanged
