import { poseSequenceSchema, type PoseFrame, type PoseSequence } from "../pose";
import type { PoseBackend, PoseEstimateOptions, VideoRef } from "../pose-backend";

import { mapFrameToKeypoints } from "./MediaPipeLandmarkMap";
import { mediaPipeResultSchema, type MediaPipePoseResult } from "./MediaPipeTypes";

const BACKEND_NAME = "mediapipe" as const;
const MODEL_VERSION = "mediapipe-pose-0.1";

/**
 * The inference boundary. A concrete service runs MediaPipe PoseLandmarker over
 * the video and returns raw landmarks. It is injected so the backend's mapping
 * and validation can be exercised without a real runtime, and so a future
 * Python PoseLandmarker sidecar drops in without touching the mapping code.
 */
export interface MediaPipePoseService {
  run(video: VideoRef, opts?: PoseEstimateOptions): Promise<MediaPipePoseResult>;
}

/**
 * Default service used when no real MediaPipe runtime is wired up. Everything
 * else in this module (typing, mapping, schema validation) is fully real — this
 * throws *only* when actual inference is attempted.
 */
export class UnavailableMediaPipeService implements MediaPipePoseService {
  async run(): Promise<MediaPipePoseResult> {
    throw new Error(
      "MediaPipe runtime is not available yet — inject a MediaPipePoseService " +
        "that runs PoseLandmarker (e.g. a Python sidecar) to enable real inference.",
    );
  }
}

/**
 * Turn a raw MediaPipe result into a validated canonical {@link PoseSequence}.
 * Pure and runtime-independent: validates the service output, maps each frame's
 * landmarks onto canonical joints, then validates the assembled sequence.
 */
export function buildPoseSequence(raw: MediaPipePoseResult): PoseSequence {
  const result = mediaPipeResultSchema.parse(raw);

  const frames: PoseFrame[] = result.frames.map((frame, index) => ({
    index,
    tMs: frame.timestampMs ?? (index / result.fps) * 1000,
    keypoints: mapFrameToKeypoints(frame),
  }));

  const sequence: PoseSequence = {
    backend: BACKEND_NAME,
    modelVersion: MODEL_VERSION,
    coordSpace: "normalized",
    fps: result.fps,
    width: result.width,
    height: result.height,
    frames,
  };
  return poseSequenceSchema.parse(sequence) as PoseSequence;
}

/**
 * MediaPipe Pose backend. Implements {@link PoseBackend} unchanged: `VideoRef`
 * in, validated `PoseSequence` out. Inference is delegated to an injected
 * {@link MediaPipePoseService}; the default one is a stub that only throws when
 * inference is actually attempted.
 */
export class MediaPipePoseBackend implements PoseBackend {
  readonly name = BACKEND_NAME;
  readonly modelVersion = MODEL_VERSION;

  constructor(private readonly service: MediaPipePoseService = new UnavailableMediaPipeService()) {}

  async estimate(video: VideoRef, opts: PoseEstimateOptions = {}): Promise<PoseSequence> {
    const raw = await this.service.run(video, opts);
    return buildPoseSequence(raw);
  }
}
