import type { AthleteComparisonContext, BenchmarkDataset } from "./contracts";

export interface SimilarityResult {
  datasetId: string; score: number; confidence: "High" | "Moderate" | "Low" | "Unavailable";
  matchedFactors: string[]; missingFactors: string[]; disqualifyingFactors: string[];
  trace: string[];
}
const within = (value: number | null, range: { minimum: number; maximum: number } | null) =>
  value != null && range != null && value >= range.minimum && value <= range.maximum;

export function scorePopulationSimilarity(
  athlete: AthleteComparisonContext, dataset: BenchmarkDataset,
): SimilarityResult {
  const hard: string[] = [];
  if (!dataset.population.sex.includes(athlete.sex) && !dataset.population.sex.includes("mixed")) hard.push("sex");
  if (!athlete.event || !dataset.population.events.includes(athlete.event)) hard.push("event");
  if (!dataset.entries.some((entry) => entry.phase === athlete.phase)) hard.push("phase");
  if (hard.length) return {
    datasetId: dataset.datasetId, score: 0, confidence: "Unavailable",
    matchedFactors: [], missingFactors: [], disqualifyingFactors: hard,
    trace: hard.map((item) => `${item}:hard_filter_failed`),
  };
  const factors: Array<[string, number, boolean | null]> = [
    ["sex", 20, true], ["event", 20, true], ["phase", 15, true],
    ["age", 8, athlete.age == null || !dataset.population.ageRange ? null : within(athlete.age, dataset.population.ageRange)],
    ["height", 5, athlete.heightCm == null || !dataset.population.heightRangeCm ? null : within(athlete.heightCm, dataset.population.heightRangeCm)],
    ["weight", 5, athlete.weightKg == null || !dataset.population.weightRangeKg ? null : within(athlete.weightKg, dataset.population.weightRangeKg)],
    ["competition_level", 10, athlete.competitionLevel == null ? null : dataset.population.competitionLevels.includes(athlete.competitionLevel)],
    ["performance_range", 8, athlete.personalRecord == null || !dataset.population.performanceRange ? null : within(athlete.personalRecord, dataset.population.performanceRange)],
    ["training_age", 4, athlete.trainingAgeYears == null || !dataset.population.trainingAgeRangeYears ? null : within(athlete.trainingAgeYears, dataset.population.trainingAgeRangeYears)],
    ["surface", 3, athlete.surface == null || !dataset.population.surfaces.length ? null : dataset.population.surfaces.includes(athlete.surface)],
    ["environment", 2, athlete.environment == null || !dataset.population.environments.length ? null : dataset.population.environments.includes(athlete.environment)],
  ];
  const known = factors.filter(([, , value]) => value != null);
  const availableWeight = known.reduce((sum, [, weight]) => sum + weight, 0);
  const matchedWeight = known.filter(([, , value]) => value).reduce((sum, [, weight]) => sum + weight, 0);
  const score = availableWeight ? Number(((matchedWeight / availableWeight) * 100).toFixed(1)) : 0;
  const coverage = factors.length ? known.length / factors.length : 0;
  return {
    datasetId: dataset.datasetId, score,
    confidence: coverage >= 0.8 ? "High" : coverage >= 0.55 ? "Moderate" : "Low",
    matchedFactors: known.filter(([, , value]) => value).map(([name]) => name),
    missingFactors: factors.filter(([, , value]) => value == null).map(([name]) => name),
    disqualifyingFactors: [],
    trace: factors.map(([name, weight, value]) => `${name}:${value == null ? "unknown" : value ? "match" : "mismatch"}:weight=${weight}`),
  };
}

