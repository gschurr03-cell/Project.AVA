/**
 * Constraint Engine (Phase 9). Clamps each requested adjustment to a physiologically
 * plausible range so the simulator never explores impossible scenarios (frequency
 * rising forever, ground contact approaching zero, stride length beyond the athlete's
 * anthropometric reach). Bounds come from config; the stride-length ceiling is derived
 * from the athlete's own leg length. Pure + deterministic.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type { MetricAdjustment, SimulationConstraint } from "./models";
import { constraintBound, DEFAULT_RELATIVE_BOUND, STRIDE_LENGTH_ANTHRO_RATIO } from "./config";
import { labelFor } from "../dependency/dependencyGraph";

export const CONSTRAINT_ENGINE_VERSION = "ava-simulation-constraints-v1" as const;

export interface ResolvedAdjustment {
  metricId: string;
  requested: number;
  applied: number;
}

export interface ConstraintResult {
  resolved: ResolvedAdjustment[];
  constraints: SimulationConstraint[];
}

/** Resolve each adjustment to an absolute requested value, then clamp to plausible bounds. */
export function applyConstraints(
  adjustments: MetricAdjustment[],
  currentMetrics: Record<string, number | null>,
  context?: AthleteContext,
): ConstraintResult {
  const resolved: ResolvedAdjustment[] = [];
  const constraints: SimulationConstraint[] = [];

  // Deterministic order.
  const ordered = [...adjustments].sort((a, b) => a.metricId.localeCompare(b.metricId));

  for (const adj of ordered) {
    const current = num(currentMetrics[adj.metricId]);
    const requested = resolveRequested(adj, current);
    if (requested == null) continue; // nothing to apply (no target and no current baseline)

    const explicit = constraintBound(adj.metricId);
    const { min, max, note } = boundsFor(adj.metricId, context);
    // Explicit metrics clamp to physiological rails; future metrics clamp relative to current.
    const applied = explicit ? clamp(requested, min, max) : clampDefaultRelative(adj.metricId, requested, current);
    const clamped = Math.abs(applied - requested) > 1e-9;

    const effLo = explicit ? min : current != null ? current * (1 - DEFAULT_RELATIVE_BOUND) : min;
    const effHi = explicit ? max : current != null ? current * (1 + DEFAULT_RELATIVE_BOUND) : max;

    resolved.push({ metricId: adj.metricId, requested, applied });
    constraints.push({
      metricId: adj.metricId,
      label: labelFor(adj.metricId),
      requestedValue: round(requested),
      appliedValue: round(applied),
      clamped,
      bound: { min: round(Math.min(effLo, effHi)), max: round(Math.max(effLo, effHi)) },
      reason: clamped ? note : null,
    });
  }

  return { resolved, constraints };
}

function resolveRequested(adj: MetricAdjustment, current: number | null): number | null {
  if (typeof adj.targetValue === "number" && Number.isFinite(adj.targetValue)) return adj.targetValue;
  if (typeof adj.deltaPct === "number" && Number.isFinite(adj.deltaPct) && current != null) {
    return current * (1 + adj.deltaPct / 100);
  }
  return null;
}

function boundsFor(metricId: string, context?: AthleteContext): { min: number; max: number; note: string } {
  const cfg = constraintBound(metricId);
  if (!cfg) {
    // Future/unknown metric: allow a symmetric relative window around a nominal 1.0.
    return { min: -Infinity, max: Infinity, note: `no explicit bound — limited to ±${Math.round(DEFAULT_RELATIVE_BOUND * 100)}% of current` };
  }
  let max = cfg.max;
  let note = cfg.note;
  if (cfg.anthropometric === "strideLength") {
    const troch = num(context?.trochanterHeightM);
    if (troch != null) {
      const anthroMax = troch * STRIDE_LENGTH_ANTHRO_RATIO;
      if (anthroMax < max) {
        max = anthroMax;
        note = `stride length capped at ${round(anthroMax)} m by leg length (trochanter height × ${STRIDE_LENGTH_ANTHRO_RATIO})`;
      }
    }
  }
  return { min: cfg.min, max, note };
}

/** Also clamp default-bound (future) metrics relative to their current value. */
export function clampDefaultRelative(metricId: string, requested: number, current: number | null): number {
  if (constraintBound(metricId) || current == null || current === 0) return requested;
  const lo = current * (1 - DEFAULT_RELATIVE_BOUND);
  const hi = current * (1 + DEFAULT_RELATIVE_BOUND);
  return clamp(requested, Math.min(lo, hi), Math.max(lo, hi));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
