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
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-gray-900">
        {value}
        <span className="ml-1 text-base font-medium text-gray-400">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
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
      <section className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-lane">Performance Summary</h2>
        <p className="mt-2 text-sm text-gray-500">
          Set the two timing gates and a known distance on the overlay below to unlock certified
          step length, velocity, and cadence for this run.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-xl border bg-gradient-to-b from-white to-gray-50 p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-lane">Performance Summary</h2>
        {m.zone && (
          <span className="text-xs text-gray-400">
            over the {m.zone.distanceM} m zone{m.zoneTimeS != null ? ` · ${n(m.zoneTimeS)} s` : ""}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat label="Max velocity" value={n(m.maxVelocityMps)} unit="m/s" sub="longest step × cadence" />
        <BigStat label="Avg velocity" value={n(m.zoneVelocityMps)} unit="m/s" sub="zone distance ÷ time" />
        <BigStat label="Step length" value={n(stepLengthM)} unit="m" sub={`${m.stepLengthConfidence} confidence`} />
        <BigStat label="Cadence" value={n(m.combinedStepFrequencyHz)} unit="steps/s" sub="over the full zone" />
      </div>
    </section>
  );
}
