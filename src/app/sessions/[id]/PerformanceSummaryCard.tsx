import { AvaPanel } from "@/components/ava/AvaPanel";
import { ConfidenceBadge, ConfidenceDetails } from "@/components/confidence/MetricConfidence";
import type { TrustedMetricConfidence } from "@/lib/confidence";
import type { TrustedMetrics } from "@/lib/intelligence/trustedMetrics";

/**
 * MVP Sprint Metrics — the locked, source-of-truth card. It renders the shared
 * {@link TrustedMetrics} object directly, so every other customer-facing surface shows
 * the same numbers. The MVP scientific output is exactly FIVE metrics: Average Step
 * Length, Peak Step Length, Step Frequency, Average Velocity, Peak Velocity. Step length
 * is opposite-foot (left↔right) contact distance; "stride length" is not used in the MVP.
 * Peak Step Length is the highest rolling four-consecutive-step average length; Peak
 * Velocity is the engine's peak single-stride velocity (stable, avoids single-step
 * frame-quantization outliers). Each metric renders independently: an unavailable one shows "—"
 * and never suppresses the other four. No advanced timing derivatives (contact/flight
 * time, duty factor, oscillation, etc.) appear anywhere in the MVP. No selection logic
 * lives here — the one place that choice is made is `buildTrustedMetrics`.
 */

function BigStat({
  label,
  value,
  unit,
  sub,
  confidence,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  confidence: TrustedMetricConfidence[keyof TrustedMetricConfidence];
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#f5f7fb]">
        {value}
        <span className="ml-1 text-base font-medium text-[#b3bccb]">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-xs text-[#7e8797]">{sub}</p>}
      <div className="mt-2"><ConfidenceBadge confidence={confidence} /></div>
      <ConfidenceDetails confidence={confidence} />
    </div>
  );
}

export default function PerformanceSummaryCard({
  trusted,
  confidence,
  calibrationComplete,
  resultStatus,
}: {
  trusted: TrustedMetrics | null;
  confidence: TrustedMetricConfidence | null;
  calibrationComplete: boolean;
  resultStatus: "current" | "superseded" | "pending";
}) {
  const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

  if (!trusted || !confidence) {
    const updating = calibrationComplete && resultStatus !== "current";
    return (
      <AvaPanel eyebrow="Sprint Metrics" title={updating ? "Analysis updating" : "Awaiting calibration"}>
        <p className="text-sm text-[#b3bccb]">
          {updating
            ? "Your confirmed timing gates and known distance are saved. AVA is calculating the five sprint metrics against the latest calibration."
            : "Set Gate A, Gate B, and a known distance in the Timing Workspace to unlock average step length, peak step length, step frequency, average velocity, and peak velocity for this run."}
        </p>
      </AvaPanel>
    );
  }

  // Zone context — "20 m zone · 1.92 s" — shown alongside the verified output.
  // Degrades gracefully: distance-only, or omitted entirely, when unavailable.
  const zoneContext =
    trusted.zoneDistanceM != null
      ? `${trusted.zoneDistanceM} m zone${trusted.zoneTimeS != null ? ` · ${n(trusted.zoneTimeS)} s` : ""}`
      : null;

  return (
    <AvaPanel eyebrow="Sprint Metrics" title="Verified Performance">
      {zoneContext && (
        <div className="-mt-3 mb-4 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#b3bccb]">
          {zoneContext}
        </div>
      )}
      {/* MVP locked scope: exactly these five metrics, each independent. Peak Step Length
          and Peak Velocity are rolling four-consecutive-step aggregates (not single steps). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BigStat label="Average step length" value={n(trusted.avgStrideLengthM)} unit="m" sub="Average opposite-foot (L↔R)" confidence={confidence.avgStrideLengthM} />
        <BigStat label="Peak step length" value={n(trusted.peakStrideLengthM)} unit="m" sub="Best rolling 4-step average" confidence={confidence.peakStrideLengthM} />
        <BigStat label="Step frequency" value={n(trusted.frequencyHz)} unit="Hz" sub="Across calibrated zone" confidence={confidence.frequencyHz} />
        <BigStat label="Average velocity" value={n(trusted.avgVelocityMps)} unit="m/s" sub={`${trusted.zoneDistanceM != null ? Math.round(trusted.zoneDistanceM) : 30} m average`} confidence={confidence.avgVelocityMps} />
        <BigStat label="Peak velocity" value={n(trusted.topSpeedMps)} unit="m/s" sub="Peak single-stride" confidence={confidence.topSpeedMps} />
      </div>
    </AvaPanel>
  );
}
