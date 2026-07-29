import { buildSprintAnalysisReport } from "./builder";
import type { BuildSprintAnalysisReportInput, SprintAnalysisReport } from "./types";

export function resolveAnalysisReport(input: {
  sourceAnalysisId: string;
  latestAnalysisId: string;
  savedSnapshot: SprintAnalysisReport | null;
  generationInput?: BuildSprintAnalysisReportInput;
}): { report: SprintAnalysisReport | null; behavior: "snapshot" | "generated" | "stale" | "snapshot_required" } {
  if (input.savedSnapshot) {
    if (input.savedSnapshot.analysisId !== input.latestAnalysisId) {
      return {
        report: { ...structuredClone(input.savedSnapshot), lifecycleState: "stale" },
        behavior: "stale",
      };
    }
    return { report: structuredClone(input.savedSnapshot), behavior: "snapshot" };
  }
  if (!input.generationInput) return { report: null, behavior: "snapshot_required" };
  if (input.sourceAnalysisId !== input.latestAnalysisId) return { report: null, behavior: "snapshot_required" };
  return { report: buildSprintAnalysisReport(input.generationInput), behavior: "generated" };
}
