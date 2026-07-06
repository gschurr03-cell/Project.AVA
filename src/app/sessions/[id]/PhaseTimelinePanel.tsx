import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
import {
  PHASE_LABELS,
  type PhaseBand,
  type PhaseConfidence,
  type PhaseReport,
  type SprintPhase,
} from "@/lib/phases";

/**
 * Presentation only: renders detected sprint phases as a proportional timeline
 * band plus a per-phase list (time range, confidence, reasoning). All detection
 * comes from `@/lib/phases`; this only lays it out.
 */

// Categorical phase colours (a legend, not performance status). A warm/neutral ramp
// with no blue/teal — reads at a glance on the dark surface and stays on-brand.
const PHASE_COLOR: Record<SprintPhase, string> = {
  start: "bg-[#6B7280]",
  acceleration: "bg-[#CD7F32]",
  transition: "bg-[#D4AF37]",
  maxVelocity: "bg-[#D72638]",
  maintenance: "bg-[#E4A672]",
  deceleration: "bg-[#4b4b52]",
};

const CONFIDENCE_TONE: Record<PhaseConfidence, AvaTone> = {
  high: "gold",
  medium: "bronze",
  low: "gray",
};

function ConfidenceBadge({ confidence }: { confidence: PhaseConfidence }) {
  return <span className={avaBadge(CONFIDENCE_TONE[confidence])}>{confidence}</span>;
}

const fmt = (t: number) => `${t.toFixed(2)}s`;

export default function PhaseTimelinePanel({ report }: { report: PhaseReport }) {
  const span = Math.max(report.spanEnd - report.spanStart, 1e-6);

  return (
    <AvaPanel eyebrow="Sprint Phases" title="Phase Timeline">
      <p className="-mt-3 mb-4 text-xs text-[#6B7280]">
        Detected from the velocity profile and step marks. Phase boundaries are estimates.
      </p>

      {!report.available ? (
        <div className="rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 p-4">
          <p className="text-sm font-semibold text-[#E0A063]">Phases unavailable</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#A0A2A8]">
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {/* Proportional timeline band */}
          <div className="flex h-8 w-full overflow-hidden rounded-md border border-white/[0.08]">
            {report.bands.map((band, i) => {
              const width = ((band.endTime - band.startTime) / span) * 100;
              return (
                <div
                  key={`${band.phase}-${i}`}
                  className={`${PHASE_COLOR[band.phase]} h-full`}
                  style={{ width: `${width}%` }}
                  title={`${PHASE_LABELS[band.phase]} (${fmt(band.startTime)}–${fmt(band.endTime)})`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-[#6B7280]">
            <span>{fmt(report.spanStart)}</span>
            {report.peakVelocityTime != null && (
              <span>Peak velocity ≈ {fmt(report.peakVelocityTime)}</span>
            )}
            <span>{fmt(report.spanEnd)}</span>
          </div>

          {/* Per-phase detail */}
          <ul className="mt-4 space-y-2">
            {report.bands.map((band, i) => (
              <PhaseRow key={`${band.phase}-detail-${i}`} band={band} />
            ))}
          </ul>

          {report.warnings.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[#E0A063]">
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

function PhaseRow({ band }: { band: PhaseBand }) {
  return (
    <li className="rounded-xl border border-white/[0.06] bg-[#19191C] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-sm ${PHASE_COLOR[band.phase]}`} />
          <span className="text-sm font-semibold text-[#F5F5F7]">{PHASE_LABELS[band.phase]}</span>
          <span className="font-mono text-xs text-[#6B7280]">
            {fmt(band.startTime)}–{fmt(band.endTime)}
          </span>
        </div>
        <ConfidenceBadge confidence={band.confidence} />
      </div>
      <p className="mt-1 text-sm text-[#A0A2A8]">{band.explanation}</p>
    </li>
  );
}
