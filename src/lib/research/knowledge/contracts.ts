import { z } from "zod";

export const RESEARCH_ENGINE_VERSION = "ava-research-knowledge-v1";
export const RESEARCH_SOURCE_VERSION = "ava-research-source-v1";
export const RESEARCH_CLAIM_VERSION = "ava-research-claim-v1";
export const EVIDENCE_LINK_VERSION = "ava-research-evidence-link-v1";
export const CITATION_FORMATTER_VERSION = "ava-citation-v1";

export const sourceTypeSchema = z.enum([
  "peer_reviewed_article", "systematic_review", "meta_analysis", "consensus_statement",
  "textbook", "conference_paper", "dissertation", "preprint",
  "governing_body_guideline", "verified_dataset", "internal_validation_study",
  "internal_discovery", "expert_review", "unknown",
]);
export const studyTypeSchema = z.enum([
  "randomized_controlled_trial", "controlled_trial", "longitudinal_cohort",
  "prospective_cohort", "retrospective_cohort", "cross_sectional", "case_control",
  "case_series", "case_report", "biomechanical_lab_study", "intervention_study",
  "observational_study", "systematic_review", "meta_analysis", "narrative_review",
  "consensus_statement", "validation_study", "reliability_study",
  "machine_learning_study", "qualitative_study", "expert_opinion",
  "internal_analysis", "unknown",
]);
export const reviewStatusSchema = z.enum([
  "unreviewed", "under_review", "changes_requested", "approved_internal",
  "approved_production", "rejected", "archived",
]);
export const ingestionStatusSchema = z.enum([
  "queued", "processing", "needs_metadata", "needs_full_text", "needs_review",
  "approved_internal", "approved_production", "rejected", "archived", "failed",
]);
export const evidenceGradeSchema = z.enum([
  "strong", "moderate", "limited", "preliminary", "heuristic",
  "conflicting", "unavailable",
]);
export const consensusStatusSchema = z.enum([
  "established", "generally_supported", "emerging", "mixed",
  "disputed", "unsupported", "unknown",
]);
export const applicabilitySchema = z.enum([
  "directly_applicable", "broadly_applicable", "partially_applicable",
  "weakly_applicable", "not_applicable", "unknown",
]);
export const claimTypeSchema = z.enum([
  "descriptive", "association", "causal", "intervention_effect", "reliability",
  "validity", "measurement_limitation", "population_norm", "phase_characteristic",
  "training_principle", "safety", "contraindication", "methodological",
  "uncertainty", "expert_practice", "internal_discovery",
]);

const provenanceSchema = z.object({
  submittedBy: z.string().min(1),
  submissionMethod: z.enum([
    "manual_metadata", "doi_metadata", "pubmed_metadata", "licensed_upload",
    "author_manuscript", "open_access_full_text", "internal_document",
  ]),
  metadataRetrievedAt: z.string().datetime().nullable(),
  documentHash: z.string().nullable(),
  syntheticFixture: z.boolean().default(false),
});

export const researchSourceSchema = z.object({
  sourceId: z.string().min(1), sourceType: sourceTypeSchema,
  title: z.string().min(1), authors: z.array(z.string().min(1)),
  publication: z.string().nullable(), publicationYear: z.number().int().min(1800).max(2200).nullable(),
  publicationDate: z.string().nullable(), doi: z.string().nullable(), pmid: z.string().nullable(),
  url: z.string().url().nullable(), externalIdentifiers: z.record(z.string()),
  abstract: z.string().nullable(),
  fullTextAvailability: z.enum(["none", "abstract_only", "licensed", "open_access", "author_manuscript", "internal"]),
  fullTextStorageReference: z.string().nullable(),
  accessStatus: z.enum(["metadata_only", "abstract_only", "full_text", "citation_only", "restricted"]),
  licenseStatus: z.enum(["verified", "restricted", "unknown", "not_applicable"]),
  peerReviewStatus: z.enum(["peer_reviewed", "not_peer_reviewed", "unknown"]),
  studyType: studyTypeSchema, language: z.string().min(2),
  ingestionStatus: ingestionStatusSchema, reviewStatus: reviewStatusSchema,
  supersededBy: z.string().nullable(), retracted: z.boolean(),
  correctionNotice: z.string().nullable(), expressionOfConcern: z.boolean().default(false),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  sourceVersion: z.literal(RESEARCH_SOURCE_VERSION), provenance: provenanceSchema,
});
export type ResearchSource = z.infer<typeof researchSourceSchema>;

