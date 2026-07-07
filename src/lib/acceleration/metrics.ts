import type { ManualCalibrationPoints } from "@/lib/calibration";
import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";
import { cameraOffsetAtTime, estimateCameraMotion } from "@/lib/video/camera";
import { detectHandLeaveGround, type HandLeaveGroundEvent } from "./startEvent";

export interface AccelerationSegment {
  startM: number;
  endM: number;
  timeS: number;
  averageVelocityMps: number;
}

export interface AccelerationMetrics {
  status: "ready" | "needs_review";
  startEvent: HandLeaveGroundEvent;
  split10mS: number | null;
  split20mS: number | null;
  split30mS: number | null;
  measuredDistanceM: number | null;
  averageVelocityMps: number | null;
  segments: AccelerationSegment[];
  /** Change in observed segment velocity over time; never assumes a zero-speed start. */
  earlyAccelerationMps2: number | null;
  peakVelocityMps: number | null;
  distanceToPeakVelocityM: number | null;
  summary: string;
  warnings: string[];
}

type Sample = { t: number; x: number };
const EPS = 1e-9;

function visible(point?: OverlayPoint): point is OverlayPoint {
  return !!point && (point.visibility ?? 1) >= 0.4;
}

function torsoX(frame: OverlayFrame): number | null {
  const midpoint = (a?: OverlayPoint, b?: OverlayPoint): number | null =>
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
    if (Math.abs(dx) < EPS) return a.t;
    return a.t + ((target - a.x) / dx) * (b.t - a.t);
  }
  return null;
}

function slope(samples: Sample[]): number | null {
  if (samples.length < 3) return null;
  const mt = samples.reduce((sum, p) => sum + p.t, 0) / samples.length;
  const mx = samples.reduce((sum, p) => sum + p.x, 0) / samples.length;
  const denom = samples.reduce((sum, p) => sum + (p.t - mt) ** 2, 0);
  if (denom < EPS) return null;
  return samples.reduce((sum, p) => sum + (p.t - mt) * (p.x - mx), 0) / denom;
}

