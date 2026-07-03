/**
 * Step marks (Day 56) — turning foot contacts into visible, ordered step
 * landmarks for the overlay.
 *
 * This is a *visualization* helper, not a biomechanics metric. It detects ground
 * contacts directly from the overlay's foot landmarks (the stored pose artifact
 * carries no contact events), assigns each a chronological step index, and
 * measures the gap to the previous contact in **normalized image units**. That
 * gap is an uncalibrated visual estimate — there is no pixel-to-metre scale yet,
 * so callers must not present it as a real-world distance. It is the foundation
 * for step distance, stride length, and (once calibration lands) real velocity.
 *
 * The contact heuristic mirrors the worker-side {@link detectFootContacts}:
 * per foot, build a y-trajectory from the foot keypoints (image y grows
 * downward, so the lowest foot point is a local maximum), smooth it, and take
 * spaced local maxima as contacts. The pure array helpers are reused from there;
 * no biomechanics code is modified.
 */

import { smoothSeries, findLocalMaxima } from "@/lib/biomechanics/events/FootContactDetector";
import type { OverlayFrame, OverlayPoint } from "./overlay";

export type StepSide = "left" | "right";

/** One detected ground contact, ready to draw as a step landmark. */
export interface StepMark {
  side: StepSide;
  /** OverlayFrame.frame index of the contact. */
  frame: number;
  /** Contact time in seconds. */
  time: number;
  /** Normalized foot position at contact (image space, 0..1). */
  x: number;
  y: number;
  /** 1-based chronological step number across both feet. */
  index: number;
  /**
   * Distance to the previous step in normalized image units — an UNCALIBRATED
   * estimate (no real-world scale). `null` for the first step.
   */
  distanceFromPrev: number | null;
}

export interface StepDetectionConfig {
  /** Ignore foot keypoints below this visibility. */
  minVisibility: number;
  /** Moving-average window (frames) applied to the foot y-trajectory. */
  smoothingWindowFrames: number;
  /** Minimum time between consecutive contacts on one foot. */
  minContactSpacingMs: number;
  /** Below this normalized y-range the foot barely moves — no reliable contacts. */
  minAmplitude: number;
}

export const DEFAULT_STEP_CONFIG: StepDetectionConfig = {
  minVisibility: 0.4,
  smoothingWindowFrames: 3,
  minContactSpacingMs: 120,
  minAmplitude: 0.01,
};

/** Overlay landmark keys per foot (ankle/heel/toe), lowest = ground contact. */
const SIDE_FOOT_JOINTS: Record<StepSide, string[]> = {
  left: ["leftAnkle", "leftHeel", "leftFootIndex"],
  right: ["rightAnkle", "rightHeel", "rightFootIndex"],
};

const MIN_VALID_FRAMES = 3;

/** Mean position of the usable foot keypoints in a frame, or null. */
function footSample(frame: OverlayFrame, joints: string[], minVis: number): OverlayPoint | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const joint of joints) {
    const p = frame.landmarks[joint];
    if (p && (p.visibility ?? 1) >= minVis) {
      sx += p.x;
      sy += p.y;
      n += 1;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : null;
}

interface RawContact {
  side: StepSide;
  frame: number;
  time: number;
  x: number;
  y: number;
}

function detectSide(
  frames: OverlayFrame[],
  side: StepSide,
  cfg: StepDetectionConfig,
): RawContact[] {
  const joints = SIDE_FOOT_JOINTS[side];
  const samples = frames.map((f) => footSample(f, joints, cfg.minVisibility));
  const ys = samples.map((s) => (s ? s.y : NaN));
  if (ys.filter(Number.isFinite).length < MIN_VALID_FRAMES) return [];

  const smoothed = smoothSeries(ys, cfg.smoothingWindowFrames);
  const finite = smoothed.filter((v): v is number => Number.isFinite(v));
  if (finite.length < MIN_VALID_FRAMES) return [];
  const amplitude = Math.max(...finite) - Math.min(...finite);
  if (amplitude < cfg.minAmplitude) return [];

  const contacts: RawContact[] = [];
  let lastMs = -Infinity;
  for (const idx of findLocalMaxima(smoothed)) {
    const time = frames[idx].time;
    if (time * 1000 - lastMs < cfg.minContactSpacingMs) continue;
    // Position the mark from the actual keypoints at contact (fall back to any
    // visible foot point regardless of confidence so the mark isn't dropped).
    const pos = samples[idx] ?? footSample(frames[idx], joints, 0);
    if (!pos) continue;
    lastMs = time * 1000;
    contacts.push({ side, frame: frames[idx].frame, time, x: pos.x, y: pos.y });
  }
  return contacts;
}

/**
 * Detect ordered step marks across an overlay sequence. Both feet are merged and
 * sorted chronologically; each mark carries its step index and the uncalibrated
 * normalized distance to the previous mark. Returns `[]` when data is too sparse.
 */
export function detectStepMarks(
  frames: OverlayFrame[],
  config: StepDetectionConfig = DEFAULT_STEP_CONFIG,
): StepMark[] {
  if (!frames || frames.length < MIN_VALID_FRAMES) return [];

  const raw = [...detectSide(frames, "left", config), ...detectSide(frames, "right", config)].sort(
    (a, b) => a.time - b.time || a.side.localeCompare(b.side),
  );

  return raw.map((mark, i) => ({
    ...mark,
    index: i + 1,
    distanceFromPrev:
      i > 0 ? Math.hypot(mark.x - raw[i - 1].x, mark.y - raw[i - 1].y) : null,
  }));
}
