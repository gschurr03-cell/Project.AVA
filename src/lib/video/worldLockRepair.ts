/**
 * Phase 2 — Manual World-Lock Repair: the shared partial-affine estimator and
 * validation used by the browser's live repair preview (`TimingWorkspace.tsx`).
 *
 * This is a linear least-squares fit of a similarity transform (uniform scale
 * + rotation + translation — the same 4-DOF model as the existing partial-
 * affine `Transform`/`*Matrix` shape) from 2-4 user-placed point pairs. It is
 * NOT RANSAC — with only 2-4 manually placed points, robust outlier rejection
 * doesn't apply; every placed pair is used, and quality is judged by the
 * reprojection-error checks in {@link validateRepairCandidate} instead.
 *
 * CRITICAL: `src/lib/biomechanics/mediapipe/runtime/repair_transform.py` is a
 * byte-for-byte arithmetic mirror of `fitPartialAffine` below (same normal-
 * equation construction, same 4x4 solve) so the browser's live preview and
 * the worker's authoritative rebuild-on-rerun always agree (Part 11's stop
 * condition: "browser and worker apply the repair differently"). If you
 * change the math here, change it there too — see the cross-language
 * agreement test in `scripts/world-lock-repair-sanity.mjs`.
 */
import type { SourcePoint } from "../calibration/zoneAnchors";

export const REPAIR_TRANSFORM_MODEL = "partial_affine" as const;

export interface LandmarkPointPair {
  id: string;
  /** Normalized [0,1] point in the REFERENCE (already globally anchored) frame. */
  referencePoint: SourcePoint;
  /** Normalized [0,1] point in the TARGET (unavailable) frame. */
  targetPoint: SourcePoint;
}

/** The decomposed-similarity shape reused everywhere else (see cameraPathSchema.ts). */
export interface DecomposedSimilarity {
  rotationDeg: number;
  scale: number;
  translationX: number;
  translationY: number;
}

/** Solve the 4x4 normal-equations system `M x = v` via Gaussian elimination
 *  with partial pivoting. Generic and small on purpose — this exact routine
 *  is mirrored in Python so both languages do IDENTICAL arithmetic. */
