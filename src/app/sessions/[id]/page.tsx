import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { analysisMetricsSchema, type AnalysisMetrics } from "@/lib/biomechanics/types";
import {
  ANALYSIS_STATUS_LABELS,
  formatBytes,
  formatDuration,
  sessionDisplayName,
  STATUS_LABELS,
} from "@/lib/sessions";
import { deleteSession, queueAnalysis, renameSession } from "@/app/sessions/actions";
import { generateCoachingReport } from "@/lib/coaching/report";
import { compareCoachingReports } from "@/lib/coaching/comparison";
import type { CoachingComparisonReport } from "@/lib/coaching/types";
import MetricsPanel from "./MetricsPanel";
import InsightPanel from "./InsightPanel";

/** Map validated analysis metrics onto the coaching engine's metric keys. */
function toCoachingMetrics(data: AnalysisMetrics) {
  return {
    stepFrequency: data.strideFrequencyHz,
    groundContactTime: data.groundContactTimeMs,
    flightTime: data.flightTimeMs,
    strideLength: data.avgStrideLengthM,
  };
}

/**
 * Session detail page. Shows the session's metadata and lets the coach rename
 * or delete it. All reads are RLS-scoped, so a session the coach doesn't own
 * simply isn't found.
 */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, name, original_filename, video_path, status, created_at, athlete_id, duration_s, width, height, fps, codec, size_bytes, athletes(full_name)",
    )
    .eq("id", id)
    .single();

  if (!session) notFound();

  const displayName = sessionDisplayName(session);

  // Latest analysis for this session (read-only RLS access).
  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, status, error, metrics, created_at, completed_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analysisInFlight = analysis?.status === "queued" || analysis?.status === "running";

  // `metrics` is opaque JSONB — validate at the read boundary so the panel
  // only ever receives a fully-typed object. A parse failure falls through to
  // a graceful fallback rather than crashing the page.
  const parsedMetrics =
    analysis?.status === "complete" ? analysisMetricsSchema.safeParse(analysis.metrics) : null;

  // Coaching insights now come from the reusable engine, not the panel.
  const coachingReport = parsedMetrics?.success
    ? generateCoachingReport(toCoachingMetrics(parsedMetrics.data), analysis?.id)
    : null;

  // Progress tracking: compare against this athlete's previous completed
  // analysis (any earlier session). Read-only, non-mutating, RLS-scoped.
  let comparisonReport: CoachingComparisonReport | null = null;
  if (coachingReport && analysis) {
    const { data: previousAnalysis } = await supabase
      .from("analyses")
      .select("id, metrics, created_at, sessions!inner(athlete_id)")
      .eq("sessions.athlete_id", session.athlete_id)
      .eq("status", "complete")
      .lt("created_at", analysis.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousAnalysis) {
      const parsedPrevious = analysisMetricsSchema.safeParse(previousAnalysis.metrics);
      if (parsedPrevious.success) {
        const previousReport = generateCoachingReport(
          toCoachingMetrics(parsedPrevious.data),
          previousAnalysis.id,
        );
        comparisonReport = compareCoachingReports(coachingReport, previousReport);
      }
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href={`/athletes/${session.athlete_id}`} className="text-sm text-gray-500 hover:underline">
        ← Back to athlete
      </Link>
      <h1 className="mb-6 mt-2 truncate text-2xl font-bold text-lane">{displayName}</h1>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <dl className="mb-8 grid grid-cols-3 gap-y-3 rounded border p-4 text-sm">
        <dt className="font-medium text-gray-500">Athlete</dt>
        <dd className="col-span-2">{session.athletes?.full_name ?? "—"}</dd>

        <dt className="font-medium text-gray-500">Status</dt>
        <dd className="col-span-2">{STATUS_LABELS[session.status] ?? session.status}</dd>

        <dt className="font-medium text-gray-500">Uploaded</dt>
        <dd className="col-span-2">{new Date(session.created_at).toLocaleString()}</dd>

        <dt className="font-medium text-gray-500">Original file</dt>
        <dd className="col-span-2 break-all">{session.original_filename ?? "—"}</dd>

        <dt className="font-medium text-gray-500">Duration</dt>
        <dd className="col-span-2">{formatDuration(session.duration_s)}</dd>

        <dt className="font-medium text-gray-500">Resolution</dt>
        <dd className="col-span-2">
          {session.width && session.height ? `${session.width}×${session.height}` : "—"}
        </dd>

        <dt className="font-medium text-gray-500">FPS</dt>
        <dd className="col-span-2">{session.fps ?? "—"}</dd>

        <dt className="font-medium text-gray-500">Codec</dt>
        <dd className="col-span-2">{session.codec ?? "—"}</dd>

        <dt className="font-medium text-gray-500">File size</dt>
        <dd className="col-span-2">{formatBytes(session.size_bytes)}</dd>

        <dt className="font-medium text-gray-500">Storage path</dt>
        <dd className="col-span-2 break-all font-mono text-xs">{session.video_path ?? "—"}</dd>
      </dl>

      <section className="mb-8 rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Rename</h2>
        <form action={renameSession} className="flex gap-2">
          <input type="hidden" name="id" value={session.id} />
          <input
            name="name"
            defaultValue={session.name ?? ""}
            placeholder={session.original_filename ?? "Session name"}
            className="flex-1 rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-lane px-4 py-2 text-white">
            Save
          </button>
        </form>
      </section>

      <section className="mb-8 rounded border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">Analysis</h2>
          {analysis && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {ANALYSIS_STATUS_LABELS[analysis.status] ?? analysis.status}
            </span>
          )}
        </div>

        {!analysis && <p className="mb-3 text-gray-500">No analysis has been run yet.</p>}

        {analysisInFlight && (
          <p className="mb-3 text-gray-500">
            Analysis {ANALYSIS_STATUS_LABELS[analysis!.status].toLowerCase()} — results will appear
            here when the worker finishes.
          </p>
        )}

        {analysis?.status === "complete" && (
          <div className="mb-3">
            <p className="mb-3 text-sm text-gray-500">
              Completed{" "}
              {analysis.completed_at ? new Date(analysis.completed_at).toLocaleString() : ""}.
            </p>
            {parsedMetrics?.success ? (
              <>
                <MetricsPanel metrics={parsedMetrics.data} />
                {coachingReport && (
                  <InsightPanel report={coachingReport} comparison={comparisonReport} />
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Metrics are unavailable or could not be read for this analysis.
              </p>
            )}
          </div>
        )}

        {analysis?.status === "failed" && (
          <p className="mb-3 text-sm text-red-700">
            Analysis failed{analysis.error ? `: ${analysis.error}` : ""}.
          </p>
        )}

        {!analysisInFlight && (
          <form action={queueAnalysis}>
            <input type="hidden" name="id" value={session.id} />
            <button type="submit" className="rounded bg-lane px-4 py-2 text-white">
              {analysis ? "Run analysis again" : "Run analysis"}
            </button>
          </form>
        )}
      </section>

      <form action={deleteSession}>
        <input type="hidden" name="id" value={session.id} />
        <button
          type="submit"
          className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Delete session
        </button>
      </form>
    </main>
  );
}
