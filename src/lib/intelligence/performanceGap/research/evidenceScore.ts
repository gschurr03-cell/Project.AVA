/**
 * Evidence Scoring (Phase 8). Produces a composite evidence-strength score for a body
 * of research from: study quality, replication (count), sample size, population
 * similarity, research age, consistency, and internal validation. Never relies on one
 * publication — a single paper is capped below "high". Pure + deterministic.
 */

import type { EvidenceScore, ResearchEvidence, ResearchQuality, StudyType } from "./models";

export const EVIDENCE_SCORE_VERSION = "ava-evidence-score-v1" as const;

const QUALITY_WEIGHT: Record<ResearchQuality, number> = { strong: 1, moderate: 0.75, limited: 0.5, anecdotal: 0.3 };
const STUDY_WEIGHT: Partial<Record<StudyType, number>> = {
  meta_analysis: 1,
  systematic_review: 0.95,
  rct: 0.85,
  cohort: 0.7,
  cross_sectional: 0.55,
  case_study: 0.4,
  consensus: 0.8,
  textbook: 0.6,
  internal_validation: 0.7,
};

export interface EvidenceScoreInput {
  evidence: ResearchEvidence[];
  studyTypes?: Record<string, StudyType>;
  years?: Record<string, number>;
  internalValidationCount?: number;
  nowYear?: number;
}

export function computeEvidenceScore(input: EvidenceScoreInput): EvidenceScore {
  const ev = input.evidence;
  if (ev.length === 0) {
    return { score: 0, strength: "insufficient", factors: [{ factor: "count", contribution: 0 }] };
  }
  const nowYear = input.nowYear ?? 2026;

  // Quality × population weight per paper, then averaged.
  const qualityMatch =
    ev.reduce((s, e) => s + QUALITY_WEIGHT[e.quality] * e.populationMatch.score, 0) / ev.length;

  // Replication: more independent supporting/neutral papers → stronger (saturating).
  const relevant = ev.filter((e) => e.stance !== "conflicting").length;
  const replication = Math.min(1, relevant / 5);

  // Study design (best available).
  const design = Math.max(...ev.map((e) => (input.studyTypes ? STUDY_WEIGHT[input.studyTypes[e.paperId]] ?? 0.5 : 0.6)));

  // Recency: newer bodies of work score slightly higher.
  const avgAge = input.years
    ? ev.reduce((s, e) => s + (nowYear - (input.years![e.paperId] ?? nowYear - 8)), 0) / ev.length
    : 6;
  const recency = clamp01(1 - Math.max(0, avgAge - 3) / 20);

  // Consistency: fraction of non-conflicting weight.
  const totalW = ev.reduce((s, e) => s + e.weight, 0);
  const agreeW = ev.filter((e) => e.stance === "supporting").reduce((s, e) => s + e.weight, 0);
  const consistency = totalW > 0 ? agreeW / totalW : 0;

  // Internal validation bonus (bounded).
  const internal = Math.min(0.1, (input.internalValidationCount ?? 0) * 0.05);

  const factors = [
    { factor: "qualityMatch", contribution: round(qualityMatch * 0.3) },
    { factor: "replication", contribution: round(replication * 0.2) },
    { factor: "studyDesign", contribution: round(design * 0.15) },
    { factor: "recency", contribution: round(recency * 0.1) },
    { factor: "consistency", contribution: round(consistency * 0.2) },
    { factor: "internalValidation", contribution: round(internal) },
  ];
  let score = clamp01(factors.reduce((s, f) => s + f.contribution, 0));

  // Never rely on one publication: a single paper is capped below "high".
  if (ev.length === 1) score = Math.min(score, 0.6);

  return { score: round(score), strength: strengthFor(score, ev.length), factors };
}

function strengthFor(score: number, count: number): EvidenceScore["strength"] {
  if (count === 0) return "insufficient";
  if (score >= 0.7 && count >= 2) return "high";
  if (score >= 0.45) return "moderate";
  return "low";
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
