import type { TwinTimelineEvent, TwinTrend } from "./contracts";
import { extractCompatibleReadings } from "./baselines";
import { DIGITAL_TWIN_POLICY } from "./policy";

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
function regression(points: Array<{ occurredAt: string; value: number }>) {
  const origin = Date.parse(points[0].occurredAt);
  const x = points.map((point) => (Date.parse(point.occurredAt) - origin) / 86_400_000);
  const y = points.map((point) => point.value), xm = mean(x), ym = mean(y);
  const denominator = x.reduce((sum, value) => sum + (value - xm) ** 2, 0);
  if (!denominator) return null;
  const slope = x.reduce((sum, value, index) => sum + (value - xm) * (y[index] - ym), 0) / denominator;
  const intercept = ym - slope * xm;
  const residual = Math.sqrt(mean(y.map((value, index) => (value - intercept - slope * x[index]) ** 2)));
  return { slope, residual, mean: ym };
}

export function buildTwinTrends(events: TwinTimelineEvent[]): TwinTrend[] {
  const readings = extractCompatibleReadings(events);
  const groups = new Map<string, typeof readings>();
  readings.forEach((point) => {
    const key = `${point.metric}\u0000${point.unit}\u0000${point.compatibilityKey}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  });
  return [...groups.values()].map((rawPoints) => {
    const points = [...rawPoints].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    const fit = points.length >= DIGITAL_TWIN_POLICY.minimumBaselineSamples ? regression(points) : null;
    if (!fit) return {
      trendId: `trend:${points[0].metric}:${points[0].compatibilityKey}`,
      trendKind: "metric" as const, metric: points[0].metric, unit: points[0].unit, classification: "unknown" as const,
      compatibilityKey: points[0].compatibilityKey, slopePer30Days: null, confidence: 0,
      sampleSize: points.length, sourceEventIds: points.map((point) => point.eventId),
      warnings: ["At least three compatible measurements across time are required."],
    };
    const relative = (fit.slope * 30) / Math.max(Math.abs(fit.mean), 1e-9);
    const variation = fit.residual / Math.max(Math.abs(fit.mean), 1e-9);
    const sourceEvent = events.find((event) => event.eventId === points[0].eventId);
    const metricDirection = sourceEvent?.payload.kind === "analysis"
      ? sourceEvent.payload.metrics.find((metric) => metric.metric === points[0].metric)?.higherIsBetter ?? true
      : true;
    const improvement = relative * (metricDirection ? 1 : -1);
    let classification: TwinTrend["classification"];
    if (variation > DIGITAL_TWIN_POLICY.highVariationCoefficient) classification = "highly_variable";
    else if (improvement < -DIGITAL_TWIN_POLICY.stableRelativeChangePer30Days) classification = "regressing";
    else if (Math.abs(improvement) < 1e-9 && variation < 1e-9) classification = "stable";
    else if (Math.abs(improvement) <= DIGITAL_TWIN_POLICY.stableRelativeChangePer30Days) classification = "plateau";
    else if (improvement >= DIGITAL_TWIN_POLICY.rapidRelativeChangePer30Days) classification = "rapid_adaptation";
    else classification = "improving";
    if (points.length >= 6 && classification === "improving") {
      const middle = Math.floor(points.length / 2), early = regression(points.slice(0, middle)), late = regression(points.slice(middle));
      if (early && late) {
        const earlyRelative = Math.abs(early.slope * 30 / Math.max(Math.abs(early.mean), 1e-9));
        const lateImprovement = late.slope * 30 / Math.max(Math.abs(late.mean), 1e-9) * (metricDirection ? 1 : -1);
        if (earlyRelative <= DIGITAL_TWIN_POLICY.stableRelativeChangePer30Days &&
          lateImprovement > DIGITAL_TWIN_POLICY.stableRelativeChangePer30Days) classification = "delayed_adaptation";
      }
    }
    return {
      trendId: `trend:${points[0].metric}:${points[0].compatibilityKey}`,
      trendKind: "metric" as const, metric: points[0].metric, unit: points[0].unit, classification,
      compatibilityKey: points[0].compatibilityKey,
      slopePer30Days: Number((fit.slope * 30).toFixed(6)),
      confidence: Number((Math.min(1, points.length / DIGITAL_TWIN_POLICY.highBaselineSamples) *
        Math.max(0, 1 - variation)).toFixed(3)),
      sampleSize: points.length, sourceEventIds: points.map((point) => point.eventId),
      warnings: ["Trend is descriptive and does not establish cause."],
    };
  }).sort((a, b) => a.metric.localeCompare(b.metric));
}
