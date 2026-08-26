import {
  detectAccelerationStartEvent,
  detectZoneStartEvent,
  resolveAccelerationStartEvent,
  NEEDS_REVIEW,
  type AccelerationStartEvent,
} from "./startEvent";
import type { AccelerationCalibration, AccelerationFrame, AccelerationPoint } from "./types";
import {
  CONSERVATIVE_TIMING_POLICY_V1,
  reportTimeSeconds,
  velocityFromReportedTime,
} from "../measurement/timingPolicy";
import {
  accelerationZoneFromMarkers,
  formatMarkerDistanceLabel,
  type AccelerationMarker,
  type AccelerationStartOverride,
  type AccelerationTravelDirection,
} from "./calibration";
import { computeAccelerationSteps, type AccelerationStepRow } from "./steps";
import { analyzeProgression, type ProgressionAnalysis } from "./progression";
import type { PoseSequence } from "../biomechanics/pose";

export interface AccelerationSegmentVelocity {
  startM: number;
  endM: number;
  timeS: number;
  velocityMps: number;
  rawTimeS: number;
  reportedTimeS: number;
  rawVelocityMps: number;
  reportedVelocityMps: number;
}

export interface AccelerationMetrics {
  timingPolicyVersion: typeof CONSERVATIVE_TIMING_POLICY_V1;
  resultType: "acceleration";
  status: "ready" | "ready_with_warning" | "needs_review" | "unavailable";
  startEvent: AccelerationStartEvent;
  splits: { m10S: number | null; m20S: number | null; m30S: number | null };
  rawSplits: { m10S: number | null; m20S: number | null; m30S: number | null };
  finishDistanceM: number | null;
  finishCrossingTime: number | null;
  runTime: number | null;
  rawRunTime: number | null;
  reportedRunTime: number | null;
  segmentVelocities: AccelerationSegmentVelocity[];
  averageVelocityMps: number | null;
  rawAverageVelocityMps: number | null;
  reportedAverageVelocityMps: number | null;
  earlyAccelerationMps2: number | null;
  peakVelocity: number | null;
  rawPeakVelocity: number | null;
  reportedPeakVelocity: number | null;
  distanceToPeakVelocity: number | null;
  summary: string;
  warnings: string[];
  strideMetrics: {
    status: "ready" | "needs_review" | "unavailable";
    strideCount: number | null;
    averageStrideLengthM: number | null;
    reason: string;
  };
  // --- Phase 2 (multi-marker Acceleration Analysis) additions. Only populated
  // when the worker also ran `computeAccelerationAnalysis` (see Part 11 wiring
  // in analysis-worker.mjs); absent on legacy single-finish-gate analyses.
  analysisSchemaVersion?: typeof ACCELERATION_ANALYSIS_SCHEMA_VERSION;
  analysisZone?: { entryDistanceM: number; exitDistanceM: number };
  calibratedMarkers?: { label: string; distanceM: number }[];
  markerSplits?: AccelerationSplit[];
  intervalMetrics?: AccelerationIntervalMetric[];
  steps?: AccelerationStepRow[];
  stepsStatus?: "ready" | "insufficient_contacts" | "unavailable";
  stepsReason?: string | null;
  peakVelocityDetail?: { velocityMps: number | null; distanceM: number | null; timeS: number | null };
  asymmetries?: AccelerationAsymmetry | null;
  // --- Phase 2 (Parts 1-3): WHY-level progression analysis. Limiting factors,
  // recommendations, and the summary card are deliberately NOT persisted here
  // — like fly's LimitingFactorsResult, they are pure functions of already-
  // persisted data (steps/progression/peak values) computed at render time,
  // so no worker/schema change is needed to evolve their logic.
  progression?: ProgressionAnalysis | null;
  technicalProgression?: AccelerationTechnicalProgression;
  quality?: AccelerationQuality;
  // --- Phase 3 (Acceleration Mechanics, Part 17). Populated only when the
  // worker also ran `computeAccelerationMechanics`; absent on every analysis
  // persisted before this phase (Phase 1 single-gate and Phase 2 multi-marker
  // results both still parse and render unchanged without it).
  mechanics?: import("./mechanicsPipeline").AccelerationMechanicsResult | null;
}

type Sample = { t: number; x: number };
const EPS = 1e-9;

