import { z } from "zod";

export const accelerationStartEventSchema = z.object({
  type: z.enum(["FIRST_DETECTED_MOVEMENT", "NEEDS_REVIEW"]),
  signal: z.enum(["torso", "shoulder", "wrist", "pose_anchor"]).nullable(),
  frame: z.number().int().nonnegative().nullable(),
  timestamp: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  debug: z.object({
    candidates: z.object({
      torso: z.object({
        frame: z.number().int().nonnegative().nullable(),
        timestamp: z.number().nonnegative().nullable(),
        passed: z.boolean(),
        reason: z.string(),
      }),
      shoulder: z.object({
        frame: z.number().int().nonnegative().nullable(),
        timestamp: z.number().nonnegative().nullable(),
        passed: z.boolean(),
        reason: z.string(),
      }),
      wrist: z.object({
        frame: z.number().int().nonnegative().nullable(),
        timestamp: z.number().nonnegative().nullable(),
        passed: z.boolean(),
        reason: z.string(),
      }),
      pose_anchor: z.object({
        frame: z.number().int().nonnegative().nullable(),
        timestamp: z.number().nonnegative().nullable(),
        passed: z.boolean(),
        reason: z.string(),
      }),
    }),
  }),
});

export const accelerationMetricsSchema = z.object({
  resultType: z.literal("acceleration"),
  status: z.enum(["ready", "ready_with_warning", "needs_review", "unavailable"]),
  startEvent: accelerationStartEventSchema,
  splits: z.object({
    m10S: z.number().positive().nullable(),
    m20S: z.number().positive().nullable(),
    m30S: z.number().positive().nullable(),
  }),
  finishDistanceM: z.number().positive().nullable(),
  finishCrossingTime: z.number().nonnegative().nullable(),
  runTime: z.number().positive().nullable(),
  segmentVelocities: z.array(
    z.object({
      startM: z.number().nonnegative(),
      endM: z.number().positive(),
      timeS: z.number().positive(),
      velocityMps: z.number().positive(),
    }),
  ),
  averageVelocityMps: z.number().positive().nullable(),
  earlyAccelerationMps2: z.number().nullable(),
  peakVelocity: z.number().positive().nullable(),
  distanceToPeakVelocity: z.number().nonnegative().nullable(),
  summary: z.string(),
  warnings: z.array(z.string()),
  strideMetrics: z.object({
    status: z.enum(["ready", "needs_review", "unavailable"]),
    strideCount: z.number().int().nonnegative().nullable(),
    averageStrideLengthM: z.number().positive().nullable(),
    reason: z.string(),
  }),
});

export const accelerationAnalysisSuccessSchema = z.object({
  status: z.literal("complete"),
  modelVersion: z.string().min(1),
  metrics: accelerationMetricsSchema,
  keypointsPath: z.string().nullable().optional(),
});

export type PersistedAccelerationMetrics = z.infer<typeof accelerationMetricsSchema>;
