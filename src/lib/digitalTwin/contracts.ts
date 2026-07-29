import { z } from "zod";

export const DIGITAL_TWIN_ENGINE_VERSION = "ava-athlete-digital-twin-v1";
export const DIGITAL_TWIN_SCHEMA_VERSION = "ava-athlete-digital-twin-contract-v1";
export const DIGITAL_TWIN_SNAPSHOT_VERSION = "ava-athlete-digital-twin-snapshot-v1";

export const athleteEventSchema = z.enum([
  "60m", "100m", "200m", "400m", "hurdles", "relay", "future_field_event", "unknown",
]);
export const twinConfidenceSchema = z.enum(["High", "Moderate", "Low", "Insufficient"]);
export const trendClassificationSchema = z.enum([
  "improving", "stable", "regressing", "plateau", "highly_variable",
  "rapid_adaptation", "delayed_adaptation", "recurring", "unknown",
]);
export const twinTrendKindSchema = z.enum([
  "metric", "mechanical", "recommendation_adherence", "priority_recurrence", "strength",
]);
export const movementArchetypeTypeSchema = z.enum([
  "power_accelerator", "frequency_dominant", "stride_dominant", "balanced_sprinter",
  "elastic_runner", "high_variability", "late_developer", "technical_specialist", "unknown",
]);

export const twinMetricSchema = z.object({
  metric: z.string().min(1), value: z.number().finite(), unit: z.string(),
  higherIsBetter: z.boolean(), confidence: z.number().min(0).max(1),
});

const analysisPayloadSchema = z.object({
  kind: z.literal("analysis"), analysisId: z.string(), sessionId: z.string(),
  status: z.enum(["validated", "limited", "experimental", "invalid"]),
  metrics: z.array(twinMetricSchema), reportId: z.string().nullable(),
});
const recommendationPayloadSchema = z.object({
  kind: z.literal("recommendation"), recommendationId: z.string(),
  recommendationKey: z.string(), title: z.string(), context: z.string(),
  implementationStatus: z.enum(["implemented", "not_implemented", "partial", "unknown"]),
  targetMetric: z.string().nullable(),
  followUp: z.object({
    baselineValue: z.number().finite(), latestValue: z.number().finite(),
    unit: z.string(), higherIsBetter: z.boolean(), compatibilityKey: z.string(),
    evidenceIds: z.array(z.string()).min(1),
  }).nullable(),
  futureApplicability: z.enum(["supported", "limited", "not_supported", "unknown"]),
});
const priorityPayloadSchema = z.object({
  kind: z.literal("priority"), priorityId: z.string(), recommendationId: z.string(),
  category: z.string(), title: z.string(), expectedImpact: z.string(),
  priorityKind: z.enum(["action", "strength", "missing_evidence", "not_priority"]).optional(),
});
const benchmarkPayloadSchema = z.object({
  kind: z.literal("benchmark"), comparisonId: z.string(), datasetId: z.string().nullable(),
  datasetVersion: z.string().nullable(), metric: z.string(),
  compatibilityConfidence: z.enum(["High", "Moderate", "Low", "Unavailable"]),
  percentile: z.number().min(0).max(100).nullable(),
});
const projectionPayloadSchema = z.object({
  kind: z.literal("projection"), projectionId: z.string(), projectionType: z.string(),
  targetMetric: z.string(), status: z.enum(["available", "insufficient_evidence", "unsupported"]),
});
const reportPayloadSchema = z.object({
  kind: z.literal("report"), reportId: z.string(), analysisId: z.string(),
  audience: z.enum(["athlete", "coach"]), status: z.string(),
});
const changePayloadSchema = z.object({
  kind: z.literal("validated_change"), metric: z.string(), direction: z.enum(["improved", "regressed", "stable"]),
  previousValue: z.number(), currentValue: z.number(), unit: z.string(),
  higherIsBetter: z.boolean(), evidenceIds: z.array(z.string()).min(2),
});
const seasonPayloadSchema = z.object({
  kind: z.literal("season"), seasonId: z.string(), label: z.string(),
  startedAt: z.string().datetime(), endedAt: z.string().datetime().nullable(),
  primaryEvents: z.array(athleteEventSchema),
});
const performancePayloadSchema = z.object({
  kind: z.literal("performance_result"), resultId: z.string(),
  event: athleteEventSchema, resultType: z.enum(["personal_best", "season_best", "meet_result", "split", "readiness"]),
  value: z.number().finite().nullable(), unit: z.string(), verified: z.boolean(),
});
const trainingPayloadSchema = z.object({
  kind: z.literal("training"), trainingId: z.string(),
  eventType: z.enum(["block_started", "block_completed", "interruption_started", "interruption_ended", "adherence_recorded"]),
  label: z.string(), adherence: z.number().min(0).max(1).nullable(),
});
const injuryPayloadSchema = z.object({
  kind: z.literal("reported_health_context"), contextId: z.string(),
  status: z.enum(["reported", "restricted", "return_to_play_cleared", "resolved"]),
  summary: z.string(), reportedBy: z.enum(["athlete", "coach", "clinician_document"]),
  clinicalDocumentReference: z.string().nullable(),
});
const coachPayloadSchema = z.object({
  kind: z.literal("coach_interaction"), interactionId: z.string(),
  action: z.enum(["accepted_recommendation", "ignored_recommendation", "manual_note", "manual_correction", "manual_priority", "coach_override", "coach_rating", "future_reminder"]),
  linkedEntityId: z.string().nullable(), note: z.string(), rating: z.number().min(1).max(5).nullable(),
  reminderAt: z.string().datetime().nullable(),
});
const rootCauseFeedbackPayloadSchema = z.object({
  kind: z.literal("root_cause_feedback"), rootCauseStateId: z.string(),
  candidateId: z.string(), action: z.enum([
    "confirm", "reject", "merge", "split", "downgrade", "upgrade", "unknown",
  ]),
  relatedCandidateIds: z.array(z.string()), reasonCode: z.string(),
});