/**
 * The zone's own pixel-per-meter scale (exit marker − entry marker, over the
 * ZONE'S OWN span — never an absolute 0m origin; see the note at its call
 * site below). Extracted as the SINGLE reusable source of this scale so
 * `mechanicsPipeline.ts` (Phase 3, Part 4) converts touchdown offsets to
 * meters via this exact same calibration rather than a second, competing
 * distance model.
 */
export function computeZoneScale(markers: AccelerationMarker[]): { normPerMeter: number; metersPerNormalizedUnit: number } | null {
  const sorted = [...markers].sort((a, b) => a.distanceM - b.distanceM);
  const startMarker = sorted[0];
  const lastMarker = sorted[sorted.length - 1];
  if (!startMarker || !lastMarker || lastMarker.distanceM <= startMarker.distanceM) return null;
  const zoneSpanM = lastMarker.distanceM - startMarker.distanceM;
  const normPerMeter = (lastMarker.point.x - startMarker.point.x) / (zoneSpanM || EPS);
  if (!Number.isFinite(normPerMeter) || Math.abs(normPerMeter) < EPS) return null;
  return { normPerMeter, metersPerNormalizedUnit: 1 / Math.abs(normPerMeter) };
}

const visible = (point?: AccelerationPoint): point is AccelerationPoint =>
  !!point && (point.visibility ?? 1) >= 0.4;

function torsoX(frame: AccelerationFrame): number | null {
  const midpoint = (a?: AccelerationPoint, b?: AccelerationPoint): number | null =>
    visible(a) && visible(b) ? (a.x + b.x) / 2 : null;
  const shoulder = midpoint(frame.landmarks.leftShoulder, frame.landmarks.rightShoulder);
  const hip = midpoint(frame.landmarks.leftHip, frame.landmarks.rightHip);
  if (shoulder != null && hip != null) return (shoulder + hip) / 2;
  return frame.centerOfMass?.x ?? shoulder ?? hip;
}

function crossingTime(series: Sample[], target: number, direction: number): number | null {
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    const crosses = direction > 0 ? a.x <= target && b.x >= target : a.x >= target && b.x <= target;
    if (!crosses) continue;
    const dx = b.x - a.x;
    return Math.abs(dx) < EPS ? a.t : a.t + ((target - a.x) / dx) * (b.t - a.t);
  }
  return null;
}

function slope(samples: Sample[]): number | null {
  if (samples.length < 3) return null;
  const mt = samples.reduce((sum, p) => sum + p.t, 0) / samples.length;
  const mx = samples.reduce((sum, p) => sum + p.x, 0) / samples.length;
  const denom = samples.reduce((sum, p) => sum + (p.t - mt) ** 2, 0);
  return denom < EPS ? null : samples.reduce((sum, p) => sum + (p.t - mt) * (p.x - mx), 0) / denom;
}

