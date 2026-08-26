# Phase 6.6D — Part A: Auto Follow Motion Audit

**Status:** PART A COMPLETE — evidence gathering only  
**Date:** 2026-08-07  
**Roadmap:** 29.5% (unchanged)  
**Production behavior changed:** No

## Executive summary

The reported `hold → jump → hold → jump` behavior is reproducible. Its primary cause is the presentation-camera state/dynamics output, followed by immediate per-presented-frame CSS transform application. It is not caused by scientific localization, React rendering, detector refresh cadence, or a sparse presentation clock.

Across deterministic 60 Hz presented-frame replays, Auto Follow produced real zero-motion runs interleaved with 20–30 source-pixel-equivalent median transform steps. Unsupported pose/localization presentation evidence enters `holding`; after the 0.35 s evidence hold it enters `degraded` and returns toward full frame; later support enters `reacquiring`. Those state transitions create the literal holds and restarts. During supported motion, the bounded camera dynamics still produce large frame-to-frame pan steps. Zoom also changes translation because the rendered transform is `translate(0.5 - scale × center) scale(scale)`, so a zoom update can move the picture even when the camera target is unchanged.

The initial 997–1,042 px changes are first acquisition from full frame and are reported separately. They are not included in steady-state jump distributions.

No fix was implemented.

## Inherited architecture

The Phase 6.5 camera is a presentation-only subsystem. It consumes source-normalized pose evidence and cannot feed localization, crop planning, pose inference, contacts, timing, calibration, world transforms, or metrics. The video and every overlay share the same transformed wrapper.

The live update chain is:

```text
requestVideoFrameCallback metadata.mediaTime
  → last pose frame at or before presented media time
  → athletePresentationObservation()
  → stepPresentationCamera()
  → clampFollow()
  → followTransform()
  → shared video/overlay wrapper.style.transform
```

`requestAnimationFrame` provides the paint loop. With rVFC available, rAF reads the latest `metadata.mediaTime`; it does not substitute `video.currentTime`. The camera refuses to advance twice for the same timestamp. Seeking, metadata load, and paused selection request a direct camera selection.

## Instrumentation method

The audit compiles and invokes the live `presentationCamera.ts`, `follow.ts`, overlay types, and pose types. It replays the real Phase 4.2K Vanni pose artifacts at a modeled 60 Hz display clock with Auto Follow ON and uses the same “last pose frame at or before presented time” selection rule as `OverlaySurface`.

Every displayed-frame trace records:

- presented timestamp, selected source frame, and selected pose timestamp;
- source-space athlete anchor and camera target;
- actual camera center, zoom, internal center/scale velocities, state, and provenance;
- rendered translation and its pixel-space velocity, acceleration, and jerk;
- pan-only and zoom-only transform displacement;
- box origin, track state, and update source.

`athleteWorldPosition` is deliberately recorded as `null` with an explanatory reason. The live presentation camera does not consume a scientific world position; claiming one would invent evidence. The source-normalized torso/envelope anchor is the authoritative athlete input to this subsystem.

This is a deterministic artifact replay, not a real-browser subjective playback test.

## Update-source determination

The effective camera update source is the presented-frame media clock:

- Vanni 240: 256/256 modeled display records came from a new rVFC presented-media-time selection.
- Vanni 120: 242/242 came from a new rVFC presented-media-time selection.
- Vanni 60: 232/233 came from a new selection; one rAF repeat correctly produced no state advance.

Camera motion is therefore not driven by React renders, detector refresh events, localization refresh events, or arbitrary rAF count. Pose evidence changes with the selected presented frame, while the camera time step is `metadata.mediaTime`.

React only establishes the effect and stores controls/refs. The running paint loop mutates the shared wrapper transform imperatively. No React reconciliation is required for each camera move.

## Camera statistics

All steady-state displacement values are source-pixel-equivalent at 1920 × 1080. Velocity, acceleration, and jerk are finite differences of the rendered transform at 60 Hz. Startup acquisition is excluded from the table.

