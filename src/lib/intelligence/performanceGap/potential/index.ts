/**
 * Performance Potential Engine (Phase 6) — public surface + orchestration.
 *
 * Estimates current capacity, near-term and long-term potential (as ranges, never
 * single numbers), an individualized ceiling, development scenarios, the bottlenecks
 * that constrain higher projections, and the explicit uncertainty behind it all. An
 * informed projection — never a guarantee. Pure + deterministic.
 *
 * Consumes Phase 1 (gaps/target), Phase 3 (root causes), Phase 4 (sensitivity),
 * Phase 5 (blueprint → ceiling).
 */

import type { AthletePerformanceModel } from "../models";
import type { AthleteBlueprint } from "../blueprint/models";
import type { SensitivityScore } from "../dependency/models";
import type { ReasoningExplanation } from "../rootCause/models";
import type { AthleteContext } from "../rootCause/athleteContext";
import type { PerformancePotential } from "./models";
import { POTENTIAL_CONFIG_VERSION } from "./config";
import { computeCeiling, CEILING_ENGINE_VERSION } from "./ceiling";
import {
  computeProjectionConfidence,
  identifyUncertainty,
  PROJECTION_CONFIDENCE_VERSION,
} from "./confidence";
import { buildCurrentCapacity, buildProjection, PROJECTION_ENGINE_VERSION } from "./projection";
import { identifyBottlenecks, BOTTLENECK_ENGINE_VERSION } from "./bottlenecks";
import { buildScenarios, SCENARIO_ENGINE_VERSION } from "./scenarios";

export * from "./models";
export * from "./config";
export * from "./ceiling";
export * from "./confidence";
export * from "./projection";
export * from "./bottlenecks";
export * from "./scenarios";

export const PERFORMANCE_POTENTIAL_VERSION = "performance-potential-v1" as const;

export interface PerformancePotentialInput {
  athleteId?: string | null;
  distanceM: number;
  currentTimeS: number | null;
  goalTimeS: number | null;
  currentPeakVelocityMps?: number | null;
  model: AthletePerformanceModel;
  blueprint: AthleteBlueprint;
  sensitivity?: SensitivityScore[];
  rootCauses?: ReasoningExplanation[];
  context?: AthleteContext;
  improvementHistory?: number[];
  now?: Date;
}

export function buildPerformancePotential(input: PerformancePotentialInput): PerformancePotential {
  const currentAvgV = input.currentTimeS && input.currentTimeS > 0 ? input.distanceM / input.currentTimeS : null;
  const peakV =
    num(input.currentPeakVelocityMps) ??
    num(input.model.gaps.find((g) => g.metricId === "peakVelocity")?.currentValue);

  const currentConfidence = computeProjectionConfidence({ model: input.model, blueprint: input.blueprint, improvementHistory: input.improvementHistory, horizon: "current" });
  const nearConfidence = computeProjectionConfidence({ model: input.model, blueprint: input.blueprint, improvementHistory: input.improvementHistory, horizon: "near_term" });
  const longConfidence = computeProjectionConfidence({ model: input.model, blueprint: input.blueprint, improvementHistory: input.improvementHistory, horizon: "long_term" });

  const ceiling = computeCeiling({
    distanceM: input.distanceM,
    currentAvgVelocityMps: currentAvgV,
    currentPeakVelocityMps: peakV,
    blueprint: input.blueprint,
    confidence: longConfidence,
  });

  const goalAvgV = input.goalTimeS && input.goalTimeS > 0 ? input.distanceM / input.goalTimeS : null;
  const goalBeyondCeiling = goalAvgV != null && ceiling.ceilingVelocityMps != null && goalAvgV > ceiling.ceilingVelocityMps + 1e-9;

  const bottlenecks = identifyBottlenecks({ model: input.model, sensitivity: input.sensitivity, rootCauses: input.rootCauses });
  const leadingRootCauseLabel = input.rootCauses?.[0]?.rootCauses[0]?.label ?? null;

  const nearTerm = buildProjection({ horizon: "near_term", distanceM: input.distanceM, currentAvgV, ceilingAvgV: ceiling.ceilingVelocityMps, confidence: nearConfidence, model: input.model, blueprint: input.blueprint, leadingRootCauseLabel });
  const longTerm = buildProjection({ horizon: "long_term", distanceM: input.distanceM, currentAvgV, ceilingAvgV: ceiling.ceilingVelocityMps, confidence: longConfidence, model: input.model, blueprint: input.blueprint, leadingRootCauseLabel });

  const uncertainty = identifyUncertainty({ model: input.model, blueprint: input.blueprint, improvementHistory: input.improvementHistory, goalBeyondCeiling });

  const scenarios = buildScenarios({
    distanceM: input.distanceM,
    currentTimeS: input.currentTimeS,
    currentAvgV,
    ceilingAvgV: ceiling.ceilingVelocityMps,
    nearConfidence,
    longConfidence,
    bottlenecks,
    uncertainty,
  });

  return {
    version: PERFORMANCE_POTENTIAL_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    currentCapacity: buildCurrentCapacity(input.distanceM, currentAvgV, currentConfidence),
    nearTerm,
    longTerm,
    ceiling,
    scenarios,
    bottlenecks,
    uncertainty,
    provenance: {
      engineVersions: {
        ceiling: CEILING_ENGINE_VERSION,
        confidence: PROJECTION_CONFIDENCE_VERSION,
        projection: PROJECTION_ENGINE_VERSION,
        bottlenecks: BOTTLENECK_ENGINE_VERSION,
        scenarios: SCENARIO_ENGINE_VERSION,
      },
      configVersion: POTENTIAL_CONFIG_VERSION,
    },
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
