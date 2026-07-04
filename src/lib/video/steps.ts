/**
 * Step marks (Day 56, corrected Day 61) — turning foot contacts into visible,
 * ordered step landmarks for the overlay.
 *
 * This is a *visualization* helper, not a biomechanics metric. It detects ground
 * contacts directly from the overlay's foot landmarks (the stored pose artifact
 * carries no contact events), assigns each a chronological step index, and
 * measures the gap to the previous contact.
 *
 * A "step" here means exactly **one true ground contact by one foot**. The Day 61
 * corrections make that guarantee hold on real footage:
 *   1. Per foot, one contact can only be counted once per stride (a foot cannot
 *      re-strike faster than {@link StepDetectionConfig.minSameSideSpacingMs}).
 *   2. After both feet are merged, a global de-duplication pass drops any second
 *      mark that lands within {@link StepDetectionConfig.minStepSpacingMs} of the
 *      one before it, keeping the more prominent (deeper, better-tracked) contact.
 *      This kills the "too many steps" doubles and biases the result toward a
 *      natural left → right → left → right alternation.
 *
 * Distance: each mark carries the gap to the previous contact in **normalized
 * image units** (`distanceFromPrev`, always available but unitless) and, once a
 * calibration scale is supplied via {@link applyRealWorldStepDistances}, the same
 * gap in **metres** (`distanceMetersFromPrev`). Step distance is a *spatial* gap
 * between contacts — it is deliberately separate from contact time and flight
 * time, which are temporal metrics and must never be shown in its place.
 *
 * The contact heuristic mirrors the worker-side {@link detectFootContacts}:
 * per foot, build a y-trajectory from the foot keypoints (image y grows
 * downward, so the lowest foot point is a local maximum), smooth it, and take
 * spaced local maxima as contacts. The pure array helpers are reused from there;
 * no biomechanics code is modified.
 */

import { smoothSeries, findLocalMaxima } from "@/lib/biomechanics/events/FootContactDetector";
import type { OverlayFrame } from "./overlay";

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
  /**
   * Distance to the previous step in **metres**, or `null` when there is no
   * calibration scale (see {@link applyRealWorldStepDistances}) or for the first
   * step. This is a spatial gap between contacts — never a time.
   */
  distanceMetersFromPrev: number | null;
}

export interface StepDetectionConfig {
  /** Ignore foot keypoints below this visibility. */
  minVisibility: number;
  /** Moving-average window (frames) applied to the foot y-trajectory. */
  smoothingWindowFrames: number;
  /**
   * Minimum time between consecutive contacts **on one foot**. A single foot
   * only strikes once per stride, so this is generous — it suppresses a single
   * contact registering as several nearby maxima.
   */
  minSameSideSpacingMs: number;
  /**
   * Minimum time between any two counted steps (across both feet). Below this a
   * second mark is treated as a duplicate of the same physical contact.
   */
  minStepSpacingMs: number;
  /** Below this normalized y-range the foot barely moves — no reliable contacts. */
  minAmplitude: number;
}

export const DEFAULT_STEP_CONFIG: StepDetectionConfig = {
  minVisibility: 0.4,
  smoothingWindowFrames: 3,
  // A foot strikes ~once per stride (~400 ms at speed); 250 ms cannot drop a real
  // stride but does collapse a single contact's cluster of maxima into one.
  minSameSideSpacingMs: 250,
  // Successive foot-strikes (opposite feet) are ~180 ms+ apart even at elite
  // cadence, so 130 ms only removes sub-contact noise / cross-foot doubles.
  minStepSpacingMs: 130,
  minAmplitude: 0.01,
};

/** Overlay landmark keys per foot (ankle/heel/toe), lowest = ground contact. */
const SIDE_FOOT_JOINTS: Record<StepSide, string[]> = {
  left: ["leftAnkle", "leftHeel", "leftFootIndex"],
  right: ["rightAnkle", "rightHeel", "rightFootIndex"],
};

const MIN_VALID_FRAMES = 3;

/** A calibration scale for turning normalized step gaps into metres. */
export interface StepDistanceScale {
  /** Metres per pixel at the athlete's depth. */
  metersPerPixel: number;
  /** Source video pixel dimensions (normalized coords are scaled by these). */
  frameWidth: number;
  frameHeight: number;
}

