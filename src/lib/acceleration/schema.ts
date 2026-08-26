import { z } from "zod";
import { accelerationStartEventTypeSchema } from "./calibration";

// --- Phase 3 (Acceleration Mechanics, Part 17). Entirely additive/optional —
// legacy fly analyses, Phase 1 single-gate acceleration results, and Phase 2
// multi-marker acceleration results (none of which set `mechanics`) still
// parse unchanged. Never reinterprets any existing field above.

export const ACCELERATION_MECHANICS_CONTRACT_VERSION = "ava-acceleration-mechanics-v1" as const;

const observationStatusSchema = z.enum(["observed", "estimated", "manually_corrected", "unavailable", "experimental"]);
const mechanicalSideSchema = z.enum(["left", "right"]);

function mechanicalObservationSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema.nullable(),
    frame: z.number().int().nonnegative().nullable(),
    side: mechanicalSideSchema.nullable(),
    confidence: z.number().min(0).max(1),
    status: observationStatusSchema,
    provenance: z.enum(["automatic", "manual"]),
    reason: z.string().nullable(),
  });
}

const touchdownOffsetSchema = z.object({
  normalizedOffset: z.number(),
  meters: z.number().nullable(),
  legLengthRatio: z.number().nullable(),
  method: z.enum(["calibrated_world_distance", "unavailable"]),
});

const contactMechanicsSchema = z.object({
  stepNumber: z.number().int().positive(),
  side: mechanicalSideSchema,
  contactFrame: z.number().int().nonnegative(),
  contactDistanceM: z.number().nonnegative(),
  toeOffFrame: z.number().int().nonnegative().nullable(),
  trunkAngleTouchdownDeg: mechanicalObservationSchema(z.number()),
  trunkAngleToeOffDeg: mechanicalObservationSchema(z.number()),
  shinAngleTouchdownDeg: mechanicalObservationSchema(z.number()),
  thighAngleTouchdownDeg: mechanicalObservationSchema(z.number()),
  pelvisHeightNormalized: mechanicalObservationSchema(z.number()),
  touchdownOffsetFromPelvis: mechanicalObservationSchema(touchdownOffsetSchema),
  touchdownOffsetFromCenterOfMass: mechanicalObservationSchema(touchdownOffsetSchema),
});

const seriesPointSchema = z.object({
  stepNumber: z.number().int().positive(),
  distanceM: z.number().nonnegative(),
  value: z.number(),
  confidence: z.number().min(0).max(1),
  side: mechanicalSideSchema,
});

const mechanicalProgressionSchema = z.object({
  series: z.array(seriesPointSchema),
  changePerStep: z.array(z.object({ stepNumber: z.number().int().positive(), delta: z.number() })),
  zoneAverages: z.object({
    earlyZone: z.number().nullable(),
    middleZone: z.number().nullable(),
    lateZone: z.number().nullable(),
  }),
  ratePerMeter: z.number().nullable(),
  trend: z.enum(["rising", "falling", "stable", "insufficient_data"]),
  smoothness: z.enum(["smooth", "fluctuating", "insufficient_data"]),
  sideComparison: z.object({
    leftAverage: z.number().nullable(),
    rightAverage: z.number().nullable(),
    leftCount: z.number().int().nonnegative(),
    rightCount: z.number().int().nonnegative(),
    absoluteDifference: z.number().nullable(),
    meaningful: z.boolean(),
  }),
  observationCount: z.number().int().nonnegative(),
  findings: z.array(z.string()),
});

const strategyClassificationContractSchema = z.object({
  label: z.enum([
    "length_dominant_growth",
    "frequency_dominant_growth",
    "combined_growth",
    "plateauing_projection",
    "mixed_pattern",
    "insufficient_data",
  ]),
  evidence: z.array(z.string()),
  observationCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
});

