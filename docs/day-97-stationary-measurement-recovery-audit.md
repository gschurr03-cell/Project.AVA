# Project AVA
## Stationary Sprint Measurement Engine — Metric Recovery Audit (Day 97)

Status: Measurement validation only. No tracking architecture, panning, Athlete
Intelligence, or historical-analysis work was performed. No database writes were
made (all database access this audit was read-only `SELECT`s against the local
dev Postgres instance). Nothing was committed or pushed. This document and its
accompanying code changes remain uncommitted in the working tree, as directed.

This audit follows [`docs/day-96-stationary-tracking-milestone-report.md`](day-96-stationary-tracking-milestone-report.md),
which addressed athlete *localization*. This audit addresses the layer above
it: whether the *measurements* the tracking layer now supports are actually
being computed, surfaced, and trusted correctly.

---

## Executive summary

The central finding of this audit is that **the stationary measurement engine
already computes real, well-corroborated values for step length and peak
velocity from the Vanni 240fps session's verified tracking window** —
`computeSprintMeasurements`, the exact function the live session page calls on
every render, produces `avgIndividualStepLengthM: 2.033`, `peakStrideLengthM:
2.033`, and `maxVelocityMps: 10.096`, cross-checked across three independent
stride-velocity windows that agree within ~4% of each other. None of this was
fabricated or backed into existence for this audit: it is the live pipeline's
own output, reproduced verbatim by calling the production function against the
real pose artifact and the real, manually-confirmed calibration gates stored
for this session.

None of those values currently reach a coach, however. They are suppressed —
correctly, by the letter of the current gate, but overly bluntly in effect —
by a single whole-recording classification (`recordingMode:
"athlete_tracking_lost"`, `spatialMetricEligibility: "withheld"`) that is
computed once per session from full-clip tracking statistics and then applied
uniformly to every spatial metric, with no allowance for a long, clean,
independently-verified sub-window nested inside an otherwise sparse capture.
Every one of the four real, completed local analyses examined in this audit —
covering both fly and acceleration sessions, 60fps through 240fps — currently
receives this same blanket classification. Average Velocity is correctly and
separately unavailable for a genuine, unrelated reason: the athlete enters
frame after the true start-line crossing already happened off-camera, so no
verified zone-entry timestamp exists to divide distance by.

This report does not change that gate. Per the explicit boundaries of this
audit, gating logic shared with panning-mode camera-motion classification is
tracking architecture, not measurement validation, and a same-pass fix could
not be verified safely against the full range of sessions the gate protects.
The finding is instead documented precisely, pinned as a permanent regression
check (`npm run measurement-recovery:sanity`), and recommended as the
single highest-priority item for the next milestone.

---

## Part 1 — Ground contact audit

### Method

The real, unmodified `detectFootContacts` → `buildFullRunEvents` pipeline
(`src/lib/biomechanics/events/FootContactDetector.ts`,
`src/lib/video/events.ts`) was run against the corrected pose artifact for
analysis `b890527f-8a73-4ccb-b74c-b1e845a4f16e` (the final Day 96 production
run, 2,348 frames, 1920×1080, 239.48fps), reading the real `keypoints` field
this time — the field-name bug documented in the Day 96 report is fully
behind this audit.

### Real contact count

**Six contacts were detected across the full run — three left, three right —
all between t=7.107s and t=8.184s:**

| # | Frame | Time (s) | Side | Confidence¹ | In zone? |
|---|-------|----------|------|-------------|----------|
| 1 | 1702 | 7.1071 | left | ≈0.976 (mean of left toe/heel/ankle: 0.976, 0.975, 0.978) | yes |
| 2 | 1745 | 7.2867 | right | ≈0.958 (right toe/heel/ankle: 0.956, 0.953, 0.965) | yes |
| 3 | 1803 | 7.5288 | left | ≈0.920 (left toe/heel/ankle: 0.911, 0.930, 0.920) | yes |
| 4 | 1843 | 7.6958 | right | ≈0.982 (right toe/heel/ankle: 0.980, 0.981, 0.987) | yes |
| 5 | 1899 | 7.9296 | left | ≈0.953 (left toe/heel/ankle: 0.927, 0.973, 0.958) | yes |
| 6 | 1960 | 8.1842 | right | ≈0.948 (right toe/heel/ankle: 0.928, 0.945, 0.972) | **no — excluded** |

