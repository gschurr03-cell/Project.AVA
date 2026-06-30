import { type AnalysisMetrics, formatMetricValue, metricsDisplay } from "@/lib/biomechanics/types";

/**
 * Renders a completed analysis's seven biomechanics metrics as a labeled grid.
 * Receives an already-validated metrics object (the caller parses the raw JSONB
 * with `analysisMetricsSchema` first), so every value here is a real number.
 */
export default function MetricsPanel({ metrics }: { metrics: AnalysisMetrics }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {metricsDisplay.map(({ key, label, unit, decimals }) => (
        <div key={key} className="rounded border p-3">
          <dt className="text-xs text-gray-500">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-gray-800">
            {formatMetricValue(metrics[key], decimals)}
            <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
