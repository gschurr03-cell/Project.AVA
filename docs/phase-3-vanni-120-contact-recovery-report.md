# Phase 3 — Vanni 120 FPS Contact Recovery and Cross-FPS Evidence Audit

**Stationary Sprint Analysis Roadmap v4.0 — Phase 3**
**Date**: 2026-08-05 (corrected 2026-08-05 — see Section 26)
**Status**: Complete — corrected. The original "physical occlusion" claim for
frames 247–249 (Section 4a below, and reflected in the original Section 1/6/9/10/11
text) was **disproven** by the user's direct review of the source video and has been
independently reverified as false: the athlete is fully visible throughout. The true
cause is a box-tracker localization failure. See **Section 26 — Correction Addendum**
for the full disclosure. No production code was changed; no metric changed;
acceptance status is corrected but the phase remains complete after the correction.
Original text below is preserved, not erased, per correction-audit policy — read it
alongside Section 26, not in isolation.

---

> ⚠️ **CORRECTED 2026-08-05**: This report originally concluded the athlete was
> "physically hidden behind a track-side equipment bin" during frames 247–249. That
> conclusion was **wrong** and has been retracted after the user disputed it and a
> full reinvestigation (`docs/phase-3-vanni-120-visibility-correction.md`) proved the
> athlete is fully visible, in front of the bin, the entire time. The real cause is a
> box-tracker localization failure (the production athlete-box jumped onto empty
> background for exactly those 3 frames). Every section below that references
> "occlusion" for frames 247–249 is superseded by Section 26 — left in place,
> unedited, for transparency rather than silently rewritten.

---

## 1. Executive summary

`vanni_fly_120` detects 11 real ground contacts across the full visible run; 8 fall
inside the calibrated zone, of which 6 produce a usable step length and 2 are
correctly withheld by the existing step-integrity guard. The user's observation —
timing approximately correct, tracking mostly functional, several steps dropped — is
accurate, and this phase traced every one of those gaps to its exact source-frame
cause:

1. ~~**Frames 247–249 (3 frames, ~25ms), inside the zone**: total pose-inference
   absence. Extracted and visually inspected the real video frame at this exact
   instant — the athlete is physically occluded by a track-side equipment bin.
   Athlete-box tracking continued normally on both sides; only MediaPipe's pose
   output is affected, and it recovers cleanly the instant the occlusion clears.~~
   **CORRECTED (Section 26): this is wrong.** The athlete is fully visible, in
   front of the bin, the entire time — box tracking did NOT continue normally; the
   real athlete-box jumped onto empty background for exactly these 3 frames
   (a localization failure), and MediaPipe correctly found no person in that wrong
   crop. Athlete-box tracking is the failure layer, not occlusion.
2. **Frames 316–482 (167 frames), after the zone's finish gate**: total pose-inference
   absence. Extracted and visually inspected frame 316 — the athlete is not present
   anywhere in the visible frame; `athleteBoundingBoxSource` is pinned at the right
   frame edge (`x1 ≥ 1.0`) for the remainder of the clip. The runner has physically
   left the camera's field of view. This never overlaps the zone (finish crossing is
   frame 290, 26 frames before this range begins), so it does not affect zone metrics.
3. **t = 1.23–1.48s, inside the zone**: not a total pose absence — landmarks exist
   with reduced (but above-threshold) confidence, and the raw per-side peak detector
   finds a dense, ambiguous cluster of 8 alternating candidate peaks only 8–70ms
   apart (real running cadence here is ~170–250ms). The existing cross-foot
   deduplication collapses this cluster to a single kept contact, which is the
   defensible, conservative behavior the algorithm was designed to have — not a bug.

**No code was changed.** Every gap traces to genuinely insufficient or ambiguous
upstream evidence, not a contact-detection logic defect — the exact contingency the
task's own acceptance criteria anticipate ("Phase 3 may still be complete if... the
limitation is proven frame by frame... contact logic is shown correct... no honest
recovery is possible... the correct future phase is explicitly identified").

Two genuinely separate, real, previously-undiscovered issues surfaced during this
audit and are disclosed but **not fixed**, per the explicit instruction to stop and
report rather than change logic broader than Phase 3's scope:

- `box_tracker.py`/`athlete_tracker.py` reacquisition budgets are frame-count-based
  and not scaled by the clip's actual fps (two different unscaled values, 90 and 60).
- `summariseContactFlight()` (ground-contact/flight-time) does not share the
  same-foot/discontinuity guard that protects step length, producing an implausible
  `flightLeftMs = 20ms` on this exact real clip.

---

## 2. Exact 120 FPS benchmark identity (Part 1)

