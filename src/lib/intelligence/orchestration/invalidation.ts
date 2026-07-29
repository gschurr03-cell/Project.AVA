import type { DependencyGraph, EngineId } from "./contracts";
export type InvalidationTrigger =
  | "new_analysis" | "coach_override" | "research_update" | "benchmark_update"
  | "recommendation_acceptance" | "recommendation_rejection" | "digital_twin_update"
  | "season_transition" | "competition_change" | "manual_regeneration";
export function downstreamInvalidations(graph: DependencyGraph, changed: readonly EngineId[]): EngineId[] {
  const invalid = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [from, to] of graph.edges)
      if (invalid.has(from) && !invalid.has(to)) { invalid.add(to); grew = true; }
  }
  return graph.nodes.filter((id) => invalid.has(id));
}

