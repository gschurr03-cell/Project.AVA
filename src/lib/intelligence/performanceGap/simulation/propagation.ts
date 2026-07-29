/**
 * Dependency-aware propagation (Phase 9). REUSES the Phase 4 causal graph — it does not
 * re-derive relationships. Given the user's adjustments it estimates the downstream
 * relative change on every other metric by walking the strongest influence path, honours
 * independent metric LOCKING (locked and user-set metrics never receive propagation), and
 * records which dependencies were activated. Pure + deterministic.
 */

import type { DependencyGraph } from "../dependency/models";
import { findInfluencePaths } from "../dependency/dependencyGraph";
import { TARGET_METRIC } from "../dependency/graphConfig";
import type { DependencyActivation } from "./models";
import { PROPAGATION } from "./config";
import { estimated } from "../models";

export const PROPAGATION_ENGINE_VERSION = "ava-simulation-propagation-v1" as const;

export interface RelChange {
  value: number;
  source: "user" | "propagated" | "locked";
}

export interface PropagationResult {
  /** Total relative change per metric (user + propagated), keyed by metricId. */
  rel: Record<string, RelChange>;
  activations: DependencyActivation[];
}

export interface PropagationInput {
  graph: DependencyGraph;
  /** Absolute applied values from the constraint engine. */
  applied: { metricId: string; requested: number; applied: number }[];
  currentMetrics: Record<string, number | null>;
  locked: string[];
}

export function propagate(input: PropagationInput): PropagationResult {
  const { graph, applied, currentMetrics } = input;
  const locked = new Set(input.locked);
  const rel: Record<string, RelChange> = {};
  const activations: DependencyActivation[] = [];

  // 1. User-set relative changes (the propagation sources).
  const sources: { metricId: string; rel: number }[] = [];
  for (const a of applied) {
    const current = num(currentMetrics[a.metricId]);
    if (current == null || current === 0) {
      rel[a.metricId] = { value: 0, source: "user" };
      continue;
    }
    const r = (a.applied - current) / current;
    rel[a.metricId] = { value: round(r), source: "user" };
    if (Math.abs(r) > 1e-9) sources.push({ metricId: a.metricId, rel: r });
  }

  // Locked metrics are pinned at zero and excluded from propagation.
  for (const m of locked) {
    if (!(m in rel)) rel[m] = { value: 0, source: "locked" };
  }

  // 2. Propagate to every other metric via the strongest influence path.
  const userSet = new Set(applied.map((a) => a.metricId));
  const candidates = graph.nodes
    .map((n) => n.metricId)
    .filter((id) => id !== TARGET_METRIC && !userSet.has(id) && !locked.has(id))
    .sort();

  for (const target of candidates) {
    let total = 0;
    const contributions: DependencyActivation[] = [];
    for (const s of [...sources].sort((a, b) => a.metricId.localeCompare(b.metricId))) {
      const paths = findInfluencePaths(graph, s.metricId, target);
      if (paths.length === 0) continue;
      const best = paths[0];
      const hops = best.metricIds.length - 1;
      const contribution = s.rel * best.coupling * best.netSign * Math.pow(PROPAGATION.damping, hops - 1);
      if (Math.abs(contribution) < 1e-4) continue;
      total += contribution;
      contributions.push({
        from: s.metricId,
        to: target,
        type: "propagated",
        pathCoupling: best.coupling,
        netSign: best.netSign,
        estimatedRelChange: round(contribution),
        confidence: estimated(clamp01(best.coupling), `propagated along ${best.metricIds.join(" → ")}`),
      });
    }
    if (contributions.length === 0) continue;
    total = clamp(total, -PROPAGATION.maxRelChange, PROPAGATION.maxRelChange);
    rel[target] = { value: round(total), source: "propagated" };
    // Surface the strongest contributing activation (deterministic).
    contributions.sort((a, b) => Math.abs(b.estimatedRelChange) - Math.abs(a.estimatedRelChange) || a.from.localeCompare(b.from));
    activations.push(contributions[0]);
  }

  activations.sort((a, b) => Math.abs(b.estimatedRelChange) - Math.abs(a.estimatedRelChange) || `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));
  return { rel, activations };
}

export function relOf(rel: Record<string, RelChange>, metricId: string): number {
  return rel[metricId]?.value ?? 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
