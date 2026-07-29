# Human-confirmed start-gate investigation

Audit date: 2026-07-16  
Fixture: `real-side-pan-fly-001`  
Status: **fixture unsuitable for physical 30 m timing validation**

## Outcome

No physically valid transverse start reference is visible at the intended start crossing.
AVA must therefore fail closed for this fixture. No replacement start gate, trusted start
keyframe, V2 zone, crossing bracket, elapsed time, velocity, PB, or benchmark result was
created.

The existing V1 selection remains `invalid_gate_selection` in the calibration evidence and
its derived performance results remain `invalid_gate_propagation`. This investigation does
not restore or reinterpret that result.

## Audit findings

The original 1280 × 720 source was reviewed broadly over the clip and frame-by-frame over
the expected start neighborhood, frames 95–103. The only nearby candidate paint is a short
white dash aligned with the direction of travel. It is longitudinal lane paint, not a
cross-lane trigger. Its infinite analytical extension would manufacture a timing plane that
the physical mark does not define.

The yellow cones are not valid endpoints or a physical plane. The athlete, shadows,
hurdles, railing, wall seams, and arbitrary image coordinates are also prohibited evidence.
No full transverse stripe, tape line, identifiable hardware-gate plane, or surveyed landmark
pair is visible near the intended crossing.

The later transverse markings visible farther down the track do not repair the missing
start evidence: moving the start to one of them would define a different, unmeasured zone
and would not establish a physically verified 30 m separation.

## Component disposition before coding

| Component | Existing state | Readiness and decision |
| --- | --- | --- |
| V1 start gate | Immutable selected segment exists | Physically invalid; preserve and never reuse |
| Finish gate | Trusted annotations exist at frames 170 and 175 | Spatially promising, but crossing continuity is not yet authorized |
| Local tracker | Independent hybrid local/global tracker exists | Keep; it correctly marks unsafe crossing evidence `limited`/`lost` |
| Keyframe schema | Minimal frame, line, and `selectedByUser` fields exist | Partial; missing confirmation metadata required for a production review workflow |
| Review UI | General gate drawing exists | Partial; no dedicated crossing-near authorization step |
| V2 zone | Does not exist | Correctly not created because there is no valid physical start input |
| Timing result | V1 result is invalidated and excluded | Keep invalid; do not calculate another result |

Dependencies for a production keyframe workflow are a valid visible physical line, immutable
zone-version persistence, review metadata, local-lock evidence, and timing eligibility
enforcement. Building the UI or expanding persistence cannot supply the missing physical
evidence in this fixture.

## Internal implementation plan

1. Identify and manually confirm a permissible transverse physical mark before creating
   any new geometry.
2. Only after that input exists, extend the keyframe contract with timestamp, source
   endpoints, ROI, descriptor, orientation, lane identity, confirmation, confidence, and
   version.
3. Create V2 separately as `pending_physical_validation`, defaulting distance status to
   `user_asserted_30m`.
4. Re-run independent start and finish tracking for at least ten frames on both sides of
   each crossing and apply the published crossing-local thresholds without relaxation.
5. Authorize timing only when both bracketing frames are locked, the signed-side transition
   is unique, and the visible segments and analytical planes agree.

Step 1 failed for this fixture, so steps 2–5 were not executed. This is the required
fail-closed terminal condition, not an incomplete automatic selection.

## Evidence reviewed

- `/tmp/ava-track-map-contact-sheet.jpg`: broad clip survey.
- `/tmp/ava-start-raw-strip.jpg`: unmodified frames 95–103.
- `/tmp/ava-track-frame-096.png`, `/tmp/ava-track-frame-099.png`,
  `/tmp/ava-track-frame-100.png`, and `/tmp/ava-track-frame-104.png`: original-resolution
  crossing-near frames.
- `/tmp/ava-track-mark-map-annotated.jpg`: V1 longitudinal selection, finish marking, and
  later hardware context.
- `/tmp/ava-start-crossing-forensic.jpg`: V1 segment and its invalid analytical extension.
- `/tmp/ava-local-gate-lock-start.jpg` and `/tmp/ava-local-gate-lock-finish.jpg`: existing
  local-lock diagnostics.

There is no honest start-keyframe artifact, V1-versus-V2 comparison, or V2 stability chart
to generate because V2 does not exist.

## Validation status

Start lock statistics remain the last measured diagnostic values only: approximately
3.93 px mean midpoint error, 7.58 px maximum midpoint error, 5.71 px mean endpoint error,
and 1.64° maximum angular error on the available annotations. Frames 95–103 remain
`limited`, with approximately 27.44 px mean and 29.27 px maximum crossing-near correction
jumps. These numbers cannot validate an invalid physical selection.

Finish spatial statistics remain approximately 1.23 px mean and 2.52 px maximum midpoint
error, 1.23 px mean endpoint error, and 0.32° maximum angular error. The finish is not
timing-eligible until its actual crossing bracketing frames are both `locked`.

Physical gate-lock completion remains approximately **70%**. Overall MVP completion remains
**83%**.

## Exact next step

Record a replacement fixture with a clearly visible transverse tape/paint line at the start
and finish, with independently measured separation. Then select each line on a crossing-near
source frame and run the existing local-lock validation before any timing calculation.
