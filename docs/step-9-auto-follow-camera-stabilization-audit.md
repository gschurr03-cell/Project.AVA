# Step 9 — Auto Follow / camera stabilization audit

## Outcome

Implemented the isolated, low-risk improvement: a verified persistent athlete
box is now the primary Auto Follow anchor and zoom envelope. This is strictly
presentation-only. Pose landmarks remain the backward-compatible fallback for
legacy artifacts without a tracker box. Predicted, invalid, frozen-suspect,
lost, and terminated tracking evidence remains unable to drive the camera.

## A. Current inputs

`athletePresentationObservation` in `src/lib/video/presentationCamera.ts`
produces the target. Before this change it used only visible pose landmarks:
the torso midpoint for center and the full landmark envelope for zoom. This
made a temporarily missing joint, limb extension, or detector jitter a direct
presentation command.

The presentation state machine then applies source-time bounded target and
camera velocity/acceleration, horizontal anticipation, vertical and scale
deadbands, zoom rate limiting, a short uncertainty hold, a smooth return, and
explicit reacquisition state. `OverlaySurface` resolves the complete path once
per source frame and interpolates it at the displayed media time.

## B. Subject anchor

`OverlayFrame` now carries the canonical `athleteBoundingBoxSource` from the
validated pose artifact. On `detected`, `tracked`, or `reacquired` evidence,
Auto Follow uses its source-normalized center and full box extent. This is the
same persistent identity trajectory produced by the tracker; presentation does
not rediscover a subject from pixels or pose landmarks.

## C–D. Existing global-motion evidence

AVA already has frame-level global background motion: the validated
`cameraPath.frameToGlobalMatrix` supplied to `displayStabilization.ts`. Its
upstream transform estimation is background/world-lock oriented, while the
athlete tracker owns a separate foreground box. The browser uses this existing
path only; it does not add a client-side optical-flow dependency.

`OverlaySurface` constructs a deterministic display-stabilization path from
that camera path and applies its correction on a wrapper outside the Auto
Follow wrapper. It intentionally fast-tracks substantial deliberate motion and
smooths only small shake/drift.

## E. Compensation status

The displayed video is already globally stabilized, but the Auto Follow target
is still represented in raw source coordinates. Folding the compensation into
that target is not a one-line subtraction: the current CSS composition is
`stabilizationCorrection(followTransform(source))`, and the needed target
offset depends on the current follow zoom plus the correction's rotation and
scale. Applying camera-path translation directly to the target would double
correct under pan/zoom or break the established overlay alignment contract.

Therefore this audit deliberately does **not** introduce an unvalidated
second compensation path. The safe improvement above removes the direct
landmark-driven jitter source while retaining the existing display correction.

## F–I. Camera behavior

- Center: bounded source-time smoothing; horizontal follow is faster than
  vertical, and velocity/acceleration are capped.
- Lead: filtered horizontal target velocity provides bounded look-ahead.
- Zoom: stable tracker envelope, scale deadband, slow zoom time constant, and
  maximum scale velocity prevent frame-to-frame pulse.
- Loss/reacquisition: unsupported evidence holds briefly, then degrades toward
  full frame; a reacquired target is blended through the same bounded state
  machine rather than snapped.
- Entry: the first verified observation initializes directly; partial or
  prediction-only evidence cannot initialize a target.

## J. Acceptance evidence

`node scripts/phase-6-5-presentation-camera-sanity.mjs` passed 28 checks,
including the new verified-box-primary and unverified-box-withheld assertions,
containment, bounded zoom, vertical-bounce damping, reacquisition, scrub, and
measurement-isolation checks. `npx tsc --noEmit --pretty false` also passed.

The focused regression uses representative benchmark artifacts and reports
full containment rates of 98.0–100% on its eligible frames; vertical camera
movement is reduced by 88.8–100% versus the observation trajectory.

## K. Diagnostics

The existing `scripts/phase-9-3a-final-trace-analysis.mjs` is the closest
production-composition diagnostic: it samples the real resolved presentation
path and display-stabilization correction together, at measured display
cadence, and records final screen anchor and zoom. The Auto Follow state itself
exposes raw target center/scale, filtered target center/scale, final center,
velocity, state, and provenance. The new `verified_tracking_box` provenance
makes the anchor source explicit.

An implementation-ready expanded CSV should join, per source frame: tracker
box center/size, raw `frameToGlobalMatrix`, stabilization correction,
compensated center, and resolved camera center/scale. It must use the exact
CSS-composed transform rather than subtracting translations.

## L. Smallest remaining task

Add a pure presentation-only `compensatedPresentationTarget` helper that takes
the already-resolved display stabilization correction and the current follow
scale, solves the inverse composed transform for the desired viewport center,
and feeds that target into `buildPresentationCameraPath`. Validate it against
the existing full-composition trace with (1) synthetic translation/rotation
pan, (2) a real panning clip, and (3) the no-camera-path fallback. Keep it out
of pose, tracker, measurements, contacts, calibration, and timing modules.
