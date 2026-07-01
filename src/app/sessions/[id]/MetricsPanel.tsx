import { type AnalysisMetrics, formatMetricValue, metricsDisplay } from "@/lib/biomechanics/types";

/**
 * Metrics that depend on camera calibration we don't have yet. The real worker
 * sends them as exactly 0; rather than show a misleading "0.00", we surface
 * "Needs calibration". The mock worker sends non-zero values, so it is
 * unaffected.
 */
const CALIBRATION_DEPENDENT: (keyof AnalysisMetrics)[] = ["topSpeedMps", "avgStrideLengthM"];

/**
 * Renders a completed analysis's seven biomechanics metrics as a labeled grid.
 * Receives an already-validated metrics object (the caller parses the raw JSONB
 * with `analysisMetricsSchema` first), so every value here is a real number.
 */
export default function MetricsPanel({ metrics }: { metrics: AnalysisMetrics }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {metricsDisplay.map(({ key, label, unit, decimals }) => {
        const uncalibrated = CALIBRATION_DEPENDENT.includes(key) && metrics[key] === 0;
        return (
          <div key={key} className="rounded border p-3">
            <dt className="text-xs text-gray-500">{label}</dt>
            {uncalibrated ? (
              <dd className="mt-1 text-sm font-medium italic text-gray-400">Needs calibration</dd>
            ) : (
              <dd className="mt-1 text-lg font-semibold text-gray-800">
                {formatMetricValue(metrics[key], decimals)}
                <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
