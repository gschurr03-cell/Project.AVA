import { analysisMetricsSchema, type AnalysisMetrics } from "@/lib/biomechanics/types";

import { generateCoachingReport } from "./report";

/** Chart-ready trend series derived from an athlete's completed analyses. */
export interface AthleteTrendData {
  labels: string[];
  techniqueScores: number[];
  groundContactTimes: number[];
  flightTimes: number[];
  strideFrequencies: number[];
}

/** Minimal shape of a completed analysis row this helper needs. */
export interface TrendAnalysisInput {
  id: string;
  created_at: string;
  metrics: unknown;
}

/** Map validated analysis metrics onto the coaching engine's metric keys. */
function toCoachingMetrics(data: AnalysisMetrics) {
  return {
    stepFrequency: data.strideFrequencyHz,
    groundContactTime: data.groundContactTimeMs,
    flightTime: data.flightTimeMs,
    strideLength: data.avgStrideLengthM,
  };
}

/** Short month/day label for a session, e.g. "Jul 2". */
function formatLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Convert a list of completed analyses into chart-ready trend series. Pure: no
 * side effects, no I/O (the input array is copied, never mutated). Analyses whose
 * `metrics` fail validation are skipped entirely, so every returned array stays
 * the same length and index-aligned. Series run oldest → newest.
 */
export function buildAthleteTrends(analyses: TrendAnalysisInput[]): AthleteTrendData {
  const trends: AthleteTrendData = {
    labels: [],
    techniqueScores: [],
    groundContactTimes: [],
    flightTimes: [],
    strideFrequencies: [],
  };

  const sorted = [...analyses].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const analysis of sorted) {
    const parsed = analysisMetricsSchema.safeParse(analysis.metrics);
    if (!parsed.success) continue;

    const report = generateCoachingReport(toCoachingMetrics(parsed.data), analysis.id);

    trends.labels.push(formatLabel(analysis.created_at));
    trends.techniqueScores.push(report.techniqueScore);
    trends.groundContactTimes.push(parsed.data.groundContactTimeMs);
    trends.flightTimes.push(parsed.data.flightTimeMs);
    trends.strideFrequencies.push(parsed.data.strideFrequencyHz);
  }

  return trends;
}
