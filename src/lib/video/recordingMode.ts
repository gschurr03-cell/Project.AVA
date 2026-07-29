import { z } from "zod";

export const RECORDING_MODE_CLASSIFIER_VERSION = "ava-recording-mode-v1";
export const CAMERA_MOTION_MODEL_VERSION = "ava-background-world-v2";
export const LEGACY_CAMERA_MOTION_MODEL_VERSION = "ava-background-affine-v1";
export const DYNAMIC_CROP_VERSION = "ava-mediapipe-roi-v1";
export const ATHLETE_TRACKING_VERSION = "ava-single-pose-continuity-v1";

export const recordingModeSchema = z.enum([
  "static_precision",
  "static_usable",
  "smooth_pan",
  "unstable_pan",
  "pan_with_zoom",
  "excessive_camera_motion",
  "athlete_tracking_lost",
  "unsupported_recording",
]);
export type RecordingMode = z.infer<typeof recordingModeSchema>;

export const zoomClassificationSchema = z.enum([
  "no_meaningful_zoom",
  "stable_gradual_zoom",
  "abrupt_zoom",
  "unreliable_scale_change",
]);

const rangeSchema = z.object({ startFrame: z.number().int().nonnegative(), endFrame: z.number().int().nonnegative() });
const boxSchema = z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() });

export const cameraTransformFrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  translationX: z.number(),
  translationY: z.number(),
  rotationDeg: z.number(),
  scale: z.number().positive(),
  confidence: z.number().min(0).max(1),
  supportingFeatureCount: z.number().int().nonnegative(),
  inlierRatio: z.number().min(0).max(1),
  residualPx: z.number().nonnegative().nullable(),
  transformType: z.enum(["homography", "partial_affine"]).optional(),
  /** Row-major source-frame pixel homography, previous frame → current frame. */
  homography: z.array(z.number()).length(9).optional(),
});

export const athleteTrackFrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  boundingBox: boxSchema.nullable(),
  cropBox: boxSchema,
  detectionConfidence: z.number().min(0).max(1),
  cropConfidence: z.number().min(0).max(1),
  cropSource: z.enum(["direct", "interpolated", "full_frame"]),
  partiallyCropped: z.boolean(),
});

export const rawCameraEvidenceSchema = z.object({
  cameraMotionModelVersion: z.enum([
    CAMERA_MOTION_MODEL_VERSION,
    LEGACY_CAMERA_MOTION_MODEL_VERSION,
  ]),
  dynamicCropVersion: z.literal(DYNAMIC_CROP_VERSION),
  athleteTrackingVersion: z.literal(ATHLETE_TRACKING_VERSION),
  transforms: z.array(cameraTransformFrameSchema),
  athleteTrack: z.array(athleteTrackFrameSchema),
  trackingLossRanges: z.array(rangeSchema),
  unstableFrameRanges: z.array(rangeSchema),
});
export type RawCameraEvidence = z.infer<typeof rawCameraEvidenceSchema>;

export const recordingAssessmentSchema = z.object({
  recordingMode: recordingModeSchema,
  recordingModeVersion: z.literal(RECORDING_MODE_CLASSIFIER_VERSION),
  cameraMotionModelVersion: z.enum([
    CAMERA_MOTION_MODEL_VERSION,
    LEGACY_CAMERA_MOTION_MODEL_VERSION,
  ]),
  dynamicCropVersion: z.literal(DYNAMIC_CROP_VERSION),
  athleteTrackingVersion: z.literal(ATHLETE_TRACKING_VERSION),
  confidence: z.number().min(0).max(1),
  cameraMotionConfidence: z.number().min(0).max(1),
  athleteTrackingConfidence: z.number().min(0).max(1),
  zoomClassification: zoomClassificationSchema,
  zoomConfidence: z.number().min(0).max(1),
  transformSummary: z.object({
    meanTranslationPerFrame: z.number().nonnegative(),
    p95TranslationPerFrame: z.number().nonnegative(),
    p95RotationDeg: z.number().nonnegative(),
    maxScaleDeviation: z.number().nonnegative(),
    meanInlierRatio: z.number().min(0).max(1),
    meanSupportingFeatures: z.number().nonnegative(),
    p95ResidualPx: z.number().nonnegative(),
  }),
  trackingLossRanges: z.array(rangeSchema),
  unstableFrameRanges: z.array(rangeSchema),
  spatialMetricEligibility: z.enum(["eligible", "conditional", "withheld"]),
  warnings: z.array(z.string()),
});
export type RecordingAssessment = z.infer<typeof recordingAssessmentSchema>;