const mechanicalAsymmetryContractSchema = z.object({
  metric: z.string(),
  leftAverage: z.number().nullable(),
  rightAverage: z.number().nullable(),
  absoluteDifference: z.number().nullable(),
  percentDifference: z.number().nullable(),
  observationCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  persistent: z.boolean(),
  zoneChange: z.enum(["widening", "narrowing", "stable", "insufficient_data"]),
});

export const accelerationMechanicsSchema = z.object({
  version: z.literal(ACCELERATION_MECHANICS_CONTRACT_VERSION),
  contacts: z.array(contactMechanicsSchema),
  trunkProgression: mechanicalProgressionSchema,
  shinProgression: mechanicalProgressionSchema,
  touchdownProgression: mechanicalProgressionSchema,
  pelvisProgression: mechanicalProgressionSchema,
  strategyClassification: strategyClassificationContractSchema,
  asymmetries: z.array(mechanicalAsymmetryContractSchema),
  quality: z.object({
    contactsWithMechanics: z.number().int().nonnegative(),
    contactsTotal: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
    warnings: z.array(z.string()),
  }),
  /** Whole-result provenance; per-observation provenance also lives on each
   *  `ContactMechanics` field once Part 2's manual-correction UI ships. */
  provenance: z.enum(["automatic", "manual"]),
});

export type PersistedAccelerationMechanics = z.infer<typeof accelerationMechanicsSchema>;


