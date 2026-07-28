# AVA conservative timing policy

Policy version: `CONSERVATIVE_TIMING_POLICY_V1`

This policy is governed by the canonical [AVA Accuracy Manifesto](./accuracy-manifesto.md),
especially its raw-measurement, conservative-reporting, and mathematical-consistency rules.

## Audit findings

AVA has three timing families: interpolated calibrated fly gates/stride windows,
interpolated acceleration crossings/splits, and pose-derived contact/flight/stride
durations. Before this pass, all retained analytical precision internally, but aggregate
pose timing was rounded inside `SprintAnalyzer`, calibrated velocity divided by raw zone
time while the UI displayed a separately rounded time, and peak fly speed selected the
largest raw stride velocity. Acceleration likewise divided distance by raw splits. Scoring,
recommendations, PB prediction, benchmarking, progress, and history then consumed those
velocity fields, so the inconsistency propagated without performing their own rounding.

Formatting was distributed across panels with `toFixed`. Those formatters are safe only
when they receive an official reported value; they must never become calculation inputs.
Legacy completed analyses had no timing-policy identity or raw/reported snapshots.

## Production contract

- **Raw value:** exact interpolation or aggregate from the biomechanics engine. It is never
  rounded or replaced.
- **Reported value:** official customer-facing time, calculated with
  `ceil((rawSeconds - 1e-12) * 100) / 100`. The epsilon removes binary floating-point noise
  at an exact hundredth without hiding real measured time.
- **Display value:** string formatting of the reported number only. It is never reused in
  calculations.

AVA deliberately reports a time very slightly slower when a measurement lies between two
hundredths. This prevents AVA from claiming performance the recording did not conclusively
establish and protects athlete trust.

Official distance/time velocity is always `rawDistance / reportedTime`. Every stride window
retains raw duration and velocity, derives reported duration and velocity, and top speed is
the maximum **reported** stride velocity. It is withheld if a valid stride window is absent;
AVA does not substitute an averaged length×frequency estimate. Distances, stride lengths,
frequency, angles, percentages, confidence, and scores retain their existing policies.

## Persistence and compatibility

Migration `0020_conservative_timing_policy.sql` adds `timing_policy_version`,
`raw_timing_metrics`, and `reported_timing_metrics` to analyses. New worker results carry
the version in provenance and metrics. Existing completed rows are labeled
`legacy_unversioned` without rewriting their stored measurements. This makes history
reproducible and prevents old and new reporting policies from appearing equivalent.

The calibrated fly measurement object and acceleration result both expose explicit raw and
reported timing/speed fields. Existing compatibility fields now contain reported values, so
benchmarking, trusted metrics, scoring, recommendations, prediction, and UI all consume the
same conservative result automatically.

## Validation result

The current validated-session pose artifact produces a raw 20 m zone time of
`1.920779 s`, an official reported time of `1.93 s`, raw average velocity of
`10.412440 m/s`, and official average velocity of `10.362694 m/s` (`20 / 1.93`, displayed
as `10.36`). Its fastest valid stride window has a raw and reported duration of `0.40 s`,
so raw and official top velocity are both `10.704308 m/s` (displayed as `10.70`). Average
stride length remains `2.16 m`, peak rolling stride length remains `2.18 m`, and frequency
remains `4.85 Hz`.

The supplied `10.74` top-velocity expectation is not produced by the current artifact. An
older repository artifact produces `10.78`; neither produces `10.74` under the stated
distance/reported-duration rule. The implementation does not tune or hardcode this result.
This difference belongs to the pose/contact/calibration inputs, not to time formatting.

Focused timing, acceleration, stride, full-run, result-foundation, typecheck, lint, build,
and worker compilation checks pass. Lint/build retain the pre-existing `VideoOverlay`
exhaustive-dependencies warning and the documented `next lint` deprecation.
