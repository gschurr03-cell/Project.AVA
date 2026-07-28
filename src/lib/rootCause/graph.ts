import type { z } from "zod";
import { causalEdgeSchema, type RootCauseCandidate } from "./contracts";
type Edge = z.infer<typeof causalEdgeSchema>;

export function validateCausalNetwork(candidates: RootCauseCandidate[], edges: Edge[]) {
  const limiters = new Set(candidates.map((item) => item.limiterKey));
  const outgoing = new Map<string,string[]>();
  for (const edge of edges) {
    if (!limiters.has(edge.sourceLimiter) || !limiters.has(edge.targetLimiter))
      throw new Error(`Causal edge references a limiter without a candidate: ${edge.edgeId}`);
    if (edge.sourceLimiter === edge.targetLimiter)
      throw new Error(`Self causal edge is prohibited: ${edge.edgeId}`);
    outgoing.set(edge.sourceLimiter,[...(outgoing.get(edge.sourceLimiter)??[]),edge.targetLimiter]);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string)=>{
    if(visiting.has(id))throw new Error("Causal network must be acyclic.");
    if(visited.has(id))return;visiting.add(id);
    for(const next of outgoing.get(id)??[])visit(next);
    visiting.delete(id);visited.add(id);
  };
  [...limiters].sort().forEach(visit);
}
