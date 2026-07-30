import { z } from "zod";
import type { RawCameraEvidence } from "../video/recordingMode";

export const GROUND_ANCHOR_SCHEMA_VERSION = "ava-ground-anchor-v1" as const;
export const GROUND_ANCHOR_PROPAGATION_VERSION = "ava-background-affine-anchor-v1" as const;

/**
 * Minimum per-transform confidence (worker-reported, 0-1) a background camera
 * transform must clear before it may move a ground anchor or gate a timing
 * crossing. Controls: whether a single frame's estimated pan/rotate/scale is
 * trusted at all. Conservative because this is the ONLY thing standing between
 * a noisy transform and a silently-wrong timing crossing — the manifesto's
 * "be conservative whenever uncertainty exists" applies directly. Basis:
 * historical value carried over from the pre-panning-camera-mode static/world
 * anchor work; it is an existing, independently-tested value (see
 * `scripts/zone-anchor-sanity.mjs`, which asserts confidence `0.2` must be
 * rejected), not a fresh derivation. It is NOT empirically fit to the real
 * founder panning fixture — no measured confidence-vs-error curve exists in
 * this repo. Treat as a temporary MVP safety default until real-video
 * confidence/error pairs are collected and this comment is updated with them.
 */
export const MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE = 0.45;

/**
 * Maximum median re-projection residual (px, in ORIGINAL source-frame pixels)
 * a transform's inlier set may have. Controls: how tightly the fitted
 * affine/homography must actually explain the matched background features.
 * Conservative: halved from the pre-panning-camera-mode value (4px -> 2px)
 * specifically for this MVP so a loosely-fit transform cannot silently pass.
 * Basis: existing historical behavior for the first half of its lifetime (4px);
 * the tighter 2px bound is a synthetic-test-only tightening (`panning-sanity.mjs`,
 * `world-lock-sanity.mjs`) with no real-fixture residual distribution behind it
 * yet — temporary MVP safety default.
 */
export const MAX_SAFE_ANCHOR_RESIDUAL_PX = 2;

/**
 * Minimum number of background (non-athlete) feature correspondences a
 * transform must be fit from. Controls: whether there was enough independent
 * evidence to trust the fitted motion at all (a transform from a handful of
 * points can perfectly fit noise). Conservative: raised from the pre-panning
 * value (12) to require roughly double the support before trusting a frame.
 * Basis: synthetic tests only (`panning-sanity.mjs` exercises 80-feature
 * fixtures well above this floor); no measured minimum-safe-feature-count
 * study exists against the real founder video — temporary MVP safety default.
 */
export const MIN_SAFE_ANCHOR_FEATURES = 24;

/**
 * Minimum fraction of matched features RANSAC must keep as inliers. Controls:
 * rejecting a transform that is technically well-supported in feature COUNT
 * but mostly outliers (e.g. a moving crowd or the athlete dominating the
 * match set) — this is what stops athlete motion from leaking into the
 * "trusted" background estimate. Conservative: this check did not exist
 * before the panning-camera-mode work; 0.2 is a deliberately low floor (most
 * genuine background pans should clear 0.5+) chosen only to catch clearly
 * degenerate fits without yet having real-video inlier-ratio data to set a
 * tighter number safely. Basis: synthetic tests only — temporary MVP safety
 * default, expected to tighten once real panning footage is measured.
 */
export const MIN_SAFE_ANCHOR_INLIER_RATIO = 0.2;

/**
 * Maximum consecutive degraded (present-but-unreliable) frames a propagation
 * may tolerate — frozen at the last reliable position — before it is treated
 * as a fatal tracking loss. Controls: how long a brief blip (motion blur,
 * glare, a passing obstruction) may be tolerated without either (a) declaring
 * total loss on a single bad frame or (b) accumulating unverified guessed
 * movement. Conservative: 6 frames is a frame-rate-tolerance derivation, not a
 * fitted value — at the validated 60 Hz analysis clock, 6 frames = 100 ms,
 * judged short enough that no meaningful additional camera motion could have
 * occurred undetected. It intentionally does NOT extend the anchor using the
 * degraded frame's own (untrusted) numbers — see `propagateSourcePoint`,
 * which contributes zero motion from a tolerated degraded frame (position
 * freezes exactly where the last reliable frame left it) and still reports
 * the true (low) confidence and `allFramesReliable: false` throughout, so a
 * held frame can never silently read back as "safe" for a timing crossing.
 */
