import { analysisMetricsSchema, type AnalysisMetrics } from "@/lib/biomechanics/types";

import { summarizeHistory } from "./history";
import { generateCoachingReport } from "./report";

function toCoachingMetrics(data: AnalysisMetrics) {
  return {
    stepFrequency: data.strideFrequencyHz,
    groundContactTime: data.groundContactTimeMs,
    flightTime: data.flightTimeMs,
    strideLength: data.avgStrideLengthM,
  };
}

export function buildAthleteHistory(
  analyses: {
    id: string;
    metrics: unknown;
  }[],
) {
  const reports = analyses
    .map((analysis) => {
      const parsed = analysisMetricsSchema.safeParse(analysis.metrics);

      if (!parsed.success) return null;

      return generateCoachingReport(
        toCoachingMetrics(parsed.data),
        analysis.id,
      );
    })
    .filter((report): report is NonNullable<typeof report> => report !== null);

  return {
    reports,
    summary: summarizeHistory(reports),
  };
}
