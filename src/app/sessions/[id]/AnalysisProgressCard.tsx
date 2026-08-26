"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvaPanel } from "@/components/ava/AvaPanel";
import type { Database } from "@/lib/supabase/database.types";
import {
  normalizeJobProgress,
  isLegalTransition,
  formatCountdown,
  type AnalysisJobStatus,
  type FrameProgressSnapshot,
} from "@/lib/analysisProgress";
import RerunAnalysisButton from "./RerunAnalysisButton";

type JobStatus = Database["public"]["Enums"]["analysis_job_status"];

const TERMINAL: JobStatus[] = ["completed", "failed", "dead_lettered", "cancelled"];

/** The raw shape `analysis_jobs.progress` carries (Day 104, Part 8) — see
 *  `mediapipe_pose_runner.py::emit_progress`, the single producer. */
interface RawProgress extends FrameProgressSnapshot {
  capturedAtMs: number;
  processedUnits?: number;
  totalUnits?: number;
  progressPercent?: number;
  throughputUnitsPerSecond?: number | null;
  etaSeconds?: number | null;
  method?: "measured_work_units_v1";
  updatedAt?: string;
}

function isRawProgress(value: unknown): value is RawProgress {
  const v = value as Partial<RawProgress> | null | undefined;
  return (
    !!v
    && (v.stage === "pass1" || v.stage === "pass2")
    && typeof v.framesCompleted === "number"
    && typeof v.totalFrames === "number"
    && typeof v.capturedAtMs === "number"
  );
}

/**
 * Live analysis progress card. Appears the moment a run/rerun enters a processing state and
 * stays until the job completes or fails. It polls the authoritative `get_analysis_job_status`
 * RPC and derives EVERYTHING it shows — stage, percentage, ETA — from the single
 * `normalizeJobProgress` model (`@/lib/analysisProgress`); it does not compute progress here.
 *
 * No fake progress: the model's bar is bounded by the real worker status, so between polls a
 * 1 s ticker only lets the bar creep *within* the current stage's band. A stale/out-of-order
 * poll (e.g. completed→processing) is rejected via the state machine, and the displayed
 * percentage is held monotonic so it never visibly jumps backward.
 *
 * Refresh-safe: seeded from the server-rendered job status + `updated_at`, so a reload during
 * processing re-derives state from the active job rather than local React state.
 */