export const MAX_SAFE_ANCHOR_DEGRADED_FRAMES = 6;

const pointSchema = z.object({ x: z.number(), y: z.number() });
export type SourcePoint = z.infer<typeof pointSchema>;

export const groundBoundarySchema = z.object({
  boundaryId: z.string().min(1),
  boundaryType: z.enum(["start", "finish"]),
  /** Independent-gate aliases used by the stabilized consumer contract. */
  gateId: z.string().min(1).optional(),
  type: z.enum(["start", "finish"]).optional(),
  setupFrameIndex: z.number().int().nonnegative(),
  setupTimestampS: z.number().nonnegative(),
  sourceFrameLine: z.object({ c1: pointSchema, c2: pointSchema }),
  compensatedAnchorLine: z.object({ c1: pointSchema, c2: pointSchema }),
  groundAnchorVersion: z.literal(GROUND_ANCHOR_SCHEMA_VERSION),
  confidence: z.number().min(0).max(1),
  selectedByUser: z.literal(true),
  physicalReferenceDescription: z.string().min(1),
  propagationModelVersion: z.literal(GROUND_ANCHOR_PROPAGATION_VERSION),
  signedCrossingSide: z.enum(["negative_to_positive", "positive_to_negative"]),
  physicalLineOrientationDeg: z.number().optional(),
  immutableVersion: z.number().int().positive().optional(),
  validationAlignment: z.object({
    meanMidpointErrorPx: z.number().nonnegative(),
    driftRangePx: z.number().nonnegative(),
    minimumConfidence: z.number().min(0).max(1),
    annotationCount: z.number().int().positive(),
  }).optional(),
  localTracking: z.object({
    trackerVersion: z.literal("ava-local-gate-tracker-v1"),
    lockVersion: z.enum(["ava-start-line-lock-v1", "ava-finish-line-lock-v1"]),
    setupPatchPath: z.string().min(1),
    localRoi: z.array(pointSchema).min(4),
    expectedOrientationDeg: z.number(),
    expectedLengthPx: z.number().positive(),
    expectedContrast: z.number().min(0).max(1),
    appearanceDescriptor: z.array(z.number()).min(1),
    excludedObjectClasses: z.array(z.enum(["person", "cone", "hurdle", "railing", "shadow"])),
    keyframes: z.array(z.object({
      frameIndex: z.number().int().nonnegative(),
      line: z.object({ c1: pointSchema, c2: pointSchema }),
      selectedByUser: z.literal(true),
    })).min(1),
  }).optional(),
});
export type GroundBoundary = z.infer<typeof groundBoundarySchema>;

export const timingZoneAnchorSchema = z.object({
  schemaVersion: z.literal(GROUND_ANCHOR_SCHEMA_VERSION),
  startBoundary: groundBoundarySchema,
  finishBoundary: groundBoundarySchema,
  physicalDistanceM: z.number().positive(),
  zoneDistanceMeters: z.number().positive().optional(),
  startGateId: z.string().min(1).optional(),
  finishGateId: z.string().min(1).optional(),
  travelDirection: z.enum(["left_to_right", "right_to_left"]),
  bodyReference: z.enum(["torso", "hips", "head"]),
  version: z.number().int().positive(),
});
export type TimingZoneAnchor = z.infer<typeof timingZoneAnchorSchema>;

export type PropagatedBoundary = {
  c1: SourcePoint;
  c2: SourcePoint;
  midpoint: SourcePoint;
  confidence: number;
  safe: boolean;
  warnings: string[];
};

/** True when a rigid source-frame segment intersects the unclamped [0,1] viewport. */
export function sourceLineIntersectsViewport(c1: SourcePoint, c2: SourcePoint): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  for (const [p, q] of [[-dx, c1.x], [dx, 1 - c1.x], [-dy, c1.y], [dy, 1 - c1.y]] as const) {
    if (p === 0 && q < 0) return false;
    if (p === 0) continue;
    const ratio = q / p;
    if (p < 0) t0 = Math.max(t0, ratio);
    else t1 = Math.min(t1, ratio);
    if (t0 > t1) return false;
  }
  return true;
}

export type Transform = RawCameraEvidence["transforms"][number];

