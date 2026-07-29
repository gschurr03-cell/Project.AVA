/**
 * Engine 1 — Performance Gap Engine.
 *
 * For every metric with both a current value and a derived requirement, computes
 * the absolute + percent gap, its importance, confidence, and an estimated
 * contribution (share of the achievable improvement + estimated time gain). Pure,
 * deterministic, and driven entirely by the metric registry — new metrics appear
 * automatically. It never sorts or ranks (that is Engine 3's job).
 */

import {
  type Confidence,
  type GapContribution,
  type GoalRequirement,
  type PerformanceGap,
  clamp01,
  estimated,
  propagateConfidence,
  unknown,
} from "./models";
import { metricDefinition, MODEL_PARAMS } from "./config";

export const PERFORMANCE_GAP_ENGINE_VERSION = "performance-gap-v1" as const;

export function buildPerformanceGaps(requirement: GoalRequirement): PerformanceGap[] {
  const target = requirement.target;
  const totalTimeGapS =
    target.currentTimeS != null && target.goalTimeS != null
      ? Math.max(0, target.currentTimeS - target.goalTimeS)
      : null;

  // First pass: compute the raw "impact weight" of each metric so contributions
  // can be normalized into a share of the whole.
  const rows = requirement.requiredMetrics.map((rm) => {
    const def = metricDefinition(rm.metricId);
    const importance = def?.importance ?? 0.5;
    const lowerIsBetter = def?.lowerIsBetter ?? false;

    const current = rm.currentValue;
    const targetValue = rm.requiredValue;
    let absoluteGap: number | null = null;
    let percentGap: number | null = null;

    if (current != null && targetValue != null) {
      // A "gap" is the improvement still required, and is never negative: if the
      // athlete already meets/exceeds the requirement the gap is zero.
      const rawDelta = lowerIsBetter ? current - targetValue : targetValue - current;
      absoluteGap = Math.max(0, round(rawDelta));
      percentGap = current !== 0 ? round((absoluteGap / Math.abs(current)) * 100) : null;
    }

    // Impact weight blends the (normalized) gap, importance and confidence — this is
    // what makes contribution reflect estimated impact, not raw gap size.
    const gapScore = percentGap != null ? percentGap / 100 : 0;
    const confScore = rm.confidence.score ?? (rm.confidence.category === "measured" ? 1 : 0);
    const impactWeight =
      Math.pow(gapScore, MODEL_PARAMS.impactWeights.gap) *
      Math.pow(importance, MODEL_PARAMS.impactWeights.importance) *
      Math.pow(confScore || 0.01, MODEL_PARAMS.impactWeights.confidence);

    return { rm, def, importance, lowerIsBetter, absoluteGap, percentGap, impactWeight };
  });

  const totalImpact = rows.reduce((s, r) => s + r.impactWeight, 0);

  return rows.map((r): PerformanceGap => {
    const fraction = totalImpact > 0 ? clamp01(r.impactWeight / totalImpact) : null;
    const estimatedTimeGainS =
      fraction != null && totalTimeGapS != null
        ? round(fraction * totalTimeGapS * MODEL_PARAMS.timeGainSensitivity)
        : null;

    const contributionConf: Confidence =
      fraction == null
        ? unknown("insufficient data to estimate contribution")
        : propagateConfidence(
            [r.rm.confidence, estimated(0.6, "impact share of total improvement")],
            "estimated contribution to the goal",
          );

    const contribution: GapContribution = {
      fraction: fraction == null ? null : round(fraction),
      estimatedTimeGainS,
      confidence: contributionConf,
    };

    return {
      metricId: r.rm.metricId,
      label: r.rm.label,
      unit: r.rm.unit,
      currentValue: r.rm.currentValue,
      targetValue: r.rm.requiredValue,
      absoluteGap: r.absoluteGap,
      percentGap: r.percentGap,
      importance: r.importance,
      confidence: r.rm.confidence,
      contribution,
      lowerIsBetter: r.lowerIsBetter,
    };
  });
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