function solve4x4(matrix: number[][], vector: number[]): number[] | null {
  const m = matrix.map((row) => [...row]);
  const v = [...vector];
  const n = 4;
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(m[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > pivotValue) {
        pivotValue = Math.abs(m[row][col]);
        pivotRow = row;
      }
    }
    if (pivotValue < 1e-12) return null;
    if (pivotRow !== col) {
      [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
      [v[col], v[pivotRow]] = [v[pivotRow], v[col]];
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < n; k += 1) m[row][k] -= factor * m[col][k];
      v[row] -= factor * v[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = v[row];
    for (let k = row + 1; k < n; k += 1) sum -= m[row][k] * x[k];
    x[row] = sum / m[row][row];
  }
  return x;
}

export interface FittedAffine {
  /** x' = a*x - b*y + tx ; y' = b*x + a*y + ty, mapping TARGET pixel -> REFERENCE pixel. */
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/**
 * Fit `targetFrameToReferenceFrame` (PIXEL space) from N>=2 point pairs via
 * ordinary least squares on the linear (a,b,tx,ty) parametrization of a
 * similarity transform. Returns `null` only when the normal-equations matrix
 * is singular (e.g. every target point identical — a degenerate layout the
 * caller should already have rejected before calling this).
 */
export function fitPartialAffine(
  pairs: { target: { x: number; y: number }; reference: { x: number; y: number } }[],
): FittedAffine | null {
  if (pairs.length < 2) return null;
  let S = 0, Sx = 0, Sy = 0, Sxr = 0, Syr = 0, Srx = 0, Sry = 0;
  const n = pairs.length;
  for (const { target: t, reference: r } of pairs) {
    S += t.x * t.x + t.y * t.y;
    Sx += t.x;
    Sy += t.y;
    Sxr += t.x * r.x + t.y * r.y;
    Syr += -t.y * r.x + t.x * r.y;
    Srx += r.x;
    Sry += r.y;
  }
  const matrix = [
    [S, 0, Sx, Sy],
    [0, S, -Sy, Sx],
    [Sx, -Sy, n, 0],
    [Sy, Sx, 0, n],
  ];
  const vector = [Sxr, Syr, Srx, Sry];
  const solved = solve4x4(matrix, vector);
  if (!solved) return null;
  const [a, b, tx, ty] = solved;
  return { a, b, tx, ty };
}

/** `translationX`/`Y` here are PIXEL space — callers normalize by width/height
 *  when writing into the schema's `AffineMatrix` shape (which stores
 *  normalized translation, matching every other `*Matrix` in this codebase). */
export function affineToDecomposedSimilarity(fit: FittedAffine): DecomposedSimilarity {
  const scale = Math.hypot(fit.a, fit.b);
  const rotationDeg = (Math.atan2(fit.b, fit.a) * 180) / Math.PI;
  return { rotationDeg, scale: Math.max(1e-6, scale), translationX: fit.tx, translationY: fit.ty };
}

/** Inverse of {@link affineToDecomposedSimilarity}: read a schema-shaped
 *  `AffineMatrix` (normalized translation) back into a pixel-space
 *  `FittedAffine` for composition/application. */
export function decomposedSimilarityToFittedAffine(
  decomposed: DecomposedSimilarity, sourceWidth: number, sourceHeight: number,
): FittedAffine {
  const theta = (decomposed.rotationDeg * Math.PI) / 180;
  return {
    a: Math.cos(theta) * decomposed.scale,
    b: Math.sin(theta) * decomposed.scale,
    tx: decomposed.translationX * sourceWidth,
    ty: decomposed.translationY * sourceHeight,
  };
}

export function applyFittedAffine(fit: FittedAffine, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: fit.a * point.x - fit.b * point.y + fit.tx,
    y: fit.b * point.x + fit.a * point.y + fit.ty,
  };
}

/**
 * Compose two fitted affines: apply `earlier` first, then `later` — i.e. the
 * result maps a point exactly like `applyFittedAffine(later, applyFittedAffine(earlier, p))`,
 * closed-form (no intermediate point needed). Used to derive
 * `targetFrameToGlobal = compose(referenceKeyframeToGlobal, targetFrameToReferenceFrame)`
 * for the browser's live preview — the worker recomputes this authoritatively
 * on rerun (Part 11), so this is a best-effort preview value only.
 *
 * Closed form: treating (a,b) as a complex number w=a+bi (this IS what a
 * partial-affine represents: z' = w*z + t), composition is ordinary complex
 * multiplication: w = w_earlier * w_later, t = w_later*t_earlier + t_later.
 */
export function composeFittedAffine(later: FittedAffine, earlier: FittedAffine): FittedAffine {
  return {
    a: earlier.a * later.a - earlier.b * later.b,
    b: earlier.a * later.b + earlier.b * later.a,
    tx: later.a * earlier.tx - later.b * earlier.ty + later.tx,
    ty: later.b * earlier.tx + later.a * earlier.ty + later.ty,
  };
}

export function invertFittedAffine(fit: FittedAffine): FittedAffine | null {
  const det = fit.a * fit.a + fit.b * fit.b;
  if (det < 1e-12) return null;
  const ia = fit.a / det;
  const ib = -fit.b / det;
  // Solve for the inverse mapping's translation: apply inverse rotation/scale to -translation.
  const itx = -(ia * fit.tx - ib * fit.ty);
  const ity = -(ib * fit.tx + ia * fit.ty);
  return { a: ia, b: ib, tx: itx, ty: ity };
}

// --- Validation (Part 6) — MVP conservative defaults, documented, tunable later. ---
export const REPAIR_MIN_PAIRS = 2;
export const REPAIR_PREFERRED_PAIRS = 3;
export const REPAIR_MAX_MEAN_ERROR_PX = 4;
export const REPAIR_MAX_MAX_ERROR_PX = 8;
export const REPAIR_MIN_SCALE = 0.5;
export const REPAIR_MAX_SCALE = 2.0;
export const REPAIR_MAX_ROTATION_DEG = 25;
/** Two points closer than this (normalized) are treated as duplicates. */
export const REPAIR_MIN_POINT_SEPARATION = 0.01;
/** For 3+ points, the triangle/point-spread area (normalized, cross-product based)
 *  must exceed this or the layout is rejected as collinear/degenerate. */
export const REPAIR_MIN_SPREAD_AREA = 0.0015;

export type RepairRejectionReason =
  | "insufficient_pairs"
  | "duplicate_points"
  | "collinear_points"
  | "non_invertible"
  | "excessive_mean_error"
  | "excessive_max_error"
  | "implausible_scale"
  | "implausible_rotation";

export interface RepairValidation {
  pairCount: number;
  meanErrorPx: number;
  maxErrorPx: number;
  scale: number;
  rotationDeg: number;
  translationX: number;
  translationY: number;
  spatialSpreadArea: number;
  invertible: boolean;
  accepted: boolean;
  rejectionReasons: RepairRejectionReason[];
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shoelace-formula spread "area" over the convex hull order of the raw point
 *  list (good enough at N<=4 to catch near-collinear layouts; not a true hull). */
function spreadArea(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return Math.abs(area) / 2;
}

function hasDuplicatePoints(points: { x: number; y: number }[]): boolean {
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (pointDistance(points[i], points[j]) < REPAIR_MIN_POINT_SEPARATION) return true;
    }
  }
  return false;
}

