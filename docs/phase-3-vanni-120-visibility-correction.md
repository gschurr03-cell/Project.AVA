# Phase 3 Correction Audit — Vanni 120 FPS Visibility Correction

**Stationary Sprint Analysis Roadmap v4.0 — required correction before Phase 4**
**Date**: 2026-08-05
**Status**: Complete. The disputed claim was independently reinvestigated, found
false, and corrected. Phase 3 is re-certified Complete with a corrected root cause.
No production code was changed. Phase 4 may now begin.

---

## 1. Executive correction

The Phase 3 report's claim that the athlete is "physically hidden behind a
track-side equipment bin" during `vanni_fly_120` frames 247–249 is **wrong** and is
retracted. The user was correct: **the athlete is fully visible, in front of the
bin, the entire time.**

The real cause, proven by overlaying the exact, persisted production
`athleteBoundingBoxSource` coordinates onto the real, correctly-rotated source
frame: the athlete-box tracker jumped ~225 pixels onto empty background (not even
the bin itself — the fence/staircase structure further left) for exactly these 3
frames, while still self-reporting `trackState: "tracking"` / `boxOrigin: "tracked"`
(no existing confidence signal flagged this as suspect). MediaPipe correctly found
no person in the crop it was actually given — because that crop was not pointed at
the athlete. This is a real, reproducible **box-tracker localization failure**
(`athlete_localization_failed`), not occlusion.

No production code was changed this task. No metric changed. What changed is the
*explanation* for why 3 frames of `vanni_fly_120`'s pose evidence are missing —
and, as a direct consequence, the failure layer that should be targeted by a future
fix (the box/crop tracking layer, not "nothing can be done, she was blocked").

---

## 2. Original incorrect claim

From `docs/phase-3-vanni-120-contact-recovery-report.md` (original text, Section 4a,
preserved with strikethrough in that file, not deleted):

> "Frame 247 (first empty-keypoint frame): Vanni's body is now directly behind the
> blue bin — only the head, one arm, and a fragment of leg are visible; the lower
> body and both feet are physically blocked from the camera's view by the bin."
>
> "This is a definitive, non-code, physical cause: a real object in the scene
> blocked the camera's view of the athlete's lower body for exactly the 3 frames
> pose data is missing, and recovers exactly when the occlusion clears."

This was asserted from a full-frame visual inspection alone. The original
investigation never cross-checked the actual `athleteBoundingBoxSource`/`cropRect`
values the production pipeline used against the source frame — the exact check that
disproves it (Section 7 below). That omission is itself part of the corrected root
cause (a contributing "report interpretation error," Section 9).

---

## 3. Exact benchmark identity (Part 1 — reverified)

