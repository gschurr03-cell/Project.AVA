# Phase 6.5 — Stabilized Athlete Auto-Follow and Presentation Camera

**Date:** 2026-08-07  
**Status:** **CLOSED** (unweighted presentation phase)  
**Roadmap:** 29.5% (unchanged)  
**Phase 6.2:** remains IN PROGRESS solely for browser-playback validation

## 1. Executive summary

AVA now has an explicit presentation camera that is separate from scientific
localization and the MediaPipe crop. It uses verified pose/localization provenance
read-only, advances exclusively by source timestamps, follows a stable torso
anchor with bounded direction-aware anticipation, suppresses vertical stride
bounce, bounds zoom motion, and handles uncertainty/reacquisition explicitly.

One shared CSS transform is applied after source/world geometry is resolved to the
wrapper containing the video, Canvas2D overlay, and DOM overlay slots. Gates,
zones, skeleton, contacts, step numbers, and future shared-wrapper layers therefore
remain aligned without individual offsets. Auto Follow remains default OFF and
turning it off restores the identity/full-frame view immediately.

No localization, crop planning, MediaPipe input, pose, contact, timing, metric,
calibration, scientific gate, camera-path, or world-transform code changed.

## 2. Roadmap status

Phases 6.1, 6.3, and 6.4 remain CLOSED. Phase 6.2 remains IN PROGRESS solely
because the installed browsers cannot validate playback of the benchmark `.mov`
files. Phase 6.5 is unweighted and receives no invented credit. Completion remains
**29.5%**.

## 3. Existing auto-follow audit

| Element | Prior implementation | Input/space | Dynamics | Scientific effect |
|---|---|---|---|---|
| target | `computeFollowTarget` | source-normalized pose | torso center; envelope fallback | none |
| anticipation | `anticipateFollowTarget` | target at current and `currentTime+0.1s` | fixed blend | none |
| pan/zoom | `smoothFollowStable` | normalized source | alpha per animation frame | none |
| render | `followTransform` | normalized source → CSS transform | shared wrapper | none |
| pointer inverse | `OverlaySurface` hit testing | transformed DOM rect → source | exact inverse geometry | none |
| developer crop | `VideoOverlay` | persisted `athleteTrack.cropBox` | diagnostic only | none |
| scientific crop | worker crop planner | box provenance/source pixels | segment-aware adaptive crop | MediaPipe only; untouched |

The shared wrapper was sound: video and overlays could not detach geometrically.
The defects were temporal/state-related. Per-rAF alpha made smoothing wall-frame
dependent; the fixed future sample had no explicit velocity bound; invalid pose
coasted indefinitely; reacquisition had no state; and detector corrections could
change the target without a bounded transition. The torso anchor and shared
wrapper were retained. `box_tracker.py`, `athlete_tracker.py`, and the scientific
crop planner were inspected but not modified.

## 4. Presentation-camera contract

`PresentationCameraState` contains enabled status; current/target source centers;
current/target scale; x/y and scale velocity; presentation state; source frame;
source timestamp; last supported timestamp; provenance; fallback reason; and the
current athlete envelope. States are `full_frame`, `following`, `anticipating`,
`holding`, `reacquiring`, `degraded`, and `returning_to_full_frame`.

All geometry remains normalized source-video geometry until `followTransform`
creates the final CSS transform. `PresentationViewport` exposes crop, scale,
translation, `sourceToViewportPoint`, `sourceToViewportRect`, and
`sourceToViewportPath`. Scientific modules do not import it.

## 5. Framing target

The primary anchor is the midpoint between shoulder-midpoint and hip-midpoint.
It is materially less sensitive than the full envelope to knee lift, foot strike,
and arm swing. The verified visible-landmark envelope sizes the viewport and
proves head/foot containment. When torso landmarks are unavailable but at least
four supported landmarks remain, the envelope center is the explicit fallback.

Predicted, invalid, frozen-suspect, lost, and terminated frames cannot create a
new target. This uses scientific provenance as read-only evidence; it does not
reinterpret or rewrite that provenance.

## 6. Horizontal follow model

