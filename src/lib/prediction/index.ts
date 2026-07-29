/**
 * Performance Predictor v1 (Day 58) — deterministic, explainable sprint-time
 * estimates from the athlete profile + calibrated biomechanics.
 *
 * This is NOT a machine-learning model. It is a transparent physics-lite model:
 *   1. Estimate top velocity (Vmax) by blending the available, unambiguous
 *      velocity signals, weighted by how much each is trusted.
 *   2. For each race distance, time ≈ distance / (Vmax × average-to-top ratio),
 *      where the ratios are named constants a future version can refine.
 *   3. Compare to current PBs and goals, and surface confidence + the factors
 *      that actually drove the number.
 *
 * Design guarantees:
 *  - Pure & deterministic: no I/O, inputs read-only, same input → same output.
 *  - Self-contained: takes plain numbers, so it is decoupled from the
 *    calibration and biomechanics engines (they adapt their outputs to
 *    {@link PredictionInputs} at the call site).
 *  - Explainable & honest: every estimate is labelled an estimate, weak/missing
 *    inputs lower confidence with a stated reason, and precision is never faked.
 *
 * Extension points for later versions are called out inline (phase-specific
 * weighting, historical improvement, environmental/fatigue factors, etc.).
 */

export type PredictionConfidence = "high" | "medium" | "low";

export type RaceDistance = 60 | 100 | 200;

export const RACE_DISTANCES: RaceDistance[] = [60, 100, 200];

/**
 * Average race velocity as a fraction of top velocity, per distance. 60 m is
 * acceleration-dominated (lowest fraction); 100 m spends longest near top speed;
 * 200 m adds the bend + mild fatigue. These are the primary tuning knobs — a
 * future version can make them phase-/athlete-specific.
 */
export const AVG_TO_TOP_VELOCITY_RATIO: Record<RaceDistance, number> = {
  60: 0.86,
  100: 0.9,
  200: 0.88,
};

/** Plausible human sprint velocity band (m/s); values outside are rejected. */
const MIN_VELOCITY = 4;
const MAX_VELOCITY = 13;

/** All predictor inputs. Every field is optional; the engine uses what's present. */
export interface PredictionInputs {
  // Anthropometrics (context in v1).
  heightCm: number | null;
  weightKg: number | null;
  legLengthCm: number | null;
  // Current personal bests and goals, in seconds.
  personalBests: Partial<Record<RaceDistance, number | null>>;
  goals: Partial<Record<RaceDistance, number | null>>;
  // Biomechanics metrics (worker-derived).
  strideFrequencyHz: number | null;
  groundContactTimeMs: number | null;
  flightTimeMs: number | null;
  metricsTopSpeedMps: number | null;
  metricsStrideLengthM: number | null;
  // Calibrated real-world measurements.
  calibratedStepLengthM: number | null;
  calibratedStrideLengthM: number | null;
  calibratedAvgVelocityMps: number | null;
  calibratedTopVelocityMps: number | null;
  /** Confidence of the calibration scale that produced the calibrated values. */
  calibrationConfidence: PredictionConfidence | null;
}

/** One input that measurably contributed to the Vmax estimate. */
export interface PredictionFactor {
  key: string;
  label: string;
  /** Human-readable value + role. */
  detail: string;
  /** Share of the velocity blend, 0..1 (strongest first). */
  contribution: number;
}

/** Estimated time for one distance, with comparisons. */
export interface RaceEstimate {
  distance: RaceDistance;
  /** Estimated time in seconds. */
  estimateSeconds: number;
  currentPb: number | null;
  goal: number | null;
  /** estimate − PB (negative ⇒ estimate is faster than the current PB). */
  diffFromPb: number | null;
  /** estimate − goal (negative ⇒ estimate already beats the goal). */
  diffFromGoal: number | null;
}

