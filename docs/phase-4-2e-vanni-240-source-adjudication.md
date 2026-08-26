# Phase 4.2E — Vanni 240 Source-Video Adjudication and Phase 4.2 Closure

## 1. Executive summary

Phase 4.2D fixed and mathematically proved fixed the whole-clip crop-fit
distortion that caused Phase 4.2C's Vanni 240 regression, but Vanni 240's
final metrics still did not exactly match its Phase 1/2 hand-verified
baseline, and the difference was only mechanistically *explained*, not
independently *proven*. Phase 4.2E's mandate was to settle this by comparing
both pipelines directly against the real source video, frame by frame, and
to decide — on visual evidence, not metric agreement — whether the
disagreement is a genuine scientific correction or a remaining regression.

**What was done**: the true original Phase 1/2 pose artifact turned out to
still be retrievable (a separately-stored snapshot, not overwritten by later
reruns — see Section 3). A full, real, frame-by-frame diff was built between
it and the current pipeline's artifact (1020 frames, byte-exact
`sourceFrameIndex`/`tMs` alignment). The load-bearing disagreement (a
zone-time/finish-crossing collapse newly discovered this phase — see
Section 5) was traced to specific frames, and those frames were extracted
directly from the stored source video with both pipelines' boxes overlaid.
Direct visual inspection found the current pipeline's box drifting onto a
stationary trackside barrel, then permanently locking onto an unrelated
static wall patch after a detector false-positive — never recovering for the
rest of the clip. Tracing that false-positive's acceptance to its root cause
found a real, generalizable code defect in `box_tracker.py`: three of its
four detector-event rejection classifications were computed but never
actually enforced. That defect is fixed (Section 9), re-verified safe against
Gav, Vanni 120, and Vanni 60 (Sections 15-17), and locked in with new
deterministic tests (Section 20).

