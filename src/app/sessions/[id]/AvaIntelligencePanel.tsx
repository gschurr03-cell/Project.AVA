import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
import type { IntelligenceConfidence, Limiter, SprintIntelligenceReport } from "@/lib/intelligence";
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

const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]";

/** Impact band → display label + colour (High = gold opportunity, down to gray). */
const IMPACT: Record<"high" | "medium" | "low", { label: string; cls: string }> = {
  high: { label: "High", cls: "text-[#f5c451]" },
  medium: { label: "Medium", cls: "text-[#f5c451]" },
  low: { label: "Low", cls: "text-[#b3bccb]" },
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
      ? "text-[#f5c451]"
      : accent === "deficit"
        ? "text-[#e46464]"
        : accent === "elite"
          ? "text-[#f5c451]"
          : "text-[#f5f7fb]";
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
    <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2f80ed]/45 bg-[#2f80ed]/12 text-sm font-bold text-[#3b8eff]">
            #{factor.rank}
          </span>
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-[#f5f7fb]">{factor.label}</p>
            {factor.isOutcome && (
              <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7e8797]">
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
          <p className={`mt-1 text-lg font-bold tracking-tight ${impact ? impact.cls : "text-[#f5f7fb]"}`}>
            {impact ? impact.label : "—"}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#b3bccb]">{factor.why}</p>
      {tro ? (
        <>
          <p className="mt-1 text-xs text-[#7e8797]">
            {tro.bandLabel} · peak {tro.ratioText} of trochanter length
            {tro.avgStrideText ? ` · average ${tro.avgStrideText}` : ""}
            {tro.retentionText ? ` · retention ${tro.retentionText}` : ""}. Olympic caliber{" "}
            {tro.olympicText}.
          </p>
          {tro.retentionNote && (
            <p className="mt-1 text-xs font-medium text-[#f5c451]">{tro.retentionNote}</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-[#7e8797]">
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

function Section({
  title,
  children,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group rounded-xl border border-white/[0.06] bg-[#151517]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#b3bccb]">{title}</span>
        <span className="text-[#7e8797] transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-white/[0.06] px-4 py-3">{children}</div>
    </details>
  );
}

const compactList = (items: string[]) => (
  <ul className="space-y-1 text-sm text-[#b3bccb]">
    {items.map((item) => <li key={item}>• {item}</li>)}
  </ul>
);

function EliteFinding({ finding }: { finding: Limiter }) {
  const cost = finding.estimatedPerformanceCost;
  return (
    <article className="rounded-xl border border-white/[0.08] bg-[#182233] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2f80ed]/15 text-sm font-bold text-[#3b8eff]">
            {finding.rank}
          </span>
          <div>
            <h3 className="font-semibold text-[#f5f7fb]">{finding.title}</h3>
            <p className="mt-0.5 text-xs text-[#7e8797]">
              Priority {finding.priorityScore}/100 · Impact {finding.impactScore}/100 · {cost.importance}
            </p>
          </div>
        </div>
        <span className={avaBadge(CONFIDENCE_TONE[finding.confidence])}>
          {finding.confidenceScore}% confidence
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Cell label="Measured" value={`${finding.currentValue} ${finding.unit}`} />
        <Cell label="Expected" value={finding.targetRange} />
        <Cell
          label="Estimated 100m influence"
          value={`${cost.range100mSeconds[0].toFixed(2)}–${cost.range100mSeconds[1].toFixed(2)} s`}
        />
      </div>
      <p className="mt-2 text-[11px] text-[#7e8797]">{cost.caveat}</p>

      <div className="mt-3 space-y-2">
        <Section title="Evidence" open>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#7e8797]">
                <tr><th className="pb-2">Metric</th><th>Measured</th><th>Expected</th><th>Difference</th><th>Video</th></tr>
              </thead>
              <tbody className="text-[#b3bccb]">
                {finding.supportingEvidence.map((evidence) => (
                  <tr key={`${finding.key}:${evidence.metric}`} className="border-t border-white/[0.05]">
                    <td className="py-2 font-medium text-[#f5f7fb]">{evidence.metric}</td>
                    <td>{evidence.measured}</td><td>{evidence.expected}</td><td>{evidence.difference}</td>
                    <td>{evidence.frameReference ?? evidence.videoReference ?? "Not captured"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#7e8797]">Affected metrics: {finding.affectedMetrics.join(", ")}</p>
        </Section>

        <Section title="Root cause">
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className={LABEL}>Observed</p>{compactList(finding.rootCause.observed)}</div>
            <div><p className={LABEL}>Likely technical causes</p>{compactList(finding.rootCause.likelyTechnicalCauses)}</div>
            <div><p className={LABEL}>Possible contributors</p>{compactList(finding.rootCause.possiblePhysicalContributors)}</div>
            <div><p className={LABEL}>Associated muscle groups</p>{compactList(finding.rootCause.associatedMuscleGroups)}</div>
            <div><p className={LABEL}>Alternative explanations</p>{compactList(finding.rootCause.alternativeExplanations)}</div>
            <div><p className={LABEL}>Needs additional testing</p>{compactList(finding.rootCause.additionalTesting)}</div>
          </div>
          <p className="mt-3 text-xs text-[#f5c451]">These are coaching hypotheses, not medical diagnoses.</p>
        </Section>

        <Section title="Recommendations">
          <p className="text-sm text-[#f5f7fb]"><strong>Primary:</strong> {finding.recommendationPlan.primaryFocus}</p>
          <p className="mt-1 text-sm text-[#b3bccb]"><strong>Secondary:</strong> {finding.recommendationPlan.secondaryFocus}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><p className={LABEL}>Drill themes</p>{compactList(finding.recommendationPlan.drillThemes)}</div>
            <div><p className={LABEL}>Sprint themes</p>{compactList(finding.recommendationPlan.sprintThemes)}</div>
            <div><p className={LABEL}>Strength themes</p>{compactList(finding.recommendationPlan.strengthThemes)}</div>
            <div><p className={LABEL}>Plyometric themes</p>{compactList(finding.recommendationPlan.plyometricThemes)}</div>
            <div><p className={LABEL}>Cue examples</p>{compactList(finding.recommendationPlan.cueExamples)}</div>
          </div>
        </Section>

        <Section title="Interactions & performance impact">
          {finding.interactions.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#b3bccb]">
              <span className="font-medium text-[#f5f7fb]">{finding.title}</span>
              {finding.interactions.map((interaction) => (
                <span key={interaction.targetKey} title={interaction.explanation} className="flex items-center gap-2">
                  <span className="text-[#2f80ed]">→</span>
                  <span className="rounded-full border border-white/[0.08] px-2 py-1">{interaction.targetKey}</span>
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-[#7e8797]">No supported downstream interaction.</p>}
          <p className="mt-3 text-sm text-[#b3bccb]">
            Could reasonably influence: {finding.performanceAreas.join(", ")}.
          </p>
        </Section>
      </div>
    </article>
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

      <p className="-mt-3 mb-4 text-sm leading-relaxed text-[#b3bccb]">{intro}</p>

      <Section title="Summary" open>
        <p className="mb-3 text-sm leading-relaxed text-[#b3bccb]">{report.headline}</p>
        <div className="space-y-3">
          {diagnosis.factors.map((f) => <FactorCard key={f.key} factor={f} />)}
        </div>
      </Section>

      <div className="mt-3 space-y-3">
        {[report.primaryLimiter, ...report.secondaryLimiters]
          .filter((finding): finding is Limiter => finding != null)
          .map((finding) => <EliteFinding key={finding.key} finding={finding} />)}
      </div>

      {report.dataGaps.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2f80ed]">
            What would sharpen this diagnosis
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-[#b3bccb]">
            {report.dataGaps.map((g) => (
              <li key={g.what}>
                <span className="font-medium text-[#f5f7fb]">{g.what}</span> — {g.wouldImprove}
              </li>
            ))}
          </ul>
        </div>
      )}
    </AvaPanel>
  );
}
