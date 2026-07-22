/**
 * Performance Simulation Engine — data models (Phase 9, the What-If Simulator).
 *
 * A SCENARIO-EXPLORATION engine, never a prediction engine. It answers "what happens
 * if this metric improves?" by reusing the existing intelligence engines — the Phase 4
 * dependency graph (propagation), Phase 5 blueprint (constraints + development score),
 * and the shared confidence model — and NEVER duplicates their logic. Every output is
 * an estimate with confidence, sensitivity, activated dependencies, and the assumptions
 * behind it. Pure + UI-independent + deterministic + serializable.
 */

import type { Confidence } from "../models";

export type { Confidence };

/** A single requested metric adjustment: an absolute target OR a relative percent. */
export interface MetricAdjustment {
  metricId: string;
  /** Target absolute value (takes priority when present). */
  targetValue?: number;
  /** Relative change in percent (e.g. +5 = +5%). Used when targetValue is absent. */
  deltaPct?: number;
}

/** The inputs to one simulation: what changes, and what is held constant. */
export interface SimulationInput {
  adjustments: MetricAdjustment[];
  /** Metrics that must NOT move — neither user-set nor dependency-propagated. */
  locked: string[];
}

/** The result of clamping one adjustment to a physiologically plausible range. */
export interface SimulationConstraint {
  metricId: string;
  label: string;
  requestedValue: number;
  appliedValue: number;
  clamped: boolean;
  bound: { min: number; max: number };
  /** Why it was clamped (e.g. anthropometric limit) — null when within range. */
  reason: string | null;
}

/** A dependency edge/path that fired during propagation. */
export interface DependencyActivation {
  from: string;
  to: string;
  type: string;
  /** Product of |strength| along the strongest path (0..1). */
  pathCoupling: number;
  netSign: 1 | -1;
  /** Estimated relative change propagated to `to`. */
  estimatedRelChange: number;
  confidence: Confidence;
}

/** An assumption that shaped the estimate — never leave a number unexplained. */
export interface SimulationAssumption {
  statement: string;
  category: "held-constant" | "dependency" | "model" | "uncertainty";
}

/** Simulation confidence, with the factors that produced it. */
export interface ScenarioConfidence {
  level: "low" | "moderate" | "high";
  score: number;
  factors: { factor: string; contribution: number }[];
}

/** One metric's estimated change under the scenario. */
export interface SimulatedMetricChange {
  metricId: string;
  label: string;
  unit: string;
  currentValue: number | null;
  simulatedValue: number | null;
  deltaPct: number | null;
  /** How this value came to change. */
  source: "user" | "propagated" | "locked";
  /** Phase 4 downstream sensitivity of this metric (0..1), for prioritization. */
  sensitivity: number | null;
  confidence: Confidence;
}

/** An estimated race outcome for one event. */
export interface SimulatedEventOutcome {
  event: string;
  currentTimeS: number | null;
  simulatedTimeS: number | null;
  /** simulated − current (negative = faster). */
  deltaS: number | null;
  /** Whether the current time was measured or estimated from another event. */
  baseline: "measured" | "estimated";
  confidence: ScenarioConfidence;
}

/** The full estimated outcome of one scenario. */
export interface SimulationOutput {
  metricChanges: SimulatedMetricChange[];
  eventOutcomes: SimulatedEventOutcome[];
  velocity: {
    speedRatio: number;
    peakVelocityMps: { current: number | null; simulated: number | null };
    averageVelocityMps: { current: number | null; simulated: number | null };
  };
  developmentScore: { current: number; simulated: number; deltaPct: number };
  blueprintCompletion: { current: number; simulated: number; deltaPct: number };
  constraints: SimulationConstraint[];
  activations: DependencyActivation[];
  assumptions: SimulationAssumption[];
  confidence: ScenarioConfidence;
}

/** A named, saveable, reopenable scenario. */
export interface SimulationScenario {
  id: string;
  name: string;
  createdAt: string;
  athleteId: string | null;
  input: SimulationInput;
  output: SimulationOutput;
  version: string;
}

/** A serializable collection of saved scenarios. */
export interface ScenarioStore {
  version: string;
  scenarios: SimulationScenario[];
}

/** Side-by-side comparison of the current baseline against N scenarios. */
export interface SimulationComparison {
  version: string;
  baselineLabel: string;
  columns: { id: string; name: string }[];
  events: {
    event: string;
    values: { columnId: string; timeS: number | null; deltaS: number | null }[];
  }[];
  developmentScore: { columnId: string; value: number; deltaPct: number }[];
  /** The scenario with the best (lowest) primary-event time — null if tied/none. */
  bestScenarioId: string | null;
}
