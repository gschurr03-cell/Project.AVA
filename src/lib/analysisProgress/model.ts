/**
 * Analysis progress domain — the single authoritative model for turning a REAL analysis
 * job record into user-facing progress (stage, overall %, ETA, lifecycle).
 *
 * Design contract (read before editing):
 *   1. NO FAKE PROGRESS. Every number is bounded by a status the backend has actually
 *      reported. The bar can creep *within* the band of the current status, but can never
 *      cross into the next stage's band until the worker confirms that transition, and it
 *      only reaches 100 when the job status is `completed`.
 *   2. The worker emits COARSE statuses (downloading → validating → processing →
 *      generating_results → uploading_artifacts → completing). We do not invent sub-steps
 *      the worker does not report: where two user-facing stages share one worker status
 *      (tracking_movement + identifying_steps ← `processing`; calculating_metrics +
 *      building_intelligence ← `generating_results`) both are shown active honestly.
 *   3. Pure + transport-safe. No Date objects, no framework imports; inputs are numbers and
 *      string enums so the same model runs on the server, the web client, and iOS.
 *
 * This module is intentionally self-contained (alias-free) so it can be unit-compiled and
 * imported by scripts/analysis-progress-sanity.mjs.
 */

// ---------------------------------------------------------------------------
// Statuses — the real `public.analysis_job_status` enum (migration 0018).
// ---------------------------------------------------------------------------

export const ANALYSIS_JOB_STATUSES = [
  "queued",
  "claimed",
  "downloading",
  "validating",
  "processing",
  "generating_results",
  "uploading_artifacts",
  "completing",
  "completed",
  "retry_scheduled",
  "failed",
  "dead_lettered",
  "cancelled",
] as const;

export type AnalysisJobStatus = (typeof ANALYSIS_JOB_STATUSES)[number];

/** The linear "happy path" the worker walks, in order. Off-path statuses (retry_scheduled,
 *  failed, dead_lettered, cancelled) are handled by lifecycle, not by this index. */
export const FORWARD_ORDER: AnalysisJobStatus[] = [
  "queued",
  "claimed",
  "downloading",
  "validating",
  "processing",
  "generating_results",
  "uploading_artifacts",
  "completing",
  "completed",
];

const FORWARD_INDEX: Record<string, number> = Object.fromEntries(
  FORWARD_ORDER.map((s, i) => [s, i]),
);

export function forwardIndex(status: AnalysisJobStatus): number {
  return FORWARD_INDEX[status] ?? -1;
}

// ---------------------------------------------------------------------------
// User-facing stages — 7 stages, weights total 100 (PROVISIONAL, see note).
// ---------------------------------------------------------------------------

export type StageId =
  | "preparing_video"
  | "detecting_athlete"
  | "tracking_movement"
  | "identifying_steps"
  | "calculating_metrics"
  | "building_intelligence"
  | "finalizing_results";

export type StageState = "upcoming" | "active" | "done";

export interface StageDefinition {
  id: StageId;
  label: string;
  /** Portion of total progress this stage represents. PROVISIONAL weighting — chosen from the
   *  relative wall-clock cost of each worker phase, not a measured distribution. */
  weight: number;
  /** Forward-order index at which this stage's work begins. */
  startIndex: number;
  /** Forward-order index at which this stage is definitely complete (i.e. the worker has
   *  moved past the status that does this stage's work). */
  completeIndex: number;
}

/**
 * Each stage's `start`/`complete` are anchored to REAL worker status transitions. Two pairs
 * share a worker status (see contract note 2) and therefore share start/complete indices.
 */
