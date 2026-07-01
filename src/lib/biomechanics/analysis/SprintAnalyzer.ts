import type { PoseSequence } from "../pose";
import { detectFootContacts } from "../events";
import { segmentSteps, segmentStrides } from "../strides";
import { calculateFrameAngles } from "../angles";

import type {
  RealSprintMetrics,
  SprintAnalysisOptions,
  SprintAnalysisResult,
} from "./SprintMetrics";

const MIN_ANALYZED_FRAMES = 30;

/**
 * Default physiological bounds (ms) on a step's duration when aggregating
 * cadence & flight. 150 ms ≈ a 6.7 Hz step cap (nothing human sustains faster —
 * shorter values are near-simultaneous double-detections); 320 ms ≈ a 3.1 Hz
 * floor (slower is the standing/acceleration phase, not steady sprinting). See
 * `SprintAnalysisOptions.minPlausibleStepMs`.
 */
const DEFAULT_MIN_PLAUSIBLE_STEP_MS = 150;
const DEFAULT_MAX_PLAUSIBLE_STEP_MS = 320;

/** Aggregate metric keys that may be omitted when their inputs are missing. */
type OptionalMetricKey =
  | "avgStepTimeMs"
  | "avgStrideTimeMs"
  | "avgGroundContactMs"
  | "avgFlightTimeMs"
  | "strideFrequencyHz"
  | "stepFrequencyHz"
  | "peakLeftKneeFlexionDeg"
  | "peakRightKneeFlexionDeg"
  | "avgTrunkLeanDeg"
  | "leftRightStepTimeAsymmetryPct";

/** Keep only real numbers from a list of possibly-missing values. */
export function compact(values: (number | undefined | null)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function mean(values: number[]): number | undefined {
  return values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : undefined;
}

export function minDefined(values: (number | undefined | null)[]): number | undefined {
  const defined = compact(values);
  return defined.length ? Math.min(...defined) : undefined;
}

export function asymmetryPct(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null || b == null) return undefined;
  const m = (a + b) / 2;
  return m === 0 ? undefined : (Math.abs(a - b) / m) * 100;
}

const round = (n: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
};

/**
 * Run the full pose → gait → metrics pipeline over a sequence. Never throws:
 * missing or sparse data produces partial metrics accompanied by warnings.
 */