/** Production camera evidence is previous source frame -> current source frame. */
export function applyForward(point: SourcePoint, transform: Transform, width: number, height: number): SourcePoint {
  if (transform.transformType === "homography" && transform.homography?.length === 9) {
    const [a, b, c, d, e, f, g, h, i] = transform.homography;
    const x = point.x * width;
    const y = point.y * height;
    const w = g * x + h * y + i;
    if (Math.abs(w) > 1e-12) return { x: (a * x + b * y + c) / w / width, y: (d * x + e * y + f) / w / height };
  }
  const theta = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta) * transform.scale;
  const sin = Math.sin(theta) * transform.scale;
  const px = point.x * width;
  const py = point.y * height;
  return {
    x: (cos * px - sin * py + transform.translationX * width) / width,
    y: (sin * px + cos * py + transform.translationY * height) / height,
  };
}

/** Explicit inverse of the stored previous -> current partial-affine transform. */
export function applyInverse(point: SourcePoint, transform: Transform, width: number, height: number): SourcePoint {
  if (transform.transformType === "homography" && transform.homography?.length === 9) {
    const m = transform.homography;
    const a = m[4] * m[8] - m[5] * m[7];
    const b = m[2] * m[7] - m[1] * m[8];
    const c = m[1] * m[5] - m[2] * m[4];
    const d = m[5] * m[6] - m[3] * m[8];
    const e = m[0] * m[8] - m[2] * m[6];
    const f = m[2] * m[3] - m[0] * m[5];
    const g = m[3] * m[7] - m[4] * m[6];
    const h = m[1] * m[6] - m[0] * m[7];
    const i = m[0] * m[4] - m[1] * m[3];
    const det = m[0] * a + m[1] * d + m[2] * g;
    if (Math.abs(det) > 1e-12) {
      const x = point.x * width;
      const y = point.y * height;
      const w = (g * x + h * y + i) / det;
      if (Math.abs(w) > 1e-12) return {
        x: ((a * x + b * y + c) / det) / w / width,
        y: ((d * x + e * y + f) / det) / w / height,
      };
    }
  }
  const theta = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta) * transform.scale;
  const sin = Math.sin(theta) * transform.scale;
  const det = cos * cos + sin * sin;
  const x = point.x * width - transform.translationX * width;
  const y = point.y * height - transform.translationY * height;
  return { x: (cos * x + sin * y) / det / width, y: (-sin * x + cos * y) / det / height };
}

function transformAt(evidence: RawCameraEvidence, frame: number): Transform | undefined {
  return evidence.transforms.find((item) => item.frame === frame);
}

