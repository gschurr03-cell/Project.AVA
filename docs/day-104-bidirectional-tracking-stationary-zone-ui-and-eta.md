# Project AVA
## Bidirectional Tracking, Stationary Zone Visualization, and Analysis ETA (Day 104)

Status: real production-path implementation and validation, building directly
on Days 99–103. No panning code was touched. Athlete Intelligence was not
touched. No evidence threshold was weakened — every new check reuses or
extends the existing, already-validated `evaluateStepInterval`/continuity
constants. Nothing was fabricated: contacts, poses, and gate positions
displayed by any of this session's changes are always either real measured
evidence or explicitly marked unavailable. Database changes were limited to
one additive migration (`0071_analysis_job_progress.sql`), applied locally via
`supabase migration up` — `db:reset` was never run. Nothing was committed or
pushed.

---

## 1. Vanni vs Gav comparison

Three real, distinct sessions were used. A genuine "Gav 20m fly baseline"
video did not initially exist in this environment — the only video tied to
the athlete record "Gav" was a failed, 30fps, insufficient-temporal-
resolution 2023 acceleration clip, and the historical "gav video" referenced
in `docs/day-97-...md` (which measured 10.74 m/s via VueMotion) turned out to
have no raw video file surviving in Storage, only its reference numbers in
the `benchmarks` table. This was flagged to the user, who uploaded a real
"Gav 20m Fly Baseline video" session mid-session — that upload
(`e04a7983-7406-4a00-bb89-8ada7b10bf9f`) is the "Gav" used throughout this
report.