| Benchmark | Median jump | p95 jump | Maximum jump | Median velocity | p95 acceleration | p95 jerk |
|---|---:|---:|---:|---:|---:|---:|
| Vanni 240 | 23.23 px | 58.82 px | 87.31 px | 1,394.08 px/s | 51,361.02 px/s² | 3,333,808.67 px/s³ |
| Vanni 120 | 25.51 px | 57.61 px | 75.85 px | 1,530.65 px/s | 56,051.03 px/s² | 3,437,150.93 px/s³ |
| Vanni 60 | 28.77 px | 55.68 px | 67.21 px | 1,726.08 px/s | 57,600.00 px/s² | 3,456,000.00 px/s³ |

The full acceleration and jerk distributions are:

| Benchmark | Acceleration median / p95 / max (px/s²) | Jerk median / p95 / max (px/s³) |
|---|---:|---:|
| Vanni 240 | 2,395.11 / 51,361.02 / 3,607,848.54 | 6,360.52 / 3,333,808.67 / 432,941,824.72 |
| Vanni 120 | 2,605.68 / 56,051.03 / 3,590,611.25 | 6,957.48 / 3,437,150.93 / 430,873,350.52 |
| Vanni 60 | 2,269.58 / 57,600.00 / 3,751,321.32 | 8,118.12 / 3,456,000.00 / 450,158,558.29 |

The extreme derivative maxima immediately follow direct initial acquisition; the jump distributions exclude that acquisition, but finite differences retain its decay impulse. They are useful as a discontinuity diagnostic, not a physical-world acceleration measurement.

### Hold evidence

Using less than 0.25 px as a zero/subpixel hold:

| Benchmark | Hold frames | Longest hold | Transform-update frames | Camera-state counts |
|---|---:|---:|---:|---|
| Vanni 240 | 73 | 42 frames | 179 | 89 degraded, 53 holding, 3 reacquiring, 111 anticipating |
| Vanni 120 | 81 | 48 frames | 156 | 66 degraded, 28 holding, 2 reacquiring, 146 anticipating |
| Vanni 60 | 79 | 45 frames | 149 | 60 degraded, 33 holding, 4 reacquiring, 136 anticipating |

This directly reproduces long holds of approximately 0.70–0.80 seconds, followed by renewed motion.

### Pan and zoom contribution

| Benchmark | Pan-only median / p95 / max | Zoom-only median / p95 / max |
|---|---:|---:|
| Vanni 240 | 10.46 / 34.67 / 79.68 px | 4.16 / 29.88 / 33.01 px |
| Vanni 120 | 14.67 / 37.03 / 75.85 px | 0 / 30.05 / 32.96 px |
| Vanni 60 | 16.00 / 35.12 / 58.33 px | 0 / 30.15 / 33.10 px |

Pan is the dominant supported-motion component. Zoom is nevertheless material: in degraded return periods it contributes about 30–33 px per displayed frame, and 55–66 frames per clip moved at least 20 px despite an unchanged camera target.

## Representative motion plots

The plots show source anchor, target, actual center, per-frame transform displacement, pan/zoom decomposition, camera state, target discontinuity, and jerk:

- [Vanni 240 trajectory](../tmp/phase66d-part-a/vanni240-camera-trajectory.png)
- [Vanni 120 trajectory](../tmp/phase66d-part-a/vanni120-camera-trajectory.png)
- [Vanni 60 trajectory](../tmp/phase66d-part-a/vanni60-camera-trajectory.png)

Machine-readable evidence:

- `tmp/phase66d-part-a/motion-summary.json`
- `tmp/phase66d-part-a/vanni240-camera-trace.json`
- `tmp/phase66d-part-a/vanni120-camera-trace.json`
- `tmp/phase66d-part-a/vanni60-camera-trace.json`

Two consecutive audit runs produced identical SHA-256 hashes for all four JSON outputs. The final hashes are:

- summary: `321b6bc0e5321a2d388417297308b4b4ca34981c7bfc44c2af454fa4be387d87`
- Vanni 240: `eb7c0655ff2b4c06065c4a38dec9d31ba6d77eb92e5c960a61b43a521bac8e84`
- Vanni 120: `4c6f49f654d262678e44c449f7d9714c3a602c299b2532d375dfdab52402bf35`
- Vanni 60: `9e72627a9d9c27c8793bf8de258c19043dcd513118349bb5bb65b6a2145aeff7`

## Root cause

The observed motion has three coupled causes inside the existing presentation-camera behavior:

