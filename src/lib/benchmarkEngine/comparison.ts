import {
  BENCHMARK_ENGINE_VERSION, athleteComparisonContextSchema, benchmarkComparisonResultSchema,
  benchmarkDatasetSchema, type AthleteComparisonContext, type BenchmarkComparisonResult,
  type BenchmarkDataset,
} from "./contracts";
import { validateBenchmarkCompatibility } from "./compatibility";
import { calculateCompatiblePercentile } from "./percentile";
import { scorePopulationSimilarity } from "./similarity";

export function compareAthleteToBenchmarks(input: {
  athlete: AthleteComparisonContext; metric: string; value: number | null;
  datasets: BenchmarkDataset[]; generatedAt: string;
}): BenchmarkComparisonResult {
  const athlete = athleteComparisonContextSchema.parse(input.athlete);
  const datasets = input.datasets.map((dataset) => benchmarkDatasetSchema.parse(dataset));
  const unsupported: BenchmarkComparisonResult["unsupportedComparisons"] = [];
  const candidates = datasets.flatMap((dataset) => {
    const entry = dataset.entries.find((item) => item.metric === input.metric);
    if (!entry) {
      unsupported.push({ datasetId: dataset.datasetId, reasons: ["Dataset does not contain this metric."] });
      return [];
    }
    const compatibility = validateBenchmarkCompatibility(athlete, dataset, entry);
    if (!compatibility.compatible) {
      unsupported.push({ datasetId: dataset.datasetId, reasons: compatibility.reasons });
      return [];
    }
    return [{ dataset, entry, compatibility, similarity: scorePopulationSimilarity(athlete, dataset) }];
  }).sort((a, b) => b.similarity.score - a.similarity.score || a.dataset.datasetId.localeCompare(b.dataset.datasetId));
  const selected = candidates[0];
  if (!selected || input.value == null) return benchmarkComparisonResultSchema.parse({
    engineVersion: BENCHMARK_ENGINE_VERSION, athleteId: athlete.athleteId,
    metric: input.metric, athleteValue: input.value,
    closestComparisonPopulation: null, closestBenchmarkGroup: null,
    datasetId: null, datasetVersion: null, percentile: null,
    percentileMessage: "No valid percentile available.", distanceFromBenchmark: null,
    strengths: [], developmentOpportunities: [],
    compatibilityConfidence: "Unavailable", unsupportedComparisons: unsupported,
    matchingTrace: candidates.length ? ["blocked:missing_athlete_value"] : ["blocked:no_compatible_dataset"],
    generatedAt: input.generatedAt,
  });
  const percentile = calculateCompatiblePercentile(input.value, selected.entry, true);
  const definition = selected.dataset.metricDefinitions.find((item) => item.metricKey === input.metric)!;
  const favorable = percentile.percentile != null && definition.higherIsBetter != null
    ? definition.higherIsBetter ? percentile.percentile >= 75 : percentile.percentile <= 25 : false;
  const opportunity = percentile.percentile != null && definition.higherIsBetter != null
    ? definition.higherIsBetter ? percentile.percentile <= 25 : percentile.percentile >= 75 : false;
  return benchmarkComparisonResultSchema.parse({
    engineVersion: BENCHMARK_ENGINE_VERSION, athleteId: athlete.athleteId,
    metric: input.metric, athleteValue: input.value,
    closestComparisonPopulation: selected.dataset.datasetName,
    closestBenchmarkGroup: selected.dataset.comparisonLevel,
    datasetId: selected.dataset.datasetId, datasetVersion: selected.dataset.datasetVersion,
    percentile: percentile.percentile, percentileMessage: percentile.message,
    distanceFromBenchmark: percentile.absoluteDistance == null ? null : {
      absolute: percentile.absoluteDistance, standardized: percentile.standardizedDistance,
      unit: definition.unit,
    },
    strengths: favorable ? [`${definition.displayName} is in a favorable compatible-population range.`] : [],
    developmentOpportunities: opportunity ? [`${definition.displayName} differs from the favorable end of this compatible population.`] : [],
    compatibilityConfidence: selected.compatibility.confidence,
    unsupportedComparisons: unsupported,
    matchingTrace: [
      ...selected.similarity.trace,
      `selected:${selected.dataset.datasetId}:similarity=${selected.similarity.score}`,
      ...percentile.trace,
    ],
    generatedAt: input.generatedAt,
  });
}

