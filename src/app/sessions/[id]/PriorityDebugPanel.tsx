import { AvaPanel } from "@/components/ava/AvaPanel";
import type { Priority, PriorityResult } from "@/lib/intelligence/priorityEngine";

function PriorityCard({ priority }: { priority: Priority }) {
  return (
    <AvaPanel className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#7e8797]">
            {priority.kind.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 font-semibold text-[#f5f7fb]">{priority.title}</h3>
          <p className="mt-1 text-sm text-[#b3bccb]">{priority.whyItMatters}</p>
        </div>
        <div className="text-right text-xs text-[#b3bccb]">
          <p>{priority.confidence} confidence</p>
          <p>{priority.expectedImpact} expected impact</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
          Why AVA selected it
        </p>
        <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
          {priority.whySelected.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
          Supporting evidence
        </p>
        <ul className="mt-1 space-y-1 text-xs text-[#b3bccb]">
          {priority.linkedEvidence.map((evidence, index) => (
            <li key={`${evidence.metric}-${index}`}>
              {evidence.metric}: {String(evidence.value)} {evidence.unit} · {evidence.confidence}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-[#b3bccb]">
        <span className="font-semibold">Monitor next:</span> {priority.nextValidationStep}
      </p>
      <p className="break-all font-mono text-[11px] text-[#7e8797]">{priority.priorityId}</p>
    </AvaPanel>
  );
}

function Section({
  title,
  priorities,
}: {
  title: string;
  priorities: Priority[];
}) {
  if (!priorities.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#b3bccb]">
        {title}
      </h3>
      {priorities.map((priority) => <PriorityCard key={priority.priorityId} priority={priority} />)}
    </section>
  );
}

export default function PriorityDebugPanel({
  result,
  showTrace,
}: {
  result: PriorityResult;
  showTrace: boolean;
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-[#b3bccb]">
        Developer: Priority Engine ({result.topPriorities.length} top)
      </summary>
      <div className="mt-4 space-y-6">
        {result.topPriorities.length === 0 && (
          <AvaPanel>
            <p className="text-sm text-[#b3bccb]">
              No supported recommendation is currently available to prioritize.
            </p>
          </AvaPanel>
        )}
        <Section title="Top priorities" priorities={result.topPriorities} />
        <Section title="Secondary priorities" priorities={result.secondaryPriorities} />
        <Section title="Supporting strengths" priorities={result.supportingStrengths} />
        <Section title="Missing evidence priorities" priorities={result.missingEvidencePriorities} />
        {result.notPriorities.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#b3bccb]">
              Not priorities
            </h3>
            <AvaPanel className="mt-3">
              <ul className="space-y-2 text-xs text-[#b3bccb]">
                {result.notPriorities.map((item) => (
                  <li key={item.id}>
                    <span className="font-semibold">{item.title}:</span> {item.reason}
                  </li>
                ))}
              </ul>
            </AvaPanel>
          </section>
        )}
        {showTrace && (
          <AvaPanel>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
              Priority trace
            </p>
            <ul className="mt-2 space-y-2 font-mono text-[11px] text-[#b3bccb]">
              {result.trace.map((entry) => (
                <li key={entry.recommendationId}>
                  {entry.classification.toUpperCase()} {entry.recommendationKey}
                  {entry.mergeBehavior ? ` · ${entry.mergeBehavior}` : ""}
                  {entry.conflictHandling ? ` · ${entry.conflictHandling}` : ""}
                  <ul className="ml-4 mt-1">
                    {entry.scoreComponents.map((component) => (
                      <li key={component.factor}>
                        {component.factor}: {component.effect} — {component.reason}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </AvaPanel>
        )}
      </div>
    </details>
  );
}
