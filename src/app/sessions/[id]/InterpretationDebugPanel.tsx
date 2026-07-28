import { AvaPanel } from "@/components/ava/AvaPanel";
import type { InterpretationResult } from "@/lib/intelligence/interpretations";

export default function InterpretationDebugPanel({
  result,
  showTrace,
}: {
  result: InterpretationResult;
  showTrace: boolean;
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-[#b3bccb]">
        Developer: Interpretation Engine ({result.interpretations.length})
      </summary>
      <div className="mt-4 space-y-4">
        {result.interpretations.length === 0 && (
          <AvaPanel>
            <p className="text-sm text-[#b3bccb]">
              No safe interpretation could be generated from the currently trusted observations.
            </p>
          </AvaPanel>
        )}
        {result.interpretations.map((interpretation) => (
          <AvaPanel key={interpretation.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#7e8797]">
                  Interpretation output · {interpretation.category}
                </p>
                <h3 className="mt-1 font-semibold text-[#f5f7fb]">{interpretation.title}</h3>
                <p className="mt-1 text-sm text-[#b3bccb]">{interpretation.summary}</p>
              </div>
              <div className="text-right text-xs text-[#b3bccb]">
                <p>{interpretation.status}</p>
                <p>{interpretation.confidence} confidence</p>
                <p>{interpretation.evidenceQuality} evidence</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Likely meaning
              </p>
              <p className="mt-1 text-sm text-[#b3bccb]">{interpretation.likelyMeaning}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Linked observations
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-[#b3bccb]">
                {interpretation.linkedObservationIds.join(", ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Alternative explanations
              </p>
              <p className="mt-1 text-xs text-[#b3bccb]">
                {interpretation.alternativeExplanations.join(", ")}
              </p>
            </div>
            {interpretation.limitations.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                  Limitations
                </p>
                <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
                  {interpretation.limitations.map((item) => (
                    <li key={`${item.code}-${item.source}`}>{item.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Excluded conclusions
              </p>
              <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
                {interpretation.excludedConclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="font-mono text-[11px] text-[#7e8797]">
              {interpretation.ruleId} · {interpretation.engineVersion}
            </p>
          </AvaPanel>
        ))}
        {showTrace && (
          <AvaPanel>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
              Interpretation trace
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-[#b3bccb]">
              {result.trace.map((entry) => (
                <li key={entry.ruleId}>
                  {entry.finalOutputId ? "OUTPUT" : "SKIP"} {entry.ruleId}
                  {entry.mergeBehavior ? ` · ${entry.mergeBehavior}` : ""}
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