export function computeAccelerationMetrics(
  frames: AccelerationFrame[],
  calibration: AccelerationCalibration | null | undefined,
): AccelerationMetrics {
  const startEvent = detectAccelerationStartEvent(frames);
  const empty = (status: "needs_review" | "unavailable", warning: string): AccelerationMetrics => ({
    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,
    resultType: "acceleration",
    status,
    startEvent,
    splits: { m10S: null, m20S: null, m30S: null },
    rawSplits: { m10S: null, m20S: null, m30S: null },
    finishDistanceM: calibration?.finishDistanceM ?? null,
    finishCrossingTime: null,
    runTime: null,
    rawRunTime: null,
    reportedRunTime: null,
    segmentVelocities: [],
    averageVelocityMps: null,
    rawAverageVelocityMps: null,
    reportedAverageVelocityMps: null,
    earlyAccelerationMps2: null,
    peakVelocity: null,
    rawPeakVelocity: null,
    reportedPeakVelocity: null,
    distanceToPeakVelocity: null,
    summary:
      status === "needs_review"
        ? "Acceleration start needs review before metrics can be reported."
        : "Acceleration metrics are unavailable without usable calibrated pose data.",
    warnings: [warning],
    strideMetrics: {
      status: "unavailable",
      strideCount: null,
      averageStrideLengthM: null,
      reason: "Reliable acceleration foot-contact events were not available.",
    },
  });

  if (startEvent.type === NEEDS_REVIEW || startEvent.timestamp == null) {
    return empty("needs_review", `FIRST_DETECTED_MOVEMENT needs review: ${startEvent.reason}`);
  }
  if (!calibration || calibration.finishDistanceM <= 0 || frames.length < 3) {
    return empty("unavailable", "Set the finish gate position and distance.");
  }

  // Detection crops are mapped back to full-frame normalized coordinates by the
  // pose runner. Acceleration consumes only that stable worker coordinate space.
  const series = frames.flatMap((frame) => {
    const x = torsoX(frame);
    return x == null ? [] : [{ t: frame.time, x }];
  });
  if (!series.length) return empty("unavailable", "No tracked torso positions were available.");

  // Official acceleration t=0 is FIRST_DETECTED_MOVEMENT. Torso position at that time
  // establishes spatial 0 m only; torso/hip/step motion never establishes time 0.
  const startTime = startEvent.timestamp;
  const startX = series.reduce((best, sample) =>
    Math.abs(sample.t - startTime) < Math.abs(best.t - startTime) ? sample : best,
  ).x;
  const span = calibration.finishX - startX;
  if (Math.abs(span) < EPS)
    return empty("unavailable", "Finish gate is not beyond the detected start position.");
  const direction = Math.sign(span);
  const normPerMeter = span / calibration.finishDistanceM;
  const distances =
    calibration.finishDistanceM >= 30
      ? [10, 20, 30]
      : calibration.finishDistanceM >= 20
        ? [20]
        : [calibration.finishDistanceM];
  const crossing = new Map<number, number>();
  for (const distance of distances) {
    const targetX =
      distance === calibration.finishDistanceM
        ? calibration.finishX
        : startX + normPerMeter * distance;
    const time = crossingTime(series, targetX, direction);
    if (time != null && time > startTime) crossing.set(distance, time);
  }
  const rawSplit = (distance: number) => {
    const time = crossing.get(distance);
    return time == null ? null : time - startTime;
  };
  const split = (distance: number) => {
    const raw = rawSplit(distance);
    return raw == null ? null : reportTimeSeconds(raw);
  };

  const segmentVelocities: AccelerationSegmentVelocity[] = [];
  let priorDistance = 0;
  let priorTime = startTime;
  for (const distance of distances) {
    const time = crossing.get(distance);
    if (time == null) break;
    const duration = time - priorTime;
    if (duration > 0) {
      segmentVelocities.push({
        startM: priorDistance,
        endM: distance,
        timeS: reportTimeSeconds(duration),
        velocityMps: velocityFromReportedTime(distance - priorDistance, duration),
        rawTimeS: duration,
        reportedTimeS: reportTimeSeconds(duration),
        rawVelocityMps: (distance - priorDistance) / duration,
        reportedVelocityMps: velocityFromReportedTime(distance - priorDistance, duration),
      });
    }
    priorDistance = distance;
    priorTime = time;
  }

  const measuredDistance = segmentVelocities.at(-1)?.endM ?? null;
  const rawMeasuredTime = measuredDistance == null ? null : rawSplit(measuredDistance);
  const measuredTime = measuredDistance == null ? null : split(measuredDistance);
  const rawAverageVelocityMps =
    measuredDistance != null && rawMeasuredTime ? measuredDistance / rawMeasuredTime : null;
  const averageVelocityMps =
    measuredDistance != null && measuredTime ? measuredDistance / measuredTime : null;
  let earlyAccelerationMps2: number | null = null;
  if (segmentVelocities.length >= 2) {
    const first = segmentVelocities[0];
    const second = segmentVelocities[1];
    const dt = first.timeS / 2 + second.timeS / 2;
    earlyAccelerationMps2 = (second.reportedVelocityMps - first.reportedVelocityMps) / dt;
  }

  const endTime = measuredDistance == null ? null : (crossing.get(measuredDistance) ?? null);
  const windows: { velocity: number; distance: number }[] = [];
  if (endTime != null) {
    for (const sample of series) {
      if (sample.t < startTime || sample.t > endTime) continue;
      const dxdt = slope(series.filter((point) => Math.abs(point.t - sample.t) <= 0.15));
      if (dxdt == null) continue;
      const velocity = (direction * dxdt) / Math.abs(normPerMeter);
      const distance = (direction * (sample.x - startX)) / Math.abs(normPerMeter);
      if (velocity > 0 && distance >= 0 && distance <= measuredDistance! + 0.5) {
        windows.push({ velocity, distance });
      }
    }
  }
  const fastest = [...windows].sort((a, b) => b.velocity - a.velocity).slice(0, 2);
  const rawPeakVelocity = fastest.length
    ? fastest.reduce((sum, item) => sum + item.velocity, 0) / fastest.length
    : null;
  // Regression-window peak velocity has no single distance/duration pair and is
  // retained as analytical-only until a reportable segment window exists.
  const peakVelocity = segmentVelocities.length
    ? Math.max(...segmentVelocities.map((segment) => segment.reportedVelocityMps))
    : null;
  const distanceToPeakVelocity = fastest[0]?.distance ?? null;
  const finishCrossingTime = crossing.get(calibration.finishDistanceM) ?? null;
  const rawRunTime = finishCrossingTime == null ? null : finishCrossingTime - startTime;
  const runTime = rawRunTime == null ? null : reportTimeSeconds(rawRunTime);
  if (finishCrossingTime == null) {
    const result = empty(
      "unavailable",
      `Torso/hip finish crossing at ${calibration.finishDistanceM} m could not be identified.`,
    );
    return { ...result, finishDistanceM: calibration.finishDistanceM };
  }
  const summary =
    segmentVelocities.length >= 2
      ? `Velocity progressed from ${segmentVelocities[0].velocityMps.toFixed(2)} to ${segmentVelocities.at(-1)!.velocityMps.toFixed(2)} m/s.`
      : segmentVelocities.length === 1
        ? `${segmentVelocities[0].endM} m measured in ${segmentVelocities[0].timeS.toFixed(2)} s.`
        : "No complete calibrated split was observed.";

  return {
    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,
    resultType: "acceleration",
    status: segmentVelocities.length
      ? startEvent.signal === "torso"
        ? "ready"
        : "ready_with_warning"
      : "unavailable",
    startEvent,
    splits: { m10S: split(10), m20S: split(20), m30S: split(30) },
    rawSplits: { m10S: rawSplit(10), m20S: rawSplit(20), m30S: rawSplit(30) },
    finishDistanceM: calibration.finishDistanceM,
    finishCrossingTime,
    runTime,
    rawRunTime,
    reportedRunTime: runTime,
    segmentVelocities,
    averageVelocityMps,
    rawAverageVelocityMps,
    reportedAverageVelocityMps: averageVelocityMps,
    earlyAccelerationMps2,
    peakVelocity,
    rawPeakVelocity,
    reportedPeakVelocity: peakVelocity,
    distanceToPeakVelocity,
    summary,
    warnings: [
      ...(startEvent.signal && startEvent.signal !== "torso"
        ? [`Start used the ${startEvent.signal} fallback signal.`]
        : []),
      ...(segmentVelocities.length ? [] : ["No complete calibrated split was observed."]),
    ],
    strideMetrics: {
      status: "unavailable",
      strideCount: null,
      averageStrideLengthM: null,
      reason:
        "Reliable acceleration foot-contact events were not available; stride values were not fabricated.",
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-marker Acceleration Analysis (Phase 2 of the MVP): splits at every
// calibrated marker, a step-by-step table, interval acceleration, asymmetry,
// conservative technical progression, and honest quality labeling. Reuses the
// torso-crossing helpers above; does NOT replace `computeAccelerationMetrics`,
// which remains the path for legacy single-finish-gate sessions.
// ---------------------------------------------------------------------------

export const ACCELERATION_ANALYSIS_SCHEMA_VERSION = "ava-acceleration-analysis-v2" as const;

export interface AccelerationSplit {
  distanceM: number;
  label: string;
  rawElapsedTimeS: number | null;
  elapsedTimeS: number | null;
  /** The smallest time increment the source video can resolve (1 / fps). */
  frameEquivalentTimeS: number;
  interpolationMethod: "torso_crossing_interpolation" | "spatial_reference_only";
  /** "interpolated" = sub-frame linear interpolation between two tracked samples found the crossing. */
  quality: "interpolated" | "unavailable";
}

export interface AccelerationIntervalMetric {
  startM: number;
  endM: number;
  timeS: number | null;
  velocityMps: number | null;
  accelerationMps2: number | null;
  quality: "observed" | "unavailable";
}

export interface AccelerationAsymmetry {
  leftStepAverageM: number | null;
  rightStepAverageM: number | null;
  stepLengthAsymmetryPct: number | null;
  leftStepFrequencyHz: number | null;
  rightStepFrequencyHz: number | null;
  leftStepSampleCount: number;
  rightStepSampleCount: number;
  earlyStepLengthAsymmetryPct: number | null;
  lateStepLengthAsymmetryPct: number | null;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
}

export interface AccelerationTechnicalProgression {
  trunkAngle: {
    status: "experimental" | "unavailable";
    samples: { stepNumber: number; distanceM: number; angleFromVerticalDeg: number }[];
    reason: string;
  };
}

export interface AccelerationQuality {
  fps: number;
  fpsAdequate: boolean;
  calibratedCoverageMinM: number;
  calibratedCoverageMaxM: number;
  markerCount: number;
  contactCount: number;
  startEventProvenance: "automatic" | "manual";
  startEventConfidence: number;
  warnings: string[];
}

export interface AccelerationAnalysis {
  schemaVersion: typeof ACCELERATION_ANALYSIS_SCHEMA_VERSION;
  status: "ready" | "ready_with_warning" | "needs_review" | "unavailable";
  startEvent: AccelerationStartEvent;
  /** Part 2.5 — the explicit Analysis Zone: where timing/calibration/contacts/
   *  steps/velocity/acceleration are all scoped to. Outside this range, no
   *  official metric is ever calculated. */
  analysisZone: { entryDistanceM: number; exitDistanceM: number };
  calibratedMarkers: { label: string; distanceM: number }[];
  /** Phase 3 (Part 4): the same calibrated zone scale used for step distances,
   *  exposed so `mechanicsPipeline.ts` converts touchdown offsets to meters
   *  via this exact value rather than re-deriving a second scale. */
  metersPerNormalizedUnit: number | null;
  splits: AccelerationSplit[];
  intervalMetrics: AccelerationIntervalMetric[];
  steps: AccelerationStepRow[];
  stepsStatus: "ready" | "insufficient_contacts" | "unavailable";
  stepsReason: string | null;
  peakVelocity: { velocityMps: number | null; distanceM: number | null; timeS: number | null };
  averageVelocityMps: number | null;
  asymmetries: AccelerationAsymmetry | null;
  /** Phase 2 (Parts 1-3): WHY-level analysis derived from `steps` — curves,
   *  per-step gains, smoothness, step-length-vs-frequency development, L/R
   *  contribution. Null only when there are no steps to analyze. */
  progression: ProgressionAnalysis | null;
  technicalProgression: AccelerationTechnicalProgression;
  quality: AccelerationQuality;
  summary: string;
  warnings: string[];
}

function trunkAngleDeg(frame: AccelerationFrame): number | null {
  const lm = frame.landmarks;
  if (!visible(lm.leftShoulder) || !visible(lm.rightShoulder) || !visible(lm.leftHip) || !visible(lm.rightHip)) {
    return null;
  }
  const shoulderX = (lm.leftShoulder.x + lm.rightShoulder.x) / 2;
  const shoulderY = (lm.leftShoulder.y + lm.rightShoulder.y) / 2;
  const hipX = (lm.leftHip.x + lm.rightHip.x) / 2;
  const hipY = (lm.leftHip.y + lm.rightHip.y) / 2;
  const dx = shoulderX - hipX;
  const dy = shoulderY - hipY; // image y grows downward; upright torso => dy strongly negative
  return (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
}

export function computeAccelerationAnalysis(input: {
  frames: AccelerationFrame[];
  poseSequence: PoseSequence;
  markers: AccelerationMarker[];
  travelDirection: AccelerationTravelDirection;
  manualStartOverride?: AccelerationStartOverride | null;
  fps: number;
}): AccelerationAnalysis {
  const sortedMarkers = [...input.markers].sort((a, b) => a.distanceM - b.distanceM);
  // The explicit Analysis Zone (Part 2.5): entry = lowest calibrated marker,
  // exit = highest — NOT required to be 0m. A 10-20m (or any arbitrary-range)
  // zone works identically, which is what lets one architecture cover 0-10m,
  // 5-15m, 10-20m, 20-30m, 30-40m, and a future fly zone.
  const zone = input.markers.length ? accelerationZoneFromMarkers(input.markers) : null;
  const startMarker = sortedMarkers[0];
  const lastMarker = sortedMarkers[sortedMarkers.length - 1];
  const analysisZone = { entryDistanceM: zone?.entryDistanceM ?? 0, exitDistanceM: zone?.exitDistanceM ?? 0 };
  const calibratedMarkers = sortedMarkers.map((m) => ({ label: formatMarkerDistanceLabel(m.distanceM), distanceM: m.distanceM }));
  const frameEquivalentTimeS = input.fps > 0 ? 1 / input.fps : 0;
  const hasValidZone = Boolean(startMarker && lastMarker && lastMarker.distanceM > startMarker.distanceM);
  const direction: 1 | -1 = hasValidZone
    ? ((Math.sign(lastMarker.point.x - startMarker.point.x) || (input.travelDirection === "left_to_right" ? 1 : -1)) as 1 | -1)
    : input.travelDirection === "left_to_right" ? 1 : -1;

  // Time Zero = first observable movement INSIDE the calibrated zone (never
  // the start of the recording, never movement detected anywhere else in the
  // clip) — this is what allows a clip to begin after the sprint is already
  // underway. See `detectZoneStartEvent`.
  const autoStart = hasValidZone
    ? detectZoneStartEvent(input.frames, startMarker.point, direction)
    : detectZoneStartEvent(input.frames, { x: 0, y: 0.5 }, direction);
  const startEvent = resolveAccelerationStartEvent(
    autoStart,
    input.manualStartOverride ?? null,
    input.frames,
  );

  const baseQuality = (warnings: string[]): AccelerationQuality => ({
    fps: input.fps,
    fpsAdequate: input.fps >= 60,
    calibratedCoverageMinM: startMarker?.distanceM ?? 0,
    calibratedCoverageMaxM: lastMarker?.distanceM ?? 0,
    markerCount: sortedMarkers.length,
    contactCount: 0,
    startEventProvenance: startEvent.provenance ?? "automatic",
    startEventConfidence: startEvent.confidence,
    warnings,
  });

  const empty = (
    status: "needs_review" | "unavailable",
    reason: string,
  ): AccelerationAnalysis => ({
    schemaVersion: ACCELERATION_ANALYSIS_SCHEMA_VERSION,
    status,
    startEvent,
    analysisZone,
    calibratedMarkers,
    metersPerNormalizedUnit: computeZoneScale(sortedMarkers)?.metersPerNormalizedUnit ?? null,
    splits: [],
    intervalMetrics: [],
    steps: [],
    stepsStatus: "unavailable",
    stepsReason: reason,
    peakVelocity: { velocityMps: null, distanceM: null, timeS: null },
    averageVelocityMps: null,
    asymmetries: null,
    progression: null,
    technicalProgression: {
      trunkAngle: { status: "unavailable", samples: [], reason: "Metrics were not computed." },
    },
    quality: baseQuality([reason]),
    summary: reason,
    warnings: [reason],
  });

  if (!hasValidZone || sortedMarkers.length < 2) {
    return empty("unavailable", "Calibrate at least two distance markers to define a zone.");
  }
  if (startEvent.type === NEEDS_REVIEW || startEvent.timestamp == null) {
    return empty("needs_review", `Start event needs review: ${startEvent.reason}`);
  }

  const series = input.frames.flatMap((frame) => {
    const x = torsoX(frame);
    return x == null ? [] : [{ t: frame.time, x }];
  });
  if (!series.length) return empty("unavailable", "No tracked torso positions were available.");

  const startTime = startEvent.timestamp;
  // Zone scoping (Part 2.5): a crossing search must never consult trajectory
  // data from BEFORE the Zone Start Event — the athlete may have crossed a
  // marker's pixel x-position earlier (e.g. warming up, or just being in the
  // frame before entering the zone), and that must never be mistaken for the
  // real in-zone crossing. Restricting the search window is both the fix and
  // the enforcement of "no official metrics are calculated outside the zone."
  const zoneSeries = series.filter((sample) => sample.t >= startTime);

  const crossing = new Map<number, number>();
  crossing.set(startMarker.distanceM, startTime);
  const splits: AccelerationSplit[] = [
    {
      distanceM: startMarker.distanceM,
      label: formatMarkerDistanceLabel(startMarker.distanceM),
      rawElapsedTimeS: 0,
      elapsedTimeS: 0,
      frameEquivalentTimeS,
      interpolationMethod: "spatial_reference_only",
      quality: "interpolated",
    },
  ];
  for (const marker of sortedMarkers.slice(1)) {
    const time = crossingTime(zoneSeries, marker.point.x, direction);
    const raw = time != null && time > startTime ? time - startTime : null;
    if (raw != null) crossing.set(marker.distanceM, time!);
    splits.push({
      distanceM: marker.distanceM,
      label: formatMarkerDistanceLabel(marker.distanceM),
      rawElapsedTimeS: raw,
      elapsedTimeS: raw == null ? null : reportTimeSeconds(raw),
      frameEquivalentTimeS,
      interpolationMethod: "torso_crossing_interpolation",
      quality: raw == null ? "unavailable" : "interpolated",
    });
  }

  const orderedDistances = sortedMarkers.map((m) => m.distanceM).filter((d) => crossing.has(d));
  const intervalMetrics: AccelerationIntervalMetric[] = [];
  for (let i = 1; i < orderedDistances.length; i++) {
    const startM = orderedDistances[i - 1];
    const endM = orderedDistances[i];
    const t0 = crossing.get(startM)!;
    const t1 = crossing.get(endM)!;
    const timeS = t1 - t0;
    if (timeS <= 0) {
      intervalMetrics.push({ startM, endM, timeS: null, velocityMps: null, accelerationMps2: null, quality: "unavailable" });
      continue;
    }
    const velocityMps = velocityFromReportedTime(endM - startM, timeS);
    intervalMetrics.push({
      startM,
      endM,
      timeS: reportTimeSeconds(timeS),
      velocityMps,
      accelerationMps2: null,
      quality: "observed",
    });
  }
  for (let i = 1; i < intervalMetrics.length; i++) {
    const prev = intervalMetrics[i - 1];
    const cur = intervalMetrics[i];
    if (prev.velocityMps == null || cur.velocityMps == null || prev.timeS == null || cur.timeS == null) continue;
    const dt = prev.timeS / 2 + cur.timeS / 2;
    cur.accelerationMps2 = dt > 0 ? (cur.velocityMps - prev.velocityMps) / dt : null;
  }

  const measuredDistance = orderedDistances.length ? orderedDistances[orderedDistances.length - 1] : 0;
  const endTime = crossing.get(measuredDistance) ?? null;
  const startX = startMarker.point.x;
  // Per-meter pixel scale over the ZONE'S OWN span (exit − entry), never the
  // exit marker's absolute distance from a true 0m origin — a 10-20m zone's
  // scale is (x20-x10)/10, not (x20-x10)/20. This bug was masked for every
  // 0m-starting zone tested so far and only surfaces for a non-zero entry.
  // Reuses `computeZoneScale` — the same calibration `mechanicsPipeline.ts`
  // (Phase 3) converts touchdown offsets to meters with.
  const zoneScale = computeZoneScale(sortedMarkers);
  const normPerMeter = zoneScale?.normPerMeter ?? (lastMarker.point.x - startX) / ((lastMarker.distanceM - startMarker.distanceM) || EPS);
  const windows: { velocity: number; distance: number; time: number }[] = [];
  if (endTime != null) {
    for (const sample of zoneSeries) {
      if (sample.t > endTime) continue;
      const dxdt = slope(zoneSeries.filter((point) => Math.abs(point.t - sample.t) <= 0.15));
      if (dxdt == null) continue;
      const velocity = (direction * dxdt) / Math.abs(normPerMeter || EPS);
      // Absolute distance (from the true 0m origin), matching `measuredDistance`
      // (also absolute) — comparing a zone-relative value against an absolute
      // bound here was the second half of the same masked bug.
      const distance = startMarker.distanceM + (direction * (sample.x - startX)) / Math.abs(normPerMeter || EPS);
      if (velocity > 0 && distance >= startMarker.distanceM && distance <= measuredDistance + 0.5) {
        windows.push({ velocity, distance, time: sample.t });
      }
    }
  }
  const fastest = [...windows].sort((a, b) => b.velocity - a.velocity).slice(0, 2);
  const peakVelocityMps = fastest.length
    ? fastest.reduce((sum, item) => sum + item.velocity, 0) / fastest.length
    : null;
  const peakVelocityDistanceM = fastest[0]?.distance ?? null;
  const peakVelocityTimeS = fastest[0]?.time ?? null;
  const rawAverageTime = endTime != null ? endTime - startTime : null;
  const averageVelocityMps =
    rawAverageTime != null && rawAverageTime > 0 && measuredDistance > 0
      ? velocityFromReportedTime(measuredDistance, rawAverageTime)
      : null;

  const stepsResult = computeAccelerationSteps(input.poseSequence, sortedMarkers, startTime);

  let asymmetries: AccelerationAsymmetry | null = null;
  if (stepsResult.zoneSummary) {
    const s = stepsResult.zoneSummary.summaries;
    const half = Math.ceil(stepsResult.steps.length / 2);
    const early = stepsResult.steps.slice(0, half);
    const late = stepsResult.steps.slice(half);
    const asymPct = (rows: AccelerationStepRow[]): number | null => {
      const left = rows.filter((r) => r.side === "left").map((r) => r.stepLengthM);
      const right = rows.filter((r) => r.side === "right").map((r) => r.stepLengthM);
      if (left.length < 1 || right.length < 1) return null;
      const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      const la = avg(left);
      const ra = avg(right);
      return Math.abs(la - ra) / Math.max(la, ra) * 100;
    };
    const earlyPct = asymPct(early);
    const latePct = asymPct(late);
    asymmetries = {
      leftStepAverageM: s.leftStepAverageM,
      rightStepAverageM: s.rightStepAverageM,
      stepLengthAsymmetryPct: s.stepLengthAsymmetryPct,
      leftStepFrequencyHz: s.leftStepFrequencyHz,
      rightStepFrequencyHz: s.rightStepFrequencyHz,
      leftStepSampleCount: s.leftStepSampleCount,
      rightStepSampleCount: s.rightStepSampleCount,
      earlyStepLengthAsymmetryPct: earlyPct,
      lateStepLengthAsymmetryPct: latePct,
      trend:
        earlyPct == null || latePct == null
          ? "insufficient_data"
          : Math.abs(latePct - earlyPct) < 1
            ? "stable"
            : latePct < earlyPct
              ? "improving"
              : "worsening",
    };
  }

  const trunkSamples: { stepNumber: number; distanceM: number; angleFromVerticalDeg: number }[] = [];
  for (const step of stepsResult.steps) {
    const frame = input.frames.find((f) => f.frame === step.contactFrame);
    const angle = frame ? trunkAngleDeg(frame) : null;
    if (angle != null) {
      trunkSamples.push({ stepNumber: step.stepNumber, distanceM: step.contactDistanceM, angleFromVerticalDeg: angle });
    }
  }

  const warnings: string[] = [];
  if (startEvent.provenance !== "manual" && startEvent.signal && startEvent.signal !== "torso") {
    warnings.push(`Start used the ${startEvent.signal} fallback signal.`);
  }
  if (input.fps < 60) warnings.push(`Recorded at ${input.fps} fps; splits below 60 fps carry wider uncertainty.`);
  if (stepsResult.status !== "ready") warnings.push(stepsResult.reason ?? "Step-by-step data is unavailable.");
  if (sortedMarkers.length < 3) warnings.push("Only two markers were calibrated; intermediate splits are unavailable.");

  const status: AccelerationAnalysis["status"] =
    intervalMetrics.some((m) => m.velocityMps != null)
      ? startEvent.provenance === "manual" || startEvent.signal === "torso"
        ? "ready"
        : "ready_with_warning"
      : "unavailable";

  const summary =
    intervalMetrics.length && intervalMetrics[0].velocityMps != null
      ? `Velocity progressed from ${intervalMetrics[0].velocityMps!.toFixed(2)} to ${intervalMetrics.at(-1)!.velocityMps?.toFixed(2) ?? "—"} m/s over ${measuredDistance} m.`
      : "No complete calibrated split was observed.";

  return {
    schemaVersion: ACCELERATION_ANALYSIS_SCHEMA_VERSION,
    status,
    startEvent,
    analysisZone,
    calibratedMarkers,
    metersPerNormalizedUnit: zoneScale?.metersPerNormalizedUnit ?? null,
    splits,
    intervalMetrics,
    steps: stepsResult.steps,
    stepsStatus: stepsResult.status,
    stepsReason: stepsResult.reason,
    peakVelocity: { velocityMps: peakVelocityMps, distanceM: peakVelocityDistanceM, timeS: peakVelocityTimeS },
    averageVelocityMps,
    asymmetries,
    progression: stepsResult.steps.length ? analyzeProgression(stepsResult.steps, asymmetries) : null,
    technicalProgression: {
      trunkAngle: trunkSamples.length
        ? { status: "experimental", samples: trunkSamples, reason: "Shoulder-hip lean angle; not a validated force/technique measure." }
        : { status: "unavailable", samples: [], reason: "No steps with visible shoulders and hips were available." },
    },
    quality: { ...baseQuality(warnings), contactCount: stepsResult.steps.length },
    summary,
    warnings,
  };
}
