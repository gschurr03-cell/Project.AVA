import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
import type { CalibrationReport, Confidence, Measurement } from "@/lib/calibration";

/**
 * Presentation only: renders the calibration engine's real-world estimates with
 * their confidence, or a clear "needs calibration" prompt. No logic beyond
 * formatting — the numbers and confidences come from `@/lib/calibration`.
 */

const CONFIDENCE_TONE: Record<Confidence, AvaTone> = {
  high: "gold",
  medium: "bronze",
  low: "gray",
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={avaBadge(CONFIDENCE_TONE[confidence])}>{confidence}</span>;
}

function formatValue(m: Measurement): string {
  if (m.value == null) return "—";
  return `${m.value.toFixed(2)} ${m.unit}`;
}

export default function CalibrationPanel({ report }: { report: CalibrationReport }) {
  return (
    <AvaPanel
      eyebrow="Calibration"
      title="Real-World Estimates"
      className={report.scale ? "relative" : ""}
    >
      {report.scale && (
        <div className="absolute right-5 top-5">
          <ConfidenceBadge confidence={report.scale.confidence} />
        </div>
      )}
      <p className="-mt-3 mb-4 text-xs text-[#6B7280]">
        Calibrated from pose + athlete profile. Estimates only — accuracy depends on the calibration
        source below.
      </p>

      {!report.calibrated ? (
        <div className="rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 p-4">
          <p className="text-sm font-semibold text-[#E0A063]">Needs calibration</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#A0A2A8]">
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.measurements
              .filter((m) => !m.debug)
              .map((m) => (
                <div
                  key={m.key}
                  className="rounded-xl border border-white/[0.06] bg-[#19191C] p-3"
                >
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                    {m.label}
                  </dt>
                  <dd className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold text-[#F5F5F7]">{formatValue(m)}</span>
                    {m.confidence && <ConfidenceBadge confidence={m.confidence} />}
                  </dd>
                </div>
              ))}
          </dl>

          {/* Debug-only diagnostics (e.g. whole-clip travel) — never a headline number;
              the manually-defined zone distance is the source of truth. */}
          {report.measurements.some((m) => m.debug) && (
            <p className="mt-3 text-xs text-[#6B7280]">
              <span className="font-medium uppercase tracking-wide">Debug:</span>{" "}
              {report.measurements
                .filter((m) => m.debug)
                .map((m) => `${m.label} ${formatValue(m)}`)
                .join(" · ")}
            </p>
          )}

          {report.scale && (
            <p className="mt-3 text-xs text-[#A0A2A8]">
              <span className="font-medium text-[#F5F5F7]">Calibration source:</span>{" "}
              {report.scale.reason}
            </p>
          )}

          {report.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#E0A063]">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </AvaPanel>
  );
}
