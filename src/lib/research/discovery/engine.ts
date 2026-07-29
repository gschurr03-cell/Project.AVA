import {
  DISCOVERY_ENGINE_VERSION, MIN_DISCOVERY_SAMPLE_SIZE, discoveryResultSchema,
  researchSampleSchema, movementFingerprintSchema,
  type Discovery, type DiscoveryResult, type MovementFingerprint, type ResearchSample,
} from "./contracts";
import { mean, pearson, round, stableHash, standardDeviation } from "./statistics";

const unique = (values: string[]) => [...new Set(values)].sort();
const metricMap = (sample: ResearchSample) => new Map(sample.metrics.map((metric) => [metric.key, metric]));
const strength = (value: number): Discovery["statisticalStrength"] =>
  Math.abs(value) >= 0.8 ? "strong" : Math.abs(value) >= 0.6 ? "moderate" : "weak";
const confidence = (sampleSize: number, statisticalStrength: Discovery["statisticalStrength"]): Discovery["confidence"] =>
  sampleSize >= 12 && statisticalStrength === "strong" ? "High"
    : sampleSize >= 8 && statisticalStrength !== "weak" ? "Moderate" : "Low";
const base = (samples: ResearchSample[], generatedAt: string) => ({
  athletesIncluded: unique(samples.map((sample) => sample.athleteId)),
  sessionsIncluded: unique(samples.map((sample) => sample.sessionId)),
  requiresValidation: true as const, experimental: true as const,
  generatedAt, engineVersion: DISCOVERY_ENGINE_VERSION as typeof DISCOVERY_ENGINE_VERSION,
});

export function discoverCorrelations(samples: ResearchSample[], generatedAt: string): Discovery[] {
  const keys = unique(samples.flatMap((sample) => sample.metrics.map((metric) => metric.key)));
  const discoveries: Discovery[] = [];
  for (let left = 0; left < keys.length; left++) for (let right = left + 1; right < keys.length; right++) {
    const paired = samples.flatMap((sample) => {
      const metrics = metricMap(sample);
      const a = metrics.get(keys[left]);
      const b = metrics.get(keys[right]);
      return a && b ? [{ sample, a, b }] : [];
    });
    if (paired.length < MIN_DISCOVERY_SAMPLE_SIZE) continue;
    const coefficient = pearson(paired.map((item) => item.a.value), paired.map((item) => item.b.value));
    if (coefficient == null || Math.abs(coefficient) < 0.5) continue;
    const statisticalStrength = strength(coefficient);
    discoveries.push({
      id: `correlation:${keys[left]}:${keys[right]}:${stableHash(paired.map((item) => item.sample.analysisId))}`,
      title: `${keys[left]} and ${keys[right]} moved ${coefficient >= 0 ? "together" : "in opposite directions"}`,
      description: `An exploratory association of r=${round(coefficient, 3)} appeared in compatible sessions. This is not evidence that either metric causes the other.`,
      discoveryType: "correlation", confidence: confidence(paired.length, statisticalStrength),
      sampleSize: paired.length,
      evidence: [{ metric: "pearson_r", summary: "Exploratory Pearson correlation coefficient.", value: round(coefficient, 4), unit: "r" }],
      metricsUsed: [keys[left], keys[right]], statisticalStrength,
      ...base(paired.map((item) => item.sample), generatedAt),
    });
  }
  return discoveries.sort((a, b) => Math.abs(b.evidence[0].value ?? 0) - Math.abs(a.evidence[0].value ?? 0) || a.id.localeCompare(b.id));
}

function sharedMetricKeys(samples: ResearchSample[]): string[] {
  if (!samples.length) return [];
  return unique(samples[0].metrics.map((metric) => metric.key))
    .filter((key) => samples.every((sample) => metricMap(sample).has(key)))
    .slice(0, 6);
}

