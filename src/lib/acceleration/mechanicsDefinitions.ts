/**
 * Central, documented mechanical-angle definitions for Acceleration Analysis
 * (Phase 3, Part 5). EVERY angle/position computation in `mechanics.ts` goes
 * through these primitives — there is deliberately no second, competing
 * definition anywhere else in the codebase.
 *
 * ── Coordinate convention ──────────────────────────────────────────────
 * All inputs are normalized SOURCE-VIDEO coordinates: x ∈ [0,1] left→right
 * of the raw frame, y ∈ [0,1] top→bottom (image convention — y increases
 * DOWNWARD). This matches every other coordinate in this codebase
 * (`@/lib/video/coordinates`) — mechanics never introduces a second space.
 *
 * ── Direction-of-travel normalization ──────────────────────────────────
 * A clip's athlete may run screen-left→right or screen-right→left. Every
 * "forward" / "ahead of the body" / "leaning into the run" concept below is
 * defined relative to the athlete's OWN travel direction, not the screen —
 * via `travelSign()`, which flips the horizontal axis for a right-to-left
 * clip. This is what makes the same physical movement produce the same
 * signed angle regardless of which way the athlete runs on screen (Part 5's
 * direction-invariance requirement, verified by dedicated tests).
 *
 * ── Angle sign convention ──────────────────────────────────────────────
 * Every angle below is measured from TRUE VERTICAL (the reference axis),
 * signed so that POSITIVE means "leaning/oriented toward the direction of
 * travel" (a forward lean/forward shin) and NEGATIVE means "leaning away
 * from it" (backward lean). 0° is exactly upright/vertical.
 *
 * ── Reference axis ──────────────────────────────────────────────────────
 * True vertical (perpendicular to the ground plane as it appears in the
 * 2D image) — NOT the direction of travel and not an arbitrary body axis.
 *
 * ── Confidence requirements ─────────────────────────────────────────────
 * Every landmark used in an angle must clear `MIN_LANDMARK_CONFIDENCE`
 * (0.5 — a deliberately conservative floor). If any required landmark is
 * missing or below this floor, the computation is not attempted; the caller
 * must report `"unavailable"`, never a fabricated value (Part 4).
 *
 * ── Perspective limitations (documented, not correctable here) ─────────
 * These are all 2D, single-camera, PROJECTED angles. A camera that is not
 * exactly perpendicular to the direction of travel will bias every angle by
 * an unknown, unmeasured amount — there is no monocular way to recover true
 * 3D orientation from one stationary camera. This is why every mechanical
 * value keeps `"experimental"` or `"estimated"` provenance rather than being
 * treated as a validated force/kinematic measurement (see `metrics.ts`'s
 * existing trunk-angle disclaimer, which this module generalizes).
 */

export const MECHANICS_DEFINITIONS_VERSION = "ava-acceleration-mechanics-defs-v1" as const;

/** Conservative floor — shared by every mechanical computation in this domain. */
export const MIN_LANDMARK_CONFIDENCE = 0.5;

export type TravelDirection = "left_to_right" | "right_to_left";
export type MechanicalSide = "left" | "right";

export interface Point2D {
  x: number;
  y: number;
}

export interface ScoredPoint extends Point2D {
  score: number;
}

/** +1 for a left-to-right clip, -1 for right-to-left — the one place the
 *  screen-direction flip happens. Every other function in this module takes
 *  this sign, never `travelDirection` itself, so there is exactly one place
 *  that could get the flip wrong. */
export function travelSign(travelDirection: TravelDirection): 1 | -1 {
  return travelDirection === "left_to_right" ? 1 : -1;
}

/** A landmark is usable only when present AND at/above the confidence floor. */
export function isUsable(point: ScoredPoint | null | undefined): point is ScoredPoint {
  return point != null && Number.isFinite(point.x) && Number.isFinite(point.y) && point.score >= MIN_LANDMARK_CONFIDENCE;
}

/** Mean confidence across a set of landmarks actually used in a computation. */
export function combinedConfidence(points: ScoredPoint[]): number {
  return points.length ? points.reduce((sum, p) => sum + p.score, 0) / points.length : 0;
}

/**
 * The signed angle (degrees) of the segment `bottom → top` from true
 * vertical, direction-normalized. 0° = exactly upright. Positive = the top
 * point is displaced toward the direction of travel relative to the bottom
 * point (a forward lean / forward shin); negative = displaced away from it.
 *
 * This ONE function implements trunk angle (bottom=hip, top=shoulder), shin
 * angle (bottom=ankle, top=knee), and thigh angle (bottom=knee, top=hip) —
 * they differ only in which two landmarks are passed, never in the math.
 */
export function signedAngleFromVerticalDeg(
  bottom: Point2D,
  top: Point2D,
  travelDirection: TravelDirection,
): number {
  const sign = travelSign(travelDirection);
  const forward = sign * (top.x - bottom.x);
  const up = -(top.y - bottom.y); // image y grows downward; "up" must be positive
  return (Math.atan2(forward, up) * 180) / Math.PI;
}

/**
 * Direction-normalized horizontal offset of `point` relative to `reference`,
 * in normalized source units. Positive = `point` is ahead of `reference` in
 * the direction of travel (e.g. a touchdown reaching out ahead of the
 * pelvis); negative = behind it.
 */
export function forwardOffset(reference: Point2D, point: Point2D, travelDirection: TravelDirection): number {
  return travelSign(travelDirection) * (point.x - reference.x);
}

/** Midpoint of two SCORED points; confidence is the mean of the two. */
export function midpoint(a: ScoredPoint, b: ScoredPoint): ScoredPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: (a.score + b.score) / 2 };
}

/**
 * Converts a normalized horizontal offset into meters using the SAME
 * calibrated zone scale (meters per normalized unit) acceleration analysis
 * already derives from the coach's placed distance markers — never a
 * separate, competing distance model. A calibrated scale is required to
 * establish physical distance at all (screen pixels alone carry no scale);
 * when it is available, a leg-length ratio is additionally reported as a
 * second, athlete-relative view of the same measured distance. Never
 * fabricates a number when the calibrated scale is unavailable.
 */
export function normalizedOffsetToMeters(input: {
  offsetNormalized: number;
  metersPerNormalizedUnit: number | null;
  legLengthM: number | null;
}): { meters: number | null; legLengthRatio: number | null; method: "calibrated_world_distance" | "unavailable" } {
  if (input.metersPerNormalizedUnit == null || !Number.isFinite(input.metersPerNormalizedUnit)) {
    return { meters: null, legLengthRatio: null, method: "unavailable" };
  }
  const meters = input.offsetNormalized * input.metersPerNormalizedUnit;
  const legLengthRatio = input.legLengthM && input.legLengthM > 0 ? meters / input.legLengthM : null;
  return { meters, legLengthRatio, method: "calibrated_world_distance" };
}
