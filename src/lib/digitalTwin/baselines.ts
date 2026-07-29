import type { MechanicalBaseline, TwinTimelineEvent } from "./contracts";
import { DIGITAL_TWIN_POLICY } from "./policy";

interface Reading {
  eventId: string; occurredAt: string; metric: string; value: number; unit: string;
  confidence: number; compatibilityKey: string;
}
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

export function extractCompatibleReadings(events: TwinTimelineEvent[]): Reading[] {
  return events.flatMap((event) => {
    if (event.payload.kind !== "analysis" || event.payload.status === "experimental" ||
      event.payload.status === "invalid" || !event.compatibilityKey) return [];
    return event.payload.metrics.map((metric) => ({
      eventId: event.eventId, occurredAt: event.occurredAt, metric: metric.metric,
      value: metric.value, unit: metric.unit,
      confidence: Math.min(event.confidence, metric.confidence),
      compatibilityKey: event.compatibilityKey!,
    }));
  });
}

export function buildMechanicalBaselines(events: TwinTimelineEvent[]): MechanicalBaseline[] {
  const readings = extractCompatibleReadings(events);
  const metricGroups = new Map<string, Reading[]>();
  readings.forEach((reading) => {
    const key = `${reading.metric}\u0000${reading.unit}`;
    metricGroups.set(key, [...(metricGroups.get(key) ?? []), reading]);
  });
  return [...metricGroups.values()].flatMap((metricReadings) => {
    const compatibility = new Map<string, Reading[]>();
    metricReadings.forEach((reading) =>
      compatibility.set(reading.compatibilityKey, [...(compatibility.get(reading.compatibilityKey) ?? []), reading]));
    const selected = [...compatibility].sort((a, b) =>
      b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
    if (!selected || selected[1].length < DIGITAL_TWIN_POLICY.minimumBaselineSamples) return [];
    const [compatibilityKey, points] = selected;
    const values = points.map((point) => point.value), average = mean(values);
    const variance = values.length > 1
      ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1) : 0;
    const evidenceConfidence = mean(points.map((point) => point.confidence));
    const sampleConfidence = Math.min(1, points.length / DIGITAL_TWIN_POLICY.highBaselineSamples);
    return [{
      metric: points[0].metric, unit: points[0].unit, compatibilityKey,
      mean: Number(average.toFixed(6)), median: Number(median(values).toFixed(6)),
      variance: Number(variance.toFixed(8)),
      confidence: Number((evidenceConfidence * sampleConfidence).toFixed(3)),
      sampleSize: points.length, lastUpdated: points.at(-1)!.occurredAt,
      sourceEventIds: points.map((point) => point.eventId),
    }];
  }).sort((a, b) => a.metric.localeCompare(b.metric));
}

