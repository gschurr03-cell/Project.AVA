import { z } from "zod";
import { reportTimeSeconds, velocityFromReportedTime } from "../measurement/timingPolicy";
import type { WorldGateCrossing } from "../calibration/zoneAnchors";

export const EXPERIMENTAL_30_PROFILE_VERSION = "ava-sprint-30-experimental-v1";
export const EXPERIMENTAL_30_EVENT_VERSION = "ava-events-30-experimental-v1";
export const EXPERIMENTAL_30_STRIDE_VERSION = "ava-strides-30-experimental-v1";
export const EXPERIMENTAL_30_TIMING_VERSION = "ava-timing-30-experimental-v1";
export const EXPERIMENTAL_30_TRUST_VERSION = "ava-trust-30-experimental-v1";
export const EXPERIMENTAL_30_UNCERTAINTY_VERSION = "ava-uncertainty-30-experimental-v1";
export const EXPERIMENTAL_30_COMPATIBILITY_GROUP = "experimental-30-v1";
export const EXPERIMENTAL_30_MIN_EVENT_CONFIDENCE = 0.5;
export const EXPERIMENTAL_30_REAL_TIMING_VERSION = "ava-real-30m-timing-v1";

export const experimentalEventSchema = z.object({
  type: z.literal("contact"),
  side: z.enum(["left", "right"]),
  sourceFrameIndex: z.number().int().nonnegative(),
  timestampSeconds: z.number().nonnegative(),
  bracketStartSeconds: z.number().nonnegative(),
  bracketEndSeconds: z.number().nonnegative(),
  interpolationFraction: z.number().min(0).max(1).nullable(),
  confidence: z.number().min(0).max(1),
  uncertaintySeconds: z.number().nonnegative(),
  modelVersion: z.literal(EXPERIMENTAL_30_EVENT_VERSION),
});
export type ExperimentalEvent = z.infer<typeof experimentalEventSchema>;

const worldCrossingEvidenceSchema = z.object({
  frameBefore: z.number().int().nonnegative(), frameAfter: z.number().int().nonnegative(),
  timestampBefore: z.number().nonnegative(), timestampAfter: z.number().nonnegative(),
  signedDistanceBefore: z.number(), signedDistanceAfter: z.number(),
  interpolationFraction: z.number().min(0).max(1), rawCrossingTimestamp: z.number().nonnegative(),
  gateConfidence: z.number().min(0).max(1), transformConfidence: z.number().min(0).max(1),
  bodyConfidence: z.number().min(0).max(1), featureSupport: z.number().int().nonnegative(),
  affineResidualPx: z.number().nonnegative(), uncertaintySeconds: z.number().nonnegative(),
  uncertaintyComponents: z.object({ frameTiming: z.number().nonnegative(), bodyReference: z.number().nonnegative(),
    transformConfidence: z.number().nonnegative(), affineResidual: z.number().nonnegative(),
    stableAnchorSelectionOffset: z.number().nonnegative(), transformDrift: z.number().nonnegative() }),
  crossingModelVersion: z.string(),
});

const real30TimingSchema = z.object({
  schemaVersion: z.literal(EXPERIMENTAL_30_REAL_TIMING_VERSION),
  zoneDistanceMeters: z.literal(30), zoneVersion: z.number().int().positive(),
  startGateId: z.string().min(1), finishGateId: z.string().min(1),
  startAnchorVersion: z.number().int().positive(), finishAnchorVersion: z.number().int().positive(),
  independentGateSchemaVersion: z.literal("ava-ground-anchor-v1"),
  propagationModelVersion: z.literal("ava-background-affine-anchor-v1"),
  travelDirection: z.enum(["left_to_right", "right_to_left"]), bodyReference: z.literal("torso"),
  startCrossing: worldCrossingEvidenceSchema, finishCrossing: worldCrossingEvidenceSchema,
  rawFlyTimeSeconds: z.number().positive(), reportedFlyTimeSeconds: z.number().positive(),
  rawAverageVelocityMps: z.number().positive(), reportedAverageVelocityMps: z.number().positive(),
  combinedUncertaintySeconds: z.number().nonnegative(), overallTimingConfidence: z.number().min(0).max(1),
  confidenceLabel: z.enum(["moderate", "low", "insufficient"]), reasonCodes: z.array(z.string()),
  timingPolicyVersion: z.literal("CONSERVATIVE_TIMING_POLICY_V1"),
  sourceEvidence: z.object({ frameIntervalSeconds: z.number().positive(), frameCount: z.literal(197),
    constantFrameRate: z.literal(true), syntheticFrameCount: z.literal(0), sourceFps: z.number(), analysisFps: z.literal(30),
    cameraConfidence: z.number().min(0).max(1), trackingConfidence: z.number().min(0).max(1) }),
  invariants: z.object({ rawDistanceMeters: z.number(), reportedDistanceMeters: z.number(), tolerance: z.number().positive(), pass: z.literal(true) }),
  externalReference: z.object({ timeSeconds: z.literal(2.77), distanceMeters: z.literal(30),
    startDefinition: z.literal("unknown"), finishDefinition: z.literal("unknown"), bodyReference: z.literal("unknown"),
    timingMethod: z.literal("unknown"), roundingPolicy: z.literal("unknown"),
    compatibilityStatus: z.literal("partially_compatible"), absoluteDifferenceSeconds: z.number().nonnegative(),
    percentageDifference: z.number().nonnegative(), differenceWithinUncertainty: z.boolean(), caveat: z.string().min(1) }),
  resultHash: z.string().regex(/^[0-9a-f]{8}$/),
});
export type Real30Timing = z.infer<typeof real30TimingSchema>;