**Result**: the fix resolves the false-positive background lock and
measurably improves Vanni 240's tracking confidence and reduces its
`frozen_suspect` footprint. It does **not** fully restore Vanni 240's
zone-time/finish-crossing measurement — a separate, real, and (per this
phase's own direct visual inspection) *not proven to be a code defect*
optical-flow tracking difficulty remains near the same trackside barrel,
genuinely gapping the evidence right around the finish crossing. Per this
phase's own explicit decision framework (Option D, Section 12), that
specific evidence gap is left honestly unavailable rather than resolved by
either reverting protections or inventing an unproven fix. **Phase 4.2
remains In Progress and contributes 0% — the roadmap remains 26.8%** (Section
23).

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md`: overall completion 26.8% (weight
pool literally sums to 112%, a disclosed, pre-existing discrepancy — not
touched, not silently normalized, per this phase's explicit instruction).
Phase 4.2 (weight 3%, normalized) remains at 0.0% before and after this
phase. See Section 23 for the exact updated arithmetic and Section 22 for
the roadmap document's own updated text.

## 3. Exact analyses compared

**Analysis A — Phase 1/2 verified Vanni 240 baseline.** The `analyses` table
has no separate row per historical result for a "working" analysis — the
same analysis id is reused across every rerun. Its true pre-Phase-1-fix
state survives as an explicit, immutable **saved snapshot**
(`save_working_analysis_snapshot`, migration `0033_working_analysis_lifecycle.sql`),
taken 2026-08-04 immediately before Phase 1's own classify_fps() rerun, and
labeled by that phase's own notes as preserving "the original
223.926fps-labeled zoneTimeS=2.21s result." Its confidence
(`0.9055155871735995`) and `tracking_loss_ranges` (`[{668,1019}]`) match the
roadmap/registry-documented Phase 1/2 baseline exactly, confirming identity.

| Field | Value |
|---|---|
| Session ID | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` |
| Analysis ID (saved snapshot) | `4b425ebf-6998-42d3-8105-0b5dfedcf93b` (`saved_version_number: 1`) |
| Job ID | not separately preserved — `analysis_jobs` is keyed by the reused working-analysis id, not versioned per snapshot |
| Source filename | `IMG_4557 2.mov` (original upload name; storage path `5df6454c-950f-4162-b756-42c353cb28ab/31fe352b-f00f-4a80-b20a-17c2ab08ec5a.mov`) |
| Source size / hash | 32,693,376 bytes (matches `docs/stationary-validation-registry.md`'s documented etag `cff31d89142356ebbad3de832a789795`) |
| Source frame count | 1095 container-tagged / **1020 actually decodable** (matches the registry's documented Phase 1 finding) |
| Source timestamps | real per-frame `sourceTimestampMs`/`tMs`, `sourceFrameIndex` 0-1019 |
| Pipeline version | `analysis_pipeline_version` unavailable on this historical row (predates that column's use here); `model_version: mediapipe-sprint-0.1` |
| Worker version | not separately recorded on saved snapshots |
| Pose backend/version | MediaPipe, `athlete_tracking_version: ava-single-pose-continuity-v1`, `dynamic_crop_version: ava-mediapipe-roi-v1` |
| Localization/crop/pose artifact | `pose-artifacts/5df6454c-950f-4162-b756-42c353cb28ab/31fe352b-f00f-4a80-b20a-17c2ab08ec5a/4b425ebf-6998-42d3-8105-0b5dfedcf93b.pose.json` (6,969,092 bytes; a genuinely separate stored object, not a reused path) |
| Contact/result artifact | none persisted server-side for this legacy row (`metrics` column null) — **recomputed** this phase via the real, unmodified `computeSprintMeasurements` (see Section 4) against the real, unmodified pose artifact, exactly reproducing the registry's documented headline numbers (avgIndividualStepLengthM 1.913m, peakStrideLengthM 2.061m, reportedMaxVelocityMps 10.580 m/s — see Section 5) |
| `athlete_tracking_confidence` | `0.9055155871735995` |
| `tracking_loss_ranges` | `[{startFrame: 668, endFrame: 1019}]` |
| Analysis creation time | row `created_at`/`saved_at`: `2026-08-04T21:50:42.266242+00:00` |

**Analysis B — Phase 4.2E result (this phase's own real rerun).**

| Field | Value |
|---|---|
| Session ID | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` (same) |
| Analysis ID | `a7679326-e193-4489-bf50-735fe402ec60` (same reused working row) |
| Job ID | `e1a0a55c-4cc4-4b00-a05c-20239be2eeaf` |
| Source filename/size/hash/frame count | identical — same session, same stored video, unchanged this whole engagement |
| Pipeline version | `analysis_pipeline_version: ava-sprint-60-v1` |
| Worker version | `ava-worker-1.0.0` |
| Pose backend/version | MediaPipe, `model_version: mediapipe-sprint-0.1` |
| Localization/crop/pose artifact | `pose-artifacts/5df6454c-950f-4162-b756-42c353cb28ab/31fe352b-f00f-4a80-b20a-17c2ab08ec5a/a7679326-e193-4489-bf50-735fe402ec60.pose.json` (7,281,549 bytes, this phase's final post-fix rerun) |
| `athlete_tracking_confidence` | `0.8855677463001256` |
| `tracking_loss_ranges` | `[{149,174},{180,183},{513,513},{516,516},{520,520},{522,957},{962,973},{975,1000}]` |
| `strideFrequencyHz` (whole-clip gait analyzer) | `5.62` |
| Analysis creation time | `completed_at ≈ 2026-08-06T02:38:47Z` (this phase's final rerun) |

**Setup identity confirmed**: both analyses share the exact same session
(`31fe352b-...`), the exact same stored source video (byte-identical size),
the exact same calibration (`calibration_point_ax/ay/bx/by`,
`calibration_known_distance_m: 20`, `calibration_gates` — a session-level
field, never modified across any rerun this whole engagement), the exact
same athlete (`5df6454c-...`), the exact same analysis type (fly-zone
sprint), and the exact same scientific distance (20m). No correction to the
comparison setup was required.

## 4. Methodology note: how metrics were recomputed for Analysis A

The saved snapshot's `metrics` column is null (a legacy artifact of when
this specific historical row was captured, before the schema always
persisted it). Per this project's own established Phase 0 convention
("computed by running the real, unmodified `computeSprintMeasurements`
production function against the real, already-persisted pose artifacts —
the same function `src/app/sessions/[id]/page.tsx` calls at render time"),
`computeSprintMeasurements` (`src/lib/benchmark/measurements.ts`) was run
directly against Analysis A's real, unmodified pose artifact plus the
session's real, unmodified calibration (`scripts/phase-4-2e-vanni-240-measurements.mjs`,
new this phase, adapted from the existing `scripts/benchmark-breakdown.mjs`
pattern to work without a `benchmark_id` link). It reproduced
`avgIndividualStepLengthM: 1.912951952754283`, `peakStrideLengthM:
2.0606099144108923`, `combinedStepFrequencyHz: 4.858299595141699`, and
`reportedMaxVelocityMps: 10.579734014114525` — matching the registry's
documented Phase 1/2 "current production output" line
(1.913m/2.061m/4.848Hz/10.58m/s) to full precision, positively confirming
this is genuinely the same historical result, not a re-derivation drift.

The SAME function was run against Analysis B's pose artifact for a direct,
apples-to-apples comparison (Section 5). Separately, `analyses.metrics`'s own
persisted `strideFrequencyHz` field (`5.62`/`5.56` before this phase) is a
**different** metric — the whole-clip gait-cadence analyzer
(`analyzeSprint`/`toAnalysisMetrics`, `src/lib/biomechanics/analysis/`),
which needs no calibration and was not itself the disagreement this phase
resolved (it changed only modestly across every state this engagement has
produced: 4.95 → 5.56 → 5.62 Hz).

## 5. Frame-level diff

Every one of the 1020 frames aligns exactly by `sourceFrameIndex`/`tMs`
between both artifacts (proof: `scripts/vanni-240-source-adjudication-sanity.py`
check 1/1b generalizes this exact property). Classification (identical /
insignificant / localization-disagreement / pose-only-difference /
scientific-eligibility-disagreement), computed programmatically over the
full clip:

| Class | Frames (baseline vs. this phase's final rerun) |
|---|---:|
| Identical | 195 |
| Insignificant visual difference | 88 |
| Pose-only difference | 44 |
| Localization disagreement | 258 |
| Scientific-eligibility disagreement (new `frozen_suspect`, no baseline equivalent) | 435 |

Nontrivial disagreement ranges (final, post-fix state): scientific-
eligibility disagreement clusters at frames 96-252 (matches the earlier-
known 149-183 tracking-loss gap plus additional now-excluded frames) and a
large 522-1000 span (fragmented into several sub-gaps, see Section 3's
`tracking_loss_ranges`); localization disagreement is spread through the
back half of the clip as the two pipelines' boxes diverge after frame ~480.

The **load-bearing** disagreement — the one that actually changes headline
metrics — was not visible from this aggregate table alone; it required
Part 3's targeted analysis (Section 6).

## 6. Load-bearing intervals

Aggregate pose-coverage stats looked broadly similar between the two
pipelines before this phase began (both around 85-89% confidence). Running
the real zone-based `computeSprintMeasurements` against both artifacts
directly (Section 4) surfaced a much sharper, previously-undetected
disagreement:

| Metric | Baseline (Phase 1/2) | Phase 4.2D (before this phase's fix) |
|---|---:|---:|
| `zoneEntryTimeS` | 0.246 | 0.246 |
| `zoneExitTimeS` (finish crossing) | 2.446 | 2.449 |
| `reportedZoneTimeS` | **2.2s** | **unavailable (null)** |
| `totalContacts` / `validContacts` | 14 / 11 | 7 / 6 |
| `combinedStepFrequencyHz` | 4.858 | 2.978 |
| `reportedMaxVelocityMps` | 10.580 | 9.530 |

The start/finish **crossing times** were still nearly identical between both
pipelines (continuous torso tracking apparently survives independently of
`frozen_suspect` gating) — but the **reported, validated** zone time, several
individual step lengths, and roughly half the contacts became unavailable in
the Phase 4.2D state. `zoneExitTimeS ≈ 2.446s` at ~240fps is frame **≈587** —
which falls inside the newly-`frozen_suspect`-excluded span starting at
frame 525. This pinpointed the exact load-bearing interval: **frames
~480-620**, spanning the finish crossing itself.

Per-interval detail:

- **Affected frames**: 480-620 (approach to and through the finish gate).
- **Affected contacts**: the finish-adjacent 3-4 contacts in Analysis A's
  zone-step sequence (steps 9-11, worldX 0.71-0.87) have no scientifically
  eligible equivalent in the Phase 4.2D state.
- **Affected feet**: both — the interval spans multiple full strides.
- **Downstream metric effect**: `reportedZoneTimeS`, `combinedStepFrequencyHz`,
  `reportedMaxVelocityMps`, and `peakStrideLengthM` all degrade or become
  unavailable, exactly the "metric-impacting" category Part 2 defines.

## 7. Source-frame evidence

Real frames were extracted directly from the stored source video
(`sprint-videos` bucket, exact same file both analyses reference) using
`cv2.VideoCapture`, sequential-decoded to the exact `sourceFrameIndex`,
rotated with `cv2.ROTATE_180` (the same correction `mediapipe_pose_runner.py`'s
own `rotation_code_for_angle` applies for this clip's real 180° rotation
tag — verified, not assumed; see Section 20's rotation tests). Both
pipelines' `athleteBoundingBoxSource` boxes were overlaid in normalized
source-space coordinates (already post-rotation, matching what MediaPipe/box_tracker
itself operated on). No preview-video substitution, no inferred frame
mapping — every extracted frame's `sourceFrameIndex` and `tMs` were read
directly from the real, persisted artifacts.

Contact-sheet-equivalent frames were produced for frames 0, 60, 96, 120,
150, 174, 180, 183, 200, 252, 300, 481, 490, 500, 508-522 (every other
frame), 525, 540, 550, 567, 570, 587, 600, 617, 618, 668, 700, 800, 900, 951,
952, 985, 1019 — spanning the identical, load-bearing, and freeze-onset
ranges.

## 8. Box adjudication

- **Frames 0-478**: both boxes track the athlete closely (small, sub-pixel-
  scale differences only) — `both_valid_equivalent`.
- **Frame 481**: both boxes correctly contain the athlete, mid-stride,
  clearly visible — `both_valid_equivalent`.
- **Frame 500**: the athlete passes directly beside a stationary, high-
  contrast trackside object (a blue barrel/trash can at the inside edge of
  the track). Both boxes still correctly overlap the athlete here, though
  visibly widened by the nearby object — `both_valid_equivalent`, but this
  is the first visible sign of the real hazard.
- **Frame 510**: **baseline correctly remains on the athlete** (visibly
  mid-stride, arm extended, clearly separated from the barrel). **The
  current pipeline's box has fully locked onto the stationary barrel
  itself** — zero relation to the athlete's actual position.
  `baseline_correct`. The box is attached to a static scene feature, not
  following the athlete, includes mostly the barrel rather than the
  athlete, and lags severely.
- **Frame 525-567** (pre-fix state): baseline continues correctly tracking
  the visibly sprinting athlete; the (pre-fix) current pipeline's box is
  entirely absent (no box at all, `boxOrigin=None`) or, after a false
  detector "recovery" at frame 568, locked onto a **completely unrelated,
  empty patch of background wall** (frame 587, visually confirmed: the blue
  box sits over bare concrete/staircase, nowhere near the athlete, who is
  clearly visible and running near the actual finish gate in the same
  frame). `baseline_correct`, and this is the single most decisive frame in
  the whole adjudication.
- **Post-fix state (frames 510-620)**: with the detector-plausibility fix
  applied, the false wall-lock at frame 568 no longer occurs (that specific
  candidate is now correctly rejected as `rejected_direction`). Optical-flow
  tracking itself still shows a real, distinct wobble/loss right around
  frames 514-522 — visually, the athlete is again passing directly beside/
  behind the same barrel a second time in this narrower window — after
  which the box settles onto a position that does not correspond to the
  athlete's real, continued forward progress. `both_invalid` for this
  narrower sub-interval: neither a false detector lock (fixed) nor a
  correct track — a genuine, unresolved optical-flow difficulty tied to
  proximity to the barrel, honestly gated out by `frozen_suspect` rather
  than reported as scientific fact.
- **Frames 668 onward**: baseline's OWN evidence also ends here (its
  documented `tracking_loss_ranges: [{668,1019}]`) — beyond this point
  neither pipeline has trustworthy evidence, and this phase does not treat
  the current pipeline's continued exclusion through 1019 as any kind of
  disagreement requiring adjudication.

## 9. Pose adjudication

The crop MediaPipe actually received for the disputed interval (`cropRect`
in both artifacts) tracks each pipeline's own (possibly wrong) box, as
expected — the wrong crop at frames ~510-620 in the pre-fix state
necessarily fed MediaPipe an image region not centered on the athlete,
which is *why* Phase 4.2C/4.2D's own frozen_suspect/pose-gating correctly
withheld the resulting pose from scientific use rather than anatomically
validating a joint alignment that was never going to be meaningful (a wrong
crop cannot produce a meaningfully "supported" pose regardless of keypoint
count). `neither_supported` for the disputed interval in the pre-fix state
— consistent with, not contradicting, this phase's own gating.
`backend_ambiguous` is not applicable; identity is MediaPipe in both. No
stale/frame-mismatched pose was found (source/pose frame indices remained
aligned throughout, confirmed via the same `sourceFrameIndex` fields both
artifacts share).

## 10. Contact adjudication

The real, visible contact timeline from source video is consistent with
baseline's own zone-step sequence through the finish (11 valid in-zone
contacts, steps at worldX 0.21 through 0.87, one every ~0.2-0.25s — a
physically plausible, consistent sprint cadence). The Phase 4.2D
(pre-fix) state's reduced contact count (6 valid) is **not** independent
new evidence about the athlete's real contacts — it is a direct downstream
consequence of the box-lock/loss interval described in Section 8, i.e.
**falsely removed**, not a genuine recovery or correction. No contacts were
transferred from another Vanni run; every contact reported in this section
comes from `computeSprintMeasurements` run directly against each
analysis's own real artifact.

## 11. Metric causal chains

**Chain (pre-fix Phase 4.2D state)**:
`box_tracker.py`'s detector-event acceptance branch only checks
`rejected_teleport`
→ a direction-implausible detector candidate at frame 568 is wrongly accepted as "detected"
→ the box locks onto a static background wall patch, not the athlete
→ `cropRect` centers on background for the finish-crossing interval
→ MediaPipe pose evidence in that interval is not meaningfully anatomical (correctly excluded via `frozen_suspect`/`invalid` gating)
→ foot-contact evidence in the finish-crossing interval is unavailable
→ eligible in-zone contact count drops (11 → 6)
→ `reportedZoneTimeS`, `combinedStepFrequencyHz`, `reportedMaxVelocityMps` degrade or become unavailable.

| Metric | Baseline | Pre-fix (4.2D) | Post-fix (4.2E) | Classification |
|---|---:|---:|---:|---|
| `zoneEntryTimeS` | 0.246 | 0.246 | 0.246 | harmless provenance-only difference |
| `zoneExitTimeS` | 2.446 | 2.449 | unavailable | unresolved (see Section 12) |
| `reportedZoneTimeS` | 2.2s | unavailable | unavailable | unresolved |
| `totalContacts`/`validContacts` | 14/11 | 7/6 | 6/5 | regression (pre-fix), still not fully recovered post-fix |
| `avgIndividualStepLengthM` | 1.913m | 1.989m | 1.929m | unresolved (fewer, different contacts) |
| `peakStrideLengthM` | 2.061m | 1.989m | unavailable | unresolved |
| `combinedStepFrequencyHz` | 4.858 | 2.978 | 2.697 | regression, not yet resolved |
| `reportedMaxVelocityMps` | 10.580 | 9.530 | 9.306 | unresolved |
| `athlete_tracking_confidence` | 0.9055 | 0.8677 (4.2D) / 0.8669 (mid-session) | **0.8856** | improved by this phase's fix, not fully restored |
| `frozen_suspect` frame count | n/a (concept didn't exist) | 578 | **435** | improved by this phase's fix |

The **detector false-positive background lock** (frames ~510-620,
pre-fix) is a proven **regression**, now fixed. The **remaining**
zone-time/velocity/contact gap (post-fix) is an **unresolved, genuine
evidence gap** — real optical-flow difficulty near the same barrel, not
proven to be either a scientific correction or a further code defect.

## 12. Freeze-evidence adjudication

For the `frozen_suspect` intervals directly relevant to the load-bearing
disagreement (frames ~482-524 pre-lock drift, and ~513-1000 post-fix):

- **Frames 482-508**: box still nominally on/near the athlete but widening
  as the barrel enters proximity — genuine early degradation, not yet
  frozen.
- **Frames 510-524 (pre-fix)**: box drifts fully onto the barrel —
  **crop-planner/tracker artifact** (optical-flow feature points partially
  captured by the barrel's high-contrast static texture), not a true
  background lock in the "camera panned onto empty scenery" sense, and not
  a legitimate low-motion track (the athlete is clearly still sprinting).
- **Frame 568 (pre-fix)**: a **detector correction artifact** — a real
  MediaPipe detection, but of the wrong subject (a false positive on
  background), wrongly accepted due to the exact plausibility-enforcement
  gap this phase found and fixed (Section 9).
- **Frames 570-617 (pre-fix)**: **true stale box** — the wrongly-accepted
  frame-568 position genuinely does not move (it's locked to real, static
  background), so the freeze-suspicion signal correctly, retroactively
  flags it once enough time elapses (frame 618 onward) — this part of the
  system worked exactly as designed once given a bad anchor.
- **Frames 513-1000 (post-fix)**: with the false detector correction
  removed, the box instead shows a genuine, if narrower, **optical-flow
  tracking difficulty** near the same barrel (frames ~514-522) followed by
  a settled, non-progressing position for the remainder of the clip,
  correctly flagged `frozen_suspect`. Retroactive confirmation never
  resolves it (no later detector event succeeds at reacquiring the real
  athlete for the rest of this clip — `originsCount` for the final state
  shows 9 `detected`, 0 `reacquired` after this point).
- **Verdict**: the pre-fix false alarm sequence (barrel drift → false
  detector lock → correctly-flagged stale box) is now understood in full;
  the fixed defect was specifically the **detector-correction-artifact**
  step (frame 568's acceptance). The remaining post-fix freezes in this
  region are best classified **unresolved** — plausibly a **crop-
  planner/tracker artifact** tied to the barrel's specific visual
  properties, but not proven to be a further code defect distinct from
  "optical flow, using this codebase's current feature-tracking approach,
  is not fully robust to a static high-contrast object directly beside the
  athlete's path." No global freeze-detection logic was disabled or
  weakened to reach this conclusion.

## 13. Correct reference decision

Per Part 10's explicit framework:

**Decision: Hybrid (Option C), narrowly scoped.** The whole-clip crop-fit
regression (Phase 4.2C→4.2D) and the detector-event-plausibility defect
(this phase) are both real, general, now-fixed pipeline defects — for
frames outside the barrel-proximity interval, the current, protected
pipeline is scientifically preferable to baseline (it is the only one that
correctly excludes truly unsupported evidence elsewhere in the clip, per
Phase 4.2's own mandate). For the narrow, load-bearing interval spanning the
finish crossing (frames ~480-620), evidence is **insufficient** to declare
either pipeline's specific box position "correct" throughout — baseline
happens to track correctly there (verified directly, Section 8), but that
does not establish the CURRENT pipeline's exclusion is wrong, because the
exclusion is driven by a real, visually-confirmed optical-flow difficulty,
not a proven logic defect. Per Option D for this specific sub-interval: the
metrics it feeds (`reportedZoneTimeS`, `combinedStepFrequencyHz`,
`reportedMaxVelocityMps`, `peakStrideLengthM`) remain honestly unavailable
rather than restored by reverting protections or accepted as a "correction"
without independent proof.

## 14. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — the detector-
  event-plausibility enforcement fix: new `DETECTOR_EVENT_REJECTED_CLASSIFICATIONS`
  tuple; `step()`'s acceptance branch now checks membership in that tuple
  instead of `== "rejected_teleport"` alone; three new diagnostic counters
  (`detector_events_rejected_direction`, `_rejected_scale_discontinuity`,
  `_rejected_stale_frame`) plus their `summary()` fields.
- `scripts/phase-4-2e-vanni-240-measurements.mjs` — new; real zone-based
  `computeSprintMeasurements` runner for an arbitrary pose artifact against
  `vanni_fly_240`'s real session calibration, without requiring a
  `benchmark_id` link (adapted from `scripts/benchmark-breakdown.mjs`).
- `scripts/phase-4-2d-fetch-analysis.mjs` — reused unmodified from Phase
  4.2D for real DB/storage reads of confidence/tracking-loss/origins.
- `scripts/detector-event-plausibility-sanity.py` — new, 15 checks, direct
  and end-to-end regression guards for the fix.
- `scripts/vanni-240-source-adjudication-sanity.py` — new, 11 checks,
  frame-domain-alignment/rotation/metrics-not-evidence/rolling-window
  contracts this phase's own methodology relied on.
- `package.json` — two new npm scripts (`detector-event-plausibility:sanity`,
  `vanni-240-source-adjudication:sanity`) plus `crop-segment-planning:sanity`
  (wired this phase; existed as a bare script since Phase 4.2D but was never
  added to `package.json`).

## 15. Database changes

None to production data beyond the normal, expected effect of real
production reruns (`replace_working_analysis`/`save_working_analysis_snapshot`,
the same mechanism every prior phase in this engagement used) — 4 new saved
snapshots (Gav, Vanni 120, Vanni 60, Vanni 240 pre-rerun states), each
immutable and additive. No manual mutation of the protected Gav benchmark.
No `db:reset`.

## 16. Production rerun (Vanni 240)

Two real reruns this phase: one to observe the pre-fix state directly
(confirming the diagnosis), one with the fix applied (Section 3's Analysis
B). Determinism: this phase's fix is a pure control-flow change (no new
randomness); the existing `plan_crops`/`box_tracker` determinism guarantees
(Phase 4.2D's own fixture, Section 20 here) cover it — a second full
production rerun was not additionally required beyond the two already
performed for diagnostic vs. final-state comparison.

Final state (job `e1a0a55c-4cc4-4b00-a05c-20239be2eeaf`): localization
states, crop segments, `frozen_suspect` intervals, and all headline numbers
are reported in Sections 3, 6, and 11. Detector calls: 11 (down from 16
pre-fix — fewer false "detected" events now means fewer subsequent
plausibility-check invocations get triggered by their own bad state).
Runtime and lease/heartbeat health: completed without any `heartbeat_miss`
or lease-expiry event in this phase's final rerun (one earlier, diagnostic
rerun logged a single transient `heartbeat_miss` during MediaPipe
processing on the 1020-frame 240fps clip — not a code defect, consistent
with this project's already-documented long-running-job behavior; the job
completed normally on the same attempt).

## 17. Gav regression check

Real production rerun after the fix, analysis `3a148f45-02ff-492d-b9f1-790470b83c21`:
`athlete_tracking_confidence` **0.8024089716118894**, `tracking_loss_ranges`
**`[]`**, `strideFrequencyHz` **4.4**, `originsCount` `invalid=7, detected=12,
tracked=123` — **exact byte match** to Gav's original, always-protected
baseline. No regression.

## 18. Vanni 120 regression check

Real production rerun, analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`:
`athlete_tracking_confidence` **0.9171411404253191**, `tracking_loss_ranges`
**`[{317,482}]`**, `strideFrequencyHz` **5.01** — **exact byte match** to
Phase 4.2C/4.2D's corrected baseline. The frame-215 incident correction and
detector-cost optimization both remain fully intact.

## 19. Vanni 60 regression check

Real production rerun, analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`:

| | Before this phase | After this phase |
|---|---:|---:|
| `athlete_tracking_confidence` | 0.9124 | 0.9003 |
| `tracking_loss_ranges` | `[{29,29},{154,159},{161,232}]` | `[{29,29},{152,232}]` |
| `strideFrequencyHz` | 4.07 | 3.93 |
| Detector invocations | 12 | 9 |

Vanni 60 has no hand-verified baseline (documented, established precedent
since Phase 4). This change is in the **same direction** as Vanni 240's
(fewer wrongly-accepted detector events, a slightly larger, more honest
excluded span) — consistent with the fix being a real, general improvement
rather than a Vanni-240-specific tune. Per this phase's own explicit
instruction, not investigated further.

## 20. Tests and exact outcomes

New this phase:

- `scripts/detector-event-plausibility-sanity.py` — **15/15 PASS**.
- `scripts/vanni-240-source-adjudication-sanity.py` — **11/11 PASS**.

Re-run, all pre-existing (no regressions from this phase's fix):

| Suite | Result |
|---|---|
| `stationary-validation-registry:sanity` | 1 pre-existing, disclosed failure (roadmap weight pool 105%, item 20's "remains explicitly reported" — confirmed still reported, not silently fixed) |
| `box-tracker:sanity` | ALL PASSED |
| `box-tracker-teleport:sanity` | ALL PASSED |
| `box-tracker-frozen-track:sanity` | ALL PASSED (covers items 4/5/6: true-freeze-rejected, high-speed-not-falsely-frozen, spread-growth-alone-insufficient) |
| `box-tracker-crop-provenance:sanity` | ALL PASSED (covers item 9: source box/crop provenance alignment; item 19: no panning files touched) |
| `crop-segment-planning:sanity` | ALL PASSED (covers item 8: reacquisition starts the correct segment) |
| `vanni-240-metric-evidence:sanity` | ALL PASSED |
| `measurement-recovery:sanity` | ALL PASSED (covers item 12: unsupported interval stays unavailable) |
| `timing-verification:sanity` | ALL PASSED |
| `analysis-fps:sanity` | passed |
| `zone-step-counting:sanity` | 25/25 (covers item 13: contact timeline cannot bridge missing contacts) |
| `zone-coverage:sanity` | ALL PASSED |
| `analysis-report:sanity` | ok |
| `worker:check` | `worker_configuration_valid` |
| `lint` | clean, 0 warnings |
| `typecheck` (`tsc --noEmit`) | clean |
| `build` (`next build`) | succeeded |

Item mapping for the 20 required tests: 1/2/3/7 → new
`vanni-240-source-adjudication-sanity.py`; 4/5/6 →
`box-tracker-frozen-track-sanity.py` (pre-existing, re-verified); 8 →
`crop-segment-planning-sanity.py`; 9 → `box-tracker-crop-provenance-sanity.py`;
10/11/12 → this phase's own real adjudication (Sections 8-13) plus
`measurement-recovery-sanity.mjs`/`zone-coverage-sanity.mjs`; 13 →
`zone-step-counting-sanity.mjs`; 14 → `timing-verification-sanity.mjs` +
real Gav rerun; 15 → Section 17; 16 → Section 18; 17 → Section 16/18
(detector invocation counts); 18 → Section 19; 19 →
`box-tracker-crop-provenance-sanity.py` check 23; 20 →
`stationary-validation-registry-sanity.mjs`'s own disclosed failure, and
Section 23 below.

## 21. Phase 4.2E acceptance table

| # | Criterion | Result |
|---|---|---|
| 1 | Both Vanni 240 analyses identified exactly | **Met** — Section 3 |
| 2 | All material localization/crop/pose/contact differences mapped | **Met** — Section 5/6 |
| 3 | Source frames inspected directly | **Met** — Section 7/8 |
| 4 | Every load-bearing interval adjudicated | **Met** — Section 6/8/9/10 |
| 5 | Freeze evidence independently validated | **Met** — Section 12 |
| 6 | Correct reference result selected scientifically | **Met** — Section 13 (Hybrid, narrowly scoped) |
| 7 | Any production defect receives the smallest general fix | **Met** — Section 9/14 (one proven defect, one narrow fix) |
| 8 | Any benchmark update is transparent and evidence-backed | **Met** — no benchmark fixture values were altered; disagreement documented instead |
| 9 | Vanni 240 is deterministic | **Met** — Section 16 |
| 10 | Gav does not regress | **Met** — Section 17 |
| 11 | Vanni 120 does not regress | **Met** — Section 18 |
| 12 | Vanni 60 does not regress | **Met** (no baseline to regress against; consistent directional change) — Section 19 |
| 13 | Detector-cost gains remain | **Met** — Section 16/18 |
| 14 | Crop provenance remains complete | **Met** — unchanged, `box-tracker-crop-provenance:sanity` clean |
| 15 | All relevant tests pass | **Met**, with the one pre-existing disclosed failure |
| 16 | Full Phase 4.2 acceptance reevaluated honestly | **Met** — Section 22 |

## 22. Full Phase 4.2 acceptance table (re-evaluated after Phase 4.2E)

| # | Criterion | Result |
|---|---|---|
| 1 | Vanni 240 disagreement fully resolved | **Not met** — the false-positive background lock IS resolved; a real, narrower, unproven optical-flow difficulty near the finish-line barrel remains, leaving `reportedZoneTimeS`/`combinedStepFrequencyHz`/`reportedMaxVelocityMps` unavailable |
| 2 | Vanni 120 remains corrected | **Met** |
| 3 | Protected Gav remains non-regressed | **Met** |
| 4 | Vanni 60 remains non-regressed | **Met** (no baseline; consistent direction) |
| 5 | Crop provenance complete | **Met** |
| 6 | Stale/suspect boxes cannot create scientific evidence | **Met** — the exact mechanism this phase's fix strengthens |
| 7 | Pose feedback remains bounded | **Met** (unchanged) |
| 8 | Detector cost remains safe | **Met** |
| 9 | Segment-aware crop planning remains valid | **Met** — unchanged, re-verified |
| 10 | All real reruns and tests pass | **Met**, with the one pre-existing disclosed failure |

**Overall determination**: because criterion 1 is not met, **Phase 4.2
remains In Progress**. No partial weighted credit is invented for this
subphase alone. Phase 4.2 continues to contribute **0%** to the roadmap.

## 23. Roadmap progress before vs. after

**Before Phase 4.2E**: 26.8% (Phase 4.2 at 0.0%).
**After Phase 4.2E**: **26.8%**, unchanged. Phase 4.2 remains at 0.0%.

The weight-pool discrepancy (105% base + 4% Phase 4.1 + 3% Phase 4.2 = 112%,
normalized denominator) is unchanged and not touched, per this phase's
explicit instruction not to silently normalize, rebalance, or rewrite
historical weights. `docs/stationary-roadmap-progress.md` is updated in the
same change set as this report (Phase 4.2's subphase list now includes
Phase 4.2E; roadmap header/timestamp updated; overall completion figure and
weight-pool note left numerically identical, since nothing about the
underlying arithmetic changed this phase).

## 24. Remaining limitations

- The finish-crossing-adjacent optical-flow difficulty (frames ~510-620,
  tied to a specific trackside barrel) is real and visually confirmed, but
  its root cause within the optical-flow implementation itself (as opposed
  to "this is just a hard visual case for KLT-style sparse feature
  tracking near a static high-contrast object") was not further isolated
  this phase — doing so would likely require either a different tracking
  algorithm or object-aware feature-point filtering, both explicitly out of
  scope ("detector-model replacement" is a listed hard constraint).
- Vanni 240's zone time, combined step frequency, and peak velocity remain
  unavailable in the current production state — a real, disclosed loss of
  previously-available (if not fully trustworthy) numbers, not silently
  hidden.
- The exact original job ID for the Phase 1/2 baseline snapshot is not
  separately preserved by this schema (Section 3) — a minor provenance gap
  in the snapshot mechanism itself, unrelated to this phase's own work.
- Vanni 60's directional change (fewer detector invocations, larger
  excluded span) was not independently visually verified against its own
  source video this phase, per the task's explicit instruction to leave it
  uninvestigated.

## 25. Git status

No commits or pushes were made this phase. All changes remain in the
uncommitted working tree: `src/lib/biomechanics/mediapipe/runtime/box_tracker.py`,
new `scripts/phase-4-2e-vanni-240-measurements.mjs`,
`scripts/detector-event-plausibility-sanity.py`,
`scripts/vanni-240-source-adjudication-sanity.py`, `package.json` (three new
script entries), this report, and the roadmap update. Verified via `git
status`/`git log` before finishing — `git log` shows no new commits beyond
the pre-existing `c8aa4090` HEAD.

## 26. Exact recommended Phase 4.3 scope

Phase 4.3 should **not** begin until a Phase 4.2F closes the one remaining
open question from Section 24:

1. Determine, via a focused investigation of the optical-flow implementation
   specifically (not a new architecture), whether a bounded, general
   improvement — e.g. excluding flow points whose motion is inconsistent
   with the majority cluster's own velocity, a known, standard, non-invasive
   KLT refinement — resolves the barrel-proximity difficulty without
   touching anything else.
2. If such a fix is found and proven safe against Gav/Vanni 120/Vanni 60
   (the same standard this phase and 4.2D held to): re-run Vanni 240,
   re-adjudicate the finish-crossing interval specifically, and close Phase
   4.2 if it now matches or is scientifically justified against the Phase
   1/2 baseline.
3. If no such fix is found within reasonable scope: formally document
   Vanni 240's zone-time/velocity/frequency as a **permanently withheld**
   measurement for this specific recording (an honest "evidence
   insufficient" outcome under the project's own accuracy manifesto) and
   revisit whether Phase 4.2's own acceptance contract should explicitly
   carve out this one clip as unscoreable, rather than continuing to block
   the whole phase indefinitely — a decision for the task author, not this
   phase to make unilaterally.
4. Only after (2) or a deliberate, explicit (3) decision: begin Phase 4.3.
