/**
 * Athlete-specific dependency modeling (Phase 4). Relationships are not equal for
 * every athlete — a taller athlete leverages stride length more, a novice's reactive
 * strength transfers less, etc. This derives per-relationship multipliers from the
 * athlete's attributes and returns a context-adapted copy of the relationship set.
 * Pure + deterministic; the adaptation itself is never asserted as measured.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type { AthleteModifier, MetricRelationship } from "./models";
import { MODIFIER_RULES, METRIC_RELATIONSHIPS } from "./graphConfig";

export const ATHLETE_MODIFIER_ENGINE_VERSION = "ava-athlete-modifiers-v1" as const;

export function computeAthleteModifiers(context: AthleteContext): AthleteModifier[] {
  const ctx = {
    heightCm: num(context.heightCm),
    legLengthCm: num(context.legLengthCm),
    bodyMassKg: num(context.bodyMassKg),
    trainingAgeYears: num(context.trainingAgeYears),
  };
  const mods: AthleteModifier[] = [];
  for (const rule of MODIFIER_RULES) {
    const out = rule.factor(ctx);
    if (out && out.factor !== 1) {
      mods.push({ relationshipKey: `${rule.from}→${rule.to}`, factor: round(out.factor), reason: out.reason });
    }
  }
  return mods;
}

/** Apply the modifiers to a relationship set, clamping strength to [-1, 1]. */
export function adaptRelationships(
  context: AthleteContext,
  relationships: MetricRelationship[] = METRIC_RELATIONSHIPS,
): MetricRelationship[] {
  const mods = new Map(computeAthleteModifiers(context).map((m) => [m.relationshipKey, m.factor]));
  return relationships.map((r) => {
    const factor = mods.get(`${r.from}→${r.to}`);
    if (factor == null) return r;
    const strength = clamp(r.strength * factor, -1, 1);
    return { ...r, strength: round(strength) };
  });
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
