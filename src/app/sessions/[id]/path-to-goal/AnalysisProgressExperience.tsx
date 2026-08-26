"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isLegalTransition, type AnalysisJobStatus } from "@/lib/analysisProgress";
import {
  computeAnalysisProgress,
  type AnalysisProgress,
} from "@/lib/intelligence/performanceGap/presentation";

/**
 * Stage-based analysis progress (Part B). Replaces the loading spinner with a true
 * ten-stage experience driven by the REAL worker job status (polled). Never fakes
 * progress: the active stage comes from the live signal; a slow stage is reported as
 * still-running; time remaining is clearly an estimate.
 */
const TERMINAL = new Set(["completed", "failed", "dead_lettered", "cancelled"]);

export default function AnalysisProgressExperience({
  analysisId,
  initialStatus,
  initialUpdatedAt,
  startedAtMs,
}: {
  analysisId: string;
  initialStatus: string;
  initialUpdatedAt: string | null;
  startedAtMs: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const acceptedRef = useRef({ status: initialStatus, updatedAtMs: initialUpdatedAt ? Date.parse(initialUpdatedAt) : 0 });
  const completionRefreshRef = useRef(false);
  // Hydration-safe: seed from the server-provided `startedAtMs` snapshot (identical on
  // server and client) rather than each side's own `Date.now()`, which differ by
  // however long hydration took and flip the rendered percent/text between the server
  // and client's first render. The real clock starts ticking from the effect below,
  // strictly after mount — a normal post-hydration update, not part of the first paint.
  const [now, setNow] = useState(() => startedAtMs);
  const startRef = useRef(startedAtMs);

  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (TERMINAL.has(status)) {
      if (status === "completed" && !completionRefreshRef.current) {
        completionRefreshRef.current = true;
        router.refresh();
      }
      return;
    }
    const supabase = createClient();
    let stopped = false;
    let pollInFlight = false;
    const timer = window.setInterval(async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      const { data } = await supabase.rpc("get_analysis_job_status", { p_analysis_id: analysisId });
      pollInFlight = false;
      const row = data?.[0];
      if (stopped || !row) return;
      const nextUpdatedAtMs = row.updated_at ? Date.parse(row.updated_at) : 0;
      const accepted = acceptedRef.current;
      if (nextUpdatedAtMs < accepted.updatedAtMs) return;
      if (nextUpdatedAtMs === accepted.updatedAtMs && row.status !== accepted.status) return;
      if (!isLegalTransition(accepted.status as AnalysisJobStatus, row.status as AnalysisJobStatus)) return;
      acceptedRef.current = { status: row.status, updatedAtMs: nextUpdatedAtMs };
      // `status` from the queue IS the fine-grained worker stage (downloading,
      // validating, completing, …) — the real signal, never faked.
      setStatus(row.status);
      if (TERMINAL.has(row.status)) {
        stopped = true;
        window.clearInterval(timer);
        if (row.status === "completed" && !completionRefreshRef.current) {
          completionRefreshRef.current = true;
          router.refresh();
        }
      }
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [analysisId, status, router]);

  const elapsedSeconds = Math.max(0, Math.round((now - startRef.current) / 1000));
  // The queue status is the fine-grained stage; normalize the terminal-failure
  // variants to "failed" for the model, and pass the raw status as the stage.
  const modelStatus =
    status === "completed" ? "completed" : ["failed", "dead_lettered", "cancelled"].includes(status) ? "failed" : status;
  const progress: AnalysisProgress = computeAnalysisProgress({ status: modelStatus, workerStage: status, elapsedSeconds });

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#101827] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">Analysing sprint</p>
        <p className="text-sm font-semibold text-[#f5f7fb]">{progress.percent}%</p>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${progress.failed ? "bg-[#e46464]" : "bg-[#2f80ed]"}`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={`font-semibold ${progress.failed ? "text-[#e46464]" : "text-[#f5f7fb]"}`}>
          {progress.failed ? `Failed during: ${progress.activeStageLabel}` : progress.activeStageLabel}
          {progress.stalled && !progress.failed && (
            <span className="ml-2 text-[#f5c451]">still running…</span>
          )}
        </span>
        {!TERMINAL.has(status) && progress.estimatedRemainingSeconds != null && (
          <span className="text-[#7e8797]">~{progress.estimatedRemainingSeconds}s remaining (estimated)</span>
        )}
      </div>

      <ol className="mt-4 space-y-1.5">
        {progress.stages.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                s.state === "complete" ? "bg-[#89d46a]" : s.state === "active" ? "bg-[#2f80ed]" : "bg-white/15"
              }`}
            />
            <span
              className={
                s.state === "complete"
                  ? "text-[#89d46a]"
                  : s.state === "active"
                    ? "font-semibold text-[#f5f7fb]"
                    : "text-[#7e8797]"
              }
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
