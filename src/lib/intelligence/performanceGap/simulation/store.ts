/**
 * Saveable scenarios (Phase 9). Pure, serializable operations over a ScenarioStore so
 * scenarios can be named, saved, reopened, renamed, compared, deleted, and exported.
 * The engine owns the data shape; persistence (DB / localStorage) is a UI concern layered
 * on top later. Every operation returns a NEW store (immutable, deterministic).
 */

import type { ScenarioStore, SimulationScenario } from "./models";

export const SCENARIO_STORE_VERSION = "ava-simulation-store-v1" as const;

export function createScenarioStore(): ScenarioStore {
  return { version: SCENARIO_STORE_VERSION, scenarios: [] };
}

/** Add a scenario, or replace an existing one with the same id. */
export function saveScenario(store: ScenarioStore, scenario: SimulationScenario): ScenarioStore {
  const rest = store.scenarios.filter((s) => s.id !== scenario.id);
  return { ...store, scenarios: sortById([...rest, scenario]) };
}

export function renameScenario(store: ScenarioStore, id: string, name: string): ScenarioStore {
  return { ...store, scenarios: store.scenarios.map((s) => (s.id === id ? { ...s, name } : s)) };
}

export function deleteScenario(store: ScenarioStore, id: string): ScenarioStore {
  return { ...store, scenarios: store.scenarios.filter((s) => s.id !== id) };
}

export function getScenario(store: ScenarioStore, id: string): SimulationScenario | null {
  return store.scenarios.find((s) => s.id === id) ?? null;
}

export function listScenarios(store: ScenarioStore): SimulationScenario[] {
  return sortById(store.scenarios);
}

/** Export the store to a JSON string (for download / later re-import). */
export function serializeStore(store: ScenarioStore): string {
  return JSON.stringify(store);
}

/** Re-import a store from JSON, validating the shape. */
export function deserializeStore(json: string): ScenarioStore {
  const parsed = JSON.parse(json) as ScenarioStore;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.scenarios)) {
    throw new Error("invalid scenario store");
  }
  return { version: parsed.version ?? SCENARIO_STORE_VERSION, scenarios: sortById(parsed.scenarios) };
}

function sortById(scenarios: SimulationScenario[]): SimulationScenario[] {
  return [...scenarios].sort((a, b) => a.id.localeCompare(b.id));
}
