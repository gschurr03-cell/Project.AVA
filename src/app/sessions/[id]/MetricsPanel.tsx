import { type AnalysisMetrics, formatMetricValue, metricsDisplay } from "@/lib/biomechanics/types";
import {
  isPrecisionLimited,
  TIMING_METRIC_KEYS,
  PRECISION_TIMING_MESSAGE,
} from "@/lib/benchmark/precision";

/**
 * Metrics that depend on camera calibration we don't have yet. The real worker
 * sends them as exactly 0; rather than show a misleading "0.00", we surface
 * "Needs calibration". The mock worker sends non-zero values, so it is
 * unaffected.
 */
const CALIBRATION_DEPENDENT: (keyof AnalysisMetrics)[] = ["topSpeedMps", "avgStrideLengthM"];

function MetricCard({
  metricKey,
  label,
  unit,
  decimals,
  metrics,
  muted = false,
}: {
  metricKey: keyof AnalysisMetrics;
  label: string;
  unit: string;
  decimals: number;
  metrics: AnalysisMetrics;
  muted?: boolean;
}) {
  const uncalibrated = CALIBRATION_DEPENDENT.includes(metricKey) && metrics[metricKey] === 0;
  return (
    <div className={`rounded border p-3 ${muted ? "bg-gray-50" : ""}`}>
      <dt className="text-xs text-gray-500">{label}</dt>
      {uncalibrated ? (
        <dd className="mt-1 text-sm font-medium italic text-gray-400">Needs calibration</dd>
      ) : (
        <dd className={`mt-1 text-lg font-semibold ${muted ? "text-gray-400" : "text-gray-800"}`}>
          {formatMetricValue(metrics[metricKey], decimals)}
          <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
        </dd>
      )}
    </div>
  );
}

/**
 * Renders a completed analysis's biomechanics metrics as a labeled grid. Receives
 * an already-validated metrics object. At low frame rates (≤60 fps → precision
 * limited), the temporal metrics (ground contact / flight) can't be a
 * high-precision headline number — one frame is a large fraction of an ~80 ms
 * contact — so they are separated into a muted "lower confidence at this FPS"
 * group with an explanation. At ≥120 fps everything is a headline card.
 */
export default function MetricsPanel({
  metrics,
  activeFps = null,
}: {
  metrics: AnalysisMetrics;
  activeFps?: number | null;
}) {
  const precisionLimited = isPrecisionLimited(activeFps);
  const headline = metricsDisplay.filter(
    (d) => !(precisionLimited && TIMING_METRIC_KEYS.has(d.key)),
  );
  const timing = precisionLimited
    ? metricsDisplay.filter((d) => TIMING_METRIC_KEYS.has(d.key))
    : [];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {headline.map(({ key, label, unit, decimals }) => (
          <MetricCard
            key={key}
            metricKey={key}
            label={label}
            unit={unit}
            decimals={decimals}
            metrics={metrics}
          />
        ))}
      </dl>

      {timing.length > 0 && (
        <div className="rounded-md border border-dashed bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Timing — lower confidence at {activeFps ?? "this"} fps
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {timing.map(({ key, label, unit, decimals }) => (
              <MetricCard
                key={key}
                metricKey={key}
                label={label}
                unit={unit}
                decimals={decimals}
                metrics={metrics}
                muted
              />
            ))}
          </dl>
          <p className="mt-2 text-xs text-gray-500">{PRECISION_TIMING_MESSAGE}</p>
        </div>
      )}
    </div>
  );
}
