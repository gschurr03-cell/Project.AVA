import { persistedAnalysisMetricsSchema, type PersistedAnalysisMetrics } from "../types";
import type { SprintAnalysisResult } from "../analysis";
import { CONSERVATIVE_TIMING_POLICY_V1 } from "../../measurement/timingPolicy";

/**
 * Bridge from the rich {@link SprintAnalysisResult} to the existing
 * {@link AnalysisMetrics} callback shape (the 7 fields the result API and UI
 * already understand). Kept separate so the analysis module stays untouched and
 * the mapping is independently testable.
 *
 * Missing values stay null. A measured zero remains a real zero and is therefore
 * distinguishable from unavailable/withheld data at persistence time.
 */
export const CALIBRATION_WARNING =
  "topSpeedMps and avgStrideLengthM were withheld because camera calibration is required.";

export interface MappedAnalysis {
  metrics: PersistedAnalysisMetrics;
  modelVersion: string;
  warnings: string[];
}

const num = (v: number | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const nonNeg = (v: number | undefined): number | null => {
  const value = num(v);
  return value == null ? null : Math.max(0, value);
};

export function toAnalysisMetrics(
  result: SprintAnalysisResult,
  modelVersion = "mediapipe-sprint-0.1",
): MappedAnalysis {
  const m = result.metrics;

  // MVP metric scope (LOCKED): the analysis pipeline only serializes the five MVP
  // metrics (step length, stride length, step frequency, average velocity, peak
  // velocity). Advanced timing derivatives — ground contact time, flight time, and
  // the knee/trunk angle diagnostics — are NOT part of the MVP, so the pipeline no
  // longer computes or serializes them: they are written as null. The schema keeps
  // these (nullable) keys for backward compatibility with existing rows, so nothing
  // read-side breaks and validation is unchanged. The five metrics themselves are
  // derived downstream from the calibrated measurements, not from these fields.
  const metrics: PersistedAnalysisMetrics = {
    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,
    rawTimingMetrics: { groundContactTimeMs: null, flightTimeMs: null },
    reportedTimingMetrics: { groundContactTimeMs: null, flightTimeMs: null },
    topSpeedMps: null,
    avgStrideLengthM: null,
    strideFrequencyHz: nonNeg(m.strideFrequencyHz),
    groundContactTimeMs: null,
    flightTimeMs: null,
    peakKneeFlexionDeg: null,
    avgTrunkLeanDeg: null,
  };

  // Guarantees the payload is callback-valid (and guards against future drift).
  persistedAnalysisMetricsSchema.parse(metrics);

  return {
    metrics,
    modelVersion,
    warnings: [...result.warnings, CALIBRATION_WARNING],
  };
}
