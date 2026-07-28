import { z } from "zod";
import { rawCameraEvidenceSchema } from "../../video/recordingMode";
import { WORLD_COORDINATE_SCHEMA_VERSION } from "../../video/worldProjection";

/**
 * Shapes of the raw output a MediaPipe PoseLandmarker run produces, plus Zod
 * schemas to validate it at the service boundary. These mirror MediaPipe Tasks:
 * per frame there is a list of normalized `landmarks` (x/y in [0,1], z relative)
 * and an optional matching list of metric `worldLandmarks` (meters, hip-
 * relative). Single-person, so one landmark list per frame.
 *
 * This is the contract a real inference service (e.g. a Python PoseLandmarker
 * sidecar) must satisfy; the backend maps it onto AVA's canonical schema.
 */
export const mediaPipeLandmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
  visibility: z.number().optional(),
  presence: z.number().optional(),
});
export type MediaPipeLandmark = z.infer<typeof mediaPipeLandmarkSchema>;

export const mediaPipeFrameSchema = z.object({
  landmarks: z.array(mediaPipeLandmarkSchema),
  worldLandmarks: z.array(mediaPipeLandmarkSchema).optional(),
  sourceFrameIndex: z.number().int().nonnegative().optional(),
  sourceTimestampMs: z.number().nonnegative().optional(),
  /** Frame timestamp in ms, if the service provides one. */
  timestampMs: z.number().optional(),
  trackingConfidence: z.number().min(0).max(1).optional(),
});
export type MediaPipeFrame = z.infer<typeof mediaPipeFrameSchema>;

export const mediaPipeResultSchema = z.object({
  fps: z.number().positive(),
  sourceFps: z.number().positive().optional(),
  sourceAverageFps: z.number().positive().nullable().optional(),
  sourceNominalFps: z.number().positive().nullable().optional(),
  sourceRealFps: z.number().positive().nullable().optional(),
  sourceTimestampFps: z.number().positive().nullable().optional(),
  sourceVariableFrameRate: z.boolean().optional(),
  sourceFpsClassification: z
    .enum([
      "experimental_30_fps_class",
      "validated_60_fps_class",
      "high_speed_source_normalized_to_60",
      "unsupported_source_fps",
    ])
    .optional(),
  sourceFrameCount: z.number().int().nonnegative().optional(),
  sourceFpsTierReason: z.string().optional(),
  sourceFpsTierPolicyVersion: z.string().optional(),
  sourceDurationSeconds: z.number().nonnegative().optional(),
  sourceCodec: z.string().nullable().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cameraEvidence: rawCameraEvidenceSchema.optional(),
  coordinateSchemaVersion: z.literal(WORLD_COORDINATE_SCHEMA_VERSION).optional(),
  frames: z.array(mediaPipeFrameSchema),
});
export type MediaPipePoseResult = z.infer<typeof mediaPipeResultSchema>;
