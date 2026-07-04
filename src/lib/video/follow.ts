/**
 * Athlete Focus Zoom (Day 55) — the math for keeping the athlete centered.
 *
 * Given a frame's pose landmarks, we derive a "follow box": a normalized centre
 * (cx, cy) ∈ [0,1] in source-video space and a uniform on-screen `scale`. The
 * overlay surface applies this as a CSS transform to a wrapper holding *both* the
 * video and the pose canvas, so the picture zooms/pans while the overlay stays
 * perfectly aligned (they share one transformed coordinate space).
 *
 * Pure and framework-free: no I/O, no DOM. This is a presentation concern only —
 * nothing here touches biomechanics. Landmarks are consumed read-only.
 */

import type { OverlayFrame, OverlayPoint } from "./overlay";

/** A camera state: where to centre (normalized) and how far to zoom. */
export interface FollowBox {
  /** Normalized horizontal centre in source space, 0 = left … 1 = right. */
  cx: number;
  /** Normalized vertical centre in source space, 0 = top … 1 = bottom. */
  cy: number;
  /** Uniform zoom; 1 = whole frame, higher = tighter. Never below 1. */
  scale: number;
}

/** Tunables for how tightly and how far the camera follows the athlete. */
export interface FollowConfig {
  /** Extra margin added around the athlete, as a fraction of the bbox per side. */
  padding: number;
  /** Hard cap on zoom so a distant athlete never balloons to pixels. */
  maxScale: number;
  /** Minimum landmark visibility to include a point in the bounding box. */
  minVisibility: number;
  /** Require at least this many visible landmarks before trusting the box. */
  minLandmarks: number;
}

export const DEFAULT_FOLLOW_CONFIG: FollowConfig = {
  padding: 0.35,
  maxScale: 2.5,
  minVisibility: 0.3,
  minLandmarks: 4,
};

/**
 * Broadcast-style smoothing tunables (Day 64). Horizontal pan is snappier than
 * vertical (which is heavily damped so the camera doesn't bounce with each
 * stride); zoom eases on its own slow track with a deadband so limb extension
 * doesn't pulse it. Dead-zones keep the viewport still until the athlete drifts
 * out of a comfortable centre region.
 */
export interface FollowSmoothing {
  /** Horizontal pan ease per frame (higher = snappier). */
  panAlphaX: number;
  /** Vertical pan ease per frame (much lower = damped, no stride bounce). */
  panAlphaY: number;
  /** Zoom ease per frame (separate + slow). */
  zoomAlpha: number;
  /** Don't pan horizontally until the target centre drifts past this (normalized). */
  deadZoneX: number;
  /** Don't pan vertically until the target centre drifts past this (larger). */
  deadZoneY: number;
  /** Don't change zoom until the target scale differs by more than this. */
  zoomDeadband: number;
}

export const DEFAULT_FOLLOW_SMOOTHING: FollowSmoothing = {
  panAlphaX: 0.14,
  panAlphaY: 0.05,
  zoomAlpha: 0.05,
  deadZoneX: 0.04,
  deadZoneY: 0.1,
  zoomDeadband: 0.08,
};

/** The neutral camera: whole frame, centred, no zoom. */
export const IDENTITY_FOLLOW: FollowBox = { cx: 0.5, cy: 0.5, scale: 1 };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const midpoint = (a?: OverlayPoint, b?: OverlayPoint): OverlayPoint | null =>
  a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;

/**
 * Clamp the centre so the zoomed viewport never extends past the video edges
 * (no black bars from over-panning). At scale 1 the centre is pinned to 0.5.
 */
export function clampFollow(box: FollowBox): FollowBox {
  const scale = Math.max(1, box.scale);
  const half = 0.5 / scale; // half the visible window, in normalized units
  return {
    scale,
    cx: Math.min(1 - half, Math.max(half, box.cx)),
    cy: Math.min(1 - half, Math.max(half, box.cy)),
  };
}

/**
 * Compute the target follow box for a frame, or `null` when too few landmarks
 * are tracked to trust the athlete's position (caller should coast on its last
 * box).
 *
 * Day 64: the centre tracks the TORSO (mid-hip, biased toward the shoulders) not
 * the full-body bbox, so swinging arms/legs don't jerk the camera, and the zoom
 * is derived from the stable shoulder→hip torso length (× a height factor) rather
 * than the limb-extended bbox height — which is what made the old zoom pulse each
 * stride. Falls back to the padded full-body bbox when the torso isn't tracked.
 */
