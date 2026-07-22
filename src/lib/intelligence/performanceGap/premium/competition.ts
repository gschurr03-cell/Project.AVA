/**
 * Competition Preparation (Phase 12). Builds a competition countdown with taper suggestions,
 * technical priorities, monitoring, warm-up reminders, and recovery priorities, keyed off the
 * days remaining to the competition. Travel considerations are a future hook. Suggestions
 * only — always coach-reviewable. Pure + deterministic.
 */

import { type Confidence, estimated, unknown } from "../models";
import type { CompetitionPlan } from "./models";
import { TAPER } from "./config";
import { topLimiters, daysToCompetition, type PremiumInput } from "./context";

export const COMPETITION_ENGINE_VERSION = "ava-premium-competition-v1" as const;

export function buildCompetitionPlan(input: PremiumInput): CompetitionPlan {
  const daysOut = daysToCompetition(input);
  const date = input.trainingContext.competitionDate ?? null;
  const techPriorities = topLimiters(input, 2).map((l) => l.label);

  if (daysOut == null) {
    return {
      competitionDate: null,
      daysOut: null,
      countdown: [],
      taper: null,
      technicalPriorities: techPriorities,
      monitoring: ["Readiness", "Technical consistency"],
      warmupReminders: ["Progressive, full warm-up", "Rehearse race starts"],
      recoveryPriorities: ["Sleep", "Nutrition", "Down-regulation"],
      confidence: unknown("no competition date set"),
    };
  }

  const countdown = [
    { phase: "Sharpening", daysOut: Math.max(daysOut, TAPER.startDaysOut), focus: "High-quality speed, low volume" },
    { phase: "Taper", daysOut: Math.min(daysOut, TAPER.startDaysOut), focus: TAPER.intensityNote },
    { phase: "Race week", daysOut: Math.min(daysOut, 5), focus: "Freshness, activation, rehearsal" },
    { phase: "Race day", daysOut: 0, focus: "Execute the race model" },
  ].filter((c) => c.daysOut <= Math.max(daysOut, TAPER.startDaysOut));

  const taper = daysOut <= TAPER.startDaysOut
    ? { startDaysOut: TAPER.startDaysOut, volumeReductionPct: TAPER.volumeReductionPct, intensityNote: TAPER.intensityNote }
    : { startDaysOut: TAPER.startDaysOut, volumeReductionPct: TAPER.volumeReductionPct, intensityNote: `Begin the taper ~${TAPER.startDaysOut} days out; ${TAPER.intensityNote}` };

  const confidence: Confidence = estimated(0.55, "taper timing is a coaching suggestion");

  return {
    competitionDate: date,
    daysOut,
    countdown,
    taper,
    technicalPriorities: techPriorities.length ? techPriorities : ["Race execution"],
    monitoring: ["Readiness / freshness", "Top speed", "Technical consistency"],
    warmupReminders: ["Progressive full warm-up", "Rehearse starts and race rhythm", "Finish activation feeling fast"],
    recoveryPriorities: ["Sleep", "Nutrition and hydration", "Down-regulation between rounds"],
    confidence,
  };
}
