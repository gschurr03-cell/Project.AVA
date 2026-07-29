import type { CoachReport, CoachReportInput } from "./contracts";
import { composeCoachReport } from "./compose";

export type ReportLifecycleResult =
  | { behavior: "regenerated"; report: CoachReport }
  | { behavior: "loaded_snapshot"; report: CoachReport }
  | { behavior: "snapshot_required"; report: null };

export function resolveCoachReport(input: {
  analysisKind: "working" | "saved";
  storedSnapshot?: CoachReport | null;
  compositionInput?: CoachReportInput;
}): ReportLifecycleResult {
  if (input.analysisKind === "saved")
    return input.storedSnapshot
      ? { behavior: "loaded_snapshot", report: input.storedSnapshot }
      : { behavior: "snapshot_required", report: null };
  if (!input.compositionInput) throw new Error("Working reports require composition input.");
  return { behavior: "regenerated", report: composeCoachReport(input.compositionInput) };
}

