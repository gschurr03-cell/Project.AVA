/**
 * Sensitivity Analysis (Phase 4). Estimates which metrics produce the largest
 * downstream effects — i.e. how strongly improving a metric ripples toward the finish
 * result — by summing the coupling of all influence paths to the target. Configurable
 * target; deterministic; confidence propagated from the edges involved.
 */

import { type Confidence, estimated, inferred, propagateConfidence, unknown } from "../models";
import type { DependencyGraph, SensitivityScore } from "./models";
import { findInfluencePaths, labelFor } from "./dependencyGraph";
import { TARGET_METRIC } from "./graphConfig";

export const SENSITIVITY_ENGINE_VERSION = "ava-sensitivity-v1" as const;

export function computeSensitivity(
  graph: DependencyGraph,
  opts: { target?: string; metrics?: string[] } = {},
): SensitivityScore[] {
  const target = opts.target ?? TARGET_METRIC;
  const metricIds = opts.metrics ?? graph.nodes.map((n) => n.metricId).filter((m) => m !== target);

  // Raw total influence = sum over paths of coupling (each path's product of |strength|).
  const raw = metricIds.map((metricId) => {
    const paths = findInfluencePaths(graph, metricId, target);
    const totalInfluence = paths.reduce((s, p) => s + p.coupling, 0);
    const edgeConfs = pathEdgeConfidences(graph, paths);
    const confidence: Confidence = paths.length
      ? propagateConfidence(edgeConfs, "downstream influence toward the finish")
      : unknown("no path to the target metric");
    // Direct dependents (immediate downstream) for the affected-metrics view.
    const affectedMetrics = graph.edges
      .filter((e) => e.from === metricId)
      .map((e) => ({ metricId: e.to, estimatedEffect: round(Math.abs(e.strength)) }))
      .sort((a, b) => b.estimatedEffect - a.estimatedEffect || a.metricId.localeCompare(b.metricId));
    return { metricId, totalInfluence, confidence, affectedMetrics };
  });

  const max = raw.reduce((m, r) => Math.max(m, r.totalInfluence), 0);

  return raw
    .map((r): SensitivityScore => ({
      metricId: r.metricId,
      label: labelFor(r.metricId),
      sensitivity: max > 0 ? round(r.totalInfluence / max) : 0,
      affectedMetrics: r.affectedMetrics,
      confidence: r.confidence,
    }))
    .sort((a, b) => b.sensitivity - a.sensitivity || a.metricId.localeCompare(b.metricId));
}

function pathEdgeConfidences(graph: DependencyGraph, paths: { metricIds: string[] }[]): Confidence[] {
  const confs: Confidence[] = [];
  for (const p of paths) {
    for (let i = 0; i + 1 < p.metricIds.length; i++) {
      const e = graph.edges.find((x) => x.from === p.metricIds[i] && x.to === p.metricIds[i + 1]);
      if (e) confs.push(e.confidence);
    }
  }
  // Cap propagated certainty: sensitivity is always an estimate at best.
  const base = confs.length ? propagateConfidence(confs) : inferred(0.3);
  return base.category === "measured" ? [estimated(0.7, "sensitivity is an estimate")] : [base];
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
