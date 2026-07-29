import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadOverlayFrames } from "@/lib/video/loadOverlayFrames";
import { computeSprintMeasurements, type SprintMeasurements } from "@/lib/benchmark/measurements";
import type { ManualCalibrationPoints } from "@/lib/calibration";
import { buildTrustedMetrics, type TrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import { normalizeFps, isValidFps, applyFpsOverride } from "@/lib/video/fps";
import { calibrationGatesSchema } from "@/lib/calibration/gates";
import {
  calibrationAuthority,
  mergeCalibrationAuthority,
  normalizeCalibrationAuthority,
} from "@/lib/calibration/authority";
import { buildLimitingFactorsFromSession } from "./index";
import type { LimitingFactorsResult } from "./types";

/** Cumulative pan above which camera-motion compensation is applied (mirrors the analysis
 *  page). Below it a stationary recording uses the clean uncompensated coordinate path. */
const CAMERA_MEANINGFUL_PAN_CUMULATIVE = 0.25;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The shared, read-only analysis-intelligence context: the authoritative measurement +
 *  trusted-metric + calibration records plus the Limiting Factors result. Both the Limiting
 *  Factors page and Sprint Intelligence consume this — the measurement math is computed once
 *  here and never re-implemented. It NEVER modifies anything. */
export interface IntelligenceContext {
  found: boolean;
  sessionName: string | null;
  analysisType: string | null;
  currentAnalysisId: string | null;
  measurements: SprintMeasurements | null;
  trusted: TrustedMetrics | null;
  athlete: {
    heightCm: number | null;
    legLengthCm: number | null;
    trochanterHeightM: number | null;
    weightKg: number | null;
  } | null;
  calibrationConfirmed: boolean;
  spatialAvailable: boolean;
  zoneDistanceM: number | null;
  sessionDate: string | null;
  result: LimitingFactorsResult | null;
}

export async function loadIntelligenceContext(sessionId: string): Promise<IntelligenceContext> {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, name, original_filename, created_at, analysis_type, width, height, fps, fps_override, current_working_analysis_id, distance_m, calibration_gates, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, athletes(full_name, height_cm, weight_kg, leg_length_cm, trochanter_height_m)",
    )
    .eq("id", sessionId)
    .single();
  if (!session)
    return {
      found: false,
      sessionName: null,
      analysisType: null,
      currentAnalysisId: null,
      measurements: null,
      trusted: null,
      athlete: null,
      calibrationConfirmed: false,
      spatialAvailable: false,
      zoneDistanceM: null,
      sessionDate: null,
      result: null,
    };

  const sessionName = session.name ?? session.original_filename ?? "Session";
  const analysisType = session.analysis_type ?? null;

  const { data: analysis } = session.current_working_analysis_id
    ? await supabase
        .from("analyses")
        .select("keypoints_path, status, workspace_config")
        .eq("id", session.current_working_analysis_id)
        .maybeSingle()
    : { data: null };

  const { frames: rawFrames, meta } =
    analysis?.status === "complete" && analysis.keypoints_path
      ? await loadOverlayFrames(supabase, analysis.keypoints_path)
      : { frames: [], meta: null };

  const width = session.width ?? meta?.width ?? null;
  const height = session.height ?? meta?.height ?? null;
  const detectedFps = session.fps ?? meta?.fps ?? null;
  const overrideFps = isValidFps(session.fps_override) ? session.fps_override : null;
  const effectiveFps = overrideFps ?? normalizeFps(detectedFps);
  const frames = overrideFps != null && isValidFps(effectiveFps) ? applyFpsOverride(rawFrames, effectiveFps) : rawFrames;

  const manualPoints: ManualCalibrationPoints | null =
    session.calibration_point_ax != null &&
    session.calibration_point_ay != null &&
    session.calibration_point_bx != null &&
    session.calibration_point_by != null &&
    session.calibration_known_distance_m != null
      ? {
          ax: session.calibration_point_ax,
          ay: session.calibration_point_ay,
          bx: session.calibration_point_bx,
          by: session.calibration_point_by,
          distanceM: session.calibration_known_distance_m,
          aTimeS: session.calibration_point_a_time_s ?? null,
          bTimeS: session.calibration_point_b_time_s ?? null,
        }
      : null;

  const snapshot = calibrationGatesSchema.safeParse(jsonRecord(analysis?.workspace_config).calibrationInputs
    ? jsonRecord(jsonRecord(analysis?.workspace_config).calibrationInputs).gates
    : undefined);
  const durable = calibrationGatesSchema.safeParse(session.calibration_gates);
  const calibrationGates = mergeCalibrationAuthority(
    durable.success ? normalizeCalibrationAuthority(durable.data) : null,
    snapshot.success ? normalizeCalibrationAuthority(snapshot.data) : null,
  );
  const calibrationConfirmed = Boolean(
    calibrationGates &&
      calibrationGates.distanceM &&
      calibrationAuthority(calibrationGates).source === "manual_confirmed",
  );

  const cameraEvidence = meta?.cameraEvidence;
  const cumulativePan = cameraEvidence
    ? cameraEvidence.transforms.reduce((s, t) => s + Math.abs(t.translationX ?? 0), 0)
    : 0;
  const cameraPans = cumulativePan > CAMERA_MEANINGFUL_PAN_CUMULATIVE;

  const measurements =
    analysisType === "fly" && frames.length && width && height
      ? computeSprintMeasurements(frames, manualPoints, width, height, {
          gates: calibrationGates,
          cameraEvidence: cameraPans ? cameraEvidence : undefined,
        })
      : null;
  const trusted: TrustedMetrics | null = buildTrustedMetrics(measurements, meta?.recordingAssessment);
  const spatialAvailable = Boolean(trusted?.avgStrideLengthM != null || trusted?.avgVelocityMps != null);

  const athletesRel = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const athlete = athletesRel
    ? {
        heightCm: athletesRel.height_cm ?? null,
        legLengthCm: athletesRel.leg_length_cm ?? null,
        trochanterHeightM: athletesRel.trochanter_height_m ?? null,
        weightKg: athletesRel.weight_kg ?? null,
      }
    : null;

  const zoneDistanceM = session.calibration_known_distance_m ?? session.distance_m ?? null;

  const result = buildLimitingFactorsFromSession({
    sessionId: session.id,
    sessionDate: session.created_at ?? null,
    analysisType,
    zoneDistanceM,
    calibrationConfirmed,
    spatialAvailable,
    measurements,
    trusted,
    athlete,
  });

  return {
    found: true,
    sessionName,
    analysisType,
    currentAnalysisId: session.current_working_analysis_id ?? null,
    measurements,
    trusted,
    athlete,
    calibrationConfirmed,
    spatialAvailable,
    zoneDistanceM,
    sessionDate: session.created_at ?? null,
    result,
  };
}

/**
 * Read-only: the Limiting Factors result for a session. Thin wrapper over the shared
 * {@link loadIntelligenceContext} loader so the measurement math is computed in exactly one
 * place and reused by Sprint Intelligence.
 */
export async function loadLimitingFactors(
  sessionId: string,
): Promise<{ result: LimitingFactorsResult | null; sessionName: string | null; found: boolean; analysisType: string | null }> {
  const ctx = await loadIntelligenceContext(sessionId);
  return { result: ctx.result, sessionName: ctx.sessionName, found: ctx.found, analysisType: ctx.analysisType };
}
