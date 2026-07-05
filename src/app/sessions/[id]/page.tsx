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
import { buildRecommendations } from "@/lib/coaching/recommendations";
import type { CoachingComparisonReport } from "@/lib/coaching/types";
import VideoPlayer from "@/components/VideoPlayer";
import { buildTimelineMarkersFromMetrics } from "@/lib/biomechanics/video/timelineMarkers";
import OverlayVideoPlayer from "@/components/video/OverlayVideoPlayer";
import type { OverlayFrame } from "@/lib/video/overlay";
import { loadOverlayFrames } from "@/lib/video/loadOverlayFrames";
import { buildCalibrationReport, type CalibrationReport, type CalibrationZone } from "@/lib/calibration";
import { predictPerformance, type RaceDistance } from "@/lib/prediction";
import { detectSprintPhases } from "@/lib/phases";
import { applyFpsOverride, isValidFps } from "@/lib/video/fps";
import { detectStepMarks, type StepDistanceScale } from "@/lib/video/steps";
import { stepFrequencyFromContacts } from "@/lib/video/cadence";
import type { ManualCalibrationPoints } from "@/lib/calibration";
import { calibrationGatesSchema, type CalibrationGates } from "@/lib/calibration/gates";
import { computeSprintMeasurements } from "@/lib/benchmark/measurements";
import {
  assembleAvaValues,
  compareToBenchmark,
  evaluateAccuracy,
  referenceMetricsSchema,
  type BenchmarkComparisonRow,
  type AccuracyRow,
} from "@/lib/benchmark";
import { isPrecisionLimited } from "@/lib/benchmark/precision";
import { buildTrainingFocus } from "@/lib/coaching/focus";
import { buildSprintIntelligence } from "@/lib/intelligence";
import MetricsPanel from "./MetricsPanel";
import InsightPanel from "./InsightPanel";
import RecommendationsPanel from "./RecommendationsPanel";
import CalibrationPanel from "./CalibrationPanel";
import PerformancePredictionPanel from "./PerformancePredictionPanel";
import PhaseTimelinePanel from "./PhaseTimelinePanel";
import SprintIntelligencePanel from "./SprintIntelligencePanel";
import CalibrationControlsForm from "./CalibrationControlsForm";
import BenchmarkPanel from "./BenchmarkPanel";
import CoachNotesForm from "./CoachNotesForm";
import RecordingQualityCard from "./RecordingQualityCard";
import PerformanceSummaryCard from "./PerformanceSummaryCard";
import { buildRecordingQuality, summarisePoseQuality } from "@/lib/recording/quality";