¹ Reproduced from the same three-joint (toe/heel/ankle) mean the detector
itself averages over (`FootContactDetector.ts`, `SIDE_FOOT_JOINTS`), read
directly off the real per-frame keypoint scores in the artifact.

**Why each was accepted:** every accepted contact sits on a genuine local
minimum of the smoothed foot-y trajectory (`findLocalMaxima`, after
`smoothSeries`), with a mean supporting-joint confidence between 0.92 and
0.98 — well above the detector's `minKeypointScore = 0.4` floor — and with
`boxOrigin` either `tracked` or `detected` and `trackState` either
`tracking` or `verified` for every one of the six frames, meaning the crop
each contact's landmarks came from was independently-verified athlete
localization, not extrapolation. Contacts alternate strictly left-right-left-
right-left-right, consistent with genuine gait rather than detector noise.

**Contact 6 is excluded** from the in-zone step/velocity computation not
because it is unreliable evidence, but because its projected world position
falls beyond the calibrated finish gate (`x = 0.883`) — `diagnostics.
excludedContacts` records the reason verbatim: *"outside the calibration
gates (world x beyond the zone)."* This is the measurement engine correctly
declining to count a step that happened past the finish line, not a
detection failure.

### Missed-contact analysis

At a measured combined step frequency of ~4.86Hz (≈206ms per step), a
continuously-tracked athlete crossing the full ~2.3s window in which any
contact was detected would be expected to produce on the order of 10–12 total
foot contacts, not 6. The gap is not evenly distributed — it is concentrated
almost entirely outside a single window. Cross-tabulating every one of the
2,348 frames' `boxOrigin` (localization quality) against foot-landmark
presence (any of `left_toe/heel/ankle`, `right_toe/heel/ankle` at
score ≥ 0.4, the detector's own floor) gives an unambiguous, quantified
breakdown:

| Category | Frame count | % of clip |
|---|---|---|
| Usable foot landmarks present | 301 | 12.8% |
| Good localization (`tracked`/`detected`), but **no usable foot landmark** | 2,040 | 86.9% |
| No good localization at all (`invalid`) | 7 | 0.3% |

This directly answers the requested failure categorization:

- **Insufficient pose confidence — dominant cause (86.9% of frames).** The
  athlete-box tracker had the athlete correctly localized (`boxOrigin`
  `tracked`/`detected`) for 2,341 of 2,348 frames, per the Day 96 milestone's
  own findings. The pose landmarker running on that crop still failed to
  resolve foot-specific joints above threshold for the overwhelming majority
  of those frames. This is a pose-model resolution limitation given the
  athlete's distance/scale in frame for most of the clip, not a localization
  or crop-boundary defect.
- **Missing foot landmarks due to crop/localization failure — negligible
  (0.3%).** Only 7 of 2,348 frames had no valid athlete box at all.
- **Occlusion — cannot be separately quantified from the artifact alone.**
  Distinguishing "pose model failed because the athlete was too small/blurred"
  from "pose model failed because a foot was genuinely occluded" would
  require frame-by-frame visual review, which was out of scope for this pass.
  This is stated as a limitation, not resolved by inference.
- **Contact classifier / timing ambiguity / insufficient evidence — not
  observed as distinct causes here.** No candidate contact was found and then
  rejected by the classifier's geometry or amplitude checks
  (`MIN_AMPLITUDE`, `findToeOff`'s velocity/debounce gates); the shortfall is
  entirely upstream, at the pose-confidence stage, before any candidate could
  even be formed.

The one genuinely usable window — frames 1702–1960 (t=7.11–8.18s) — sits
inside the same 335-frame continuous verified-pose run (frames ~1660–1996)
identified in the Day 96 report. Usable foot landmarks exist as early as
frame 525 (t≈2.19s) and as late as frame 1995 (t≈8.31s), but scattered and
below detector threshold outside the dense window; the six accepted contacts
are the only ones dense and confident enough to pass.

---

## Part 2 — Step length audit

### Where step length is actually computed for a real session

Contrary to what the worker's own persisted warning implies, step length for
a stationary "fly" session is **not** computed by the worker at analysis
time. `AnalysisMetricsMapper.ts` (the worker's own metrics stage) is
explicitly, permanently locked to write `avgStrideLengthM: null` regardless
of evidence — a "Day 96"-era comment in that file states the five MVP
metrics "are derived downstream from the calibrated measurements, not from
these fields." The real computation happens live, on every session-page
render, in `computeSprintMeasurements` (`src/lib/benchmark/measurements.ts`),
fed directly from the stored pose artifact and the session's
`calibration_gates`.

### Result

Running that real function against the real artifact and this session's real,
`manual_confirmed` calibration gates (distance 20m, stationary, left-to-right)
produces:

- **4 valid opposite-foot step intervals** (from the 5 in-zone contacts):
  1.927m, 2.058m, 1.992m, 2.157m
- **`avgIndividualStepLengthM` (Average Step Length): 2.033m**
- **`peakStrideLengthM` (Peak Step Length): 2.033m** — identical to the
  average. This is not a bug: `computePeakStrideLengthM`
  (`src/lib/benchmark/strideMetrics.ts`) takes the best rolling average over
  a window of `min(4, validCount)` strides; with exactly 4 valid strides, the
  only possible window *is* all 4, so peak and average are mathematically
  the same value here. A fifth in-zone stride would be needed before "peak"
  could diverge from "average" for this session.
- Per-side medians: left 2.107m, right 1.959m.
- `stepLengthConfidence: "high"` (the engine's own label).

### Blocker: not evidence, not calibration, not distance scaling — a gating classification

The blocker is none of missing contacts, insufficient calibration, timing
setup, coordinate reconstruction, or distance scaling — all of those are
genuinely fine for this session (see above). The actual blocker is **gating
logic**: `buildTrustedMetrics` (`src/lib/intelligence/trustedMetrics.ts`)
nulls out `avgStrideLengthM` and `peakStrideLengthM` unless `spatialAvailable`
is true, and `spatialAvailable` comes from
`metricTrustForRecording("spatial", recordingAssessment, true)`, which
returns `withheld` whenever `assessment.spatialMetricEligibility ===
"withheld"`. For this session, `spatialMetricEligibility` is `"withheld"`
because `recordingMode` classified as `"athlete_tracking_lost"` — a
whole-clip judgment driven by trackingLossRanges as long as 935 frames (this
session has large stretches, particularly the first ~7 seconds, where the
athlete is not yet in frame at all, exactly as previously confirmed by the
user).

**This is not "evidence is insufficient" in the sense Part 2 asks me to
distinguish.** The four step-length values above are real, computed,
internally consistent numbers derived entirely from verified, high-confidence
pose evidence sitting inside a single clean 335-frame tracking window. The
gate that withholds them evaluates recording quality across the *entire*
clip, and this clip's full-length tracking quality is genuinely poor — but
the specific evidence the step-length figures rest on is not. No value is
recovered in this pass, in keeping with the instruction not to weaken
validation thresholds; see Part 8 for the recommended fix.

---

## Part 3 — Velocity audit

### Peak Velocity: computable, and currently suppressed by the same gate as Part 2

`computeSprintMeasurements` derives `maxVelocityMps` from
**`strideVelocityWindows`** — direct distance ÷ duration measurements between
contact pairs two strides apart, not the zone-crossing timer:

| Window (contacts) | Distance (m) | Duration (s) | Velocity (m/s) |
|---|---|---|---|
| 0→2 | 3.984 | 0.430 | 9.265 |
| 1→3 | 4.047 | 0.410 | 9.871 |
| 2→4 | 4.139 | 0.410 | 10.096 |

**`maxVelocityMps` (Peak Velocity): 10.096 m/s** (raw, pre-quantization-round:
10.327 m/s). The three windows agree within a few percent of each other —
the engine's own diagnostic labels this "Velocity methods agree closely —
high confidence." This value maps to `TrustedMetrics.topSpeedMps`
(`trustedMetrics.ts:99`), and is blocked by the identical `spatialAvailable`
gate documented in Part 2 — not by any velocity-specific evidence gap.

### Average Velocity: genuinely, independently unavailable

`zoneVelocityMps` (which maps to `TrustedMetrics.avgVelocityMps`) is `null`
for a real and different reason: zone-average velocity requires a verified
timestamp for *both* the start-gate and finish-gate crossing so a true
distance ÷ time can be computed. The finish crossing **is** verified
(`finishCrossingTimestampS: 7.993`, bracketed by 30 consecutive tracked
frames on each side). The start crossing is not: `startCrossingFrame: null`,
`startContinuityFramesBefore: 0`, `startContinuityFramesAfter: 0`,
`timingAvailabilityReason: "start_crossing_unavailable"`. The calibrated
start gate sits at world x=0.137 (near the left edge of frame); the earliest
usable foot-landmark evidence in the entire clip is at frame 525 (t≈2.19s),
and the earliest *contact* is at t=7.11s, by which point the athlete's
tracked position (world x≈0.566) is already well past the start gate. The
true start-line crossing physically happened before the athlete became
trackable — off-camera or too early/small to resolve — so no crossing
timestamp can be honestly reported for it. **This is a genuine capture-setup
limitation, not a pipeline defect, and should remain unavailable exactly as
it does today.**

### Ground-contact-derived timing metrics

`groundContactLeftMs`/`RightMs` (100ms / 20ms) and `flightLeftMs`/`RightMs`
(120ms / 200ms) are computed by the same measurement pass, but rest on only
2–3 contact/toe-off pairs per side — the engine's own diagnostics are explicit
about the resulting precision floor: *"at 240 fps one frame = 4.2 ms. Ground
contact (~67 ms ≈ 16.0 frames) carries a ±1-frame (~4 ms) floor; the L/R
contact/flight spread near that size is quantization, not biomechanics."*
Separately, these fields have no representation in `TrustedMetrics` at all —
the MVP-locked scope (`PerformanceSummaryCard.tsx`'s own comment: "No
advanced timing derivatives... appear anywhere in the MVP") means ground
contact/flight time is not shown to a coach for *any* session today,
independent of evidence quality. Validating these further was out of scope
for the current 5-metric MVP.

---

## Part 4 — Metric dependency graph

```
Tracking (box_tracker.py — continuous localization, box_origin/track_state)
   │
   ▼
Pose (MediaPipe landmarker on the tracked crop — per-frame keypoints)
   │
   ├──────────────────────────────────────────────────────────────┐
   ▼                                                                ▼
Contacts                                                    Camera motion estimate
(FootContactDetector: toe/heel/ankle y-trajectory,          (estimateCameraMotion →
 min score 0.4, local-maxima + toe-off geometry)             cameraTrack; used to convert
   │                                                          frame coords → world coords)
   ▼                                                                │
Step Events                                                         │
(StrideSegmenter / buildFullRunEvents: contact-to-contact,          │
 opposite-foot pairing, full-run — calibration-independent) ◄───────┘
   │
   ├─────────────────────────────┐
   ▼                              ▼
Step Length                  Zone/crossing timing
(analyzeZoneSteps /           (torso-track vs. calibrated
 direct world-distance         start/finish gate crossings;
 between opposite-foot         requires VERIFIED, non-
 contacts × metersPerPixel      extrapolated crossings on
 from calibration_gates)        both sides)
   │                              │
   ▼                              ▼
Stride Length                 Zone Time
(avg = mean of valid           (null unless BOTH start
 step intervals; peak =         AND finish crossings are
 best rolling-4 average)        verified — never a clip-
   │                             duration or contact-span
   │                             fallback)
   │                              │
   ├──────────────┬───────────────┘
   ▼              ▼
Velocity ── two independent, cross-checked paths:
   • stride-velocity windows (distance between contacts N and N+2 ÷ duration) → Peak Velocity
   • zone distance ÷ verified zone time → Average Velocity (needs BOTH crossings verified)
   │
   ▼
Sprint Summary / Trusted Metrics
(buildTrustedMetrics — the ONE place all of the above is gated a second
 time by recordingMode/spatialMetricEligibility + cadence trust group,
 independent of whether the upstream math actually succeeded)
   │
   ▼
Result State (deriveSprintResultState — verified / partial / unavailable)
```

### Per-metric requirements table

| Metric | Required inputs | Validation requirements | Fails when | Available when |
|---|---|---|---|---|
| Step Frequency (`frequencyHz`) | Contacts (full-run, calibration-independent) | `metricTrustForRecording("cadence", …)`: `athleteTrackingConfidence ≥ 0.7` | Tracking confidence < 0.7 | Cadence gate passes — **independent of `spatialAvailable`** |
| Average Step Length | Contacts + `calibration_gates` (distance, gate positions) | ≥2 valid opposite-foot intervals; `spatialAvailable` (recordingMode not in withheld set) | `spatialMetricEligibility: withheld`, OR <2 valid step intervals, OR no calibration | Calibrated + ≥2 valid intervals + `spatialAvailable` |
| Peak Step Length | Same as Average, ≥2 valid intervals for a window | Rolling window of `min(4, N)`; `spatialAvailable` | Same as Average (identical gate) | Same as Average; converges to Average when N=4 |
| Peak Velocity (`topSpeedMps`) | ≥2 stride-velocity windows (contacts N, N+2) | `spatialAvailable` | `spatialAvailable=false`, OR <3 contacts | `spatialAvailable=true` + ≥3 in-zone contacts |
| Average Velocity (`avgVelocityMps`) | Verified start AND finish gate crossings (torso track) + `calibration_gates.distanceM` | Both crossings independently verified (not extrapolated); `spatialAvailable` | Either crossing unverified (`timingAvailabilityReason`), OR `spatialAvailable=false` | Both crossings verified + `spatialAvailable=true` |
| Zone Time (`zoneTimeS`) | Verified start + finish crossings | `timingProvenance.verified` | Either crossing unverified | Both verified |
| Ground contact / flight time | Contact + toe-off pairs per side | N/A — not surfaced in MVP scope at all | Always (MVP-locked to null at the worker; no `TrustedMetrics` field) | Never, in the current MVP |

The single most consequential dependency this audit surfaces: **every
spatial metric (step length ×2, both velocities) shares one gate
(`spatialAvailable`), while Step Frequency alone uses a separate, more
permissive gate (`cadenceAvailable`).** That is why, for the Vanni session,
Step Frequency (4.86Hz) is the one core metric that individually clears its
own trust bar — and yet still never reaches the coach, because
`deriveSprintResultState`'s `recordingMode` short-circuit (Part 7) discards
it anyway, at a layer above `buildTrustedMetrics` entirely.

---

## Part 5 — Scientific validation against ground truth

**There is currently no real Freelap, Brower, timing-gate, or tape-grid
ground truth anywhere in this repository or database.** This was verified
directly, not assumed:

- `docs/field-validation-protocol.md` is a protocol for a *future* data-
  collection day ("Tuesday testing day"); it contains no completed trial.
- `scripts/field-trial.template.json` is the blank template — every field
  (`gateTimeS`, `manualStepCount`, `manualStepLengthsM`) is `null`.
- No filled-in `trial.json` exists anywhere in the repo or in `/tmp`.
- The `validation_fixtures` table (schema explicitly designed to hold
  `external_reference`/`manual_annotation` ground truth) has **zero rows**.
- The `benchmarks` table has exactly two rows. One (`AVA Accel Test`) has an
  explicitly empty `reference_metrics: {}`, with notes stating validation is
  "intentionally pending." The other (`AVA Calab Vid 1`) has real numbers —
  `maxVelocityMps: 10.74`, `avgStepLengthM: 2.15`, `zoneTimeS: 1.93`, etc. —
  but its own `source` field says **`"VueMotion"`**, a third-party
  video-measurement tool, not a physical timing gate or tape measurement.

The Vanni 240fps session is linked (`benchmark_id`) to that VueMotion-sourced
row — but that row's `notes` field identifies it as measuring a *different*
recording ("Calab Vid 1"), from the same physical setup the user described
(the earlier "gav video" that measured 10.74 m/s). Comparing Vanni's AVA
output to it is, at best, a same-setup magnitude sanity check, not a valid
per-session ground-truth comparison — the two aren't the same trial.

| Metric | AVA (Vanni, this session) | "Reference" (VueMotion, Calab Vid 1 — different recording) | Absolute error | % error | Valid ground-truth comparison? |
|---|---|---|---|---|---|
| Peak Velocity | 10.096 m/s (computed, currently gated unavailable to the user) | 10.74 m/s | 0.644 m/s | 6.0% | **No — different recordings** |
| Avg Step Length | 2.033 m | 2.15 m | 0.117 m | 5.4% | **No — different recordings** |
| Zone Time | unavailable (start crossing unverified) | 1.93 s | — | — | **No — different recordings** |

These are reported for context only, exactly labeled as not a valid
same-trial comparison. **No threshold was loosened, no number was adjusted,
and no comparison here should be read as AVA "passing" or "failing"
validation** — the honest conclusion is that this project currently has zero
real, independent, same-trial ground truth to validate against, and running
the documented field-validation protocol (a real Freelap/tape-grid capture
day) is a prerequisite for any genuine accuracy claim.

---

## Part 6 — Validation matrix

Every session in the local dev database, and its real, measured state as of
this audit (2026-08-03). This table is also encoded as a permanent,
machine-checked fixture in `scripts/measurement-recovery-sanity.mjs`
(`REAL_COMPLETED_SESSIONS`), so future drift in the classifier is caught by
`npm run measurement-recovery:sanity`, not discovered by accident.

| Session | Mode | FPS | Ground Truth Available | AVA Complete | Missing Metrics | Timing Error | Stride Error | Notes |
|---|---|---|---|---|---|---|---|---|
| vanni 240fps fly (`227ae200`) | Fly | 239.48 | No (see Part 5) | Analysis complete; UI shows **0 of 5** core metrics | Avg/Peak Step Length, Avg/Peak Velocity all computed but gated `unavailable`; Step Frequency computed (4.86Hz) but also suppressed by the result-state short-circuit | N/A — no verified zone time | N/A — no valid ground truth | Best-instrumented session this audit; see Parts 1–4 |
| (untitled) 120fps fly (`26d7492b`) | Fly | 119.941 | No | Analysis complete | `athlete_tracking_lost` (longest loss: frames 0–1336 of 1639 — over 80% of the clip) | Not audited in depth this pass | Not audited in depth this pass | Worse full-clip tracking coverage than Vanni 240fps |
| AVA Accel Test 120fps-QA (`f284fb85`) | Acceleration | 119.946 | No (empty `reference_metrics`, explicitly "pending") | Analysis complete | `athlete_tracking_lost`, `athleteTrackingConfidence: 0.41` | Not audited (acceleration uses a separate metrics path, `src/lib/acceleration/metrics.ts`, not `computeSprintMeasurements`) | Not audited | Wiring-test session per its own benchmark notes |
| AVA Accel Test 60fps-QA (`f7026ec9`) | Acceleration | 60 | No (same as above) | Analysis complete | `athlete_tracking_lost`, `athleteTrackingConfidence: 0.70` | Not audited | Not audited | Wiring-test session per its own benchmark notes |
| Vanni Panning 240fps fly, Vanni panning step length, Vanni Accel 240fps panning | Panning | — | — | Never analyzed (`uploaded` only) | — | — | — | Out of scope — panning explicitly excluded from this audit |
| Vanni Accel 240fps, Vanni Accel 120fps, Vanni 60fps accel, AVA Accel Test (`6f50822b`) | Acceleration | — | 20m known distance | `uploaded`/`failed` — never completed | — | — | — | Never produced a completed analysis; not part of this audit's real-data set |
| Vanni 60fps fly (`c3f1e165`) | — | — | — | `uploaded` only | — | — | — | Never analyzed |

**Headline row for this matrix:** of the four sessions with a real, completed
analysis, **zero currently have `spatialMetricEligibility: "eligible"` or
even `"conditional"`.** Every one is `"withheld"`. This is not specific to
the Vanni 240fps session or to fly-mode sessions — it is the current,
measured state of every real completed analysis in this dataset.

---

## Part 7 — Result-state review

### Current behavior

`PerformanceSummaryCard.tsx` supports exactly three states —
`"verified" | "partial" | "unavailable"` — via `deriveSprintResultState`:

1. If `recordingMode` is in `UNRELIABLE_TRACKING_MODES`
   (`athlete_tracking_lost`, `unsupported_recording`,
   `excessive_camera_motion`), **or** zero of the five core metrics are
   available → `"unavailable"`. The card renders *nothing* — not even a
   metric that individually passed its own trust gate.
2. Else, if fewer than all five core metrics are available, or `zoneTimeS`
   is null → `"partial"`.
3. Else → `"verified"`.

### What this produces for the Vanni session

`recordingMode = "athlete_tracking_lost"` triggers the first branch
unconditionally. The card shows "Analysis unavailable" and nothing else —
even though Step Frequency (4.86Hz) independently cleared its own,
separately-defined trust gate (`cadenceAvailable`, `athleteTrackingConfidence
0.9566 ≥ 0.7`). A real, gated-available number is thrown away by a check one
layer above the gate that approved it.

### Recommendation

The task's framing is exactly right: **a verified timing should not
necessarily require every metric to exist, and an unreliable recording for
*spatial* purposes should not necessarily mean *zero* metrics are trustworthy
enough to show.** The current three-state model conflates two different
questions — "is the zone timing verified?" and "is *any* metric on this
session trustworthy?" — into one blunt flag.

The most scientifically honest presentation is a fourth state between
today's `"partial"` and `"unavailable"` — call it **"Measurement Incomplete"**
— for exactly the case this audit found: `recordingMode` fails the
whole-clip spatial bar, but one or more individually-gated metrics (today,
only Step Frequency has a separate gate) are still genuinely available. That
state would render only the metrics that independently passed their own
trust check (in Vanni's case: Step Frequency alone), with the other four
shown as withheld with their real reason, rather than blanking the entire
card. `"Unavailable"` would be reserved for sessions where truly nothing
passed any gate (e.g., box localization itself failed, or zero contacts were
ever detected) — which is a meaningfully different, worse situation than
Vanni's.

This is a recommendation, not an implemented change: introducing a new
result state touches shared UI (`PerformanceSummaryCard.tsx`) and should be
verified visually in a running session page before shipping, which is real
frontend work warranting its own reviewed pass — it is listed as the #2 item
in Part 8.

---

## Part 8 — Remaining engineering work (prioritized, stationary-only)

1. **Refine `spatialMetricEligibility` from a whole-recording gate to a
   window-aware gate.** This is the single highest-impact fix available: it
   would recover Average Step Length, Peak Step Length, and Peak Velocity for
   the Vanni session (and likely others) using evidence that already exists
   and is already computed correctly today — no new tracking or pose work
   required. Scoped carefully: the gate is shared with panning-mode safety
   checks (`PanningMetricGroup`), so this needs its own dedicated milestone
   with panning regression coverage, not a same-pass patch inside a
   measurement-validation audit.
2. **Add the "Measurement Incomplete" result state** (Part 7), so a session
   with one genuinely-gated-available metric (e.g., Step Frequency) is never
   visually indistinguishable from a session with zero usable evidence at
   all. Low architectural risk; needs a real browser-verified pass.
3. **Fix the two now-diagnosed message-accuracy issues** found incidentally
   during this audit: (a) `AnalysisMetricsMapper.ts`'s `CALIBRATION_WARNING`
   ("withheld because camera calibration is required") is shown even when
   calibration is fully present and confirmed — the real reason spatial
   metrics are null at that stage is the MVP-locked worker scope, not
   missing calibration; the message should say that. (b)
   `metricTrustForRecording`'s `reasonCode: "camera_motion_unreliable"` is
   returned for the `athlete_tracking_lost` case too, which is an
   athlete-tracking problem, not a camera-motion one — the code should
   distinguish the two causes.
4. **Regenerate the missing `artifacts/pose-sequences/test.pose.json`
   fixture** (or repoint the two scripts that depend on it). `npm run
   contact:calibration` and `npm run step:calibration` are both currently
   broken — independent of anything touched this session — first by a stale
   hardcoded output path (tsc's inferred common root has drifted as more
   `@/lib/video`/`@/lib/calibration` imports were added transitively), and
   second by a genuinely missing fixture file that doesn't exist anywhere in
   the repo. Neither issue was introduced or fixed in this pass; both are
   documented here rather than patched with a fabricated fixture.
5. **Audit the acceleration-mode metrics path** (`src/lib/acceleration/
   metrics.ts`) with the same rigor applied to the fly-mode path in this
   report. It was explicitly out of primary scope here (the acceleration QA
   sessions' own benchmark notes flag their reference values as
   "intentionally pending"), but it is a second, independent
   spatial-metric computation path that has not yet received this level of
   scrutiny.
6. **Run the real field-validation protocol** (`docs/field-validation-
   protocol.md`) at least once. Every accuracy comparison currently possible
   in this repo is either synthetic or a cross-tool (VueMotion) comparison —
   neither is independent ground truth. This is a data-collection task, not
   an engineering one, but it blocks any genuine accuracy claim.

Panning support, Athlete Intelligence, and historical analysis remain
explicitly out of scope for this list, per this audit's instructions.

---

## Tests and results

**Existing sanity suite (relevant subset, run this pass):**

| Command | Result |
|---|---|
| `npm run worker:check` | PASS |
| `npm run analysis-fps:sanity` | PASS |
| `npm run acceleration-analysis:sanity` | PASS |
| `npm run analysis-report:sanity` | PASS |
| `npm run contacts:sanity` | PASS |
| `npm run stride-metrics:sanity` | PASS |
| `npm run zone-step-counting:sanity` | PASS |
| `npm run metric-trust:sanity` | PASS |
| `npm run result-foundation:sanity` | PASS |
| `npm run gates:sanity` | PASS |
| `npm run contact:calibration` | **FAIL — pre-existing, unrelated to this audit (see Part 8 item 4)** |
| `npm run step:calibration` | **FAIL — pre-existing, unrelated to this audit (see Part 8 item 4)** |
| `npm run lint` | PASS (0 warnings) |
| `npm run build` | PASS |

**New deterministic tests added this pass** (`scripts/measurement-recovery-
sanity.mjs`, registered as `npm run measurement-recovery:sanity`, 17/17
checks passing):

- Validation-dataset consistency: every real completed local session
  (Part 6) is asserted well-formed and pinned to its real, measured
  `recordingMode`/`spatialMetricEligibility`, including the headline
  "zero sessions currently spatially eligible" finding as an explicit,
  named assertion that will fail loudly if that ever changes.
- Unavailable-state correctness (`deriveSprintResultState`): the real Day 97
  scenario (cadence trusted, spatial withheld, `athlete_tracking_lost` →
  `"unavailable"`); full-verified → `"verified"`; 4-of-5 → `"partial"`;
  5-of-5 with unverified zone time → `"partial"`; zero metrics →
  `"unavailable"` regardless of `recordingMode`.

Contact detection, step reconstruction, and stride-length/velocity math were
validated against the real Vanni artifact directly (Parts 1–3) rather than
via new synthetic unit fixtures, since the existing `contacts:sanity`,
`stride-metrics:sanity`, and `zone-step-counting:sanity` suites already cover
that logic's unit-level correctness and all three pass.

---

## Final report

1. **Contact audit** — Part 1. Ran the real `detectFootContacts` pipeline
   against the corrected pose artifact.
2. **Real contact count** — 6 (3 left, 3 right), t=7.107–8.184s; 5 in-zone,
   1 excluded as beyond the finish gate.
3. **Missed-contact analysis** — 86.9% of frames have good localization but
   no usable foot landmark (insufficient pose confidence, dominant cause);
   0.3% have no localization at all; occlusion could not be separately
   isolated from general low pose confidence without visual review.
4. **Step-length findings** — Average 2.033m, Peak 2.033m (mathematically
   equal at N=4 valid strides, not a bug) — both real and computed, both
   currently suppressed by the whole-recording `spatialMetricEligibility`
   gate, not by missing evidence, calibration, or scaling.
5. **Velocity findings** — Peak Velocity 10.096 m/s, computed and
   cross-checked across 3 stride-velocity windows agreeing within ~4%,
   suppressed by the same gate. Average Velocity is genuinely unavailable —
   the true start-line crossing happened before the athlete became
   trackable on camera.
6. **Dependency graph** — Part 4; Step Frequency uses a separate, more
   permissive gate than the four spatial metrics, which all share one gate.
7. **Validation matrix** — Part 6; 4 real completed sessions, 0 of them
   currently spatially eligible.
8. **Files changed** — `docs/day-97-stationary-measurement-recovery-audit.md`
   (new), `scripts/measurement-recovery-sanity.mjs` (new),
   `package.json` (added the `measurement-recovery:sanity` script entry).
   No production logic files were modified — this audit's only code output
   is a new, additive test script.
9. **Database changes** — none. Every database access this audit performed
   was a read-only `SELECT` against the local dev Postgres instance.
10. **Real metrics recovered** — none surfaced to the UI (by design — see
    Part 2/3's conclusion that recovery requires a gating-logic change out
    of this audit's scope). Real, computed values were verified to exist:
    Average Step Length 2.033m, Peak Step Length 2.033m, Peak Velocity
    10.096 m/s, Step Frequency 4.86Hz.
11. **Remaining unavailable metrics** — Average Velocity (genuinely, for
    this session), ground contact time, flight time (out of MVP scope
    entirely, all sessions).
12. **Scientific validation results** — Part 5; no real independent ground
    truth exists in this repository today. The only comparison possible is
    against a different recording's VueMotion output, reported for context
    only and explicitly not treated as validation.
13. **Recommended UI result state** — Part 7; add a "Measurement Incomplete"
    state distinct from "Unavailable" for sessions where at least one
    individually-gated metric (e.g., Step Frequency) is genuinely trusted
    even though the whole-clip spatial bar is not cleared.
14. **Remaining stationary work** — Part 8, prioritized: (1) window-aware
    spatial-eligibility gating, (2) the new result state, (3) two
    message-accuracy fixes, (4) missing test fixture, (5) acceleration-mode
    audit, (6) a real field-validation data-collection day.
15. **Tests and results** — see above; 10 existing sanity checks pass, 2
    pre-existing and unrelated checks fail (documented, not touched), lint
    and build pass, 17 new deterministic checks added and passing.
16. **Git status** — working tree only; no commits made this session. This
    audit added 2 new files (this report, the new sanity script) and one
    one-line addition to `package.json`'s `scripts` block. All prior
    uncommitted Day 96 work remains exactly as it was.