1. **Explicit evidence-state holds and restarts.** Unsupported presentation evidence first decelerates in `holding`, then returns toward full frame in `degraded`. When verified evidence returns, the camera enters `reacquiring`. These state changes create genuine stationary runs followed by renewed movement.
2. **Large discrete pan steps at the display boundary.** The bounded source-time dynamics operate in normalized source coordinates. At 2.5× zoom, permitted center motion becomes tens of rendered source pixels per 16.7 ms display interval. The wrapper receives each state immediately; there is no separate between-presented-frame display interpolation layer.
3. **Zoom/translation coupling and target discontinuity.** `followTransform` computes translation from both scale and center, so zoom changes move the image even with a fixed target. The velocity-aware target can also change abruptly because its bounded look-ahead is recomputed from frame evidence. These effects raise acceleration and jerk at support/state transitions.

The primary defect category is therefore **presentation camera state/dynamics plus immediate transform application**, not scientific pose-coordinate error and not presentation-clock starvation.

### Causes ruled out as primary

- **React updates:** the transform is written from a ref-driven imperative loop.
- **Detector/localization refresh cadence:** the camera is evaluated for each presented-media-time selection, not only on detector events.
- **rAF cadence as the state clock:** rAF paints, but repeated timestamps do not advance dynamics.
- **Phase 6.1 timestamp mismatch:** rVFC `metadata.mediaTime` remains authoritative.
- **Separate overlay transforms:** video and overlays share one wrapper transform.
- **Scientific localization:** no scientific world-space input or output participates in this camera.

## Recommended Phase 6.6D Part B scope

Part B should remain presentation-only and should evaluate, with before/after versions of this exact trace:

1. continuous, timestamp-preserving display interpolation between authoritative camera states;
2. continuity across `holding → degraded → reacquiring` transitions without weakening presentation evidence eligibility;
3. separation of athlete target-velocity estimation from camera center velocity, with bounded low-jerk target evolution;
4. anchor-preserving zoom composition so scale changes do not create unintended translation impulses;
5. camera limits expressed and validated in rendered pixels per presented second at the active zoom;
6. real-browser Auto Follow playback at 0.25×, 0.5×, and 1×, including pause, scrub, resize, and fullscreen;
7. regression proof that shared video/overlay attachment and every scientific output remain unchanged.

Part B must not alter scientific localization or use presentation output as scientific evidence.

## Validation

- Phase 6.6D trace replay: passed twice with identical output hashes.
- Motion plot generation: passed for Vanni 240, Vanni 120, and Vanni 60.
- Phase 6.5 presentation-camera sanity: 26/26 passed.
- Phase 6.6B Part B presentation-sync sanity: 18/18 passed.
- Production camera, transform, overlay, scientific, worker, and database code changed by this audit: none.

## Agent handoff

### Prior findings independently verified

- The camera is presentation-only and uses a shared video/overlay transform.
- rVFC media time is authoritative where supported.
- Source-time camera behavior remains playback-rate independent in the inherited deterministic test.
- Scientific metric isolation remains intact.

### Findings corrected or disproved

- The jump is not primarily a sparse detector/localization update problem; camera evaluation occurred at essentially every modeled presented display frame.
- The camera target is not the sole source of movement; many ≥20 px transform steps occurred with zero target displacement because camera momentum and zoom/translation coupling continued.
- The full-frame-to-follow ~1,000 px event is startup acquisition and must not be reported as the recurring steady-state maximum.

### Work performed in this phase

- Added the deterministic per-displayed-frame audit harness.
- Added deterministic plot generation.
- Generated three traces, one summary, and three trajectory plots.
- Added this report.

### Not personally validated

- No real-browser Auto Follow ON playback was performed in Part A.
- No subjective visual-quality claim is made from the plots alone.
- No Gav visual trajectory was requested or run.
- No fix, counterfactual production behavior, or Part B design was implemented.

## Git status and closeout

The repository was already substantially dirty with inherited work. This phase added only:

- `scripts/phase-6-6d-part-a-auto-follow-motion-audit.mjs`
- `scripts/phase-6-6d-part-a-motion-plots.py`
- `docs/phase-6-6d-part-a-auto-follow-motion-audit.md`
- generated evidence under `tmp/phase66d-part-a/`

No commit was created. Nothing was pushed. The database was not reset or mutated. Phase 6.6D Part B was not started.
