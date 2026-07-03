import { poseSequenceSchema, type JointName, type PoseSequence } from "@/lib/biomechanics/pose";
import type { createClient } from "@/lib/supabase/server";
import { buildOverlayFrames, type OverlayFrame } from "./overlay";

/**
 * Server-only loader that turns an analysis's stored pose artifact into overlay
 * frames. Defensive by design: any problem (no path, missing bucket/object,
 * malformed JSON, wrong shape) resolves to `[]` after a safe server-side warning
 * — never throws — so the session page simply keeps its overlay placeholder.
 *
 * NOTE: `analyses.keypoints_path` is not populated by the current worker (which
 * writes the pose sequence to a local file, not storage), so today this returns
 * `[]` for real sessions. It activates automatically once the worker uploads the
 * artifact to the bucket below and sends `keypointsPath` in its callback.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Bucket the pose artifact is expected to live in (override via env). */
const POSE_ARTIFACTS_BUCKET = process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts";

/**
 * MediaPipe landmark index → AVA canonical joint. `buildOverlayFrames` reads a
 * frame's `landmarks` array positionally (and hard-codes hip indices 23/24 for
 * velocity), so the adapter must place each canonical keypoint at its MediaPipe
 * index. Joints AVA doesn't track are left as array holes and skipped downstream.
 */
const MP_INDEX_TO_JOINT: ReadonlyArray<readonly [number, JointName]> = [
  [0, "nose"],
  [11, "left_shoulder"],
  [12, "right_shoulder"],
  // Upper limbs (Day 54) — powers the arm/shoulder overlay layer.
  [13, "left_elbow"],
  [14, "right_elbow"],
  [15, "left_wrist"],
  [16, "right_wrist"],
  [23, "left_hip"],
  [24, "right_hip"],
  [25, "left_knee"],
  [26, "right_knee"],
  [27, "left_ankle"],
  [28, "right_ankle"],
  [29, "left_heel"],
  [30, "right_heel"],
  [31, "left_toe"],
  [32, "right_toe"],
];

/**
 * Adapt a canonical {@link PoseSequence} (keypoints as a Record) into the raw,
 * MediaPipe-indexed `landmarks`-array shape `buildOverlayFrames` consumes.
 */
function toOverlayFrames(sequence: PoseSequence): OverlayFrame[] {
  const rawFrames = sequence.frames.map((frame) => {
    const landmarks: Array<{ x: number; y: number; visibility?: number }> = [];
    for (const [mpIndex, joint] of MP_INDEX_TO_JOINT) {
      const keypoint = frame.keypoints[joint];
      if (keypoint) {
        landmarks[mpIndex] = {
          x: keypoint.x,
          y: keypoint.y,
          visibility: keypoint.visibility ?? keypoint.score,
        };
      }
    }
    return { frame: frame.index, time: frame.tMs / 1000, landmarks };
  });

  return buildOverlayFrames({ ...sequence, frames: rawFrames } as unknown as PoseSequence);
}

export async function loadOverlayFrames(
  supabase: ServerClient,
  keypointsPath: string | null | undefined,
): Promise<OverlayFrame[]> {
  if (!keypointsPath) return [];

  try {
    const { data, error } = await supabase.storage
      .from(POSE_ARTIFACTS_BUCKET)
      .download(keypointsPath);

    if (error || !data) {
      console.warn(`[overlay] keypoints artifact unavailable: ${error?.message ?? "no data"}`);
      return [];
    }

    const parsed = poseSequenceSchema.safeParse(JSON.parse(await data.text()));
    if (!parsed.success) {
      console.warn("[overlay] keypoints artifact did not match the pose-sequence schema");
      return [];
    }

    return toOverlayFrames(parsed.data as PoseSequence);
  } catch (err) {
    console.warn(
      `[overlay] failed to build overlay frames: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return [];
  }
}
