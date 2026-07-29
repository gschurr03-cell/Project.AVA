/**
 * Premium Coaching Engine (Phase 12). Generates individualized, explainable coaching
 * recommendations. Each answers WHY (the limiter/root cause), WHY NOW (phase + progress),
 * the expected benefit, confidence, evidence, and alternatives — and ships with a pending
 * coach-override state so nothing is ever imposed. Interventions are sourced from the Phase 7
 * library (evidence-aware); wording honours coach preferences without altering data. Pure.
 */

import { type Confidence, estimated, inferred, propagateConfidence } from "../models";
import type { InterventionPriority } from "../intervention/models";
import { applyTerminology } from "../coach/preferences";
import type { ExpectedBenefit, PremiumRecommendation, RecommendationAlternative, RecommendationCategory } from "./models";
import { pendingOverride } from "./override";
import { BLOCK_TEMPLATES } from "./config";
import { topLimiters, plateauedMetrics, type PremiumInput } from "./context";

export const PREMIUM_RECOMMENDATION_VERSION = "ava-premium-recommendation-v1" as const;

export function buildPremiumRecommendations(input: PremiumInput): PremiumRecommendation[] {
  const prefs = input.preferences ?? null;
  const word = (t: string) => (prefs ? applyTerminology(t, prefs) : t);
  const limiters = topLimiters(input, 3);
  const plateaus = new Set(plateauedMetrics(input));
  const interventions = input.interventions?.priorities ?? [];
  const blockLabel = BLOCK_TEMPLATES[input.trainingContext.blockType].label;

  const recs: PremiumRecommendation[] = [];

  limiters.forEach((limiter, i) => {
    const matches = interventions.filter((p) => addresses(p, limiter.metricId));
    const primary = matches[0] ?? null;
    const alternatives: RecommendationAlternative[] = matches.slice(1, 3).map((p) => ({ label: p.intervention.name, note: p.reasoning, interventionId: p.intervention.id }));

    const isPlateau = plateaus.has(limiter.metricId);
    const category: RecommendationCategory = i === 0 ? "technical" : "physical";
    const benefit = expectedBenefit(primary, limiter);

    const evidence = primary
      ? [`Evidence strength: ${primary.intervention.evidenceStrength}.`, ...primary.supportingEvidence.slice(0, 2)]
      : ["Derived from the athlete's own limiter analysis (associative, not prescriptive)."];

    const confidence: Confidence = primary
      ? propagateConfidence([primary.confidence, estimated(0.7, "premium recommendation")], "individualized coaching recommendation")
      : inferred(0.45, "no matched intervention — limiter-only recommendation");

    recs.push({
      id: `rec-${limiter.metricId}`,
      title: word(primary ? `Develop ${primary.intervention.name} for ${limiter.label}` : `Prioritise ${limiter.label}`),
      category,
      what: word(primary ? `${primary.intervention.name} — ${primary.implementationGuidance.typicalVolume}, ${primary.implementationGuidance.typicalRest} rest.` : `Target ${limiter.label} with progressive, quality-first work.`),
      why: word(`${limiter.label} is a top limiter${limiter.contributionPct != null ? ` (~${Math.round(limiter.contributionPct)}% of achievable improvement)` : ""}.`),
      whyNow: word(isPlateau ? `${limiter.label} has plateaued — a change of emphasis is timely.` : `Aligns with the current ${blockLabel} block's emphasis.`),
      expectedBenefit: benefit,
      confidence,
      evidence,
      alternatives,
      coachOverride: pendingOverride(),
      priority: i + 1,
      linkedInterventionId: primary?.intervention.id ?? null,
    });
  });

  return recs;
}

function addresses(p: InterventionPriority, metricId: string): boolean {
  return p.associatedMetrics.includes(metricId) || p.addressedLimiters.includes(metricId) || p.expectedImprovements.some((e) => e.metricId === metricId);
}

function expectedBenefit(primary: InterventionPriority | null, limiter: { metricId: string; label: string; contributionPct: number | null }): ExpectedBenefit | null {
  const magnitude: ExpectedBenefit["magnitude"] = limiter.contributionPct == null ? "moderate" : limiter.contributionPct >= 35 ? "large" : limiter.contributionPct >= 20 ? "moderate" : "small";
  const match = primary?.expectedImprovements.find((e) => e.metricId === limiter.metricId) ?? primary?.expectedImprovements[0] ?? null;
  if (match) {
    return { metricId: match.metricId, label: match.label, direction: match.direction, magnitude, note: `Commonly associated with a ${magnitude} ${match.direction} in ${match.label} — a direction, never a guaranteed number.` };
  }
  return { metricId: limiter.metricId, label: limiter.label, direction: "increase", magnitude, note: `Targeting ${limiter.label} is associated with progress toward the goal — direction only, never guaranteed.` };
}
