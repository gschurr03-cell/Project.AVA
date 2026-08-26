import { z } from "zod";
import { rawCameraEvidenceSchema, recordingAssessmentSchema } from "../video/recordingMode";
import { WORLD_COORDINATE_SCHEMA_VERSION } from "../video/worldProjection";
import { cameraPathArtifactSchema } from "../video/cameraPathSchema";
import { gateLockDebugArtifactSchema } from "../calibration/gateLockDebug";
import { trackingDebugArtifactSchema } from "./mediapipe/trackingDebugSchema";

/**
 * Canonical pose vocabulary for Project AVA.
 *
 * This is the backend-agnostic contract between a pose estimator and the
 * biomechanics math. Every backend (MediaPipe now, RTMPose later) maps its
 * native keypoints onto this canonical set and omits any joint it cannot
 * provide — so the metrics layer never sees a backend-specific format.
 *
 * Coordinates are normalized image coordinates in [0, 1], origin at the
 * top-left (so pixel-based RTMPose and MediaPipe's normalized output converge).
 * `world` carries optional metric 3D (meters, hip-relative) that MediaPipe
 * emits and RTMPose does not — consumers must treat it as optional.
 */
export const CANONICAL_JOINTS = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_toe",
  "right_toe",
  // Upper limbs — added Day 54 for arm/shoulder tracking. MediaPipe already
  // emits these; they are consumed by the interactive overlay (arm segments and
  // elbow/shoulder angles). No existing lower-body metric reads them.
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
] as const;

export const jointNameSchema = z.enum(CANONICAL_JOINTS);
export type JointName = (typeof CANONICAL_JOINTS)[number];

export const keypointSchema = z.object({
  /** Normalized image x in [0, 1]. */
  x: z.number(),
  /** Normalized image y in [0, 1]. */
  y: z.number(),
  /** Detector confidence, 0..1. */
  score: z.number().min(0).max(1),
  /** Optional occlusion/visibility signal, 0..1 (MediaPipe). */
  visibility: z.number().min(0).max(1).optional(),
  /** Optional metric 3D in meters, hip-relative (MediaPipe world landmarks). */
  world: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
});
export type Keypoint = z.infer<typeof keypointSchema>;

/** Phase 5.0C — a raw MediaPipe-shaped landmark value (as `landmark_dict()`
 *  emits it: x/y normalized, optional z/visibility/presence), used only
 *  inside `landmarkMergeLog` entries to record the exact primary/recovered
 *  values compared during a merge decision. Deliberately looser than
 *  {@link keypointSchema} (no required `score`) since it mirrors the raw
 *  Python-side dict shape, not the canonical per-joint keypoint record. */
const phase5cLandmarkValueSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
  visibility: z.number().optional(),
  presence: z.number().optional(),
});

/**
 * One frame of pose. `keypoints` is intentionally partial: lossy backends omit
 * joints they can't localize rather than fabricating them.
 */
const vec2Schema = z.object({ x: z.number(), y: z.number() });
/** A dynamic-crop rectangle, normalized to the SOURCE frame's [0,1] space. */
const cropRectSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });

