import type { Limiter, LimiterImpact, ConfidenceLabel } from "@/lib/limitingFactors";
import { CONFIDENCE_LABEL_TEXT, IMPACT_LABEL_TEXT, pct } from "@/lib/limitingFactors";

const IMPACT_TONE: Record<LimiterImpact, string> = {
  very_high: "#e46464",
  high: "#f5975c",
  moderate: "#f5c451",
  low: "#89d46a",
  negligible: "#7e8797",
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

function num(v: number | null, unit: string) {
  return v == null ? "—" : `${v} ${unit}`;
}

/** A minimal measured-value-vs-target comparison band (only when a real target exists). */
function ComparisonBand({ limiter }: { limiter: Limiter }) {
  const t = limiter.target;
  if (t.type === "unavailable" || t.minimum == null || t.maximum == null) return null;
  const primary = limiter.measuredValues[0]?.value;
  if (primary == null) return null;
  const lo = Math.min(t.minimum, primary) * 0.98;
  const hi = Math.max(t.maximum, primary) * 1.02;
  const span = hi - lo || 1;
  const at = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-white/[0.06]">
        <div className="absolute inset-y-0 rounded-full bg-[#2f80ed]/40" style={{ left: at(t.minimum), right: `calc(100% - ${at(t.maximum)})` }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2f80ed]" style={{ left: at(primary) }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[#7e8797]">
        <span>{t.minimum}{t.unit}</span>
        <span>target · {t.sourceLabel}</span>
        <span>{t.maximum}{t.unit}</span>
      </div>
    </div>
  );
}

export default function LimiterCard({ limiter }: { limiter: Limiter }) {
  const impactTone = IMPACT_TONE[limiter.impact.level];
  const confTone = CONF_TONE[limiter.confidence.label];
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#182233] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7e8797]">#{limiter.rank}</p>
          <h3 className="mt-0.5 text-lg font-bold tracking-tight text-[#f5f7fb]">{limiter.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge text={`Impact · ${IMPACT_LABEL_TEXT[limiter.impact.level]}`} tone={impactTone} />
          <Badge text={`Confidence · ${CONFIDENCE_LABEL_TEXT[limiter.confidence.label]} ${pct(limiter.confidence.overall)}`} tone={confTone} />
        </div>
      </div>

      <p className="mt-2 text-sm text-[#b3bccb]">{limiter.summary}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {limiter.measuredValues.map((mv) => (
          <div key={mv.label} className="rounded-lg border border-white/[0.05] bg-[#101827] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#7e8797]">{mv.label}</p>
            <p className="mt-0.5 text-base font-semibold text-[#f5f7fb]">{num(mv.value, mv.unit)}</p>
            {mv.detail && <p className="text-[10px] text-[#7e8797]">{mv.detail}</p>}
          </div>
        ))}
        {limiter.deviation.percentage != null && (
          <div className="rounded-lg border border-white/[0.05] bg-[#101827] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#7e8797]">Difference</p>
            <p className="mt-0.5 text-base font-semibold text-[#f5f7fb]">{limiter.deviation.percentage}%</p>
            {limiter.deviation.absolute != null && <p className="text-[10px] text-[#7e8797]">{limiter.deviation.absolute} absolute</p>}
          </div>
        )}
      </div>

      <ComparisonBand limiter={limiter} />

      {limiter.reasoning.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Why this matters</p>
          {limiter.reasoning.map((r, i) => (
            <p key={i} className="mt-1 text-sm text-[#b3bccb]">{r}</p>
          ))}
        </div>
      )}

      <details className="group mt-4 border-t border-white/[0.06] pt-3">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7e8797] [&::-webkit-details-marker]:hidden">
          <span className="inline-block text-[#3b8eff] transition group-open:rotate-90">▸</span>
          Evidence, associations &amp; focus
        </summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Evidence</p>
            <ul className="mt-1 space-y-0.5">
              {limiter.evidence.map((e, i) => (
                <li key={i} className="flex justify-between gap-4 text-xs">
                  <span className="text-[#7e8797]">{e.label}</span>
                  <span className="text-right font-mono text-[#b3bccb]">{e.value}</span>
                </li>
              ))}
            </ul>
          </div>

          {limiter.possibleTechnicalAssociations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Possible technical associations</p>
              <p className="mt-1 text-xs leading-5 text-[#b3bccb]">{limiter.possibleTechnicalAssociations.join(" · ")}</p>
            </div>
          )}

          {limiter.possiblePhysicalAssociations.map((pa, i) => (
            <div key={i}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Possible physical associations — {pa.category}</p>
              {pa.muscleGroups && <p className="mt-1 text-xs text-[#b3bccb]">Commonly relevant: {pa.muscleGroups.join(", ")}.</p>}
              <p className="mt-1 text-[11px] italic leading-5 text-[#7e8797]">{pa.disclaimer}</p>
            </div>
          ))}

          {limiter.recommendations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Focused ideas</p>
              <div className="mt-2 space-y-2">
                {limiter.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.05] bg-[#101827] p-3">
                    <p className="text-xs font-semibold text-[#f5f7fb]">{rec.title}</p>
                    <p className="mt-1 text-xs text-[#b3bccb]">{rec.focus}</p>
                    <p className="mt-1 text-[11px] text-[#7e8797]"><span className="font-semibold text-[#b3bccb]">Why:</span> {rec.why}</p>
                    {rec.observe && <p className="text-[11px] text-[#7e8797]"><span className="font-semibold text-[#b3bccb]">Observe:</span> {rec.observe}</p>}
                    {rec.caution && <p className="mt-1 text-[11px] italic text-[#f5c451]">{rec.caution}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-[#7e8797]">{limiter.confidence.explanation}</p>
          {limiter.dataQualityWarnings.map((w, i) => (
            <p key={i} className="text-[11px] text-[#f5c451]">⚠ {w}</p>
          ))}
        </div>
      </details>
    </section>
  );
}