export const twinTimelinePayloadSchema = z.discriminatedUnion("kind", [
  analysisPayloadSchema, recommendationPayloadSchema, priorityPayloadSchema,
  benchmarkPayloadSchema, projectionPayloadSchema, reportPayloadSchema,
  changePayloadSchema, seasonPayloadSchema, performancePayloadSchema,
  trainingPayloadSchema, injuryPayloadSchema, coachPayloadSchema,
  rootCauseFeedbackPayloadSchema,
]);
export type TwinTimelinePayload = z.infer<typeof twinTimelinePayloadSchema>;

export const twinTimelineEventSchema = z.object({
  eventId: z.string().min(1), athleteId: z.string().min(1),
  occurredAt: z.string().datetime(), recordedAt: z.string().datetime(),
  sourceVersion: z.string().min(1), compatibilityKey: z.string().nullable(),
  confidence: z.number().min(0).max(1), payload: twinTimelinePayloadSchema,
});
export type TwinTimelineEvent = z.infer<typeof twinTimelineEventSchema>;

export const mechanicalBaselineSchema = z.object({
  metric: z.string(), unit: z.string(), compatibilityKey: z.string(),
  mean: z.number().finite(), median: z.number().finite(),
  variance: z.number().nonnegative(), confidence: z.number().min(0).max(1),
  sampleSize: z.number().int().positive(), lastUpdated: z.string().datetime(),
  sourceEventIds: z.array(z.string()).min(1),
});
export type MechanicalBaseline = z.infer<typeof mechanicalBaselineSchema>;

