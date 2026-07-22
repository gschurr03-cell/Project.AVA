/**
 * Evidence Linking (Phase 8). For a recommendation target (an intervention or a
 * metric), gathers matched research, weights each paper by quality × population match ×
 * recency, scores the evidence, detects consensus/conflict, summarizes honestly, and
 * computes a BOUNDED confidence contribution — research strengthens a recommendation but
 * never overrides measured athlete data. Pure + deterministic.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type {
  EvidenceStance,
  ResearchEvidence,
  ResearchPaper,
  ResearchRelationship,
  SupportedRecommendation,
} from "./models";
import { RESEARCH_PAPERS } from "./knowledgeBase";
import { withTags } from "./tagging";
import { matchPopulation } from "./populationMatch";
import { computeEvidenceScore } from "./evidenceScore";
import { detectConsensus, detectConflict, summarizeEvidence } from "./consensus";

export const EVIDENCE_LINKING_VERSION = "ava-evidence-linking-v1" as const;

/** Max amount research can move a recommendation's confidence (never overrides data). */
export const MAX_CONFIDENCE_CONTRIBUTION = 0.15;

const QUALITY_WEIGHT = { strong: 1, moderate: 0.75, limited: 0.5, anecdotal: 0.3 } as const;

export interface EvidenceLinkInput {
  target: string;
  targetKind: "intervention" | "metric";
  targetLabel?: string;
  context?: AthleteContext;
  papers?: ResearchPaper[];
  nowYear?: number;
}

export function buildSupportedRecommendation(input: EvidenceLinkInput): SupportedRecommendation {
  const context = input.context ?? {};
  const papers = (input.papers ?? RESEARCH_PAPERS).map(withTags);
  const nowYear = input.nowYear ?? 2026;

  const matched = papers.filter((p) =>
    input.targetKind === "intervention"
      ? p.tags.interventions.includes(input.target)
      : p.tags.metrics.includes(input.target),
  );

  const evidence: ResearchEvidence[] = matched.map((p) => {
    const populationMatch = matchPopulation(p.population, context);
    const recency = clamp01(1 - Math.max(0, nowYear - p.year - 3) / 20);
    const stance: EvidenceStance = p.stanceByTarget?.[input.target] ?? "supporting";
    const weight = round(QUALITY_WEIGHT[p.quality] * populationMatch.score * recency);
    return { paperId: p.id, title: p.title, stance, quality: p.quality, populationMatch, weight };
  });
  // Deterministic order: strongest weight first, then id.
  evidence.sort((a, b) => b.weight - a.weight || a.paperId.localeCompare(b.paperId));

  const evidenceScore = computeEvidenceScore({
    evidence,
    studyTypes: Object.fromEntries(matched.map((p) => [p.id, p.studyType])),
    years: Object.fromEntries(matched.map((p) => [p.id, p.year])),
    internalValidationCount: matched.filter((p) => p.studyType === "internal_validation").length,
    nowYear,
  });
  const consensus = detectConsensus(evidence);
  const conflict = detectConflict(evidence);
  const associatedWith = collectAssociatedMetrics(matched, input.targetKind === "metric" ? input.target : null);
  const summary = summarizeEvidence(input.targetLabel ?? input.target, evidence, consensus, associatedWith);

  // Confidence contribution: positive with supportive consensus, damped by conflict,
  // scaled by evidence score, and bounded so research can never dominate measured data.
  let contribution = evidenceScore.score * MAX_CONFIDENCE_CONTRIBUTION;
  if (consensus.level === "conflicting") contribution = -MAX_CONFIDENCE_CONTRIBUTION * 0.5;
  else if (consensus.level === "mixed") contribution *= 0.5;
  else if (consensus.level === "limited") contribution *= 0.4;
  else if (consensus.level === "none") contribution = 0;

  return {
    target: input.target,
    targetKind: input.targetKind,
    evidence,
    evidenceScore,
    consensus,
    conflict,
    summary,
    confidenceContribution: round(clamp(contribution, -MAX_CONFIDENCE_CONTRIBUTION, MAX_CONFIDENCE_CONTRIBUTION)),
  };
}

/** Research relationships: how each paper links to metrics / interventions / root causes. */
export function buildResearchRelationships(papers: ResearchPaper[] = RESEARCH_PAPERS): ResearchRelationship[] {
  return papers.map(withTags).map((p) => ({
    paperId: p.id,
    linkedMetrics: p.tags.metrics,
    linkedInterventions: p.tags.interventions,
    linkedRootCauses: p.tags.rootCauses,
  }));
}

function collectAssociatedMetrics(papers: ResearchPaper[], excludeMetric: string | null): string[] {
  const set = new Set<string>();
  for (const p of papers) for (const m of p.supportedMetrics) if (m !== excludeMetric) set.add(m);
  return [...set];
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
