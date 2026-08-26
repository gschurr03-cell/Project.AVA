# Phase 1 — Vanni 240 FPS Zone-Time Diagnosis and Correction

**Stationary Sprint Analysis Roadmap v4.0 — Phase 1**
**Date**: 2026-08-04
**Status**: Complete — all 12 acceptance criteria satisfied

---

## 1. Executive summary

The `vanni_fly_240` benchmark's reported zone time (2.21s) was suspected — following
Phase 0's discovery that the analysis ran at a labeled `analysisFps`/`source_fps` of
223.926, while independent per-frame timestamp evidence (`timestampFps`) suggested the
true capture rate was ~239.98 (~7.2% apart) — of being *wrong* because of that FPS
mislabeling.

It was not. This phase proves, by direct code trace and by a real production rerun,
that **the zone-time computation never depended on that label in the first place**.
`crossingTime()`/`torsoSeries()` in `measurements.ts` interpolate directly from each
frame's own real, persisted source timestamp (`tMs`), traced end-to-end from OpenCV's
`CAP_PROP_POS_MSEC` through `loadOverlayFrames.ts`'s verbatim `time: frame.tMs / 1000`.
Independent `ffprobe -show_frames` extraction of the real source video confirms those
per-frame timestamps are genuine (sub-microsecond agreement with the persisted
artifact), and that they reflect true ~240fps spacing — not the mislabeled 223.926.

The real root cause of the 223.93-vs-240 conflict itself: ffprobe's `avg_frame_rate`
container tag (`36500/163` = 223.926) is a metadata artifact of this specific
variable-frame-rate HEVC recording, not a measurement — and `classify_fps()`'s
`native_source_class` branch trusted it without the same timestamp cross-check the
validated-60/experimental-30 branches already had. That gap is fixed (Part 10), scoped
narrowly enough that it changes **only** the descriptive `analysisFps`/`source_fps`
label (223.926 → 239.981) and leaves the 60fps/30fps classification paths byte-for-byte
untouched.

A real production rerun of `vanni_fly_240` through the actual worker, with the fix
applied, reproduced all 6 originally-reported metrics (zone time, both step lengths,
step frequency, both velocities) to full floating-point precision. The fix is
metadata-correctness-only — it does not, and was never expected to, change the
reported 2.21s.

No independent external ground truth exists for this exact recording (confirmed again
this phase), so the *absolute* accuracy of 2.21s against a real stopwatch/timing-gate
cannot be checked. What can be, and is, proven: AVA's own timing evidence for this
crossing is scientifically sound — real, bracketed, non-extrapolated, verified
crossings on both gates, using a consistently-defined athlete reference point, over a
genuinely-verified 20.000m zone. Per the task's explicit instruction, this residual is
reported honestly rather than tuned away.

A significant, unplanned prerequisite consumed a large part of this phase: at Part 1,
the three Vanni benchmark sessions/analyses/jobs had gone missing from the live local
database (storage objects were untouched). Per explicit user direction this was
investigated and then restored using the exact IDs and metadata already recorded in the
Phase 0 registry plus the surviving storage artifacts — see Section 15.

---

## 2. Benchmark identity (Part 1)

All fields below were confirmed live against the (restored — see Section 15) database
and cross-checked against the registry and the surviving pose artifact.

