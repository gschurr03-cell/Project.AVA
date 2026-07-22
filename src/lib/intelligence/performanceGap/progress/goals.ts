/**
 * Progress Against Goals (Phase 10). Tracks movement toward the athlete's goal PB, their
 * blueprint, development score, performance potential, strength benchmarks, and target
 * metrics — comparing the latest value with the previous one, classifying the direction of
 * travel. Purely a longitudinal comparison; the underlying targets come from the engines
 * that own them (Phase 5/6). Pure + deterministic.
 */

import type { GoalProgress, GoalProgressItem, TrendStatus } from "./models";
import { GOAL_NOISE_PCT } from "./config";
import { round } from "./stats";

export const GOALS_ENGINE_VERSION = "ava-progress-goals-v1" as const;

export interface GoalSeries {
  id: string;
  label: string;
  target?: number | null;
  lowerIsBetter: boolean;
  /** Chronological series of the tracked value (e.g. projected finish time per analysis). */
  history: number[];
}

export interface GoalProgressInput {
  goals: GoalSeries[];
}

export function buildGoalProgress(input: GoalProgressInput): GoalProgress {
  const items: GoalProgressItem[] = input.goals
    .map((g): GoalProgressItem | null => {
      const h = g.history.filter((v) => Number.isFinite(v));
      if (h.length === 0) return null;
      const current = h[h.length - 1];
      const previous = h.length >= 2 ? h[h.length - 2] : null;
      const trend = classifyPair(current, previous, g.lowerIsBetter);
      return {
        id: g.id,
        label: g.label,
        target: g.target ?? null,
        current: round(current, 4),
        previous: previous != null ? round(previous, 4) : null,
        trend,
        lowerIsBetter: g.lowerIsBetter,
        note: describe(g.label, current, previous, g.target ?? null, g.lowerIsBetter, trend),
      };
    })
    .filter((x): x is GoalProgressItem => x !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  return { items };
}

function classifyPair(current: number, previous: number | null, lowerIsBetter: boolean): TrendStatus {
  if (previous == null) return "insufficient_data";
  const rawPct = ((current - previous) / (Math.abs(previous) || 1)) * 100;
  const towardBetter = lowerIsBetter ? -rawPct : rawPct;
  if (Math.abs(towardBetter) < GOAL_NOISE_PCT) return "stable";
  return towardBetter > 0 ? "improving" : "declining";
}

function describe(label: string, current: number, previous: number | null, target: number | null, lowerIsBetter: boolean, trend: TrendStatus): string {
  const parts = [`${label}: current ${round(current, 2)}`];
  if (previous != null) parts.push(`previous ${round(previous, 2)}`);
  if (target != null) {
    const remaining = lowerIsBetter ? current - target : target - current;
    parts.push(remaining <= 0 ? `goal (${round(target, 2)}) reached` : `${round(Math.abs(remaining), 2)} to goal (${round(target, 2)})`);
  }
  parts.push(`trend ${trend}`);
  return parts.join(" · ");
}