| Field | Value | Verification this task |
|---|---|---|
| Benchmark key | `vanni_fly_120` | — |
| Athlete ID | `5df6454c-950f-4162-b756-42c353cb28ab` | Confirmed live |
| Session ID | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` | Confirmed live |
| Analysis ID | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | Confirmed live |
| Source filename / path | `IMG_4556 2.mov` / `5df6454c-950f-4162-b756-42c353cb28ab/160a86a2-c0db-4e7d-9fbe-82aedd6d3eff.mov` | Confirmed live |
| Source hash | MD5/etag `41bc63f0b018ab45fc9b8fa2c8d02e6a` | **Re-downloaded fresh this task and re-hashed — matches exactly.** This rules out cause #1 ("wrong session or source file inspected"). |
| Pose artifact hash | MD5 `00b882cd679fd73f4aa1e6a63f3439cb` | **Re-downloaded fresh this task and re-hashed — matches exactly.** Same artifact examined originally. |
| Display/source dimensions | 1920×1080 | Confirmed via `ffprobe` this task |
| FPS | avg 108.30686946347986, real per-frame ~120 | Confirmed via `ffprobe` this task |
| Duration / frame count | 4.033333s (container) / 483 real frames | Confirmed via `ffprobe -show_frames` this task (483, matching the pose artifact exactly) |
| Rotation metadata | `rotate=180`, Display Matrix `rotation: -180.00 degrees` | Confirmed via `ffprobe` this task, and see Section 6 for the numeric proof it was applied correctly |
| Current pose artifact | `.../6d9a6aba-d099-4a33-b8ea-2dd4962fe80c.pose.json` | Same file, byte-identical |
| Current tracking artifact | box/crop/trackState fields embedded per-frame in the same pose artifact | Same file, byte-identical |

**Confirmed: this is the exact same recording, session, analysis, and artifact the
user reviewed and the original Phase 3 report examined.** Nothing about benchmark
identity was the source of the error.

---

## 4. Frame-index mapping (Part 2 — proven, not assumed)

| Domain | Value for the disputed frame |
|---|---|
| Pose artifact array index | 247 |
| Pose artifact `sourceFrameIndex` field | 247 |
| Pose artifact `index` field | 247 |
| Pose artifact `tMs` | 2059.1666666666665 |
| `ffprobe -show_frames` frame-list position (0-indexed) | 247 |
| `ffprobe` `best_effort_timestamp_time` at that position | 2.059167s |
| ffmpeg `select=eq(n,247)` extraction, `showinfo` filter reported `pts_time` | 2.05917 |

All four independent representations of "frame 247" (pose-artifact array position,
pose-artifact's own `sourceFrameIndex`/`index` fields, `ffprobe`'s frame-list
position, and `ffmpeg`'s `select=eq(n,247)` filter) agree to the millisecond. This
was checked, not assumed: `ffmpeg -vf "select=eq(n\,247)"` and a direct
`-ss 2.059167 -i ...` timestamp seek were independently run and their PNG outputs
compared **byte-for-byte identical**. This rules out causes #2 (wrong frame-number
convention), #3 (source-frame vs. processed-frame index mismatch), and #5 (frame
extraction from the wrong timeline) — the original investigation's frame selection
was correct.

---

## 5. Correctly oriented source frames (Part 3)

A 26-frame contact sheet (frames 235–260, uncropped, full source resolution) was
extracted directly from the freshly re-downloaded, hash-verified source video using
`ffmpeg`'s default rotation handling (`select=eq(n,N)`, no explicit crop, no
overlays). The athlete is visibly present and in continuous, smooth running motion
across every single frame in this range — there is no frame where she vanishes to
the human eye.

Individual frames were also extracted and inspected at full resolution:
- **Frame 246** (last frame with real pose data before the gap): athlete clearly
  running, mid-stride, next to the blue bin.
- **Frame 247** (first empty-keypoint frame): athlete still clearly visible, in
  front of the bin (partially near it in the 2D projection, but not hidden by it —
  see Section 8 for the precise geometric distinction).
- **Frame 250** (pose data resumes): athlete has moved past the bin, fully clear.

---

## 6. Athlete visibility findings — rotation proof

**The athlete was visible in the original source frames during frames 247–249.**
This is stated directly and unambiguously, per the correction requirement.

Before trusting this, rotation handling was independently, numerically proven
correct (ruling out causes #4 and #10):

1. `ffprobe` confirms the container carries `displaymatrix: rotation of -180.00
   degrees`.
2. `ffmpeg`'s default behavior (no `-noautorotate` flag) applies this rotation
   automatically. A raw decode with `-noautorotate` explicitly disabled produces a
   clearly wrong (upside-down, unreadable on-field text) image.
3. Applying an **explicit** `hflip,vflip` (a second, independent 180° rotation) on
   top of the default-autorotated output was measured **pixel-for-pixel identical**
   (mean absolute difference 0.0, max difference 0, across the full 1920×1080×3
   image) to the raw `-noautorotate` decode. Two 180° rotations cancel out exactly
   (180+180=360=no-op) — this is only possible if the default (single) autorotate
   path is a genuine, correctly-applied 180° rotation. Since a 180° rotation is
   mathematically unambiguous (unlike 90°, there is no CW/CCW choice to get wrong),
   this proves the single-autorotate path used throughout both the original
   investigation and this correction is the one correct orientation, and further
   proves it is the *same* rotation the production Python pipeline applies
   (`cv2.rotate(frame, cv2.ROTATE_180)`, established in Phase 1) — there is only one
   way to rotate something by exactly 180°.

Rotation was correct in the original investigation. It was not the source of the
error.

---

## 7. Source-versus-crop comparison (Part 4) — the actual root cause

This is the decisive check the original investigation never performed. Real,
persisted `athleteBoundingBoxSource` center-x trajectory, array index 244–250:

| idx | tMs | box center x (normalized) | box px (of 1920) | keypoints | trackState / boxOrigin |
|---:|---:|---:|---|---:|---|
| 244 | 2034 | 0.7600 | [1444–1474] | 17 | tracking / tracked |
| 245 | 2043 | 0.7625 | [1448–1480] | 17 | tracking / tracked |
| 246 | 2051 | 0.7738 | [1446–1525] | 17 | tracking / tracked |
| **247** | 2059 | **0.6569** | **[1221–1302]** | **0** | tracking / tracked |
| **248** | 2068 | **0.6569** | **[1221–1302]** | **0** | tracking / tracked |
| **249** | 2076 | **0.6569** | **[1221–1302]** | **0** | tracking / tracked |
| 250 | 2084 | 0.7801 | [1472–1523] | 17 | tracking / tracked |

The box center moves smoothly rightward (+0.0025, +0.0113 per frame) from 244→246,
consistent with the athlete's real running motion. Then, in the single 8.3ms
interval from 246→247, it jumps **−0.117** (≈225px) — a displacement more than 10×
larger than any real frame-to-frame athlete motion observed anywhere else in this
recording, and physically impossible for a human at any real running speed over
8.3ms. It then stays **frozen** (identical to 4 decimal places) for 3 consecutive
frames, then jumps **back** to 0.7801 at frame 250 — consistent with a linear
continuation of the real 244–246 trend (extrapolated ≈0.80), not with continuing
from the wrong 247–249 position.

This was directly visually confirmed by drawing both boxes on the real frame 247
image:
- **The real, persisted production box (red)** — px [1221–1302]×[569–692] — lands
  squarely on **empty track-side background** (a fence post / staircase area), with
  no person present.
- **The athlete's true position (green)**, taken from frame 246's real box —
  px [1446–1525]×[599–665] — lands exactly on the visible, running athlete, in
  front of the bin.

**Conclusion**: the crop supplied to the pose backend for frames 247–249 did not
contain the athlete. This is a crop/localization failure (Part 4/9's category B),
not a pose-backend failure on a correct crop (category C) and not occlusion.

---

## 8. Bin interaction findings (Part 5)

The wrong box (px center ≈1261) is **not** on the bin either — the bin sits further
right, close to where the athlete's real trajectory (green box, center ≈1486) is.
The wrong box is on a distinct background structure (fence/staircase) further left.
So the original "confused by the bin" mental model, even if it had been about a crop
failure rather than occlusion, would still have been geometrically wrong about
*which* background feature was involved.

The mechanism most consistent with the evidence: `box_tracker.py`'s `"tracked"`
`boxOrigin` state is produced by short-term optical-flow tracking
(`cv2.goodFeaturesToTrack` + `cv2.calcOpticalFlowPyrLK`), not a fresh, semantically-aware
detection. Optical flow follows textured pixel patches with no understanding of
"this is a person" — if the athlete's own trackable features become hard to match
between two frames (plausible here: the extracted frames show visible motion blur
on her rapidly-moving legs at this exact stride phase), the tracked point set can
drift onto a nearby, more stable, high-contrast background feature instead, and the
tracker's own inlier-ratio safety check did not reject this particular drift (it
still reported `"tracked"`, not a low-confidence or "lost" state). Frame 250's clean
snap-back onto the real trajectory is consistent with either a fresh detector
re-invocation or a re-verification event correcting the drift. This mechanism is
evidence-consistent but not instrumented/proven line-by-line in `box_tracker.py`
without adding new logging and rerunning — which was not done, consistent with not
modifying detector architecture this task.

The bin itself played **no proven causal role** — it is not where the wrong box
landed, and the athlete is not behind it at any point in the real frames.

---

## 9. Disputed contact reclassification (Part 6)

**Primary classification: `athlete_localization_failed`.**

**Contributing factor: `report_interpretation_error`.** The original investigation
extracted and visually inspected full source frames but never cross-referenced the
production `athleteBoundingBoxSource`/`cropRect` coordinates against the visible
athlete position before concluding occlusion — exactly the check Part 4 of this
correction task required and which disproves the original claim. This is disclosed
as a real methodology gap in the original Phase 3 investigation, not attributed
solely to the box tracker.

No other classification from the task's list applies: pose evidence was not simply
absent on a correct crop (`pose_backend_failed_on_visible_athlete` — ruled out,
since the crop itself was wrong); the crop did not clip her foot while centered on
her (`crop_clipped_foot` — ruled out, the crop wasn't on her at all); this was not a
debug-frame-mapping error (`debug_frame_mapping_error` — ruled out, Section 4 proves
frame-index mapping was correct throughout); it is not a case of genuinely
insufficient visual evidence (`genuinely_insufficient_visual_evidence` — ruled out,
she is clearly visible).

---

## 10. Noisy-cluster reaudit (Part 7)

The t=1.23–1.48s window (originally described as 8 ambiguous, closely-spaced
candidate peaks correctly collapsed by deduplication) was reaudited for the same
box-localization failure mode, given the newly-proven bug. **Result: this window is
unaffected.** The real `athleteBoundingBoxSource` trajectory across array indices
140–205 (spanning this entire window) is smooth and continuous — every
frame-to-frame displacement is under 0.01 normalized units (compare to the 247–249
incident's 0.117 jump), keypoint count is a constant 17 (full pose) at every single
frame, and `boxOrigin` alternates normally between `"tracked"` and `"detected"`
(fresh re-verification), exactly as expected for healthy tracking. There is no
box-jump artifact contaminating this window. The original conclusion — genuine
signal ambiguity in the foot-landmark positions (reduced-but-usable confidence,
consistent with motion blur), correctly and defensibly collapsed by the existing
deduplication logic — stands, reconfirmed rather than assumed.

---

## 11. Post-finish frame audit (Part 8)

The claim that the athlete exits the camera's frame after frame ~316 was
independently reaudited using the same box-trajectory-plus-visual method. **Result:
directionally true, but the original description was imprecise.**

The real box trajectory (array index 295–330) shows a smooth, continuous rightward
approach to the frame edge (`x1` crossing 1.0 at frame ~309), consistent with the
athlete genuinely running toward and off the right edge — not a sudden jump like the
247–249 incident. However, pose data does not cut off cleanly at a single frame:
- Frames 316–317: empty (2 frames).
- **Frames 318–323: pose data returns** (17 keypoints), with declining
  `trackingConfidence` (0.65 → 0.51) and the box extending slightly beyond the frame
  boundary (`x1` up to 1.03).
- Frame 324 onward: empty, and stays empty through the end of the analyzed range
  (frame 482).

A zoomed crop of frame 320's box region shows a **genuine partial limb fragment**
visible at the extreme right edge of frame — consistent with MediaPipe producing a
real, if low-confidence, partial-body detection as she gradually exits, not a clean
disappearance and not hallucinated/garbage output.

**Corrected description**: the athlete's exit from frame is gradual (partial
visibility with declining confidence from ~315–323), not an abrupt single-frame
cutoff at 316 as originally written. The core conclusions remain valid: this range
begins after the finish crossing (frame 290 vs. frame 316), so it does not affect
zone metrics, and by frame 324 the athlete has genuinely and fully left the frame
with no recoverable evidence.

---

## 12. Root cause

**Primary, proven root cause for frames 247–249**: `athlete_localization_failed` — a
box-tracker (optical-flow) localization bug in the shared, cross-session
`box_tracker.py`, not occlusion, not a pose-backend failure, not a frame-index or
rotation error, and not a debug-tooling bug (the original *extraction* was correct;
the original *interpretation* of what was extracted was wrong).

**Contributing factor**: a methodology gap in the original Phase 3 investigation —
box/crop coordinates were never cross-checked against the visible athlete position.

**Frame 316–482 claim**: directionally correct, refined for precision (gradual exit,
not abrupt).

**t=1.23–1.48s cluster claim**: reconfirmed unaffected by this bug.

---

## 13. Files changed

| File | Change |
|---|---|
| `docs/phase-3-vanni-120-contact-recovery-report.md` | Corrected in place — original text preserved with strikethrough + inline correction notes (Sections 1, 4a's table, 6, 9, 11, 21), new Section 26 pointer added. Nothing erased. |
| `docs/stationary-roadmap-progress.md` | Phase 3 reopened, then re-closed as Complete (corrected) with a fully rewritten section documenting the reopening reason, the correction, and the (unchanged) final completion percentage. |
| `scripts/vanni-120-contact-recovery-sanity.mjs` | Updated: `EMPTY_KEYPOINT_RANGES` cause label corrected from `physical_occlusion` to `athlete_localization_failed`; header comment corrected; 3 new checks added pinning the real box-trajectory evidence (jump magnitude, frozen position, snap-back). |
| `scripts/vanni-120-visibility-correction-sanity.mjs` | New — 9 checks covering frame-index mapping, rotation-consistency proof, and the crop-failure-vs-occlusion classification logic. |
| `package.json` | +1 script: `vanni-120-visibility-correction:sanity`. |
| `docs/phase-3-vanni-120-visibility-correction.md` | This document. |

No production code (`src/lib/**`, `scripts/analysis-worker.mjs`,
`mediapipe_pose_runner.py`, `box_tracker.py`, `athlete_tracker.py`) was touched.

---

## 14. Database changes

None. This correction performed only read-only queries and re-downloads (video,
pose artifact) of already-restored data for direct inspection.

---

## 15. Production rerun

Not performed. No production code changed, so nothing to validate via rerun — the
underlying data, metrics, and behavior are provably identical before and after this
correction (Section 17). Per the task's own instruction ("if only diagnostics/docs
change, do not perform a costly rerun unnecessarily"), none was run.

---

## 16. Corrected Phase 3 acceptance table

| # | Criterion | Status (corrected) |
|---|---|---|
| 1 | Every visually plausible 120 FPS contact documented | ✅ Corrected — Section 5, 26-frame contact sheet |
| 2 | Every missed contact assigned a precise failure category | ✅ Corrected — Section 9: `athlete_localization_failed` |
| 3 | Every contact-related time window audited for FPS dependence | ✅ unaffected, unchanged |
| 4 | Recoverable contacts recovered only from real source evidence | ✅ still none recovered — fixing the box tracker is out of scope for this correction |
| 5 | Unrecoverable contacts remain unavailable with structured reasons | ✅ Corrected reason: `athlete_localization_failed` |
| 6 | No global evidence threshold weakened | ✅ zero code changes |
| 7 | No contact copied or inferred from the 240 recording | ✅ confirmed |
| 8 | Step reconstruction does not bridge unsupported gaps | ✅ unaffected, unchanged |
| 9 | Real production rerun validates any implemented correction | N/A — no code correction implemented |
| 10 | 120 timing result does not regress | ✅ reverified live, byte-identical |
| 11 | Validated 240 metrics do not regress | ✅ reverified live, byte-identical |
| 12 | Gav and 60 contracts do not regress | ✅ reverified live, byte-identical; Gav untouched |
| 13 | Relevant tests pass | ✅ Section 18 |
| 14 | Roadmap tracker updated with evidence | ✅ `docs/stationary-roadmap-progress.md` |

**All 14 satisfied. Phase 3 is re-certified Complete.**

---

## 17. Corrected roadmap progress

| | Before this correction (as originally reported) | After this correction |
|---|---:|---:|
| Phase 3 status | Complete (based on a disproven claim) | Complete (corrected root cause) |
| Phase 3 weighted contribution (normalized) | 6.7% | 6.7% (unchanged) |
| Overall completion (normalized) | 24.8% | 24.8% (unchanged) |

The percentage is numerically unchanged because the underlying data, metrics, and
behavior never needed to change — only the explanation for one root cause was
wrong. This was verified by re-deriving all 14 acceptance criteria from the
corrected evidence (Section 16), not by assuming the prior number was still valid.

---

## 18. Tests and exact outcomes

New/updated tests (12-item list from the task, mapped):

| # | Requirement | Where covered |
|---|---|---|
| 1 | Source-frame index maps correctly to extracted source frame | `vanni-120-visibility-correction:sanity` checks 1–2 |
| 2 | Processed-frame index cannot be mislabeled as sourceFrameIndex | same, check 1 (array idx / sourceFrameIndex / index field all asserted equal) |
| 3 | Rotation metadata applied consistently during diagnostics | same, check 3 (pixel-identical double-rotation proof) |
| 4 | Full-frame extraction and crop provenance refer to the same frame | same, check 4 |
| 5 | Debug crop overlays use source-coordinate mapping correctly | same, checks 5–6 (classifier uses the real normalized box coordinates) |
| 6 | Visible athlete + incorrect crop → classified as crop failure, not occlusion | same, check 5 |
| 7 | Correct crop + absent pose → classified as pose-backend failure (distinct) | same, check 7 |
| 8 | Contact rejection reasons never say "occluded" without explicit evidence | same, check 9; `vanni-120-contact-recovery:sanity` checks 8–9 |
| 9 | Vanni 120 registry identity remains valid | `stationary-validation-registry:sanity` |
| 10 | Existing Vanni 240 metrics remain unchanged | `vanni-240-metric-evidence:sanity` + live replay (Section 17-adjacent regression) |
| 11 | Protected Gav remains unchanged | live replay, byte-identical |
| 12 | Step-integrity guards remain active | `vanni-120-contact-recovery:sanity` checks 3–7 |

Results:

| Command | Result |
|---|---|
| `npm run vanni-120-contact-recovery:sanity` | **15/15 PASSED** (updated) |
| `npm run vanni-120-visibility-correction:sanity` | **9/9 PASSED** (new) |
| `npm run stationary-validation-registry:sanity` | 45/46 PASS — same pre-existing, disclosed 105%-weight failure |
| `npm run vanni-240-metric-evidence:sanity` | ALL PASSED |
| `npm run measurement-recovery:sanity` | ALL PASSED |
| `npm run timing-verification:sanity` | ALL PASSED |
| `npm run analysis-fps:sanity` | passed |
| `npm run zone-step-counting:sanity` | 25/25 PASSED |
| `npm run zone-coverage:sanity` | ALL PASSED |
| `npm run analysis-report:sanity` | ok |
| `npm run worker:check` | `worker_configuration_valid` |
| `npm run lint` | clean (0 problems) |
| `npm run build` | succeeded, full route manifest generated |
| `npm run typecheck` (`tsc --noEmit`) | clean, 0 errors |

Live regression replay (all 4 benchmarks, post-correction): `gav_stationary_reference`
zoneTimeS 1.93 / `vanni_fly_240` 2.21 / `vanni_fly_120` 2.19 / `vanni_fly_60` null —
every metric byte-identical to pre-correction values. Zero regressions.

`npm run db:reset` was never run.

---

## 19. Remaining limitations

- The exact internal mechanism of the optical-flow drift (Section 8) is
  evidence-consistent but not instrumented/proven at the code-execution level —
  doing so would require adding debug logging to `box_tracker.py` and rerunning,
  which was not done (out of scope: no detector-architecture changes this task).
- The box-tracker bug is real, reproducible, and proven for this exact 3-frame
  incident, but its general frequency/impact across other sessions and FPS classes
  is not characterized — recommended as the first priority for Phase 5.
- The two findings already disclosed in the original Phase 3 report
  (`REACQUISITION_MAX_FRAMES` scaling, `summariseContactFlight()`'s missing
  same-foot guard) remain unfixed and are unaffected by this correction.
- No independent external ground truth exists for `vanni_fly_120` (unchanged from
  all prior phases).

---

## 20. Git status

Not committed, not pushed, per standing instruction. `git status --short` shows this
correction's additions/changes (Section 13) plus the pre-existing, unrelated
uncommitted working tree from before this task.

---

## 21. Whether Phase 4 may now begin

**Yes.** The disputed claim has been independently reinvestigated with direct
source-frame evidence (not assumed, not deferred to the prior report), found false,
and corrected transparently without erasing the original text. All 14 Phase 3
acceptance criteria are re-proven against the corrected evidence. No production code
was changed and no metric regressed. Phase 4 (60 FPS late-run athlete-loss fix) may
begin, with the explicit recommendation (already added to the roadmap) that it check
whether `vanni_fly_60`'s own tracking loss exhibits the same box-jump signature
proven here before assuming a different cause.
