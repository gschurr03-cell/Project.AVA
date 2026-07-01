import type { GaitEvent } from "../events";
import type { StepSegment, StrideSegment } from "../strides";
import type { FrameAngles } from "../angles";

/**
 * Aggregate sprint metrics derived from the detected gait events, step/stride
 * segments, and per-frame angles. The aggregate values are optional: any that
 * can't be computed from the available data is left `undefined` (and a warning
 * is emitted), so sparse input yields partial — never invalid — metrics. The
 * count fields are always present (0 when nothing was found).
 */
export interface RealSprintMetrics {
  avgStepTimeMs?: number;
  avgStrideTimeMs?: number;
  avgGroundContactMs?: number;
  avgFlightTimeMs?: number;
  strideFrequencyHz?: number;
  stepFrequencyHz?: number;
  /** Peak knee flexion = the minimum knee angle observed (smaller = more flexed). */
  peakLeftKneeFlexionDeg?: number;
  peakRightKneeFlexionDeg?: number;
  avgTrunkLeanDeg?: number;
  leftRightStepTimeAsymmetryPct?: number;
  analyzedFrames: number;
  eventCount: number;
  stepCount: number;
  strideCount: number;
}

export interface SprintAnalysisResult {
  metrics: RealSprintMetrics;
  events: GaitEvent[];
  steps: StepSegment[];
  strides: StrideSegment[];
  angles: FrameAngles[];
  warnings: string[];
  source: "pose_sequence";
}

export interface SprintAnalysisOptions {
  /** Confidence floor passed to event detection and angle calculation. */
  minKeypointScore?: number;
  /** Enforce strictly alternating contact sides during segmentation. */
  requireAlternatingSides?: boolean;
  /** Include the raw events/steps/strides/angles arrays in the result. */
  includeRawArrays?: boolean;
}
