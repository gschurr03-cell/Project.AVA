/**
 * Development Score engine (Phase 5). Estimates how close the athlete currently is to
 * their individualized blueprint — per development area and overall. These are coaching
 * metrics, not absolute truths: each score carries confidence, and a metric with no
 * target or no current value is excluded rather than guessed. Pure + deterministic.
 */

import { type Confidence, clamp01, estimated, propagateConfidence, unknown } from "../models";
import type { BlueprintMetric, DevelopmentArea, ProgressScore } from "./models";
import { DEVELOPMENT_AREAS, METRIC_TARGET_CONFIG } from "./config";

export const DEVELOPMENT_SCORE_VERSION = "ava-development-score-v1" as const;

/** Score one metric 0..1 by how close its current value is to the target range. */
export function metricScore(metric: BlueprintMetric): number | null {
  const { currentValue, targetRange } = metric;
  const cfg = METRIC_TARGET_CONFIG.find((c) => c.metricId === metric.metricId);
  if (currentValue == null || targetRange.min == null || targetRange.max == null) return null;
  const lowerIsBetter = cfg?.lowerIsBetter ?? false;

  if (lowerIsBetter) {
    // 1.0 when at/below the target max (better), scaling down as it rises above.
    if (currentValue <= targetRange.max) return 1;
    return clamp01(targetRange.max / currentValue);
  }
  // Higher is better: 1.0 when at/above the target min; scale from a floor of 60%.
  if (currentValue >= targetRange.min) return 1;
  const floor = targetRange.min * 0.6;
  return clamp01((currentValue - floor) / (targetRange.min - floor));
}

export function buildProgressScores(metrics: BlueprintMetric[]): ProgressScore[] {
  return DEVELOPMENT_AREAS.map((area): ProgressScore => {
    const areaMetricIds = new Set(METRIC_TARGET_CONFIG.filter((c) => c.area === area.id).map((c) => c.metricId));
    const scored = metrics
      .filter((m) => areaMetricIds.has(m.metricId))
      .map((m) => ({ m, s: metricScore(m) }))
      .filter((x): x is { m: BlueprintMetric; s: number } => x.s != null);

    if (scored.length === 0) {
      return { areaId: area.id, label: area.label, scorePct: 0, confidence: unknown("no scored metrics in this area"), contributingMetrics: [] };
    }
    const avg = scored.reduce((sum, x) => sum + x.s, 0) / scored.length;
    const confidence: Confidence = propagateConfidence(
      [...scored.map((x) => x.m.targetRange.confidence), estimated(0.7, "development score is a coaching estimate")],
      "closeness to individualized blueprint",
    );
    return {
      areaId: area.id,
      label: area.label,
      scorePct: Math.round(avg * 100),
      confidence,
      contributingMetrics: scored.map((x) => x.m.metricId),
    };
  });
}

export function overallCompletion(scores: ProgressScore[]): number {
  let total = 0;
  let weight = 0;
  for (const area of DEVELOPMENT_AREAS) {
    const s = scores.find((x) => x.areaId === area.id);
    if (!s || s.confidence.category === "unknown") continue;
    total += s.scorePct * area.weight;
    weight += area.weight;
  }
  return weight > 0 ? Math.round(total / weight) : 0;
}

/** Development areas ranked by the LARGEST remaining difference first. */
export function buildDevelopmentAreas(scores: ProgressScore[]): DevelopmentArea[] {
  return scores
    .filter((s) => s.confidence.category !== "unknown")
    .slice()
    .sort((a, b) => a.scorePct - b.scorePct || a.areaId.localeCompare(b.areaId))
    .map((s, i) => ({
      areaId: s.areaId,
      label: s.label,
      scorePct: s.scorePct,
      gapDescription: `${s.label} is at ~${s.scorePct}% of the individualized blueprint.`,
      priority: i + 1,
    }));
}
