import type { CoachingInsight, MetricEvaluation } from "./types";
import { COACHING_RULES } from "./rules";

export function generateCoachingInsights(
  metrics: Record<string, number | null | undefined>,
  evaluations: MetricEvaluation[]
): CoachingInsight[] {
  return COACHING_RULES
    .map((rule) =>
      rule.evaluate({
        metrics,
        evaluations,
      })
    )
    .filter((insight): insight is CoachingInsight => insight !== null)
    .sort((a, b) => b.priority - a.priority);
}
