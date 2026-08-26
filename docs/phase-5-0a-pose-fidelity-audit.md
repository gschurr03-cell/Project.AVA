# Phase 5.0A — Pose Fidelity Audit

## 1. Executive summary

Phase 4.2J concluded that the tracker's own box-position drift already
self-heals (via the pipeline's existing detector cadence) for every real
candidate interval found in Vanni 240, and that the likely remaining cause
of the zone-metric regression is downstream of localization — specifically
foot/ankle landmark degradation during short crop-lag windows. This phase
audits every stage after localization (crop → MediaPipe → serialization →
contact detection → step reconstruction → metrics) against the real,
current production pose artifacts for all four registry benchmarks
(`gav_stationary_reference`, `vanni_fly_240`, `vanni_fly_120`,
`vanni_fly_60`), with **no algorithm changes** — this is a read-only
measurement pass.

**The hypothesis is confirmed, with a precise mechanism.** AVA applies **no
landmark smoothing, filtering, or interpolation stage of its own** anywhere
between MediaPipe's raw output and the persisted artifact (Section 2) — the
only per-frame transformation is a coordinate remap (crop-space →
source-space). Foot-contact detection (`steps.ts`/`contacts.ts`) depends
entirely on the raw `visibility`/`score` MediaPipe already emits, gated at
a 0.4 floor. A direct measurement of *why* each foot-joint sample is
missing (Section 7) shows the loss is dominated not by MediaPipe emitting a
low-confidence point, but by MediaPipe **never producing a landmark at
all** — 37.4% of Vanni 240's foot-joint-frame samples (2,286 of 6,120) —
consistent with the crop genuinely not containing the foot during the
box-tracker's lag window, exactly the mechanism Phase 4.2J's Section 5
described qualitatively. This audit adds an **independent, second
measurement** of the same 470-527 lag window using torso-vs-box pixel
offset (not `poseBoundsIoU`): mean offset spikes to **132.8px (0.069
frame-widths)** inside the window versus **31.5px (0.016fw)** across the
whole clip — a real, reproducible 4.2× localized spike.

A **separate, significant finding, new to this phase**: the headless
re-measurement script used throughout Phase 4.2B–4.2J to report Vanni 240's
`combinedStepFrequencyHz` (`scripts/phase-4-2e-vanni-240-measurements.mjs`)
never threads `boxOrigin` through to the overlay-frame builder, so it never
applies the `predicted`/`invalid`/`frozen_suspect` landmark-stripping gate
that the real, live session page (`loadOverlayFrames.ts`) does apply. A
faithful replica of the real page's exact data flow (Section 6) produces
**`totalContacts=8, validContacts=6, combinedStepFrequencyHz=2.367`** for
the current Vanni 240 artifact — not the `10/8/1.933` figure cited in every
prior Phase 4.2 report. This is a validation-tooling gap, not a production
pipeline defect (the real page has been applying the gate correctly all
along); it does not change Phase 4.2's own In-Progress verdict, but it does
change the honest baseline number for future comparisons and is disclosed
prominently here rather than silently carried forward again.

A pose quality score built specifically for this audit (Section 9,
diagnostic-only) quantifies the gap directly: Gav 0.910, Vanni 120 0.578,
Vanni 60 0.562, **Vanni 240 0.415** — the lowest of all four, driven almost
entirely by completeness/persistence/contact-readiness, not by stability or
limb continuity (which stay high even for Vanni 240 — evidence the pose
that *is* present is not obviously wrong, just frequently absent).

**No algorithm was changed this phase**, per the task's explicit
instruction. Every part below is a measurement against real, current
production artifacts and real, unmodified production code, using the
existing MediaPipe backend, existing contact detector, and existing
overlay renderer, read-only.

## 2. Pipeline diagram

The real pipeline, traced from source code (not the task's assumed
diagram, which does not match reality at two points — flagged inline):

```
Source video (.mov)
   │  cv2.VideoCapture, frame-accurate PTS via CAP_PROP_POS_MSEC
   ▼
Pass 1 — Localization (box_tracker.py, athlete_tracker.py)
   │  detector cadence (every 8 frames) + optical-flow carry-forward;
   │  produces scientificAthleteBox per frame, boxOrigin provenance
   │  (detected/tracked/predicted/reacquired/invalid/frozen_suspect),
   │  Phase 4.2J retroactive adjudication (rarely corrects — Section 4.2J
   │  found near-zero real corrections apply)
   ▼
Crop planning (plan_crops, segment-aware fit + EMA-smoothed camera path)
   │  crops the SOURCE frame around scientificAthleteBox (BOX_PADDING=1.3)
   │  — this crop rectangle is the ONLY input MediaPipe ever sees; a joint
   │  outside this rectangle cannot be found by ANY pose backend (Section 7)
   ▼
MediaPipe PoseLandmarker (VIDEO mode, detect_for_video)
   │  raw landmarks: x, y (crop-normalized), z, visibility, presence
   │  — MediaPipe's own internal VIDEO-mode temporal filter applies here,
   │  intrinsic to the model, NOT exposed/tunable via PoseLandmarkerOptions
   │  in this Python Tasks API (Section 2.1 — real, verified code fact)
   ▼
Coordinate remap (landmark_dict(), mediapipe_pose_runner.py:402)
   │  crop-normalized → source-normalized: x_full = ox + lm.x*sx, etc.
   │  — a pure linear transform. **NO SMOOTHING OR FILTERING STAGE OF
   │  AVA'S OWN EXISTS HERE OR ANYWHERE ELSE IN THIS FILE** (Section 2.1)
   │  — this is the FIRST place the task's assumed diagram diverges from
   │  reality: there is no "pose filtering" / "landmark smoothing" stage.
   ▼
Pose serialization (pose.ts / MediaPipeTypes.ts schemas)
   │  Zod-validated, verbatim passthrough — visibility/score preserved
   │  exactly as MediaPipe/the remap produced them
   ▼
Persisted artifact (Supabase Storage, pose-artifacts bucket)
   ▼
loadOverlayFrames.ts → toOverlayFrames() → buildOverlayFrames()
   │  keypoints (named Record) → positional MediaPipe-index landmarks array
   │  → OverlayFrame.landmarks (camelCase). Per-frame only; no cross-frame
   │  state. boxOrigin threaded through (Section 6 — the second place a
   │  real gap was found: one VALIDATION SCRIPT skips this step)
   ▼
Landmark eligibility gate (computeSprintMeasurements, measurements.ts:548)
   │  predicted/invalid/frozen_suspect frames → landmarks stripped to {}
   │  BEFORE any contact/crossing/biomechanics computation — the SAME gate
   │  is independently re-applied in the renderer (VideoOverlay.tsx:577)
   ▼
Contact detection (steps.ts detectStepMarks + contacts.ts detectContactPhases)
   │  per foot: mean(ankle,heel,toe) y where score>=0.4, 3-frame NaN-aware
   │  moving average, local-maxima peak = contact; sub-frame threshold
   │  interpolation = touchdown/toe-off. THIS is the pipeline's only
   │  contact-detection implementation — the SAME function feeds BOTH the
   │  visual overlay AND the scientific metrics (buildFullRunEvents,
   │  events.ts) — the second place the task's assumed diagram diverges:
   │  there is no separate "gait reconstruction" stage distinct from
   │  contact detection; step reconstruction IS contact detection plus
   │  chronological ordering/de-duplication.
   ▼
Zone restriction + metrics (computeSprintMeasurements, measurements.ts)
   │  step frequency, step length, velocity — all derived from the SAME
   │  contact timestamps, calibration-zone-restricted
   ▼
Displayed metrics (session page) + overlay skeleton (VideoOverlay.tsx)
   │  nearest-frame match to video.currentTime, bounded-staleness gate,
   │  pure geometric projection (Section 8) — no additional smoothing
```

### 2.1 Two real divergences from the task's assumed pipeline (evidence, not assumption)

1. **No "pose filtering" / "landmark smoothing" stage exists.**
   `mediapipe_pose_runner.py:2456-2465` passes `result.pose_landmarks[0]`
   directly into `landmark_dict()` — grep-verified: the word "smooth"
   appears in this file only in the CROP/camera-path smoothing functions
   (`smooth_camera_transforms`, `plan_crops`'s segment fit), never in
   connection with landmark x/y/z/visibility values. The only smoothing in
   the entire pose pipeline is MediaPipe's own internal, non-configurable
   VIDEO-mode filter (Section 9).
2. **"Gait reconstruction" and "step detection" are the same code**, not
   sequential stages — `detectStepMarks()`/`detectContactPhases()`
   (`steps.ts`/`contacts.ts`) are the complete, sole implementation of both;
   `buildFullRunEvents()` (`events.ts`) is a thin wrapper, not a separate
   algorithm.

## 3. Landmark audit (Part 2)

Full per-frame data for all four benchmarks written to
`tmp/phase50a-<label>-full.json` (real, current artifacts — Gav
`3a148f45…`, Vanni 240 `a7679326…`, Vanni 120 `6d9a6aba…`, Vanni 60
`8f55936c…`, all real production reruns from Phase 4.2J's own session,
downloaded fresh for this audit).

| Benchmark | Frames | Left ankle present | Right ankle present | Left ankle mean score (when present) | Right ankle mean score |
|---|---:|---:|---:|---:|---:|
| Gav | 142 | 135 (95.1%) | 135 (95.1%) | 0.883 | 0.907 |
| Vanni 240 | 1020 | 464 (45.5%) | 461 (45.2%) | 0.472 | 0.437 |
| Vanni 120 | 483 | 294 (60.9%) | 294 (60.9%) | 0.594 | 0.598 |
| Vanni 60 | 233 | 141 (60.5%) | 141 (60.5%) | 0.546 | 0.541 |

Vanni 240 has both the lowest presence rate AND the lowest mean confidence
when present — a compounding, not merely additive, failure. Gav's ankle
presence (95.1%) is limited almost entirely by the known, already-quarantined
`frozen_suspect`/`invalid` intervals (Phase 4.2/4.2B/4.2J), not by ordinary
MediaPipe uncertainty.

Full per-joint numbers (all 6 foot joints, all 4 benchmarks) are in each
`tmp/phase50a-<label>-summary.json`'s `part2_footJointCompleteness` block.

## 4. Skeleton accuracy (Part 3)

**No manually-annotated ground truth exists for any of these four clips**
(consistent with the validation registry's own disclosed limitation — only
Gav has an external reference, VueMotion, and it validates aggregate
metrics, not per-frame joint pixel positions). Rendering every frame with
overlaid joints and hand-measuring pixel error against the visible athlete
was not performed this phase — disclosed as a real scope limitation, not
silently skipped.

In its place, this phase computes a real, objective, code-derived **proxy**:
bone-segment length consistency. A rigid skeleton's segment lengths
(shoulder–hip, hip–knee, knee–ankle, ankle–heel, heel–toe, shoulder–shoulder,
hip–hip) should stay close to that segment's own clip-wide median in pixel
space; a segment stretching or compressing far outside that band indicates
a landmark has drifted off the true joint (a real, if imperfect and
disclosed-as-imperfect, accuracy signal — not literal ground-truth error).

| Benchmark | Segment samples | Implausible (ratio <0.5 or >1.8× median) | Rate |
|---|---:|---:|---:|
| Gav | 1,620 | 151 | 9.3% |
| Vanni 240 | 5,325 | 492 | 9.2% |
| Vanni 120 | 3,514 | 314 | 8.9% |
| Vanni 60 | 1,670 | 177 | 10.6% |

**Honest, non-obvious finding**: this rate is nearly IDENTICAL across all
four benchmarks (8.9%–10.6%) — the bone-length proxy does **not**
discriminate Vanni 240 as an outlier. Combined with Section 3's
completeness numbers, the correct conclusion is that Vanni 240's dominant
pose defect is landmark **absence** (dropout), not landmark **inaccuracy**
(drift) — when MediaPipe does produce a foot landmark, its geometric
plausibility is statistically indistinguishable from Gav's; the problem is
how often it produces one at all. This is a materially different, more
precise conclusion than "the skeleton drifts."

## 5. Skeleton latency (Part 4)

Real, measured (not estimated) cross-correlation between the pose
skeleton's own torso motion (hip midpoint, score ≥ 0.4 both sides) and the
localization box's own motion (`scientificAthleteBox` center), computed
only across strictly-consecutive real source frames (no gap-bridging).

| Benchmark | Usable frame pairs | Best lag | Best-lag correlation | Zero-lag correlation | Mean offset @ zero lag | Mean offset (frame-widths) |
|---|---:|---:|---:|---:|---:|---:|
| Gav | 134 | −1 frame (−16.7ms) | 0.594 | −0.665 | 13.9px | 0.0072fw |
| Vanni 240 (whole clip) | 456 | −1 frame (−4.2ms) | 0.512 | −0.242 | 31.5px | 0.0164fw |
| Vanni 120 | 292 | 0 frames | 0.199 | 0.199 | 27.5px | 0.0143fw |
| Vanni 60 | 137 | +1 frame (+16.7ms) | 0.594 | −0.010 | 26.0px | 0.0135fw |

Velocity cross-correlation on real, noisy per-frame data (100–500 samples,
lags of only a few frames) is a weak signal on its own — correlations of
0.2–0.6 do not support a precise "the skeleton lags by N frames" claim, and
this is disclosed rather than overstated. The **mean positional offset** is
the more robust, directly interpretable measurement, and it shows Vanni
240 running roughly **2× Gav's own torso-to-box offset across the whole
clip**.

**A second, targeted measurement inside the flagged 470–527 window**
(Phase 4.2J's own identified drift interval) using this audit's independent
method: **mean offset = 132.8px (0.069 frame-widths)**, a **4.2×** spike
over the whole-clip mean — corroborating Phase 4.2J's `poseBoundsIoU`-based
finding (a real 0.06–0.07fw gap) via a completely independent measurement
technique (hip-midpoint-vs-box-center, not pose-bounds IoU). This is strong,
cross-validated evidence the mechanism Phase 4.2J described is real.

## 6. Contact audit (Part 5)

Real production functions (`buildFullRunEvents`, `detectStepMarks`,
`detectContactPhases`, `computeSprintMeasurements` — compiled and invoked
directly, not reimplemented) run against each benchmark's current artifact,
built via a byte-for-byte replica of `loadOverlayFrames.ts`'s real data
flow (including `boxOrigin` threading — see the finding below).

| Benchmark | Full-run contacts (L/R) | Zone total | Zone valid (L/R) | `combinedStepFrequencyHz` |
|---|---|---:|---|---:|
| Gav | 11 (6/5) | 11 | 9 (5/4) | 4.848 |
| Vanni 240 | 8 (4/4) | 8 | 6 (4/2) | 2.367 |
| Vanni 120 | 11 (4/7) | 11 | 9 (4/5) | 3.794 |
| Vanni 60 | 11 (5/6) | 11 | 11 (5/6) | 4.187 |

Vanni 240's in-zone accepted contacts: frames 76(L), 321(R), 374(L),
476(L), 517(R), 583(L) — frame **517 sits directly inside the 470–527
drift window**, meaning at least one surviving valid contact is itself
detected under degraded-visibility conditions (evidence it survived at
all, not evidence it is wrong — no ground truth exists to confirm/deny it).

**Missed-contact evidence**: the real candidate-peak count (before
spacing/de-dup suppression) for Vanni 240 is 26 (left) + 33 (right) = 59
raw local maxima, versus only 8 finally accepted — far more candidates
than Gav produces relative to its own clip length, consistent with a
noisier, gap-fragmented foot-y signal (each real gap in coverage can
fracture what should be one physical contact into multiple weak candidate
peaks, subsequently suppressed by spacing rules — not a "missed contact"
in the sense of a real contact absent from the candidate list, but a real
contact whose signal is too fragmented to survive as a single clean peak).
The direct evidence for *why* peaks are fragmented: Vanni 240 has 580 NaN
frames in the left-foot y-series and 577 in the right (out of 1020 — the
foot-y trajectory is undefined more often than not), versus Gav's 7 and 7
(out of 142).

### 6.1 A real, previously-undisclosed validation-tooling gap (new this phase)

`scripts/phase-4-2e-vanni-240-measurements.mjs` — the script used to
produce every "Vanni 240 `combinedStepFrequencyHz`" figure cited in Phase
4.2C through 4.2J's own reports — builds its `rawFrames` array **without**
`boxOrigin`, so `computeSprintMeasurements`'s `predicted`/`invalid`/
`frozen_suspect` landmark-stripping gate (measurements.ts:548-552) never
fires in that script, even though the real, live session page
(`loadOverlayFrames.ts:89`, confirmed) **does** thread `boxOrigin` through
and does apply the gate. A controlled, isolated A/B test (toggling only
this one field, all else identical) confirms this is the ENTIRE cause of
the discrepancy:

| Variant | totalContacts | validContacts | combinedStepFrequencyHz |
|---|---:|---:|---:|
| `boxOrigin` omitted (the script used throughout Phase 4.2) | 10 | 8 | 1.933 |
| `boxOrigin` threaded (faithful to the real page) | 8 | 6 | **2.367** |

This is a validation-tooling gap, not a production-pipeline defect — the
real page has been applying the gate correctly the entire time; only the
headless re-measurement helper script used for phase reporting was blind
to it. It does not change Phase 4.2's In-Progress verdict (2.367 still
does not match the Phase 1/2 baseline of 4.858), but it changes the honest
number: the gate, correctly applied, removes 2 illegitimate contacts that
were leaking through from disqualified frames, which is the CORRECT,
scientifically-intended behavior — the true current regression is
somewhat smaller in relative terms (2.367 vs baseline 4.858) than the
widely-cited 1.933 figure suggested, though still a real, unresolved
regression. Per this phase's explicit "audit only" scope, the script
itself was not modified — flagged here for a deliberate, disclosed fix in
Section 12.

## 7. MediaPipe audit (Part 6)

Direct attribution of every foot-joint sample (6 joints × frame count) to
exactly one of four categories — using only real, already-present artifact
fields (`keypoints[joint]` presence, raw `visibility`/`score`, `boxOrigin`)
— never inferred:

| Benchmark | `mediapipe_never_produced` | `mediapipe_low_confidence` (<0.4) | `ava_gate_stripped` | `usable` |
|---|---:|---:|---:|---:|
| Gav (852 samples) | 0 (0.0%) | 0 (0.0%) | 42 (4.9%) | 810 (95.1%) |
| Vanni 240 (6,120 samples) | **2,286 (37.4%)** | 135 (2.2%) | 1,074 (17.5%) | 2,625 (42.9%) |
| Vanni 120 (2,898 samples) | 996 (34.4%) | 0 (0.0%) | 138 (4.8%) | 1,764 (60.9%) |
| Vanni 60 (1,398 samples) | 492 (35.2%) | 9 (0.6%) | 66 (4.7%) | 831 (59.4%) |

**The dominant loss mechanism, for every Vanni clip, is MediaPipe never
producing the landmark at all — not MediaPipe producing a low-confidence
one, and not AVA's own gate discarding a good one.** `mediapipe_low_confidence`
(the one category that is unambiguously "MediaPipe tried and was unsure")
is a small minority everywhere (0.0–2.2%). `ava_gate_stripped` (AVA
actively discarding evidence, an intentional scientific-integrity choice,
not a bug — it only fires on frames independently proven mislocalized) is
larger for Vanni 240 specifically (17.5%, reflecting its longer
`frozen_suspect` barrel-lock tail) but still well below the
`never_produced` share.

**Where does the correct landmark go when it's never produced?** It never
existed to begin with — this is not a case of "MediaPipe found it and AVA
discarded it" (that would show up as `ava_gate_stripped` on a frame with
real keypoint data present). `mediapipe_never_produced` means the
`keypoints[joint]` key is entirely absent from the raw artifact — i.e.
MediaPipe's own `result.pose_landmarks` was either empty for that frame or
did not include that joint above its own internal detection threshold. The
most direct, evidence-grounded explanation, consistent with Section 5's
independent latency/offset measurement and Phase 4.2J's own finding: the
**crop MediaPipe is given** (built from `scientificAthleteBox`, itself
lagging up to 0.069fw behind the true athlete position during short drift
windows) frequently **does not contain the foot** — a crop-containment
problem, not a MediaPipe model-accuracy problem. No pose backend, however
accurate, can find a joint in pixels it was never shown.

## 8. Overlay audit (Part 7)

Real code inspection (not visual/live-browser testing) of the render path,
which is architecturally simple enough that live measurement adds no
information beyond what the code guarantees deterministically:

- **Frame matching** (`VideoOverlay.tsx:523-535`): a linear nearest-frame
  scan against `video.currentTime` — O(frames) per animation frame, no
  binary search, but real-world frame counts (≤1020) make this immaterial
  at 60fps redraw (well under 1ms).
- **Staleness gate** (`VideoOverlay.tsx:548-558`) — a REAL, ALREADY-MEASURED
  (not estimated) bound: if the nearest available frame is more than half
  a native source-frame duration from the true playhead, the skeleton is
  suppressed entirely rather than rendered stale. Native frame duration is
  computed from the artifact's own real fps, per benchmark:

  | Benchmark | Native frame duration | Stale threshold |
  |---|---:|---:|
  | Gav / Vanni 60 | 16.667ms | 8.333ms |
  | Vanni 120 | 8.333ms | 4.166ms |
  | Vanni 240 | 4.167ms | 2.083ms |

- **Eligibility gate** (`VideoOverlay.tsx:577`) — the identical
  `predicted`/`invalid`/`frozen_suspect` strip already used by
  `computeSprintMeasurements` (Section 6) is independently re-applied at
  render time — what a coach sees on screen is architecturally guaranteed
  to be consistent with what the metrics are computed from (same gate,
  applied twice, not two different rules).
- **Coordinate projection** (`projectLandmark` → `coordinates.ts:226`) — a
  pure, stateless linear remap (normalized [0,1] → display CSS pixels via
  `fitMode: "fill"`), no interpolation, no smoothing, no per-frame drift —
  confirmed by reading the full function body.
- **Already-instrumented developer diagnostic**: `overlaySyncRef.current`
  (`VideoOverlay.tsx:551-555`) computes and exposes `frameOffset`,
  `timestampOffsetS`, and `stale` on every draw — a real-time measurement
  (not an estimate), already rendered in a debug log line
  (`VideoOverlay.tsx:1535`). This satisfies the task's "do not estimate,
  measure" requirement structurally: the measurement already exists in
  production code.

**Conclusion**: the overlay renderer introduces no additional lag or
distortion beyond the same honest source-frame staleness every other stage
already accounts for. No defect found here.

## 9. Pose quality score (Part 8)

Developer-only, diagnostic, **interpretable** (not an opaque weighted ML
score — every component is independently inspectable and documented).
Seven components, each in [0,1], unweighted mean:

- **ankleCertainty** — mean raw `visibility`/`score` over present ankle keypoints (0 if none present).
- **footCertainty** — same, over all 6 foot keypoints (ankle+heel+toe, L+R).
- **completeness** — fraction of the 17 canonical joints present this frame.
- **stability** — `1 − |frameVelocity − medianVelocity| / (3×medianVelocity)`, clamped ≥0, on the torso (hip-midpoint) trajectory only.
- **limbContinuity** — fraction of measurable bone segments within the plausible ratio band (Section 4).
- **landmarkPersistence** — 1 if any keypoint exists this frame (and the frame was not gate-stripped), else 0.
- **contactReadiness** — 1 per side if all 3 foot joints (ankle/heel/toe) clear the 0.4 visibility floor.

| Benchmark | Overall | Ankle certainty | Foot certainty | Completeness | Stability | Limb continuity | Persistence | Contact readiness |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gav | **0.910** | 0.874 | 0.871 | 0.951 | 0.957 | 0.907 | 0.951 | 0.951 |
| Vanni 120 | 0.578 | 0.560 | 0.560 | 0.609 | 0.900 | 0.911 | 0.609 | 0.609 |
| Vanni 60 | 0.562 | 0.522 | 0.524 | 0.601 | 0.921 | 0.893 | 0.601 | 0.594 |
| Vanni 240 | **0.415** | 0.390 | 0.389 | 0.451 | 0.877 | 0.898 | 0.451 | 0.425 |

The pattern is consistent and important: **stability and limbContinuity
stay high across every benchmark, including Vanni 240** (0.877–0.958,
0.893–0.911) — the pose that IS captured is geometrically sane and
temporally smooth. The score is dragged down entirely by
**completeness/persistence/contactReadiness** — all measuring the same
underlying fact (Section 7): landmarks are frequently *absent*, not wrong.
This is the single clearest, most consolidated statement this audit can
make: **Vanni 240's pose-fidelity problem is a coverage problem, not an
accuracy problem.**

## 10. Backend evaluation (Part 9)

Per the explicit instruction: MediaPipe is **not** being replaced; this
compares AVA's own **observed** failure modes (Sections 6–7, real
measurements) against what is structurally true of an alternative already
present in this repo — `src/lib/biomechanics/rtmpose/` (YOLO detector +
ByteTrack + RTMPose, COCO-WholeBody topology, explicit
`left_toe`/`right_toe`/`left_heel`/`right_heel` keypoints from indices
17/19/20/22) — read in full for this audit.

