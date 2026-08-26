import { z } from "zod";
import { rawCameraEvidenceSchema } from "../../video/recordingMode";
import { WORLD_COORDINATE_SCHEMA_VERSION } from "../../video/worldProjection";
import { cameraPathArtifactSchema } from "../../video/cameraPathSchema";
import { trackingDebugArtifactSchema } from "./trackingDebugSchema";

/**
 * Shapes of the raw output a MediaPipe PoseLandmarker run produces, plus Zod
 * schemas to validate it at the service boundary. These mirror MediaPipe Tasks:
 * per frame there is a list of normalized `landmarks` (x/y in [0,1], z relative)
 * and an optional matching list of metric `worldLandmarks` (meters, hip-
 * relative). Single-person, so one landmark list per frame.
 *
 * This is the contract a real inference service (e.g. a Python PoseLandmarker
 * sidecar) must satisfy; the backend maps it onto AVA's canonical schema.
 */
export const mediaPipeLandmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
  visibility: z.number().optional(),
  presence: z.number().optional(),
});
export type MediaPipeLandmark = z.infer<typeof mediaPipeLandmarkSchema>;

const mediaPipeVec2Schema = z.object({ x: z.number(), y: z.number() });
/** A dynamic-crop rectangle, normalized to the SOURCE frame's [0,1] space. */
const mediaPipeCropRectSchema = z.object({
  x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number(),
});

