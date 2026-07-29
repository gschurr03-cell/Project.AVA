import { AvaPanel } from "@/components/ava/AvaPanel";
import type { RecommendationResult } from "@/lib/intelligence/recommendationEngine";

export default function RecommendationDebugPanel({
  result,
  showTrace,
}: {
  result: RecommendationResult;
  showTrace: boolean;
}) {
  const outputs = [
    ...result.monitoringRecommendations,
    ...result.preserveRecommendations,
    ...result.recommendations,
  ];
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-[#b3bccb]">
        Developer: Recommendation Engine ({outputs.length})
      </summary>
      <div className="mt-4 space-y-4">
        {outputs.length === 0 && (
          <AvaPanel>
            <p className="text-sm text-[#b3bccb]">
              AVA does not have enough trusted evidence to suggest a mechanical change.
            </p>
          </AvaPanel>
        )}
        {outputs.map((recommendation) => (
          <AvaPanel key={recommendation.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#7e8797]">
                  Deterministic recommendation · {recommendation.actionType}
                </p>
                <h3 className="mt-1 font-semibold text-[#f5f7fb]">{recommendation.title}</h3>
                <p className="mt-1 text-sm text-[#b3bccb]">{recommendation.summary}</p>
              </div>
              <div className="text-right text-xs text-[#b3bccb]">
                <p>{recommendation.status}</p>
                <p>{recommendation.confidence} confidence</p>
                <p>{recommendation.safetyTier}</p>
              </div>
            </div>
            <p className="text-sm text-[#b3bccb]">
              <span className="font-semibold">Objective:</span> {recommendation.objective}
            </p>
            <p className="text-sm text-[#b3bccb]">
              <span className="font-semibold">Rationale:</span> {recommendation.rationale}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Suggested action
              </p>
              <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
                {recommendation.suggestedActions.map((action) => <li key={action}>{action}</li>)}
              </ul>
            </div>
            {recommendation.technicalCues.length > 0 && (
              <p className="text-sm text-[#b3bccb]">
                <span className="font-semibold">Cue:</span>{" "}
                {recommendation.technicalCues.join(" ")}
              </p>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Monitoring
              </p>
              <p className="mt-1 text-xs text-[#b3bccb]">
                {recommendation.monitoringPlan.minimumSessions} compatible session(s) ·{" "}
                {recommendation.monitoringPlan.successSignal}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                  Stop conditions
                </p>
                <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
                  {recommendation.stopConditions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                  Contraindications
                </p>
                <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
                  {recommendation.contraindicationNotes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            <p className="break-all font-mono text-[11px] text-[#7e8797]">
              {recommendation.linkedInterpretationIds.join(", ")}
            </p>
            <p className="font-mono text-[11px] text-[#7e8797]">
              {recommendation.ruleId} · {recommendation.libraryItemId} · {recommendation.engineVersion}
            </p>
          </AvaPanel>
        ))}
        {showTrace && (
          <AvaPanel>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
              Recommendation trace
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-[#b3bccb]">
              {result.trace.map((entry) => (
                <li key={entry.ruleId}>
                  {entry.finalOutputId ? "OUTPUT" : "SKIP"} {entry.ruleId}
                  {entry.duplicateSuppression ? ` · ${entry.duplicateSuppression}` : ""}
                  {entry.conflictResolution ? ` · ${entry.conflictResolution}` : ""}
                  {entry.suppressionReason ? ` · ${entry.suppressionReason}` : ""}
                </li>
              ))}
            </ul>
          </AvaPanel>
        )}
      </div>
    </details>
  );
}
