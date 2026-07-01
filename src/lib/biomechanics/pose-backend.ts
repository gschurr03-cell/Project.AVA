import {
  CANONICAL_JOINTS,
  poseSequenceSchema,
  type JointName,
  type Keypoint,
  type PoseSequence,
} from "./pose";
import { MediaPipePoseBackend } from "./mediapipe/MediaPipePoseBackend";

/**
 * Pose backend abstraction. The analysis worker depends only on this contract;
 * each concrete backend is the *only* place that knows about a specific pose
 * estimator. Because both real backends are Python, an implementation is
 * typically a thin TS wrapper that invokes a pose service/subprocess and
 * Zod-validates the returned {@link PoseSequence} — the JSON contract is the
 * real swap boundary.
 */
export type PoseBackendName = "mock" | "mediapipe" | "rtmpose";

/** Reference to the video to analyze. Real backends stream from `signedUrl`. */
export interface VideoRef {
  signedUrl?: string;
  width?: number;
  height?: number;
  durationS?: number;
  fps?: number;
}

export interface PoseEstimateOptions {
  /** Override the frame rate used to synthesize timestamps. */
  fps?: number;
  /** Cap the number of frames processed (dev/debug). */
  maxFrames?: number;
}

export interface PoseBackend {
  readonly name: PoseBackendName;
  readonly modelVersion: string;
  /** Produce a normalized, validated pose sequence for the given video. */
  estimate(video: VideoRef, opts?: PoseEstimateOptions): Promise<PoseSequence>;
}

const DEFAULT_FPS = 30;
const DEFAULT_W = 1920;
const DEFAULT_H = 1080;
const DEFAULT_FRAMES = 60;

/**
 * Backend that fabricates a structurally valid {@link PoseSequence} without any
 * real inference. It lets the whole pipeline (worker → keypoints → metrics)
 * run end to end before MediaPipe exists, and stays available as a fallback via
 * `POSE_BACKEND=mock`. The figure is a crude standing pose with a small per-
 * frame sway so downstream code sees motion.
 */
export class MockPoseBackend implements PoseBackend {
  readonly name = "mock" as const;
  readonly modelVersion = "mock-pose-1.0";

  async estimate(video: VideoRef = {}, opts: PoseEstimateOptions = {}): Promise<PoseSequence> {
    const fps = opts.fps ?? video.fps ?? DEFAULT_FPS;
    const width = video.width ?? DEFAULT_W;
    const height = video.height ?? DEFAULT_H;
    const frameCount = Math.max(
      1,
      Math.min(opts.maxFrames ?? Infinity, video.durationS ? Math.round(video.durationS * fps) : DEFAULT_FRAMES),
    );

    // Rough normalized y for each joint on an upright figure.
    const baseY: Record<JointName, number> = {
      nose: 0.12,
      left_shoulder: 0.25,
      right_shoulder: 0.25,
      left_hip: 0.5,
      right_hip: 0.5,
      left_knee: 0.7,
      right_knee: 0.7,
      left_ankle: 0.9,
      right_ankle: 0.9,
      left_heel: 0.92,
      right_heel: 0.92,
      left_toe: 0.94,
      right_toe: 0.94,
    };
    const sideDx: Record<JointName, number> = {
      nose: 0,
      left_shoulder: -0.05,
      right_shoulder: 0.05,
      left_hip: -0.04,
      right_hip: 0.04,
      left_knee: -0.04,
      right_knee: 0.04,
      left_ankle: -0.04,
      right_ankle: 0.04,
      left_heel: -0.05,
      right_heel: 0.03,
      left_toe: -0.03,
      right_toe: 0.05,
    };

    const frames = Array.from({ length: frameCount }, (_, index) => {
      const t = index / fps;
      const sway = 0.02 * Math.sin(2 * Math.PI * t); // gentle horizontal drift
      const keypoints: Partial<Record<JointName, Keypoint>> = {};
      for (const joint of CANONICAL_JOINTS) {
        // Legs alternate vertically to hint at a stride cadence.
        const legPhase = joint.includes("knee") || joint.includes("ankle") || joint.includes("heel") || joint.includes("toe")
          ? 0.01 * Math.sin(2 * Math.PI * t * 2 + (joint.startsWith("left") ? 0 : Math.PI))
          : 0;
        keypoints[joint] = {
          x: 0.5 + sideDx[joint] + sway,
          y: baseY[joint] + legPhase,
          score: 0.9,
          visibility: 0.9,
        };
      }
      return { index, tMs: (index / fps) * 1000, keypoints };
    });

    const sequence: PoseSequence = {
      backend: this.name,
      modelVersion: this.modelVersion,
      coordSpace: "normalized",
      fps,
      width,
      height,
      frames,
    };
    // Self-check: never emit anything that wouldn't survive validation.
    return poseSequenceSchema.parse(sequence) as PoseSequence;
  }
}

/**
 * Select a pose backend by name.
 *
 * - `mock` — fabricates valid pose data; the dev fallback.
 * - `mediapipe` — maps MediaPipe PoseLandmarker output onto
 *   {@link CANONICAL_JOINTS} and returns a validated {@link PoseSequence}. The
 *   object is constructed fine; actual inference requires a real
 *   `MediaPipePoseService` to be injected (the default stub throws only when
 *   `estimate()` is called).
 * - `rtmpose` (future): the same wrapper shape around RTMDet + RTMPose-Halpe26,
 *   normalizing pixel coordinates and leaving `world` undefined.
 */
export function createPoseBackend(name: PoseBackendName): PoseBackend {
  switch (name) {
    case "mock":
      return new MockPoseBackend();
    case "mediapipe":
      return new MediaPipePoseBackend();
    case "rtmpose":
      throw new Error(`pose backend "${name}" is not implemented yet — use "mock"`);
    default:
      throw new Error(`unknown pose backend "${name satisfies never}"`);
  }
}
