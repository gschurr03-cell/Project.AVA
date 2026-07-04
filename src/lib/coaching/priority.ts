import type { CoachingInsight, CoachingPriority } from "./types";

export function buildPriorities(
  insights: CoachingInsight[],
  limit = 3
): CoachingPriority[] {
  return insights
    .filter(
      (insight) =>
        insight.severity === "watch" || insight.severity === "poor"
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((insight) => ({
      id: `${insight.id}-priority`,
      title: insight.title,
      impact:
        insight.priority >= 85
          ? "high"
          : insight.priority >= 60
            ? "medium"
            : "low",
      priority: insight.priority,
      recommendation: insight.recommendation,
      evidence: insight.evidence,
    }));
}