export interface PerformancePrediction {
  /** False when there isn't enough signal to estimate a velocity. */
  available: boolean;
  confidence: PredictionConfidence | null;
  estimatedTopVelocityMps: number | null;
  estimates: RaceEstimate[];
  /** Weighted velocity contributors, strongest first. */
  factors: PredictionFactor[];
  /** Other inputs acknowledged but not weighted into v1 (context). */
  contextInputs: string[];
  warnings: string[];
  /** Always present: this is an estimate, not a guarantee. */
  disclaimer: string;
}

const DISCLAIMER =
  "Estimate only — a model-based projection from current form, not a guaranteed time.";

const CONFIDENCE_ORDER: PredictionConfidence[] = ["low", "medium", "high"];

function downgrade(c: PredictionConfidence, steps = 1): PredictionConfidence {
  return CONFIDENCE_ORDER[Math.max(0, CONFIDENCE_ORDER.indexOf(c) - steps)];
}

/** Trust weight for a calibrated signal, from its calibration confidence. */
function confidenceWeight(c: PredictionConfidence | null): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

const plausibleVelocity = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= MIN_VELOCITY && v <= MAX_VELOCITY;

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface VelocitySource {
  key: string;
  label: string;
  velocity: number;
  weight: number;
  detail: string;
}

/**
 * Collect the unambiguous top-velocity signals present in the inputs. Calibrated
 * top velocity and the worker's top speed are used directly; stride×frequency is
 * a derived fallback used only when no measured top speed exists.
 */
function collectVelocitySources(inputs: PredictionInputs): VelocitySource[] {
  const sources: VelocitySource[] = [];

  if (plausibleVelocity(inputs.calibratedTopVelocityMps)) {
    const conf = inputs.calibrationConfidence;
    sources.push({
      key: "calibratedTop",
      label: "Calibrated top velocity",
      velocity: inputs.calibratedTopVelocityMps,
      weight: confidenceWeight(conf),
      detail: `${round2(inputs.calibratedTopVelocityMps)} m/s measured from calibrated motion (${conf ?? "low"} calibration).`,
    });
  }

  if (plausibleVelocity(inputs.metricsTopSpeedMps)) {
    sources.push({
      key: "biomechTop",
      label: "Biomechanics top speed",
      velocity: inputs.metricsTopSpeedMps,
      weight: 2,
      detail: `${round2(inputs.metricsTopSpeedMps)} m/s from the analysis metrics.`,
    });
  }

  // Fallback only: derive from stride length × stride frequency when there is no
  // directly measured top speed (their product is the worker's velocity basis).
  if (sources.length === 0 && inputs.metricsStrideLengthM && inputs.strideFrequencyHz) {
    const v = inputs.metricsStrideLengthM * inputs.strideFrequencyHz;
    if (plausibleVelocity(v)) {
      sources.push({
        key: "strideProduct",
        label: "Stride length × frequency",
        velocity: v,
        weight: 1,
        detail: `${round2(v)} m/s derived from stride length (${round2(inputs.metricsStrideLengthM)} m) × frequency (${round2(inputs.strideFrequencyHz)} Hz).`,
      });
    }
  }

  return sources;
}

/** Inputs acknowledged as context but not weighted into the v1 number. */
function collectContext(inputs: PredictionInputs): string[] {
  const context: string[] = [];
  if (inputs.legLengthCm) context.push(`Leg length ${round2(inputs.legLengthCm)} cm`);
  if (inputs.heightCm) context.push(`Height ${round2(inputs.heightCm)} cm`);
  if (inputs.weightKg) context.push(`Weight ${round2(inputs.weightKg)} kg`);
  if (inputs.groundContactTimeMs)
    context.push(`Ground contact ${Math.round(inputs.groundContactTimeMs)} ms`);
  if (inputs.flightTimeMs) context.push(`Flight time ${Math.round(inputs.flightTimeMs)} ms`);
  if (inputs.calibratedStepLengthM)
    context.push(`Calibrated step length ${round2(inputs.calibratedStepLengthM)} m`);
  if (inputs.calibratedStrideLengthM)
    context.push(`Calibrated stride length ${round2(inputs.calibratedStrideLengthM)} m`);
  if (inputs.calibratedAvgVelocityMps)
    context.push(`Average velocity ${round2(inputs.calibratedAvgVelocityMps)} m/s`);
  return context;
}