export function computeAccelerationMetrics(
  frames: OverlayFrame[],
  calibration: ManualCalibrationPoints | null | undefined,
): AccelerationMetrics {
  const unavailable = (warning: string): AccelerationMetrics => ({
    status: "needs_review",
    startEvent: detectHandLeaveGround(frames),
    split10mS: null,
    split20mS: null,
    split30mS: null,
    measuredDistanceM: null,
    averageVelocityMps: null,
    segments: [],
    earlyAccelerationMps2: null,
    peakVelocityMps: null,
    distanceToPeakVelocityM: null,
    summary: "Acceleration metrics need a calibrated start gate and measured zone.",
    warnings: [warning],
  });
  if (!calibration || calibration.distanceM <= 0 || frames.length < 3) {
    return unavailable(
      "Set start and finish gates with a known distance to measure acceleration splits.",
    );
  }

  const startEvent = detectHandLeaveGround(frames);
  if (startEvent.status !== "detected" || startEvent.timeS == null) {
    return unavailable(`Acceleration start needs review: ${startEvent.reason}`);
  }

  const camera = estimateCameraMotion(frames);
  const worldX = (x: number, t: number) => x + cameraOffsetAtTime(camera, t).x;
  const gateStartX = worldX(calibration.ax, calibration.aTimeS ?? frames[0].time);
  const finishX = worldX(calibration.bx, calibration.bTimeS ?? frames.at(-1)!.time);
  const span = finishX - gateStartX;
  if (Math.abs(span) < EPS)
    return unavailable("The calibrated gates do not define a usable travel distance.");
  const direction = Math.sign(span);
  const normPerMeter = span / calibration.distanceM;
  const series = frames.flatMap((frame) => {
    const x = torsoX(frame);
    return x == null ? [] : [{ t: frame.time, x: worldX(x, frame.time) }];
  });
  if (!series.length)
    return unavailable("No tracked torso positions were available after hand release.");
  // Official acceleration t=0 is HAND_LEAVE_GROUND. Torso position is sampled at
  // that timestamp only to establish the spatial 0 m origin; it never defines time 0.
  const startTime = startEvent.timeS;
  const startSample = series.reduce((best, sample) =>
    Math.abs(sample.t - startTime) < Math.abs(best.t - startTime) ? sample : best,
  );
  const startX = startSample.x;

  const splitDistances = [10, 20, 30].filter((d) => d <= calibration.distanceM + EPS);
  const crossings = new Map<number, number>();
  for (const distance of splitDistances) {
    const time = crossingTime(series, startX + normPerMeter * distance, direction);
    if (time != null && time > startTime) crossings.set(distance, time);
  }
  const split = (distance: number) => {
    const time = crossings.get(distance);
    return time == null ? null : time - startTime;
  };

  const segments: AccelerationSegment[] = [];
  let priorDistance = 0;
  let priorTime = startTime;
  for (const distance of splitDistances) {
    const time = crossings.get(distance);
    if (time == null) break;
    const duration = time - priorTime;
    if (duration > 0) {
      segments.push({
        startM: priorDistance,
        endM: distance,
        timeS: duration,
        averageVelocityMps: (distance - priorDistance) / duration,
      });
    }
    priorDistance = distance;
    priorTime = time;
  }

  const measuredDistanceM = segments.at(-1)?.endM ?? null;
  const measuredTime = measuredDistanceM == null ? null : split(measuredDistanceM);
  const averageVelocityMps =
    measuredDistanceM != null && measuredTime ? measuredDistanceM / measuredTime : null;

  let earlyAccelerationMps2: number | null = null;
  if (segments.length >= 2) {
    const first = segments[0];
    const second = segments[1];
    const firstMid = startTime + first.timeS / 2;
    const secondMid = startTime + first.timeS + second.timeS / 2;
    earlyAccelerationMps2 =
      (second.averageVelocityMps - first.averageVelocityMps) / (secondMid - firstMid);
  }

  const zoneEndTime = measuredDistanceM == null ? null : (crossings.get(measuredDistanceM) ?? null);
  const velocityWindows: { velocity: number; distance: number }[] = [];
  if (zoneEndTime != null) {
    for (const sample of series) {
      if (sample.t < startTime || sample.t > zoneEndTime) continue;
      const local = series.filter((p) => Math.abs(p.t - sample.t) <= 0.15);
      const dxdt = slope(local);
      if (dxdt == null) continue;
      const velocity = (direction * dxdt) / Math.abs(normPerMeter);
      const distance = (direction * (sample.x - startX)) / Math.abs(normPerMeter);
      if (velocity > 0 && distance >= 0 && distance <= measuredDistanceM! + 0.5) {
        velocityWindows.push({ velocity, distance });
      }
    }
  }
  const fastest = [...velocityWindows].sort((a, b) => b.velocity - a.velocity).slice(0, 2);
  const peakVelocityMps = fastest.length
    ? fastest.reduce((sum, p) => sum + p.velocity, 0) / fastest.length
    : null;
  const distanceToPeakVelocityM = fastest[0]?.distance ?? null;

  let summary = "Acceleration profile is incomplete.";
  if (segments.length >= 2) {
    const first = segments[0].averageVelocityMps;
    const last = segments.at(-1)!.averageVelocityMps;
    summary =
      last > first
        ? `Velocity progressed from ${first.toFixed(2)} to ${last.toFixed(2)} m/s across the measured segments.`
        : `Velocity did not increase across the measured segments (${first.toFixed(2)} to ${last.toFixed(2)} m/s).`;
  } else if (segments.length === 1) {
    summary = `${segments[0].endM} m measured in ${segments[0].timeS.toFixed(2)} s.`;
  }

  return {
    status: "ready",
    startEvent,
    split10mS: split(10),
    split20mS: split(20),
    split30mS: split(30),
    measuredDistanceM,
    averageVelocityMps,
    segments,
    earlyAccelerationMps2,
    peakVelocityMps,
    distanceToPeakVelocityM,
    summary,
    warnings: camera.warning ? [camera.warning] : [],
  };
}
