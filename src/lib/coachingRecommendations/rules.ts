import type { Limiter, LimiterType } from "@/lib/limitingFactors";
import { RECOMMENDATION_LIBRARY as L } from "./library";
import type { RecommendationTemplate } from "./types";

type Rule = (limiter: Limiter, all: Limiter[]) => RecommendationTemplate[];

const rules: Record<LimiterType, Rule> = {
  step_length_below_expectation: (_l, all) => [
    L.projection,
    all.some((x) => x.type === "velocity_limitation") ? L.resistedProjection : L.lengthAssessment,
    L.lengthAssessment,
  ],
  step_length_above_expectation: () => [L.reduceReaching, L.velocityConsistency],
  step_frequency_below_expectation: () => [L.recoveryRhythm, L.reactiveAssessment],
  step_frequency_above_expectation: () => [L.preserveDisplacement, L.velocityConsistency],
  step_length_asymmetry: () => [L.sideReview, L.unilateralAssessment, L.asymmetryMonitor],
  step_frequency_asymmetry: () => [L.sideReview, L.unilateralAssessment, L.asymmetryMonitor],
  velocity_limitation: (limiter) => {
    const text = `${limiter.title} ${limiter.summary}`.toLowerCase();
    if (text.includes("combined")) return [L.combinedOrganization, L.broadAssessment];
    if (text.includes("frequency")) return [L.recoveryRhythm, L.reactiveAssessment];
    return [L.projection, L.resistedProjection];
  },
  peak_velocity_limitation: () => [L.combinedOrganization, L.broadAssessment],
  peak_vs_average_gap: () => [L.velocityConsistency],
};

export function templatesForLimiter(limiter: Limiter, all: Limiter[]): RecommendationTemplate[] {
  if (limiter.status !== "detected") return [];
  const seen = new Set<string>();
  return rules[limiter.type](limiter, all).filter((item) => !seen.has(item.key) && !!seen.add(item.key)).slice(0, 3);
}
