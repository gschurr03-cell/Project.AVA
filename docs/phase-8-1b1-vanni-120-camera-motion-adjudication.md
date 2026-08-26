# Phase 8.1B-1 — Vanni 120 End-of-Clip Camera-Motion Adjudication

**Status:** Evidence only. No stabilization, world-lock, presentation-camera, Auto
Follow, or scientific code was changed.

## 1. Executive summary

Phase 8.1A left one thing unresolved: an apparent Y-axis sign disagreement
between AVA's own world-lock transform and an independent raw-source-pixel
measurement for Vanni 120, frames ~415–475.

This phase found the root cause, and it is **not** a defect in AVA. **Phase
8.1A's own independent-measurement tooling (`raw-source-motion-control.py`)
never applied the video's 180° rotation correction** — the same correction
the production worker applies to every frame before any pose or camera-motion
processing (`mediapipe_pose_runner.py`'s `apply_rotation`, confirmed via
`ffprobe`'s `rotate` container tag and, in this session, `cv2.VideoCapture`'s
`CAP_PROP_ORIENTATION_META` and direct visual inspection — all agree on
180°). All three Vanni source files carry this same rotation tag, so this bug
affected Phase 8.1A's raw-source measurements for all three benchmarks, not
Vanni 120 alone.

With the rotation correction applied, three independent motion-estimation
methods (dense sparse-flow, ORB+RANSAC robust-feature, phase correlation) plus
a hand-picked, visually verified 6-point static-anchor ground control **all
agree with AVA's own world-lock transform in sign, and the best-matched
method (sparse optical flow) agrees to sub-pixel precision at every single
frame in the window (max residual 0.667 px across 93 frames)**. Visual
overlay sheets confirm this directly: AVA's predicted position and the
independent prediction both land inside the actual tracked position of every
manual anchor, at every representative frame, including the frame of maximum
apparent drift.

**Classification: `SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED`.** The ~9–10 px of
gate/background displacement Phase 8.1A measured for Vanni 120 is real,
physical camera motion (dominated by a small, genuine cumulative rotation —
up to ≈0.32° by clip end — whose displacement effect is amplified by lever-arm
distance from the rotation origin), and AVA's world-lock system is
independently confirmed to be tracking it correctly. **Phase 6.2's scientific
world-lock transform requires no change.**

## 2. Exact benchmark identity (Part A)

Resolved live, hash-verified against current storage (not from titles or
cached files):

| Field | Value |
|---|---|
| Session ID | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` |
| Current working analysis ID | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` (status `complete`) |
| Original filename | `IMG_4556 2.mov` |
| Pose artifact | `5df6454c-950f-4162-b756-42c353cb28ab/160a86a2-c0db-4e7d-9fbe-82aedd6d3eff/6d9a6aba-d099-4a33-b8ea-2dd4962fe80c.pose.json` — SHA-256 `0b79d2a7903f1daaa2d2d71c2278d10c2841dc4ce3337f4f545db0d9fdda4862`, **verified byte-identical** to the local artifact used throughout this audit via a live re-download this phase |
| Source video | `5df6454c-950f-4162-b756-42c353cb28ab/160a86a2-c0db-4e7d-9fbe-82aedd6d3eff.mov` — SHA-256 `de4677bb8ffccc9906f12dfce380dcf40fc78333477864b55468a566d3c35fc1`, **verified byte-identical** to the local `.mov` used for all pixel-level analysis via a live re-download this phase |
| Calibration | `manual_confirmed` (both boundaries `selectedByUser: true`) |
| FPS evidence | `session.fps` = `analysis_fps` = 120.005 (real detected rate, not a placeholder) |
| Frame count | 483 (`cameraPath.totalFrames`) |
| Duration | 483 / 120.005 ≈ 4.025 s |
| Source dimensions | 1920×1080 |
| Orientation | `rotate=180` container metadata (`CAP_PROP_ORIENTATION_META` = 180.0); worker applies `cv2.ROTATE_180` before all processing — confirmed and independently re-verified visually this phase (Section 4) |

## 3. Disputed interval (Part B)

Phase 8.1A reported "approximately frames 415–475" based on a comparison that
(as this phase discovered) used an incorrectly-oriented independent estimate.
Re-run correctly:

**No materially divergent interval exists.** Comparing AVA's real cumulative
world-lock transform against the best-matched independent method (sparse
optical flow, methodologically closest to AVA's own per-frame RANSAC-affine
approach) across the full padded window (frames 390–482, 93 frames):

- Residual (AVA vs. sparse-flow) never exceeds **0.667 px** at any frame.
- Median residual: 0.260 px. p95: 0.629 px.
- No frame shows a residual above 1.0 px — the "first divergence" search
  (threshold 1.0 px) found **no such frame** in the entire window.

The apparent "415–475" window from Phase 8.1A corresponds to the period where
the *magnitude* of real camera motion happened to be growing fastest (see
Section 9) — not a period where AVA's estimate diverges from ground truth.
Once compared correctly, AVA tracks the real motion throughout, including
during its steepest part.

## 4. Coordinate-system audit (Part I)

This is the central finding of this phase. Explicitly verified:

- **Rotation metadata**: `cv2.VideoCapture(...).get(cv2.CAP_PROP_ORIENTATION_META)`
  returns `180.0` for `vanni_fly_120.mov` (re-confirmed live this session,
  consistent with Phase 8.0A's original finding).
- **Worker behavior**: `mediapipe_pose_runner.py`'s `probe_rotation_degrees()`
  (via `ffprobe`'s `stream_tags=rotate`) + `rotation_code_for_angle()` +
  `apply_rotation()` explicitly rotate **every decoded frame by 180°** before
  any pose detection or camera-motion estimation — confirmed by direct code
  read (`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`
  lines 59–124), with the module's own comment explaining exactly why:
  `cv2.VideoCapture.read()` does **not** apply container rotation metadata,
  so every downstream stage would silently operate on a mis-oriented frame
  without this explicit correction.
- **Phase 8.1A's bug**: `scripts/phase-8-1a-raw-source-motion-control.py`
  called `cv2.VideoCapture(...).read()` directly with **no rotation
  correction at all** — verified by re-reading that exact file this phase.
  This means its independent measurements were computed in a frame rotated
  180° relative to AVA's actual coordinate space.
- **Visual proof**: extracting frame 295 with no correction produces a
  sideways image (bleachers/field rotated 90° from natural viewing
  orientation); applying `cv2.rotate(frame, cv2.ROTATE_180)` produces the
  correct, natural orientation (field at bottom, bleachers behind, running
  lane horizontal) — see `tmp/phase81b1/frames/vanni120_ref295_295.png` vs.
  `..._rot180.png`.
- **All three Vanni source files** (`vanni_fly_240.mov`, `vanni_fly_120.mov`,
  `vanni_fly_60.mov`) report `CAP_PROP_ORIENTATION_META = 180.0`; only
  `gav_stationary_reference.mov` reports `0.0`. **This means Phase 8.1A's
  "independent confirmation" for Vanni 240 and Vanni 60 was very likely
  computed under the same coordinate mismatch** — those conclusions are not
  necessarily wrong (a 180° rotation only flips translation sign; if the real
  motion for those clips is small/noisy the practical impact may differ), but
  they were **not validated in the correct coordinate frame** and should be
  treated as unverified until a similar correction and re-check is performed
  for them. This is explicitly flagged as new information this phase
  surfaced, outside Vanni 120's own scope to fully re-resolve.
- **Mathematical relationship used to interpret Phase 8.1A's original
  numbers**: a 180° image rotation is a point reflection through the frame
  center. A translation vector measured in the unrotated frame `(Δu, Δv)`
  corresponds to `(-Δu, -Δv)` in the rotated (AVA) frame — **both components
  flip**. A rotation angle, by contrast, is preserved under a 180° rotation
  (no handedness change) — which is why re-deriving rotation directly (this
  phase) rather than trying to algebraically correct Phase 8.1A's old
  translation-only numbers was the reliable path forward.
- **This phase's own tooling**: `scripts/phase-8-1b1-vanni120-adjudication.py`
  applies `cv2.rotate(frame, cv2.ROTATE_180)` to every decoded frame before
  any feature detection, matching the worker exactly. Section 3's sub-pixel
  agreement result is itself strong evidence the correction is right — a
  wrong orientation could not produce <1px agreement with AVA across 93
  frames and 3 independent methods by chance.

## 5. Manual-anchor ground control (Part D)

Six real, visually verified, static stadium structures, distributed across
the frame (not near the athlete's path, which was empty of any person by this
point in the clip — Section 12), tracked via normalized cross-correlation
template matching (`cv2.matchTemplate`, `TM_CCOEFF_NORMED`), re-seeded each
frame from its own last high-confidence match:

| Anchor | Reference pixel (rotated frame) | Match confidence range | Displacement at frame 482 (clip end) |
|---|---|---|---|
| Blue barrel | (1500, 655) | 0.962–1.000 | Δx=+6, Δy=0 px |
| Left staircase corner | (215, 555) | 0.854–1.000 | Δx=+7, Δy=+6 px |
| Tan box on wall | (1195, 610) | 0.919–1.000 | Δx=+5, Δy=+1 px |
| Light pole at fence | (330, 230) | 0.948–1.000 | Δx=+4, Δy=+6 px |
| Middle staircase corner | (1290, 555) | 0.799–1.000 | Δx=+5, Δy=+1 px |
| Fence post | (685, 555) | 0.894–1.000 | Δx=+5, Δy=+4 px |

All six show small, coherent, same-signed displacement (never lost lock:
confidence stayed above the 0.6 re-seed threshold throughout for every
anchor). This is the interpretable, human-verifiable ground truth: **real
stadium structures visibly did shift a handful of pixels over this ~4-second
tail window** — consistent with AVA's own estimate.

## 6. Sparse-flow estimate (Part C, Method 1)

`goodFeaturesToTrack` (300 corners) + `calcOpticalFlowPyrLK` + RANSAC
`estimateAffinePartial2D`, run on **every consecutive frame pair** in the
window (92 steps, frames 390→482), decomposed into translation/rotation/scale
using the identical convention `camera_path.py` itself uses
(`np_to_similarity`: scale from column norm, rotation from `atan2`).

This is the **best-matched** independent method — see Section 9 for the
sub-pixel agreement result.

## 7. Robust-feature estimate (Part C, Method 2)

ORB (2000 features) + `BFMatcher` (ratio test 0.75) + RANSAC
`estimateAffinePartial2D`, sampled every 5 frames (19 steps), same
decomposition. Agrees with AVA in sign at every sampled frame; max residual
2.54 px (coarser stride reduces precision but not agreement — see Section 9).

## 8. Third independent estimate (Part C, Method 3)

`cv2.phaseCorrelate` (Hanning-windowed), translation-only, every consecutive
frame pair. This method **cannot** represent rotation, so it necessarily
misses the lever-arm-amplified Y-component that dominates at points far from
the frame origin — its larger residual against AVA (max 7.79 px) is expected
and is itself informative: it is consistent with a rotation-dominated real
motion, not with disagreement about whether real motion occurred (translation
sign still matches).

## 9. Translation/rotation/scale decomposition and AVA comparison (Parts E/F)

`camera_path.py`'s rotation convention operates around **pixel origin
(0,0)**, not the frame center (confirmed directly from `similarity_to_np`:
raw pixel coordinates `x = point.x * width`, rotated in place). This means a
small rotation angle produces a **position-dependent** displacement
proportional to each point's distance from the top-left corner — this is
the majority of the answer to "is the Y disagreement rotation, translation,
or scale": **it is real, physical, small rotation, amplified by lever arm.**

Cumulative rotation (AVA, relative to frame 390): essentially 0° through
frame ~410, then growing smoothly and monotonically to **−0.32° by frame
482**. Sparse-flow's independent rotation estimate: **−0.35° by frame 482** —
a 7% relative difference, i.e. close agreement.

| Frame | AVA cumulative (x, y px / rot°) | Sparse-flow cumulative (x, y px / rot°) | Residual (px) |
|---:|---|---|---:|
| 415 | (−0.11, 0.31, −0.0045°) | (−0.14, 0.41, −0.0070°) | 0.11 |
| 430 | (−0.12, 2.88, −0.0450°) | (−0.22, 3.28, −0.0515°) | 0.41 |
| 445 | (−0.32, 6.36, −0.1015°) | (−0.31, 6.87, −0.1101°) | 0.51 |
| 460 | (0.58, 8.68, −0.1821°) | (0.69, 8.79, −0.1953°) | 0.16 |
| 475 | (2.88, 9.07, −0.2756°) | (2.91, 8.73, −0.2857°) | 0.35 |
| 482 | (3.09, 9.02, −0.3226°) | (2.56, 9.41, −0.3473°) | 0.66 (window max) |

Scale deviation is negligible throughout (`|scale − 1|` stays under 0.0005 in
AVA's own transform) — this is not a zoom/scale effect.

Residual statistics across all 93 frames (`tmp/phase81b1/vanni120-adjudication.json`):

| Method | Median residual (px) | p95 (px) | Max (px) | Rotation residual max (°) |
|---|---:|---:|---:|---:|
| Sparse flow | 0.260 | 0.629 | **0.667** | 0.025 |
| Robust feature (ORB, stride 5) | 0.639 | 2.537 | 2.537 | 0.060 |
| Phase correlation (translation only) | 2.701 | 7.481 | 7.789 | n/a |

## 10. AVA global path reconstruction (Part G)

Real evidence traced directly from the live pose artifact's `cameraPath` for
every frame in the window — not inferred:

- `cameraPath.framePaths[i].state` = `"anchored"` for **100%** of frames
  390–482 (no `local_only`/`unavailable` transition anywhere in this window).
- `cameraEvidence.transforms[i]` (the real, per-frame local background
  estimate feeding the keyframe composition) shows `supportingFeatureCount =
  300` (the full `goodFeaturesToTrack` request) and `inlierRatio = 1.0` at
  **every single frame** in the window — RANSAC rejected zero candidate
  points as outliers throughout. Per-frame `confidence` stayed in
  0.972–0.999; `residualPx` stayed in 0.022–0.138 (sub-pixel).
- Two keyframe transitions occur inside the window: **kf-9 at frame 414**
  (parent `kf-8` at frame 368, span 46 frames) and **kf-10 at frame 460**
  (parent `kf-9`, span 46 frames). See Section 11 for why.
- **AVA is following real motion, not underestimating, overestimating, using
  a bad keyframe, contaminated by dynamic foreground, or otherwise wrong** —
  every one of these was directly testable and none is supported by the
  evidence gathered.

## 11. Keyframe interpolation audit (Part J)

`camera_path.py`'s `MAX_KEYFRAME_SPAN_FRAMES = 45` (read directly from the
real source, line 77). Frames 415–475 are **not** an interpolation or
extrapolation interval — they are ordinary **composition within one active
keyframe segment**: every real per-frame local step (`camera_transforms[i]`)
is composed onto the active keyframe's own already-anchored
`keyframeToGlobalMatrix` via `compose_np(step_np, active.cumulative_np)`
(`camera_path.py` line 542). A new keyframe is only spawned when
`frame_index - active.frame_index > 45` (span), or cumulative
translation/scale exceeds their own thresholds (`0.35` normalized / `0.25`
respectively — never approached here, since cumulative translation peaks
around 9 px ≈ 0.0047 normalized). **The keyframe boundaries at 414 and 460 are
routine 45-frame span rebases, occurring on the same cadence throughout the
whole clip regardless of whether real motion is happening** — not a response
to, or an artifact source for, this specific window's motion. No
interpolation/extrapolation gap exists anywhere in this window; every frame's
`frameToGlobalMatrix` is exact composition of directly-measured local steps.

## 12. Visual evidence (Part K)

Five representative sheets generated under `tmp/phase81b1/sheets/`:
`vanni120_A_before_divergence_frame400.png`,
`..._B_start_divergence_frame415.png`, `..._C_max_divergence_frame460.png`,
`..._D_late_divergence_frame475.png`,
`..._E_post_divergence_clip_end_frame482.png`. Each shows the source frame,
all 6 manual anchors (green boxes = actual tracked position), AVA's predicted
position (red circle) and the independent sparse-flow-predicted position
(orange circle), both computed by applying the respective cumulative
similarity transform to each anchor's reference position. At every frame,
including frame 460 (maximum apparent drift), the red and orange circles sit
essentially centered inside the green boxes — direct visual confirmation of
Section 9's numeric result. No person, moving object, or unstable vegetation
is visible in any frame across the window (also see Section 13).

## 13. Feature-ownership audit (Part H)

Direct visual inspection of frames 400, 460 (Section 12 sheets and
`tmp/phase81b1/frames/`) shows a **completely empty scene** — no athlete
(the athlete's last real pose evidence was frame 315, ~75–145 frames before
this window even starts), no other person, no moving equipment. Combined with
the `inlierRatio = 1.0` finding (Section 10: all 300 candidate background
corners agreed with a single rigid-transform hypothesis at every frame — a
classical signature of zero outlier/dynamic contamination, since a moving
foreground object would produce a cluster of RANSAC-rejected outlier points),
this rules out `DYNAMIC_FEATURE_CONTAMINATION` directly. All tracked features
classify as `STATIC_WORLD`.

## 14. Exact classification (Part L)

**`SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED`.**

Not `AVA_GLOBAL_MOTION_UNDERESTIMATE`/`OVERESTIMATE` — AVA's magnitude
matches the best independent method to sub-pixel precision. Not
`DYNAMIC_FEATURE_CONTAMINATION` — scene is empty, inlier ratio is perfect.
Not `KEYFRAME_INTERPOLATION_ERROR` — no interpolation exists in this window;
it is direct composition of validated per-frame local steps, and keyframe
boundaries are routine, evidence-independent span rebases. Not
`COORDINATE_SYSTEM_TOOLING_ERROR` **in AVA** — the tooling error found and
fixed this phase was in Phase 8.1A's own independent-measurement script, not
in any production code. Not `ROTATION_COMPONENT_MISINTERPRETED_AS_Y_DRIFT` —
the rotation is real (independently confirmed, not a misinterpretation) and
correctly produces position-dependent Y displacement; that is physically
correct behavior, not a misinterpretation by either AVA or this audit. Not
`INSUFFICIENT_EVIDENCE` — four independent methods (three algorithmic, one
manual) converge.

## 15. Phase 6.2 scientific-world-lock decision (Part M)

**No. Vanni 120 provides no evidence that Phase 6.2's scientific/global
camera transform is wrong.** On the contrary: this phase's independent,
multi-method, visually-corroborated re-measurement is **positive validating
evidence** that the transform is accurate to within roughly a pixel over a
93-frame, ~0.78-second window containing real, non-trivial camera motion
(cumulative rotation growing to ≈0.32°). No change to Phase 6.2, world-lock,
calibration, contact, or metric code is warranted by this finding, and none
was made.

## 16. Safe Phase 8.1B-2 input contract (Part N)

If Phase 8.1B-2 proceeds with **display-only** presentation stabilization, it
should be safe to consume:

- **The existing validated global camera path** (`cameraPath.framePaths[i].frameToGlobalMatrix`/
  `globalToFrameMatrix`, via `framePointToGlobal`/`globalPointToFrame`) — this
  phase directly re-validated its accuracy for a real, non-trivial-motion
  window. This should remain the **single source of truth** for where a
  world-anchored point (gate, contact, step marker, zone polygon) is drawn.
- **NOT** a new, separately-computed raw background-motion estimate — Section
  4 showed how easy it is to introduce a real, silent coordinate/orientation
  bug when reimplementing motion estimation outside the existing, already-
  validated pipeline. Any new display-smoothing logic must consume the
  *existing* `cameraPath` output, not recompute motion independently.
- **A display-only, presentation-layer smoothing/attenuation function** (if
  8.1B-2's goal is to make small, real motion visually calmer for a coach)
  may be layered strictly downstream of the existing `globalPointToFrame`
  result — analogous to how Phase 6.2's own `stabilizeGateZone` atomic
  deadzone already sits downstream of the scientific gate resolution without
  altering it. It must never feed back into `cameraPath`, calibration, or any
  scientific coordinate.
- Explicitly **not safe**: freezing/holding the transform after a fixed
  frame-offset from athlete exit (Phase 8.1A Part P already showed onset
  timing has no reliable relationship to any single athlete-exit event), or
  suppressing rotation specifically (Section 9 shows rotation is the
  dominant, real, correctly-tracked signal here — suppressing it would
  reintroduce exactly the lag Phase 6.2 was built to eliminate).

## 17. Files changed

**None in `src/`.** New, standalone, read-only forensic scripts and this
report:

- `scripts/phase-8-1b1-vanni120-adjudication.py`
- `scripts/phase-8-1b1-visual-sheets.py`
- `scripts/phase-8-1b1-adjudication-sanity.mjs`
- `docs/phase-8-1b1-vanni-120-camera-motion-adjudication.md` (this file)

## 18. Tests

`scripts/phase-8-1b1-adjudication-sanity.mjs` — **15/15 PASS**: identity
provenance, rotation-correction recorded, AVA-vs-independent coordinate
agreement (<2px, proving correct orientation), manual-anchor determinism and
completeness, multi-method frame-coverage contiguity, AVA state well-
formedness, exact keyframe-transition frame numbers cross-checked against the
real `camera_path.py` source constant, forensic-script non-invasiveness, and
pose-artifact hash pinning.

## 19. Scientific regression

All rerun against current, live artifacts — zero failures, zero value changes:

| Suite | Result |
|---|---|
| Phase 8.1A drift-forensic sanity (rerun) | 33/33 PASS |
| Phase 6.2 world-lock (`phase-6-2-world-lock:sanity`) | 23/23 PASS |
| Phase 6.5 presentation camera (`phase-6-5-presentation-camera:sanity`) | 26/26 PASS |
| Phase 6.6B Part A (`phase-6-6b-part-a-instrumentation:sanity`) | 5/5 PASS |
| Phase 6.6B Part B (`phase-6-6b-part-b-presentation-sync:sanity`) | 18/18 PASS |
| Phase 7.3B (`phase-7-3b-temporal-state:sanity`) | 11/11 PASS |
| Phase 8.0A forensic reconstruction (rerun) | 28/28 PASS |
| Phase 8.0B overlay-label sanity (rerun) | 32/32 PASS |
| Phase 8.1B-1 adjudication sanity (new) | 15/15 PASS |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | succeeds (dev server safely stopped first, then restarted — see Section 22) |

## 20. Anything not personally validated

- **Vanni 240 and Vanni 60's Phase 8.1A "independent confirmation" is now in
  question** (Section 4) — both source files carry the same 180° rotation tag
  Phase 8.1A's tooling mishandled for Vanni 120. This phase did not re-run
  the corrected analysis for those two benchmarks (explicitly out of this
  task's Vanni-120-only scope) — flagged as a real, concrete follow-up rather
  than silently left implied-fine.
- The robust-feature (ORB, stride-5) and phase-correlation methods' larger
  residuals were interpreted as expected consequences of coarser sampling and
  translation-only modeling, respectively, rather than independently proven
  via a dedicated ablation (e.g., rerunning robust-feature at stride 1). This
  is a reasonable, evidence-consistent interpretation but not exhaustively
  isolated.
- Manual anchor selection was performed by visual inspection of a grid-
  overlaid frame by the author of this audit, not by an independent second
  reviewer or automated salient-feature detector — a reasonable but
  human-judgment-based step.
- The exact physical cause of the real camera motion (what specifically
  moved the tripod/camera during this ~4s window) was not and cannot be
  determined from video evidence alone — only that real motion occurred and
  AVA tracked it correctly.

## 21. Git status

- `HEAD` unchanged; no commit made.
- No push, no `db:reset`, no database mutation (only read-only `sessions`/
  `analyses`/storage queries, matching every prior phase's pattern).
- Zero files under `src/` changed by this phase.
- New files: three scripts under `scripts/` and this report under `docs/`,
  all additive. `tmp/phase81b1/` (generated evidence: adjudication JSON,
  extracted frames, visual sheets) is gitignored (`/tmp/` in `.gitignore`),
  matching Phase 8.0A/8.0B/8.1A precedent.
- Regression build procedure followed the task's explicit safety
  instruction: the live `npm run dev` process was stopped before `npm run
  build` ran, and cleanly restarted afterward (verified `200` on `/` and
  `/login` post-restart) — the dev asset-manifest corruption Phase 8.1A
  disclosed did not recur.
