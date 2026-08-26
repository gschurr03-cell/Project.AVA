# Phase 8.1B-2A — Corrected Cross-Benchmark End-of-Clip Camera-Motion Validation

**Status:** Evidence only. No production, world-lock, presentation-camera, Auto
Follow, or scientific code was changed.

## 1. Executive summary

Phase 8.1B-1 found and fixed a real orientation bug in Phase 8.1A's
independent raw-source-motion tooling (it never applied the source video's
180° rotation metadata that the production worker applies before any
processing) and, after correcting it, proved Vanni 120's end-of-clip drift is
`SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED`. Because Vanni 240 and Vanni 60
share the identical 180° rotation metadata, Phase 8.1A's "independent
confirmation" for those two clips was flagged as unverified.

This phase re-ran the identical corrected methodology (three independent
motion estimators + manual static-anchor ground control, all decoded with the
same `cv2.ROTATE_180` correction the production worker applies) against
Vanni 240 and Vanni 60. **Both are now independently confirmed
`SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED`**, with AVA's own `cameraPath`
transform matching the best independent estimate to within roughly a pixel
across the full post-exit tail of each clip (Vanni 240: median residual 0.20
px, max 1.91 px over 460 frames; Vanni 60: median 0.03 px, max 0.62 px over
88 frames). **All three Vanni benchmarks now carry independently
re-validated evidence. No benchmark shows any evidence that Phase 6.2's
scientific world-lock transform is wrong.**

The physical *character* of the real motion differs meaningfully across
clips: Vanni 120's drift is rotation-dominated (≈0.32° cumulative, amplified
by lever-arm distance from the rotation origin); Vanni 240 is a mix of real
translation (~6.9 px at the origin) and real rotation (≈0.16°); Vanni 60 is
almost pure translation (~3.2 px, rotation ≈0.013° — negligible). All three
are real, physical, and correctly tracked — not the same bug wearing three
different faces, but three real, independently-confirmed, distinct instances
of small camera motion.

Given the world-lock is confirmed correct and the motion is real, this phase
also answers the *product* question the original bug report implied: whether
a **display-only** presentation stabilizer would improve review UX. The
answer is a qualified yes (Section 12), with an explicit, conservative
input/activation contract for a future Phase 8.1B-2B (Sections 13–14) that
never alters or hides the scientific transform.

## 2. Why 8.1A's Vanni 240/60 evidence required correction

Phase 8.1A's `raw-source-motion-control.py` called
`cv2.VideoCapture(...).read()` directly, with **no rotation correction**.
Phase 8.1B-1 discovered (via `CAP_PROP_ORIENTATION_META` and direct visual
inspection) that `vanni_fly_120.mov` carries `rotate=180` container metadata,
and that the production worker (`mediapipe_pose_runner.py`) applies
`cv2.ROTATE_180` to every decoded frame before any pose or camera-motion
processing — `cv2.VideoCapture.read()` does not apply this automatically.
Re-checking this phase: **`vanni_fly_240.mov` and `vanni_fly_60.mov` both
also report `CAP_PROP_ORIENTATION_META = 180.0`** (only
`gav_stationary_reference.mov` reports `0.0`). A 180° rotation is a point
reflection through the frame center — it negates both translation components
of any measured motion vector, but preserves rotation angle sign. Phase
8.1A's raw-source measurements for Vanni 240 and Vanni 60 were therefore
computed in the wrong coordinate frame, exactly as for Vanni 120, and their
apparent "independent confirmation" could not be trusted without redoing the
comparison correctly — which is what this phase does.

## 3. Exact benchmark identities (Part A)

Resolved live, hash-verified against current storage this phase (not from
titles or cached files):

