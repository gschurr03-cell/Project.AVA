import { z } from "zod";

import { observationEvidenceSchema, observationLimitationSchema, observationSideSchema } from "@/lib/observations";
import {
  INTERPRETATION_ENGINE_VERSION,
  evidenceQualitySchema,
  interpretationConfidenceSchema,
  interpretationResultSchema,
  sprintPhaseSchema,
} from "@/lib/intelligence/interpretations";

export const RECOMMENDATION_ENGINE_VERSION = "ava-recommendations-v1";
export const RECOMMENDATION_LIBRARY_VERSION = "ava-recommendation-library-v1";

export const recommendationStatusSchema = z.enum([
  "supported",
  "limited",
  "experimental",
  "context_required",
  "insufficient_evidence",
  "contradicted",
  "unavailable",
  "suppressed",
  "preserve_only",
]);
export const actionTypeSchema = z.enum([
  "record_again",
  "improve_recording_setup",
  "collect_more_data",
  "monitor_pattern",
  "technical_cue",
  "low_risk_drill",
  "sprint_drill",
  "strength_consideration",
  "mobility_assessment",
  "coach_review",
  "medical_review",
  "no_action_needed",
  "preserve_strength",
  "unavailable",
]);
export const interventionTypeSchema = z.enum([
  "observation_task",
  "recording_task",
  "technique_focus",
  "rhythm_drill",
  "acceleration_drill",
  "max_velocity_drill",
  "posture_drill",
  "front_side_drill",
  "backside_drill",
  "asymmetry_monitoring",
  "low_intensity_coordination",
  "sprint_exposure",
  "strength_training_consideration",
  "mobility_screen_consideration",
  "coach_discussion",
  "recovery_consideration",
  "preserve_current_pattern",
]);
export const safetyTierSchema = z.enum(["tier_1", "tier_2", "tier_3", "tier_4"]);
export const goalRelevanceSchema = z.enum(["high", "moderate", "low", "unrelated", "unknown"]);
export const interventionEvidenceSchema = z.enum(["strong", "moderate", "limited", "heuristic", "unknown"]);
export const intensityTierSchema = z.enum(["observation_only", "low", "submaximal", "coach_determined"]);
export const repetitionCategorySchema = z.enum(["not_applicable", "few_quality_repetitions", "coach_determined"]);
export const recoveryCategorySchema = z.enum(["not_applicable", "full_recovery", "coach_determined"]);
export const frequencyCategorySchema = z.enum(["not_applicable", "single_review", "limited_exposure", "coach_determined"]);

export const monitoringPlanSchema = z.object({
  metricKeys: z.array(z.string()),
  observationKeys: z.array(z.string()),
  preferredRecordingSetup: z.string(),
  preferredPhase: sprintPhaseSchema,
  minimumSessions: z.number().int().min(1),
  compatibilityRequirements: z.array(z.string()).min(1),
  successSignal: z.string(),
  regressionSignal: z.string(),
  reviewWindow: z.string(),
});

export const volumeGuidanceSchema = z.object({
  intensityTier: intensityTierSchema,
  repetitionRangeCategory: repetitionCategorySchema,
  recoveryCategory: recoveryCategorySchema,
  sessionFrequencyCategory: frequencyCategorySchema,
  progressionRequirement: z.string(),
});

