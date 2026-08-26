import { z } from "zod";

// Historical identifier only — the "60" does NOT select or enforce a 60 FPS
// analysis rate. It names the "validated production" pipeline family, as
// opposed to the experimental-30 family (`EXPERIMENTAL_30_PIPELINE_VERSION`).
// A native high-speed/general-native source (75, 90, 120, 144, 240 FPS, ...)
// runs through this SAME pipeline version at its own real rate; the actual
// FPS-band enforcement lives entirely in `complete_analysis_job` (which checks
// `provenance.analysisFps`/`sourceFpsClassification`, not this string) and in
// the worker's own classification logic (`src/lib/video/analysisFps.ts`).
// Kept unrenamed deliberately: renaming would touch a live DB CHECK
// constraint, two RPC functions, and every historical `analyses` row's stored
// value, for a label change with no behavior difference — see the FPS runtime
// audit report for the full reasoning.
export const ANALYSIS_PIPELINE_VERSION = "ava-sprint-60-v1";
export const EXPERIMENTAL_30_PIPELINE_VERSION = "ava-sprint-30-experimental-v1";
export const METRIC_SCHEMA_VERSION = "ava-metrics-v1";
export const EXPLAINABILITY_SCHEMA_VERSION = "ava-explainability-v1";

export const confidenceLabelSchema = z.enum(["high", "moderate", "low", "insufficient"]);
export const confidenceSchema = z.object({
  score: z.number().min(0).max(1).nullable(),
  label: confidenceLabelSchema.nullable(),
  rationale: z.string().min(1).nullable(),
});
export type AnalysisConfidence = z.infer<typeof confidenceSchema>;

export const metricAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "withheld",
  "unsupported",
  "failed",
]);

export const metricResultSchema = z
  .object({
    value: z.number().finite().nullable(),
    unit: z.string(),
    status: metricAvailabilitySchema,
    confidence: z.number().min(0).max(1).nullable(),
    confidenceLabel: confidenceLabelSchema.nullable(),
    reasonCode: z.string().nullable(),
    warning: z.string().nullable(),
    source: z.string().min(1),
    version: z.string().min(1),
    experimental: z.boolean().optional(),
    experimentVersion: z.string().nullable().optional(),
    validationStatus: z.enum(["validated", "experimental", "unvalidated"]).optional(),
    compatibilityGroup: z.string().optional(),
    uncertainty: z.number().nonnegative().nullable().optional(),
    uncertaintyUnit: z.string().nullable().optional(),
  })
  .superRefine((metric, ctx) => {
    if (metric.status === "available" && metric.value == null) {
      ctx.addIssue({ code: "custom", message: "Available metrics require a value." });
    }
    if (metric.status !== "available" && metric.value != null) {
      ctx.addIssue({ code: "custom", message: "Unavailable metrics must not contain a value." });
    }
    if (metric.status !== "available" && !metric.reasonCode) {
      ctx.addIssue({ code: "custom", message: "Unavailable metrics require a reason code." });
    }
  });
export type MetricResult = z.infer<typeof metricResultSchema>;

