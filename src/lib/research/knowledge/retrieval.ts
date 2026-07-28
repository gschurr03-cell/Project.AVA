import {
  RESEARCH_ENGINE_VERSION, researchRetrievalInputSchema, researchRetrievalResultSchema,
  type ResearchClaim, type ResearchEvidenceLink, type ResearchRetrievalInput,
  type ResearchRetrievalResult, type ResearchSource,
} from "./contracts";
import { formatCitation } from "./citations";
import { gradeApplicability } from "./grading";
import { assertSafeResearchLanguage } from "./languageSafety";

const gradeRank = { unavailable: 0, heuristic: 1, preliminary: 2, conflicting: 2, limited: 3, moderate: 4, strong: 5 };
const applicabilityRank = { not_applicable: 0, unknown: 1, weakly_applicable: 2, partially_applicable: 3, broadly_applicable: 4, directly_applicable: 5 };

export interface ResearchCatalog {
  sources: ResearchSource[];
  claims: ResearchClaim[];
  evidenceLinks: ResearchEvidenceLink[];
}

export function retrieveResearch(raw: ResearchRetrievalInput, catalog: ResearchCatalog): ResearchRetrievalResult {
  const input = researchRetrievalInputSchema.parse(raw);
  const sourceById = new Map(catalog.sources.map((source) => [source.sourceId, source]));
  const strict = ["athlete_report", "coach_report", "recommendation_support", "benchmark_support"].includes(input.intendedUsage);
  const trace: string[] = [];
  const candidates = catalog.claims.flatMap((claim) => {
    if (strict && claim.reviewStatus !== "approved_production") {
      trace.push(`${claim.claimId}:excluded:not_production_approved`); return [];
    }
    if (input.intendedUsage === "athlete_report" && !claim.athleteFacingEligible) {
      trace.push(`${claim.claimId}:excluded:not_athlete_eligible`); return [];
    }
    if (input.intendedUsage === "coach_report" && !claim.coachFacingEligible) {
      trace.push(`${claim.claimId}:excluded:not_coach_eligible`); return [];
    }
    if (gradeRank[claim.evidenceGrade] < gradeRank[input.minimumEvidenceGrade]) {
      trace.push(`${claim.claimId}:excluded:grade`); return [];
    }
    if (input.category && claim.category !== input.category) return [];
    if (input.metric && !claim.applicableMetrics.includes(input.metric)) return [];
    if (input.phase && !claim.applicablePhases.includes(input.phase)) return [];
    if (input.event && !claim.applicableEvents.includes(input.event)) return [];
    if (input.intervention && !claim.applicableInterventions.includes(input.intervention)) return [];
    const text = `${claim.statement} ${claim.category} ${claim.applicableMetrics.join(" ")} ${claim.applicableInterventions.join(" ")}`.toLowerCase();
    const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    const relevance = terms.length ? terms.filter((term) => text.includes(term)).length / terms.length : 1;
    if (terms.length && relevance === 0) return [];
    const links = catalog.evidenceLinks.filter((link) => link.claimId === claim.claimId);
    const eligibleLinks = links.filter((link) => {
      const source = sourceById.get(link.sourceId);
      const eligible = !!source && !source.retracted &&
        (!strict || source.reviewStatus === "approved_production") &&
        link.reviewerStatus !== "rejected" && link.reviewerStatus !== "archived";
      if (!eligible) trace.push(`${claim.claimId}:${link.evidenceLinkId}:excluded:source_or_review`);
      return eligible;
    });
    const applicabilityDecision = eligibleLinks.length
      ? gradeApplicability(eligibleLinks[0], {
          population: input.population, event: input.event, phase: input.phase,
          metric: input.metric, intervention: input.intervention,
        })
      : { applicability: "unknown" as const, reasons: ["No eligible evidence link."], trace: ["link:none"] };
    if (applicabilityDecision.applicability === "not_applicable") return [];
    const citationLinks = eligibleLinks.filter((link) => ["supports", "partially_supports", "contextual"].includes(link.supportType));
    const citations = citationLinks.flatMap((link) => {
      const source = sourceById.get(link.sourceId)!;
      const citation = formatCitation(source, input.intendedUsage, claim.updatedAt, link.pageReferences);
      const allowed = input.intendedUsage === "athlete_report" ? citation.athleteFacingAllowed
        : input.intendedUsage === "coach_report" || input.intendedUsage === "recommendation_support"
          ? citation.coachFacingAllowed : true;
      return allowed ? [citation] : [];
    });
    const evidenceSummary = composeEvidenceSummary(claim, citationLinks.length, input.intendedUsage);
    assertSafeResearchLanguage(evidenceSummary);
    const score = relevance * 10 + gradeRank[claim.evidenceGrade] * 3 +
      applicabilityRank[applicabilityDecision.applicability] * 2 +
      (claim.reviewStatus === "approved_production" ? 3 : 0);
    trace.push(`${claim.claimId}:included:score=${score.toFixed(2)}`);
    return [{ score, value: {
      claim, evidenceSummary, applicability: applicabilityDecision.applicability,
      conflictingEvidence: claim.conflictingSourceLinks, limitations: claim.limitations,
      citations,
    }}];
  });
  const claims = candidates.sort((a, b) => b.score - a.score || a.value.claim.claimId.localeCompare(b.value.claim.claimId))
    .slice(0, input.maximumResults).map((item) => item.value);
  return researchRetrievalResultSchema.parse({ claims, trace, engineVersion: RESEARCH_ENGINE_VERSION });
}

function composeEvidenceSummary(
  claim: ResearchClaim, sourceCount: number, usage: ResearchRetrievalInput["intendedUsage"],
): string {
  const count = `${sourceCount} reviewed ${sourceCount === 1 ? "source" : "sources"}`;
  if (usage === "athlete_report")
    return `${claim.evidenceGrade === "strong" ? "Strong" : claim.evidenceGrade === "moderate" ? "Moderate" : "Limited"} research evidence supports this general area. Applicability may differ for each athlete.`;
  const conflict = claim.conflictingSourceLinks.length ? " Conflicting evidence is also recorded." : "";
  return `${claim.evidenceGrade[0].toUpperCase()}${claim.evidenceGrade.slice(1)} evidence from ${count} relates to this precise claim.${conflict}`;
}

