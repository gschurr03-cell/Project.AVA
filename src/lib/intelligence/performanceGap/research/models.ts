/**
 * Research Intelligence Engine — data models (Phase 8).
 *
 * Transforms structured scientific literature into knowledge that STRENGTHENS AVA's
 * coaching intelligence — it never replaces reasoning, and research never overrides
 * measured athlete data. Every recommendation can combine measured data →
 * biomechanical reasoning → scientific evidence → confidence. Pure + UI-independent.
 */

import type { Confidence } from "../models";
import type { Level } from "../blueprint/models";

export type { Confidence, Level };

export type StudyType =
  | "meta_analysis"
  | "systematic_review"
  | "rct"
  | "cohort"
  | "cross_sectional"
  | "case_study"
  | "textbook"
  | "consensus"
  | "internal_validation";

export type ResearchQuality = "strong" | "moderate" | "limited" | "anecdotal";

export type EvidenceStance = "supporting" | "conflicting" | "neutral";

export interface ResearchPopulation {
  sex: "M" | "F" | "mixed" | null;
  event: string | null;
  performanceLevel: Level | "recreational" | "mixed" | null;
  sampleSize: number | null;
  anthropometricNote: string | null;
}

/** Automatically-derivable tags for a paper. */
export interface ResearchTag {
  metrics: string[];
  interventions: string[];
  rootCauses: string[];
  characteristics: string[];
}

/** A structured research source. Future ingestion (PDF/manual) populates these. */
export interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  publication: string;
  year: number;
  journal: string;
  sport: string;
  population: ResearchPopulation;
  studyType: StudyType;
  quality: ResearchQuality;
  keyFindings: string[];
  limitations: string[];
  supportedMetrics: string[];
  supportedInterventions: string[];
  supportedConclusions: string[];
  citation: string;
  tags: ResearchTag;
  /** Stance per intervention/metric target id (defaults to "supporting"). */
  stanceByTarget?: Record<string, EvidenceStance>;
  /** Source-tracking / versioning seam for future ingestion. */
  sourceVersion?: string;
  approved?: boolean;
}

/** How well a paper's population matches the athlete. */
export interface PopulationMatch {
  score: number;
  factors: { factor: string; score: number }[];
}

/** A composite evidence-strength score for a body of research. */
export interface EvidenceScore {
  score: number;
  strength: "high" | "moderate" | "low" | "insufficient";
  factors: { factor: string; contribution: number }[];
}

/** Consensus vs conflict across the matched research. */
export type ConsensusLevel = "consensus" | "mixed" | "conflicting" | "limited" | "none";
export interface ConsensusModel {
  level: ConsensusLevel;
  supporting: number;
  conflicting: number;
  neutral: number;
  note: string;
}

export interface EvidenceConflict {
  hasConflict: boolean;
  supporting: number;
  conflicting: number;
  neutral: number;
}

export interface EvidenceSummary {
  text: string;
  consensus: ConsensusLevel;
  confidence: Confidence;
}

/** One paper's weighted contribution to a claim. */
export interface ResearchEvidence {
  paperId: string;
  title: string;
  stance: EvidenceStance;
  quality: ResearchQuality;
  populationMatch: PopulationMatch;
  /** quality × population match × recency (0..1). */
  weight: number;
}

/** Research links to the rest of the intelligence stack. */
export interface ResearchRelationship {
  paperId: string;
  linkedMetrics: string[];
  linkedInterventions: string[];
  linkedRootCauses: string[];
}

/** The evidence backing one recommendation target (an intervention or a metric). */
export interface SupportedRecommendation {
  target: string;
  targetKind: "intervention" | "metric";
  evidence: ResearchEvidence[];
  evidenceScore: EvidenceScore;
  consensus: ConsensusModel;
  conflict: EvidenceConflict;
  summary: EvidenceSummary;
  /** Bounded adjustment to recommendation confidence — never overrides measured data. */
  confidenceContribution: number;
}
