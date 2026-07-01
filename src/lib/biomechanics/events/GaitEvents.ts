/**
 * Gait events derived from a pose sequence.
 *
 * This is the richer, event-detection vocabulary (frame + timestamp +
 * confidence + provenance). It is a structural superset of the minimal
 * `{ frame, side, type }` shape the metric functions in `metrics.ts` consume,
 * so detector output can feed those without a change there.
 */
export type GaitSide = "left" | "right";
export type GaitEventType = "contact" | "toe_off";

export interface GaitEvent {
  /** 0-based frame index within the PoseSequence. */
  frame: number;
  /** Frame timestamp in milliseconds. */
  tMs: number;
  side: GaitSide;
  type: GaitEventType;
  /** Mean confidence (0..1) of the foot keypoints used to detect the event. */
  confidence: number;
  /** Provenance — only heuristic pose detection exists today. */
  source: "pose_heuristic";
}

/** Convert a frame index to milliseconds at a given frame rate. */
export function frameToMs(frame: number, fps: number): number {
  return fps > 0 ? (frame / fps) * 1000 : 0;
}
