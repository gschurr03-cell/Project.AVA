import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
import type { CalibrationReport, Confidence } from "@/lib/calibration";

/**
 * Calibration Quality (Day 79) — SETUP quality only, not performance output.
 *
 * The calibration engine also produces its own anthropometric estimates (leg-length
 * stride, whole-clip velocity) that historically DISAGREED with the Trusted Sprint
 * Metrics and eroded trust. Those competing numbers are deliberately not shown here:
 * all performance values come from the Trusted Sprint Metrics card (the single source
 * of truth). This panel reports only how well the session is calibrated.
 */

const CONFIDENCE_TONE: Record<Confidence, AvaTone> = {
  high: "gold",
  medium: "bronze",
  low: "gray",
};

/** Friendly names for the scale method. */
const METHOD_LABEL: Record<string, string> = {
  legLength: "Athlete leg length",
  knownDistance: "Known distance",
  manual: "Manual timing gates",
  gates: "Timing gates",
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={avaBadge(CONFIDENCE_TONE[confidence])}>{confidence}</span>;
}

export default function CalibrationPanel({ report }: { report: CalibrationReport }) {
  const scale = report.scale;

  return (
    <AvaPanel eyebrow="Calibration" title="Calibration Quality" className="relative">
      {scale && (
        <div className="absolute right-5 top-5">
          <ConfidenceBadge confidence={scale.confidence} />
        </div>
      )}
      <p className="-mt-3 mb-4 text-xs text-[#6B7280]">
        How well this session is calibrated. Performance numbers come from Trusted Sprint Metrics
        above — this is setup quality only.
      </p>

      {!report.calibrated || !scale ? (
        <div className="rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 p-4">
          <p className="text-sm font-semibold text-[#E0A063]">Needs calibration</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#A0A2A8]">
            {report.warnings.length > 0 ? (
              report.warnings.map((w) => <li key={w}>{w}</li>)
            ) : (
              <li>Set two timing gates a known distance apart on the overlay to calibrate.</li>
            )}
          </ul>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-3">
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                Scale confidence
              </dt>
              <dd className="mt-1 text-lg font-bold capitalize text-[#F5F5F7]">{scale.confidence}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-3">
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
                Method
              </dt>
              <dd className="mt-1 text-lg font-bold text-[#F5F5F7]">
                {METHOD_LABEL[scale.method] ?? scale.method}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-[#A0A2A8]">
            <span className="font-medium text-[#F5F5F7]">Source:</span> {scale.reason}
          </p>

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
