import { z } from "zod";

import { observationEvidenceSchema, observationLimitationSchema, observationSchema } from "@/lib/observations";
import {
  interpretationConfidenceSchema,
  interpretationResultSchema,
  sprintPhaseSchema,
} from "@/lib/intelligence/interpretations";
import {
  RECOMMENDATION_ENGINE_VERSION,
  recommendationResultSchema,
} from "@/lib/intelligence/recommendationEngine";

export const PRIORITY_ENGINE_VERSION = "ava-priorities-v1";

export const expectedImpactSchema = z.enum(["High", "Moderate", "Low", "Unknown"]);
export const priorityKindSchema = z.enum([
  "action",
  "strength",
  "missing_evidence",
  "not_priority",
]);

export const prioritySchema = z.object({
  priorityId: z.string().min(1),
  recommendationId: z.string().min(1),
  kind: priorityKindSchema,
  title: z.string().min(1),
  whyItMatters: z.string().min(1),
  whySelected: z.array(z.string()).min(1),
  confidence: interpretationConfidenceSchema,
  expectedImpact: expectedImpactSchema,
  linkedEvidence: z.array(observationEvidenceSchema).min(1),
  linkedObservations: z.array(z.string()).min(1),
  linkedInterpretations: z.array(z.string()).min(1),
  linkedRecommendations: z.array(z.string()).min(1),
  supportingMetrics: z.array(z.string()),
  limitations: z.array(observationLimitationSchema),
  nextValidationStep: z.string().min(1),
  createdAt: z.string().datetime(),
  engineVersion: z.literal(PRIORITY_ENGINE_VERSION),
});
export type Priority = z.infer<typeof prioritySchema>;

export const notPrioritySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  linkedRecommendationId: z.string().min(1),
  linkedInterpretationIds: z.array(z.string()),
  confidence: interpretationConfidenceSchema,
});
export type NotPriority = z.infer<typeof notPrioritySchema>;

export const persistenceSignalSchema = z.object({
  recommendationKey: z.string().min(1),
  compatibleSessionCount: z.number().int().nonnegative(),
  persistent: z.boolean(),
  directionConsistent: z.boolean(),
});

export const baselineSignalSchema = z.object({
  recommendationKey: z.string().min(1),
  compatibleBaselineAvailable: z.boolean(),
  deviationClassification: z.enum(["meaningful", "small", "none", "unknown"]),
});

export const priorityContextSchema = z.object({
  analysisId: z.string().min(1),
  generatedAt: z.string().datetime(),
  athleteGoals: z.array(z.string()),
  primaryEvent: z.string().nullable(),
  phase: sprintPhaseSchema,
  coachRelevantAreas: z.array(z.string()),
  persistenceSignals: z.array(persistenceSignalSchema),
  baselineSignals: z.array(baselineSignalSchema),
  contextVersion: z.string().min(1).default("ava-priority-context-v1"),
});
export type PriorityContext = z.infer<typeof priorityContextSchema>;

export const priorityInputSchema = z.object({
  observations: z.array(observationSchema),
  interpretations: interpretationResultSchema,
  recommendations: recommendationResultSchema,
  context: priorityContextSchema,
});
export type PriorityInput = z.infer<typeof priorityInputSchema>;

export interface PriorityScoreComponent {
  factor: string;
  effect: "increased" | "decreased" | "neutral";
  reason: string;
}

export interface PriorityTraceEntry {
  recommendationId: string;
  recommendationKey: string;
  scoreComponents: PriorityScoreComponent[];
  classification: "top" | "secondary" | "strength" | "not_priority" | "missing_evidence" | "suppressed";
  mergeBehavior: string | null;
  conflictHandling: string | null;
  suppressedBy: string | null;
}

export const priorityResultSchema = z.object({
  analysisId: z.string().min(1),
  engineVersion: z.literal(PRIORITY_ENGINE_VERSION),
  generatedAt: z.string().datetime(),
  topPriorities: z.array(prioritySchema).max(3),
  supportingStrengths: z.array(prioritySchema),
  secondaryPriorities: z.array(prioritySchema).max(5),
  notPriorities: z.array(notPrioritySchema),
  missingEvidencePriorities: z.array(prioritySchema),
  warnings: z.array(z.string()),
  sourceRecommendationEngineVersion: z.literal(RECOMMENDATION_ENGINE_VERSION),
  inputHash: z.string().min(1),
  trace: z.custom<PriorityTraceEntry[]>(),
});
export type PriorityResult = z.infer<typeof priorityResultSchema>;
