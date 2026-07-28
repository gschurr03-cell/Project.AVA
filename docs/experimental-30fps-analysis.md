# Experimental 30 FPS performance analysis

Status: experimental foundation implemented; scientific validation incomplete  
Date: 2026-07-16  
Governing standard: [AVA Accuracy Manifesto](./accuracy-manifesto.md)

## Product boundary

AVA's validated `ava-sprint-60-v1` path remains unchanged. Genuine 30 FPS-class sources may
enter a separately versioned experimental profile. Experimental confidence describes the
strength of evidence within that profile; it never means scientifically validated or
compatible with 60 FPS history.

## Audit before implementation

| Area | Current implementation | Reuse / branch decision | Debt or required safeguard |
| --- | --- | --- | --- |
| Source probing | Python worker probes average, nominal, real, timestamp rate and VFR before pose. | Reuse; extend central classification with a 30 FPS tier. | Python and TypeScript mirror one JSON policy but classifier logic is duplicated. Persist reason and policy version. |
| Worker gate | MediaPipe fails before pose below the 60 FPS class. Worker assumes analysis FPS 60 and pipeline `ava-sprint-60-v1`. | Branch by source tier before analysis; keep validated branch byte-for-byte equivalent. | Experimental jobs need explicit pipeline/profile provenance and cannot complete through the validated result assumptions. |
| Frame sampling | Nominal-60 preserves real frames/timestamps; high speed samples nearest source frames onto 60 Hz. | For 30 FPS preserve every real frame and source timestamp. | Never synthesize, duplicate, or relabel 30 FPS frames as 60. |
| Pose/camera/crop | MediaPipe, source-coordinate remapping, background affine evidence, and ROI tracking are not inherently 60 FPS-only. Crop gap windows use seconds converted to frames. | Reuse coordinate and pose architecture; retain a distinct analysis FPS. | Real panning evidence is still required; multi-person re-identification is absent. |
| Worker contact events | `FootContactDetector` uses real `tMs` for spacing, debounce, toe-off windows, and ordering, but smoothing is frame-count based (default 3). | Shared primitives are safe; use a versioned 30 FPS profile and do not publish contact/flight duration. | The heuristic is not scientifically validated at 30 FPS and can miss touchdown/toe-off between frames. |
| Overlay contacts | Step peaks use timestamp spacing and contact phases interpolate threshold crossings between observed samples. Smoothing/minima windows contain frame-count assumptions. | Reuse only for experimental evidence and validate separately. | Sub-frame interpolation must expose brackets and uncertainty; contact/flight remain excluded. |
| Stride segmentation | Uses event timestamps and millisecond plausibility windows. | Reuse complete contact-to-contact segments under an experimental model version. | Incomplete events must remain null; terminology must distinguish step and stride frequency. |
| Zone timing | Existing measurement engine uses torso crossings, real frame times, linear bracketing interpolation, camera compensation, calibration gates, and conservative reporting. It also permits boundary extrapolation/fallbacks. | Reuse crossing/reporting concepts, but experimental timing must forbid boundary extrapolation and contact-span fallback. | Requires explicit calibrated boundaries, tracked torso brackets, safe panning evidence, uncertainty, and one body reference. |
| Stride length | Existing engine measures opposite-foot contact gaps in calibrated compensated coordinates. | Reuse only complete calibrated gaps; label experimental. | Withhold without calibration, unsafe panning compensation, or complete events. Do not infer full strides from partial zone segments. |
| Frequency | Existing frequency is computed from raw contact timestamps. Some code calls combined step frequency `strideFrequencyHz`. | Experimental contract stores explicit `step_frequency_hz`; stride frequency requires same-side intervals. | Never derive from rounded elapsed time; preserve event count/interval and terminology. |
| Timing policy | `CONSERVATIVE_TIMING_POLICY_V1` preserves raw time and ceilings official display time; reported velocity divides by reported time. | Reuse unchanged. | Frequency uses raw event intervals and normal rounding, not ceiled time. |
| Metric trust | Existing UI trust gates mainly distinguish 60 versus 120 FPS and do not know source-tier compatibility. | Add an experimental compatibility group outside validated trust. | Experimental metrics cannot silently become validated recommendations, benchmark rows, goal gaps, or predictions. |
| Result contract | Provenance currently accepts only validated/high-speed sources and literal analysis FPS 60. Metric envelopes lack experiment status/uncertainty. | Extend additively with typed profile fields; preserve existing validated payloads. | Immutable report must include experimental/version/compatibility and null unavailable metrics. |
| History | Athlete history is incomplete and trends derive from heterogeneous JSON/current code. | Persist compatibility group and default to same-group comparison only. | Do not merge experimental and validated trend lines. |
| Predictions/recommendations | PB forecast is mostly scaffolded, but prediction and intelligence can consume stride/frequency values. | Explicitly block experimental profile by default. | No PB prediction, goal-gap, or validated limiter/recommendation from experimental values. |
| UI | Session page and analysis method panel show validated 60 FPS language. | Add one prominent `Experimental` classification and profile explanation. | Avoid repeated alarm language and never call high-confidence experimental output validated. |

