import {
  RESEARCH_CLAIM_VERSION, researchClaimSchema, researchSourceSchema,
  type ResearchClaim, type ResearchSource,
} from "./contracts";
import { assertSafeResearchLanguage } from "./languageSafety";

export const INGESTION_STAGES = [
  "source_submitted", "metadata_extracted", "duplicate_checked", "access_license_checked",
  "text_extracted", "sections_segmented", "candidate_claims_extracted",
  "candidate_evidence_links_extracted", "metrics_normalized", "applicability_tagged",
  "automated_validation", "human_review", "approved_internal",
  "approved_athlete_facing", "archived_or_rejected",
] as const;

export function createSubmittedSource(source: ResearchSource): ResearchSource {
  const parsed = researchSourceSchema.parse(source);
  if (parsed.reviewStatus === "approved_production")
    throw new Error("Newly submitted sources cannot be automatically production approved.");
  if (parsed.fullTextStorageReference && !["verified", "not_applicable"].includes(parsed.licenseStatus))
    throw new Error("Full-text storage requires a verified license or internal-document status.");
  return parsed;
}

export function createCandidateClaim(input: {
  claimId: string; claimKey: string; statement: string; category: string;
  sourceId: string; createdAt: string;
}): ResearchClaim {
  assertSafeResearchLanguage(input.statement);
  return researchClaimSchema.parse({
    claimId: input.claimId, claimKey: input.claimKey, statement: input.statement,
    normalizedStatement: input.statement.toLowerCase().trim(),
    claimType: "descriptive", category: input.category, targetPopulation: [],
    applicableEvents: [], applicablePhases: [], applicableMetrics: [],
    applicableInterventions: [], outcomeArea: null, direction: "unknown",
    causalStrength: "none", evidenceStatus: "unavailable", evidenceGrade: "unavailable",
    evidenceGradeReasons: ["Candidate extraction requires human review."],
    consensusStatus: "unknown", applicability: "unknown",
    limitations: ["Scope, population, methods, and source context require review."],
    excludedConclusions: ["Candidate claims cannot support production output."],
    sourceLinks: [], conflictingSourceLinks: [], reviewStatus: "unreviewed",
    reviewedBy: null, reviewedAt: null, athleteFacingEligible: false,
    coachFacingEligible: false, version: RESEARCH_CLAIM_VERSION,
    createdAt: input.createdAt, updatedAt: input.createdAt,
  });
}

export type ReviewerRole = "reviewer" | "senior_reviewer" | "research_admin";
export function reviewerCan(role: ReviewerRole, action: "review" | "approve_internal" | "approve_production" | "manage_reviewers"): boolean {
  if (action === "review") return true;
  if (action === "approve_internal") return role !== "reviewer";
  return role === "research_admin";
}