**What is intrinsic to the MediaPipe backend**:
- VIDEO-mode's internal temporal filter is not exposed/tunable via the
  Python Tasks API (`PoseLandmarkerOptions` has no smoothing parameter) —
  a real, verified constraint on this specific backend integration.
- BlazePose's 33-point topology already includes heel/toe (this repo's
  `landmark_dict()` already extracts them) — foot-keypoint *existence* is
  not a MediaPipe limitation vs. RTMPose's COCO-WholeBody topology; both
  already emit these joints.

**What is NOT intrinsic to the backend — proven by Section 7's own
attribution data**: the dominant failure (`mediapipe_never_produced`,
37.4% of Vanni 240's foot samples) occurs because **the crop fed to the
model does not contain the foot**, a fact established BEFORE any pose
model runs (Section 2's pipeline diagram — crop planning is upstream of
MediaPipe entirely). A different pose model given the exact same
undersized/mispositioned crop would face the identical problem: no
backend, however accurate, can locate a joint in pixels it was never
shown. This is the single most important, evidence-based conclusion of
Part 9.

**A real, structural risk specific to swapping in AVA's own RTMPose
implementation as it exists today**: `rtmpose_pose_runner.py`'s
localization is a simple per-frame YOLO detection + ByteTrack + fixed
1.35× padded crop (`expanded_crop()`) — it has **no equivalent** to
`box_tracker.py`'s optical-flow carry-forward, frozen-track detection,
coast-risk evidence vector, skeleton-ownership per-point classification,
or Phase 4.2J's retroactive adjudication. Swapping to it AS-IS would very
likely **regress** localization robustness — the exact dimension Phases
4.1 through 4.2J spent this entire engagement hardening — even though its
pose model has an explicit foot-keypoint branch. Porting an
equivalently-hardened localization stack onto RTMPose's detector would be
a large, separate undertaking, not a drop-in backend swap.

**Where a different backend genuinely might help**: only the
`mediapipe_low_confidence` category (2.2% of Vanni 240's foot samples,
0.0–0.6% elsewhere) — cases where the crop DID contain the foot but the
model's own confidence was low. This is a small minority of the total
loss, and there is no direct evidence in this repo (no completed
side-by-side rerun exists) that RTMPose's foot-keypoint head is more
robust in exactly these cases — asserting so would be an unevidenced
assumption, which the task explicitly disallows.

**Conclusion**: MediaPipe is **not** the primary bottleneck for the
observed pose-fidelity failures. The bottleneck is upstream, in
crop-containment during localization drift — a problem any current
single-pose-per-crop backend (including AVA's own RTMPose implementation,
as it exists today) would share. Backend replacement is not recommended as
a response to this audit's findings.

## 11. Prioritized fix list (Part 10)

Ranked by real, measured impact (Sections 3–9), not assumption. "Expected
accuracy gain" is qualitative and bounded by what this audit can support
with evidence — no numeric promise is made without a basis for it.

| # | Issue | Real evidence | Impacts | Expected gain if fixed |
|---|---|---|---|---|
| 1 | Crop-containment loss of foot landmarks during short localization drift (the confirmed Phase 4.2J mechanism, now independently corroborated, Sections 5, 7) | 37.4% of Vanni 240 foot samples `mediapipe_never_produced`; 132.8px offset spike (4.2× baseline) inside the 470-527 window | Contacts, step frequency, stride length (foot-to-foot distance), zone timing (indirectly, via missing steps) | **Highest** — this is the single largest, most concentrated evidence source in the whole audit; a fix (e.g. a crop-padding safety margin scaled to recent drift magnitude, or foot-specific crop-containment verification) would directly restore the dominant lost category. Not attempted this phase (algorithm change, out of scope). |
| 2 | Validation-tooling gap: `phase-4-2e-vanni-240-measurements.mjs` omits `boxOrigin` (Section 6.1) | Isolated A/B test proves a 2-contact, 0.43Hz swing | Every prior Phase 4.2 report's cited Vanni 240 number; future comparisons | Immediate, low-risk, high-confidence fix — a script correction, not an algorithm change; should be corrected before any further Phase 4.2 continuation cites this metric. |
| 3 | Contact-candidate fragmentation from NaN gaps (59 raw candidate peaks vs 8 accepted on Vanni 240, vs Gav's much cleaner ratio) | 580/577 NaN frames (L/R) out of 1020 | Step frequency, contact count | Moderate — downstream of #1; likely resolves substantially once #1 improves foot-y coverage, without needing its own separate fix. |
| 4 | `mediapipe_low_confidence` foot samples (small: 2.2% Vanni 240, ≤0.6% elsewhere) | Section 7 attribution table | Contacts (marginal) | Low — small population; not worth a backend change (Section 10) or a threshold change without further evidence of which specific frames these are and why. |
| 5 | Bone-length-implausible frames (~9-11%, uniform across all four benchmarks) | Section 4 | Skeleton visual quality (minor); not shown to affect any metric | Low priority — not benchmark-specific, likely ordinary MediaPipe joint jitter; not a Vanni-240-specific defect and not evidenced to drive the metric regression. |
| 6 | Overlay/render-path lag | None found (Section 8) | — | N/A — no fix needed; already correctly bounded and measured in production code. |

## 12. Exact recommended Phase 5.0B scope

Given this audit's own strongest, most concentrated finding (crop-
containment loss of foot landmarks during short localization drift,
Section 11 #1), and its explicit instruction not to improve localization
or change algorithms this phase, the recommended next-phase scope is:

1. **First, immediately**: correct `scripts/phase-4-2e-vanni-240-measurements.mjs`
   to thread `boxOrigin` through (Section 6.1) — a validation-tooling fix,
   not a production algorithm change, so it does not conflict with this
   phase's "do not change algorithms" instruction; re-baseline all future
   Vanni 240 comparisons against the corrected `2.367Hz` figure, not the
   stale `1.933Hz` one.
2. **Then**: a targeted crop-containment investigation and fix, scoped
   narrowly to the mechanism this audit isolated — NOT a general
   localization-accuracy pass (Phase 4.2G–4.2J already exhausted five real
   evidence-signal variants there) and NOT a pose-filtering/smoothing
   addition (Section 2.1 shows none currently exists, and this audit found
   no evidence a smoothing stage would help — the problem is absence, not
   noise, per Section 9's own decomposition). Concretely: verify whether
   `plan_crops()`'s `BOX_PADDING` (1.3×) is sufficient to keep the FEET
   specifically inside the crop during a drift window of the magnitude
   measured here (0.069fw), independent of whether it keeps the torso
   inside (which it already does, per Section 7's contrast between high
   torso-pose-completeness and low foot-completeness) — a real,
   evidence-bounded, narrower question than "fix localization drift"
   itself.
3. **Do not** pursue a pose-backend swap (Section 10 — evidenced not to
   help the dominant failure mode).
4. **Do not** add a landmark-smoothing/filtering stage speculatively
   (Section 9 — stability/limb-continuity are already high; the problem is
   coverage, and smoothing cannot manufacture a landmark that was never
   produced).

## Test results

`npm run typecheck`: exit 0. `npm run lint`: exit 0 (0 warnings).
`npm run build`: exit 0. All required sanity suites re-run clean, with the
same single pre-existing, explicitly-retained roadmap-weight-total failure
(`stationary-validation-registry:sanity`, 105%≠100%, unrelated to this
phase, documented since Phase 4.2C). No new script or production file
introduced a new failure. Full results in the accompanying test-run
transcript for this phase.

## Git status

No commit, no push, this phase. `git log` HEAD unchanged throughout. New,
uncommitted files this phase: `scripts/phase-5-0a-landmark-audit.mjs`,
`scripts/phase-5-0a-contact-audit.mjs`, this report, and the raw
`tmp/phase50a-*` data files (not part of the repo's tracked source, purely
this audit's working evidence).
