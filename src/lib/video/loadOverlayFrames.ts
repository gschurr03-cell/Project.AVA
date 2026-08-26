import { poseSequenceSchema, type JointName, type PoseSequence } from "@/lib/biomechanics/pose";
import type { createClient } from "@/lib/supabase/server";
import { buildOverlayFrames, type OverlayFrame } from "./overlay";
import type { RawCameraEvidence, RecordingAssessment } from "./recordingMode";
import type { CameraPathArtifact } from "./cameraPathSchema";

/**
 * Server-only loader that turns an analysis's stored pose artifact into overlay
 * frames. Defensive by design: any problem (no path, missing bucket/object,
 * malformed JSON, wrong shape) resolves to `[]` after a safe server-side warning
 * — never throws — so the session page simply keeps its overlay placeholder.
 *
 * Production workers populate `analyses.keypoints_path` with an immutable object
 * in the private pose-artifacts bucket. Artifact identity is the cache key, so a
 * version switch cannot reuse frames from another analysis.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Bucket the pose artifact is expected to live in (override via env). */
const POSE_ARTIFACTS_BUCKET = process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 24;
const overlayCache = new Map<string, { expiresAt: number; result: OverlayLoadResult }>();

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
    const comparisonLandmarks: Array<{ x: number; y: number; visibility?: number }> = [];
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
    for (const [mpIndex, joint] of MP_INDEX_TO_JOINT) {
      const keypoint = frame.comparisonKeypoints?.[joint];
      if (keypoint) comparisonLandmarks[mpIndex] = {
        x: keypoint.x, y: keypoint.y, visibility: keypoint.visibility ?? keypoint.score,
      };
    }
    return {
      frame: frame.index,
      sourceFrameIndex: frame.sourceFrameIndex,
      time: frame.tMs / 1000,
      landmarks,
      backend: sequence.backend,
      trackingConfidence: frame.trackingConfidence,
      comparisonBackend: frame.comparisonBackend,
      comparisonLandmarks,
      // Day 96 audit — athlete-box tracker provenance, so downstream contact/
      // crossing detection can refuse to treat a "predicted"/"invalid" origin
      // frame's landmarks as verified pose evidence.
      boxOrigin: frame.boxOrigin,
      trackState: frame.trackState,
      identityContinuityScore: frame.identityContinuityScore,
      independentLocalizationState: frame.independentLocalizationState,
    };
  });

  return buildOverlayFrames({ ...sequence, frames: rawFrames } as unknown as PoseSequence);
}

/** Overlay frames plus the source metadata the artifact carries (fps + pixel dims). */
export interface OverlayLoadResult {
  frames: OverlayFrame[];
  status: "available" | "missing_pointer" | "missing_object" | "corrupt_json" | "schema_incompatible" | "access_error";
  reason: string | null;
  /** Detected source metadata from the pose artifact; null when unavailable. */
  meta: {
    fps: number;
    width: number;
    height: number;
    recordingAssessment?: RecordingAssessment;
    cameraEvidence?: RawCameraEvidence;
    cameraPath?: CameraPathArtifact;
  } | null;
}

export async function loadOverlayFrames(
  supabase: ServerClient,
  keypointsPath: string | null | undefined,
): Promise<OverlayLoadResult> {
  if (!keypointsPath) return { frames: [], meta: null, status: "missing_pointer", reason: "This analysis has no pose-artifact pointer." };
  const cached = overlayCache.get(keypointsPath);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) overlayCache.delete(keypointsPath);

  try {
    const { data, error } = await supabase.storage
      .from(POSE_ARTIFACTS_BUCKET)
      .download(keypointsPath);

    if (error || !data) {
      console.warn(`[overlay] keypoints artifact unavailable: ${error?.message ?? "no data"}`);
      const missing = /not found|does not exist|404/i.test(error?.message ?? "");
      return {
        frames: [], meta: null,
        status: missing ? "missing_object" : "access_error",
        reason: missing
          ? "The pose artifact referenced by this analysis is missing from storage."
          : "The pose artifact could not be downloaded with the current storage authorization.",
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(await data.text());
    } catch {
      return { frames: [], meta: null, status: "corrupt_json", reason: "The stored pose artifact is not valid JSON." };
    }
    const parsed = poseSequenceSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[overlay] keypoints artifact did not match the pose-sequence schema");
      return {
        frames: [], meta: null, status: "schema_incompatible",
        reason: `The pose artifact uses an unsupported schema (${parsed.error.issues[0]?.path.join(".") || "root"}).`,
      };
    }

    const sequence = parsed.data as PoseSequence;
    // The artifact carries the true detected fps + source dimensions (the worker
    // computed them from the video). The session row may not have them, so expose
    // them here as the detected-metadata fallback for calibration + timing.
    const result: OverlayLoadResult = {
      frames: toOverlayFrames(sequence),
      status: "available",
      reason: null,
      meta: {
        fps: sequence.fps,
        width: sequence.width,
        height: sequence.height,
        recordingAssessment: sequence.recordingAssessment,
        cameraEvidence: sequence.cameraEvidence,
        cameraPath: sequence.cameraPath,
      },
    };
    overlayCache.set(keypointsPath, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    while (overlayCache.size > CACHE_MAX_ENTRIES) {
      const oldest = overlayCache.keys().next().value;
      if (oldest) overlayCache.delete(oldest);
      else break;
    }
    return result;
  } catch (err) {
    console.warn(
      `[overlay] failed to build overlay frames: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return { frames: [], meta: null, status: "access_error", reason: "The pose artifact could not be read safely." };
  }
}
