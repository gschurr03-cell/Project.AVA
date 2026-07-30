/**
 * The single shared projection path for every TRACK-RELATIVE (world-locked)
 * overlay: calibration gates, step/contact markers, and stride segments
 * between saved contacts. Athlete-relative overlays (skeleton, current-frame
 * foot position, bounding boxes) never go through this module — they are
 * drawn directly from the current frame's pose landmarks.
 *
 * A world anchor is one immutable {@link CanonicalWorldPoint}: a physical
 * scene location expressed in one reference frame's source-video coordinate
 * system. Rendering it at frame T means: propagate reference → T through the
 * camera transform chain (`propagateSourcePoint`, the one shared camera path
 * also used by the Timing Workspace editor), then project the resulting
 * SOURCE coordinate into display pixels. Nothing here ever reads a previous
 * RENDERED position — every frame is computed fresh from the immutable
 * reference coordinate, so there is no frame-to-frame accumulation.
 */
import type { RawCameraEvidence } from "./recordingMode";
import { canonicalWorldToSourceFrame, type CanonicalWorldPoint } from "./worldProjection";
import {
  projectSourcePointToDisplay,
  type DisplayRect,
  type Point2D,
  type SourceCropRect,
  type VideoFitMode,
} from "./coordinates";

/**
 * A projected source-frame point is "visible" purely geometrically: does it
 * fall inside the actual video frame (normalized [0,1] on both axes)? This is
 * never clamped, recentered, or forced true — a point outside this range must
 * not be drawn, and must be allowed to leave/enter the frame as the camera
 * pans, exactly like a real fixed object would.
 */
export function isSourcePointVisible(point: Point2D): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export interface WorldAnchorProjection {
  /** The reprojected point in the TARGET frame's source-video coordinates. */
  sourcePoint: Point2D;
  /** The same point projected into display (CSS) pixels. */
  displayPoint: Point2D;
  /** Purely geometric: is `sourcePoint` inside the current video frame? */
  visible: boolean;
  /** Is the camera-transform chain reference→target trustworthy right now? */
  safe: boolean;
  confidence: number;
  warnings: string[];
}

/**
 * Reproject one immutable world anchor into frame T and into display pixels,
 * in one call. Callers must check BOTH `visible` (geometric — draw nothing
 * offscreen) and `safe` (tracking-quality — draw nothing built on an unsafe
 * transform chain) before drawing; this function itself never decides to
 * hide, clamp, or substitute a fallback position — it only reports the facts.
 */
export function projectWorldAnchorToFrame(
  world: CanonicalWorldPoint,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  sourceWidth: number,
  sourceHeight: number,
  displayRect: DisplayRect,
  fitMode: VideoFitMode = "contain",
  sourceCrop?: SourceCropRect | null,
): WorldAnchorProjection {
  const result = canonicalWorldToSourceFrame(world, targetFrameIndex, evidence, sourceWidth, sourceHeight);
  const displayPoint = projectSourcePointToDisplay({
    point: result.point,
    sourceWidth,
    sourceHeight,
    sourceCrop,
    displayRect,
    fitMode,
  });
  return {
    sourcePoint: result.point,
    displayPoint,
    visible: isSourcePointVisible(result.point),
    safe: result.projectable,
    confidence: result.confidence,
    warnings: result.warnings,
  };
}
