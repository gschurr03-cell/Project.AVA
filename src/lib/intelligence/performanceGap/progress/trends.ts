/**
 * Trend Analysis + Detection (Phase 10). Computes a trend for every measurable metric and
 * classifies it — improving, stable, declining, inconsistent, plateaued, rapid improvement,
 * or rapid regression — with a stored confidence. "Better" is metric-aware (lower is better
 * for contact time / symmetry, etc.), and small changes are treated as noise so AVA never
 * overreacts to one analysis. Pure + deterministic.
 */

import { type Confidence, estimated, inferred, unknown } from "../models";
import type { AthleteHistory, MetricHistory, ProgressTrend, TrendStatus } from "./models";
import { getMetricHistory, daysBetween } from "./history";
import { TREND, DEFAULT_DAYS_BETWEEN } from "./config";
import { regression, round } from "./stats";

export const TREND_ENGINE_VERSION = "ava-progress-trends-v1" as const;

export function computeAllTrends(history: AthleteHistory): ProgressTrend[] {
  return history.trackedMetrics.map((id) => computeTrend(getMetricHistory(history, id))).sort((a, b) => a.metricId.localeCompare(b.metricId));
}

export function computeTrend(mh: MetricHistory): ProgressTrend {
  const points = mh.points;
  const n = points.length;
  const base = {
    metricId: mh.metricId,
    label: mh.label,
    unit: mh.unit,
    points,
  };

  if (n < TREND.minPointsForTrend) {
    return { ...base, status: "insufficient_data", slopePerAnalysis: null, slopePerWeek: null, percentChange: null, fitQuality: null, confidence: unknown("not enough analyses to establish a trend"), note: `Only ${n} analysis on record — not enough to establish a trend.` };
  }

  const ys = points.map((p) => p.value);
  const xs = points.map((_, i) => i);
  const reg = regression(xs, ys)!;
  const first = ys[0];
  const last = ys[n - 1];

  const rawPct = ((last - first) / (Math.abs(first) || 1)) * 100;
  const towardBetterPct = mh.lowerIsBetter ? -rawPct : rawPct;
  const perAnalysisPct = towardBetterPct / (n - 1);
  const fit = reg.r2;

  const status = classify(n, towardBetterPct, perAnalysisPct, fit);

  const totalDays = points.length > 1 ? daysBetween(points[0].date, points[n - 1].date) : 0;
  const avgDays = totalDays > 0 ? totalDays / (n - 1) : DEFAULT_DAYS_BETWEEN;
  // Slope toward "better" per analysis / per week.
  const slopeToward = (mh.lowerIsBetter ? -reg.slope : reg.slope);

  return {
    ...base,
    status,
    slopePerAnalysis: round(slopeToward, 5),
    slopePerWeek: round(slopeToward * (7 / (avgDays || DEFAULT_DAYS_BETWEEN)), 5),
    percentChange: round(towardBetterPct, 3),
    fitQuality: round(fit, 3),
    confidence: trendConfidence(points, fit, n),
    note: describe(status, mh.label, round(towardBetterPct, 1), n),
  };

  function classify(n: number, towardPct: number, perAnalysis: number, fit: number): TrendStatus {
    const meaningful = Math.abs(towardPct) >= TREND.noisePct;
    const perAbs = Math.abs(perAnalysis);
    if (perAbs >= TREND.rapidPctPerAnalysis && fit >= 0.5) return towardPct > 0 ? "rapid_improvement" : "rapid_regression";
    if (meaningful && fit < TREND.inconsistentFit) return "inconsistent";
    if (n >= TREND.minPointsForPlateau && perAbs <= TREND.plateauMaxPctPerAnalysis) return "plateaued";
    if (towardPct >= TREND.noisePct && fit >= TREND.inconsistentFit) return "improving";
    if (towardPct <= -TREND.noisePct && fit >= TREND.inconsistentFit) return "declining";
    return "stable";
  }
}

function trendConfidence(points: { confidence: number | null }[], fit: number, n: number): Confidence {
  const confs = points.map((p) => p.confidence).filter((c): c is number => c != null);
  const dataQuality = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : 0.6;
  const pointsFactor = Math.min(1, n / 5);
  const score = clamp01((0.5 * fit + 0.5 * dataQuality) * pointsFactor);
  const rationale = `${n} analyses, fit ${round(fit, 2)}, data quality ${round(dataQuality, 2)}`;
  // Trends are an inference over noisy measurements; keep them honestly non-"measured".
  return fit >= TREND.inconsistentFit ? estimated(score, rationale) : inferred(score, rationale);
}

function describe(status: TrendStatus, label: string, pct: number, n: number): string {
  switch (status) {
    case "improving": return `${label} is improving (${signed(pct)}% toward target across ${n} analyses).`;
    case "declining": return `${label} has declined (${signed(pct)}% across ${n} analyses).`;
    case "plateaued": return `${label} has plateaued — no meaningful change across ${n} analyses.`;
    case "inconsistent": return `${label} is inconsistent — moving but without a clear direction across ${n} analyses.`;
    case "rapid_improvement": return `${label} is improving rapidly (${signed(pct)}% across ${n} analyses).`;
    case "rapid_regression": return `${label} is regressing rapidly (${signed(pct)}% across ${n} analyses).`;
    case "stable": return `${label} is stable across ${n} analyses.`;
    default: return `${label}: insufficient data.`;
  }
}

function signed(p: number): string {
  return `${p >= 0 ? "+" : ""}${p}`;
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
