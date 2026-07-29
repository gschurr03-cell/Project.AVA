# Analysis result foundation

This result contract implements the canonical [AVA Accuracy Manifesto](./accuracy-manifesto.md).
Schema and persistence changes must preserve its non-fabrication, provenance,
explainability, confidence, and reproducibility requirements.

Experimental 30 FPS analyses use compatibility group `experimental-30-v1`, persist an
immutable `experimental_result`, and carry experiment/model versions, validation status,
uncertainty, and source-tier provenance. Validated reports remain in `validated-60-v1`.
Default history, benchmark, prediction, goal-gap, and recommendation paths must require exact
compatibility or explicitly opt into experimental evidence.

## Version strategy

New production results use three independent identities:

- pipeline: `ava-sprint-60-v1`
- metric schema: `ava-metrics-v1`
- explainability schema: `ava-explainability-v1`

The source pose model/version and analysis FPS are also compatibility keys. Direct
history comparison requires exact agreement on all four dimensions. Records missing
these fields are labeled legacy and compare only with other legacy records.

## Persistence

Migration `0017_analysis_result_foundation.sql` adds nullable, additive columns to
`analyses`: `provenance`, `input_snapshot`, `result_payload`, source/analysis FPS, and
the three schema/pipeline identities. RLS and the existing ownership chain are unchanged.

Migration `0021_panning_analysis_foundation.sql` adds independent recording-mode,
background-transform, crop/tracking, zoom, unsafe-range, and spatial-eligibility provenance.
The pose artifact retains source-coordinate landmarks plus reversible per-frame crop evidence.
Camera compensation is explicitly distinct from ground calibration.

## Camera-dependent availability

`ava-recording-mode-v1` classifies measured camera evidence rather than trusting recording
intent. The analytical trust policy keeps image-relative geometry when athlete tracking is
reliable, requires reliable foot events for cadence/timing, and withholds absolute spatial
metrics for zoom, unstable motion, tracking loss, or unvalidated panning ground calibration.
These decisions are represented by null/status/reason code in the result contract; the UI
does not own a separate trust formula.

The input snapshot is captured when a job is queued. The callback must return that exact
validated snapshot; it cannot replace it with current athlete/session values. It contains
only reproducibility inputs: athlete attributes/PBs/goals, analysis mode, distance,
benchmark, timing zone, calibration inputs, and requested production options.

## Metric availability

Persisted fly metrics are nullable. A measured `0` is a value; unavailable data is `null`.
The canonical measurement envelope additionally records `available`, `unavailable`,
`withheld`, `unsupported`, or `failed`, plus confidence, reason code, warning, source,
unit, and version. Non-available envelopes may not contain a value and must contain a
reason code. A legacy adapter converts null to the old UI sentinel only in memory; it
must never be written back.

## Explainability contract

`resultContract.ts` validates the complete structural chain: measurements, limitations,
visual patterns, movement-cause hypotheses, muscle associations, interventions, and
retest plans. This pass intentionally emits measurements with empty downstream arrays;
it does not invent recommendations before the intelligence mappings are validated.
Every populated reference must resolve inside the result.

Muscle associations require a non-empty diagnostic disclaimer and confirmation tests
are represented explicitly. Associations describe possible relationships only; they
must never assert weakness, injury, or diagnosis from video.

## Confidence propagation

Confidence uses a deterministic weakest-link rule: downstream confidence is the minimum
of every required input. If any required confidence is absent, downstream confidence is
insufficient (`null`). Labels are high (≥0.80), moderate (≥0.60), low (<0.60), or
insufficient. This makes it impossible for a low-confidence measurement to produce a
higher-confidence limitation or recommendation.

## Production callback guarantees

The callback rejects production completion when provenance is absent, the pose metric
source is not MediaPipe, analysis FPS is not 60, result IDs do not match the target row,
or the queue-time snapshot changed. The original uploaded video remains unchanged.
The local mock worker retains a development-only legacy callback path and can never use
that path in production.
