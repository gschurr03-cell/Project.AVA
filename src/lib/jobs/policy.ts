import { UNSUPPORTED_FPS_MESSAGE } from "../video/analysisFps";

export const ACTIVE_JOB_STATES = [
  "claimed",
  "downloading",
  "validating",
  "processing",
  "generating_results",
  "uploading_artifacts",
  "completing",
] as const;
export type ActiveJobState = (typeof ACTIVE_JOB_STATES)[number];

export type FailureCategory = "retryable" | "permanent_input" | "resource" | "security";
export interface ClassifiedFailure {
  code: string;
  category: FailureCategory;
  retryable: boolean;
  userMessage: string;
  userActionRequired: boolean;
}

const RULES: Array<[RegExp, ClassifiedFailure]> = [
  [
    /source video frame rate|60 FPS capture standard|60 FPS or higher|enough temporal resolution/i,
    {
      code: "source_fps_below_minimum",
      category: "permanent_input",
      retryable: false,
      userMessage: UNSUPPORTED_FPS_MESSAGE,
      userActionRequired: true,
    },
  ],
  [
    /codec|container|could not open video|corrupt/i,
    {
      code: "unsupported_or_corrupt_media",
      category: "permanent_input",
      retryable: false,
      userMessage: "The uploaded video format is unsupported or the file is incomplete.",
      userActionRequired: true,
    },
  ],
  [
    /no uploaded video|no video|object not found/i,
    {
      code: "source_video_missing",
      category: "permanent_input",
      retryable: false,
      userMessage: "The source video is missing. Upload the recording again.",
      userActionRequired: true,
    },
  ],
  [
    /timed out|timeout|out of memory|ENOMEM|video too large|duration limit|frame limit/i,
    {
      code: "resource_limit",
      category: "resource",
      retryable: false,
      userMessage: "The recording exceeded the current processing limits.",
      userActionRequired: true,
    },
  ],
  [
    /ordered athlete crossings|world-gate crossing|calibration boundaries/i,
    {
      code: "calibration_outside_trackable_frames",
      category: "permanent_input",
      retryable: false,
      userMessage: "AVA could not track the athlete crossing both calibration boundaries. Reposition the boundaries within the visible run and rerun.",
      userActionRequired: true,
    },
  ],
  [
    /provenance|schema|snapshot|validation failed|stale job claim|unauthorized/i,
    {
      code: "invalid_production_result",
      category: "security",
      retryable: false,
      userMessage: "AVA encountered an internal result-processing error. Your recording was processed, but the result could not be finalized.",
      userActionRequired: false,
    },
  ],
  [
    /invalid session state|invalid calibration|unsupported analysis mode/i,
    {
      code: "invalid_analysis_input",
      category: "permanent_input",
      retryable: false,
      userMessage: "The recording settings are incomplete or unsupported.",
      userActionRequired: true,
    },
  ],
  [
    /fetch|network|storage|database|callback|temporar|ECONN|socket|model initialization/i,
    {
      code: "temporary_infrastructure",
      category: "retryable",
      retryable: true,
      userMessage: "A temporary processing issue occurred. AVA will retry automatically.",
      userActionRequired: false,
    },
  ],
];

export function classifyWorkerFailure(error: unknown): ClassifiedFailure {
  const message = error instanceof Error ? error.message : String(error);
  return (
    RULES.find(([pattern]) => pattern.test(message))?.[1] ?? {
      code: "processing_failed",
      category: "retryable",
      retryable: true,
      userMessage: "A temporary processing issue occurred. AVA will retry automatically.",
      userActionRequired: false,
    }
  );
}

/** attemptNumber is 1-based. Jitter is deterministic for testability and fleet spreading. */
export function retryDelaySeconds(
  attemptNumber: number,
  baseSeconds = 15,
  capSeconds = 900,
): number {
  const exponential = Math.min(capSeconds, baseSeconds * 2 ** Math.max(0, attemptNumber - 1));
  const jitter = Math.round(exponential * (((attemptNumber * 37) % 21) / 100));
  return Math.min(capSeconds, exponential + jitter);
}

export const USER_JOB_LABELS: Record<string, string> = {
  queued: "Waiting to be analyzed",
  claimed: "Preparing video",
  downloading: "Preparing video",
  validating: "Validating recording",
  processing: "Tracking athlete",
  generating_results: "Building analysis",
  uploading_artifacts: "Finalizing results",
  completing: "Finalizing results",
  completed: "Analysis complete",
  retry_scheduled: "Retrying after a temporary processing issue",
  failed: "Recording could not be analyzed",
  dead_lettered: "Recording could not be analyzed",
  cancelled: "Analysis cancelled",
};
