/**
 * Camera motion compensation (Day 64) — AVA's first pass at separating raw video
 * FRAME coordinates from stabilized WORLD (track) coordinates on panning footage.
 *
 * Why: the pose overlay reports normalized coordinates *inside each video frame*.
 * On a static tripod that equals a fixed ground position, but on a panning clip
 * (e.g. AVA Calab Vid 1, where the camera tracks the athlete) a fixed ground point
 * drifts across the frame. Treating frame coords as world coords then corrupts
 * every SPATIAL measurement — step length, gate distance, velocity. Temporal
 * metrics (cadence, contact/flight time, zone time) are unaffected and must not
 * change.
 *
 * Two coordinate systems:
 *   • frame:  raw MediaPipe/video coordinate, where a point appears in the frame.
 *   • world:  frame coordinate + accumulated camera offset — where the point is on
 *             the track, corrected for camera pan. `world = frame + cumOffset(t)`.
 *
 * v1 estimator — the STANCE FOOT as a moving-picture static reference. During
 * ground contact the planted foot is fixed in the WORLD, so between two frames its
 * change in FRAME position is (minus) the camera translation. Each frame the foot
 * that moves LEAST horizontally is taken as the planted one (the swing foot moves
 * by camera + stride, so it always moves more), giving a per-frame camera dx/dy.
 * This deliberately uses the athlete's own contact — the only stable point pose
 * data provides — rather than background features (lane lines/cones), which the
 * pose artifact does not carry. Confidence reflects how well that held.
 *
 * v1 scope: horizontal/vertical translation only (no zoom/rotation/3D). Pure &
 * deterministic: no I/O, inputs read-only.
 */

import type { OverlayFrame, OverlayPoint } from "./overlay";

export type CameraConfidence = "high" | "medium" | "low" | "none";

/** A 2-D point in normalized coordinates (frame or world). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Per-frame camera state: the delta from the previous frame + accumulated offset. */
export interface CameraFrameOffset {
  frame: number;
  time: number;
  /** Camera translation since the previous frame (normalized). */
  dx: number;
  dy: number;
  /** Accumulated camera position from the first frame (world = frame + cum). */
  cumX: number;
  cumY: number;
  /** 0..1 quality of this frame's estimate (1 = a direct planted-foot reading). */
  confidence: number;
}

/** The full estimated camera path plus how much to trust it. */
export interface CameraTrack {
  offsets: CameraFrameOffset[];
  /** True when at least a weak translation estimate was produced. */
  available: boolean;
  /** Overall confidence tier for spatial compensation. */
  confidence: CameraConfidence;
  /** Fraction of frame-pairs that got a direct (non-interpolated) estimate. */
  coverage: number;
  /** Mean per-frame confidence. */
  meanConfidence: number;
  method: string;
  /** Set when compensation is weak/unavailable, for the UI to surface. */
  warning: string | null;
}

export interface CameraConfig {
  /** Minimum foot-keypoint visibility to use a foot as a reference. */
  minVisibility: number;
  /** Median-smoothing window (frames) applied to the raw per-frame deltas. */
  smoothingWindow: number;
  /** Reject an implausibly large single-frame camera jump (normalized units). */
  maxStepDelta: number;
  /**
   * A frame is only trusted when one foot is clearly the planted (stance) foot:
   * its horizontal speed must be below this fraction of the swing foot's. When no
   * foot is clearly planted (e.g. both feet gliding, or the athlete is still) the
   * frame is skipped rather than inventing camera motion.
   */
  stanceSpeedRatio: number;
  /**
   * Per-frame camera-motion dead-band (normalized). Foot keypoints jitter by a
   * pixel or two even when planted, and on a (near-)static camera that noise would
   * otherwise ACCUMULATE into a large phantom pan — dragging "world-anchored"
   * marks/gates along with the athlete. Below this magnitude a frame's estimated
   * motion is treated as zero, so a static camera stays at cum≈0 while a genuine
   * pan (per-frame motion well above the noise floor) still accumulates.
   */
  minFrameDelta: number;
  /**
   * If the athlete's body traverses at least this fraction of the frame width, the
   * camera is treated as STATIC (world == frame) — you can't both have the athlete
   * cross the frame AND a camera that pans to follow them. This is the decisive
   * guard against a biased stance-foot estimate (foot rolls forward through stance)
   * dragging gates/marks along with a runner on tripod-ish footage.
   */
  staticTravelFraction: number;
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  minVisibility: 0.3,
  smoothingWindow: 5,
  maxStepDelta: 0.15,
  stanceSpeedRatio: 0.6,
  minFrameDelta: 0.0025,
  staticTravelFraction: 0.4,
};

