/**
 * Acceleration Progression Analysis (Phase 2, Parts 1-3).
 *
 * Turns the already-computed step-by-step table into WHY-level analysis:
 * velocity/acceleration curves, per-step gains, smoothness/spike detection,
 * step-length-vs-frequency development, and left/right contribution — never
 * re-measuring pose data, only interpreting what `computeAccelerationSteps`
 * already produced. Every curve point comes directly from a real step, so
 * nothing is smoothed away (Part 1: "never smooth data enough to hide real
 * changes").
 */

import type { AccelerationStepRow } from "./steps";
import type { AccelerationAsymmetry } from "./metrics";

export interface VelocityCurvePoint {
  stepNumber: number;
  distanceM: number;
  timeS: number;
  velocityMps: number;
}

export interface AccelerationCurvePoint {
  stepNumber: number;
  distanceM: number;
  timeS: number;
  accelerationMps2: number | null;
}

export interface StepGain {
  stepNumber: number;
  velocityGainMps: number | null;
  accelerationGainMps2: number | null;
}

export interface PeakMarker {
  stepNumber: number;
  distanceM: number;
  value: number;
}

export interface SmoothnessAssessment {
  smooth: boolean;
  /** A step where velocity dropped versus the previous step by more than jitter tolerance. */
  velocityDrops: { stepNumber: number; distanceM: number; dropMps: number }[];
  /** A step whose acceleration is a statistical outlier (>2 standard deviations from the mean). */
  accelerationSpikes: { stepNumber: number; distanceM: number; valueMps2: number }[];
}

export type Trend = "increasing" | "plateauing" | "decreasing" | "insufficient_data";

export interface StepProgressionEvaluation {
  stepLengthTrend: Trend;
  stepFrequencyTrend: Trend;
  /** Answers "is one metric plateauing while the other continues increasing?" */
  divergence:
    | "frequency_plateau_length_rising"
    | "length_plateau_frequency_rising"
    | "both_rising"
    | "both_plateauing"
    | "both_declining"
    | "insufficient_data";
  /** Answers "where is the athlete gaining the most speed?" */
  mostEfficientStep: { stepNumber: number; distanceM: number; velocityGainMps: number } | null;
}

export interface LeftRightContribution {
  leftContactTimeS: number | null;
  rightContactTimeS: number | null;
  leftStepTimeS: number | null;
  rightStepTimeS: number | null;
  stepTimeAsymmetryPct: number | null;
  contactTimeAsymmetryPct: number | null;
  /** Sum of velocity gained on steps landing on this side — "velocity contribution." */
  leftVelocityContributionMps: number;
  rightVelocityContributionMps: number;
  /** Only true once a difference clears a meaningful threshold — never over-reported. */
  meaningfulStepLengthAsymmetry: boolean;
  meaningfulStepTimeAsymmetry: boolean;
  meaningfulContactTimeAsymmetry: boolean;
}

export interface ProgressionAnalysis {
  velocityCurve: VelocityCurvePoint[];
  accelerationCurve: AccelerationCurvePoint[];
  stepGains: StepGain[];
  cumulativeDistanceM: number[];
  cumulativeTimeS: number[];
  peakAcceleration: PeakMarker | null;
  peakVelocityGain: PeakMarker | null;
  /** The step at/after which sustained acceleration decline begins, if any. */
  accelerationDeclineStep: { stepNumber: number; distanceM: number } | null;
  smoothness: SmoothnessAssessment;
  stepProgression: StepProgressionEvaluation;
  leftRight: LeftRightContribution;
}

const MEANINGFUL_ASYMMETRY_PCT = 8; // below this, a left/right gap is not reported as meaningful
const TREND_RELATIVE_THRESHOLD = 0.08; // an 8% early-vs-late change counts as a real trend

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function buildVelocityCurve(steps: AccelerationStepRow[]): VelocityCurvePoint[] {
  return steps.map((s) => ({
    stepNumber: s.stepNumber,
    distanceM: s.cumulativeDistanceM,
    timeS: s.elapsedTimeS,
    velocityMps: s.intervalVelocityMps,
  }));
}

export function buildAccelerationCurve(steps: AccelerationStepRow[]): AccelerationCurvePoint[] {
  return steps.map((s) => ({
    stepNumber: s.stepNumber,
    distanceM: s.cumulativeDistanceM,
    timeS: s.elapsedTimeS,
    accelerationMps2: s.averageAccelerationMps2,
  }));
}

export function computeStepGains(steps: AccelerationStepRow[]): StepGain[] {
  return steps.map((step, i) => {
    const prev = steps[i - 1];
    return {
      stepNumber: step.stepNumber,
      velocityGainMps: prev ? step.intervalVelocityMps - prev.intervalVelocityMps : null,
      accelerationGainMps2:
        prev && step.averageAccelerationMps2 != null && prev.averageAccelerationMps2 != null
          ? step.averageAccelerationMps2 - prev.averageAccelerationMps2
          : null,
    };
  });
}