export const sourceLinkSchema = z.object({
  evidenceLinkId: z.string().min(1), sourceId: z.string().min(1),
  supportType: z.enum(["supports", "partially_supports", "contextual", "contradicts", "does_not_support", "unclear"]),
  directness: z.enum(["direct", "indirect", "extrapolated", "background_only"]),
});

export const researchClaimSchema = z.object({
  claimId: z.string().min(1), claimKey: z.string().min(1), statement: z.string().min(1),
  normalizedStatement: z.string().min(1), claimType: claimTypeSchema,
  category: z.string().min(1), targetPopulation: z.array(z.string()),
  applicableEvents: z.array(z.string()), applicablePhases: z.array(z.string()),
  applicableMetrics: z.array(z.string()), applicableInterventions: z.array(z.string()),
  outcomeArea: z.string().nullable(),
  direction: z.enum(["positive", "negative", "neutral", "mixed", "unknown"]),
  causalStrength: z.enum(["none", "association_only", "plausible", "supported", "unknown"]),
  evidenceStatus: z.enum(["available", "limited", "conflicting", "unavailable"]),
  evidenceGrade: evidenceGradeSchema, evidenceGradeReasons: z.array(z.string()).min(1),
  consensusStatus: consensusStatusSchema, applicability: applicabilitySchema,
  limitations: z.array(z.string()), excludedConclusions: z.array(z.string()).min(1),
  sourceLinks: z.array(sourceLinkSchema), conflictingSourceLinks: z.array(sourceLinkSchema),
  reviewStatus: reviewStatusSchema, reviewedBy: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(), athleteFacingEligible: z.boolean(),
  coachFacingEligible: z.boolean(), version: z.literal(RESEARCH_CLAIM_VERSION),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type ResearchClaim = z.infer<typeof researchClaimSchema>;

export const evidenceLinkSchema = z.object({
  evidenceLinkId: z.string().min(1), sourceId: z.string().min(1), claimId: z.string().min(1),
  supportType: sourceLinkSchema.shape.supportType, directness: sourceLinkSchema.shape.directness,
  effectDirection: z.enum(["positive", "negative", "null", "mixed", "not_applicable"]),
  statisticalSupport: z.enum(["supported", "partially_supported", "not_supported", "not_reported", "unclear"]),
  extractedResult: z.string().nullable(),
  populationMatch: applicabilitySchema, phaseMatch: applicabilitySchema,
  eventMatch: applicabilitySchema, metricMatch: applicabilitySchema,
  interventionMatch: applicabilitySchema, sampleSize: z.number().int().positive().nullable(),
  effectSize: z.number().finite().nullable(), uncertainty: z.string().nullable(),
  confidenceInterval: z.string().nullable(), pValue: z.number().min(0).max(1).nullable(),
  reliabilityMeasure: z.string().nullable(), limitations: z.array(z.string()),
  extractionMethod: z.enum(["human", "deterministic", "ai_assisted"]),
  extractionConfidence: z.enum(["High", "Moderate", "Low", "Unavailable"]),
  reviewerStatus: reviewStatusSchema, reviewerNotes: z.string().nullable(),
  pageReferences: z.array(z.string()), figureReferences: z.array(z.string()),
  tableReferences: z.array(z.string()), createdAt: z.string().datetime(),
  version: z.literal(EVIDENCE_LINK_VERSION),
});
export type ResearchEvidenceLink = z.infer<typeof evidenceLinkSchema>;

export const citationSchema = z.object({
  citationId: z.string(), sourceId: z.string(), formattedCitation: z.string(),
  shortCitation: z.string(), doi: z.string().nullable(), pmid: z.string().nullable(),
  url: z.string().url().nullable(), accessStatus: researchSourceSchema.shape.accessStatus,
  athleteFacingAllowed: z.boolean(), coachFacingAllowed: z.boolean(),
  pageReferences: z.array(z.string()),
  usageContext: z.enum(["internal_reasoning", "recommendation_support", "coach_report", "athlete_report", "internal_discovery_validation", "benchmark_support"]),
  generatedAt: z.string().datetime(), formatterVersion: z.literal(CITATION_FORMATTER_VERSION),
});
export type ResearchCitation = z.infer<typeof citationSchema>;

export const metricDefinitionSchema = z.object({
  metricKey: z.string(), displayName: z.string(), definition: z.string(), unit: z.string(),
  calculationFamily: z.string(), eventDefinition: z.string(),
  phaseApplicability: z.array(z.string()), knownAliases: z.array(z.string()),
  knownProtocolDifferences: z.array(z.string()), avaContractVersion: z.string(),
  comparabilityRules: z.array(z.string()), limitations: z.array(z.string()),
  evidenceReferences: z.array(z.string()), version: z.string(),
});
export type ResearchMetricDefinition = z.infer<typeof metricDefinitionSchema>;

export const terminologyMappingSchema = z.object({
  originalTerm: z.string(), normalizedKey: z.string(), relationship: z.enum(["exact", "contextual_alias", "related_not_equivalent", "ambiguous"]),
  context: z.string().nullable(), preserveDistinct: z.boolean(), version: z.string(),
});

export const evidenceGradeDecisionSchema = z.object({
  grade: evidenceGradeSchema, reasons: z.array(z.string()).min(1),
  trace: z.array(z.string()).min(1),
});
export const applicabilityDecisionSchema = z.object({
  applicability: applicabilitySchema, reasons: z.array(z.string()).min(1),
  trace: z.array(z.string()).min(1),
});

export const researchRetrievalInputSchema = z.object({
  query: z.string().default(""), category: z.string().nullable().default(null),
  metric: z.string().nullable().default(null), phase: z.string().nullable().default(null),
  event: z.string().nullable().default(null), intervention: z.string().nullable().default(null),
  population: z.array(z.string()).default([]),
  intendedUsage: citationSchema.shape.usageContext,
  minimumEvidenceGrade: evidenceGradeSchema.default("limited"),
  maximumResults: z.number().int().min(1).max(20).default(5),
});
export type ResearchRetrievalInput = z.infer<typeof researchRetrievalInputSchema>;
export const researchRetrievalResultSchema = z.object({
  claims: z.array(z.object({
    claim: researchClaimSchema, evidenceSummary: z.string(),
    applicability: applicabilitySchema, conflictingEvidence: z.array(sourceLinkSchema),
    limitations: z.array(z.string()), citations: z.array(citationSchema),
  })),
  trace: z.array(z.string()), engineVersion: z.literal(RESEARCH_ENGINE_VERSION),
});
export type ResearchRetrievalResult = z.infer<typeof researchRetrievalResultSchema>;

export const reviewAuditEventSchema = z.object({
  eventId: z.string(), entityType: z.enum(["source", "claim", "evidence_link", "citation", "metric_definition", "terminology", "internal_discovery"]),
  entityId: z.string(), action: z.string(), actorId: z.string(),
  fromStatus: z.string().nullable(), toStatus: z.string().nullable(),
  reason: z.string().min(1), createdAt: z.string().datetime(),
});

export const internalDiscoveryProposalSchema = z.object({
  proposalId: z.string(), discoveryId: z.string(), source: researchSourceSchema,
  candidateClaim: researchClaimSchema,
  validationPlan: z.array(z.enum([
    "holdout_dataset", "replication", "statistical_review", "confound_analysis",
    "metric_validity_review", "external_evidence_comparison", "human_expert_review",
  ])).length(7),
  similarClaimIds: z.array(z.string()), supportingEvidenceLinkIds: z.array(z.string()),
  conflictingEvidenceLinkIds: z.array(z.string()), reviewDecision: reviewStatusSchema,
});

export const benchmarkEvidenceFoundationSchema = z.object({
  benchmarkDefinitionId: z.string(), sourceId: z.string(), population: z.array(z.string()),
  event: z.string(), phase: z.string(), measurementMethod: z.string(),
  sampleSize: z.number().int().positive(), unit: z.string(), metricDefinitionKey: z.string(),
  distributionReference: z.string(), uncertainty: z.string(), inclusionCriteria: z.array(z.string()),
  evidenceGrade: evidenceGradeSchema, version: z.string(), approvedForDisplay: z.literal(false),
});