export const STAGE_DEFINITIONS: StageDefinition[] = [
  // claimed(1) + downloading(2) → done once `validating`(3) is reached.
  { id: "preparing_video", label: "Preparing video", weight: 8, startIndex: 1, completeIndex: 3 },
  // validating(3) → done once `processing`(4) is reached.
  { id: "detecting_athlete", label: "Detecting athlete", weight: 10, startIndex: 3, completeIndex: 4 },
  // processing(4) → done once `generating_results`(5) is reached.
  { id: "tracking_movement", label: "Tracking movement", weight: 42, startIndex: 4, completeIndex: 5 },
  { id: "identifying_steps", label: "Identifying steps", weight: 12, startIndex: 4, completeIndex: 5 },
  // generating_results(5) → done once `uploading_artifacts`(6) is reached.
  { id: "calculating_metrics", label: "Calculating metrics", weight: 14, startIndex: 5, completeIndex: 6 },
  { id: "building_intelligence", label: "Building intelligence", weight: 8, startIndex: 5, completeIndex: 6 },
  // uploading_artifacts(6) + completing(7) → done once `completed`(8) is reached.
  { id: "finalizing_results", label: "Finalizing results", weight: 6, startIndex: 6, completeIndex: 8 },
];

/** Sum of stage weights. Asserted === 100 by the sanity tests. */
export function totalStageWeight(): number {
  return STAGE_DEFINITIONS.reduce((s, d) => s + d.weight, 0);
}

