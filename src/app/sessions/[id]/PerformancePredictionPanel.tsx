import { AvaPanel } from "@/components/ava/AvaPanel";
import { avaBadge, type AvaTone } from "@/lib/design/ava";
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

const CONFIDENCE_TONE: Record<PredictionConfidence, AvaTone> = {
  high: "gold",
  medium: "bronze",
  low: "gray",
};

function ConfidenceBadge({ confidence }: { confidence: PredictionConfidence }) {
  return <span className={avaBadge(CONFIDENCE_TONE[confidence])}>{confidence}</span>;
}

/** "estimate − reference" → coach-facing "X.XXs faster/slower than <ref>".
 *  Faster = Gold (excellent), slower = Red Alert (performance status, not brand). */
function DiffLine({ diff, reference }: { diff: number | null; reference: string }) {
  if (diff == null) return null;
  if (diff === 0) {
    return <span className="text-[#7e8797]">Matches {reference}</span>;
  }
  const faster = diff < 0;
  return (
    <span className={faster ? "text-[#f5c451]" : "text-[#e46464]"}>
      {Math.abs(diff).toFixed(2)}s {faster ? "faster than" : "slower than"} {reference}
    </span>
  );
}

function EstimateCard({ estimate }: { estimate: RaceEstimate }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
        {estimate.distance} m
      </p>
      <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">{estimate.estimateSeconds.toFixed(2)}s</p>
      <div className="mt-2 space-y-0.5 text-xs">
        {estimate.currentPb != null ? (
          <p>
            <span className="text-[#7e8797]">PB {estimate.currentPb.toFixed(2)}s · </span>
            <DiffLine diff={estimate.diffFromPb} reference="PB" />
          </p>
        ) : (
          <p className="text-[#7e8797]">No PB on file</p>
        )}
        {estimate.goal != null ? (
          <p>
            <span className="text-[#7e8797]">Goal {estimate.goal.toFixed(2)}s · </span>
            <DiffLine diff={estimate.diffFromGoal} reference="goal" />
          </p>
        ) : (
          <p className="text-[#7e8797]">No goal set</p>
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
    <AvaPanel eyebrow="Performance Predictor" title="Estimated Performance" className="relative">
      {prediction.confidence && (
        <div className="absolute right-5 top-5">
          <ConfidenceBadge confidence={prediction.confidence} />
        </div>
      )}
      <p className="-mt-3 mb-4 text-xs text-[#7e8797]">{prediction.disclaimer}</p>

      {!prediction.available ? (
        <div className="rounded-lg border border-[#f5c451]/40 bg-[#f5c451]/10 p-4">
          <p className="text-sm font-semibold text-[#f5c451]">Prediction unavailable</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#b3bccb]">
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
            <p className="mt-3 text-xs text-[#7e8797]">
              Based on an estimated top velocity of{" "}
              <span className="font-medium text-[#b3bccb]">
                {prediction.estimatedTopVelocityMps.toFixed(2)} m/s
              </span>
              .
            </p>
          )}

          {prediction.factors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Strongest contributing factors
              </p>
              <ul className="mt-1 space-y-1.5">
                {prediction.factors.map((f) => (
                  <li key={f.key} className="text-sm text-[#b3bccb]">
                    <span className="font-medium text-[#f5f7fb]">{f.label}</span>{" "}
                    <span className="text-[#7e8797]">({Math.round(f.contribution * 100)}%)</span> —{" "}
                    {f.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prediction.contextInputs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Also considered
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {prediction.contextInputs.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-xs text-[#b3bccb]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {prediction.warnings.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[#f5c451]">
              {prediction.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </AvaPanel>
  );
}
