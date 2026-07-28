import { z } from "zod";

export const BENCHMARK_ENGINE_VERSION = "ava-benchmark-comparison-v1";
export const BENCHMARK_DATASET_SCHEMA_VERSION = "ava-benchmark-dataset-v1";

export const comparisonLevelSchema = z.enum([
  "personal_history", "similar_athletes", "team", "university", "conference",
  "ncaa", "national", "professional", "olympic_world", "custom_group",
]);
export const compatibilityConfidenceSchema = z.enum(["High", "Moderate", "Low", "Unavailable"]);

export const benchmarkPopulationSchema = z.object({
  sex: z.array(z.enum(["female", "male", "mixed", "unknown"])).min(1),
  ageRange: z.object({ minimum: z.number().nonnegative(), maximum: z.number().positive() }).nullable(),
  heightRangeCm: z.object({ minimum: z.number().positive(), maximum: z.number().positive() }).nullable(),
  weightRangeKg: z.object({ minimum: z.number().positive(), maximum: z.number().positive() }).nullable(),
  events: z.array(z.string()).min(1),
  competitionLevels: z.array(z.string()).min(1),
  performanceRange: z.object({ minimum: z.number(), maximum: z.number(), unit: z.string() }).nullable(),
  trainingAgeRangeYears: z.object({ minimum: z.number().nonnegative(), maximum: z.number().positive() }).nullable(),
  surfaces: z.array(z.string()),
  environments: z.array(z.string()),
  organization: z.string().nullable(),
});
export type BenchmarkPopulation = z.infer<typeof benchmarkPopulationSchema>;

export const benchmarkMetricDefinitionSchema = z.object({
  metricKey: z.string().min(1), displayName: z.string().min(1), unit: z.string(),
  definitionVersion: z.string().min(1), calculationFamily: z.string().min(1),
  eventDefinition: z.string().min(1), higherIsBetter: z.boolean().nullable(),
});

export const benchmarkEntrySchema = z.object({
  entryId: z.string().min(1), metric: z.string().min(1),
  distribution: z.enum(["normal_summary", "empirical_percentiles", "unknown"]),
  mean: z.number().finite().nullable(), median: z.number().finite().nullable(),
  percentiles: z.record(z.coerce.number().min(0).max(100), z.number().finite()),
  standardDeviation: z.number().nonnegative().nullable(),
  minimum: z.number().finite().nullable(), maximum: z.number().finite().nullable(),
  confidenceInterval: z.object({ lower: z.number(), upper: z.number(), level: z.number().min(0).max(1) }).nullable(),
  populationSize: z.number().int().positive(), measurementMethod: z.string().min(1),
  measurementProtocolVersion: z.string().min(1), timingSystem: z.string().min(1),
  sourceFrameRateClass: z.string().min(1), metricDefinitionVersion: z.string().min(1),
  phase: z.string().min(1), event: z.string().min(1),
  sex: z.enum(["female", "male", "mixed", "unknown"]),
  ageRange: z.object({ minimum: z.number().nonnegative(), maximum: z.number().positive() }).nullable(),
  performanceLevel: z.string().min(1),
}).superRefine((entry, ctx) => {
  const points = Object.keys(entry.percentiles).map(Number);
  if (entry.distribution === "empirical_percentiles" && points.length < 2)
    ctx.addIssue({ code: "custom", message: "Empirical percentile entries require at least two percentile points." });
  if (entry.minimum != null && entry.maximum != null && entry.minimum > entry.maximum)
    ctx.addIssue({ code: "custom", message: "Benchmark minimum cannot exceed maximum." });
});
export type BenchmarkEntry = z.infer<typeof benchmarkEntrySchema>;

