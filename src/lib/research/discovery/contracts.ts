import { z } from "zod";

export const DISCOVERY_ENGINE_VERSION = "ava-biomechanics-discovery-v1";
export const DISCOVERY_SNAPSHOT_VERSION = "ava-discovery-snapshot-v1";
export const MIN_DISCOVERY_SAMPLE_SIZE = 5;

export const discoveryTypeSchema = z.enum([
  "correlation", "cluster", "outlier", "movement_fingerprint",
]);
export const statisticalStrengthSchema = z.enum([
  "insufficient", "weak", "moderate", "strong",
]);
export const discoveryConfidenceSchema = z.enum(["Unavailable", "Low", "Moderate", "High"]);

export const discoveryEvidenceSchema = z.object({
  metric: z.string().min(1),
  summary: z.string().min(1),
  value: z.number().finite().nullable(),
  unit: z.string(),
});

export const discoverySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  discoveryType: discoveryTypeSchema,
  confidence: discoveryConfidenceSchema,
  sampleSize: z.number().int().nonnegative(),
  evidence: z.array(discoveryEvidenceSchema).min(1),
  metricsUsed: z.array(z.string().min(1)).min(1),
  athletesIncluded: z.array(z.string().min(1)),
  sessionsIncluded: z.array(z.string().min(1)),
  statisticalStrength: statisticalStrengthSchema,
  requiresValidation: z.literal(true),
  experimental: z.literal(true),
  generatedAt: z.string().datetime(),
  engineVersion: z.literal(DISCOVERY_ENGINE_VERSION),
});
export type Discovery = z.infer<typeof discoverySchema>;

export const researchMetricSchema = z.object({
  key: z.string().min(1),
  value: z.number().finite(),
  unit: z.string(),
  confidence: z.enum(["high", "moderate"]),
  phase: z.string().nullable(),
});
export const researchSampleSchema = z.object({
  analysisId: z.string().min(1),
  athleteId: z.string().min(1),
  sessionId: z.string().min(1),
  capturedAt: z.string().datetime(),
  compatibilityKey: z.string().min(1),
  experimental: z.literal(false),
  metrics: z.array(researchMetricSchema).min(1),
});
export type ResearchSample = z.infer<typeof researchSampleSchema>;

export const movementFingerprintSchema = z.object({
  athleteId: z.string().min(1),
  sampleSize: z.number().int().nonnegative(),
  compatibilityKey: z.string().min(1),
  typicalMetrics: z.array(z.object({
    metric: z.string(), mean: z.number().finite(), standardDeviation: z.number().nonnegative(),
    unit: z.string(), repeatability: z.number().min(0).max(1),
  })),
  consistencyScore: z.number().min(0).max(100).nullable(),
  typicalAsymmetryDirection: z.enum(["left", "right", "balanced", "unknown"]),
  confidence: discoveryConfidenceSchema,
  requiresValidation: z.literal(true),
  experimental: z.literal(true),
});
export type MovementFingerprint = z.infer<typeof movementFingerprintSchema>;

export const eliteReferenceCohortSchema = z.object({
  cohortId: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1),
  consentAndLicenseReference: z.string().min(1),
  metricSchemaVersion: z.string().min(1),
  compatibilityKey: z.string().min(1),
  athleteCount: z.number().int().positive(),
  validated: z.boolean(),
});
export type EliteReferenceCohort = z.infer<typeof eliteReferenceCohortSchema>;

export const discoveryResultSchema = z.object({
  engineVersion: z.literal(DISCOVERY_ENGINE_VERSION),
  generatedAt: z.string().datetime(),
  compatibilityKey: z.string().nullable(),
  sampleSize: z.number().int().nonnegative(),
  discoveries: z.array(discoverySchema),
  fingerprints: z.array(movementFingerprintSchema),
  warnings: z.array(z.string()),
  inputHash: z.string().min(1),
});
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

export const discoverySnapshotSchema = z.object({
  snapshotVersion: z.literal(DISCOVERY_SNAPSHOT_VERSION),
  result: discoveryResultSchema,
});

