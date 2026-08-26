import { poseSequenceSchema, type PoseFrame, type PoseSequence } from "../pose";
import type { PoseBackend, PoseEstimateOptions, VideoRef } from "../pose-backend";

import { mapFrameToCropSpaceKeypoints, mapFrameToKeypoints } from "./MediaPipeLandmarkMap";
import { mediaPipeResultSchema, type MediaPipePoseResult } from "./MediaPipeTypes";
import {
  PythonMediaPipePoseService,
  type PythonMediaPipeOptions,
} from "./PythonMediaPipePoseService";
import { classifyRecordingMode } from "../../video/recordingMode";

const BACKEND_NAME = "mediapipe" as const;
const MODEL_VERSION = "mediapipe-pose-0.1";

/**
 * The inference boundary. A concrete service runs MediaPipe PoseLandmarker over
 * the video and returns raw landmarks. It is injected so the backend's mapping
 * and validation can be exercised without a real runtime, and so a future
 * Python PoseLandmarker sidecar drops in without touching the mapping code.
 */
export interface MediaPipePoseService {
  run(video: VideoRef, opts?: PoseEstimateOptions): Promise<MediaPipePoseResult>;
}

/**
 * Default service used when no real MediaPipe runtime is wired up. Everything
 * else in this module (typing, mapping, schema validation) is fully real — this
 * throws *only* when actual inference is attempted.
 */
export class UnavailableMediaPipeService implements MediaPipePoseService {
  async run(): Promise<MediaPipePoseResult> {
    throw new Error(
      "MediaPipe runtime is not available yet — inject a MediaPipePoseService " +
        "that runs PoseLandmarker (e.g. a Python sidecar) to enable real inference.",
    );
  }
}

/**
 * Turn a raw MediaPipe result into a validated canonical {@link PoseSequence}.
 * Pure and runtime-independent: validates the service output, maps each frame's
 * landmarks onto canonical joints, then validates the assembled sequence.
 */
