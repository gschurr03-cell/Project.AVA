import { z } from "zod";
import { athleteDigitalTwinSchema } from "@/lib/digitalTwin";
import {
  RECOMMENDATION_LIBRARY_VERSION, recommendationInputSchema, recommendationResultSchema,
} from "@/lib/intelligence/recommendationEngine/contracts";
import {
  ROOT_CAUSE_TAXONOMY_VERSION, evidenceRequestSchema, limiterKeySchema,
  rootCauseStateSchema,
} from "@/lib/rootCause";

export const ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION = "ava-root-cause-recommendation-adapter-v1";
export const ROOT_CAUSE_RECOMMENDATION_CONTEXT_VERSION = "ava-root-cause-recommendation-context-v1";
export const ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION = "ava-root-cause-recommendation-mappings-v1";
export const rolloutModeSchema=z.enum(["OFF","SHADOW","ADVISORY","BOUNDED_INFLUENCE"]);
export const relationshipTypeSchema=z.enum([
  "ROOT_CAUSE_TARGET","SYMPTOM_MANAGEMENT","DOWNSTREAM_CONSEQUENCE_SUPPORT",
  "MAINTENANCE_SUPPORT","MONITORING_ONLY","POSSIBLE_RELATIONSHIP",
  "CONFLICTING_RELATIONSHIP","UNRELATED","UNKNOWN",
]);
export const mappingStatusSchema=z.enum([
  "DRAFT","SHADOW_VALIDATED","ADVISORY_APPROVED","BOUNDED_INFLUENCE_APPROVED",
  "DEPRECATED","DISABLED",
]);
export const explanationTemplateKeySchema=z.enum([
  "ROOT_CAUSE_CONTEXT","SYMPTOM_CONTEXT","CONSEQUENCE_CONTEXT",
  "COMPETING_HYPOTHESIS_CONTEXT","LOW_CONFIDENCE_CONTEXT",
  "CONFLICTING_EVIDENCE_CONTEXT","UNMAPPED_CONTEXT","EVIDENCE_REQUEST_CONTEXT",
  "COACH_CONFIRMED_CONTEXT","COACH_REJECTED_CONTEXT","SHADOW_ONLY_CONTEXT",
]);
export const mappingEntrySchema=z.object({
  mappingId:z.string(),mappingVersion:z.string(),
  rootCauseLimiterKey:limiterKeySchema,recommendationCatalogEntryId:z.string(),
  relationshipType:relationshipTypeSchema,
  requiredRootCauseConfidence:z.number().min(0).max(1),
  requiredMappingConfidence:z.number().min(0).max(1),
  mappingConfidence:z.number().min(0).max(1),
  requiredEvidenceQuality:z.enum(["strong","moderate","limited","heuristic"]),
  allowedRolloutModes:z.array(rolloutModeSchema),
  maximumPositiveModifier:z.number().min(0).max(.2),
  maximumNegativeModifier:z.number().min(-.2).max(0),
  seasonApplicability:z.array(z.string()).min(1),
  competitionApplicability:z.array(z.string()).min(1),
  athleteStageApplicability:z.array(z.string()).min(1),
  eventApplicability:z.array(z.string()).min(1),
  contraindications:z.array(z.string()),
  requiredSupportingEvidenceTypes:z.array(z.string()),
  disallowedUnknownStates:z.array(z.string()),
  explanationTemplateKey:explanationTemplateKeySchema,status:mappingStatusSchema,
  reviewedBy:z.string().nullable(),reviewedAt:z.string().datetime().nullable(),
  effectiveFrom:z.string().datetime(),deprecatedAt:z.string().datetime().nullable(),
  notes:z.array(z.string()),
});
export type MappingEntry=z.infer<typeof mappingEntrySchema>;

