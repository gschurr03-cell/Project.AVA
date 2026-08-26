/**
 * Day 104 (Part 7) — pure geometry for the stationary-camera full-height gate
 * display: given a gate's already-authoritative, already-stabilized display
 * midpoint, compute the vertical line endpoints and the translucent zone
 * rectangle between two gates.
 *
 * Deliberately ignorant of canvas/React/camera projection: VideoOverlay.tsx
 * supplies an already-resolved midpoint (the same `startG.mid`/`finishG.mid`
 * the old short cone-to-cone segment rendered from, after the exact same
 * shared deadband stabilization — see `gateStabilization.ts`, unchanged).
 * This module only decides how far to draw a line FROM that point — it
 * never computes, derives, or feeds back into the crossing-detection
 * geometry (`calibration_gates`, `selectRenderableGateGeometry`,
 * `zoneStepAnalysis.ts`), which stays completely untouched by this display
 * redesign.
 */

export interface StationaryGateLine {
  x: number;
  y0: number;
  y1: number;
}

export interface StationaryZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A full-height vertical line through `midX`, spanning the picture's height. */
export function stationaryGateLine(midX: number, pictureHeight: number): StationaryGateLine {
  return { x: midX, y0: 0, y1: pictureHeight };
}

/**
 * The translucent analysis-zone rectangle between two gate midpoints —
 * order-independent (works whether travel is left-to-right or
 * right-to-left), always spans the picture's full height.
 */
export function stationaryZoneRect(
  startMidX: number,
  finishMidX: number,
  pictureHeight: number,
): StationaryZoneRect {
  const x0 = Math.min(startMidX, finishMidX);
  const x1 = Math.max(startMidX, finishMidX);
  return { x: x0, y: 0, width: x1 - x0, height: pictureHeight };
}

/**
 * Phase R2C — the ONE authoritative presentation width for the start/finish
 * gate bands.
 *
 * The scientific gate model (`calibration_gates` / `GateBar` / `GroundBoundary`)
 * stores each gate as a single cone-to-cone LINE (`c1`/`c2`, spanning lane
 * WIDTH, reduced to one representative midpoint) — there is no along-travel
 * depth/thickness field anywhere in the calibration data (proven exhaustively
 * in `docs/phase-r2b-exact-gate-geometry-and-longitudinal-origin-audit.md`).
 * This module must not invent one. Each gate's colored band is a
 * presentation-only rectangle CENTERED on that same authoritative, already-
 * stabilized midpoint the gate line itself is drawn from — never a second
 * scientific boundary.
 *
 * Phase R2's first attempt derived width as a fraction of the on-screen
 * fly-zone span (`flySpan × 0.12`, clamped 24-140px). Phase R2B audited that
 * choice and found it visually meaningless — tied to an UNRELATED distance
 * (the gap between the gates), not to the gate itself — and measured it at
 * 6-7x wider than the workspace gate editor's own 16px drag-handle circle
 * and 24-28x wider than its 4px bar stroke (`TimingWorkspace.tsx`, the only
 * place any gate "visual size" exists at all).
 *
 * Phase R2C (this phase) replaces it with ONE fixed, named CSS-pixel
 * constant — the workspace's own 16px handle diameter (`h-4 w-4` = 16x16
 * CSS px, `src/app/sessions/[id]/timing/TimingWorkspace.tsx`), the single
 * closest existing "how big does this gate control look" evidence in the
 * whole codebase (R2B Part M: no other candidate — bar stroke, search-
 * window padding — represents a along-travel size at all). This value does
 * NOT depend on flySpan, zone length, or any benchmark-specific geometry —
 * it is a single constant, identical for every session.
 *
 * DPR/resolution note: `VideoOverlay.tsx` applies `ctx.setTransform(dpr, 0,
 * 0, dpr, 0, 0)` once per frame before any draw call, so every coordinate
 * this module receives/returns (including this width) is already in CSS-
 * pixel space — stable across any devicePixelRatio without any extra math
 * here. It must never be scaled by `dpr` a second time.
 */
