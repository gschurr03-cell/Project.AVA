# AVA Analysis Confidence & Evidence Engine

## Root architecture

The engine is a pure, deterministic layer between measurement evidence and presentation:

`pose/video/calibration evidence → confidence adapter → metric profile → confidence contract → UI/intelligence`

It does not alter metric values. It explains how reliable each value is from observable inputs and never uses an LLM, machine learning, randomness, wall-clock time, or hidden state.

## Metric audit

| Metric family | Primary computation | Dependencies and intermediate values | Existing quality evidence |
|---|---|---|---|
| Peak/average/zone velocity | `src/lib/benchmark/measurements.ts`; acceleration variants in `src/lib/acceleration/metrics.ts` | calibrated distance, gate crossing timestamps, per-stride windows, velocity-method agreement | calibration confidence, camera compensation, tracking coverage, excluded contacts, velocity spread, FPS |
| Contact and flight time | `src/lib/biomechanics/analysis/SprintAnalyzer.ts`, `src/lib/video/contacts.ts`, conservative policy in `src/lib/measurement/timingPolicy.ts` | contact/toe-off events, frame timestamps, per-foot intervals, frame quantization | event counts, pose scores, timing diagnostics, active FPS |
| Stride/step length | `src/lib/benchmark/measurements.ts`, peak aggregation in `src/lib/benchmark/strideMetrics.ts` | calibrated contact positions, consecutive contacts, best-four window, zone distance/step count | step-length confidence, calibration, included/excluded contacts, camera compensation |
| Cadence/step frequency | `src/lib/video/cadence.ts`, aggregated in `src/lib/benchmark/measurements.ts`; worker aggregate in `SprintAnalyzer.ts` | verified contact count and elapsed time, per-side contacts | contact count, tracking continuity, FPS, event trust |
| Asymmetry | `src/lib/intelligence/asymmetry.ts` and biomechanics aggregate `SprintMetrics.ts` | left/right step length, frequency, or step-time differences | side sample counts, timing reliability, missing/occluded poses |
| Acceleration | `src/lib/acceleration/metrics.ts` | detected start, gate crossings, splits, segment velocities, early velocity delta/time | start-event confidence/reason, calibration, warnings, timing policy |
| Timing gates | `src/lib/calibration/gates.ts`, `src/lib/calibration/zoneAnchors.ts`, `src/lib/benchmark/measurements.ts` | confirmed boundaries, known distance, torso crossings, raw/reported time | calibration source/confidence, extrapolation notes, FPS |
| Pose angles | `src/lib/biomechanics/angles.ts`, aggregation in `SprintAnalyzer.ts` | visible joint triplets and per-frame angles | keypoint visibility, analyzed frames, missing frames |
| Sprint Intelligence | `src/lib/intelligence/index.ts`; recommendations in `src/lib/intelligence/recommendations.ts` | measured metrics, calibration, phases, predictions, longitudinal focus | existing qualitative confidence, data gaps, timing gate; now bounded by measurement confidence |

Persisted worker metrics are mapped by `src/lib/biomechanics/worker/AnalysisMetricsMapper.ts`, validated in `src/lib/biomechanics/types.ts`, and written by `src/app/api/analyses/[id]/result/route.ts`. The calibrated session UI derives additional trusted measurements from overlay frames in `src/app/sessions/[id]/page.tsx`.

## Confidence contract

Every supported metric can be wrapped as:

```ts
{
  value,
  confidence: {
    score, level, confidenceReason, qualityFlags, measurementVersion, factors
  },
  confidenceReason,
  qualityFlags,
  measurementVersion
}
```

`score` is an integer from 0 to 100. `factors` contains the observed input, normalized quality, fixed weight, contribution, and plain-language reason. Unknown evidence uses a documented neutral value of 0.60; it never receives a perfect score.

## Algorithm

Each metric has a fixed profile in `src/lib/confidence/engine.ts`. A profile names only relevant evidence and weights totaling 100. Negative observations—missing pose, interpolation, and occlusion—are inverted into positive quality. All observations are clamped to `[0,1]`.

`score = round(sum(normalized factor × fixed weight) / sum(weights) × 100)`

Levels are high at 85+, medium at 65–84, and low below 65. Quality flags use named thresholds and contain cause, affected metrics, and recording improvement. Identical input is stable because factor order, tie-breaking, arithmetic, and messages are fixed.

## Developer guide and extension points

Add a metric identifier and fixed profile to `PROFILES`, then expose it with `withConfidence`. Add new observable evidence to `ConfidenceEvidence`; do not add composite or subjective scores when the underlying observation is available, because that double-counts evidence. Version material algorithm/profile changes by introducing a new measurement version rather than silently changing historical meaning.

Persistence is an extension point: the contract is currently derived at read time so existing result payloads and database schemas remain compatible. A later migration can store the exact confidence object beside each metric. Event-level confidence and per-frame interpolation provenance can replace neutral fallbacks as those producers expose them.

## Intelligence policy

Sprint Intelligence accepts the deterministic measurement-confidence score. Below 65%, its overall and limiter confidence is capped at low, the coach-facing conclusion is explicitly cautious, and recommendations ask for confirmation in a stronger recording before training changes.

## Performance

The engine is linear in the number of factors and metrics: currently at most 14 metrics × 6 factors. It performs no I/O, frame iteration, network request, model inference, or client polling. Runtime and allocation impact are negligible compared with pose analysis and overlay loading.

