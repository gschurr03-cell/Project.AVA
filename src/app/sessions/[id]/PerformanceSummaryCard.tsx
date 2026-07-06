import { AvaPanel } from "@/components/ava/AvaPanel";
import type { TrustedMetrics } from "@/lib/intelligence/trustedMetrics";

/**
 * Trusted Sprint Metrics — the source-of-truth card (Day 79/82). It renders the shared
 * {@link TrustedMetrics} object directly, so every other customer-facing surface
 * (the limiting-factor diagnosis, Performance Potential) shows the same numbers. AVA
 * "stride length" = opposite-foot contact distance; we show both the zone AVERAGE and
 * the PEAK (best 4 strides). No selection logic lives here — the one place that choice
 * is made is `buildTrustedMetrics`.
 */

function BigStat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
        {value}
        <span className="ml-1 text-base font-medium text-[#A0A2A8]">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-xs text-[#6B7280]">{sub}</p>}
    </div>
  );
}

export default function PerformanceSummaryCard({
  trusted,
}: {
  trusted: TrustedMetrics | null;
}) {
  const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

  if (!trusted) {
    return (
      <AvaPanel eyebrow="Trusted Sprint Metrics" title="Awaiting calibration">
        <p className="text-sm text-[#A0A2A8]">
          Set the two timing gates and a known distance on the overlay below to unlock certified
          top speed, stride length, velocity, and frequency for this run.
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
    <AvaPanel eyebrow="Trusted Sprint Metrics" title="Verified Performance">
      {zoneContext && (
        <div className="-mt-3 mb-4 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#A0A2A8]">
          {zoneContext}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BigStat label="Top speed" value={n(trusted.topSpeedMps)} unit="m/s" sub="peak single-stride" />
        <BigStat label="Average velocity" value={n(trusted.avgVelocityMps)} unit="m/s" sub="zone distance ÷ time" />
        <BigStat label="Avg stride length" value={n(trusted.avgStrideLengthM)} unit="m" sub="zone average" />
        <BigStat label="Peak stride length" value={n(trusted.peakStrideLengthM)} unit="m" sub="best 4 strides" />
        <BigStat label="Frequency" value={n(trusted.frequencyHz)} unit="Hz" sub="over the full zone" />
      </div>

      {trusted.strideRetentionPct != null && (
        <p className="mt-3 text-xs text-[#6B7280]">
          <span className="font-semibold text-[#A0A2A8]">Stride retention:</span>{" "}
          {n(trusted.strideRetentionPct, 1)}% (average ÷ peak) —{" "}
          {trusted.stepLengthConfidence} confidence.
        </p>
      )}
    </AvaPanel>
  );
}
