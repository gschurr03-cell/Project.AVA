import type { EngineRegistryEntry } from "../shared/contracts";
import type { AdapterCatalog } from "./runtime";
export type OrchestrationRolloutMode = "OFF" | "PLAN_ONLY" | "SHADOW" | "INTERNAL" | "BOUNDED_PRODUCTION";
export interface ExecutionGateInput {
  serverEnabled: boolean;
  environmentAllowed: boolean;
  authorized: boolean;
  ownerScopeValid: boolean;
  planValid: boolean;
  databaseHealthy: boolean;
  registryVersionSupported: boolean;
  prohibitedMigrationState: boolean;
  idempotencyKey: string | null;
  rolloutMode: OrchestrationRolloutMode;
  requiredEngineIds: readonly string[];
  registry: readonly EngineRegistryEntry[];
  adapters: AdapterCatalog;
}
export interface ExecutionGateDecision { allowed: boolean; planOnly: boolean; authoritativeActivation: boolean; reasons: string[]; }
export function evaluateExecutionGate(input: ExecutionGateInput): ExecutionGateDecision {
  const reasons: string[] = [];
  if (!input.serverEnabled) reasons.push("server_flag_disabled");
  if (!input.environmentAllowed) reasons.push("environment_not_allowed");
  if (!input.authorized) reasons.push("caller_unauthorized");
  if (!input.ownerScopeValid) reasons.push("owner_scope_invalid");
  if (!input.planValid) reasons.push("plan_invalid");
  if (!input.databaseHealthy) reasons.push("database_unhealthy");
  if (!input.registryVersionSupported) reasons.push("registry_version_unsupported");
  if (input.prohibitedMigrationState) reasons.push("prohibited_migration_state");
  if (!input.idempotencyKey?.trim()) reasons.push("idempotency_key_missing");
  if (input.rolloutMode === "OFF") reasons.push("rollout_off");
  const registry = new Map(input.registry.map((entry) => [entry.engineId, entry]));
  for (const id of input.requiredEngineIds) {
    const entry = registry.get(id);
    if (!entry) reasons.push(`engine_not_registered:${id}`);
    else if (!input.adapters.get(id, entry.engineVersion)) reasons.push(`adapter_unavailable:${id}`);
  }
  return {
    allowed: reasons.length === 0,
    planOnly: input.rolloutMode === "PLAN_ONLY",
    authoritativeActivation: reasons.length === 0 && ["INTERNAL", "BOUNDED_PRODUCTION"].includes(input.rolloutMode),
    reasons,
  };
}

