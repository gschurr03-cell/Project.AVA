import { AvaPanel } from "@/components/ava/AvaPanel";
import type { AvaPerformanceScoreResult } from "@/lib/intelligence/performanceScore";

/**
 * AVA Performance Score (Day 84) — the trusted-only headline score. Renders the pure
 * {@link calculateAvaPerformanceScore} result. When there isn't enough trusted data
 * it shows an honest "Not enough trusted data" state, never a fake 0.
 */

const LABEL_TONE: Record<string, string> = {
  Elite: "text-[#E4C25A]",
  High: "text-[#D8D8DC]",
  Solid: "text-[#E0A063]",
  Developing: "text-[#A0A2A8]",
  "Needs Work": "text-[#FF7A70]",
};

export default function AvaPerformanceScoreCard({
  result,
}: {
  result: AvaPerformanceScoreResult;
}) {
  if (!result.available || result.score == null) {
    return (
      <AvaPanel eyebrow="AVA Performance Score" title="Not enough trusted data">
        <p className="text-sm text-[#A0A2A8]">
          {result.note ??
            "The AVA Performance Score needs a calibrated run with trusted top speed, velocity, frequency, and peak stride length."}
        </p>
      </AvaPanel>
    );
  }

  const tone = LABEL_TONE[result.label ?? ""] ?? "text-[#F5F5F7]";

  return (
    <AvaPanel eyebrow="AVA Performance Score" title="Trusted Sprint Score">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className={`text-6xl font-extrabold tracking-tight ${tone}`}>
            {result.score}
            <span className="ml-1 text-2xl font-semibold text-[#6B7280]">/ 100</span>
          </p>
          <p className={`mt-1 text-sm font-bold uppercase tracking-[0.18em] ${tone}`}>
            {result.label}
          </p>
        </div>
        <p className="mb-1 max-w-md text-xs leading-5 text-[#6B7280]">
          Weighted from trusted metrics only — top speed, average velocity, frequency, peak stride /
          trochanter ratio, stride retention, and recording quality. No ground contact or flight time.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {result.components.map((c) => (
          <div key={c.name} className="rounded-lg border border-white/[0.06] bg-[#19191C] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-[#F5F5F7]">{c.name}</p>
              <p className="text-xs font-bold text-[#E4C25A]">{c.score}</p>
            </div>
            <p className="mt-0.5 text-[11px] text-[#6B7280]">
              {c.value != null ? c.value : "—"} · {Math.round(c.weight * 100)}% weight
            </p>
          </div>
        ))}
      </div>
    </AvaPanel>
  );
}
