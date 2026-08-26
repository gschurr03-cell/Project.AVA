# Auto Follow global-motion integration

## A. Result

PASS for the presentation transform integration. The implementation uses the
existing display-stabilization correction and verified athlete-box trajectory;
it does not alter tracking or any measurement input.

## B. Previous transform architecture

The render tree is `container (overflow hidden) -> stabilization wrapper ->
Auto Follow wrapper -> video + all visual overlays`. Both transform wrappers
use `transform-origin: 0 0` (`origin-top-left`). Auto Follow writes
`translate((0.5 - z*c_x), (0.5 - z*c_y)) scale(z)` to its inner wrapper.
Display stabilization writes `translate(t) rotate(r) scale(s)` to the outer
wrapper. Video, skeleton, contacts, zones, and debug overlays are all children
of the inner wrapper, so they always share both transforms.

## C. Coordinate spaces

- **Source / athlete-track:** normalized decoded-frame coordinates. The
  verified `athleteBoundingBoxSource` lives here.
- **Measurement:** authoritative pose/contact/calibration/zone coordinates;
  untouched by this work.
- **Presentation camera:** source-space crop center `c` and Auto Follow zoom
  `z`, derived only from verified tracker evidence.
- **Stabilized viewport:** the outer correction's normalized similarity space,
  using the source dimensions for rotation and translation.
- **Rendered screen:** the browser result after both wrappers.

## D. Double-follow root cause

For source point `p`, the old final mapping is:

`screen = S(0.5 + z * (p - c))`

where `S` is the outer display-stabilization similarity transform. A naïve
`c = rawCenter - cameraTranslation` assumes `z = 1`, no rotation, and no
stabilization scale. With `z > 1`, it applies the camera movement at the wrong
magnitude; with rotation or scale it applies it in the wrong direction/space.
The outer wrapper then applies `S` again, producing the double-follow/pan.

## E. Implementation

`compensateFollowCenterForStabilization` solves the existing composition. It
first computes the uncorrected requested viewport point, maps that point
through `S^-1`, and solves for `c`. The same compensated anchor is also used
to estimate look-ahead velocity, so micro-shake cannot become false athlete
velocity. `OverlaySurface` pre-resolves both immutable paths: RAW retains the
original camera path; Stabilized View selects the compensated one.

## F. Transform equation

Let `d = 0.5 + z * (p - rawCenter)` be the requested unstabilized viewport
position. The integrated crop center is:

`c = p - (S^-1(d) - 0.5) / z`

Substitution gives `S(0.5 + z * (p - c)) = d`. This is exact for translation,
rotation, and uniform stabilization scale. The final visual scale remains the
intentional CSS composition `S.scale * z`; the integration does not modify
Auto Follow's zoom target or add a second zoom.

## G. Camera-shake behavior

A stationary subject with a synthetic camera translation remains at its
original requested viewport position after composition. The crop center shifts
only by the amount mathematically required to offset the outer correction.

## H. Panning behavior

Large/intentional motion is already passed through by display stabilization,
so its correction is identity and Auto Follow remains exactly on its raw path.
For small same- or opposite-direction corrections, the inverse-composition
solution preserves the requested composition rather than issuing a secondary
pan.

## I. Zoom behavior

Verified tracker box dimensions remain the zoom input. Existing scale
deadband, time constant, and velocity cap remain unchanged. Stabilization
scale stays on the outer transform and is not fed into `targetScale`.

## J. Overlay alignment

PASS. The existing common inner wrapper still contains video and every visual
overlay; the outer wrapper contains that complete result. No overlay receives
a separate compensation transform.

## K. Reacquisition / entry behavior

PASS. The existing verified-only gate, hold/degraded/reacquiring states,
bounded smoothing, and edge clamping are unchanged. The compensated target
flows through that same state machine rather than bypassing it.

## L. Measurement integrity

Confirmed by static isolation check and type-check: no changes to pose,
identity, contacts, step length/frequency, velocity, calibration, timing, or
metric modules. This implementation is confined to presentation-camera,
display-stabilization, and shared visual wrapper code.

## M. Tests

Passed:

- `node scripts/phase-6-5-presentation-camera-sanity.mjs` — 35 checks.
- `npx tsc --noEmit --pretty false`.

The added deterministic cases cover stationary shake, independent athlete
motion, same- and opposite-direction pan, vertical bounce with rotation and
scale, unchanged zoom target, and compensated reacquisition/edge clamping.

## N. Files changed

- `src/lib/video/displayStabilization.ts`: exact inverse-composition helper.
- `src/lib/video/presentationCamera.ts`: compensated target and anticipation;
  optional stabilization-aware path construction.
- `src/components/video/OverlaySurface.tsx`: pre-resolved RAW and Stabilized
  paths, toggle selection, and lightweight transform diagnostics.
- `scripts/phase-6-5-presentation-camera-sanity.mjs`: deterministic coverage.

## O. Remaining Auto Follow issues

No mathematical transform-composition defect remains. This validation does not
replace a human browser review on a newly captured handheld/panning clip; that
is the remaining evidence gap, not an identified product defect.

## P. Next task

Run a short browser capture on one handheld and one intentional-pan source,
export the new `data-presentation-*` and `data-stabilization-*` diagnostics,
and compare final subject-screen residual against RAW Auto Follow.

**Auto Follow presentation reliability:** 100% of this task's deterministic acceptance checks
**Tracking reliability:** unchanged (not remeasured in this presentation-only task)
**Measurement reliability:** unchanged (not remeasured in this presentation-only task)
**Core MVP completion:** unchanged (not remeasured in this presentation-only task)
**Launch readiness:** unchanged (not remeasured in this presentation-only task)
**Overall AVA Performance launch completion:** unchanged (not remeasured in this presentation-only task)
