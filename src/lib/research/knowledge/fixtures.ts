import {
  EVIDENCE_LINK_VERSION, RESEARCH_CLAIM_VERSION, RESEARCH_SOURCE_VERSION,
  type ResearchClaim, type ResearchEvidenceLink, type ResearchSource,
} from "./contracts";

const now = "2026-07-17T12:00:00.000Z";
const source = (overrides: Partial<ResearchSource> & Pick<ResearchSource, "sourceId" | "title">): ResearchSource => {
  const { sourceId, title, ...rest } = overrides;
  return {
  sourceId, sourceType: "peer_reviewed_article", title,
  authors: ["Synthetic Author"], publication: "Synthetic Journal", publicationYear: 2024,
  publicationDate: "2024-01-01", doi: `10.0000/${overrides.sourceId}`, pmid: null,
  url: `https://example.invalid/${overrides.sourceId}`, externalIdentifiers: {},
  abstract: "Synthetic fixture. Not genuine academic evidence.",
  fullTextAvailability: "licensed", fullTextStorageReference: null, accessStatus: "full_text",
  licenseStatus: "verified", peerReviewStatus: "peer_reviewed",
  studyType: "biomechanical_lab_study", language: "en",
  ingestionStatus: "approved_production", reviewStatus: "approved_production",
  supersededBy: null, retracted: false, correctionNotice: null, expressionOfConcern: false,
  createdAt: now, updatedAt: now, sourceVersion: RESEARCH_SOURCE_VERSION,
  provenance: {
    submittedBy: "synthetic-fixture", submissionMethod: "manual_metadata",
    metadataRetrievedAt: now, documentHash: `hash-${overrides.sourceId}`, syntheticFixture: true,
  },
  ...rest,
};};
const claim = (overrides: Partial<ResearchClaim> & Pick<ResearchClaim, "claimId" | "claimKey" | "statement">): ResearchClaim => {
  const { claimId, claimKey, statement, ...rest } = overrides;
  return {
  claimId, claimKey, statement,
  normalizedStatement: statement.toLowerCase(), claimType: "association",
  category: "contact_mechanics", targetPopulation: ["trained_sprinters"],
  applicableEvents: ["100m"], applicablePhases: ["maximum_velocity"],
  applicableMetrics: ["groundContactTimeMs"], applicableInterventions: [],
  outcomeArea: "maximum_velocity", direction: "negative", causalStrength: "association_only",
  evidenceStatus: "available", evidenceGrade: "moderate",
  evidenceGradeReasons: ["Synthetic reviewed fixture."], consensusStatus: "generally_supported",
  applicability: "broadly_applicable", limitations: ["Synthetic fixture only."],
  excludedConclusions: ["Does not establish that shorter contact is universally better."],
  sourceLinks: [], conflictingSourceLinks: [], reviewStatus: "approved_production",
  reviewedBy: "synthetic-reviewer", reviewedAt: now, athleteFacingEligible: true,
  coachFacingEligible: true, version: RESEARCH_CLAIM_VERSION, createdAt: now, updatedAt: now,
  ...rest,
};};
const link = (overrides: Partial<ResearchEvidenceLink> & Pick<ResearchEvidenceLink, "evidenceLinkId" | "sourceId" | "claimId">): ResearchEvidenceLink => {
  const { evidenceLinkId, sourceId, claimId, ...rest } = overrides;
  return {
  evidenceLinkId, sourceId, claimId,
  supportType: "supports", directness: "direct", effectDirection: "negative",
  statisticalSupport: "supported", extractedResult: "Synthetic result.", populationMatch: "directly_applicable",
  phaseMatch: "directly_applicable", eventMatch: "broadly_applicable",
  metricMatch: "directly_applicable", interventionMatch: "unknown", sampleSize: 24,
  effectSize: null, uncertainty: null, confidenceInterval: null, pValue: null,
  reliabilityMeasure: null, limitations: ["Synthetic fixture only."], extractionMethod: "human",
  extractionConfidence: "High", reviewerStatus: "approved_production",
  reviewerNotes: "Synthetic fixture.", pageReferences: ["p. 1"], figureReferences: [],
  tableReferences: [], createdAt: now, version: EVIDENCE_LINK_VERSION, ...rest,
};};

