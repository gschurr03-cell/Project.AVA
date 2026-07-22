/**
 * Stage-based analysis progress (Part B) — pure + deterministic.
 *
 * Maps the REAL worker signal (job status + optional fine-grained worker stage) onto
 * the ten coaching-facing stages, and derives percent-complete + an estimated time
 * remaining from configurable per-stage weights. It never fabricates progress: the
 * active stage comes from the real signal, and when a stage runs long it is reported
 * as still-running (stalled) rather than silently advancing.
 */

export const PROGRESS_MODEL_VERSION = "analysis-progress-v1" as const;

export type JobStatus = "queued" | "processing" | "completed" | "failed" | string;

export interface ProgressStage {
  id: string;
  label: string;
  /** Relative weight → share of the overall bar + expected duration. */
  weight: number;
  /** Worker `processingStage` values that map to this display stage. */
  workerStages: string[];
}

/** The canonical ten stages. Weights are the only tuning knob. */
export const PROGRESS_STAGES: ProgressStage[] = [
  { id: "uploading", label: "Uploading Video", weight: 1, workerStages: ["queued"] },
  { id: "preparing", label: "Preparing Frames", weight: 1, workerStages: ["claimed", "downloading"] },
  { id: "detecting_athlete", label: "Detecting Athlete", weight: 1, workerStages: ["detecting"] },
  { id: "tracking_pose", label: "Tracking Pose", weight: 4, workerStages: ["processing", "pose"] },
  { id: "detecting_contacts", label: "Detecting Contacts", weight: 2, workerStages: ["validating", "contacts"] },
  { id: "calculating_metrics", label: "Calculating Metrics", weight: 1, workerStages: ["uploading_artifacts", "generating_results", "metrics"] },
  { id: "athlete_intelligence", label: "Running Athlete Intelligence", weight: 1, workerStages: ["completing", "intelligence"] },
  { id: "path_to_goal", label: "Building Path To Goal", weight: 1, workerStages: ["path_to_goal"] },
  { id: "coaching_report", label: "Generating Coaching Report", weight: 1, workerStages: ["coaching_report"] },
  { id: "complete", label: "Complete", weight: 0, workerStages: ["completed"] },
];

const TOTAL_WEIGHT = PROGRESS_STAGES.reduce((s, x) => s + x.weight, 0);
/** Default expected seconds per unit weight (only used to estimate time remaining). */
export const SECONDS_PER_WEIGHT = 6;

export type StageState = "pending" | "active" | "complete";

export interface StageView {
  id: string;
  label: string;
  state: StageState;
}

export interface AnalysisProgress {
  status: JobStatus;
  activeStageId: string;
  activeStageIndex: number;
  activeStageLabel: string;
  /** 0..100, derived from completed stage weight (real signal), never faked. */
  percent: number;
  estimatedRemainingSeconds: number | null;
  /** True when the active stage has run well past its expected time. */
  stalled: boolean;
  failed: boolean;
  stages: StageView[];
}

function stageIndexFor(status: JobStatus, workerStage: string | null | undefined): number {
  if (status === "completed") return PROGRESS_STAGES.length - 1;
  if (status === "queued") return 0;
  if (workerStage) {
    const idx = PROGRESS_STAGES.findIndex((s) => s.workerStages.includes(workerStage));
    if (idx >= 0) return idx;
  }
  // Coarse "processing" with no fine stage → the pose-tracking stage (the long one).
  if (status === "processing") return 3;
  return 0;
}

export function computeAnalysisProgress(input: {
  status: JobStatus;
  workerStage?: string | null;
  /** ms the current run has been active, for time-remaining + stall detection. */
  elapsedSeconds?: number | null;
}): AnalysisProgress {
  const failed = input.status === "failed";
  const index = failed ? Math.max(0, stageIndexFor("processing", input.workerStage)) : stageIndexFor(input.status, input.workerStage);

  // Percent = share of weight in the stages already completed (discrete, real).
  const completedWeight = PROGRESS_STAGES.slice(0, index).reduce((s, x) => s + x.weight, 0);
  const percent =
    input.status === "completed" ? 100 : TOTAL_WEIGHT > 0 ? Math.round((completedWeight / TOTAL_WEIGHT) * 100) : 0;

  // Estimated remaining time from the remaining stage weights (clearly an estimate).
  const remainingWeight = PROGRESS_STAGES.slice(index).reduce((s, x) => s + x.weight, 0);
  const estimatedRemainingSeconds =
    input.status === "completed" ? 0 : Math.round(remainingWeight * SECONDS_PER_WEIGHT);

  // Stall: the active stage has taken much longer than its expected duration.
  const activeStage = PROGRESS_STAGES[index];
  const expectedStageSeconds = Math.max(1, activeStage.weight * SECONDS_PER_WEIGHT);
  const stalled =
    !failed &&
    input.status !== "completed" &&
    (input.elapsedSeconds ?? 0) > expectedStageSeconds * 4;

  const stages: StageView[] = PROGRESS_STAGES.map((s, i) => ({
    id: s.id,
    label: s.label,
    state:
      input.status === "completed"
        ? "complete"
        : i < index
          ? "complete"
          : i === index
            ? "active"
            : "pending",
  }));

  return {
    status: input.status,
    activeStageId: activeStage.id,
    activeStageIndex: index,
    activeStageLabel: activeStage.label,
    percent,
    estimatedRemainingSeconds,
    stalled,
    failed,
    stages,
  };
}