/**
 * The first step, after acceleration has been observed rising, where it stops
 * rising and does not recover for the remainder of the zone. A single noisy
 * dip is not enough — this requires the LAST rise, not the first dip, so a
 * momentary fluctuation never gets mistaken for the real onset of decline.
 */
function findAccelerationDecline(
  steps: AccelerationStepRow[],
  gains: StepGain[],
): { stepNumber: number; distanceM: number } | null {
  let lastRiseIndex = -1;
  for (let i = 0; i < gains.length; i++) {
    if (gains[i].accelerationGainMps2 != null && gains[i].accelerationGainMps2! > 0) lastRiseIndex = i;
  }
  if (lastRiseIndex < 0 || lastRiseIndex + 1 >= steps.length) return null;
  const declineStep = steps[lastRiseIndex + 1];
  return { stepNumber: declineStep.stepNumber, distanceM: declineStep.cumulativeDistanceM };
}

function assessSmoothness(steps: AccelerationStepRow[], gains: StepGain[]): SmoothnessAssessment {
  const velocityDrops: SmoothnessAssessment["velocityDrops"] = [];
  for (let i = 0; i < gains.length; i++) {
    const gain = gains[i].velocityGainMps;
    if (gain != null && gain < -0.15) {
      velocityDrops.push({ stepNumber: steps[i].stepNumber, distanceM: steps[i].cumulativeDistanceM, dropMps: gain });
    }
  }
  const accelValues = steps.map((s) => s.averageAccelerationMps2).filter((v): v is number => v != null);
  const accelMean = mean(accelValues) ?? 0;
  const accelStd = stddev(accelValues, accelMean);
  const accelerationSpikes: SmoothnessAssessment["accelerationSpikes"] = [];
  if (accelStd > 0) {
    for (const step of steps) {
      if (step.averageAccelerationMps2 == null) continue;
      if (Math.abs(step.averageAccelerationMps2 - accelMean) > 2 * accelStd) {
        accelerationSpikes.push({ stepNumber: step.stepNumber, distanceM: step.cumulativeDistanceM, valueMps2: step.averageAccelerationMps2 });
      }
    }
  }
  return { smooth: velocityDrops.length === 0 && accelerationSpikes.length === 0, velocityDrops, accelerationSpikes };
}

function classifyTrend(early: number | null, late: number | null): Trend {
  if (early == null || late == null || early === 0) return "insufficient_data";
  const relativeChange = (late - early) / Math.abs(early);
  if (relativeChange > TREND_RELATIVE_THRESHOLD) return "increasing";
  if (relativeChange < -TREND_RELATIVE_THRESHOLD) return "decreasing";
  return "plateauing";
}

function evaluateStepProgression(steps: AccelerationStepRow[], gains: StepGain[]): StepProgressionEvaluation {
  if (steps.length < 4) {
    return {
      stepLengthTrend: "insufficient_data",
      stepFrequencyTrend: "insufficient_data",
      divergence: "insufficient_data",
      mostEfficientStep: null,
    };
  }
  const half = Math.ceil(steps.length / 2);
  const early = steps.slice(0, half);
  const late = steps.slice(half);
  const stepLengthTrend = classifyTrend(mean(early.map((s) => s.stepLengthM)), mean(late.map((s) => s.stepLengthM)));
  const stepFrequencyTrend = classifyTrend(
    mean(early.map((s) => s.stepFrequencyHz)),
    mean(late.map((s) => s.stepFrequencyHz)),
  );

  let divergence: StepProgressionEvaluation["divergence"];
  if (stepFrequencyTrend === "plateauing" && stepLengthTrend === "increasing") divergence = "frequency_plateau_length_rising";
  else if (stepLengthTrend === "plateauing" && stepFrequencyTrend === "increasing") divergence = "length_plateau_frequency_rising";
  else if (stepLengthTrend === "increasing" && stepFrequencyTrend === "increasing") divergence = "both_rising";
  else if (stepLengthTrend === "plateauing" && stepFrequencyTrend === "plateauing") divergence = "both_plateauing";
  else if (stepLengthTrend === "decreasing" && stepFrequencyTrend === "decreasing") divergence = "both_declining";
  else divergence = "insufficient_data";

  const validGains = gains.filter((g) => g.velocityGainMps != null);
  const best = validGains.length
    ? validGains.reduce((a, b) => (b.velocityGainMps! > a.velocityGainMps! ? b : a))
    : null;
  const bestStep = best ? steps.find((s) => s.stepNumber === best.stepNumber) : null;
  const mostEfficientStep =
    best && bestStep ? { stepNumber: best.stepNumber, distanceM: bestStep.cumulativeDistanceM, velocityGainMps: best.velocityGainMps! } : null;

  return { stepLengthTrend, stepFrequencyTrend, divergence, mostEfficientStep };
}

