import { z } from "zod";

/**
 * Wire schemas for the payload an analysis worker POSTs back to
 * `/api/analyses/[id]/result` once pose estimation finishes. Validating with
 * Zod keeps the privileged write path honest.
 *
 * The callback is a discriminated union on `status`: a `complete` report
 * carries the derived metrics; a `failed` report carries an error message.
 */
export const analysisMetricsSchema = z.object({
  topSpeedMps: z.number().nonnegative(),
  avgStrideLengthM: z.number().nonnegative(),
  strideFrequencyHz: z.number().nonnegative(),
  groundContactTimeMs: z.number().nonnegative(),
  flightTimeMs: z.number().nonnegative(),
  peakKneeFlexionDeg: z.number(),
  avgTrunkLeanDeg: z.number(),
});

export const analysisSuccessSchema = z.object({
  status: z.literal("complete"),
  modelVersion: z.string().min(1),
  metrics: analysisMetricsSchema,
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
