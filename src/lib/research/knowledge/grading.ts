import type {
  ApplicabilityDecision, EvidenceGradeDecision, ResearchEvidenceLink, ResearchSource,
} from "./types";

const highDesign = new Set(["systematic_review", "meta_analysis", "validation_study", "reliability_study"]);
const relevantDesign = new Set(["biomechanical_lab_study", "intervention_study", "controlled_trial", "longitudinal_cohort"]);

export function gradeEvidence(source: ResearchSource, links: ResearchEvidenceLink[]): EvidenceGradeDecision {
  const reasons: string[] = [];
  const trace: string[] = [];
  if (source.retracted) return { grade: "unavailable", reasons: ["The source is retracted."], trace: ["retraction:block"] };
  if (source.reviewStatus !== "approved_internal" && source.reviewStatus !== "approved_production")
    return { grade: "unavailable", reasons: ["The source has not completed human review."], trace: ["review:block"] };
  const reviewed = links.filter((link) => ["approved_internal", "approved_production"].includes(link.reviewerStatus));
  if (!reviewed.length) return { grade: "unavailable", reasons: ["No reviewed evidence link exists."], trace: ["link:block"] };
  const conflicts = reviewed.some((link) => link.supportType === "contradicts");
  const supports = reviewed.filter((link) => ["supports", "partially_supports"].includes(link.supportType));
  if (conflicts && supports.length) return { grade: "conflicting", reasons: ["Reviewed evidence includes support and contradiction."], trace: ["consistency:mixed"] };
  if (!supports.length) return { grade: "unavailable", reasons: ["No reviewed source supports the claim."], trace: ["support:none"] };
  let score = 0;
  if (highDesign.has(source.studyType)) { score += 3; reasons.push("The study design contributes higher-level synthesis or validation evidence."); }
  else if (relevantDesign.has(source.studyType)) { score += 2; reasons.push("The study design is directly useful for biomechanics."); }
  else { score += 1; reasons.push("The study design provides limited inferential strength."); }
  const direct = supports.filter((link) => link.directness === "direct").length;
  if (direct) { score += 2; reasons.push("At least one reviewed link directly addresses the precise claim."); }
  else reasons.push("Support is indirect or extrapolated.");
  const sample = Math.max(...supports.map((link) => link.sampleSize ?? 0));
  if (sample >= 50) score += 2;
  else if (sample >= 15) score += 1;
  else reasons.push("Sample size is small or unreported.");
  if (source.peerReviewStatus === "peer_reviewed") score += 1;
  else reasons.push("The source is not confirmed as peer reviewed.");
  if (source.fullTextAvailability === "abstract_only") { score -= 2; reasons.push("Only the abstract is available for review."); }
  if (source.expressionOfConcern || source.supersededBy) { score -= 2; reasons.push("The source has a concern or superseding version."); }
  trace.push(`design:${source.studyType}`, `direct_links:${direct}`, `max_sample:${sample}`, `score:${score}`);
  return {
    grade: score >= 7 ? "strong" : score >= 5 ? "moderate" : score >= 3 ? "limited" : "preliminary",
    reasons, trace,
  };
}

export interface ApplicabilityContext {
  population: string[]; event: string | null; phase: string | null;
  metric: string | null; intervention: string | null;
}

export function gradeApplicability(link: ResearchEvidenceLink, context: ApplicabilityContext): ApplicabilityDecision {
  const dimensions = [
    ["population", link.populationMatch], ["event", link.eventMatch], ["phase", link.phaseMatch],
    ["metric", link.metricMatch], ["intervention", link.interventionMatch],
  ] as const;
  const relevant = dimensions.filter(([name]) =>
    name === "population" ? context.population.length > 0 : context[name] != null);
  if (!relevant.length) return {
    applicability: "unknown", reasons: ["No athlete or usage context was provided."],
    trace: ["context:missing"],
  };
  if (relevant.some(([, value]) => value === "not_applicable")) return {
    applicability: "not_applicable", reasons: ["At least one required context dimension does not match."],
    trace: relevant.map(([name, value]) => `${name}:${value}`),
  };
  const values = relevant.map(([, value]) => value);
  const applicability = values.every((value) => value === "directly_applicable")
    ? "directly_applicable"
    : values.every((value) => ["directly_applicable", "broadly_applicable"].includes(value))
      ? "broadly_applicable"
      : values.some((value) => value === "weakly_applicable")
        ? "weakly_applicable" : "partially_applicable";
  return {
    applicability,
    reasons: [`Applicability reflects ${relevant.length} requested context dimensions.`],
    trace: relevant.map(([name, value]) => `${name}:${value}`),
  };
}

export function deriveConsensus(links: ResearchEvidenceLink[]): {
  consensus: "established" | "generally_supported" | "emerging" | "mixed" | "disputed" | "unsupported" | "unknown";
  reasons: string[];
} {
  const reviewed = links.filter((link) => ["approved_internal", "approved_production"].includes(link.reviewerStatus));
  const supports = reviewed.filter((link) => ["supports", "partially_supports"].includes(link.supportType)).length;
  const contradicts = reviewed.filter((link) => link.supportType === "contradicts").length;
  if (!reviewed.length) return { consensus: "unknown", reasons: ["No reviewed evidence links."] };
  if (supports && contradicts) return { consensus: supports >= contradicts * 2 ? "mixed" : "disputed", reasons: [`${supports} supporting and ${contradicts} contradicting links.`] };
  if (contradicts) return { consensus: "unsupported", reasons: ["Reviewed evidence is contradicting or non-supportive."] };
  if (supports >= 3) return { consensus: "generally_supported", reasons: ["At least three reviewed supporting links without recorded contradiction."] };
  return { consensus: "emerging", reasons: ["Reviewed support exists but replication is limited."] };
}
