import { z } from "zod";
import { athleteDigitalTwinSchema } from "@/lib/digitalTwin";
import { interpretationResultSchema, sprintPhaseSchema } from "@/lib/intelligence/interpretations";

export const ROOT_CAUSE_ENGINE_VERSION = "ava-root-cause-intelligence-v1";
export const ROOT_CAUSE_STATE_VERSION = "ava-root-cause-state-v1";
export const ROOT_CAUSE_TAXONOMY_VERSION = "ava-root-cause-taxonomy-v1";

export const limiterKeySchema = z.enum([
  "force_production", "projection_mechanics", "front_side_organization",
  "back_side_dominance", "pelvic_control", "posture", "hip_mobility",
  "ankle_stiffness", "ground_contact_quality", "elastic_return", "stride_rhythm",
  "arm_timing", "trunk_stability", "coordination", "relaxation", "symmetry",
  "acceleration_mechanics", "maximum_velocity_mechanics", "transition_mechanics",
  "deceleration_control", "unknown",
]);
export const symptomRelationshipSchema = z.enum([
  "root_cause", "primary_symptom", "secondary_symptom", "likely_consequence",
  "independent_finding", "unknown_relationship",
]);
export const hypothesisStatusSchema = z.enum([
  "possible", "supported_limiter", "insufficient_evidence", "conflicting",
  "coach_confirmed", "coach_rejected", "unknown",
]);
export const rootCauseEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceType: z.enum([
    "observation", "interpretation", "digital_twin", "benchmark", "projection",
    "research", "mechanical_fingerprint", "archetype", "coach_feedback", "season",
  ]),
  sourceVersion: z.string().min(1), structuredLabel: z.string().min(1),
  relationship: z.enum(["supports", "contradicts", "contextual", "unknown"]),
  confidence: z.number().min(0).max(1), validated: z.literal(true),
});
export type RootCauseEvidence = z.infer<typeof rootCauseEvidenceSchema>;

export const rootCauseCandidateSchema = z.object({
  candidateId: z.string(), limiterKey: limiterKeySchema,
  description: z.string().min(1), linkedInterpretationIds: z.array(z.string()).min(1),
  supportingEvidence: z.array(rootCauseEvidenceSchema),
  contradictingEvidence: z.array(rootCauseEvidenceSchema),
  historicalEvidence: z.array(rootCauseEvidenceSchema),
  researchEvidence: z.array(rootCauseEvidenceSchema),
  benchmarkEvidence: z.array(rootCauseEvidenceSchema),
  projectionEvidence: z.array(rootCauseEvidenceSchema),
  observationConsistency: z.number().min(0).max(1),
  historicalStability: z.number().min(0).max(1),
  researchQuality: z.number().min(0).max(1),
  benchmarkSimilarity: z.number().min(0).max(1),
  coachConfirmation: z.enum(["none", "confirm", "reject", "downgrade", "upgrade", "unknown"]),
  unknownVariables: z.array(z.string()), missingEvidence: z.array(z.string()),
  applicablePhases: z.array(sprintPhaseSchema).min(1),
}).superRefine((candidate, ctx) => {
  if (candidate.researchQuality > 0 && !candidate.researchEvidence.length)
    ctx.addIssue({ code: "custom", path: ["researchEvidence"], message: "Research quality requires reviewed evidence identity." });
  if (candidate.benchmarkSimilarity > 0 && !candidate.benchmarkEvidence.length)
    ctx.addIssue({ code: "custom", path: ["benchmarkEvidence"], message: "Benchmark similarity requires comparison identity." });
});
export type RootCauseCandidate = z.infer<typeof rootCauseCandidateSchema>;

