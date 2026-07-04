import type {
  IntelligenceConfidence,
  Limiter,
  SprintIntelligenceReport,
} from "@/lib/intelligence";

/**
 * Presentation only: renders the Sprint Intelligence assessment — the primary
 * limiter in full, ranked secondary limiters, why each matters, the phases it
 * affects, recommended focus + drills, confidence, and the data that would
 * sharpen the analysis. All synthesis comes from `@/lib/intelligence`; this only
 * lays it out.
 */

const CONFIDENCE_BADGE: Record<IntelligenceConfidence, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-200 text-gray-600",
};

const SEVERITY_BADGE: Record<Limiter["severity"], string> = {
  poor: "bg-red-100 text-red-700",
  watch: "bg-amber-100 text-amber-700",
};

const LABEL = "text-xs font-semibold uppercase tracking-wide text-gray-400";

function ConfidenceBadge({ confidence }: { confidence: IntelligenceConfidence }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${CONFIDENCE_BADGE[confidence]}`}
    >
      {confidence} confidence
    </span>
  );
}

function SeverityBadge({ severity }: { severity: Limiter["severity"] }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${SEVERITY_BADGE[severity]}`}
    >
      {severity}
    </span>
  );
}

function PhaseChips({ phases }: { phases: Limiter["affectedPhases"] }) {
  if (phases.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {phases.map((p) => (
        <span
          key={p.phase}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            p.observed
              ? "border-lane/30 bg-white text-gray-700"
              : "border-dashed border-gray-300 bg-gray-50 text-gray-400"
          }`}
          title={p.observed ? `Detected ${p.window}` : "Not captured in this clip"}
        >
          {p.label}
          {p.observed && p.window ? ` · ${p.window}` : " · not captured"}
        </span>
      ))}
    </div>
  );
}

function Reasoning({ reasoning }: { reasoning: string[] }) {
  if (reasoning.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
      {reasoning.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
  );
}

function DrillList({ drills, compact }: { drills: Limiter["drills"]; compact?: boolean }) {
  if (drills.length === 0) return null;
  if (compact) {
    return (
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-500">
        {drills.map((d) => (
          <li key={d.id}>
            <span className="font-medium text-gray-700">{d.name}</span> — {d.coachingCue} ({d.difficulty})
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-1 space-y-2">
      {drills.map((d) => (
        <div key={d.id} className="rounded border bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-gray-800">{d.name}</p>
            <span className="text-xs text-gray-400">
              {d.category} · {d.difficulty}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{d.coachingCue}</p>
        </div>
      ))}
    </div>
  );
}

function PrimaryLimiterCard({ limiter }: { limiter: Limiter }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>Primary limiter</p>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={limiter.severity} />
          <ConfidenceBadge confidence={limiter.confidence} />
        </div>
      </div>

      <h3 className="mt-2 text-lg font-semibold text-gray-800">{limiter.title}</h3>

      <p className={`mt-3 ${LABEL}`}>Why this matters</p>
      <p className="text-sm text-gray-600">{limiter.why}</p>

      <p className={`mt-3 ${LABEL}`}>How AVA reached this</p>
      <Reasoning reasoning={limiter.reasoning} />

      <p className={`mt-3 ${LABEL}`}>Sprint phases affected</p>
      <PhaseChips phases={limiter.affectedPhases} />

      <p className={`mt-3 ${LABEL}`}>Recommended focus</p>
      <p className="text-sm text-gray-600">{limiter.coachingFocus}</p>

      {limiter.drills.length > 0 && (
        <>
          <p className={`mt-3 ${LABEL}`}>Suggested drills</p>
          <DrillList drills={limiter.drills} />
        </>
      )}
    </div>
  );
}

function SecondaryLimiterCard({ limiter }: { limiter: Limiter }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-gray-800">
          {limiter.rank}. {limiter.title}
        </p>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={limiter.severity} />
          <ConfidenceBadge confidence={limiter.confidence} />
        </div>
      </div>

      <p className="mt-2 text-sm text-gray-600">{limiter.why}</p>

      <p className={`mt-2 ${LABEL}`}>How AVA reached this</p>
      <Reasoning reasoning={limiter.reasoning} />

      <PhaseChips phases={limiter.affectedPhases} />

      <p className={`mt-2 ${LABEL}`}>Recommended focus</p>
      <p className="text-sm text-gray-600">{limiter.coachingFocus}</p>

      <DrillList drills={limiter.drills} compact />
    </div>
  );
}

export default function SprintIntelligencePanel({
  report,
}: {
  report: SprintIntelligenceReport;
}) {
  return (
    <section className="mt-6 space-y-5 rounded-lg border bg-gray-50 p-5">
      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-lane">Sprint Intelligence</h2>
          {report.confidence && <ConfidenceBadge confidence={report.confidence} />}
        </div>
        <p className="text-sm text-gray-700">{report.headline}</p>
      </div>

      {report.available && report.primaryLimiter && (
        <PrimaryLimiterCard limiter={report.primaryLimiter} />
      )}

      {report.secondaryLimiters.length > 0 && (
        <div>
          <h3 className="mb-2 text-base font-semibold text-gray-800">Secondary limiters</h3>
          <div className="space-y-3">
            {report.secondaryLimiters.map((l) => (
              <SecondaryLimiterCard key={l.key} limiter={l} />
            ))}
          </div>
        </div>
      )}

      {report.dataGaps.length > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            What would sharpen this analysis
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-sky-900">
            {report.dataGaps.map((g) => (
              <li key={g.what}>
                <span className="font-medium">{g.what}</span> — {g.wouldImprove}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-400">{report.method}</p>
    </section>
  );
}
