import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildProgressCenter, type ProgressAnalysisInput } from "@/lib/progressCenter";
import ProgressCenterDashboard from "./ProgressCenterDashboard";

export default async function AthleteProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/athletes/${id}/progress`)}`);
  const { data: athlete } = await supabase.from("athletes")
    .select("id, full_name, personal_best_60m, personal_best_100m, personal_best_200m")
    .eq("id", id).single();
  if (!athlete) notFound();
  const { data: sessions } = await supabase.from("sessions")
    .select("id, name, original_filename, created_at, recorded_at, fps, calibration_gates, calibration_known_distance_m, analysis_type, current_working_analysis_id")
    .eq("athlete_id", id).order("created_at", { ascending: true });
  const sessionIds = sessions?.map((session) => session.id) ?? [];
  const { data: analyses } = sessionIds.length
    ? await supabase.from("analyses")
      .select("id, session_id, status, metrics, created_at, completed_at, analysis_fps, source_fps, is_current_working, version_number")
      .in("session_id", sessionIds).eq("status", "complete").order("created_at", { ascending: true })
    : { data: [] };
  const sessionMap = new Map((sessions ?? []).map((session) => [session.id, session]));
  const inputs: ProgressAnalysisInput[] = (analyses ?? []).flatMap((analysis) => {
    const session = sessionMap.get(analysis.session_id);
    if (!session) return [];
    return [{
      id: analysis.id, sessionId: session.id,
      sessionName: session.name ?? session.original_filename ?? "Sprint session",
      sessionCreatedAt: session.created_at, recordedAt: session.recorded_at,
      analysisCreatedAt: analysis.created_at, completedAt: analysis.completed_at,
      status: analysis.status, metrics: analysis.metrics, analysisFps: analysis.analysis_fps,
      sourceFps: analysis.source_fps ?? session.fps, calibrationPresent: !!(session.calibration_gates || session.calibration_known_distance_m),
      analysisType: session.analysis_type, isCurrentWorking: analysis.is_current_working,
      versionNumber: analysis.version_number,
    }];
  });
  return <ProgressCenterDashboard athlete={{
    id: athlete.id, fullName: athlete.full_name,
    personalBests: [
      { label: "60 m PB", value: athlete.personal_best_60m, unit: "s" },
      { label: "100 m PB", value: athlete.personal_best_100m, unit: "s" },
      { label: "200 m PB", value: athlete.personal_best_200m, unit: "s" },
    ],
  }} report={buildProgressCenter(inputs)} />;
}
