import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { analysisMetricsSchema } from "@/lib/biomechanics/types";
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
  queueAnalysis,
  renameSession,
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
import { computeSprintMeasurements } from "@/lib/benchmark/measurements";
import { isPrecisionLimited } from "@/lib/benchmark/precision";
import { buildTrainingFocus } from "@/lib/coaching/focus";
import { buildSprintIntelligence } from "@/lib/intelligence";
import { deriveLimitingFactors } from "@/lib/intelligence/limitingFactors";
import { buildTrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import { calculateAvaPerformanceScore } from "@/lib/intelligence/performanceScore";
import { evaluateTrochanterStepLength } from "@/lib/intelligence/trochanterOptimizer";
import MetricsPanel from "./MetricsPanel";
import CalibrationPanel from "./CalibrationPanel";
import PhaseTimelinePanel from "./PhaseTimelinePanel";
import AvaIntelligencePanel from "./AvaIntelligencePanel";
import AvaPerformanceScoreCard from "./AvaPerformanceScoreCard";
import PerformancePotentialCard from "./PerformancePotentialCard";
import UnlockSimulatorCard from "./UnlockSimulatorCard";
import CalibrationControlsForm from "./CalibrationControlsForm";
import CoachNotesForm from "./CoachNotesForm";
import RecordingQualityCard from "./RecordingQualityCard";
import PerformanceSummaryCard from "./PerformanceSummaryCard";
import { AvaPanel } from "@/components/ava/AvaPanel";
import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import { AvaInfoStat } from "@/components/ava/AvaInfoStat";
import { buildRecordingQuality, summarisePoseQuality } from "@/lib/recording/quality";
import { accelerationProfileLabel, analysisTypeConfig, isAnalysisType } from "@/lib/analysisTypes";
import AccelerationMetricsPanel from "./AccelerationMetricsPanel";

/** Pull a calibrated measurement value by key from a calibration report. */
function calibratedValue(report: CalibrationReport | null, key: string): number | null {
  return report?.measurements.find((m) => m.key === key)?.value ?? null;
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
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(
      "id, name, notes, original_filename, video_path, status, created_at, athlete_id, analysis_type, pose_engine, distance_m, duration_s, width, height, fps, fps_override, benchmark_id, calibration_zone_start_s, calibration_zone_end_s, calibration_zone_distance_m, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, overlay_trochanter_x, overlay_trochanter_y, overlay_trochanter_time_s, codec, size_bytes, athletes(full_name, height_cm, weight_kg, leg_length_cm, trochanter_height_m, personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m)",
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

  // Latest analysis for this session (read-only RLS access).
  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, status, error, metrics, keypoints_path, created_at, completed_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analysisInFlight = analysis?.status === "queued" || analysis?.status === "running";

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

  // Step/contact markers for the video timeline. Empty until metrics carry
  // per-event timestamps; built here so the prop path is ready.
  const timelineMarkers = parsedMetrics?.success
    ? buildTimelineMarkersFromMetrics(parsedMetrics.data)
    : [];

  // Interactive-overlay frames come from the analysis's stored pose artifact
  // (analyses.keypoints_path). The loader is fully defensive: a missing path,
  // bucket, object, or malformed artifact resolves to [] (placeholder shown).
  const hasReadableResult = parsedMetrics?.success || parsedAccelerationMetrics?.success;
  const { frames: rawOverlayFrames, meta: overlayMeta } = hasReadableResult
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
  const fpsSnapped = normalizedFps != null && detectedFps != null && normalizedFps !== detectedFps;
  // The clock every timing-derived number uses: manual override, else the normalized
  // detected rate.
  const effectiveFps = overrideFps ?? normalizedFps;

  // Re-time every frame from the effective clock when the coach overrode OR we snapped
  // a drifted rate to canonical — so steps, phases, zone time, and velocity all use it.
  const overlayFrames =
    (overrideFps != null || fpsSnapped) && isValidFps(effectiveFps)
      ? applyFpsOverride(rawOverlayFrames, effectiveFps)
      : rawOverlayFrames;

  // Known-distance calibration zone (Day 61), if the coach set all three parts.
  const calibrationZone: CalibrationZone | null =
    session.calibration_zone_start_s != null &&
    session.calibration_zone_end_s != null &&
    session.calibration_zone_distance_m != null
      ? {
          startTime: session.calibration_zone_start_s,
          endTime: session.calibration_zone_end_s,
          distanceM: session.calibration_zone_distance_m,
        }
      : null;

  // Manual ground calibration (Day 62): two clicked ground points a known
  // distance apart. Same shape drives both the calibration scale and the fixed
  // calibration line drawn on the overlay.
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

  // Timing-gate BAR calibration (Day 66): the full cone-to-cone geometry, used to
  // draw the gates as real bars on the overlay. Its reduction to the two midpoint
  // points above is what every measurement engine consumes; this is render-only.
  const calibrationGates: CalibrationGates | null = (() => {
    if (session.calibration_gates == null) return null;
    const parsed = calibrationGatesSchema.safeParse(session.calibration_gates);
    return parsed.success ? parsed.data : null;
  })();

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
  const measurements =
    session.analysis_type === "fly" && overlayFrames.length
      ? computeSprintMeasurements(overlayFrames, manualPoints, effectiveWidth, effectiveHeight)
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
  const activeFps = effectiveFps;

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
  const recordingQuality =
    overlayFrames.length && measurements
      ? buildRecordingQuality({
          fps: activeFps,
          width: effectiveWidth,
          height: effectiveHeight,
          codec: session.codec ?? null,
          cameraStatic: camMethod.includes("static")
            ? true
            : measurements.cameraCompensation.available
              ? false
              : null,
          cameraConfidence:
            measurements.cameraCompensation.confidence === "none"
              ? "unavailable"
              : measurements.cameraCompensation.confidence,
          cameraAvailable: measurements.cameraCompensation.available,
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
        .select("id, metrics, created_at, sessions!inner(athlete_id)")
        .eq("sessions.athlete_id", session.athlete_id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: null };
  const trainingFocus = athleteAnalyses ? buildTrainingFocus(athleteAnalyses) : null;

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
      })
    : null;

  // Trusted Sprint Metrics (Day 79): THE single source of truth for every customer-
  // facing surface. Derived only from the calibrated measurement engine.
  const trusted = buildTrustedMetrics(measurements);

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

  return (
    <main className="ava-carbon min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* B. Top command bar */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/athletes/${session.athlete_id}`}
            className="text-sm font-medium text-[#A0A2A8] transition hover:text-[#F5F5F7]"
          >
            ← Back to athlete
          </Link>

          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6B7280] sm:block">
            {hasSelectedMode ? mode.analysisTitle : "Choose Analysis Mode"}
          </p>

          {analysisInFlight && (
            <AvaStatusPill
              label={ANALYSIS_STATUS_LABELS[analysis!.status] ?? analysis!.status}
              tone="gray"
            />
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-4 py-3 text-sm text-[#ff8079]"
          >
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 text-sm text-[#D4AF37]">
            Calibration saved.
          </p>
        )}

        {/* C. Session hero panel */}
        <AvaPanel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D72638]">
                {hasSelectedMode ? mode.analysisTitle : "Sprint Analysis"}
              </p>
              <h1 className="truncate text-3xl font-bold tracking-tight text-[#F5F5F7]">
                {displayName}
              </h1>
              {hasSelectedMode && (
                <p className="mt-2 text-sm text-[#A0A2A8]">
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

        {/* D. Main review panel — overlay is the primary surface once analysis is done;
            the raw source video is only its own section BEFORE analysis. */}
        <AvaPanel
          eyebrow="Primary Review"
          title={analysisComplete ? "Interactive Overlay" : "Source Video"}
        >
          {session.analysis_type === "acceleration" && (
            <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-sm text-[#A0A2A8]">
                Set finish distance. AVA detects first movement automatically.
              </p>
              <div className="mt-3 inline-flex rounded-lg border border-white/[0.1] bg-[#121214] p-1">
                {[10, 20, 30].map((distance) => (
                  <form action={setAccelerationFinishDistance} key={distance}>
                    <input type="hidden" name="id" value={session.id} />
                    <input type="hidden" name="finish_distance_m" value={distance} />
                    <button
                      type="submit"
                      className={`rounded-md px-4 py-2 text-sm font-semibold ${accelerationFinishDistance === distance ? "bg-[#D72638] text-white" : "text-[#A0A2A8] hover:bg-white/[0.06]"}`}
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
                  <p className="mb-3 text-sm font-semibold text-[#F5F5F7]">Choose analysis mode</p>
                  <div className="inline-flex rounded-lg border border-white/[0.1] bg-[#121214] p-1">
                    {(["fly", "acceleration"] as const).map((type) => (
                      <form action={setSessionAnalysisType} key={type}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="analysis_type" value={type} />
                        <button
                          type="submit"
                          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${session.analysis_type === type ? "bg-[#D72638] text-white" : "text-[#A0A2A8] hover:bg-white/[0.06] hover:text-white"}`}
                        >
                          {type === "fly" ? "Fly Analysis" : "Acceleration Analysis"}
                        </button>
                      </form>
                    ))}
                  </div>
                </>
              )}
              {session.analysis_type === "fly" && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    Pose engine
                  </p>
                  <div className="inline-flex rounded-lg border border-white/[0.1] bg-[#121214] p-1">
                    {(["mediapipe", "rtmpose"] as const).map((engine) => (
                      <form action={setFlyPoseEngine} key={engine}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="pose_engine" value={engine} />
                        <button
                          type="submit"
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                            (session.pose_engine ?? "mediapipe") === engine
                              ? "bg-[#D72638] text-white"
                              : "text-[#A0A2A8] hover:bg-white/[0.06]"
                          }`}
                        >
                          {engine === "mediapipe" ? "MediaPipe (default)" : "RTMPose (experimental)"}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4">
                {hasSelectedMode &&
                (session.analysis_type !== "acceleration" || hasAccelerationFinishDistance) ? (
                  <form action={queueAnalysis}>
                    <input type="hidden" name="id" value={session.id} />
                    <button
                      type="submit"
                      className="ava-red-glow rounded-lg bg-[#D72638] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e63a4b]"
                    >
                      {analysis ? "Rerun Analysis" : "Run Analysis"}
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-[#E4C25A]">
                    {session.analysis_type === "acceleration"
                      ? "Set finish distance before running acceleration analysis."
                      : "Select one mode to enable analysis."}
                  </p>
                )}
              </div>
            </div>
          )}
          {analysisComplete ? (
            /* Sync (Day 75): the overlay renders against the video's OWN timeline (raw
               frame timestamps), not the FPS-normalized clock used for metrics — so the
               skeleton stays glued to the runner at 1× and 2.5×. Analysis below still uses
               the normalized frames, so benchmark numbers are unchanged. */
            signedVideo?.signedUrl && overlayFrames.length > 0 ? (
              <OverlayVideoPlayer
                videoUrl={signedVideo.signedUrl}
                frames={rawOverlayFrames}
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
                <p className="text-sm text-[#A0A2A8]">
                  The pose overlay (skeleton, joint angles, COM trail, and foot-contact labels) will
                  appear here once per-frame pose data is ready for this analysis.
                </p>
              </div>
            )
          ) : signedVideo?.signedUrl ? (
            <VideoPlayer videoUrl={signedVideo.signedUrl} markers={timelineMarkers} />
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-[#A0A2A8]">
                No uploaded video available for this session.
              </p>
            </div>
          )}
        </AvaPanel>

        {/* E. Analysis content — diagnosis-first: lead with the limiting factors. */}
        {metricsReady ? (
          <div className="space-y-6">
            {accelerationMetrics && <AccelerationMetricsPanel metrics={accelerationMetrics} />}

            {/* Trusted-only headline score. */}
            {session.analysis_type === "fly" && performanceScore && (
              <AvaPerformanceScoreCard result={performanceScore} />
            )}

            {/* PRIMARY FEATURE: the ranked limiting-factor diagnosis. */}
            {session.analysis_type === "fly" && intelligence && diagnosis && (
              <AvaIntelligencePanel report={intelligence} diagnosis={diagnosis} />
            )}

            {/* Performance headroom from correcting those factors. */}
            {session.analysis_type === "fly" && diagnosis && (
              <PerformancePotentialCard potential={diagnosis.potential} />
            )}

            {/* Trochanter stride-length optimizer + unlock simulator (needs leg length). */}
            {session.analysis_type === "fly" &&
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
              <PerformanceSummaryCard trusted={trusted} />
            )}

            {/* Recording-quality trust indicator (collapsed). */}
            {recordingQuality && <RecordingQualityCard report={recordingQuality} />}

            {/* Everything else is experimental / not-yet-trusted. Pass the recording's
                pose-tracking confidence so confidence-limited metrics (and ≥120 fps
                timing) are gated honestly rather than shown as trusted. */}
            {session.analysis_type === "fly" && parsedMetrics?.success && (
              <MetricsPanel
                metrics={parsedMetrics.data}
                activeFps={activeFps}
                poseConfidence={poseQuality?.poseConfidence ?? null}
              />
            )}

            {/* Detailed Systems — secondary engines + validation, collapsed. */}
            <details className="group rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <summary className="flex cursor-pointer items-center gap-2 text-lg font-semibold tracking-tight text-[#F5F5F7]">
                <span className="inline-block text-[#D72638] transition group-open:rotate-90">
                  ▸
                </span>
                Detailed Systems
                <span className="text-xs font-normal text-[#6B7280]">
                  calibration &amp; sprint phases
                </span>
              </summary>
              <div className="mt-5 space-y-4">
                {calibrationReport && <CalibrationPanel report={calibrationReport} />}
                <CalibrationControlsForm
                  sessionId={session.id}
                  detectedFps={detectedFps}
                  fpsOverride={session.fps_override ?? null}
                  zoneStartS={session.calibration_zone_start_s ?? null}
                  zoneEndS={session.calibration_zone_end_s ?? null}
                  zoneDistanceM={session.calibration_zone_distance_m ?? null}
                />
                {session.analysis_type === "fly" && phaseReport && (
                  <PhaseTimelinePanel report={phaseReport} />
                )}
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
            <p className="text-sm text-[#A0A2A8]">
              This analysis completed, but its metrics could not be read. Rerun the analysis to
              regenerate them.
            </p>
          </AvaPanel>
        ) : analysisInFlight ? (
          <AvaPanel eyebrow="Analysis" title="Analysis running">
            <p className="text-sm text-[#A0A2A8]">
              Analysis {ANALYSIS_STATUS_LABELS[analysis!.status].toLowerCase()} — the
              limiting-factor diagnosis will appear here when the worker finishes.
            </p>
          </AvaPanel>
        ) : analysis?.status === "failed" ? (
          <AvaPanel eyebrow="Analysis" title="Analysis failed">
            <p className="text-sm text-[#ff8079]">
              Analysis failed{analysis.error ? `: ${analysis.error}` : ""}. Rerun analysis to try
              again.
            </p>
          </AvaPanel>
        ) : (
          <AvaPanel eyebrow="Analysis" title="Not analyzed yet">
            <p className="text-sm text-[#A0A2A8]">
              No analysis has been run for this session. Use{" "}
              <span className="font-semibold text-[#F5F5F7]">Run Analysis</span> above to generate
              sprint intelligence.
            </p>
          </AvaPanel>
        )}

        {/* F. Session Admin — rename lives here, dark and out of the primary flow. */}
        <details className="group rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#A0A2A8]">
            <span className="inline-block text-[#6B7280] transition group-open:rotate-90">▸</span>
            Session Admin
          </summary>
          <form action={renameSession} className="mt-4 flex gap-2">
            <input type="hidden" name="id" value={session.id} />
            <input
              name="name"
              defaultValue={session.name ?? ""}
              placeholder={session.original_filename ?? "Session name"}
              className="flex-1 rounded-lg border border-white/[0.08] bg-[#19191C] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[#F5F5F7] transition hover:bg-white/[0.09]"
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
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-[#8a8a90] transition hover:border-[#FF3B30]/40 hover:text-[#FF3B30]"
            >
              Delete session
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