/** The standard UI warning when spatial compensation can't be trusted. */
export const CAMERA_UNAVAILABLE_WARNING =
  "Spatial measurements may be inaccurate because camera motion could not be compensated.";

const FOOT_JOINTS: Record<"left" | "right", string[]> = {
  left: ["leftAnkle", "leftHeel", "leftFootIndex"],
  right: ["rightAnkle", "rightHeel", "rightFootIndex"],
};

/** Mean position of the visible foot keypoints for one side, or null. */
function footSample(frame: OverlayFrame, joints: string[], minVis: number): Vec2 | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const j of joints) {
    const p: OverlayPoint | undefined = frame.landmarks[j];
    if (p && (p.visibility ?? 1) >= minVis) {
      sx += p.x;
      sy += p.y;
      n += 1;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : null;
}

/** Median-smooth a series, treating nulls as gaps that pass through unchanged. */
function medianSmooth(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const slice: number[] = [];
    for (let k = Math.max(0, i - half); k <= Math.min(values.length - 1, i + half); k++) {
      slice.push(values[k]);
    }
    slice.sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  });
}

function unavailableTrack(frames: OverlayFrame[], reason: string): CameraTrack {
  return {
    offsets: frames.map((f) => ({
      frame: f.frame,
      time: f.time,
      dx: 0,
      dy: 0,
      cumX: 0,
      cumY: 0,
      confidence: 0,
    })),
    available: false,
    confidence: "none",
    coverage: 0,
    meanConfidence: 0,
    method: "stance-foot-translation",
    warning: `${CAMERA_UNAVAILABLE_WARNING} (${reason})`,
  };
}

/** A zero-motion track: world == frame, exactly right for a static camera. */
function staticTrack(frames: OverlayFrame[], method: string): CameraTrack {
  return {
    offsets: frames.map((f) => ({
      frame: f.frame,
      time: f.time,
      dx: 0,
      dy: 0,
      cumX: 0,
      cumY: 0,
      confidence: 1,
    })),
    available: true,
    confidence: "high",
    coverage: 1,
    meanConfidence: 1,
    method,
    warning: null,
  };
}

/**
 * How far the athlete's body centre travels across the frame (x-range), using the
 * tracked centre of mass when available, else the mean foot position. A large
 * value means the athlete crosses the frame — i.e. the camera is (near) static.
 */
function athleteFrameTravel(frames: OverlayFrame[], minVis: number): number {
  const xs: number[] = [];
  for (const f of frames) {
    if (f.centerOfMass) {
      xs.push(f.centerOfMass.x);
      continue;
    }
    const l = footSample(f, FOOT_JOINTS.left, minVis);
    const r = footSample(f, FOOT_JOINTS.right, minVis);
    if (l && r) xs.push((l.x + r.x) / 2);
    else if (l) xs.push(l.x);
    else if (r) xs.push(r.x);
  }
  if (xs.length < 2) return 0;
  return Math.max(...xs) - Math.min(...xs);
}

