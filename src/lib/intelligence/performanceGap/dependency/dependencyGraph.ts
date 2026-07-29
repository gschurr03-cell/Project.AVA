/**
 * Dependency Graph (Phase 4). Builds the causal graph of metric nodes + edges from
 * the configurable relationship set and finds multi-layer influence paths between
 * metrics (with cycle safety for the stride⇄frequency tradeoff). Pure + deterministic.
 */

import type { DependencyEdge, DependencyGraph, InfluencePath, MetricRelationship } from "./models";
import { METRIC_RELATIONSHIPS, DEPENDENCY_GRAPH_VERSION } from "./graphConfig";
import { metricDefinition } from "../config";

const PRIMARY_THRESHOLD = 0.5;

export function buildDependencyGraph(relationships: MetricRelationship[] = METRIC_RELATIONSHIPS): DependencyGraph {
  const metricIds = new Set<string>();
  for (const r of relationships) {
    metricIds.add(r.from);
    metricIds.add(r.to);
  }
  const nodes = [...metricIds].sort().map((id) => {
    const incoming = relationships.filter((r) => r.to === id);
    const outgoing = relationships.filter((r) => r.from === id);
    return {
      metricId: id,
      label: labelFor(id),
      primaryInfluences: incoming.filter((r) => Math.abs(r.strength) >= PRIMARY_THRESHOLD).map((r) => r.from),
      secondaryInfluences: incoming.filter((r) => Math.abs(r.strength) < PRIMARY_THRESHOLD).map((r) => r.from),
      dependents: outgoing.map((r) => r.to),
    };
  });
  const edges: DependencyEdge[] = relationships.map((r) => ({
    from: r.from,
    to: r.to,
    type: r.type,
    strength: r.strength,
    confidence: r.confidence,
  }));
  return { nodes, edges, version: DEPENDENCY_GRAPH_VERSION };
}

/** All influence paths from `from` to `to`, deepest-coupling first (cycle-safe). */
export function findInfluencePaths(graph: DependencyGraph, from: string, to: string, maxDepth = 6): InfluencePath[] {
  const adjacency = new Map<string, DependencyEdge[]>();
  for (const e of graph.edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e);
    adjacency.set(e.from, list);
  }
  const paths: InfluencePath[] = [];
  const visited = new Set<string>([from]);

  const dfs = (node: string, path: string[], coupling: number, sign: 1 | -1) => {
    if (node === to && path.length > 1) {
      paths.push({ metricIds: [...path], coupling: round(coupling), netSign: sign });
      return;
    }
    if (path.length > maxDepth) return;
    // Deterministic edge order: strongest coupling first, then metric id.
    const edges = (adjacency.get(node) ?? [])
      .filter((e) => !visited.has(e.to))
      .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength) || a.to.localeCompare(b.to));
    for (const e of edges) {
      visited.add(e.to);
      dfs(e.to, [...path, e.to], coupling * Math.abs(e.strength), (sign * (e.strength >= 0 ? 1 : -1)) as 1 | -1);
      visited.delete(e.to);
    }
  };
  dfs(from, [from], 1, 1);
  return paths.sort((a, b) => b.coupling - a.coupling || a.metricIds.join().localeCompare(b.metricIds.join()));
}

export function labelFor(metricId: string): string {
  const def = metricDefinition(metricId);
  if (def) return def.label;
  return metricId
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
