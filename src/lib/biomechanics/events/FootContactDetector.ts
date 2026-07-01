import type { JointName, PoseFrame, PoseSequence } from "../pose";
import type { GaitEvent, GaitSide } from "./GaitEvents";

/**
 * First-pass, explainable foot-contact / toe-off detector.
 *
 * Heuristic (per foot): build a foot y-position trajectory from the toe/heel/
 * ankle keypoints, smooth it lightly, then — because image y increases downward
 * — treat local maxima (the lowest point of the foot) as ground contacts, and
 * the subsequent clear upward movement as toe-off. It is deliberately simple and
 * robust to missing/sparse data: it returns `[]` rather than throwing when there
 * isn't enough usable signal. This is NOT the final scientific model.
 */
export interface FootContactOptions {
  /** Ignore keypoints below this confidence. */
  minKeypointScore?: number;
  /** Moving-average window (in frames) applied to the foot trajectory. */
  smoothingWindowFrames?: number;
  /** Minimum time between consecutive contacts on one foot. */
  minContactSpacingMs?: number;
  /** How far after a contact to look for the matching toe-off. */
  toeOffSearchWindowMs?: number;
  // --- calibration knobs (Milestone 3 benchmark tuning) ---
  /** Fraction of the foot's y-range it must rise past a contact to register toe-off. */
  contactReleaseThreshold?: number;
  /** Minimum upward velocity (normalized y per frame) confirming the foot is rising. */
  minToeOffVelocity?: number;
  /** Hard cap on ground-contact duration; toe-off is forced by here. */
  maxGroundContactMs?: number;
  /** Advisory minimum plausible flight time (enforced by downstream flight metrics). */
  minFlightTimeMs?: number;
  /** Minimum ground-contact floor / event debounce, so toe-off can't fire instantly. */
  eventDebounceMs?: number;
}

const DEFAULT_OPTIONS: Required<FootContactOptions> = {
  minKeypointScore: 0.4,
  smoothingWindowFrames: 3,
  minContactSpacingMs: 120,
  toeOffSearchWindowMs: 250,
  contactReleaseThreshold: 0.05,
  minToeOffVelocity: 0.001,
  maxGroundContactMs: 110,
  minFlightTimeMs: 60,
  eventDebounceMs: 45,
};

/** Minimum usable frames on a side before we attempt detection. */
const MIN_VALID_FRAMES = 3;
/** Below this normalized y range the foot barely moves — no reliable events. */
const MIN_AMPLITUDE = 0.01;
/** Absolute floor on the release displacement (guards tiny-amplitude noise). */
const TOEOFF_RELEASE_FLOOR = 0.004;

const SIDE_FOOT_JOINTS: Record<GaitSide, JointName[]> = {
  left: ["left_toe", "left_heel", "left_ankle"],
  right: ["right_toe", "right_heel", "right_ankle"],
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Light moving-average smoothing that ignores NaN gaps. */
export function smoothSeries(values: number[], windowFrames: number): number[] {
  if (windowFrames <= 1) return values.slice();
  const half = Math.floor(windowFrames / 2);
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      const v = values[j];
      if (j >= 0 && j < values.length && Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    return count > 0 ? sum / count : NaN;
  });
}

/** Indices that are local maxima (peaks), skipping NaN neighbourhoods and flat plateaus. */
export function findLocalMaxima(values: number[]): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    const next = values[i + 1];
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || !Number.isFinite(next)) continue;
    if (cur >= prev && cur >= next && (cur > prev || cur > next)) peaks.push(i);
  }
  return peaks;
}

/** Representative foot y (and mean confidence) for one frame, or null if unusable. */
function footSample(
  frame: PoseFrame,
  joints: JointName[],
  minScore: number,
): { y: number; conf: number } | null {
  let ySum = 0;
  let confSum = 0;
  let count = 0;
  for (const joint of joints) {
    const kp = frame.keypoints[joint];
    if (kp && kp.score >= minScore) {
      ySum += kp.y;
      confSum += kp.score;
      count += 1;
    }
  }
  if (count === 0) return null;
  return { y: ySum / count, conf: confSum / count };
}

function makeToeOff(frame: number, tMs: number, side: GaitSide, confs: number[]): GaitEvent {
  return { frame, tMs, side, type: "toe_off", confidence: round3(confs[frame]), source: "pose_heuristic" };
}

/**
 * Toe-off = the onset of upward foot movement after a contact, not a large
 * displacement later. The foot must (a) be past the debounce/min-GC floor,
 * (b) be clearly rising (velocity + a small release displacement), and it is
 * capped at `maxGroundContactMs`. This fires much earlier than the old 15%-rise
 * rule, shrinking exaggerated ground-contact times and lengthening flight.
 */
