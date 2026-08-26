# Phase 6.1 — Overlay Fidelity and Skeleton Attachment

**Date:** 2026-08-07  
**Status:** **CLOSED**  
**Roadmap completion:** 29.5% (unchanged; this investigation has no assigned weight)

## Executive summary

The pose-to-display coordinate chain is exact, stateless, subpixel-preserving,
letterbox-aware, and Retina-aware. It contributes **0 px** of mathematical
attachment error for every audited joint. AVA does not smooth pose landmarks in
the UI. Auto-follow smoothing cannot detach the skeleton because its one CSS
transform wraps both the video and canvas.

The real renderer defect was clock ownership. `VideoOverlay` selected a pose from
`video.currentTime` inside `requestAnimationFrame`. The animation callback is a
browser paint clock, not evidence of which decoded video frame was submitted for
composition. Around a video-frame boundary it can therefore select the adjacent
pose while the previous picture remains visible. One frame is visually large on
fast limbs: the real benchmark artifacts show adjacent-frame ankle displacement
maxima of 75.8–109.2 source pixels (95.6 px on Gav).

The renderer now uses `requestVideoFrameCallback` and its `metadata.mediaTime`,
with the old animation-frame path retained only as a compatibility fallback.
No pose, localization, contact, timing, measurement, metric, or gate-calibration
code changed.

## Closure conclusions

Phase 6.1 closes with the following exact conclusions:

1. The root cause was a **presentation-clock mismatch**, not pose-coordinate error.
2. Source-to-canvas projection was verified at **average 0 px, p95 0 px,
   maximum 0 px**.
3. AVA has no landmark-smoothing stage that was causing the lag.
4. Retina scaling, CSS transforms, subpixel drawing, React rendering, and canvas
   coordinate mapping were ruled out as primary causes.
5. The real visual-lag mechanism was that pose lookup could use a time from
   `video.currentTime` that did not correspond to the decoded frame currently
   presented.
6. The renderer now uses
   `requestVideoFrameCallback().metadata.mediaTime` as the authoritative
   presented-frame clock where supported.
7. Animation-frame rendering remains available for responsive painting/resizing
   and as the compatibility fallback.
8. Scientific calculations were not modified.
9. Production measurement replays remain unchanged: Gav
   **4.848484848484849 Hz**, Vanni 240 **3.103448275862069 Hz**, Vanni 120
   **3.6206896551724137 Hz**, and Vanni 60 **4.385953327434329 Hz**.
10. Phase 6.1 is **CLOSED**. Roadmap completion remains **29.5%** because Phase
    6.1 has no assigned weighted contribution.
11. Phase 6.2 was not begun.

## Inherited architecture

This phase inherited and preserved:

1. MediaPipe outputs crop-remapped, normalized full-source landmarks.
2. `loadOverlayFrames.ts` validates the immutable pose artifact and maps its
   canonical keypoints into `OverlayFrame` records without temporal filtering.
3. `coordinates.ts` provides the shared source/display projection for rendering
   and hit-testing.
4. `VideoOverlay.tsx` owns canvas rendering, the scientific provenance display
   gate, half-native-frame stale rejection, letterbox geometry, DPR backing-store
   scaling, and the common video/canvas auto-follow wrapper.
5. Phase 4.2 and Phase 5.0E are closed and were not reopened.

## Pipeline audit

```text
MediaPipe pose (worker, before playback)
  → crop-normalized landmarks
  → source-normalized landmarks (worker crop remap)
  → OverlayFrame landmarks (server load, values unchanged)
  → presented media timestamp → deterministic nearest OverlayFrame
  → source-normalized × displayed-picture dimensions
  → CSS-pixel canvas coordinates
  → DPR context transform → Canvas2D render
  → shared CSS follow transform on video + canvas
```

There is no React state update in the per-frame skeleton draw path. React owns
controls and effects; Canvas2D receives the selected frame directly. CSS does not
transform the canvas independently from the video.

## Latency measurements

The live playback stages and their measured or structural cost are:

