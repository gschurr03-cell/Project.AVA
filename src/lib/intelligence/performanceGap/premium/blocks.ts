/**
 * Training Block Generator (Phase 12). Builds an individualized training block from the
 * block template (config) plus the athlete's own top limiters and goals — objectives,
 * technical/physical emphasis, monitoring priorities, and success indicators. Templates are
 * data, so a new block type plugs in without engine changes. Pure + deterministic.
 */

import { type Confidence, estimated } from "../models";
import { applyTerminology } from "../coach/preferences";
import type { BlockType, TrainingBlock } from "./models";
import { BLOCK_TEMPLATES } from "./config";
import { topLimiters, type PremiumInput } from "./context";

export const BLOCK_GENERATOR_VERSION = "ava-premium-blocks-v1" as const;

export function generateTrainingBlock(input: PremiumInput, blockType: BlockType = input.trainingContext.blockType): TrainingBlock {
  const t = BLOCK_TEMPLATES[blockType];
  const prefs = input.preferences ?? null;
  const word = (s: string) => (prefs ? applyTerminology(s, prefs) : s);
  const limiters = topLimiters(input, 3);

  // Individualize: weave the athlete's own limiters into the technical/physical emphasis.
  const limiterEmphasis = limiters.map((l) => `Address ${l.label}${l.contributionPct != null ? ` (~${Math.round(l.contributionPct)}%)` : ""}`);

  const confidence: Confidence = estimated(limiters.length ? 0.6 : 0.45, limiters.length ? "individualized to the athlete's limiters" : "template-based (no limiter data)");

  return {
    id: `block-${blockType}`,
    type: blockType,
    label: t.label,
    primaryObjectives: t.primaryObjectives.map(word),
    secondaryObjectives: t.secondaryObjectives.map(word),
    technicalEmphasis: dedupe([...limiterEmphasis.slice(0, 2), ...t.technicalEmphasis]).map(word),
    physicalEmphasis: t.physicalEmphasis.map(word),
    monitoringPriorities: dedupe([...limiters.map((l) => l.label), ...t.monitoringPriorities]).map(word),
    successIndicators: t.successIndicators.map(word),
    sessionMix: t.sessionMix,
    confidence,
  };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