Anchor velocity is estimated from source-time differences and exponentially
conditioned with a 0.16 s time constant. Target center is anchor x plus a bounded
0.16 s lead, capped at 0.075 normalized source width. Camera motion uses a
source-time bounded response: 0.11 s horizontal time constant, maximum center
velocity 1.8 source-widths/s, maximum acceleration 12 source-widths/s², and a
0.012 normalized deadband. Constants are shared across athletes and FPS.

Real horizontal residuals below are absolute source-width fractions, not pixels.

## 7. Vertical stabilization

The torso anchor replaces pelvis/limb envelope centering. A 0.045 normalized
vertical deadband suppresses stride oscillation and a 0.65 s source-time response
limits remaining movement. Real simulations reduce aggregate vertical camera
movement relative to torso movement by 72.9% on Vanni 240 and 100% on the other
three artifacts. This is presentation damping only, not landmark smoothing.

## 8. Zoom model

Scale fits the verified full landmark envelope with 42% horizontal and 28%
vertical per-side margins, preserving the source aspect ratio. Scale is clamped
to 1–2.5, uses a 0.06 hysteresis band, a 0.5 s source-time response, and maximum
scale velocity 1.2/s. Unsupported evidence cannot tighten the crop; degraded and
exit states move toward scale 1. The reported 1.5 full-run scale range includes
intentional full-frame degraded/start regions and the 2.5 supported cap.

## 9. Forward-look behavior

Positive velocity moves the viewport center ahead of a left-to-right athlete;
negative velocity does the reverse. The resulting athlete position is biased
behind viewport center, leaving space in the travel direction. Lead is continuous,
athlete-independent, direction-aware, and bounded to 7.5% of source width. Slow
movement produces negligible lead.

## 10. World-overlay transform integration

The pipeline is:

```text
source video + resolved scientific/world geometry
  → Phase 6.1 presented-frame mediaTime
  → Phase 6.2 stabilized display world scene
  → Phase 6.3 ordered visualization layers
  → Phase 6.5 one shared wrapper transform
  → clipped presentation viewport
```

Video, canvas, and overlay slots are children of the same transform target. No
gate, zone, pose, contact, or step renderer receives a private follow offset.
Point/path/rect tests prove identical source geometry receives identical viewport
mapping.

## 11. Gap/lost behavior

Unsupported localization cannot be chased. For up to 0.35 source seconds the
camera enters `holding`, gently decelerating prior presentation velocity without
using the bad box. Longer unsupported spans enter `degraded` and move toward the
identity viewport with bounded dynamics. `terminated` explicitly enters
`returning_to_full_frame` with fallback `athlete_exited_frame`.

## 12. Reacquisition behavior

A supported observation after holding/degraded, or a `reacquired` origin, enters
`reacquiring`. Center motion retains the same velocity/acceleration limits and
zoom retains its scale-velocity limit; there is no snap/pop during playback.
Direct paused/seeked selection is the sole intentional snap exception.

## 13. Toggle behavior

Auto Follow remains one accessible `aria-pressed` button and defaults OFF. The
toggle changes only presentation state. OFF returns the wrapper immediately to
identity/full frame. It does not play, pause, seek, change `currentTime`, restart
analysis, or mutate overlay/scientific state.

## 14. Source-start playback behavior

The video element is still created at its browser-default source time zero. No
mount or Auto Follow path assigns `currentTime`, seeks to first pose/contact/gate,
or starts playback. Existing imperative seek methods run only on user/evidence
actions. Auto Follow can frame evidence at the presented time but cannot move it.

## 15. Scrub/pause behavior

`seeking` and `loadedmetadata` mark the next camera update as a direct selection.
Paused playback also uses direct selection. The camera therefore represents the
chosen presented frame immediately instead of easing through skipped frames.
Phase 6.1 `requestVideoFrameCallback().metadata.mediaTime` remains authoritative.

## 16. Slow-motion behavior

Every response alpha, velocity, acceleration, hold duration, and prediction
horizon is calculated from source timestamp deltas. The same source-frame
trajectory is therefore identical at 0.25×, 0.5×, and 1×; rAF frequency and
wall-clock playback rate are absent from camera dynamics.

## 17. Files changed

- `src/lib/video/presentationCamera.ts` — new presentation-only state machine,
  target, source-time dynamics, viewport primitive, and provenance contract.
