import { z } from "zod";

/**
 * Wire schemas for the payload an analysis worker POSTs back to
 * `/api/analyses/[id]/result` once pose estimation finishes. Validating with
 * Zod keeps the privileged write path honest.
 *
 * The callback is a discriminated union on `status`: a `complete` report
 * carries the derived metrics; a `failed` report carries an error message.
 */
const nullableNonnegative = z.number().nonnegative().nullable();
const nullableNumber = z.number().nullable();

/** Truthful persistence shape for new fly analyses. Null means not available. */
export const persistedAnalysisMetricsSchema = z.object({
  timingPolicyVersion: z.literal("CONSERVATIVE_TIMING_POLICY_V1"),
  rawTimingMetrics: z.object({
    groundContactTimeMs: nullableNonnegative,
    flightTimeMs: nullableNonnegative,
  }),
  reportedTimingMetrics: z.object({
    groundContactTimeMs: nullableNonnegative,
    flightTimeMs: nullableNonnegative,
  }),
  topSpeedMps: nullableNonnegative,
  avgStrideLengthM: nullableNonnegative,
  strideFrequencyHz: nullableNonnegative,
  groundContactTimeMs: nullableNonnegative,
  flightTimeMs: nullableNonnegative,
  peakKneeFlexionDeg: nullableNumber,
  avgTrunkLeanDeg: nullableNumber,
});
export type PersistedAnalysisMetrics = z.infer<typeof persistedAnalysisMetricsSchema>;

/** Legacy calculation adapter. Never write its synthetic zero fallbacks to storage. */
export const analysisMetricsSchema = persistedAnalysisMetricsSchema.transform((metrics) => ({
  topSpeedMps: metrics.topSpeedMps ?? 0,
  avgStrideLengthM: metrics.avgStrideLengthM ?? 0,
  strideFrequencyHz: metrics.strideFrequencyHz ?? 0,
  groundContactTimeMs: metrics.groundContactTimeMs ?? 0,
  flightTimeMs: metrics.flightTimeMs ?? 0,
  peakKneeFlexionDeg: metrics.peakKneeFlexionDeg ?? 0,
  avgTrunkLeanDeg: metrics.avgTrunkLeanDeg ?? 0,
}));

export const analysisSuccessSchema = z.object({
  status: z.literal("complete"),
  modelVersion: z.string().min(1),
  metrics: persistedAnalysisMetricsSchema,
  provenance: z.unknown().optional(),
  inputSnapshot: z.unknown().optional(),
  resultPayload: z.unknown().optional(),
  keypointsPath: z.string().nullable().optional(),
});

export const analysisFailureSchema = z.object({
  status: z.literal("failed"),
  modelVersion: z.string().min(1).optional(),
  error: z.string().min(1),
});

export const analysisCallbackSchema = z.discriminatedUnion("status", [
  analysisSuccessSchema,
  analysisFailureSchema,
]);

export type AnalysisMetrics = z.infer<typeof analysisMetricsSchema>;
export type AnalysisCallback = z.infer<typeof analysisCallbackSchema>;

/**
 * How to present each metric: label, unit, and rounding precision. Ordered as
 * they should appear in the UI. Keeping this beside the schema keeps the
 * displayed fields and the validated fields in lockstep.
 */
export const metricsDisplay: {
  key: keyof AnalysisMetrics;
  label: string;
  unit: string;
  decimals: number;
}[] = [
  { key: "topSpeedMps", label: "Top speed", unit: "m/s", decimals: 2 },
  { key: "avgStrideLengthM", label: "Avg stride length", unit: "m", decimals: 2 },
  { key: "strideFrequencyHz", label: "Stride frequency", unit: "Hz", decimals: 2 },
  { key: "groundContactTimeMs", label: "Ground contact time", unit: "ms", decimals: 0 },
  { key: "flightTimeMs", label: "Flight time", unit: "ms", decimals: 0 },
  { key: "peakKneeFlexionDeg", label: "Peak knee flexion", unit: "°", decimals: 1 },
  { key: "avgTrunkLeanDeg", label: "Avg trunk lean", unit: "°", decimals: 1 },
];

/** Format a metric value to its configured precision. */
export function formatMetricValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}
