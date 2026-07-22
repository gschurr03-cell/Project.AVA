/**
 * Engine 5 — Recommendation Impact Engine.
 *
 * Estimates how much each recommendation COULD improve performance: per-metric
 * effects and a RANGED race-time gain, each with confidence, evidence source, and
 * non-diagnostic reasoning. Estimates are never presented as guarantees (always a
 * min–max band). Pure and deterministic.
 */

import {
  type MetricEffect,
  type PerformanceTarget,
  type RecommendationImpact,
  estimated,
  propagateConfidence,
} from "./models";
import {
  RECOMMENDATION_CATALOG,
  type RecommendationDefinition,
  metricDefinition,
  recommendationDefinition,
} from "./config";

export const RECOMMENDATION_IMPACT_ENGINE_VERSION = "recommendation-impact-v1" as const;

/**
 * Estimate the race-time impact of a recommendation, given the athlete's current
 * headline metrics. Uses the velocity identity to translate a stride-length /
 * frequency delta into a velocity change, then distance ÷ velocity into a time gain.
 * The band widens with lower confidence — honest uncertainty, never a point promise.
 */
export function estimateRecommendationImpact(
  def: RecommendationDefinition,
  ctx: {
    target: PerformanceTarget;
    currentStrideLengthM: number | null;
    currentStrideFrequencyHz: number | null;
    currentPeakVelocityMps: number | null;
  },
): RecommendationImpact {
  const effects: MetricEffect[] = def.effects.map((e) => ({
    metricId: e.metricId,
    estimatedDelta: e.delta,
    unit: e.unit,
    direction: e.direction,
  }));

  const raceTimeGain = estimateRaceTimeGain(def, ctx);

  return {
    recommendationId: def.id,
    label: def.label,
    estimatedEffects: effects,
    estimatedRaceTimeGainS: raceTimeGain,
    confidence: propagateConfidence(
      [estimated(def.confidence, "catalogued associative effect")],
      "estimated, not guaranteed",
    ),
    evidenceSource: def.evidenceSource,
    reasoning: def.reasoning,
  };
}

export function estimateAllRecommendationImpacts(ctx: {
  target: PerformanceTarget;
  currentStrideLengthM: number | null;
  currentStrideFrequencyHz: number | null;
  currentPeakVelocityMps: number | null;
  recommendationIds?: string[];
}): RecommendationImpact[] {
  const defs = ctx.recommendationIds
    ? ctx.recommendationIds.map(recommendationDefinition).filter((d): d is RecommendationDefinition => !!d)
    : RECOMMENDATION_CATALOG;
  return defs.map((d) => estimateRecommendationImpact(d, ctx));
}

/**
 * Translate a recommendation's metric effects into an estimated 100 m-style time
 * gain range. A velocity increase Δv over the race distance yields a time change of
 * roughly d/v − d/(v+Δv). The band is ±(1 − confidence) around the point estimate.
 */
function estimateRaceTimeGain(
  def: RecommendationDefinition,
  ctx: {
    target: PerformanceTarget;
    currentStrideLengthM: number | null;
    currentStrideFrequencyHz: number | null;
    currentPeakVelocityMps: number | null;
  },
): { min: number; max: number } | null {
  const v = ctx.target.currentAvgVelocityMps;
  const d = ctx.target.distanceM;
  if (v == null || v <= 0 || d <= 0) return null;

  // Estimate Δv from the effects using v = SL × F where those metrics are affected;
  // otherwise fall back to a direct peak-velocity effect.
  const sl = ctx.currentStrideLengthM;
  const f = ctx.currentStrideFrequencyHz;
  let deltaV = 0;

  const slEffect = signedDelta(def, "strideLength");
  const fEffect = signedDelta(def, "strideFrequency");
  if (sl != null && f != null && (slEffect !== 0 || fEffect !== 0)) {
    const vOld = sl * f;
    const vNew = (sl + slEffect) * (f + fEffect);
    // Scale the SL×F velocity change to the athlete's actual average velocity.
    deltaV += (vNew - vOld) * (v / vOld);
  }
  const pvEffect = signedDelta(def, "peakVelocity");
  if (pvEffect !== 0) {
    // Peak-velocity gains transfer partially to average velocity (configurable share).
    deltaV += pvEffect * 0.4;
  }

  if (deltaV <= 0) return null;
  const pointGain = d / v - d / (v + deltaV);
  const spread = 1 - def.confidence; // wider band when less confident
  const min = round(Math.max(0, pointGain * (1 - spread)));
  const max = round(pointGain * (1 + spread));
  return { min, max };
}

function signedDelta(def: RecommendationDefinition, metricId: string): number {
  const e = def.effects.find((x) => x.metricId === metricId);
  if (!e) return 0;
  const lowerIsBetter = metricDefinition(metricId)?.lowerIsBetter ?? false;
  // A "decrease" of a lower-is-better metric is an improvement; normalize to the
  // physical delta of the metric value.
  return e.direction === "increase" ? e.delta : -e.delta * (lowerIsBetter ? 1 : 1);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
