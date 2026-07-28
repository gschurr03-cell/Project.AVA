import { randomUUID } from "node:crypto";
import type { ExecutionPlan } from "./contracts";
import { validateVersionAvailability, type VersionAvailabilityResult } from "./versionAvailability";
export interface ReplayRequest {
  sourceRunId: string; sourcePlan: ExecutionPlan; immutableInputProvenanceAvailable: boolean;
  cacheMode: "enabled" | "bypass"; targetEngineId?: string; reason: "validation" | "failed_run" | "manual_review";
}
export interface ReplayPlan {
  replayRunId: string; sourceRunId: string; authoritative: false; sourcePlanId: string;
  targetEngineIds: string[]; cacheMode: "enabled" | "bypass"; versionAvailability: VersionAvailabilityResult[];
}
export function buildReplayPlan(request: ReplayRequest, availability: VersionAvailabilityResult[]): ReplayPlan {
  if (!request.immutableInputProvenanceAvailable) throw new Error("Replay unavailable: immutable input provenance missing");
  const blocked = availability.filter((item) => !["available","supported","deprecated_runnable"].includes(item.status));
  if (blocked.length) throw new Error(`Replay unavailable: ${blocked.map((item) => `${item.engineId}:${item.reason}`).join(",")}`);
  const targets = request.targetEngineId
    ? ancestors(request.sourcePlan, request.targetEngineId) : [...request.sourcePlan.executionOrder];
  return { replayRunId: randomUUID(), sourceRunId: request.sourceRunId, authoritative: false,
    sourcePlanId: request.sourcePlan.executionPlanId, targetEngineIds: targets,
    cacheMode: request.cacheMode, versionAvailability: availability };
}
function ancestors(plan: ExecutionPlan, target: string): string[] {
  if (!plan.dependencyGraph.nodes.includes(target)) throw new Error(`Replay target ${target} is not in source plan`);
  const selected = new Set([target]); let grew = true;
  while (grew) { grew = false; for (const [from, to] of plan.dependencyGraph.edges)
    if (selected.has(to) && !selected.has(from)) { selected.add(from); grew = true; } }
  return plan.executionOrder.filter((id) => selected.has(id));
}
export { validateVersionAvailability };