export const adapterInputSchema=z.object({
  athleteId:z.string(),analysisId:z.string(),workingAnalysisId:z.string().nullable(),
  savedVersionId:z.string().nullable(),rootCauseState:rootCauseStateSchema,
  recommendationInput:recommendationInputSchema,
  baselineRecommendationResult:recommendationResultSchema,
  recommendationCatalogVersion:z.literal(RECOMMENDATION_LIBRARY_VERSION),
  rootCauseTaxonomyVersion:z.literal(ROOT_CAUSE_TAXONOMY_VERSION),
  mappingRegistryVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION),
  adapterVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION),
  rolloutMode:rolloutModeSchema,
  featureFlags:z.object({enabled:z.boolean(),persistenceEnabled:z.boolean(),shadowMetricsEnabled:z.boolean()}),
  seasonContext:z.object({stage:z.string(),version:z.string()}),
  competitionContext:z.object({phase:z.string(),version:z.string()}),
  athleteProfile:z.object({stage:z.string(),event:z.string().nullable(),version:z.string()}),
  measurementQuality:z.number().min(0).max(1),
  digitalTwinReference:athleteDigitalTwinSchema,
  sourceProvenance:z.object({
    rootCauseFingerprint:z.string(),recommendationInputHash:z.string(),
    researchVersion:z.string().nullable(),benchmarkVersion:z.string().nullable(),
    recommendationOverrideIds:z.array(z.string()),
  }),
  generatedAt:z.string().datetime(),
}).superRefine((input,ctx)=>{
  if(input.rootCauseState.athleteId!==input.athleteId||input.digitalTwinReference.athleteId!==input.athleteId)
    ctx.addIssue({code:"custom",path:["athleteId"],message:"Adapter athlete identity mismatch."});
  if(input.rootCauseState.inputFingerprint!==input.sourceProvenance.rootCauseFingerprint)
    ctx.addIssue({code:"custom",path:["sourceProvenance"],message:"RootCauseState fingerprint mismatch."});
  if(input.baselineRecommendationResult.analysisId!==input.analysisId||
    input.recommendationInput.context.analysisId!==input.analysisId)
    ctx.addIssue({code:"custom",path:["analysisId"],message:"Recommendation analysis mismatch."});
});
export type RootCauseRecommendationAdapterInput=z.input<typeof adapterInputSchema>;

