/**
 * Shared display-level gate stabilization (Day 99, Part 3).
 *
 * A calibration gate's WORLD anchor is immutable — it is drawn fresh every
 * frame from either the raw stored coordinates (stationary camera) or a
 * reprojection through the background camera-motion transform (panning).
 * Either path can carry a tiny amount of per-frame numerical noise (rounding,
 * sub-pixel transform jitter) that is scientifically negligible but visually
 * reads as the gate line "bobbing" a fraction of a pixel every frame.
 *
 * This is a pure DISPLAY concern: it never changes which world coordinate is
 * computed, never smooths the camera transform itself, and applies the exact
 * same function + threshold to both gates, so they can never be pulled apart
 * from each other as a side effect of stabilizing. It only decides, given a
 * freshly-computed pixel position and the previously-DISPLAYED one, which of
 * the two (visually indistinguishable) pixel positions to actually draw.
 */

export interface DisplayPoint {
  x: number;
  y: number;
}

export interface GateDisplayState {
  p1: DisplayPoint;
  p2: DisplayPoint;
}

export interface GateZoneDisplayState {
  start: GateDisplayState;
  finish: GateDisplayState;
}

/** Below this frame-to-frame pixel movement, treat the change as display
 *  noise and keep drawing the previous position. Same constant for every
 *  gate — never independently tuned per gate. */
export const GATE_DISPLAY_DEADBAND_PX = 0.75;
/** Phase 6.2: measured source-pixel micro-jitter boundary. This is independent
 * of display size, DPR, and FPS. The complete start/finish scene is accepted or
 * held as one rigid display decision. */
export const GATE_SOURCE_DEADBAND_PX = 0.5;

export function pointDistance(a: DisplayPoint, b: DisplayPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Given the freshly-computed raw pixel position and the last DISPLAYED
 * position for this same gate, return the position to actually draw, plus
 * the raw pre-stabilization displacement (for diagnostics). `previous: null`
 * (first frame, or the gate was not previously renderable) always displays
 * the raw position — there is nothing to stabilize against yet.
 */
export function stabilizeGatePoint(
  raw: GateDisplayState,
  previous: GateDisplayState | null,
  deadbandPx: number = GATE_DISPLAY_DEADBAND_PX,
): { display: GateDisplayState; displacementPx: number } {
  if (!previous) {
    return { display: { p1: raw.p1, p2: raw.p2 }, displacementPx: 0 };
  }
  const d1 = pointDistance(previous.p1, raw.p1);
  const d2 = pointDistance(previous.p2, raw.p2);
  const p1 = d1 < deadbandPx ? previous.p1 : raw.p1;
  const p2 = d2 < deadbandPx ? previous.p2 : raw.p2;
  return { display: { p1, p2 }, displacementPx: Math.max(d1, d2) };
}

export function stabilizeGateZone(
  raw: GateZoneDisplayState,
  previous: GateZoneDisplayState | null,
  sourceWidth: number,
  sourceHeight: number,
  displayWidth: number,
  displayHeight: number,
  deadbandSourcePx: number = GATE_SOURCE_DEADBAND_PX,
): { display: GateZoneDisplayState; displacementSourcePx: number; held: boolean } {
  if (!previous || displayWidth <= 0 || displayHeight <= 0) {
    return { display: raw, displacementSourcePx: 0, held: false };
  }
  const sourceDistance = (a: DisplayPoint, b: DisplayPoint) => Math.hypot(
    (a.x - b.x) * sourceWidth / displayWidth,
    (a.y - b.y) * sourceHeight / displayHeight,
  );
  const displacementSourcePx = Math.max(
    sourceDistance(previous.start.p1, raw.start.p1),
    sourceDistance(previous.start.p2, raw.start.p2),
    sourceDistance(previous.finish.p1, raw.finish.p1),
    sourceDistance(previous.finish.p2, raw.finish.p2),
  );
  const held = displacementSourcePx < deadbandSourcePx;
  return { display: held ? previous : raw, displacementSourcePx, held };
}

export function midpoint(a: DisplayPoint, b: DisplayPoint): DisplayPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function lineOrientationDeg(a: DisplayPoint, b: DisplayPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
