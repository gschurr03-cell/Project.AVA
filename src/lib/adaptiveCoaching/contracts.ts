import { z } from "zod";
import { athleteDigitalTwinSchema, recommendationMemorySchema } from "@/lib/digitalTwin";

export const ADAPTIVE_COACHING_ENGINE_VERSION = "ava-adaptive-coaching-v1";
export const COACHING_STATE_SCHEMA_VERSION = "ava-coaching-state-v1";
export const OFFLINE_COACHING_CACHE_VERSION = "ava-offline-coaching-cache-v1";

export const coachingConfidenceLevelSchema = z.enum(["High", "Moderate", "Low", "Insufficient"]);
export const focusDispositionSchema = z.enum([
  "primary", "secondary", "maintenance", "monitoring", "retired",
]);
export const seasonStageSchema = z.enum([
  "off_season", "general_preparation", "specific_preparation", "pre_competition",
  "competition", "championship", "transition", "unknown",
]);
export const developmentStageSchema = z.enum([
  "beginner", "developing", "trained", "advanced", "unknown",
]);
export const invalidationTriggerTypeSchema = z.enum([
  "new_completed_analysis", "coach_override", "benchmark_version", "digital_twin_update",
  "recommendation_acceptance", "recommendation_rejection", "competition_schedule",
  "season_transition", "research_version", "manual_regeneration", "app_open",
]);

export const coachingEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceType: z.enum([
    "digital_twin", "observation", "interpretation", "recommendation", "priority",
    "report", "projection", "benchmark", "research", "coach_override", "schedule",
  ]),
  sourceVersion: z.string().min(1),
  structuredLabel: z.string().min(1),
  confidence: z.number().min(0).max(1),
  validated: z.literal(true),
});
export type CoachingEvidence = z.infer<typeof coachingEvidenceSchema>;

export const coachingCandidateSchema = z.object({
  candidateId: z.string().min(1), priorityId: z.string().min(1),
  recommendationId: z.string().min(1), recommendationKey: z.string().min(1),
  category: z.string().min(1), title: z.string().min(1), objective: z.string().min(1),
  priorityKind: z.enum(["action", "strength", "missing_evidence"]),
  confidence: z.number().min(0).max(1),
  expectedImpact: z.enum(["High", "Moderate", "Low", "Unknown"]),
  safetyTier: z.enum(["tier_1", "tier_2", "tier_3", "tier_4"]),
  status: z.enum(["validated", "limited", "unavailable"]),
  competitionSafe: z.boolean(),
  applicableEvents: z.array(z.string()),
  applicableDevelopmentStages: z.array(developmentStageSchema).min(1),
  supportingEvidence: z.array(coachingEvidenceSchema).min(1),
  historicalSessionCount: z.number().int().nonnegative(),
  monitoringPlan: z.object({
    metricKeys: z.array(z.string()), successSignal: z.string().min(1),
    regressionSignal: z.string().min(1), minimumSessions: z.number().int().positive(),
    reviewWindowDays: z.number().int().positive(),
  }),
  sourceVersions: z.object({
    recommendation: z.string().min(1), priority: z.string().min(1),
  }),
});
export type CoachingCandidate = z.infer<typeof coachingCandidateSchema>;

export const competitionScheduleSchema = z.object({
  scheduleVersion: z.string().min(1),
  nextCompetitionAt: z.string().datetime().nullable(),
  event: z.string().nullable(), importance: z.enum(["training", "low", "standard", "high", "championship"]).nullable(),
});
export const coachOverrideSchema = z.object({
  overrideId: z.string(), candidateId: z.string(),
  action: z.enum(["force_primary", "maintain", "monitor", "retire", "clear"]),
  reasonCode: z.enum(["coach_judgment", "competition_plan", "athlete_context", "safety", "manual_priority"]),
  createdAt: z.string().datetime(), sourceVersion: z.string(),
});