/**
 * Estimate the camera translation path from a pose sequence. Returns a per-frame
 * dx/dy + cumulative offset and an overall confidence. When too little foot data
 * is available it returns an "unavailable" track (all-zero offsets, `available:
 * false`) so callers fall back to raw frame coordinates and warn the coach.
 */
export function estimateCameraMotion(
  frames: OverlayFrame[],
  config: CameraConfig = DEFAULT_CAMERA_CONFIG,
): CameraTrack {
  const n = frames.length;
  if (n < 3) return unavailableTrack(frames, "too few frames");

  // Static-camera guard: if the athlete crosses a large fraction of the frame, the
  // camera can't also be following them — treat it as static (world == frame). This
  // prevents a biased stance-foot estimate from dragging gates/marks with the runner.
  if (athleteFrameTravel(frames, config.minVisibility) >= config.staticTravelFraction) {
    return staticTrack(frames, "static-camera (athlete crosses frame)");
  }

  const rawDx: (number | null)[] = new Array(n).fill(null);
  const rawDy: (number | null)[] = new Array(n).fill(null);
  let direct = 0;

  for (let i = 1; i < n; i++) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const candidates: { dxFrame: number; dyFrame: number; speed: number; yLevel: number }[] = [];
    for (const side of ["left", "right"] as const) {
      const a = footSample(prev, FOOT_JOINTS[side], config.minVisibility);
      const b = footSample(cur, FOOT_JOINTS[side], config.minVisibility);
      if (a && b) {
        const dxFrame = b.x - a.x;
        const dyFrame = b.y - a.y;
        candidates.push({ dxFrame, dyFrame, speed: Math.abs(dxFrame), yLevel: (a.y + b.y) / 2 });
      }
    }
    // Need BOTH feet to tell the planted foot from the swing foot. With only one
    // foot we can't separate camera motion from stride, so skip the frame.
    if (candidates.length < 2) continue;

    // Planted (stance) foot = the one moving least horizontally in-frame; ties go
    // to the lower foot (larger y), which is the one actually on the ground.
    candidates.sort((p, q) => p.speed - q.speed || q.yLevel - p.yLevel);
    const planted = candidates[0];
    const swing = candidates[candidates.length - 1];

    // Only trust the frame when there's a CLEAR stance foot: the planted foot must
    // move clearly less than the swing foot. Otherwise (both gliding, or standing
    // still with real motion) skip rather than fabricate a camera pan.
    if (!(planted.speed < config.stanceSpeedRatio * swing.speed + 1e-4)) continue;

    // The planted foot is world-fixed, so its frame motion IS the camera motion
    // (negated): world = frame + cum ⇒ Δcum = −Δframe_planted.
    const dx = -planted.dxFrame;
    const dy = -planted.dyFrame;
    if (Math.abs(dx) <= config.maxStepDelta && Math.abs(dy) <= config.maxStepDelta) {
      rawDx[i] = dx;
      rawDy[i] = dy;
      direct += 1;
    }
  }

  if (direct === 0) return unavailableTrack(frames, "no stable foot contact to track");

  // Fill gaps by holding the last known delta, then median-smooth to reject the
  // occasional swing-foot mis-pick (a spike surrounded by consistent motion).
  const filledDx = fillGaps(rawDx);
  const filledDy = fillGaps(rawDy);
  const smoothDx = medianSmooth(filledDx, config.smoothingWindow);
  const smoothDy = medianSmooth(filledDy, config.smoothingWindow);

  // Dead-band: below the noise floor, treat a frame's motion as zero so foot
  // jitter on a (near-)static camera can't accumulate into a phantom pan.
  const band = (v: number) => (Math.abs(v) < config.minFrameDelta ? 0 : v);

  const offsets: CameraFrameOffset[] = [];
  let cumX = 0;
  let cumY = 0;
  for (let i = 0; i < n; i++) {
    const dx = i === 0 ? 0 : band(smoothDx[i]);
    const dy = i === 0 ? 0 : band(smoothDy[i]);
    cumX += dx;
    cumY += dy;
    offsets.push({
      frame: frames[i].frame,
      time: frames[i].time,
      dx,
      dy,
      cumX,
      cumY,
      confidence: rawDx[i] != null ? 1 : 0.3,
    });
  }

  const coverage = direct / (n - 1);
  const meanConfidence = offsets.reduce((s, o) => s + o.confidence, 0) / n;
  const confidence: CameraConfidence =
    coverage >= 0.6 ? "high" : coverage >= 0.35 ? "medium" : "low";
  const warning =
    confidence === "low"
      ? `${CAMERA_UNAVAILABLE_WARNING} (weak/sparse camera tracking — ${Math.round(coverage * 100)}% frame coverage)`
      : null;

  return {
    offsets,
    available: true,
    confidence,
    coverage,
    meanConfidence,
    method: "stance-foot-translation",
    warning,
  };
}

