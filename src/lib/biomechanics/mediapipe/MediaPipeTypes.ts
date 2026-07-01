import { z } from "zod";

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
  /** Frame timestamp in ms, if the service provides one. */
  timestampMs: z.number().optional(),
});
export type MediaPipeFrame = z.infer<typeof mediaPipeFrameSchema>;

export const mediaPipeResultSchema = z.object({
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frames: z.array(mediaPipeFrameSchema),
});
export type MediaPipePoseResult = z.infer<typeof mediaPipeResultSchema>;