/**
 * Confidence in the whole prediction: anchored to how the Vmax was measured, and
 * lowered when the velocity signals disagree. Only a high-confidence calibration
 * with corroboration can reach "high"; uncalibrated data stays "low".
 */
function assessConfidence(
  sources: VelocitySource[],
  usedCalibratedTop: boolean,
  calibrationConfidence: PredictionConfidence | null,
): { confidence: PredictionConfidence; warnings: string[] } {
  const warnings: string[] = [];

  let confidence: PredictionConfidence = usedCalibratedTop
    ? (calibrationConfidence ?? "low")
    : "low";

  if (!usedCalibratedTop) {
    warnings.push(
      "No calibrated velocity available — the estimate uses uncalibrated biomechanics, so treat it as rough.",
    );
  } else if (calibrationConfidence === "low") {
    warnings.push("Calibration is low-confidence, so the projected times are rough.");
  }

  // Agreement check: wide disagreement between signals widens uncertainty.
  const velocities = sources.map((s) => s.velocity);
  if (velocities.length >= 2) {
    const spread = (Math.max(...velocities) - Math.min(...velocities)) / Math.min(...velocities);
    if (spread > 0.25) {
      confidence = downgrade(confidence);
      warnings.push(
        `Velocity signals disagree by ${Math.round(spread * 100)}%, so the estimate is uncertain.`,
      );
    }
  } else {
    warnings.push("Only one velocity signal was available — limited cross-checking.");
    confidence = downgrade(confidence);
  }

  return { confidence, warnings };
}

function buildEstimate(
  distance: RaceDistance,
  vmax: number,
  inputs: PredictionInputs,
): RaceEstimate {
  const raceVelocity = vmax * AVG_TO_TOP_VELOCITY_RATIO[distance];
  const estimateSeconds = round2(distance / raceVelocity);
  const currentPb = inputs.personalBests[distance] ?? null;
  const goal = inputs.goals[distance] ?? null;
  return {
    distance,
    estimateSeconds,
    currentPb,
    goal,
    diffFromPb: currentPb != null ? round2(estimateSeconds - currentPb) : null,
    diffFromGoal: goal != null ? round2(estimateSeconds - goal) : null,
  };
}

function unavailable(warnings: string[]): PerformancePrediction {
  return {
    available: false,
    confidence: null,
    estimatedTopVelocityMps: null,
    estimates: [],
    factors: [],
    contextInputs: [],
    warnings,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Build the full performance prediction. When no plausible velocity signal
 * exists, returns `available: false` with an explanation rather than a number.
 */
export function predictPerformance(inputs: PredictionInputs): PerformancePrediction {
  const sources = collectVelocitySources(inputs);
  if (sources.length === 0) {
    return unavailable([
      "Not enough data to estimate performance — a calibrated top velocity or analysed sprint metrics are required.",
    ]);
  }

  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  const vmax = sources.reduce((sum, s) => sum + s.velocity * s.weight, 0) / totalWeight;

  const usedCalibratedTop = sources.some((s) => s.key === "calibratedTop");
  const { confidence, warnings } = assessConfidence(
    sources,
    usedCalibratedTop,
    inputs.calibrationConfidence,
  );

  const factors: PredictionFactor[] = sources
    .map((s) => ({
      key: s.key,
      label: s.label,
      detail: s.detail,
      contribution: round2(s.weight / totalWeight),
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const estimates = RACE_DISTANCES.map((d) => buildEstimate(d, vmax, inputs));

  return {
    available: true,
    confidence,
    estimatedTopVelocityMps: round2(vmax),
    estimates,
    factors,
    contextInputs: collectContext(inputs),
    warnings,
    disclaimer: DISCLAIMER,
  };
}
