/**
 * Improvement Attribution (Phase 10). Estimates which metric improvements contributed most
 * to a performance gain over a window — e.g. "of the 100 m improvement, peak velocity ~45%,
 * ground contact ~25%, stride length ~20%, other ~10%". Contributions are weighted by each
 * metric's own improvement and its Phase 4 downstream sensitivity, with a reserved "other"
 * share so the estimate stays honest. Every share carries confidence. Pure + deterministic.
 */

import { type Confidence, estimated, propagateConfidence } from "../models";
import type { SensitivityScore } from "../dependency/models";
import type { AthleteHistory, ImprovementAttribution, ImprovementContribution } from "./models";
import { getMetricHistory } from "./history";
import { metricMeta, ATTRIBUTION } from "./config";
import { round } from "./stats";

export const ATTRIBUTION_ENGINE_VERSION = "ava-progress-attribution-v1" as const;

export interface AttributionInput {
  history: AthleteHistory;
  /** The performance outcome to attribute (default averageVelocity). */
  performanceMetric?: string;
  sensitivity?: SensitivityScore[];
}

export function attributeImprovement(input: AttributionInput): ImprovementAttribution | null {
  const performanceMetric = input.performanceMetric ?? "averageVelocity";
  const perf = getMetricHistory(input.history, performanceMetric);
  if (perf.points.length < 2) return null;

  const fromDate = perf.points[0].date;
  const toDate = perf.points[perf.points.length - 1].date;
  const perfDeltaPct = towardBetterPct(perf.points[0].value, perf.points[perf.points.length - 1].value, perf.lowerIsBetter);

  // Weight each driver metric by its own improvement × downstream sensitivity.
  const weighted: { metricId: string; weight: number; improved: boolean; conf: Confidence }[] = [];
  for (const metricId of ATTRIBUTION.driverMetrics) {
    if (metricId === performanceMetric) continue;
    const mh = getMetricHistory(input.history, metricId);
    if (mh.points.length < 2) continue;
    const deltaPct = towardBetterPct(mh.points[0].value, mh.points[mh.points.length - 1].value, mh.lowerIsBetter);
    if (Math.abs(deltaPct) < ATTRIBUTION.minImprovementPct) continue;
    const sens = input.sensitivity?.find((s) => s.metricId === metricId);
    const sensitivity = sens?.sensitivity ?? 0.4;
    const weight = Math.max(0, deltaPct) * sensitivity; // only improvements contribute to gains
    if (weight <= 0) continue;
    weighted.push({ metricId, weight, improved: deltaPct >= 0, conf: sens?.confidence ?? estimated(0.5, "sensitivity default") });
  }

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  const contributions: ImprovementContribution[] = [];
  if (totalWeight > 0) {
    const explained = 1 - ATTRIBUTION.otherFraction;
    for (const w of weighted.sort((a, b) => b.weight - a.weight || a.metricId.localeCompare(b.metricId))) {
      contributions.push({
        metricId: w.metricId,
        label: metricMeta(w.metricId).label,
        contributionPct: round((w.weight / totalWeight) * explained * 100, 1),
        direction: w.improved ? "improved" : "declined",
        confidence: propagateConfidence([w.conf, estimated(0.6, "improvement attribution is an estimate")], "share of the observed performance gain"),
      });
    }
    contributions.push({
      metricId: "other",
      label: "Other / unattributed",
      contributionPct: round(ATTRIBUTION.otherFraction * 100, 1),
      direction: "improved",
      confidence: estimated(0.4, "residual not explained by tracked drivers"),
    });
  }

  return {
    fromDate,
    toDate,
    performanceMetric,
    performanceDeltaPct: round(perfDeltaPct, 2),
    contributions,
  };
}

function towardBetterPct(first: number, last: number, lowerIsBetter: boolean): number {
  const raw = ((last - first) / (Math.abs(first) || 1)) * 100;
  return lowerIsBetter ? -raw : raw;
}