/**
 * Full validation pipeline (Part 6): fits the transform, then checks every
 * acceptance gate. Never partially accepts — either every gate passes and
 * `accepted` is true, or `rejectionReasons` lists every gate that failed
 * (not just the first) so the UI can explain the exact reason(s).
 */
export function validateRepairCandidate(
  pairs: LandmarkPointPair[],
  sourceWidth: number,
  sourceHeight: number,
): RepairValidation {
  const reasons: RepairRejectionReason[] = [];
  const pairCount = pairs.length;
  if (pairCount < REPAIR_MIN_PAIRS) reasons.push("insufficient_pairs");

  const targetPoints = pairs.map((p) => p.targetPoint);
  const referencePoints = pairs.map((p) => p.referencePoint);
  if (hasDuplicatePoints(targetPoints) || hasDuplicatePoints(referencePoints)) {
    reasons.push("duplicate_points");
  }
  const targetArea = spreadArea(targetPoints);
  if (pairCount >= 3 && targetArea < REPAIR_MIN_SPREAD_AREA) reasons.push("collinear_points");

  if (pairCount < REPAIR_MIN_PAIRS || reasons.includes("duplicate_points")) {
    return {
      pairCount, meanErrorPx: Infinity, maxErrorPx: Infinity, scale: 0, rotationDeg: 0,
      translationX: 0, translationY: 0, spatialSpreadArea: targetArea, invertible: false,
      accepted: false, rejectionReasons: reasons,
    };
  }

  const pixelPairs = pairs.map((p) => ({
    target: { x: p.targetPoint.x * sourceWidth, y: p.targetPoint.y * sourceHeight },
    reference: { x: p.referencePoint.x * sourceWidth, y: p.referencePoint.y * sourceHeight },
  }));
  const fit = fitPartialAffine(pixelPairs);
  if (!fit) {
    reasons.push("non_invertible");
    return {
      pairCount, meanErrorPx: Infinity, maxErrorPx: Infinity, scale: 0, rotationDeg: 0,
      translationX: 0, translationY: 0, spatialSpreadArea: targetArea, invertible: false,
      accepted: false, rejectionReasons: reasons,
    };
  }
  const inverse = invertFittedAffine(fit);
  if (!inverse) reasons.push("non_invertible");

  const errors = pixelPairs.map(({ target, reference }) => {
    const predicted = applyFittedAffine(fit, target);
    return pointDistance(predicted, reference);
  });
  const meanErrorPx = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  const maxErrorPx = Math.max(...errors);
  if (meanErrorPx > REPAIR_MAX_MEAN_ERROR_PX) reasons.push("excessive_mean_error");
  if (maxErrorPx > REPAIR_MAX_MAX_ERROR_PX) reasons.push("excessive_max_error");

  const decomposed = affineToDecomposedSimilarity(fit);
  if (decomposed.scale < REPAIR_MIN_SCALE || decomposed.scale > REPAIR_MAX_SCALE) {
    reasons.push("implausible_scale");
  }
  const normalizedRotation = Math.abs(((decomposed.rotationDeg + 180) % 360) - 180);
  if (normalizedRotation > REPAIR_MAX_ROTATION_DEG) reasons.push("implausible_rotation");

  return {
    pairCount, meanErrorPx, maxErrorPx, scale: decomposed.scale, rotationDeg: decomposed.rotationDeg,
    translationX: decomposed.translationX / sourceWidth, translationY: decomposed.translationY / sourceHeight,
    spatialSpreadArea: targetArea, invertible: inverse != null,
    accepted: reasons.length === 0, rejectionReasons: reasons,
  };
}