export const benchmarkDatasetSchema = z.object({
  datasetId: z.string().min(1), datasetName: z.string().min(1),
  datasetVersion: z.string().min(1), schemaVersion: z.literal(BENCHMARK_DATASET_SCHEMA_VERSION),
  comparisonLevel: comparisonLevelSchema,
  source: z.object({
    researchSourceIds: z.array(z.string()).min(1),
    evidenceGrade: z.enum(["strong", "moderate", "limited"]),
    reviewStatus: z.literal("approved_production"),
    licenseReference: z.string().min(1),
  }),
  population: benchmarkPopulationSchema,
  collectionMethod: z.string().min(1), measurementProtocol: z.string().min(1),
  measurementProtocolVersion: z.string().min(1), sampleSize: z.number().int().positive(),
  measurementTechnology: z.string().min(1),
  timingSystem: z.string().min(1), sourceFrameRateClass: z.string().min(1),
  metricDefinitions: z.array(benchmarkMetricDefinitionSchema).min(1),
  phaseDefinitions: z.array(z.object({ phase: z.string(), definition: z.string(), version: z.string() })).min(1),
  eventDefinitions: z.array(z.object({ event: z.string(), definition: z.string(), version: z.string() })).min(1),
  inclusionCriteria: z.array(z.string()).min(1), exclusionCriteria: z.array(z.string()).min(1),
  confidence: compatibilityConfidenceSchema, limitations: z.array(z.string()).min(1),
  entries: z.array(benchmarkEntrySchema).min(1), lastUpdated: z.string().datetime(),
  createdAt: z.string().datetime(), verified: z.literal(true), active: z.boolean(),
}).superRefine((dataset, ctx) => {
  const definitions = new Map(dataset.metricDefinitions.map((item) => [item.metricKey, item]));
  for (const entry of dataset.entries) {
    const definition = definitions.get(entry.metric);
    if (!definition) ctx.addIssue({ code: "custom", message: `Missing metric definition: ${entry.metric}` });
    else if (definition.definitionVersion !== entry.metricDefinitionVersion)
      ctx.addIssue({ code: "custom", message: `Metric definition version mismatch: ${entry.metric}` });
    if (entry.populationSize > dataset.sampleSize)
      ctx.addIssue({ code: "custom", message: `Entry population exceeds dataset sample: ${entry.entryId}` });
  }
});
export type BenchmarkDataset = z.infer<typeof benchmarkDatasetSchema>;

export const athleteComparisonContextSchema = z.object({
  athleteId: z.string().min(1), sex: z.enum(["female", "male", "unknown"]),
  age: z.number().nonnegative().nullable(), heightCm: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(), legLengthCm: z.number().positive().nullable(),
  event: z.string().nullable(), personalRecord: z.number().positive().nullable(),
  personalRecordUnit: z.string().nullable(), competitionLevel: z.string().nullable(),
  trainingAgeYears: z.number().nonnegative().nullable(), phase: z.string().min(1),
  surface: z.string().nullable(), environment: z.string().nullable(),
  measurementProtocolVersion: z.string().min(1), measurementTechnology: z.string().min(1),
  timingSystem: z.string().min(1), frameRateClass: z.string().min(1),
  metricDefinitionVersions: z.record(z.string()), cameraSetup: z.string().nullable(),
});
export type AthleteComparisonContext = z.infer<typeof athleteComparisonContextSchema>;

export const benchmarkComparisonResultSchema = z.object({
  engineVersion: z.literal(BENCHMARK_ENGINE_VERSION),
  athleteId: z.string(), metric: z.string(), athleteValue: z.number().nullable(),
  closestComparisonPopulation: z.string().nullable(),
  closestBenchmarkGroup: z.string().nullable(), datasetId: z.string().nullable(),
  datasetVersion: z.string().nullable(), percentile: z.number().min(0).max(100).nullable(),
  percentileMessage: z.string().min(1), distanceFromBenchmark: z.object({
    absolute: z.number(), standardized: z.number().nullable(), unit: z.string(),
  }).nullable(),
  strengths: z.array(z.string()), developmentOpportunities: z.array(z.string()),
  compatibilityConfidence: compatibilityConfidenceSchema,
  unsupportedComparisons: z.array(z.object({ datasetId: z.string(), reasons: z.array(z.string()).min(1) })),
  matchingTrace: z.array(z.string()), generatedAt: z.string().datetime(),
});
export type BenchmarkComparisonResult = z.infer<typeof benchmarkComparisonResultSchema>;

