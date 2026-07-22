/**
 * Research Tagging (Phase 8). Auto-derives a paper's metric / intervention /
 * root-cause / characteristic tags from its text using configurable keyword maps,
 * merged with any explicitly supported ids. Pure + deterministic.
 */

import type { ResearchPaper, ResearchTag } from "./models";
import {
  METRIC_KEYWORDS,
  INTERVENTION_KEYWORDS,
  ROOT_CAUSE_KEYWORDS,
  CHARACTERISTIC_KEYWORDS,
} from "./knowledgeBase";

export const RESEARCH_TAGGING_VERSION = "ava-research-tagging-v1" as const;

export function tagPaper(paper: ResearchPaper): ResearchTag {
  const text = [
    paper.title,
    ...paper.keyFindings,
    ...paper.supportedConclusions,
    paper.population.anthropometricNote ?? "",
    paper.population.event ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const fromKeywords = (map: Record<string, string>): string[] =>
    [...new Set(Object.entries(map).filter(([kw]) => text.includes(kw)).map(([, id]) => id))];

  return {
    metrics: dedupe([...fromKeywords(METRIC_KEYWORDS), ...paper.supportedMetrics]),
    interventions: dedupe([...fromKeywords(INTERVENTION_KEYWORDS), ...paper.supportedInterventions]),
    rootCauses: dedupe(fromKeywords(ROOT_CAUSE_KEYWORDS)),
    characteristics: dedupe(fromKeywords(CHARACTERISTIC_KEYWORDS)),
  };
}

/** Return the paper with its `tags` filled in (idempotent). */
export function withTags(paper: ResearchPaper): ResearchPaper {
  return { ...paper, tags: tagPaper(paper) };
}

function dedupe(a: string[]): string[] {
  return [...new Set(a)].sort();
}