export const mediaPipeFrameSchema = z.object({
  landmarks: z.array(mediaPipeLandmarkSchema),
  worldLandmarks: z.array(mediaPipeLandmarkSchema).optional(),
  sourceFrameIndex: z.number().int().nonnegative().optional(),
  sourceTimestampMs: z.number().nonnegative().optional(),
  /** Frame timestamp in ms, if the service provides one. */
  timestampMs: z.number().optional(),
  trackingConfidence: z.number().min(0).max(1).optional(),
  // Dynamic-crop provenance (Part 5, Day 94): present only when ROI cropping
  // ran for this frame. `landmarks` above is ALREADY remapped to source-frame
  // space; these let that remap be independently verified, and let a consumer
  // reconstruct the crop the model actually saw.
  cropRect: mediaPipeCropRectSchema.optional(),
  cropScale: mediaPipeVec2Schema.optional(),
  cropTranslation: mediaPipeVec2Schema.optional(),
  sourceWidth: z.number().int().positive().optional(),
  sourceHeight: z.number().int().positive().optional(),
  /** The same landmarks, crop-normalized [0,1] — i.e. NOT remapped to source
   *  space. Omitted when no crop ran (crop-space === source-space). */
  landmarksCropSpace: z.array(mediaPipeLandmarkSchema).optional(),
  /** Athlete bounding box in SOURCE-frame normalized space, when detected. */
  athleteBoundingBoxSource: mediaPipeCropRectSchema.optional(),
  // Athlete-box tracker provenance (Day 96 audit). "frozen_suspect" (Phase
  // 4.2/4.2B, 2026-08-05) — see pose.ts's `poseFrameSchema` for the full
  // rationale; mirrored here since this is the raw service-boundary
  // contract the Python runner's JSON output is validated against before
  // `MediaPipePoseBackend` maps it onto the canonical schema. A strict enum
  // superset — old runner output with no `frozen_suspect` frames validates
  // unaffected.
  boxOrigin: z.enum(["detected", "tracked", "predicted", "reacquired", "invalid", "frozen_suspect"]).optional(),
  trackState: z.enum(["acquiring", "verified", "tracking", "reacquiring", "lost", "terminated"]).optional(),
  identityContinuityScore: z.number().min(0).max(1).optional(),
  // Phase 4.2B diagnostics (developer/debug visibility only).
  freezeSuspect: z.boolean().optional(),
  trackingUnreliable: z.boolean().optional(),
  trackingUnreliableReason: z.string().nullable().optional(),
  motionEstablished: z.boolean().optional(),
  freezeDurationMs: z.number().nonnegative().nullable().optional(),
  trajectoryResidualPx: z.number().nonnegative().nullable().optional(),
  featureSpreadPx: z.number().nonnegative().nullable().optional(),
  featureSpreadGrowthRatio: z.number().nonnegative().nullable().optional(),
  frozenDecision: z.string().nullable().optional(),
  // Phase 4.2C — crop-handoff provenance + pose feedback, mirrored from
  // pose.ts's `poseFrameSchema` (see there for the full rationale).
  localizationSourceFrameIndex: z.number().int().nonnegative().optional(),
  localizationTimestampMs: z.number().nonnegative().optional(),
  localizationState: z.string().optional(),
  localizationOrigin: z.string().optional(),
  localizationVerified: z.boolean().optional(),
  localizationAgeMs: z.number().nonnegative().nullable().optional(),
  scientificAthleteBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .optional(),
  cropPlannerInputBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .optional(),
  cropSourceFrameIndex: z.number().int().nonnegative().optional(),
  cropTimestampMs: z.number().nonnegative().optional(),
  cropOrigin: z.string().optional(),
  cropAgeMs: z.number().nonnegative().nullable().optional(),
  cropUsedPrediction: z.boolean().optional(),
  cropUsedFallback: z.boolean().optional(),
  cropUsedStaleBox: z.boolean().optional(),
  cropValidation: z.string().optional(),
  cropRejected: z.boolean().optional(),
  cropRejectedReason: z.string().nullable().optional(),
  poseSourceFrameIndex: z.number().int().nonnegative().optional(),
  poseTimestampMs: z.number().nonnegative().optional(),
  poseCorroboratesLocalization: z.boolean().nullable().optional(),
  poseLocalizationResidualPx: z.number().nonnegative().nullable().optional(),
  poseBoundsIoU: z.number().min(0).max(1).nullable().optional(),
  poseMissDurationMs: z.number().nonnegative().nullable().optional(),
  repeatedIdenticalCropCount: z.number().int().nonnegative().nullable().optional(),
  localizationFeedbackAction: z.string().nullable().optional(),
  localizationFeedbackReason: z.string().nullable().optional(),
  // Phase 4.2F — athlete-interior feature-selection diagnostics (developer/
  // debug visibility only, mirrored from pose.ts's `poseFrameSchema`; see
  // there for the full rationale).
  athleteInteriorFeatureRatio: z.number().min(0).max(1).nullable().optional(),
  backgroundRiskFeatureRatio: z.number().min(0).max(1).nullable().optional(),
  flowQualityDegrading: z.boolean().nullable().optional(),
  featureMaskSource: z.string().nullable().optional(),
  flowRejectedBackgroundDominated: z.boolean().nullable().optional(),
  // Phase 4.2G — time-normalized coast-risk diagnostics (developer/debug
  // visibility only, mirrored from pose.ts's `poseFrameSchema`; see there
  // for the full rationale).
  timeSinceVerifiedDetectorMs: z.number().nonnegative().nullable().optional(),
  distanceSinceVerifiedDetectorPx: z.number().nonnegative().nullable().optional(),
  distanceSinceVerifiedDetectorFrameWidths: z.number().nonnegative().nullable().optional(),
  coastRiskState: z.string().nullable().optional(),
  coastRiskSignals: z.array(z.string()).nullable().optional(),
  flowProtectionActive: z.boolean().nullable().optional(),
  flowProtectionReason: z.string().nullable().optional(),
  // Phase 4.2H — distance-and-evidence-based coast-risk diagnostics
  // (developer/debug visibility only, mirrored from pose.ts's
  // `poseFrameSchema`; see there for the full rationale).
  expectedDistanceFrameWidths: z.number().nonnegative().nullable().optional(),
  trajectoryResidualFrameWidths: z.number().nonnegative().nullable().optional(),
  athleteOwnedFeatureRatio: z.number().min(0).max(1).nullable().optional(),
  backgroundRiskRatio: z.number().min(0).max(1).nullable().optional(),
  forwardBackwardValidRatio: z.number().min(0).max(1).nullable().optional(),
  coastRiskReasons: z.array(z.string()).nullable().optional(),
  flowProtectionLevel: z.string().nullable().optional(),
  localizationTerminationReason: z.string().nullable().optional(),
  // Phase 4.2I — pose-landmark-guided per-point ownership diagnostic
  // (developer/debug visibility only, mirrored from pose.ts's
  // `poseFrameSchema`; see there for the full rationale).
  skeletonOwnershipRatio: z.number().min(0).max(1).nullable().optional(),
  // Phase 4.2J — bounded, retroactive short-interval adjudication
  // provenance (developer/debug visibility only, mirrored from pose.ts's
  // `poseFrameSchema`; see there for the full rationale).
  originalLocalizationState: z.string().nullable().optional(),
  originalBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .optional(),
  adjudicatedLocalizationState: z.string().nullable().optional(),
  adjudicatedBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .optional(),
  adjudicationDecision: z.string().nullable().optional(),
  adjudicationSource: z.string().nullable().optional(),
  adjudicationStartFrame: z.number().int().nonnegative().nullable().optional(),
  adjudicationEndFrame: z.number().int().nonnegative().nullable().optional(),
  beforeAnchorFrame: z.number().int().nullable().optional(),
  afterAnchorFrame: z.number().int().nullable().optional(),
  poseEvidenceFrames: z.array(z.number().int()).nullable().optional(),
  detectorEvidenceFrames: z.array(z.number().int()).nullable().optional(),
  interpolationUsed: z.boolean().nullable().optional(),
  correctionDistancePx: z.number().nonnegative().nullable().optional(),
  correctionDistanceFrameWidths: z.number().nonnegative().nullable().optional(),
  scientificEligibilityBefore: z.boolean().nullable().optional(),
  scientificEligibilityAfter: z.boolean().nullable().optional(),
  adjudicationReason: z.string().nullable().optional(),
  // Phase 5.0B — adaptive crop geometry / full-body containment provenance
  // (developer/debug visibility only, mirrored from pose.ts's
  // `poseFrameSchema`; see there for the full rationale).
  cropContainmentState: z.string().nullable().optional(),
  cropUtilization: z.number().nullable().optional(),
  footBoundaryRisk: z.boolean().nullable().optional(),
  headBoundaryRisk: z.boolean().nullable().optional(),
  minJointMarginNormalized: z.number().nullable().optional(),
  forwardMarginNormalized: z.number().nullable().optional(),
  rearMarginNormalized: z.number().nullable().optional(),
  bottomMarginNormalized: z.number().nullable().optional(),
  predictedCenterOffsetPx: z.number().nullable().optional(),
  predictionHorizonMs: z.number().nonnegative().nullable().optional(),
  cropScaleFactor: z.number().nullable().optional(),
  cropAdjustmentReason: z.string().nullable().optional(),
  // Phase 5.0C — contact-critical foot landmark recovery provenance
  // (developer/debug visibility only, mirrored from pose.ts's
  // `poseFrameSchema`; see there for the full rationale).
  secondaryPoseEligible: z.boolean().nullable().optional(),
  secondaryPoseEligibilityReason: z.string().nullable().optional(),
  missingCriticalLandmarks: z.array(z.string()).nullable().optional(),
  primaryCropBoundaryRisk: z.boolean().nullable().optional(),
  secondaryPoseAttempted: z.boolean().nullable().optional(),
  secondaryCropRect: z
    .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
    .nullable()
    .optional(),
  secondaryPoseRecoveryOutcome: z.string().nullable().optional(),
  landmarkMergeLog: z
    .array(
      z.object({
        joint: z.string(),
        landmarkSource: z.enum(["primary", "secondary_recovery"]),
        primaryValue: mediaPipeLandmarkSchema.nullable().optional(),
        recoveredValue: mediaPipeLandmarkSchema.nullable().optional(),
        recoveryCrop: z
          .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
          .nullable()
          .optional(),
        recoveryReason: z.string().nullable().optional(),
        mergeAccepted: z.boolean(),
        mergeRejectedReason: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  // Phase 4.2K — independent, bidirectional-trajectory localization
  // verification provenance (see pose.ts for the full contract).
  independentLocalizationState: z
    .enum(["independent_corroborated", "independent_disagrees", "independent_unavailable"])
    .nullable()
    .optional(),
  independentTrajectoryResidualBeforeSigma: z.number().nullable().optional(),
  independentTrajectoryResidualAfterSigma: z.number().nullable().optional(),
  independentVerificationReason: z.string().nullable().optional(),
});
export type MediaPipeFrame = z.infer<typeof mediaPipeFrameSchema>;

export const mediaPipeResultSchema = z.object({
  fps: z.number().positive(),
  sourceFps: z.number().positive().optional(),
  sourceAverageFps: z.number().positive().nullable().optional(),
  sourceNominalFps: z.number().positive().nullable().optional(),
  sourceRealFps: z.number().positive().nullable().optional(),
  sourceTimestampFps: z.number().positive().nullable().optional(),
  sourceVariableFrameRate: z.boolean().optional(),
  sourceFpsClassification: z
    .enum([
      "experimental_30_fps_class",
      "validated_60_fps_class",
      "native_source_class",
      "validated_high_speed_native_class",
      "high_speed_source_normalized_to_60",
      "unsupported_source_fps",
    ])
    .optional(),
  sourceFrameCount: z.number().int().nonnegative().optional(),
  sourceFpsTierReason: z.string().optional(),
  sourceFpsTierPolicyVersion: z.string().optional(),
  sourceDurationSeconds: z.number().nonnegative().optional(),
  sourceCodec: z.string().nullable().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cameraEvidence: rawCameraEvidenceSchema.optional(),
  /** Phase 1 global keyframe camera path — must be listed here too, or Zod's
   *  default unknown-key stripping silently drops it before it ever reaches
   *  `buildPoseSequence`/`poseSequenceSchema` (the actual root cause of an
   *  earlier real-run regression: the artifact schema had it, this one didn't). */
  cameraPath: cameraPathArtifactSchema.optional(),
  /** Day 95 audit — stationary athlete-tracking debug artifact. */
  trackingDebug: trackingDebugArtifactSchema.optional(),
  coordinateSchemaVersion: z.literal(WORLD_COORDINATE_SCHEMA_VERSION).optional(),
  frames: z.array(mediaPipeFrameSchema),
});
export type MediaPipePoseResult = z.infer<typeof mediaPipeResultSchema>;
