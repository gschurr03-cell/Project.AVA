"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvaPanel } from "@/components/ava/AvaPanel";
import type { Database } from "@/lib/supabase/database.types";
import RerunAnalysisButton from "./RerunAnalysisButton";

type JobStatus = Database["public"]["Enums"]["analysis_job_status"];

const TERMINAL: JobStatus[] = ["completed", "failed", "dead_lettered", "cancelled"];
const FAILED: JobStatus[] = ["failed", "dead_lettered", "cancelled"];

/**
 * Ordered pipeline stages, each backed by REAL worker job statuses (no invented
 * precision). The worker only emits coarse statuses, so several human stages map to the
 * same status honestly rather than faking sub-steps. The active stage is the last one
 * whose statuses include the current job status.
 */
const STAGES: { label: string; statuses: JobStatus[] }[] = [
  { label: "Queued", statuses: ["queued", "retry_scheduled"] },
  { label: "Preparing analysis", statuses: ["claimed"] },
  { label: "Locating video", statuses: ["downloading"] },
  { label: "Starting pose analysis", statuses: ["validating"] },
  { label: "Tracking athlete · detecting contacts & steps", statuses: ["processing"] },
  { label: "Calculating metrics · sprint intelligence", statuses: ["generating_results"] },
  { label: "Finalizing results", statuses: ["uploading_artifacts", "completing"] },
  { label: "Complete", statuses: ["completed"] },
];

function stageIndexFor(status: JobStatus): number {
  const idx = STAGES.findIndex((s) => s.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

/**
 * Live analysis progress card. Appears the moment a rerun (or first run) enters a
 * processing state and stays until the job completes or fails. It polls the authoritative
 * `get_analysis_job_status` RPC, advances a real stage checklist + progress bar as the
 * worker moves through statuses, refreshes the page to reveal results on success, and
 * shows a failure message with a Retry on failure.
 *
 * Refresh-safe: it is seeded from the server-rendered job status, so a page reload during
 * processing re-derives the state from the active job rather than local React state.
 */
export default function AnalysisProgressCard({
  analysisId,
  sessionId,
  initialStatus,
  initialMessage = null,
}: {
  analysisId: string;
  sessionId: string;
  initialStatus: JobStatus;
  initialMessage?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(initialMessage);

  useEffect(() => {
    if (TERMINAL.includes(status)) {
      // Reveal the freshly completed results as soon as the job finishes.
      if (status === "completed") router.refresh();
      return;
    }
    const supabase = createClient();
    let stopped = false;
    const timer = window.setInterval(async () => {
      const { data } = await supabase.rpc("get_analysis_job_status", { p_analysis_id: analysisId });
      const row = data?.[0];
      if (!row || stopped) return;
      setStatus(row.status);
      setMessage(row.user_message ?? null);
      if (TERMINAL.includes(row.status)) {
        stopped = true;
        window.clearInterval(timer);
        if (row.status === "completed") router.refresh();
      }
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [analysisId, status, router]);

  if (FAILED.includes(status)) {
    return (
      <AvaPanel eyebrow="Analysis" title="Analysis failed">
        <p className="text-sm text-[#e46464]">
          {message ?? "The recording could not be analyzed."}
        </p>
        <div className="mt-4">
          <RerunAnalysisButton sessionId={sessionId} label="Retry analysis" />
        </div>
      </AvaPanel>
    );
  }

  const activeIndex = stageIndexFor(status);
  const isComplete = status === "completed";
  const percent = isComplete
    ? 100
    : Math.round(((activeIndex + 0.5) / STAGES.length) * 100);
  const activeLabel = STAGES[activeIndex]?.label ?? "Processing";

  return (
    <AvaPanel eyebrow="Analysis" title="Analysis in progress">
      <div className="flex items-center gap-3">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[#2f80ed]" />
        <p className="text-sm font-semibold text-[#f5f7fb]">{activeLabel}</p>
      </div>

      {/* Progress bar (real stage position; coarse worker statuses mapped honestly). */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Analysis progress"
        data-testid="analysis-progress"
        data-job-status={status}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2f80ed] to-[#3b8eff] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stage checklist — done / active / pending, derived from the live job status. */}
      <ol className="mt-4 space-y-1.5">
        {STAGES.map((stage, i) => {
          const state = i < activeIndex || isComplete ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={stage.label} className="flex items-center gap-2 text-xs">
              <span
                className={
                  state === "done"
                    ? "text-[#89d46a]"
                    : state === "active"
                      ? "text-[#f5f7fb]"
                      : "text-[#55617a]"
                }
              >
                {state === "done" ? "✓" : state === "active" ? "◉" : "○"}
              </span>
              <span
                className={
                  state === "active"
                    ? "font-semibold text-[#f5f7fb]"
                    : state === "done"
                      ? "text-[#b3bccb]"
                      : "text-[#7e8797]"
                }
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[11px] text-[#7e8797]">
        Your previous result is being replaced. Results will appear automatically when
        processing finishes — you can leave this page and come back.
      </p>
    </AvaPanel>
  );
}
