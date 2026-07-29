/**
 * Load Management (Phase 12). Estimates cumulative training stress from frequency, recent
 * session intensity, recent progress (regression raises stress), and the trend picture, then
 * offers coaching guidance. It NEVER diagnoses and NEVER guarantees injury prevention — the
 * disclaimer is attached to every estimate. Pure + deterministic.
 */

import { type Confidence, estimated, inferred } from "../models";
import type { LoadEstimate } from "./models";
import { LOAD } from "./config";
import { primaryTrendStatus, type PremiumInput } from "./context";

export const LOAD_ENGINE_VERSION = "ava-premium-load-v1" as const;

export function estimateLoad(input: PremiumInput): LoadEstimate {
  const tc = input.trainingContext;
  const loads = tc.recentSessionLoads ?? [];

  const frequencyFactor = clamp01(tc.sessionsPerWeek / LOAD.frequencySaturation);
  const intensityFactor = loads.length ? clamp01(mean(loads)) : 0.4;

  const trend = primaryTrendStatus(input);
  const regressionFactor = trend === "rapid_regression" ? 1 : trend === "declining" ? 0.7 : trend === "plateaued" ? 0.4 : 0.15;
  const trendFactor = trend === "rapid_improvement" ? 0.7 : trend === "improving" ? 0.5 : 0.3;

  const w = LOAD.weights;
  const stress01 = clamp01(w.frequency * frequencyFactor + w.intensity * intensityFactor + w.regression * regressionFactor + w.trend * trendFactor);
  const cumulativeStress = Math.round(stress01 * 100);

  const band: LoadEstimate["band"] =
    cumulativeStress >= LOAD.bands.high ? "very_high" : cumulativeStress >= LOAD.bands.moderate ? "high" : cumulativeStress >= LOAD.bands.low ? "moderate" : "low";

  const fatigueIndicators: string[] = [];
  if (trend === "declining" || trend === "rapid_regression") fatigueIndicators.push("Performance trend is declining — a possible fatigue signal.");
  if (intensityFactor > 0.75) fatigueIndicators.push("Recent sessions have been consistently high intensity.");
  if (frequencyFactor > 0.85) fatigueIndicators.push("High training frequency for the current phase.");

  const guidance =
    band === "very_high" ? "Cumulative stress looks very high — consider prioritising recovery and reducing volume."
    : band === "high" ? "Cumulative stress is elevated — monitor readiness and keep an easy day available."
    : band === "moderate" ? "Cumulative stress is moderate — proceed as planned while monitoring."
    : "Cumulative stress looks low — there is room to progress if readiness allows.";

  const confidence: Confidence = loads.length >= 3 ? estimated(0.55, "based on recent session loads + trend") : inferred(0.4, "limited load data");

  return {
    cumulativeStress,
    band,
    factors: [
      { factor: "frequency", value: round(frequencyFactor) },
      { factor: "intensity", value: round(intensityFactor) },
      { factor: "regression", value: round(regressionFactor) },
      { factor: "trend", value: round(trendFactor) },
    ].map((f) => ({ factor: f.factor, contribution: f.value })),
    fatigueIndicators,
    guidance,
    disclaimer: LOAD.disclaimer,
    confidence,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
