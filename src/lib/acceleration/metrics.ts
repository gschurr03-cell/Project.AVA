import {
  detectAccelerationStartEvent,
  NEEDS_REVIEW,
  type AccelerationStartEvent,
} from "./startEvent";
import type { AccelerationCalibration, AccelerationFrame, AccelerationPoint } from "./types";

export interface AccelerationSegmentVelocity {
  startM: number;
  endM: number;
  timeS: number;
  velocityMps: number;
}

export interface AccelerationMetrics {
  resultType: "acceleration";
  status: "ready" | "ready_with_warning" | "needs_review" | "unavailable";
  startEvent: AccelerationStartEvent;
  splits: { m10S: number | null; m20S: number | null; m30S: number | null };
  finishDistanceM: number | null;
  finishCrossingTime: number | null;
  runTime: number | null;
  segmentVelocities: AccelerationSegmentVelocity[];
  averageVelocityMps: number | null;
  earlyAccelerationMps2: number | null;
  peakVelocity: number | null;
  distanceToPeakVelocity: number | null;
  summary: string;
  warnings: string[];
  strideMetrics: {
    status: "ready" | "needs_review" | "unavailable";
    strideCount: number | null;
    averageStrideLengthM: number | null;
    reason: string;
  };
}

type Sample = { t: number; x: number };
const EPS = 1e-9;

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
    resultType: "acceleration",
    status,
    startEvent,
    splits: { m10S: null, m20S: null, m30S: null },
    finishDistanceM: calibration?.finishDistanceM ?? null,
    finishCrossingTime: null,
    runTime: null,
    segmentVelocities: [],
    averageVelocityMps: null,
    earlyAccelerationMps2: null,
    peakVelocity: null,
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
  const split = (distance: number) => {
    const time = crossing.get(distance);
    return time == null ? null : time - startTime;
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
        timeS: duration,
        velocityMps: (distance - priorDistance) / duration,
      });
    }
    priorDistance = distance;
    priorTime = time;
  }

  const measuredDistance = segmentVelocities.at(-1)?.endM ?? null;
  const measuredTime = measuredDistance == null ? null : split(measuredDistance);
  const averageVelocityMps =
    measuredDistance != null && measuredTime ? measuredDistance / measuredTime : null;
  let earlyAccelerationMps2: number | null = null;
  if (segmentVelocities.length >= 2) {
    const first = segmentVelocities[0];
    const second = segmentVelocities[1];
    const dt = first.timeS / 2 + second.timeS / 2;
    earlyAccelerationMps2 = (second.velocityMps - first.velocityMps) / dt;
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
  const peakVelocity = fastest.length
    ? fastest.reduce((sum, item) => sum + item.velocity, 0) / fastest.length
    : null;
  const distanceToPeakVelocity = fastest[0]?.distance ?? null;
  const finishCrossingTime = crossing.get(calibration.finishDistanceM) ?? null;
  const runTime = finishCrossingTime == null ? null : finishCrossingTime - startTime;
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
    resultType: "acceleration",
    status: segmentVelocities.length
      ? startEvent.signal === "torso"
        ? "ready"
        : "ready_with_warning"
      : "unavailable",
    startEvent,
    splits: { m10S: split(10), m20S: split(20), m30S: split(30) },
    finishDistanceM: calibration.finishDistanceM,
    finishCrossingTime,
    runTime,
    segmentVelocities,
    averageVelocityMps,
    earlyAccelerationMps2,
    peakVelocity,
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
