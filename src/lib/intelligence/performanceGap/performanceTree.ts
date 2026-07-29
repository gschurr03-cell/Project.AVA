/**
 * Engine 4 — Performance Tree Engine.
 *
 * Expands a metric into an associative reasoning tree from a configurable template.
 * Every non-root node is framed "commonly associated with …" — AVA never diagnoses.
 * The root inherits the metric's measured/estimated status; children carry their own
 * evidence category + confidence and reference associated recommendations. Pure and
 * deterministic; adding depth is a config-only change.
 */

import {
  type EvidenceCategory,
  type PerformanceNode,
  type PerformanceTree,
  estimated,
  inferred,
  measured,
  unknown,
} from "./models";
import { TREE_TEMPLATES, type TreeTemplateNode, metricDefinition } from "./config";

export const PERFORMANCE_TREE_ENGINE_VERSION = "performance-tree-v1" as const;

export function buildPerformanceTree(
  metricId: string,
  opts: { measured: boolean; supportingMetrics?: string[] } = { measured: true },
): PerformanceTree | null {
  const def = metricDefinition(metricId);
  const templateId = def?.treeTemplateId ?? metricId;
  const template = TREE_TEMPLATES[templateId];
  if (!template) return null;

  const rootCategory: EvidenceCategory = opts.measured ? "measured" : "estimated";
  const root = expand(template, rootCategory, opts.supportingMetrics ?? [metricId]);
  return { rootMetricId: metricId, root };
}

/** Build trees for a set of metrics (e.g. the top limiters), skipping unknown ones. */
export function buildPerformanceTrees(
  metricIds: string[],
  measuredMetricIds: Set<string>,
): PerformanceTree[] {
  const trees: PerformanceTree[] = [];
  const seen = new Set<string>();
  for (const id of metricIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const tree = buildPerformanceTree(id, { measured: measuredMetricIds.has(id) });
    if (tree) trees.push(tree);
  }
  return trees;
}

function expand(node: TreeTemplateNode, overrideRootCategory: EvidenceCategory | null, supporting: string[]): PerformanceNode {
  const category = overrideRootCategory ?? node.category;
  return {
    id: node.id,
    label: node.label,
    category,
    confidence: confidenceFor(category, node.confidence, node.association),
    supportingMetrics: node.supportingMetrics ?? (overrideRootCategory ? supporting : []),
    associatedRecommendations: node.associatedRecommendations ?? [],
    association: node.association,
    children: (node.children ?? []).map((c) => expand(c, null, supporting)),
  };
}

function confidenceFor(category: EvidenceCategory, score: number | null, rationale?: string) {
  switch (category) {
    case "measured":
      return measured(rationale);
    case "estimated":
      return estimated(score ?? 0.6, rationale);
    case "inferred":
      return inferred(score ?? 0.4, rationale);
    case "unknown":
      return unknown(rationale);
  }
}

/** Flatten a tree to its leaf-referenced recommendation ids (for downstream engines). */
export function collectAssociatedRecommendations(tree: PerformanceTree): string[] {
  const out = new Set<string>();
  const walk = (n: PerformanceNode) => {
    for (const r of n.associatedRecommendations) out.add(r);
    n.children.forEach(walk);
  };
  walk(tree.root);
  return [...out];
}