export function stageState(def: StageDefinition, currentForwardIndex: number): StageState {
  if (currentForwardIndex >= def.completeIndex) return "done";
  if (currentForwardIndex >= def.startIndex) return "active";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Overall progress — real status transitions plus measured processing work.
// ---------------------------------------------------------------------------

/**
 * The 0..100 band each status occupies. Floors chain to the previous ceiling so the bar is
 * monotonic across the real status sequence. Ceilings for the pre-completion statuses are
 * strictly below 100 — only `completed` yields 100 (contract note 1).
 */
export const STATUS_BANDS: Record<string, { floor: number; ceiling: number }> = {
  queued: { floor: 0, ceiling: 0 },
  claimed: { floor: 0, ceiling: 4 },
  downloading: { floor: 4, ceiling: 8 },
  validating: { floor: 8, ceiling: 18 },
  processing: { floor: 18, ceiling: 72 },
  generating_results: { floor: 72, ceiling: 94 },
  uploading_artifacts: { floor: 94, ceiling: 98 },
  completing: { floor: 98, ceiling: 99.5 },
  completed: { floor: 100, ceiling: 100 },
};

/**
 * Provisional typical wall-clock duration (ms) of each worker status. Used ONLY to pace the
 * within-band creep and to build a conservative ETA — never for any biomechanics metric.
 * These are deliberately generous so the ETA over-estimates rather than under-estimates.
 */
export const STATUS_TYPICAL_MS: Record<string, number> = {
  claimed: 2000,
  downloading: 8000,
  validating: 4000,
  processing: 45000,
  generating_results: 12000,
  uploading_artifacts: 6000,
  completing: 3000,
};

/** How far past its typical duration a status must run to be surfaced as "delayed". */
const STALL_FACTOR = 2.5;

/**
 * Overall progress 0..100 for a forward status, given how long it has been active.
 * Returns null for statuses that have no meaningful bar (queued / off-path / failure).
 */
export function computeOverallProgress(
  status: AnalysisJobStatus,
  _elapsedInStatusMs: number,
  frame?: FrameProgressSnapshot | null,
): number | null {
  if (status === "completed") return 100;
  const band = STATUS_BANDS[status];
  if (!band) return null; // retry_scheduled / failed / dead_lettered / cancelled
  if (status === "processing" && frame && frame.totalFrames > 0) {
    const completedPasses = frame.stage === "pass2" ? 1 : 0;
    const fraction = Math.min(1, Math.max(0, frame.framesCompleted / frame.totalFrames));
    const measuredWorkFraction = (completedPasses + fraction) / 2;
    return band.floor + (band.ceiling - band.floor) * measuredWorkFraction;
  }
  // A stage transition is evidence; wall-clock time is not. Hold at the real
  // stage floor until measured work or the next transition arrives.
  return band.floor;
}

// ---------------------------------------------------------------------------
// ETA — conservative, provisional-duration hierarchy + coarse bucketed display.
// ---------------------------------------------------------------------------

export type EtaKind = "ready" | "indeterminate" | "none";

export interface EtaEstimate {
  kind: EtaKind;
  /** Remaining milliseconds when kind === "ready". */
  ms: number | null;
  /** Day 104 (Part 8): true only when `ms` was derived from REAL measured
   *  frame throughput (not the provisional per-status duration table below).
   *  Callers use this to decide between a precise mm:ss countdown and the
   *  honest "Estimating…" / coarse-bucket text — never claim more
   *  precision than the evidence actually supports. */
  precise: boolean;
}

// ---------------------------------------------------------------------------
// Day 104 (Part 8): real frame-throughput ETA — used only for the
// `processing` status (pass 1 + pass 2 of the pose runner), which dominates
// total wall-clock time on every real run measured so far (Day 99: 274s + 97s
// of ~383s total, ≈97%). Other statuses (downloading, validating,
// generating_results, uploading_artifacts, completing) have no frame-level
// granularity and keep the provisional STATUS_TYPICAL_MS estimate — they are
// short by construction, so a coarse estimate there is honest, not lazy.
//
// Deliberately self-contained (no import from `pose-backend.ts`) — this
// module's own stated contract is zero framework/alias imports so it stays
// unit-compilable in isolation (see module docstring); the shape is kept in
// sync by convention, the same choice `stepIntegrity.ts` made for its
// mirrored SprintAnalyzer.ts constants.
// ---------------------------------------------------------------------------

export interface FrameProgressSnapshot {
  stage: "pass1" | "pass2";
  framesCompleted: number;
  totalFrames: number;
}

/**
 * Fixed, generous, documented buffer for "the rest of the pipeline after
 * pass 1 finishes" (pass 2 itself, plus generating_results/uploading/
 * completing) — used ONLY while pass 1 is still running and pass 2 hasn't
 * started yet, since there is no real throughput evidence for pass 2 before
 * it begins. Mirrors this module's existing STATUS_TYPICAL_MS philosophy:
 * deliberately generous so the estimate over-, not under-, shoots. Derived
 * from the same Day 99 real measurement (pass 2 ≈ 97s, generating_results +
 * uploading + completing ≈ 21s of typical durations below) rounded well up.
 */
/**
 * Real remaining-time estimate for the CURRENT pass, from genuinely measured
 * recent throughput (frames/sec between two consecutive real progress
 * snapshots — the caller computes this, since only it sees consecutive
 * polls). Returns null when there isn't yet a real rate to divide by —
 * callers must fall back to "Estimating…", never a fabricated number.
 */
export function estimateFrameThroughputRemainingMs(
  frame: FrameProgressSnapshot,
  recentFramesPerSecond: number | null,
): number | null {
  if (recentFramesPerSecond == null || !Number.isFinite(recentFramesPerSecond) || recentFramesPerSecond <= 0) {
    return null;
  }
  const remainingCurrentPass = Math.max(0, frame.totalFrames - frame.framesCompleted);
  const remainingFuturePass = frame.stage === "pass1" ? frame.totalFrames : 0;
  return ((remainingCurrentPass + remainingFuturePass) / recentFramesPerSecond) * 1000;
}

/**
 * Conservative remaining-time estimate. Hierarchy:
 *   • terminal (completed/failed/…)        → none
 *   • queued / retry_scheduled             → indeterminate (no worker holds it yet)
 *   • `processing` WITH real frame evidence → real frame-throughput estimate (precise)
 *   • active forward status (else)         → (typical remaining in this status) +
 *                                            Σ typical of all later statuses
 * Uses real elapsed-in-status so a stage that overruns stops shrinking toward zero.
 */
export function estimateEta(
  status: AnalysisJobStatus,
  elapsedInStatusMs: number,
  frame?: FrameProgressSnapshot | null,
  recentFramesPerSecond?: number | null,
): EtaEstimate {
  if (status === "completed" || status === "failed" || status === "dead_lettered" || status === "cancelled") {
    return { kind: "none", ms: null, precise: false };
  }
  if (status === "queued" || status === "retry_scheduled") {
    return { kind: "indeterminate", ms: null, precise: false };
  }
  if (status === "processing" && frame) {
    const preciseMs = estimateFrameThroughputRemainingMs(frame, recentFramesPerSecond ?? null);
    if (preciseMs != null) {
      return { kind: "ready", ms: preciseMs, precise: true };
    }
  }
  const idx = forwardIndex(status);
  if (idx < 0) return { kind: "indeterminate", ms: null, precise: false };

  const remainingCurrent = Math.max(0, (STATUS_TYPICAL_MS[status] ?? 0) - Math.max(0, elapsedInStatusMs));
  let remainingLater = 0;
  for (let i = idx + 1; i < FORWARD_ORDER.length; i++) {
    remainingLater += STATUS_TYPICAL_MS[FORWARD_ORDER[i]] ?? 0;
  }
  return { kind: "ready", ms: remainingCurrent + remainingLater, precise: false };
}

/** True when the current status has run well past its typical duration (heartbeat-free
 *  stall signal derived purely from elapsed-in-status). */
export function isDelayed(status: AnalysisJobStatus, elapsedInStatusMs: number): boolean {
  const tau = STATUS_TYPICAL_MS[status];
  return Boolean(tau) && elapsedInStatusMs > tau * STALL_FACTOR;
}

/** `M:SS` (or `H:MM:SS` past an hour) countdown text — used only when the
 *  estimate is `precise` (real measured throughput), matching the exact
 *  "03:42 remaining" shape this task asked for. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  const clock = hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  return `${clock} remaining`;
}

/** Human ETA text. Uses a precise `M:SS remaining` countdown ONLY when the
 *  estimate is backed by real measured frame throughput; otherwise "Estimating…"
 *  during processing (real evidence hasn't arrived yet) or the existing coarse
 *  bucket text for the short, non-frame-tracked statuses — never claims more
 *  precision than the evidence actually supports. */
export function formatEta(eta: EtaEstimate, status?: AnalysisJobStatus): string | null {
  if (eta.kind === "none") return null;
  if (eta.kind === "indeterminate") return "Waiting to start";
  const ms = eta.ms ?? 0;
  if (eta.precise) {
    return ms <= 0 ? "Almost done" : formatCountdown(ms);
  }
  if (status === "processing") return "Estimating…";
  if (ms <= 0) return "Almost done";
  if (ms < 8000) return "A few seconds left";
  if (ms < 45000) return "Under a minute left";
  if (ms < 90000) return "About a minute left";
  return `About ${Math.ceil(ms / 60000)} min left`;
}

// ---------------------------------------------------------------------------
// State machine — legal transitions over the real enum.
// ---------------------------------------------------------------------------

export const ALLOWED_TRANSITIONS: Record<string, AnalysisJobStatus[]> = {
  queued: ["claimed", "cancelled"],
  claimed: ["downloading", "retry_scheduled", "failed", "cancelled"],
  downloading: ["validating", "retry_scheduled", "failed", "cancelled"],
  validating: ["processing", "retry_scheduled", "failed", "cancelled"],
  processing: ["generating_results", "retry_scheduled", "failed", "cancelled"],
  generating_results: ["uploading_artifacts", "retry_scheduled", "failed", "cancelled"],
  uploading_artifacts: ["completing", "retry_scheduled", "failed", "cancelled"],
  completing: ["completed", "retry_scheduled", "failed", "cancelled"],
  retry_scheduled: ["claimed", "queued", "dead_lettered", "cancelled"],
  failed: ["queued", "claimed", "dead_lettered"],
  completed: [],
  dead_lettered: [],
  cancelled: [],
};

/** A transition is legal if it is a declared edge, or a no-op (repeated poll of the same
 *  status). Used to ignore stale/out-of-order poll results without dropping retries. */
export function isLegalTransition(from: AnalysisJobStatus, to: AnalysisJobStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// Lifecycle — the coarse bucket a UI branches on.
// ---------------------------------------------------------------------------

export type Lifecycle = "queued" | "retrying" | "processing" | "completed" | "failed" | "cancelled";

export function lifecycleFor(status: AnalysisJobStatus): Lifecycle {
  switch (status) {
    case "queued":
      return "queued";
    case "retry_scheduled":
      return "retrying";
    case "completed":
      return "completed";
    case "failed":
    case "dead_lettered":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "processing";
  }
}

// ---------------------------------------------------------------------------
// Normalized progress — the object every surface renders from.
// ---------------------------------------------------------------------------

export interface StageView extends StageDefinition {
  state: StageState;
}

export interface AnalysisJobProgress {
  status: AnalysisJobStatus;
  lifecycle: Lifecycle;
  /** 0..100 integer for the bar, or null when there is no meaningful bar (failure/cancel). */
  overallProgress: number | null;
  /** Raw (unrounded) progress, for callers that need to enforce monotonicity across polls. */
  overallProgressRaw: number | null;
  /** True while queued/retrying — the bar is intentionally indeterminate. */
  indeterminate: boolean;
  activeStageId: StageId | null;
  activeStageLabel: string | null;
  stages: StageView[];
  eta: EtaEstimate;
  etaLabel: string | null;
  delayed: boolean;
  isTerminal: boolean;
  isFailure: boolean;
  attemptCount: number;
  userMessage: string | null;
}

export interface NormalizeInput {
  status: AnalysisJobStatus;
  /** ms since epoch of the job's last status change (RPC `updated_at`). */
  updatedAtMs: number;
  /** ms since epoch "now" (client clock). Injected so the model stays pure/testable. */
  nowMs: number;
  attemptCount?: number;
  userMessage?: string | null;
  /** Day 104 (Part 8): the latest real progress snapshot (`analysis_jobs.progress`),
   *  when the worker has reported one yet. */
  frame?: FrameProgressSnapshot | null;
  /** Day 104 (Part 8): real measured frames/sec between the two most recent
   *  progress snapshots — the caller (which sees consecutive polls) computes
   *  this; the model never invents a rate from a single snapshot. */
  recentFramesPerSecond?: number | null;
}

const TERMINAL: AnalysisJobStatus[] = ["completed", "failed", "dead_lettered", "cancelled"];
const FAILURE: AnalysisJobStatus[] = ["failed", "dead_lettered", "cancelled"];

/**
 * Fold a job-status RPC row into the authoritative progress model. The single place any UI
 * should derive stage / percentage / ETA from — do not re-derive these elsewhere.
 */
export function normalizeJobProgress(input: NormalizeInput): AnalysisJobProgress {
  const { status } = input;
  const elapsedInStatusMs = Math.max(0, input.nowMs - input.updatedAtMs);
  const lifecycle = lifecycleFor(status);
  const indeterminate = lifecycle === "queued" || lifecycle === "retrying";

  const rawProgress = computeOverallProgress(status, elapsedInStatusMs, input.frame);
  const overallProgress = rawProgress == null ? null : Math.round(rawProgress);

  const fwd = forwardIndex(status);
  const stages: StageView[] = STAGE_DEFINITIONS.map((def) => ({
    ...def,
    state: stageState(def, fwd),
  }));
  const active = stages.find((s) => s.state === "active") ?? null;

  const eta = estimateEta(status, elapsedInStatusMs, input.frame, input.recentFramesPerSecond);

  return {
    status,
    lifecycle,
    overallProgress,
    overallProgressRaw: rawProgress,
    indeterminate,
    activeStageId: active?.id ?? null,
    activeStageLabel: active?.label ?? null,
    stages,
    eta,
    etaLabel: formatEta(eta, status),
    delayed: lifecycle === "processing" && isDelayed(status, elapsedInStatusMs),
    isTerminal: TERMINAL.includes(status),
    isFailure: FAILURE.includes(status),
    attemptCount: input.attemptCount ?? 0,
    userMessage: input.userMessage ?? null,
  };
}
