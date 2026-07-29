/**
 * Research Intelligence Engine (Phase 8) — public surface + orchestration.
 *
 * Turns structured research into evidence that strengthens (never replaces) AVA's
 * coaching intelligence. Given a set of recommended interventions (Phase 7) + the
 * athlete context, it attaches population-weighted, consensus-aware, conflict-flagged
 * research support to each — and a bounded confidence contribution that can never
 * override measured athlete data. Pure + deterministic.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type { Confidence } from "../models";
import { clamp01 } from "../models";
import type { SupportedRecommendation } from "./models";
import { RESEARCH_KB_VERSION } from "./knowledgeBase";
import { buildSupportedRecommendation, buildResearchRelationships, EVIDENCE_LINKING_VERSION } from "./linking";
import { RESEARCH_TAGGING_VERSION } from "./tagging";
import { POPULATION_MATCH_VERSION } from "./populationMatch";
import { EVIDENCE_SCORE_VERSION } from "./evidenceScore";
import { CONSENSUS_ENGINE_VERSION } from "./consensus";

export * from "./models";
export * from "./knowledgeBase";
export * from "./tagging";
export * from "./populationMatch";
export * from "./evidenceScore";
export * from "./consensus";
export * from "./linking";

export const RESEARCH_INTELLIGENCE_VERSION = "research-intelligence-v1" as const;

export interface ResearchSupportReport {
  version: string;
  generatedAt: string;
  athleteId: string | null;
  supported: SupportedRecommendation[];
  provenance: { engineVersions: Record<string, string>; knowledgeBaseVersion: string };
}

export interface ResearchSupportInput {
  athleteId?: string | null;
  /** Targets to attach evidence to (typically the Phase 7 intervention ids). */
  interventionIds?: string[];
  metricIds?: string[];
  labels?: Record<string, string>;
  context?: AthleteContext;
  now?: Date;
  nowYear?: number;
}

export function buildResearchSupport(input: ResearchSupportInput): ResearchSupportReport {
  const supported: SupportedRecommendation[] = [];
  for (const id of input.interventionIds ?? []) {
    supported.push(
      buildSupportedRecommendation({ target: id, targetKind: "intervention", targetLabel: input.labels?.[id] ?? id, context: input.context, nowYear: input.nowYear }),
    );
  }
  for (const id of input.metricIds ?? []) {
    supported.push(
      buildSupportedRecommendation({ target: id, targetKind: "metric", targetLabel: input.labels?.[id] ?? id, context: input.context, nowYear: input.nowYear }),
    );
  }
  return {
    version: RESEARCH_INTELLIGENCE_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    supported,
    provenance: {
      engineVersions: {
        tagging: RESEARCH_TAGGING_VERSION,
        populationMatch: POPULATION_MATCH_VERSION,
        evidenceScore: EVIDENCE_SCORE_VERSION,
        consensus: CONSENSUS_ENGINE_VERSION,
        linking: EVIDENCE_LINKING_VERSION,
      },
      knowledgeBaseVersion: RESEARCH_KB_VERSION,
    },
  };
}

/**
 * Combine measured/biomechanical confidence with a research contribution WITHOUT
 * letting research override the measured signal: the base confidence category is
 * preserved; only the score is nudged within bounds.
 */
export function applyResearchToConfidence(base: Confidence, contribution: number): Confidence {
  if (base.category === "measured" || base.category === "unknown") return base; // measured data is authoritative
  const baseScore = base.score ?? 0.5;
  return { ...base, score: clamp01(baseScore + contribution) };
}

export { buildResearchRelationships };
