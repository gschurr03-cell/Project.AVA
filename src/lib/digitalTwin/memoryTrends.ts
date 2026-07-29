import type { TwinTimelineEvent, TwinTrend } from "./contracts";

const byTime = (a: TwinTimelineEvent, b: TwinTimelineEvent) =>
  a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId);

export function buildMemoryTrends(events: TwinTimelineEvent[]): TwinTrend[] {
  const trends: TwinTrend[] = [];
  const recommendations = new Map<string, TwinTimelineEvent[]>();
  const priorities = new Map<string, TwinTimelineEvent[]>();
  const strengths = new Map<string, TwinTimelineEvent[]>();
  for (const event of events) {
    if (event.payload.kind === "recommendation")
      recommendations.set(event.payload.recommendationKey, [...(recommendations.get(event.payload.recommendationKey) ?? []), event]);
    if (event.payload.kind === "priority") {
      priorities.set(event.payload.category, [...(priorities.get(event.payload.category) ?? []), event]);
      if (event.payload.priorityKind === "strength")
        strengths.set(event.payload.category, [...(strengths.get(event.payload.category) ?? []), event]);
    }
    if (event.payload.kind === "validated_change" && event.payload.direction === "improved")
      strengths.set(event.payload.metric, [...(strengths.get(event.payload.metric) ?? []), event]);
  }

  for (const [key, raw] of recommendations) {
    const points = [...raw].sort(byTime).flatMap((event) => {
      if (event.payload.kind !== "recommendation" || event.payload.implementationStatus === "unknown") return [];
      return [{ event, value: event.payload.implementationStatus === "implemented" ? 1 :
        event.payload.implementationStatus === "partial" ? 0.5 : 0 }];
    });
    const change = points.length >= 2 ? points.at(-1)!.value - points[0].value : null;
    trends.push({
      trendId: `recommendation-adherence:${key}`, trendKind: "recommendation_adherence",
      metric: key, unit: "adherence_ratio",
      classification: change == null ? "unknown" : change > 0 ? "improving" : change < 0 ? "regressing" : "stable",
      compatibilityKey: null, slopePer30Days: null,
      confidence: points.length ? Number((points.reduce((sum, point) => sum + point.event.confidence, 0) / points.length * Math.min(1, points.length / 3)).toFixed(3)) : 0,
      sampleSize: points.length, sourceEventIds: points.map((point) => point.event.eventId),
      warnings: ["Adherence is recorded coach context and does not establish intervention effectiveness."],
    });
  }
  for (const [category, raw] of priorities) {
    const points = [...raw].sort(byTime);
    trends.push({
      trendId: `priority-recurrence:${category}`, trendKind: "priority_recurrence",
      metric: category, unit: "occurrences",
      classification: points.length >= 3 ? "recurring" : "unknown",
      compatibilityKey: null, slopePer30Days: null,
      confidence: Number((Math.min(...points.map((event) => event.confidence)) * Math.min(1, points.length / 3)).toFixed(3)),
      sampleSize: points.length, sourceEventIds: points.map((event) => event.eventId),
      warnings: ["Recurrence describes stored priorities and does not prove a persistent biomechanical cause."],
    });
  }
  for (const [key, raw] of strengths) {
    const points = [...raw].sort(byTime);
    trends.push({
      trendId: `strength:${key}`, trendKind: "strength", metric: key, unit: "evidence_events",
      classification: points.length >= 2 ? "stable" : "unknown",
      compatibilityKey: null, slopePer30Days: null,
      confidence: Number((points.reduce((sum, event) => sum + event.confidence, 0) / points.length * Math.min(1, points.length / 2)).toFixed(3)),
      sampleSize: points.length, sourceEventIds: points.map((event) => event.eventId),
      warnings: ["Strength evolution reflects stored validated improvements or explicit strength priorities only."],
    });
  }
  return trends.sort((a, b) => a.trendId.localeCompare(b.trendId));
}

