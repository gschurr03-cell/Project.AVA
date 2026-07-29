/**
 * Tradeoff Detection (Phase 4). Surfaces cases where improving one metric may
 * negatively affect another desirable metric — e.g. increasing stride length may
 * reduce frequency, and vice-versa. A tradeoff is a NEGATIVE relationship between two
 * metrics the athlete would want to increase (so the finish-time edge, which is a
 * beneficial negative, and lower-is-better metrics are correctly excluded). Pure.
 */

import { propagateConfidence } from "../models";
import type { DependencyGraph, Tradeoff } from "./models";
import { labelFor } from "./dependencyGraph";
import { metricDefinition } from "../config";
import { TARGET_METRIC } from "./graphConfig";

export const TRADEOFF_ENGINE_VERSION = "ava-tradeoff-v1" as const;

/** A metric the athlete wants to INCREASE (higher is better). */
function increaseDesired(metricId: string): boolean {
  const def = metricDefinition(metricId);
  if (def) return !def.lowerIsBetter;
  // Qualities / graph-only metrics default to increase-desired.
  const base = metricId.replace(/(Left|Right)$/, "");
  return !["brakingDistance"].includes(base);
}

export function detectTradeoffs(graph: DependencyGraph): Tradeoff[] {
  const tradeoffs: Tradeoff[] = [];
  for (const e of graph.edges) {
    if (e.strength >= 0) continue; // only negative relationships can be tradeoffs
    if (e.to === TARGET_METRIC) continue; // a lower finish time is the goal, not a tradeoff
    if (!increaseDesired(e.from) || !increaseDesired(e.to)) continue; // both must be "increase" metrics
    tradeoffs.push({
      metricId: e.from,
      affects: e.to,
      type: e.type,
      strength: round(e.strength),
      note: `Improving ${labelFor(e.from)} may reduce ${labelFor(e.to)} — a tradeoff to balance, not a blocker.`,
      confidence: propagateConfidence([e.confidence], "tradeoff estimated from the relationship"),
    });
  }
  return tradeoffs.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength) || a.metricId.localeCompare(b.metricId));
}

/** Tradeoffs that specifically affect a given metric when it is improved. */
export function tradeoffsForMetric(graph: DependencyGraph, metricId: string): Tradeoff[] {
  return detectTradeoffs(graph).filter((t) => t.metricId === metricId);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