export const provenanceSchema = z.object({
  originalSourceFps: z.number().positive(),
  sourceFpsClassification: z.enum([
    "experimental_30_fps_class",
    "validated_60_fps_class",
    // General capability-based class: any accepted rate outside the two
    // precise named windows (24-29, 30.5-59, 60.5-300 — e.g. 45, 75, 144).
    "native_source_class",
    // Historical values only — rows completed before this policy existed may
    // still carry them. Neither is produced by current worker code.
    "validated_high_speed_native_class",
    "high_speed_source_normalized_to_60",
  ]),
  sourceFpsMetadata: z.object({
    averageFps: z.number().positive().nullable(),
    nominalFps: z.number().positive().nullable(),
    realFps: z.number().positive().nullable(),
    timestampFps: z.number().positive().nullable(),
    variableFrameRate: z.boolean(),
  }),
  sourceFpsTierReason: z.string().optional(),
  sourceFpsTierPolicyVersion: z.string().optional(),
  // 30/60 for the validated tiers; a native high-speed source (e.g. 119.88,
  // 239.76) carries its own real rate here instead of being forced to 60.
  analysisFps: z.number().positive().max(300),
  sourceFpsBand: z.enum(["low", "standard", "high", "ultra_high", "unsupported"]).optional(),
  sourceFpsDisplay: z.number().positive().optional(),
  wasResampled: z.boolean().optional(),
  experimental: z.boolean().default(false),
  experimentVersion: z.string().nullable().default(null),
  validationStatus: z.enum(["validated", "experimental", "unvalidated"]).default("validated"),
  compatibilityGroup: z.string().min(1).default("validated-60-v1"),
  eventDetectionModelVersion: z.string().optional(),
  strideSegmentationModelVersion: z.string().optional(),
  timingModelVersion: z.string().optional(),
  metricTrustModelVersion: z.string().optional(),
  uncertaintyModelVersion: z.string().optional(),
  timingPolicyVersion: z.literal("CONSERVATIVE_TIMING_POLICY_V1"),
  sourceFrameCount: z.number().int().nonnegative(),
  analyzedFrameCount: z.number().int().nonnegative(),
  originalVideoWidth: z.number().int().positive(),
  originalVideoHeight: z.number().int().positive(),
  sourceDurationSeconds: z.number().nonnegative(),
  sourceCodec: z.string().nullable(),
  videoPath: z.string().min(1),
  poseModelName: z.literal("mediapipe"),
  poseModelVersion: z.string().min(1),
  analysisPipelineVersion: z.string().min(1),
  metricSchemaVersion: z.string().min(1),
  zoneMetricSchemaVersion: z.enum(["zone-step-metrics-v1", "legacy"]).default("legacy"),
  explainabilitySchemaVersion: z.string().min(1),
  calibrationMode: z.string().min(1),
  calibrationSnapshot: z.record(z.unknown()),
  calibrationCameraType: z.enum(["stationary", "panning"]).optional(),
  calibrationReferenceFrameIndex: z.number().int().nonnegative().optional(),
  calibrationTrackingSummary: z.record(z.unknown()).nullable().optional(),
  cameraMode: z.string().min(1),
  cameraMotionConfidence: z.number().min(0).max(1).nullable(),
  recordingModeVersion: z.string().min(1).optional(),
  cameraMotionModelVersion: z.string().min(1).optional(),
  dynamicCropVersion: z.string().min(1).optional(),
  athleteTrackingVersion: z.string().min(1).optional(),
  athleteTrackingConfidence: z.number().min(0).max(1).nullable().optional(),
  zoomClassification: z.string().min(1).optional(),
  zoomConfidence: z.number().min(0).max(1).nullable().optional(),
  transformSummary: z.record(z.unknown()).optional(),
  unstableFrameRanges: z.array(z.record(z.unknown())).optional(),
  trackingLossRanges: z.array(z.record(z.unknown())).optional(),
  spatialMetricEligibility: z.string().min(1).optional(),
  recordingQualityScore: z.number().min(0).max(100).nullable(),
  recordingQualityClassification: z.string().nullable(),
  globalAnalysisConfidence: confidenceSchema,
  analysisWarnings: z.array(z.string()),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});
export type AnalysisProvenance = z.infer<typeof provenanceSchema>;

export const inputSnapshotSchema = z.object({
  capturedAt: z.string().datetime(),
  athlete: z.object({
    id: z.string().uuid(),
    sex: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    heightCm: z.number().nullable(),
    weightKg: z.number().nullable(),
    legLengthCm: z.number().nullable(),
    trochanterHeightM: z.number().nullable(),
    personalBests: z.record(z.number().nullable()),
    goals: z.record(z.number().nullable()),
  }),
  session: z.object({
    analysisType: z.enum(["fly", "acceleration"]),
    distanceM: z.number().nullable(),
    benchmarkId: z.string().uuid().nullable(),
    recordingMode: z.string(),
    timingZone: z.record(z.unknown()),
    timingSetup: z.record(z.unknown()).default({}),
    calibrationInputs: z.record(z.unknown()),
    requestedOptions: z.record(z.unknown()),
  }),
});
export type AnalysisInputSnapshot = z.infer<typeof inputSnapshotSchema>;