export function computeFollowTarget(
  frame: OverlayFrame,
  config: FollowConfig = DEFAULT_FOLLOW_CONFIG,
): FollowBox | null {
  const points = Object.values(frame.landmarks).filter(
    (p): p is OverlayPoint => !!p && (p.visibility ?? 1) >= config.minVisibility,
  );
  if (points.length < config.minLandmarks) return null;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const lm = frame.landmarks;
  const hipMid = midpoint(lm.leftHip, lm.rightHip);
  const shoulderMid = midpoint(lm.leftShoulder, lm.rightShoulder);
  const grow = 1 + config.padding * 2;

  if (hipMid && shoulderMid) {
    // Stable torso frame: centre a touch above the hips (toward mid-torso), and
    // size the view from the torso length, which barely changes stride-to-stride.
    const cx = (hipMid.x + shoulderMid.x) / 2;
    const cy = (hipMid.y + shoulderMid.y) / 2;
    const torsoLen = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
    // A standing athlete is ≈ 3.6 torso-lengths tall; fit that padded height.
    const estHeight = Math.max(torsoLen * 3.6, 1e-3);
    const boxH = estHeight * grow;
    const scale = Math.max(1, Math.min(config.maxScale, 1 / boxH));
    return clampFollow({ cx, cy, scale });
  }

  // Fallback: padded full-body bbox (pre-Day-64 behaviour).
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const boxW = Math.max((maxX - minX) * grow, 1e-3);
  const boxH = Math.max((maxY - minY) * grow, 1e-3);
  const scale = Math.max(1, Math.min(config.maxScale, Math.min(1 / boxW, 1 / boxH)));
  return clampFollow({ cx, cy, scale });
}

/**
 * Broadcast-style stabilized easing (Day 64). Applies a dead-zone (hold still
 * until the target drifts past a comfortable region), then eases horizontal and
 * vertical pan on separate alphas (vertical strongly damped), and eases zoom on
 * its own alpha behind a deadband so limb extension doesn't pulse it. Returns an
 * edge-clamped box.
 */
export function smoothFollowStable(
  current: FollowBox,
  target: FollowBox,
  smoothing: FollowSmoothing = DEFAULT_FOLLOW_SMOOTHING,
): FollowBox {
  // Dead-zone: only chase the axis once the target leaves the comfort region.
  const nextCx =
    Math.abs(target.cx - current.cx) <= smoothing.deadZoneX
      ? current.cx
      : lerp(current.cx, target.cx, smoothing.panAlphaX);
  const nextCy =
    Math.abs(target.cy - current.cy) <= smoothing.deadZoneY
      ? current.cy
      : lerp(current.cy, target.cy, smoothing.panAlphaY);
  const nextScale =
    Math.abs(target.scale - current.scale) <= smoothing.zoomDeadband
      ? current.scale
      : lerp(current.scale, target.scale, smoothing.zoomAlpha);

  return clampFollow({ cx: nextCx, cy: nextCy, scale: nextScale });
}

/** Exponentially ease `current` toward `target` (per-frame smoothing, alpha ∈ (0,1]). */
export function smoothFollow(current: FollowBox, target: FollowBox, alpha: number): FollowBox {
  return {
    cx: lerp(current.cx, target.cx, alpha),
    cy: lerp(current.cy, target.cy, alpha),
    scale: lerp(current.scale, target.scale, alpha),
  };
}

/**
 * CSS `transform` value that zooms into the follow box. Pairs with
 * `transform-origin: 0 0`; the `translate` percentages are relative to the
 * wrapper's own (untransformed) size, so no pixel dimensions are needed.
 */
export function followTransform(box: FollowBox): string {
  const tx = (0.5 - box.scale * box.cx) * 100;
  const ty = (0.5 - box.scale * box.cy) * 100;
  return `translate(${tx}%, ${ty}%) scale(${box.scale})`;
}

/** True when two boxes are close enough that re-rendering the transform is moot. */
export function followsDiffer(a: FollowBox, b: FollowBox, epsilon = 1e-4): boolean {
  return (
    Math.abs(a.cx - b.cx) > epsilon ||
    Math.abs(a.cy - b.cy) > epsilon ||
    Math.abs(a.scale - b.scale) > epsilon
  );
}