// V1 thresholds are normalized-frame or degree units. They are conservative initial
// engineering thresholds backed by deterministic transforms, not real-world validation.
export const RECORDING_MODE_THRESHOLDS = {
  minimumTrackingCoverage: 0.6,
  maximumContinuousTrackingLossFrames: 12,
  staticMeanTranslation: 0.0012,
  meaningfulPanTranslation: 0.002,
  excessiveTranslationP95: 0.04,
  unstableRotationP95Deg: 1.5,
  meaningfulScaleDeviation: 0.025,
  abruptScaleDeviation: 0.06,
  minimumCameraConfidence: 0.45,
  precisionCameraConfidence: 0.75,
  minimumBackgroundFeatures: 12,
  unstableResidualPx: 4,
} as const;

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.round((ordered.length - 1) * fraction))];
}

export function classifyRecordingMode(input: RawCameraEvidence): RecordingAssessment {
  const evidence = rawCameraEvidenceSchema.parse(input);
  const transforms = evidence.transforms;
  const tracked = evidence.athleteTrack.filter((frame) => frame.boundingBox != null);
  const trackingCoverage = evidence.athleteTrack.length ? tracked.length / evidence.athleteTrack.length : 0;
  const athleteTrackingConfidence = mean(evidence.athleteTrack.map((frame) => frame.detectionConfidence));
  const translations = transforms.map((frame) => Math.hypot(frame.translationX, frame.translationY));
  const rotations = transforms.map((frame) => Math.abs(frame.rotationDeg));
  const scaleDeviations = transforms.map((frame) => Math.abs(frame.scale - 1));
  const residuals = transforms.flatMap((frame) => frame.residualPx == null ? [] : [frame.residualPx]);
  const cameraMotionConfidence = mean(transforms.map((frame) => frame.confidence));
  const meanFeatures = mean(transforms.map((frame) => frame.supportingFeatureCount));
  const meanTranslation = mean(translations);
  const p95Translation = percentile(translations, 0.95);
  const p95Rotation = percentile(rotations, 0.95);
  const maxScaleDeviation = scaleDeviations.length ? Math.max(...scaleDeviations) : 0;
  const p95Residual = percentile(residuals, 0.95);
  const t = RECORDING_MODE_THRESHOLDS;
  const longestTrackingLoss = evidence.trackingLossRanges.reduce(
    (longest, range) => Math.max(longest, range.endFrame - range.startFrame + 1),
    0,
  );

  const zoomClassification =
    cameraMotionConfidence < t.minimumCameraConfidence && maxScaleDeviation >= t.meaningfulScaleDeviation
      ? "unreliable_scale_change"
      : maxScaleDeviation >= t.abruptScaleDeviation
        ? "abrupt_zoom"
        : maxScaleDeviation >= t.meaningfulScaleDeviation
          ? "stable_gradual_zoom"
          : "no_meaningful_zoom";

  let recordingMode: RecordingMode;
  if (trackingCoverage < t.minimumTrackingCoverage || longestTrackingLoss > t.maximumContinuousTrackingLossFrames)
    recordingMode = "athlete_tracking_lost";
  else if (!transforms.length || meanFeatures < t.minimumBackgroundFeatures) recordingMode = "unsupported_recording";
  else if (p95Translation >= t.excessiveTranslationP95) recordingMode = "excessive_camera_motion";
  else if (zoomClassification !== "no_meaningful_zoom") recordingMode = "pan_with_zoom";
  else if (p95Rotation >= t.unstableRotationP95Deg || p95Residual >= t.unstableResidualPx)
    recordingMode = meanTranslation >= t.meaningfulPanTranslation ? "unstable_pan" : "static_usable";
  else if (meanTranslation < t.staticMeanTranslation)
    recordingMode = cameraMotionConfidence >= t.precisionCameraConfidence ? "static_precision" : "static_usable";
  else if (cameraMotionConfidence >= t.minimumCameraConfidence) recordingMode = "smooth_pan";
  else recordingMode = "unstable_pan";

  const warnings: string[] = [];
  if (recordingMode === "smooth_pan") warnings.push("Camera movement was successfully measured for analysis.");
  if (recordingMode === "unstable_pan") warnings.push("Some spatial metrics have reduced confidence due to panning.");
  if (recordingMode === "pan_with_zoom") warnings.push("Zoom was detected, so distance and velocity metrics were withheld.");
  if (recordingMode === "athlete_tracking_lost") warnings.push("The athlete temporarily left the frame or could not be tracked reliably.");
  if (recordingMode === "excessive_camera_motion") warnings.push("The camera moved too abruptly for reliable compensation.");
  if (recordingMode === "unsupported_recording") warnings.push("Technique metrics may remain available, but camera motion could not be verified.");

  const spatialMetricEligibility =
    recordingMode === "static_precision" ? "eligible"
      : recordingMode === "static_usable" || recordingMode === "smooth_pan" ? "conditional"
        : "withheld";
  const confidence = Math.min(athleteTrackingConfidence, cameraMotionConfidence || 0);

  return recordingAssessmentSchema.parse({
    recordingMode,
    recordingModeVersion: RECORDING_MODE_CLASSIFIER_VERSION,
    cameraMotionModelVersion: CAMERA_MOTION_MODEL_VERSION,
    dynamicCropVersion: DYNAMIC_CROP_VERSION,
    athleteTrackingVersion: ATHLETE_TRACKING_VERSION,
    confidence,
    cameraMotionConfidence,
    athleteTrackingConfidence,
    zoomClassification,
    zoomConfidence: cameraMotionConfidence,
    transformSummary: {
      meanTranslationPerFrame: meanTranslation,
      p95TranslationPerFrame: p95Translation,
      p95RotationDeg: p95Rotation,
      maxScaleDeviation,
      meanInlierRatio: mean(transforms.map((frame) => frame.inlierRatio)),
      meanSupportingFeatures: meanFeatures,
      p95ResidualPx: p95Residual,
    },
    trackingLossRanges: evidence.trackingLossRanges,
    unstableFrameRanges: evidence.unstableFrameRanges,
    spatialMetricEligibility,
    warnings,
  });
}