/** Mean position + mean visibility of the usable foot keypoints in a frame, or null. */
function footSample(
  frame: OverlayFrame,
  joints: string[],
  minVis: number,
): { x: number; y: number; vis: number } | null {
  let sx = 0;
  let sy = 0;
  let sv = 0;
  let n = 0;
  for (const joint of joints) {
    const p = frame.landmarks[joint];
    if (p && (p.visibility ?? 1) >= minVis) {
      sx += p.x;
      sy += p.y;
      sv += p.visibility ?? 1;
      n += 1;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n, vis: sv / n } : null;
}

interface RawContact {
  side: StepSide;
  frame: number;
  time: number;
  x: number;
  y: number;
  /** Foot depth at contact (normalized y; larger = lower on screen = stronger). */
  prominence: number;
  /** Mean keypoint visibility at contact. */
  vis: number;
}

/**
 * Contact strength, used to decide which of two near-simultaneous marks is the
 * real ground contact: a lower foot (deeper y) wins, with tracking confidence as
 * the tie-break.
 */
function contactScore(c: RawContact): number {
  return c.prominence + c.vis * 1e-3;
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
    // One foot cannot re-strike within a stride: enforce a generous per-foot gap,
    // keeping the deeper contact if a closer maximum appears.
    if (time * 1000 - lastMs < cfg.minSameSideSpacingMs) {
      const pos = samples[idx];
      const last = contacts[contacts.length - 1];
      if (pos && last && smoothed[idx] > last.prominence) {
        contacts[contacts.length - 1] = {
          side,
          frame: frames[idx].frame,
          time,
          x: pos.x,
          y: pos.y,
          prominence: smoothed[idx],
          vis: pos.vis,
        };
        lastMs = time * 1000;
      }
      continue;
    }
    // Position the mark from the actual keypoints at contact (fall back to any
    // visible foot point regardless of confidence so the mark isn't dropped).
    const pos = samples[idx] ?? footSample(frames[idx], joints, 0);
    if (!pos) continue;
    lastMs = time * 1000;
    contacts.push({
      side,
      frame: frames[idx].frame,
      time,
      x: pos.x,
      y: pos.y,
      prominence: smoothed[idx],
      vis: pos.vis,
    });
  }
  return contacts;
}

/**
 * Global de-duplication across both feet: walk the merged, time-sorted contacts
 * and drop any that falls within `minStepSpacingMs` of the previously kept mark,
 * keeping whichever contact is more prominent. This removes duplicate strikes of
 * the same physical contact and biases the sequence toward natural L/R
 * alternation without ever forcing an alternation that the data doesn't support.
 */
function suppressDuplicates(raw: RawContact[], cfg: StepDetectionConfig): RawContact[] {
  const sorted = [...raw].sort((a, b) => a.time - b.time || a.side.localeCompare(b.side));
  const kept: RawContact[] = [];
  for (const c of sorted) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(c);
      continue;
    }
    const gapMs = (c.time - last.time) * 1000;
    const sameSide = c.side === last.side;
    // Too close to be a distinct step, or the same foot re-striking impossibly
    // fast → a duplicate of `last`. Keep the stronger of the two.
    if (gapMs < cfg.minStepSpacingMs || (sameSide && gapMs < cfg.minSameSideSpacingMs)) {
      if (contactScore(c) > contactScore(last)) kept[kept.length - 1] = c;
      continue;
    }
    kept.push(c);
  }
  return kept;
}

/**
 * Detect ordered step marks across an overlay sequence. Both feet are merged,
 * de-duplicated (one mark per true contact, biased toward L/R alternation), and
 * numbered chronologically; each mark carries the uncalibrated normalized
 * distance to the previous mark. Real-world (metre) distances are added
 * separately by {@link applyRealWorldStepDistances}. Returns `[]` when data is
 * too sparse.
 */
export function detectStepMarks(
  frames: OverlayFrame[],
  config: StepDetectionConfig = DEFAULT_STEP_CONFIG,
): StepMark[] {
  if (!frames || frames.length < MIN_VALID_FRAMES) return [];

  const merged = [...detectSide(frames, "left", config), ...detectSide(frames, "right", config)];
  const deduped = suppressDuplicates(merged, config);

  return deduped.map((mark, i) => ({
    side: mark.side,
    frame: mark.frame,
    time: mark.time,
    x: mark.x,
    y: mark.y,
    index: i + 1,
    distanceFromPrev:
      i > 0 ? Math.hypot(mark.x - deduped[i - 1].x, mark.y - deduped[i - 1].y) : null,
    distanceMetersFromPrev: null,
  }));
}

/**
 * Fill in `distanceMetersFromPrev` for each mark from a calibration scale. With
 * no (or an invalid) scale, every metre distance is left `null` so callers show
 * the uncalibrated/relative label instead of inventing a real-world number.
 * Pure: returns new marks, never mutates the input.
 */
export function applyRealWorldStepDistances(
  marks: StepMark[],
  scale: StepDistanceScale | null | undefined,
): StepMark[] {
  const usable =
    !!scale &&
    scale.metersPerPixel > 0 &&
    scale.frameWidth > 0 &&
    scale.frameHeight > 0;

  return marks.map((mark, i) => {
    if (!usable || i === 0) return { ...mark, distanceMetersFromPrev: null };
    const prev = marks[i - 1];
    const dxPx = (mark.x - prev.x) * scale!.frameWidth;
    const dyPx = (mark.y - prev.y) * scale!.frameHeight;
    return {
      ...mark,
      distanceMetersFromPrev: Math.hypot(dxPx, dyPx) * scale!.metersPerPixel,
    };
  });
}
