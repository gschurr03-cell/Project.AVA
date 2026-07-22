/**
 * Metric Dependency Engine (Phase 4) — public surface + orchestration.
 *
 * Builds the interconnected sprint-performance model: a causal graph, sensitivity
 * analysis, tradeoff detection, diminishing-returns curves, and athlete-specific
 * adaptation. This graph is the backbone for the What-If Simulator, performance
 * prediction, season forecasting, and training prioritization (none built here).
 * Pure + deterministic.
 */

import type { AthletePerformanceModel } from "../models";
import type { AthleteContext } from "../rootCause/athleteContext";
import type { MetricDependencyReport } from "./models";
import { buildDependencyGraph } from "./dependencyGraph";
import { DEPENDENCY_GRAPH_VERSION } from "./graphConfig";
import { computeSensitivity, SENSITIVITY_ENGINE_VERSION } from "./sensitivity";
import { detectTradeoffs, TRADEOFF_ENGINE_VERSION } from "./tradeoffs";
import { computeDiminishingReturns, DIMINISHING_ENGINE_VERSION } from "./diminishingReturns";
import { adaptRelationships, computeAthleteModifiers, ATHLETE_MODIFIER_ENGINE_VERSION } from "./athleteModifiers";

export * from "./models";
export * from "./graphConfig";
export * from "./dependencyGraph";
export * from "./sensitivity";
export * from "./tradeoffs";
export * from "./diminishingReturns";
export * from "./athleteModifiers";

export const METRIC_DEPENDENCY_VERSION = "metric-dependency-v1" as const;

/**
 * Build the full dependency report. When `context` is supplied the causal graph is
 * adapted to the athlete before sensitivity/tradeoff analysis, so results are
 * athlete-specific. Diminishing-returns curves use the model's gaps (current vs
 * required) — never a hardcoded target.
 */
export function buildMetricDependencyReport(
  model: AthletePerformanceModel | null,
  opts: { context?: AthleteContext } = {},
): MetricDependencyReport {
  const relationships = opts.context ? adaptRelationships(opts.context) : undefined;
  const graph = buildDependencyGraph(relationships);
  const sensitivity = computeSensitivity(graph);
  const tradeoffs = detectTradeoffs(graph);
  const athleteModifiers = opts.context ? computeAthleteModifiers(opts.context) : [];

  const diminishingReturns = (model?.gaps ?? []).map((g) =>
    computeDiminishingReturns({ metricId: g.metricId, currentValue: g.currentValue, targetValue: g.targetValue }),
  );

  return {
    version: METRIC_DEPENDENCY_VERSION,
    graph,
    sensitivity,
    tradeoffs,
    diminishingReturns,
    athleteModifiers,
    provenance: {
      engineVersions: {
        graph: DEPENDENCY_GRAPH_VERSION,
        sensitivity: SENSITIVITY_ENGINE_VERSION,
        tradeoffs: TRADEOFF_ENGINE_VERSION,
        diminishingReturns: DIMINISHING_ENGINE_VERSION,
        athleteModifiers: ATHLETE_MODIFIER_ENGINE_VERSION,
      },
    },
  };
}
