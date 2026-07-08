import { AvaMetricCard } from "@/components/ava/AvaMetricCard";
import { AvaCautionPanel } from "@/components/ava/AvaCautionPanel";
import { type AvaMetricStatus } from "@/lib/design/ava";
import { type AnalysisMetrics, formatMetricValue, metricsDisplay } from "@/lib/biomechanics/types";
import {
  isPrecisionLimited,
  metricTrust,
  EXPERIMENTAL_BIN_DESCRIPTION,
  type MetricTrust,
} from "@/lib/benchmark/precision";

/**
 * Metrics that depend on camera calibration we don't have yet.
 * The real worker sends them as exactly 0; rather than show a misleading "0.00",
 * we surface "Calibration Required."
 */
const CALIBRATION_DEPENDENT: (keyof AnalysisMetrics)[] = ["topSpeedMps", "avgStrideLengthM"];

/** Short, honest note explaining why a metric is showing a placeholder, not a value. */
function noteForTrust(trust: MetricTrust): string {
  switch (trust.state) {
    case "needsHigherFps":
      return "High-precision timing needs 120fps+ video at this frame rate.";
    case "needsConfidence":
      return "Tracking confidence is too low to trust this yet.";
    case "comingSoon":
      return "Not yet measurable for this recording.";
    default:
      return "";
  }
}

function statusForMetric({
  metricKey,
  value,
}: {
  metricKey: keyof AnalysisMetrics;
  value: number;
}): AvaMetricStatus {
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
  activeFps,
  poseConfidence,
}: {
  metricKey: keyof AnalysisMetrics;
  label: string;
  unit: string;
  decimals: number;
  metrics: AnalysisMetrics;
  activeFps: number | null;
  poseConfidence: number | null;
}) {
  const value = metrics[metricKey];

  // Calibration-dependent zeros keep their precise, existing message.
  if (CALIBRATION_DEPENDENT.includes(metricKey) && value === 0) {
    return <AvaMetricCard label={label} value="—" status="missing" note="Calibration Required" />;
  }

  // Otherwise decide trust for THIS recording. Anything not "available" is shown as an
  // honest placeholder string ("Needs 120fps+", "Needs higher confidence", "Coming
  // soon") — never a muted number and never a fake 0.
  const trust = metricTrust({ key: metricKey, activeFps, poseConfidence, value });
  if (trust.state !== "available") {
    return (
      <AvaMetricCard
        label={label}
        value={trust.message}
        status="missing"
        muted
        note={noteForTrust(trust)}
      />
    );
  }

  return (
    <AvaMetricCard
      label={label}
      value={formatMetricValue(value, decimals)}
      unit={unit}
      status={statusForMetric({ metricKey, value })}
    />
  );
}

/**
 * Renders a completed analysis's biomechanics metrics as the "Coming Soon /
 * Experimental Metrics" bin.
 *
 * The four TRUSTED sprint metrics (top speed, average velocity, step length,
 * cadence) live in the Trusted Sprint Metrics card above. Everything here is either
 * still being validated OR gated by this recording's frame rate / tracking
 * confidence. Frame-rate-limited timing (ground contact, flight time, and their
 * derivatives) shows "Needs 120fps+" below 120 fps; confidence-limited metrics show
 * "Needs higher confidence"; anything otherwise unmeasurable shows "Coming soon".
 * No underlying metric math is changed — this only gates presentation.
 */
export default function MetricsPanel({
  metrics,
  activeFps = null,
  poseConfidence = null,
}: {
  metrics: AnalysisMetrics;
  activeFps?: number | null;
  poseConfidence?: number | null;
}) {
  const precisionLimited = isPrecisionLimited(activeFps);
  const pill = precisionLimited
    ? `${activeFps ? Math.round(activeFps) : "Low"} FPS · needs 120fps+`
    : "Confidence-gated";

  return (
    <AvaCautionPanel
      title="Coming Soon"
      subtitle="Experimental Metrics"
      pill={pill}
      description={EXPERIMENTAL_BIN_DESCRIPTION}
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
            activeFps={activeFps}
            poseConfidence={poseConfidence}
          />
        ))}
      </dl>
    </AvaCautionPanel>
  );
}
