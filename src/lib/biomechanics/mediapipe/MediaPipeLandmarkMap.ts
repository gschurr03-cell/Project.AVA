import { CANONICAL_JOINTS, type JointName, type Keypoint } from "../pose";
import type { MediaPipeFrame } from "./MediaPipeTypes";

/**
 * MediaPipe Pose landmark index for each canonical joint. MediaPipe emits 33
 * body landmarks; these are the ones AVA's metrics need (incl. heel/foot-index
 * for ground-contact and toe-off).
 */
export const MEDIAPIPE_LANDMARK_INDEX: Record<JointName, number> = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_toe: 31, // MediaPipe "foot index" (big toe)
  right_toe: 32,
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Map one MediaPipe frame onto AVA's canonical keypoints. Missing landmarks are
 * omitted (the keypoint map is partial by design). Confidence comes from
 * `visibility` (falling back to `presence`, then 1). World landmarks, when
 * present, are preserved as the keypoint's metric 3D.
 */
export function mapFrameToKeypoints(frame: MediaPipeFrame): Partial<Record<JointName, Keypoint>> {
  const keypoints: Partial<Record<JointName, Keypoint>> = {};

  for (const joint of CANONICAL_JOINTS) {
    const index = MEDIAPIPE_LANDMARK_INDEX[joint];
    const lm = frame.landmarks[index];
    if (!lm) continue; // landmark not provided → omit this joint

    const keypoint: Keypoint = {
      x: lm.x,
      y: lm.y,
      score: clamp01(lm.visibility ?? lm.presence ?? 1),
    };
    if (lm.visibility != null) {
      keypoint.visibility = clamp01(lm.visibility);
    }
    const world = frame.worldLandmarks?.[index];
    if (world) {
      keypoint.world = { x: world.x, y: world.y, z: world.z ?? 0 };
    }
    keypoints[joint] = keypoint;
  }

  return keypoints;
}
