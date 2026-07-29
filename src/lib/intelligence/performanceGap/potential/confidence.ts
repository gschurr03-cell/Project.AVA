/**
 * Projection Confidence + Uncertainty models (Phase 6). Confidence depends on
 * measurement quality, data completeness, athlete similarity, projection distance, and
 * historical consistency — so LONGER projections are naturally less confident. The
 * uncertainty model explicitly surfaces what is unknown. Pure + deterministic.
 */

import type { AthletePerformanceModel } from "../models";
import type { AthleteBlueprint } from "../blueprint/models";
import type { ProjectionConfidence, UncertaintySource } from "./models";
import { CONFIDENCE_WEIGHTS, DISTANCE_FACTOR, KEY_METRICS } from "./config";

export const PROJECTION_CONFIDENCE_VERSION = "ava-projection-confidence-v1" as const;

export interface ConfidenceInput {
  model: AthletePerformanceModel;
  blueprint: AthleteBlueprint;
  improvementHistory?: number[];
  horizon: "current" | "near_term" | "long_term";
}

export function computeProjectionConfidence(input: ConfidenceInput): ProjectionConfidence {
  const measurementQuality = averageMetricConfidence(input.model);
  const dataCompleteness = completeness(input.model);
  const athleteSimilarity = input.blueprint.eliteComparison?.similarity ?? 0.45;
  const projectionDistance = DISTANCE_FACTOR[input.horizon];
  const historicalConsistency = consistency(input.improvementHistory);

  const factors = [
    { factor: "measurementQuality", contribution: round(measurementQuality * CONFIDENCE_WEIGHTS.measurementQuality) },
    { factor: "dataCompleteness", contribution: round(dataCompleteness * CONFIDENCE_WEIGHTS.dataCompleteness) },
    { factor: "athleteSimilarity", contribution: round(athleteSimilarity * CONFIDENCE_WEIGHTS.athleteSimilarity) },
    { factor: "projectionDistance", contribution: round(projectionDistance * CONFIDENCE_WEIGHTS.projectionDistance) },
    { factor: "historicalConsistency", contribution: round(historicalConsistency * CONFIDENCE_WEIGHTS.historicalConsistency) },
  ];
  const score = clamp01(factors.reduce((s, f) => s + f.contribution, 0));
  const level = score >= 0.66 ? "high" : score >= 0.42 ? "moderate" : "low";
  return { level, score: round(score), factors };
}

export function identifyUncertainty(input: {
  model: AthletePerformanceModel;
  blueprint: AthleteBlueprint;
  improvementHistory?: number[];
  goalBeyondCeiling: boolean;
}): UncertaintySource[] {
  const sources: UncertaintySource[] = [];
  const history = input.improvementHistory ?? [];

  if (history.length < 2) {
    sources.push({ id: "limited_history", description: "Limited historical analyses to establish a trajectory.", impact: "high" });
  } else if (isRapidlyImproving(history)) {
    sources.push({ id: "rapid_improvement", description: "Rapid recent improvement makes trajectory harder to project.", impact: "moderate" });
  }

  if (input.blueprint.bodyProfile.confidence.category === "unknown") {
    sources.push({ id: "missing_anthropometrics", description: "Missing anthropometric measurements reduce individualization.", impact: "moderate" });
  }
  if (completeness(input.model) < 0.75) {
    sources.push({ id: "incomplete_velocity_profile", description: "Incomplete velocity/mechanics profile from the current analysis.", impact: "moderate" });
  }
  if (input.blueprint.eliteComparison == null) {
    sources.push({ id: "no_build_match", description: "No similar-build comparison available (limited anthropometrics).", impact: "low" });
  }
  if (input.goalBeyondCeiling) {
    sources.push({ id: "goal_beyond_ceiling", description: "The stated goal is at or beyond the estimated individualized ceiling.", impact: "high" });
  }
  return sources;
}

function averageMetricConfidence(model: AthletePerformanceModel): number {
  const scores = model.gaps.map((g) => g.confidence.score ?? (g.confidence.category === "measured" ? 1 : g.confidence.category === "unknown" ? 0 : 0.5));
  return scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0.4;
}
function completeness(model: AthletePerformanceModel): number {
  const present = KEY_METRICS.filter((m) => model.gaps.find((g) => g.metricId === m)?.currentValue != null).length;
  return present / KEY_METRICS.length;
}
function consistency(history?: number[]): number {
  if (!history || history.length < 2) return 0.35;
  const deltas: number[] = [];
  for (let i = 1; i < history.length; i++) deltas.push(history[i] - history[i - 1]);
  const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
  const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / deltas.length;
  // Lower variance of improvement steps → more consistent → higher confidence.
  return clamp01(1 - Math.min(1, Math.sqrt(variance) / 0.15));
}
function isRapidlyImproving(history: number[]): boolean {
  if (history.length < 2) return false;
  const recent = history[history.length - 1] - history[history.length - 2];
  return Math.abs(recent) > 0.2; // >0.2 s jump between recent PBs
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
