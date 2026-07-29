/**
 * Metric Interaction Engine (Phase 3). Models how metrics influence one another and,
 * ultimately, the finish time. Configurable dependency graph + a pure tracer that
 * returns the chain from any metric to the finish result plus its coupling strength.
 */

import type { InteractionModel, MetricDependency } from "./models";

export const INTERACTION_MODEL_VERSION = "ava-metric-interactions-v1" as const;

/**
 * Directed metric dependencies (from → to). Two canonical chains:
 *   groundContact → flightTime → strideLength → averageVelocity → finishTime
 *   acceleration → transitionEfficiency → peakVelocity → averageVelocity → finishTime
 * Strengths are configurable coupling coefficients (0..1).
 */
export const METRIC_DEPENDENCIES: MetricDependency[] = [
  { from: "groundContactTime", to: "flightTime", relationship: "shorter contact enables more flight", strength: 0.6 },
  { from: "flightTime", to: "strideLength", relationship: "more flight enables longer strides", strength: 0.6 },
  { from: "strideLength", to: "averageVelocity", relationship: "v = stride length × frequency", strength: 0.8 },
  { from: "strideFrequency", to: "averageVelocity", relationship: "v = stride length × frequency", strength: 0.8 },
  { from: "peakVelocity", to: "averageVelocity", relationship: "peak raises the achievable average", strength: 0.7 },
  { from: "acceleration", to: "transitionEfficiency", relationship: "better acceleration feeds the transition", strength: 0.6 },
  { from: "transitionEfficiency", to: "peakVelocity", relationship: "smoother transition preserves top speed", strength: 0.6 },
  { from: "averageVelocity", to: "finishTime", relationship: "finish time = distance ÷ average velocity", strength: 0.95 },
];

/** Trace the downstream chain from a metric to the finish result. */
export function traceInteraction(metricId: string, maxDepth = 8): InteractionModel {
  const base = metricId.replace(/(Left|Right)$/, "");
  const chain: InteractionModel["chain"] = [];
  const visited = new Set<string>([base]);
  let current = base;
  let coupling = 1;

  for (let i = 0; i < maxDepth; i++) {
    if (current === "finishTime") break;
    // Choose the strongest outgoing edge that moves toward the finish (deterministic).
    const edges = METRIC_DEPENDENCIES.filter((d) => d.from === current && !visited.has(d.to)).sort(
      (a, b) => b.strength - a.strength || a.to.localeCompare(b.to),
    );
    const next = edges[0];
    if (!next) break;
    chain.push({ metricId: next.to, relationship: next.relationship, strength: next.strength });
    coupling *= next.strength;
    visited.add(next.to);
    current = next.to;
  }

  return { rootMetricId: base, chain, couplingToFinish: round(coupling) };
}

/** Metrics that directly depend on the given metric (its immediate downstream). */
export function downstreamMetrics(metricId: string): MetricDependency[] {
  const base = metricId.replace(/(Left|Right)$/, "");
  return METRIC_DEPENDENCIES.filter((d) => d.from === base);
}

/** Metrics that feed into the given metric (its immediate upstream). */
export function upstreamMetrics(metricId: string): MetricDependency[] {
  const base = metricId.replace(/(Left|Right)$/, "");
  return METRIC_DEPENDENCIES.filter((d) => d.to === base);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
