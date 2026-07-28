import type { z } from "zod";
import { dependencyEdgeSchema, interactionEdgeSchema } from "./contracts";

type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;
type InteractionEdge = z.infer<typeof interactionEdgeSchema>;

export function validateDependencyGraph(candidateIds: string[], edges: DependencyEdge[]): void {
  const ids = new Set(candidateIds), outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!ids.has(edge.prerequisiteCandidateId) || !ids.has(edge.unlockedCandidateId))
      throw new Error(`Dependency references unavailable candidate: ${edge.edgeId}`);
    if (edge.prerequisiteCandidateId === edge.unlockedCandidateId)
      throw new Error(`Self dependency is prohibited: ${edge.edgeId}`);
    outgoing.set(edge.prerequisiteCandidateId, [...(outgoing.get(edge.prerequisiteCandidateId) ?? []), edge.unlockedCandidateId]);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Dependency graph must be acyclic.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next);
    visiting.delete(id); visited.add(id);
  };
  [...ids].sort().forEach(visit);
}

export function dependencyBonus(candidateId: string, edges: DependencyEdge[]) {
  const outgoing = edges.filter((edge) => edge.prerequisiteCandidateId === candidateId);
  return {
    value: outgoing.reduce((sum, edge) => sum + edge.strength, 0),
    sourceIds: outgoing.map((edge) => edge.edgeId).sort(),
  };
}

export function interactionEffect(candidateId: string, edges: InteractionEdge[]) {
  const relevant = edges.filter((edge) => edge.sourceCandidateId === candidateId);
  const signed = relevant.reduce((sum, edge) =>
    sum + (edge.effect === "positive" ? edge.magnitude :
      edge.effect === "negative" ? -edge.magnitude : 0), 0);
  return { value: signed, sourceIds: relevant.map((edge) => edge.interactionId).sort() };
}

