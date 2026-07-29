/** Worker-safe normalized pose contract owned by the acceleration engine. */
export interface AccelerationPoint {
  x: number;
  y: number;
  visibility?: number;
}

export interface AccelerationFrame {
  frame: number;
  time: number;
  landmarks: Record<string, AccelerationPoint | undefined>;
  centerOfMass: AccelerationPoint | null;
}

export interface AccelerationCalibration {
  /** Full-frame normalized x-position of the single finish gate. */
  finishX: number;
  /** Real distance from the automatically detected start position to the finish gate. */
  finishDistanceM: number;
}
