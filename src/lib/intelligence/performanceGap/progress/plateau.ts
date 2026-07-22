/**
 * Plateau Detection (Phase 10). Flags a metric that has shown no meaningful improvement
 * across several analyses, with a stored confidence, and points to likely contributing
 * factors by LINKING to the other engines (Root Cause, Metric Dependency, Blueprint,
 * Intervention) rather than re-deriving their logic. Pure + deterministic.
 */

import { type Confidence, estimated, inferred, unknown } from "../models";
import type { SensitivityScore } from "../dependency/models";
import type { MetricHistory, Plateau, ProgressTrend } from "./models";
import { metricMeta, TREND } from "./config";

export const PLATEAU_ENGINE_VERSION = "ava-progress-plateau-v1" as const;

export interface PlateauInput {
  history: MetricHistory;
  trend: ProgressTrend;
  /** Optional Phase 4 sensitivity — used to name likely contributing metrics. */
  sensitivity?: SensitivityScore[];
}

export function detectPlateau(input: PlateauInput): Plateau {
  const { history, trend } = input;
  const n = history.points.length;
  const label = history.label;

  const detected = trend.status === "plateaued";
  const spanned = detected ? n : 0;
  const sinceDate = detected && n > 0 ? history.points[0].date : null;

  const confidence: Confidence = !detected
    ? unknown("no plateau detected")
    : n >= TREND.minPointsForPlateau + 2
      ? estimated(clamp01(0.6 + 0.05 * (n - TREND.minPointsForPlateau)), `no meaningful change across ${n} analyses`)
      : inferred(0.5, `flat across ${n} analyses (limited history)`);

  const likelyFactors = detected ? likelyContributors(history.metricId, input.sensitivity) : [];

  return {
    metricId: history.metricId,
    label,
    detected,
    analysesSpanned: spanned,
    sinceDate,
    confidence,
    likelyFactors,
    note: detected
      ? `${label} appears to have plateaued across ${n} analyses — investigate the linked factors before changing course.`
      : `${label} is not currently plateaued.`,
  };
}

/** Name likely contributing metrics via the dependency graph, linked to source engines. */
function likelyContributors(metricId: string, sensitivity?: SensitivityScore[]): Plateau["likelyFactors"] {
  const factors: Plateau["likelyFactors"] = [];
  // Metrics whose downstream influence reaches this metric are candidate levers.
  const influencers = (sensitivity ?? [])
    .filter((s) => s.affectedMetrics.some((a) => a.metricId === metricId))
    .sort((a, b) => b.sensitivity - a.sensitivity)
    .slice(0, 3);
  for (const s of influencers) {
    factors.push({
      metricId: s.metricId,
      label: metricMeta(s.metricId).label,
      linkedEngine: "metric-dependency",
      note: `${metricMeta(s.metricId).label} strongly influences ${metricMeta(metricId).label} (Phase 4).`,
    });
  }
  // Always link to the associative and blueprint engines for root-cause + target context.
  factors.push({ metricId, label: metricMeta(metricId).label, linkedEngine: "root-cause", note: "See the Root Cause engine for associated mechanics." });
  factors.push({ metricId, label: metricMeta(metricId).label, linkedEngine: "intervention", note: "See the Intervention engine for educational levers commonly associated with this metric." });
  return factors;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
