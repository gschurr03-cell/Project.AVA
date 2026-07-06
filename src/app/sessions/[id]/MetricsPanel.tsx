import { AvaMetricCard } from "@/components/ava/AvaMetricCard";
import { AvaCautionPanel } from "@/components/ava/AvaCautionPanel";
import { type AvaMetricStatus } from "@/lib/design/ava";
import { type AnalysisMetrics, formatMetricValue, metricsDisplay } from "@/lib/biomechanics/types";
import { isPrecisionLimited, TIMING_METRIC_KEYS } from "@/lib/benchmark/precision";

/**
 * Metrics that depend on camera calibration we don't have yet.
 * The real worker sends them as exactly 0; rather than show a misleading "0.00",
 * we surface "Calibration Required."
 */
const CALIBRATION_DEPENDENT: (keyof AnalysisMetrics)[] = ["topSpeedMps", "avgStrideLengthM"];

function statusForMetric({
  metricKey,
  value,
  uncalibrated,
  muted,
}: {
  metricKey: keyof AnalysisMetrics;
  value: number;
  uncalibrated: boolean;
  muted?: boolean;
}): AvaMetricStatus {
  if (uncalibrated || value == null || Number.isNaN(value)) return "missing";
  if (muted) return "moderate";

  switch (metricKey) {
    case "topSpeedMps":
      if (value >= 10.8) return "excellent";
      if (value >= 10.2) return "good";
      if (value >= 9.4) return "moderate";
      return "poor";

    case "strideFrequencyHz":
      if (value >= 4.8) return "excellent";
      if (value >= 4.5) return "good";
      if (value >= 4.2) return "moderate";
      return "poor";

    case "avgStrideLengthM":
      if (value >= 2.35) return "excellent";
      if (value >= 2.2) return "good";
      if (value >= 2.0) return "moderate";
      return "poor";

    case "groundContactTimeMs":
      if (value <= 85) return "excellent";
      if (value <= 95) return "good";
      if (value <= 110) return "moderate";
      return "poor";

    case "flightTimeMs":
      if (value >= 115 && value <= 145) return "excellent";
      if (value >= 100 && value <= 160) return "good";
      if (value >= 85 && value <= 180) return "moderate";
      return "poor";

    default:
      return "good";
  }
}

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
  const value = metrics[metricKey];
  const uncalibrated = CALIBRATION_DEPENDENT.includes(metricKey) && value === 0;
  const status = statusForMetric({ metricKey, value, uncalibrated, muted });

  return (
    <AvaMetricCard
      label={label}
      value={uncalibrated ? "—" : formatMetricValue(value, decimals)}
      unit={uncalibrated ? undefined : unit}
      status={status}
      muted={muted}
      note={uncalibrated ? "Calibration Required" : muted ? "Lower confidence at this FPS" : undefined}
    />
  );
}

/**
 * Renders a completed analysis's biomechanics metrics.
 *
 * The four TRUSTED sprint metrics (top speed, average velocity, step length,
 * cadence) live in the Trusted Sprint Metrics card. Every OTHER biomechanics metric
 * — stride length/frequency, ground contact, flight time, joint angles — is not yet
 * production-trusted, so it lives here inside the Experimental Metrics accordion,
 * rendered dimmed + flagged. The underlying calculations are unchanged.
 */
export default function MetricsPanel({
  metrics,
  activeFps = null,
}: {
  metrics: AnalysisMetrics;
  activeFps?: number | null;
}) {
  const precisionLimited = isPrecisionLimited(activeFps);

  return (
    <AvaCautionPanel
      title="Coming Soon"
      subtitle="Experimental Metrics"
      pill={precisionLimited ? `${activeFps ?? "Low"} FPS` : "Not yet trusted"}
      description="These biomechanics metrics are still being validated and are not yet part of AVA's trusted output set. The four trusted metrics are shown above; these are for internal review."
    >
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metricsDisplay.map(({ key, label, unit, decimals }) => (
          <MetricCard
            key={key}
            metricKey={key}
            label={label}
            unit={unit}
            decimals={decimals}
            metrics={metrics}
            muted={precisionLimited && TIMING_METRIC_KEYS.has(key)}
          />
        ))}
      </dl>
    </AvaCautionPanel>
  );
}