const experimentalMetricSchema = z.object({
  value: z.number().finite().nullable(),
  rawValue: z.number().finite().nullable(),
  unit: z.string(),
  status: z.enum(["available", "withheld", "unsupported"]),
  confidence: z.number().min(0).max(1).nullable(),
  uncertainty: z.number().nonnegative().nullable(),
  reasonCodes: z.array(z.string()),
  experimental: z.literal(true),
  experimentVersion: z.literal(EXPERIMENTAL_30_PROFILE_VERSION),
  compatibilityGroup: z.literal(EXPERIMENTAL_30_COMPATIBILITY_GROUP),
});

export const experimental30ResultSchema = z.object({
  experimental: z.literal(true),
  validationStatus: z.literal("experimental"),
  profileVersion: z.literal(EXPERIMENTAL_30_PROFILE_VERSION),
  compatibilityGroup: z.literal(EXPERIMENTAL_30_COMPATIBILITY_GROUP),
  analysisFps: z.literal(30),
  sourceFps: z.number().min(29).max(30.5),
  rawTimestampsSeconds: z.array(z.number().nonnegative()),
  syntheticFrameCount: z.literal(0),
  events: z.array(experimentalEventSchema),
  metrics: z.object({
    zoneTime: experimentalMetricSchema,
    zoneAverageVelocity: experimentalMetricSchema,
    strideLength: experimentalMetricSchema,
    stepFrequency: experimentalMetricSchema,
    strideFrequency: experimentalMetricSchema,
  }),
  versions: z.object({
    eventDetection: z.literal(EXPERIMENTAL_30_EVENT_VERSION),
    strideSegmentation: z.literal(EXPERIMENTAL_30_STRIDE_VERSION),
    timing: z.literal(EXPERIMENTAL_30_TIMING_VERSION),
    trust: z.literal(EXPERIMENTAL_30_TRUST_VERSION),
    uncertainty: z.literal(EXPERIMENTAL_30_UNCERTAINTY_VERSION),
  }),
  downstream: z.object({
    validatedHistoryComparison: z.literal(false),
    pbPrediction: z.literal(false),
    goalGapAnalysis: z.literal(false),
    validatedRecommendations: z.literal(false),
  }),
  real30Timing: real30TimingSchema.nullable().default(null),
});
export type Experimental30Result = z.infer<typeof experimental30ResultSchema>;

export interface Experimental30Inputs {
  sourceFps: number;
  rawTimestampsSeconds: number[];
  events: ExperimentalEvent[];
  zone?: {
    entryTimeSeconds: number;
    exitTimeSeconds: number;
    distanceMeters: number;
    crossingConfidence: number;
    panningSafe: boolean;
    calibrated: boolean;
    startCrossing?: WorldGateCrossing;
    finishCrossing?: WorldGateCrossing;
    snapshot?: {
      zoneVersion: number; startGateId: string; finishGateId: string;
      startAnchorVersion: number; finishAnchorVersion: number;
      independentGateSchemaVersion: "ava-ground-anchor-v1";
      propagationModelVersion: "ava-background-affine-anchor-v1";
      travelDirection: "left_to_right" | "right_to_left"; bodyReference: "torso";
    };
    sourceEvidence?: { frameCount: number; constantFrameRate: boolean; cameraConfidence: number; trackingConfidence: number; width: number };
    manualAlignment?: { startMeanOffsetPx: number; startDriftPx: number; finishMeanOffsetPx: number; finishDriftPx: number };
  } | null;
  completeStrideLengthsMeters?: number[];
  calibrationConfidence?: number | null;
}

