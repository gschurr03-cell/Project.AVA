/**
 * Athlete History Engine (Phase 10). Turns a set of analyses into a chronological
 * longitudinal profile and extracts a clean per-metric time series. Every analysis
 * becomes part of the athlete's history; future metadata and future metrics are carried
 * through automatically (the engine iterates whatever keys appear). Pure + deterministic.
 */

import type { AnalysisRecord, AthleteHistory, MetricHistory, TrendPoint } from "./models";
import { metricMeta } from "./config";

export const ATHLETE_HISTORY_VERSION = "ava-athlete-history-v1" as const;

export function buildAthleteHistory(athleteId: string | null, records: AnalysisRecord[]): AthleteHistory {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const tracked = new Set<string>();
  for (const r of sorted) {
    for (const [k, v] of Object.entries(r.metrics)) {
      if (v != null && Number.isFinite(v)) tracked.add(k);
    }
  }
  return {
    version: ATHLETE_HISTORY_VERSION,
    athleteId,
    records: sorted,
    trackedMetrics: [...tracked].sort(),
    firstDate: sorted[0]?.date ?? null,
    lastDate: sorted[sorted.length - 1]?.date ?? null,
  };
}

/** Extract one metric's chronological series (null / non-finite readings dropped). */
export function getMetricHistory(history: AthleteHistory, metricId: string): MetricHistory {
  const meta = metricMeta(metricId);
  const points: TrendPoint[] = history.records
    .map((r): TrendPoint | null => {
      const value = r.metrics[metricId];
      if (value == null || !Number.isFinite(value)) return null;
      return { date: r.date, value, confidence: r.confidence ?? null, recordId: r.id, isCompetition: r.isCompetition };
    })
    .filter((p): p is TrendPoint => p !== null);
  return { metricId, label: meta.label, unit: meta.unit, lowerIsBetter: meta.lowerIsBetter, points };
}

/** Days between two ISO dates (>= 0). */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : 0;
}
