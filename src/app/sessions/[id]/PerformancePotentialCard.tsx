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
            <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                Practice top speed
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
                {n(potential.practiceTopSpeedMps)}
                <span className="ml-1 text-base font-medium text-[#A0A2A8]">m/s</span>
              </p>
              <p className="mt-0.5 text-xs text-[#6B7280]">trusted practice peak velocity</p>
            </div>

            <div className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                Estimated meet velocity range
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#E4C25A]">
                {n(potential.meetLowMps)}–{n(potential.meetHighMps)}
                <span className="ml-1 text-base font-medium text-[#A0A2A8]">m/s</span>
              </p>
              <p className="mt-0.5 text-xs text-[#6B7280]">+2% to +3% meet uplift</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#6B7280]">{potential.basis}</p>
          <p className="mt-2 text-xs leading-5 text-[#6B7280]">
            Full race-time prediction requires acceleration modeling from 0–20 m and
            speed-maintenance modeling. Coming soon.
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm text-[#A0A2A8]">{potential.basis}</p>
        </div>
      )}
    </AvaPanel>
  );
}