export function buildPoseSequence(raw: MediaPipePoseResult): PoseSequence {
  const result = mediaPipeResultSchema.parse(raw);

  const frames: PoseFrame[] = result.frames.map((frame, index) => ({
    index,
    tMs: frame.timestampMs ?? (index / result.fps) * 1000,
    sourceFrameIndex: frame.sourceFrameIndex,
    sourceTimestampMs: frame.sourceTimestampMs,
    keypoints: mapFrameToKeypoints(frame),
    trackingConfidence: frame.trackingConfidence,
    // Dynamic-crop provenance (Part 5, Day 94) — passthrough only, present
    // exactly when the raw frame carried it (ROI cropping ran for this frame).
    ...(frame.cropRect ? { cropRect: frame.cropRect } : {}),
    ...(frame.cropScale ? { cropScale: frame.cropScale } : {}),
    ...(frame.cropTranslation ? { cropTranslation: frame.cropTranslation } : {}),
    ...(frame.sourceWidth != null ? { sourceWidth: frame.sourceWidth } : {}),
    ...(frame.sourceHeight != null ? { sourceHeight: frame.sourceHeight } : {}),
    ...(frame.landmarksCropSpace ? { keypointsCropSpace: mapFrameToCropSpaceKeypoints(frame) } : {}),
    ...(frame.athleteBoundingBoxSource ? { athleteBoundingBoxSource: frame.athleteBoundingBoxSource } : {}),
    ...(frame.boxOrigin ? { boxOrigin: frame.boxOrigin } : {}),
    ...(frame.trackState ? { trackState: frame.trackState } : {}),
    ...(frame.identityContinuityScore != null ? { identityContinuityScore: frame.identityContinuityScore } : {}),
    // Phase 4.2B — frozen-track detector diagnostics, developer visibility
    // only (never read by metrics/contact logic, which continues to gate
    // solely on `boxOrigin`). Passthrough only, present exactly when the
    // raw frame carried them.
    ...(frame.freezeSuspect != null ? { freezeSuspect: frame.freezeSuspect } : {}),
    ...(frame.motionEstablished != null ? { motionEstablished: frame.motionEstablished } : {}),
    ...(frame.freezeDurationMs != null ? { freezeDurationMs: frame.freezeDurationMs } : {}),
    ...(frame.trajectoryResidualPx != null ? { trajectoryResidualPx: frame.trajectoryResidualPx } : {}),
    ...(frame.featureSpreadPx != null ? { featureSpreadPx: frame.featureSpreadPx } : {}),
    ...(frame.featureSpreadGrowthRatio != null ? { featureSpreadGrowthRatio: frame.featureSpreadGrowthRatio } : {}),
    ...(frame.frozenDecision != null ? { frozenDecision: frame.frozenDecision } : {}),
    // Phase 4.2C — crop-handoff provenance + pose feedback, same
    // passthrough-only pattern (developer visibility; `boxOrigin` remains
    // the sole field metrics/contact logic gates on).
    ...(frame.localizationSourceFrameIndex != null ? { localizationSourceFrameIndex: frame.localizationSourceFrameIndex } : {}),
    ...(frame.localizationTimestampMs != null ? { localizationTimestampMs: frame.localizationTimestampMs } : {}),
    ...(frame.localizationState != null ? { localizationState: frame.localizationState } : {}),
    ...(frame.localizationOrigin != null ? { localizationOrigin: frame.localizationOrigin } : {}),
    ...(frame.localizationVerified != null ? { localizationVerified: frame.localizationVerified } : {}),
    ...(frame.localizationAgeMs != null ? { localizationAgeMs: frame.localizationAgeMs } : {}),
    ...(frame.scientificAthleteBox != null ? { scientificAthleteBox: frame.scientificAthleteBox } : {}),
    ...(frame.cropPlannerInputBox != null ? { cropPlannerInputBox: frame.cropPlannerInputBox } : {}),
    ...(frame.cropSourceFrameIndex != null ? { cropSourceFrameIndex: frame.cropSourceFrameIndex } : {}),
    ...(frame.cropTimestampMs != null ? { cropTimestampMs: frame.cropTimestampMs } : {}),
    ...(frame.cropOrigin != null ? { cropOrigin: frame.cropOrigin } : {}),
    ...(frame.cropAgeMs != null ? { cropAgeMs: frame.cropAgeMs } : {}),
    ...(frame.cropUsedPrediction != null ? { cropUsedPrediction: frame.cropUsedPrediction } : {}),
    ...(frame.cropUsedFallback != null ? { cropUsedFallback: frame.cropUsedFallback } : {}),
    ...(frame.cropUsedStaleBox != null ? { cropUsedStaleBox: frame.cropUsedStaleBox } : {}),
    ...(frame.cropValidation != null ? { cropValidation: frame.cropValidation } : {}),
    ...(frame.cropRejected != null ? { cropRejected: frame.cropRejected } : {}),
    ...(frame.cropRejectedReason != null ? { cropRejectedReason: frame.cropRejectedReason } : {}),
    ...(frame.poseSourceFrameIndex != null ? { poseSourceFrameIndex: frame.poseSourceFrameIndex } : {}),
    ...(frame.poseTimestampMs != null ? { poseTimestampMs: frame.poseTimestampMs } : {}),
    ...(frame.poseCorroboratesLocalization != null ? { poseCorroboratesLocalization: frame.poseCorroboratesLocalization } : {}),
    ...(frame.poseLocalizationResidualPx != null ? { poseLocalizationResidualPx: frame.poseLocalizationResidualPx } : {}),
    ...(frame.poseBoundsIoU != null ? { poseBoundsIoU: frame.poseBoundsIoU } : {}),
    ...(frame.poseMissDurationMs != null ? { poseMissDurationMs: frame.poseMissDurationMs } : {}),
    ...(frame.repeatedIdenticalCropCount != null ? { repeatedIdenticalCropCount: frame.repeatedIdenticalCropCount } : {}),
    ...(frame.localizationFeedbackAction != null ? { localizationFeedbackAction: frame.localizationFeedbackAction } : {}),
    ...(frame.localizationFeedbackReason != null ? { localizationFeedbackReason: frame.localizationFeedbackReason } : {}),
    // Phase 4.2F — athlete-interior feature-selection diagnostics, same
    // passthrough-only pattern (developer visibility only).
    ...(frame.athleteInteriorFeatureRatio != null ? { athleteInteriorFeatureRatio: frame.athleteInteriorFeatureRatio } : {}),
    ...(frame.backgroundRiskFeatureRatio != null ? { backgroundRiskFeatureRatio: frame.backgroundRiskFeatureRatio } : {}),
    ...(frame.flowQualityDegrading != null ? { flowQualityDegrading: frame.flowQualityDegrading } : {}),
    ...(frame.featureMaskSource != null ? { featureMaskSource: frame.featureMaskSource } : {}),
    ...(frame.flowRejectedBackgroundDominated != null ? { flowRejectedBackgroundDominated: frame.flowRejectedBackgroundDominated } : {}),
    // Phase 4.2G — time-normalized coast-risk diagnostics, same
    // passthrough-only pattern (developer visibility only).
    ...(frame.timeSinceVerifiedDetectorMs != null ? { timeSinceVerifiedDetectorMs: frame.timeSinceVerifiedDetectorMs } : {}),
    ...(frame.distanceSinceVerifiedDetectorPx != null ? { distanceSinceVerifiedDetectorPx: frame.distanceSinceVerifiedDetectorPx } : {}),
    ...(frame.distanceSinceVerifiedDetectorFrameWidths != null ? { distanceSinceVerifiedDetectorFrameWidths: frame.distanceSinceVerifiedDetectorFrameWidths } : {}),
    ...(frame.coastRiskState != null ? { coastRiskState: frame.coastRiskState } : {}),
    ...(frame.coastRiskSignals != null ? { coastRiskSignals: frame.coastRiskSignals } : {}),
    ...(frame.flowProtectionActive != null ? { flowProtectionActive: frame.flowProtectionActive } : {}),
    ...(frame.flowProtectionReason != null ? { flowProtectionReason: frame.flowProtectionReason } : {}),
    // Phase 4.2H — distance-and-evidence-based coast-risk diagnostics, same
    // passthrough-only pattern (developer visibility only).
    ...(frame.expectedDistanceFrameWidths != null ? { expectedDistanceFrameWidths: frame.expectedDistanceFrameWidths } : {}),
    ...(frame.trajectoryResidualFrameWidths != null ? { trajectoryResidualFrameWidths: frame.trajectoryResidualFrameWidths } : {}),
    ...(frame.athleteOwnedFeatureRatio != null ? { athleteOwnedFeatureRatio: frame.athleteOwnedFeatureRatio } : {}),
    ...(frame.backgroundRiskRatio != null ? { backgroundRiskRatio: frame.backgroundRiskRatio } : {}),
    ...(frame.forwardBackwardValidRatio != null ? { forwardBackwardValidRatio: frame.forwardBackwardValidRatio } : {}),
    ...(frame.coastRiskReasons != null ? { coastRiskReasons: frame.coastRiskReasons } : {}),
    ...(frame.flowProtectionLevel != null ? { flowProtectionLevel: frame.flowProtectionLevel } : {}),
    ...(frame.localizationTerminationReason != null ? { localizationTerminationReason: frame.localizationTerminationReason } : {}),
    // Phase 4.2I — pose-landmark-guided per-point ownership diagnostic,
    // same passthrough-only pattern (developer visibility only).
    ...(frame.skeletonOwnershipRatio != null ? { skeletonOwnershipRatio: frame.skeletonOwnershipRatio } : {}),
    // Phase 4.2J — bounded, retroactive short-interval adjudication
    // provenance, same passthrough-only pattern (developer visibility
    // only). `scientificAthleteBox`/`cropPlannerInputBox` are mapped
    // above already and carry the CORRECTED value when a correction was
    // applied; these fields carry the audit trail alongside them.
    ...(frame.originalLocalizationState != null ? { originalLocalizationState: frame.originalLocalizationState } : {}),
    ...(frame.originalBox != null ? { originalBox: frame.originalBox } : {}),
    ...(frame.adjudicatedLocalizationState != null ? { adjudicatedLocalizationState: frame.adjudicatedLocalizationState } : {}),
    ...(frame.adjudicatedBox != null ? { adjudicatedBox: frame.adjudicatedBox } : {}),
    ...(frame.adjudicationDecision != null ? { adjudicationDecision: frame.adjudicationDecision } : {}),
    ...(frame.adjudicationSource != null ? { adjudicationSource: frame.adjudicationSource } : {}),
    ...(frame.adjudicationStartFrame != null ? { adjudicationStartFrame: frame.adjudicationStartFrame } : {}),
    ...(frame.adjudicationEndFrame != null ? { adjudicationEndFrame: frame.adjudicationEndFrame } : {}),
    ...(frame.beforeAnchorFrame != null ? { beforeAnchorFrame: frame.beforeAnchorFrame } : {}),
    ...(frame.afterAnchorFrame != null ? { afterAnchorFrame: frame.afterAnchorFrame } : {}),
    ...(frame.poseEvidenceFrames != null ? { poseEvidenceFrames: frame.poseEvidenceFrames } : {}),
    ...(frame.detectorEvidenceFrames != null ? { detectorEvidenceFrames: frame.detectorEvidenceFrames } : {}),
    ...(frame.interpolationUsed != null ? { interpolationUsed: frame.interpolationUsed } : {}),
    ...(frame.correctionDistancePx != null ? { correctionDistancePx: frame.correctionDistancePx } : {}),
    ...(frame.correctionDistanceFrameWidths != null ? { correctionDistanceFrameWidths: frame.correctionDistanceFrameWidths } : {}),
    ...(frame.scientificEligibilityBefore != null ? { scientificEligibilityBefore: frame.scientificEligibilityBefore } : {}),
    ...(frame.scientificEligibilityAfter != null ? { scientificEligibilityAfter: frame.scientificEligibilityAfter } : {}),
    ...(frame.adjudicationReason != null ? { adjudicationReason: frame.adjudicationReason } : {}),
    ...(frame.cropContainmentState != null ? { cropContainmentState: frame.cropContainmentState } : {}),
    ...(frame.cropUtilization != null ? { cropUtilization: frame.cropUtilization } : {}),
    ...(frame.footBoundaryRisk != null ? { footBoundaryRisk: frame.footBoundaryRisk } : {}),
    ...(frame.headBoundaryRisk != null ? { headBoundaryRisk: frame.headBoundaryRisk } : {}),
    ...(frame.minJointMarginNormalized != null ? { minJointMarginNormalized: frame.minJointMarginNormalized } : {}),
    ...(frame.forwardMarginNormalized != null ? { forwardMarginNormalized: frame.forwardMarginNormalized } : {}),
    ...(frame.rearMarginNormalized != null ? { rearMarginNormalized: frame.rearMarginNormalized } : {}),
    ...(frame.bottomMarginNormalized != null ? { bottomMarginNormalized: frame.bottomMarginNormalized } : {}),
    ...(frame.predictedCenterOffsetPx != null ? { predictedCenterOffsetPx: frame.predictedCenterOffsetPx } : {}),
    ...(frame.predictionHorizonMs != null ? { predictionHorizonMs: frame.predictionHorizonMs } : {}),
    ...(frame.cropScaleFactor != null ? { cropScaleFactor: frame.cropScaleFactor } : {}),
    ...(frame.cropAdjustmentReason != null ? { cropAdjustmentReason: frame.cropAdjustmentReason } : {}),
    ...(frame.secondaryPoseEligible != null ? { secondaryPoseEligible: frame.secondaryPoseEligible } : {}),
    ...(frame.secondaryPoseEligibilityReason != null ? { secondaryPoseEligibilityReason: frame.secondaryPoseEligibilityReason } : {}),
    ...(frame.missingCriticalLandmarks != null ? { missingCriticalLandmarks: frame.missingCriticalLandmarks } : {}),
    ...(frame.primaryCropBoundaryRisk != null ? { primaryCropBoundaryRisk: frame.primaryCropBoundaryRisk } : {}),
    ...(frame.secondaryPoseAttempted != null ? { secondaryPoseAttempted: frame.secondaryPoseAttempted } : {}),
    ...(frame.secondaryCropRect != null ? { secondaryCropRect: frame.secondaryCropRect } : {}),
    ...(frame.secondaryPoseRecoveryOutcome != null ? { secondaryPoseRecoveryOutcome: frame.secondaryPoseRecoveryOutcome } : {}),
    ...(frame.landmarkMergeLog != null ? { landmarkMergeLog: frame.landmarkMergeLog } : {}),
    ...(frame.independentLocalizationState != null ? { independentLocalizationState: frame.independentLocalizationState } : {}),
    ...(frame.independentTrajectoryResidualBeforeSigma != null ? { independentTrajectoryResidualBeforeSigma: frame.independentTrajectoryResidualBeforeSigma } : {}),
    ...(frame.independentTrajectoryResidualAfterSigma != null ? { independentTrajectoryResidualAfterSigma: frame.independentTrajectoryResidualAfterSigma } : {}),
    ...(frame.independentVerificationReason != null ? { independentVerificationReason: frame.independentVerificationReason } : {}),
  }));

  const sequence: PoseSequence = {
    backend: BACKEND_NAME,
    modelVersion: MODEL_VERSION,
    coordSpace: "normalized",
    fps: result.fps,
    width: result.width,
    height: result.height,
    coordinateSchemaVersion: result.coordinateSchemaVersion,
    ...(result.cameraEvidence
      ? {
          cameraEvidence: result.cameraEvidence,
          recordingAssessment: classifyRecordingMode(result.cameraEvidence),
        }
      : {}),
    ...(result.cameraPath ? { cameraPath: result.cameraPath } : {}),
    ...(result.trackingDebug ? { trackingDebug: result.trackingDebug } : {}),
    ...(result.sourceFps != null
      ? {
          sourceMetadata: {
            fps: result.sourceFps,
            averageFps: result.sourceAverageFps ?? null,
            nominalFps: result.sourceNominalFps ?? null,
            realFps: result.sourceRealFps ?? null,
            timestampFps: result.sourceTimestampFps ?? null,
            variableFrameRate: result.sourceVariableFrameRate ?? false,
            fpsTierReason: result.sourceFpsTierReason,
            fpsTierPolicyVersion: result.sourceFpsTierPolicyVersion,
            ...(result.sourceFpsClassification === "validated_60_fps_class" ||
            result.sourceFpsClassification === "native_source_class" ||
            result.sourceFpsClassification === "validated_high_speed_native_class" ||
            result.sourceFpsClassification === "high_speed_source_normalized_to_60" ||
            result.sourceFpsClassification === "experimental_30_fps_class"
              ? { fpsClassification: result.sourceFpsClassification }
              : {}),
            frameCount: result.sourceFrameCount ?? result.frames.length,
            durationSeconds:
              result.sourceDurationSeconds ??
              (result.sourceFrameCount ?? result.frames.length) / result.sourceFps,
            codec: result.sourceCodec ?? null,
          },
        }
      : {}),
    frames,
  };
  return poseSequenceSchema.parse(sequence) as PoseSequence;
}

/**
 * MediaPipe Pose backend. Implements {@link PoseBackend} unchanged: `VideoRef`
 * in, validated `PoseSequence` out. Inference is delegated to an injected
 * {@link MediaPipePoseService}; the default one is a stub that only throws when
 * inference is actually attempted.
 */
export class MediaPipePoseBackend implements PoseBackend {
  readonly name = BACKEND_NAME;
  readonly modelVersion = MODEL_VERSION;

  constructor(private readonly service: MediaPipePoseService = new UnavailableMediaPipeService()) {}

  /**
   * Build a backend backed by the real Python MediaPipe runtime. Construction is
   * always safe; if the Python deps are missing, `estimate()` fails cleanly with
   * an actionable error rather than at construction — so this stays a safe
   * opt-in with the stub as the default fallback.
   */
  static withPythonRuntime(options?: PythonMediaPipeOptions): MediaPipePoseBackend {
    return new MediaPipePoseBackend(new PythonMediaPipePoseService(options));
  }

  async estimate(video: VideoRef, opts: PoseEstimateOptions = {}): Promise<PoseSequence> {
    const raw = await this.service.run(video, opts);
    return buildPoseSequence(raw);
  }
}