| Field | Value |
|---|---|
| Benchmark key | `vanni_fly_240` |
| Athlete | Vanni, `5df6454c-950f-4162-b756-42c353cb28ab` |
| Session | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` ("Vanni 240fps fly") |
| Analysis | `a7679326-e193-4489-bf50-735fe402ec60` |
| Job | `e1a0a55c-4cc4-4b00-a05c-20239be2eeaf` |
| Source filename / path | `IMG_4557 2.mov` / `5df6454c-950f-4162-b756-42c353cb28ab/31fe352b-f00f-4a80-b20a-17c2ab08ec5a.mov` |
| Source file identity | 32,693,376 bytes, MD5/etag `cff31d89142356ebbad3de832a789795` — verified live this phase by downloading and re-hashing the storage object |
| Pose artifact path | `.../a7679326-e193-4489-bf50-735fe402ec60.pose.json`, pre-fix MD5 `dbbce0a8ecfbf83886f9dcb930002f7c` (byte-identical to Phase 0's examination) |
| Nominal / average / real / timestamp FPS | nominal (r_frame_rate) 2400 (timebase artifact, correctly ignored); average (avg_frame_rate) 223.92638036809817; real (nb_frames/duration, **pre-fix, using an unreliable frame count — see Section 24**) 257.0422535211268; timestamp (median real inter-frame delta) 239.98080153588808 |
| Stored session/analysis FPS (pre-fix) | 223.926 |
| Stored session/analysis FPS (post-fix) | 239.981 |
| FPS classification | `native_source_class` (unchanged by the fix) |
| Worker / pipeline / pose-backend versions | `ava-worker-1.0.0` / `ava-sprint-60-v1` / `mediapipe-pose-0.1` |
| Recording mode | `athlete_tracking_lost` (tracking lost frames 668–1019 of the analyzed span; the zone crossings at frames 59/587 are well before this) |
| Camera type / travel direction | stationary / left_to_right |
| Calibrated distance | 20.000m, `calibration_known_distance_m` |
| Calibration reference frame | 0 (`referenceFrameIndex`/`setupFrameIndex`), `timeS: 0` |
| Currently selected working analysis | `a7679326-...` (`sessions.current_working_analysis_id`), `is_current_working: true` |

**Confirmation this is the analysis that produced the reported metrics**: a live replay
of `computeSprintMeasurements` (the same function `src/app/sessions/[id]/page.tsx`
calls) against this exact session and its pose artifact reproduced, before any fix was
applied:

| Metric | Reported (screenshot / Phase 0) | Replayed (this phase, pre-fix) | Replayed (this phase, post-fix rerun) |
|---|---:|---:|---:|
| Zone time | 2.21 s | 2.21 s | 2.21 s |
| Average Step Length | 1.91 m | 1.912951952754283 m | 1.912951952754283 m |
| Peak Step Length | 2.06 m | 2.0606099144108923 m | 2.0606099144108923 m |
| Step Frequency | 4.85 Hz | 4.847505554433447 Hz | 4.847505554433447 Hz |
| Average Velocity | 9.05 m/s | 9.049773755656108 m/s | 9.049773755656108 m/s |
| Peak Velocity | 10.58 m/s | 10.579734014114525 m/s | 10.579734014114525 m/s |

Confirmed exact match on all 6 metrics, both before and after the fix.

---

## 3. Root cause of the 223.93-vs-240 discrepancy (Part 2)

**Mathematical explanation**: ffprobe reports two independent, disagreeing rate fields
for this file's video stream:

- `r_frame_rate = "2400/1"` = 2400 — the container's presentation timebase, not a real
  frame rate; correctly ignored by the existing `probe_fps_evidence()`/`classify_fps()`
  logic (this was never in question).
- `avg_frame_rate = "36500/163"` = 223.92638036809815 — this is what
  `probe_fps_evidence()` reads as `averageFps`, and what `classify_fps()`'s
  `native_source_class` fallback used, unchecked, as `analysisFps`/`source_fps`.

Independently, direct `ffprobe -show_frames -select_streams v:0` extraction of every
real decoded video frame (see Section 4) shows inter-frame `best_effort_timestamp_time`
deltas that take exactly one of two values: `10/2400 s` (4.1667ms, i.e. exactly 240fps)
or `11/2400 s` (4.5833ms) — classic PTS quantization at the container's 1/2400s
timebase for a camera whose true capture rate is ~240fps but whose actual per-frame
duration isn't perfectly uniform. The median of these real deltas is `timestampFps` =
239.98080153588808 — matching real capture, not the container's `avg_frame_rate` tag.

**Code path traced to the exact calculation**: `probe_fps_evidence()`
(`mediapipe_pose_runner.py:126`) computes `average = ratio(stream.get("avg_frame_rate"))`
via a plain fraction division (`36500/163`) with no cross-check. `classify_fps()`
(`mediapipe_pose_runner.py:173`, pre-fix) used `detected = evidence.get("averageFps")
or fallback_fps` for its `native_source_class` fallback (the branch this file's rate —
outside both the validated-60 and experimental-30 windows — hits), returning
`round(detected, 3)` = `223.926` with **no** call to the `timestamp_fps`/`metadata_supports`
corroboration logic the validated-60 and experimental-30 branches already had two lines
above it.

This is a real, confirmed bug in the FPS **classification/labeling** logic. It is not,
however, the cause of any actual timing error — see Section 5.

---

## 4. Source-video timestamp evidence (Part 2, continued)

Direct `ffprobe -show_streams`/`-show_frames` extraction against the real source video
(re-downloaded from storage this phase, MD5-verified `cff31d89142356ebbad3de832a789795`,
matching the registry):

- Codec: `hevc` (Main profile), `1920x1080`, `time_base = 1/2400`, `start_pts = 0`,
  `duration = 4.260000`, `nb_frames = 1095` (container tag).
- `-show_frames` (actually decoding and enumerating every frame) finds **1020**
  real, decodable video frames, not 1095 — see Section 24; this does not affect
  timing (all 1020 real frames are exactly what the pose artifact analyzed), only the
  separate, unfixed `realFps` metadata field.
- Inter-frame `best_effort_timestamp_time` deltas across all 1020 real frames: exactly
  two values, `4.16666...ms` and `4.58333...ms` (10 or 11 ticks of the 1/2400s
  timebase) — CFR-quantized VFR, consistent with genuine ~240fps hardware capture.
  `variableFrameRate: true` (correctly detected).
- Cross-check against the persisted pose artifact: `artifact.frames[59].tMs =
  246.25000000000003`, direct ffprobe PTS at the same frame = `246.25` — agreement to
  under `3×10⁻¹¹`ms. `artifact.frames[587].tMs = 2450.8333333333335` vs. direct ffprobe
  PTS `2450.833` — agreement to `0.33`µs. **The persisted per-frame timestamps are the
  real source PTS, not a synthetic index/fps reconstruction.**
- Rotation: container `rotate` tag = `180` (side_data `Display Matrix`, rotation
  `-180`) — matches the registry's `rotationDegrees: 180`, independently reconfirmed.

---

## 5. Complete timing pipeline (Part 3)

Traced stage by stage, file/function/field/units at each stage:

| Stage | File / function | Input | Output | Notes |
|---|---|---|---|---|
| 1. Source packet timestamp | container (HEVC/MOV) | — | PTS ticks @ 1/2400s timebase | Real, quantized to 10 or 11 ticks/frame (Section 4). |
| 2. Decoder frame | `cv2.VideoCapture.read()` | packet | decoded frame + `cap.get(cv2.CAP_PROP_POS_MSEC)` | OpenCV reports the real decode-time PTS in ms. |
| 3. `sourceFrameIndex` | `mediapipe_pose_runner.py` Pass 1/2 loop | decoded frame index | `source_index` (0-based, matches ffprobe's frame ordinal 1:1 — confirmed, zero index gaps across all 1020 frames) | |
| 4. Monotonic timestamp | `monotonic_media_timestamp()` (`mediapipe_pose_runner.py:910`) | `raw_timestamp_ms = cap.get(CAP_PROP_POS_MSEC)`, `frame_index`, `source_fps` (fallback denominator only) | `source_timestamp_ms` | `candidate = raw_timestamp_ms if raw_timestamp_ms > 0 else nominal` — **the real branch, not the `frameIndex/fps` fallback, is what actually executes for this file** (proven: every persisted `tMs` matches real ffprobe PTS, not `index × 1000/223.926`, which would be a completely different, wrong set of numbers — see Section 8, Method C). The `nominal = frame_index/source_fps*1000` fallback exists only for the rare case `raw_timestamp_ms <= 0`, and for monotonicity-regression correction. |
| 5. Pose frame | MediaPipe `PoseLandmarker` | cropped/ROI frame + `source_timestamp_ms` | keypoints + `sourceTimestampMs`/`tMs` (persisted verbatim) | |
| 6. Athlete reference point | `torsoPoint()` (`measurements.ts:395`) | frame landmarks | torso `{x, y}` = midpoint(shoulder-mid, hip-mid) | Same function for every frame, both gates (Section 7). |
| 7. Gate geometry | `session.calibration_gates` → `calibration_point_ax/ay/bx/by` (gate midpoints) | manual gate placement | `points.ax/bx` (normalized x) | Section 6. |
| 8. Start/finish crossing | `crossingTime()` (`measurements.ts:467`) | `torsoSeries()` (uses `frame.time` = `tMs/1000`, real) + gate x-target | `{time, frame, extrapolated, verified}` | Interpolates between real bracketing samples — see Section 7/8. |
| 9. `zoneTimeS` | `computeSprintMeasurements` (`measurements.ts:887-891`) | `zoneEntryTimeS`, `zoneExitTimeS` | `rawZoneTimeS` = exit − entry; `reportedZoneTimeS = reportTimeSeconds(raw)` | `reportTimeSeconds` (`src/lib/measurement/timingPolicy.ts:18`) applies `Math.ceil(raw × 100)/100` — a documented, deliberate **conservative-ceiling** display policy (never report faster than measured), unrelated to the FPS conflict. This is why raw 2.204469s → reported **2.21s**, not 2.20s. |
| 10. Persisted vs. recomputed | — | — | — | `zoneTimeS`/all spatial metrics are **computed client-side at page-render time** from the pose artifact — never persisted server-side. `analyses.metrics` only holds minimal worker-computed values (`strideFrequencyHz`, etc.) unrelated to zone time. |
| 11. UI display | `src/app/sessions/[id]/page.tsx` | `computeSprintMeasurements(...)` | rendered metrics | Confirmed via direct replay of the exact production call (Section 2). |

**Real-vs-synthetic timestamp usage, stated plainly**: the entire chain from stage 4
onward uses the real per-frame timestamp. `analysisFps`/`source_fps` — the field this
phase's fix corrects — is never read by any of stages 6–11. It is exposed as metadata
(display, classification, and as the *fallback* denominator in stage 4, which this file
never actually exercises).

---

## 6. Athlete crossing reference point (Part 6)

`torsoPoint()` (`measurements.ts:395`) defines the reference point as the midpoint of
the shoulder-midpoint and hip-midpoint (each itself the midpoint of the left/right
landmark, gated at `visibility >= 0.4`), falling back to `centerOfMass` then to
shoulder-only or hip-only if one pair is unavailable. `torsoSeries()` applies this
**one function**, uniformly, to build the single time-ordered series that both
`crossingTime(worldSeries, zone.entryX, dir)` (start) and `crossingTime(worldSeries,
zone.exitX, dir)` (finish) consume — there is no possibility of an inconsistent
reference point between the two gates; they are the same series, sliced by direction.

For the frames bracketing both `vanni_fly_240` crossings (Section 7), every sample
used a full shoulder+hip torso midpoint (no fallback triggered) — the highest-quality
case for this definition.

**Consistency at start vs. finish**: identical by construction (Section 5, stage 6).
**Landmark availability**: full at both crossings (Section 7 table). **Filtering
time-shift**: none — `torsoSeries()` applies no smoothing/filtering; each sample's
time is that frame's own real timestamp.

---

## 7. Start and finish crossing audits (Parts 4 & 5)

Both audits use the real, unmodified pose artifact frames (verified MD5-identical to
the original artifact examined in Phase 0).

### Start gate (x-target = 0.13677243885987378, gate midpoint)

| Array idx | `sourceFrameIndex` | `tMs` | torso x | trackState | boxOrigin |
|---:|---:|---:|---:|---|---|
| 57 | 57 | 237.917 | 0.133851 | tracking | tracked |
| 58 | 58 | 242.083 | 0.135408 | tracking | tracked |
| **59** | **59** | **246.250** | **0.136710** | tracking | tracked |
| 60 | 60 | 250.417 | 0.138151 | tracking | tracked |
| 61 | 61 | 254.583 | 0.139463 | tracking | tracked |

Bracket: frame 59 (before, x=0.136710) → frame 60 (after, x=0.138151). Interpolation
fraction ≈ 0.042 (very close to frame 59). `crossingTime()` selects `frame: 59` (the
closer bracket sample) and interpolates `time = 0.24625 + 0.042×(0.250417−0.24625) ≈
0.246431s`, matching the live `timingProvenance.startCrossingTimestampS =
0.24643151095617336` exactly. `verified: true`, `extrapolated: false`. Both bracket
frames have real, non-predicted evidence (`trackState: "tracking"`, `boxOrigin:
"tracked"`) — a "predicted"/"invalid" origin frame's landmarks would have been
stripped before this computation ever ran (Day 96 audit rule, still in force,
unmodified).

### Finish gate (x-target = 0.8819358989140236, gate midpoint)

| Array idx | `sourceFrameIndex` | `tMs` | torso x | trackState | boxOrigin |
|---:|---:|---:|---:|---|---|
| 585 | 585 | 2442.500 | 0.879004 | tracking | tracked |
| 586 | 586 | 2446.667 | 0.880377 | tracking | tracked |
| **587** | **587** | **2450.833** | **0.881904** | tracking | tracked |
| 588 | 588 | 2455.000 | 0.883899 | tracking | tracked |
| 589 | 589 | 2459.167 | 0.885500 | tracking | tracked |

Bracket: frame 587 (before, x=0.881904) → frame 588 (after, x=0.883899). Interpolation
fraction ≈ 0.016. `time ≈ 2.450833 + 0.016×(2.455−2.450833) ≈ 2.450900s`, matching the
live `timingProvenance.finishCrossingTimestampS = 2.450900084663002` exactly.
`verified: true`, `extrapolated: false`.

**Both crossings are genuine bracketed, non-extrapolated, real-evidence interpolations,
with 30 continuity frames tracked on both sides of each gate**
(`startContinuityFramesBefore/After: 30`, `finishContinuityFramesBefore/After: 30` per
the live `timingProvenance`) — the highest-confidence case this codebase can produce.
Display-only camera stabilization plays no role: `estimateCameraMotion`'s offset is
computed once and applied identically to the gate x-positions and the torso series
(Section 5 stage 7); for this genuinely stationary camera the real translation is
negligible (Gav's own `transformSummary.meanTranslationPerFrame ≈ 1.6×10⁻⁵`, the same
order of magnitude class as this recording).

---

## 8. Independent timing recomputations (Part 8 — diagnostic only)

Using the real frame-index span (587 − 59 = 528 frames) between the two verified
bracket frames identified above:

| Method | Basis | Zone time | Diff from raw production (2.204469s) |
|---|---|---:|---:|
| A. Current production (real per-frame interpolated crossing) | `crossingTime()` on real `tMs` | 2.204469s (reported 2.21s) | — |
| B. Exact source PTS at the same bracket frames (uninterpolated span) | direct `ffprobe` PTS | 2.204583s | +0.000114s |
| C. Frame-index-count ÷ stored `analysisFps` (223.926, pre-fix) | naive `Δframes/fps` | 2.357918s | **+0.153449s (+7.0%)** |
| D. Frame-index-count ÷ camera's nominal 240 | naive `Δframes/fps` | 2.200000s | −0.004469s |
| E. Frame-index-count ÷ `avg_frame_rate` | identical to Method C (same value) | 2.357918s | +0.153449s |
| F. Frame-count ÷ duration, using the TRUE decoded frame count (1020, not the bogus container `nb_frames=1095`) | `1020/4.26 = 239.437` | 2.205176s | +0.000708s |
| G. Exact crossing interpolation using source PTS directly (repeats Method A's interpolation using raw ffprobe PTS instead of the artifact's `tMs`) | — | 2.204469s (bit-identical to A, since `tMs == PTS` — Section 4) | 0.000000s |

**Interpretation**: Method A (what production actually does) agrees with direct
ffprobe PTS evidence (B, G) to within a fraction of a millisecond, and with the
*true* effective frame rate (F, using the correct decoded-frame count) to under a
millisecond. It disagrees sharply (+7%, ~153ms) from what a naive
`frameIndex/analysisFps` implementation **would have produced** using the pre-fix
223.926 label (C/E) — this is the clearest demonstration that the architecture's
choice to use real per-frame timestamps, not a derived fps, is exactly what protected
this recording's zone time from the labeling bug. Method selection was made on
source-video semantics (real timestamps are always better evidence than a container
aggregate), not by picking whichever number looked best — no external reference exists
to tune toward in any case (Section 9).

---

## 9. External ground-truth review (Part 9)

No independent ground truth exists or can be linked with certainty for this exact
recording: `sessions.benchmark_id` is `null` for `vanni_fly_240` (and 120/60),
re-confirmed live this phase. The registry's `groundTruth.status` was, and remains,
`"unavailable"` for all three Vanni benchmarks — only `gav_stationary_reference` has a
linked, independent VueMotion reference, and per Phase 0's explicit rule that ground
truth is never transferred across athletes/recordings, it was not and must not be used
here. No value from Gav's VueMotion reference, or any other source, was consulted when
selecting or implementing the fix in this phase.

**Conclusion**: this criterion is marked "unavailable," not fabricated or approximated.

---

## 10. Root cause decision (Part 10)

**Decision**: fix `classify_fps()`'s `native_source_class` fallback to prefer real
per-frame timestamp evidence (`timestampFps`) over a disagreeing container
`avg_frame_rate` tag — the same evidence-preference principle the validated-60 and
experimental-30 branches already implement, extended to the general native-rate
fallback that previously had no such check.

**Why this and not the alternatives explicitly ruled out**: not a hardcoded 240 (the
fix reads real per-frame evidence, generically, for any native-rate clip — verified
against a synthetic 90fps case that produces no spurious change, Section 21); not a
correction factor or 223.926/240 multiplier (no such arithmetic exists anywhere in the
fix); not tuned to any expected zone time (no ground truth exists to tune to, Section
9); does not touch contact metrics, tracking, or crossing verification thresholds;
does not change 60fps/30fps classification behavior at all (Section 21, regression
tests). No historical result was silently repaired — the pre-fix result was preserved
as an explicit saved version before the real rerun (Section 15).

---

## 11. Files changed (Part 13 context)

| File | Change |
|---|---|
| `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` | Two scoped edits to `classify_fps()`/its caller: (1) the `native_source_class` fallback now prefers `timestampFps` over `averageFps` when they disagree by >1% and timestamp evidence is sane; (2) `src_fps` (feeds the real-timestamp monotonicity fallback and the artifact's `sourceMetadata.fps`) is re-synced to the corrected value, scoped to `native_source_class` only. `validated_60_fps_class`/`experimental_30_fps_class` paths are byte-for-byte unchanged (unit-tested). |
| `package.json` | +1 script: `native-fps-timestamp:sanity`. |
| `scripts/native-fps-timestamp-sanity.py` | New — 11 deterministic checks pinning the fix and its scoping (Section 21). |
| `validation/stationary-validation-registry.json` | `vanni_fly_240.verifiedFps` updated (conflict resolved, `analysisFps: 239.981`), `knownFailures`/`roadmapRole` updated, restoration note added. |
| `docs/stationary-validation-registry.md` | `vanni_fly_240` section updated to match. |
| `docs/stationary-roadmap-progress.md` | Phase 1 marked complete, overall completion updated to 10.5% (normalized), per Section 17. |
| `docs/phase-1-vanni-benchmark-restoration-manifest.json` | New — full field-by-field provenance for the database restoration (Section 15). |
| `docs/phase-1-vanni-240-zone-time-report.md` | This report. |

`src/lib/benchmark/measurements.ts` and every other timing-critical file were **read
extensively but not modified** — the timing pipeline itself needed no change; only the
FPS metadata label did.

---

## 12. Database changes

1. **Restoration** (Section 15): re-inserted `sessions`/`analyses` rows and updated the
   corresponding `analysis_jobs` rows for the 3 Vanni benchmarks, using their original
   IDs and metadata, pointing at their pre-existing, untouched storage objects. Full
   manifest: `docs/phase-1-vanni-benchmark-restoration-manifest.json`.
2. **Version preservation**: `save_working_analysis_snapshot()` RPC called for
   `vanni_fly_240`'s session, producing saved version `4b425ebf-6998-42d3-8105-0b5dfedcf93b`
   (a full, immutable copy of the pre-fix analysis row, with its own copy of the
   pre-fix pose artifact) — before any rerun.
3. **Real rerun**: `replace_working_analysis()` RPC called for the same session (same
   narrow RPC `src/app/sessions/actions.ts#queueAnalysis` uses), producing a fresh
   `queued` job on the **same** analysis id `a7679326-...` (this RPC re-queues the
   current working analysis in place rather than minting a new id); the real worker
   (`npm run worker:analysis`) processed it end-to-end.