| Field | Vanni 240 | Vanni 60 |
|---|---|---|
| Session ID | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` |
| Current working analysis ID | `a7679326-e193-4489-bf50-735fe402ec60` (`complete`) | `8f55936c-cf07-4c20-ba73-b662e8d24325` (`complete`) |
| Original filename | `IMG_4557 2.mov` | `IMG_4555 2.mov` |
| Pose artifact | `.../31fe352b-.../a7679326-....pose.json` — SHA-256 `21b4b79242471b3b...`, **live-verified byte-identical** | `.../3d6ba4b6-.../8f55936c-....pose.json` — SHA-256 `bd4c3a4a956e7894...`, **live-verified byte-identical** |
| Source video | `.../31fe352b-....mov` — SHA-256 `954678f64fe9620d...`, **live-verified byte-identical** | `.../3d6ba4b6-....mov` — SHA-256 `ff61af9a638ec5c3...`, **live-verified byte-identical** |
| Calibration | `manual_confirmed` (both boundaries `selectedByUser: true`) | `manual_confirmed` (both boundaries `selectedByUser: true`) |
| FPS evidence | `session.fps` = `analysis_fps` = 239.981 (real detected rate) | `session.fps` = 56.530 (real detected rate; `analysis_fps` recorded as 60, the queue-time nominal class) |
| cameraPath frame count | 1020 (`cameraPath.totalFrames`; container `nb_frames` tag claims 1095 — the same known-unreliable-container-tag discrepancy documented in Phase 1) | 233 (`cameraPath.totalFrames`; container claims 246) |
| Duration | 1020 / 239.981 ≈ 4.250 s | 233 / 56.530 ≈ 4.122 s |
| Source dimensions | 1920×1080 | 1920×1080 |
| Rotation metadata | `CAP_PROP_ORIENTATION_META` = 180.0 | `CAP_PROP_ORIENTATION_META` = 180.0 |
| cameraPath version | `ava-camera-path-v2` | `ava-camera-path-v2` |

## 4. Orientation audit (Part B)

Deterministic orientation check performed for both clips before any motion
comparison:

| Signal | Vanni 240 | Vanni 60 |
|---|---|---|
| Raw encoded width/height | 1920×1080 | 1920×1080 |
| Rotation metadata (`CAP_PROP_ORIENTATION_META`) | 180.0 | 180.0 |
| Production decoded orientation | `cv2.ROTATE_180` applied (`mediapipe_pose_runner.py`'s `apply_rotation`) | same |
| Corrected forensic orientation (this phase) | `cv2.ROTATE_180` applied identically before any feature detection | same |

Visual confirmation: extracting an unrotated frame from either clip produces
a sideways image (same stadium, same effect documented for Vanni 120 in
Phase 8.1B-1); applying `cv2.rotate(frame, cv2.ROTATE_180)` produces the
correct natural orientation. Both benchmarks' forensic scripts
(`scripts/phase-8-1b2a-cross-benchmark-adjudication.py`) apply this rotation
identically to Phase 8.1B-1's proven-correct Vanni 120 pipeline — **no new
coordinate system was invented.** The quantitative proof that both sides are
now in the same coordinate system is Section 9's sub-few-pixel residual
agreement (a wrong orientation would produce a residual on the order of
double the real motion magnitude, not sub-pixel).

## 5. Vanni 240 corrected source-motion analysis (Part C)

Window: frames 560–1019 (460 frames, ≈1.92 s), covering the real drift window
Phase 8.1A originally flagged (reference frame 573, reported max-drift frame
1007) with padding. Athlete's last real pose evidence: frame 990 (this window
starts and ends around/after that; the scene is confirmed empty of any
person by frame 700 onward — see Section 7).

Three independent methods, run exactly as proven in Phase 8.1B-1:

| Method | vs. AVA residual: median / p95 / max (px) |
|---|---|
| Sparse optical flow (consecutive frames) | 0.20 / 0.83 / **1.91** |
| Robust feature (ORB + RANSAC, stride 5) | 0.07 / 0.68 / 1.15 |
| Phase correlation (translation-only) | 0.49 / 2.92 / 3.54 |

AVA's own cumulative transform (relative to frame 560, i.e. displacement at
the pixel origin): peaks at **6.91 px** translation magnitude and **−0.16°**
rotation at frame 982, then partially reverses to (x=−2.43, y=+2.97,
rot=−0.0037°) by the final frame (1019) — a real rise-then-partial-reversal
shape, independently reproduced by the sparse-flow method at every
intermediate frame (Section 9 table).

## 6. Vanni 60 corrected source-motion analysis (Part D)

Window: frames 145–232 (88 frames, ≈1.54 s at 56.53 fps), covering Phase
8.1A's original reference frame 150 through clip end (232). Same evidence
standard, same thresholds as Vanni 240 and Vanni 120 — no FPS-specific
tuning.

| Method | vs. AVA residual: median / p95 / max (px) |
|---|---|
| Sparse optical flow (consecutive frames) | 0.03 / 0.39 / **0.62** |
| Robust feature (ORB + RANSAC, stride 5) | 0.07 / 0.92 / 0.92 |
| Phase correlation (translation-only) | 0.06 / 1.36 / 1.60 |

Reported in both units per the task's request:

| Benchmark | FPS | Max translation (px) | Frames to max | Seconds to max | px/frame | **px/second** |
|---|---:|---:|---:|---:|---:|---:|
| Vanni 240 | 239.981 | 6.91 | 422 | 1.758 | 0.0164 | **3.93** |
| Vanni 60 | 56.530 | 3.20 | 87 | 1.539 | 0.0368 | **2.08** |

Both fall in the same **~2–4 px/s band** found for Vanni 120 in Phase 8.1A
(and reproduced by this phase's own re-analysis) — the drift rate is
time-proportional, not frame-count-proportional, across three very different
frame rates (240/60/120 fps), the expected signature of a real, continuous
physical process rather than a per-frame-accumulating numerical artifact.

## 7. Manual-anchor controls (Part F)

Six real, visually verified, distributed static stadium structures per
benchmark (same stadium as Vanni 120; visually confirmed empty of any
person/moving object throughout each window), tracked via `cv2.matchTemplate`
normalized cross-correlation:

**Vanni 240** (all 5 anchors clean, consistent, coherent — final frame 1019):

| Anchor | Reference px | Score range | Δ at frame 1019 |
|---|---|---|---|
| blue_barrel_right | (1450, 675) | 0.954–1.000 | (−1, +3) |
| left_staircase_corner | (200, 590) | 0.908–1.000 | (−2, +3) |
| tan_box_on_wall | (1230, 630) | 0.918–1.000 | (−1, +3) |
| light_pole_at_fence | (390, 250) | 0.960–1.000 | (−2, +3) |
| fence_post | (790, 555) | 0.897–1.000 | (−2, +3) |

**Vanni 60** (5 of 6 anchors clean and consistent; one disclosed failure):

| Anchor | Reference px | Score range | Δ at frame 232 |
|---|---|---|---|
| left_staircase_corner | (90, 590) | 0.933–1.000 | (−1, +3) |
| tan_box_on_wall | (1280, 630) | 0.941–1.000 | (−1, +2) |
| light_pole_at_fence | (335, 220) | 0.869–1.000 | (−1, +3) |
| blue_barrel | (1520, 655) | 0.953–1.000 | (−1, +2) |
| door_corner | (800, 590) | 0.821–1.000 | (−1, +3) |
| fence_post | (700, 555) | 0.835–1.000 | **(−21, +3) — unreliable, see below** |

**Disclosed limitation, honestly reported**: `fence_post`'s template match
oscillated (confidence dropped to ~0.83–0.92 around frames 195–232 and its
tracked x-position jumped between 636–700) — the real fence has multiple
visually near-identical vertical posts at regular spacing, and normalized
cross-correlation intermittently locked onto an adjacent post instead of the
original one. This is a known limitation of single-template matching on
repetitive structures, not evidence of real motion — it is excluded from the
anchor consensus. The other 5 anchors for Vanni 60, and all 5 for Vanni 240,
remained locked (confidence never dropped near the 0.6 re-seed threshold)
and are fully consistent with both AVA and the algorithmic methods. This is
itself a useful, disclosed methodological finding: manual ground control
needs *several* anchors specifically because any single one can fail this
way — exactly why Part F asked for multiple, distributed anchors rather than
one.

## 8. Translation/rotation/scale decomposition (Parts E/G)

`camera_path.py`'s rotation convention operates around pixel origin (0,0),
confirmed identically for these two benchmarks as for Vanni 120 (Phase
8.1B-1 Section 9) — so rotation's visible displacement effect is
proportional to a point's distance from the top-left corner (the lever-arm
effect).

| Benchmark | Max cumulative rotation | Lever-arm displacement at a representative far point (1400, 600), radius 1523 px |
|---|---:|---:|
| Vanni 120 (Phase 8.1B-1) | −0.32° | ≈8.5 px (rotation-dominant case) |
| Vanni 240 | −0.16° | ≈4.3 px (mixed: real translation ~6.9 px + this rotation contribution) |
| Vanni 60 | −0.013° | ≈0.34 px (**negligible** — this clip's drift is almost pure translation) |

**Vanni 60's user-visible drift is explained almost entirely by real
translation, not rotation** — a genuinely different physical signature from
Vanni 120. **Vanni 240 is a real mix of both.** Scale deviation is negligible
in both (`|scale − 1|` stays under 0.001 throughout, consistent with Vanni
120). This directly answers Part G: the apparent vertical drift is
quantitatively explained by real camera motion in every case, but the
*mechanism* (translation vs. rotation vs. mixed) is not uniform across
benchmarks and must not be assumed to generalize from one clip to another.

## 9. AVA comparison (Part E, cont'd)

Representative per-frame comparison, Vanni 240 (AVA cumulative vs. sparse-flow
cumulative, both relative to frame 560):

| Frame | AVA (x, y px / rot°) | Sparse-flow (x, y px / rot°) | Residual (px) |
|---:|---|---|---:|
| 700 | (−0.07, −0.00, −0.0005°) | (−0.27, −0.02, −0.0053°) | 0.20 |
| 850 | (−0.03, −0.03, −0.0015°) | (−0.23, −0.05, −0.0063°) | 0.20 |
| 957 | (−1.60, 1.54, −0.0301°) | (−2.77, 3.04, −0.0533°) | 1.86 |
| 1000 | (−2.27, 4.84, −0.0696°) | (−3.23, 4.83, −0.0630°) | 0.96 |
| 1007 | (−5.28, 4.22, −0.0046°) | (−5.65, 3.85, +0.0067°) | 0.55 |
| 1019 | (−2.43, 2.97, −0.0037°) | (−2.08, 2.62, −0.0126°) | 0.49 |

Full per-frame data (both benchmarks): `tmp/phase81b2a/{vanni240,vanni60}-adjudication.json`.
Visual overlay sheets (`tmp/phase81b2a/sheets/`) confirm this directly at
representative frames — at every one, including each clip's own peak-drift
frame, the AVA-predicted (red) and independent-predicted (orange) positions
sit essentially centered inside the actual tracked (green) manual-anchor
box.

## 10. Cross-benchmark results (Part J)

| Benchmark | FPS | Rotation meta | Post-exit source translation (max, px) | Post-exit source rotation (max, °) | AVA translation (max, px) | AVA rotation (max, °) | Source-vs-AVA residual median/max (px) | Classification |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Gav | 60 | none (0°) | ≈0 (9-frame tail only, ≈0.15 s) | ≈0 | 0.05 | ≈0 | n/a — window too short for a meaningful independent estimate | *(see Section 10a)* |
| Vanni 120 | 120.005 | 180° | ≈7.4–8.4 (multi-method range) | −0.35° (sparse-flow) / −0.32° (AVA) | 9.02 (at bg-anchor) | −0.32° | median 0.26 / max 0.67 | `SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED` |
| Vanni 240 | 239.981 | 180° | ≈6.7–8.4 (multi-method range) | −0.16° (sparse-flow ≈ AVA) | 6.91 | −0.16° | median 0.20 / max 1.91 | `SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED` |
| Vanni 60 | 56.530 | 180° | ≈3.0–3.2 (multi-method range) | −0.013° (sparse-flow ≈ AVA) | 3.20 | −0.013° | median 0.03 / max 0.62 | `SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED` |

### 10a. Gav (Part H is scoped to Vanni 240/60, but Gav is included per Part J)

Gav's tail is only 9 frames (≈0.15 s) after the reference point, with a
measured max drift of 0.05 px — no material motion occurred in the available
window, so there is nothing to independently confirm or contradict. This is
not evidence of a different mechanism; it is evidence that Gav's clip simply
does not run long enough after exit for real camera settling (of the small
magnitude seen in the Vanni clips) to become measurable. Classified
`INSUFFICIENT_EVIDENCE (tail too short)` — not forced into
`SOURCE_CAMERA_MOTION_CORRECTLY_TRACKED` since there was effectively no
motion to confirm, and not `OTHER` since nothing anomalous was found either.

## 11. Whether any scientific world-lock defect remains (Part I)

**No.** Across all three Vanni benchmarks — the only ones with a long enough
post-exit tail and real motion to test — AVA's `cameraPath` transform matches
the best independent, non-AVA estimate to within roughly a pixel throughout
the entire post-exit tail, confirmed by three independent algorithmic methods
plus hand-verified static ground control. No benchmark, no frame range, shows
a residual, feature-ownership contamination, keyframe-interpolation gap, or
coordinate-system mismatch that would indicate AVA's scientific/global camera
path is wrong. **Phase 6.2's world-lock transform is re-confirmed correct for
all three re-tested benchmarks**, extending Phase 8.1B-1's single-benchmark
finding to the full set.

## 12. Whether display stabilization is justified (Part K)

This is a product judgment, not a scientific correction, made explicit here
per the task's framing. Given:

- The scientific world-lock is confirmed accurate (Section 11) — there is no
  correctness reason to change it.
- The real motion is small in absolute terms (≈2–10 px on a 1920×1080 frame,
  under 0.5% of frame width) but occurs during a visually "quiet" period
  (nothing else moving in frame — Section 7's confirmed-empty scenes) where a
  human eye is more likely to notice ANY motion, including small,
  real, physically-correct motion.
- The magnitude and mechanism (translation vs. rotation vs. mixed) differ
  meaningfully per clip (Section 8) — a stabilizer cannot assume one uniform
  correction shape.

**Yes, a downstream, display-only stabilizer is justified as a product
improvement**, specifically to make small real motion visually calmer during
review, **without** ever telling the scientific pipeline the camera did not
move. This is analogous to Phase 6.2's own display-only atomic deadzone
(`stabilizeGateZone`), which already sits downstream of the scientific gate
resolution without altering it — the same architectural pattern, applied to
whole-scene presentation rather than just gate endpoints.

## 13. Exact Phase 8.1B-2B input contract (Part L)

If Phase 8.1B-2B proceeds:

- **Input**: the existing, validated `cameraPath.framePaths[i].frameToGlobalMatrix`/
  `globalToFrameMatrix` (via `framePointToGlobal`/`globalPointToFrame`) — the
  same signal this phase and Phase 8.1B-1 independently re-validated. **Never**
  a newly, independently recomputed browser-side motion estimate (Section 2's
  entire finding is a cautionary tale about how easily that introduces a
  silent coordinate bug).
- **Coordinate system**: normalized source-frame coordinates, exactly as
  `cameraPath` already stores them — no new coordinate space.
- **Timestamp source**: source frame index / `sourceFrameIndex`, matching the
  existing per-frame lookup contract (Phase 1's "O(1) direct lookup, no
  chain accumulation" design) — never wall-clock or rAF-driven.
- **Transform order**: scientific world/camera transform is resolved FIRST
  and remains completely unchanged; a new, purely presentational
  attenuation/smoothing function may be applied AFTER it, analogous to
  Phase 6.2's atomic deadzone sitting after scientific gate resolution.
  `SCIENTIFIC TRANSFORM → DISPLAY-ONLY STABILIZATION → shared rendered scene`,
  exactly the pipeline the task itself specifies.
- **Where it sits in the rendering pipeline**: downstream of
  `canonicalGeom()`/`projectWorldStep()`'s existing per-frame resolution,
  upstream only of the final CSS/canvas paint — never upstream of, or mixed
  into, the `cameraPath` artifact itself, calibration, or any scientific
  value.
- **Which layers receive it**: whichever layers already consume the shared
  world-locked chain today (gates, zone polygons, contacts, step markers,
  step labels) — must remain uniform across all of them, exactly as Phase
  6.5's shared wrapper transform already guarantees for Auto Follow, so nothing
  can visually detach from anything else.
- **What must remain presentation-only**: the stabilizer's output may only
  ever change *where a pixel is drawn on screen*. It must never write back
  into `cameraPath`, calibration, contacts, timing, zone classification, or
  any persisted/scientific artifact, and must never change what
  `computeSprintMeasurements` or any metric consumes.

## 14. Activation recommendation (Part M)

**Do not** hardcode "freeze after athlete exit" — Phase 8.1A's own Part P
already showed drift onset has no reliable fixed-offset relationship to
zone-exit, last-contact, or last-pose-evidence timing across benchmarks
(Vanni 240's onset was actually *before* its last pose frame; Vanni 120/60's
onset was 58–110 frames after). An evidence-based contract instead:

- Activation should be driven by the **magnitude of already-resolved,
  already-validated `cameraPath` motion itself** (e.g., cumulative
  displacement of a representative world point since a rolling reference,
  computed from the existing transform — not a new estimate), not by athlete
  state. Real motion below a small, evidence-derived threshold (the ~0.5–1 px
  band this phase and Phase 8.1B-1 found as the noise floor of a well-behaved
  `anchored` segment) needs no stabilization at all; real motion above it is
  exactly what a coach would want smoothed for calmer review, regardless of
  whether the athlete happens to still be in frame.
- Athlete-exit/zone-exit signals may be used as *auxiliary* context (e.g., to
  decide default UI framing, not to gate whether stabilization mathematically
  applies), never as the sole trigger.
- The stabilizer must remain continuous across the exit transition — no
  discontinuous jump when the athlete leaves, since the underlying
  `cameraPath` transform itself is already continuous (Section 9's residual
  tables show smooth, gradual change, never a step).

## 15. Raw vs. stabilized-view recommendation (Part N)

Recommend **both**, architecturally: a **Stabilized Review View** (default,
for coach review) with the display-only correction from Section 12 applied,
and the existing **Raw Camera View** (identity, exactly today's behavior)
always available. Two design options exist:

1. **A dedicated, independent toggle** ("Stabilized View: ON/OFF"), separate
   from Auto Follow — recommended, because stabilization (small-shake
   correction on an otherwise-static or already-following view) and Auto
   Follow (large-scale athlete-tracking pan/zoom) address different problems
   and a coach may want either independently (e.g., stabilized + Auto Follow
   off, to review a static wide shot with shake removed but no zoom).
2. **Folding it into Auto Follow's existing state machine** — not
   recommended as the primary design, since Auto Follow already has a
   distinct purpose (following the athlete) and Phase 6.5 explicitly
   documents Auto Follow OFF as returning pure identity; conflating the two
   would break that clean, already-tested guarantee and make "OFF truly
   means OFF" a mixed statement again.

No UI was implemented — this is an architecture recommendation only.

## 16. Forensic-tooling correction (Part O)

`scripts/phase-8-1a-raw-source-motion-control.py` is **fixed in place**
(not retired), so it remains a correct, reusable reference rather than a
permanently-quarantined artifact:

- Added `rotation_code_for(video_path)`, reading `cv2.VideoCapture`'s own
  `CAP_PROP_ORIENTATION_META` (the same signal this whole investigation used
  to discover the bug), mirroring the production worker's
  `rotation_code_for_angle()` convention.
- `read_frames_at` now applies the matching `cv2.rotate(...)` to every
  decoded frame before any feature detection.
- The applied rotation is recorded per-benchmark in the output JSON
  (`rotationCodeApplied`) so a future stale/uncorrected result can never
  again look identical to a corrected one — this is the deterministic
  orientation guarantee Part P's tests check directly against the live
  source.
- The module docstring now documents the historical bug, its real impact,
  and points to the two reports (8.1B-1, 8.1B-2A) that independently
  re-derived corrected results.
- **Regenerated `tmp/phase81a/raw-source-motion-control.json`** with the fix
  applied for all four benchmarks — Gav correctly shows `rotationCodeApplied:
  "none"`; all three Vanni clips show `"ROTATE_180"`. The regenerated
  Vanni 240/60/120 numbers are consistent with this phase's and Phase
  8.1B-1's independently-built `phase-8-1b1`/`phase-8-1b2a` scripts (e.g.
  Vanni 240's fixed-old-script cumulative (−5.58, +4.11) closely matches this
  phase's new-script AVA/sparse-flow values at the same frame, (−5.28/−5.65,
  +4.22/+3.85) — a third, independent cross-check of the same conclusion).
- **Disclosed, not changed**: the old script's own `avaGateStartC1Dx/Dy` and
  `avaBgCenterDx/Dy` output fields report each axis's own *independent*
  maximum (the frame where |Δx| peaks and the frame where |Δy| peaks can
  differ) — a pre-existing Phase 8.1A design characteristic, not a bug this
  phase introduced or was asked to change. This phase's own
  `phase-8-1b1`/`phase-8-1b2a` scripts instead report simultaneous,
  same-frame (x, y, rotation) tuples, which is the comparison actually used
  to reach every conclusion in this report — the old script's per-axis-max
  fields should be read as a rougher, historical diagnostic only.

## 17. Files changed

**None in `src/`.** Forensic-only changes:

- **Fixed**: `scripts/phase-8-1a-raw-source-motion-control.py` (Section 16).
- **New**: `scripts/phase-8-1b2a-cross-benchmark-adjudication.py`,
  `scripts/phase-8-1b2a-visual-sheets.py`,
  `scripts/phase-8-1b2a-cross-benchmark-sanity.mjs`,
  `docs/phase-8-1b2a-cross-benchmark-camera-motion-validation.md` (this file).

## 18. Tests

`scripts/phase-8-1b2a-cross-benchmark-sanity.mjs` — **20/20 PASS**: rotation
correction recorded for both new benchmarks, Vanni 120's prior correction
still intact, the fixed old script's rotation-detection/application code
present and its regenerated output correctly differentiates Gav (no
rotation) from all 3 Vanni clips (`ROTATE_180`), multi-method and manual-
anchor determinism, AVA state well-formedness, coordinate-system agreement
(<2.5 px proving matched orientation), forensic-script non-invasiveness, and
pose-artifact hash pinning.

## 19. Scientific regression

All rerun against current, live artifacts — zero failures, zero value changes:

| Suite | Result |
|---|---|
| Phase 8.1A drift-forensic sanity (rerun) | 33/33 PASS |
| Phase 8.1B-1 adjudication sanity (rerun) | 15/15 PASS |
| Phase 6.2 world-lock (`phase-6-2-world-lock:sanity`) | 23/23 PASS |
| Phase 6.5 presentation camera (`phase-6-5-presentation-camera:sanity`) | 26/26 PASS |
| Phase 6.6B Part A (`phase-6-6b-part-a-instrumentation:sanity`) | 5/5 PASS |
| Phase 6.6B Part B (`phase-6-6b-part-b-presentation-sync:sanity`) | 18/18 PASS |
| Phase 6.6C (`phase-6-6c-authoritative-zone-visualization:sanity`) | 13/13 PASS |
| Phase 7.3B (`phase-7-3b-temporal-state:sanity`) | 11/11 PASS |
| Phase 8.0A forensic reconstruction (rerun) | 28/28 PASS |
| Phase 8.0B overlay-label sanity (rerun) | 32/32 PASS |
| Phase 8.1B-2A cross-benchmark sanity (new) | 20/20 PASS |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | succeeds (dev server safely stopped first, then restarted) |

## 20. Anything not personally validated

- Gav's classification (`INSUFFICIENT_EVIDENCE`, Section 10a) is a
  by-necessity limited conclusion — its short tail simply does not contain
  enough real elapsed time to test the same hypothesis the Vanni clips
  allowed.
- The robust-feature (ORB, stride-5) and phase-correlation methods' larger
  residuals were again interpreted (as in Phase 8.1B-1) as expected
  consequences of coarser sampling and translation-only modeling,
  respectively, rather than isolated via a dedicated ablation for these two
  new benchmarks specifically.
- Manual anchor selection was again performed by visual inspection by the
  author of this audit, not by an independent second reviewer.
- The `fence_post` anchor's real-world identity (which specific post it
  actually tracked once it jumped) was not further investigated beyond
  noticing and excluding the failure — sufficient to disqualify it from the
  evidence base, not to explain the repetitive-structure risk in general.
- The proposed Phase 8.1B-2B architecture (Sections 12–15) is a
  recommendation only — no prototype, performance measurement, or UX
  validation of an actual stabilizer was performed, per this task's explicit
  "do not implement" instruction.
- The exact physical cause of each clip's real camera motion (what moved the
  tripod/camera) remains undetermined from video evidence alone, as in Phase
  8.1B-1.

## 21. Git status

- `HEAD` unchanged; no commit made.
- No push, no `db:reset`, no database mutation (only read-only `sessions`/
  `analyses`/storage queries).
- Zero files under `src/` changed by this phase.
- One forensic script fixed in place (`scripts/phase-8-1a-raw-source-motion-control.py`),
  three new scripts, one new report — all under `scripts/`/`docs/`, all
  additive or forensic-only.
- `tmp/phase81b2a/` (generated evidence) and the regenerated
  `tmp/phase81a/raw-source-motion-control.json` are gitignored (`/tmp/` in
  `.gitignore`), matching all prior phase precedent.
- Regression build procedure followed the task's explicit safety
  instruction: the live `npm run dev` process was stopped before `npm run
  build` ran, and cleanly restarted afterward (verified `200` on `/` and
  `/login` post-restart) — no `.next` corruption.
