/**
 * Population Matching (Phase 8). Weights research by similarity to the athlete: a study
 * on elite female 400 m runners should not carry identical weight for a male collegiate
 * 100 m sprinter. Deterministic 0..1 match from sex / event / level / anthropometrics /
 * training age, with per-factor transparency.
 */

import type { AthleteContext } from "../rootCause/athleteContext";
import type { Level, PopulationMatch, ResearchPopulation } from "./models";

export const POPULATION_MATCH_VERSION = "ava-population-match-v1" as const;

const LEVEL_ORDER: (Level | "recreational")[] = ["recreational", "developing", "intermediate", "advanced", "elite"];

export function matchPopulation(pop: ResearchPopulation, context: AthleteContext): PopulationMatch {
  const factors: { factor: string; score: number }[] = [];

  // Sex: exact match = 1, "mixed" = 0.7, mismatch = 0.4.
  factors.push({ factor: "sex", score: sexScore(pop.sex, context.sex) });
  // Event: same event = 1, related sprint = 0.7, different = 0.4.
  factors.push({ factor: "event", score: eventScore(pop.event, context.event) });
  // Performance level: proximity on the ordinal scale.
  factors.push({ factor: "level", score: levelScore(pop.performanceLevel, estimateAthleteLevel(context)) });
  // Sample size: larger samples → slightly more transferable (weak factor).
  factors.push({ factor: "sampleSize", score: sampleScore(pop.sampleSize) });

  // Weighted average (sex + event + level dominate; sample size is minor).
  const weights: Record<string, number> = { sex: 0.3, event: 0.35, level: 0.25, sampleSize: 0.1 };
  const score = factors.reduce((s, f) => s + f.score * weights[f.factor], 0);
  return { score: round(score), factors };
}

function sexScore(paper: ResearchPopulation["sex"], athlete: AthleteContext["sex"]): number {
  if (paper == null || athlete == null) return 0.6;
  if (paper === "mixed") return 0.75;
  return paper === athlete ? 1 : 0.4;
}
function eventScore(paper: string | null, athlete: string | null | undefined): number {
  if (!paper || !athlete) return 0.6;
  const p = paper.toLowerCase();
  const a = athlete.toLowerCase();
  if (p === a) return 1;
  if (p.includes("sprint") || a.includes("sprint")) return 0.75;
  const sprintEvents = ["60m", "100m", "200m"];
  if (sprintEvents.some((e) => p.includes(e.replace("m", ""))) && sprintEvents.some((e) => a.includes(e.replace("m", "")))) return 0.7;
  return 0.4;
}
function levelScore(paper: ResearchPopulation["performanceLevel"], athlete: Level): number {
  if (paper == null || paper === "mixed") return 0.7;
  const pi = LEVEL_ORDER.indexOf(paper);
  const ai = LEVEL_ORDER.indexOf(athlete);
  if (pi < 0 || ai < 0) return 0.6;
  return round(1 - Math.abs(pi - ai) / (LEVEL_ORDER.length - 1));
}
function sampleScore(n: number | null): number {
  if (n == null) return 0.5;
  if (n >= 100) return 1;
  if (n >= 40) return 0.8;
  if (n >= 20) return 0.6;
  return 0.4;
}

/** Rough athlete level from the goal/current PB (mirrors the blueprint heuristic). */
export function estimateAthleteLevel(context: AthleteContext): Level {
  const goal = num(context.goalPbSeconds) ?? num(context.currentPbSeconds);
  const event = (context.event ?? "100m").toLowerCase();
  if (goal == null) return "intermediate";
  const t = event.includes("200") ? goal / 2 : event.includes("60") ? goal * 1.6 : goal;
  if (t <= 10.2) return "elite";
  if (t <= 10.7) return "advanced";
  if (t <= 11.4) return "intermediate";
  return "developing";
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
