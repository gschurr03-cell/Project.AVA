/**
 * Types for validating AVA's computed sprint metrics against known reference
 * data (coach / VueMotion measurements). Static metadata only — no video files.
 */

/** A reference sprint recording with known measured metrics. */
export interface BenchmarkVideo {
  id: string;
  name: string;
  source: string;
  distanceM?: number;
  /** Comparable reference metrics (any subset, depending on what was measured). */
  avgStepFrequencyHz?: number;
  peakStepFrequencyHz?: number;
  avgGroundContactMs?: number;
  avgFlightTimeMs?: number;
  avgSpeedMps?: number;
  peakSpeedMps?: number;
  avgStepLengthM?: number;
  peakStepLengthM?: number;
  /** Any additional reference values kept for the record (per-side, etc.). */
  extra?: Record<string, number>;
}

/** A single reference metric (used when listing a benchmark's values). */
export interface BenchmarkMetric {
  key: string;
  label: string;
  unit: string;
  value: number;
}

/** AVA's side of a comparison — the metrics we can currently compute. */
export interface AvaComparableMetrics {
  stepFrequencyHz?: number;
  strideFrequencyHz?: number;
  avgGroundContactMs?: number;
  avgFlightTimeMs?: number;
  /** Top/avg speed in m/s — currently uncalibrated (0/undefined). */
  speedMps?: number;
  /** Step/stride length in m — currently uncalibrated (0/undefined). */
  stepLengthM?: number;
}

export type ComparisonStatus = "ok" | "warn" | "off" | "missing";

export interface MetricComparison {
  key: string;
  label: string;
  unit: string;
  benchmarkValue: number;
  avaValue: number | null;
  absError: number | null;
  percentError: number | null;
  status: ComparisonStatus;
}

export interface BenchmarkComparisonResult {
  benchmarkId: string;
  benchmarkName: string;
  comparisons: MetricComparison[];
  source: "benchmark_comparison";
}
