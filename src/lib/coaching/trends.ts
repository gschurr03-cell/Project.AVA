import { analysisMetricsSchema, type AnalysisMetrics } from "@/lib/biomechanics/types";

import { generateCoachingReport } from "./report";

/** Chart-ready trend series derived from an athlete's completed analyses. */
export interface AthleteTrendData {
  labels: string[];
  techniqueScores: number[];
  groundContactTimes: number[];
  flightTimes: number[];
  strideFrequencies: number[];
}

export type TrendDirection = "improving" | "declining" | "plateauing" | "insufficient";
export type TrendConfidence = "high" | "medium" | "low";

/** A meaningful read on a metric's trajectory over sessions (Day 76). */
export interface TrendSignal {
  direction: TrendDirection;
  /** Least-squares change PER SESSION, in the metric's own unit. */
  ratePerSession: number;
  /** Net percent change first → latest. */
  changePct: number;
  confidence: TrendConfidence;
  /** One-line coach-facing read, e.g. "Improving — up 4% over 5 sessions". */
  summary: string;
}

/** Below this net change (%) a series is treated as flat/plateauing. */
const TREND_FLAT_PCT = 3;

/** Least-squares slope of values vs their index (change per session). */
function slopePerSession(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += values[i]; sxx += i * i; sxy += i * values[i];
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

/**
 * Turn a metric series into a meaningful trend signal — direction (respecting
 * whether higher or lower is better), rate of change per session, net percent
 * change, and a confidence from the sample size. Pure. This is the read the
 * dashboard/PB-forecast will build on; it never invents a direction from a single
 * point (returns `insufficient`).
 */
export function analyzeTrend(
  values: number[],
  opts: { higherIsBetter: boolean; unit?: string },
): TrendSignal {
  const n = values.length;
  if (n < 2) {
    return { direction: "insufficient", ratePerSession: 0, changePct: 0, confidence: "low", summary: "Not enough sessions yet — analyze more to reveal a trend." };
  }
  const first = values[0];
  const last = values[n - 1];
  const changePct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const slope = slopePerSession(values);
  const improving = opts.higherIsBetter ? slope > 0 : slope < 0;

  const direction: TrendDirection =
    Math.abs(changePct) < TREND_FLAT_PCT ? "plateauing" : improving ? "improving" : "declining";
  const confidence: TrendConfidence = n >= 5 ? "high" : n >= 3 ? "medium" : "low";

  const unit = opts.unit ? ` ${opts.unit}` : "";
  const summary =
    direction === "plateauing"
      ? `Plateauing — roughly flat across ${n} sessions.`
      : `${direction === "improving" ? "Improving" : "Declining"} — ${changePct >= 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(0)}% over ${n} sessions (~${slope >= 0 ? "+" : ""}${slope.toFixed(2)}${unit}/session).`;

  return { direction, ratePerSession: Number(slope.toFixed(3)), changePct: Number(changePct.toFixed(1)), confidence, summary };
}

/** Minimal shape of a completed analysis row this helper needs. */
export interface TrendAnalysisInput {
  id: string;
  created_at: string;
  metrics: unknown;
}

/** At-a-glance progress read for one athlete (Day 76 dashboard). Pure. */
export interface AthleteSnapshot {
  sessionsAnalyzed: number;
  latestTechnique: number | null;
  /** Technique-score trajectory (higher is better). */
  techniqueTrend: TrendSignal;
}

/**
 * Condense an athlete's completed analyses into a dashboard snapshot: how many
 * sessions are analyzed, the latest technique score, and its trend. Reuses the
 * same trend engine the athlete page shows, so the command-center card and the
 * detail page never disagree. Pure — no I/O.
 */
export function summarizeAthlete(analyses: TrendAnalysisInput[]): AthleteSnapshot {
  const scores = buildAthleteTrends(analyses).techniqueScores;
  return {
    sessionsAnalyzed: scores.length,
    latestTechnique: scores.length ? scores[scores.length - 1] : null,
    techniqueTrend: analyzeTrend(scores, { higherIsBetter: true }),
  };
}

/** Map validated analysis metrics onto the coaching engine's metric keys. */
function toCoachingMetrics(data: AnalysisMetrics) {
  return {
    stepFrequency: data.strideFrequencyHz,
    groundContactTime: data.groundContactTimeMs,
    flightTime: data.flightTimeMs,
    strideLength: data.avgStrideLengthM,
  };
}

/** Short month/day label for a session, e.g. "Jul 2". */
function formatLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Convert a list of completed analyses into chart-ready trend series. Pure: no
 * side effects, no I/O (the input array is copied, never mutated). Analyses whose
 * `metrics` fail validation are skipped entirely, so every returned array stays
 * the same length and index-aligned. Series run oldest → newest.
 */
export function buildAthleteTrends(analyses: TrendAnalysisInput[]): AthleteTrendData {
  const trends: AthleteTrendData = {
    labels: [],
    techniqueScores: [],
    groundContactTimes: [],
    flightTimes: [],
    strideFrequencies: [],
  };

  const sorted = [...analyses].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const analysis of sorted) {
    const parsed = analysisMetricsSchema.safeParse(analysis.metrics);
    if (!parsed.success) continue;

    const report = generateCoachingReport(toCoachingMetrics(parsed.data), analysis.id);

    trends.labels.push(formatLabel(analysis.created_at));
    trends.techniqueScores.push(report.techniqueScore);
    trends.groundContactTimes.push(parsed.data.groundContactTimeMs);
    trends.flightTimes.push(parsed.data.flightTimeMs);
    trends.strideFrequencies.push(parsed.data.strideFrequencyHz);
  }

  return trends;
}
