import type { ExplainableAnalysisResult, MetricResult } from "@/lib/analysis/resultContract";
import type { AsymmetryInsight } from "@/lib/intelligence/asymmetry";
import type { RecordingQualityReport } from "@/lib/recording/quality";

import type {
  CompletedAnalysisObservationInput,
  ObservationComparisonSignal,
  ObservationMetricSignal,
} from "./contracts";
import type { ObservationConfidence } from "./types";

const toObservationConfidence = (
  label: MetricResult["confidenceLabel"] | null | undefined,
): ObservationConfidence =>
  label === "high"
    ? "High"
    : label === "moderate"
      ? "Moderate"
      : label === "low"
        ? "Low"
        : "Unavailable";

const METRIC_KEYS: Record<string, string> = {
  topSpeedMps: "top_speed",
  avgVelocityMps: "average_velocity",
  strideFrequencyHz: "cadence",
  groundContactTimeMs: "ground_contact_time",
  flightTimeMs: "flight_time",
  avgStrideLengthM: "stride_length",
  peakKneeFlexionDeg: "peak_knee_flexion",
  avgTrunkLeanDeg: "average_trunk_lean",
};

const metricSignal = (
  measurement: ExplainableAnalysisResult["measurements"][number],
): ObservationMetricSignal => ({
  key: METRIC_KEYS[measurement.metricId] ?? measurement.metricId,
  metric: measurement.metricId,
  value: measurement.result.value,
  unit: measurement.result.unit,
  confidence: toObservationConfidence(measurement.result.confidenceLabel),
  source: `${measurement.result.source}:${measurement.result.version}`,
  availability: measurement.result.status,
  frameRange: null,
  phase: measurement.phase,
  directness: "direct",
  experimental: measurement.result.experimental ?? false,
  reasonCode: measurement.result.reasonCode,
  warning: measurement.result.warning,
});

const asymmetrySignal = (insight: AsymmetryInsight): ObservationComparisonSignal => ({
  key:
    insight.key === "stepLength"
      ? "stride_length_asymmetry"
      : "stride_frequency_asymmetry",
  classification: "different",
  leftValue: insight.leftValue,
  rightValue: insight.rightValue,
  differencePct: insight.differencePct,
  referenceValue: null,
  unit: insight.unit,
  // The legacy asymmetry contract exposes reliability but no confidence label.
  // Preserve that limitation instead of converting the boolean into invented confidence.
  confidence: "Unavailable",
  source: "intelligence/asymmetry:v1",
  availability: "available",
  phase: null,
  frameRange: null,
  experimental: !insight.reliable,
});

export interface BuildObservationInputOptions {
  result: ExplainableAnalysisResult;
  recordingQuality: RecordingQualityReport | null;
  calibrationAvailable: boolean;
  asymmetryInsights?: AsymmetryInsight[];
}

/**
 * Maps existing completed-result contracts into observation inputs. It does not
 * recalculate metrics, classify biomechanics, or manufacture confidence.
 */
export function buildCompletedAnalysisObservationInput({
  result,
  recordingQuality,
  calibrationAvailable,
  asymmetryInsights = [],
}: BuildObservationInputOptions): CompletedAnalysisObservationInput {
  const metrics = result.measurements.map(metricSignal);
  const timingMetrics = metrics.filter((item) =>
    ["ground_contact_time", "flight_time"].includes(item.key),
  );
  const availableTiming = timingMetrics.filter((item) => item.availability === "available");
  const timingClassification = result.provenance.experimental
    ? "experimental"
    : availableTiming.length
      ? "trusted"
      : "unavailable";
  const confidenceOrder: ObservationConfidence[] = [
    "Unavailable",
    "Low",
    "Moderate",
    "High",
  ];
  const timingConfidence =
    [...availableTiming]
      .map((item) => item.confidence)
      .sort((a, b) => confidenceOrder.indexOf(a) - confidenceOrder.indexOf(b))[0] ??
    "Unavailable";

  return {
    analysisId: result.analysisId,
    status: "complete",
    completedAt: result.provenance.completedAt,
    experimental: result.provenance.experimental,
    analysisFps: result.provenance.analysisFps,
    sourceFps: result.provenance.originalSourceFps,
    recordingMode: result.provenance.cameraMode,
    recordingQuality: recordingQuality
      ? {
          score: recordingQuality.score,
          rating: recordingQuality.rating,
          confidence: toObservationConfidence(result.overallConfidence.label),
          source: "recording/quality:v1",
        }
      : null,
    calibrationAvailable,
    timingClassification,
    timingConfidence,
    timingConfidenceSource: availableTiming[0]?.source ?? "analysis.result.measurements",
    metrics,
    comparisons: asymmetryInsights.map(asymmetrySignal),
    limitations: result.warnings.map((message, index) => ({
      code: `analysis_warning_${index + 1}`,
      message,
      source: "analysis.result",
    })),
  };
}
