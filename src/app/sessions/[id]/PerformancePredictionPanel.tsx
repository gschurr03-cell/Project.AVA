import type {
  PerformancePrediction,
  PredictionConfidence,
  RaceEstimate,
} from "@/lib/prediction";

/**
 * Presentation only: renders the Performance Predictor's estimated race times
 * with confidence, PB/goal comparisons, the factors that drove the estimate, and
 * warnings. All numbers and confidences come from `@/lib/prediction`.
 */

const CONFIDENCE_BADGE: Record<PredictionConfidence, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-200 text-gray-600",
};

function ConfidenceBadge({ confidence }: { confidence: PredictionConfidence }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${CONFIDENCE_BADGE[confidence]}`}
    >
      {confidence}
    </span>
  );
}

/** "estimate − reference" → coach-facing "X.XXs faster/slower than <ref>". */
function DiffLine({ diff, reference }: { diff: number | null; reference: string }) {
  if (diff == null) return null;
  if (diff === 0) {
    return <span className="text-gray-500">Matches {reference}</span>;
  }
  const faster = diff < 0;
  return (
    <span className={faster ? "text-green-600" : "text-red-600"}>
      {Math.abs(diff).toFixed(2)}s {faster ? "faster than" : "slower than"} {reference}
    </span>
  );
}

function EstimateCard({ estimate }: { estimate: RaceEstimate }) {
  return (
    <div className="rounded-md border bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {estimate.distance} m
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-800">{estimate.estimateSeconds.toFixed(2)}s</p>
      <div className="mt-2 space-y-0.5 text-xs">
        {estimate.currentPb != null ? (
          <p>
            <span className="text-gray-400">PB {estimate.currentPb.toFixed(2)}s · </span>
            <DiffLine diff={estimate.diffFromPb} reference="PB" />
          </p>
        ) : (
          <p className="text-gray-400">No PB on file</p>
        )}
        {estimate.goal != null ? (
          <p>
            <span className="text-gray-400">Goal {estimate.goal.toFixed(2)}s · </span>
            <DiffLine diff={estimate.diffFromGoal} reference="goal" />
          </p>
        ) : (
          <p className="text-gray-400">No goal set</p>
        )}
      </div>
    </div>
  );
}

export default function PerformancePredictionPanel({
  prediction,
}: {
  prediction: PerformancePrediction;
}) {
  return (
    <section className="mt-6 rounded-lg border bg-gray-50 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-lane">Estimated Performance</h2>
        {prediction.confidence && <ConfidenceBadge confidence={prediction.confidence} />}
      </div>
      <p className="mb-4 text-xs text-gray-500">{prediction.disclaimer}</p>

      {!prediction.available ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Prediction unavailable</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
            {prediction.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {prediction.estimates.map((e) => (
              <EstimateCard key={e.distance} estimate={e} />
            ))}
          </dl>

          {prediction.estimatedTopVelocityMps != null && (
            <p className="mt-3 text-xs text-gray-500">
              Based on an estimated top velocity of{" "}
              <span className="font-medium text-gray-700">
                {prediction.estimatedTopVelocityMps.toFixed(2)} m/s
              </span>
              .
            </p>
          )}

          {prediction.factors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Strongest contributing factors
              </p>
              <ul className="mt-1 space-y-1.5">
                {prediction.factors.map((f) => (
                  <li key={f.key} className="text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{f.label}</span>{" "}
                    <span className="text-gray-400">({Math.round(f.contribution * 100)}%)</span> —{" "}
                    {f.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prediction.contextInputs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Also considered
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {prediction.contextInputs.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border bg-white px-2 py-0.5 text-xs text-gray-500"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {prediction.warnings.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-amber-700">
              {prediction.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
