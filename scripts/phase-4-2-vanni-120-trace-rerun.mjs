// Phase 4.2 (2026-08-05) — trace rerun for vanni_fly_120 only. Requeues the
// exact same working analysis through the real worker/queue path
// (`replace_working_analysis`, same RPC `queueAnalysis` uses), with a fresh
// input_snapshot built from live session/athlete fields (mirrors
// scripts/phase-4-1-real-reruns-fix-snapshot.mjs's proven pattern, since this
// session's input_snapshot was found null in Phase 4.1). Saves the pre-run
// working analysis as an immutable version first. The box_tracker.py trace
// hook added this phase is a pure read+file-write diagnostic with zero
// control-flow effect, so this run's metrics should reproduce Phase 4.1's
// post-fix baseline byte-for-byte — that reproduction is itself verified
// after the run, not assumed.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });

const sessionId = "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff";
const analysisId = "6d9a6aba-d099-4a33-b8ea-2dd4962fe80c";

const { data: session, error: sessionError } = await db
  .from("sessions")
  .select(
    "id, video_path, analysis_type, distance_m, benchmark_id, pose_engine, fps, fps_classification, fps_override, " +
      "calibration_zone_start_s, calibration_zone_end_s, calibration_zone_distance_m, calibration_point_ax, " +
      "calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, " +
      "calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, timing_mode, timing_direction, " +
      "timing_body_reference, timing_splits, timing_setup, " +
      "athletes!inner(id, sex, date_of_birth, height_cm, weight_kg, leg_length_cm, trochanter_height_m, " +
      "personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m)",
  )
  .eq("id", sessionId)
  .single();
if (sessionError || !session) throw sessionError ?? new Error("session missing");
const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;

const { data: current, error: currentError } = await db
  .from("analyses")
  .select("id,analysis_fps,analysis_pipeline_version,metric_schema_version,explainability_schema_version,timing_compatibility_group")
  .eq("id", analysisId)
  .single();
if (currentError || !current) throw currentError ?? new Error("current analysis missing");

const { data: savedVersionId, error: saveError } = await db.rpc("save_working_analysis_snapshot", {
  p_session_id: sessionId,
  p_notes: "Phase 4.2 pre-trace-rerun snapshot (box_tracker.py trace-hook-only change, 2026-08-05)",
});
if (saveError || !savedVersionId) throw saveError ?? new Error("save_working_analysis_snapshot failed");

const requestedAnalysisFps =
  session.fps_classification === "experimental_30_fps_class"
    ? 30
    : (session.fps_classification === "native_source_class" ||
          session.fps_classification === "validated_high_speed_native_class") &&
        session.fps
      ? Math.round(session.fps * 1000) / 1000
      : 60;

const inputSnapshot = {
  capturedAt: new Date().toISOString(),
  athlete: {
    id: athlete.id,
    sex: athlete.sex,
    dateOfBirth: athlete.date_of_birth,
    heightCm: athlete.height_cm,
    weightKg: athlete.weight_kg,
    legLengthCm: athlete.leg_length_cm,
    trochanterHeightM: athlete.trochanter_height_m,
    personalBests: { "60m": athlete.personal_best_60m, "100m": athlete.personal_best_100m, "200m": athlete.personal_best_200m },
    goals: { "60m": athlete.goal_60m, "100m": athlete.goal_100m, "200m": athlete.goal_200m },
  },
  session: {
    analysisType: session.analysis_type,
    distanceM: session.distance_m,
    benchmarkId: session.benchmark_id,
    recordingMode: "uploaded_video",
    timingZone: {
      startS: session.calibration_zone_start_s,
      endS: session.calibration_zone_end_s,
      distanceM: session.calibration_zone_distance_m,
      mode: session.timing_mode,
      direction: session.timing_direction,
      bodyReference: session.timing_body_reference,
      splits: session.timing_splits,
    },
    timingSetup: session.timing_setup,
    calibrationInputs: {
      pointA: [session.calibration_point_ax, session.calibration_point_ay],
      pointB: [session.calibration_point_bx, session.calibration_point_by],
      knownDistanceM: session.calibration_known_distance_m,
      pointATimeS: session.calibration_point_a_time_s,
      pointBTimeS: session.calibration_point_b_time_s,
      gates: session.calibration_gates,
    },
    requestedOptions: {
      analysisFps: requestedAnalysisFps,
      poseEngine: "mediapipe",
      fpsOverride: session.fps_override,
    },
  },
};

const { data: requeuedId, error: queueError } = await db.rpc("replace_working_analysis", {
  p_session_id: sessionId,
  p_input_snapshot: inputSnapshot,
  p_analysis_fps: current.analysis_fps,
  p_pipeline_version: current.analysis_pipeline_version,
  p_metric_schema_version: current.metric_schema_version,
  p_explainability_schema_version: current.explainability_schema_version,
  p_timing_compatibility_group: current.timing_compatibility_group,
});
if (queueError || !requeuedId) throw queueError ?? new Error("replace_working_analysis failed");

console.log(JSON.stringify({ savedVersionId, requeuedId }, null, 2));
