import { analysisMetricsSchema, type AnalysisMetrics } from "../types";
import type { SprintAnalysisResult } from "../analysis";

/**
 * Bridge from the rich {@link SprintAnalysisResult} to the existing
 * {@link AnalysisMetrics} callback shape (the 7 fields the result API and UI
 * already understand). Kept separate so the analysis module stays untouched and
 * the mapping is independently testable.
 *
 * Speed and stride length require camera calibration we don't have yet, so they
 * are emitted as `0` placeholders with a warning. Any metric the analysis could
 * not compute degrades to `0`, so the callback payload always validates.
 */
export const CALIBRATION_WARNING =
  "topSpeedMps and avgStrideLengthM are placeholders (0) — they require camera calibration.";

export interface MappedAnalysis {
  metrics: AnalysisMetrics;
  modelVersion: string;
  warnings: string[];
}

const num = (v: number | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const nonNeg = (v: number | undefined): number => Math.max(0, num(v));

export function toAnalysisMetrics(
  result: SprintAnalysisResult,
  modelVersion = "mediapipe-sprint-0.1",
): MappedAnalysis {
  const m = result.metrics;

  // The analyzer reports peak flexion as the *minimum interior* knee angle
  // (180° = straight, smaller = more bent). Convert to an actual flexion angle
  // (0° = straight, larger = more flexed) = 180 − interior, using the deeper
  // (smaller interior) of the two legs. Clamped to [0, 180].
  const interiorKnees = [m.peakLeftKneeFlexionDeg, m.peakRightKneeFlexionDeg].filter(
    (x): x is number => typeof x === "number" && Number.isFinite(x),
  );
  const peakKneeFlexionDeg = interiorKnees.length
    ? Math.max(0, Math.min(180, 180 - Math.min(...interiorKnees)))
    : 0;

  const metrics: AnalysisMetrics = {
    topSpeedMps: 0, // placeholder — requires calibration
    avgStrideLengthM: 0, // placeholder — requires calibration
    strideFrequencyHz: nonNeg(m.strideFrequencyHz),
    groundContactTimeMs: nonNeg(m.avgGroundContactMs),
    flightTimeMs: nonNeg(m.avgFlightTimeMs),
    peakKneeFlexionDeg,
    // Passed through unchanged from the analyzer; sign convention: positive =
    // forward lean (shoulders ahead of hips), negative = backward.
    avgTrunkLeanDeg: num(m.avgTrunkLeanDeg),
  };

  // Guarantees the payload is callback-valid (and guards against future drift).
  analysisMetricsSchema.parse(metrics);

  return {
    metrics,
    modelVersion,
    warnings: [...result.warnings, CALIBRATION_WARNING],
  };
}
