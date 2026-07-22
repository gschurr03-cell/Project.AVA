/**
 * Athlete Blueprint Engine (Phase 5) — public surface + orchestration.
 *
 * Produces an individualized {@link AthleteBlueprint}: body profile, per-metric target
 * ranges, strength benchmarks, a similar-build elite comparison, development scores, and
 * prioritized development areas — all from THIS athlete's own inputs, all confidence-
 * tagged, none presented as requirements. Future systems (progress dashboard, coach
 * reports, performance potential, season planning) consume this. Pure + deterministic.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type { AthleteBlueprint } from "./models";
import { BLUEPRINT_CONFIG_VERSION } from "./config";
import { buildBlueprintMetrics, estimateLevel, TARGET_MODEL_VERSION } from "./targetModel";
import { buildBodyProfile, buildStrengthBenchmarks, BODY_PROFILE_VERSION, STRENGTH_BENCHMARK_VERSION } from "./bodyProfile";
import { buildEliteComparison, ELITE_COMPARISON_VERSION } from "./eliteComparison";
import {
  buildDevelopmentAreas,
  buildProgressScores,
  overallCompletion,
  DEVELOPMENT_SCORE_VERSION,
} from "./developmentScore";

export * from "./models";
export * from "./config";
export * from "./targetModel";
export * from "./bodyProfile";
export * from "./eliteComparison";
export * from "./developmentScore";

export const ATHLETE_BLUEPRINT_VERSION = "athlete-blueprint-v1" as const;

export interface AthleteBlueprintInput {
  athleteId?: string | null;
  /** Anthropometrics + profile (height, trochanter, leg length, mass, sex, age, training age, event, PBs). */
  context: AthleteContext;
  /** Goal-derived required average velocity (from Phase 1), for velocity targets. */
  requiredAvgVelocityMps: number | null;
  /** Current metric readings keyed by metricId, plus optional `symmetry` (% difference). */
  currentMetrics: Record<string, number | null | undefined>;
  now?: Date;
}

export function buildAthleteBlueprint(input: AthleteBlueprintInput): AthleteBlueprint {
  const level = estimateLevel(input.context);

  const metrics = buildBlueprintMetrics(input.currentMetrics, {
    context: input.context,
    requiredAvgVelocityMps: input.requiredAvgVelocityMps,
    level,
  });
  const scores = buildProgressScores(metrics);
  const developmentAreas = buildDevelopmentAreas(scores);

  return {
    version: ATHLETE_BLUEPRINT_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    bodyProfile: buildBodyProfile(input.context, level),
    performanceBlueprint: {
      metrics,
      scores,
      overallCompletionPct: overallCompletion(scores),
    },
    strengthBenchmarks: buildStrengthBenchmarks(input.context, level),
    eliteComparison: buildEliteComparison(input.context),
    developmentAreas,
    provenance: {
      engineVersions: {
        targetModel: TARGET_MODEL_VERSION,
        bodyProfile: BODY_PROFILE_VERSION,
        strengthBenchmark: STRENGTH_BENCHMARK_VERSION,
        eliteComparison: ELITE_COMPARISON_VERSION,
        developmentScore: DEVELOPMENT_SCORE_VERSION,
      },
      configVersion: BLUEPRINT_CONFIG_VERSION,
    },
  };
}
