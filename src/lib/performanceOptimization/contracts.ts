import { z } from "zod";
import {
  coachingCandidateSchema, coachingEvidenceSchema, competitionScheduleSchema,
  seasonStageSchema,
} from "@/lib/adaptiveCoaching/contracts";
import { athleteDigitalTwinSchema } from "@/lib/digitalTwin";

export const PERFORMANCE_OPTIMIZATION_ENGINE_VERSION = "ava-performance-optimization-v1";
export const PERFORMANCE_OPTIMIZATION_SCHEMA_VERSION = "ava-performance-optimization-state-v1";
export const PERFORMANCE_IMPACT_MODEL_VERSION = "ava-performance-impact-v1";

export const adaptationProfileSchema = z.enum([
  "rapid_responder", "steady_responder", "slow_responder", "plateaus_quickly",
  "high_variability", "late_responder", "unknown",
]);
export const optimizationDispositionSchema = z.enum([
  "investment", "maintenance", "monitoring", "deferred", "ignored", "retired",
]);
export const optimizerOverrideSchema = z.object({
  overrideId: z.string(), candidateId: z.string(),
  action: z.enum(["accept", "reject", "lower_ranking", "raise_ranking", "lock", "disable"]),
  reasonCode: z.enum(["coach_judgment", "competition_plan", "athlete_context", "safety", "manual_priority"]),
  createdAt: z.string().datetime(), sourceVersion: z.string(),
});

export const optimizationCandidateSchema = z.object({
  candidate: coachingCandidateSchema,
  expectedRacePerformanceInfluence: z.number().min(0).max(1),
  potentialImprovement: z.number().min(0).max(1),
  probabilityOfSuccess: z.number().min(0).max(1),
  athleteSpecificity: z.number().min(0).max(1),
  researchSupport: z.number().min(0).max(1),
  benchmarkEvidence: z.number().min(0).max(1),
  projectionConfidence: z.number().min(0).max(1),
  benchmarkSimilarity: z.number().min(0).max(1),
  phaseTransfer: z.number().min(0).max(1),
  eventTransfer: z.number().min(0).max(1),
  evidenceQuality: z.number().min(0).max(1),
  expectedPersistence: z.number().min(0).max(1),
  maintenanceCost: z.number().min(0).max(1),
  historicalEffectiveness: z.number().min(-1).max(1),
  recommendationAdherence: z.number().min(0).max(1),
  capturedBenefit: z.number().min(0).max(1),
  priorInvestmentCount: z.number().int().nonnegative(),
  adaptationProfile: adaptationProfileSchema,
  plateauDetected: z.boolean(),
  changeRisk: z.enum(["low", "moderate", "high", "unknown"]),
  preferredSeasonStages: z.array(seasonStageSchema).min(1),
  researchEvidenceIds: z.array(z.string()),
  benchmarkComparisonIds: z.array(z.string()),
  projectionIds: z.array(z.string()),
  unknownVariables: z.array(z.string()),
}).superRefine((item, ctx) => {
  if (item.researchSupport > 0 && !item.researchEvidenceIds.length)
    ctx.addIssue({ code: "custom", path: ["researchEvidenceIds"], message: "Research support requires source identity." });
  if (item.benchmarkEvidence > 0 && !item.benchmarkComparisonIds.length)
    ctx.addIssue({ code: "custom", path: ["benchmarkComparisonIds"], message: "Benchmark support requires comparison identity." });
  if (item.projectionConfidence > 0 && !item.projectionIds.length)
    ctx.addIssue({ code: "custom", path: ["projectionIds"], message: "Projection support requires projection identity." });
});
export type OptimizationCandidate = z.infer<typeof optimizationCandidateSchema>;

