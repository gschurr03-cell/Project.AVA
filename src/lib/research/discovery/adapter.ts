import { explainableAnalysisResultSchema } from "@/lib/analysis/resultContract";
import type { ResearchSample } from "./contracts";

export interface DiscoveryAnalysisRow {
  id: string;
  session_id: string;
  completed_at: string | null;
  result_payload: unknown;
  experimental: boolean;
  validation_status: string;
  compatibility_group: string;
  timing_compatibility_group: string;
  analysis_pipeline_version: string | null;
  metric_schema_version: string | null;
  model_version: string;
  sessions: { athlete_id: string } | Array<{ athlete_id: string }> | null;
}

export function toResearchSample(row: DiscoveryAnalysisRow): ResearchSample | null {
  const result = explainableAnalysisResultSchema.safeParse(row.result_payload);
  if (!result.success || row.experimental || row.validation_status !== "validated") return null;
  const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
  if (!session?.athlete_id || !row.completed_at) return null;
  const metrics = result.data.measurements.flatMap((measurement) =>
    measurement.result.status === "available" &&
    measurement.result.value != null &&
    !measurement.result.experimental &&
    ["high", "moderate"].includes(measurement.result.confidenceLabel ?? "")
      ? [{
          key: measurement.metricId, value: measurement.result.value,
          unit: measurement.result.unit,
          confidence: measurement.result.confidenceLabel as "high" | "moderate",
          phase: measurement.phase,
        }]
      : [],
  );
  if (!metrics.length) return null;
  return {
    analysisId: row.id, athleteId: session.athlete_id, sessionId: row.session_id,
    capturedAt: row.completed_at, experimental: false, metrics,
    compatibilityKey: [
      row.model_version, row.analysis_pipeline_version, row.metric_schema_version,
      row.compatibility_group, row.timing_compatibility_group,
    ].join("|"),
  };
}

