import type { Recommendation } from "@/lib/intelligence/recommendationEngine";
import type { ResearchRetrievalResult } from "./contracts";

const gradeRank = { unavailable: 0, heuristic: 1, preliminary: 1, conflicting: 1, limited: 2, moderate: 3, strong: 4 };
const interventionRank = { unknown: 0, heuristic: 1, limited: 2, moderate: 3, strong: 4 };
type InterventionGrade = Recommendation["interventionEvidenceQuality"];

export interface ResearchSupportedRecommendation {
  recommendation: Recommendation;
  effectiveInterventionEvidenceQuality: InterventionGrade;
  research: ResearchRetrievalResult["claims"];
  researchWarnings: string[];
}

/** Research can explain or downgrade an existing recommendation. It never creates one or upgrades it. */
export function attachResearchToRecommendation(
  recommendation: Recommendation,
  retrieval: ResearchRetrievalResult,
): ResearchSupportedRecommendation {
  const best = retrieval.claims[0]?.claim.evidenceGrade ?? "unavailable";
  const current = recommendation.interventionEvidenceQuality;
  const effective = gradeRank[best] < interventionRank[current]
    ? (best === "moderate" || best === "limited" || best === "heuristic" ? best : "heuristic")
    : current;
  return {
    recommendation,
    effectiveInterventionEvidenceQuality: effective,
    research: retrieval.claims,
    researchWarnings: [
      ...(!retrieval.claims.length ? ["No eligible reviewed research claim was found; the recommendation remains heuristic or uses its existing lower grade."] : []),
      ...(retrieval.claims.some((item) => item.conflictingEvidence.length) ? ["Conflicting research evidence is recorded."] : []),
    ],
  };
}

export function researchBoundaryForInterpretation(retrieval: ResearchRetrievalResult): {
  eligibleClaims: ResearchRetrievalResult["claims"];
  mayClarifyLimitations: true;
  mayCreateCause: false;
  mayIncreaseBiomechanicsConfidence: false;
} {
  return {
    eligibleClaims: retrieval.claims,
    mayClarifyLimitations: true,
    mayCreateCause: false,
    mayIncreaseBiomechanicsConfidence: false,
  };
}

export function toCoachReportResearchEvidence(
  retrieval: ResearchRetrievalResult,
): Array<{
  claimId: string; evidenceGrade: string; summary: string; applicability: string;
  conflicting: boolean;
  citations: Array<{ shortCitation: string; formattedCitation: string; url: string | null }>;
}> {
  return retrieval.claims.map((item) => ({
    claimId: item.claim.claimId, evidenceGrade: item.claim.evidenceGrade,
    summary: item.evidenceSummary, applicability: item.applicability,
    conflicting: item.conflictingEvidence.length > 0,
    citations: item.citations.map(({ shortCitation, formattedCitation, url }) => ({
      shortCitation, formattedCitation, url,
    })),
  }));
}