const optimizationDecisionReferenceSchema = z.object({
  candidateId: z.string(), candidate: coachingCandidateSchema,
  disposition: z.enum(["investment", "maintenance", "monitoring", "deferred", "ignored", "retired"]),
  rank: z.number().int().positive().nullable(), optimizationScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1), historicalSupport: z.array(z.string()),
  whySelectedOrDeferred: z.string(), unknownVariables: z.array(z.string()),
});
export const optimizationStateReferenceSchema = z.object({
  optimizationId: z.string(), athleteId: z.string(),
  engineVersion: z.literal("ava-performance-optimization-v1"),
  optimizationVersion: z.literal("ava-performance-optimization-state-v1"),
  generatedAt: z.string().datetime(), inputFingerprint: z.string(),
  recommendedInvestmentOrder: z.array(optimizationDecisionReferenceSchema).max(2),
  maintenanceFocuses: z.array(optimizationDecisionReferenceSchema),
  monitoringFocuses: z.array(optimizationDecisionReferenceSchema),
  deferredFocuses: z.array(optimizationDecisionReferenceSchema),
  ignoredFocuses: z.array(optimizationDecisionReferenceSchema),
  retiredFocuses: z.array(optimizationDecisionReferenceSchema),
  competitionAdjustments: z.array(z.object({
    candidateId: z.string(), multiplier: z.number().nonnegative(), reason: z.string(),
  })),
  confidence: z.object({
    score: z.number().min(0).max(100), level: coachingConfidenceLevelSchema,
    limitingFactors: z.array(z.string()),
  }),
  unknownVariables: z.array(z.string()),
  invalidationContext: z.object({
    twinUpdatedAt: z.string().datetime(), priorityVersion: z.string(),
    recommendationVersion: z.string(), benchmarkVersion: z.string().nullable(),
    projectionVersion: z.string().nullable(), researchVersion: z.string().nullable(),
    scheduleVersion: z.string(), seasonContextVersion: z.string(),
    overrideIds: z.array(z.string()),
  }),
});

export const adaptiveCoachingInputSchema = z.object({
  athleteId: z.string(), coachingStateId: z.string(), generatedAt: z.string().datetime(),
  digitalTwin: athleteDigitalTwinSchema,
  optimizationState: optimizationStateReferenceSchema,
  competitionSchedule: competitionScheduleSchema,
  seasonStage: seasonStageSchema, trainingPhase: z.string().nullable(),
  developmentStage: developmentStageSchema,
  measurementQuality: z.number().min(0).max(1),
  researchVersion: z.string().nullable(), benchmarkVersion: z.string().nullable(),
  unknownVariables: z.array(z.string()),
  processedTriggers: z.array(z.object({
    triggerId: z.string(), type: invalidationTriggerTypeSchema,
    sourceId: z.string(), occurredAt: z.string().datetime(),
  })),
  previousState: z.object({
    coachingStateId: z.string(), generatedAt: z.string().datetime(),
    inputFingerprint: z.string(), primaryCandidateId: z.string().nullable(),
  }).nullable(),
}).superRefine((input, ctx) => {
  if (input.digitalTwin.athleteId !== input.athleteId)
    ctx.addIssue({ code: "custom", path: ["digitalTwin"], message: "Digital Twin athlete mismatch." });
  if (input.optimizationState.athleteId !== input.athleteId)
    ctx.addIssue({ code: "custom", path: ["optimizationState"], message: "Optimization athlete mismatch." });
  if (input.optimizationState.invalidationContext.twinUpdatedAt !== input.digitalTwin.updatedAt)
    ctx.addIssue({ code: "custom", path: ["optimizationState"], message: "Optimization is stale relative to the Digital Twin." });
  if (input.optimizationState.invalidationContext.scheduleVersion !== input.competitionSchedule.scheduleVersion)
    ctx.addIssue({ code: "custom", path: ["optimizationState"], message: "Optimization is stale relative to the competition schedule." });
});
export type AdaptiveCoachingInput = z.input<typeof adaptiveCoachingInputSchema>;

export const coachingFocusSchema = z.object({
  focusId: z.string(), candidateId: z.string(), recommendationId: z.string(),
  priorityId: z.string(), disposition: focusDispositionSchema,
  category: z.string(), title: z.string(), objective: z.string(),
  evidence: z.array(coachingEvidenceSchema).min(1),
  historicalSupport: z.array(z.string()),
  confidence: z.number().min(0).max(1), explanation: z.string().min(1),
  unknownVariables: z.array(z.string()), reviewAt: z.string().datetime(),
  monitoringPlan: coachingCandidateSchema.shape.monitoringPlan,
  engineVersion: z.literal(ADAPTIVE_COACHING_ENGINE_VERSION),
});
export type CoachingFocus = z.infer<typeof coachingFocusSchema>;