export const dependencyEdgeSchema = z.object({
  edgeId: z.string(), prerequisiteCandidateId: z.string(), unlockedCandidateId: z.string(),
  strength: z.number().min(0).max(1), evidence: z.array(coachingEvidenceSchema).min(1),
  sourceVersion: z.string(),
});
export const interactionEdgeSchema = z.object({
  interactionId: z.string(), sourceCandidateId: z.string(), targetCandidateId: z.string(),
  effect: z.enum(["positive", "negative", "neutral", "unknown"]),
  magnitude: z.number().min(0).max(1), evidence: z.array(coachingEvidenceSchema).min(1),
  sourceVersion: z.string(),
});

export const performanceOptimizationInputSchema = z.object({
  optimizationId: z.string(), athleteId: z.string(), generatedAt: z.string().datetime(),
  digitalTwin: athleteDigitalTwinSchema,
  candidates: z.array(optimizationCandidateSchema),
  dependencyGraph: z.array(dependencyEdgeSchema),
  interactions: z.array(interactionEdgeSchema),
  coachOverrides: z.array(optimizerOverrideSchema),
  competitionSchedule: competitionScheduleSchema,
  seasonContext: z.object({
    stage: seasonStageSchema, circuit: z.enum(["indoor", "outdoor", "mixed", "unknown"]),
    contextVersion: z.string(),
  }),
  measurementQuality: z.number().min(0).max(1),
  researchVersion: z.string().nullable(), benchmarkVersion: z.string().nullable(),
  projectionVersion: z.string().nullable(), priorityVersion: z.string(),
  recommendationVersion: z.string(), unknownVariables: z.array(z.string()),
}).superRefine((input, ctx) => {
  if (input.digitalTwin.athleteId !== input.athleteId)
    ctx.addIssue({ code: "custom", path: ["digitalTwin"], message: "Digital Twin athlete mismatch." });
  const ids = new Set(input.candidates.map((item) => item.candidate.candidateId));
  if (ids.size !== input.candidates.length)
    ctx.addIssue({ code: "custom", path: ["candidates"], message: "Candidate IDs must be unique." });
  for (const edge of input.dependencyGraph)
    if (!ids.has(edge.prerequisiteCandidateId) || !ids.has(edge.unlockedCandidateId))
      ctx.addIssue({ code: "custom", path: ["dependencyGraph"], message: `Dependency references an unavailable candidate: ${edge.edgeId}` });
  for (const edge of input.interactions)
    if (!ids.has(edge.sourceCandidateId) || !ids.has(edge.targetCandidateId))
      ctx.addIssue({ code: "custom", path: ["interactions"], message: `Interaction references an unavailable candidate: ${edge.interactionId}` });
  for (const override of input.coachOverrides)
    if (!ids.has(override.candidateId))
      ctx.addIssue({ code: "custom", path: ["coachOverrides"], message: `Override references an unavailable candidate: ${override.overrideId}` });
});
export type PerformanceOptimizationInput = z.input<typeof performanceOptimizationInputSchema>;

export const impactComponentSchema = z.object({
  component: z.string(), rawValue: z.number().finite(), weight: z.number().finite(),
  weightedValue: z.number().finite(), sourceIds: z.array(z.string()),
});
export const optimizationModifierSchema = z.object({
  modifier: z.string(), multiplier: z.number().nonnegative(),
  contribution: z.number().finite(), reason: z.string(), sourceIds: z.array(z.string()),
});
export const optimizationDecisionSchema = z.object({
  candidateId: z.string(), candidate: coachingCandidateSchema,
  disposition: optimizationDispositionSchema, rank: z.number().int().positive().nullable(),
  optimizationScore: z.number().min(0).max(100),
  impactScore: z.number().min(0).max(100),
  expectedPerformanceGain: z.object({
    normalizedLower: z.number().min(0).max(1), normalizedExpected: z.number().min(0).max(1),
    normalizedUpper: z.number().min(0).max(1),
    classification: z.enum(["potentially_high", "potentially_moderate", "potentially_low", "insufficient"]),
    calibratedToRaceTime: z.literal(false),
  }),
  impactComponents: z.array(impactComponentSchema),
  modifiers: z.array(optimizationModifierSchema),
  requiredPrerequisites: z.array(z.string()),
  historicalSupport: z.array(z.string()), confidence: z.number().min(0).max(1),
  whySelectedOrDeferred: z.string(), conditionsThatChangeDecision: z.array(z.string()),
  unknownVariables: z.array(z.string()), overrideIds: z.array(z.string()),
});
export type OptimizationDecision = z.infer<typeof optimizationDecisionSchema>;

