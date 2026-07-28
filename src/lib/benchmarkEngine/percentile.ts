import type { BenchmarkEntry } from "./contracts";

export interface PercentileDecision {
  percentile: number | null; message: string;
  absoluteDistance: number | null; standardizedDistance: number | null;
  trace: string[];
}

export function calculateCompatiblePercentile(
  value: number | null, entry: BenchmarkEntry, compatible: boolean,
): PercentileDecision {
  if (!compatible || value == null) return {
    percentile: null, message: "No valid percentile available.",
    absoluteDistance: null, standardizedDistance: null,
    trace: [!compatible ? "blocked:incompatible_dataset" : "blocked:missing_value"],
  };
  const points = Object.entries(entry.percentiles)
    .map(([percentile, point]) => ({ percentile: Number(percentile), value: point }))
    .sort((a, b) => a.value - b.value);
  if (points.length < 2) return {
    percentile: null, message: "No valid percentile available.",
    absoluteDistance: entry.median == null ? null : value - entry.median,
    standardizedDistance: entry.mean != null && entry.standardDeviation
      ? (value - entry.mean) / entry.standardDeviation : null,
    trace: ["blocked:insufficient_distribution"],
  };
  let percentile: number;
  if (value <= points[0].value) percentile = points[0].percentile;
  else if (value >= points.at(-1)!.value) percentile = points.at(-1)!.percentile;
  else {
    const upperIndex = points.findIndex((point) => point.value >= value);
    const lower = points[upperIndex - 1], upper = points[upperIndex];
    const fraction = upper.value === lower.value ? 0 : (value - lower.value) / (upper.value - lower.value);
    percentile = lower.percentile + fraction * (upper.percentile - lower.percentile);
  }
  return {
    percentile: Number(percentile.toFixed(1)),
    message: `Compatible population percentile: ${Number(percentile.toFixed(1))}.`,
    absoluteDistance: entry.median == null ? null : Number((value - entry.median).toFixed(4)),
    standardizedDistance: entry.mean != null && entry.standardDeviation
      ? Number(((value - entry.mean) / entry.standardDeviation).toFixed(3)) : null,
    trace: [`points:${points.length}`, "method:linear_interpolation"],
  };
}