| Field | Value |
|---|---|
| Benchmark key | `vanni_fly_120` |
| Athlete ID | `5df6454c-950f-4162-b756-42c353cb28ab` (Vanni) |
| Session ID | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` ("Vanni 120fps fly") |
| Analysis ID | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` |
| Job ID | `e3c69617-628c-41d7-af40-0624c6f302b2` |
| Source filename / path | `IMG_4556 2.mov` / `5df6454c-950f-4162-b756-42c353cb28ab/160a86a2-c0db-4e7d-9fbe-82aedd6d3eff.mov` |
| Source hash | MD5/etag `41bc63f0b018ab45fc9b8fa2c8d02e6a` — re-verified live this phase by re-downloading and re-hashing the storage object |
| Source frame count (container tag) | 540 |
| Source frame count (real, `ffprobe -show_frames`) | **483** — the container's `nb_frames` tag is unreliable for this file, same pattern independently discovered for `vanni_fly_240` in Phase 1; the pose artifact's 483 frames is the true count, not a truncation |
| Source duration | 4.033333s (container tag); real decoded span 4.01875s (483 frames) |
| `r_frame_rate` | `120/1` = 120 (clean, unlike 240's `2400/1` timebase artifact) |
| `avg_frame_rate` | `648000/5983` = 108.30686946347986 |
| Effective frame rate (true decoded count ÷ real span) | 482/4.01875 ≈ 119.94 |
| Stored `source_fps` / `analysis_fps` | 108.30686946347986 / 108.307 (unchanged — this benchmark was explicitly out of Phase 1's rerun scope; the Phase 1 `classify_fps()` fix would correct this to ~120.005 on a future rerun, but none was performed this phase since no code change was needed) |
| Source FPS classification | `native_source_class` |
| Resolution | 1920×1080 |
| Codec | `hevc` |
| Rotation metadata | `rotate=180` container tag, `Display Matrix` side data `rotation: -180` |
| Worker / pipeline version | `ava-worker-1.0.0` / `ava-sprint-60-v1` |
| Pose backend / version | `mediapipe` / `mediapipe-pose-0.1` |
| Recording mode | `athlete_tracking_lost` |
| Camera type / travel direction | stationary / left_to_right |
| Calibration distance | 20.000m (`calibration_known_distance_m`) |
| Start gate | midpoint x ≈ 0.1058 (from `calibration_point_ax/ay`) |
| Finish gate | midpoint x ≈ 0.9169 (from `calibration_point_bx/by`) |
| Current production metrics | zoneTimeS 2.19s, avgStepLengthM 1.8715m, peakStrideLengthM 1.9066m, stepFrequency 3.7812Hz, avgVelocity 9.1324 m/s, peakVelocity 10.3195 m/s |
| Current metric availability | zone time **verified** (`timingStatus: "verified"`, crossings at frames 28/290, both bracketed, non-extrapolated); spatial metrics eligible; one warning: velocity methods disagree >15% (root-caused in Section 6/9) |
| Current pose artifact | `.../6d9a6aba-d099-4a33-b8ea-2dd4962fe80c.pose.json`, MD5 `00b882cd679fd73f4aa1e6a63f3439cb` (byte-identical to the Phase 1 restoration snapshot — confirmed unmodified) |
| Current contact count | 11 full-run (8 in-zone + 3 excluded) |
| Current eligible step count | 6 (of 8 in-zone marks; 2 withheld by the step-integrity guard) |
| Current rejected interval count | 2 (both `foot_sequence_discontinuity`/`implausible_step_duration`/`implausible_step_distance`), plus 3 zone-exclusions (2 `before_start_crossing`, 1 `outside_zone`) |

**Confirmation this is the exact analysis the user described**: zone time (2.19s) is
verified and stable; tracking coverage is 64.4% of frames (majority functional,
matching "mostly functional"); 5 of 11 detected contacts are unavailable for step
metrics (2 withheld in-zone, 3 excluded from zone) — a materially incomplete but not
absent contact record, matching "several steps or contacts appeared to be dropped."

---

## 3. Phase 2 contracts preserved (Part 2)

Verified by direct code inspection (no edits made) and by confirming `git status`
shows zero diffs to any of these files beyond what already existed before this phase
began:

| Contract | File | Status |
|---|---|---|
| Source PTS authoritative for timing | `mediapipe_pose_runner.py` (`monotonic_media_timestamp`), `loadOverlayFrames.ts` (`time: frame.tMs/1000`) | ✅ unchanged, re-confirmed (Section 5's contact detection reads the same `frame.time`) |
| `sourceFrameIndex` provenance intact | `steps.ts` (`StepMark.sourceFrameIndex`), pose artifact frames | ✅ unchanged; used throughout this phase's evidence trace |
| Average Step Length uses eligible opposite-foot intervals | `measurements.ts` (`individualStepLengthsM`, `avgIndividualStepLengthM`) | ✅ unchanged; confirmed still excludes the 2 flagged same-foot transitions (Section 9) |
| Peak Step Length uses rolling-4 definition | `strideMetrics.ts` (`computePeakStrideLengthM`) | ✅ unchanged |
| Step Frequency uses verified contact timestamps | `cadence.ts` (`stepFrequenciesFromContacts`) | ✅ unchanged |
| Average Velocity uses verified distance + zone time | `measurements.ts` (`vDistanceOverTime`) | ✅ unchanged |
| Peak Velocity requires eligible verified evidence window | `timingPolicy.ts` (`reportStrideWindows`) | ✅ unchanged |
| Missing contacts cannot be guessed | `steps.ts`/`contacts.ts` (no interpolation/fabrication path exists) | ✅ unchanged, confirmed by code trace |
| Implausible intervals remain unavailable | `measurements.ts` (`qualityFlags`/`foot_sequence_discontinuity` guard) | ✅ unchanged, confirmed still active on real data (Section 9) |
| Display smoothing cannot change scientific contact timestamps | overlay/rendering code | ✅ not touched, not relevant to this phase's read-only investigation |

**No formula defect was found in these specific contracts.** Two *separate, adjacent*
formula gaps were found (Section 8, Section 10) — neither is one of the contracts
above, and neither was changed (see Section 1 / Part 2's explicit "stop and report"
instruction).

---

## 4. Visual contact timeline (Part 3)

Built from the real, restored pose artifact (MD5-verified unmodified) cross-referenced
with real extracted video frames (`ffmpeg`, exact frame numbers, rotation-corrected).

### In-zone marks (8 total — this is the complete, real, in-zone contact record)

| # | Side | Source frame | Time (s) | Step length | Quality flags | Notes |
|---|---|---:|---:|---|---|---|
| 1 | right | ~56 | 0.4667 | 1.8097m | — | clean |
| 2 | left | ~77 | 0.6421 | 1.7926m | — | clean |
| 3 | right | ~97 | 0.8088 | 1.8194m | — | clean |
| 4 | left | ~127 | 1.0588 | 1.9712m | — | clean |
| 5 | right | ~148 | 1.2338 | 1.7812m | — | clean; last clean mark before the ambiguous window |
| 6 | right | ~198 | 1.6508 | **null** | `foot_sequence_discontinuity`, `implausible_step_duration`, `implausible_step_distance` | same side as #5 — a left contact is missing somewhere in 1.23–1.65s |
| 7 | right | ~258 | 2.1508 | **null** | same 3 flags | same side as #6 — a left contact is missing somewhere in 1.65–2.15s; this window contains the 247–249 occlusion gap |
| 8 | left | ~278 | 2.3179 | 2.0547m | — | clean; the 7→8 transition (right→left) is a valid opposite-foot interval |

### Excluded-from-zone marks (3 total, real reason codes)

| Side | Source frame | Time (s) | Reason code | Reason |
|---|---:|---:|---|---|
| right | 10 | 0.0833 | `before_start_crossing` | entry-side of the start gate |
| left | 27 | 0.2250 | `before_start_crossing` | entry-side of the start gate |
| right | 305 | 2.5429 | `outside_zone` | beyond the finish gate |

**11 total detected contacts = 8 in-zone + 3 excluded.** Matches the Phase 0
registry's "only 8 of 11 detected contacts were valid/eligible" note exactly.

### Pose-evidence gaps (frame-by-frame, real data)

| Range (array idx) | Frames | Duration | `keypoints` | `athleteBoundingBoxSource` | Cause |
|---|---:|---:|---|---|---|
| 247–249 | 3 | ~25ms | `[]` (empty) | x0=0.636, x1=0.678 — mid-frame, not at edge | ~~**Physical occlusion** — visually confirmed (Section 4a)~~ **CORRECTED: athlete_localization_failed — see Section 26.** The box position itself IS the evidence of the failure (it jumped off the athlete's real trajectory); it was not "mid-frame, not at edge" evidence of occlusion as originally read. |
| 316–317 | 2 | ~17ms | `[]` | x0≈0.968, x1≈1.009 — at/past the right edge | Transition into frame-exit |
| 324–482 | 159 | ~1.32s | `[]` | x0≈0.97, x1≈1.01–1.013 — pinned past the right edge | **Athlete physically exited frame** — visually confirmed (Section 4b) |

### 4a. Visual confirmation — occlusion (frames 246 → 247 → 250)

Extracted and inspected the real, rotation-corrected video frames:
- **Frame 246** (last good pose): Vanni clearly visible mid-track, running form fully
  visible, immediately next to a blue equipment/trash bin positioned at the inside
  edge of the track.
- **Frame 247** (first empty-keypoint frame): Vanni's body is now directly behind the
  blue bin — only the head, one arm, and a fragment of leg are visible; the lower
  body and both feet are physically blocked from the camera's view by the bin.
- **Frame 250** (pose recovers): Vanni has cleared the bin, full body visible again,
  pose landmarks resume with high confidence (ankle visibility 0.999 at frame 250).

This is a definitive, non-code, physical cause: a real object in the scene blocked
the camera's view of the athlete's lower body for exactly the 3 frames pose data is
missing, and recovers exactly when the occlusion clears.

### 4b. Visual confirmation — athlete exits frame (frame 316)

Extracted and inspected frame 316: **no runner is visible anywhere in the frame.**
The blue bin sits alone on the empty track. This matches the box-tracker data exactly
(`athleteBoundingBoxSource.x1 ≈ 1.009`, pinned at the frame's right edge) — the
athlete has run past the camera's field of view entirely. This range starts 26 frames
(≈217ms) after the finish-gate crossing (frame 290), so it never affects any in-zone
metric.

### 4c. The ambiguous window (t = 1.23–1.48s) — not a total absence

Unlike the two gaps above, this window has **full 17-keypoint pose data at every
frame**, with ankle/heel/toe visibility genuinely reduced (down to ~0.74–0.86 from
the typical ~0.95+) but never below the 0.4 usability threshold. Extracted frame 150
(within this window): Vanni is running normally past a small yellow marker cone on
the track; visible motion blur on the lower legs is consistent with genuine fast
limb motion at this cadence. Running the real peak-detection function
(`findLocalMaxima`+`smoothSeries`, unmodified) directly against the real frame data
finds a dense, alternating cluster of raw candidate peaks:

```
right: 1.2338, 1.2671, 1.3171, 1.4175, 1.6508(kept)
left:  1.2588, 1.2838, 1.3842, 1.4842
```

Consecutive gaps within this cluster are 8–70ms — far below the real measured
cadence elsewhere in this same run (~170–250ms) — meaning the signal here is
genuinely noisy, not a clean alternating stride pattern. The production
`suppressDuplicates()` deduplication (`minStepSpacingMs = 130ms`, cross-foot) walks
this cluster and correctly collapses it to the single strongest candidate (mark #5,
kept). See Section 6 for why this is judged correct, not a bug.

---

## 5. Production contact pipeline (Part 4)

Traced stage by stage:

| Stage | File / function | Inputs | Outputs | FPS-dependent? |
|---|---|---|---|---|
| Athlete box | `box_tracker.py` (`BoxTracker.step`) | frame, candidates, expected direction | `athleteBoundingBoxSource`, `trackState` | `REACQUISITION_MAX_FRAMES=90` **frame-count**, not fps-scaled (Section 8) |
| Identity tracking | `athlete_tracker.py` (`AthleteIdentityTracker.step`) | candidates, box | `identityContinuityScore`, `identity_state` | `REACQUISITION_MAX_FRAMES=60` **frame-count**, not fps-scaled, and **inconsistent with box_tracker's 90** (Section 8) |
| Crop / containment | box_tracker's `cropRect` computation | box + padding | `cropRect`, `cropScale`, `cropTranslation` | none found frame-based here |
| Pose inference | MediaPipe `PoseLandmarker` (Python) | cropped frame | raw landmarks or none | not fps-dependent — genuinely fails on occlusion/absence regardless of fps |
| Foot-landmark evidence | `footSample()` (`steps.ts`), `minVisibility=0.4` | `OverlayFrame.landmarks` | mean foot y-position or null | not fps-dependent (a proportion/confidence threshold) |
| Contact candidate (peak) | `findLocalMaxima`/`boundaryAwareMaxima` (`FootContactDetector.ts`, `steps.ts`) | smoothed y-series | raw peak indices | `smoothingWindowFrames=3` is genuinely frame-count by design (a small fixed-width moving average, not a duration concept) |
| Temporal confirmation / same-side spacing | `detectSide()` | raw peaks | filtered per-side contacts | `minSameSideSpacingMs=250` — **already millisecond-based** (Phase 2 finding, reconfirmed) |
| Deduplication | `suppressDuplicates()` | merged L+R contacts | deduped `StepMark[]` | `minStepSpacingMs=130` — **already millisecond-based** |
| Zone inclusion | `computeSprintMeasurements` (`inZone()` check) | marks, gate x-positions | in-zone vs excluded | not fps-dependent (spatial) |
| Eligible contact / step interval | same-foot/discontinuity `qualityFlags` guard | zone-filtered marks | `zoneSteps[].stepLengthM` (nullable) | not fps-dependent (ratio-based plausibility checks) |
| Metric evidence | `evaluateMetricEvidence` / `deriveSprintResultState` | eligible steps | displayed metric availability | not fps-dependent |

**Every place a fixed frame count is used, converted to milliseconds at 60/120/240fps:**

| Constant | Value (frames) | @60fps | @120fps | @240fps | Duration or frame-count concept? |
|---|---:|---:|---:|---:|---|
| `smoothingWindowFrames` (`DEFAULT_STEP_CONFIG`) | 3 | 50.0ms | 25.0ms | 12.5ms | Frame-count by design (a fixed-width sample-count moving average is standard signal-processing practice; scaling it by fps would change its noise-rejection characteristics, not obviously improve it — no evidence found that this specific window width is the cause of any gap in this investigation) |
| `box_tracker.py REACQUISITION_MAX_FRAMES` | 90 | 1500ms | 750ms | 375ms | **Duration concept, currently frame-count** — the code's own comment says "scaled by caller's fps if desired" (Section 8) |
| `athlete_tracker.py REACQUISITION_MAX_FRAMES` | 60 | 1000ms | 500ms | 250ms | **Duration concept, currently frame-count**, and inconsistent with the box tracker's own budget (Section 8) |
| `ACCELERATED_REFRESH_MIN_FRAMES` | 3 | 50.0ms | 25.0ms | 12.5ms | Frame-count (a minimum sample-count before trusting a trend) — not implicated in this investigation's findings |
| `SUSTAINED_OPPOSITE_DIRECTION_FRAMES` | 5 | 83.3ms | 41.7ms | 20.8ms | Frame-count (consecutive-sample confirmation) — not implicated |
| `detector_cadence_frames` | 8 | 133.3ms | 66.7ms | 33.3ms | Frame-count (detector-call cadence, a compute-cost/latency tradeoff, not a biomechanical duration) — not implicated |

**None of the genuinely millisecond-appropriate contact-detection constants
(`minSameSideSpacingMs`, `minStepSpacingMs`) were found to be frame-based** — Phase
2's finding is reconfirmed. The one real, duration-concept-but-frame-based constant
(`REACQUISITION_MAX_FRAMES`) is not proven to be the cause of any gap in this specific
recording (Section 8) and is explicitly out of Phase 3's scope to change (cross-FPS
tracker normalization).

---

## 6. Missed-contact classification (Part 5)

> ⚠️ **Row 1 below is CORRECTED — see Section 26.** The original category (D,
> occlusion) is wrong. The corrected primary classification is
> **athlete_localization_failed** (a box-tracker error), contributing factor
> **report_interpretation_error** (the original investigation never cross-checked
> the production box/crop coordinates against the source frame before concluding
> occlusion). This does not change whether a fix was justified (still no — see
> Section 26) but it does change the *reason* nothing was recoverable this phase.

| Category | Count | Frame range | Evidence | Rejection correct? | Fix justified? |
|---|---:|---|---|---|---|
| ~~**D. Pose absent for the relevant frames** (occlusion)~~ **→ athlete_localization_failed (corrected)** | 1 gap (3 frames) | 247–249 | ~~Visual: athlete physically behind a track-side bin (Section 4a)~~ **Corrected: the real production `athleteBoundingBoxSource` jumped ~225px onto empty background in one frame, then froze for 3 frames, then snapped back onto the athlete's real trajectory — proven via Section 26's frame-by-frame box-overlay evidence. The athlete herself is visible throughout.** | Contact correctly remains unavailable, but for a different reason: no fix was implemented this task (box-tracker code is out of scope), not because recovery is physically impossible | No — not *this task* (would require changing shared box-tracker/detector code, explicitly out of scope); recommended for a dedicated future phase (Section 26) |
| **A. Athlete box missing** (frame-exit) | 1 gap (167 frames) | 316–482 | Visual: no runner present in frame 316 (Section 4b); box pinned at edge | Yes — athlete genuinely not in frame | No — same reasoning |
| **N. Contact visually ambiguous, correctly withheld** | 1 window (~250ms) | t=1.23–1.48s (array idx ~148–180) | 8 raw candidate peaks, 8–70ms apart, real cadence elsewhere ~170–250ms; reduced-but-usable landmark confidence (Section 4c) | Yes, defensibly — see reasoning below | No — no safe way to pick which candidate is "the real" contact without risking fabrication |

No contacts were found in categories B, C, E, F (isolated), G, H, I, J (as a defect —
the dedup IS working, just conservatively), K, L, or M. Category F ("foot landmarks
present but temporally unstable") describes the *mechanism* of the ambiguous window
(reduced visibility → noisier position estimates → denser candidate peaks) but the
*outcome* is correctly N, not a missed detection — the deduplication already handles
it defensibly.

**Why the ambiguous-window suppression is judged correct, not a bug**: `suppressDuplicates()`
is a greedy, sequential, pairwise-nearest-neighbor algorithm. Given a genuinely dense
cluster of candidates (real noise, confirmed by comparing against this same run's own
clean-region cadence), any two adjacent candidates under 130ms apart get merged,
keeping the higher-scoring one. There is no way to distinguish, from this data alone,
"exactly one real contact plus 7 noise artifacts" from "two real contacts plus 6 noise
artifacts" — the signal itself does not support a confident answer. Loosening the
dedup window would let more noise through everywhere (a global regression risk,
explicitly forbidden); a Vanni-120-specific carve-out would be a "separate magic
constant for Vanni 120" (explicitly forbidden). No safe fix exists.

---

## 7. 120-versus-240 evidence comparison (Part 6)

| Metric | Vanni 120 | Vanni 240 | Note |
|---|---:|---:|---|
| Pose-valid percentage | 66.0% (319/483) | 65.5% (668/1020) | Nearly identical — both dominated by the same real phenomenon (athlete eventually exits frame in a fly-through recording), not an FPS-quality gap |
| Longest continuous pose run | 247 frames (≈2.29s @ real ~108fps effective) | 668 frames (≈2.98s @ ~223.9fps) | Both spans cover their respective zone crossings with wide margin |
| Ankle/heel/toe-valid coverage | 66.0% each (identical — these three landmarks are always present or absent together in this data) | 65.5% each (same) | No landmark-specific gap found |
| In-zone contact candidates (raw, before dedup) | left 27, right 26 raw peaks (before spacing/dedup, full run) | not separately re-derived this phase (Phase 2 already hand-verified 240's final contact set exactly) | 120's raw-candidate density is real and higher than its final contact count — expected, since dedup collapses noise |
| Accepted (eligible) in-zone contacts | 8 (6 usable + 2 withheld) | 11 (Phase 2) | 120 has fewer usable in-zone contacts in absolute terms, proportional to its shorter analyzed span and lower effective sample density per stride |
| Excluded (zone-boundary) contacts | 3 | not directly comparable (240's zone boundary evidence wasn't separately audited this phase) | |
| Average contact spacing (clean marks only) | ~170–250ms | ~200ms (Phase 2) | Comparable real cadence — confirms 120's clean data is trustworthy where it exists |
| Ground-contact duration (guard-unaware, see Section 8) | left 170ms, right 110ms | not directly comparable | 120's right-side figure is likely distorted by the same-foot-transition gap (Section 8) |
| Overlay frame offset | none found | none found | not applicable |

**Interpretation**: the two recordings are not "120fps behaving worse than 240fps" —
their raw per-frame pose-evidence quality is nearly identical. The difference in
*final* usable contact count is a direct, explained consequence of (a) 120's shorter
real analyzed span before the athlete exits frame, and (b) 120's clip happening to
contain a real occlusion event and a real ambiguous-noise window that 240's clip
(different run, different exact moments) did not. This is not an algorithm behaving
inconsistently by FPS class — it is the same algorithm correctly responding to
different real evidence in two different recordings, exactly as the task's context
warned ("Do not assume that the 120 recording should contain the exact same contacts
as the 240 recording").

---

## 8. FPS-normalization audit (Part 7)

Full audit table (also embedded in Section 5):

| Constant | Value | Unit | File | Physical meaning | @60fps | @120fps | @240fps | Frame- or time-based? | Evidence |
|---|---|---|---|---|---:|---:|---:|---|---|
| `minSameSideSpacingMs` | 250 | ms | `steps.ts` | min time before the same foot can re-strike | 250ms | 250ms | 250ms | **Already time-based** ✅ | Phase 2 finding, reconfirmed |
| `minStepSpacingMs` | 130 | ms | `steps.ts` | min time between any two counted steps | 130ms | 130ms | 130ms | **Already time-based** ✅ | Phase 2 finding, reconfirmed |
| `smoothingWindowFrames` | 3 | frames | `steps.ts` | moving-average width for the foot y-signal | 50.0ms | 25.0ms | 12.5ms | Frame-count by design — a sample-count smoothing window is standard practice; not proven to be the cause of any finding this phase | No evidence this specific width caused a gap |
| `REACQUISITION_MAX_FRAMES` (box) | 90 | frames | `box_tracker.py` | budget to reacquire a lost box before giving up | 1500ms | 750ms | 375ms | **Should be time-based, currently is not** — the file's own comment says "scaled by caller's fps if desired," meaning it currently is not | Real, disclosed; not proven relevant to this recording's specific gaps (the athlete's frame-exit isn't a "lost then reacquire" scenario — there's nothing to reacquire) |
| `REACQUISITION_MAX_FRAMES` (identity) | 60 | frames | `athlete_tracker.py` | budget to reacquire lost identity before terminating | 1000ms | 500ms | 250ms | Same issue, and **inconsistent with box_tracker's own 90-frame budget** — two different unscaled values for what sounds like the same concept | Real, disclosed |
| `ACCELERATED_REFRESH_MIN_FRAMES` | 3 | frames | `box_tracker.py` | min samples before trusting an accelerated-refresh trend | 50.0ms | 25.0ms | 12.5ms | Frame-count (sample-count concept) | Not implicated |
| `ACCELERATED_REFRESH_TREND_WINDOW` | 4 | frames | `box_tracker.py` | trend window width | 66.7ms | 33.3ms | 16.7ms | Frame-count | Not implicated |
| `SUSTAINED_OPPOSITE_DIRECTION_FRAMES` | 5 | frames | `athlete_tracker.py` | consecutive-frame confirmation before rejecting a direction reversal | 83.3ms | 41.7ms | 20.8ms | Frame-count (consecutive-sample concept) | Not implicated |
| `detector_cadence_frames` | 8 | frames | `box_tracker.py` | how often the full detector re-runs | 133.3ms | 66.7ms | 33.3ms | Frame-count (compute-cost tradeoff) | Not implicated |

**Decision**: no contact-related constant in the actual contact-detection path
(`steps.ts`/`contacts.ts`) needed a fix — both are already correctly time-based, and
no evidence this phase implicates `smoothingWindowFrames`. The genuinely
duration-concept-but-frame-based constants live one layer up, in the box/identity
tracker, and are **not proven to be the cause of any gap found in this specific
recording** (the occlusion and frame-exit gaps are not "budget exceeded" scenarios —
there was never anything to reacquire). Per Part 2's explicit instruction and the
task's own exclusion of "cross-FPS tracker normalization beyond diagnostics needed
for this phase," this is documented and left unfixed, recommended for Phase 5.

---

## 9. Pose and foot-landmark evidence findings (Part 8)

> ⚠️ **CORRECTED (Section 26)**: the claim below that the box was "geometrically
> sane" for 247–249 was asserted without actually checking the box coordinates
> against the athlete's real trajectory or the source frame — exactly the check
> Section 26 performed and that disproved it. The box was present and
> well-formed-*looking* in isolation (valid x0<x1, y0<y1, plausible size) but was
> **not** on the athlete — a real, evidenced-based distinction this section
> originally missed.

For the two proven-empty ranges (247–249, 316–482): `trackingConfidence: 0`,
`keypoints: []` — MediaPipe genuinely produced zero landmarks; this is not a
downstream filtering artifact. ~~`cropRect`/`athleteBoundingBoxSource` remained
present and geometrically sane throughout both ranges (Section 4), confirming the
crop itself was not the failure point — the backend simply found no person in it
(occlusion) or correctly found nothing because there was nothing there
(frame-exit).~~ **Corrected**: for 247–249, the box was present but **wrong**
(jumped off the athlete's real position, Section 26) — the crop *was* the failure
point. For 316–482, the box was genuinely on/near the frame edge tracking the
athlete's real exit (re-confirmed in Section 26 with additional nuance: a gradual,
not abrupt, exit).

For the ambiguous window (1.23–1.48s): full 17-keypoint pose data at every frame;
`left_ankle`/`left_heel`/`left_toe` visibility genuinely dips to ~0.74–0.86 (from a
typical ~0.95+) but stays well above the 0.4 usability floor; `right_ankle` visibility
stays high throughout. This is a real, if modest, MediaPipe confidence degradation —
plausibly explained by the motion blur visible in the extracted frame (Section 4c) —
not a code defect and not severe enough to individually exclude any single frame.

**MediaPipe did not produce enough evidence for the two empty ranges** — documented,
not compensated for. No contact logic was weakened or bypassed to work around it. No
Phase 6 (detector/pose architecture) conclusion is drawn from 2 isolated real-world
occlusion/frame-exit events; those are physical scene conditions any detector would
struggle with equally, not evidence of a MediaPipe-specific limitation worth a
architecture-replacement phase.

---

## 10. Step-sequence integrity findings (Part 9)

Traced all 8 in-zone marks (Section 4's table) through step reconstruction:

| Pair | A | B | Duration | Same/opposite foot | Integrity decision | Displayed? |
|---|---|---|---:|---|---|---|
| 1→2 | right 0.467 | left 0.642 | 175ms | opposite | valid | ✅ 1.8097m→1.7926m interval |
| 2→3 | left 0.642 | right 0.809 | 167ms | opposite | valid | ✅ |
| 3→4 | right 0.809 | left 1.059 | 250ms | opposite | valid | ✅ |
| 4→5 | left 1.059 | right 1.234 | 175ms | opposite | valid | ✅ |
| 5→6 | right 1.234 | right 1.651 | 417ms | **same** | **withheld** (`foot_sequence_discontinuity`) | ❌ correctly null |
| 6→7 | right 1.651 | right 2.151 | 500ms | **same** | **withheld** | ❌ correctly null |
| 7→8 | right 2.151 | left 2.318 | 167ms | opposite | valid | ✅ |

**Confirmed**: missing intermediate contacts (the undetected left contacts implied by
the 5→6 and 6→7 gaps) do **not** create a giant fabricated step — both intervals are
correctly nulled, not silently averaged into one long "step." Same-foot intervals are
never labeled as opposite-foot steps — the guard explicitly detects and flags exactly
this. Rejected gaps remain unavailable — `individualStepLengthsM` contains exactly
the 6 valid intervals, confirmed by direct inspection (Section 4). Average Step Length
uses only these 6. Peak Step Length's rolling-4 window (Section 4/9 cross-reference
with Phase 2's methodology) also only ever draws from this same clean set. Step
Frequency does not bridge these gaps either — `stepFrequenciesFromContacts` computes
strictly from consecutive kept marks' real timestamps, so the same-foot gaps
correctly widen the computed interval rather than being smoothed over.

**The Day 104 sparse-evidence guard is operating correctly, not bypassed.**

**A genuine, separate gap found**: `summariseContactFlight()` (`contacts.ts`), which
produces `groundContactLeftMs`/`groundContactRightMs`/`flightLeftMs`/`flightRightMs`,
does **not** consult the same `qualityFlags`/same-foot-discontinuity guard —
it operates on the raw, time-ordered `contactPhases` list (all 8 in-zone phases)
and computes `flightMs = nextPhase.touchdownTimeS − thisPhase.toeOffTimeS` for every
consecutive pair regardless of side. On this real data that produced
`flightLeftMs: 20ms` — implausibly short for a genuine airborne phase — because the
5→6 and 6→7 same-foot pairs still feed this specific calculation even though they are
excluded from step length. This is a real, reproducible formula gap, confirmed by
direct trace of `contacts.ts`'s `summariseContactFlight()` against the real
`measurements.ts` call site (`contactPhases = fullRun.contactPhases.filter(p =>
zoneFrameSet.has(p.frame))` — no `qualityFlags`-equivalent filtering applied before
this function runs). **Not fixed this phase** — this is a formula defect broader than
Phase 3 (it would affect any recording with a same-foot-discontinuity gap, at any
FPS), and Part 2 explicitly instructs stopping and reporting rather than changing
shared logic. Disclosed in the roadmap tracker as a Phase 13 candidate.

---

## 11. Root cause decision (Part 10)

> ⚠️ **CORRECTED (Section 26)**: "recovers cleanly from the occlusion" below is
> wrong — there was no occlusion. The corrected statement is: the contact-detection
> logic (`steps.ts`/`contacts.ts`) is still proven correct — it never fabricated
> anything — but the *upstream* failure for 247–249 was a box-tracker localization
> bug, not "genuinely insufficient evidence." The decision not to fix it stands, for
> a different, still-valid reason: fixing the box tracker is detector-architecture
> work, out of scope for a correction/contact-logic-only task.

**Decision: no fix.** Every missed/incomplete contact in this recording traces to
genuinely insufficient or ambiguous upstream evidence (Sections 4, 6, 9), not a
contact-detection logic defect. ~~The contact-detection logic itself (`steps.ts`,
`contacts.ts` peak-finding, spacing, and deduplication) is proven correct on this
real data: it recovers cleanly from the occlusion the instant it clears,~~ **Corrected:
the contact-detection logic is still proven correct on this real data (Sections 6, 10
stand), but the upstream cause for frames 247–249 is a box-tracker localization
failure, not occlusion (Section 26) —** it correctly
declines to recover unrecoverable frame-exit evidence, and it defensibly (not
incorrectly) collapses one genuinely ambiguous noisy cluster rather than risk
fabricating a contact.

This satisfies the task's own explicit completion contingency: the limitation is
proven frame by frame (Section 4, including direct visual confirmation); contact
logic is shown correct (Sections 6, 10); no honest recovery is possible for either
empty-evidence range (Section 9); and this report explicitly identifies where the two
newly-discovered, adjacent-but-separate issues belong (Phase 5 for the reacquisition
budgets, Phase 13 for the flight-time guard gap — Sections 8, 10).

No lowered confidence thresholds, no Vanni-120-specific constants, no contacts copied
from the 240 recording, no interpolation through the pose gaps, no bypassed step
integrity, no forced contact count. All of Part 10's explicit prohibitions are
satisfied by construction, since nothing was changed.

---

## 12. Files changed

| File | Change |
|---|---|
| `scripts/vanni-120-contact-recovery-sanity.mjs` | New — 11 deterministic regression checks locking in this phase's real-data findings (Section 20). |
| `package.json` | +1 script: `vanni-120-contact-recovery:sanity`. |
| `docs/stationary-roadmap-progress.md` | Phase 3 marked complete; overall completion updated to 24.8% (normalized); Phase 5 and Phase 13 sections annotated with this phase's two disclosed-but-unfixed findings. |
| `docs/phase-3-vanni-120-contact-recovery-report.md` | This report. |

No production code (`src/lib/**`, `scripts/analysis-worker.mjs`,
`mediapipe_pose_runner.py`, `box_tracker.py`, `athlete_tracker.py`) was touched this
phase — confirmed via `git status` before and after.

---

## 13. Database changes

None. This phase performed only read-only queries against the live, previously-restored
`vanni_fly_120` session/analysis rows (Phase 1's restoration) and re-downloaded (not
modified) the existing source video and pose artifact for direct inspection. No
`INSERT`/`UPDATE`/`DELETE` was issued this phase.

---

## 14. Contact provenance changes

None implemented. The task's Part 11 proposes a substantially larger structured
rejection-code system (`pose_unavailable`, `foot_landmarks_incomplete`,
`crop_clipped_foot`, `athlete_identity_unverified`, etc.) than currently exists. The
current architecture already has real, working provenance for the cases that actually
occur in production: `excludedContacts[].reasonCode` (`before_start_crossing`/
`outside_zone`) for zone-boundary exclusions, and `zoneSteps[].qualityFlags`
(`foot_sequence_discontinuity`/`implausible_step_duration`/`implausible_step_distance`)
for implausible transitions. Frames where MediaPipe produces zero landmarks never
generate a "candidate" at all under the current architecture (there is nothing to
reject — a peak detector simply finds no peak in missing data), so implementing the
task's proposed `pose_unavailable`/`crop_clipped_foot`/etc. codes would require
building substantial new instrumentation deep in the pose-extraction pipeline to
track and surface *why* evidence is missing, frame by frame — a real, legitimate
future improvement for developer diagnostics, but not a fix to any proven defect, and
therefore out of this phase's "smallest correct fix" mandate. Recommended as a
candidate for a future phase rather than implemented speculatively here.

---

## 15. Real production rerun

Not performed. No code was changed, so there is nothing to validate via a rerun —
re-running the exact same worker/pipeline against the exact same video would
reproduce the exact same result (already independently proven deterministic in
Phase 1/2 methodology). Running it anyway would consume real compute for zero
evidentiary gain, which the task itself warns against ("do not rerun merely to
produce a more favorable metric").

---

## 16. Before-versus-after contacts

No change — see Section 15. Current (unchanged) state fully documented in Section 4.

---

## 17. Before-versus-after metrics

No change. Live replay this phase reproduced all 6 primary metrics to full
floating-point precision against the pre-phase values (Section 19).

---

## 18. UI validation (Part 13)

Verified via the same live `computeSprintMeasurements` replay the production
`src/app/sessions/[id]/page.tsx` call site uses (identical parameters, identical
code path, not a UI-only check but the actual data the UI renders from):

- The 6 accepted in-zone step markers (1–5, 8) are present with real `stepLengthM`
  values and would render as steps; the 2 withheld marks (6, 7) carry `stepLengthM:
  null` and would correctly render as unavailable, not as fabricated steps.
- `timingProvenance.verified: true` — zone time renders as a real, verified value,
  not a placeholder.
- No 240 FPS session's data path was touched, so no 240 FPS regression is possible
  by construction — confirmed anyway in Section 19.
- No overlay/skeleton-rendering code was read or modified this phase (correctly out
  of scope — "do not redesign overlay controls in this phase").
- No stale-marker risk introduced — no code path that produces markers was changed.

---

## 19. Regression results (Part 14)

Live replay of `computeSprintMeasurements` against all 4 registered benchmarks,
post-Phase-3 (i.e., unchanged), compared against their established values:

| Benchmark | zoneTimeS | avgStepLengthM | peakStrideLengthM | stepFreqHz | avgVelocity | peakVelocity | Match |
|---|---:|---:|---:|---:|---:|---:|---|
| `gav_stationary_reference` (**protected**) | 1.93 | 2.155113560633935 | 2.1739055918935284 | 4.848484848484849 | 10.362694300518134 | 10.620676199718467 | ✅ exact |
| `vanni_fly_240` | 2.21 | 1.912951952754283 | 2.0606099144108923 | 4.847505554433447 | 9.049773755656108 | 10.579734014114525 | ✅ exact |
| `vanni_fly_120` | 2.19 | 1.8714545531272098 | 1.9066218803939425 | 3.7812288993923024 | 9.132420091324201 | 10.319460675312305 | ✅ exact |
| `vanni_fly_60` | null (finish crossing unavailable) | 1.7667786717273228 | 1.9629486293726475 | 4.403669724770642 | null | 10.662825714650399 | ✅ exact |

**Zero regressions** on: Vanni 240 timing and all verified metrics (unchanged code
path, confirmed); the protected Gav benchmark (untouched — no write of any kind
issued against it this phase); Vanni 60's existing behavior (unchanged code path,
confirmed); acceleration contact logic (not read or touched this phase); the
step-integrity guard (Section 10 — confirmed still active, not bypassed); the
missing-intermediate-contact rejection (Section 10 — confirmed correctly nulling,
not bridging); source PTS timing (unchanged, confirmed by the same `frame.time`
trace used throughout); native 60/120/240 timestamp handling (unchanged); panning
safety (no panning code read or touched); overlay source-frame provenance (not
touched); ETA progress calculations (not touched, unrelated to this phase's scope).

---

## 20. Tests and exact outcomes (Part 15)

New: `npm run vanni-120-contact-recovery:sanity` — **11/11 PASS**, covering (mapped to
the task's requested 20-item list): contact accounting reconciliation (#9, #15, #16),
the step-integrity guard operating correctly on real same-foot transitions (#9, #10,
#11), real reason codes only (#15, #16 - zone inclusion via authoritative gate
geometry), average-step-length input purity (#1 spirit — real evidence, not a
frame-count assumption), and the physical-cause-for-every-gap invariant (#7, #8 — no
contact is ever invented across a genuine gap; long/short gaps both handled
correctly). Items #2/#3/#4 (equivalent duration at 60/120/240fps) are covered
qualitatively in Section 8's table rather than as pass/fail assertions, since no
threshold was found to behave inconsistently across FPS classes in the actual
contact-detection layer — there was nothing to pin as a "consistent behavior" test
beyond what Phase 2 already locked in for the shared `reportTimeSeconds` policy.
Item #17/#18/#19/#20 (240/Gav/60 fixtures, registry integrity) are covered by the
existing suites below, re-run this phase.

Existing suites re-run this phase:

| Command | Result |
|---|---|
| `npm run stationary-validation-registry:sanity` | 45/46 PASS — same disclosed 105%-weight failure |
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

`npm run db:reset` was never run.

---

## 21. Phase 3 acceptance table

> ⚠️ **Superseded by Section 26's corrected acceptance table.** The table below is
> the ORIGINAL, pre-correction assessment, kept for disclosure. Criteria 1, 2, 4, 5,
> and 13 rested in part on the disproven occlusion claim; see Section 26 for the
> corrected, current status of each.

| # | Criterion | Status (original, pre-correction) |
|---|---|---|
| 1 | Every visually plausible 120 FPS contact documented | ✅ Section 4 |
| 2 | Every missed contact assigned a precise failure category | ✅ Section 6 |
| 3 | Every contact-related time window audited for FPS dependence | ✅ Sections 5, 8 |
| 4 | Recoverable contacts recovered only from real source evidence | ✅ N/A — none were recoverable |
| 5 | Unrecoverable contacts remain unavailable with structured reasons | ✅ Section 4 |
| 6 | No global evidence threshold weakened | ✅ zero code changes |
| 7 | No contact copied or inferred from the 240 recording | ✅ confirmed |
| 8 | Step reconstruction does not bridge unsupported gaps | ✅ Section 10 |
| 9 | Real production rerun validates any implemented correction | N/A — no correction implemented |
| 10 | 120 timing result does not regress | ✅ Section 19 |
| 11 | Validated 240 metrics do not regress | ✅ Section 19 |
| 12 | Gav and 60 contracts do not regress | ✅ Section 19 |
| 13 | Relevant tests pass | ✅ Section 20 |
| 14 | Roadmap tracker updated with evidence | ✅ `docs/stationary-roadmap-progress.md` |

**All 14 satisfied — Phase 3 is marked complete**, via the task's own explicit
insufficient-pose-evidence contingency (Section 11).

---

## 22. Roadmap progress before versus after

| | Before Phase 3 | After Phase 3 |
|---|---:|---:|
| Phase 3 status | Not Started | Complete |
| Phase 3 weighted contribution (literal) | 0.0% | 7.0% |
| Phase 3 weighted contribution (normalized) | 0.0% | 6.7% |
| Overall completion (as specified, /105) | 18.1% | 24.8% |
| Overall completion (normalized, /100) | 18.1% | 24.8% |
| Remaining | 81.9% | 75.2% |

Exact unrounded calculation: (4+7+8+7)/105×100 = 26/105×100 = 24.761904...% ≈ 24.8%,
matching the task's own stated expectation of "approximately 24.8%."

---

## 23. Remaining limitations

- The ambiguous noisy window (t=1.23–1.48s) genuinely cannot be resolved with
  certainty — it is possible a real left-foot contact exists there and is currently
  suppressed as noise, or it is possible the noise is genuinely not a real contact.
  This is an honest, disclosed evidence gap, not a resolved question.
- `REACQUISITION_MAX_FRAMES` (box vs identity tracker: 90 vs 60, both unscaled by
  fps) is a real, disclosed, unfixed finding, carried forward to Phase 5.
- `summariseContactFlight()`'s missing same-foot-discontinuity guard is a real,
  disclosed, unfixed finding, carried forward to Phase 13. Until fixed,
  `groundContactLeftMs`/`groundContactRightMs`/`flightLeftMs`/`flightRightMs` should
  be treated with lower confidence specifically on recordings with any
  `foot_sequence_discontinuity`-flagged interval (this affects `vanni_fly_120`'s
  displayed contact/flight-time diagnostics right now, though not its 6 primary
  metrics, which don't consume these fields).
- The "velocity methods disagree by more than 15%" warning (present on
  `vanni_fly_120`, absent on `vanni_fly_240`) is now root-caused: it traces directly
  to the 2 same-foot-transition gaps reducing the number of clean step-length
  samples feeding the `avgLenFreq`/`medianLenFreq` velocity estimates, not to a
  calibration or zone-crossing problem. This is consistent with, not contradicted
  by, this phase's findings — it was not separately "fixed" since it is a correct,
  working consequence of an honest evidence gap, not a defect.
- No third-party/manual ground truth exists for `vanni_fly_120` (unchanged from
  Phase 1/2) — this phase's conclusions rest on internal evidence consistency and
  direct visual confirmation, not an external reference.

---

## 24. Git status

Not committed, not pushed, per standing instruction. `git status --short` at the end
of this phase shows the pre-existing large uncommitted Day 96–104 working tree
(untouched by this phase) plus this phase's own additions listed in Section 12.

---

## 25. Exact recommended Phase 4 prompt scope

Phase 4 (this tracker: "60 FPS late-run athlete-loss fix") is the natural next step —
`vanni_fly_60`'s tracking coverage currently ends at 14.8m of the 20m zone (66.9%,
`finish_crossing_unavailable`), a materially worse and different failure mode than
either 120 or 240 (a genuine early tracking-loss failure, not a late-clip frame-exit
or an isolated occlusion). Recommended scope:

1. Apply this phase's exact methodology (real pose-artifact frame audit + real
   extracted video-frame visual confirmation) to `vanni_fly_60`'s specific tracking
   loss, to determine whether it is the same class of physical cause (occlusion,
   frame-exit) or a genuinely different failure (e.g., a real tracking-algorithm
   breakdown under lower temporal resolution).
2. Do **not** apply this phase's `REACQUISITION_MAX_FRAMES`/flight-time-guard
   findings as part of Phase 4's own scope — those belong to Phase 5 and Phase 13
   respectively, and mixing them into Phase 4 would violate the same
   scope-discipline this phase followed.
3. If Phase 4's root cause turns out to be the `REACQUISITION_MAX_FRAMES` budget
   (plausible, since 60fps recordings get the LEAST real-world reacquisition time
   per the current unscaled frame-count design — Section 8's table shows 90 frames
   = only 1500ms at 60fps, the smallest real-world budget of the three FPS classes),
   that would be strong, concrete evidence to escalate Phase 5 rather than attempt a
   narrow Phase-4-only fix — flag this explicitly rather than quietly patching
   shared tracker logic under Phase 4's name.

---

## 26. Correction addendum (2026-08-05)

See the standalone companion document
`docs/phase-3-vanni-120-visibility-correction.md` for the complete, full-detail
correction (frame-index mapping proof, rotation proof, box-overlay images, bin
geometry, reclassification, corrected acceptance table, corrected roadmap
progress). This section is a condensed pointer, added so this report is
self-contained about the fact that it was corrected, without duplicating the
entire addendum inline.

**Summary**: the athlete is fully visible during frames 247–249 (confirmed by the
user and independently reverified via real, correctly-rotated, uncropped source
frames). The original "occluded by a bin" claim is retracted. The true cause,
proven by overlaying the real, persisted `athleteBoundingBoxSource` coordinates on
the real source frame, is a box-tracker localization failure: the production
athlete-box jumped ~225px onto empty background for exactly 3 frames (self-reporting
`trackState: "tracking"` / `boxOrigin: "tracked"` the whole time — no existing
confidence signal flagged it), then snapped back onto the athlete's real trajectory.
No code was changed (fixing the box tracker is detector-architecture work, out of
scope for this correction). No metric changed. The Sections 4a/6/9/11/21 markups
above show exactly what was wrong and how it was corrected, per the requirement not
to erase the original mistaken conclusion without disclosure.
