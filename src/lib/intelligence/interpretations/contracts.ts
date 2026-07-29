import { z } from "zod";

import {
  OBSERVATION_ENGINE_VERSION,
  observationCategorySchema,
  observationConfidenceSchema,
  observationEvidenceSchema,
  observationLimitationSchema,
  observationSchema,
  observationSeveritySchema,
  observationSideSchema,
} from "@/lib/observations";

export const INTERPRETATION_ENGINE_VERSION = "ava-interpretations-v1";

export const interpretationStatusSchema = z.enum([
  "supported",
  "limited",
  "insufficient_evidence",
  "experimental",
  "contradicted",
  "unavailable",
  "context_required",
]);
export const interpretationConfidenceSchema = z.enum([
  "High",
  "Moderate",
  "Low",
  "Unavailable",
]);
export const evidenceQualitySchema = z.enum([
  "strong",
  "moderate",
  "limited",
  "heuristic",
  "unavailable",
]);
export const sprintPhaseSchema = z.enum([
  "block_start",
  "early_acceleration",
  "mid_acceleration",
  "late_acceleration",
  "transition",
  "maximum_velocity",
  "bend_running",
  "speed_endurance",
  "unknown",
]);
export const explanationTypeSchema = z.enum([
  "technical_strategy",
  "phase_transition",
  "fatigue",
  "strength_difference",
  "mobility_difference",
  "coordination_difference",
  "anthropometric_difference",
  "recording_angle",
  "camera_motion",
  "frame_rate",
  "calibration_error",
  "pose_estimation_error",
  "event_detection_error",
  "environmental_context",
  "athlete_variability",
  "insufficient_sample",
  "unknown",
]);
export const contextDependencySchema = z.enum([
  "sprint_phase",
  "event",
  "session_purpose",
  "bend_or_straight",
  "start_type",
  "camera_mode",
  "fps_tier",
  "calibration",
  "competition_level",
  "historical_baseline",
  "fatigue_state",
  "environment",
]);

export const interpretationProvenanceSchema = z.object({
  sourceObservationEngineVersion: z.literal(OBSERVATION_ENGINE_VERSION),
  sourceObservationIds: z.array(z.string()).min(1),
  sourceObservationRuleIds: z.array(z.string()).min(1),
  sourceAnalysisId: z.string().min(1),
  inputHash: z.string().min(1),
  contextVersion: z.string().min(1),
});

export const interpretationSchema = z.object({
  id: z.string().min(1),
  interpretationKey: z.string().min(1),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  category: observationCategorySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  explanation: z.string().min(1),
  likelyMeaning: z.string().min(1),
  alternativeExplanations: z.array(explanationTypeSchema),
  linkedObservationIds: z.array(z.string()).min(1),
  supportingEvidence: z.array(observationEvidenceSchema).min(1),
  status: interpretationStatusSchema,
  confidence: interpretationConfidenceSchema,
  confidenceReasons: z.array(z.string()).min(1),
  evidenceQuality: evidenceQualitySchema,
  evidenceQualityReasons: z.array(z.string()).min(1),
  severity: observationSeveritySchema,
  phase: sprintPhaseSchema,
  side: observationSideSchema,
  limitations: z.array(observationLimitationSchema),
  contextDependencies: z.array(contextDependencySchema),
  excludedConclusions: z.array(z.string()).min(1),
  experimental: z.boolean(),
  createdAt: z.string().datetime(),
  engineVersion: z.literal(INTERPRETATION_ENGINE_VERSION),
  provenance: interpretationProvenanceSchema,
});
export type Interpretation = z.infer<typeof interpretationSchema>;

export const interpretationContextSchema = z.object({
  analysisId: z.string().min(1),
  generatedAt: z.string().datetime(),
  phase: sprintPhaseSchema,
  cameraMode: z.string().nullable(),
  fpsTier: z.enum(["validated_60", "high_speed_normalized", "experimental_30", "unknown"]),
  calibrationAvailable: z.boolean(),
  event: z.string().nullable(),
  sessionPurpose: z.string().nullable(),
  athleteId: z.string().nullable(),
  contextVersion: z.string().min(1).default("ava-interpretation-context-v1"),
  savedVersion: z.boolean().default(false),
});
export type InterpretationContext = z.infer<typeof interpretationContextSchema>;

export const interpretationInputSchema = z.object({
  observations: z.array(observationSchema),
  context: interpretationContextSchema,
});
export type InterpretationInput = z.infer<typeof interpretationInputSchema>;

export interface InterpretationTraceEntry {
  ruleId: string;
  ruleVersion: string;
  observationsConsidered: string[];
  observationsAccepted: string[];
  observationsRejected: Array<{ id: string; reason: string }>;
  contextChecks: string[];
  exclusions: string[];
  confidenceCalculation: string[];
  evidenceQualityCalculation: string[];
  alternativeExplanationsSelected: string[];
  conflictResolution: string | null;
  mergeBehavior: string | null;
  finalOutputId: string | null;
  suppressionReason: string | null;
}

export const interpretationResultSchema = z.object({
  analysisId: z.string().min(1),
  engineVersion: z.literal(INTERPRETATION_ENGINE_VERSION),
  generatedAt: z.string().datetime(),
  interpretations: z.array(interpretationSchema),
  unavailableInterpretations: z.array(interpretationSchema),
  contradictedInterpretations: z.array(interpretationSchema),
  warnings: z.array(z.string()),
  overallInterpretationConfidence: interpretationConfidenceSchema,
  sourceObservationEngineVersion: z.literal(OBSERVATION_ENGINE_VERSION),
  ruleVersions: z.record(z.string()),
  inputHash: z.string().min(1),
  trace: z.custom<InterpretationTraceEntry[]>(),
});
export type InterpretationResult = z.infer<typeof interpretationResultSchema>;

export interface PersonalBaselineContext {
  enabled: false;
  compatibleSessionCount: number;
  compatibilityReasons: string[];
}

export type ObservationConfidence = z.infer<typeof observationConfidenceSchema>;
