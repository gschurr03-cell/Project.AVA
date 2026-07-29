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
import { classifySourceFps } from "./analysisFps";

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
 * Fractional tolerance used only for high-speed canonical display rates. The minimum
 * 60 FPS capture class is governed by the centralized evidence policy instead.
 */
export const FPS_SNAP_TOLERANCE = 0.025;

/**
 * Normalize a detected frame rate for UI/trust classification. This does not rewrite
 * worker artifact timestamps; nominal-60 footage retains its real source clock.
 */
export function normalizeFps(fps: number | null | undefined): number | null {
  if (!isValidFps(fps)) return fps ?? null;
  if (classifySourceFps({ detectedFps: fps }) === "validated_60_fps_class") return 60;
  for (const canonical of SUPPORTED_FPS.filter((value) => value > 60)) {
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
