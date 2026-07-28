import type { EngineRegistryEntry } from "../shared/contracts";
import type { AdapterCatalog } from "./runtime";
export type VersionAvailability =
  | "available" | "supported" | "deprecated_runnable" | "unavailable" | "incompatible"
  | "blocked_missing_migration" | "blocked_missing_contract";
export interface VersionAvailabilityResult { engineId: string; requestedVersion: string; status: VersionAvailability; reason: string; }
export function validateVersionAvailability(input: {
  requestedVersions: Record<string, string>; registry: readonly EngineRegistryEntry[];
  adapters: AdapterCatalog; availableMigrations: ReadonlySet<string>;
}): VersionAvailabilityResult[] {
  const entries = new Map(input.registry.map((item) => [item.engineId, item]));
  return Object.entries(input.requestedVersions).map(([engineId, version]) => {
    const entry = entries.get(engineId);
    if (!entry) return { engineId, requestedVersion: version, status: "unavailable", reason: "engine_not_registered" };
    if (!entry.contract.inputContract || !entry.contract.outputContract)
      return { engineId, requestedVersion: version, status: "blocked_missing_contract", reason: "contract_metadata_missing" };
    if (entry.cachePolicy.persistenceMigration &&
        !input.availableMigrations.has(entry.cachePolicy.persistenceMigration))
      return { engineId, requestedVersion: version, status: "blocked_missing_migration", reason: entry.cachePolicy.persistenceMigration };
    if (entry.engineVersion !== version)
      return { engineId, requestedVersion: version, status: "unavailable", reason: "historical_binary_not_retained" };
    if (!input.adapters.get(engineId, version))
      return { engineId, requestedVersion: version, status: "unavailable", reason: "adapter_unavailable" };
    return { engineId, requestedVersion: version,
      status: entry.lifecycle === "deprecated" ? "deprecated_runnable" : "supported", reason: "registry_and_adapter_available" };
  });
}