export function discoverClusters(samples: ResearchSample[], generatedAt: string): Discovery[] {
  if (samples.length < MIN_DISCOVERY_SAMPLE_SIZE + 1) return [];
  const keys = sharedMetricKeys(samples);
  if (keys.length < 2) return [];
  const means = keys.map((key) => mean(samples.map((sample) => metricMap(sample).get(key)!.value)));
  const deviations = keys.map((key) => standardDeviation(samples.map((sample) => metricMap(sample).get(key)!.value)) || 1);
  const vectors = samples.map((sample) => keys.map((key, index) => (metricMap(sample).get(key)!.value - means[index]) / deviations[index]));
  const distance = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
  const first = vectors.reduce((best, vector, index) =>
    distance(vector, Array(keys.length).fill(0)) > distance(vectors[best], Array(keys.length).fill(0)) ? index : best, 0);
  const second = vectors.reduce((best, vector, index) =>
    distance(vector, vectors[first]) > distance(vectors[best], vectors[first]) ? index : best, 0);
  let centroids = [vectors[first], vectors[second]].map((value) => [...value]);
  let assignments = vectors.map(() => 0);
  for (let iteration = 0; iteration < 20; iteration++) {
    const next = vectors.map((vector) => distance(vector, centroids[0]) <= distance(vector, centroids[1]) ? 0 : 1);
    if (next.every((value, index) => value === assignments[index]) && iteration > 0) break;
    assignments = next;
    centroids = centroids.map((centroid, cluster) => {
      const members = vectors.filter((_, index) => assignments[index] === cluster);
      return members.length ? centroid.map((_, dimension) => mean(members.map((member) => member[dimension]))) : centroid;
    });
  }
  return [0, 1].flatMap((cluster) => {
    const members = samples.filter((_, index) => assignments[index] === cluster);
    if (members.length < 2) return [];
    const centroid = centroids[cluster];
    const defining = centroid.map((value, index) => ({ key: keys[index], value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    return [{
      id: `cluster:${stableHash(members.map((sample) => sample.analysisId).sort())}`,
      title: `Emerging ${defining.key} movement cluster`,
      description: `Compatible sessions formed an exploratory cluster most distinguished by ${defining.key}. Cluster labels are descriptive, not performance rankings.`,
      discoveryType: "cluster" as const,
      confidence: members.length >= 6 ? "Moderate" as const : "Low" as const,
      sampleSize: members.length,
      evidence: [{ metric: defining.key, summary: "Standardized distance from the compatible cohort mean.", value: round(defining.value), unit: "z" }],
      metricsUsed: keys, statisticalStrength: Math.abs(defining.value) >= 1 ? "moderate" as const : "weak" as const,
      ...base(members, generatedAt),
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function discoverOutliers(samples: ResearchSample[], generatedAt: string): Discovery[] {
  if (samples.length < MIN_DISCOVERY_SAMPLE_SIZE) return [];
  const keys = sharedMetricKeys(samples);
  return samples.flatMap((sample) => keys.flatMap((key) => {
    const values = samples.map((item) => metricMap(item).get(key)!.value);
    const deviation = standardDeviation(values);
    if (!deviation) return [];
    const z = (metricMap(sample).get(key)!.value - mean(values)) / deviation;
    if (Math.abs(z) < 2) return [];
    return [{
      id: `outlier:${sample.analysisId}:${key}`,
      title: `Uncommon ${key} value`,
      description: `This session was ${round(Math.abs(z), 2)} standard deviations from its compatible cohort. Recording or analysis error must be excluded before biomechanical interpretation.`,
      discoveryType: "outlier" as const, confidence: samples.length >= 10 ? "Moderate" as const : "Low" as const,
      sampleSize: samples.length,
      evidence: [{ metric: key, summary: "Standardized population distance.", value: round(z), unit: "z" }],
      metricsUsed: [key], statisticalStrength: Math.abs(z) >= 3 ? "strong" as const : "moderate" as const,
      ...base(samples, generatedAt),
    }];
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function generateMovementFingerprints(samples: ResearchSample[]): MovementFingerprint[] {
  const athletes = unique(samples.map((sample) => sample.athleteId));
  return athletes.flatMap((athleteId) => {
    const athleteSamples = samples.filter((sample) => sample.athleteId === athleteId);
    if (athleteSamples.length < 2) return [];
    const keys = sharedMetricKeys(athleteSamples);
    const typicalMetrics = keys.map((key) => {
      const metrics = athleteSamples.map((sample) => metricMap(sample).get(key)!);
      const values = metrics.map((metric) => metric.value);
      const average = mean(values);
      const sd = standardDeviation(values);
      return {
        metric: key, mean: round(average), standardDeviation: round(sd),
        unit: metrics[0].unit, repeatability: round(Math.max(0, Math.min(1, 1 - sd / Math.max(Math.abs(average), 1e-9)))),
      };
    });
    const consistencyScore = typicalMetrics.length
      ? round(mean(typicalMetrics.map((metric) => metric.repeatability)) * 100, 1) : null;
    return [movementFingerprintSchema.parse({
      athleteId, sampleSize: athleteSamples.length, compatibilityKey: athleteSamples[0].compatibilityKey,
      typicalMetrics, consistencyScore, typicalAsymmetryDirection: "unknown",
      confidence: athleteSamples.length >= 5 ? "Moderate" : "Low",
      requiresValidation: true, experimental: true,
    })];
  });
}

export function runDiscovery(rawSamples: ResearchSample[], generatedAt: string): DiscoveryResult {
  const samples = rawSamples.map((sample) => researchSampleSchema.parse(sample))
    .sort((a, b) => a.analysisId.localeCompare(b.analysisId));
  const groups = new Map<string, ResearchSample[]>();
  for (const sample of samples) groups.set(sample.compatibilityKey, [...(groups.get(sample.compatibilityKey) ?? []), sample]);
  const selected = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  if (!selected) return discoveryResultSchema.parse({
    engineVersion: DISCOVERY_ENGINE_VERSION, generatedAt, compatibilityKey: null, sampleSize: 0,
    discoveries: [], fingerprints: [], warnings: ["No trusted compatible research samples are available."],
    inputHash: stableHash([]),
  });
  const [compatibilityKey, compatible] = selected;
  const discoveries = [
    ...discoverCorrelations(compatible, generatedAt),
    ...discoverClusters(compatible, generatedAt),
    ...discoverOutliers(compatible, generatedAt),
  ];
  return discoveryResultSchema.parse({
    engineVersion: DISCOVERY_ENGINE_VERSION, generatedAt, compatibilityKey,
    sampleSize: compatible.length, discoveries,
    fingerprints: generateMovementFingerprints(compatible),
    warnings: [
      ...(compatible.length < MIN_DISCOVERY_SAMPLE_SIZE ? ["The compatible cohort is below the minimum discovery sample size."] : []),
      ...(groups.size > 1 ? [`${groups.size - 1} incompatible cohort group(s) were excluded.`] : []),
      "All discoveries are exploratory and require independent validation.",
    ],
    inputHash: stableHash(compatible),
  });
}
