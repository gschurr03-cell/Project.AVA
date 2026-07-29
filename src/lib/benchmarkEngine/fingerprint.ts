import type { MovementFingerprint } from "@/lib/research/discovery";

export interface FingerprintComparison {
  similarityScore: number | null; sharedCharacteristics: string[];
  majorDifferences: string[]; confidence: "High" | "Moderate" | "Low" | "Unavailable";
  sharedMetrics: string[]; warnings: string[];
}

export function compareMovementFingerprints(
  athlete: MovementFingerprint, reference: MovementFingerprint,
): FingerprintComparison {
  if (athlete.compatibilityKey !== reference.compatibilityKey) return {
    similarityScore: null, sharedCharacteristics: [], majorDifferences: [],
    confidence: "Unavailable", sharedMetrics: [],
    warnings: ["Fingerprint compatibility keys differ."],
  };
  const referenceByMetric = new Map(reference.typicalMetrics.map((metric) => [metric.metric, metric]));
  const pairs = athlete.typicalMetrics.flatMap((metric) => {
    const target = referenceByMetric.get(metric.metric);
    return target && metric.unit === target.unit ? [{ metric, target }] : [];
  });
  if (pairs.length < 2) return {
    similarityScore: null, sharedCharacteristics: [], majorDifferences: [],
    confidence: "Unavailable", sharedMetrics: pairs.map((pair) => pair.metric.metric),
    warnings: ["At least two compatible fingerprint metrics are required."],
  };
  const comparisons = pairs.map(({ metric, target }) => {
    const scale = Math.max(target.standardDeviation, metric.standardDeviation, Math.abs(target.mean) * 0.05, 1e-9);
    const standardizedDifference = Math.abs(metric.mean - target.mean) / scale;
    return { key: metric.metric, standardizedDifference };
  });
  const averageDistance = comparisons.reduce((sum, item) => sum + item.standardizedDifference, 0) / comparisons.length;
  const similarityScore = Number((Math.max(0, 100 * Math.exp(-averageDistance / 2))).toFixed(1));
  return {
    similarityScore,
    sharedCharacteristics: comparisons.filter((item) => item.standardizedDifference <= 0.75).map((item) => item.key),
    majorDifferences: comparisons.filter((item) => item.standardizedDifference >= 1.5).map((item) => item.key),
    confidence: pairs.length >= 5 && athlete.sampleSize >= 5 && reference.sampleSize >= 10
      ? "High" : pairs.length >= 3 ? "Moderate" : "Low",
    sharedMetrics: comparisons.map((item) => item.key),
    warnings: ["Similarity is descriptive and does not imply equivalent performance or training needs."],
  };
}