/** Forward-fill nulls with the previous known value, back-fill any leading nulls with 0. */
function fillGaps(values: (number | null)[]): number[] {
  const out = new Array(values.length).fill(0);
  let last = 0;
  let seen = false;
  for (let i = 0; i < values.length; i++) {
    if (values[i] != null) {
      last = values[i] as number;
      seen = true;
    }
    out[i] = seen ? last : 0;
  }
  return out;
}

/** Binary-search the last offset at or before `time`. */
function offsetIndexForTime(offsets: CameraFrameOffset[], time: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid].time <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

/**
 * The accumulated camera offset at a given time, linearly interpolated between
 * frames. `{0,0}` for an unavailable track, so world == frame (no compensation).
 */
export function cameraOffsetAtTime(track: CameraTrack, time: number): Vec2 {
  const offsets = track.offsets;
  if (!track.available || offsets.length === 0) return { x: 0, y: 0 };
  const i = offsetIndexForTime(offsets, time);
  const cur = offsets[i];
  const next = offsets[i + 1];
  if (!next || next.time <= cur.time) return { x: cur.cumX, y: cur.cumY };
  const frac = (time - cur.time) / (next.time - cur.time);
  return {
    x: cur.cumX + (next.cumX - cur.cumX) * frac,
    y: cur.cumY + (next.cumY - cur.cumY) * frac,
  };
}

/** Frame → world at time `time`: world = frame + accumulated camera offset. */
export function frameToWorldAt(point: Vec2, track: CameraTrack, time: number): Vec2 {
  const off = cameraOffsetAtTime(track, time);
  return { x: point.x + off.x, y: point.y + off.y };
}

/** World → frame at time `time`: frame = world − accumulated camera offset. */
export function worldToFrameAt(world: Vec2, track: CameraTrack, time: number): Vec2 {
  const off = cameraOffsetAtTime(track, time);
  return { x: world.x - off.x, y: world.y - off.y };
}

/**
 * Where a calibration gate — placed at frame-x `gateFrameX` at `placementTime` —
 * appears in the frame at `time`, as a normalized x. The gate is first lifted to a
 * FIXED WORLD position (`gateFrameX + cameraOffset(placementTime)`) and then
 * projected back into the current frame view (`worldX − cameraOffset(time)`), so a
 * gate stays planted on the track while the camera moves. Returns `null` when the
 * gate's world location has panned outside the frame `[0,1]` (± `margin`) — the
 * caller should then NOT draw it. With no placement time the gate is treated as a
 * fixed frame position (static-camera / legacy).
 */
export function gateFrameXAt(
  gateFrameX: number,
  placementTime: number | null | undefined,
  track: CameraTrack,
  time: number,
  margin = 0,
): number | null {
  const rendered =
    placementTime == null
      ? gateFrameX
      : gateFrameX + cameraOffsetAtTime(track, placementTime).x - cameraOffsetAtTime(track, time).x;
  return rendered >= -margin && rendered <= 1 + margin ? rendered : null;
}