export const GATE_BAND_PRESENTATION_WIDTH_PX = 16;

/** The one authoritative presentation band width (CSS px) for a gate fill. */
export function stationaryGateBandWidth(): number {
  return GATE_BAND_PRESENTATION_WIDTH_PX;
}

/**
 * Phase R2 (geometry), refined in Phase R2C (band width) — the full
 * three-region, screen-filling vertical-pane zone presentation: a bounded
 * GREEN band centered on the start gate line, a
 * bounded RED band centered on the finish gate line, and a LIGHT BLUE fly/
 * measurement region filling exactly the space between the two bands' inner
 * edges. Each rectangle always spans the picture's full height (y0=0,
 * y1=pictureHeight) by construction — this function has no Y component to
 * get wrong.
 *
 * Direction-aware, not hardcoded left-to-right: "pre"/green is always
 * centered on the start gate midpoint, and "post"/red is always centered on
 * the finish gate midpoint, whichever screen side each falls on. There is
 * deliberately NO fill extending to the picture edge — outside the two
 * bands, no color is drawn at all (the user's explicit "band, not
 * everything-before/after" requirement). If the two gates are close enough
 * on screen that the bands would overlap or invert the fly region, each
 * band is clamped so it never crosses the other gate's own midpoint, and the
 * fly region's width is floored at 0 (never negative) — still always
 * correct, just visually tight.
 */
export interface StationaryThreeZoneRects {
  pre: StationaryZoneRect;
  fly: StationaryZoneRect;
  post: StationaryZoneRect;
}

export function stationaryThreeZoneRects(
  startMidX: number,
  finishMidX: number,
  pictureWidth: number,
  pictureHeight: number,
): StationaryThreeZoneRects {
  void pictureWidth; // bands are now bounded, not screen-edge-anchored; kept for API stability.
  const travelIsLeftToRight = finishMidX >= startMidX;
  const flySpan = Math.abs(finishMidX - startMidX);
  // Each band is centered on its gate's own authoritative midpoint, so it
  // extends `halfBand` to each side. If the two gates are close enough on
  // screen that both full bands would overlap, shrink `halfBand` (never
  // negative) so the bands meet edge-to-edge with zero fly width, instead of
  // inverting into a negative-width fly region.
  const halfBand = Math.min(stationaryGateBandWidth() / 2, flySpan / 2);

  // "Outer" = away from the fly zone (where the athlete is before/after the
  // gate); "inner" = toward the fly zone (the band's border with the blue
  // region) — matching the task's exact `startGateOuterEdge`/
  // `startGateInnerEdge`/`finishGateInnerEdge`/`finishGateOuterEdge` contract.
  const startOuterX = travelIsLeftToRight ? startMidX - halfBand : startMidX + halfBand;
  const startInnerX = travelIsLeftToRight ? startMidX + halfBand : startMidX - halfBand;
  const finishInnerX = travelIsLeftToRight ? finishMidX - halfBand : finishMidX + halfBand;
  const finishOuterX = travelIsLeftToRight ? finishMidX + halfBand : finishMidX - halfBand;

  const pre = travelIsLeftToRight
    ? { x: startOuterX, y: 0, width: startInnerX - startOuterX, height: pictureHeight }
    : { x: startInnerX, y: 0, width: startOuterX - startInnerX, height: pictureHeight };
  const post = travelIsLeftToRight
    ? { x: finishInnerX, y: 0, width: finishOuterX - finishInnerX, height: pictureHeight }
    : { x: finishOuterX, y: 0, width: finishInnerX - finishOuterX, height: pictureHeight };
  const fly = travelIsLeftToRight
    ? { x: startInnerX, y: 0, width: Math.max(0, finishInnerX - startInnerX), height: pictureHeight }
    : { x: finishInnerX, y: 0, width: Math.max(0, startInnerX - finishInnerX), height: pictureHeight };

  return { pre, fly, post };
}
