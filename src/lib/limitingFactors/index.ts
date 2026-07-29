import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import type { TrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import { buildLimitingFactors } from "./engine";
import type { LimitingFactorsInput, LimitingFactorsResult } from "./types";

export * from "./types";
export { buildLimitingFactors } from "./engine";
export { CONFIDENCE_LABEL_TEXT, IMPACT_LABEL_TEXT, pct } from "./scoring";

/**
 * Map the authoritative measurement + trusted-metric + athlete records into the engine's
 * normalized input. This performs NO measurement — it only reads existing values. Per-side
 * frequency uses the same in-zone step sample counts as its interval-count context.
 */
export function buildLimitingFactorsFromSession(args: {
  sessionId: string;
  sessionDate: string | null;
  analysisType: string | null;
  zoneDistanceM: number | null;
  calibrationConfirmed: boolean;
  spatialAvailable: boolean;
  measurements: SprintMeasurements | null;
  trusted: TrustedMetrics | null;
  athlete: LimitingFactorsInput["athlete"];
}): LimitingFactorsResult {
  const m = args.measurements;
  const summaries = m?.zoneStepSummary?.summaries ?? null;
  const input: LimitingFactorsInput = {
    sessionId: args.sessionId,
    sessionDate: args.sessionDate,
    analysisType: args.analysisType,
    zoneDistanceM: args.zoneDistanceM ?? m?.zone?.distanceM ?? null,
    calibrationConfirmed: args.calibrationConfirmed,
    spatialAvailable: args.spatialAvailable,
    measurementConfidence: m?.stepLengthConfidence ?? null,
    athlete: args.athlete,
    metrics: {
      avgStepLengthM: args.trusted?.avgStrideLengthM ?? m?.avgIndividualStepLengthM ?? null,
      peakStepLengthM: args.trusted?.peakStrideLengthM ?? m?.peakStrideLengthM ?? null,
      stepFrequencyHz: args.trusted?.frequencyHz ?? m?.combinedStepFrequencyHz ?? null,
      avgVelocityMps: args.trusted?.avgVelocityMps ?? m?.zoneVelocityMps ?? null,
      peakVelocityMps: args.trusted?.topSpeedMps ?? m?.maxVelocityMps ?? null,
      validStepCount: m?.validContacts ?? null,
      leftStepLengthM: summaries?.leftStepAverageM ?? m?.leftStepLengthM ?? null,
      rightStepLengthM: summaries?.rightStepAverageM ?? m?.rightStepLengthM ?? null,
      // Prefer the zone-step-summary side counts (canonical path); otherwise fall back to
      // the valid per-side in-zone contact counts (present even when the summary is null,
      // e.g. the static-camera clean path).
      leftStepSampleCount: summaries?.leftStepSampleCount ?? m?.validLeftContacts ?? 0,
      rightStepSampleCount: summaries?.rightStepSampleCount ?? m?.validRightContacts ?? 0,
      leftStepFrequencyHz: summaries?.leftStepFrequencyHz ?? m?.leftStepFrequencyHz ?? null,
      rightStepFrequencyHz: summaries?.rightStepFrequencyHz ?? m?.rightStepFrequencyHz ?? null,
    },
  };
  // Only trust spatial-derived per-side values when the recording supports spatial metrics.
  if (!args.spatialAvailable) {
    input.metrics.leftStepLengthM = null;
    input.metrics.rightStepLengthM = null;
  }
  return buildLimitingFactors(input);
}
