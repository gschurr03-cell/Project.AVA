/**
 * The single, authoritative viewport transform for the Timing Workspace video stage.
 *
 * It is a PURELY VISUAL zoom/pan layer. Canonical calibration coordinates are always
 * normalized [0,1] over the fit-to-view video frame and remain the source of truth —
 * this transform only maps between those canonical coordinates and on-screen viewport
 * pixels. Nothing here is ever persisted into the calibration authority object.
 *
 *   canonical [0,1]  →  viewport px   (canonicalToViewport)
 *   viewport px      →  canonical [0,1] (viewportToCanonical)
 *
 * `width`/`height` are the fit-to-view stage size in CSS pixels (scale 1 = fit). The
 * wrapper is rendered with `transform: translate(tx,ty) scale(scale)` and
 * `transform-origin: 0 0`, which these functions mirror exactly.
 */
export interface Viewport {
  scale: number; // 1 = fit-to-view; up to MAX_SCALE (800%)
  tx: number; // horizontal translation in stage px (transform-origin top-left)
  ty: number; // vertical translation in stage px
  width: number; // fit stage width (px)
  height: number; // fit stage height (px)
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
/** Stepped zoom levels for the +/- buttons. Percentage shown = scale × 100. */
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4, 6, 8] as const;

export function fitViewport(width: number, height: number): Viewport {
  return { scale: 1, tx: 0, ty: 0, width, height };
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Clamp translation so the (scaled) video always covers the stage — it can never be
 * lost offscreen. With transform-origin 0,0: tx ∈ [width·(1−scale), 0]. At scale 1 both
 * bounds are 0, so Fit is exactly centered.
 */
export function clampTranslation(vp: Viewport): Viewport {
  const minTx = vp.width * (1 - vp.scale);
  const minTy = vp.height * (1 - vp.scale);
  return {
    ...vp,
    tx: Math.min(0, Math.max(minTx, vp.tx)),
    ty: Math.min(0, Math.max(minTy, vp.ty)),
  };
}

/** Canonical normalized [0,1] → viewport pixel (relative to the stage top-left). */
export function canonicalToViewport(nx: number, ny: number, vp: Viewport): { x: number; y: number } {
  return { x: vp.tx + nx * vp.width * vp.scale, y: vp.ty + ny * vp.height * vp.scale };
}

/** Viewport pixel (relative to stage top-left) → canonical normalized [0,1]. */
export function viewportToCanonical(px: number, py: number, vp: Viewport): { x: number; y: number } {
  return { x: (px - vp.tx) / (vp.width * vp.scale), y: (py - vp.ty) / (vp.height * vp.scale) };
}

/**
 * Mathematically exact pointer-anchored zoom: the canonical point currently under
 * (anchorX, anchorY) stays under the pointer after the scale change. Returns a
 * translation-clamped viewport.
 */
export function zoomAtPoint(vp: Viewport, targetScale: number, anchorX: number, anchorY: number): Viewport {
  const scale = clampScale(targetScale);
  const ratio = scale / vp.scale;
  const tx = anchorX - (anchorX - vp.tx) * ratio;
  const ty = anchorY - (anchorY - vp.ty) * ratio;
  return clampTranslation({ ...vp, scale, tx, ty });
}

/** Next stepped zoom level in `dir` (+1 in, −1 out), clamped to the range. */
export function stepZoom(scale: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > scale + 1e-9) ?? MAX_SCALE;
  const lower = [...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-9);
  return lower ?? MIN_SCALE;
}

/**
 * Re-fit after a resize while keeping the canonical point currently at the viewport
 * centre stable, so the view doesn't snap back to Fit on every resize.
 */
export function resizeViewport(vp: Viewport, width: number, height: number): Viewport {
  if (vp.width <= 0 || vp.height <= 0) return { ...fitViewport(width, height), scale: vp.scale };
  const centreCanonical = viewportToCanonical(vp.width / 2, vp.height / 2, vp);
  const next: Viewport = { scale: vp.scale, width, height, tx: 0, ty: 0 };
  const centreViewport = canonicalToViewport(centreCanonical.x, centreCanonical.y, next);
  return clampTranslation({ ...next, tx: width / 2 - centreViewport.x, ty: height / 2 - centreViewport.y });
}
