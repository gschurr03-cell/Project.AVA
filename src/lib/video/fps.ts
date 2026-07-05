/**
 * Manual FPS override (Day 61).
 *
 * Frame → time conversion is only as accurate as the frame rate. When ffprobe
 * mis-detects a clip's FPS (variable-frame-rate phone footage, transcodes), every
 * timing-derived number — step spacing, phase velocity, calibrated and segment
 * velocity — drifts. A coach can supply the true FPS for a session; this module
 * validates it and re-times the overlay frames from it.
 *
 * Pure and deterministic: `applyFpsOverride` returns new frames and never mutates
 * the input. It rewrites each frame's `time` from its frame index, so all
 * downstream time-based consumers pick up the corrected clock automatically.
 */

import type { OverlayFrame } from "./overlay";

/** Accepted FPS bounds (mirrors the DB CHECK on sessions.fps_override). */
export const MIN_FPS = 1;
export const MAX_FPS = 1000;

/** True when `fps` is a finite, in-range frame rate worth using. */
export function isValidFps(fps: number | null | undefined): fps is number {
  return typeof fps === "number" && Number.isFinite(fps) && fps >= MIN_FPS && fps <= MAX_FPS;
}

/** Canonical capture rates AVA supports (Day 73). */
export const SUPPORTED_FPS = [60, 120, 240] as const;

/**
 * Fractional tolerance for snapping a detected rate to a canonical one. 60 fps clips
 * are commonly reported as 59.94 (NTSC) or drift to e.g. 59.16 from a VFR container;
 * within ±2.5% of a supported rate the canonical value is the honest capture rate, so
 * we snap to it. Values outside every band are left exactly as detected (never blindly
 * rounded) — a genuine 50 fps or 30 fps clip keeps its real rate.
 */
export const FPS_SNAP_TOLERANCE = 0.025;

/**
 * Normalize a detected frame rate to the nearest supported canonical rate
 * (60/120/240) when it is within {@link FPS_SNAP_TOLERANCE}, else return it
 * unchanged. Prevents small FPS-metadata drift (e.g. 59.16 → 60) from adding timing
 * error to every derived metric, without inventing a rate for unusual footage.
 */
export function normalizeFps(fps: number | null | undefined): number | null {
  if (!isValidFps(fps)) return fps ?? null;
  for (const canonical of SUPPORTED_FPS) {
    if (Math.abs(fps - canonical) <= FPS_SNAP_TOLERANCE * canonical) return canonical;
  }
  return fps;
}

/**
 * Re-time overlay frames from an explicit FPS. Each frame's `time` becomes its
 * offset from the first frame divided by `fps`. With an invalid/absent FPS the
 * frames are returned unchanged (the original artifact timing stands).
 */
export function applyFpsOverride(
  frames: OverlayFrame[],
  fps: number | null | undefined,
): OverlayFrame[] {
  if (!isValidFps(fps) || frames.length === 0) return frames;
  const baseFrame = frames[0].frame;
  return frames.map((f) => ({ ...f, time: (f.frame - baseFrame) / fps }));
}
