import type { Discovery } from "@/lib/research/discovery";
import {
  RESEARCH_CLAIM_VERSION, RESEARCH_SOURCE_VERSION,
  type ResearchClaim, type ResearchSource,
} from "./contracts";

export function proposeClaimFromDiscovery(discovery: Discovery, now: string): {
  source: ResearchSource; claim: ResearchClaim; validationPlan: string[];
} {
  const sourceId = `internal-discovery:${discovery.id}`;
  const source: ResearchSource = {
    sourceId, sourceType: "internal_discovery", title: `AVA internal discovery: ${discovery.title}`,
    authors: ["AVA Biomechanics Discovery Engine"], publication: null,
    publicationYear: new Date(now).getUTCFullYear(), publicationDate: now.slice(0, 10),
    doi: null, pmid: null, url: null, externalIdentifiers: { discoveryId: discovery.id },
    abstract: discovery.description, fullTextAvailability: "internal",
    fullTextStorageReference: null, accessStatus: "restricted", licenseStatus: "not_applicable",
    peerReviewStatus: "not_peer_reviewed", studyType: "internal_analysis", language: "en",
    ingestionStatus: "needs_review", reviewStatus: "unreviewed", supersededBy: null,
    retracted: false, correctionNotice: null, expressionOfConcern: false,
    createdAt: now, updatedAt: now, sourceVersion: RESEARCH_SOURCE_VERSION,
    provenance: {
      submittedBy: "ava-discovery-engine", submissionMethod: "internal_document",
      metadataRetrievedAt: now, documentHash: discovery.id, syntheticFixture: false,
    },
  };
  const claim: ResearchClaim = {
    claimId: `candidate:${discovery.id}`, claimKey: `internal_${discovery.id}`,
    statement: discovery.description, normalizedStatement: discovery.description.toLowerCase(),
    claimType: "internal_discovery", category: discovery.discoveryType,
    targetPopulation: ["internal_cohort"], applicableEvents: [], applicablePhases: [],
    applicableMetrics: discovery.metricsUsed, applicableInterventions: [], outcomeArea: null,
    direction: "unknown", causalStrength: "none", evidenceStatus: "limited",
    evidenceGrade: "preliminary", evidenceGradeReasons: ["Internal exploratory discovery only."],
    consensusStatus: "unknown", applicability: "unknown",
    limitations: ["Requires holdout validation and external evidence comparison."],
    excludedConclusions: ["Does not establish causation.", "Does not support athlete advice."],
    sourceLinks: [], conflictingSourceLinks: [], reviewStatus: "unreviewed",
    reviewedBy: null, reviewedAt: null, athleteFacingEligible: false,
    coachFacingEligible: false, version: RESEARCH_CLAIM_VERSION, createdAt: now, updatedAt: now,
  };
  return {
    source, claim,
    validationPlan: ["holdout_dataset", "replication", "statistical_review", "confound_analysis", "metric_validity_review", "external_evidence_comparison", "human_expert_review"],
  };
}