function findToeOff(
  smoothed: number[],
  confs: number[],
  frames: PoseFrame[],
  contactIdx: number,
  side: GaitSide,
  amplitude: number,
  opts: Required<FootContactOptions>,
): GaitEvent | null {
  const peakY = smoothed[contactIdx];
  const startMs = frames[contactIdx].tMs;
  const releaseThreshold = Math.max(opts.contactReleaseThreshold * amplitude, TOEOFF_RELEASE_FLOOR);
  const windowMs = Math.min(opts.toeOffSearchWindowMs, opts.maxGroundContactMs);
  let capFrame = -1; // latest in-window frame, used to cap GC if no clear lift-off

  for (let f = contactIdx + 1; f < smoothed.length; f++) {
    const dt = frames[f].tMs - startMs;
    if (dt > windowMs) break;
    const y = smoothed[f];
    const prev = smoothed[f - 1];
    if (!Number.isFinite(y) || !Number.isFinite(prev)) continue;
    if (dt < opts.eventDebounceMs) continue; // enforce a minimum ground-contact floor
    capFrame = f;
    const velocityUp = prev - y; // > 0 when the foot rises (image y decreasing)
    if (
      velocityUp >= opts.minToeOffVelocity &&
      peakY - y >= releaseThreshold &&
      confs[f] >= opts.minKeypointScore
    ) {
      return makeToeOff(f, frames[f].tMs, side, confs);
    }
  }

  // No decisive lift-off within the window → cap ground contact at the window.
  return capFrame >= 0 ? makeToeOff(capFrame, frames[capFrame].tMs, side, confs) : null;
}

function detectSide(
  frames: PoseFrame[],
  side: GaitSide,
  opts: Required<FootContactOptions>,
): GaitEvent[] {
  const joints = SIDE_FOOT_JOINTS[side];
  const ys = new Array<number>(frames.length).fill(NaN);
  const confs = new Array<number>(frames.length).fill(0);
  let valid = 0;
  for (let i = 0; i < frames.length; i++) {
    const sample = footSample(frames[i], joints, opts.minKeypointScore);
    if (sample) {
      ys[i] = sample.y;
      confs[i] = sample.conf;
      valid += 1;
    }
  }
  if (valid < MIN_VALID_FRAMES) return [];

  const smoothed = smoothSeries(ys, opts.smoothingWindowFrames);
  const finite = smoothed.filter((v): v is number => Number.isFinite(v));
  if (finite.length < MIN_VALID_FRAMES) return [];
  const amplitude = Math.max(...finite) - Math.min(...finite);
  if (amplitude < MIN_AMPLITUDE) return [];

  const events: GaitEvent[] = [];
  let lastContactMs = -Infinity;
  for (const idx of findLocalMaxima(smoothed)) {
    const tMs = frames[idx].tMs;
    if (tMs - lastContactMs < opts.minContactSpacingMs) continue;
    lastContactMs = tMs;
    events.push({ frame: idx, tMs, side, type: "contact", confidence: round3(confs[idx]), source: "pose_heuristic" });
    const toeOff = findToeOff(smoothed, confs, frames, idx, side, amplitude, opts);
    if (toeOff) events.push(toeOff);
  }
  return events;
}

/**
 * Detect approximate foot contacts and toe-offs across a pose sequence.
 * Returns a time-sorted `GaitEvent[]`; empty when data is missing or too sparse.
 */
export function detectFootContacts(
  sequence: PoseSequence,
  options: FootContactOptions = {},
): GaitEvent[] {
  const opts: Required<FootContactOptions> = {
    minKeypointScore: options.minKeypointScore ?? DEFAULT_OPTIONS.minKeypointScore,
    smoothingWindowFrames: options.smoothingWindowFrames ?? DEFAULT_OPTIONS.smoothingWindowFrames,
    minContactSpacingMs: options.minContactSpacingMs ?? DEFAULT_OPTIONS.minContactSpacingMs,
    toeOffSearchWindowMs: options.toeOffSearchWindowMs ?? DEFAULT_OPTIONS.toeOffSearchWindowMs,
    contactReleaseThreshold: options.contactReleaseThreshold ?? DEFAULT_OPTIONS.contactReleaseThreshold,
    minToeOffVelocity: options.minToeOffVelocity ?? DEFAULT_OPTIONS.minToeOffVelocity,
    maxGroundContactMs: options.maxGroundContactMs ?? DEFAULT_OPTIONS.maxGroundContactMs,
    minFlightTimeMs: options.minFlightTimeMs ?? DEFAULT_OPTIONS.minFlightTimeMs,
    eventDebounceMs: options.eventDebounceMs ?? DEFAULT_OPTIONS.eventDebounceMs,
  };

  if (!sequence?.frames || sequence.frames.length < MIN_VALID_FRAMES) return [];

  const events: GaitEvent[] = [
    ...detectSide(sequence.frames, "left", opts),
    ...detectSide(sequence.frames, "right", opts),
  ];
  events.sort((a, b) => a.tMs - b.tMs || a.side.localeCompare(b.side));
  return events;
}
