import type {
  AvaComparableMetrics,
  BenchmarkComparisonResult,
  BenchmarkVideo,
  ComparisonStatus,
  MetricComparison,
} from "./BenchmarkTypes";

/** Percent-error thresholds for status classification. */
const OK_PCT = 10;
const WARN_PCT = 25;

/**
 * Which benchmark field maps to which AVA field, and how to label it. A single
 * AVA field can validate against several benchmark fields (e.g. AVA step
 * frequency vs both avg and peak reference frequency).
 */
const COMPARABLE: {
  benchmarkKey: keyof BenchmarkVideo;
  avaKey: keyof AvaComparableMetrics;
  label: string;
  unit: string;
}[] = [
  { benchmarkKey: "avgStepFrequencyHz", avaKey: "stepFrequencyHz", label: "Avg step frequency", unit: "Hz" },
  { benchmarkKey: "peakStepFrequencyHz", avaKey: "stepFrequencyHz", label: "Peak step frequency", unit: "Hz" },
  { benchmarkKey: "avgGroundContactMs", avaKey: "avgGroundContactMs", label: "Ground contact", unit: "ms" },
  { benchmarkKey: "avgFlightTimeMs", avaKey: "avgFlightTimeMs", label: "Flight time", unit: "ms" },
  { benchmarkKey: "avgSpeedMps", avaKey: "speedMps", label: "Avg speed", unit: "m/s" },
  { benchmarkKey: "peakSpeedMps", avaKey: "speedMps", label: "Peak speed", unit: "m/s" },
  { benchmarkKey: "avgStepLengthM", avaKey: "stepLengthM", label: "Avg step length", unit: "m" },
  { benchmarkKey: "peakStepLengthM", avaKey: "stepLengthM", label: "Peak step length", unit: "m" },
];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function classify(percentError: number): ComparisonStatus {
  if (percentError <= OK_PCT) return "ok";
  if (percentError <= WARN_PCT) return "warn";
  return "off";
}

/**
 * Compare AVA's computed metrics against a benchmark video. For each reference
 * metric present, reports the benchmark value, AVA value, absolute + percent
 * error, and a status. Uncalibrated/missing AVA values (undefined or 0 for
 * speed/length) are reported as `missing` rather than compared, so placeholder
 * zeros never masquerade as huge errors.
 */
export function compareMetrics(
  ava: AvaComparableMetrics,
  benchmark: BenchmarkVideo,
): BenchmarkComparisonResult {
  const comparisons: MetricComparison[] = [];

  for (const { benchmarkKey, avaKey, label, unit } of COMPARABLE) {
    const benchmarkValue = benchmark[benchmarkKey];
    if (!isNum(benchmarkValue)) continue; // this benchmark didn't measure it

    const rawAva = ava[avaKey];
    // Treat 0 speed/length as "not calibrated yet" rather than a real reading.
    const uncalibrated = (avaKey === "speedMps" || avaKey === "stepLengthM") && rawAva === 0;
    const avaValue = isNum(rawAva) && !uncalibrated ? rawAva : null;

    if (avaValue == null) {
      comparisons.push({ key: benchmarkKey, label, unit, benchmarkValue, avaValue: null, absError: null, percentError: null, status: "missing" });
      continue;
    }

    const absError = Math.abs(avaValue - benchmarkValue);
    const percentError = benchmarkValue === 0 ? 0 : (absError / Math.abs(benchmarkValue)) * 100;
    comparisons.push({
      key: benchmarkKey,
      label,
      unit,
      benchmarkValue,
      avaValue,
      absError: Number(absError.toFixed(3)),
      percentError: Number(percentError.toFixed(1)),
      status: classify(percentError),
    });
  }

  return {
    benchmarkId: benchmark.id,
    benchmarkName: benchmark.name,
    comparisons,
    source: "benchmark_comparison",
  };
}