export const poseFrameSchema = z.object({
  /** 0-based frame index within the sequence. */
  index: z.number().int().nonnegative(),
  /** Frame timestamp in milliseconds from the start of the clip. */
  tMs: z.number().nonnegative(),
  sourceFrameIndex: z.number().int().nonnegative().optional(),
  sourceTimestampMs: z.number().nonnegative().optional(),
  keypoints: z.record(jointNameSchema, keypointSchema),
  /** Person-track confidence supplied by detector-backed pose engines. */
  trackingConfidence: z.number().min(0).max(1).optional(),
  /** Optional second-engine pose for visual debugging only; never read by metrics. */
  comparisonKeypoints: z.record(jointNameSchema, keypointSchema).optional(),
  comparisonBackend: z.string().optional(),
  // Dynamic-crop provenance (Part 5, Day 94) — present only when ROI cropping
  // ran for this frame. `keypoints` above is already source-space; these let
  // that remap be independently verified against the raw crop-space output.
  cropRect: cropRectSchema.optional(),
  cropScale: vec2Schema.optional(),
  cropTranslation: vec2Schema.optional(),
  sourceWidth: z.number().int().positive().optional(),
  sourceHeight: z.number().int().positive().optional(),
  /** Same joints as `keypoints`, but crop-normalized (not remapped to source
   *  space) — for coordinate-transform verification only, never read by metrics. */
  keypointsCropSpace: z.record(jointNameSchema, keypointSchema).optional(),
  /** Athlete bounding box in SOURCE-frame normalized space, when detected. */
  athleteBoundingBoxSource: cropRectSchema.optional(),
  // Athlete-box tracker provenance (Day 96 audit, Part 4/7) — "predicted"/
  // "invalid" origin means this frame's crop was guided by extrapolation,
  // NOT verified tracking/detection evidence. Contact/crossing detection
  // must gate on this, never trust `keypoints` alone.
  //
  // "frozen_suspect" (Phase 4.2/4.2B, 2026-08-05) — box_tracker.py's own
  // stationary-lock/frozen-track detector retroactively relabeled this
  // frame: optical flow reported "tracked" with a saturated inlier count,
  // but the box's own feature-spread growth and/or trajectory-residual
  // signals proved it had settled onto near-static structure while the
  // real athlete kept moving, and a LATER identity-verified detection
  // disagreed with the frozen position strongly enough to confirm it. Must
  // be treated exactly like "predicted"/"invalid" by every scientific
  // evidence consumer (see measurements.ts's `stripUnverifiedLandmarks`) —
  // an OLD artifact with no `frozen_suspect` frames parses unaffected
  // (a strict enum superset, no schema version bump required).
  boxOrigin: z.enum(["detected", "tracked", "predicted", "reacquired", "invalid", "frozen_suspect"]).optional(),
  trackState: z.enum(["acquiring", "verified", "tracking", "reacquiring", "lost", "terminated"]).optional(),
  identityContinuityScore: z.number().min(0).max(1).optional(),
  // Phase 4.2B diagnostics (developer/debug visibility only — never read by
  // metrics/contact logic, which continues to gate solely on `boxOrigin`).
  freezeSuspect: z.boolean().optional(),
  trackingUnreliable: z.boolean().optional(),
  trackingUnreliableReason: z.string().nullable().optional(),
  motionEstablished: z.boolean().optional(),
  freezeDurationMs: z.number().nonnegative().nullable().optional(),
  trajectoryResidualPx: z.number().nonnegative().nullable().optional(),
  featureSpreadPx: z.number().nonnegative().nullable().optional(),
  featureSpreadGrowthRatio: z.number().nonnegative().nullable().optional(),
  frozenDecision: z.string().nullable().optional(),
  // Phase 4.2C — crop-handoff provenance (developer/debug visibility;
  // `boxOrigin` above remains the sole field metrics/contact logic gates
  // on). Additive/optional so old artifacts parse unaffected.
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
  // Phase 4.2C — bounded pose-as-localization-feedback (Part 5). Never
  // consumer-facing confidence percentages; developer diagnostics only.
  poseCorroboratesLocalization: z.boolean().nullable().optional(),
  poseLocalizationResidualPx: z.number().nonnegative().nullable().optional(),
  poseBoundsIoU: z.number().min(0).max(1).nullable().optional(),
  poseMissDurationMs: z.number().nonnegative().nullable().optional(),
  repeatedIdenticalCropCount: z.number().int().nonnegative().nullable().optional(),
  localizationFeedbackAction: z.string().nullable().optional(),
  localizationFeedbackReason: z.string().nullable().optional(),
  // Phase 4.2F — athlete-interior optical-flow feature-selection
  // diagnostics (developer/debug visibility only — never read by
  // metrics/contact logic, which continues to gate solely on `boxOrigin`).
  athleteInteriorFeatureRatio: z.number().min(0).max(1).nullable().optional(),
  backgroundRiskFeatureRatio: z.number().min(0).max(1).nullable().optional(),
  flowQualityDegrading: z.boolean().nullable().optional(),
  featureMaskSource: z.string().nullable().optional(),
  flowRejectedBackgroundDominated: z.boolean().nullable().optional(),
  // Phase 4.2G — time-normalized coast-risk diagnostics (developer/debug
  // visibility only — never read by metrics/contact logic, which continues
  // to gate solely on `boxOrigin`).
  timeSinceVerifiedDetectorMs: z.number().nonnegative().nullable().optional(),
  distanceSinceVerifiedDetectorPx: z.number().nonnegative().nullable().optional(),
  distanceSinceVerifiedDetectorFrameWidths: z.number().nonnegative().nullable().optional(),
  coastRiskState: z.string().nullable().optional(),
  coastRiskSignals: z.array(z.string()).nullable().optional(),
  flowProtectionActive: z.boolean().nullable().optional(),
  flowProtectionReason: z.string().nullable().optional(),
  // Phase 4.2H — distance-and-evidence-based coast-risk diagnostics
  // (developer/debug visibility only — never read by metrics/contact logic,
  // which continues to gate solely on `boxOrigin`).
  expectedDistanceFrameWidths: z.number().nonnegative().nullable().optional(),
  trajectoryResidualFrameWidths: z.number().nonnegative().nullable().optional(),
  athleteOwnedFeatureRatio: z.number().min(0).max(1).nullable().optional(),
  backgroundRiskRatio: z.number().min(0).max(1).nullable().optional(),
  forwardBackwardValidRatio: z.number().min(0).max(1).nullable().optional(),
  coastRiskReasons: z.array(z.string()).nullable().optional(),
  flowProtectionLevel: z.string().nullable().optional(),
  localizationTerminationReason: z.string().nullable().optional(),
  // Phase 4.2I — pose-landmark-guided per-point ownership diagnostic
  // (developer/debug visibility only — never read by metrics/contact logic,
  // which continues to gate solely on `boxOrigin`).
  skeletonOwnershipRatio: z.number().min(0).max(1).nullable().optional(),
  // Phase 4.2J — bounded, retroactive short-interval adjudication
  // provenance (developer/debug visibility only). Original values are
  // NEVER overwritten; `scientificAthleteBox`/`cropPlannerInputBox` above
  // ARE updated in place when a correction is applied (the same fields
  // every downstream consumer already reads), with the pre-correction
  // value preserved here under `originalBox`.
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
  // (developer/debug visibility only). `cropContainmentState` is one of
  // CROP_CONTAINMENT_STATES (mediapipe_pose_runner.py): crop_full_body_verified,
  // crop_full_body_provisional, crop_foot_at_risk, crop_head_at_risk,
  // crop_extremity_clipped, crop_stale, crop_prediction_only, crop_invalid.
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
  // (developer/debug visibility only). `secondaryPoseEligible`/
  // `secondaryPoseEligibilityReason` reflect the Part D eligibility
  // contract; `landmarkMergeLog` records the Part G per-landmark merge
  // decision for every joint the secondary pass attempted to recover on
  // this frame (empty/absent when no recovery was attempted or nothing
  // was merged).
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
        primaryValue: phase5cLandmarkValueSchema.nullable().optional(),
        recoveredValue: phase5cLandmarkValueSchema.nullable().optional(),
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
  // Phase 4.2K — bounded, retroactive, bidirectional-trajectory independent
  // localization verification (developer/debug visibility; also consulted
  // by measurements.ts's strip gate — see that file's own comment). A frame
  // reaches `independent_corroborated` only when its own real box position
  // agrees, within a tolerance derived from that bracket's OWN real position
  // noise (never a borrowed or invented absolute constant), with BOTH an
  // independent trajectory extrapolated from trusted frames strictly BEFORE
  // and one from trusted frames strictly AFTER the uncertain run.
  independentLocalizationState: z
    .enum(["independent_corroborated", "independent_disagrees", "independent_unavailable"])
    .nullable()
    .optional(),
  independentTrajectoryResidualBeforeSigma: z.number().nullable().optional(),
  independentTrajectoryResidualAfterSigma: z.number().nullable().optional(),
  independentVerificationReason: z.string().nullable().optional(),
});
/** Partial keypoint map is guaranteed here regardless of Zod's record inference. */
export type PoseFrame = Omit<z.infer<typeof poseFrameSchema>, "keypoints" | "keypointsCropSpace"> & {
  keypoints: Partial<Record<JointName, Keypoint>>;
  keypointsCropSpace?: Partial<Record<JointName, Keypoint>>;
};