| Stage | Result |
|---|---:|
| Pose inference → normalized landmarks | Offline worker stage; 0 ms added during playback |
| Normalized → source-space | Performed before persistence; 0 ms added during playback |
| Artifact → `OverlayFrame` | Server load/cache before playback; 0 ms per displayed frame |
| Presented timestamp → frame selection | **0.067 µs/call**, 200,000-call Node 22 microbenchmark, worst artifact size 1,020 frames |
| Source/overlay → CSS canvas coordinate | **0.081 µs/joint**, 200,000-call benchmark |
| CSS coordinate → device-pixel backing store | One `ctx.setTransform(dpr,…)`; coordinates remain CSS-space, no rounding |
| Scheduling before fix | Independent rAF clock; adjacent-frame mismatch was possible |
| Scheduling after fix | Browser presented-frame callback; uses `metadata.mediaTime` from the submitted video frame |
| Canvas raster/compositor | Not isolated with a production-browser GPU trace in this phase; no numerical latency claim |

The microbenchmarks measure the real pure production functions. They are not
presented as end-to-end browser paint latency. A browser/GPU trace remains the
one unmeasured stage.

## Pixel-error measurements

“Overlay error” here means the difference between a persisted source-space joint
and where that same joint is painted after the complete coordinate chain. It does
**not** claim anatomical ground truth: the recordings have no independently
annotated ankle/knee/hip/shoulder/wrist/elbow coordinates.

For Gav, Vanni 240, Vanni 120, and Vanni 60, every available left/right joint in
all six categories produced the same result:

| Joint category | Average | 95th percentile | Maximum |
|---|---:|---:|---:|
| Ankle | 0.000 px | 0.000 px | 0.000 px |
| Knee | 0.000 px | 0.000 px | 0.000 px |
| Hip | 0.000 px | 0.000 px | 0.000 px |
| Shoulder | 0.000 px | 0.000 px | 0.000 px |
| Wrist | 0.000 px | 0.000 px | 0.000 px |
| Elbow | 0.000 px | 0.000 px | 0.000 px |

This exact zero follows from the audited transform: `xCanvas = xSourceNormalized
× pictureWidth`, `yCanvas = ySourceNormalized × pictureHeight`; no coordinate is
rounded. Deterministic tests exercise fractional picture dimensions repeatedly.

### Temporal detachment exposed by one adjacent-frame mismatch

The following is not anatomical model error. It is the source-pixel displacement
between the same joint in consecutive eligible real pose frames—the visible error
the old independent clock could expose when it selected the adjacent pose:

| Benchmark | Ankle avg / p95 / max | Knee | Hip | Shoulder | Wrist | Elbow |
|---|---|---|---|---|---|---|
| Gav | 17.3 / 44.5 / 95.6 | 14.6 / 30.7 / 76.5 | 13.0 / 16.8 / 83.5 | 13.1 / 19.3 / 83.5 | 16.4 / 38.2 / 92.4 | 14.3 / 26.9 / 86.4 |
| Vanni 240 | 6.7 / 25.0 / 75.8 | 4.8 / 15.9 / 55.0 | 4.0 / 9.7 / 82.3 | 4.5 / 10.9 / 90.2 | 6.2 / 24.9 / 86.6 | 5.0 / 15.8 / 97.1 |
| Vanni 120 | 11.1 / 36.8 / 82.7 | 8.4 / 25.4 / 53.9 | 6.9 / 13.9 / 34.9 | 6.8 / 13.8 / 35.4 | 9.0 / 25.8 / 83.5 | 7.7 / 17.9 / 52.9 |
| Vanni 60 | 19.6 / 62.0 / 109.2 | 14.9 / 37.9 / 57.9 | 13.3 / 18.2 / 66.6 | 13.0 / 18.4 / 63.6 | 16.2 / 36.9 / 78.2 | 13.7 / 25.4 / 57.5 |

## Root cause

The cause was **worker/UI synchronization at the browser presentation boundary**:
an animation-frame callback sampled `video.currentTime`, then independently chose
the nearest pose. It did not know which decoded video frame the media compositor
was actually showing. The correction binds pose selection to the browser’s
presented-frame `mediaTime`.

Disproved as dominant causes:

- coordinate rounding: none exists for skeleton points;
- canvas interpolation: the renderer draws vector primitives, not a resampled
  skeleton bitmap;
- React rendering: no per-frame React render is required for the canvas path;
- CSS transforms: video and canvas share one wrapper and transform;
- DPR/Retina scaling: backing store and drawing transform use the same DPR;
- AVA landmark smoothing: none exists;
- localization/contact/timing: upstream evidence is unchanged.

## Smoothing audit

No AVA overlay landmark smoothing, extrapolation, interpolation, or history state
exists. Frame selection and projection are pure. MediaPipe VIDEO mode may have its
own internal temporal behavior, inherited and unchanged. COM trails and ground
marks are explicit historical visual layers, not skeleton smoothing. Auto-follow
uses easing, but applies the identical wrapper transform to picture and canvas.
Therefore AVA-side skeleton smoothing adds 0 frames of latency, cannot overshoot,
and cannot create trailing/detached joints.

