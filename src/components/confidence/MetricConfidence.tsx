import type { MeasurementConfidence } from "@/lib/confidence";

const STYLE = {
  high: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  medium: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  low: "border-red-400/25 bg-red-400/10 text-red-300",
} as const;

/** Compact by default; native title gives a no-JS hover explanation. */
export function ConfidenceBadge({ confidence }: { confidence: MeasurementConfidence }) {
  const title = [
    `Measurement confidence: ${confidence.score}%`,
    ...confidence.confidenceReason,
    ...confidence.qualityFlags.map((flag) => `${flag.label}: ${flag.why}`),
  ].join("\n");
  return (
    <span
      title={title}
      aria-label={`Measurement confidence ${confidence.score} percent`}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${STYLE[confidence.level]}`}
    >
      {confidence.score}% confidence
    </span>
  );
}

export function ConfidenceDetails({ confidence }: { confidence: MeasurementConfidence }) {
  return (
    <details className="mt-2 text-xs text-[#7e8797]">
      <summary className="cursor-pointer font-medium text-[#b3bccb]">Why this confidence?</summary>
      <div className="mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-black/10 p-3">
        <ul className="space-y-1">
          {confidence.confidenceReason.map((reason) => <li key={reason}>✓ {reason}</li>)}
        </ul>
        {confidence.qualityFlags.map((flag) => (
          <div key={flag.code} className="rounded-md border border-amber-400/15 bg-amber-400/[0.04] p-2">
            <p className="font-semibold text-amber-300">{flag.label}</p>
            <p>{flag.why}</p>
            <p className="mt-1">Improve: {flag.improvement}</p>
          </div>
        ))}
        <p>Measurement version: {confidence.measurementVersion}</p>
      </div>
    </details>
  );
}

