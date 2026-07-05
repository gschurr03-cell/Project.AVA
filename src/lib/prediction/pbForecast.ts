/**
 * Personal-best forecast — ARCHITECTURE ONLY (Day 76).
 *
 * This file defines the shape of AVA's future PB-prediction system so the rest of
 * the app (dashboard, athlete page, trends) can be built against a stable contract.
 * It is deliberately NOT implemented yet: {@link forecastPersonalBests} returns an
 * honest `available: false` report rather than inventing a prediction. Wiring real
 * modelling in later must not require touching any caller.
 *
 * Design goals when this is built:
 *  - Explainable: every predicted time carries the inputs + reasoning that produced
 *    it (never a black box), consistent with the rest of AVA.
 *  - Confidence-aware: predictions state how much history/quality backs them, and
 *    degrade gracefully (wide bands / "insufficient data") when evidence is thin.
 *  - Metric-driven: inputs are AVA's own measured signals + trends, not guesses.
 *
 * Pure & deterministic (once implemented): no I/O.
 */

export type RaceTarget = "30mFly" | "60m" | "100m" | "200m";
export type ForecastConfidence = "high" | "medium" | "low" | "insufficient";

/** The evidence a forecast will eventually be built from. All optional/nullable so
 *  the model can run on partial data and report reduced confidence. */
export interface ForecastInputs {
  /** Chronological measured sessions (velocity, step metrics, quality per session). */
  sessionHistory: ForecastSession[];
  /** Latest velocity-vs-distance curve, if reconstructed from a run. */
  velocityCurve?: VelocitySample[] | null;
  /** Trend signals (direction + rate + confidence) per metric, from the trend engine. */
  trends?: MetricTrendSignal[] | null;
  /** Coach-entered training context (volume, phase, weeks to competition). */
  trainingContext?: TrainingContext | null;
  /** Recording-quality scores across sessions, to weight noisy inputs down. */
  recentQualityScores?: number[] | null;
}

export interface ForecastSession {
  sessionId: string;
  date: string; // ISO
  maxVelocityMps: number | null;
  avgStepLengthM: number | null;
  combinedStepFrequencyHz: number | null;
  qualityScore: number | null; // 0–100 recording quality
}

export interface VelocitySample {
  distanceM: number;
  velocityMps: number;
}

export interface MetricTrendSignal {
  metric: string;
  direction: "improving" | "declining" | "steady";
  /** Change per session in the metric's own unit. */
  ratePerSession: number;
  confidence: ForecastConfidence;
}

export interface TrainingContext {
  weeklyVolumeNote?: string | null;
  trainingPhase?: string | null;
  weeksToCompetition?: number | null;
}

/** One predicted race time + its explanation and confidence band. */
export interface RacePrediction {
  target: RaceTarget;
  predictedSeconds: number | null;
  /** ± range at the stated confidence. */
  lowerSeconds: number | null;
  upperSeconds: number | null;
  confidence: ForecastConfidence;
  /** Plain-language why (inputs + reasoning) — mirrors the rest of AVA. */
  explanation: string;
}

/** A projected timeline point (e.g. "in ~6 weeks, ~10.9s at current trajectory"). */
export interface ImprovementProjection {
  target: RaceTarget;
  weeksOut: number;
  projectedSeconds: number | null;
  confidence: ForecastConfidence;
}

export interface PbForecastReport {
  /** False until the model is implemented and has enough evidence. */
  available: boolean;
  predictions: RacePrediction[];
  timeline: ImprovementProjection[];
  overallConfidence: ForecastConfidence;
  /** What data would unlock / sharpen the forecast. */
  dataGaps: string[];
  /** How the forecast was produced (always present, even when unavailable). */
  method: string;
}

const METHOD =
  "PB forecast is planned (Day 76 architecture). It will project race times from the athlete's measured session history, velocity curves, step-metric trends, consistency, and recording quality — every prediction explained and confidence-banded. Not yet implemented.";

/**
 * Placeholder entry point. Returns an honest "not available yet" report — it never
 * fabricates a prediction. Implementing this later fills `predictions`/`timeline`
 * without changing this signature.
 */
export function forecastPersonalBests(inputs: ForecastInputs): PbForecastReport {
  void inputs; // architecture stub — inputs shape is the contract; no modelling yet
  return {
    available: false,
    predictions: [],
    timeline: [],
    overallConfidence: "insufficient",
    dataGaps: [
      "PB prediction is on the roadmap — it needs several analyzed sessions over time to model a reliable trajectory.",
    ],
    method: METHOD,
  };
}
