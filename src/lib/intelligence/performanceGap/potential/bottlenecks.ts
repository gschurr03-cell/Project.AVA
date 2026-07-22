/**
 * Bottleneck identification (Phase 6). Estimates what is preventing higher projections
 * by blending Phase 1 limiter contribution, Phase 4 sensitivity (downstream influence),
 * and Phase 3 root causes — and links each bottleneck back to the engine that produced
 * it. Pure + deterministic.
 */

import type { AthletePerformanceModel } from "../models";
import type { SensitivityScore } from "../dependency/models";
import type { ReasoningExplanation } from "../rootCause/models";
import type { ProjectionConstraint } from "./models";

export const BOTTLENECK_ENGINE_VERSION = "ava-bottleneck-v1" as const;

export function identifyBottlenecks(input: {
  model: AthletePerformanceModel;
  sensitivity?: SensitivityScore[];
  rootCauses?: ReasoningExplanation[];
  limit?: number;
}): ProjectionConstraint[] {
  const sensitivityById = new Map((input.sensitivity ?? []).map((s) => [s.metricId, s.sensitivity]));
  const leadingCauseByMetric = new Map((input.rootCauses ?? []).map((r) => [r.metricId, r.rootCauses[0]?.label ?? null]));

  const scored = input.model.priorities.map((p) => {
    const contribution = (p.contributionPct ?? 0) / 100;
    const sensitivity = sensitivityById.get(p.metricId) ?? 0.5;
    // Combined constraint score: a limiter that is both a large share AND highly
    // sensitive downstream is the tightest bottleneck.
    const score = contribution * (0.5 + 0.5 * sensitivity);
    return { p, score, sensitivity };
  });
  scored.sort((a, b) => b.score - a.score || a.p.metricId.localeCompare(b.p.metricId));

  const top = scored.slice(0, input.limit ?? 5);
  const primaryCount = Math.min(3, top.length);

  return top.map(({ p, sensitivity }, i): ProjectionConstraint => {
    const cause = leadingCauseByMetric.get(p.metricId);
    const reasonParts = [
      `${p.label} contributes ~${p.contributionPct != null ? p.contributionPct.toFixed(0) : "?"}% of the remaining gap`,
      `downstream influence ~${(sensitivity * 100).toFixed(0)}%`,
    ];
    if (cause) reasonParts.push(`commonly associated with ${cause}`);
    return {
      metricId: p.metricId,
      label: p.label,
      reason: `${reasonParts.join("; ")}.`,
      severity: i < primaryCount ? "primary" : "secondary",
      linkedEngine: cause ? "root-cause" : input.sensitivity ? "metric-dependency" : "performance-gap",
      contributionPct: p.contributionPct,
    };
  });
}