export const performanceOptimizationStateSchema = z.object({
  optimizationId: z.string(), athleteId: z.string(),
  engineVersion: z.literal(PERFORMANCE_OPTIMIZATION_ENGINE_VERSION),
  optimizationVersion: z.literal(PERFORMANCE_OPTIMIZATION_SCHEMA_VERSION),
  impactModelVersion: z.literal(PERFORMANCE_IMPACT_MODEL_VERSION),
  generatedAt: z.string().datetime(), inputFingerprint: z.string(),
  highestReturnFocus: optimizationDecisionSchema.nullable(),
  recommendedInvestmentOrder: z.array(optimizationDecisionSchema).max(2),
  expectedPerformanceGain: z.object({
    normalizedExpected: z.number().min(0).max(1),
    classification: z.enum(["potentially_high", "potentially_moderate", "potentially_low", "insufficient"]),
    calibratedToRaceTime: z.literal(false),
  }),
  confidence: z.object({
    score: z.number().min(0).max(100),
    level: z.enum(["High", "Moderate", "Low", "Insufficient"]),
    limitingFactors: z.array(z.string()),
  }),
  optimizationScore: z.number().min(0).max(100),
  tradeoffs: z.array(z.object({
    chosenCandidateId: z.string(), alternativeCandidateId: z.string(),
    scoreDifference: z.number().nonnegative(), explanation: z.string(),
  })),
  ignoredFocuses: z.array(optimizationDecisionSchema),
  deferredFocuses: z.array(optimizationDecisionSchema),
  maintenanceFocuses: z.array(optimizationDecisionSchema),
  monitoringFocuses: z.array(optimizationDecisionSchema),
  retiredFocuses: z.array(optimizationDecisionSchema),
  optimizedCandidates: z.array(coachingCandidateSchema),
  dependencyGraph: z.array(dependencyEdgeSchema),
  interactions: z.array(interactionEdgeSchema),
  requiredPrerequisites: z.array(z.object({
    selectedCandidateId: z.string(), prerequisiteCandidateId: z.string(),
    satisfiedBySelection: z.boolean(), evidenceIds: z.array(z.string()),
  })),
  competitionAdjustments: z.array(z.object({
    candidateId: z.string(), multiplier: z.number().nonnegative(), reason: z.string(),
  })),
  seasonAdjustments: z.array(z.object({
    candidateId: z.string(), multiplier: z.number().nonnegative(), reason: z.string(),
  })),
  historicalSupport: z.array(z.string()),
  unknownVariables: z.array(z.string()),
  overrideAudit: z.array(optimizerOverrideSchema),
  trace: z.array(z.object({
    candidateId: z.string(), impactComponents: z.array(impactComponentSchema),
    modifiers: z.array(optimizationModifierSchema), finalScore: z.number().min(0).max(100),
    finalDisposition: optimizationDispositionSchema, finalRank: z.number().int().positive().nullable(),
  })),
  invalidationContext: z.object({
    twinUpdatedAt: z.string().datetime(), priorityVersion: z.string(),
    recommendationVersion: z.string(), benchmarkVersion: z.string().nullable(),
    projectionVersion: z.string().nullable(), researchVersion: z.string().nullable(),
    scheduleVersion: z.string(), seasonContextVersion: z.string(), overrideIds: z.array(z.string()),
  }),
  computePolicy: z.object({
    evaluatedOn: z.literal("server"), servedFromCache: z.literal(true),
    offlineCompatible: z.literal(true), externalModelCalls: z.literal(0),
    deterministic: z.literal(true),
  }),
});
export type PerformanceOptimizationState = z.infer<typeof performanceOptimizationStateSchema>;

