import type { AccelerationFrame, AccelerationPoint } from "./types";

export const FIRST_DETECTED_MOVEMENT = "FIRST_DETECTED_MOVEMENT" as const;
export const NEEDS_REVIEW = "NEEDS_REVIEW" as const;
export type MovementSignal = "torso" | "shoulder" | "wrist" | "pose_anchor";

export interface MovementCandidateDebug {
  frame: number | null;
  timestamp: number | null;
  passed: boolean;
  reason: string;
}

export interface AccelerationStartEvent {
  type: typeof FIRST_DETECTED_MOVEMENT | typeof NEEDS_REVIEW;
  signal: MovementSignal | null;
  frame: number | null;
  timestamp: number | null;
  confidence: number;
  reason: string;
  debug: { candidates: Record<MovementSignal, MovementCandidateDebug> };
}

const SIGNALS: MovementSignal[] = ["torso", "shoulder", "wrist", "pose_anchor"];
const visible = (point?: AccelerationPoint): point is AccelerationPoint =>
  !!point && (point.visibility ?? 1) >= 0.35;
const meanPoint = (points: AccelerationPoint[]) =>
  points.length
    ? {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      }
    : null;
const failed = (reason: string): MovementCandidateDebug => ({
  frame: null,
  timestamp: null,
  passed: false,
  reason,
});

type SignalSample = {
  frame: AccelerationFrame;
  point: { x: number; y: number };
  scale: number;
  confidence: number;
};

function frameScale(frame: AccelerationFrame): number {
  const values = Object.values(frame.landmarks).filter(visible);
  if (values.length < 2) return 0.35;
  return Math.max(
    0.1,
    Math.max(...values.map((point) => point.y)) - Math.min(...values.map((point) => point.y)),
  );
}

function signalPoint(frame: AccelerationFrame, signal: MovementSignal) {
  const lm = frame.landmarks;
  const hips = [lm.leftHip, lm.rightHip].filter(visible);
  const shoulders = [lm.leftShoulder, lm.rightShoulder].filter(visible);
  const wrists = [lm.leftWrist, lm.rightWrist].filter(visible);
  if (signal === "torso") return hips.length === 2 ? meanPoint(hips) : frame.centerOfMass;
  if (signal === "shoulder") return shoulders.length === 2 ? meanPoint(shoulders) : null;
  if (signal === "wrist") {
    const wrist = meanPoint(wrists);
    if (!wrist) return null;
    const anchor = meanPoint([...hips, ...shoulders]);
    return anchor ? { x: wrist.x - anchor.x, y: wrist.y - anchor.y } : wrist;
  }
  return meanPoint(Object.values(lm).filter(visible));
}

function track(frames: AccelerationFrame[], signal: MovementSignal): SignalSample[] {
  return frames.flatMap((frame) => {
    const point = signalPoint(frame, signal);
    if (!point) return [];
    const used = Object.values(frame.landmarks).filter(visible);
    const confidence = used.length
      ? used.reduce((sum, item) => sum + (item.visibility ?? 1), 0) / used.length
      : 0.45;
    return [{ frame, point, scale: frameScale(frame), confidence }];
  });
}

function assess(frames: AccelerationFrame[], signal: MovementSignal) {
  const samples = track(frames, signal);
  if (samples.length < 5) {
    return {
      event: null,
      debug: failed(`Only ${samples.length} usable ${signal} frames were found.`),
    };
  }
  const baselineCount = Math.min(5, Math.max(3, Math.floor(samples.length * 0.06)));
  const baseline = meanPoint(samples.slice(0, baselineCount).map((sample) => sample.point))!;
  let earliest: SignalSample | null = null;
  for (let i = baselineCount; i + 1 < samples.length; i++) {
    const window = samples.slice(i, i + 3);
    const moved = window.map((sample) => {
      const displacement = Math.hypot(sample.point.x - baseline.x, sample.point.y - baseline.y);
      const factor = signal === "wrist" ? 0.014 : signal === "pose_anchor" ? 0.012 : 0.016;
      return displacement >= Math.max(0.0045, sample.scale * factor);
    });
    if (moved[0]) earliest ??= window[0];
    if (!moved[0] || !moved[1] || (moved.length === 3 && !moved[2])) continue;
    const sample = window[0];
    const signalBase = signal === "torso" ? 0.62 : signal === "shoulder" ? 0.57 : 0.5;
    const confidence = Math.min(0.92, signalBase + sample.confidence * 0.28);
    const reason = `${signal} displacement exceeded the normalized set-position threshold for consecutive frames.`;
    return {
      event: {
        type: FIRST_DETECTED_MOVEMENT as typeof FIRST_DETECTED_MOVEMENT,
        signal,
        frame: sample.frame.frame,
        timestamp: sample.frame.time,
        confidence,
        reason,
      },
      debug: { frame: sample.frame.frame, timestamp: sample.frame.time, passed: true, reason },
    };
  }
  const reason = `No sustained ${signal} displacement exceeded its jitter threshold.`;
  return {
    event: null,
    debug: earliest
      ? { frame: earliest.frame.frame, timestamp: earliest.frame.time, passed: false, reason }
      : failed(reason),
  };
}

/** Official t0 with torso → shoulder → wrist → generic-anchor fallbacks. */
export function detectAccelerationStartEvent(frames: AccelerationFrame[]): AccelerationStartEvent {
  const candidates = Object.fromEntries(
    SIGNALS.map((signal) => [signal, failed("Not evaluated.")]),
  ) as Record<MovementSignal, MovementCandidateDebug>;
  for (const signal of SIGNALS) {
    const result = assess(frames, signal);
    candidates[signal] = result.debug;
    if (result.event) return { ...result.event, debug: { candidates } };
  }
  return {
    type: NEEDS_REVIEW,
    signal: null,
    frame: null,
    timestamp: null,
    confidence: 0,
    reason: "No reliable pose signal showed sustained movement from a usable baseline.",
    debug: { candidates },
  };
}
