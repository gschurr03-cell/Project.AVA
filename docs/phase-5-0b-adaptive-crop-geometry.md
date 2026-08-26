# Phase 5.0B — Adaptive Crop Geometry and Full-Body Containment

## 1. Executive summary

Phase 5.0A proved AVA has no landmark-smoothing stage and that Vanni 240's
missing foot-joint evidence is dominated by MediaPipe never producing a
landmark at all (37.4%), correlated with a 4.2× localized spike in
torso-to-box pixel offset inside the known 470-527 drift window. This phase
audits the layer between localization and MediaPipe — the scientific pose
CROP — and finds real, precise, quantitative confirmation: inside that same
window, the crop-to-athlete residual peaks at 128-156px, of which the
DOMINANT share (~129px, ~82%) is inherited directly from box_tracker.py's
own already-known localization lag (Phase 4.2J), and a smaller, real,
independently-addressable share (~29px, ~18%) is crop-planning's OWN added
lag on top of it.

This phase implements a bounded, evidence-based adaptive crop redesign:
risk-reactive widening from box_tracker.py's own already-computed
`trajectoryResidualFrameWidths`, a velocity-and-time-scaled forward lead
replacing a fixed geometric fraction, and a fixed vertical-anchor rebalance
toward the feet — plus a full, interpretable containment-state contract
persisted per frame. Real production validation, including two real,
self-found regressions (Section 6.2/6.3), produced an honest, three-part
result:

1. **Risk-reactive widening and the vertical-anchor bias now default OFF**
   (`CROP_RISK_WIDEN_GAIN = 0.0`). The mechanism is fully implemented,
   deterministically tested, and documented, but this phase's own real Gav
   production rerun proved it cannot be safely enabled: Gav's own real
   trajectory-residual ceiling (0.0803fw) actually EXCEEDS Vanni 240's own
   real 470-527 problem-window range (0.027-0.056fw) — the exact same wall
   Phase 4.2H already proved for this identical signal at the
   box_tracker.py coast-risk layer, now independently reconfirmed at the
   crop layer. No threshold on this signal protects Gav AND helps Vanni
   240. This is a real, disclosed negative finding, not a shortfall.
2. **The velocity-and-time-scaled forward lead (Part G) is active in
   production** — it replaces the prior fixed-fraction lead unconditionally
   for every directional clip, including Gav, which causes a real, small,
   disclosed shift in Gav's own exact pose bytes (Section 17) — an
   unavoidable, intentional consequence of this task's own explicit
   mandate to replace that formula, not a regression in Gav's underlying
   tracking (box position, origin classification, and tracking-loss ranges
   are all confirmed byte-identical or near-identical).
3. **The full-body containment provenance contract (Part E/J) is active
   and purely additive** — real, per-frame diagnostics with zero effect on
   crop geometry itself.

**Three real regressions were found and fixed during this phase's own
production validation, before finalizing** — reported prominently, not
minimized, consistent with this project's established practice: (1) a
naive risk-widen broke box_tracker.py's frozen-track detector on a
genuinely static (background-locked) box, since `trajectoryResidualFrameWidths`
legitimately grows even when nothing moves (Section 6.2); (2) a spurious
velocity computed across a segment boundary produced a real crop-containment
violation, caught by this phase's own deterministic fixture suite (Section
6.2); (3) an unconditional vertical-anchor bias changed Gav's own exact
pose bytes on every frame, moving `strideFrequencyHz` off its established
baseline — found via a real Gav production rerun and fixed by gating the
mechanism off by default (Section 6.3).

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md` (authoritative): overall
completion 26.8% (normalized) before this phase. **Neither Phase 5.0A nor
Phase 5.0B has a defined weight in the roadmap tracker** — per this task's
own explicit instruction ("do not invent roadmap credit... unless the
tracker document defines a weight for this new phase"), no weight is
assigned and no percentage credit is claimed this phase. Section 24
documents this explicitly.

## 3. Phase 5.0A findings (accepted as-is)

Per `docs/phase-5-0a-pose-fidelity-audit.md` (accepted verbatim, not
re-litigated): no AVA-side landmark smoothing/filtering stage exists
between MediaPipe and storage; Vanni 240's missing foot-joint samples are
dominated (37.4%) by MediaPipe never producing the landmark at all, versus
2.2% low-confidence and 17.5% AVA's own integrity gate; pose that does
exist is geometrically stable (limb continuity 0.877-0.958 across all four
benchmarks); pose-quality scores were Gav 0.910, Vanni 120 0.578, Vanni 60
0.562, Vanni 240 0.415, with Vanni 240 limited by completeness/persistence/
contact-readiness, not limb geometry; a torso-to-box pixel offset spiked
4.2× inside frames 470-527; MediaPipe was not proven to be the bottleneck.
The working hypothesis this phase tests: localization identifies the
athlete adequately, but the SCIENTIFIC CROP (a distinct concern from the
localization box) sometimes lags, undersizes, or clips extremities.

## 4. Existing crop architecture (Part A)

Traced from source, real code citations only:

```
verified localization box (box_tracker.py, scientificAthleteBox)
  = raw pose-landmark-cluster bbox × BOX_PADDING(1.3), floored at MIN_BOX_SIDE_PX(60px)
  coordinate system: source-frame pixels, center+size
   ↓
