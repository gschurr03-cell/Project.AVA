import { PROJECTION_POLICY } from "./policy";
import type { MetricHistoryPoint, TrajectoryType } from "./contracts";

export interface TrajectoryAnalysis {
  points: MetricHistoryPoint[];
  compatibilityKey: string | null;
  currentValue: number | null;
  slopePerDay: number | null;
  residualStandardDeviation: number | null;
  relativeChangePer30Days: number | null;
  trajectoryType: TrajectoryType;
  excludedPointCount: number;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function analyzeTrajectory(
  rawHistory: MetricHistoryPoint[], targetMetric: string, higherIsBetter: boolean,
): TrajectoryAnalysis {
  const matching = rawHistory.filter((point) => point.metric === targetMetric);
  const counts = new Map<string, number>();
  matching.forEach((point) => counts.set(point.compatibilityKey, (counts.get(point.compatibilityKey) ?? 0) + 1));
  const compatibilityKey = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const points = matching
    .filter((point) => point.compatibilityKey === compatibilityKey)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.sessionId.localeCompare(b.sessionId));
  const unavailable = {
    points, compatibilityKey, currentValue: points.at(-1)?.value ?? null,
    slopePerDay: null, residualStandardDeviation: null, relativeChangePer30Days: null,
    trajectoryType: "unknown" as const, excludedPointCount: matching.length - points.length,
  };
  if (points.length < PROJECTION_POLICY.minimumHistoryPoints) return unavailable;

  const origin = Date.parse(points[0].capturedAt);
  const x = points.map((point) => (Date.parse(point.capturedAt) - origin) / 86_400_000);
  const y = points.map((point) => point.value);
  if (x.at(-1) === 0) return unavailable;
  const xMean = mean(x), yMean = mean(y);
  const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  if (denominator === 0) return unavailable;
  const slopePerDay = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0) / denominator;
  const intercept = yMean - slopePerDay * xMean;
  const residualStandardDeviation = Math.sqrt(mean(y.map((value, index) => (value - (intercept + slopePerDay * x[index])) ** 2)));
  const scale = Math.max(Math.abs(yMean), 1e-9);
  const signedImprovement = slopePerDay * (higherIsBetter ? 1 : -1);
  const relativeChangePer30Days = (signedImprovement * 30) / scale;
  const residualRatio = residualStandardDeviation / scale;
  let trajectoryType: TrajectoryType;
  if (residualRatio > PROJECTION_POLICY.inconsistentResidualRatio) trajectoryType = "inconsistent";
  else if (relativeChangePer30Days < -PROJECTION_POLICY.plateauRelativeChangePer30Days) trajectoryType = "regression";
  else if (Math.abs(relativeChangePer30Days) <= PROJECTION_POLICY.plateauRelativeChangePer30Days) trajectoryType = "plateau";
  else if (relativeChangePer30Days >= PROJECTION_POLICY.rapidRelativeChangePer30Days) trajectoryType = "rapid_improvement";
  else trajectoryType = "steady_improvement";
  return {
    points, compatibilityKey, currentValue: y.at(-1)!, slopePerDay,
    residualStandardDeviation, relativeChangePer30Days, trajectoryType,
    excludedPointCount: matching.length - points.length,
  };
}

