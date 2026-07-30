import { z } from "zod";
import { cameraTransformFrameSchema } from "./recordingMode";

/**
 * Phase 1 global keyframe camera path (see docs in
 * `src/lib/biomechanics/mediapipe/runtime/camera_path.py`, the worker module
 * that computes this artifact once, offline). Replaces the browser's fragile
 * unbounded sequential chain: every frame's global transform is RESOLVED HERE
 * by the worker and looked up directly — the browser never composes a chain.
 *
 * `*Matrix` fields reuse the exact `cameraTransformFrameSchema` shape (a
 * decomposed similarity transform: rotation + uniform scale + translation) so
 * the browser projects through them with the SAME, already-tested
 * `applyForward`/`applyInverse` primitives (`zoneAnchors.ts`) used by the
 * legacy per-frame chain — no new matrix math. This is a real, honest
 * simplification, not a raw 3x3/2x3 array: Phase 1 is partial-affine only
 * (Part 3 of the spec), and `estimateAffinePartial2D` never returns
 * shear/non-uniform scale, so the decomposed form carries zero information
 * loss versus a raw matrix.
 *
 * Phase 2 (Part 9) adds manual World-Lock Repair provenance. `version` is now
 * an enum of v1 (Phase 1, no repair fields ever present) and v2 (Phase 1 +
 * Phase 2 repair provenance) — a v1 artifact parses exactly as it always did
 * (every new field below is `.optional()`), so old analyses are never
 * silently reinterpreted. `CAMERA_PATH_VERSION` is the version the worker
 * emits going forward; `CAMERA_PATH_VERSION_LEGACY_V1` is accepted on read.
 */
export const CAMERA_PATH_VERSION_LEGACY_V1 = "ava-camera-path-v1" as const;
export const CAMERA_PATH_VERSION_V2 = "ava-camera-path-v2" as const;
export const CAMERA_PATH_VERSION = CAMERA_PATH_VERSION_V2;

const affineMatrixSchema = cameraTransformFrameSchema;
export type AffineMatrix = z.infer<typeof affineMatrixSchema>;

export const cameraKeyframeStateSchema = z.enum(["anchored", "local_only", "unavailable"]);
export type CameraKeyframeState = z.infer<typeof cameraKeyframeStateSchema>;

/** "automatic" = Phase 1 rebase/ORB-relock; "manual" = Phase 2 confirmed repair. */
export const cameraKeyframeOriginSchema = z.enum(["automatic", "manual"]);
export type CameraKeyframeOrigin = z.infer<typeof cameraKeyframeOriginSchema>;

export const cameraKeyframeSchema = z.object({
  keyframeId: z.string().min(1),
  frameIndex: z.number().int().nonnegative(),
  /** Reference-frame -> this keyframe. `null` when never anchored (local_only). */
  keyframeToGlobalMatrix: affineMatrixSchema.nullable(),
  /** This keyframe -> reference frame. `null` when never anchored. */
  globalToKeyframeMatrix: affineMatrixSchema.nullable(),
  state: cameraKeyframeStateSchema,
  featureCount: z.number().int().nonnegative(),
  inlierCount: z.number().int().nonnegative(),
  inlierRatio: z.number().min(0).max(1),
  residualPx: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  parentKeyframeId: z.string().nullable(),
  /** True when this keyframe was created via a relock (Part 5), not a rebase. */
  relockEvent: z.boolean().optional(),
  /** Absent on v1 artifacts and pre-Phase-2 keyframes; treat as "automatic". */
  origin: cameraKeyframeOriginSchema.optional(),
  /** Set only when `origin === "manual"` — the repair that created this keyframe. */
  repairId: z.string().nullable().optional(),
});
export type CameraKeyframe = z.infer<typeof cameraKeyframeSchema>;

