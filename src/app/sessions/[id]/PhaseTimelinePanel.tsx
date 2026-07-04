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

const PHASE_COLOR: Record<SprintPhase, string> = {
  start: "bg-sky-400",
  acceleration: "bg-indigo-500",
  transition: "bg-violet-500",
  maxVelocity: "bg-rose-500",
  maintenance: "bg-amber-500",
  deceleration: "bg-slate-400",
};

const CONFIDENCE_BADGE: Record<PhaseConfidence, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-200 text-gray-600",
};

function ConfidenceBadge({ confidence }: { confidence: PhaseConfidence }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${CONFIDENCE_BADGE[confidence]}`}
    >
      {confidence}
    </span>
  );
}

const fmt = (t: number) => `${t.toFixed(2)}s`;

export default function PhaseTimelinePanel({ report }: { report: PhaseReport }) {
  const span = Math.max(report.spanEnd - report.spanStart, 1e-6);

  return (
    <section className="mt-6 rounded-lg border bg-gray-50 p-5">
      <h2 className="mb-1 text-xl font-bold text-lane">Sprint Phases</h2>
      <p className="mb-4 text-xs text-gray-500">
        Detected from the velocity profile and step marks. Phase boundaries are estimates.
      </p>

      {!report.available ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Phases unavailable</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {/* Proportional timeline band */}
          <div className="flex h-8 w-full overflow-hidden rounded-md border">
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
          <div className="mt-1 flex justify-between text-xs text-gray-400">
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
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-amber-700">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PhaseRow({ band }: { band: PhaseBand }) {
  return (
    <li className="rounded-md border bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-sm ${PHASE_COLOR[band.phase]}`} />
          <span className="text-sm font-semibold text-gray-800">{PHASE_LABELS[band.phase]}</span>
          <span className="font-mono text-xs text-gray-400">
            {fmt(band.startTime)}–{fmt(band.endTime)}
          </span>
        </div>
        <ConfidenceBadge confidence={band.confidence} />
      </div>
      <p className="mt-1 text-sm text-gray-600">{band.explanation}</p>
    </li>
  );
}
