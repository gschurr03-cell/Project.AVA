/**
 * Engine 3 — Limiter Prioritization Engine.
 *
 * Ranks gaps by ESTIMATED IMPACT (contribution share × estimated time gain,
 * modulated by confidence) — deliberately NOT by the largest raw gap. Produces an
 * ordered, explainable set of limiters, each carrying its reason, evidence,
 * associated metrics, estimated time gain, and a qualitative expected-improvement
 * band. Deterministic (stable tie-break by metricId).
 */

import {
  type ExpectedImprovement,
  type PerformanceGap,
  type PriorityLimiter,
  propagateConfidence,
} from "./models";
import { metricDefinition } from "./config";

export const LIMITER_PRIORITIZATION_ENGINE_VERSION = "limiter-prioritization-v1" as const;

export function prioritizeLimiters(gaps: PerformanceGap[], limit = 5): PriorityLimiter[] {
  // Only gaps that (a) require improvement and (b) are trainable LEVERS are
  // limiters. Outcome metrics (e.g. average velocity = distance ÷ time) are results,
  // not levers, so they are never ranked as a limiter even with a large gap.
  const candidates = gaps.filter(
    (g) =>
      (g.absoluteGap ?? 0) > 0 &&
      (g.contribution.fraction ?? 0) > 0 &&
      (metricDefinition(g.metricId)?.role ?? "lever") !== "outcome",
  );

  const scored = candidates.map((g) => {
    // Impact score = estimated contribution share, weighted by confidence so an
    // uncertain large gap does not outrank a confident meaningful one.
    const confScore = g.contribution.confidence.score ?? (g.contribution.confidence.category === "measured" ? 1 : 0.3);
    const impact = (g.contribution.fraction ?? 0) * (0.5 + 0.5 * confScore);
    return { g, impact };
  });

  scored.sort((a, b) => {
    if (b.impact !== a.impact) return b.impact - a.impact;
    return a.g.metricId.localeCompare(b.g.metricId); // deterministic tie-break
  });

  const top = scored.slice(0, limit);
  const maxImpact = top.length ? top[0].impact : 0;

  return top.map(({ g, impact }, i): PriorityLimiter => {
    const def = metricDefinition(g.metricId);
    const contributionPct = g.contribution.fraction != null ? round(g.contribution.fraction * 100) : null;
    const expectedImprovement = bandFor(impact, maxImpact);
    const evidence = buildEvidence(g);
    return {
      rank: i + 1,
      metricId: g.metricId,
      label: g.label,
      contributionPct,
      confidence: propagateConfidence([g.confidence, g.contribution.confidence], "priority impact estimate"),
      reason: buildReason(g, expectedImprovement),
      evidence,
      associatedMetrics: def?.associatedRecommendations ? relatedMetrics(g.metricId) : [],
      estimatedTimeGainS: g.contribution.estimatedTimeGainS,
      expectedImprovement,
    };
  });
}

function bandFor(impact: number, maxImpact: number): ExpectedImprovement {
  if (maxImpact <= 0) return "small";
  const rel = impact / maxImpact;
  if (rel >= 0.99) return "largest";
  if (rel >= 0.66) return "large";
  if (rel >= 0.33) return "moderate";
  return "small";
}

function buildReason(g: PerformanceGap, band: ExpectedImprovement): string {
  const pct = g.percentGap != null ? `${g.percentGap.toFixed(1)}%` : "an unquantified amount";
  const dir = g.lowerIsBetter ? "reduce" : "increase";
  return `${g.label} would need to ${dir} by about ${pct} to meet the estimated requirement; its estimated contribution to closing the goal is ${band}.`;
}

function buildEvidence(g: PerformanceGap): string[] {
  const ev: string[] = [];
  if (g.currentValue != null) ev.push(`Current ${g.label}: ${g.currentValue} ${g.unit} (${g.confidence.category})`);
  if (g.targetValue != null) ev.push(`Estimated requirement: ${g.targetValue} ${g.unit}`);
  if (g.contribution.fraction != null)
    ev.push(`Estimated contribution: ${(g.contribution.fraction * 100).toFixed(0)}%`);
  return ev;
}

/** Metrics closely coupled to this one (its bilateral split / velocity partners). */
function relatedMetrics(metricId: string): string[] {
  const partners: Record<string, string[]> = {
    strideLength: ["strideFrequency", "peakVelocity", "strideLengthLeft", "strideLengthRight"],
    strideFrequency: ["strideLength", "groundContactTime", "strideFrequencyLeft", "strideFrequencyRight"],
    peakVelocity: ["strideLength", "strideFrequency"],
    groundContactTime: ["strideFrequency", "flightTime"],
  };
  return partners[metricId] ?? [];
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
