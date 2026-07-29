import { AvaPanel } from "@/components/ava/AvaPanel";
import type { ProgressDirection, ProgressReport } from "@/lib/intelligence/progress";

const DIRECTION_META: Record<ProgressDirection, { label: string; color: string; arrow: string }> = {
  improved: { label: "Improved", color: "#89d46a", arrow: "▲" },
  unchanged: { label: "Unchanged", color: "#b3bccb", arrow: "→" },
  declined: { label: "Declined", color: "#3b8eff", arrow: "▼" },
};

function signed(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  return n > 0 ? `+${s}` : s;
}

/**
 * "Progress Since Last Session" — presentation only. Shows the latest fly session's
 * tracked metrics vs the previous session (direction, numeric + percent change), with
 * the latest recommendation's metric highlighted first, plus whether the previous
 * recommendation's target improved. Falls back to a "more sessions" note when there
 * isn't a comparable prior session. No logic of its own.
 */
export default function ProgressCard({ report }: { report: ProgressReport }) {
  if (!report.available) {
    return (
      <AvaPanel eyebrow="Progress" title="Progress Since Last Session">
        <p className="text-sm text-[#b3bccb]">
          {report.message ?? "More sessions needed to track progress."}
        </p>
      </AvaPanel>
    );
  }

  const decimalsFor = (unit: string) => (unit === "" ? 0 : unit === "s" ? 3 : 2);

  return (
    <AvaPanel eyebrow="Progress" title="Progress Since Last Session">
      {report.previousRecommendationImproved != null && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            report.previousRecommendationImproved
              ? "border-[#89d46a]/30 bg-[#89d46a]/10 text-[#89d46a]"
              : "border-white/[0.1] bg-white/[0.04] text-[#b3bccb]"
          }`}
        >
          {report.previousRecommendationImproved
            ? "✓ The focus from last session's recommendation improved."
            : "Last session's recommended focus hasn't moved yet — keep at it."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {report.metrics.map((m) => {
          const meta = DIRECTION_META[m.direction];
          const d = decimalsFor(m.unit);
          return (
            <div
              key={m.key}
              className={`rounded-xl border p-3 ${
                m.highlighted
                  ? "border-[#2f80ed]/30 bg-[#2f80ed]/[0.05]"
                  : "border-white/[0.06] bg-[#182233]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b3bccb]">
                  {m.label}
                  {m.highlighted && (
                    <span className="ml-2 rounded bg-[#2f80ed]/20 px-1.5 py-0.5 text-[9px] text-[#3b8eff]">
                      focus
                    </span>
                  )}
                </span>
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: meta.color }}
                >
                  {meta.arrow} {meta.label}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-lg font-semibold text-[#f5f7fb]">
                  {m.previous.toFixed(d)} → {m.latest.toFixed(d)}
                  {m.unit ? <span className="ml-1 text-xs text-[#7e8797]">{m.unit}</span> : null}
                </span>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: meta.color }}>
                {signed(m.delta, d)} {m.unit} ({signed(m.percentChange, 1)}%)
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-[#7e8797]">
        Comparing the two most recent calibrated fly sessions. Frame-rate-limited timing
        (ground contact, flight) is excluded from progress at this frame rate.
      </p>
    </AvaPanel>
  );
}
