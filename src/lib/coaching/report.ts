import { generateCoachingInsights } from "./engine";
import { evaluateMetrics } from "./evaluation";
import { buildPriorities } from "./priority";
import { calculateTechniqueScore } from "./score";
import { sanitizeCoachingMetrics } from "./sanitize";
import type { CoachingReport } from "./types";

export function generateCoachingReport(
  metrics: Record<string, number | null | undefined>,
  sessionId?: string
): CoachingReport {
  // Drop calibration-dependent zero metrics so they aren't scored as "poor".
  const sanitizedMetrics = sanitizeCoachingMetrics(metrics);
  const evaluations = evaluateMetrics(sanitizedMetrics);
  const insights = generateCoachingInsights(sanitizedMetrics, evaluations);
  const priorities = buildPriorities(insights);
  const technique = calculateTechniqueScore(evaluations);

  const summary =
    insights.length > 0
      ? insights[0].explanation
      : "No coaching insights were generated.";

  return {
    sessionId,
    techniqueScore: technique.score,
    techniqueLabel: technique.label,
    techniqueBreakdown: technique.breakdown,
    summary,
    metricEvaluations: evaluations,
    insights,
    priorities,
  };
}