export const causalEdgeSchema = z.object({
  edgeId: z.string(), sourceLimiter: limiterKeySchema, targetLimiter: limiterKeySchema,
  relationship: z.enum(["possible_precursor", "possible_downstream", "contextual", "unknown"]),
  confidence: z.number().min(0).max(1), evidence: z.array(rootCauseEvidenceSchema).min(1),
  historicalSupport: z.array(rootCauseEvidenceSchema),
  researchSupport: z.array(rootCauseEvidenceSchema),
  unknownVariables: z.array(z.string()), sourceVersion: z.string(),
});
export const coachRootCauseActionSchema = z.object({
  actionId: z.string(), candidateId: z.string(),
  action: z.enum(["confirm", "reject", "merge", "split", "downgrade", "upgrade", "unknown"]),
  relatedCandidateIds: z.array(z.string()), reasonCode: z.enum([
    "coach_observation", "athlete_context", "historical_response", "measurement_concern",
    "manual_review",
  ]),
  createdAt: z.string().datetime(), sourceVersion: z.string(),
});

export const rootCauseInputSchema = z.object({
  rootCauseStateId: z.string(), athleteId: z.string(), generatedAt: z.string().datetime(),
  interpretations: interpretationResultSchema, digitalTwin: athleteDigitalTwinSchema,
  candidates: z.array(rootCauseCandidateSchema), causalEdges: z.array(causalEdgeSchema),
  coachActions: z.array(coachRootCauseActionSchema),
  measurementQuality: z.number().min(0).max(1),
  phase: sprintPhaseSchema, seasonPhase: z.string(), competitionPhase: z.string(),
  observationHistoryVersion: z.string(), interpretationHistoryVersion: z.string(),
  researchVersion: z.string().nullable(), benchmarkVersion: z.string().nullable(),
  projectionVersion: z.string().nullable(), unknownVariables: z.array(z.string()),
}).superRefine((input, ctx) => {
  if (input.digitalTwin.athleteId !== input.athleteId)
    ctx.addIssue({ code: "custom", path: ["digitalTwin"], message: "Digital Twin athlete mismatch." });
  const interpretationIds = new Set([
    ...input.interpretations.interpretations,
    ...input.interpretations.unavailableInterpretations,
    ...input.interpretations.contradictedInterpretations,
  ].map((item) => item.id));
  const candidateIds = new Set(input.candidates.map((item) => item.candidateId));
  if (candidateIds.size !== input.candidates.length)
    ctx.addIssue({ code: "custom", path: ["candidates"], message: "Candidate IDs must be unique." });
  for (const candidate of input.candidates)
    for (const id of candidate.linkedInterpretationIds)
      if (!interpretationIds.has(id))
        ctx.addIssue({ code: "custom", path: ["candidates"], message: `Missing interpretation: ${id}` });
  for (const action of input.coachActions)
    if (!candidateIds.has(action.candidateId))
      ctx.addIssue({ code: "custom", path: ["coachActions"], message: `Missing coach-action candidate: ${action.candidateId}` });
});
export type RootCauseInput = z.input<typeof rootCauseInputSchema>;

export const confidenceComponentSchema = z.object({
  component: z.string(), rawValue: z.number().min(0).max(1),
  weight: z.number().min(0).max(1), weightedValue: z.number(),
  sourceIds: z.array(z.string()),
});
export const evidenceRequestSchema = z.object({
  requestId: z.string(), candidateId: z.string(),
  type: z.enum([
    "additional_fly_sprint", "additional_acceleration_trial", "side_view_recording",
    "higher_fps_recording", "repeated_session", "coach_review", "manual_tagging",
    "benchmark_comparison",
  ]),
  reason: z.string(), resolvesUnknowns: z.array(z.string()),
  priority: z.enum(["high", "moderate", "low"]),
  isRecommendation: z.literal(false),
});
export const rootCauseHypothesisSchema = z.object({
  hypothesisId: z.string(), candidateId: z.string(), limiterKey: limiterKeySchema,
  description: z.string(), status: hypothesisStatusSchema,
  supportingEvidence: z.array(rootCauseEvidenceSchema),
  contradictingEvidence: z.array(rootCauseEvidenceSchema),
  historicalEvidence: z.array(rootCauseEvidenceSchema),
  benchmarkSupport: z.array(rootCauseEvidenceSchema),
  researchSupport: z.array(rootCauseEvidenceSchema),
  confidence: z.number().min(0).max(1),
  confidenceComponents: z.array(confidenceComponentSchema),
  unknownVariables: z.array(z.string()), missingEvidence: z.array(z.string()),
  explanation: z.string(), invalidationConditions: z.array(z.string()),
});
export type RootCauseHypothesis = z.infer<typeof rootCauseHypothesisSchema>;

