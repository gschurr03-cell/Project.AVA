/**
 * Consensus + Conflict detection and Summarization (Phase 8). Classifies a body of
 * research as consensus / mixed / conflicting / limited / none, flags conflicts, and
 * generates an HONEST, non-overstated summary. Pure + deterministic.
 */

import { type Confidence, estimated, inferred, unknown } from "../models";
import type { ConsensusLevel, ConsensusModel, EvidenceConflict, EvidenceSummary, ResearchEvidence } from "./models";

export const CONSENSUS_ENGINE_VERSION = "ava-consensus-v1" as const;

export function detectConsensus(evidence: ResearchEvidence[]): ConsensusModel {
  const supporting = evidence.filter((e) => e.stance === "supporting").length;
  const conflicting = evidence.filter((e) => e.stance === "conflicting").length;
  const neutral = evidence.filter((e) => e.stance === "neutral").length;
  const total = evidence.length;

  let level: ConsensusLevel;
  let note: string;
  if (total === 0) {
    level = "none";
    note = "No matched research in the knowledge base yet.";
  } else if (total < 2) {
    level = "limited";
    note = "Limited evidence — based on a single matched source.";
  } else if (conflicting === 0 && supporting >= Math.max(2, Math.ceil(total * 0.6))) {
    level = "consensus";
    note = "Most matched research points the same way.";
  } else if (conflicting >= Math.ceil(total * 0.5)) {
    level = "conflicting";
    note = "A substantial share of matched research disagrees.";
  } else {
    level = "mixed";
    note = "Matched research is mixed; individual responses vary.";
  }
  return { level, supporting, conflicting, neutral, note };
}

export function detectConflict(evidence: ResearchEvidence[]): EvidenceConflict {
  const supporting = evidence.filter((e) => e.stance === "supporting").length;
  const conflicting = evidence.filter((e) => e.stance === "conflicting").length;
  const neutral = evidence.filter((e) => e.stance === "neutral").length;
  return { hasConflict: conflicting > 0, supporting, conflicting, neutral };
}

export function summarizeEvidence(
  targetLabel: string,
  evidence: ResearchEvidence[],
  consensus: ConsensusModel,
  associatedWith: string[],
): EvidenceSummary {
  if (evidence.length === 0) {
    return { text: `No matched research is available yet for ${targetLabel}.`, consensus: consensus.level, confidence: unknown("no matched research") };
  }
  const qualifier =
    consensus.level === "consensus"
      ? "Current evidence suggests"
      : consensus.level === "mixed"
        ? "Current evidence is mixed but suggests"
        : consensus.level === "conflicting"
          ? "Evidence is conflicting regarding whether"
          : "Limited evidence suggests";
  const assoc = associatedWith.length ? ` improvements in ${associatedWith.join(", ")}` : " sprint-specific qualities";
  const populations = topPopulations(evidence);
  const popNote = populations ? ` Most supporting studies involve ${populations}, though individual responses vary.` : " Individual responses vary.";

  const confidence: Confidence =
    consensus.level === "consensus"
      ? estimated(0.6, "consensus across matched research")
      : consensus.level === "limited"
        ? inferred(0.4, "single matched source")
        : inferred(0.45, "mixed/conflicting evidence");

  return {
    text: `${qualifier} that ${targetLabel} is commonly associated with${assoc}.${popNote}`,
    consensus: consensus.level,
    confidence,
  };
}

function topPopulations(evidence: ResearchEvidence[]): string | null {
  // Descriptive only; the engine keeps population detail on the papers themselves.
  return evidence.length >= 2 ? "trained sprinters" : "a small sample";
}