function evaluateLeftRight(steps: AccelerationStepRow[], gains: StepGain[], asymmetries: AccelerationAsymmetry | null): LeftRightContribution {
  const leftSteps = steps.filter((s) => s.side === "left");
  const rightSteps = steps.filter((s) => s.side === "right");
  const leftContactTimes = leftSteps.map((s) => s.contactTimeS).filter((v): v is number => v != null);
  const rightContactTimes = rightSteps.map((s) => s.contactTimeS).filter((v): v is number => v != null);

  let leftVelocityContributionMps = 0;
  let rightVelocityContributionMps = 0;
  for (const gain of gains) {
    if (gain.velocityGainMps == null || gain.velocityGainMps <= 0) continue;
    const step = steps.find((s) => s.stepNumber === gain.stepNumber);
    if (!step) continue;
    if (step.side === "left") leftVelocityContributionMps += gain.velocityGainMps;
    else rightVelocityContributionMps += gain.velocityGainMps;
  }

  const pctDiff = (l: number | null, r: number | null): number | null =>
    l != null && r != null && Math.max(l, r) > 0 ? (Math.abs(l - r) / Math.max(l, r)) * 100 : null;

  const leftStepTimeS = mean(leftSteps.map((s) => s.stepTimeS));
  const rightStepTimeS = mean(rightSteps.map((s) => s.stepTimeS));
  const leftContactTimeS = mean(leftContactTimes);
  const rightContactTimeS = mean(rightContactTimes);
  const stepTimeAsymmetryPct = pctDiff(leftStepTimeS, rightStepTimeS);
  const contactTimeAsymmetryPct = pctDiff(leftContactTimeS, rightContactTimeS);

  return {
    leftContactTimeS,
    rightContactTimeS,
    leftStepTimeS,
    rightStepTimeS,
    stepTimeAsymmetryPct,
    contactTimeAsymmetryPct,
    leftVelocityContributionMps: Math.round(leftVelocityContributionMps * 1000) / 1000,
    rightVelocityContributionMps: Math.round(rightVelocityContributionMps * 1000) / 1000,
    meaningfulStepLengthAsymmetry: (asymmetries?.stepLengthAsymmetryPct ?? 0) >= MEANINGFUL_ASYMMETRY_PCT,
    // Requires at least two observations per side — a single left step vs. a
    // single right step is a comparison, not a repeated pattern, and must
    // never be flagged "meaningful" on its own (real-clip validation, Phase
    // 3 Part 18, surfaced this: 4 left / 1 right steps produced a "high"
    // impact limiter from one right-foot contact alone before this gate).
    meaningfulStepTimeAsymmetry: leftSteps.length >= 2 && rightSteps.length >= 2 && (stepTimeAsymmetryPct ?? 0) >= MEANINGFUL_ASYMMETRY_PCT,
    meaningfulContactTimeAsymmetry: leftContactTimes.length >= 2 && rightContactTimes.length >= 2 && (contactTimeAsymmetryPct ?? 0) >= MEANINGFUL_ASYMMETRY_PCT,
  };
}

export function analyzeProgression(steps: AccelerationStepRow[], asymmetries: AccelerationAsymmetry | null): ProgressionAnalysis {
  const gains = computeStepGains(steps);
  const accelValues = steps
    .map((s) => (s.averageAccelerationMps2 != null ? { stepNumber: s.stepNumber, distanceM: s.cumulativeDistanceM, value: s.averageAccelerationMps2 } : null))
    .filter((v): v is PeakMarker => v != null);
  const peakAcceleration = accelValues.length ? accelValues.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const gainValues = gains
    .map((g) => {
      if (g.velocityGainMps == null) return null;
      const step = steps.find((s) => s.stepNumber === g.stepNumber);
      return step ? { stepNumber: g.stepNumber, distanceM: step.cumulativeDistanceM, value: g.velocityGainMps } : null;
    })
    .filter((v): v is PeakMarker => v != null);
  const peakVelocityGain = gainValues.length ? gainValues.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  return {
    velocityCurve: buildVelocityCurve(steps),
    accelerationCurve: buildAccelerationCurve(steps),
    stepGains: gains,
    cumulativeDistanceM: steps.map((s) => s.cumulativeDistanceM),
    cumulativeTimeS: steps.map((s) => s.elapsedTimeS),
    peakAcceleration,
    peakVelocityGain,
    accelerationDeclineStep: findAccelerationDecline(steps, gains),
    smoothness: assessSmoothness(steps, gains),
    stepProgression: evaluateStepProgression(steps, gains),
    leftRight: evaluateLeftRight(steps, gains, asymmetries),
  };
}
