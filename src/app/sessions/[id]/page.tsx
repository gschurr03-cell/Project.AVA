import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { analysisMetricsSchema } from "@/lib/biomechanics/types";
import { explainableAnalysisResultSchema, provenanceSchema } from "@/lib/analysis/resultContract";
import AnalysisMethodPanel from "./AnalysisMethodPanel";
import { USER_JOB_LABELS } from "@/lib/jobs/policy";
import { accelerationMetricsSchema } from "@/lib/acceleration/schema";
import {
  ANALYSIS_STATUS_LABELS,
  formatBytes,
  formatDuration,
  sessionDisplayName,
  STATUS_LABELS,
} from "@/lib/sessions";
import {
  deleteSession,
  renameSession,
  resetWorkingAnalysis,
  saveAnalysisVersion,
  setSessionAnalysisType,
  setAccelerationFinishDistance,
  setFlyPoseEngine,
} from "@/app/sessions/actions";
import VideoPlayer from "@/components/VideoPlayer";
import { buildTimelineMarkersFromMetrics } from "@/lib/biomechanics/video/timelineMarkers";
import OverlayVideoPlayer from "@/components/video/OverlayVideoPlayer";
import type { OverlayFrame } from "@/lib/video/overlay";
import { loadOverlayFrames } from "@/lib/video/loadOverlayFrames";
import {
  buildCalibrationReport,
  type CalibrationReport,
  type CalibrationZone,
} from "@/lib/calibration";
import { predictPerformance, type RaceDistance } from "@/lib/prediction";
import { detectSprintPhases } from "@/lib/phases";
import { applyFpsOverride, isValidFps, normalizeFps } from "@/lib/video/fps";
import { detectStepMarks, type StepDistanceScale } from "@/lib/video/steps";
import { stepFrequencyFromContacts } from "@/lib/video/cadence";
import type { ManualCalibrationPoints } from "@/lib/calibration";
import { calibrationGatesSchema, type CalibrationGates } from "@/lib/calibration/gates";
import { calibrationAuthority, mergeCalibrationAuthority, normalizeCalibrationAuthority } from "@/lib/calibration/authority";
import { calibrationRevisionOf, classifyResultStatus } from "@/lib/calibration/lifecycle";
import CalibrationStatusCard, { type CalibrationCardStatus } from "./CalibrationStatusCard";
import CalibrationAuthorityControls from "./CalibrationAuthorityControls";
import { computeSprintMeasurements } from "@/lib/benchmark/measurements";
import { isPrecisionLimited } from "@/lib/benchmark/precision";
import { buildTrainingFocus } from "@/lib/coaching/focus";
import { buildSprintIntelligence } from "@/lib/intelligence";
import { deriveLimitingFactors } from "@/lib/intelligence/limitingFactors";
import { buildTrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import {
  buildTrustedMetricConfidence,
  calculateMetricConfidence,
  evidenceFromAnalysis,
} from "@/lib/confidence";
import { analyzeAsymmetry } from "@/lib/intelligence/asymmetry";
import { buildRecommendations } from "@/lib/intelligence/recommendations";
import { buildProgress, snapshotFromAnalysisMetrics } from "@/lib/intelligence/progress";
import { calculateAvaPerformanceScore } from "@/lib/intelligence/performanceScore";
import { evaluateTrochanterStepLength } from "@/lib/intelligence/trochanterOptimizer";
import CalibrationPanel from "./CalibrationPanel";
import AvaIntelligencePanel from "./AvaIntelligencePanel";
import AvaPerformanceScoreCard from "./AvaPerformanceScoreCard";
import PerformancePotentialCard from "./PerformancePotentialCard";
import UnlockSimulatorCard from "./UnlockSimulatorCard";
import AnalysisProgressCard from "./AnalysisProgressCard";
import RerunAnalysisButton from "./RerunAnalysisButton";
import CoachNotesForm from "./CoachNotesForm";
import RecordingQualityCard from "./RecordingQualityCard";
import BenchmarkPanel from "./BenchmarkPanel";
import PerformanceSummaryCard from "./PerformanceSummaryCard";
import CoachingRecommendationsCard from "./CoachingRecommendationsCard";
import ProgressCard from "./ProgressCard";
import AppShell from "@/components/nav/AppShell";
import { AvaPanel } from "@/components/ava/AvaPanel";
import { experimental30ResultSchema } from "@/lib/analysis/experimental30";
import Experimental30TimingCard from "./Experimental30TimingCard";
import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import { AvaInfoStat } from "@/components/ava/AvaInfoStat";
import { buildRecordingQuality, summarisePoseQuality } from "@/lib/recording/quality";
import { accelerationProfileLabel, analysisTypeConfig, isAnalysisType } from "@/lib/analysisTypes";
import AccelerationMetricsPanel from "./AccelerationMetricsPanel";
import { FEATURES } from "@/lib/config/features";
import { toCanonicalIso } from "@/lib/time/canonicalTimestamp";
import {
  buildCompletedAnalysisObservationInput,
  generateObservationResult,
} from "@/lib/observations";
import ObservationDebugPanel from "./ObservationDebugPanel";
import {
  generateInterpretations,
  type InterpretationContext,
} from "@/lib/intelligence/interpretations";
import InterpretationDebugPanel from "./InterpretationDebugPanel";
import { generateRecommendations } from "@/lib/intelligence/recommendationEngine";
import RecommendationDebugPanel from "./RecommendationDebugPanel";
import { generatePriorities } from "@/lib/intelligence/priorityEngine";
import PriorityDebugPanel from "./PriorityDebugPanel";

/** Pull a calibrated measurement value by key from a calibration report. */
function calibratedValue(report: CalibrationReport | null, key: string): number | null {
  return report?.measurements.find((m) => m.key === key)?.value ?? null;
}

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const pointPair = (value: unknown): [number | null, number | null] =>
  Array.isArray(value) ? [finiteNumber(value[0]), finiteNumber(value[1])] : [null, null];

/**
 * MVP metric scope (LOCKED): the analysis page presents only the five primary sprint
 * metrics (step length, stride length, step frequency, average velocity, peak velocity)
 * via PerformanceSummaryCard. Every other secondary metric / score / prediction card is
 * hidden while this is true, keeping the MVP focused and intentional. Flip to re-enable
 * the fuller analysis surface in a later release.
 */
const MVP_FIVE_ONLY = true;

/**
 * Cumulative normalized horizontal camera translation (summed |translationX| across all
 * frames) above which the recording is treated as a genuine pan and camera-motion
 * compensation is applied to the metric engine. Below it the camera is effectively
 * stationary and the clean, uncompensated coordinate path is used (Phase 1). A real pan
 * that follows a sprinter accumulates several frame-widths (>3); a tripod / minor shake
 * stays well under a quarter frame-width.
 */
const CAMERA_MEANINGFUL_PAN_CUMULATIVE = 0.25;

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
  searchParams: Promise<{ error?: string; saved?: string; analysis?: string }>;
}) {
  const { id } = await params;
  const { error, saved, analysis: selectedAnalysisId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(
      "id, name, notes, original_filename, video_path, status, created_at, athlete_id, current_working_analysis_id, analysis_type, pose_engine, distance_m, duration_s, width, height, fps, fps_classification, fps_metadata, fps_override, benchmark_id, calibration_zone_start_s, calibration_zone_end_s, calibration_zone_distance_m, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, timing_mode, timing_direction, timing_body_reference, timing_splits, timing_setup, timing_workspace, overlay_trochanter_x, overlay_trochanter_y, overlay_trochanter_time_s, codec, size_bytes, athletes(full_name, height_cm, weight_kg, leg_length_cm, trochanter_height_m, personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m)",
    )
    .eq("id", id)
    .single();

  // A query *error* (e.g. a selected column missing because a migration hasn't
  // been applied locally) is NOT the same as a genuinely missing row — but with
  // `.single()` both surface as a null `data`, which previously collapsed into a
  // silent 404. Log the real Postgres error so schema drift is diagnosable
  // instead of masquerading as "session not found".
  // PGRST116 = no rows matched (a real not-found); anything else is a query fault.
  if (sessionError && sessionError.code !== "PGRST116") {
    console.error(`[session ${id}] Supabase query failed:`, sessionError);
  }

  if (!session) notFound();

  const displayName = sessionDisplayName(session);
  const mode = analysisTypeConfig(session.analysis_type);
  const hasSelectedMode = isAnalysisType(session.analysis_type);
  const profileDistance =
    session.calibration_known_distance_m ??
    session.calibration_zone_distance_m ??
    session.distance_m;
  const accelerationFinishDistance =
    session.calibration_known_distance_m ?? session.distance_m ?? null;
  const hasAccelerationFinishDistance = [10, 20, 30].includes(accelerationFinishDistance ?? 0);

  // Signed URL for the uploaded sprint video (1-hour expiry), if one exists.
  const { data: signedVideo } = session.video_path
    ? await supabase.storage.from("sprint-videos").createSignedUrl(session.video_path, 60 * 60)
    : { data: null };

  // One mutable working result plus explicitly saved immutable snapshots.
  const { data: analysisVersionRows } = await supabase
    .from("analyses")
    .select(
      "id, status, created_at, completed_at, analysis_pipeline_version, experimental, experiment_version, validation_status, version_number, parent_analysis_id, analysis_kind, is_current_working, saved_version_number, saved_at, saved_notes",
    )
    .eq("session_id", session.id)
    .in("analysis_kind", ["working", "saved"])
    .order("saved_version_number", { ascending: true });
  const visibleAnalyses = analysisVersionRows ?? [];
  const workingVersion = visibleAnalyses.find((item) =>
    item.analysis_kind === "working"
    && item.is_current_working
    && item.id === session.current_working_analysis_id
  ) ?? null;
  const savedVersions = visibleAnalyses.filter((item) => item.analysis_kind === "saved");
  const requestedSavedVersion = savedVersions.find((item) => item.id === selectedAnalysisId) ?? null;
  const selectedVersion =
    requestedSavedVersion ?? workingVersion;
  const { data: analysis } = selectedVersion
    ? await supabase
        .from("analyses")
        .select(
          "id, status, error, metrics, keypoints_path, created_at, completed_at, provenance, input_snapshot, result_payload, analysis_fps, source_fps, metric_schema_version, analysis_pipeline_version, experimental, experiment_version, validation_status, compatibility_group, timing_compatibility_group, experimental_result, version_number, parent_analysis_id, workspace_config, performance_result_status, performance_result_invalid_reason, excluded_from_history_trends, excluded_from_benchmarks, excluded_from_predictions, excluded_from_recommendations, analysis_kind, is_current_working, saved_version_number, saved_at, saved_notes",
        )
        .eq("session_id", session.id)
        .eq("id", selectedVersion.id)
        .maybeSingle()
    : { data: null };
  const selectedWorkspace = jsonRecord(analysis?.workspace_config);
  const selectedTiming = jsonRecord(selectedWorkspace.timingZone);
  const selectedCalibration = jsonRecord(selectedWorkspace.calibrationInputs);
  const [selectedPointAx, selectedPointAy] = pointPair(selectedCalibration.pointA);
  const [selectedPointBx, selectedPointBy] = pointPair(selectedCalibration.pointB);
  const selectedKnownDistance = finiteNumber(selectedCalibration.knownDistanceM);
  const selectedPointATime = finiteNumber(selectedCalibration.pointATimeS);
  const selectedPointBTime = finiteNumber(selectedCalibration.pointBTimeS);

  const { data: jobStatuses } = analysis
    ? await supabase.rpc("get_analysis_job_status", { p_analysis_id: analysis.id })
    : { data: null };
  const jobStatus = jobStatuses?.[0] ?? null;
  const analysisInFlight = jobStatus
    ? !["completed", "failed", "dead_lettered", "cancelled"].includes(jobStatus.status)
    : analysis?.status === "queued" || analysis?.status === "running";

  // `metrics` is opaque JSONB — validate at the read boundary so the panel
  // only ever receives a fully-typed object. A parse failure falls through to
  // a graceful fallback rather than crashing the page.
  const parsedMetrics =
    analysis?.status === "complete" && session.analysis_type === "fly"
      ? analysisMetricsSchema.safeParse(analysis.metrics)
      : null;
  const parsedAccelerationMetrics =
    analysis?.status === "complete" && session.analysis_type === "acceleration"
      ? accelerationMetricsSchema.safeParse(analysis.metrics)
      : null;
  const parsedExperimentalResult = analysis?.experimental
    ? experimental30ResultSchema.safeParse(analysis.experimental_result)
    : null;
  const experimentalTiming = parsedExperimentalResult?.success
    ? parsedExperimentalResult.data.real30Timing
    : null;
  const parsedProvenance = provenanceSchema.safeParse(analysis?.provenance);
  const parsedResultPayload = explainableAnalysisResultSchema.safeParse(analysis?.result_payload);
  const analysisProvenance = parsedProvenance.success ? parsedProvenance.data : null;
  const explainableResult = parsedResultPayload.success ? parsedResultPayload.data : null;

  // Step/contact markers for the video timeline. Empty until metrics carry
  // per-event timestamps; built here so the prop path is ready.
  const timelineMarkers = parsedMetrics?.success
    ? buildTimelineMarkersFromMetrics(parsedMetrics.data)
    : [];

  // Interactive-overlay frames come from the analysis's stored pose artifact
  // (analyses.keypoints_path). The loader is fully defensive: a missing path,
  // bucket, object, or malformed artifact resolves to [] (placeholder shown).
  const { frames: rawOverlayFrames, meta: overlayMeta } =
    analysis?.status === "complete" && analysis.keypoints_path
    ? await loadOverlayFrames(supabase, analysis?.keypoints_path)
    : { frames: [] as OverlayFrame[], meta: null };

  // Source video dimensions + detected FPS. The session row may lack them (older
  // uploads), so fall back to the pose artifact's own metadata, which the worker
  // derived from the video. These drive every metre-scale + timing calculation.
  const effectiveWidth = session.width ?? overlayMeta?.width ?? null;
  const effectiveHeight = session.height ?? overlayMeta?.height ?? null;
  const detectedFps = session.fps ?? overlayMeta?.fps ?? null;

  // FPS normalization (Day 73): snap a detected rate that has drifted (e.g. 59.16
  // from a VFR container) to the true canonical capture rate (60/120/240) when it's
  // within tolerance, so small metadata drift doesn't add timing error to every
  // metric. A manual override always wins over both.
  const normalizedFps = normalizeFps(detectedFps);
  const overrideFps = isValidFps(session.fps_override) ? session.fps_override : null;
  // The clock every timing-derived number uses: manual override, else the normalized
  // detected rate.
  const effectiveFps = overrideFps ?? normalizedFps;

  // Worker artifacts already carry real source timestamps for nominal-60 footage.
  // Only an explicit coach override may replace those timestamps.
  const overlayFrames =
    overrideFps != null && isValidFps(effectiveFps)
      ? applyFpsOverride(rawOverlayFrames, effectiveFps)
      : rawOverlayFrames;

  // Known-distance calibration zone (Day 61), if the coach set all three parts.
  const calibrationZone: CalibrationZone | null =
    finiteNumber(selectedTiming.startS) != null &&
    finiteNumber(selectedTiming.endS) != null &&
    finiteNumber(selectedTiming.distanceM) != null
      ? {
          startTime: finiteNumber(selectedTiming.startS)!,
          endTime: finiteNumber(selectedTiming.endS)!,
          distanceM: finiteNumber(selectedTiming.distanceM)!,
        }
      : null;

  // Manual ground calibration (Day 62): two clicked ground points a known
  // distance apart. Same shape drives both the calibration scale and the fixed
  // calibration line drawn on the overlay.
  const manualPoints: ManualCalibrationPoints | null =
    selectedPointAx != null &&
    selectedPointAy != null &&
    selectedPointBx != null &&
    selectedPointBy != null &&
    selectedKnownDistance != null
      ? {
          ax: selectedPointAx,
          ay: selectedPointAy,
          bx: selectedPointBx,
          by: selectedPointBy,
          distanceM: selectedKnownDistance,
          aTimeS: selectedPointATime,
          bTimeS: selectedPointBTime,
        }
      : null;

  // Timing-gate BAR calibration (Day 66): the full cone-to-cone geometry, used to
  // draw the gates as real bars on the overlay. Its reduction to the two midpoint
  // points above is what every measurement engine consumes; this is render-only.
  // Single source of truth (Part 1): the durable session-level calibration is the
  // authority; the analysis-snapshot copy (workspace_config.calibrationInputs.gates)
  // may lag behind a just-saved manual zone. Merge so a manual_confirmed / higher-
  // revision session zone always wins, and a stale snapshot can never override it.
  // Legacy records are normalized (source inferred, coordinates untouched) first.
  const calibrationGates: CalibrationGates | null = (() => {
    const snapshot = calibrationGatesSchema.safeParse(selectedCalibration.gates);
    const durable = calibrationGatesSchema.safeParse(session.calibration_gates);
    const snapshotGates = snapshot.success ? normalizeCalibrationAuthority(snapshot.data) : null;
    const durableGates = durable.success ? normalizeCalibrationAuthority(durable.data) : null;
    return mergeCalibrationAuthority(durableGates, snapshotGates);
  })();

  // Calibration authority + result-freshness (Part 1). `currentCalibrationRevision`
  // is the durable session zone; `resultCalibrationRevision` is the revision the
  // SELECTED analysis actually ran with (from its snapshot) — so an older-revision
  // result can be shown as superseded, never as current.
  const calibrationSource = calibrationGates ? calibrationAuthority(calibrationGates).source : null;
  const currentCalibrationRevision = calibrationRevisionOf(calibrationGates);
  const resultCalibrationRevision = (() => {
    const snap = calibrationGatesSchema.safeParse(selectedCalibration.gates);
    return snap.success ? calibrationRevisionOf(snap.data) : null;
  })();

  // Read-only calibration status for the Analysis page (the Timing Workspace owns editing).
  // Four user-facing states, derived automatically from the authoritative calibration —
  // never from a stale technique_only flag. Stale/superseded results surface as Needs Review.
  const workspaceZoneType =
    (session.timing_workspace as { zoneType?: string } | null)?.zoneType ?? null;
  const calibrationSuperseded =
    resultCalibrationRevision != null && resultCalibrationRevision < currentCalibrationRevision;
  const calibrationCardStatus: CalibrationCardStatus = !calibrationGates || !calibrationGates.distanceM
    ? "Not Started"
    : calibrationSuperseded
      ? "Needs Review"
      : calibrationSource === "manual_confirmed"
        ? "Confirmed"
        : "In Progress";
  const calibrationUpdatedAt =
    (calibrationGates as { confirmedAt?: string; updatedAt?: string } | null)?.confirmedAt ??
    (calibrationGates as { updatedAt?: string } | null)?.updatedAt ??
    null;

  // Calibration: real-world estimates (with confidence) derived from the pose
  // overlay + athlete profile + optional known-distance zone + manual ground
  // points. Kept fully separate from the biomechanics metrics; only shown once an
  // overlay is available.
  const calibrationReport = overlayFrames.length
    ? buildCalibrationReport({
        legLengthCm: session.athletes?.leg_length_cm ?? null,
        knownDistanceM: session.distance_m ?? null,
        frameWidth: effectiveWidth,
        frameHeight: effectiveHeight,
        frames: overlayFrames,
        zone: calibrationZone,
        manualPoints,
      })
    : null;

  // Step cadence straight from the verified ground contacts (contacts / elapsed
  // time), independent of any scale — shown on the overlay's step-marks legend.
  const overlayStepMarks = overlayFrames.length ? detectStepMarks(overlayFrames) : [];
  const stepCadenceHz = stepFrequencyFromContacts(overlayStepMarks);

  // Full calibrated sprint measurement set (Day 62 benchmark): contacts, combined
  // + per-side frequency, average/individual/per-side step length, and the three
  // cross-checked velocities. The manual calibration points supply both the scale
  // and the zone bounds; frames are already FPS-retimed above.
  // Phase 1 — a stationary recording has ONE clean coordinate path. Camera-motion
  // compensation is only meaningful when the camera actually pans; on a static camera the
  // per-frame world reprojection injects noise that degrades step length / frequency and
  // can break the zone-crossing interpolation (world-anchored entry/exit resolve out of
  // order → Average Velocity withheld). Pass camera evidence to the MEASUREMENT engine
  // only when the cumulative horizontal camera translation is non-negligible. Overlay
  // world-lock is unaffected — it consumes camera evidence through its own render path.
  const cameraEvidence = overlayMeta?.cameraEvidence;
  const cumulativeCameraPanX = cameraEvidence
    ? cameraEvidence.transforms.reduce((sum, t) => sum + Math.abs(t.translationX ?? 0), 0)
    : 0;
  const cameraPansMeaningfully = cumulativeCameraPanX > CAMERA_MEANINGFUL_PAN_CUMULATIVE;
  const measurements =
    session.analysis_type === "fly" && overlayFrames.length
      ? computeSprintMeasurements(overlayFrames, manualPoints, effectiveWidth, effectiveHeight, {
          gates: calibrationGates,
          cameraEvidence: cameraPansMeaningfully ? cameraEvidence : undefined,
        })
      : null;
  const accelerationMetrics = parsedAccelerationMetrics?.success
    ? parsedAccelerationMetrics.data
    : null;
  const accelerationOverlayMarkers = accelerationMetrics
    ? [
        ...(accelerationMetrics.startEvent.timestamp != null
          ? [{ label: "Start", timeS: accelerationMetrics.startEvent.timestamp }]
          : []),
        ...Object.entries(accelerationMetrics.splits).flatMap(([label, elapsed]) =>
          elapsed != null && accelerationMetrics.startEvent.timestamp != null
            ? [
                {
                  label: label.replace("m", "Split ").replace("S", "m"),
                  timeS: accelerationMetrics.startEvent.timestamp + elapsed,
                },
              ]
            : [],
        ),
        ...(accelerationMetrics.finishCrossingTime != null
          ? [
              {
                label: `Finish ${accelerationMetrics.finishDistanceM ?? ""}m`,
                timeS: accelerationMetrics.finishCrossingTime,
              },
            ]
          : []),
      ]
    : [];

  // The clock every timing-derived number (contact, flight, frequency, zone,
  // velocity, phases) uses: manual override, else the normalized detected rate.
  const activeFps = analysis?.analysis_fps ?? effectiveFps;

  // Precision mode (Day 69): below ~120 fps, temporal metrics (contact/flight) are
  // frame-quantized too coarsely to be trusted as high-confidence — so we neither
  // headline them nor let them drive PB prediction / Sprint Intelligence as if they
  // were reliable. Spatial/zone metrics are unaffected.
  const precisionLimited = isPrecisionLimited(activeFps);

  // Recording Quality (Day 70): inspect this recording and judge which metrics AVA
  // can certify, estimate, or not measure at all — the trust indicator at the top of
  // the page. Pure/derived from data already computed above; no new I/O.
  const poseQuality = overlayFrames.length ? summarisePoseQuality(overlayFrames) : null;
  const camMethod = measurements?.cameraCompensation.method ?? "";
  const cameraAssessment = overlayMeta?.recordingAssessment;
  const recordingQuality =
    overlayFrames.length && measurements
      ? buildRecordingQuality({
          recordingMode: cameraAssessment?.recordingMode,
          fps: activeFps,
          width: effectiveWidth,
          height: effectiveHeight,
          codec: session.codec ?? null,
          cameraStatic: cameraAssessment
            ? cameraAssessment.recordingMode === "static_precision" || cameraAssessment.recordingMode === "static_usable"
            : camMethod.includes("static")
            ? true
            : measurements.cameraCompensation.available
              ? false
              : null,
          cameraConfidence: cameraAssessment
            ? cameraAssessment.cameraMotionConfidence >= 0.75
              ? "high"
              : cameraAssessment.cameraMotionConfidence >= 0.45
                ? "medium"
                : "low"
            : measurements.cameraCompensation.confidence === "none"
              ? "unavailable"
              : measurements.cameraCompensation.confidence,
          cameraAvailable: cameraAssessment
            ? cameraAssessment.recordingMode !== "unsupported_recording"
            : measurements.cameraCompensation.available,
          calibrationPresent: !!(calibrationGates || manualPoints),
          athleteFillFraction: poseQuality?.athleteFillFraction ?? null,
          trackingCoverage: measurements.diagnostics.trackingCoverage,
          poseConfidence: poseQuality?.poseConfidence ?? null,
          missingFrameFraction: poseQuality?.missingFrameFraction ?? null,
        })
      : null;

  // NB: Benchmark validation (AVA-vs-reference percent error) is an internal QA
  // surface and is intentionally NOT rendered in the customer UI. The underlying
  // measurement calculations above are unchanged; the benchmark comparison is still
  // available via the reporting scripts (scripts/benchmark-breakdown.mjs).

  // Step-distance scale: turns the overlay's normalized step gaps into metres
  // when a calibration scale + pixel dimensions are available.
  const stepScale: StepDistanceScale | null =
    calibrationReport?.scale && effectiveWidth && effectiveHeight
      ? {
          metersPerPixel: calibrationReport.scale.metersPerPixel,
          frameWidth: effectiveWidth,
          frameHeight: effectiveHeight,
        }
      : null;

  // Sprint phase detection: segment the run (start → acceleration → transition →
  // max velocity → maintenance → deceleration) from the velocity profile + step
  // marks. Presentation-only; changes no metric math.
  const phaseReport = overlayFrames.length ? detectSprintPhases(overlayFrames) : null;

  // PB Predictor v1: deterministic, explainable race-time estimates from the
  // athlete profile + calibrated biomechanics. Consumes the other engines'
  // outputs without modifying them; only shown once metrics exist.
  const athleteProfile = session.athletes;
  const pb = (d: RaceDistance) => athleteProfile?.[`personal_best_${d}m` as const] ?? null;
  const goal = (d: RaceDistance) => athleteProfile?.[`goal_${d}m` as const] ?? null;
  const prediction = parsedMetrics?.success
    ? predictPerformance({
        heightCm: athleteProfile?.height_cm ?? null,
        weightKg: athleteProfile?.weight_kg ?? null,
        legLengthCm: athleteProfile?.leg_length_cm ?? null,
        personalBests: { 60: pb(60), 100: pb(100), 200: pb(200) },
        goals: { 60: goal(60), 100: goal(100), 200: goal(200) },
        strideFrequencyHz: parsedMetrics.data.strideFrequencyHz,
        // Precision mode: withhold frame-quantized contact/flight below ~120 fps so
        // they don't appear as trusted context in the prediction.
        groundContactTimeMs: precisionLimited ? null : parsedMetrics.data.groundContactTimeMs,
        flightTimeMs: precisionLimited ? null : parsedMetrics.data.flightTimeMs,
        metricsTopSpeedMps: parsedMetrics.data.topSpeedMps,
        metricsStrideLengthM: parsedMetrics.data.avgStrideLengthM,
        calibratedStepLengthM: calibratedValue(calibrationReport, "stepLength"),
        calibratedStrideLengthM: calibratedValue(calibrationReport, "strideLength"),
        calibratedAvgVelocityMps: calibratedValue(calibrationReport, "avgVelocity"),
        calibratedTopVelocityMps: calibratedValue(calibrationReport, "topVelocity"),
        calibrationConfidence: calibrationReport?.scale?.confidence ?? null,
      })
    : null;

  // Longitudinal training focus across this athlete's completed analyses, so the
  // intelligence engine can flag persistent (vs one-off) limiters. Read-only,
  // RLS-scoped; a failed/empty read simply yields no focus.
  const { data: athleteAnalyses } = parsedMetrics?.success
    ? await supabase
        .from("analyses")
        .select("id, metrics, created_at, sessions!analyses_session_id_fkey!inner(athlete_id)")
        .eq("sessions.athlete_id", session.athlete_id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: null };
  const trainingFocus = athleteAnalyses ? buildTrainingFocus(athleteAnalyses) : null;
  const confidenceEvidence = evidenceFromAnalysis({
    measurements,
    poseQuality,
    recordingQuality,
    fps: activeFps,
  });
  const intelligenceMeasurementConfidence = calculateMetricConfidence(
    "sprint_intelligence",
    confidenceEvidence,
  );

  // Sprint Intelligence (Day 60): synthesize the metrics, calibration, phases,
  // prediction, and training focus into a ranked, fully-explained set of
  // limiters. Consumes the other engines' outputs; modifies none of them.
  const intelligence = parsedMetrics?.success
    ? buildSprintIntelligence({
        metrics: parsedMetrics.data,
        calibration: calibrationReport,
        prediction,
        phases: phaseReport,
        trainingFocus,
        // Precision mode: don't let low-confidence 60 fps contact/flight be flagged
        // as limiters as if they were reliable measurements.
        timingReliable: !precisionLimited,
        // Frequency is one concept: use the trusted calibrated cadence (matches the
        // Trusted Sprint Metrics card) over the raw worker strideFrequencyHz.
        calibratedStepFrequencyHz: measurements?.combinedStepFrequencyHz ?? null,
        measurementConfidenceScore: intelligenceMeasurementConfidence.score,
        activeFps,
      })
    : null;

  // Trusted Sprint Metrics (Day 79): THE single source of truth for every customer-
  // facing surface. Derived only from the calibrated measurement engine.
  const trusted = buildTrustedMetrics(measurements, cameraAssessment);
  const trustedConfidence = trusted
    ? buildTrustedMetricConfidence(trusted, confidenceEvidence)
    : null;

  // Trochanter ratio uses only the dedicated metre-valued measurement.
  const trochanterHeightM = session.athletes?.trochanter_height_m ?? null;
  // Uses the diagnosis stride length (peak when available).
  const trochanter = trusted
    ? evaluateTrochanterStepLength({ stepLengthM: trusted.strideLengthM, trochanterHeightM })
    : null;

  // Limiting-factor diagnosis (Day 79): ranks the four trusted metrics into the
  // customer-facing #1/#2/#3 factors + the Performance Potential projection — always
  // from the trusted values, so it can never disagree with the Trusted Metrics card.
  const diagnosis = trusted ? deriveLimitingFactors(trusted, { trochanterHeightM }) : null;

  // Coaching Recommendations V2: translate the trusted limiting factors + velocity
  // consistency + left/right trends + recording quality into specific "what to work
  // on next" guidance. Reads ONLY 60 fps-trusted metrics as primary causes; FPS-gated
  // timing is confined to its experimental bin. Changes no metric math.
  const recommendations = buildRecommendations({
    trusted,
    measurements,
    activeFps,
    trochanterHeightM,
    quality: recordingQuality
      ? {
          calibrationPresent: !!(calibrationGates || manualPoints),
          trackingCoverage: measurements?.diagnostics.trackingCoverage ?? null,
          poseConfidence: poseQuality?.poseConfidence ?? null,
          score: recordingQuality.score,
        }
      : null,
  });

  // Observation Engine v1: deterministic facts only. The adapter reads the
  // completed result contract and existing asymmetry classifications; it does
  // not consume recommendation or limiting-factor output.
  const observationResult =
    explainableResult && analysis?.status === "complete"
      ? generateObservationResult(
          buildCompletedAnalysisObservationInput({
            result: explainableResult,
            recordingQuality,
            calibrationAvailable: !!(calibrationGates || manualPoints),
            asymmetryInsights: measurements
              ? analyzeAsymmetry(measurements, { timingReliable: !precisionLimited })
              : [],
          }),
        )
      : null;
  // `analysis.completed_at`/`created_at` are PostgreSQL timestamptz values, which
  // PostgREST returns as ISO-8601 WITH a timezone offset (e.g. `...+00:00`). The
  // engine contracts validate `generatedAt` with `z.string().datetime()`, which
  // accepts only canonical UTC `Z`. Normalize at this trust boundary so a valid
  // stored timestamp parses; if it is absent or unparseable, `generatedAtIso` is
  // null and we skip building the context (no intelligence panels) rather than
  // throwing a ZodError that crashes the whole route.
  const generatedAtIso = analysis
    ? toCanonicalIso(analysis.completed_at ?? analysis.created_at)
    : null;
  const interpretationContext: InterpretationContext | null =
    observationResult && analysis && generatedAtIso
      ? {
          analysisId: analysis.id,
          generatedAt: generatedAtIso,
          // Current observations do not yet preserve the canonical phase enum.
          // Unknown safely prevents phase-specific interpretation rules from asserting.
          phase: "unknown",
          cameraMode: analysisProvenance?.cameraMode ?? null,
          fpsTier:
            analysisProvenance?.sourceFpsClassification === "experimental_30_fps_class"
              ? "experimental_30"
              : analysisProvenance?.sourceFpsClassification ===
                  "high_speed_source_normalized_to_60"
                ? "high_speed_normalized"
                : analysisProvenance?.sourceFpsClassification === "validated_60_fps_class"
                  ? "validated_60"
                  : "unknown",
          calibrationAvailable: !!(calibrationGates || manualPoints),
          event: null,
          sessionPurpose: session.analysis_type,
          athleteId: session.athlete_id,
          contextVersion: "ava-interpretation-context-v1",
          savedVersion: analysis.analysis_kind === "saved",
        }
      : null;
  // Working results regenerate deterministically from their current observations.
  // Saved versions are intentionally withheld until immutable interpretation
  // snapshots are stored; silently applying newer rules would mutate history.
  const interpretationResult =
    FEATURES.interpretationEngine &&
    observationResult &&
    interpretationContext &&
    !interpretationContext.savedVersion
      ? generateInterpretations({
          observations: observationResult.observations,
          context: interpretationContext,
        }, undefined, {
          allowExperimental: FEATURES.experimentalInterpretations,
        })
      : null;
  const recommendationResult =
    FEATURES.recommendationEngine &&
    interpretationResult &&
    interpretationContext &&
    !interpretationContext.savedVersion
      ? generateRecommendations(
          {
            interpretations: interpretationResult,
            context: {
              analysisId: interpretationContext.analysisId,
              generatedAt: interpretationContext.generatedAt,
              phase: interpretationContext.phase,
              event: interpretationContext.event,
              sessionPurpose: interpretationContext.sessionPurpose,
              cameraMode: interpretationContext.cameraMode,
              fpsTier: interpretationContext.fpsTier,
              calibrationAvailable: interpretationContext.calibrationAvailable,
              savedVersion: false,
              athlete: {
                athleteId: session.athlete_id,
                // These fields do not exist in the current athlete schema. Unknown
                // fails closed on advanced complexity and medical escalation.
                trainingAge: "unknown",
                competitionLevel: "unknown",
                primaryEvent: null,
                goals: [],
                reportedPain: null,
                activeLimitation: null,
                contextVersion: "ava-athlete-recommendation-context-v1",
              },
            },
          },
          undefined,
          {
            allowExperimental: FEATURES.experimentalRecommendations,
            allowAdvancedDrills: FEATURES.advancedDrillRecommendations,
            allowProfessionalReview: FEATURES.professionalReviewRecommendations,
          },
        )
      : null;
  const priorityResult =
    FEATURES.priorityEngine &&
    recommendationResult &&
    interpretationResult &&
    observationResult &&
    interpretationContext &&
    !interpretationContext.savedVersion
      ? generatePriorities({
          observations: observationResult.observations,
          interpretations: interpretationResult,
          recommendations: recommendationResult,
          context: {
            analysisId: interpretationContext.analysisId,
            generatedAt: interpretationContext.generatedAt,
            athleteGoals: [],
            primaryEvent: null,
            phase: interpretationContext.phase,
            coachRelevantAreas: [],
            // No compatible baseline/persistence contract is live yet. Empty
            // signals deliberately contribute no ranking benefit.
            persistenceSignals: [],
            baselineSignals: [],
            contextVersion: "ava-priority-context-v1",
          },
        })
      : null;

  // AVA Performance Score (Day 84): a single trusted-only 0–100 score. Uses ONLY
  // trusted metrics + recording quality — never ground contact / flight time / raw
  // frequency. Unavailable (not a fake 0) until a calibrated run exists.
  const performanceScore = trusted
    ? calculateAvaPerformanceScore({
        topSpeedMps: trusted.topSpeedMps,
        avgVelocityMps: trusted.avgVelocityMps,
        frequencyHz: trusted.frequencyHz,
        avgStrideLengthM: trusted.avgStrideLengthM,
        peakStrideLengthM: trusted.peakStrideLengthM,
        strideRetentionPct: trusted.strideRetentionPct,
        trochanterHeightM,
        recordingQualityScore: recordingQuality?.score ?? null,
      })
    : null;

  // Progress Tracking V1: compare this athlete's latest fly session to the previous
  // one. Snapshots come from each analysis's STORED fly metrics (the only per-session
  // history persisted), so the comparison is consistent across sessions; frame-rate-
  // limited timing is excluded. Non-fly analyses fail the fly-metrics parse and drop
  // out. Read-only — no metric math touched.
  const progressSnapshots = (athleteAnalyses ?? [])
    .map((row) => {
      const parsed = analysisMetricsSchema.safeParse(row.metrics);
      return parsed.success
        ? snapshotFromAnalysisMetrics(row.id, row.created_at, parsed.data)
        : null;
    })
    .filter((s): s is NonNullable<typeof s> => s != null);
  const progress = buildProgress(progressSnapshots, {
    latestLimiterCategory: recommendations.recommendations[0]?.category ?? null,
  });

  const analysisComplete = analysis?.status === "complete";
  const metricsReady =
    analysisComplete && (parsedMetrics?.success || parsedAccelerationMetrics?.success);
  const activeFpsLabel =
    activeFps != null
      ? `${Number.isInteger(activeFps) ? activeFps : Math.round(activeFps * 100) / 100} FPS`
      : null;
  const resolutionLabel =
    effectiveWidth && effectiveHeight ? `${effectiveWidth}×${effectiveHeight}` : null;
  // Prominent zone-distance label for the Fly hero (e.g. "20m Fly"). Presentation
  // only — reuses the already-derived profile distance, changes no metric math.
  const flyDistanceLabel =
    session.analysis_type === "fly" && profileDistance != null ? `${profileDistance}m Fly` : null;

  // Result freshness vs the current calibration revision (Part 1 §4). When the
  // shown analysis was produced against an older calibration, or a recompute is in
  // flight, the metrics must not read as current — a banner makes that explicit.
  const calibrationResultStatus = classifyResultStatus({
    hasResult: analysisComplete,
    resultCalibrationRevision,
    currentCalibrationRevision,
    recomputePending: analysisInFlight,
  });

  return (
    <AppShell userEmail={user.email ?? ""} wide>
      <div className="space-y-6">
        {/* Live analysis progress + terminal refresh are owned by AnalysisProgressCard,
            rendered in the in-flight branch below (no passive poller here). */}
        {/* Non-visible acceptance hooks (Part 1 §4): canonical calibration values +
            authority/result status for deterministic browser assertions. Full numeric
            precision preserved; no secrets/URLs. Not shown to users (hidden). */}
        <div
          hidden
          data-testid="calibration-hooks"
          data-calibration-source={calibrationSource ?? ""}
          data-calibration-revision={String(currentCalibrationRevision)}
          data-result-status={calibrationResultStatus}
          data-result-revision={String(resultCalibrationRevision ?? "")}
          data-start-c1-x={calibrationGates ? String(calibrationGates.startGate.c1.x) : ""}
          data-start-c1-y={calibrationGates ? String(calibrationGates.startGate.c1.y) : ""}
          data-start-c2-x={calibrationGates ? String(calibrationGates.startGate.c2.x) : ""}
          data-start-c2-y={calibrationGates ? String(calibrationGates.startGate.c2.y) : ""}
          data-finish-c1-x={calibrationGates ? String(calibrationGates.finishGate.c1.x) : ""}
          data-finish-c1-y={calibrationGates ? String(calibrationGates.finishGate.c1.y) : ""}
          data-finish-c2-x={calibrationGates ? String(calibrationGates.finishGate.c2.x) : ""}
          data-finish-c2-y={calibrationGates ? String(calibrationGates.finishGate.c2.y) : ""}
        />
        {/* B. Top command bar */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/athletes/${session.athlete_id}`}
            className="text-sm font-medium text-[#b3bccb] transition hover:text-[#f5f7fb]"
          >
            ← Back to athlete
          </Link>

          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7e8797] sm:block">
            {hasSelectedMode ? mode.analysisTitle : "Choose Analysis Mode"}
          </p>

          {analysisInFlight && (
            <AvaStatusPill
              label={
                jobStatus
                  ? USER_JOB_LABELS[jobStatus.status]
                  : (ANALYSIS_STATUS_LABELS[analysis!.status] ?? analysis!.status)
              }
              tone="gray"
            />
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#e46464]/40 bg-[#e46464]/10 px-4 py-3 text-sm text-[#e46464]"
          >
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-xl border border-[#f5c451]/40 bg-[#f5c451]/10 px-4 py-3 text-sm text-[#f5c451]">
            Calibration saved.
          </p>
        )}

        {/* Prominent, refresh-surviving live progress the moment a run/rerun is in flight —
            placed at the top so clicking Rerun visibly enters a processing state without
            scrolling. Single instance (owns polling + terminal refresh). */}
        {analysisInFlight && analysis && (
          <AnalysisProgressCard
            analysisId={analysis.id}
            sessionId={session.id}
            initialStatus={jobStatus?.status ?? (analysis.status === "running" ? "processing" : "queued")}
            initialMessage={jobStatus?.user_message ?? null}
            initialUpdatedAt={jobStatus?.updated_at ?? null}
            initialAttemptCount={jobStatus?.attempt_count ?? 0}
          />
        )}

        {analysis?.experimental && (
          <div className="rounded-xl border border-[#f5c451]/40 bg-[#f5c451]/10 px-4 py-3">
            <p className="text-sm font-semibold text-[#f5c451]">Experimental analysis</p>
            <p className="mt-1 text-sm text-[#b3bccb]">
              AVA used the experimental 30 FPS analysis model for this recording. These
              results are kept separate from validated 60 FPS analyses while the model
              continues to be tested and refined.
            </p>
          </div>
        )}

        {/* C. Session hero panel */}
        <AvaPanel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#2f80ed]">
                {hasSelectedMode ? mode.analysisTitle : "Sprint Analysis"}
              </p>
              <h1 className="truncate text-3xl font-bold tracking-tight text-[#f5f7fb]">
                {displayName}
              </h1>
              {hasSelectedMode && (
                <p className="mt-2 text-sm text-[#b3bccb]">
                  {session.analysis_type === "acceleration"
                    ? `${mode.displayTitle} · ${accelerationProfileLabel(profileDistance)}`
                    : flyDistanceLabel
                      ? `${flyDistanceLabel} zone`
                      : mode.displayTitle}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {flyDistanceLabel && <AvaStatusPill label={flyDistanceLabel} tone="gold" />}
              {analysis?.experimental && <AvaStatusPill label="Experimental" tone="gold" />}
              {analysisComplete ? (
                <AvaStatusPill label="Diagnosis Ready" tone="gold" />
              ) : (
                <AvaStatusPill
                  label={STATUS_LABELS[session.status] ?? session.status}
                  tone="gray"
                />
              )}
              {activeFpsLabel && <AvaStatusPill label={activeFpsLabel} tone="gray" />}
              {resolutionLabel && <AvaStatusPill label={resolutionLabel} tone="gray" />}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AvaInfoStat label="Athlete" value={session.athletes?.full_name ?? "—"} />
            <AvaInfoStat
              label="Uploaded"
              value={new Date(session.created_at).toLocaleDateString()}
            />
            <AvaInfoStat label="Duration" value={formatDuration(session.duration_s)} />
            <AvaInfoStat label="File size" value={formatBytes(session.size_bytes)} />
          </div>
        </AvaPanel>

        <AvaPanel eyebrow="Workspace" title="Working Analysis">
          {workingVersion ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <AvaStatusPill label={workingVersion.status} tone={workingVersion.status === "failed" ? "red" : "gray"} />
                <AvaStatusPill label={session.pose_engine ?? "mediapipe"} tone="gray" />
                {activeFpsLabel && <AvaStatusPill label={activeFpsLabel} tone="gray" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/sessions/${session.id}/timing`}
                  className="rounded-lg border border-[#2f80ed]/50 bg-[#2f80ed]/10 px-4 py-2 text-sm font-semibold text-[#3b8eff] transition hover:bg-[#2f80ed]/20"
                >
                  Open Timing Workspace
                </Link>
                {session.analysis_type === "fly" && workingVersion.status === "complete" ? (
                  <Link
                    href={`/sessions/${session.id}/limiting-factors`}
                    className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm font-semibold text-[#f5f7fb] transition hover:border-[#2f80ed]/60"
                  >
                    Limiting Factors
                  </Link>
                ) : null}
                {session.analysis_type === "fly" && workingVersion.status === "complete" ? (
                  <Link
                    href={`/sessions/${session.id}/intelligence`}
                    className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm font-semibold text-[#f5f7fb] transition hover:border-[#2f80ed]/60"
                  >
                    Sprint Intelligence
                  </Link>
                ) : null}
                {session.analysis_type === "fly" && workingVersion.status === "complete" ? (
                  <Link
                    href={`/sessions/${session.id}/coaching-recommendations`}
                    className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm font-semibold text-[#f5f7fb] transition hover:border-[#2f80ed]/60"
                  >
                    Coaching Recommendations
                  </Link>
                ) : null}
                {workingVersion.status === "complete" && FEATURES.coachReportEngine ? (
                  <Link
                    href={`/sessions/${session.id}/report`}
                    className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm font-semibold text-[#f5f7fb] transition hover:border-[#2f80ed]/60"
                  >
                    Open Coach Report
                  </Link>
                ) : null}
                <RerunAnalysisButton sessionId={session.id} />
                <form action={saveAnalysisVersion} className="flex gap-2">
                  <input type="hidden" name="id" value={session.id} />
                  <input name="version_notes" placeholder="Snapshot notes (optional)" className="rounded-lg border border-white/[0.08] bg-[#081019] px-3 py-2 text-sm text-[#f5f7fb]" />
                  <button disabled={workingVersion.status !== "complete"} className="rounded-lg border border-[#f5c451]/40 px-4 py-2 text-sm font-semibold text-[#f5c451] disabled:cursor-not-allowed disabled:opacity-40" type="submit">
                    Save Version
                  </button>
                </form>
                <form action={resetWorkingAnalysis}>
                  <input type="hidden" name="id" value={session.id} />
                  <button className="rounded-lg border border-white/[0.1] px-4 py-2 text-sm font-semibold text-[#b3bccb]" type="submit">
                    Reset Working Analysis
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#b3bccb]">No working analysis yet. Run analysis to create one from the preserved source video.</p>
          )}
          <p className="mt-3 text-xs text-[#7e8797]">
            Reruns replace this working result. They do not create visible version numbers.
          </p>
        </AvaPanel>

        {savedVersions.length > 0 && (
          <AvaPanel eyebrow="Workspace" title="Saved Versions">
            <div className="flex flex-wrap items-center gap-2">
              {savedVersions.map((version) => (
                <Link
                  key={version.id}
                  href={`/sessions/${session.id}?analysis=${version.id}`}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    version.id === analysis?.id
                      ? "border-[#f5c451]/60 bg-[#f5c451]/10 text-[#f5c451]"
                      : "border-white/[0.08] bg-white/[0.03] text-[#b3bccb] hover:bg-white/[0.07]"
                  }`}
                >
                  Version {version.saved_version_number}
                  <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">
                    {version.experimental ? "Experimental" : version.status}
                  </span>
                </Link>
              ))}
              {requestedSavedVersion && (
                <Link href={`/sessions/${session.id}`} className="rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-[#b3bccb]">
                  Return to Working
                </Link>
              )}
            </div>
            <p className="mt-3 text-xs text-[#7e8797]">Only explicit snapshots appear here. Saved artifacts and inputs remain immutable.</p>
          </AvaPanel>
        )}

        <AvaPanel eyebrow="Permanent Source" title="Original Uploaded Video">
          {signedVideo?.signedUrl ? (
            <VideoPlayer videoUrl={signedVideo.signedUrl} markers={timelineMarkers} />
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-[#b3bccb]">The protected source video could not be loaded.</p>
            </div>
          )}
          <p className="mt-3 text-xs text-[#7e8797]">
            Original media · {resolutionLabel ?? "resolution pending"} · source {detectedFps ?? "—"} FPS
          </p>
        </AvaPanel>

        {/* Read-only calibration status. Editing lives ONLY in the Timing Workspace. */}
        {session.analysis_type === "fly" && (
          <>
            <CalibrationStatusCard
              sessionId={session.id}
              status={calibrationCardStatus}
              distanceM={calibrationGates?.distanceM ?? null}
              zoneType={workspaceZoneType}
              bodyReference="Torso"
              revision={currentCalibrationRevision}
              updatedAt={calibrationUpdatedAt}
            />
            <CalibrationAuthorityControls
              sessionId={session.id}
              source={calibrationSource}
              resultStatus={calibrationResultStatus}
              revision={currentCalibrationRevision}
            />
          </>
        )}

        {/* D. The selected immutable analysis overlay; source video remains above. */}
        <AvaPanel
          eyebrow="Primary Review"
          title="Interactive Overlay"
        >
          {session.analysis_type === "acceleration" && (
            <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-sm text-[#b3bccb]">
                Set finish distance. AVA detects first movement automatically.
              </p>
              <div className="mt-3 inline-flex rounded-lg border border-white/[0.1] bg-[#101827] p-1">
                {[10, 20, 30].map((distance) => (
                  <form action={setAccelerationFinishDistance} key={distance}>
                    <input type="hidden" name="id" value={session.id} />
                    <input type="hidden" name="finish_distance_m" value={distance} />
                    <button
                      type="submit"
                      className={`rounded-md px-4 py-2 text-sm font-semibold ${accelerationFinishDistance === distance ? "bg-[#2f80ed] text-white" : "text-[#b3bccb] hover:bg-white/[0.06]"}`}
                    >
                      {distance}m
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
          {!analysisInFlight && (
            <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              {!analysis && (
                <>
                  <p className="mb-3 text-sm font-semibold text-[#f5f7fb]">Choose analysis mode</p>
                  <div className="inline-flex rounded-lg border border-white/[0.1] bg-[#101827] p-1">
                    {(["fly", "acceleration"] as const).map((type) => (
                      <form action={setSessionAnalysisType} key={type}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="analysis_type" value={type} />
                        <button
                          type="submit"
                          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${session.analysis_type === type ? "bg-[#2f80ed] text-white" : "text-[#b3bccb] hover:bg-white/[0.06] hover:text-white"}`}
                        >
                          {type === "fly" ? "Fly Analysis" : "Acceleration Analysis"}
                        </button>
                      </form>
                    ))}
                  </div>
                </>
              )}
              {session.analysis_type === "fly" && FEATURES.rtmpose && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                    Pose engine
                  </p>
                  <div className="inline-flex rounded-lg border border-white/[0.1] bg-[#101827] p-1">
                    {(["mediapipe", "rtmpose"] as const).map((engine) => (
                      <form action={setFlyPoseEngine} key={engine}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="pose_engine" value={engine} />
                        <button
                          type="submit"
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                            (session.pose_engine ?? "mediapipe") === engine
                              ? "bg-[#2f80ed] text-white"
                              : "text-[#b3bccb] hover:bg-white/[0.06]"
                          }`}
                        >
                          {engine === "mediapipe"
                            ? "MediaPipe (default)"
                            : "RTMPose (experimental)"}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4">
                {!workingVersion && hasSelectedMode &&
                (session.analysis_type !== "acceleration" || hasAccelerationFinishDistance) ? (
                  <RerunAnalysisButton
                    sessionId={session.id}
                    label="Run Analysis"
                    className="ava-red-glow rounded-lg bg-[#2f80ed] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3b8eff] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                ) : (
                  <p className="text-xs text-[#f5c451]">
                    {workingVersion
                      ? "Use Working Analysis controls above to rerun."
                      : session.analysis_type === "acceleration"
                      ? "Set finish distance before running acceleration analysis."
                      : "Select one mode to enable analysis."}
                  </p>
                )}
              </div>
            </div>
          )}
          {analysisComplete && signedVideo?.signedUrl && overlayFrames.length > 0 ? (
            /* Sync (Day 75): the overlay renders against the video's OWN timeline (raw
               frame timestamps), not the FPS-normalized clock used for metrics — so the
               skeleton stays glued to the runner at 1× and 2.5×. Analysis below still uses
               the normalized frames, so benchmark numbers are unchanged. */
              <OverlayVideoPlayer
                videoUrl={signedVideo.signedUrl}
                frames={rawOverlayFrames}
                sourceFps={detectedFps}
                analysisFps={analysis?.analysis_fps ?? null}
                cameraEvidence={overlayMeta?.cameraEvidence}
                sourceWidth={effectiveWidth}
                sourceHeight={effectiveHeight}
                stepScale={stepScale}
                stepCadenceHz={stepCadenceHz}
                stepContactCount={overlayStepMarks.length}
                sessionId={session.id}
                manualCalibration={manualPoints}
                calibrationGates={calibrationGates}
                accelerationMarkers={accelerationOverlayMarkers}
                enableTrochanterAlignment={session.analysis_type !== "acceleration"}
                athleteHeightCm={athleteProfile?.height_cm ?? null}
                trochanterMarker={
                  session.overlay_trochanter_x != null &&
                  session.overlay_trochanter_y != null &&
                  session.overlay_trochanter_time_s != null
                    ? {
                        x: session.overlay_trochanter_x,
                        y: session.overlay_trochanter_y,
                        timeS: session.overlay_trochanter_time_s,
                      }
                    : null
                }
              />
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-[#b3bccb]">
                {analysisComplete
                  ? "This analysis has no readable pose artifact. The original video remains available above."
                  : "Run an analysis to add a synchronized pose overlay. The original video remains available above."}
              </p>
            </div>
          )}
        </AvaPanel>

        {/* Superseded by the read-only Calibration status card above (which derives status
            automatically from the authoritative calibration, not the legacy technique_only
            timing-setup flag). */}
        {experimentalTiming && <Experimental30TimingCard timing={experimentalTiming} invalidReason={analysis?.performance_result_status === "invalid_gate_propagation" ? analysis.performance_result_invalid_reason : null} />}

        {/* E. Analysis content — diagnosis-first: lead with the limiting factors. */}
        {metricsReady ? (
          <div className="space-y-6">
            {/* Part 1 §4: never let outputs read as current when the calibration has
                moved on. A recompute-in-flight or an older-revision run is called out
                explicitly above the metric cards. */}
            {calibrationResultStatus !== "current" && (
              <div className="rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/[0.06] px-4 py-3 text-sm text-[#f5c451]">
                {calibrationResultStatus === "pending"
                  ? "Recalculation pending — these metrics are being recomputed against the current timing zone."
                  : "Previous result — this analysis was produced against an earlier timing zone (superseded). Rerun to refresh."}
              </div>
            )}
            {!MVP_FIVE_ONLY && (
              <AnalysisMethodPanel
                provenance={analysisProvenance}
                result={explainableResult}
                legacy={!analysisProvenance || !explainableResult}
              />
            )}
            {!MVP_FIVE_ONLY && accelerationMetrics && <AccelerationMetricsPanel metrics={accelerationMetrics} />}

            {/* Trusted-only headline score. */}
            {!MVP_FIVE_ONLY && session.analysis_type === "fly" && performanceScore && (
              <AvaPerformanceScoreCard result={performanceScore} />
            )}

            {/* Progress since last session — how the trusted metrics moved. */}
            {!MVP_FIVE_ONLY && session.analysis_type === "fly" && <ProgressCard report={progress} />}

            {/* PRIMARY FEATURE: the ranked limiting-factor diagnosis. */}
            {!MVP_FIVE_ONLY && session.analysis_type === "fly" && intelligence && diagnosis && (
              <AvaIntelligencePanel report={intelligence} diagnosis={diagnosis} />
            )}

            {/* Performance headroom from correcting those factors (Estimated Meet Velocity). */}
            {!MVP_FIVE_ONLY && session.analysis_type === "fly" && diagnosis && (
              <PerformancePotentialCard potential={diagnosis.potential} />
            )}

            {/* Coaching Recommendations V2: the actionable "what to do next" layer,
                grounded in the trusted metrics; FPS-gated timing stays experimental.
                The exercise selector reads this session context to gate + side-target. */}
            {!MVP_FIVE_ONLY && session.analysis_type === "fly" && recommendations.available && (
              <CoachingRecommendationsCard
                report={recommendations}
                context={{
                  activeFps,
                  poseConfidence: poseQuality?.poseConfidence ?? null,
                  calibrationTrusted: !!(calibrationGates || manualPoints),
                  trackingTrusted:
                    (measurements?.diagnostics.trackingCoverage ?? 0) >= 0.6 &&
                    (poseQuality?.poseConfidence ?? 1) >= 0.5,
                  sideBias: null,
                  // Frequency is also low when the engine surfaced a frequency limiter —
                  // lets the stride-length picks include one rhythm drill (projection first).
                  frequencyLow: recommendations.recommendations.some(
                    (r) => r.category === "frequency",
                  ),
                }}
              />
            )}

            {/* Trochanter stride-length optimizer + unlock simulator (needs leg length). */}
            {!MVP_FIVE_ONLY &&
              session.analysis_type === "fly" &&
              trochanter &&
              trusted?.strideLengthM != null &&
              trusted?.frequencyHz != null && (
                <UnlockSimulatorCard
                  evaluation={trochanter}
                  peakStrideLengthM={trusted.strideLengthM}
                  avgStrideLengthM={trusted.avgStrideLengthM}
                  frequencyHz={trusted.frequencyHz}
                />
              )}

            {/* The four trusted metrics — the single source of truth. */}
            {session.analysis_type === "fly" && measurements && (
              <PerformanceSummaryCard trusted={trusted} confidence={trustedConfidence} />
            )}

            {/* Recording-quality trust indicator (collapsed). */}
            {recordingQuality && <RecordingQualityCard report={recordingQuality} />}
            {FEATURES.developerDiagnostics && observationResult && (
              <ObservationDebugPanel
                observations={observationResult.observations}
                trace={observationResult.trace}
              />
            )}
            {FEATURES.developerDiagnostics && interpretationResult && (
              <InterpretationDebugPanel
                result={interpretationResult}
                showTrace={FEATURES.interpretationDebugTrace}
              />
            )}
            {FEATURES.developerDiagnostics && recommendationResult && (
              <RecommendationDebugPanel
                result={recommendationResult}
                showTrace={FEATURES.recommendationDebugTrace}
              />
            )}
            {FEATURES.developerDiagnostics && priorityResult && (
              <PriorityDebugPanel
                result={priorityResult}
                showTrace={FEATURES.priorityDebugTrace}
              />
            )}

            {/* MVP metric scope is LOCKED to the five primary metrics rendered by
                PerformanceSummaryCard (step length, stride length, step frequency,
                average velocity, peak velocity). The experimental metrics bin
                (ground contact time, flight time, knee flexion, trunk lean, and other
                advanced timing derivatives) is intentionally NOT shown in the MVP. */}

            {/* Detailed Systems — secondary engines + validation, collapsed. */}
            <details className="group rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <summary className="flex cursor-pointer items-center gap-2 text-lg font-semibold tracking-tight text-[#f5f7fb]">
                <span className="inline-block text-[#2f80ed] transition group-open:rotate-90">
                  ▸
                </span>
                Detailed Systems
                <span className="text-xs font-normal text-[#7e8797]">
                  calibration &amp; sprint phases
                </span>
              </summary>
              <div className="mt-5 space-y-4">
                {session.analysis_type === "fly" && measurements && (
                  <BenchmarkPanel
                    sessionId={session.id}
                    measurements={measurements}
                    activeFps={activeFps}
                    fpsSource={session.fps_override != null ? "override" : detectedFps != null ? "detected" : "none"}
                    detectedFps={detectedFps}
                    fpsOverride={session.fps_override ?? null}
                    benchmarks={[]}
                    linkedBenchmarkId={null}
                    comparison={null}
                  />
                )}
                {calibrationReport && <CalibrationPanel report={calibrationReport} />}
                {/* All editable calibration (gate authority, timing setup, zone/FPS controls)
                    has moved to the Timing Workspace — the single calibration authority. The
                    Analysis page shows read-only calibration status only (see the Calibration
                    card near the top) and never edits gates/anchors/zones here. */}
                {/* PhaseTimelinePanel (sprint-phase timing: contact/flight phases) is
                    withheld — outside the locked MVP five-metric scope. */}
                {/* Race-time prediction removed for now — deriving 60/100/200 m from
                    peak velocity alone isn't trustworthy. Coming soon (see
                    PerformancePotentialCard TODO). The coaching-report / raw-metric /
                    recommendation panels are also withheld: they were built on the
                    not-yet-trusted temporal metrics (ground contact, flight time) and
                    the raw worker frequency. The engines still run internally. */}
              </div>
            </details>

            <CoachNotesForm sessionId={session.id} defaultNotes={session.notes} />
          </div>
        ) : analysisComplete ? (
          <AvaPanel eyebrow="Analysis" title="Metrics unavailable">
            <p className="text-sm text-[#b3bccb]">
              This analysis completed, but its metrics could not be read. Rerun the analysis to
              regenerate them.
            </p>
          </AvaPanel>
        ) : analysisInFlight ? (
          <AvaPanel eyebrow="Analysis" title="Analysis in progress">
            <p className="text-sm text-[#b3bccb]">
              Live progress is shown at the top of this page. Results will appear here
              automatically when processing finishes.
            </p>
          </AvaPanel>
        ) : analysis?.status === "failed" ? (
          <AvaPanel eyebrow="Analysis" title="Analysis failed">
            <p className="text-sm text-[#e46464]">
              {jobStatus?.user_message ?? analysis.error ?? "The recording could not be analyzed."}
            </p>
            <div className="mt-4">
              <RerunAnalysisButton sessionId={session.id} label="Retry analysis" />
            </div>
          </AvaPanel>
        ) : (
          <AvaPanel eyebrow="Analysis" title="Not analyzed yet">
            <p className="text-sm text-[#b3bccb]">
              No analysis has been run for this session. Use{" "}
              <span className="font-semibold text-[#f5f7fb]">Run Analysis</span> above to generate
              sprint intelligence.
            </p>
          </AvaPanel>
        )}

        {/* F. Session Admin — rename lives here, dark and out of the primary flow. */}
        <details className="group rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#b3bccb]">
            <span className="inline-block text-[#7e8797] transition group-open:rotate-90">▸</span>
            Session Admin
          </summary>
          <form action={renameSession} className="mt-4 flex gap-2">
            <input type="hidden" name="id" value={session.id} />
            <input
              name="name"
              defaultValue={session.name ?? ""}
              placeholder={session.original_filename ?? "Session name"}
              className="flex-1 rounded-lg border border-white/[0.08] bg-[#182233] px-3 py-2 text-sm text-[#f5f7fb] placeholder:text-[#7e8797] focus:border-[#2f80ed]/50 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[#f5f7fb] transition hover:bg-white/[0.09]"
            >
              Save
            </button>
          </form>
        </details>

        {/* G. Danger zone — small, deliberately not prominent. */}
        <div className="flex justify-end pt-2">
          <form action={deleteSession}>
            <input type="hidden" name="id" value={session.id} />
            <button
              type="submit"
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-[#7e8797] transition hover:border-[#e46464]/40 hover:text-[#e46464]"
            >
              Delete session
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
