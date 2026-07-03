import { z } from "zod";

/**
 * Canonical pose vocabulary for Project AVA.
 *
 * This is the backend-agnostic contract between a pose estimator and the
 * biomechanics math. Every backend (MediaPipe now, RTMPose later) maps its
 * native keypoints onto this canonical set and omits any joint it cannot
 * provide — so the metrics layer never sees a backend-specific format.
 *
 * Coordinates are normalized image coordinates in [0, 1], origin at the
 * top-left (so pixel-based RTMPose and MediaPipe's normalized output converge).
 * `world` carries optional metric 3D (meters, hip-relative) that MediaPipe
 * emits and RTMPose does not — consumers must treat it as optional.
 */
export const CANONICAL_JOINTS = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_toe",
  "right_toe",
  // Upper limbs — added Day 54 for arm/shoulder tracking. MediaPipe already
  // emits these; they are consumed by the interactive overlay (arm segments and
  // elbow/shoulder angles). No existing lower-body metric reads them.
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
] as const;

export const jointNameSchema = z.enum(CANONICAL_JOINTS);
export type JointName = (typeof CANONICAL_JOINTS)[number];

export const keypointSchema = z.object({
  /** Normalized image x in [0, 1]. */
  x: z.number(),
  /** Normalized image y in [0, 1]. */
  y: z.number(),
  /** Detector confidence, 0..1. */
  score: z.number().min(0).max(1),
  /** Optional occlusion/visibility signal, 0..1 (MediaPipe). */
  visibility: z.number().min(0).max(1).optional(),
  /** Optional metric 3D in meters, hip-relative (MediaPipe world landmarks). */
  world: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
});
export type Keypoint = z.infer<typeof keypointSchema>;

/**
 * One frame of pose. `keypoints` is intentionally partial: lossy backends omit
 * joints they can't localize rather than fabricating them.
 */
export const poseFrameSchema = z.object({
  /** 0-based frame index within the sequence. */
  index: z.number().int().nonnegative(),
  /** Frame timestamp in milliseconds from the start of the clip. */
  tMs: z.number().nonnegative(),
  keypoints: z.record(jointNameSchema, keypointSchema),
});
/** Partial keypoint map is guaranteed here regardless of Zod's record inference. */
export type PoseFrame = Omit<z.infer<typeof poseFrameSchema>, "keypoints"> & {
  keypoints: Partial<Record<JointName, Keypoint>>;
};

/**
 * A full pose estimation result for one video: ordered frames plus the metadata
 * the metrics layer needs (fps for time conversion, dimensions for un-
 * normalizing, and provenance).
 */
export const poseSequenceSchema = z.object({
  backend: z.string(),
  modelVersion: z.string(),
  coordSpace: z.literal("normalized"),
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frames: z.array(poseFrameSchema),
});
export type PoseSequence = Omit<z.infer<typeof poseSequenceSchema>, "frames"> & {
  frames: PoseFrame[];
};