export function propagateSourcePoint(
  point: SourcePoint,
  setupFrameIndex: number,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): { point: SourcePoint; confidence: number; safe: boolean; allFramesReliable: boolean; warnings: string[] } {
  let current = point;
  let confidence = 1;
  let degradedRunFrames = 0;
  let fatalTrackingLoss = false;
  // False the moment ANY inspected transform fails ANY reliability criterion —
  // confidence, feature count, inlier ratio, or residual — even if that frame was
  // only briefly tolerated and never became fatal. `confidence` alone cannot carry
  // this: a transform can report high raw confidence while still failing on
  // features/inliers/residual, and callers that gate a TIMING CROSSING must reject
  // that case too (a merely "not fatal" propagation is not the same as "every frame
  // was actually trustworthy").
  let allFramesReliable = true;
  const warnings = new Set<string>();
  /** Inspects one transform. Returns the transform to compose with (or null to
   *  hold position for this frame) plus whether propagation must stop now. */
  const inspect = (transform: Transform | undefined): { apply: Transform | null; stop: boolean } => {
    if (!transform) {
      confidence = 0;
      fatalTrackingLoss = true;
      allFramesReliable = false;
      warnings.add("missing_camera_transform");
      return { apply: null, stop: true };
    }
    // Confidence always reflects the worst transform this call actually touched,
    // even during a tolerated brief hold — a degraded frame must never silently
    // read back as full confidence to a downstream safety gate. This alone is NOT
    // sufficient for crossing safety (see `allFramesReliable` above); it is what
    // gates general rendering/projection tolerance.
    confidence = Math.min(confidence, transform.confidence);
    const reliable = transform.confidence >= MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE
      && transform.supportingFeatureCount >= MIN_SAFE_ANCHOR_FEATURES
      && transform.inlierRatio >= MIN_SAFE_ANCHOR_INLIER_RATIO
      && transform.residualPx != null
      && transform.residualPx <= MAX_SAFE_ANCHOR_RESIDUAL_PX;
    if (reliable) {
      degradedRunFrames = 0;
      return { apply: transform, stop: false };
    }
    allFramesReliable = false;
    degradedRunFrames += 1;
    warnings.add("brief_camera_transform_degradation");
    if (degradedRunFrames > MAX_SAFE_ANCHOR_DEGRADED_FRAMES) {
      fatalTrackingLoss = true;
      if (transform.confidence < MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE) warnings.add("low_transform_confidence");
      if (transform.supportingFeatureCount < MIN_SAFE_ANCHOR_FEATURES) warnings.add("insufficient_feature_support");
      if (transform.inlierRatio < MIN_SAFE_ANCHOR_INLIER_RATIO) warnings.add("insufficient_inlier_ratio");
      if (transform.residualPx == null || transform.residualPx > MAX_SAFE_ANCHOR_RESIDUAL_PX) warnings.add("unsafe_transform_residual");
      return { apply: null, stop: true };
    }
    // Bounded hold: a tolerated degraded frame contributes NO motion at all (never
    // the untrusted current transform, and never a re-application of a stale prior
    // one) — position freezes exactly where the last reliable frame left it, so a
    // run of brief blips can never accumulate guessed movement.
    return { apply: null, stop: false };
  };

  if (targetFrameIndex > setupFrameIndex) {
    for (let frame = setupFrameIndex + 1; frame <= targetFrameIndex; frame += 1) {
      const { apply, stop } = inspect(transformAt(evidence, frame));
      if (stop) break;
      if (apply) current = applyForward(current, apply, width, height);
    }
  } else {
    for (let frame = setupFrameIndex; frame > targetFrameIndex; frame -= 1) {
      const { apply, stop } = inspect(transformAt(evidence, frame));
      if (stop) break;
      if (apply) current = applyInverse(current, apply, width, height);
    }
  }
  const inUnsafeRange = evidence.unstableFrameRanges.some(
    (range) => targetFrameIndex >= range.startFrame && targetFrameIndex <= range.endFrame,
  );
  if (inUnsafeRange && degradedRunFrames > MAX_SAFE_ANCHOR_DEGRADED_FRAMES) {
    fatalTrackingLoss = true;
    warnings.add("unstable_frame_range");
  }
  return { point: current, confidence, safe: !fatalTrackingLoss, allFramesReliable, warnings: [...warnings] };
}

export function sourcePointToCompensated(
  point: SourcePoint,
  setupFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): SourcePoint {
  return propagateSourcePoint(point, setupFrameIndex, 0, evidence, width, height).point;
}

export function compensatedPointToSourceFrame(
  point: SourcePoint,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): SourcePoint {
  return propagateSourcePoint(point, 0, targetFrameIndex, evidence, width, height).point;
}

export function propagateAnchorFromSetupToFrame(
  boundary: GroundBoundary,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): PropagatedBoundary {
  const a = propagateSourcePoint(boundary.sourceFrameLine.c1, boundary.setupFrameIndex, targetFrameIndex, evidence, width, height);
  const b = propagateSourcePoint(boundary.sourceFrameLine.c2, boundary.setupFrameIndex, targetFrameIndex, evidence, width, height);
  const confidence = Math.min(boundary.confidence, a.confidence, b.confidence);
  const warnings = [...new Set([...a.warnings, ...b.warnings])];
  return {
    c1: a.point,
    c2: b.point,
    midpoint: { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 },
    confidence,
    // `allFramesReliable` (not just the confidence number) is required: a tolerated
    // hold can carry a high raw transform.confidence while still failing on feature
    // count, inlier ratio, or residual, and a timing crossing must reject that too.
    safe: a.safe && b.safe && a.allFramesReliable && b.allFramesReliable
      && confidence >= MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE,
    warnings,
  };
}

/**
 * Reproject a raw canonical gate line (its two persisted source-frame endpoints)
 * from its setup source frame to any target source frame using ONLY the authoritative
 * background camera model. This is the single, shared transform a MANUAL-CONFIRMED
 * timing zone must render through: it is exact (identity) at the setup frame, and it
 * compensates a real camera pan/zoom everywhere else. It never consults the athlete's
 * pose — a moving athlete in front of a static camera reprojects to the SAME source
 * coordinates on every frame, so a confirmed zone cannot drift off its painted line.
 *
 * Mirrors {@link propagateAnchorFromSetupToFrame} but takes raw endpoints instead of a
 * full {@link GroundBoundary}, so it can drive the canonical_raw render path directly.
 */