## Internal implementation plan

1. Add a versioned centralized tier policy covering nominal/VFR 30, validated 60, high speed,
   and unsupported sources, with classification reasons.
2. Add an isolated `ava-sprint-30-experimental-v1` profile and result contract containing
   raw timestamps, explicit event evidence, uncertainty, availability, compatibility, and
   downstream exclusions.
3. Route only genuine 30 FPS-class sources through the profile. Preserve every source frame
   and timestamp; keep the 60 FPS path unchanged.
4. Compute experimental frequency from complete raw contact intervals. Compute timing and
   length only with explicit compatible calibration/boundary inputs and safe camera/tracking
   evidence; otherwise persist null with reason codes.
5. Persist profile/version/compatibility additively, display one Experimental banner, and
   block validated comparisons, predictions, and recommendations.
6. Prove behavior with deterministic synthetic profile tests, the real native-30 panning
   source, and a post-change static nominal-60 production regression.

## Initial validation status

The protected panning source is native CFR 30: 197 frames, timestamp cadence
33.333–33.334 ms, and no duplicate/drop/VFR evidence. Its external 2.77-second value remains
incomplete and cannot define a timing zone. It is eligible to exercise the experimental
tracking/camera/frequency path, but timing and absolute stride length must remain null until
compatible boundaries and calibration are supplied.

## Implemented foundation and real-fixture outcome

Implemented versions are `ava-source-fps-tier-v2`, `ava-sprint-30-experimental-v1`,
`ava-events-30-experimental-v1`, `ava-strides-30-experimental-v1`,
`ava-timing-30-experimental-v1`, `ava-trust-30-experimental-v1`,
`ava-uncertainty-30-experimental-v1`, and compatibility group `experimental-30-v1`.

The profile accepts corroborated 29–30.5 FPS-class sources, preserves every real frame and
timestamp, and never invokes the 60 Hz sampler. Nominal-60/high-speed behavior remains on the
validated branch. True 24 and 50 FPS sources remain unsupported.

Events retain side, source-frame index, timestamp, bracketing observations, interpolation,
confidence, uncertainty, and version. Frequency uses raw contact intervals. Zone time
requires calibrated crossings and safe camera evidence; stride length requires complete
calibrated strides. Contact/flight, acceleration curves, modeled top speed, PB prediction,
goal gaps, validated recommendations, and cross-tier comparisons remain blocked.

Real analysis `426397f9-6933-47e6-988e-ef30c85709fb` completed on attempt one with 197 real
timestamps and zero synthetic frames. It classified `smooth_pan` with camera confidence
`0.751151755038689`, tracking confidence `0.7656240362011145`, no meaningful zoom, and
conditional spatial eligibility. Timing/velocity and stride length are null without a
calibrated zone. Step/stride frequency is null because event confidence was below the
experimental minimum. Contact/flight is null by policy. Body-relative geometry remains
experimental evidence.

Synthetic deterministic coverage proves timing, calibrated stride length, conservative
velocity, and raw-event frequency behavior when required evidence exists. This does not
scientifically validate those models.

The final nominal-60 static control completed as `static_precision` in 24.32 seconds with
unchanged camera confidence `0.988414818506334`, tracking confidence
`0.802061411268521`, no meaningful zoom, and spatial eligibility `eligible`.

## Validation path

Promotion requires paired/native fixtures that establish numerical targets for zone-time,
stride-length, and frequency error plus crossing, event, and panning repeatability. Those
targets are not invented here. The next priority is a native-30 recording with independently
defined calibrated gates and hand-reviewed events, ideally paired with the same run at 60 FPS
or an independent timing system.

Foundation completion is assessed at **60%**: the isolated path, persistence, UI status,
compatibility barriers, deterministic timing/length/frequency contracts, and real worker run
exist; external accuracy validation does not. Panning-system completion is **75%** and overall
MVP completion is **76%**. These percentages do not declare the experimental model validated.
