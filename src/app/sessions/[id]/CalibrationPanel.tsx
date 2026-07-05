import type { CalibrationReport, Confidence, Measurement } from "@/lib/calibration";

/**
 * Presentation only: renders the calibration engine's real-world estimates with
 * their confidence, or a clear "needs calibration" prompt. No logic beyond
 * formatting — the numbers and confidences come from `@/lib/calibration`.
 */

const CONFIDENCE_BADGE: Record<Confidence, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-200 text-gray-600",
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${CONFIDENCE_BADGE[confidence]}`}
    >
      {confidence}
    </span>
  );
}

function formatValue(m: Measurement): string {
  if (m.value == null) return "—";
  return `${m.value.toFixed(2)} ${m.unit}`;
}

export default function CalibrationPanel({ report }: { report: CalibrationReport }) {
  return (
    <section className="mt-6 rounded-lg border bg-gray-50 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-lane">Real-World Estimates</h2>
        {report.scale && <ConfidenceBadge confidence={report.scale.confidence} />}
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Calibrated from pose + athlete profile. Estimates only — accuracy depends on the calibration
        source below.
      </p>

      {!report.calibrated ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Needs calibration</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
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
                <div key={m.key} className="rounded-md border bg-white p-3 shadow-sm">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {m.label}
                  </dt>
                  <dd className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold text-gray-800">{formatValue(m)}</span>
                    {m.confidence && <ConfidenceBadge confidence={m.confidence} />}
                  </dd>
                </div>
              ))}
          </dl>

          {/* Debug-only diagnostics (e.g. whole-clip travel) — never a headline number;
              the manually-defined zone distance is the source of truth. */}
          {report.measurements.some((m) => m.debug) && (
            <p className="mt-3 text-xs text-gray-400">
              <span className="font-medium uppercase tracking-wide">Debug:</span>{" "}
              {report.measurements
                .filter((m) => m.debug)
                .map((m) => `${m.label} ${formatValue(m)}`)
                .join(" · ")}
            </p>
          )}

          {report.scale && (
            <p className="mt-3 text-xs text-gray-500">
              <span className="font-medium">Calibration source:</span> {report.scale.reason}
            </p>
          )}

          {report.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
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