export const accelerationStartEventSchema = z.object({
  type: z.enum(["FIRST_DETECTED_MOVEMENT", "NEEDS_REVIEW"]),
  signal: z.enum(["torso", "shoulder", "wrist", "pose_anchor"]).nullable(),
  frame: z.number().int().nonnegative().nullable(),
  /** The Zone Start Event frame (Part 3), identical to `frame`. Optional for
   *  backward compatibility with analyses persisted before this field existed. */
  zoneStartFrame: z.number().int().nonnegative().nullable().optional(),
  timestamp: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  // Optional for backward compatibility with analyses persisted before this
  // field existed — absent means "automatic" (the only kind that could exist then).
  provenance: z.enum(["automatic", "manual"]).optional(),
  startEventType: accelerationStartEventTypeSchema.optional(),
  alreadyMovingAtZoneEntry: z.boolean().optional(),
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
  timingPolicyVersion: z.literal("CONSERVATIVE_TIMING_POLICY_V1"),
  resultType: z.literal("acceleration"),
  status: z.enum(["ready", "ready_with_warning", "needs_review", "unavailable"]),
  startEvent: accelerationStartEventSchema,
  splits: z.object({
    m10S: z.number().positive().nullable(),
    m20S: z.number().positive().nullable(),
    m30S: z.number().positive().nullable(),
  }),
  rawSplits: z.object({
    m10S: z.number().positive().nullable(),
    m20S: z.number().positive().nullable(),
    m30S: z.number().positive().nullable(),
  }),
  finishDistanceM: z.number().positive().nullable(),
  finishCrossingTime: z.number().nonnegative().nullable(),
  runTime: z.number().positive().nullable(),
  rawRunTime: z.number().positive().nullable(),
  reportedRunTime: z.number().positive().nullable(),
  segmentVelocities: z.array(
    z.object({
      startM: z.number().nonnegative(),
      endM: z.number().positive(),
      timeS: z.number().positive(),
      velocityMps: z.number().positive(),
      rawTimeS: z.number().positive(),
      reportedTimeS: z.number().positive(),
      rawVelocityMps: z.number().positive(),
      reportedVelocityMps: z.number().positive(),
    }),
  ),
  averageVelocityMps: z.number().positive().nullable(),
  rawAverageVelocityMps: z.number().positive().nullable(),
  reportedAverageVelocityMps: z.number().positive().nullable(),
  earlyAccelerationMps2: z.number().nullable(),
  peakVelocity: z.number().positive().nullable(),
  rawPeakVelocity: z.number().positive().nullable(),
  reportedPeakVelocity: z.number().positive().nullable(),
  distanceToPeakVelocity: z.number().nonnegative().nullable(),
  summary: z.string(),
  warnings: z.array(z.string()),
  strideMetrics: z.object({
    status: z.enum(["ready", "needs_review", "unavailable"]),
    strideCount: z.number().int().nonnegative().nullable(),
    averageStrideLengthM: z.number().positive().nullable(),
    reason: z.string(),
  }),
  // --- Phase 2 (multi-marker Acceleration Analysis). All optional/additive so
  // legacy single-finish-gate analyses (schemaVersion absent) still parse.
  analysisSchemaVersion: z.literal("ava-acceleration-analysis-v2").optional(),
  // Part 2.5 — the explicit Analysis Zone every metric is scoped to.
  analysisZone: z.object({ entryDistanceM: z.number().nonnegative(), exitDistanceM: z.number().nonnegative() }).optional(),
  calibratedMarkers: z
    .array(z.object({ label: z.string(), distanceM: z.number().nonnegative() }))
    .optional(),
  markerSplits: z
    .array(
      z.object({
        distanceM: z.number().nonnegative(),
        label: z.string(),
        rawElapsedTimeS: z.number().nonnegative().nullable(),
        elapsedTimeS: z.number().nonnegative().nullable(),
        frameEquivalentTimeS: z.number().nonnegative(),
        interpolationMethod: z.enum(["torso_crossing_interpolation", "spatial_reference_only"]),
        quality: z.enum(["interpolated", "unavailable"]),
      }),
    )
    .optional(),
  intervalMetrics: z
    .array(
      z.object({
        startM: z.number().nonnegative(),
        endM: z.number().positive(),
        timeS: z.number().positive().nullable(),
        velocityMps: z.number().positive().nullable(),
        accelerationMps2: z.number().nullable(),
        quality: z.enum(["observed", "unavailable"]),
      }),
    )
    .optional(),
  steps: z
    .array(
      z.object({
        stepNumber: z.number().int().positive(),
        side: z.enum(["left", "right"]),
        contactFrame: z.number().int().nonnegative(),
        toeOffFrame: z.number().int().nonnegative().nullable(),
        elapsedTimeS: z.number(),
        contactDistanceM: z.number().nonnegative(),
        stepLengthM: z.number().positive(),
        stepTimeS: z.number().positive(),
        stepFrequencyHz: z.number().nonnegative(),
        intervalVelocityMps: z.number().nonnegative(),
        averageAccelerationMps2: z.number().nullable(),
        cumulativeDistanceM: z.number().nonnegative(),
        contactTimeS: z.number().positive().nullable(),
        flightTimeBeforeS: z.number().positive().nullable(),
        flightTimeAfterS: z.number().positive().nullable(),
        detectionConfidence: z.number().min(0).max(1),
        dataQuality: z.enum(["observed", "estimated"]),
        qualityFlags: z.array(z.string()),
        manualCorrection: z.null(),
      }),
    )
    .optional(),
  stepsStatus: z.enum(["ready", "insufficient_contacts", "unavailable"]).optional(),
  stepsReason: z.string().nullable().optional(),
  peakVelocityDetail: z
    .object({
      velocityMps: z.number().positive().nullable(),
      distanceM: z.number().nonnegative().nullable(),
      timeS: z.number().nonnegative().nullable(),
    })
    .optional(),
  asymmetries: z
    .object({
      leftStepAverageM: z.number().positive().nullable(),
      rightStepAverageM: z.number().positive().nullable(),
      stepLengthAsymmetryPct: z.number().nonnegative().nullable(),
      leftStepFrequencyHz: z.number().positive().nullable(),
      rightStepFrequencyHz: z.number().positive().nullable(),
      leftStepSampleCount: z.number().int().nonnegative(),
      rightStepSampleCount: z.number().int().nonnegative(),
      earlyStepLengthAsymmetryPct: z.number().nonnegative().nullable(),
      lateStepLengthAsymmetryPct: z.number().nonnegative().nullable(),
      trend: z.enum(["improving", "worsening", "stable", "insufficient_data"]),
    })
    .nullable()
    .optional(),
  // Phase 2 (Parts 1-3) — WHY-level progression analysis derived from `steps`.
  progression: z
    .object({
      velocityCurve: z.array(
        z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), timeS: z.number(), velocityMps: z.number() }),
      ),
      accelerationCurve: z.array(
        z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), timeS: z.number(), accelerationMps2: z.number().nullable() }),
      ),
      stepGains: z.array(
        z.object({ stepNumber: z.number().int().positive(), velocityGainMps: z.number().nullable(), accelerationGainMps2: z.number().nullable() }),
      ),
      cumulativeDistanceM: z.array(z.number().nonnegative()),
      cumulativeTimeS: z.array(z.number()),
      peakAcceleration: z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), value: z.number() }).nullable(),
      peakVelocityGain: z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), value: z.number() }).nullable(),
      accelerationDeclineStep: z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative() }).nullable(),
      smoothness: z.object({
        smooth: z.boolean(),
        velocityDrops: z.array(z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), dropMps: z.number() })),
        accelerationSpikes: z.array(z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), valueMps2: z.number() })),
      }),
      stepProgression: z.object({
        stepLengthTrend: z.enum(["increasing", "plateauing", "decreasing", "insufficient_data"]),
        stepFrequencyTrend: z.enum(["increasing", "plateauing", "decreasing", "insufficient_data"]),
        divergence: z.enum([
          "frequency_plateau_length_rising",
          "length_plateau_frequency_rising",
          "both_rising",
          "both_plateauing",
          "both_declining",
          "insufficient_data",
        ]),
        mostEfficientStep: z.object({ stepNumber: z.number().int().positive(), distanceM: z.number().nonnegative(), velocityGainMps: z.number() }).nullable(),
      }),
      leftRight: z.object({
        leftContactTimeS: z.number().nullable(),
        rightContactTimeS: z.number().nullable(),
        leftStepTimeS: z.number().nullable(),
        rightStepTimeS: z.number().nullable(),
        stepTimeAsymmetryPct: z.number().nullable(),
        contactTimeAsymmetryPct: z.number().nullable(),
        leftVelocityContributionMps: z.number(),
        rightVelocityContributionMps: z.number(),
        meaningfulStepLengthAsymmetry: z.boolean(),
        meaningfulStepTimeAsymmetry: z.boolean(),
        meaningfulContactTimeAsymmetry: z.boolean(),
      }),
    })
    .nullable()
    .optional(),
  technicalProgression: z
    .object({
      trunkAngle: z.object({
        status: z.enum(["experimental", "unavailable"]),
        samples: z.array(
          z.object({
            stepNumber: z.number().int().positive(),
            distanceM: z.number().nonnegative(),
            angleFromVerticalDeg: z.number(),
          }),
        ),
        reason: z.string(),
      }),
    })
    .optional(),
  quality: z
    .object({
      fps: z.number().positive(),
      fpsAdequate: z.boolean(),
      calibratedCoverageMinM: z.number().nonnegative(),
      calibratedCoverageMaxM: z.number().nonnegative(),
      markerCount: z.number().int().nonnegative(),
      contactCount: z.number().int().nonnegative(),
      startEventProvenance: z.enum(["automatic", "manual"]),
      startEventConfidence: z.number().min(0).max(1),
      warnings: z.array(z.string()),
    })
    .optional(),
  // Phase 3 (Part 17) — see `accelerationMechanicsSchema` above. Optional/
  // nullable so every prior persisted shape keeps parsing unchanged.
  mechanics: accelerationMechanicsSchema.nullable().optional(),
});


export const accelerationAnalysisSuccessSchema = z.object({
  status: z.literal("complete"),
  modelVersion: z.string().min(1),
  metrics: accelerationMetricsSchema,
  keypointsPath: z.string().nullable().optional(),
  provenance: z.unknown().optional(),
  inputSnapshot: z.unknown().optional(),
  resultPayload: z.unknown().optional(),
});

export type PersistedAccelerationMetrics = z.infer<typeof accelerationMetricsSchema>;
