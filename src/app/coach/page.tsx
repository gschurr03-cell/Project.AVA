import { redirect } from "next/navigation";
import { buildCoachRoster, buildTeamAnalytics, type CoachAthleteInput } from "@/lib/coachWorkspace";
import { buildProgressCenter, type ProgressAnalysisInput } from "@/lib/progressCenter";
import { createClient } from "@/lib/supabase/server";
import CoachWorkspaceDashboard from "./CoachWorkspaceDashboard";

export default async function CoachWorkspacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/coach");
  const { data: athletes } = await supabase.from("athletes")
    .select("id, full_name, photo_url, primary_event, age_group").order("full_name");
  const athleteIds = (athletes ?? []).map((athlete) => athlete.id);
  const { data: sessions } = athleteIds.length ? await supabase.from("sessions")
    .select("id, athlete_id, name, original_filename, created_at, recorded_at, fps, calibration_gates, calibration_known_distance_m, analysis_type")
    .in("athlete_id", athleteIds) : { data: [] };
  const sessionIds = (sessions ?? []).map((session) => session.id);
  const { data: analyses } = sessionIds.length ? await supabase.from("analyses")
    .select("id, session_id, status, metrics, created_at, completed_at, analysis_fps, source_fps, is_current_working, version_number")
    .in("session_id", sessionIds).eq("status", "complete") : { data: [] };
  const { data: preferences } = athleteIds.length ? await supabase.from("coach_athlete_preferences")
    .select("athlete_id, favorite, last_viewed_at").eq("coach_id", user.id).in("athlete_id", athleteIds) : { data: [] };
  const sessionMap = new Map((sessions ?? []).map((session) => [session.id, session]));
  const prefMap = new Map((preferences ?? []).map((preference) => [preference.athlete_id, preference]));
  const rowsByAthlete = new Map<string, ProgressAnalysisInput[]>();
  for (const analysis of analyses ?? []) {
    const session = sessionMap.get(analysis.session_id);
    if (!session) continue;
    const rows = rowsByAthlete.get(session.athlete_id) ?? [];
    rows.push({
      id: analysis.id, sessionId: session.id, sessionName: session.name ?? session.original_filename ?? "Sprint session",
      sessionCreatedAt: session.created_at, recordedAt: session.recorded_at, analysisCreatedAt: analysis.created_at,
      completedAt: analysis.completed_at, status: analysis.status, metrics: analysis.metrics,
      analysisFps: analysis.analysis_fps, sourceFps: analysis.source_fps ?? session.fps,
      calibrationPresent: !!(session.calibration_gates || session.calibration_known_distance_m),
      analysisType: session.analysis_type, isCurrentWorking: analysis.is_current_working, versionNumber: analysis.version_number,
    });
    rowsByAthlete.set(session.athlete_id, rows);
  }
  const inputs: CoachAthleteInput[] = (athletes ?? []).map((athlete) => ({
    id: athlete.id, name: athlete.full_name, photoUrl: athlete.photo_url,
    event: athlete.primary_event, ageGroup: athlete.age_group,
    favorite: prefMap.get(athlete.id)?.favorite ?? false,
    lastViewedAt: prefMap.get(athlete.id)?.last_viewed_at ?? null,
    report: buildProgressCenter(rowsByAthlete.get(athlete.id) ?? []),
  }));
  const roster = buildCoachRoster(inputs);
  return <CoachWorkspaceDashboard roster={roster} analytics={buildTeamAnalytics(inputs, roster)} athleteInputs={inputs} />;
}
