import { z } from "zod";

export const OBSERVATION_ENGINE_VERSION = "ava-observations-v1";

export const observationCategorySchema = z.enum([
  "Recording",
  "Timing",
  "Acceleration",
  "MaximumVelocity",
  "StrideLength",
  "StrideFrequency",
  "Contact",
  "Flight",
  "Asymmetry",
  "FrontSideMechanics",
  "BackSideMechanics",
  "Posture",
  "Stability",
  "Consistency",
  "Calibration",
  "DataQuality",
  "AthleteProfile",
]);
export const observationStatusSchema = z.enum([
  "supported",
  "limited",
  "unavailable",
  "experimental",
  "contradicted",
]);
export const observationConfidenceSchema = z.enum(["High", "Moderate", "Low", "Unavailable"]);
export const observationSeveritySchema = z.enum([
  "Informational",
  "Minor",
  "Moderate",
  "Major",
  "Unknown",
]);
export const observationAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "withheld",
  "unsupported",
  "failed",
]);
export const observationSideSchema = z.enum(["left", "right", "bilateral"]).nullable();

export const observationFrameRangeSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
});

export const observationEvidenceSchema = z.object({
  metric: z.string().min(1),
  value: z.union([z.number().finite(), z.string().min(1), z.boolean()]).nullable(),
  unit: z.string(),
  confidence: observationConfidenceSchema,
  source: z.string().min(1),
  availability: observationAvailabilitySchema,
  frameRange: observationFrameRangeSchema.nullable(),
  phase: z.string().nullable(),
  directness: z.enum(["direct", "derived", "context"]),
});
export type ObservationEvidence = z.infer<typeof observationEvidenceSchema>;

export const observationLimitationSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  source: z.string().min(1),
});
export type ObservationLimitation = z.infer<typeof observationLimitationSchema>;

export const observationSchema = z.object({
  id: z.string().min(1),
  category: observationCategorySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  status: observationStatusSchema,
  confidence: observationConfidenceSchema,
  severity: observationSeveritySchema,
  evidence: z.array(observationEvidenceSchema),
  limitations: z.array(observationLimitationSchema),
  phase: z.string().nullable(),
  side: observationSideSchema,
  createdAt: z.string().datetime(),
  engineVersion: z.literal(OBSERVATION_ENGINE_VERSION),
  ruleId: z.string().min(1),
  supportingMetrics: z.array(z.string()),
  availability: observationAvailabilitySchema,
  experimental: z.boolean(),
});
export type Observation = z.infer<typeof observationSchema>;

export const observationMetricSignalSchema = observationEvidenceSchema.extend({
  key: z.string().min(1),
  experimental: z.boolean().default(false),
  reasonCode: z.string().nullable().default(null),
  warning: z.string().nullable().default(null),
});
export type ObservationMetricSignal = z.infer<typeof observationMetricSignalSchema>;

export const observationComparisonSignalSchema = z.object({
  key: z.enum([
    "stride_length_asymmetry",
    "stride_frequency_asymmetry",
    "contact_asymmetry",
    "flight_asymmetry",
    "knee_height_difference",
    "knee_height_reference",
    "torso_stability",
    "cadence_consistency",
  ]),
  classification: z.enum(["different", "consistent", "reduced", "stable", "variable"]),
  leftValue: z.number().finite().nullable(),
  rightValue: z.number().finite().nullable(),
  differencePct: z.number().nonnegative().nullable(),
  referenceValue: z.number().finite().nullable(),
  unit: z.string(),
  confidence: observationConfidenceSchema,
  source: z.string().min(1),
  availability: observationAvailabilitySchema,
  phase: z.string().nullable(),
  frameRange: observationFrameRangeSchema.nullable(),
  experimental: z.boolean().default(false),
});
export type ObservationComparisonSignal = z.infer<typeof observationComparisonSignalSchema>;

export const completedAnalysisObservationInputSchema = z.object({
  analysisId: z.string().min(1),
  status: z.literal("complete"),
  completedAt: z.string().datetime(),
  experimental: z.boolean(),
  analysisFps: z.number().positive().nullable(),
  sourceFps: z.number().positive().nullable(),
  recordingMode: z.string().nullable(),
  recordingQuality: z
    .object({
      score: z.number().min(0).max(100),
      rating: z.enum(["excellent", "good", "fair", "poor"]),
      confidence: observationConfidenceSchema,
      source: z.string().min(1),
    })
    .nullable(),
  calibrationAvailable: z.boolean(),
  timingClassification: z.enum(["trusted", "experimental", "unavailable"]),
  timingConfidence: observationConfidenceSchema,
  timingConfidenceSource: z.string().min(1),
  metrics: z.array(observationMetricSignalSchema),
  comparisons: z.array(observationComparisonSignalSchema),
  limitations: z.array(observationLimitationSchema).default([]),
});
export type CompletedAnalysisObservationInput = z.infer<
  typeof completedAnalysisObservationInputSchema
>;

export interface ObservationDebugTraceEntry {
  ruleId: string;
  fired: boolean;
  evidenceConsumed: string[];
  confidenceSource: string | null;
  reason: string;
  suppressedBy: string | null;
  mergedInto: string | null;
}

export interface ObservationGenerationResult {
  observations: Observation[];
  trace: ObservationDebugTraceEntry[];
}