export type PanningMetricGroup = "geometry" | "event_timing" | "cadence" | "spatial";

export function metricTrustForRecording(
  group: PanningMetricGroup,
  assessment: RecordingAssessment,
  calibrationAvailable: boolean,
): { status: "available" | "withheld"; confidence: number | null; reasonCode: string | null } {
  const tracking = assessment.athleteTrackingConfidence;
  if (group === "geometry")
    return tracking >= 0.6
      ? { status: "available", confidence: tracking, reasonCode: null }
      : { status: "withheld", confidence: null, reasonCode: "athlete_tracking_unreliable" };
  if (group === "cadence" || group === "event_timing")
    return tracking >= 0.7
      ? { status: "available", confidence: tracking, reasonCode: null }
      : { status: "withheld", confidence: null, reasonCode: "foot_events_unreliable" };
  if (!calibrationAvailable)
    return { status: "withheld", confidence: null, reasonCode: "calibration_required" };
  if (assessment.spatialMetricEligibility === "withheld")
    return { status: "withheld", confidence: null, reasonCode: "camera_motion_unreliable" };
  if (assessment.recordingMode === "smooth_pan")
    return { status: "withheld", confidence: null, reasonCode: "panning_ground_calibration_unvalidated" };
  return {
    status: "available",
    confidence: Math.min(assessment.confidence, assessment.cameraMotionConfidence),
    reasonCode: null,
  };
}
