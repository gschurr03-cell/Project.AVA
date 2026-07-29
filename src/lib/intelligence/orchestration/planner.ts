import { createHash, randomUUID } from "node:crypto";
import type { EngineRegistryEntry } from "../shared/contracts";
import { ORCHESTRATION_VERSION, PIPELINE_VERSION, type ExecutionPlan } from "./contracts";
import { validateRegistryGraph } from "./graph";

export interface PlanRequest {
  analysisId: string;
  athleteId: string;
  registry: readonly EngineRegistryEntry[];
  targets?: readonly string[];
  inputIdentity: Readonly<Record<string, unknown>>;
  now?: string;
  idFactory?: () => string;
  maxAttempts?: number;
}
export function buildExecutionPlan(request: PlanRequest): ExecutionPlan {
  const graph = validateRegistryGraph(request.registry, request.targets);
  const byId = new Map(request.registry.map((item) => [item.engineId, item]));
  const id = request.idFactory ?? randomUUID;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(stable(request.inputIdentity))).digest("hex");
  return {
    executionPlanId: id(), analysisId: request.analysisId, athleteId: request.athleteId,
    pipelineVersion: PIPELINE_VERSION, orchestrationVersion: ORCHESTRATION_VERSION,
    engineVersions: Object.fromEntries(graph.nodes.map((engineId) => [engineId, byId.get(engineId)!.engineVersion])),
    dependencyGraph: { nodes: graph.nodes, edges: graph.edges },
    executionOrder: graph.order, parallelStages: graph.stages,
    scheduledJobs: graph.order.map((engineId) => ({
      jobId: id(), engineId, engineVersion: byId.get(engineId)!.engineVersion,
      dependencies: graph.edges.filter(([, to]) => to === engineId).map(([from]) => from),
      state: graph.edges.some(([, to]) => to === engineId) ? "waiting" : "ready",
      attemptCount: 0, maxAttempts: request.maxAttempts ?? 3, cacheHit: null,
    })),
    snapshotTargets: graph.order,
    createdAt: request.now ?? new Date().toISOString(), inputFingerprint: fingerprint,
  };
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}

