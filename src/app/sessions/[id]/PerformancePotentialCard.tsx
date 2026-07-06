import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge } from "@/lib/design/ava";
import type { PerformancePotential } from "@/lib/intelligence/limitingFactors";

/**
 * Performance Potential (Day 78) — the headroom card. Shows current top speed, the
 * estimated achievable top speed after correcting the surfaced limiting factors, and
 * the percent improvement. Presentation only: every number comes from the pure
 * {@link deriveLimitingFactors} projection (first-order v = L·f model).
 */
export default function PerformancePotentialCard({
  potential,
}: {
  potential: PerformancePotential;
}) {
  const n = (v: number | null) => (v == null ? "—" : v.toFixed(2));

  return (
    <AvaPanel eyebrow="Performance Potential" title="Achievable Top Speed" className="relative">
      {potential.available && potential.confidence && (
        <div className="absolute right-5 top-5">
          <span className={avaBadge(potential.confidence === "high" ? "gold" : potential.confidence === "medium" ? "bronze" : "gray")}>
            {potential.confidence} confidence
          </span>
        </div>
      )}

      {potential.available ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                Current top speed
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
                {n(potential.currentTopSpeedMps)}
                <span className="ml-1 text-base font-medium text-[#A0A2A8]">m/s</span>
              </p>
            </div>

            <div className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                Achievable top speed
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#E4C25A]">
                {n(potential.achievableTopSpeedMps)}
                <span className="ml-1 text-base font-medium text-[#A0A2A8]">m/s</span>
              </p>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                {potential.factorsApplied > 0
                  ? `estimate — closing ${potential.factorsApplied} trusted lever${potential.factorsApplied === 1 ? "" : "s"} to elite`
                  : "levers already at elite"}
              </p>
            </div>

            <div className="ava-red-glow rounded-xl border border-[#D72638]/25 bg-[#0d0d0f] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF6B78]">
                Potential improvement
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
                +{potential.percentImprovement ?? "—"}
                <span className="ml-1 text-base font-medium text-[#A0A2A8]">%</span>
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#6B7280]">{potential.basis}</p>
        </>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm text-[#A0A2A8]">{potential.basis}</p>
          {potential.currentTopSpeedMps != null && (
            <p className="mt-2 text-sm text-[#F5F5F7]">
              Current top speed:{" "}
              <span className="font-bold">{n(potential.currentTopSpeedMps)} m/s</span>
            </p>
          )}
        </div>
      )}
    </AvaPanel>
  );
}
