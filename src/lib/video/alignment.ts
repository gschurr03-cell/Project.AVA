import type { OverlayFrame } from "./overlay";

/**
 * How two clips are aligned in time. All modes read fields the overlay already
 * computes (foot-contact flags, center of mass) — no biomechanics is recomputed
 * here; this only chooses a reference instant per clip.
 */
export type AlignmentMode = "start" | "contact" | "com";

/** COM displacement (normalized image units) that counts as "started moving". */
export const COM_MOTION_THRESHOLD = 0.03;

/** Time (s) of the first frame flagged as a foot contact, or null if none. */
export function firstFootContactTime(frames: OverlayFrame[]): number | null {
  for (const frame of frames) {
    if (frame.footContact.left || frame.footContact.right) return frame.time;
  }
  return null;
}

/**
 * Time (s) of the first frame whose center of mass has moved more than
 * `threshold` from its resting position, or null if it never does.
 */
export function firstComMotionTime(
  frames: OverlayFrame[],
  threshold: number = COM_MOTION_THRESHOLD,
): number | null {
  let baseline: { x: number; y: number } | null = null;
  for (const frame of frames) {
    const com = frame.centerOfMass;
    if (!com) continue;
    if (!baseline) {
      baseline = com;
      continue;
    }
    if (Math.hypot(com.x - baseline.x, com.y - baseline.y) > threshold) return frame.time;
  }
  return null;
}

/**
 * Anchor time (s) for the chosen mode. Priority for "contact" is first foot
 * contact → first COM motion → first frame; "com" is first COM motion → first
 * frame; "start" is always the first frame.
 */
export function computeAnchor(frames: OverlayFrame[], mode: AlignmentMode): number {
  if (!frames.length) return 0;
  const firstFrame = frames[0].time;

  if (mode === "start") return firstFrame;
  if (mode === "contact") {
    return firstFootContactTime(frames) ?? firstComMotionTime(frames) ?? firstFrame;
  }
  return firstComMotionTime(frames) ?? firstFrame;
}
