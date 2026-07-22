/**
 * Team Analytics (Phase 11). Aggregates squad-wide insight from the athlete cards and a few
 * optional signals: the most common limitation, most improved metric, most common asymmetry
 * and acceleration issue, overall recording quality, average blueprint completion, and the
 * top shared improvement opportunities. Pure counting + averaging — deterministic.
 */

import type { AthleteSummary, TeamAnalytics } from "./models";
import { metricMeta } from "../progress/config";

export const TEAM_ANALYTICS_VERSION = "ava-coach-team-analytics-v1" as const;

const ACCELERATION_METRICS = new Set(["acceleration", "transitionEfficiency"]);

export interface TeamAnalyticsInput {
  summaries: AthleteSummary[];
  recordingQuality?: { athleteId: string; quality: number }[];
  /** Toward-better percent changes per athlete/metric (e.g. from Phase 10 trends). */
  metricChanges?: { athleteId: string; metricId: string; percentChange: number }[];
  asymmetry?: { athleteId: string; pct: number }[];
  /** All priority limiters across athletes (falls back to each card's top limiter). */
  limiters?: { athleteId: string; metricId: string }[];
}

export function buildTeamAnalytics(input: TeamAnalyticsInput): TeamAnalytics {
  const { summaries } = input;
  const limiters = input.limiters ?? summaries.flatMap((s) => (s.highestPriorityLimiter ? [{ athleteId: s.athleteId, metricId: s.highestPriorityLimiter.metricId }] : []));

  const limiterCounts = countBy(limiters.map((l) => l.metricId));
  const mostCommonLimitation = topEntry(limiterCounts, (metricId, count) => ({ metricId, label: metricMeta(metricId).label, count }));

  const accelLimiters = limiters.filter((l) => ACCELERATION_METRICS.has(l.metricId));
  const accelCounts = countBy(accelLimiters.map((l) => l.metricId));
  const mostCommonAccelerationIssue = topEntry(accelCounts, (metricId, count) => ({ metricId, label: metricMeta(metricId).label, count }));

  const changesByMetric = new Map<string, number[]>();
  for (const c of input.metricChanges ?? []) {
    const arr = changesByMetric.get(c.metricId) ?? [];
    arr.push(c.percentChange);
    changesByMetric.set(c.metricId, arr);
  }
  let mostImprovedMetric: TeamAnalytics["mostImprovedMetric"] = null;
  for (const [metricId, vals] of [...changesByMetric.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const avgChange = mean(vals);
    if (avgChange > 0 && (mostImprovedMetric == null || avgChange > mostImprovedMetric.averagePercentChange)) {
      mostImprovedMetric = { metricId, label: metricMeta(metricId).label, averagePercentChange: round(avgChange, 2) };
    }
  }

  const asymVals = (input.asymmetry ?? []).map((a) => a.pct);
  const mostCommonAsymmetry = asymVals.length ? { count: asymVals.length, averagePct: round(mean(asymVals), 2) } : null;

  const rq = (input.recordingQuality ?? []).map((r) => r.quality);
  const overallRecordingQuality = rq.length ? round(mean(rq), 3) : null;

  const topOpportunities = Object.entries(limiterCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([metricId, count]) => ({
      metricId,
      label: metricMeta(metricId).label,
      athletes: count,
      note: `${count} athlete${count === 1 ? "" : "s"} share ${metricMeta(metricId).label} as their top limiter.`,
    }));

  return {
    athleteCount: summaries.length,
    averageBlueprintCompletion: avgOf(summaries.map((s) => s.blueprintCompletion)),
    averageDevelopmentScore: avgOf(summaries.map((s) => s.developmentScore)),
    overallRecordingQuality,
    mostCommonLimitation,
    mostImprovedMetric,
    mostCommonAsymmetry,
    mostCommonAccelerationIssue,
    topOpportunities,
  };
}

function countBy(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}
function topEntry<T>(counts: Record<string, number>, make: (key: string, count: number) => T): T | null {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.length ? make(sorted[0][0], sorted[0][1]) : null;
}
function avgOf(xs: (number | null)[]): number | null {
  const vals = xs.filter((x): x is number => x != null);
  return vals.length ? round(mean(vals), 1) : null;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
