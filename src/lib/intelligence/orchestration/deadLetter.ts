export type DeadLetterReviewState = "unreviewed" | "acknowledged" | "reviewed";
export interface DeadLetterRecord {
  deadLetterId: string; runId: string; jobId: string; engineId: string;
  engineVersion: string; adapterVersion: string; failureClassification: string;
  failedStage: string; attempts: number; firstFailureAt: string; terminalFailureAt: string;
  dependencyStates: Record<string,string>; stagedSnapshotsExist: boolean;
  replayEligibility: "eligible" | "ineligible"; replayReason: string;
  recommendedAction: string; reviewState: DeadLetterReviewState;
  internalNote: string | null;
}
export type DeadLetterAction =
  | { type: "acknowledge" } | { type: "mark_reviewed" }
  | { type: "attach_note"; note: string } | { type: "cancel_remaining" };
export function applyDeadLetterAction(record: DeadLetterRecord, action: DeadLetterAction): DeadLetterRecord {
  if (action.type === "attach_note") {
    const note = action.note.trim();
    if (!note || note.length > 500) throw new Error("Internal note must be 1–500 characters");
    return { ...record, internalNote: note };
  }
  if (action.type === "acknowledge") return { ...record, reviewState: "acknowledged" };
  if (action.type === "mark_reviewed") return { ...record, reviewState: "reviewed" };
  return { ...record, recommendedAction: "Remaining nonterminal work cancelled; preserve staged snapshots for audit." };
}