export const SYNTHETIC_RESEARCH_SOURCES: ResearchSource[] = [
  source({ sourceId: "synthetic-direct", title: "Synthetic direct support" }),
  source({ sourceId: "synthetic-indirect", title: "Synthetic moderate indirect support", studyType: "observational_study" }),
  source({ sourceId: "synthetic-small", title: "Synthetic limited small sample" }),
  source({ sourceId: "synthetic-conflict", title: "Synthetic conflicting result" }),
  source({ sourceId: "synthetic-retracted", title: "Synthetic retracted source", retracted: true }),
  source({ sourceId: "synthetic-corrected", title: "Synthetic corrected source", correctionNotice: "Synthetic correction." }),
  source({ sourceId: "synthetic-abstract", title: "Synthetic abstract-only source", fullTextAvailability: "abstract_only", accessStatus: "abstract_only" }),
  source({ sourceId: "synthetic-licensed", title: "Synthetic licensed full text" }),
  source({ sourceId: "synthetic-internal", title: "Synthetic internal discovery", sourceType: "internal_discovery", studyType: "internal_analysis", peerReviewStatus: "not_peer_reviewed", reviewStatus: "under_review", ingestionStatus: "needs_review", accessStatus: "restricted", licenseStatus: "not_applicable" }),
  source({ sourceId: "synthetic-validation", title: "Synthetic internal validation study", sourceType: "internal_validation_study", studyType: "validation_study" }),
  source({ sourceId: "synthetic-preprint", title: "Synthetic duplicate publication", sourceType: "preprint", peerReviewStatus: "not_peer_reviewed", reviewStatus: "approved_internal", ingestionStatus: "approved_internal", doi: null }),
  source({ sourceId: "synthetic-publication", title: "Synthetic duplicate publication" }),
  source({ sourceId: "synthetic-missing", title: "Synthetic missing metadata", publication: null, publicationYear: null, doi: null, ingestionStatus: "needs_metadata", reviewStatus: "unreviewed" }),
];
export const SYNTHETIC_RESEARCH_CLAIMS: ResearchClaim[] = [
  claim({
    claimId: "claim-contact", claimKey: "contact_velocity_association",
    statement: "Shorter contact times have been associated with higher maximum velocity in some trained-sprinter cohorts.",
    sourceLinks: [{ evidenceLinkId: "link-direct", sourceId: "synthetic-direct", supportType: "supports", directness: "direct" }],
    conflictingSourceLinks: [{ evidenceLinkId: "link-conflict", sourceId: "synthetic-conflict", supportType: "contradicts", directness: "direct" }],
  }),
  claim({ claimId: "claim-internal", claimKey: "internal_candidate", statement: "An internal exploratory cadence pattern was observed.", claimType: "internal_discovery", evidenceGrade: "preliminary", consensusStatus: "unknown", reviewStatus: "under_review", athleteFacingEligible: false, coachFacingEligible: false }),
  claim({ claimId: "claim-rejected", claimKey: "rejected", statement: "Rejected synthetic candidate.", reviewStatus: "rejected", athleteFacingEligible: false, coachFacingEligible: false }),
  claim({ claimId: "claim-superseded", claimKey: "superseded", statement: "Superseded synthetic claim.", reviewStatus: "archived", athleteFacingEligible: false, coachFacingEligible: false }),
];
export const SYNTHETIC_EVIDENCE_LINKS: ResearchEvidenceLink[] = [
  link({ evidenceLinkId: "link-direct", sourceId: "synthetic-direct", claimId: "claim-contact" }),
  link({ evidenceLinkId: "link-indirect", sourceId: "synthetic-indirect", claimId: "claim-contact", directness: "indirect", supportType: "partially_supports" }),
  link({ evidenceLinkId: "link-conflict", sourceId: "synthetic-conflict", claimId: "claim-contact", supportType: "contradicts", effectDirection: "null" }),
  link({ evidenceLinkId: "link-retracted", sourceId: "synthetic-retracted", claimId: "claim-contact" }),
  link({ evidenceLinkId: "link-abstract", sourceId: "synthetic-abstract", claimId: "claim-contact", extractionConfidence: "Low" }),
];
export const SYNTHETIC_RESEARCH_SCENARIOS = [
  "strong_direct_support", "moderate_indirect_support", "limited_small_sample",
  "conflicting_sources", "retracted_source", "corrected_source", "abstract_only_source",
  "licensed_full_text", "metric_definition_mismatch", "population_mismatch",
  "phase_mismatch", "internal_preliminary_discovery", "internal_validation_study",
  "production_approved_claim", "internal_only_claim", "rejected_claim",
  "superseded_claim", "duplicate_preprint_and_publication", "missing_metadata",
  "no_eligible_evidence",
] as const;