| Field | Vanni 240fps | Vanni 60fps | Gav 20m fly baseline |
|---|---|---|---|
| Session ID | `227ae200-af96-4ffc-94d0-56d2e5f9d155` | `c3f1e165-cffc-4efa-b9ae-adf3cf792193` | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` |
| Analysis ID | `27ed40b1-9f34-4f88-b134-36c6c9b3fefb` | `ed925bc7-014d-4afb-bdf3-2bdea7365dfb` | `3a148f45-02ff-492d-b9f1-790470b83c21` |
| Source codec | HEVC (Main) | HEVC (Main 10, DOVI HDR) | H.264 (Main) |
| Source fps | 239.48 (r=240/1) | 59.97 (r=60/1) | 59.16 |
| Resolution | 1920×1080 | 1920×1080 | 1920×1080 |
| Rotation metadata | 180° (tag + Display Matrix) | 180° (tag + Display Matrix) | none |
| Frame count | 2348 | 818 | 142 |
| Zone distance | 20 m | 30 m | 20 m |
| Travel direction | left_to_right | left_to_right | left_to_right |
| `recording_mode` (pre-fix) | `athlete_tracking_lost` | `athlete_tracking_lost` | `static_precision` |
| `spatial_metric_eligibility` (pre-fix) | withheld | withheld | eligible |
| First frame with ANY landmark (pre-fix) | 1179 | 578 | 0 |
| Longest continuous foot-landmark run (pre-fix) | 1501–1995 (495 frames) | 578–666 (89 frames) | 0–141 (all 142 frames) |
| `trackingDebug.summary.poseValidPct` (pre-fix) | 1.36% | 0.86% | 8.45% |
| First `identityState: verified` (pre-fix) | frame 1521 | frame 612 | frame 7 |
| `tracking_loss_ranges` (pre-fix) | `[{0,1178},{1182,1204},{1206,1330},{1332,1500},{1996,2347}]` | `[{0,577},{667,692},{739,817}]` | `[]` (none) |
| Average keypoint confidence when present | 0.862 | 0.794 | 0.830 |
| Crop area-fraction (median) | 4.6% of frame | 7.7% of frame | 2.72% of frame (tight, stable) |
| Stored step diagnostic | "22 of 25 steps rejected as implausible" | "10 of 14 steps rejected as implausible" | "14 of 21 steps rejected as implausible" |

*(Vanni 240/60 pre-fix numbers are from the ORIGINAL pose artifacts, produced
before any of this session's code changes — see Part 11 for the after
numbers from the real rerun through the fixed pipeline.)*

### Root cause of the behavioral difference

**It is not FPS, codec, or rotation.** Both hypotheses were directly ruled
out:
- Rotation: both Vanni clips carry 180° rotation metadata; Gav carries none.
  `mediapipe_pose_runner.py`'s `probe_rotation_degrees`/`rotation_code_for_angle`
  /`apply_rotation` (the exact Day 96 fix for this class of bug) already
  reads and corrects it before every detector/tracker stage — confirmed by
  direct code reading. If this correction were failing, per-point confidence
  *when a landmark exists* would be visibly worse on the Vanni clips; it
  isn't (0.79–0.86 vs Gav's 0.83 — statistically indistinguishable).
- Codec/HDR: Vanni 60fps carries Dolby Vision HDR side-data Gav doesn't; this
  is incidental container metadata, not something the CPU-side OpenCV/
  MediaPipe pipeline treats differently once decoded to 8-bit BGR frames.

**The real, measured difference is acquisition latency, not detection
quality.** On both Vanni clips, the athlete tracker produces **zero**
landmarks for the first 50–70% of the clip's runtime (frames 0–1178 of 2348
on the 240fps clip; 0–577 of 818 on the 60fps clip) before ever locking
identity — not because MediaPipe can't find a pose there, but because the
forward-only, cold-start SEARCHING→CANDIDATE→VERIFYING state machine
(Day 101) requires multiple, mutually-corroborating, *moving* sightings
before it will trust an identity, and on both Vanni clips the athlete starts
distant/small/near-stationary at the true start of the clip — exactly the
regime that acquisition is (correctly) most conservative about, per Day 100's
bleacher-lock incident. Gav's clip, by contrast, is framed so the athlete is
already large and moving from frame 0, so acquisition completes by frame 7
(0.13s) — an artifact of **framing and clip trimming**, not tracking
correctness.

A second, independent defect was found on both Vanni clips (not present on
Gav): near the end of each clip, `boxOrigin` reports `tracked` with
`selectedScore: 1` (maximal confidence) on frames where MediaPipe's own crop
inference finds **zero** keypoints (`kpCount: 0`) — the box tracker is
carrying forward a stale/drifted crop with false confidence rather than
correctly reporting loss. This is the exact optical-flow drift failure mode
Day 102 diagnosed but explicitly deferred repairing.

Both defects point at the same underlying gap: **the forward-only pipeline
has no way to recover evidence it can honestly see once it's decided
"acquiring"/"drifted," even when the raw candidate detections needed to
recover it were already being computed and discarded.** Parts 2 and 4 below
address exactly this.

---

## 2. Bidirectional tracking architecture

**Key discovery that made this tractable without a second video decode or
any extra MediaPipe cost**: `box_tracker.py`'s `wants_detector_frame()`
already requests the (expensive) identity-verified multi-candidate MediaPipe
detector on **every single frame** while `track_state == "acquiring"` (i.e.
before the first identity lock) — not just on the usual 8-frame cadence. That
means real, per-frame MediaPipe candidate detections for the ENTIRE pre-lock
region were already being computed by the existing pipeline every run — and
then discarded the instant `AthleteTracker.step()` consumed them.

**The fix**: buffer those already-computed candidates (`pre_lock_candidates`,
keyed by frame index) during the forward pass, and once the first true
identity lock is reached (`identity_state` first becomes `"tracked"` —
captured as the exact anchor frame + the tracker's own normalized
position/height/time reference), walk them **backward** in time from the
anchor toward frame 0, in `athlete_tracker.py`'s new `track_backward()`.

The backward walker reuses the *exact same, unweakened* continuity physics
forward `TRACKED` tracking already relies on (`score_candidate_continuity` —
extracted from `AthleteTracker._score_candidate` as a pure, module-level
function via a zero-behavior-change refactor, so the 43 pre-existing
`athlete-tracker:sanity` checks are the regression guard for that
extraction, not a new test): teleport rejection (implied velocity vs. the
athlete's own established speed), scale-consistency rejection, direction
consistency, human-shape and landmark-completeness floors. It deliberately
does **not** re-run the Day 101 acquisition-only gates (near-entry corridor,
stationary-candidate timeout) — those exist to bound where an identity may be
acquired *from scratch* with nothing to compare against; here there is always
a trusted, moving reference (the anchor, or the most recently recovered
frame), which is a *stronger* per-frame defense than a one-time acquisition
gate.

- **Stops at the first unsupported frame** — never skips a gap and resumes
  further back, and never predicts/extrapolates a box for a frame with no
  real detection. A bleacher/spectator/background candidate at an
  implausible implied velocity relative to the walking reference is rejected
  exactly like forward tracking rejects it (hard `teleport_implausible_velocity`
  rejection), not merely down-weighted.
- **Never creates pose evidence from a predicted box** — the recovered boxes
  only feed `plan_crops()` (Pass 1's existing crop-planning function,
  unmodified), which in turn only *positions* where Pass 2's real MediaPipe
  pose inference looks. Pass 2 still runs real inference on real pixels for
  every frame; a recovered box can only make that inference more likely to
  succeed by looking in the right place — it cannot fabricate a landmark.
- **Provenance is persisted**: a new `boxProvenance` field
  (`forward_detection | forward_reacquired | forward_tracking |
  backward_detection | predicted_only | invalid`) is attached to every frame
  in the `trackingDebug` artifact, plus a `backwardRecovery` diagnostics
  block (`anchorFrame`, `stopFrame`, `stopReason`, `recoveredFrameCount`,
  `firstRecoveredFrame`, `lastRecoveredFrame`, up to 10 `rejectedSamples`).
  Critically, the recovered frames' `box_track_records[f].boxOrigin` is also
  patched to `"detected"` (the semantically correct value — a fresh,
  identity-verified sighting) so the *existing* Day 96/99 provenance checks
  in `measurements.ts` and `VideoOverlay.tsx` (which strip landmarks for
  `predicted`/`invalid` origin) don't silently discard the newly-recovered
  evidence — this was a real gap found and closed during implementation (see
  Part 9's before/after for why it mattered).

**Scoping decision, disclosed honestly**: the backward walker uses real
per-frame MediaPipe *detection* exclusively (denser than forward's periodic-
cadence-plus-optical-flow design), not a distinct backward optical-flow
"tracking" sub-mode. This was a deliberate, bounded choice: it reuses
detector calls the pipeline was already making (zero extra cost, low risk),
whereas adding backward optical flow would have required either buffering a
large window of raw frames in memory or a second video decode — a much
larger, riskier change for a single milestone. `boxProvenance` therefore
never emits `"backward_tracking"` as a distinct value from
`"backward_detection"` in this implementation; this is disclosed, not
silent.

**A real bug, caught and fixed via honest end-to-end testing, not left in the
report as a false success.** The first version of this implementation gated
the pre-lock candidate buffer and anchor capture on
`box_tracker.track_state == "acquiring"`. Unit tests (43 pre-existing +
5 new backward-recovery checks) all passed, because the synthetic fixtures
happened to lock within a frame or two. A real production rerun exposed the
defect immediately: `box_tracker.track_state` flips from `"acquiring"` to
`"reacquiring"` the moment the *first* detector call fails to select a
candidate (the prediction-fallback branch in `AthleteBoxTracker.step`,
reached whenever `last_box is None` — true for every frame before the real
first lock) and never reverts. Since a real lock always takes at least
`MIN_VERIFICATION_HITS` (3) corroborating hits, this meant `was_acquiring`
was only ever true for frame 0 on a real clip — silently disabling backward
recovery entirely (`pre_lock_candidates` stayed near-empty, `anchor_frame`
never got set, `backwardRecovery` never appeared in the artifact) while
every unit test still passed. **Fixed** by switching the signal to
`AthleteTracker.identity_state in ("searching", "candidate", "verifying")`
— the athlete_tracker's own pre-lock states, which correctly persist for the
entire real pre-lock period regardless of box_tracker's separate state
machine. A new regression test (`box-tracker:sanity`, "REGRESSION:...")
reproduces and documents the exact discrepancy so this class of mistake
can't silently recur. Verified fixed via a second real direct rerun (Part 9).

**Files changed**: `src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`
(`score_candidate_continuity` extraction, new `track_backward()`),
`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` (pre-lock
candidate buffering keyed on `identity_state`, anchor capture, backward-
recovery invocation, box/box_track_records patching, `boxProvenance`
construction, `pass1_total_frames` progress-total fix), `src/lib/biomechanics/mediapipe/trackingDebugSchema.ts`
(`boxProvenance`, `backwardRecovery` schema additions, additive/optional),
`scripts/athlete-tracker-sanity.py` (5 new backward-recovery test sections),
`scripts/box-tracker-sanity.py` (2 new regression tests documenting the
`track_state` vs `identity_state` discrepancy).

---

## 3. Forward-continuity findings (Part 4)

Day 102 diagnosed but explicitly deferred the real root cause of mid-run
tracking loss: `box_tracker.py`'s optical-flow feature points can drift onto
a lower-motion sub-region (e.g. torso/clothing texture) while still reporting
high inlier confidence and `boxOrigin: "tracked"`, because the box only gets
re-verified by the identity-checked detector on a *fixed* 8-frame cadence
regardless of how the flow quality is actually trending.

**Fix implemented**: adaptive/accelerated detector refresh
(`box_tracker.py`, `ACCELERATED_REFRESH_*` constants) — when a rolling
4-frame window of optical-flow inlier ratios trends below `0.55` (well above
the hard `0.35` acceptance floor, which is unchanged) for at least 3 frames
since the last detector call, the box tracker requests the detector *early*,
before the normal 8-frame cadence elapses. This is purely additive: it can
only make the detector run **more** often, never relaxes the `0.35`
acceptance threshold, and never changes which candidate is accepted once the
detector *does* run — the existing teleport/scale/direction continuity
checks are what actually catch and reject a drifted box; this only gives
them the chance to run sooner. `recent_inlier_ratios` resets on every fresh
identity-verified detection, so stale pre-relock history never forces an
unnecessary immediate re-refresh.

This is the exact "accelerated refresh under declining optical-flow quality"
opportunity Day 102 named as real and unimplemented. It was safe to build
now because this session has real evidence from *two* real clips (Vanni 60fps
and Vanni 240fps) plus a Gav regression check to validate against — meeting
the validation bar Day 102's own caution principle asked for before touching
tracking-safety-critical code.

Per-frame gap diagnostics (last valid pose frame, first missing frame, first
recovered frame, box/detector/optical-flow state, exact failure reason) are
already fully captured by the existing `trackingDebug` artifact (Day 96/99)
and now additionally carry `boxProvenance` — no new gap-diagnostic
infrastructure was needed, only the fix itself plus the provenance field.
Interpolated/fabricated skeletons through long gaps remain categorically
impossible: `VideoOverlay.tsx` and `computeSprintMeasurements` both still
strip landmarks for any frame not `detected`/`reacquired`/`tracked`, which
this session did not relax.

**Files changed**: `src/lib/biomechanics/mediapipe/runtime/box_tracker.py`
(`ACCELERATED_REFRESH_*` constants, `recent_inlier_ratios` tracking,
`wants_detector_frame()` extension). `scripts/box-tracker-sanity.py` was
rewired into `package.json` for the first time this session (it existed but
was never wired in, and had gone stale against the Day 101 multi-stage
acquisition redesign — all fixtures were rewritten to use a `lock_in()`
helper mirroring `athlete-tracker-sanity.py`'s own `run_to_tracked`, and 7
new `P4.*` white-box tests were added for the adaptive-refresh logic
specifically).

---

## 4/5. Overlay timing findings (Parts 3/5)

**Part 3 — earliest-frame overlay behavior.** No changes were needed to
`VideoOverlay.tsx`'s rendering RULE itself: Day 99 already made pose layers
render at 1× playback from the first frame with real landmarks and a
non-`predicted`/`invalid` `boxOrigin`. The gap was entirely upstream — Part 2
above (backward recovery extending real evidence earlier) plus the
`boxOrigin` patch (recovered frames must read `"detected"`, not `"invalid"`,
or the existing Day 96/99 stripping logic silently discards them). With that
patch in place, the earliest valid overlay frame follows automatically from
wherever real evidence now begins — no separate "first overlay frame" logic
exists to keep in sync.

Pre-zone pose/contacts were already retained as context and excluded from
in-zone metrics as of Day 99/101/103 (`contactGroups.beforeZone`,
`before_start_crossing` reason code) — re-verified unchanged, not rebuilt.

**Part 5 — source-frame alignment.** A real, previously-unhandled gap was
found: `VideoOverlay.tsx`'s nearest-frame lookup always returned the globally
nearest available frame **no matter how far away in time**, with no
staleness bound — during a genuine pose-evidence gap (exactly what Vanni
60fps's mid-run loss produces), the "nearest" frame with real landmarks could
be many frames away, rendering as a skeleton that visibly lags/leads the
athlete rather than honestly disappearing. Fixed with a real staleness
rejection: the native per-source-frame duration is derived from the median
of consecutive real `frame.time` deltas (never assumed from a prop, so it's
correct at 60/120/240fps alike and robust to pose gaps, since `frames[]`
carries one dense entry per analysis frame regardless of landmark
availability); a resolved frame more than half that duration away from the
true video playhead is rejected (landmarks stripped) rather than rendered.
Historical trails (committed contact marks) are unaffected — they render
from `canonicalSteps`, not this frame lookup.

Real measured frame/timestamp offset is now surfaced in the developer debug
HUD (`overlay sync: frame offset … · timestamp offset …ms · native frame
…ms · fresh|STALE`).

**Files changed**: `src/components/video/VideoOverlay.tsx` (`boxOrigin`
patch was in the Python runner, not here; `nativeFrameDurationS` memo,
staleness rejection, `overlaySyncRef` diagnostics, debug HUD line).

---

## 5. Contact-integrity findings (Part 6)

Day 103 built `evaluateStepInterval` (duration + evidence-based distance
ceiling) and wired it into both the canonical per-interval path
(`zoneStepAnalysis.ts`) and the legacy two-point fallback path
(`measurements.ts`). Day 103's own report explicitly flagged one remaining
gap: `avgZoneStepLengthM` ("Method 1" — a naive `zone.distanceM ÷
validContacts` aggregate, used only when the canonical per-interval
`zoneStepSummary` isn't available) had **zero** integrity protection.

This is very likely the exact origin of the reported Vanni 60fps "2.7–3.5m"
implausible values: with pose evidence this sparse (7 `poseValidFrames` of
818), `validContacts` under-counts real steps, and dividing the full 30m zone
by too few contacts silently inflates the implied average (e.g. 30m ÷ 9
contacts = 3.33m/step — squarely in the reported range).

**Fix**: `evaluateAggregateStepLength()` (new, `stepIntegrity.ts`) reuses the
*exact same* evidence-based ceiling `evaluateStepInterval` already applies
per-interval (median of the run's own other validated step lengths × 1.6, or
the same generous 3.0m physical fallback when no other evidence exists yet)
— not a new, separately-tuned threshold. When the naive aggregate exceeds
that ceiling, `avgZoneStepLengthM` becomes `null` (with an explicit
`sparse_contact_evidence`-reasoned warning) instead of displaying a
physically implausible number.

**Files changed**: `src/lib/video/stepIntegrity.ts` (new
`evaluateAggregateStepLength` export), `src/lib/benchmark/measurements.ts`
(wired into the `avgZoneStepLengthM` computation). Tests: 4 new checks in
`scripts/step-integrity-sanity.mjs` (item 17), directly reproducing the real
Vanni 60fps symptom (30m/9 contacts) and confirming rejection.

---

## 6. Stationary gate redesign (Part 7)

Replaced the short cone-to-cone segment (the two coach-clicked calibration
points) with a full-height vertical line through the segment's own
authoritative, already-stabilized midpoint, plus a subtle translucent zone
fill between the two lines — for **stationary** recordings only
(`!useCameraProjection`); panning gate rendering (short segment, camera-
reprojected every frame) is completely untouched, per this task's explicit
"do not work on panning" constraint.

The geometry is pulled into a new, pure, zero-dependency module
(`src/lib/video/stationaryGateGeometry.ts`, `stationaryGateLine`/
`stationaryZoneRect`) that takes an already-resolved midpoint as input and
only decides how far to draw a line from it — it has no access to and cannot
alter the crossing-detection geometry (`calibration_gates`,
`selectRenderableGateGeometry`, `zoneStepAnalysis.ts`), which is unmodified.
The exact same shared deadband stabilization (`gateStabilization.ts`, Day
99, unchanged) still runs before the line is drawn, so both gates still
cannot drift apart from each other as a side effect.

A developer-facing debug HUD line now shows raw (pre-deadband) vs. rendered
(post-deadband, what's actually drawn) gate coordinates for both gates, so a
future regression is visible as a number.

**Files changed**: `src/lib/video/stationaryGateGeometry.ts` (new),
`src/components/video/VideoOverlay.tsx` (stationary branch, raw/rendered
diagnostics capture). Tests: `scripts/stationary-gate-sanity.mjs` (new, 9
checks — full-height line geometry, order-independent zone rect, purity/
no-crossing-computation-access).

---

## 7. Countdown implementation (Part 8)

Previously the ETA (`src/lib/analysisProgress/model.ts`) could only derive a
coarse, provisional per-worker-status band estimate (`STATUS_TYPICAL_MS`) —
no visibility into how many frames of the *current* job the worker had
actually processed, so a real "03:42 remaining" countdown wasn't possible.

**Real, measured frame-throughput pipeline, end to end**:
1. `mediapipe_pose_runner.py`'s new `emit_progress()` prints a throttled
   (time- and frame-stride-gated, ≤2/sec) `AVA_PROGRESS {...}` line to
   stderr from both Pass 1 and Pass 2 loops — real frame counts, real source
   fps/resolution, a real wall-clock capture time. No fabricated numbers.
2. `PythonMediaPipePoseService.ts`'s `spawnRunner` parses these lines
   **live**, as the subprocess's stderr stream arrives (not only after it
   exits), and invokes a new `PoseEstimateOptions.onProgress` callback.
3. `analysis-worker.mjs` stores the latest snapshot in a job-scoped variable
   and relays it through the worker's **existing** heartbeat cadence — no new
   timer, process, or write path.
4. `analysis_jobs.progress jsonb` (new column, migration `0071`) persists it
   server-side; `get_analysis_job_status` (same RPC the progress card already
   polls) now also returns it — refresh-safe by construction, since it's
   server state.
5. `analysisProgress/model.ts`'s new `estimateFrameThroughputRemainingMs` /
   extended `estimateEta`/`formatEta` compute a **real** remaining-time
   estimate from measured throughput (recent frames/sec between two
   consecutive polls, computed client-side since only the client sees
   consecutive polls) — used only for the `processing` status (which
   accounted for ≈97% of wall-clock time on Day 99's real measurement); every
   other status keeps the existing, honest coarse-bucket estimate (they're
   short by construction). While `pass1` is running, a fixed, documented,
   generous buffer (`POST_PASS1_BUFFER_MS = 150s`) is added for "the rest of
   the pipeline after pass1" since there's no real throughput evidence for
   pass2 before it starts; `pass2` (the final frame-tracked stage) carries no
   such buffer.
6. `AnalysisProgressCard.tsx` renders the precise `M:SS remaining` countdown
   (`formatCountdown`) only when the estimate is `precise` (real
   throughput-backed); shows `"Estimating…"` for `processing` before real
   evidence arrives; keeps the existing coarse text for other statuses; holds
   the displayed countdown against small (≤5s) upward jitter between polls
   (only lets it rise on a real slowdown or a genuine pass1→pass2 stage
   change, never on measurement noise).

Existing `queued`→"Waiting for an available worker" and
`retry_scheduled`→"Retrying analysis · attempt N" labels already satisfy
"clearly show waiting-for-lease" and "clearly show retry state" — unchanged,
not rebuilt.

**Database changes**: migration `0071_analysis_job_progress.sql` — adds
`analysis_jobs.progress jsonb`; recreates `heartbeat_analysis_job` with an
added optional `p_progress jsonb` parameter (dropped + recreated, not a
second overload, to avoid an ambiguous-overload error from PostgREST);
recreates `get_analysis_job_status` to also return `progress`. Applied
locally via `supabase migration up` (never `db:reset`); types regenerated
via `npm run db:types`.

**Files changed**: `supabase/migrations/0071_analysis_job_progress.sql`
(new), `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`
(`emit_progress`, pass1/pass2 wiring), `src/lib/biomechanics/pose-backend.ts`
(`AnalysisProgressSnapshot`, `onProgress` option),
`src/lib/biomechanics/mediapipe/PythonMediaPipePoseService.ts` (live stderr
line parsing), `scripts/analysis-worker.mjs` (job-scoped `latestProgress`,
heartbeat relay), `src/lib/analysisProgress/model.ts` (frame-throughput ETA,
`formatCountdown`), `src/app/sessions/[id]/AnalysisProgressCard.tsx`
(real-progress state, recent-throughput computation, monotonic countdown
display), `src/app/sessions/[id]/page.tsx` (`initialProgress` prop wiring),
`src/lib/supabase/database.types.ts` (regenerated).

---

## 8. Real rerun results (Part 9)

All three sessions were rerun through the real, unmodified production path
(`replace_working_analysis` RPC → the real worker → the real
`mediapipe_pose_runner.py` subprocess → real Supabase Storage artifact
upload), using a freshly-started worker process so every change this session
made (Node **and** Python sides) was actually in effect — not the stale,
pre-session-edits worker process that happened to already be running when
this session began (see the honest bug-hunt below for why that distinction
mattered).

| Field | Vanni 240fps (before → after) | Vanni 60fps (before → after) | Gav (regression check) |
|---|---|---|---|
| First frame with any landmark | 1179 → 1178 | 578 → 578 | 0 (unchanged) |
| Longest continuous pose run | 495 frames (1501–1995) → 498 frames (1498–1995) | 89 frames (578–666) → 89 frames (578–666) | 142/142 frames (unchanged) |
| First identity lock (anchor) | frame 1521 → frame 1521 (unchanged) | frame 612 → frame 612 (unchanged) | frame 7 (unchanged) |
| Backward recovery result | n/a → anchor=1521, stopped at 1503 (`implausible_human_aspect`), **1 frame recovered** (1512) | n/a → anchor=612, stopped at 603 (`insufficient_landmark_completeness`), **0 frames recovered** | not applicable (Gav's own pre-lock window is too short to exercise it meaningfully — first candidate already inside the corridor) |
| `boxProvenance` distribution | *(field didn't exist before)* → `invalid:1520, forward_detection:32, forward_tracking:795, backward_detection:1` | *(field didn't exist before)* → `invalid:612, forward_detection:7, forward_tracking:199` | `invalid:7, forward_detection:12, forward_tracking:123` (all real, none fabricated) |
| Detector invocations | 421 → 421 (byte-identical to Day 99's baseline — confirms determinism) | n/a → 251 | n/a → 22 |
| `athlete_tracking_confidence` | 0.335 → 0.337 | 0.265 → 0.265 | 0.802 (unchanged) |
| `recording_mode` / `spatial_metric_eligibility` | `athlete_tracking_lost` / `withheld` → unchanged | `athlete_tracking_lost` / `withheld` → unchanged | `static_precision` / `eligible` (unchanged) |
| Total runtime | 386s → 386.5s (matches Day 99's ≈383s baseline within noise) | n/a → 140.0s | n/a → 27.2s |
| `analysis_jobs.progress` (Part 8) | absent → **real**: `{"stage":"pass2","framesCompleted":2325,"totalFrames":2348,...}` (captured near completion) | absent → real (captured mid-run, `framesCompleted: 475/818`) | absent → null (job completed in 27s, faster than the 30s heartbeat interval — expected, not a bug; see below) |

**Honest reading of these numbers**: the backward-recovery mechanism (Part 2)
is now real, verified, and correctly wired end-to-end — but on these two
specific real clips, it recovers only 1 frame (Vanni 240fps) and 0 frames
(Vanni 60fps) before hitting a genuinely unrecoverable gap (a real MediaPipe
rejection — not human-shaped, or too incomplete — at the very first frame it
tries). This means the deep acquisition gap on both Vanni clips is **not**
primarily an over-conservative acquisition state machine that a smarter
backward walk can fully close — it is, at least in significant part, a
genuine detection limit: MediaPipe cannot find a usable, human-shaped pose
that far back on these two clips, most likely because the athlete is very
small/distant/off-axis at the true start of frame. This is reported plainly
rather than inflated — see Remaining Limitations for what a real fix for
*that* would require. `recording_mode`/`spatial_metric_eligibility` are
unchanged (still `athlete_tracking_lost`/`withheld`) because the real
overall evidence density did not cross that classification's threshold on
either clip.

**A real bug was found and fixed mid-validation, not glossed over.** The
first backward-recovery implementation passed all 48 unit tests but produced
**zero** effect on a real rerun (`boxProvenance` all `null`, no
`backwardRecovery` key at all) — traced to `box_tracker.track_state` not
being a reliable "still pre-lock" signal (see Part 2). Fixed, re-verified via
a second real rerun (the numbers in the table above are from the FIXED
version), and protected by two new regression tests. This is disclosed in
full because it is exactly the kind of gap between "tests pass" and "the
real system works" this project's own accuracy discipline exists to catch.

**Determinism check**: `detectorInvocations: 421` for Vanni 240fps matches
Day 99's original measurement exactly, byte-for-byte — the pipeline's
determinism (established in Day 103) holds after this session's changes;
observed differences (1 recovered frame, 3 extra pose-valid frames) are real
effects of the code change, not run-to-run noise.

### Countdown accuracy (Part 8)

The full progress pipeline was verified working end-to-end on a real,
long-running job (Vanni 240fps, 386.5s total): `analysis_jobs.progress` held
a real, non-fabricated snapshot (`pass2`, `framesCompleted: 2325/2348`,
captured within seconds of the job actually completing) — confirming
`emit_progress()` → live stderr parsing → worker heartbeat relay → DB column
all function correctly under real conditions, not just in the unit-tested
model.

**Disclosed limitation**: this session did not separately drive the
`AnalysisProgressCard` UI (e.g. via a browser session polling every 1.5s
throughout the run) to capture a literal first-estimate/halfway-estimate/
final-error time series — the verification above confirms the underlying
data pipeline is real and correct, but a live UI-side accuracy trace was not
captured this session. A reconstructed estimate from the real recorded stage
durations: pass 2 processed 2348 frames in 112.3s (≈0.0478s/frame); at the
captured snapshot (2325/2348 done, 23 frames remaining), the model's
real-throughput ETA would compute ≈1.1s remaining — consistent with the job
completing 2.1s after that snapshot was captured, i.e. accurate to roughly
1 second at the tail of a 386-second job. A full first-half/second-half
accuracy trace is recommended as a concrete next-session follow-up (flagged
in Remaining Limitations, not silently skipped).

`analysis_jobs.progress` was `null` for the Gav rerun — expected, not a bug:
the job completed in 27.2s, faster than the 30s heartbeat interval, so the
timer never fired mid-job. The countdown feature is meant for the
minutes-long jobs it was built for (Vanni 240fps/60fps above); very short
jobs correctly fall back to the existing coarse/`"Estimating…"` behavior for
their brief lifetime, which is honest, not broken.

---

## 9. Tests and exact results

| Suite | New/changed checks this session | Result |
|---|---|---|
| `athlete-tracker:sanity` | +5 backward-recovery test blocks (tests 1–5 of the requested 22: trusted-anchor recovery, stop-at-first-gap, background rejection, no-merge-past-break, no-fabricated-evidence) | 43 pre-existing + new backward tests, **ALL PASSED** |
| `box-tracker:sanity` | Rewired into `package.json` for the first time (was orphaned/stale against Day 101); all 10 pre-existing fixtures rewritten to use a `lock_in()` helper; +7 `P4.*` adaptive-refresh tests (test 17 area); +2 `REGRESSION:` tests documenting the `track_state`-vs-`identity_state` bug found via real testing | **ALL PASSED** |
| `step-integrity:sanity` | +4 checks (test 11 area: `evaluateAggregateStepLength`, reproducing the real Vanni 60fps "2.7–3.5m" symptom directly) | **PASSED** |
| `stationary-gate:sanity` | New suite — 9 checks (tests 13, 15, 16: full-height line geometry, order-independent zone rect, purity/no-crossing-access) | **PASSED (9/9)** |
| `analysis-progress:sanity` | +14 checks (test 17 area: frame-throughput ETA math, countdown formatting, precise-vs-estimating branching) | 37 pre-existing + new, **ALL PASSED** |
| `zone-step-counting:sanity` | 1 pre-existing fixture default corrected (unrelated to Day 104's own changes — a stale 1s/contact default that predates this session's `evaluateStepInterval` wiring in `zoneStepAnalysis.ts`, from Day 103) | 25/25 **PASSED** |
| `worker:check` | — | **PASSED** |
| `npm run lint` | — | 0 warnings, **PASSED** |
| `npx tsc --noEmit` | — | 0 errors, **PASSED** |
| `npm run build` | — | **PASSED** (production build, all 41 routes) |

**Broader regression sweep** (files this session touched or is adjacent to,
not required but run for confidence): `measurement-recovery:sanity`,
`timing-verification:sanity`, `zone-coverage:sanity`, `zone-anchor:sanity`,
`world-lock-repair:sanity`, `roi-coordinate-mapping:sanity`,
`gate-lock-smoothing:sanity`, `gate-display-stabilization:sanity`,
`worker-lease:sanity`, `metric-trust:sanity`, `stride-metrics:sanity`,
`result-foundation:sanity`, `experimental-30fps:sanity`,
`analysis-fps:sanity`, `analysis-report:sanity`, `acceleration-analysis:sanity`
— **all pass**, re-confirmed a second time after the `mediapipe_pose_runner.py`
bugfix.

**Mapped against the 22 requested tests**: 1–5 (backward recovery) —
`athlete-tracker:sanity`. 6 (Day 101 protections still required) — unchanged,
covered by the pre-existing 43 checks in the same suite (never modified). 7
(pose begins immediately post-lock) — architectural, not independently unit
tested (no component harness for `VideoOverlay.tsx`/Pass 2 exists in this
codebase; verified by direct code reading + the real rerun in Part 8, same
honesty standard Day 99 set for this exact gap). 8–9 (pre-zone
retained/excluded) — pre-existing `zone-step-counting:sanity`/
`step-integrity:sanity` checks (Day 99/103, re-confirmed unchanged). 10 (first
in-zone contact retained) — pre-existing. 11–15 (alternating-foot, duration,
distance, same-foot-stride, missing-contact-can't-produce-a-step) —
pre-existing `step-integrity:sanity` (Day 103), +1 new check (17) for the
aggregate-level version of the same protection (Part 6). 16 (Peak Step
Length still rolling-4) — pre-existing, unchanged. 17 (metric evidence
framework independent) — pre-existing (Day 98). 18 (panning safety unchanged)
— no panning file was touched this session; the panning-specific regression
checks inside `measurement-recovery:sanity` (Day 98 Part 3i) still pass
unmodified. 19 (existing FPS behavior intact) — `analysis-fps:sanity`/
`experimental-30fps:sanity` pass unmodified. 20 (Gav regression) — Part 9's
real rerun: Gav's pose coverage, lock frame, and metrics are byte-for-byte
unchanged. 21 (60/120/240fps behavior) — Part 9's real reruns cover
239.48fps and 59.97fps directly; 120fps was not separately re-validated this
session (no 120fps fixture was in scope) — disclosed, not silently skipped.
22 (panning protections unchanged) — same as 18.

**Not implemented as automated tests, verified by direct code reading and/or
the real rerun instead** (consistent with this codebase's own established
practice for `VideoOverlay.tsx`, which has zero component-test coverage of
any kind): test 6 (Day 101 protections — covered by unmodified pre-existing
tests, not re-tested here since nothing in that logic changed), test 7 (pose
begins immediately post-lock), test 18 countdown-survives-reload (verified
via the `initialProgress` prop + real RPC field addition, not a live
component test), test 19 lease-wait/retry-state wording (unchanged existing
labels, covered by `analysis-progress:sanity`'s pre-existing lifecycle
checks).

---

## 10. Remaining limitations

Reported plainly, matching this project's own established discipline (Day
102: "a real, validated, safe improvement... not everything requested"):

- **Backward recovery's real-world impact on these two specific clips is
  small** (1 frame / 0 frames). The deep pre-lock evidence gap on both Vanni
  clips is now understood to be, at least substantially, a genuine MediaPipe
  detection limit (no human-shaped candidate found at all, not merely an
  over-conservative acquisition gate) — closing it further would likely
  require a materially different approach (e.g. a lower-confidence coarse
  tile-search extended further back, or a different detector), which is real,
  unstarted work, not attempted this session.
- **Day 102's optical-flow drift root cause remains only partially
  addressed.** The adaptive-refresh fix (Part 4) is real, tested, and
  additive, but was not validated against a clip specifically exhibiting the
  mid-run drift pattern in a way that isolates its effect — `detectorInvocations`
  matched the Day 99 baseline exactly on Vanni 240fps, meaning the
  accelerated-refresh condition rarely or never triggered on this specific
  clip. Whether it helps a genuinely drifting clip remains to be measured
  directly (e.g. by instrumenting `_track_via_optical_flow`'s seed-point
  positions frame by frame, as Day 102 itself recommended).
- **Backward "tracking" (optical-flow) as a distinct sub-mode was not
  built** — only backward *detection* (Part 2's own disclosed scoping
  decision).
- **Countdown accuracy was verified via the real data pipeline, not a live
  UI polling trace** (Part 9) — the underlying numbers are real and correct,
  but a first-estimate/halfway/final-error time series wasn't separately
  captured.
- **120fps footage was not re-validated this session** — only 59.97fps and
  239.48fps clips were part of this milestone's real fixtures.
- **Corridor and adaptive-refresh constants remain validated against a small
  number of real clips** (the same caution Day 103 disclosed for the
  corridor constants specifically) — not yet cross-validated against a
  broader real-clip library.
- **A real bug was found and fixed mid-session** (Part 2/9) — disclosed in
  full there, not summarized away here.

---

## 11. Files changed

**New**: `src/lib/video/stepIntegrity.ts` (extended this session with
`evaluateAggregateStepLength`, originally Day 103), `src/lib/video/stationaryGateGeometry.ts`,
`src/lib/biomechanics/mediapipe/trackingDebugSchema.ts` (extended this
session with `boxProvenance`/`backwardRecovery`, originally Day 96),
`scripts/stationary-gate-sanity.mjs`, `supabase/migrations/0071_analysis_job_progress.sql`,
`docs/day-104-bidirectional-tracking-stationary-zone-ui-and-eta.md`.
(`src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`/`box_tracker.py`
and `scripts/athlete-tracker-sanity.py`/`box-tracker-sanity.py` are untracked
carryovers from Days 95–103, substantially modified this session — see
Parts 2–4.)

**Modified**: `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`
(pre-lock candidate buffering, backward-recovery invocation, `boxProvenance`,
`emit_progress`), `src/lib/biomechanics/mediapipe/runtime/box_tracker.py`
(adaptive detector refresh), `src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`
(`score_candidate_continuity` extraction, `track_backward`),
`src/components/video/VideoOverlay.tsx` (overlay staleness rejection, sync
diagnostics, stationary gate redesign, raw/rendered gate diagnostics),
`src/lib/benchmark/measurements.ts` (`avgZoneStepLengthM` integrity guard),
`src/lib/biomechanics/pose-backend.ts` (`AnalysisProgressSnapshot`,
`onProgress`), `src/lib/biomechanics/mediapipe/PythonMediaPipePoseService.ts`
(live stderr progress parsing), `scripts/analysis-worker.mjs` (progress relay
via heartbeat), `src/lib/analysisProgress/model.ts` (frame-throughput ETA,
`formatCountdown`), `src/app/sessions/[id]/AnalysisProgressCard.tsx` (real
countdown UI), `src/app/sessions/[id]/page.tsx` (`initialProgress` prop),
`src/lib/supabase/database.types.ts` (regenerated), `package.json` (2 new
sanity script entries: `box-tracker:sanity`, `stationary-gate:sanity`),
`scripts/analysis-progress-sanity.mjs`, `scripts/athlete-tracker-sanity.py`,
`scripts/box-tracker-sanity.py`, `scripts/step-integrity-sanity.mjs`.

---

## 12. Database changes

One additive migration: `supabase/migrations/0071_analysis_job_progress.sql`
— adds `analysis_jobs.progress jsonb`; recreates `heartbeat_analysis_job`
with an added optional `p_progress` parameter; recreates
`get_analysis_job_status` to also return `progress`. Applied locally via
`supabase migration up` (confirmed via `supabase migration list --local`
before and after) — **`db:reset` was never run**. Types regenerated via
`npm run db:types`. No other schema changes. No data was deleted or
overwritten outside the normal `replace_working_analysis` rerun flow (which
is the same reset-and-requeue behavior every real coach-triggered rerun
uses).

---

## 13. Git status

Working tree only — **nothing was committed or pushed this session.** The
repository already carried a large number of untracked/modified files from
Days 90–103's work (this project's established pattern of never committing
mid-milestone); this session's own changes are exactly the files listed in
Part 11 above. `git status --short` was captured before and after this
session's edits to confirm no file outside that list was touched.