export const recommendationSchema = z.object({
  id: z.string().min(1),
  recommendationKey: z.string().min(1),
  libraryItemId: z.string().min(1),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  objective: z.string().min(1),
  rationale: z.string().min(1),
  linkedInterpretationIds: z.array(z.string()).min(1),
  linkedObservationIds: z.array(z.string()).min(1),
  supportingEvidence: z.array(observationEvidenceSchema).min(1),
  actionType: actionTypeSchema,
  interventionType: interventionTypeSchema,
  suggestedActions: z.array(z.string()).min(1),
  technicalCues: z.array(z.string()),
  implementationNotes: z.array(z.string()).min(1),
  progressionGuidance: z.string(),
  frequencyGuidance: z.string(),
  volumeGuidance: volumeGuidanceSchema,
  stopConditions: z.array(z.string()).min(1),
  contraindicationNotes: z.array(z.string()).min(1),
  monitoringPlan: monitoringPlanSchema,
  expectedOutcomeArea: z.string().min(1),
  confidence: interpretationConfidenceSchema,
  interventionEvidenceQuality: interventionEvidenceSchema,
  status: recommendationStatusSchema,
  safetyTier: safetyTierSchema,
  phase: sprintPhaseSchema,
  event: z.string().nullable(),
  side: observationSideSchema,
  athleteGoalRelevance: goalRelevanceSchema,
  contextRequirements: z.array(z.string()),
  limitations: z.array(observationLimitationSchema),
  excludedClaims: z.array(z.string()).min(1),
  experimental: z.boolean(),
  enabled: z.boolean(),
  rootCauseContext: z.unknown().optional(),
  createdAt: z.string().datetime(),
  engineVersion: z.literal(RECOMMENDATION_ENGINE_VERSION),
  provenance: z.object({
    sourceInterpretationEngineVersion: z.literal(INTERPRETATION_ENGINE_VERSION),
    sourceObservationEngineVersion: z.literal("ava-observations-v1"),
    sourceInterpretationIds: z.array(z.string()).min(1),
    sourceAnalysisId: z.string().min(1),
    inputHash: z.string().min(1),
    athleteContextVersion: z.string().min(1),
    libraryVersion: z.literal(RECOMMENDATION_LIBRARY_VERSION),
  }),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const athleteRecommendationContextSchema = z.object({
  athleteId: z.string().nullable(),
  trainingAge: z.enum(["beginner", "intermediate", "advanced", "unknown"]),
  competitionLevel: z.enum(["recreational", "school", "club", "national", "international", "unknown"]),
  primaryEvent: z.string().nullable(),
  goals: z.array(z.enum(["acceleration", "maximum_velocity", "mechanics", "asymmetry", "consistency", "progress_tracking", "return_to_competition", "custom"])),
  reportedPain: z.boolean().nullable(),
  activeLimitation: z.string().nullable(),
  contextVersion: z.string().min(1).default("ava-athlete-recommendation-context-v1"),
});

export const recommendationContextSchema = z.object({
  analysisId: z.string().min(1),
  generatedAt: z.string().datetime(),
  phase: sprintPhaseSchema,
  event: z.string().nullable(),
  sessionPurpose: z.string().nullable(),
  cameraMode: z.string().nullable(),
  fpsTier: z.enum(["validated_60", "high_speed_normalized", "experimental_30", "unknown"]),
  calibrationAvailable: z.boolean(),
  savedVersion: z.boolean(),
  athlete: athleteRecommendationContextSchema,
});
export type RecommendationContext = z.infer<typeof recommendationContextSchema>;

export const recommendationInputSchema = z.object({
  interpretations: interpretationResultSchema,
  context: recommendationContextSchema,
});
export type RecommendationInput = z.infer<typeof recommendationInputSchema>;

export interface RecommendationTraceEntry {
  ruleId: string;
  interpretationsConsidered: string[];
  interpretationsAccepted: string[];
  interpretationsRejected: Array<{ id: string; reason: string }>;
  contextChecks: string[];
  confidenceThreshold: string;
  evidenceQualityThreshold: string;
  safetyTierDecision: string;
  contraindicationChecks: string[];
  goalMatching: string;
  phaseMatching: string;
  conflictResolution: string | null;
  duplicateSuppression: string | null;
  libraryItemSelected: string | null;
  finalParameterization: string[];
  finalOutputId: string | null;
  suppressionReason: string | null;
}

export const recommendationResultSchema = z.object({
  analysisId: z.string().min(1),
  engineVersion: z.literal(RECOMMENDATION_ENGINE_VERSION),
  generatedAt: z.string().datetime(),
  recommendations: z.array(recommendationSchema),
  preserveRecommendations: z.array(recommendationSchema),
  monitoringRecommendations: z.array(recommendationSchema),
  unavailableRecommendations: z.array(recommendationSchema),
  suppressedRecommendations: z.array(recommendationSchema),
  warnings: z.array(z.string()),
  trace: z.custom<RecommendationTraceEntry[]>(),
  sourceInterpretationEngineVersion: z.literal(INTERPRETATION_ENGINE_VERSION),
  sourceObservationEngineVersion: z.literal("ava-observations-v1"),
  libraryVersion: z.literal(RECOMMENDATION_LIBRARY_VERSION),
  ruleVersions: z.record(z.string()),
  inputHash: z.string().min(1),
});
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;
export type InterpretationConfidence = z.infer<typeof interpretationConfidenceSchema>;
export type InterpretationEvidenceQuality = z.infer<typeof evidenceQualitySchema>;
