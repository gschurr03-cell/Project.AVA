import type { IntelligenceConclusion, IntelligenceClassification } from "@/lib/sprintIntelligence";
import { CONFIDENCE_LABEL_TEXT, pct, type ConfidenceLabel } from "@/lib/limitingFactors";

const CLASS_LABEL: Record<IntelligenceClassification, string> = {
  primary_limiter: "Primary limiter",
  supporting_limiter: "Supporting limiter",
  asymmetry: "Asymmetry",
  performance_strength: "Strength",
  contextual_finding: "Context",
  insufficient_evidence: "Insufficient evidence",
};
const CLASS_TONE: Record<IntelligenceClassification, string> = {
  primary_limiter: "#e46464",
  supporting_limiter: "#f5975c",
  asymmetry: "#f5c451",
  performance_strength: "#89d46a",
  contextual_finding: "#3b8eff",
  insufficient_evidence: "#7e8797",
};
const CONF_TONE: Record<ConfidenceLabel, string> = {
  very_high: "#89d46a",
  high: "#89d46a",
  moderate: "#f5c451",
  low: "#f5975c",
  insufficient: "#7e8797",
};

function Badge({ text, tone }: { text: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ color: tone, backgroundColor: `${tone}1f`, border: `1px solid ${tone}44` }}
    >
      {text}
    </span>
  );
}

/** A labelled block of evidence rows (Measured / Supporting / Counter). */
function EvidenceBlock({ heading, items, tone }: { heading: string; items: { label: string; value: string }[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tone ?? "#7e8797" }}>
        {heading}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex justify-between gap-4 text-xs">
            <span className="text-[#b3bccb]">{it.label}</span>
            <span className="text-right font-mono text-[#f5f7fb]">{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ConclusionCard({ conclusion, emphasis = false }: { conclusion: IntelligenceConclusion; emphasis?: boolean }) {
  const c = conclusion;
  const classTone = CLASS_TONE[c.classification];
  const confTone = CONF_TONE[c.confidence.label];
  const showConf = c.confidence.overall != null;

  return (
    <section
      className={`rounded-2xl border p-5 shadow-[0_8px_30px_rgba(0,0,0,0.24)] ${
        emphasis ? "border-[#2f80ed]/40 bg-[#2f80ed]/[0.06]" : "border-white/[0.08] bg-[#182233]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-[#f5f7fb]">{c.title}</h3>
          <p className="mt-1 text-sm text-[#b3bccb]">{c.conciseSummary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge text={CLASS_LABEL[c.classification]} tone={classTone} />
          {showConf ? (
            <Badge text={`Confidence · ${CONFIDENCE_LABEL_TEXT[c.confidence.label]} ${pct(c.confidence.overall)}`} tone={confTone} />
          ) : (
            <Badge text="Confidence · Not assigned" tone={CONF_TONE.insufficient} />
          )}
        </div>
      </div>

      {/* Evidence chain — structured sections, not one paragraph. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <EvidenceBlock heading="Measured" items={c.measured.map((m) => ({ label: m.label, value: m.value }))} />
        {c.comparedWith.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Compared with</p>
            <ul className="mt-1.5 space-y-1.5">
              {c.comparedWith.map((cb, i) => (
                <li key={i} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[#f5f7fb]">{cb.sourceLabel}</span>
                    {!cb.validated && <span className="rounded bg-[#f5c451]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#f5c451]">Provisional</span>}
                  </div>
                  {cb.rangeText && <p className="mt-0.5 font-mono text-[#b3bccb]">{cb.rangeText}</p>}
                  {cb.note && <p className="mt-0.5 text-[11px] text-[#7e8797]">{cb.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <EvidenceBlock heading="Supporting evidence" items={c.evidenceFor.slice(0, 4).map((e) => ({ label: e.label, value: e.value }))} tone="#89d46a" />
        <EvidenceBlock heading="What reduces confidence" items={c.evidenceAgainst.slice(0, 4).map((e) => ({ label: "", value: e.value }))} tone="#f5975c" />
      </div>

      {/* Interpretation → Conclusion */}
      <div className="mt-4 rounded-lg border border-white/[0.05] bg-[#101827] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Interpretation</p>
        <p className="mt-1 text-sm text-[#b3bccb]">{c.interpretation}</p>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#3b8eff]">Conclusion</p>
        <p className="mt-1 text-sm font-medium text-[#f5f7fb]">{c.detailedExplanation}</p>
      </div>

      <details className="group mt-4 border-t border-white/[0.06] pt-3">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7e8797] [&::-webkit-details-marker]:hidden">
          <span className="inline-block text-[#3b8eff] transition group-open:rotate-90">▸</span>
          Confidence, associations &amp; what to investigate
        </summary>
        <div className="mt-3 space-y-4">
          {/* Confidence explanation — never color alone. */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Confidence explanation</p>
            <p className="mt-1 text-xs text-[#b3bccb]">{c.confidence.explanation}</p>
            {c.confidence.raises.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold text-[#89d46a]">Why confidence is as high as it is</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-[#b3bccb]">
                  {c.confidence.raises.map((r, i) => (
                    <li key={i}>+ {r}</li>
                  ))}
                </ul>
              </div>
            )}
            {c.confidence.reduces.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold text-[#f5975c]">What limits confidence</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-[#b3bccb]">
                  {c.confidence.reduces.map((r, i) => (
                    <li key={i}>− {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {c.alternativeExplanations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Alternative explanations</p>
              <ul className="mt-1 space-y-0.5 text-xs text-[#b3bccb]">
                {c.alternativeExplanations.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </div>
          )}

          {c.technicalAssociations.map((a, i) => (
            <div key={`t${i}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">{a.category}</p>
              <p className="mt-1 text-xs text-[#b3bccb]">{a.items.join(" · ")}</p>
              <p className="mt-1 text-[11px] italic text-[#7e8797]">{a.disclaimer}</p>
            </div>
          ))}

          {c.physicalAssociations.map((a, i) => (
            <div key={`p${i}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Possible physical associations — {a.category}</p>
              {a.muscleGroups && a.muscleGroups.length > 0 && <p className="mt-1 text-xs text-[#b3bccb]">Commonly relevant: {a.muscleGroups.join(", ")}.</p>}
              <p className="mt-1 text-[11px] italic text-[#7e8797]">{a.disclaimer}</p>
            </div>
          ))}

          {c.recommendations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">What to investigate next</p>
              <div className="mt-2 space-y-2">
                {c.recommendations.map((r, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.05] bg-[#101827] p-3">
                    <p className="text-xs font-semibold text-[#f5f7fb]">{r.title}</p>
                    <p className="mt-1 text-xs text-[#b3bccb]">{r.focus}</p>
                    <p className="mt-1 text-[11px] text-[#7e8797]"><span className="font-semibold text-[#b3bccb]">Why:</span> {r.why}</p>
                    {r.observe && <p className="text-[11px] text-[#7e8797]"><span className="font-semibold text-[#b3bccb]">Observe:</span> {r.observe}</p>}
                    <p className="mt-1 text-[11px] italic text-[#f5c451]">{r.doesNotProve}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.changeConditions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">AVA may revise this if</p>
              <ul className="mt-1 space-y-0.5 text-xs text-[#b3bccb]">
                {c.changeConditions.map((cc, i) => (
                  <li key={i}>• {cc}</li>
                ))}
              </ul>
            </div>
          )}

          {c.limitations.length > 0 && c.limitations.map((l, i) => (
            <p key={`l${i}`} className="text-[11px] text-[#f5c451]">⚠ {l}</p>
          ))}
        </div>
      </details>
    </section>
  );
}
