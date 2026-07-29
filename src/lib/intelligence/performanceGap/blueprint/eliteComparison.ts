/**
 * Elite Comparison engine (Phase 5). Compares the athlete to a SIMILAR-BUILD
 * archetype — matched on anthropometrics + event — never a named world-record holder
 * and never a completely different build. Returns the closest archetype with a
 * similarity score, or null when no archetype is a reasonable match. Pure.
 */

import { type Confidence, estimated, inferred, unknown } from "../models";
import type { AthleteContext } from "../rootCause/athleteContext";
import type { EliteComparison } from "./models";
import { ELITE_ARCHETYPES, type EliteArchetype } from "./config";

export const ELITE_COMPARISON_VERSION = "ava-elite-comparison-v1" as const;

/** Below this similarity, AVA declines to compare (too different a build). */
export const MIN_SIMILARITY = 0.45;

export function buildEliteComparison(context: AthleteContext): EliteComparison | null {
  const heightCm = num(context.heightCm);
  const massKg = num(context.bodyMassKg);
  const event = (context.event ?? "100m").toLowerCase();

  if (heightCm == null && massKg == null) return null;

  let best: { arch: EliteArchetype; similarity: number; basis: string[] } | null = null;
  for (const arch of ELITE_ARCHETYPES) {
    const basis: string[] = [];
    let score = 0;
    let weight = 0;

    if (heightCm != null) {
      score += rangeSimilarity(heightCm, arch.heightCm) * 0.45;
      weight += 0.45;
      basis.push("height");
    }
    if (massKg != null) {
      score += rangeSimilarity(massKg, arch.massKg) * 0.35;
      weight += 0.35;
      basis.push("body mass");
    }
    const eventMatch = arch.event.some((e) => event.includes(e.replace("m", "")));
    score += (eventMatch ? 1 : 0) * 0.2;
    weight += 0.2;
    if (eventMatch) basis.push("event");

    const similarity = weight > 0 ? score / weight : 0;
    if (!best || similarity > best.similarity) best = { arch, similarity, basis };
  }

  if (!best || best.similarity < MIN_SIMILARITY) return null;

  const confidence: Confidence =
    best.similarity >= 0.75 ? estimated(0.65, "close anthropometric + event match") : inferred(0.45, "partial build match");

  return {
    archetypeId: best.arch.id,
    label: best.arch.label,
    similarity: round(best.similarity),
    basis: best.basis,
    velocityProfile: best.arch.velocityProfile,
    accelerationProfile: best.arch.accelerationProfile,
    style: best.arch.style,
    note: "Compared to a similar-build archetype — not a specific athlete or world record.",
    confidence,
  };
}

/** 1 when inside the range; decays outside proportionally to the band width. */
function rangeSimilarity(value: number, [min, max]: [number, number]): number {
  if (value >= min && value <= max) return 1;
  const band = Math.max(1e-6, max - min);
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1 - distance / band);
}

export function comparisonUnavailable(): Confidence {
  return unknown("insufficient anthropometrics for a build comparison");
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
