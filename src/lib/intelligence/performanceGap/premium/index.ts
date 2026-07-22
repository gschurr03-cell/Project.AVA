/**
 * AVA Coaching Premium & Adaptive Intelligence (Phase 12) — public surface + orchestration.
 *
 * The premium coaching companion: it GENERATES individualized recommendations, training
 * blocks, sessions, and weekly/monthly plans; adapts after every analysis; estimates load;
 * plans toward goals and competitions; explains at any depth; and keeps the coach in control
 * through overrides. Explainable, evidence-aware, coach-reviewable — and it never alters
 * measured biomechanics or guarantees outcomes. Pure + deterministic + serializable. Consumes
 * Phases 1, 3–8, 10, 11.
 */

import type { PremiumCoachingPlan } from "./models";
import { PREMIUM_CONFIG_VERSION } from "./config";
import { buildPremiumRecommendations, PREMIUM_RECOMMENDATION_VERSION } from "./recommendation";
import { generateTrainingBlock, BLOCK_GENERATOR_VERSION } from "./blocks";
import { SESSION_GENERATOR_VERSION } from "./sessions";
import { estimateLoad, LOAD_ENGINE_VERSION } from "./load";
import { decideAdaptation, ADAPTATION_ENGINE_VERSION } from "./adaptation";
import { buildGoalPlan, GOAL_PLANNING_VERSION } from "./goals";
import { buildCompetitionPlan, COMPETITION_ENGINE_VERSION } from "./competition";
import { buildWeeklyPlan, PLANNING_ENGINE_VERSION } from "./planning";
import { COMMUNICATION_ENGINE_VERSION } from "./communication";
import { PREMIUM_OVERRIDE_VERSION } from "./override";
import { daysToCompetition, type PremiumInput } from "./context";

export * from "./models";
export * from "./config";
export * from "./context";
export * from "./recommendation";
export * from "./override";
export * from "./blocks";
export * from "./sessions";
export * from "./load";
export * from "./adaptation";
export * from "./goals";
export * from "./competition";
export * from "./planning";
export * from "./communication";

export const PREMIUM_COACHING_VERSION = "premium-coaching-v1" as const;

/** One-call: build the full premium coaching plan from the athlete's prior-phase outputs. */
export function buildPremiumCoachingPlan(input: PremiumInput): PremiumCoachingPlan {
  const load = estimateLoad(input);
  const block = generateTrainingBlock(input);
  const recommendations = buildPremiumRecommendations(input);
  const weeklyPlan = buildWeeklyPlan(input);
  const adaptiveDecision = decideAdaptation(input, load);
  const goalPlan = buildGoalPlan(input);
  const competitionPlan = daysToCompetition(input) != null ? buildCompetitionPlan(input) : null;

  return {
    version: PREMIUM_COACHING_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    block,
    recommendations,
    weeklyPlan,
    adaptiveDecision,
    load,
    goalPlan,
    competitionPlan,
    provenance: {
      engineVersions: {
        recommendation: PREMIUM_RECOMMENDATION_VERSION,
        blocks: BLOCK_GENERATOR_VERSION,
        sessions: SESSION_GENERATOR_VERSION,
        load: LOAD_ENGINE_VERSION,
        adaptation: ADAPTATION_ENGINE_VERSION,
        goals: GOAL_PLANNING_VERSION,
        competition: COMPETITION_ENGINE_VERSION,
        planning: PLANNING_ENGINE_VERSION,
        communication: COMMUNICATION_ENGINE_VERSION,
        override: PREMIUM_OVERRIDE_VERSION,
      },
      configVersion: PREMIUM_CONFIG_VERSION,
    },
  };
}
