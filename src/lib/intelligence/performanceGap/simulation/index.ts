/**
 * Performance Simulation Engine (Phase 9) — public surface + orchestration.
 *
 * The What-If Simulator: a SCENARIO-EXPLORATION engine (never a prediction engine) that
 * answers "what happens if this metric improves?". It REUSES the existing intelligence
 * engines — the Phase 4 dependency graph for propagation and Phase 5 blueprint for
 * constraints + development score — and adds a constraint engine, confidence framework,
 * scenario comparison, and saveable scenarios. Pure + deterministic + serializable.
 *
 * Do NOT redesign the analysis workflow. Do NOT generate workout plans.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type { AthleteBlueprint } from "../blueprint/models";
import type { SensitivityScore } from "../dependency/models";
import { buildDependencyGraph } from "../dependency/dependencyGraph";
import { computeSensitivity } from "../dependency/sensitivity";
import { adaptRelationships } from "../dependency/athleteModifiers";
import { DEPENDENCY_GRAPH_VERSION } from "../dependency/graphConfig";
import type { SimulationInput, SimulationScenario, SimulationOutput, SimulationAssumption, DependencyActivation, ScenarioConfidence } from "./models";
import { SIMULATION_CONFIG_VERSION } from "./config";
import { applyConstraints, CONSTRAINT_ENGINE_VERSION } from "./constraints";
import { propagate, relOf, PROPAGATION_ENGINE_VERSION, type RelChange } from "./propagation";
import { estimateOutcomes, OUTCOME_ENGINE_VERSION } from "./outcomes";
import { computeScenarioConfidence, SCENARIO_CONFIDENCE_VERSION } from "./confidence";

export * from "./models";
export * from "./config";
export * from "./constraints";
export * from "./propagation";
export * from "./outcomes";
export * from "./confidence";
export * from "./comparison";
export * from "./store";

export const PERFORMANCE_SIMULATION_VERSION = "performance-simulation-v1" as const;

export interface SimulationRunInput {
  id?: string;
  name?: string;
  athleteId?: string | null;
  input: SimulationInput;
  currentMetrics: Record<string, number | null>;
  currentTimes: Record<string, number | null>;
  blueprint: AthleteBlueprint;
  /** Optional pre-computed Phase 4 sensitivity; computed from the graph if absent. */
  sensitivity?: SensitivityScore[];
  context?: AthleteContext;
  improvementHistory?: number[];
  now?: Date;
}

export function runSimulation(input: SimulationRunInput): SimulationScenario {
  const graph = buildDependencyGraph(input.context ? adaptRelationships(input.context) : undefined);
  const sensitivity = input.sensitivity ?? computeSensitivity(graph);

  const { resolved, constraints } = applyConstraints(input.input.adjustments, input.currentMetrics, input.context);
  const { rel, activations } = propagate({ graph, applied: resolved, currentMetrics: input.currentMetrics, locked: input.input.locked });

  const adjustmentMagnitude = resolved.reduce((sum, r) => sum + Math.abs(relOf(rel, r.metricId)), 0);
  const confidence = computeScenarioConfidence({ blueprint: input.blueprint, activations, adjustmentMagnitude, improvementHistory: input.improvementHistory });

  const outcomes = estimateOutcomes({
    rel,
    currentMetrics: input.currentMetrics,
    currentTimes: input.currentTimes,
    blueprint: input.blueprint,
    sensitivity,
    confidence,
  });

  const assumptions = buildAssumptions(input.input, rel, activations, confidence, constraints.some((c) => c.clamped));

  const output: SimulationOutput = {
    metricChanges: outcomes.metricChanges,
    eventOutcomes: outcomes.eventOutcomes,
    velocity: outcomes.velocity,
    developmentScore: outcomes.developmentScore,
    blueprintCompletion: outcomes.blueprintCompletion,
    constraints,
    activations,
    assumptions,
    confidence,
  };

  return {
    id: input.id ?? "scenario",
    name: input.name ?? "Untitled scenario",
    createdAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    input: input.input,
    output,
    version: PERFORMANCE_SIMULATION_VERSION,
  };
}

/** Every simulation explains its assumptions — never an unexplained number. */
function buildAssumptions(
  input: SimulationInput,
  rel: Record<string, RelChange>,
  activations: DependencyActivation[],
  confidence: ScenarioConfidence,
  anyClamped: boolean,
): SimulationAssumption[] {
  const out: SimulationAssumption[] = [];

  for (const id of [...input.locked].sort()) {
    out.push({ statement: `${label(id)} is held constant (locked) in this scenario.`, category: "held-constant" });
  }

  for (const a of activations.slice(0, 5)) {
    const dir = a.estimatedRelChange >= 0 ? "increase" : "decrease";
    out.push({
      statement: `Adjusting ${label(a.from)} is estimated to ${dir} ${label(a.to)} (${signedPct(a.estimatedRelChange)}) via a dependency.`,
      category: "dependency",
    });
  }

  out.push({
    statement: "Race times are estimated from a top-speed transfer model — this is scenario exploration, not a prediction.",
    category: "model",
  });
  if (anyClamped) {
    out.push({ statement: "One or more adjustments were clamped to physiologically plausible limits.", category: "model" });
  }
  // Metrics that moved but were not explicitly set — surfaced so nothing is unexplained.
  const propagatedOnly = Object.entries(rel).filter(([, v]) => v.source === "propagated" && Math.abs(v.value) > 1e-9);
  if (propagatedOnly.length === 0 && activations.length === 0) {
    out.push({ statement: "No dependencies were activated — only the adjusted metric(s) changed.", category: "dependency" });
  }

  out.push({
    statement: `Overall confidence is ${confidence.level} (${confidence.score}); larger adjustments and thinner data lower it.`,
    category: "uncertainty",
  });
  return out;
}

function label(metricId: string): string {
  return metricId.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}
function signedPct(rel: number): string {
  const p = rel * 100;
  return `${p >= 0 ? "+" : ""}${Math.round(p * 10) / 10}%`;
}

export const SIMULATION_ENGINE_VERSIONS = {
  graph: DEPENDENCY_GRAPH_VERSION,
  constraints: CONSTRAINT_ENGINE_VERSION,
  propagation: PROPAGATION_ENGINE_VERSION,
  outcomes: OUTCOME_ENGINE_VERSION,
  confidence: SCENARIO_CONFIDENCE_VERSION,
  config: SIMULATION_CONFIG_VERSION,
} as const;
