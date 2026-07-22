/**
 * Athlete Intelligence — Performance Gap subsystem (Part A).
 *
 * The single entry point that composes the five engines into a serializable,
 * UI-INDEPENDENT {@link AthletePerformanceModel}. Every future AVA coaching feature
 * (Path To Goal, What-If Simulator, weekly tracking, coach reports, season planning)
 * consumes this output. Pure + deterministic (inject `now` for reproducible tests).
 *
 * Extension points (declared, not implemented): the metric registry's
 * `externalSources` fields reserve clean seams for AVA Lift, Motion IQ, force plates,
 * Freelap, Brower, jump/strength testing, and wearables to feed measured metrics in.
 */

import type { AthletePerformanceModel } from "./models";
import { CONFIG_VERSION } from "./config";
import {
  buildGoalRequirement,
  GOAL_REQUIREMENT_ENGINE_VERSION,
  type MetricReadings,
} from "./goalRequirement";
import { buildPerformanceGaps, PERFORMANCE_GAP_ENGINE_VERSION } from "./performanceGap";
import { prioritizeLimiters, LIMITER_PRIORITIZATION_ENGINE_VERSION } from "./limiterPrioritization";
import { buildPerformanceTrees, PERFORMANCE_TREE_ENGINE_VERSION } from "./performanceTree";
import {
  estimateAllRecommendationImpacts,
  RECOMMENDATION_IMPACT_ENGINE_VERSION,
} from "./recommendationImpact";

export * from "./models";
export * from "./config";
export * from "./goalRequirement";
export * from "./performanceGap";
export * from "./limiterPrioritization";
export * from "./performanceTree";
export * from "./recommendationImpact";

export const ATHLETE_INTELLIGENCE_VERSION = "athlete-intelligence-v1" as const;

/** Everything the subsystem needs. Sprint metrics are keyed by registry metricId. */
export interface AthleteIntelligenceInput {
  athleteId?: string | null;
  /** Race distance the goal is stated at (e.g. 100). */
  distanceM: number;
  currentTimeS: number | null;
  goalTimeS: number | null;
  /** Current metric readings keyed by metricId (see METRIC_REGISTRY). */
  metrics: MetricReadings;
  /** Which metric ids are DIRECTLY measured (vs estimated). Defaults to all present. */
  measuredMetricIds?: string[];
  /** Injected clock for deterministic tests. */
  now?: Date;
  /** Optional subset of recommendations to score (defaults to the full catalog). */
  recommendationIds?: string[];
}

export function buildAthletePerformanceModel(input: AthleteIntelligenceInput): AthletePerformanceModel {
  const goalRequirement = buildGoalRequirement({
    distanceM: input.distanceM,
    currentTimeS: input.currentTimeS,
    goalTimeS: input.goalTimeS,
    currentMetrics: input.metrics,
  });

  const gaps = buildPerformanceGaps(goalRequirement);
  const priorities = prioritizeLimiters(gaps);

  const measuredSet = new Set(
    input.measuredMetricIds ??
      Object.entries(input.metrics)
        .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
        .map(([k]) => k),
  );
  const trees = buildPerformanceTrees(
    priorities.map((p) => p.metricId),
    measuredSet,
  );

  const recommendationImpacts = estimateAllRecommendationImpacts({
    target: goalRequirement.target,
    currentStrideLengthM: num(input.metrics.strideLength),
    currentStrideFrequencyHz: num(input.metrics.strideFrequency),
    currentPeakVelocityMps: num(input.metrics.peakVelocity),
    recommendationIds: input.recommendationIds,
  });

  return {
    modelVersion: ATHLETE_INTELLIGENCE_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    target: goalRequirement.target,
    goalRequirement,
    gaps,
    priorities,
    trees,
    recommendationImpacts,
    provenance: {
      engineVersions: {
        goalRequirement: GOAL_REQUIREMENT_ENGINE_VERSION,
        performanceGap: PERFORMANCE_GAP_ENGINE_VERSION,
        limiterPrioritization: LIMITER_PRIORITIZATION_ENGINE_VERSION,
        performanceTree: PERFORMANCE_TREE_ENGINE_VERSION,
        recommendationImpact: RECOMMENDATION_IMPACT_ENGINE_VERSION,
      },
      configVersion: CONFIG_VERSION,
    },
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
