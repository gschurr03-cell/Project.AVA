/**
 * Intervention Matching engine (Phase 7). Given the performance gaps (Phase 1), root
 * causes (Phase 3), and athlete level (Phase 5), ranks the most relevant interventions
 * and explains WHY each may help — with expected metric DIRECTION (never a guaranteed
 * magnitude) and educational implementation guidance (never a program). Pure.
 */

import {
  type AthletePerformanceModel,
  type Confidence,
  estimated,
  inferred,
  propagateConfidence,
} from "../models";
import type { ReasoningExplanation } from "../rootCause/models";
import { metricDefinition } from "../config";
import type {
  EvidenceStrength,
  ExpectedImprovement,
  ImplementationGuidance,
  Intervention,
  InterventionPriority,
  Level,
} from "./models";
import { INTERVENTIONS } from "./library";

export const INTERVENTION_MATCHING_VERSION = "ava-intervention-matching-v1" as const;

const EVIDENCE_WEIGHT: Record<EvidenceStrength, number> = { strong: 1, moderate: 0.8, limited: 0.6, anecdotal: 0.4 };

export interface MatchInput {
  model: AthletePerformanceModel;
  rootCauses?: ReasoningExplanation[];
  level?: Level;
  limit?: number;
}

export function matchInterventions(input: MatchInput): InterventionPriority[] {
  const limitersByMetric = new Map(input.model.priorities.map((p) => [p.metricId, p]));
  const neededDirection = (metricId: string): "increase" | "decrease" =>
    metricDefinition(metricId)?.lowerIsBetter ? "decrease" : "increase";

  // Leading root-cause contributors (top 3 per limiter), for cause-based matching.
  const contributorWeight = new Map<string, number>();
  for (const expl of input.rootCauses ?? []) {
    for (const rc of expl.rootCauses.slice(0, 3)) {
      contributorWeight.set(rc.contributorId, Math.max(contributorWeight.get(rc.contributorId) ?? 0, (rc.likelihoodPct ?? 0) / 100));
    }
  }

  const scored = INTERVENTIONS.map((iv) => {
    const addressedLimiters: string[] = [];
    let relevance = 0;

    // Metric (limiter) matches: the intervention moves a limiter metric the needed way.
    for (const am of iv.associatedMetrics) {
      const limiter = limitersByMetric.get(am.metricId);
      if (!limiter) continue;
      if (am.direction !== neededDirection(am.metricId)) continue;
      const weight = (limiter.contributionPct ?? 0) / 100;
      relevance += weight * (am.kind === "direct" ? 1 : 0.6);
      addressedLimiters.push(am.metricId);
    }

    // Root-cause matches: the intervention addresses a leading contributor.
    const addressedRootCauses: string[] = [];
    for (const rc of iv.rootCausesAddressed) {
      const w = contributorWeight.get(rc);
      if (w != null) {
        relevance += w * 0.5;
        addressedRootCauses.push(rc);
      }
    }

    return { iv, relevance, addressedLimiters: [...new Set(addressedLimiters)], addressedRootCauses: [...new Set(addressedRootCauses)] };
  }).filter((s) => s.relevance > 0);

  const levelFit = (iv: Intervention) => (input.level && !iv.typicalLevel.includes(input.level) ? 0.6 : 1);

  const withScore = scored.map((s) => ({
    ...s,
    score: s.relevance * s.iv.confidence * levelFit(s.iv) * EVIDENCE_WEIGHT[s.iv.evidenceStrength],
  }));

  withScore.sort((a, b) => b.score - a.score || a.iv.id.localeCompare(b.iv.id));

  const top = withScore.slice(0, input.limit ?? 8);
  const maxScore = top.length ? top[0].score : 0;

  return top.map((s, i): InterventionPriority => {
    const confidence = buildConfidence(s.iv.confidence, s.iv.evidenceStrength, s.addressedLimiters.length + s.addressedRootCauses.length);
    return {
      rank: i + 1,
      intervention: s.iv,
      priorityScore: round(maxScore > 0 ? s.score / maxScore : 0),
      confidence,
      reasoning: buildReasoning(s.iv, s.addressedLimiters, input.model),
      supportingEvidence: buildEvidence(s.iv, s.addressedLimiters, s.addressedRootCauses, input.model),
      associatedMetrics: s.iv.associatedMetrics.map((m) => m.metricId),
      addressedLimiters: s.addressedLimiters,
      addressedRootCauses: s.addressedRootCauses,
      expectedImprovements: buildExpectedImprovements(s.iv, confidence),
      implementationGuidance: buildGuidance(s.iv),
    };
  });
}

function buildConfidence(base: number, evidence: EvidenceStrength, matchCount: number): Confidence {
  const score = base * EVIDENCE_WEIGHT[evidence] * (matchCount >= 2 ? 1 : 0.85);
  return evidence === "strong" || evidence === "moderate"
    ? estimated(score, "matched to limiters/root causes; associative evidence")
    : inferred(score, "limited evidence — associative only");
}

function buildReasoning(iv: Intervention, addressedLimiters: string[], model: AthletePerformanceModel): string {
  const limiterLabels = addressedLimiters.map((m) => model.gaps.find((g) => g.metricId === m)?.label ?? m);
  const target = limiterLabels[0] ?? "the identified limiter";
  return `${iv.name} is commonly used to develop ${iv.primaryQualities.join(", ")}, which is associated with improving ${target}. It is educational information about a common intervention type — not a prescription.`;
}

function buildEvidence(
  iv: Intervention,
  addressedLimiters: string[],
  addressedRootCauses: string[],
  model: AthletePerformanceModel,
): string[] {
  const ev: string[] = [];
  for (const m of addressedLimiters) {
    const g = model.gaps.find((x) => x.metricId === m);
    if (g) ev.push(`${g.label} is below its estimated requirement${g.percentGap != null ? ` (${g.percentGap.toFixed(1)}%)` : ""}.`);
  }
  if (addressedRootCauses.length) ev.push(`Commonly addresses: ${addressedRootCauses.join(", ")}.`);
  ev.push(`Evidence strength: ${iv.evidenceStrength}.`);
  return ev;
}

function buildExpectedImprovements(iv: Intervention, confidence: Confidence): ExpectedImprovement[] {
  return iv.associatedMetrics.map((am): ExpectedImprovement => ({
    metricId: am.metricId,
    label: metricDefinition(am.metricId)?.label ?? am.metricId,
    direction: am.direction,
    kind: am.kind,
    confidence:
      am.kind === "direct"
        ? confidence
        : propagateConfidence([confidence, inferred(0.5, "indirect via metric dependency")], "indirect effect"),
  }));
}

function buildGuidance(iv: Intervention): ImplementationGuidance {
  return {
    typicalDistances: iv.typicalDistances,
    typicalVolume: iv.typicalVolume,
    typicalRest: iv.typicalRest,
    typicalPhase: iv.typicalPhase,
    coachingCues: iv.coachingCues,
    note: "Educational implementation concepts only — not a weekly program, days, or prescribed sets/reps.",
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