export function analyzeSprint(
  sequence: PoseSequence,
  options: SprintAnalysisOptions = {},
): SprintAnalysisResult {
  const minKeypointScore = options.minKeypointScore ?? 0.4;
  const requireAlternatingSides = options.requireAlternatingSides ?? false;
  const includeRawArrays = options.includeRawArrays ?? true;
  const minPlausibleStepMs = options.minPlausibleStepMs ?? DEFAULT_MIN_PLAUSIBLE_STEP_MS;
  const maxPlausibleStepMs = options.maxPlausibleStepMs ?? DEFAULT_MAX_PLAUSIBLE_STEP_MS;

  // --- run the component modules ---
  const events = detectFootContacts(sequence, { minKeypointScore });
  const steps = segmentSteps(events, { requireAlternatingSides });
  const strides = segmentStrides(events, { requireAlternatingSides });
  const angles = calculateFrameAngles(sequence, { minKeypointScore });

  // --- aggregate metrics ---
  const completeSteps = steps.filter((s) => s.durationMs != null);

  // Cadence & flight are inter-foot measures corrupted by double-detections and
  // the standing/acceleration phase; restrict them to physiologically plausible
  // steps. Ground contact is a robust per-foot measure — leave it over all steps.
  const isPlausibleStep = (s: (typeof steps)[number]): boolean =>
    s.durationMs != null && s.durationMs >= minPlausibleStepMs && s.durationMs <= maxPlausibleStepMs;
  const plausibleSteps = steps.filter(isPlausibleStep);

  const avgStepTimeMs = mean(compact(plausibleSteps.map((s) => s.durationMs)));
  const avgStrideTimeMs = mean(strides.map((s) => s.durationMs));
  const avgGroundContactMs = mean(compact(steps.map((s) => s.groundContactMs)));
  const avgFlightTimeMs = mean(compact(plausibleSteps.map((s) => s.flightTimeMs)));
  const strideFrequencyHz = avgStrideTimeMs ? 1000 / avgStrideTimeMs : undefined;
  const stepFrequencyHz = avgStepTimeMs ? 1000 / avgStepTimeMs : undefined;

  // Peak flexion = minimum knee angle (a smaller interior angle = more flexed).
  const peakLeftKneeFlexionDeg = minDefined(angles.map((a) => a.leftKneeDeg));
  const peakRightKneeFlexionDeg = minDefined(angles.map((a) => a.rightKneeDeg));
  const avgTrunkLeanDeg = mean(compact(angles.map((a) => a.trunkLeanDeg)));

  const leftStepAvg = mean(compact(plausibleSteps.filter((s) => s.side === "left").map((s) => s.durationMs)));
  const rightStepAvg = mean(compact(plausibleSteps.filter((s) => s.side === "right").map((s) => s.durationMs)));
  const leftRightStepTimeAsymmetryPct = asymmetryPct(leftStepAvg, rightStepAvg);

  const metrics: RealSprintMetrics = {
    analyzedFrames: angles.length,
    eventCount: events.length,
    stepCount: steps.length,
    strideCount: strides.length,
  };
  const set = (key: OptionalMetricKey, value: number | undefined, decimals = 1) => {
    if (value != null) metrics[key] = round(value, decimals);
  };
  set("avgStepTimeMs", avgStepTimeMs);
  set("avgStrideTimeMs", avgStrideTimeMs);
  set("avgGroundContactMs", avgGroundContactMs);
  set("avgFlightTimeMs", avgFlightTimeMs);
  set("strideFrequencyHz", strideFrequencyHz, 2);
  set("stepFrequencyHz", stepFrequencyHz, 2);
  set("peakLeftKneeFlexionDeg", peakLeftKneeFlexionDeg);
  set("peakRightKneeFlexionDeg", peakRightKneeFlexionDeg);
  set("avgTrunkLeanDeg", avgTrunkLeanDeg);
  set("leftRightStepTimeAsymmetryPct", leftRightStepTimeAsymmetryPct);

  // --- warnings ---
  const warnings: string[] = [];
  if (events.length === 0) warnings.push("No foot-contact events detected.");
  if (completeSteps.length === 0) warnings.push("No complete steps detected.");
  if (strides.length === 0) warnings.push("No complete strides detected.");
  if (angles.length === 0) warnings.push("No usable joint angles detected.");
  if (angles.length < MIN_ANALYZED_FRAMES) {
    warnings.push(`Only ${angles.length} analyzed frame(s) (< ${MIN_ANALYZED_FRAMES}); metrics may be unreliable.`);
  }
  const rejectedSteps = completeSteps.length - plausibleSteps.length;
  if (completeSteps.length > 0 && plausibleSteps.length === 0) {
    warnings.push(
      `All ${completeSteps.length} step(s) fell outside the plausible ${minPlausibleStepMs}–${maxPlausibleStepMs} ms window; cadence & flight unavailable.`,
    );
  } else if (rejectedSteps > 0) {
    warnings.push(
      `${rejectedSteps} of ${completeSteps.length} step(s) rejected as implausible (outside ${minPlausibleStepMs}–${maxPlausibleStepMs} ms) for cadence & flight.`,
    );
  }
  const coreMetrics = [
    avgStepTimeMs,
    avgStrideTimeMs,
    avgGroundContactMs,
    avgFlightTimeMs,
    stepFrequencyHz,
    strideFrequencyHz,
    peakLeftKneeFlexionDeg,
    peakRightKneeFlexionDeg,
    avgTrunkLeanDeg,
  ];
  if (coreMetrics.some((v) => v == null)) {
    warnings.push("Metrics are partial; some values could not be computed.");
  }

  return {
    metrics,
    events: includeRawArrays ? events : [],
    steps: includeRawArrays ? steps : [],
    strides: includeRawArrays ? strides : [],
    angles: includeRawArrays ? angles : [],
    warnings,
    source: "pose_sequence",
  };
}
