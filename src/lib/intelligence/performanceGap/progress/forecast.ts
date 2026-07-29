/**
 * Forecasting Framework (Phase 10). Estimates a metric's likely short-term trajectory over
 * the next several analyses IF the current trend continues — always as a widening range,
 * never a guaranteed number. Uncertainty grows with the horizon and shrinks with a cleaner
 * historical fit. This is a projection, not a promise. Pure + deterministic.
 */

import { type Confidence, estimated, inferred, unknown } from "../models";
import type { Forecast, MetricHistory, ProgressTrend } from "./models";
import { regression, round } from "./stats";
import { FORECAST, TREND } from "./config";

export const FORECAST_ENGINE_VERSION = "ava-progress-forecast-v1" as const;

export function forecastMetric(history: MetricHistory, trend: ProgressTrend, horizon = FORECAST.horizonAnalyses): Forecast {
  const pts = history.points;
  const n = pts.length;
  const empty: Forecast = {
    metricId: history.metricId,
    label: history.label,
    unit: history.unit,
    horizonAnalyses: horizon,
    method: "linear trend extrapolation",
    steps: [],
    expectedAtHorizon: null,
    confidence: unknown("not enough analyses to forecast"),
    assumptions: [],
    note: "Not enough history to project a trajectory.",
  };
  if (n < TREND.minPointsForTrend) return empty;

  const ys = pts.map((p) => p.value);
  const xs = pts.map((_, i) => i);
  const reg = regression(xs, ys)!;
  const last = ys[n - 1];
  const baseNoise = Math.max(reg.residualStd, Math.abs(last) * FORECAST.minNoiseFraction);

  const steps = [];
  for (let step = 1; step <= horizon; step++) {
    const expected = reg.intercept + reg.slope * (n - 1 + step);
    const halfWidth = baseNoise * (1 + FORECAST.uncertaintyGrowthPerStep * step);
    steps.push({ step, expected: round(expected, 4), min: round(expected - halfWidth, 4), max: round(expected + halfWidth, 4) });
  }
  const at = steps[steps.length - 1];

  // Confidence falls with the horizon and with a poorer fit; inconsistent series → inferred.
  const horizonPenalty = 1 / (1 + horizon * 0.08);
  const score = clamp01((0.4 + 0.5 * reg.r2) * horizonPenalty);
  const confidence: Confidence = trend.status === "inconsistent" || reg.r2 < TREND.inconsistentFit
    ? inferred(clamp01(score * 0.7), "inconsistent history — wide uncertainty")
    : estimated(score, `fit ${round(reg.r2, 2)}, horizon ${horizon}`);

  return {
    metricId: history.metricId,
    label: history.label,
    unit: history.unit,
    horizonAnalyses: horizon,
    method: "linear trend extrapolation",
    steps,
    expectedAtHorizon: { expected: at.expected, min: at.min, max: at.max },
    confidence,
    assumptions: [
      "The current trend continues at a similar rate.",
      "Training, health, and recording conditions remain broadly consistent.",
      "No competition taper, injury, or major program change intervenes.",
    ],
    note: "A likely trajectory if the trend holds — uncertainty widens with each step, and outcomes are never guaranteed.",
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
