/**
 * Performance Timeline (Phase 10). A chronological, filterable view of the athlete's
 * analyses supporting metric overlays (one or many), session filtering (competition vs
 * training), and per-entry annotations (coach notes are a future hook). Pure + deterministic.
 */

import type { AthleteHistory, PerformanceTimeline, TimelineEntry } from "./models";

export const TIMELINE_ENGINE_VERSION = "ava-progress-timeline-v1" as const;

export function buildTimeline(history: AthleteHistory, metricIds?: string[]): PerformanceTimeline {
  const metrics = metricIds && metricIds.length ? [...metricIds] : [...history.trackedMetrics];
  const entries: TimelineEntry[] = history.records.map((r) => {
    const picked: Record<string, number | null> = {};
    for (const m of metrics) picked[m] = r.metrics[m] ?? null;
    const annotations = Array.isArray(r.metadata?.annotations) ? (r.metadata!.annotations as string[]) : [];
    return {
      date: r.date,
      recordId: r.id,
      sessionType: r.sessionType,
      isCompetition: r.isCompetition,
      metrics: picked,
      recordingQuality: r.recordingQuality ?? null,
      annotations,
    };
  });
  return { athleteId: history.athleteId, metrics, entries };
}

/** Filter a timeline to competition-only or training-only sessions. */
export function filterTimeline(timeline: PerformanceTimeline, opts: { competitionOnly?: boolean; trainingOnly?: boolean }): PerformanceTimeline {
  let entries = timeline.entries;
  if (opts.competitionOnly) entries = entries.filter((e) => e.isCompetition);
  if (opts.trainingOnly) entries = entries.filter((e) => !e.isCompetition);
  return { ...timeline, entries };
}