/**
 * A full pose estimation result for one video: ordered frames plus the metadata
 * the metrics layer needs (fps for time conversion, dimensions for un-
 * normalizing, and provenance).
 */
export const poseSequenceSchema = z.object({
  backend: z.string(),
  modelVersion: z.string(),
  coordSpace: z.literal("normalized"),
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cameraEvidence: rawCameraEvidenceSchema.optional(),
  /** Phase 1 global keyframe camera path (optional, additive — see
   *  cameraPathSchema.ts). Absent on older analyses; consumers fall back to
   *  walking `cameraEvidence.transforms` (the legacy per-frame chain). Never
   *  reinterprets an old artifact — this is purely a new, sibling field. */
  cameraPath: cameraPathArtifactSchema.optional(),
  coordinateSchemaVersion: z.literal(WORLD_COORDINATE_SCHEMA_VERSION).optional(),
  recordingAssessment: recordingAssessmentSchema.optional(),
  /** Gate-lock visualization/debug artifact (Part 3, Day 94 audit) — present
   *  only when the session has world-anchored gates + camera evidence to
   *  diagnose. Absent on analyses run before this field existed, or without
   *  world-anchored calibration. */
  gateLockDebug: gateLockDebugArtifactSchema.optional(),
  /** Day 95 audit — stationary athlete-tracking debug artifact (Part 5). */
  trackingDebug: trackingDebugArtifactSchema.optional(),
  sourceMetadata: z
    .object({
      fps: z.number().positive(),
      averageFps: z.number().positive().nullable().optional(),
      nominalFps: z.number().positive().nullable().optional(),
      realFps: z.number().positive().nullable().optional(),
      timestampFps: z.number().positive().nullable().optional(),
      variableFrameRate: z.boolean().optional(),
      fpsClassification: z
        .enum([
          "experimental_30_fps_class",
          "validated_60_fps_class",
          "native_source_class",
          "validated_high_speed_native_class",
          "high_speed_source_normalized_to_60",
        ])
        .optional(),
      fpsTierReason: z.string().optional(),
      fpsTierPolicyVersion: z.string().optional(),
      frameCount: z.number().int().nonnegative(),
      durationSeconds: z.number().nonnegative(),
      codec: z.string().nullable(),
    })
    .optional(),
  frames: z.array(poseFrameSchema),
});
export type PoseSequence = Omit<z.infer<typeof poseSequenceSchema>, "frames"> & {
  frames: PoseFrame[];
};
