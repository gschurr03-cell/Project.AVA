/**
 * Scenario Confidence model (Phase 9). A simulation's confidence depends on measurement
 * quality, evidence strength, how far the scenario projects, athlete similarity, the
 * confidence of the activated dependencies, research support, and historical
 * consistency. Larger adjustments and thinner data lower confidence. Pure + deterministic.
 */

import type { AthleteBlueprint } from "../blueprint/models";
import type { DependencyActivation, ScenarioConfidence } from "./models";
import { SIM_CONFIDENCE_WEIGHTS, PROJECTION_DISTANCE_SCALE } from "./config";

export const SCENARIO_CONFIDENCE_VERSION = "ava-simulation-confidence-v1" as const;

export interface ScenarioConfidenceInput {
  blueprint: AthleteBlueprint;
  activations: DependencyActivation[];
  /** Summed absolute relative change across all adjusted metrics. */
  adjustmentMagnitude: number;
  improvementHistory?: number[];
}

export function computeScenarioConfidence(input: ScenarioConfidenceInput): ScenarioConfidence {
  const measurementQuality = avg(
    input.blueprint.performanceBlueprint.metrics.map((m) => m.targetRange.confidence.score).filter((s): s is number => s != null),
    0.6,
  );
  const activationScores = input.activations.map((a) => a.confidence.score).filter((s): s is number => s != null);
  const evidenceStrength = activationScores.length ? avg(activationScores, 0.5) : 0.6;
  const dependencyConfidence = input.activations.length ? avg(input.activations.map((a) => a.pathCoupling), 0.5) : 0.75;
  const projectionDistance = 1 / (1 + input.adjustmentMagnitude / PROJECTION_DISTANCE_SCALE);
  const athleteSimilarity = input.blueprint.eliteComparison?.similarity ?? 0.5;
  const researchSupport = activationScores.length ? avg(activationScores, 0.55) : 0.55;
  const historicalConsistency = consistency(input.improvementHistory);

  const parts: { factor: keyof typeof SIM_CONFIDENCE_WEIGHTS; value: number }[] = [
    { factor: "measurementQuality", value: measurementQuality },
    { factor: "evidenceStrength", value: evidenceStrength },
    { factor: "projectionDistance", value: projectionDistance },
    { factor: "athleteSimilarity", value: athleteSimilarity },
    { factor: "dependencyConfidence", value: dependencyConfidence },
    { factor: "researchSupport", value: researchSupport },
    { factor: "historicalConsistency", value: historicalConsistency },
  ];

  let score = 0;
  const factors = parts.map((p) => {
    const contribution = clamp01(p.value) * SIM_CONFIDENCE_WEIGHTS[p.factor];
    score += contribution;
    return { factor: p.factor, contribution: round(contribution) };
  });
  score = clamp01(score);

  return {
    level: score >= 0.66 ? "high" : score >= 0.42 ? "moderate" : "low",
    score: round(score),
    factors,
  };
}

/** Lower coefficient of variation in recent times → higher consistency. */
function consistency(history?: number[]): number {
  if (!history || history.length < 3) return 0.55;
  const deltas: number[] = [];
  for (let i = 1; i < history.length; i++) deltas.push(history[i] - history[i - 1]);
  const mean = avg(history, 0);
  if (mean === 0) return 0.55;
  const variance = deltas.reduce((s, d) => s + d * d, 0) / deltas.length;
  const cv = Math.sqrt(variance) / Math.abs(mean);
  return clamp01(1 - cv * 4);
}

function avg(xs: number[], fallback: number): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : fallback;
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
