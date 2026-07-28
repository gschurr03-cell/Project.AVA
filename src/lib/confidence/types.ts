export const MEASUREMENT_CONFIDENCE_VERSION = "ava-measurement-confidence-v1" as const;

export type ConfidenceMetricFamily =
  | "spatial"
  | "timing"
  | "pose"
  | "event"
  | "derived"
  | "intelligence";

export type QualityFlagSeverity = "info" | "warning" | "critical";

export interface MetricQualityFlag {
  code: string;
  severity: QualityFlagSeverity;
  label: string;
  why: string;
  affectedMetrics: string[];
  improvement: string;
}

/** Shared contract for every reported measurement. Score is an integer [0, 100]. */
export interface MeasurementConfidence {
  score: number;
  level: "high" | "medium" | "low";
  confidenceReason: string[];
  qualityFlags: MetricQualityFlag[];
  measurementVersion: typeof MEASUREMENT_CONFIDENCE_VERSION;
  /** Named, inspectable factor contributions used to reproduce the score. */
  factors: Array<{
    key: string;
    observed: number | null;
    normalized: number;
    weight: number;
    contribution: number;
    reason: string;
  }>;
}

export interface ConfidentMetric<T extends number | null = number | null> {
  value: T;
  confidence: MeasurementConfidence;
  confidenceReason: string[];
  qualityFlags: MetricQualityFlag[];
  measurementVersion: typeof MEASUREMENT_CONFIDENCE_VERSION;
}

export interface ConfidenceEvidence {
  trackingContinuity?: number | null;
  missingPoseFraction?: number | null;
  interpolationFraction?: number | null;
  cameraMotionStability?: number | null;
  calibrationCertainty?: number | null;
  frameTimingStability?: number | null;
  occlusionFraction?: number | null;
  roiStability?: number | null;
  poseVisibility?: number | null;
  skeletonConfidence?: number | null;
  eventDetectionConfidence?: number | null;
  sampleSufficiency?: number | null;
  algorithmAgreement?: number | null;
  fps?: number | null;
  athleteFillFraction?: number | null;
}

export type ConfidenceMetricId =
  | "velocity"
  | "peak_velocity"
  | "average_velocity"
  | "contact_time"
  | "flight_time"
  | "stride_length"
  | "cadence"
  | "step_frequency"
  | "asymmetry"
  | "acceleration"
  | "timing_gate"
  | "knee_flexion"
  | "trunk_lean"
  | "sprint_intelligence";

