import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
import type { IntelligenceConfidence, SprintIntelligenceReport } from "@/lib/intelligence";
import type { LimitingFactor, LimitingFactorDiagnosis } from "@/lib/intelligence/limitingFactors";

/**
 * AVA Intelligence (Day 78) — the platform's primary feature. It no longer leads
 * with metrics; it leads with the athlete's ranked LIMITING FACTORS: the biomechanics
 * most capping sprint performance, each with its current value, the elite benchmark,
 * the deficit, the estimated top-speed gain from correcting it, and a confidence.
 *
 * Presentation only. Every number comes from the intelligence engine + the pure
 * {@link deriveLimitingFactors} layer — this file just lays them out.
 */

const CONFIDENCE_TONE: Record<IntelligenceConfidence, AvaTone> = {
  high: "gold",
  medium: "bronze",
  low: "gray",
};

const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]";

function ConfidenceBadge({ confidence }: { confidence: IntelligenceConfidence }) {
  return <span className={avaBadge(CONFIDENCE_TONE[confidence])}>{confidence} confidence</span>;
}

/** One diagnostic stat cell inside a factor card. */
function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "gain" | "deficit";
}) {
  const valueClass =
    accent === "gain"
      ? "text-[#E4C25A]"
      : accent === "deficit"
        ? "text-[#FF7A70]"
        : "text-[#F5F5F7]";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <p className={LABEL}>{label}</p>
      <p className={`mt-1 text-lg font-bold tracking-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function FactorCard({ factor }: { factor: LimitingFactor }) {
  const gain =
    factor.estimatedVelocityGainMps != null
      ? `+${factor.estimatedVelocityGainMps.toFixed(2)} m/s`
      : "—";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D72638]/45 bg-[#D72638]/12 text-sm font-bold text-[#FF6B78]">
            #{factor.rank}
          </span>
          <p className="text-base font-semibold text-[#F5F5F7]">{factor.title}</p>
        </div>
        <ConfidenceBadge confidence={factor.confidence} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Current" value={factor.currentText} />
        <Cell label="Elite benchmark" value={factor.eliteBenchmarkText} />
        <Cell
          label="Deficit"
          value={factor.deficitPct > 0 ? `${factor.deficitPct}%` : "—"}
          accent="deficit"
        />
        <Cell label="Est. velocity gain" value={gain} accent="gain" />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#A0A2A8]">{factor.why}</p>
      {factor.deficitPct > 0 && (
        <p className="mt-1 text-xs text-[#6B7280]">
          {factor.deficitText}.
          {factor.velocityGainModeled && factor.estimatedVelocityGainMps != null
            ? " Velocity gain is a modeled first-order estimate."
            : ""}
        </p>
      )}
    </div>
  );
}

export default function AvaIntelligencePanel({
  report,
  diagnosis,
}: {
  report: SprintIntelligenceReport;
  diagnosis: LimitingFactorDiagnosis;
}) {
  return (
    <AvaPanel eyebrow="AVA Intelligence" title="Top Limiting Factors" className="relative">
      {report.confidence && (
        <div className="absolute right-5 top-5">
          <ConfidenceBadge confidence={report.confidence} />
        </div>
      )}

      <p className="-mt-3 mb-4 text-sm leading-relaxed text-[#A0A2A8]">
        {report.available
          ? "Ranked by estimated impact on sprint performance — the biomechanics most limiting this athlete's top speed."
          : report.headline}
      </p>

      {diagnosis.available ? (
        <div className="space-y-3">
          {diagnosis.factors.map((f) => (
            <FactorCard key={f.key} factor={f} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.08] p-4">
          <p className="text-sm font-medium text-[#E4C25A]">
            No single limiting factor stands out — the scored metrics are within elite range for this
            athlete. Keep building overall speed and re-diagnose as the training block progresses.
          </p>
        </div>
      )}

      {report.dataGaps.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8ab4d8]">
            What would sharpen this diagnosis
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-[#A0A2A8]">
            {report.dataGaps.map((g) => (
              <li key={g.what}>
                <span className="font-medium text-[#F5F5F7]">{g.what}</span> — {g.wouldImprove}
              </li>
            ))}
          </ul>
        </div>
      )}
    </AvaPanel>
  );
}
