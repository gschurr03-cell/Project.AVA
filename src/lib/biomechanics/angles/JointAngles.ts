/**
 * Per-frame joint and posture angles derived from a `PoseSequence`.
 *
 * All angles are in degrees. Every angle is optional: it is present only when
 * the keypoints it needs are available and confident enough, so a partial pose
 * yields partial — never invalid — output. `confidence` is the mean confidence
 * of the keypoints that contributed to the angles present on this frame.
 */
export interface FrameAngles {
  frame: number;
  tMs: number;
  /** Knee flexion: hip–knee–ankle. */
  leftKneeDeg?: number;
  rightKneeDeg?: number;
  /** Hip angle: shoulder–hip–knee. */
  leftHipDeg?: number;
  rightHipDeg?: number;
  /** Ankle angle: knee–ankle–toe. */
  leftAnkleDeg?: number;
  rightAnkleDeg?: number;
  /** Forward trunk lean vs vertical (hips midpoint → shoulders midpoint). */
  trunkLeanDeg?: number;
  /** Shoulder line tilt vs horizontal (left → right shoulder). */
  shoulderTiltDeg?: number;
  /** Hip line tilt vs horizontal (left → right hip). */
  hipTiltDeg?: number;
  confidence: number;
  source: "pose_geometry";
}