- `src/components/video/OverlaySurface.tsx` — presented media clock, state-machine
  integration, shared wrapper transform, direct seek/pause reset, and toggle reset.
- `scripts/phase-6-5-presentation-camera-sanity.mjs` — 26 deterministic tests and
  four real-artifact simulations.
- `tmp/phase65/simulation-summary.json` — generated deterministic evidence.
- `package.json`, this report, and roadmap.

No localization, tracker, crop planner, worker, scientific, or renderer geometry
file changed in Phase 6.5.

### Agent-handoff provenance

- **Inherited:** Phase 6.1 clock, Phase 6.2 world stabilization, Phase 6.3 layers,
  Phase 6.4 controls, the old follow wrapper/torso target, and scientific artifacts.
- **Independently verified:** old follow dynamics, shared-transform correctness,
  provenance boundaries, four simulation traces, and four scientific replays.
- **Corrected:** rAF-count smoothing, indefinite coast, implicit reacquisition, and
  unbounded fixed-sample anticipation in the presentation camera only.
- **Changed personally:** only files listed above.
- **Not personally validated:** interactive real-browser benchmark playback.

## 18. Database changes

None. Four existing calibration records were queried read-only for scientific
replay. No database row, storage object, artifact, migration, or schema was
mutated.

## 19. Deterministic tests

- Phase 6.5 presentation camera: **26/26 passed**.
- Phase 6.4 overlay controls: **20/20 passed**.
- Phase 6.3 visualization: **16/16 passed**.
- Phase 6.2 world lock: **23/23 passed**.
- Phase 6.1 fidelity: **13/13 passed**.
- timing verification and analysis-report sanity: passed.
- actual typecheck, lint, and optimized production build: passed.

The suite covers OFF/ON, isolation, direction, bounded lead/dynamics, vertical
bounce, containment, zoom hysteresis, uncertainty, reacquisition, exit, scrub,
pause, playback-rate invariance, shared overlay alignment, mediaTime, and metric
isolation. Worker changes were not required; its known standalone alias limitation
was not addressed.

## 20. Gav validation

- frames / eligible: 142 / 135;
- anticipating/following: 134; reacquiring: 1; holding: 0; degraded/lost: 7;
- athlete/head/foot containment: 100% / 100% / 100%;
- horizontal residual p50/p95/max: 0.00778 / 0.11555 / 0.15984;
- vertical movement p50/p95/max: 0 / 0 / 0; bounce reduction: 100%;
- scale range/variation: 1–2.5 / 1.5;
- maximum camera velocity/acceleration: 1.8/s / 12/s².

## 21. Vanni 240 validation

- frames / eligible: 1,020 / 454;
- anticipating/following: 450; reacquiring: 4; holding: 243; degraded/lost: 323;
- athlete/head/foot containment: 98.238% / 99.780% / 100%;
- horizontal residual p50/p95/max: 0.01401 / 0.17192 / 0.32071;
- vertical movement p50/p95/max: 0.000055 / 0.000296 / 0.061019;
  bounce reduction: 72.920%;
- scale range/variation: 1–2.5 / 1.5;
- maximum camera velocity/acceleration: 1.800001/s / 12.000001/s².

The large unsupported count is honest pose/localization availability, not camera
failure. The camera holds briefly, then degrades instead of pretending to follow.

## 22. Vanni 120 validation

- frames / eligible: 483 / 293;
- anticipating/following: 291; reacquiring: 2; holding: 56; degraded/lost: 134;
- athlete/head/foot containment: 98.976% / 99.659% / 100%;
- horizontal residual p50/p95/max: 0.01082 / 0.15102 / 0.20381;
- vertical movement p50/p95/max: 0 / 0 / 0; bounce reduction: 100%;
- scale range/variation: 1–2.5 / 1.5;
- maximum camera velocity/acceleration: 1.8/s / 12.000001/s².

## 23. Vanni 60 validation

- frames / eligible: 233 / 139;
- anticipating/following: 135; reacquiring: 4; holding: 32; degraded/lost: 62;
- athlete/head/foot containment: 99.281% / 100% / 99.820%;
- horizontal residual p50/p95/max: 0.00854 / 0.15705 / 0.19234;
- vertical movement p50/p95/max: 0 / 0 / 0; bounce reduction: 100%;
- scale range/variation: 1–2.5 / 1.5;
- maximum camera velocity/acceleration: 1.8/s / 12.000001/s².