/** Pull a calibrated measurement value by key from a calibration report. */
function calibratedValue(report: CalibrationReport | null, key: string): number | null {
  return report?.measurements.find((m) => m.key === key)?.value ?? null;
}

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
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, name, notes, original_filename, video_path, status, created_at, athlete_id, distance_m, duration_s, width, height, fps, fps_override, benchmark_id, calibration_zone_start_s, calibration_zone_end_s, calibration_zone_distance_m, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, codec, size_bytes, athletes(full_name, height_cm, weight_kg, leg_length_cm, personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m)",
    )
    .eq("id", id)
    .single();

  if (!session) notFound();

  const displayName = sessionDisplayName(session);

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
    analysis?.status === "complete" ? analysisMetricsSchema.safeParse(analysis.metrics) : null;

  // Coaching insights now come from the reusable engine, not the panel.
  const coachingReport = parsedMetrics?.success
    ? generateCoachingReport(toCoachingMetrics(parsedMetrics.data), analysis?.id)
    : null;

  // Deterministic training recommendations derived from the same metrics.
  const recommendations = parsedMetrics?.success
    ? buildRecommendations(toCoachingMetrics(parsedMetrics.data))
    : null;

  // Step/contact markers for the video timeline. Empty until metrics carry
  // per-event timestamps; built here so the prop path is ready.
  const timelineMarkers = parsedMetrics?.success
    ? buildTimelineMarkersFromMetrics(parsedMetrics.data)
    : [];

  // Interactive-overlay frames come from the analysis's stored pose artifact
  // (analyses.keypoints_path). The loader is fully defensive: a missing path,
  // bucket, object, or malformed artifact resolves to [] (placeholder shown).
  const { frames: rawOverlayFrames, meta: overlayMeta } = parsedMetrics?.success
    ? await loadOverlayFrames(supabase, analysis?.keypoints_path)
    : { frames: [] as OverlayFrame[], meta: null };

  // Source video dimensions + detected FPS. The session row may lack them (older
  // uploads), so fall back to the pose artifact's own metadata, which the worker
  // derived from the video. These drive every metre-scale + timing calculation.
  const effectiveWidth = session.width ?? overlayMeta?.width ?? null;
  const effectiveHeight = session.height ?? overlayMeta?.height ?? null;
  const detectedFps = session.fps ?? overlayMeta?.fps ?? null;

  // Manual FPS override (Day 61): when set, re-time every frame so all
  // downstream timing (steps, phases, calibrated + segment velocity) uses the
  // coach-supplied frame rate instead of the detected one.
  const overlayFrames = isValidFps(session.fps_override)
    ? applyFpsOverride(rawOverlayFrames, session.fps_override)
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
  const measurements = overlayFrames.length
    ? computeSprintMeasurements(overlayFrames, manualPoints, effectiveWidth, effectiveHeight)
    : null;

  // Active FPS + its source, for the timing-provenance display. Every timing-derived
  // number (contact, flight, frequency, zone, velocity, phases) uses this clock.
  const activeFps = isValidFps(session.fps_override) ? session.fps_override : detectedFps;
  const fpsSource: "override" | "detected" | "none" = isValidFps(session.fps_override)
    ? "override"
    : detectedFps != null
      ? "detected"
      : "none";

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

  // Benchmark validation: the list of available benchmarks (for the link selector)
  // and, when this session is explicitly linked to one, the AVA-vs-reference
  // percent-error comparison. Reference data is global (RLS: readable by any
  // authenticated user).
  const { data: benchmarks } = await supabase
    .from("benchmarks")
    .select("id, name, reference_metrics")
    .order("created_at", { ascending: true });

  let benchmarkComparison: {
    benchmarkName: string;
    rows: BenchmarkComparisonRow[];
    accuracy: AccuracyRow[];
  } | null = null;
  const linkedBenchmark = session.benchmark_id
    ? benchmarks?.find((b) => b.id === session.benchmark_id)
    : null;
  if (linkedBenchmark && measurements && parsedMetrics?.success) {
    const refParsed = referenceMetricsSchema.safeParse(linkedBenchmark.reference_metrics);
    const reference = refParsed.success ? refParsed.data : {};
    const avaValues = assembleAvaValues(
      measurements,
      {
        groundContactTimeMs: parsedMetrics.data.groundContactTimeMs,
        flightTimeMs: parsedMetrics.data.flightTimeMs,
      },
      { activeFps },
    );
    benchmarkComparison = {
      benchmarkName: linkedBenchmark.name,
      rows: compareToBenchmark(avaValues, reference),
      accuracy: evaluateAccuracy(avaValues, reference),
    };
  }

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
  const pb = (d: RaceDistance) =>
    athleteProfile?.[`personal_best_${d}m` as const] ?? null;
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
      })
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
      {saved && (
        <p className="mb-4 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          Calibration saved.
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
        <h2 className="mb-3 text-lg font-semibold">Video</h2>
        {signedVideo?.signedUrl ? (
          <VideoPlayer videoUrl={signedVideo?.signedUrl ?? ""} markers={timelineMarkers} />
        ) : (
          <p className="text-sm text-gray-500">No uploaded video available.</p>
        )}
      </section>

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
                {/* Trust indicator first, then the focal performance summary. */}
                {recordingQuality && <RecordingQualityCard report={recordingQuality} />}
                {measurements && <PerformanceSummaryCard measurements={measurements} />}

                <section className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-xl font-bold text-lane">Interactive Overlay</h2>
                  {signedVideo?.signedUrl && overlayFrames.length > 0 ? (
                    <OverlayVideoPlayer
                      videoUrl={signedVideo.signedUrl}
                      frames={overlayFrames}
                      stepScale={stepScale}
                      stepCadenceHz={stepCadenceHz}
                      stepContactCount={overlayStepMarks.length}
                      sessionId={session.id}
                      manualCalibration={manualPoints}
                      calibrationGates={calibrationGates}
                    />
                  ) : (
                    <p className="text-sm text-gray-500">
                      The pose overlay (skeleton, joint angles, COM trail, and foot-contact labels)
                      will appear here once per-frame pose data is available for this analysis.
                    </p>
                  )}
                </section>

                {/* Second focal point: the coaching read. */}
                {intelligence && <SprintIntelligencePanel report={intelligence} />}

                {measurements && (
                  <BenchmarkPanel
                    sessionId={session.id}
                    measurements={measurements}
                    activeFps={activeFps}
                    fpsSource={fpsSource}
                    detectedFps={detectedFps}
                    fpsOverride={session.fps_override ?? null}
                    benchmarks={(benchmarks ?? []).map((b) => ({ id: b.id, name: b.name }))}
                    linkedBenchmarkId={session.benchmark_id ?? null}
                    comparison={benchmarkComparison}
                  />
                )}

                {/* Detailed analysis — secondary, kept below the focal cards. */}
                <details className="mt-8 rounded-xl border bg-gray-50 p-5">
                  <summary className="cursor-pointer text-lg font-semibold text-gray-700">
                    Detailed analysis
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      raw metrics, calibration, phases, prediction &amp; coaching detail
                    </span>
                  </summary>
                  <div className="mt-4 space-y-2">
                    <MetricsPanel metrics={parsedMetrics.data} activeFps={activeFps} />
                    {calibrationReport && <CalibrationPanel report={calibrationReport} />}
                    <CalibrationControlsForm
                      sessionId={session.id}
                      detectedFps={detectedFps}
                      fpsOverride={session.fps_override ?? null}
                      zoneStartS={session.calibration_zone_start_s ?? null}
                      zoneEndS={session.calibration_zone_end_s ?? null}
                      zoneDistanceM={session.calibration_zone_distance_m ?? null}
                    />
                    {phaseReport && <PhaseTimelinePanel report={phaseReport} />}
                    {prediction && <PerformancePredictionPanel prediction={prediction} />}
                    {coachingReport && (
                      <InsightPanel report={coachingReport} comparison={comparisonReport} />
                    )}
                    {recommendations && <RecommendationsPanel recommendations={recommendations} />}
                  </div>
                </details>

                <CoachNotesForm sessionId={session.id} defaultNotes={session.notes} />
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
