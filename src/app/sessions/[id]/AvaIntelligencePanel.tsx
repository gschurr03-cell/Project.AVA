import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
import type { IntelligenceConfidence, SprintIntelligenceReport } from "@/lib/intelligence";
import type { LimitingFactor, LimitingFactorDiagnosis } from "@/lib/intelligence/limitingFactors";

/**
 * AVA Intelligence (Day 79) — the platform's primary feature. It leads with the
 * athlete's ranked "next unlocks": the trusted metrics most limiting top speed, each
 * with its current value, the elite benchmark, the gap, and (for the actionable
 * levers) an estimated IMPACT BAND (High/Medium/Low) rather than an exact m/s figure
 * we're not yet confident enough to publish per factor.
 *
 * Every number comes from the TRUSTED metrics via {@link deriveLimitingFactors} — the
 * same source as the Trusted Sprint Metrics card. AVA always ranks #1/#2/#3; it never
 * says "nothing stands out". The report is used only for the "what would sharpen this"
 * data gaps.
 */

const CONFIDENCE_TONE: Record<IntelligenceConfidence, AvaTone> = {
  high: "gold",
  medium: "bronze",
  low: "gray",
};

const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]";

/** Impact band → display label + colour (High = gold opportunity, down to gray). */
const IMPACT: Record<"high" | "medium" | "low", { label: string; cls: string }> = {
  high: { label: "High", cls: "text-[#E4C25A]" },
  medium: { label: "Medium", cls: "text-[#E0A063]" },
  low: { label: "Low", cls: "text-[#A0A2A8]" },
};

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
  accent?: "gain" | "deficit" | "elite";
}) {
  const valueClass =
    accent === "gain"
      ? "text-[#E4C25A]"
      : accent === "deficit"
        ? "text-[#FF7A70]"
        : accent === "elite"
          ? "text-[#E4C25A]"
          : "text-[#F5F5F7]";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <p className={LABEL}>{label}</p>
      <p className={`mt-1 text-lg font-bold tracking-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function FactorCard({ factor }: { factor: LimitingFactor }) {
  const impact = factor.impactBand ? IMPACT[factor.impactBand] : null;
  const tro = factor.trochanter;
  // Stride length is judged by body proportions (PEAK trochanter ratio) when leg
  // length is known — show the peak ratio + next milestone, not the generic metre
  // elite range. Current shows the peak stride + its ratio.
  const currentLabel = tro ? "Current (peak)" : "Current";
  const currentText = tro ? `${factor.currentText} · ${tro.ratioText}` : factor.currentText;
  const benchLabel = tro ? "Next target" : "Elite benchmark";
  const benchValue = tro
    ? tro.nextTargetRatio != null
      ? `${tro.nextTargetRatio.toFixed(2)}×${tro.nextTargetStepText ? ` · ${tro.nextTargetStepText}` : ""}`
      : "Maintain"
    : factor.eliteBenchmarkText;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D72638]/45 bg-[#D72638]/12 text-sm font-bold text-[#FF6B78]">
            #{factor.rank}
          </span>
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-[#F5F5F7]">{factor.label}</p>
            {factor.isOutcome && (
              <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
                Outcome
              </span>
            )}
          </div>
        </div>
        <ConfidenceBadge confidence={factor.confidence} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label={currentLabel} value={currentText} />
        <Cell label={benchLabel} value={benchValue} />
        {factor.belowElite ? (
          <Cell label="Gap to elite" value={`${factor.deficitPct}%`} accent="deficit" />
        ) : (
          <Cell label="Status" value="Elite ✓" accent="elite" />
        )}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className={LABEL}>Estimated impact</p>
          <p className={`mt-1 text-lg font-bold tracking-tight ${impact ? impact.cls : "text-[#F5F5F7]"}`}>
            {impact ? impact.label : "—"}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#A0A2A8]">{factor.why}</p>
      {tro ? (
        <>
          <p className="mt-1 text-xs text-[#6B7280]">
            {tro.bandLabel} · peak {tro.ratioText} of trochanter length
            {tro.avgStrideText ? ` · average ${tro.avgStrideText}` : ""}
            {tro.retentionText ? ` · retention ${tro.retentionText}` : ""}. Olympic caliber{" "}
            {tro.olympicText}.
          </p>
          {tro.retentionNote && (
            <p className="mt-1 text-xs font-medium text-[#E0A063]">{tro.retentionNote}</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-[#6B7280]">
          {factor.statusText}.
          {impact
            ? " Estimated impact on top speed if brought to elite (banded, not an exact figure yet)."
            : factor.isOutcome
              ? " This is an outcome of the levers above, not a direct lever."
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
  const limiting = diagnosis.mode === "limiting";
  const title = limiting ? "Top Limiting Factors" : "Next Performance Unlocks";
  const intro = limiting
    ? "Ranked by the biggest gap to elite — the trusted metrics most limiting this athlete's top speed."
    : "Every trusted metric is at elite. Ranked here are the next unlocks — the metrics closest to their threshold to keep sharpening.";

  return (
    <AvaPanel eyebrow="AVA Intelligence" title={title} className="relative">
      <div className="absolute right-5 top-5">
        <ConfidenceBadge confidence={diagnosis.confidence} />
      </div>

      <p className="-mt-3 mb-4 text-sm leading-relaxed text-[#A0A2A8]">{intro}</p>

      <div className="space-y-3">
        {diagnosis.factors.map((f) => (
          <FactorCard key={f.key} factor={f} />
        ))}
      </div>

      {report.dataGaps.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#D72638]">
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
