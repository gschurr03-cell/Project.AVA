import { AvaPanel } from "@/components/ava/AvaPanel";
import type { SprintMeasurements } from "@/lib/benchmark/measurements";

/**
 * Presentation only: the Performance Summary — the focal card a coach sees first.
 * It shows only the TRUSTED spatial/zone metrics (step length, velocity, cadence,
 * zone time) as large headline numbers. Frame-quantized timing (contact/flight) is
 * deliberately absent here — it lives lower down as an estimate. All numbers come
 * straight from the measurement engine; no logic here beyond selection + display.
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
  measurements,
}: {
  measurements: SprintMeasurements;
}) {
  const m = measurements;

  // Headline step length: the individual mean when it's reliable, else the trusted
  // zone average (distance ÷ steps) — the same preference the benchmark uses.
  const stepLengthM =
    m.stepLengthConfidence === "high" && m.avgIndividualStepLengthM != null
      ? m.avgIndividualStepLengthM
      : (m.avgZoneStepLengthM ?? m.avgIndividualStepLengthM);

  const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

  if (!m.calibrated) {
    return (
      <AvaPanel eyebrow="Performance Summary" title="Awaiting calibration">
        <p className="text-sm text-[#A0A2A8]">
          Set the two timing gates and a known distance on the overlay below to unlock certified
          step length, velocity, and cadence for this run.
        </p>
      </AvaPanel>
    );
  }

  return (
    <AvaPanel eyebrow="Trusted Sprint Metrics" title="Verified Performance">
      {m.zone && (
        <p className="-mt-3 mb-4 text-xs text-[#6B7280]">
          over the {m.zone.distanceM} m zone{m.zoneTimeS != null ? ` · ${n(m.zoneTimeS)} s` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat label="Top speed" value={n(m.maxVelocityMps)} unit="m/s" sub="peak single-stride" />
        <BigStat label="Average velocity" value={n(m.zoneVelocityMps)} unit="m/s" sub="zone distance ÷ time" />
        <BigStat label="Step length" value={n(stepLengthM)} unit="m" sub={`${m.stepLengthConfidence} confidence`} />
        <BigStat label="Cadence" value={n(m.combinedStepFrequencyHz)} unit="steps/s" sub="over the full zone" />
      </div>
    </AvaPanel>
  );
}
