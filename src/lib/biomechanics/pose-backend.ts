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

/** One accepted Phase 2 manual World-Lock Repair, as the worker needs it —
 *  see `saveWorldLockRepair` (source of truth) and `camera_path.py`
 *  (`manual_repairs`, consumer). Deliberately minimal: the worker
 *  RE-DERIVES `targetFrameToGlobalMatrix` from `pointPairs` itself rather
 *  than trusting any client/DB-cached matrix (Part 11). */
export interface ManualRepairInput {
  repairId: string;
  referenceFrameIndex: number;
  targetFrameIndex: number;
  pointPairs: { id: string; referencePoint: { x: number; y: number }; targetPoint: { x: number; y: number } }[];
  createdAt: string;
  acceptedBy: string;
  version: number;
}

/**
 * Day 104 (Part 8): one real, measured progress snapshot from the pose
 * inference subprocess — frame counts + a wall-clock capture time, nothing
 * derived or estimated. `analysisProgress/model.ts` turns a SEQUENCE of
 * these (via the worker's heartbeat) into a real frame-throughput ETA.
 */
export interface AnalysisProgressSnapshot {
  stage: "pass1" | "pass2";
  framesCompleted: number;
  totalFrames: number;
  sourceFps: number;
  width: number;
  height: number;
  capturedAtMs: number;
}

export interface PoseEstimateOptions {
  /** Target analysis rate. Production callers must use the validated 60 FPS clock. */
  fps?: number;
  /** Cap the number of frames processed (dev/debug). */
  maxFrames?: number;
  /** Accepted Phase 2 repairs to apply on top of the automatic camera path. */
  manualRepairs?: ManualRepairInput[];
  /** Coach-configured sprint travel direction (Day 95 audit), when known —
   *  feeds the stationary athlete tracker's acquisition (expected entry side)
   *  and identity-continuity (direction-consistency) checks. `"auto"`/absent
   *  when no calibration direction has been set yet; the tracker degrades to
   *  scale/continuity-only checks without a direction preference. */
  travelDirection?: "left_to_right" | "right_to_left" | "auto";
  /** Day 103 audit: calibrated start-gate position (normalized source-frame
   *  coordinates — the same space `gateMidpoint()` produces), when known —
   *  feeds the stationary athlete tracker's pre-zone acquisition corridor
   *  (bounded region around the coach's actual gate, not the raw frame
   *  edge). Absent when no calibrated gate exists yet; the tracker falls
   *  back to the frame-edge acquisition band unchanged. */
  entryGate?: { x: number; y: number };
  /** Day 96 audit (Part 9): per-job override for the inference subprocess's
   *  hard timeout, scaled by the caller from this specific session's known
   *  duration/fps/resolution — the backend's own configured timeout is sized
   *  for a typical clip, not necessarily this one. Ignored by backends that
   *  don't shell out to a subprocess. */
  timeoutMs?: number;
  /** Day 104 (Part 8): invoked with each real progress snapshot the
   *  subprocess reports, as it arrives (not just at completion). Backends
   *  that don't stream progress (mock, future non-subprocess backends)
   *  simply never call it — always optional, never required for a valid run. */
  onProgress?: (snapshot: AnalysisProgressSnapshot) => void;
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
      Math.min(
        opts.maxFrames ?? Infinity,
        video.durationS ? Math.round(video.durationS * fps) : DEFAULT_FRAMES,
      ),
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
      // Upper limbs (Day 54): elbows between shoulder and hip, wrists lower.
      left_elbow: 0.38,
      right_elbow: 0.38,
      left_wrist: 0.48,
      right_wrist: 0.48,
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
      // Upper limbs (Day 54): elbows just wider than shoulders, wrists inboard.
      left_elbow: -0.08,
      right_elbow: 0.08,
      left_wrist: -0.06,
      right_wrist: 0.06,
    };

    const frames = Array.from({ length: frameCount }, (_, index) => {
      const t = index / fps;
      const sway = 0.02 * Math.sin(2 * Math.PI * t); // gentle horizontal drift
      const keypoints: Partial<Record<JointName, Keypoint>> = {};
      for (const joint of CANONICAL_JOINTS) {
        // Legs alternate vertically to hint at a stride cadence.
        const legPhase =
          joint.includes("knee") ||
          joint.includes("ankle") ||
          joint.includes("heel") ||
          joint.includes("toe")
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
 *   {@link CANONICAL_JOINTS} and returns a validated {@link PoseSequence}. Set
 *   `MEDIAPIPE_RUNTIME=python` to use the real Python runtime; otherwise the
 *   default stub throws only when `estimate()` is called. Construction is always
 *   safe.
 * - `rtmpose` (future): the same wrapper shape around RTMDet + RTMPose-Halpe26,
 *   normalizing pixel coordinates and leaving `world` undefined.
 */
export function createPoseBackend(name: PoseBackendName): PoseBackend {
  switch (name) {
    case "mock":
      return new MockPoseBackend();
    case "mediapipe":
      return process.env.MEDIAPIPE_RUNTIME === "python"
        ? MediaPipePoseBackend.withPythonRuntime()
        : new MediaPipePoseBackend();
    case "rtmpose":
      throw new Error(`pose backend "${name}" is not implemented yet — use "mock"`);
    default:
      throw new Error(`unknown pose backend "${name satisfies never}"`);
  }
}
