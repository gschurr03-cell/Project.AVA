export interface BenchmarkTrendPoint {
  sessionId: string; capturedAt: string; season: string;
  phase: string; metric: string; value: number;
  compatibilityKey: string; confidence: "high" | "moderate";
}
export interface ComparisonTrend {
  kind: "personal_improvement" | "season" | "lifetime" | "phase" | "mechanical" | "velocity" | "consistency";
  metric: string; points: BenchmarkTrendPoint[];
  direction: "increasing" | "decreasing" | "stable" | "insufficient";
  change: number | null; consistency: number | null;
  current: number | null; best: number | null; rollingBaseline: number | null;
  compatibilityKey: string | null; warnings: string[];
}
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const sd = (values: number[]) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

export function buildComparisonTrend(
  rawPoints: BenchmarkTrendPoint[], options: {
    kind: ComparisonTrend["kind"]; metric: string; season?: string; phase?: string;
  },
): ComparisonTrend {
  const metricPoints = rawPoints.filter((point) => point.metric === options.metric);
  const keyCounts = new Map<string, number>();
  metricPoints.forEach((point) => keyCounts.set(point.compatibilityKey, (keyCounts.get(point.compatibilityKey) ?? 0) + 1));
  const key = [...keyCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  let points = metricPoints.filter((point) => point.compatibilityKey === key);
  if (options.season) points = points.filter((point) => point.season === options.season);
  if (options.phase) points = points.filter((point) => point.phase === options.phase);
  points = points.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.sessionId.localeCompare(b.sessionId));
  const values = points.map((point) => point.value);
  const change = values.length >= 2 ? Number((values.at(-1)! - values[0]).toFixed(4)) : null;
  const relativeVariation = values.length >= 2 ? sd(values) / Math.max(Math.abs(mean(values)), 1e-9) : null;
  return {
    kind: options.kind, metric: options.metric, points,
    direction: change == null ? "insufficient" : Math.abs(change) < 1e-9 ? "stable" : change > 0 ? "increasing" : "decreasing",
    change, consistency: relativeVariation == null ? null : Number((Math.max(0, 1 - relativeVariation) * 100).toFixed(1)),
    current: values.at(-1) ?? null,
    best: values.length ? Math.max(...values) : null,
    rollingBaseline: values.length
      ? Number(mean(values.slice(-Math.min(5, values.length))).toFixed(4)) : null,
    compatibilityKey: key,
    warnings: [
      ...(keyCounts.size > 1 ? [`${keyCounts.size - 1} incompatible trend group(s) excluded.`] : []),
      ...(points.length < 2 ? ["At least two compatible points are required."] : []),
    ],
  };
}
