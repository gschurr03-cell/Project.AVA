import type {
  FactorStatus,
  MetricAvailability,
  MetricJudgement,
  QualityFactor,
  QualityRating,
  RecordingQualityReport,
} from "@/lib/recording/quality";

/**
 * Presentation only: the Recording Quality trust indicator at the top of the
 * session page. Shows the overall rating + score, the inspected factors (each with
 * its reason), and which metrics are certified / estimated / unavailable for this
 * recording — every item explains WHY. All judgement comes from
 * `@/lib/recording/quality`; this only lays it out.
 *
 * Rating maps onto the AVA medal system: Excellent = Gold, Good = Silver,
 * Fair = Bronze, Poor = Red Alert.
 */

const RATING_STYLE: Record<QualityRating, { text: string; ring: string; label: string }> = {
  excellent: { text: "text-[#E4C25A]", ring: "ring-[#D4AF37]/25", label: "Excellent" },
  good: { text: "text-[#D8D8DC]", ring: "ring-[#C0C0C0]/25", label: "Good" },
  fair: { text: "text-[#E0A063]", ring: "ring-[#CD7F32]/25", label: "Fair" },
  poor: { text: "text-[#FF7A70]", ring: "ring-[#FF3B30]/30", label: "Poor" },
};

const FACTOR_MARK: Record<FactorStatus, { icon: string; color: string }> = {
  pass: { icon: "✓", color: "text-[#E4C25A]" },
  warn: { icon: "!", color: "text-[#E0A063]" },
  fail: { icon: "✕", color: "text-[#FF7A70]" },
};

const AVAIL_STYLE: Record<MetricAvailability, { dot: string; heading: string; tone: string }> = {
  certified: { dot: "bg-[#D4AF37]", heading: "Certified metrics", tone: "text-[#F5F5F7]" },
  estimated: { dot: "bg-[#CD7F32]", heading: "Estimated metrics", tone: "text-[#A0A2A8]" },
  unavailable: { dot: "bg-[#6B7280]", heading: "Unavailable", tone: "text-[#6B7280]" },
};

function Stars({ stars }: { stars: number }) {
  return (
    <span aria-label={`${stars} of 5 stars`} className="text-lg tracking-tight">
      <span className="text-[#E4C25A]">{"★".repeat(stars)}</span>
      <span className="text-white/15">{"★".repeat(Math.max(0, 5 - stars))}</span>
    </span>
  );
}

function Factor({ factor }: { factor: QualityFactor }) {
  const mark = FACTOR_MARK[factor.status];
  return (
    <li className="flex items-start gap-2" title={factor.why}>
      <span className={`mt-0.5 font-bold ${mark.color}`}>{mark.icon}</span>
      <span className="text-sm text-[#A0A2A8]">
        <span className="font-medium text-[#F5F5F7]">{factor.label}:</span> {factor.valueText}
        <span className="block text-xs text-[#6B7280]">{factor.why}</span>
      </span>
    </li>
  );
}

function MetricGroup({
  availability,
  items,
}: {
  availability: MetricAvailability;
  items: MetricJudgement[];
}) {
  const style = AVAIL_STYLE[availability];
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{style.heading}</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-1 pl-4 text-sm text-[#6B7280]">None</p>
      ) : (
        <ul className="mt-1 space-y-1.5 pl-4">
          {items.map((m) => (
            <li key={m.key} className="text-sm">
              <span className={`font-medium ${style.tone}`}>{m.label}</span>
              <span className="block text-xs text-[#6B7280]">{m.why}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RecordingQualityCard({ report }: { report: RecordingQualityReport }) {
  const style = RATING_STYLE[report.rating];
  return (
    <details
      className={`group rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ${style.ring}`}
    >
      {/* Header stays visible as the trust indicator; the detail (factors + which
          metrics are certified/estimated/unavailable) is collapsed by default (Day 74). */}
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D72638]">Recording Quality</p>
          <div className="mt-1 flex items-center gap-3">
            <h2 className={`text-2xl font-bold ${style.text}`}>{style.label}</h2>
            <Stars stars={report.stars} />
          </div>
          <p className="mt-1 max-w-xl text-sm text-[#A0A2A8]">{report.summary}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className={`text-3xl font-extrabold ${style.text}`}>{report.score}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#6B7280]">Score / 100</p>
          </div>
          <svg
            className="mt-1 h-4 w-4 shrink-0 text-[#6B7280] transition-transform duration-150 group-open:rotate-90"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </summary>

      <div className="mt-4 grid gap-5 border-t border-white/[0.06] pt-4 md:grid-cols-2">
        <ul className="space-y-1.5">
          {report.factors.map((f) => (
            <Factor key={f.key} factor={f} />
          ))}
        </ul>
        <div className="space-y-4">
          <MetricGroup availability="certified" items={report.certified} />
          <MetricGroup availability="estimated" items={report.estimated} />
          <MetricGroup availability="unavailable" items={report.unavailable} />
        </div>
      </div>
    </details>
  );
}