## 24. Scientific replay verification

The real, unmodified production measurement path was replayed read-only:

| Benchmark | contacts | zone time | combined step frequency | result |
|---|---:|---:|---:|---|
| Gav | 9 | 1.92 s | 4.848484848484849 Hz | byte-identical |
| Vanni 240 | 7 | 2.12 s | 3.103448275862069 Hz | byte-identical |
| Vanni 120 | 8 | 2.19 s | 3.6206896551724137 Hz | byte-identical |
| Vanni 60 | 10 | 2.40 s | 4.385953327434329 Hz | byte-identical |

GCT, flight, peak velocity, and zone-step sequences also remain unchanged.

## 25. Phase 6.5 acceptance table

| Criterion | Result |
|---|---|
| existing behavior audited | Pass |
| presentation/science separation | Pass |
| one authoritative transform | Pass |
| velocity/source-time horizontal follow | Pass |
| direction-aware forward look | Pass |
| vertical bounce reduced | Pass |
| zoom stable and bounded | Pass |
| all overlays aligned | Pass |
| uncertainty/reacquisition/long loss bounded | Pass |
| exit behavior honest | Pass |
| toggle independent | Pass |
| source-start preserved | Pass |
| scrub/pause direct selection | Pass |
| slow-motion source-time consistent | Pass |
| four real simulations | Pass |
| scientific metrics unchanged | Pass |
| deterministic/regression tests | Pass |
| roadmap honest | Pass |

## 26. Roadmap progress

Phase 6.5 is **CLOSED** as an unweighted presentation phase. No credit is invented;
weighted completion remains **29.5%**. Phase 6.2 remains IN PROGRESS solely for
its browser-playback blocker. Closed phases remain closed.

## 27. Remaining limitations

- Actual 0.25×/0.5×/1× browser playback, fullscreen, resize, and subjective
  camera-quality review remain unclaimed because of Phase 6.2's codec blocker.
- Containment applies only where source evidence supports an athlete observation;
  unsupported spans intentionally degrade toward full frame.
- The CSS shared-wrapper implementation assumes future overlays remain children
  of that wrapper or explicitly consume `PresentationViewport`.
- Partial-affine world-lock limitations remain those documented in Phase 6.2.
- The pre-existing worker standalone TypeScript path-alias issue remains unrelated;
  full project compilation passes and no worker code changed.

## 28. Git status

No commit, push, or database reset was performed. The worktree was already
substantially dirty; unrelated changes were preserved.

## 29. Exact recommended Phase 6.6 scope

First close Phase 6.2 using its test-only browser-compatible media plan. Then use
real authenticated playback to subjectively adjudicate the Phase 6.5 camera at
0.25×/0.5×/1×, pause, scrub, resize, and fullscreen without changing scientific
algorithms. Only evidence from that review should justify presentation-constant
adjustments; do not create athlete- or FPS-specific tuning.

## 30. Closure conclusions

1. Phase 6.5 is **CLOSED**.
2. Phase 6.5 remains an unweighted presentation phase. Overall weighted roadmap
   completion remains **29.5%**.
3. Phase 6.2 remains **IN PROGRESS** solely because browser playback validation
   has not yet been completed.
4. The presentation camera is permanently documented as a presentation-only
   subsystem. Its inputs may consume scientific localization, but its outputs
   must never feed back into localization, pose inference, crop planning, contact
   detection, timing, calibration, world transforms, or metrics.
5. Auto Follow remains default **OFF** until future browser validation confirms
   production behavior.
6. The validated implementation remains: source-time camera, velocity-aware
   follow, bounded forward look, stable torso framing, vertical stride-bounce
   suppression, bounded zoom hysteresis, hold/reacquisition/exit states, and one
   shared presentation transform.
7. Supported-frame containment remains Athlete **98.24–100%**, Head
   **99.66–100%**, and Feet **99.82–100%**. Vertical bounce reduction remains
   **72.9–100%**.
8. All scientific measurement replays remained byte-identical.
9. Phase 6.5 made no scientific pipeline, localization, crop planner, worker, or
   database changes.
