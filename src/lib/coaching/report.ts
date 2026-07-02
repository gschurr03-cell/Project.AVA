import { generateCoachingInsights } from "./engine";
import { evaluateMetrics } from "./evaluation";
import { buildPriorities } from "./priority";
import type { CoachingReport } from "./types";

export function generateCoachingReport(
  metrics: Record<string, number | null | undefined>,
  techniqueScore = 0,
  sessionId?: string
): CoachingReport {
  const evaluations = evaluateMetrics(metrics);
  const insights = generateCoachingInsights(metrics, evaluations);
  const priorities = buildPriorities(insights);

  const summary =
    insights.length > 0
      ? insights[0].explanation
      : "No coaching insights were generated.";

  return {
    sessionId,
    techniqueScore,
    summary,
    metricEvaluations: evaluations,
    insights,
    priorities,
  };
}