## Line rendering audit

- base bone width: 2.25 CSS px (3.75 px selected/hovered);
- base joint radius: 1 CSS px, 0.75 px stroke;
- emphasized arm width: 3 CSS px; arm joint radius 1.25 CSS px;
- `lineCap` and `lineJoin`: round;
- fractional coordinates are passed directly to Canvas2D;
- backing dimensions are `round(CSS size × DPR)` and the context transform is
  exactly DPR;
- anti-aliasing affects edge softness, not joint centers;
- the canvas covers only the actual displayed picture rectangle, including
  letterbox offset.

Rendering can affect perceived thickness on a small athlete, but the audited
centerline remains attached and contributes no positional lag.

## Code changed in Phase 6.1

- `src/lib/video/overlayRenderClock.ts` — new pure median-duration and
  deterministic nearest-presented-frame selection utilities.
- `src/components/video/VideoOverlay.tsx` — presented-frame callback wiring,
  safe rAF fallback, and reuse of the pure selector.
- `scripts/phase-6-1-overlay-fidelity-sanity.mjs` — deterministic renderer clock,
  projection, DPR, and no-rounding checks.
- `package.json` — one sanity command.
- this report and the roadmap status note.

No scientific source file changed.

## Tests added and run in Phase 6.1

- `npm run phase-6-1-overlay-fidelity:sanity` — **13/13 passed**.
- `npm run typecheck` — passed.
- `npm run lint` — passed.

The deterministic suite verifies that the same pose/time/geometry produces the
same frame selection and exact overlay point on every render, including a fixed
tie rule at an exact half-frame boundary.

## Benchmark validation performed in Phase 6.1

The real, unmodified `computeSprintMeasurements` path was replayed against all
four Phase 4.2K final artifacts and existing database calibration evidence after
the UI change:

| Benchmark | Valid contacts | Step frequency | Zone time | Result vs closed baseline |
|---|---:|---:|---:|---|
| Gav | 9 | 4.848484848484849 | 1.92 s | byte-identical |
| Vanni 240 | 7 | 3.103448275862069 | 2.12 s | byte-identical |
| Vanni 120 | 8 | 3.6206896551724137 | 2.19 s | byte-identical |
| Vanni 60 | 10 | 4.385953327434329 | 2.40 s | byte-identical |

Ground-contact, flight, peak-velocity, and zone-step outputs printed by the same
replay also match the closed report values. No benchmark was reprocessed and no
database row was mutated.

## Prior findings independently verified

- Phase 5.0A’s claim that AVA adds no pose smoothing was verified in live code.
- Its source-to-display projection and stale-gate descriptions remain accurate.
- Phase 4.2K’s four final benchmark metric baselines were reproduced personally
  in this phase.
- Phase 5.0E remains closed; no RTMPose path was run or changed.

## Findings corrected

Phase 5.0A’s code-inspection conclusion that the renderer introduced no
additional lag was too strong. Its nearest-frame offset measurement was real,
but it sampled `video.currentTime` on an animation clock and therefore could not
prove identity with the decoded frame actually being displayed. Live browser API
semantics plus the renderer code expose that missing synchronization boundary.
This corrects only the overlay conclusion; it does not alter Phase 5.0A’s pose or
scientific findings.

## Roadmap update

Phase 6.1 is recorded **CLOSED** as the first UI/visual-fidelity investigation.
It was not assigned a roadmap weight and receives no invented credit. Overall
completion remains **29.5%**. Phase 4.2 and Phase 5.0E remain closed.

## Remaining limitations / not personally validated

- No independent human joint annotation exists, so anatomical pose-model error
  relative to the athlete cannot be reported as UI overlay error.
- A production-browser GPU/compositor trace was not captured; raster/compositor
  latency is therefore not numerically claimed.
- The rAF compatibility fallback necessarily cannot provide the same presented-
  frame guarantee on browsers lacking `requestVideoFrameCallback`.
- I did not rerun MediaPipe or RTMPose inference, alter production data, or
  visually adjudicate every source frame in this phase.
- Prior Claude-authored architecture and reports are inherited evidence, not work
  claimed as completed in Phase 6.1.

## Git status

No commit and no push were performed. The repository was already substantially
dirty from prior phases. Phase 6.1’s own files are enumerated above; all unrelated
modified and untracked files were preserved.