export const coachingStateSchema = z.object({
  coachingStateId: z.string(), athleteId: z.string(),
  engineVersion: z.literal(ADAPTIVE_COACHING_ENGINE_VERSION),
  schemaVersion: z.literal(COACHING_STATE_SCHEMA_VERSION),
  generatedAt: z.string().datetime(), inputFingerprint: z.string(),
  currentPrimaryFocus: coachingFocusSchema.nullable(),
  secondaryFocuses: z.array(coachingFocusSchema).max(1),
  maintenanceFocuses: z.array(coachingFocusSchema).max(3),
  retiredPriorities: z.array(coachingFocusSchema),
  monitoringFocuses: z.array(coachingFocusSchema).max(5),
  competitionAdjustments: z.array(z.object({
    candidateId: z.string(), adjustment: z.enum(["maintained", "moved_to_monitoring", "coach_override"]),
    reason: z.string(),
  })),
  coachingEvolution: z.object({
    previousPrimaryCandidateId: z.string().nullable(),
    currentPrimaryCandidateId: z.string().nullable(),
    change: z.enum(["initialized", "retained", "changed", "cleared", "none"]),
    reason: z.string(),
  }),
  seasonContext: z.object({
    stage: seasonStageSchema, trainingPhase: z.string().nullable(),
    nextCompetitionAt: z.string().datetime().nullable(), daysToCompetition: z.number().int().nonnegative().nullable(),
    scheduleVersion: z.string(),
  }),
  adaptationSummary: z.array(z.object({
    signalId: z.string(), classification: z.string(), evidenceIds: z.array(z.string()), confidence: z.number().min(0).max(1),
  })),
  recommendationMemory: z.array(recommendationMemorySchema),
  coachingConfidence: z.object({
    score: z.number().min(0).max(100), level: coachingConfidenceLevelSchema,
    limitingFactors: z.array(z.string()),
  }),
  activeWarnings: z.array(z.string()),
  evidenceSummary: z.array(coachingEvidenceSchema),
  unknownVariables: z.array(z.string()),
  nextEvaluation: z.object({
    reviewAt: z.string().datetime(), reason: z.string(), triggeringEvents: z.array(z.string()),
  }),
  dataFreshness: z.object({
    status: z.enum(["fresh", "aging", "stale", "unavailable"]),
    latestEvidenceAt: z.string().datetime().nullable(), ageDays: z.number().int().nonnegative().nullable(),
  }),
  notifications: z.array(z.object({
    notificationId: z.string(), type: z.enum(["focus_review", "monitoring_due", "competition_adjustment", "data_stale"]),
    title: z.string(), body: z.string(), deliverAt: z.string().datetime(),
  })),
  invalidationContext: z.object({
    twinUpdatedAt: z.string().datetime(), benchmarkVersion: z.string().nullable(),
    researchVersion: z.string().nullable(), scheduleVersion: z.string(),
    overrideIds: z.array(z.string()), processedTriggerIds: z.array(z.string()),
    optimizationId: z.string(), optimizationFingerprint: z.string(),
  }),
  computePolicy: z.object({
    evaluatedOn: z.literal("server"), servedFromCacheOnOpen: z.literal(true),
    externalModelCalls: z.literal(0), deterministicFallback: z.literal(true),
  }),
});
export type CoachingState = z.infer<typeof coachingStateSchema>;

export const coachingInvalidationTriggerSchema = z.object({
  triggerId: z.string(), type: invalidationTriggerTypeSchema,
  sourceId: z.string(), occurredAt: z.string().datetime(),
});
export type CoachingInvalidationTrigger = z.infer<typeof coachingInvalidationTriggerSchema>;

export const offlineCoachingCacheSchema = z.object({
  cacheVersion: z.literal(OFFLINE_COACHING_CACHE_VERSION),
  athleteId: z.string(), coachingState: coachingStateSchema,
  reportIds: z.array(z.string()), recommendationIds: z.array(z.string()),
  benchmarkComparisonIds: z.array(z.string()), projectionIds: z.array(z.string()),
  drillLibraryVersion: z.string(), syncedAt: z.string().datetime(),
  queuedMutationsSupported: z.array(z.enum(["adherence", "note", "coach_feedback", "reminder", "upload"])),
});