export function reprojectSourceLineToFrame(
  c1: SourcePoint,
  c2: SourcePoint,
  setupFrameIndex: number,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): PropagatedBoundary {
  const a = propagateSourcePoint(c1, setupFrameIndex, targetFrameIndex, evidence, width, height);
  const b = propagateSourcePoint(c2, setupFrameIndex, targetFrameIndex, evidence, width, height);
  const confidence = Math.min(a.confidence, b.confidence);
  return {
    c1: a.point,
    c2: b.point,
    midpoint: { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 },
    confidence,
    safe: a.safe && b.safe && a.allFramesReliable && b.allFramesReliable
      && confidence >= MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE,
    warnings: [...new Set([...a.warnings, ...b.warnings])],
  };
}

export type CrossingSample = { frameIndex: number; timestampS: number; bodyPoint: SourcePoint; confidence: number };
export const WORLD_GATE_CROSSING_MODEL_VERSION = "ava-world-gate-crossing-v1" as const;
export type WorldGateCrossing = {
  timestampS: number;
  confidence: number;
  beforeFrame: number;
  afterFrame: number;
  timestampBeforeS: number;
  timestampAfterS: number;
  signedDistanceBefore: number;
  signedDistanceAfter: number;
  interpolationFraction: number;
  gateConfidence: number;
  transformConfidence: number;
  bodyConfidence: number;
  featureSupport: number;
  affineResidualPx: number;
  modelVersion: typeof WORLD_GATE_CROSSING_MODEL_VERSION;
};
export function detectWorldBoundaryCrossing(
  samples: CrossingSample[],
  boundary: GroundBoundary,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
  direction: "left_to_right" | "right_to_left",
): WorldGateCrossing | null {
  let previous: { sample: CrossingSample; side: number; boundaryConfidence: number } | null = null;
  for (const sample of samples) {
    const line = propagateAnchorFromSetupToFrame(boundary, sample.frameIndex, evidence, width, height);
    if (!line.safe) { previous = null; continue; }
    const lineLength = Math.hypot(line.c2.x - line.c1.x, line.c2.y - line.c1.y);
    if (lineLength <= 1e-12) { previous = null; continue; }
    const side = ((line.c2.x - line.c1.x) * (sample.bodyPoint.y - line.c1.y)
      - (line.c2.y - line.c1.y) * (sample.bodyPoint.x - line.c1.x)) / lineLength;
    if (previous && previous.side !== 0 && side !== 0 && Math.sign(previous.side) !== Math.sign(side)) {
      const fraction = Math.abs(previous.side) / (Math.abs(previous.side) + Math.abs(side));
      const expected = boundary.signedCrossingSide ?? (direction === "left_to_right" ? "negative_to_positive" : "positive_to_negative");
      if ((expected === "negative_to_positive" && !(previous.side < 0 && side > 0))
        || (expected === "positive_to_negative" && !(previous.side > 0 && side < 0))) {
        previous = { sample, side, boundaryConfidence: line.confidence };
        continue;
      }
      return {
        timestampS: previous.sample.timestampS + fraction * (sample.timestampS - previous.sample.timestampS),
        confidence: Math.min(previous.sample.confidence, sample.confidence, previous.boundaryConfidence, line.confidence),
        beforeFrame: previous.sample.frameIndex,
        afterFrame: sample.frameIndex,
        timestampBeforeS: previous.sample.timestampS,
        timestampAfterS: sample.timestampS,
        signedDistanceBefore: previous.side,
        signedDistanceAfter: side,
        interpolationFraction: fraction,
        gateConfidence: boundary.confidence,
        transformConfidence: Math.min(previous.boundaryConfidence, line.confidence),
        bodyConfidence: Math.min(previous.sample.confidence, sample.confidence),
        featureSupport: Math.min(
          transformAt(evidence, previous.sample.frameIndex)?.supportingFeatureCount ?? 0,
          transformAt(evidence, sample.frameIndex)?.supportingFeatureCount ?? 0,
        ),
        affineResidualPx: Math.max(
          transformAt(evidence, previous.sample.frameIndex)?.residualPx ?? Infinity,
          transformAt(evidence, sample.frameIndex)?.residualPx ?? Infinity,
        ),
        modelVersion: WORLD_GATE_CROSSING_MODEL_VERSION,
      };
    }
    previous = { sample, side, boundaryConfidence: line.confidence };
  }
  return null;
}