export default function AnalysisProgressCard({
  analysisId,
  sessionId,
  initialStatus,
  initialMessage = null,
  initialUpdatedAt = null,
  initialAttemptCount = 0,
  initialProgress = null,
}: {
  analysisId: string;
  sessionId: string;
  initialStatus: JobStatus;
  initialMessage?: string | null;
  initialUpdatedAt?: string | null;
  initialAttemptCount?: number;
  /** Day 104 (Part 8): the job's latest real progress snapshot at server-render
   *  time — same RPC (`get_analysis_job_status`) the other `initial*` props
   *  come from, so a page refresh shows the real countdown immediately rather
   *  than waiting for the first client poll. */
  initialProgress?: unknown;
}) {
  const router = useRouter();
  const acceptedSnapshotRef = useRef<{ status: JobStatus; updatedAtMs: number }>({
    status: initialStatus as JobStatus,
    updatedAtMs: initialUpdatedAt ? Date.parse(initialUpdatedAt) : 0,
  });
  const completionRefreshRef = useRef(false);
  const refreshCompletedResult = useCallback(() => {
    if (completionRefreshRef.current) return;
    completionRefreshRef.current = true;
    router.refresh();
  }, [router]);
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [attemptCount, setAttemptCount] = useState<number>(initialAttemptCount);
  const [updatedAtMs, setUpdatedAtMs] = useState<number>(() =>
    initialUpdatedAt ? Date.parse(initialUpdatedAt) : 0,
  );
  // Day 104 (Part 8): the latest real progress snapshot, and a ref to the
  // PREVIOUS one — recent throughput (frames/sec) is a delta between two
  // consecutive real polls, never invented from a single snapshot.
  const [rawProgress, setRawProgress] = useState<RawProgress | null>(() =>
    isRawProgress(initialProgress) ? initialProgress : null,
  );
  const previousProgressRef = useRef<RawProgress | null>(null);
  // Hydration-safe: the server render and the client's first (hydration) render must
  // compute the exact same `percent` from the exact same inputs, or React flags a
  // mismatch on `aria-valuenow` (observed as e.g. server="24" vs client="25" — one
  // `Date.now()` call on the server, a slightly later one on the client). Seeding from
  // the server-provided `initialUpdatedAt` snapshot instead of the wall clock makes the
  // first render deterministic on both sides; the real clock only starts ticking from
  // the effect below, strictly after mount, which is a normal post-hydration update.
  const [nowMs, setNowMs] = useState<number>(() =>
    initialUpdatedAt ? Date.parse(initialUpdatedAt) : 0,
  );
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  // Poll the authoritative RPC; ignore stale/illegal transitions from out-of-order responses.
  useEffect(() => {
    if (TERMINAL.includes(status)) {
      if (status === "completed") refreshCompletedResult();
      return;
    }
    const supabase = createClient();
    let stopped = false;
    let pollInFlight = false;
    const timer = window.setInterval(async () => {
      // Do not allow a slow request to overlap the next interval. This makes
      // response application serial as well as snapshot-monotonic.
      if (pollInFlight) return;
      pollInFlight = true;
      const { data } = await supabase.rpc("get_analysis_job_status", { p_analysis_id: analysisId });
      pollInFlight = false;
      const row = data?.[0];
      if (!row || stopped) return;
      const next = row.status as JobStatus;
      const nextUpdatedAtMs = row.updated_at ? Date.parse(row.updated_at) : 0;
      const accepted = acceptedSnapshotRef.current;
      // One RPC row is one lifecycle snapshot. Reject the WHOLE row when it is
      // older or its status cannot follow the last accepted state; never combine
      // a current status with stale progress/message/attempt fields.
      if (nextUpdatedAtMs < accepted.updatedAtMs) return;
      if (nextUpdatedAtMs === accepted.updatedAtMs && next !== accepted.status) return;
      if (!isLegalTransition(accepted.status as AnalysisJobStatus, next as AnalysisJobStatus)) return;
      acceptedSnapshotRef.current = { status: next, updatedAtMs: nextUpdatedAtMs };
      setStatus(next);
      setMessage(row.user_message ?? null);
      setAttemptCount(row.attempt_count ?? 0);
      if (row.updated_at) setUpdatedAtMs(nextUpdatedAtMs);
      const nextProgress = row.progress;
      if (isRawProgress(nextProgress)) {
        setRawProgress((prev) => {
          // Only a NEWER snapshot (later capture time) becomes the tracked
          // "previous" for a throughput delta — an out-of-order/duplicate
          // poll response must never compute a bogus (possibly negative)
          // rate from stale data.
          if (prev && nextProgress.capturedAtMs > prev.capturedAtMs) {
            previousProgressRef.current = prev;
          }
          if (prev && nextProgress.capturedAtMs < prev.capturedAtMs) return prev;
          return nextProgress;
        });
      } else {
        previousProgressRef.current = null;
        setRawProgress(null);
      }
      if (TERMINAL.includes(next)) {
        stopped = true;
        window.clearInterval(timer);
        if (next === "completed") refreshCompletedResult();
      }
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [analysisId, status, refreshCompletedResult]);

  // 1 s ticker so the ETA + within-band creep advance smoothly between polls.
  useEffect(() => {
    if (TERMINAL.includes(status)) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  // Day 104 (Part 8): real measured frames/sec between the two most recent
  // progress snapshots — null (→ "Estimating…") until a second snapshot of
  // the SAME stage has actually arrived, and never computed across a
  // pass1→pass2 stage transition (that boundary isn't a throughput measure,
  // it's a phase change).
  const previous = previousProgressRef.current;
  let recentFramesPerSecond: number | null = null;
  if (rawProgress?.throughputUnitsPerSecond && rawProgress.throughputUnitsPerSecond > 0) {
    recentFramesPerSecond = rawProgress.throughputUnitsPerSecond;
  } else if (rawProgress && previous && previous.stage === rawProgress.stage) {
    const dtS = (rawProgress.capturedAtMs - previous.capturedAtMs) / 1000;
    const dFrames = rawProgress.framesCompleted - previous.framesCompleted;
    if (dtS > 0 && dFrames > 0) recentFramesPerSecond = dFrames / dtS;
  }

  const progress = normalizeJobProgress({
    status: status as AnalysisJobStatus,
    updatedAtMs,
    nowMs,
    attemptCount,
    userMessage: message,
    frame: rawProgress
      ? { stage: rawProgress.stage, framesCompleted: rawProgress.framesCompleted, totalFrames: rawProgress.totalFrames }
      : null,
    recentFramesPerSecond,
  });

  // Countdown display must not repeatedly jump upward (measurement noise
  // between polls) — hold the LOWEST recently-shown precise estimate for a
  // short grace window, only letting it rise again if the new estimate is
  // meaningfully higher (a real slowdown, not jitter) or the stage changed.
  const countdownRef = useRef<{ ms: number; stage: string | null } | null>(null);
  let displayEtaLabel = progress.etaLabel;
  if (progress.eta.precise && progress.eta.ms != null) {
    const stageKey = rawProgress?.stage ?? null;
    const held = countdownRef.current;
    const isNewStage = !held || held.stage !== stageKey;
    const JUMP_TOLERANCE_MS = 5000;
    const shownMs =
      isNewStage || progress.eta.ms > (held?.ms ?? Infinity) + JUMP_TOLERANCE_MS
        ? progress.eta.ms
        : Math.min(held?.ms ?? progress.eta.ms, progress.eta.ms);
    countdownRef.current = { ms: shownMs, stage: stageKey };
    displayEtaLabel = shownMs <= 0 ? "Almost done" : formatCountdown(shownMs);
  }

  // Hold the displayed percentage monotonic within a single run (never visibly regress).
  const maxPercentRef = useRef(0);
  const authoritativePercent = rawProgress?.method === "measured_work_units_v1"
    && typeof rawProgress.progressPercent === "number"
      ? rawProgress.progressPercent
      : progress.overallProgress;
  if (progress.lifecycle === "queued" || progress.lifecycle === "retrying") {
    // Indeterminate phases legitimately reset the floor (a retry restarts the pipeline).
    maxPercentRef.current = 0;
  } else if (authoritativePercent != null) {
    maxPercentRef.current = Math.max(maxPercentRef.current, authoritativePercent);
  }

  if (progress.isFailure) {
    return (
      <AvaPanel eyebrow="Analysis" title="Analysis failed">
        <p className="text-sm text-[#e46464]">{message ?? "The recording could not be analyzed."}</p>
        <div className="mt-4">
          <RerunAnalysisButton sessionId={sessionId} label="Retry analysis" />
        </div>
      </AvaPanel>
    );
  }

  const isComplete = progress.status === "completed";
  const percent = isComplete ? 100 : Math.max(maxPercentRef.current, authoritativePercent ?? 0);
  const indeterminate = progress.indeterminate;

  // Headline reflects the real lifecycle, not just "processing".
  const headline =
    progress.lifecycle === "retrying"
      ? `Retrying analysis${attemptCount > 1 ? ` · attempt ${attemptCount}` : ""}`
      : progress.lifecycle === "queued"
        ? "Waiting for an available worker"
        : progress.delayed
          ? `${progress.activeStageLabel ?? "Processing"} · taking longer than usual`
          : (progress.activeStageLabel ?? "Processing");

  return (
    <AvaPanel eyebrow="Analysis" title={isComplete ? "Analysis complete" : "Analysis in progress"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[#2f80ed]" />
          <p className="text-sm font-semibold text-[#f5f7fb]">{headline}</p>
        </div>
        {/* Day 104 (Part 8): a precise "M:SS remaining" countdown once real frame
            throughput is available; "Estimating…" (or the existing coarse text
            for short, non-frame-tracked stages) before that evidence exists —
            never a fabricated number. */}
        {displayEtaLabel && !isComplete && (
          <p
            className={
              progress.eta.precise
                ? "shrink-0 font-mono text-sm font-semibold tabular-nums text-[#f5f7fb]"
                : "shrink-0 text-xs font-medium text-[#7e8797]"
            }
            data-testid="analysis-eta"
            data-eta-precise={progress.eta.precise}
          >
            {displayEtaLabel}
          </p>
        )}
      </div>

      {/* Progress bar — real stage position from the authoritative model. Indeterminate while
          queued/retrying (a sweeping shimmer rather than a false fixed percentage). */}
      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Analysis progress"
        data-testid="analysis-progress"
        data-job-status={status}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]"
      >
        {indeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[#2f80ed] to-[#3b8eff]" />
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2f80ed] to-[#3b8eff] transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      {/* Stage checklist — done / active / upcoming, all derived from the live job status. */}
      <ol className="mt-4 space-y-1.5">
        {progress.stages.map((stage) => (
          <li key={stage.id} className="flex items-center gap-2 text-xs">
            <span
              className={
                stage.state === "done"
                  ? "text-[#89d46a]"
                  : stage.state === "active"
                    ? "text-[#f5f7fb]"
                    : "text-[#55617a]"
              }
            >
              {stage.state === "done" ? "✓" : stage.state === "active" ? "◉" : "○"}
            </span>
            <span
              className={
                stage.state === "active"
                  ? "font-semibold text-[#f5f7fb]"
                  : stage.state === "done"
                    ? "text-[#b3bccb]"
                    : "text-[#7e8797]"
              }
            >
              {stage.label}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[11px] text-[#7e8797]">
        Results will appear automatically when processing finishes — you can leave this page and
        come back.
      </p>
    </AvaPanel>
  );
}