export const rootCauseStateSchema = z.object({
  rootCauseStateId: z.string(), athleteId: z.string(),
  engineVersion: z.literal(ROOT_CAUSE_ENGINE_VERSION),
  stateVersion: z.literal(ROOT_CAUSE_STATE_VERSION),
  taxonomyVersion: z.literal(ROOT_CAUSE_TAXONOMY_VERSION),
  generatedAt: z.string().datetime(), inputFingerprint: z.string(),
  rootCauseHypotheses: z.array(rootCauseHypothesisSchema),
  confirmedLimiters: z.array(rootCauseHypothesisSchema),
  possibleLimiters: z.array(rootCauseHypothesisSchema),
  secondarySymptoms: z.array(z.object({
    interpretationId: z.string(), relationship: symptomRelationshipSchema,
    linkedHypothesisIds: z.array(z.string()), reason: z.string(),
  })),
  downstreamConsequences: z.array(z.object({
    sourceLimiter: limiterKeySchema, targetLimiter: limiterKeySchema,
    edgeId: z.string(), confidence: z.number().min(0).max(1),
  })),
  dependencyNetwork: z.array(causalEdgeSchema),
  competingHypotheses: z.array(z.object({
    hypothesisId: z.string(), rank: z.number().int().positive(),
    relativeSupport: z.number().min(0).max(1),
  })),
  confidence: z.object({
    score: z.number().min(0).max(100),
    level: z.enum(["High", "Moderate", "Low", "Insufficient"]),
    limitingFactors: z.array(z.string()),
  }),
  unknownVariables: z.array(z.string()), requiredEvidence: z.array(evidenceRequestSchema),
  supportingResearch: z.array(rootCauseEvidenceSchema),
  supportingBenchmarks: z.array(rootCauseEvidenceSchema),
  historicalSupport: z.array(rootCauseEvidenceSchema),
  coachOverrides: z.array(coachRootCauseActionSchema),
  trace: z.array(z.object({
    candidateId: z.string(), ruleVersion: z.string(),
    interpretationIds: z.array(z.string()),
    evidenceIds: z.array(z.string()), confidenceComponents: z.array(confidenceComponentSchema),
    unknownPenalty: z.number().min(0).max(1), finalConfidence: z.number().min(0).max(1),
    finalStatus: hypothesisStatusSchema,
  })),
  invalidationContext: z.object({
    twinUpdatedAt: z.string().datetime(), interpretationInputHash: z.string(),
    observationHistoryVersion: z.string(), interpretationHistoryVersion: z.string(),
    researchVersion: z.string().nullable(), benchmarkVersion: z.string().nullable(),
    projectionVersion: z.string().nullable(), coachActionIds: z.array(z.string()),
  }),
  computePolicy: z.object({
    evaluatedOn: z.literal("server"), servedFromCache: z.literal(true),
    offlineCompatible: z.literal(true), externalModelCalls: z.literal(0),
    deterministic: z.literal(true),
  }),
});
export type RootCauseState = z.infer<typeof rootCauseStateSchema>;

export const offlineRootCauseCacheSchema = z.object({
  cacheVersion: z.literal("ava-offline-root-cause-cache-v1"),
  athleteId: z.string(), state: rootCauseStateSchema, syncedAt: z.string().datetime(),
  queuedFeedbackActions: z.array(coachRootCauseActionSchema),
});
