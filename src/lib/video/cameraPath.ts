/**
 * Browser-side consumption of the Phase 1 `CameraPathArtifact` (see
 * `cameraPathSchema.ts` and the worker module that computes it,
 * `camera_path.py`). Every function here is a DIRECT LOOKUP by frame index
 * plus ONE application of an already-resolved transform — there is no loop,
 * no accumulation, and no dependency on any frame other than the one asked
 * for. This is the architectural point of Phase 1 (Part 7): "the browser
 * must not walk or compose a variable evidence chain independently during
 * playback." Random access to frame 300 costs exactly the same as frame 1.
 */
import { applyForward, type SourcePoint } from "../calibration/zoneAnchors";
import type { CameraFramePath, CameraPathArtifact } from "./cameraPathSchema";

/** O(1) index of `framePaths` by frame number, built once per artifact load. */
export function indexCameraFramePaths(artifact: CameraPathArtifact): Map<number, CameraFramePath> {
  const map = new Map<number, CameraFramePath>();
  for (const entry of artifact.framePaths) map.set(entry.frameIndex, entry);
  return map;
}

export interface GlobalFrameLookup {
  framePath: CameraFramePath | null;
  /** True only when this exact frame currently has a resolved global transform. */
  globallyAvailable: boolean;
}

/** Looks up frame T's precomputed state — no composition, no neighbor frames read. */
export function lookupCameraFramePath(
  index: Map<number, CameraFramePath>,
  frameIndex: number,
): GlobalFrameLookup {
  const framePath = index.get(frameIndex) ?? null;
  return {
    framePath,
    globallyAvailable: framePath != null && framePath.state === "anchored"
      && framePath.frameToGlobalMatrix != null && framePath.globalToFrameMatrix != null,
  };
}

/**
 * Convert a point observed in source frame C into the immutable global
 * (reference-frame) coordinate system. Used exactly once, at contact/gate
 * CREATION time — the result is what gets persisted as the canonical anchor.
 */
export function framePointToGlobal(
  index: Map<number, CameraFramePath>,
  frameIndex: number,
  point: SourcePoint,
  width: number,
  height: number,
): { point: SourcePoint; available: boolean } {
  const { framePath, globallyAvailable } = lookupCameraFramePath(index, frameIndex);
  if (!globallyAvailable || !framePath?.frameToGlobalMatrix) return { point, available: false };
  return { point: applyForward(point, framePath.frameToGlobalMatrix, width, height), available: true };
}

/**
 * Project an immutable global point into target frame T's source coordinates.
 * Used at RENDER time, for every frame, independently — never derived from
 * the previously rendered position (Part 4/7).
 */
export function globalPointToFrame(
  index: Map<number, CameraFramePath>,
  frameIndex: number,
  point: SourcePoint,
  width: number,
  height: number,
): { point: SourcePoint; available: boolean; state: CameraFramePath["state"] | "no_frame_path" } {
  const { framePath, globallyAvailable } = lookupCameraFramePath(index, frameIndex);
  if (!framePath) return { point, available: false, state: "no_frame_path" };
  if (!globallyAvailable || !framePath.globalToFrameMatrix) {
    return { point, available: false, state: framePath.state };
  }
  return { point: applyForward(point, framePath.globalToFrameMatrix, width, height), available: true, state: "anchored" };
}
