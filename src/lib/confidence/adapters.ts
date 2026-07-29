import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import type { PoseQualitySummary, RecordingQualityReport } from "@/lib/recording/quality";
import type { TrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import { calculateMetricConfidence } from "./engine";
import type { ConfidenceEvidence, ConfidenceMetricId, MeasurementConfidence } from "./types";

export type TrustedMetricConfidence = Record<
  "topSpeedMps" | "avgVelocityMps" | "avgStrideLengthM" | "peakStrideLengthM" | "frequencyHz",
  MeasurementConfidence
>;

export function evidenceFromAnalysis({
  measurements,
  poseQuality,
  recordingQuality,
  fps,
}: {
  measurements: SprintMeasurements | null;
  poseQuality: PoseQualitySummary | null;
  recordingQuality: RecordingQualityReport | null;
  fps: number | null;
}): ConfidenceEvidence {
  const diagnostics = measurements?.diagnostics;
  const tracking = diagnostics?.trackingCoverage ?? null;
  const excluded = diagnostics
    ? diagnostics.excludedContacts.length / Math.max(1, diagnostics.excludedContacts.length + diagnostics.includedContacts)
    : null;
  const camera = measurements?.cameraCompensation;
  const cameraStability =
    camera?.confidence === "high" ? 0.95 : camera?.confidence === "medium" ? 0.78 : camera?.confidence === "low" ? 0.52 : camera?.available ? 0.65 : null;
  const calibration = measurements?.calibrated ? (measurements.stepLengthConfidence === "high" ? 0.96 : measurements.stepLengthConfidence === "medium" ? 0.78 : 0.58) : 0;
  const frameStability = fps == null ? null : fps >= 120 ? 0.98 : fps >= 59 ? 0.82 : fps >= 30 ? 0.58 : 0.3;
  const sample = diagnostics ? Math.min(1, diagnostics.includedContacts / 8) : null;
  const spread = measurements?.velocitySpreadPct;
  return {
    trackingContinuity: tracking,
    missingPoseFraction: poseQuality?.missingFrameFraction ?? null,
    interpolationFraction: poseQuality?.missingFrameFraction ?? null,
    cameraMotionStability: cameraStability,
    calibrationCertainty: calibration,
    frameTimingStability: frameStability,
    occlusionFraction: poseQuality?.missingFrameFraction ?? null,
    roiStability: tracking,
    poseVisibility: poseQuality?.poseConfidence ?? null,
    skeletonConfidence: poseQuality?.poseConfidence ?? null,
    eventDetectionConfidence: excluded == null ? tracking : 1 - excluded,
    sampleSufficiency: sample,
    algorithmAgreement: spread == null ? null : Math.max(0, 1 - spread / 30),
    fps,
    athleteFillFraction: poseQuality?.athleteFillFraction ?? null,
    // Overall quality is intentionally not a factor: it is already a composite and
    // including it would double-count the observable signals above.
    ...(recordingQuality ? {} : {}),
  };
}

export function buildTrustedMetricConfidence(
  trusted: TrustedMetrics,
  evidence: ConfidenceEvidence,
): TrustedMetricConfidence {
  const score = (metricId: ConfidenceMetricId) => calculateMetricConfidence(metricId, evidence);
  return {
    topSpeedMps: score("peak_velocity"),
    avgVelocityMps: score("average_velocity"),
    avgStrideLengthM: score("stride_length"),
    peakStrideLengthM: score("stride_length"),
    frequencyHz: score("step_frequency"),
  };
}

