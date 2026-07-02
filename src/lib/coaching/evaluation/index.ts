import type { MetricEvaluation, MetricStatus } from "../types";
import { METRIC_THRESHOLDS } from "../knowledge/thresholds";

function getStatusRank(status: MetricStatus): number {
  switch (status) {
    case "elite":
      return 4;
    case "good":
      return 3;
    case "watch":
      return 2;
    case "poor":
      return 1;
  }
}

export function evaluateMetric(
  metricId: string,
  value: number | null | undefined
): MetricEvaluation | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  const threshold = METRIC_THRESHOLDS[metricId];

  if (!threshold) {
    return null;
  }

  const matchingBand = threshold.bands.find(
    (band) => value >= band.min && value <= band.max
  );

  if (!matchingBand) {
    return null;
  }

  return {
    id: threshold.id,
    label: threshold.label,
    value,
    unit: threshold.unit,
    status: matchingBand.status,
    targetRange: threshold.targetRange,
    meaning: matchingBand.meaning,
    usedIn: threshold.usedIn,
  };
}

export function evaluateMetrics(
  metrics: Record<string, number | null | undefined>
): MetricEvaluation[] {
  return Object.entries(metrics)
    .map(([metricId, value]) => evaluateMetric(metricId, value))
    .filter((evaluation): evaluation is MetricEvaluation => evaluation !== null)
    .sort((a, b) => getStatusRank(b.status) - getStatusRank(a.status));
}