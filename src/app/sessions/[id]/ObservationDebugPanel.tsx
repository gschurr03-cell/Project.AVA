import { AvaPanel } from "@/components/ava/AvaPanel";
import type {
  Observation,
  ObservationDebugTraceEntry,
} from "@/lib/observations";

export default function ObservationDebugPanel({
  observations,
  trace,
}: {
  observations: Observation[];
  trace: ObservationDebugTraceEntry[];
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-[#b3bccb]">
        Developer: Observation Engine ({observations.length})
      </summary>
      <div className="mt-4 space-y-4">
        {observations.map((observation) => (
          <AvaPanel key={observation.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#7e8797]">
                  {observation.category}
                </p>
                <h3 className="mt-1 font-semibold text-[#f5f7fb]">{observation.title}</h3>
                <p className="mt-1 text-sm text-[#b3bccb]">{observation.summary}</p>
              </div>
              <div className="text-right text-xs text-[#b3bccb]">
                <p>{observation.status}</p>
                <p>{observation.confidence} confidence</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                Evidence
              </p>
              <ul className="mt-2 space-y-1 text-xs text-[#b3bccb]">
                {observation.evidence.map((item, index) => (
                  <li key={`${item.metric}-${index}`}>
                    {item.metric}: {item.value == null ? item.availability : String(item.value)}{" "}
                    {item.unit} · {item.source} · {item.confidence}
                  </li>
                ))}
              </ul>
            </div>
            {observation.limitations.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
                  Limitations
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[#b3bccb]">
                  {observation.limitations.map((item) => (
                    <li key={`${item.code}-${item.source}`}>
                      {item.code}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="font-mono text-[11px] text-[#7e8797]">{observation.ruleId}</p>
          </AvaPanel>
        ))}
        <AvaPanel>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7e8797]">
            Rule trace
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-[#b3bccb]">
            {trace.map((entry) => (
              <li key={entry.ruleId}>
                {entry.fired ? "FIRED" : "SKIP"} {entry.ruleId}
                {entry.mergedInto ? ` → merged ${entry.mergedInto}` : ""}
                {entry.suppressedBy ? ` → suppressed ${entry.suppressedBy}` : ""}
              </li>
            ))}
          </ul>
        </AvaPanel>
      </div>
    </details>
  );
}