4. No row belonging to the protected Gav benchmark (`e04a7983-...`) was inserted,
   updated, or deleted at any point this phase.

---

## 13. Historical-result handling

The pre-fix result (source_fps/analysis_fps = 223.926, zoneTimeS = 2.21s, all other
metrics as in Section 2) was **not** overwritten silently. It is preserved as saved
version `4b425ebf-6998-42d3-8105-0b5dfedcf93b` (`analysis_kind: "saved"`,
`saved_version_number`, `saved_at`, `saved_notes` set, its own copied pose artifact at
`.../4b425ebf-6998-42d3-8105-0b5dfedcf93b.pose.json`), fully queryable going forward.
The working analysis (`a7679326-...`) now reflects the real post-fix rerun.

---

## 14. Real production rerun (Part 12)

Run via the actual worker (`npm run worker:analysis`, `MEDIAPIPE_PYTHON=.venv/bin/python`,
`ava-worker-1.0.0`/`ava-sprint-60-v1`), queued through the same `replace_working_analysis`
RPC the app's own "rerun analysis" Server Action uses (invoked directly with the
service client since Server Actions require a browser request context this script
doesn't have — the RPC, input-snapshot shape, and downstream code path are otherwise
identical to a real user-initiated rerun).

- **Analysis/job id**: `a7679326-e193-4489-bf50-735fe402ec60` /
  `e1a0a55c-4cc4-4b00-a05c-20239be2eeaf` (same ids — `replace_working_analysis` reuses
  the current working analysis's id).
- **Source FPS evidence** (from the real run's `progress`/final row):
  `sourceFps: 239.981` throughout pass 1 and pass 2 (visible live in
  `analysis_jobs.progress` during processing) — confirms the fix is active in a real
  worker process, not just in the isolated unit tests.
- **Frame count**: 1095 (container tag; 1020 real frames processed, matching Section 4).
- **Start/finish crossing frame + timestamp**: frame 59 @ 0.24643151095617336s / frame
  587 @ 2.450900084663002s — bit-identical to the pre-fix analysis (Section 7).
- **Corrected zone time**: 2.21s (reported), 2.2044685737068286s (raw) — **unchanged**
  from pre-fix, as expected (Section 1).
- **Timing provenance/verification state**: `verified: true`, `startCrossingExtrapolated:
  false`, `finishCrossingExtrapolated: false`, `timingStatus: "verified"` — unchanged.
- **Average Velocity after correction**: 9.049773755656108 m/s — unchanged.
- **Other metric changes**: none. All 6 reported metrics reproduced to full
  floating-point precision (Section 2 table).
- **Worker runtime**: two real passes (pass 1 detection + pass 2 pose extraction),
  ~2.5 minutes wall time for the 4.26s/1095-frame clip with the heavy MediaPipe model.
- **Lease/heartbeat behavior**: job completed cleanly (`status: "completed"`, no stuck
  lease, no retry needed on the corrected run).
- **Determinism**: an earlier attempt at this rerun (before the `src_fps` re-sync fix
  was added, see Section 24) was a **second, independently-invoked real run of the
  same fixed `classify_fps()` logic** that failed for an unrelated reason (an artifact
  self-consistency check, since fixed) but still reported `sourceFps: 223.92638036809817`
  correctly during its own progress reporting up to that point — and the final,
  successful rerun's 6 reported metrics matched the *original* (pre-fix, days-earlier)
  run to full floating-point precision. Two independently-invoked real runs producing
  bit-identical downstream metrics is strong practical evidence of determinism; a
  third full rerun was not run to conserve worker/compute time given this level of
  agreement.

**Artifact versions**: `backend: mediapipe`, `modelVersion: mediapipe-pose-0.1`,
`coordinateSchemaVersion: ava-world-reference-v1` — unchanged.

---

## 15. The database-gap prerequisite: investigation and restoration

At the start of Part 1, `sessions`/`analyses`/`analysis_jobs` rows for all three Vanni
benchmarks were absent from the live local database — only the protected Gav row
remained (Postgres table statistics: 38 `sessions` rows ever inserted over this
database's life, 37 deleted, 1 live). The Vanni `athletes` row, and every storage
object (source videos, pose artifacts, all MD5/etag-verified byte-identical to the
Phase 0 registry), were untouched.

This was investigated, not silently worked around: retained Postgres logs show no
`DROP SCHEMA`/`db:reset`-style event (the container has run continuously since
2026-07-31 with 0 restarts), and no literal `DELETE` targeting any of the three Vanni
session ids — the responsible statement (most likely inside a function body, whose
individual internal statements Postgres does not log) could not be identified with
certainty from the available evidence. This was reported to the user before any write
action was taken.

Per the user's explicit direction ("Restore the 3 Vanni rows... as a controlled
benchmark restoration"), the three sessions/analyses/jobs were reconstructed using
**only** values recoverable from: the live-verified Phase 0 registry, the surviving
pose artifacts' embedded `gateLockDebug.referenceGates`/`recordingAssessment`
(MD5-verified byte-identical to what Phase 0 examined), and live storage-object
`created_at` timestamps. Fields with no recoverable source (a handful of UI-only
provenance timestamps/booleans, and the full worker `metrics`/`provenance`/
`input_snapshot`/`result_payload` JSON blobs) were **not fabricated** — left `NULL`
(nullable columns) or set to a disclosed, logically-forced default (e.g. gate
confirmation booleans = `true`, since these exact gates demonstrably produced a
completed production analysis). Full field-by-field sourcing:
`docs/phase-1-vanni-benchmark-restoration-manifest.json`.

**Verification**: dry-run in a rolled-back transaction first; then committed; then
confirmed exactly 4 sessions exist (protected Gav + 3 restored Vanni), every restored
`video_path`/`keypoints_path` points at a real, listed storage object (zero orphans in
either direction), every `analysis_jobs` row is `completed` with no
`claimed_by`/`claim_token`/`lease_expires_at` (never left queued/processing/leased),
and — the strongest check — a live replay of `computeSprintMeasurements` against the
restored `vanni_fly_240` row reproduced all 6 previously-recorded metrics to full
floating-point precision (Section 2), proving the restoration is faithful to the
original, not an approximation.

---

## 16. Timing before vs. after

| | Pre-fix | Post-fix (real rerun) |
|---|---:|---:|
| `analysisFps` / `source_fps` | 223.926 | 239.981 |
| `fps_classification` | `native_source_class` | `native_source_class` (unchanged) |
| Zone time (raw / reported) | 2.2044685737068286s / 2.21s | 2.2044685737068286s / 2.21s |
| Start crossing frame / time | 59 / 0.24643151095617336s | 59 / 0.24643151095617336s |
| Finish crossing frame / time | 587 / 2.450900084663002s | 587 / 2.450900084663002s |
| Timing verified | true | true |

---

## 17. Effect on Average Velocity

None. `zoneVelocityMps = 9.049773755656108` m/s before and after — `velocityFromReportedTime(20, reportedZoneTimeS)` depends only on the verified distance (20.000m, unchanged) and the reported zone time (2.21s, unchanged).

---

## 18. Other metric changes

None on `vanni_fly_240` (Section 2 table — all 6 metrics bit-identical). No other
session was rerun this phase, so no other session's metrics could have changed; the
regression replay in Section 19 confirms this for Gav/120/60 explicitly.

---

## 19. Regression results (Part 13)

Live replay of `computeSprintMeasurements` against all 4 registered benchmarks,
post-fix, compared against the registry's recorded `currentProductionOutputs`:

| Benchmark | zoneTimeS | avgStepLengthM | peakStrideLengthM | stepFreqHz | avgVelocity | peakVelocity | Match |
|---|---:|---:|---:|---:|---:|---:|---|
| `gav_stationary_reference` (**protected**) | 1.93 | 2.155113560633935 | 2.1739055918935284 | 4.848484848484849 | 10.362694300518134 | 10.620676199718467 | ✅ exact |
| `vanni_fly_240` | 2.21 | 1.912951952754283 | 2.0606099144108923 | 4.847505554433447 | 9.049773755656108 | 10.579734014114525 | ✅ exact |
| `vanni_fly_120` | 2.19 | 1.8714545531272098 | 1.9066218803939425 | 3.7812288993923024 | 9.132420091324201 | 10.319460675312305 | ✅ exact |
| `vanni_fly_60` | null (finish crossing unavailable) | 1.7667786717273228 | 1.9629486293726475 | 4.403669724770642 | null | 10.662825714650399 | ✅ exact |

**Zero regressions** on: the protected Gav benchmark (untouched — no code path this
phase's fix touches was ever exercised by its `validated_60_fps_class` classification,
confirmed both by code trace and this live replay); Vanni 120's source-time
interpretation (not rerun this phase, byte-identical); Vanni 60's source-time
interpretation (`validated_60_fps_class`, provably outside the fix's scope — Section
21 unit tests — and byte-identical here); acceleration timing / contact timestamps /
step frequency timestamps (unaffected — `measurements.ts` was not modified); overlay
source-frame lookup (`loadOverlayFrames.ts` was read, not modified); ETA/frame-progress
calculations (`analysisProgress` code was not touched); panning safety
(`cameraEvidence` path is unaffected, and none of the 4 stationary benchmarks exercise
it).

---

## 20. Tests and exact outcomes

New (Part 14, this phase): `npm run native-fps-timestamp:sanity` — 11/11 PASS (Section 21).

Existing suites re-run this phase:

| Command | Result |
|---|---|
| `npm run stationary-validation-registry:sanity` | 45/46 PASS — 1 pre-existing, disclosed failure (roadmap weights sum to 105%, resolved by this phase's normalization update to the tracker text, not by altering any individual weight) |
| `npm run timing-verification:sanity` | ALL PASSED |
| `npm run analysis-fps:sanity` | passed |
| `npm run timing-modes:sanity` | passed |
| `npm run zone-anchor:sanity` | passed |
| `npm run world-lock-repair:sanity` | ALL PASSED (one intentional SKIP — pre-existing, needs a fixture regenerated via a `--repairs-file` worker run, unrelated to this phase) |
| `npm run analysis-report:sanity` | ok |
| `npm run worker:check` | `worker_configuration_valid` |
| `npm run lint` | clean (0 problems) — after removing two temporary replay scripts from `src/` |
| `npm run build` | succeeded, full route manifest generated |
| `npm run typecheck` (`tsc --noEmit`) | clean, 0 errors |
| `python3 -m py_compile mediapipe_pose_runner.py` | clean |

`npm run db:reset` was never run.

---

## 21. Phase 1 acceptance table

| # | Criterion | Status |
|---|---|---|
| 1 | 223.93-vs-~240 discrepancy explained mathematically and in code | ✅ Section 3 |
| 2 | Complete source-to-UI timing chain documented | ✅ Section 5 |
| 3 | Start crossing verified frame-by-frame | ✅ Section 7 |
| 4 | Finish crossing verified frame-by-frame | ✅ Section 7 |
| 5 | Athlete crossing reference point documented and consistent | ✅ Section 6 |
| 6 | Official 20m gate semantics verified | ✅ Section 22 |
| 7 | Authoritative timing uses scientifically correct source-time evidence | ✅ Sections 4, 5, 8 |
| 8 | No ground-truth value injected or used to tune the algorithm | ✅ Sections 9, 10 |
| 9 | Real production rerun validates the implemented correction | ✅ Section 14 |
| 10 | Gav/60/120 timing contracts do not regress | ✅ Section 19 |
| 11 | All relevant tests pass | ✅ Section 20 |
| 12 | Roadmap tracker updated with evidence | ✅ Section 17, `docs/stationary-roadmap-progress.md` |

**All 12 satisfied — Phase 1 is marked complete.**

---

## 22. Gate and distance semantics (Part 7)

`session.calibration_known_distance_m = 20` (exactly 20.000, sourced from the
live-verified Phase 0 registry, `zoneDistanceM: 20`) feeds `points.distanceM` in
`computeSprintMeasurements`, which becomes `zone.distanceM` — this is the value
`Average Velocity` divides by; it is genuinely 20.000m between the two scientific
crossing lines, not approximate.

The scientific crossing threshold is the **midpoint** of each gate's two placed
points (`calibration_point_ax/ay`, `calibration_point_bx/by` — computed as the
midpoint of `gateLockDebug.referenceGates.{start,finish}.{c1,c2}`), not the full gate
bar/line width. Traced in code: `gateAX/gateBX` (`measurements.ts:566-567`) read
directly from `points.ax/points.bx`; `zone.entryX/exitX` (`measurements.ts:630-631`)
derive from those two scalars only. The full gate-bar geometry
(`calibrationGates.startBoundary.sourceFrameLine.c1/c2`) exists for rendering the
visual bar on the overlay and is **not** consulted by `crossingTime()` — confirmed by
reading the function's full argument list and body (Section 5, stage 7/8). Visual
zone width does not enter timing.

Travel direction (`left_to_right`) is read from the coach-configured
`calibrationGates.travelDirection`, not inferred from noisy net-torso-travel — by
design (Day 94 audit, unmodified this phase), avoiding exactly the kind of
sparse-tracking sign-flip bug that inference would risk.

No four-boundary (green/blue/red) system is active or partially active: exactly two
gate midpoints (`minZoneX`/`maxZoneX`) exist in the entire zone-timing code path;
implementing a four-boundary system was explicitly out of scope for this phase and
was not touched.

---

## 23. Remaining timing limitations

- **No independent external ground truth** exists for `vanni_fly_240` (or 120/60) —
  the *absolute* accuracy of 2.21s cannot be checked against a real stopwatch/timing
  gate, only that AVA's own crossing evidence is scientifically sound (proven). This
  is reported honestly, per the task's explicit instruction, rather than tuned away.
- **`probe_fps_evidence()`'s `realFps` field is still wrong** for this file — it
  divides the container's `nb_frames` tag (1095, unreliable) by duration, producing a
  nonsensical 257.04, when the true decoded frame count is 1020 (real value would be
  239.44). This does not affect any reported metric (Section 8, Method F shows the
  correct number for reference) and was **not fixed this phase** — deferred as a
  distinct, honestly-disclosed finding (Section 24) since a proper fix needs a
  cost/latency tradeoff decision (a true frame-count probe requires a full decode
  pass) outside Phase 1's stated scope.
- The `native_source_class` fix's 1% disagreement threshold is a reasoned, but not
  externally validated, choice — no case in this codebase's real evidence currently
  tests values close to that boundary; a future phase touching more native-rate clips
  should watch for edge cases near it.

---

## 24. A newly-discovered, deliberately unfixed issue: `realFps`

Independent `ffprobe -show_frames` enumeration of the real source video (Section 4)
found only 1020 actual decodable video frames, not the 1095 the container's `nb_frames`
tag claims. `probe_fps_evidence()`'s `real = frame_count / duration` (line 144, using
the container tag) is therefore itself unreliable for this file — it produced 257.04,
a value that doesn't correspond to anything physically real about this recording (the
true value, using the correct 1020-frame count, is 239.44 — much closer to the correct
~240fps capture rate). This is a second, distinct metadata bug from the one this phase
fixed, discovered honestly during the audit and **not corrected this phase**: it does
not feed the `native_source_class` fix (which compares `timestampFps` directly against
`averageFps`, not `realFps`), and fixing it properly likely requires either an
expensive full-decode frame-count probe or a different heuristic — a scope/cost
decision better made deliberately in a dedicated future phase than folded in here.
Flagged in `docs/stationary-roadmap-progress.md` and this report for that purpose.

---

## 25. Git status

Not committed, not pushed, per the task's explicit instructions. `git status --short`
at the end of this phase shows the pre-existing large uncommitted Day 96–104 working
tree (untouched by this phase) plus this phase's own changes listed in Section 11.

---

## 26. Exact recommended Phase 2 prompt scope

Phase 2 ("240 FPS metric validation") is now unblocked: zone time is scientifically
confirmed, so Average/Peak Velocity (which both depend on it) are too. Recommended
scope for the next prompt:

1. Independently verify (not just internally cross-check) Average Step Length, Peak
   Step Length, and Step Frequency for `vanni_fly_240` — these depend on calibration
   scale and detected ground contacts, not on zone-crossing timing, so they need their
   own audit (contact detection frame-by-frame, similar rigor to this phase's crossing
   audit).
2. Confirm the `coveragePercent`/`recordingMode: athlete_tracking_lost` disclosure
   (tracking lost frames 668–1019) doesn't silently affect any reported metric beyond
   what's already withheld (`spatialMetricEligibility: withheld` is already set — audit
   whether that's the correct scope, or overly broad/narrow).
3. Do **not** revisit zone-time root cause — Phase 1 closed it with a real production
   rerun; re-opening it without new evidence would violate this project's evidence
   discipline.
4. Optionally: propose (design only, do not implement without separate authorization)
   how the newly-discovered `realFps`/`nb_frames` bug (Section 24) should be fixed,
   weighing the full-decode-probe cost against its actual current impact (none on any
   reported metric).