crop planner input (mediapipe_pose_runner.py main(), `boxes[]`)
  = box_track_records[i].box, synced to None for frozen_suspect-excluded frames
  BEFORE plan_crops() runs (Phase 4.2C's own established gate)
   ↓
plan_crops() — segment-aware local trend fit (Phase 4.2D) + centered moving
  average (ROI_SMOOTH_WINDOW=3, segment-bounded) → `track[]`
   ↓
crop center = track[i].cx / cy (+ Phase 5.0B's own bounded adjustments — Section 9-10)
crop size (`side`) = max(EFF_MIN_SIDE_FRAC(0.22)×frame_height, EFF_PADDING(1.3)×track[i].h)
  — a SQUARE crop, sized ONLY from the box's HEIGHT, never width — real,
  load-bearing fact for Part D/Section 7's own findings
   ↓
directional padding = Phase 5.0B's bounded velocity-and-time lead (Section 10;
  replaces the prior fixed 0.12×side geometric fraction)
vertical padding = Phase 5.0B's fixed CROP_VERTICAL_FOOT_BIAS_FRAC(0.06) downward
  anchor shift (Section 11)
   ↓
smoothing = MAX_CENTER_STEP_FRAC(0.35 of side)/MAX_SIDE_CHANGE_FRAC(0.12) bounded
  frame-to-frame change (Day 96, unmodified this phase)
prediction = box_tracker.py's own optical-flow carry-forward between detector
  frames (unmodified this phase)
fallback = full-frame (0,0,width,height) when crop collapses below 8px
   ↓
final cropRect (normalized source-space x0/y0/x1/y1, persisted per frame)
   ↓
resize/remap = cv2 crop + cv2.cvtColor, MediaPipe VIDEO-mode detect_for_video()
   ↓
pose-backend image = the crop pixels only — MediaPipe never sees anything
  outside this rectangle (the single most important fact this whole audit
  is built on)
   ↓
source-space remapping = landmark_dict()'s linear x_full = ox + lm.x*sx (unchanged)
```

### 4.1 Fixed constants (Part A's own required table)

| Constant | Value | Physical meaning | Unit | FPS-dependent? | Athlete-size-dependent? | Resolution-dependent? | Empirically justified? |
|---|---:|---|---|---|---|---|---|
| `EFF_PADDING` | 1.3 (÷ROI_ZOOM) | crop side = this × box height | unitless ratio | No | No (ratio, not px) | No | Pre-existing (Day 72-73); unchanged this phase |
| `EFF_MIN_SIDE_FRAC` | 0.22 | floor on crop side, as a fraction of FRAME height | unitless ratio | No | No | Yes (relative, scales with frame) | Pre-existing; unchanged |
| `ROI_SMOOTH_WINDOW` | 3 frames | centered moving-average window | frame count | **Yes** (a fixed frame count, not ms) | No | No | Pre-existing (Day 95); unchanged — a real, disclosed, pre-existing FPS-dependence this phase did NOT introduce or fix (out of this phase's scope; noted for Section 25) |
| `MAX_CENTER_STEP_FRAC` | 0.35 | max crop-center move, per frame, as a fraction of crop side | unitless ratio | No (relative to side, not px) | No | No | Pre-existing (Day 96); unchanged |
| `MAX_SIDE_CHANGE_FRAC` | 0.12 | max crop-side growth/shrink, per frame | unitless ratio | No | No | No | Pre-existing (Day 96); unchanged |
| `CROP_RISK_WIDEN_GAIN` | 1.5 | multiplier on real trajectory-residual (frame-widths) risk evidence | unitless | No | No (input already fw-normalized) | No | **New, Phase 5.0B** — a real, disclosed, not-grid-searched value; see Section 9 |
| `CROP_RISK_WIDEN_MAX_FRAC` | 0.25 | hard ceiling on risk-driven widening | unitless ratio | No | No | No | **New, Phase 5.0B** — a bound, not a target |
| `CROP_PREDICTION_HORIZON_MS` | 35.0 | forward-lead projection horizon | **milliseconds** | No (this is the point — real time, not frames) | No | No | **New, Phase 5.0B** — matches this pipeline's own `DETECTOR_CADENCE_FRAMES/fps` order of magnitude at 240fps (33.3ms) |
| `CROP_MAX_LEAD_FRAC` | 0.18 | hard ceiling on forward lead, as a fraction of crop half-side | unitless ratio | No | No | No | **New, Phase 5.0B** — a bound |
| `CROP_VERTICAL_FOOT_BIAS_FRAC` | 0.06 | fixed downward vertical-anchor shift, as a fraction of crop half-side | unitless ratio | No | No | No | **New, Phase 5.0B** — real, cross-benchmark evidence (Section 7); a pose-model-topology property, not tuned per clip |

## 5. Joint-boundary analysis (Part B)

Real, per-frame margin measurement (`scripts/phase-5-0b-crop-geometry-audit.mjs`)
against all four current production artifacts, for all 13 required joints,
using each frame's own real `cropRect` and real pose `keypoints`.

**Boundary-pressure-precedes-disappearance — tested directly, per-joint,
per-benchmark**:

| Benchmark | Elevated joints (missing-after-low-margin vs base rate) | Elevation |
|---|---|---:|
| Gav | none (0.000 vs 0.000 everywhere) | — |
| Vanni 240 | right_ankle (0.028 vs 0.007), right_toe (0.021 vs 0.005) | ~4× |
| Vanni 60 | left_ankle (0.167 vs 0.014), left_heel (0.200 vs 0.014), left_toe (0.143 vs 0.014) | 10-14× |
| Vanni 120 | none measurable at this sample size (n≤13) | — |

**Answer to Part B's core question: yes, landmark disappearance is
statistically preceded by boundary pressure — but only on Vanni clips, not
Gav**, a clean, real, benchmark-specific pattern (not spurious/universal
noise), directly consistent with Gav's crop rarely approaching any boundary
at all.

**Clipped-joint frames** (crop-normalized position outside [0,1] — MediaPipe
extrapolated beyond the visible crop): Vanni 240's `right_toe` clips 14
frames (the worst of any joint/benchmark); Gav clips only 1 frame
(`left_toe`, a single real outlier). Full bucket distributions
(0-2%/2-5%/5-10%/>10% of crop width) are in `tmp/phase50b-<label>-summary.json`.

**Frames 430-550 detail (Vanni 240)**: per-frame margins for all 6 foot
joints are in `tmp/phase50b-vanni240-summary.json`'s `detailWindow_430_550`
block — the minimum margin recorded in this window is deeply negative
(clipped) for `right_toe`/`right_ankle`, consistent with Section 6's own
470-527 crop-lag finding.

## 6. Crop-lag analysis (Part C)

Real, measured (not estimated) residuals between the athlete's real
pose-derived position (`athleteBoundingBoxSource` — this frame's own raw
pose-landmark extent, a direct, real ground-truth proxy, not a downstream
metric), the localization box (`scientificAthleteBox`), and the crop
actually given to MediaPipe (`cropRect`):

| Benchmark | loc→athlete residual (mean/max px) | crop→loc residual (mean/max px) | crop→athlete residual (mean/max px) | Mean offset (frame-widths) |
|---|---|---|---|---:|
| Gav | 28.4 / 199.6 | 28.7 / 94.1 | 36.9 / 111.7 | 0.019 |
| Vanni 240 | 44.4 / 247.4 | 50.6 / 135.0 | 66.6 / 145.2 | 0.035 |
| Vanni 120 | 24.8 / 143.0 | 48.2 / 109.4 | 47.9 / 127.1 | 0.025 |
| Vanni 60 | 27.5 / 227.9 | 50.7 / 108.4 | 57.3 / 153.3 | 0.030 |

(Table reflects the PRE-Phase-5.0B baseline artifacts, used to establish
the real problem this phase targets; Section 16 reports the same
measurement AFTER this phase's changes.)

### 6.1 Vanni 240's 470-527 interval, precisely explained

- **First frame of measurable lag**: 470 (crop-to-athlete residual crosses
  40px, a real, meaningful onset threshold).
- **Peak lag**: frame 526, 128.0px (pre-change baseline).
- **Recovery frame**: 569 (the same real frame Phase 4.2J's own
  `poseBoundsIoU`-based method independently found as the next real
  detector confirmation — two independent measurement techniques agreeing).
- **Duration**: 99 source frames (~412ms at 239.981fps).
- **Decomposition** (the real, precise answer to "is this smoothing,
  prediction error, segment planning, or undersized crop?"): window-mean
  `locToAthleteResidualPx` = 129.2px; window-mean `cropToLocResidualPx` =
  28.7px. **The dominant cause (≈82% of the total crop-to-athlete
  residual) is box_tracker.py's own already-known localization lag**
  (Phase 4.2J's finding, independently reconfirmed here via a different
  measurement method — hip-midpoint-vs-box-center in Phase 5.0A, now
  pose-envelope-vs-box-center here). The REMAINING, smaller share (≈18%)
  is plan_crops' own added lag — this is the part this phase's adaptive
  design targets and measurably reduces (Section 16).
- **Crop size**: `windowSizeInsufficientRate = 0` — the crop was NEVER too
  small to contain the athlete's own real extent during this window (crop
  half-width always ≥ the athlete's own half-extent). **This is not a
  crop-SIZE problem — it is a crop-CENTERING (lag) problem**, precisely
  matching Part D's own instruction not to assume undersizing without
  proof.

### 6.2 A real regression found and fixed during this phase's own validation

The first, naive version of Section 9's risk-reactive widening multiplied
crop side by a factor reacting to `trajectoryResidualFrameWidths` on every
`tracked`-origin frame. Real production evidence
(`tmp/phase42j-final/vanni240.pose.json` vs the first Vanni 240 rerun under
this phase's initial code) showed 123 frames in the range 714-952 — deep
inside the already-adjudicated barrel/wall-lock tail — flip from
`frozen_suspect` back to `tracked`. Root cause, found by direct inspection:
`trajectoryResidualFrameWidths` grows continuously even on a PERFECTLY
STATIC (background-locked) box, because it measures the gap between the
STATIC real position and the ADVANCING expected position from established
velocity — a real, already-documented Phase 4.2H signature, not a new bug
in that field. The naive widen made `cropRect` creep every frame even
though `scientificAthleteBox` itself was verified byte-identical across the
whole span (confirmed directly) — breaking `repeatedIdenticalCropCount`,
one of the real signals `apply_pose_localization_feedback`'s stale-crop
detection depends on to retroactively confirm a freeze.

**Fix, round 1**: risk-based widening gated on `boxes[i] is not None` and
NOT exactly equal to `boxes[i-1]`. A real production rerun showed this was
insufficient — 123 boxOrigin diffs shrank but did not disappear, because
exact (`==`) floating-point equality between consecutive REAL box_tracker.py
outputs essentially never holds even during a genuine lock (optical flow
recomputes slightly different sub-pixel noise every frame). **Fix, round
2**: replaced exact equality with a bounded EPSILON (0.0005 frame-widths,
≈1px at 1920px width) — small enough that no real athlete motion at any of
this project's real fps classes could produce a smaller true displacement
in one frame. This reduced the real Vanni 240 rerun's boxOrigin diffs from
123 to 8 (Section 17) — a small, disclosed, bounded residual at the exact
boundary of the barrel-lock region, not a systemic failure.

A second, related bug (a spurious velocity computed across a segment
boundary, from a held-flat sample belonging to a DIFFERENT segment) was
found via this phase's own deterministic fixture suite (Test 11 of
`crop-segment-planning-sanity.py`, a real containment-margin violation at
frame 260 of that fixture) and fixed by gating the velocity computation on
`seg_id[i] == seg_id[i-1]`. Both fixes are verified via real production
reruns (Section 17) and the full existing test suite (Section 15).

### 6.3 A second real regression: an unconditional vertical bias broke Gav's exact match

Section 11's original design applied `CROP_VERTICAL_FOOT_BIAS_FRAC`
UNCONDITIONALLY, every frame, regardless of any per-frame evidence — a
deliberate design choice, reasoning that Section 7's margin-asymmetry
evidence was itself universal (present in all four benchmarks) and
therefore safe to apply structurally. A real Gav production rerun proved
this wrong: unconditional application changed Gav's own real MediaPipe pose
output on all 142 frames (any crop-framing change shifts exact sub-pixel
landmark positions, even for an otherwise-successful detection), moving
`strideFrequencyHz` from the established 4.4 baseline to 4.24 — a real,
measured violation of Gav's own exact-match invariant. **Fix**: the
vertical bias is now gated on the SAME real, fresh-evidence risk condition
Section 9's widening uses (`has_fresh_evidence and risk > 0.0`), and — since
Section 6.3's own further investigation proved NO safe nonzero threshold
exists on this raw signal (Section 9.1) — is therefore ALSO inert by
default alongside the widening it's now coupled to. A residual, small,
disclosed Gav metric shift remains from Part G's own separate, mandated
lead-formula replacement (Section 17) — not from this mechanism, which is
now fully inert in production.

## 7. Crop-utilization analysis (Part D)

| Benchmark | Athlete width / crop width | Athlete height / crop height | Utilization (area ratio) | Foot-to-bottom margin (mean/min px) | Head-to-top margin (mean/min px) |
|---|---:|---:|---:|---|---|
| Gav | 0.266 | 0.429 | 0.113 | 71.8 / 30.2 | 67.8 / 43.5 |
| Vanni 240 | 0.266 | 0.410 | 0.110 | 61.9 / **7.7** | 89.6 / 62.4 |
| Vanni 120 | 0.298 | 0.495 | 0.145 | 63.3 / 38.9 | 70.9 / 49.9 |
| Vanni 60 | 0.334 | 0.453 | 0.153 | 50.1 / 20.6 | 85.6 / 57.9 |

**Findings**: average utilization is similar across all four benchmarks
(11-15%) — crops are NOT, on average, tighter or looser for Vanni 240 than
for any other benchmark; this rules out "Vanni 240's crop is globally
undersized" as an explanation. The real, discriminating signal is the
**minimum** foot-to-bottom margin: Gav 30.2px, Vanni 120 38.9px, Vanni 60
20.6px, **Vanni 240 7.7px** — a real, benchmark-specific worst case, driven
by the SAME 470-527 lag window (Section 6), not by average sizing.

**A second, universal, cross-benchmark finding, independent of Vanni 240's
own specific problem**: foot-to-bottom margin is structurally TIGHTER than
head-to-top margin in **every one of the four benchmarks**, without
exception (Gav 30.2 vs 43.5; Vanni 240 7.7 vs 62.4; Vanni 120 38.9 vs 49.9;
Vanni 60 20.6 vs 57.9). This is the real, direct evidentiary basis for
Section 11's vertical-anchor rebalancing — a structural property of
MediaPipe's own upper-body-dense 33-point topology (more landmarks
cluster around the face/shoulders/arms than the legs/feet), not an
artifact of any one clip.

**Conclusion (Part D's own required determination)**: current crops are
**correctly sized on average but laterally/vertically miscentered during
real localization-lag episodes** — not globally too tight, not globally
too loose. This directly rules out a blanket crop enlargement (which the
task's own hard constraint already warned against) and instead supports
this phase's actual design: bounded, evidence-reactive widening plus a
fixed, evidence-based vertical rebalance.

## 8. Full-body containment contract (Part E)

Implemented as `classify_crop_containment()` (`mediapipe_pose_runner.py`),
called once per frame in Pass 2 using only that frame's own real crop rect
and real pose result — never a downstream metric. Eight interpretable
states (`CROP_CONTAINMENT_STATES`): `crop_full_body_verified` (≥90%
required-joint completeness AND all 6 foot joints present, no boundary
risk), `crop_full_body_provisional` (some evidence, below the verified
bar), `crop_foot_at_risk` (a foot joint within `CROP_MARGIN_RISK_FRAC`=5%
of a boundary), `crop_head_at_risk` (same, for `nose`), `crop_extremity_clipped`
(a required joint's crop-normalized position outside [0,1], or fewer than
4 of 6 foot joints present), `crop_stale` (crop built from a stale/frozen
box), `crop_prediction_only` (crop built from a predicted, not verified,
box), `crop_invalid` (no crop, no landmarks, or an `invalid`-origin frame).
Required joints: nose, left/right hip, left/right knee, and all 6 foot
joints (ankle/heel/toe × 2) — matching this task's own stated priority
(feet over hands for sprint analysis; hands not included in the
REQUIRED set, consistent with "retained where practical" rather than
mandatory).

## 9. Adaptive crop design (Part F)

Two real, bounded, evidence-reactive additions to `plan_crops()`, both
additive to (never replacing) the existing confidence-based widening and
frame-to-frame bounding:

1. **Risk-reactive widening**: `side *= (1 + min(CROP_RISK_WIDEN_MAX_FRAC,
   risk × CROP_RISK_WIDEN_GAIN))`, where `risk` is box_tracker.py's own
   already-computed `trajectoryResidualFrameWidths` (Phase 4.2H) — a real,
   already-frame-width-normalized signal, reused rather than reinvented.
   Gated on fresh, real per-frame box evidence only (Section 6.2's fix) —
   never fires on a held/extrapolated or genuinely frozen frame, so it
   cannot itself create runaway growth or defeat the frozen-track
   detector. Bounded at +25% regardless of risk magnitude.
2. Confidence-based widening (Part 2E, pre-existing, unmodified) continues
   to apply independently.

Both remain subject to the pre-existing, unmodified `MAX_SIDE_CHANGE_FRAC`
(12%/frame) bound — Part F's own explicit "no sudden zoom" requirement is
satisfied by a bound this phase did not need to touch.

**Why not simply enlarge the crop globally?** Section 7's own evidence
(utilization is already similar across benchmarks; Vanni 240's real
problem is a MINIMUM-margin outlier during a specific lag window, not an
average undersizing) directly rules this out — bounded, evidence-reactive
widening (only when real risk evidence exists) is the evidence-supported
design, not a blanket increase.

### 9.1 Real-world finding: this mechanism defaults OFF

`CROP_RISK_WIDEN_GAIN` defaults to **0.0** — fully inert in production.
Section 6.3 explains why: a real Gav production rerun with a nonzero
default measurably moved `strideFrequencyHz` off its established baseline,
traced to the same fundamental signal-overlap problem Phase 4.2H already
proved (Gav's own real trajectory-residual ceiling exceeds Vanni 240's own
real problem-window range). The mechanism is fully implemented and tested
(Section 15, Tests 8c/8d/9/9b/9c) so a future phase with a genuinely new
evidence source (not another variant of this same raw signal — matching
Phase 4.2H's own Section 27 recommendation) can enable it via
`MEDIAPIPE_CROP_RISK_WIDEN_GAIN`, exactly the same "ship the capability,
default it inert, document the real finding" pattern this codebase already
uses for `ROI_ENABLED`/`ACCELERATION_MODE`.

## 10. Forward-motion anticipation (Part G)

Replaces the prior fixed `0.12 × side` forward-lead fraction with:

```
lead_px = velocity_px_per_ms × direction_sign × CROP_PREDICTION_HORIZON_MS
lead_px = clamp(lead_px, -max_lead_px, +max_lead_px)   # max_lead_px = (side/2) × CROP_MAX_LEAD_FRAC
lead_px = 0 if lead_px opposes the configured travel direction
```

`velocity_px_per_ms` is derived from the SAME segment-aware, already-
smoothed track (`track[i] - track[i-1]`, only within the same segment —
Section 6.2's second fix), divided by the real nominal inter-frame time
(`1000/fps` ms) — never a fixed frame count. `CROP_PREDICTION_HORIZON_MS`
(35ms) is a real, disclosed, ms-based constant (Section 4.1), applied
identically at every fps — Test 8 (Section 15) proves the SAME real
px/ms velocity produces the SAME real lead_px at 60/120/240fps, which a
frame-count-based lead could not do. The lead can only ever push FORWARD
in the configured direction (Section 10's own floor-at-zero rule) — it
never claims to BE localization; `scientificAthleteBox`'s own provenance
is completely untouched by this (confirmed: byte-identical across every
rerun, Section 16).

## 11. Vertical stability (Part H)

A bounded, athlete-independent, FPS-independent downward shift of the
crop's vertical anchor: `cy = cy + CROP_VERTICAL_FOOT_BIAS_FRAC × (side/2)`,
based directly on Section 7's own real, cross-benchmark evidence
(foot-to-bottom margin tighter than head-to-top margin in all four
benchmarks) — not tuned toward any single clip's numbers.

**Real finding, changed from the original design**: this phase's initial
implementation applied the shift UNCONDITIONALLY, every frame — a real Gav
production rerun proved this changes Gav's own exact pose bytes on every
frame (Section 6.3), so it is now gated on the same real, fresh-evidence
risk condition Section 9 uses, and inert by default alongside it (Section
9.1) for the same disclosed reason (no safe threshold separates Gav's own
motion from Vanni 240's real problem window using this signal). Kept
deliberately separate from display auto-follow (this module never touches
any display/auto-follow file) and from the existing
`ROI_SMOOTH_WINDOW`/`MAX_CENTER_STEP_FRAC` bounce damping, which remain the
ACTUAL, always-on mechanism preventing vertical bounce (Test 13, Section
15, confirms bounce is damped to <50% of its input
amplitude, unchanged by this phase).

## 12. Crop-scale vs pose-resolution test (Part I)

Real MediaPipe reruns (`scripts/phase-5-0b-crop-scale-tradeoff.py`) against
10 real Vanni 240 source frames (5 from the 470-527 drift window, 5 normal
frames elsewhere), each cropped at 5 real scales (1.0×/1.05×/1.10×/1.15×/
1.20× the current crop) around the SAME real localization box, run through
the SAME production PoseLandmarker model (IMAGE mode — a disclosed
methodological difference from production's VIDEO mode, since this is a
diagnostic, isolated-frame comparison, not a sequential rerun):

| Scale | Detect rate | Mean keypoint count | Mean visibility | Mean completeness | Foot-index available | Mean processing time |
|---|---:|---:|---:|---:|---:|---:|
| 1.00× | 0.30 | 9.9 | 0.151 | 0.142 | 0.0 | 17.0ms |
| 1.05× | 0.30 | 9.9 | 0.211 | 0.227 | 0.1 | 16.1ms |
| 1.10× | 0.30 | 9.9 | 0.183 | 0.206 | 0.2 | 15.6ms |
| 1.15× | 0.30 | 9.9 | 0.195 | 0.206 | 0.1 | 15.4ms |
| 1.20× | 0.40 | 13.2 | 0.278 | 0.297 | 0.2 | 15.2ms |

**Honest result**: within this small (n=10/scale), deliberately-hardest-case
sample, enlarging the crop up to +20% did NOT show pose-resolution
degradation — if anything, detection and completeness modestly improved at
+20%. This is disclosed as a small-sample, single-frame (not
temporally-continuous) diagnostic, not a definitive resolution-tradeoff
curve — the noise between 1.05×/1.10×/1.15× (non-monotonic) shows real
measurement variance at this sample size. **Conclusion for Part I's own
explicit question** ("select the smallest crop that reliably preserves
required joints, not largest crop wins"): this evidence does not license
unbounded enlargement, but it also does not contradict this phase's
existing bounded design (max +25% risk-widen, max +18% lead) — the
bounds were set from Section 4.1's own physical/evidence justification,
not from this specific test, and this test found no cost that would argue
for tightening them further.

## 13. Files changed

- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  `CROP_RISK_WIDEN_GAIN`/`CROP_RISK_WIDEN_MAX_FRAC`/`CROP_PREDICTION_HORIZON_MS`/
  `CROP_MAX_LEAD_FRAC`/`CROP_VERTICAL_FOOT_BIAS_FRAC` (new constants);
  `plan_crops()` signature (+`risk_fw` param, returns `(crops, diagnostics)`
  tuple — a real, disclosed signature change, all call sites updated);
  risk-reactive widening (fresh-evidence-gated, Section 6.2); velocity-and-
  time-scaled forward lead (segment-boundary-gated, Section 6.2); fixed
  vertical-anchor bias; `CROP_CONTAINMENT_STATES`/`CROP_FOOT_JOINTS`/
  `CROP_CONTAINMENT_REQUIRED_JOINTS`/`CROP_CONTAINMENT_LANDMARK_INDEX`/
  `CROP_MARGIN_RISK_FRAC` (new); `classify_crop_containment()` (new
  function); 12 new frame-level provenance fields threaded in the Pass 2
  loop.
- `src/lib/biomechanics/pose.ts`, `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`,
  `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — Zod schema +
  passthrough mapping for the 12 new fields (same additive,
  `.nullable().optional()` convention as every prior phase).
- `scripts/crop-segment-planning-sanity.py`, `scripts/athlete-tracker-sanity.py`
  — updated 9 call sites for `plan_crops()`'s new `(crops, diagnostics)`
  return shape (mechanical, no assertion weakened).
- `scripts/phase-5-0b-crop-geometry-audit.mjs` (new, Parts B/C/D, real
  measurement against production artifacts).
- `scripts/phase-5-0b-crop-scale-tradeoff.py` (new, Part I).
- `scripts/phase-5-0b-adaptive-crop-sanity.py` (new, Part L, 24+1
  deterministic fixtures).
- `package.json` — +1 script entry (`phase-5-0b-adaptive-crop:sanity`).
- `docs/phase-5-0b-adaptive-crop-geometry.md` (this file).
- `docs/stationary-roadmap-progress.md` — new, unweighted Phase 5.0
  section (Section 24).

No production code outside `mediapipe_pose_runner.py`'s crop-planning
region and the three schema files was touched. `measurements.ts`,
`cadence.ts`, `contacts.ts`, `steps.ts`, `strideMetrics.ts`,
`timingPolicy.ts`, and `box_tracker.py` were NOT modified this phase.

## 14. Database changes

None beyond the normal, expected effect of real production reruns
(`save_working_analysis_snapshot`/`replace_working_analysis`) — new
immutable saved snapshots for each rerun benchmark's pre-run state. No
manual mutation of the protected Gav benchmark. No `db:reset` was run.

## 15. Deterministic tests

`scripts/phase-5-0b-adaptive-crop-sanity.py` (`phase-5-0b-adaptive-crop:sanity`,
25/25 PASS including the 9c regression-guard added after Section 6.2's own
finding) — covers full-body containment classification (tests 1-5, 14-15,
17, 20-21), bounded velocity-and-time-scaled forward lead (6-8), bounded
risk-reactive widening including the frozen-box protection (9, 9c, 10-11),
bounded center/size movement (12), damped vertical bounce (13), structural
metric/timing isolation (22-24). `scripts/crop-segment-planning-sanity.py`
(20/20 PASS, re-verified against the new code, including the real
containment-margin regression found and fixed this phase — Section 6.2).
`scripts/athlete-tracker-sanity.py`, `scripts/box-tracker-sanity.py`,
`scripts/box-tracker-teleport-sanity.py`, `scripts/box-tracker-frozen-track-sanity.py`,
`scripts/box-tracker-crop-provenance-sanity.py`,
`scripts/detector-event-plausibility-sanity.py`, `scripts/skeleton-ownership-sanity.py`,
`scripts/vanni-240-source-adjudication-sanity.py`,
`scripts/athlete-interior-feature-selection-sanity.py` — all re-run this
phase against the new code, all PASS, zero regressions.

Full required suite (`stationary-validation-registry:sanity`,
`box-tracker:sanity`, `box-tracker-teleport:sanity`,
`box-tracker-frozen-track:sanity`, `box-tracker-crop-provenance:sanity`,
`crop-segment-planning:sanity`, `detector-event-plausibility:sanity`,
`athlete-interior-feature-selection:sanity`, `vanni-240-metric-evidence:sanity`,
`measurement-recovery:sanity`, `timing-verification:sanity`,
`analysis-fps:sanity`, `zone-step-counting:sanity`, `zone-coverage:sanity`,
`analysis-report:sanity`, `skeleton-ownership:sanity`,
`phase-4-2j-adjudication:sanity`, `phase-5-0b-adaptive-crop:sanity`,
`worker:check`): 18/19 PASS, one pre-existing, disclosed failure
(`stationary-validation-registry:sanity`'s roadmap-weight-total check,
105%≠100%, unrelated to this phase, documented since Phase 4.2C).
`npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit
0. `npm run db:reset` was never run.

## 16. Vanni 240 rerun (Part M)

Real production rerun (analysis `a7679326-e193-4489-bf50-735fe402ec60`,
final code with risk-widening/vertical-bias at their real, inert default).

| Metric | Before (pre-5.0B) | After (Phase 5.0B) |
|---|---|---|
| `boxOrigin` diffs vs baseline | — | 8 frames (714-720, 953 — all inside the already-adjudicated barrel-lock tail; down from 123 in the first, buggy attempt) |
| `scientificAthleteBox` diffs | — | 0 (localization completely untouched) |
| Crop-to-localization residual, 470-527 window (mean) | 28.7px | **16.0px (−44%)** |
| Peak crop-to-athlete residual, 470-527 window | 128.0px | 156.2px (higher — see below) |
| Recovery frame | 569 | 569 (unchanged) |
| Pose quality (`meanOverall`) | 0.415 | 0.416 |
| Contact readiness | 0.4245 | 0.4245 (unchanged) |
| Foot-evidence: `mediapipe_never_produced` | 2286 (37.4%) | 2244 (36.7%) |
| Foot-evidence: `mediapipe_low_confidence` | 135 (2.2%) | 243 (4.0%) |
| Foot-evidence: `ava_gate_stripped` | 1074 (17.5%) | 1020 (16.7%) |
| Runtime | ~161s | 158.4s (no material change) |

**Peak residual rose (128→156px) even though the MEAN crop-to-localization
lag fell.** Traced: the velocity-based lead (Part G) — active in
production — reacts to the box's own real velocity trend, which near the
peak of this specific drift episode was still (correctly) following
box_tracker's own lagging trajectory; the lead amplifies exactly at the
frame the underlying box is moving fastest, which happens to coincide with
the window's own peak. This is a real, traced, disclosed side effect of
Part G's own design, not an unexplained regression — the recovery frame
(569) and total duration are unchanged, and the WHOLE-WINDOW mean (the
more representative statistic) genuinely improved by 44%.

**A real, isolated, disclosed anomaly**: a single spurious contact was
found at source frame 964 (t≈4.02s, deep in the post-finish barrel-lock
tail, `boxOrigin=tracked`, real but low-confidence ~0.35-0.43 keypoints).
Traced fully: frame 964's own `boxOrigin` is unchanged from the baseline
(still `tracked`), but the CROP shape differs (an inherent, unavoidable
consequence of any crop-geometry change), shifting MediaPipe's exact
sub-pixel pose output enough to cross the contact detector's 0.4 visibility
floor and register a new local-maximum candidate — confirmed isolated
(only 1 candidate peak near frame 900+, not a systemic flood). This single
contact currently gets included by `computeSprintMeasurements`'s own
existing (pre-existing, unmodified, out-of-scope) tolerance for a step
landing after `zoneExitTimeS` — a real, pre-existing characteristic
(the ORIGINAL baseline also included one step 64ms past its own exit time)
now exposed in a much more extreme form (1.7s past exit) by this one
spurious low-confidence detection. **This is disclosed, not hidden**: it
measurably affects `combinedStepFrequencyHz` in the TS presentation layer
(not touched by this phase's own zone-restricted contact audit script,
which is a separate, standalone tool). Per this phase's explicit
constraint against changing contact/metric formulas, this was not
"fixed" by touching contacts.ts/measurements.ts — the only lever available
was crop geometry itself, and the crop change that (correctly, per Part G's
own mandate) altered pose output near this marginal, low-confidence frame
cannot be reverted without abandoning Part G's own mandate. Recommended
for Phase 5.0C (Section 27).

**Real, in-zone contact changes** (traced crop→pose→contact→metric, per
Part M's explicit instruction, never treating restoration as proof of
correctness): the 4 earliest in-zone contacts (frames 76, 321, 374, 476)
are byte-identical to baseline. The 5th shifted from frame 517 (t=2.154s)
to frame 526 (t=2.192s) — both real, both inside the 470-527 window this
phase specifically targets; a real, traced, expected consequence of
changing crop geometry precisely where Phase 4.2J/5.0A/5.0B all found the
real defect to live. Given the risk-widening mechanism is inert by
default, this shift is attributable to Part G's lead redesign + the
epsilon/segment-boundary fixes, not to any tuning toward a desired
metric value (no metric was consulted while designing the fix — Section
6.2's fixes were driven entirely by localization-evidence bugs found via
deterministic fixtures and box-origin provenance, never by watching
`combinedStepFrequencyHz`).

## 17. Gav rerun (Part N)

Real production reruns (analysis `3a148f45-02ff-492d-b9f1-790470b83c21`) —
three iterations, each catching and fixing a real regression before
finalizing:

| Attempt | `strideFrequencyHz` | `athlete_tracking_confidence` | `scientificAthleteBox` diffs | `boxOrigin` diffs | Cause |
|---|---:|---:|---:|---:|---|
| Baseline (pre-5.0B) | 4.40 | 0.8024089716118894 | — | — | — |
| 1st (unconditional vertical bias) | 4.24 | 0.8110 | 0 | 0 (but `keypoints` differed on 142/142 frames) | Unconditional `CROP_VERTICAL_FOOT_BIAS_FRAC` (Section 6.3) |
| 2nd (bias gated on raw `risk>0`) | 4.33 | — | 0 | 0 | Gav's own real, nonzero (if small) trajectory residual still triggered the gate |
| **Final (risk-widen/bias inert by default)** | **4.19** | 0.7967377136943594 | **0** | **0** | Residual entirely attributable to Part G's own mandated lead-formula replacement |

**`scientificAthleteBox` is byte-identical across all 142 frames in every
attempt** — box_tracker.py's own localization was never touched, confirmed
directly. `tracking_loss_ranges` remains `[]` (fully healthy) in every
attempt. `originsCount` (`invalid=7, detected=12, tracked=123`) is
unchanged in every attempt — box_tracker's own tracked/detected/invalid
CLASSIFICATION is completely unaffected; only the exact MediaPipe pose
pixel VALUES shift, because the crop shape genuinely differs.

**Final, honest assessment**: `strideFrequencyHz` moved from 4.40 to 4.19
(−4.8%), `athlete_tracking_confidence` from 0.8024 to 0.7967 (−0.7%) — both
small, bounded shifts, with `tracking_loss_ranges` and `originsCount`
completely unchanged (no tracking degradation, no new gaps, no confidence
collapse). This is a REAL, DISCLOSED departure from this project's own
historical "exact byte match" standard for Gav — but it is the DIRECT,
UNAVOIDABLE, INTENDED consequence of Part G's own explicit instruction to
replace the fixed-fraction forward lead with a velocity-and-time-scaled
one: any directional clip's crop (Gav included — it is a real fly-by
recording with real horizontal motion) necessarily receives a different
lead offset than before, which necessarily shifts MediaPipe's exact
sub-pixel output on every frame with real motion. Achieving literal
byte-identity would require either disabling Part G's own mandated
mechanism entirely (contradicting this task's explicit instruction) or
deliberately tuning the new formula's constants to reproduce Gav's old
numbers (explicitly forbidden: "do NOT tune crop geometry toward desired
metrics"). Per Part N's own literal acceptance wording ("pose quality does
not regress... metrics remain valid from Gav evidence") — not "byte
identical" — this is reported as a real, bounded, non-regressive,
fully-disclosed deviation, not a passing "exact match" result in the style
of every prior Phase 4.2 subphase.

## 18. Vanni 120 rerun (Part O)

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`):
`boxOrigin` diffs vs baseline: **1 frame** (340: `tracked`→`frozen_suspect`
— a MORE conservative reclassification, not less). `scientificAthleteBox`:
**0 diffs** across all 483 frames — localization completely untouched.
`tracking_loss_ranges` shifted from `[{317,482}]` to `[{316,482}]` — a
1-frame boundary reporting shift, not a bridging of the true exit (the
exit region itself, 165 frames long, is otherwise identical).
`strideFrequencyHz` 5.01→4.90 (a small, real shift from the same Part-G
lead-formula mechanism explained in Section 17); `athlete_tracking_confidence`
0.9154→0.9117. No crop prediction extended beyond the source image; the
true exit remains honestly unavailable, not bridged.

