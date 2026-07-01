import type { JointName, Keypoint, PoseFrame, PoseSequence } from "../pose";
import type { FrameAngles } from "./JointAngles";

/**
 * Computes joint and posture angles from canonical pose keypoints. Pure and
 * defensive: it never mutates the sequence, omits any angle whose keypoints are
 * missing or low-confidence, and returns `[]` on empty/sparse input.
 */
export interface AngleOptions {
  /** Ignore keypoints below this confidence. */
  minKeypointScore?: number;
  /** Decimal places to round angles to. */
  roundDegrees?: number;
  /** Emit a frame even when it has no computable angles (confidence 0). */
  requireAllAngles?: boolean;
}

const DEFAULTS: Required<AngleOptions> = {
  minKeypointScore: 0.4,
  roundDegrees: 1,
  requireAllAngles: false,
};

export interface Point {
  x: number;
  y: number;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Interior angle (degrees) at `b` formed by segments b→a and b→c. */
export function angleAtJointDeg(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  // Degenerate (coincident points) → NaN, not 0. Returning 0 here previously
  // injected spurious 0° angles that collapsed min-based metrics like peak knee
  // flexion toward zero.
  if (mag === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / mag));
  return Math.acos(cos) * RAD_TO_DEG;
}

/** Angle (degrees) of the line a→b relative to horizontal. */
export function lineAngleDeg(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * RAD_TO_DEG;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function averageConfidence(scores: number[]): number {
  return scores.length ? scores.reduce((acc, s) => acc + s, 0) / scores.length : 0;
}

/** Deviation of the hips→shoulders vector from vertical (forward lean positive). */
function trunkLeanFromVertical(hipMid: Point, shoulderMid: Point): number {
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y; // negative when shoulders are above the hips
  return Math.atan2(dx, -dy) * RAD_TO_DEG;
}

const roundTo = (n: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
};

/** The numeric angle fields of FrameAngles (everything except metadata). */
type AngleKey =
  | "leftKneeDeg"
  | "rightKneeDeg"
  | "leftHipDeg"
  | "rightHipDeg"
  | "leftAnkleDeg"
  | "rightAnkleDeg"
  | "trunkLeanDeg"
  | "shoulderTiltDeg"
  | "hipTiltDeg";

const THREE_POINT_ANGLES: { key: AngleKey; joints: [JointName, JointName, JointName] }[] = [
  { key: "leftKneeDeg", joints: ["left_hip", "left_knee", "left_ankle"] },
  { key: "rightKneeDeg", joints: ["right_hip", "right_knee", "right_ankle"] },
  { key: "leftHipDeg", joints: ["left_shoulder", "left_hip", "left_knee"] },
  { key: "rightHipDeg", joints: ["right_shoulder", "right_hip", "right_knee"] },
  { key: "leftAnkleDeg", joints: ["left_knee", "left_ankle", "left_toe"] },
  { key: "rightAnkleDeg", joints: ["right_knee", "right_ankle", "right_toe"] },
];

function computeFrameAngles(frame: PoseFrame, opts: Required<AngleOptions>): FrameAngles | null {
  const usable = (joint: JointName): Keypoint | null => {
    const kp = frame.keypoints[joint];
    return kp && kp.score >= opts.minKeypointScore ? kp : null;
  };
  const used = new Set<JointName>();
  const markUsed = (...joints: JointName[]) => joints.forEach((j) => used.add(j));

  const angles: Partial<Record<AngleKey, number>> = {};

  for (const { key, joints } of THREE_POINT_ANGLES) {
    const [a, b, c] = [usable(joints[0]), usable(joints[1]), usable(joints[2])];
    if (a && b && c) {
      const value = angleAtJointDeg(a, b, c);
      if (Number.isFinite(value)) {
        angles[key] = roundTo(value, opts.roundDegrees);
        markUsed(...joints);
      }
    }
  }

  const lh = usable("left_hip");
  const rh = usable("right_hip");
  const ls = usable("left_shoulder");
  const rs = usable("right_shoulder");

  if (lh && rh && ls && rs) {
    angles.trunkLeanDeg = roundTo(
      trunkLeanFromVertical(midpoint(lh, rh), midpoint(ls, rs)),
      opts.roundDegrees,
    );
    markUsed("left_hip", "right_hip", "left_shoulder", "right_shoulder");
  }
  if (ls && rs) {
    angles.shoulderTiltDeg = roundTo(lineAngleDeg(ls, rs), opts.roundDegrees);
    markUsed("left_shoulder", "right_shoulder");
  }
  if (lh && rh) {
    angles.hipTiltDeg = roundTo(lineAngleDeg(lh, rh), opts.roundDegrees);
    markUsed("left_hip", "right_hip");
  }

  const hasAngles = Object.keys(angles).length > 0;
  if (!hasAngles) {
    if (!opts.requireAllAngles) return null;
    return { frame: frame.index, tMs: frame.tMs, confidence: 0, source: "pose_geometry" };
  }

  const scores = [...used].map((joint) => frame.keypoints[joint]!.score);
  return {
    frame: frame.index,
    tMs: frame.tMs,
    ...angles,
    confidence: roundTo(averageConfidence(scores), 3),
    source: "pose_geometry",
  };
}

export function calculateFrameAngles(
  sequence: PoseSequence,
  options: AngleOptions = {},
): FrameAngles[] {
  const opts: Required<AngleOptions> = {
    minKeypointScore: options.minKeypointScore ?? DEFAULTS.minKeypointScore,
    roundDegrees: options.roundDegrees ?? DEFAULTS.roundDegrees,
    requireAllAngles: options.requireAllAngles ?? DEFAULTS.requireAllAngles,
  };

  if (!sequence?.frames || sequence.frames.length === 0) return [];

  const result: FrameAngles[] = [];
  for (const frame of sequence.frames) {
    const angles = computeFrameAngles(frame, opts);
    if (angles) result.push(angles);
  }
  return result;
}
