"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvaPanel } from "@/components/ava/AvaPanel";
import type { Database } from "@/lib/supabase/database.types";
import {
  normalizeJobProgress,
  isLegalTransition,
  type AnalysisJobStatus,
} from "@/lib/analysisProgress";
import RerunAnalysisButton from "./RerunAnalysisButton";

type JobStatus = Database["public"]["Enums"]["analysis_job_status"];

const TERMINAL: JobStatus[] = ["completed", "failed", "dead_lettered", "cancelled"];

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
}: {
  analysisId: string;
  sessionId: string;
  initialStatus: JobStatus;
  initialMessage?: string | null;
  initialUpdatedAt?: string | null;
  initialAttemptCount?: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [attemptCount, setAttemptCount] = useState<number>(initialAttemptCount);
  const [updatedAtMs, setUpdatedAtMs] = useState<number>(() =>
    initialUpdatedAt ? Date.parse(initialUpdatedAt) : 0,
  );
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
      if (status === "completed") router.refresh();
      return;
    }
    const supabase = createClient();
    let stopped = false;
    const timer = window.setInterval(async () => {
      const { data } = await supabase.rpc("get_analysis_job_status", { p_analysis_id: analysisId });
      const row = data?.[0];
      if (!row || stopped) return;
      const next = row.status as JobStatus;
      setStatus((prev) => {
        // Reject a poll that would move to an unreachable status (stale response).
        if (!isLegalTransition(prev as AnalysisJobStatus, next as AnalysisJobStatus)) return prev;
        return next;
      });
      setMessage(row.user_message ?? null);
      setAttemptCount(row.attempt_count ?? 0);
      if (row.updated_at) setUpdatedAtMs(Date.parse(row.updated_at));
      if (TERMINAL.includes(next)) {
        stopped = true;
        window.clearInterval(timer);
        if (next === "completed") router.refresh();
      }
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [analysisId, status, router]);

  // 1 s ticker so the ETA + within-band creep advance smoothly between polls.
  useEffect(() => {
    if (TERMINAL.includes(status)) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  const progress = normalizeJobProgress({
    status: status as AnalysisJobStatus,
    updatedAtMs,
    nowMs,
    attemptCount,
    userMessage: message,
  });

  // Hold the displayed percentage monotonic within a single run (never visibly regress).
  const maxPercentRef = useRef(0);
  if (progress.lifecycle === "queued" || progress.lifecycle === "retrying") {
    // Indeterminate phases legitimately reset the floor (a retry restarts the pipeline).
    if (progress.lifecycle === "retrying") maxPercentRef.current = 0;
  } else if (progress.overallProgress != null) {
    maxPercentRef.current = Math.max(maxPercentRef.current, progress.overallProgress);
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
  const percent = isComplete ? 100 : Math.max(maxPercentRef.current, progress.overallProgress ?? 0);
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
        {progress.etaLabel && !isComplete && (
          <p className="shrink-0 text-xs font-medium text-[#7e8797]">{progress.etaLabel}</p>
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