export const twinTrendSchema = z.object({
  trendId: z.string(), trendKind: twinTrendKindSchema, metric: z.string(), unit: z.string(),
  classification: trendClassificationSchema, compatibilityKey: z.string().nullable(),
  slopePer30Days: z.number().finite().nullable(), confidence: z.number().min(0).max(1),
  sampleSize: z.number().int().nonnegative(), sourceEventIds: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type TwinTrend = z.infer<typeof twinTrendSchema>;

export const archetypeSignalSchema = z.object({
  signalKey: z.enum([
    "acceleration_strength", "frequency_dominance", "stride_dominance", "balanced_mechanics",
    "elastic_behavior", "high_variability", "late_development", "technical_strength",
  ]),
  confidence: z.number().min(0).max(1), supportingEventIds: z.array(z.string()).min(1),
  sourceVersion: z.string().min(1),
});
export type ArchetypeSignal = z.infer<typeof archetypeSignalSchema>;

export const movementArchetypeSchema = z.object({
  archetype: movementArchetypeTypeSchema, confidence: z.number().min(0).max(1),
  supportingEvidence: z.array(z.string()).min(1),
  history: z.array(z.object({ snapshotId: z.string(), confidence: z.number().min(0).max(1), observedAt: z.string().datetime() })),
  experimental: z.literal(true),
});
export type MovementArchetype = z.infer<typeof movementArchetypeSchema>;

export const recommendationMemorySchema = z.object({
  recommendationId: z.string(), recommendationKey: z.string(), title: z.string(),
  date: z.string().datetime(), context: z.string(),
  implementationStatus: z.enum(["implemented", "not_implemented", "partial", "unknown"]),
  followUpEvidence: z.array(z.string()), effectSize: z.number().finite().nullable(),
  effectDirection: z.enum(["improved", "regressed", "no_measurable_change", "unknown"]),
  confidence: z.number().min(0).max(1),
  futureApplicability: z.enum(["supported", "limited", "not_supported", "unknown"]),
  causalClaimAllowed: z.literal(false),
});

export const twinIdentitySchema = z.object({
  fullName: z.string().min(1), sex: z.enum(["M", "F", "X", "unknown"]),
  dateOfBirth: z.string().nullable(), heightCm: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(), trainingAgeYears: z.number().nonnegative().nullable(),
});
export const competitionProfileSchema = z.object({
  primaryEvents: z.array(athleteEventSchema), competitionLevel: z.string().nullable(),
  currentSeason: z.string().nullable(),
});

export const athleteDigitalTwinSchema = z.object({
  twinId: z.string(), athleteId: z.string(), createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(), engineVersion: z.literal(DIGITAL_TWIN_ENGINE_VERSION),
  schemaVersion: z.literal(DIGITAL_TWIN_SCHEMA_VERSION),
  confidenceScore: z.object({ score: z.number().min(0).max(100), level: twinConfidenceSchema, lastEvidenceAt: z.string().datetime().nullable(), reasons: z.array(z.string()) }),
  identity: twinIdentitySchema, competitionProfile: competitionProfileSchema,
  performanceHistory: z.array(twinTimelineEventSchema), mechanicalFingerprint: z.object({
    fingerprintId: z.string(), version: z.string(), summary: z.string(),
    confidence: z.number().min(0).max(1), experimental: z.boolean(),
  }).nullable(),
  adaptationHistory: z.array(twinTimelineEventSchema),
  trainingHistory: z.array(twinTimelineEventSchema), seasonHistory: z.array(twinTimelineEventSchema),
  injuryHistory: z.array(twinTimelineEventSchema),
  recommendationHistory: z.array(recommendationMemorySchema),
  priorityHistory: z.array(twinTimelineEventSchema), benchmarkHistory: z.array(twinTimelineEventSchema),
  projectionHistory: z.array(twinTimelineEventSchema), reportHistory: z.array(twinTimelineEventSchema),
  trendHistory: z.array(twinTrendSchema), mechanicalBaselines: z.array(mechanicalBaselineSchema),
  movementArchetype: z.array(movementArchetypeSchema),
  riskFlags: z.array(z.object({
    type: z.enum(["data_gap", "measurement_instability", "regression", "recurring_priority", "training_interruption", "reported_health_context"]),
    summary: z.string(), confidence: z.number().min(0).max(1), sourceEventIds: z.array(z.string()),
    nonClinical: z.literal(true),
  })),
  coachMemory: z.array(twinTimelineEventSchema),
  unknownVariables: z.array(z.string()), dataQuality: z.object({
    compatibleAnalysisCount: z.number().int().nonnegative(),
    excludedEventCount: z.number().int().nonnegative(), latestSessionQuality: z.number().min(0).max(1).nullable(),
    warnings: z.array(z.string()),
  }),
  timeline: z.array(twinTimelineEventSchema),
});
export type AthleteDigitalTwin = z.infer<typeof athleteDigitalTwinSchema>;

export const digitalTwinInputSchema = z.object({
  athleteId: z.string(), twinId: z.string(), snapshotId: z.string(), generatedAt: z.string().datetime(),
  identity: twinIdentitySchema, competitionProfile: competitionProfileSchema,
  timeline: z.array(twinTimelineEventSchema),
  mechanicalFingerprint: athleteDigitalTwinSchema.shape.mechanicalFingerprint,
  archetypeSignals: z.array(archetypeSignalSchema),
  previousSnapshot: z.object({
    snapshotId: z.string(), twin: z.lazy(() => athleteDigitalTwinSchema),
  }).nullable(),
  unknownVariables: z.array(z.string()),
});
export type DigitalTwinInput = z.infer<typeof digitalTwinInputSchema>;

export const digitalTwinSnapshotSchema = z.object({
  snapshotId: z.string(), snapshotVersion: z.literal(DIGITAL_TWIN_SNAPSHOT_VERSION),
  athleteId: z.string(), twin: athleteDigitalTwinSchema,
  previousSnapshotId: z.string().nullable(), reason: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type DigitalTwinSnapshot = z.infer<typeof digitalTwinSnapshotSchema>;
