import "server-only";
import { ANALYSIS_PIPELINE_VERSION, METRIC_SCHEMA_VERSION } from "@/lib/analysis/resultContract";
import { buildCoachingRecommendations } from "@/lib/coachingRecommendations";
import { loadIntelligenceContext } from "@/lib/limitingFactors/loadContext";
import { loadSprintIntelligence } from "@/lib/sprintIntelligence/loadContext";
import { createClient } from "@/lib/supabase/server";
import { buildSprintAnalysisReport, LIMITER_MODEL_VERSION } from "./builder";
import type { ReportAudience, SprintAnalysisReport } from "./types";

export type AnalysisReportLoadResult = {
  found: boolean;
  authorized: boolean;
  state: "ready" | "processing" | "failed" | "source_unavailable";
  report: SprintAnalysisReport | null;
  sessionName: string | null;
};

export async function loadAnalysisReport(
  sessionId: string,
  audience: ReportAudience,
): Promise<AnalysisReportLoadResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { found: false, authorized: false, state: "source_unavailable", report: null, sessionName: null };

  // Session RLS is the server-side authorization boundary. The report never accepts an
  // athlete or analysis ID independently of this authorized session record.
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id,name,original_filename,athlete_id,created_at,recorded_at,analysis_type,distance_m,fps,fps_override,notes,timing_mode,timing_body_reference,current_working_analysis_id,athletes(id,full_name,height_cm,weight_kg,leg_length_cm,trochanter_height_m)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { found: false, authorized: true, state: "source_unavailable", report: null, sessionName: null };
  const sessionName = session.name ?? session.original_filename ?? "Sprint session";
  if (!session.current_working_analysis_id)
    return { found: true, authorized: true, state: "source_unavailable", report: null, sessionName };

  const { data: analysis } = await supabase
    .from("analyses")
    .select("id,status,completed_at,analysis_pipeline_version,metric_schema_version")
    .eq("id", session.current_working_analysis_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!analysis) return { found: true, authorized: true, state: "source_unavailable", report: null, sessionName };
  if (analysis.status === "queued" || analysis.status === "running")
    return { found: true, authorized: true, state: "processing", report: null, sessionName };
  if (analysis.status !== "complete")
    return { found: true, authorized: true, state: "failed", report: null, sessionName };

  const intelligenceContext = await loadIntelligenceContext(sessionId);
  const sprint = await loadSprintIntelligence(sessionId, intelligenceContext);
  if (!intelligenceContext.result || !sprint.report)
    return { found: true, authorized: true, state: "source_unavailable", report: null, sessionName };

  const coaching = buildCoachingRecommendations({
    analysisId: analysis.id,
    sessionId,
    generatedAt: sprint.report.generatedAt,
    limitingFactors: intelligenceContext.result,
    sprintIntelligence: sprint.report,
    context: {
      analysisType: intelligenceContext.analysisType,
      injuryStatus: null,
      painReported: null,
      clinicianRestrictions: null,
      historicalSessions: null,
    },
  });
  const relation = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const trusted = intelligenceContext.trusted;
  const measurements = intelligenceContext.measurements;
  const report = buildSprintAnalysisReport({
    generatedAt: analysis.completed_at ?? sprint.report.generatedAt,
    analysisId: analysis.id,
    sessionId,
    athleteId: relation?.id ?? session.athlete_id,
    audience,
    athlete: {
      displayName: relation?.full_name ?? "Athlete",
      heightCm: relation?.height_cm ?? null,
      weightKg: relation?.weight_kg ?? null,
      legLengthCm: relation?.leg_length_cm ?? null,
      trochanterHeightM: relation?.trochanter_height_m ?? null,
    },
    session: {
      name: sessionName,
      sessionDate: session.recorded_at ?? session.created_at ?? null,
      analysisDate: analysis.completed_at ?? sprint.report.generatedAt,
      sprintContext: session.analysis_type === "acceleration" ? "Acceleration" : "Maximum-velocity / fly",
      zoneType: session.timing_mode?.replaceAll("_", " ") ?? "Authoritative measured zone",
      zoneDistanceM: intelligenceContext.zoneDistanceM ?? session.distance_m ?? null,
      videoFps: session.fps_override ?? session.fps ?? null,
      calibrationMethod: intelligenceContext.calibrationConfirmed ? "Manually confirmed timing-zone calibration" : "Calibration unavailable",
      validSteps: measurements?.validContacts ?? null,
      sessionNotes: audience === "athlete" ? null : session.notes ?? null,
    },
    metrics: {
      average_step_length: trusted?.avgStrideLengthM ?? null,
      peak_step_length: trusted?.peakStrideLengthM ?? null,
      step_frequency: trusted?.frequencyHz ?? null,
      average_velocity: trusted?.avgVelocityMps ?? null,
      peak_velocity: trusted?.topSpeedMps ?? null,
    },
    metricConfidence: trusted?.stepLengthConfidence ?? "unavailable",
    metricEngineVersion: analysis.metric_schema_version ?? METRIC_SCHEMA_VERSION,
    limiterModelVersion: LIMITER_MODEL_VERSION,
    limitingFactors: intelligenceContext.result,
    sprintIntelligence: sprint.report,
    coachingRecommendations: coaching,
  });
  // Keep the pipeline fallback visible through the structured report version snapshot.
  report.versions.metricEngine = `${report.versions.metricEngine} · ${analysis.analysis_pipeline_version ?? ANALYSIS_PIPELINE_VERSION}`;
  return { found: true, authorized: true, state: "ready", report, sessionName };
}