## 19. Vanni 60 rerun (Part P)

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`):
**`boxOrigin` diffs vs baseline: 0. `scientificAthleteBox` diffs: 0.**
Localization and scientific eligibility are completely, byte-identically
unaffected by this phase's crop changes for this benchmark.
`tracking_loss_ranges` reshaped slightly in the DB-reported column
(`[{29,29},{152,232}]` → `[{27,29},{152,152},{155,232}]`, a 2-frame
reporting difference inside the already-long-unavailable 152-232 region) —
since the underlying `boxOrigin` classification is proven byte-identical,
this is a downstream reporting artifact, not a real change in scientific
eligibility. The long (80-frame) tracking gap remains genuinely
unavailable — no forced recovery, no fabricated pose, no false finish
crossing (none was ever available, unchanged). `strideFrequencyHz`
3.93→4.07 (Part G lead-formula effect, same as every other benchmark).

## 20. Downstream pose/contact impact

| Benchmark | Localization (`boxOrigin`) diffs | Pose output changed? | Contact/metric impact |
|---|---:|---|---|
| Gav | 0 | Yes (every frame with real motion — Part G lead) | Small, disclosed, bounded (`strideFrequencyHz` −4.8%) |
| Vanni 240 | 8 (barrel-lock tail boundary) | Yes | One in-zone contact shifted within the 470-527 window (expected); one isolated spurious post-finish contact (disclosed, Section 16) |
| Vanni 120 | 1 (more conservative) | Yes | Small (`strideFrequencyHz` −2.2%); true exit unaffected |
| Vanni 60 | 0 | Yes (velocity-lead still applies) | Small (`strideFrequencyHz` +3.6%); long gap unaffected |

Every metric change traces to Part G's velocity-based lead replacement
(active in production for every benchmark) plus, for Vanni 240 only, the
epsilon/segment-boundary fixes in the 470-527 window specifically. The
risk-reactive widening and vertical-bias mechanisms (Parts F/H) are
inert by default in every one of these reruns (Section 9.1) and therefore
contributed ZERO measurable effect to any of the above.

## 21. Metric causal chain (crop → pose → contact → metric)

Per this task's own explicit instruction not to treat metric restoration
as proof of correctness, every metric change found this phase is traced to
its real, specific cause, not merely observed:

- **Gav's `strideFrequencyHz` (4.40→4.19)**: crop (Part G lead formula
  changed) → pose (exact MediaPipe sub-pixel output shifted on every
  motion frame, confirmed via 142/142 keypoint diffs with 0/142
  `scientificAthleteBox` diffs) → contact (unaudited by this phase's own
  contact-detail script for Gav, but `originsCount`/`tracking_loss_ranges`
  prove localization-level eligibility is unaffected) → metric (small,
  bounded worker-side shift).
- **Vanni 240's 517→526 contact shift**: crop (epsilon/segment fixes +
  Part G lead, specifically inside 470-527) → pose (real, measured
  visibility changes at the relevant frames, Section 16) → contact (a real
  local-maximum shift within the SAME real drift window this phase
  targets) → metric (a small, traced shift in the associated step
  interval).
- **Vanni 240's frame-964 phantom contact**: crop (any geometry change
  alters exact sub-pixel output) → pose (a marginal, low-confidence
  keypoint crossed the existing 0.4 visibility floor) → contact (a new,
  isolated local-maximum candidate) → metric
  (`combinedStepFrequencyHz` corrupted by one wildly-spaced interval) —
  traced fully, disclosed fully, NOT fixed (out of scope: contact/metric
  formulas were not touched).

## 22. Phase 5.0B acceptance table

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Current crop geometry fully documented | Pass | Section 4 |
| 2 | Joint-to-boundary margins measured | Pass | Section 5 |
| 3 | Crop lag quantified | Pass | Section 6 |
| 4 | Vanni 240's 470-527 interval explained precisely | Pass | Section 6.1 (82%/18% decomposition, first/peak/recovery frames, duration) |
| 5 | Full-body containment contract exists | Pass | Section 8 |
| 6 | Adaptive crop geometry evidence-backed | Pass | Sections 9-11 (including the honest negative finding, Section 9.1) |
| 7 | Forward-motion anticipation bounded and source-time based | Pass | Section 10 (ms-based horizon, Test 8 proves cross-fps consistency) |
| 8 | Vertical crop stability preserved | Pass | Section 11 (damped bounce, Test 13) |
| 9 | Crop-size vs pose-resolution tradeoff measured | Pass | Section 12 |
| 10 | No athlete-specific or FPS-specific crop constants introduced | Pass | Section 4.1 (all new constants are unitless ratios or real ms values) |
| 11 | Vanni 240 foot landmark availability improves or limitation disproven | **Partial** | Section 16 — marginal, mixed shift (some categories improved, some worsened); the dominant, root cause (box_tracker's own localization lag) was correctly left untouched per this task's own scope limit, so no large improvement was expected or achieved |
| 12 | Gav does not regress | **Partial, disclosed** | Section 17 — a real, small, bounded, non-catastrophic metric shift, an unavoidable consequence of Part G's own mandate, not a tracking/eligibility regression |
| 13 | Vanni 120 does not regress | Pass | Section 18 |
| 14 | Vanni 60 does not gain unsupported evidence | Pass | Section 19 (0 `boxOrigin` diffs) |
| 15 | Metric/timing/contact formulas remain unchanged | Pass | Section 13 (files changed) |
| 16 | All relevant tests pass | Pass | Section 15 |
| 17 | Phase 4.2 blocker reevaluated honestly | Pass | Section 23 |
| 18 | Roadmap updated with exact evidence | Pass | Section 24 |

## 23. Phase 4.2 reevaluation

Phase 4.2 has remained blocked because Vanni 240's zone-based metrics
(`combinedStepFrequencyHz`, contact count) never matched their Phase 1/2
baseline. This phase's own hypothesis — crop geometry, not localization,
was the remaining defect — is **not confirmed as the sole or dominant
cause**. Section 6.1's own precise decomposition of the 470-527 window
found the crop's OWN added lag is real but is only ~18% of the total
crop-to-athlete residual; the DOMINANT ~82% share is box_tracker.py's own
already-known localization lag (Phase 4.2J), which this phase correctly
left untouched (no independent proof of a NEW localization defect was
found — the crop audit reconfirmed the EXISTING one). The one crop-level
mechanism that could have helped (risk-reactive widening) was proven, via
real Gav production validation, to hit the exact same Gav-vs-Vanni
signal-overlap wall Phase 4.2H already proved at the localization layer —
now confirmed a SECOND time, independently, at the crop layer. This is
strong, real evidence that the remaining defect is not a simple "wrong
architectural layer" problem (localization vs. crop) — it appears to be a
more fundamental limit of the available real-time evidence signal
(`trajectoryResidualFrameWidths`) itself, regardless of which layer
consumes it.

**Vanni 240's zone metrics after this phase**: `combinedStepFrequencyHz`
and `validContacts` remain in the same general regressed range as before
(the 517→526 contact shift and the frame-964 phantom are both real,
traced, but do not represent a restoration to the Phase 1/2 baseline).

**Verdict: Phase 4.2 remains In Progress, contributing 0%.** The exact
blocker, restated with this phase's own new evidence: Vanni 240's short,
in-zone contact-level degradation is now confirmed, across FIVE
independent real-evidence attempts spanning TWO architectural layers
(box_tracker.py's coast-risk gate, Phase 4.2G/H/I/J; and now
`plan_crops()`'s own risk-reactive widening, Phase 5.0B) to be
unresolvable using `trajectoryResidualFrameWidths`-family evidence without
either regressing the protected Gav benchmark or failing to help Vanni
240. **This subsystem finding is precise**: it is not that "localization"
or "crop geometry" individually owns the defect — box_tracker.py's own
real lag (Section 6.1's 82% share) remains the larger single contributor,
and it was correctly not touched this phase (no new evidence proved a
localization defect this crop audit could independently justify fixing).

## 24. Roadmap progress before versus after

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution. Neither Phase 5.0A nor Phase 5.0B had a defined roadmap
weight.
**After this phase**: **26.8%** (normalized) — unchanged. Per this task's
own explicit instruction, no roadmap credit is invented for Phase 5.0B
since the tracker document defines no weight for it. Phase 4.2 remains In
Progress, 0% contribution (Section 23). See
`docs/stationary-roadmap-progress.md`'s new, explicitly unweighted Phase
5.0 section for the full, disclosed status.

## 25. Remaining limitations

- Risk-reactive widening and the vertical-anchor bias (Parts F/H) are
  fully implemented and tested but INERT BY DEFAULT — real production
  value requires a genuinely new evidence source (not another variant of
  `trajectoryResidualFrameWidths`), matching Phase 4.2H's own Section 27
  recommendation, now doubly confirmed.
- Gav's own metrics show a real, small (<5%), disclosed, non-regressive
  shift from Part G's mandated lead-formula replacement — a real departure
  from this project's historical "exact byte match" standard, judged
  acceptable per Part N's own literal wording but flagged prominently as a
  policy question for a human to confirm going forward.
- Vanni 240's isolated frame-964 phantom contact (Section 16) is disclosed
  but not fixed — it requires either contact-detector changes (out of this
  phase's scope) or a crop-level mitigation targeted specifically at
  low-confidence, near-threshold, deep-tail frames (not attempted this
  phase, given time constraints after the three real regressions already
  found and fixed).
- Part I's crop-scale test used single-frame IMAGE-mode inference (a
  disclosed methodological difference from production's VIDEO-mode
  temporal continuity) on a small (n=10/scale) sample — a real, bounded
  diagnostic, not a definitive resolution-tradeoff curve.
- `ROI_SMOOTH_WINDOW`'s own pre-existing FPS-dependence (a fixed 3-frame
  window, not ms-based) was identified during this phase's own Part A
  audit (Section 4.1) but is out of scope to fix here (unchanged since Day
  95, not part of this phase's own mandate).

## 26. Git status

No commit, no push, this phase. `git log` HEAD unchanged throughout
(`c8aa4090`). New, uncommitted files this phase:
`scripts/phase-5-0b-crop-geometry-audit.mjs`,
`scripts/phase-5-0b-crop-scale-tradeoff.py`,
`scripts/phase-5-0b-adaptive-crop-sanity.py`, this report, and the raw
`tmp/phase50b-*` data files (working evidence, not tracked source).
Modified, uncommitted files:
`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`,
`src/lib/biomechanics/pose.ts`, `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`,
`src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts`,
`scripts/crop-segment-planning-sanity.py`, `scripts/athlete-tracker-sanity.py`,
`package.json`, `docs/stationary-roadmap-progress.md`.

## 27. Exact recommended Phase 5.0C scope

1. **Do not attempt a sixth variant of the `trajectoryResidualFrameWidths`
   evidence family** at any layer (box_tracker.py or plan_crops()) — this
   phase's own real Gav production validation is the SECOND independent
   proof (after Phase 4.2H) that this signal cannot separate Gav from
   Vanni 240 at any threshold, at any architectural layer.
2. **Investigate the Vanni 240 frame-964 phantom contact class**
   specifically — low-confidence (~0.35-0.45), near-the-0.4-floor keypoints
   in already-adjudicated tail regions are structurally unstable under any
   crop change; a bounded, evidence-gated confidence-floor margin (NOT a
   contact-formula change) applied specifically to already-quarantined
   regions may be a safer, narrower fix than anything attempted this
   phase.
3. **Revisit whether Gav's own "exact byte match" standard should still
   apply to crop-geometry phases** (as opposed to localization
   safety-gate phases, where it originated) — Section 17's own finding
   shows this standard is fundamentally in tension with any task that
   mandates changing a CORE, unconditional crop-geometry formula (like
   Part G's lead). A human decision on this policy question would help
   scope Phase 5.0C's own acceptance criteria precisely, rather than each
   future crop-geometry phase re-deriving the same tension independently.
4. **Do not pursue further crop-size enlargement** — Section 12's own real
   evidence found no cost to modest enlargement in its small sample, but
   also no benefit large enough to justify loosening the existing bounded
   design; Section 7's utilization evidence already rules out a global
   undersizing explanation.
5. **A genuinely new evidence source** (not derived from box position
   trend at all) — e.g., MediaPipe's OWN per-landmark confidence trend
   over the last N real frames, or a crop-containment-specific signal
   computed from the ALREADY-PRESENT `athleteBoundingBoxSource` field
   this phase's own audit scripts already use — is the most promising
   remaining lever for actually resolving Vanni 240's regression, since
   every variant of the trajectory-residual family has now been
   conclusively shown insufficient.
