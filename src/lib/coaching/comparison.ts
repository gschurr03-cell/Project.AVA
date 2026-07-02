import type {
  CoachingComparisonReport,
  CoachingReport,
  ComparisonDirection,
  MetricComparison,
  TechniqueScoreComparison,
} from "./types";

/**
 * Compare a current {@link CoachingReport} against a previous one to surface
 * progress across sessions. Pure and non-mutating: reads both reports and
 * returns a new comparison. Only metrics present in *both* reports are compared.
 */

/** Below this absolute score change, the technique score is "unchanged". */
const SCORE_UNCHANGED_THRESHOLD = 1;
/** Below this absolute metric change, a metric is "unchanged". */
const METRIC_UNCHANGED_THRESHOLD = 0.01;

/** Metrics where a lower value is the improvement (everything else: higher). */
const LOWER_IS_BETTER = new Set<string>(["groundContactTime"]);

const round2 = (n: number): number => Math.round(n * 100) / 100;

function scoreDirection(delta: number): ComparisonDirection {
  if (Math.abs(delta) < SCORE_UNCHANGED_THRESHOLD) return "unchanged";
  return delta > 0 ? "improved" : "declined";
}

function metricDirection(metricId: string, delta: number): ComparisonDirection {
  if (Math.abs(delta) < METRIC_UNCHANGED_THRESHOLD) return "unchanged";
  const improved = LOWER_IS_BETTER.has(metricId) ? delta < 0 : delta > 0;
  return improved ? "improved" : "declined";
}

export function compareCoachingReports(
  current: CoachingReport,
  previous: CoachingReport,
): CoachingComparisonReport {
  const scoreDelta = current.techniqueScore - previous.techniqueScore;
  const techniqueScore: TechniqueScoreComparison = {
    previousScore: previous.techniqueScore,
    currentScore: current.techniqueScore,
    delta: scoreDelta,
    direction: scoreDirection(scoreDelta),
  };

  const previousById = new Map(previous.metricEvaluations.map((evaluation) => [evaluation.id, evaluation]));

  const metrics: MetricComparison[] = [];
  for (const currentMetric of current.metricEvaluations) {
    const previousMetric = previousById.get(currentMetric.id);
    if (!previousMetric) continue; // only compare metrics shared by both reports

    const delta = currentMetric.value - previousMetric.value;
    metrics.push({
      metricId: currentMetric.id,
      label: currentMetric.label,
      previousValue: previousMetric.value,
      currentValue: currentMetric.value,
      delta: round2(delta),
      unit: currentMetric.unit,
      direction: metricDirection(currentMetric.id, delta),
    });
  }

  return { techniqueScore, metrics };
}
