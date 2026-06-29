import { z } from "zod";

/**
 * Wire schema for the payload an analysis worker POSTs back to
 * `/api/analyses/[id]/result` once pose estimation finishes. Validating with
 * Zod keeps the privileged write path honest.
 */
export const analysisResultSchema = z.object({
  modelVersion: z.string().min(1),
  metrics: z.object({
    topSpeedMps: z.number().nonnegative(),
    avgStrideLengthM: z.number().nonnegative(),
    strideFrequencyHz: z.number().nonnegative(),
    groundContactTimeMs: z.number().nonnegative(),
    flightTimeMs: z.number().nonnegative(),
    peakKneeFlexionDeg: z.number(),
    avgTrunkLeanDeg: z.number(),
  }),
  keypointsPath: z.string().nullable().optional(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
