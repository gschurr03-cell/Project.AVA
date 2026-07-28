import { AvaPanel } from "@/components/ava/AvaPanel";
import type { PerformancePotential } from "@/lib/intelligence/limitingFactors";

/**
 * Performance Velocity Estimation (Day 83). A conservative, realistic estimate of
 * theoretical MEET top velocity = practice peak velocity × 1.02–1.03. It is NOT a
 * guaranteed prediction and NOT a race time. Every number comes from the trusted
 * {@link deriveLimitingFactors} projection.
 *
 * TODO (future race prediction): a real race-time model must handle 0–20 m
 * acceleration, max velocity, and speed maintenance separately — not derive
 * 100 m / 200 m from peak velocity alone.
 */
export default function PerformancePotentialCard({
  potential,
}: {
  potential: PerformancePotential;
}) {
  const n = (v: number | null) => (v == null ? "—" : v.toFixed(2));

  return (
    <AvaPanel eyebrow="Performance Velocity Estimation" title="Estimated Meet Velocity">
      {potential.available ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
                Practice top speed
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#f5f7fb]">
                {n(potential.practiceTopSpeedMps)}
                <span className="ml-1 text-base font-medium text-[#b3bccb]">m/s</span>
              </p>
              <p className="mt-0.5 text-xs text-[#7e8797]">trusted practice peak velocity</p>
            </div>

            <div className="rounded-xl border border-[#f5c451]/25 bg-[#f5c451]/[0.07] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
                Estimated meet velocity range
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#f5c451]">
                {n(potential.meetLowMps)}–{n(potential.meetHighMps)}
                <span className="ml-1 text-base font-medium text-[#b3bccb]">m/s</span>
              </p>
              <p className="mt-0.5 text-xs text-[#7e8797]">+2% to +3% meet uplift</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#7e8797]">{potential.basis}</p>
          <p className="mt-2 text-xs leading-5 text-[#7e8797]">
            Full race-time prediction requires acceleration modeling from 0–20 m and
            speed-maintenance modeling. Coming soon.
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm text-[#b3bccb]">{potential.basis}</p>
        </div>
      )}
    </AvaPanel>
  );
}