const evidenceRefSchema = z.object({ id: z.string(), type: z.string() });
const measurementSchema = z.object({
  metricId: z.string(),
  name: z.string(),
  phase: z.string().nullable(),
  side: z.string().nullable(),
  repetitionRange: z.string().nullable(),
  result: metricResultSchema,
  benchmarkComparison: z.record(z.unknown()).nullable(),
  evidenceReferences: z.array(evidenceRefSchema),
  warnings: z.array(z.string()),
});
export const muscleGroupSchema = z.object({
  muscleGroupId: z.string(),
  displayName: z.string(),
  relationship: z.enum([
    "directly_involved",
    "commonly_associated",
    "possible_contributor",
    "testing_required",
  ]),
  relevantAction: z.string(),
  explanation: z.string(),
  confidence: confidenceSchema,
  diagnosticDisclaimer: z.string().min(1),
  suggestedConfirmationTests: z.array(z.string()),
});
export const patternSchema = z.object({
  patternId: z.string(),
  description: z.string(),
  supportingFrameRanges: z.array(z.string()),
  supportingMetricIds: z.array(z.string()),
  confidence: confidenceSchema,
  evidenceLevel: z.string(),
});
export const causeSchema = z.object({
  causeId: z.string(),
  description: z.string(),
  status: z.enum(["observed", "likely", "possible", "experimental"]),
  confidence: confidenceSchema,
  supportingPatternIds: z.array(z.string()),
  supportingMetricIds: z.array(z.string()),
  diagnosticLimitations: z.array(z.string()),
  associatedMuscleGroups: z.array(muscleGroupSchema),
});
export const interventionSchema = z.object({
  interventionId: z.string(),
  type: z.string(),
  title: z.string(),
  explanation: z.string(),
  technicalCue: z.string().nullable(),
  drill: z.string().nullable(),
  sprintExercise: z.string().nullable(),
  strengthOption: z.string().nullable(),
  plyometricOption: z.string().nullable(),
  mobilityOption: z.string().nullable(),
  evidenceLevel: z.string(),
  contraindications: z.array(z.string()),
  measurableTarget: z.string().nullable(),
  recommendedDuration: z.string().nullable(),
  experimental: z.boolean(),
});
export const retestSchema = z.object({
  retestPlanId: z.string(),
  metricTargets: z.array(z.string()),
  protocol: z.string(),
  recordingRequirements: z.array(z.string()),
  recommendedRetestWindow: z.string(),
  successCriteria: z.array(z.string()),
});
export const limitationSchema = z.object({
  limitationId: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.string(),
  priority: z.number(),
  trainability: z.string(),
  performanceImpact: z.string(),
  confidence: confidenceSchema,
  supportingMeasurementIds: z.array(z.string()).min(1),
  targetRange: z.string().nullable(),
  currentDeficit: z.string().nullable(),
  observedPatterns: z.array(patternSchema),
  causeHypotheses: z.array(causeSchema),
  interventionIds: z.array(z.string()),
  retestPlanId: z.string().nullable(),
});

export const explainableAnalysisResultSchema = z
  .object({
    schemaVersion: z.literal(EXPLAINABILITY_SCHEMA_VERSION),
    analysisId: z.string().uuid(),
    athleteId: z.string().uuid(),
    sessionId: z.string().uuid(),
    provenance: provenanceSchema,
    inputSnapshot: inputSnapshotSchema,
    recordingAssessment: z.record(z.unknown()),
    measurements: z.array(measurementSchema),
    limitations: z.array(limitationSchema),
    recommendations: z.array(interventionSchema),
    retestPlans: z.array(retestSchema),
    warnings: z.array(z.string()),
    overallConfidence: confidenceSchema,
  })
  .superRefine((result, ctx) => {
    const measurements = new Set(result.measurements.map((x) => x.metricId));
    const interventions = new Set(result.recommendations.map((x) => x.interventionId));
    const retests = new Set(result.retestPlans.map((x) => x.retestPlanId));
    for (const limitation of result.limitations) {
      for (const id of limitation.supportingMeasurementIds)
        if (!measurements.has(id))
          ctx.addIssue({ code: "custom", message: `Unknown measurement reference: ${id}` });
      for (const id of limitation.interventionIds)
        if (!interventions.has(id))
          ctx.addIssue({ code: "custom", message: `Unknown intervention reference: ${id}` });
      if (limitation.retestPlanId && !retests.has(limitation.retestPlanId))
        ctx.addIssue({
          code: "custom",
          message: `Unknown retest reference: ${limitation.retestPlanId}`,
        });
      for (const pattern of limitation.observedPatterns)
        for (const id of pattern.supportingMetricIds)
          if (!measurements.has(id))
            ctx.addIssue({ code: "custom", message: `Unknown pattern metric: ${id}` });
      const patterns = new Set(limitation.observedPatterns.map((x) => x.patternId));
      for (const cause of limitation.causeHypotheses) {
        for (const id of cause.supportingPatternIds)
          if (!patterns.has(id))
            ctx.addIssue({ code: "custom", message: `Unknown pattern reference: ${id}` });
        for (const id of cause.supportingMetricIds)
          if (!measurements.has(id))
            ctx.addIssue({ code: "custom", message: `Unknown cause metric: ${id}` });
      }
    }
  });
export type ExplainableAnalysisResult = z.infer<typeof explainableAnalysisResultSchema>;

/** Weakest-link confidence: downstream claims can never exceed required inputs. */
export function propagateConfidence(...inputs: Array<number | null | undefined>): number | null {
  const required = inputs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return required.length === inputs.length && required.length > 0 ? Math.min(...required) : null;
}

export function confidenceLabel(score: number | null): AnalysisConfidence["label"] {
  if (score == null) return "insufficient";
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "moderate";
  return "low";
}