const unavailable = (unit: string, reasonCodes: string[]) => ({
  value: null, rawValue: null, unit, status: "withheld" as const, confidence: null,
  uncertainty: null, reasonCodes, experimental: true as const,
  experimentVersion: EXPERIMENTAL_30_PROFILE_VERSION,
  compatibilityGroup: EXPERIMENTAL_30_COMPATIBILITY_GROUP,
});
const available = (rawValue: number, value: number, unit: string, confidence: number, uncertainty: number) => ({
  value, rawValue, unit, status: "available" as const, confidence, uncertainty,
  reasonCodes: [], experimental: true as const,
  experimentVersion: EXPERIMENTAL_30_PROFILE_VERSION,
  compatibilityGroup: EXPERIMENTAL_30_COMPATIBILITY_GROUP,
});

const rss = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
const stableHash = (value: unknown): string => {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

function crossingWithUncertainty(crossing: WorldGateCrossing, offsetPx: number, driftPx: number, width: number) {
  const bracketSeconds = crossing.timestampAfterS - crossing.timestampBeforeS;
  const signedSpeed = Math.abs(crossing.signedDistanceAfter - crossing.signedDistanceBefore) / bracketSeconds;
  if (!(bracketSeconds > 0) || !(signedSpeed > 0)) throw new Error("Crossing bracket cannot support uncertainty estimation.");
  const pxToSeconds = (pixels: number) => (pixels / width) / signedSpeed;
  const components = {
    frameTiming: bracketSeconds / 2,
    bodyReference: bracketSeconds * (1 - crossing.bodyConfidence) / 2,
    transformConfidence: bracketSeconds * (1 - crossing.transformConfidence) / 2,
    affineResidual: pxToSeconds(crossing.affineResidualPx),
    stableAnchorSelectionOffset: pxToSeconds(offsetPx),
    transformDrift: pxToSeconds(driftPx),
  };
  return {
    frameBefore: crossing.beforeFrame, frameAfter: crossing.afterFrame,
    timestampBefore: crossing.timestampBeforeS, timestampAfter: crossing.timestampAfterS,
    signedDistanceBefore: crossing.signedDistanceBefore, signedDistanceAfter: crossing.signedDistanceAfter,
    interpolationFraction: crossing.interpolationFraction, rawCrossingTimestamp: crossing.timestampS,
    gateConfidence: crossing.gateConfidence, transformConfidence: crossing.transformConfidence,
    bodyConfidence: crossing.bodyConfidence, featureSupport: crossing.featureSupport,
    affineResidualPx: crossing.affineResidualPx, uncertaintySeconds: rss(Object.values(components)),
    uncertaintyComponents: components, crossingModelVersion: crossing.modelVersion,
  };
}

export function buildExperimental30Result(inputs: Experimental30Inputs): Experimental30Result {
  const timestamps = [...inputs.rawTimestampsSeconds];
  if (inputs.sourceFps < 29 || inputs.sourceFps > 30.5) throw new Error("Experimental profile requires a genuine 30 FPS-class source.");
  if (timestamps.some((value, index) => index > 0 && value <= timestamps[index - 1])) throw new Error("Source timestamps must be strictly increasing.");
  const frameInterval = timestamps.length > 1
    ? timestamps.slice(1).reduce((sum, value, index) => sum + value - timestamps[index], 0) / (timestamps.length - 1)
    : 1 / inputs.sourceFps;
  const contacts = [...inputs.events].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const stepIntervals = contacts.slice(1).map((event, index) => event.timestampSeconds - contacts[index].timestampSeconds).filter((value) => value > 0);
  const sameSideIntervals = contacts.flatMap((event, index) => {
    const next = contacts.slice(index + 1).find((candidate) => candidate.side === event.side);
    return next ? [next.timestampSeconds - event.timestampSeconds] : [];
  }).filter((value) => value > 0);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const eventConfidence = contacts.length ? Math.min(...contacts.map((event) => event.confidence)) : null;
  const temporalUncertainty = frameInterval / 2;
  const stepFrequency = stepIntervals.length && eventConfidence != null && eventConfidence >= EXPERIMENTAL_30_MIN_EVENT_CONFIDENCE
    ? available(1 / mean(stepIntervals), Number((1 / mean(stepIntervals)).toFixed(3)), "Hz", eventConfidence, temporalUncertainty / (mean(stepIntervals) ** 2))
    : unavailable("Hz", [eventConfidence != null && eventConfidence < EXPERIMENTAL_30_MIN_EVENT_CONFIDENCE ? "event_confidence_below_experimental_minimum" : "insufficient_complete_contact_intervals"]);
  const strideFrequency = sameSideIntervals.length && eventConfidence != null && eventConfidence >= EXPERIMENTAL_30_MIN_EVENT_CONFIDENCE
    ? available(1 / mean(sameSideIntervals), Number((1 / mean(sameSideIntervals)).toFixed(3)), "Hz", eventConfidence, temporalUncertainty / (mean(sameSideIntervals) ** 2))
    : unavailable("Hz", [eventConfidence != null && eventConfidence < EXPERIMENTAL_30_MIN_EVENT_CONFIDENCE ? "event_confidence_below_experimental_minimum" : "insufficient_same_side_intervals"]);
  const zoneValid = inputs.zone?.calibrated && inputs.zone.panningSafe && inputs.zone.exitTimeSeconds > inputs.zone.entryTimeSeconds;
  const rawZoneTime = zoneValid ? inputs.zone!.exitTimeSeconds - inputs.zone!.entryTimeSeconds : null;
  const zoneTime = rawZoneTime != null
    ? available(rawZoneTime, reportTimeSeconds(rawZoneTime), "s", inputs.zone!.crossingConfidence, frameInterval)
    : unavailable("s", [!inputs.zone?.calibrated ? "zone_not_calibrated" : !inputs.zone?.panningSafe ? "unsafe_camera_compensation" : "boundary_crossing_unavailable"]);
  const zoneAverageVelocity = rawZoneTime != null
    ? available(inputs.zone!.distanceMeters / rawZoneTime, velocityFromReportedTime(inputs.zone!.distanceMeters, rawZoneTime), "m/s", inputs.zone!.crossingConfidence, inputs.zone!.distanceMeters * frameInterval / (rawZoneTime ** 2))
    : unavailable("m/s", ["experimental_zone_time_unavailable"]);
  const lengths = (inputs.completeStrideLengthsMeters ?? []).filter((value) => value > 0);
  const calibrationConfidence = inputs.calibrationConfidence ?? null;
  const strideLength = lengths.length && calibrationConfidence != null
    ? available(mean(lengths), Number(mean(lengths).toFixed(3)), "m", Math.min(calibrationConfidence, eventConfidence ?? 0), frameInterval * 0.5)
    : unavailable("m", [calibrationConfidence == null ? "calibration_required" : "complete_stride_required"]);
  let real30Timing: Real30Timing | null = null;
  const enhanced = inputs.zone?.startCrossing && inputs.zone.finishCrossing && inputs.zone.snapshot
    && inputs.zone.sourceEvidence && inputs.zone.manualAlignment;
  if (rawZoneTime != null && enhanced) {
    if (inputs.zone!.distanceMeters !== 30 || inputs.zone!.sourceEvidence!.frameCount !== 197
      || !inputs.zone!.sourceEvidence!.constantFrameRate) throw new Error("Real 30 m timing snapshot is incomplete or inconsistent.");
    const start = crossingWithUncertainty(inputs.zone!.startCrossing!, inputs.zone!.manualAlignment!.startMeanOffsetPx,
      inputs.zone!.manualAlignment!.startDriftPx, inputs.zone!.sourceEvidence!.width);
    const finish = crossingWithUncertainty(inputs.zone!.finishCrossing!, inputs.zone!.manualAlignment!.finishMeanOffsetPx,
      inputs.zone!.manualAlignment!.finishDriftPx, inputs.zone!.sourceEvidence!.width);
    const reportedTime = reportTimeSeconds(rawZoneTime);
    const rawVelocity = inputs.zone!.distanceMeters / rawZoneTime;
    const reportedVelocity = inputs.zone!.distanceMeters / reportedTime;
    const tolerance = 1e-9;
    const rawDistance = rawVelocity * rawZoneTime;
    const reportedDistance = reportedVelocity * reportedTime;
    if (Math.abs(rawDistance - 30) > tolerance || Math.abs(reportedDistance - 30) > tolerance) throw new Error("Timing distance invariant failed.");
    const combined = rss([start.uncertaintySeconds, finish.uncertaintySeconds]);
    const baseConfidence = Math.min(inputs.zone!.crossingConfidence, inputs.zone!.sourceEvidence!.cameraConfidence,
      inputs.zone!.sourceEvidence!.trackingConfidence, start.bodyConfidence, finish.bodyConfidence,
      start.transformConfidence, finish.transformConfidence);
    const overall = Math.max(0, Math.min(1, baseConfidence * (1 - Math.min(0.75, combined / rawZoneTime))));
    const externalDifference = Math.abs(reportedTime - 2.77);
    const withoutHash = {
      schemaVersion: EXPERIMENTAL_30_REAL_TIMING_VERSION, zoneDistanceMeters: 30 as const,
      ...inputs.zone!.snapshot!, startCrossing: start, finishCrossing: finish,
      rawFlyTimeSeconds: rawZoneTime, reportedFlyTimeSeconds: reportedTime,
      rawAverageVelocityMps: rawVelocity, reportedAverageVelocityMps: reportedVelocity,
      combinedUncertaintySeconds: combined, overallTimingConfidence: overall,
      confidenceLabel: (overall >= 0.65 ? "moderate" : overall >= 0.4 ? "low" : "insufficient") as "moderate"|"low"|"insufficient",
      reasonCodes: ["experimental_30_fps", "manual_anchor_selection_uncertainty", "partial_external_reference_compatibility"],
      timingPolicyVersion: "CONSERVATIVE_TIMING_POLICY_V1" as const,
      sourceEvidence: { frameIntervalSeconds: frameInterval, frameCount: 197 as const, constantFrameRate: true as const,
        syntheticFrameCount: 0 as const, sourceFps: inputs.sourceFps, analysisFps: 30 as const,
        cameraConfidence: inputs.zone!.sourceEvidence!.cameraConfidence, trackingConfidence: inputs.zone!.sourceEvidence!.trackingConfidence },
      invariants: { rawDistanceMeters: rawDistance, reportedDistanceMeters: reportedDistance, tolerance, pass: true as const },
      externalReference: { timeSeconds: 2.77 as const, distanceMeters: 30 as const, startDefinition: "unknown" as const,
        finishDefinition: "unknown" as const, bodyReference: "unknown" as const, timingMethod: "unknown" as const,
        roundingPolicy: "unknown" as const, compatibilityStatus: "partially_compatible" as const,
        absoluteDifferenceSeconds: externalDifference, percentageDifference: externalDifference / 2.77 * 100,
        differenceWithinUncertainty: externalDifference <= combined,
        caveat: "The physical distance is compatible, but original trigger, body-reference, timing, and rounding definitions are unknown." },
    };
    real30Timing = real30TimingSchema.parse({ ...withoutHash, resultHash: stableHash(withoutHash) });
  }
  return experimental30ResultSchema.parse({
    experimental: true, validationStatus: "experimental", profileVersion: EXPERIMENTAL_30_PROFILE_VERSION,
    compatibilityGroup: EXPERIMENTAL_30_COMPATIBILITY_GROUP, analysisFps: 30, sourceFps: inputs.sourceFps,
    rawTimestampsSeconds: timestamps, syntheticFrameCount: 0, events: contacts,
    metrics: { zoneTime, zoneAverageVelocity, strideLength, stepFrequency, strideFrequency },
    versions: { eventDetection: EXPERIMENTAL_30_EVENT_VERSION, strideSegmentation: EXPERIMENTAL_30_STRIDE_VERSION, timing: EXPERIMENTAL_30_TIMING_VERSION, trust: EXPERIMENTAL_30_TRUST_VERSION, uncertainty: EXPERIMENTAL_30_UNCERTAINTY_VERSION },
    downstream: { validatedHistoryComparison: false, pbPrediction: false, goalGapAnalysis: false, validatedRecommendations: false },
    real30Timing,
  });
}

export function analysesAreCompatible(a: { compatibilityGroup?: string | null }, b: { compatibilityGroup?: string | null }): boolean {
  return Boolean(a.compatibilityGroup && a.compatibilityGroup === b.compatibilityGroup);
}
