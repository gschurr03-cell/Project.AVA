import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { analysisMetricsSchema } from "@/lib/biomechanics/types";
import { buildAthletePerformanceModel } from "@/lib/intelligence/performanceGap";
import { buildPathToGoalView } from "@/lib/intelligence/performanceGap/presentation";
import PathToGoalExperience from "./PathToGoalExperience";
import AnalysisProgressExperience from "./AnalysisProgressExperience";

/**
 * Path To Goal — the primary coaching page (Part B). Composes the athlete's stated
 * goal (from their profile) with the sprint metrics from the latest analysis, runs
 * the Part A Athlete Intelligence engines, and renders the roadmap. RLS-scoped.
 * A separate NEW route — it does not modify the existing analysis page.
 */
type Num = number | null | undefined;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const perSide = (obj: unknown, key: string): number | null =>
  obj && typeof obj === "object" ? num((obj as Record<string, unknown>)[key]) : null;

export default async function PathToGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, name, athlete_id, distance_m, athletes(full_name, personal_best_100m, goal_100m)",
    )
    .eq("id", id)
    .single();
  if (!session) notFound();

  const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;

  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, status, metrics")
    .eq("session_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inFlight = analysis?.status === "queued" || analysis?.status === "running";

  const parsed = analysis?.status === "complete" ? analysisMetricsSchema.safeParse(analysis.metrics) : null;
  const m = parsed?.success ? (parsed.data as Record<string, unknown>) : null;

  const currentTimeS = num(athlete?.personal_best_100m);
  const goalTimeS = num(athlete?.goal_100m);
  const distanceM = 100;

  // Map the analysis metrics into the engine's registry ids (defensive; null-safe).
  const metrics: Record<string, Num> = m
    ? {
        peakVelocity: num(m.topSpeedMps),
        averageVelocity: currentTimeS ? distanceM / currentTimeS : null,
        strideLength: num(m.avgStrideLengthM),
        strideFrequency: num(m.strideFrequencyHz),
        groundContactTime: num(m.groundContactTimeMs) != null ? (num(m.groundContactTimeMs) as number) / 1000 : null,
        flightTime: num(m.flightTimeMs) != null ? (num(m.flightTimeMs) as number) / 1000 : null,
      }
    : {};

  // Left/right pairs from the per-side sub-objects the analysis provides.
  const leftRightMetrics: Record<string, Num> = m
    ? {
        groundContactTimeLeft: perSide(m.left, "groundContactTimeMs") != null ? (perSide(m.left, "groundContactTimeMs") as number) / 1000 : null,
        groundContactTimeRight: perSide(m.right, "groundContactTimeMs") != null ? (perSide(m.right, "groundContactTimeMs") as number) / 1000 : null,
        flightTimeLeft: perSide(m.left, "flightTimeMs") != null ? (perSide(m.left, "flightTimeMs") as number) / 1000 : null,
        flightTimeRight: perSide(m.right, "flightTimeMs") != null ? (perSide(m.right, "flightTimeMs") as number) / 1000 : null,
      }
    : {};

  const hasGoal = currentTimeS != null && goalTimeS != null;

  return (
    <main className="ava-carbon mx-auto min-h-screen max-w-5xl p-4 sm:p-8">
      <Link href={`/sessions/${id}`} className="text-sm text-[#b3bccb] transition hover:text-[#f5f7fb]">
        ← Back to analysis
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#f5f7fb]">Path To Goal</h1>
        <p className="mt-1 text-sm text-[#7e8797]">
          {athlete?.full_name ? `${athlete.full_name} — ` : ""}your roadmap from current performance to your target.
        </p>
      </div>

      {inFlight && analysis ? (
        <AnalysisProgressExperience analysisId={analysis.id} initialStatus="processing" startedAtMs={Date.now()} />
      ) : !hasGoal ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#101827] p-6 text-sm text-[#b3bccb]">
          Add a 100 m personal best and goal on the athlete&apos;s profile to generate a Path To Goal. AVA needs a
          current and target time to estimate what must change.
        </div>
      ) : (
        (() => {
          const model = buildAthletePerformanceModel({
            athleteId: session.athlete_id,
            distanceM,
            currentTimeS,
            goalTimeS,
            metrics,
          });
          const view = buildPathToGoalView(model, leftRightMetrics);
          return <PathToGoalExperience view={view} />;
        })()
      )}
    </main>
  );
}