export const cameraFramePathSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  keyframeId: z.string().min(1),
  /** This keyframe -> this frame (local, always present). */
  keyframeToFrameMatrix: affineMatrixSchema,
  /** This frame -> this keyframe (local inverse, always present). */
  frameToKeyframeMatrix: affineMatrixSchema,
  /** Reference frame -> this frame. `null` unless `state === "anchored"`. */
  globalToFrameMatrix: affineMatrixSchema.nullable(),
  /** This frame -> reference frame. `null` unless `state === "anchored"`. */
  frameToGlobalMatrix: affineMatrixSchema.nullable(),
  state: cameraKeyframeStateSchema,
  confidence: z.number().min(0).max(1),
  featureCount: z.number().int().nonnegative(),
  inlierCount: z.number().int().nonnegative(),
  inlierRatio: z.number().min(0).max(1),
  residualPx: z.number().nonnegative().nullable(),
});
export type CameraFramePath = z.infer<typeof cameraFramePathSchema>;

export const cameraPathRangeSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
});
export type CameraPathRange = z.infer<typeof cameraPathRangeSchema>;

// --- Phase 2: manual repair (Part 9) ---
export const landmarkPointPairSchema = z.object({
  id: z.string().min(1),
  referencePoint: z.object({ x: z.number(), y: z.number() }),
  targetPoint: z.object({ x: z.number(), y: z.number() }),
});
export type LandmarkPointPairRecord = z.infer<typeof landmarkPointPairSchema>;

export const repairStatusSchema = z.enum(["accepted", "superseded", "invalidated"]);
export type RepairStatus = z.infer<typeof repairStatusSchema>;

export const manualCameraPathRepairSchema = z.object({
  repairId: z.string().min(1),
  createdAt: z.string(),
  referenceFrameIndex: z.number().int().nonnegative(),
  targetFrameIndex: z.number().int().nonnegative(),
  pointPairs: z.array(landmarkPointPairSchema).min(2),
  /** Explicit direction names (Part 5) — never an ambiguous bare "transform". */
  targetFrameToReferenceMatrix: affineMatrixSchema,
  targetFrameToGlobalMatrix: affineMatrixSchema,
  meanErrorPx: z.number().nonnegative(),
  maxErrorPx: z.number().nonnegative(),
  scale: z.number().positive(),
  rotationDeg: z.number(),
  acceptedBy: z.string().min(1),
  status: repairStatusSchema,
  /** Calibration revision this repair was confirmed under (optimistic concurrency). */
  version: z.number().int().nonnegative(),
});
export type ManualCameraPathRepair = z.infer<typeof manualCameraPathRepairSchema>;

export const cameraPathArtifactSchema = z.object({
  version: z.enum([CAMERA_PATH_VERSION_LEGACY_V1, CAMERA_PATH_VERSION_V2]),
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  sourceFps: z.number().positive().nullable(),
  totalFrames: z.number().int().positive(),
  globalReferenceFrameIndex: z.number().int().nonnegative(),
  keyframes: z.array(cameraKeyframeSchema),
  framePaths: z.array(cameraFramePathSchema),
  diagnostics: z.object({
    keyframeCount: z.number().int().nonnegative(),
    relockAttemptCount: z.number().int().nonnegative(),
    relockSuccessCount: z.number().int().nonnegative(),
    globallyCoveredFrameCount: z.number().int().nonnegative(),
    unavailableFrameRanges: z.array(cameraPathRangeSchema),
    meanConfidence: z.number().min(0).max(1),
    /** Absent on v1 / never-repaired artifacts. */
    manualKeyframeCount: z.number().int().nonnegative().optional(),
    repairCount: z.number().int().nonnegative().optional(),
    unavailableFrameRangesBeforeRepair: z.array(cameraPathRangeSchema).optional(),
    repairedFrameRanges: z.array(cameraPathRangeSchema).optional(),
  }),
  /** Accepted manual repairs, in application order. Absent/empty on v1 or
   *  never-repaired artifacts — never silently reinterpreted as anything else. */
  repairs: z.array(manualCameraPathRepairSchema).optional(),
});
export type CameraPathArtifact = z.infer<typeof cameraPathArtifactSchema>;
