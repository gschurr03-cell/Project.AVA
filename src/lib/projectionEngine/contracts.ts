import { z } from "zod";

export const PROJECTION_ENGINE_VERSION = "ava-performance-projection-v1";
export const PROJECTION_SCHEMA_VERSION = "ava-performance-projection-contract-v1";

export const projectionTypeSchema = z.enum([
  "immediate", "30_day", "90_day", "6_month", "12_month", "peak_potential",
  "season_peak", "career_peak", "return_from_injury", "off_season",
  "competition_readiness",
]);
export type ProjectionType = z.infer<typeof projectionTypeSchema>;

export const trajectoryTypeSchema = z.enum([
  "rapid_improvement", "steady_improvement", "plateau", "regression",
  "return_from_injury", "early_development", "late_development",
  "inconsistent", "unknown",
]);
export type TrajectoryType = z.infer<typeof trajectoryTypeSchema>;

export const projectionConfidenceLevelSchema = z.enum([
  "High", "Moderate", "Low", "Insufficient",
]);
export type ProjectionConfidenceLevel = z.infer<typeof projectionConfidenceLevelSchema>;

export const limiterCategorySchema = z.enum([
  "acceleration", "maximum_velocity", "rhythm", "posture",
  "front_side_mechanics", "asymmetry", "training_consistency", "power",
  "mobility", "unknown",
]);
export type LimiterCategory = z.infer<typeof limiterCategorySchema>;

export const evidenceReferenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceType: z.enum([
    "history", "fingerprint", "observation", "interpretation",
    "recommendation", "priority", "benchmark", "research", "athlete_context",
  ]),
  sourceVersion: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const metricHistoryPointSchema = z.object({
  sessionId: z.string().min(1),
  capturedAt: z.string().datetime(),
  metric: z.string().min(1),
  value: z.number().finite(),
  unit: z.string().min(1),
  compatibilityKey: z.string().min(1),
  measurementConfidence: z.number().min(0).max(1),
  sessionQuality: z.number().min(0).max(1),
  season: z.string().nullable(),
});
export type MetricHistoryPoint = z.infer<typeof metricHistoryPointSchema>;

export const limiterInputSchema = z.object({
  category: limiterCategorySchema,
  severity: z.enum(["high", "moderate", "low", "unknown"]),
  confidence: z.number().min(0).max(1),
  supportingEvidenceIds: z.array(z.string().min(1)).min(1),
  modifiable: z.enum(["yes", "partly", "unknown"]),
  estimatedImpact: z.enum(["potentially_large", "potentially_moderate", "potentially_small", "unknown"]),
  validationRequirements: z.array(z.string().min(1)).min(1),
  upstreamSource: z.enum(["interpretation", "recommendation", "priority"]),
});
export type LimiterInput = z.infer<typeof limiterInputSchema>;

export const limiterSchema = limiterInputSchema.extend({
  limiterId: z.string().min(1),
  supportingEvidence: z.array(evidenceReferenceSchema).min(1),
});
export type Limiter = z.infer<typeof limiterSchema>;

export const benchmarkSupportSchema = z.object({
  comparisonId: z.string().min(1),
  datasetId: z.string().nullable(),
  datasetVersion: z.string().nullable(),
  compatibilityConfidence: z.enum(["High", "Moderate", "Low", "Unavailable"]),
  percentile: z.number().min(0).max(100).nullable(),
  summary: z.string().min(1),
});
export type BenchmarkSupport = z.infer<typeof benchmarkSupportSchema>;

export const projectionInputSchema = z.object({
  athleteId: z.string().min(1),
  projectionType: projectionTypeSchema,
  targetMetric: z.string().min(1),
  unit: z.string().min(1),
  higherIsBetter: z.boolean(),
  generatedAt: z.string().datetime(),
  history: z.array(metricHistoryPointSchema),
  mechanicalFingerprint: z.object({
    fingerprintId: z.string().min(1),
    version: z.string().min(1),
    compatibilityKey: z.string().min(1),
    confidence: z.number().min(0).max(1),
    summary: z.string().min(1),
  }).nullable(),
  evidence: z.array(evidenceReferenceSchema),
  limiterInputs: z.array(limiterInputSchema),
  benchmarks: z.array(benchmarkSupportSchema),
  trainingAgeYears: z.number().nonnegative().nullable(),
  competitionHistoryCount: z.number().int().nonnegative().nullable(),
  biomechanicalConsistency: z.number().min(0).max(1).nullable(),
  trainingConsistency: z.number().min(0).max(1).nullable(),
  researchConfidence: z.number().min(0).max(1).nullable(),
  unknownVariables: z.array(z.string().min(1)),
  returnToPlayCleared: z.boolean().nullable(),
  metricFloor: z.number().finite().nullable(),
  metricCeiling: z.number().finite().nullable(),
}).superRefine((input, ctx) => {
  if (/race|\\b(60|100|200|400)m(_|\\s)?time|personal.?best|pb/i.test(input.targetMetric)) {
    ctx.addIssue({ code: "custom", path: ["targetMetric"], message: "Race-time and personal-best synthesis is outside this engine." });
  }
  if (input.metricFloor != null && input.metricCeiling != null && input.metricFloor >= input.metricCeiling) {
    ctx.addIssue({ code: "custom", path: ["metricFloor"], message: "Metric floor must be below ceiling." });
  }
});
export type ProjectionInput = z.infer<typeof projectionInputSchema>;

export const projectionOutputSchema = z.object({
  projectionId: z.string().min(1),
  engineVersion: z.literal(PROJECTION_ENGINE_VERSION),
  schemaVersion: z.literal(PROJECTION_SCHEMA_VERSION),
  projectionType: projectionTypeSchema,
  targetMetric: z.string().min(1),
  unit: z.string().min(1),
  status: z.enum(["available", "insufficient_evidence", "unsupported"]),
  predictedValue: z.number().finite().nullable(),
  confidenceInterval: z.object({
    lower: z.number().finite(),
    upper: z.number().finite(),
    coverage: z.literal("evidence_bounded_not_calibrated"),
  }).nullable(),
  projectionConfidence: z.object({
    level: projectionConfidenceLevelSchema,
    score: z.number().min(0).max(100),
    limitingFactors: z.array(z.string()),
  }),
  timeHorizon: z.object({ days: z.number().int().nonnegative().nullable(), label: z.string().min(1) }),
  trajectoryType: trajectoryTypeSchema,
  supportingEvidence: z.array(evidenceReferenceSchema),
  supportingBenchmarks: z.array(benchmarkSupportSchema),
  assumptions: z.array(z.string().min(1)),
  requiredConditions: z.array(z.string().min(1)),
  majorLimiters: z.array(limiterSchema),
  unknownVariables: z.array(z.string().min(1)),
  bestCase: z.number().finite().nullable(),
  expectedCase: z.number().finite().nullable(),
  conservativeCase: z.number().finite().nullable(),
  invalidationConditions: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  generatedAt: z.string().datetime(),
});
export type ProjectionOutput = z.infer<typeof projectionOutputSchema>;

export const projectionSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  athleteId: z.string().min(1),
  engineVersion: z.literal(PROJECTION_ENGINE_VERSION),
  schemaVersion: z.literal(PROJECTION_SCHEMA_VERSION),
  input: projectionInputSchema,
  output: projectionOutputSchema,
  createdAt: z.string().datetime(),
});
export type ProjectionSnapshot = z.infer<typeof projectionSnapshotSchema>;