export const gateComponentSchema=z.object({
  component:z.string(),value:z.number().min(0).max(1),threshold:z.number().min(0).max(1),
  passed:z.boolean(),sourceIds:z.array(z.string()),
});
export const recommendationContextSchema=z.object({
  recommendationId:z.string(),catalogEntryId:z.string(),relationshipType:relationshipTypeSchema,
  rootCauseHypothesisIds:z.array(z.string()),limiterKeys:z.array(limiterKeySchema),
  supportingEvidenceIds:z.array(z.string()),contradictingEvidenceIds:z.array(z.string()),
  rootCauseConfidence:z.number().min(0).max(1),mappingConfidence:z.number().min(0).max(1),
  combinedContextConfidence:z.number().min(0).max(1),
  competingHypotheses:z.array(z.string()),unknownVariables:z.array(z.string()),
  evidenceRequests:z.array(evidenceRequestSchema),
  proposedRelevanceModifier:z.number().min(-.2).max(.2),
  appliedRelevanceModifier:z.number().min(-.2).max(.2),
  influenceReason:z.string(),rolloutMode:rolloutModeSchema,wordingContext:z.string(),
  safetyStatus:z.enum(["baseline_authoritative","protected","influence_allowed","withheld"]),
  traceIds:z.array(z.string()),modifierAlreadyApplied:z.boolean(),
});
export type RootCauseRecommendationContextItem=z.infer<typeof recommendationContextSchema>;
export const mappingDecisionSchema=z.object({
  mappingId:z.string(),hypothesisId:z.string(),recommendationId:z.string().nullable(),
  accepted:z.boolean(),reason:z.string(),relationshipType:relationshipTypeSchema,
  confidenceComponents:z.array(gateComponentSchema),includedEvidenceIds:z.array(z.string()),
  excludedEvidenceIds:z.array(z.string()),proposedModifier:z.number(),
  mappingClampedModifier:z.number(),globalClampedModifier:z.number(),appliedModifier:z.number(),
  safetyChecks:z.array(z.string()),ambiguous:z.boolean(),
});
export const shadowComparisonSchema=z.object({
  comparisonId:z.string(),athleteId:z.string(),analysisId:z.string(),
  baselineRecommendationIds:z.array(z.string()),baselineScores:z.record(z.number()),
  proposedRecommendationIds:z.array(z.string()),proposedScores:z.record(z.number()),
  scoreDeltas:z.record(z.number()),contextDifferences:z.array(z.string()),
  mappingIds:z.array(z.string()),hypothesisIds:z.array(z.string()),
  safetyDifferences:z.array(z.string()),orderingDifferences:z.array(z.string()),
  generatedAt:z.string().datetime(),adapterVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION),
  mappingRegistryVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION),
});
export const adapterContextSchema=z.object({
  contextId:z.string(),athleteId:z.string(),analysisId:z.string(),
  adapterVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION),
  contextVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_CONTEXT_VERSION),
  mappingRegistryVersion:z.literal(ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION),
  rolloutMode:rolloutModeSchema,generatedAt:z.string().datetime(),
  rootCauseStateId:z.string(),recommendationCatalogVersion:z.string(),
  candidateMappings:z.array(mappingDecisionSchema),appliedMappings:z.array(mappingDecisionSchema),
  rejectedMappings:z.array(mappingDecisionSchema),unmappedHypotheses:z.array(z.string()),
  ambiguousMappings:z.array(mappingDecisionSchema),
  recommendationContexts:z.array(recommendationContextSchema),
  proposedInfluence:z.record(z.number()),appliedInfluence:z.record(z.number()),
  competingHypotheses:z.array(z.string()),unknownVariables:z.array(z.string()),
  evidenceRequests:z.array(evidenceRequestSchema),safetyDecisions:z.array(z.string()),
  trace:z.array(z.object({
    traceId:z.string(),mappingId:z.string(),hypothesisId:z.string(),
    recommendationId:z.string().nullable(),mappingStatus:mappingStatusSchema,
    confidenceComponents:z.array(gateComponentSchema),thresholdsEvaluated:z.array(z.string()),
    evidenceIncluded:z.array(z.string()),evidenceExcluded:z.array(z.string()),
    contradictions:z.array(z.string()),unknowns:z.array(z.string()),
    proposedModifier:z.number(),appliedModifier:z.number(),clampBehavior:z.array(z.string()),
    safetyChecks:z.array(z.string()),rolloutMode:rolloutModeSchema,
  })),
  provenance:z.object({
    rootCauseFingerprint:z.string(),recommendationInputHash:z.string(),
    digitalTwinUpdatedAt:z.string().datetime(),researchVersion:z.string().nullable(),
    benchmarkVersion:z.string().nullable(),recommendationOverrideIds:z.array(z.string()),
    modifierConsumer:z.literal("root_cause_recommendation_adapter"),
    downstreamReapplicationAllowed:z.literal(false),
  }),
  invalidationFingerprint:z.string(),shadowComparison:shadowComparisonSchema.nullable(),
  failClosed:z.boolean(),failClosedReasons:z.array(z.string()),
  computePolicy:z.object({
    evaluatedOn:z.literal("server"),servedFromCache:z.literal(true),
    offlineCompatible:z.literal(true),externalModelCalls:z.literal(0),deterministic:z.literal(true),
  }),
});
export type RootCauseRecommendationContext=z.infer<typeof adapterContextSchema>;
export const offlineAdapterCacheSchema=z.object({
  cacheVersion:z.literal("ava-offline-root-cause-recommendation-v1"),
  athleteId:z.string(),context:adapterContextSchema,recommendationIds:z.array(z.string()),
  syncedAt:z.string().datetime(),readOnlyComputedState:z.literal(true),
});
