/**
 * Weekly / Monthly Planning (Phase 12). Assembles generated sessions into a weekly plan that
 * respects the block's session mix, the athlete's available modalities, and a hard/easy
 * distribution, then stacks weeks into a monthly plan with a progression and a deload week.
 * Every plan carries its load estimate and stays fully coach-reviewable. Pure + deterministic.
 */

import { type Confidence, estimated } from "../models";
import type { MonthlyPlan, PlannedSession, SessionType, WeeklyPlan } from "./models";
import { generateTrainingBlock } from "./blocks";
import { generateSession } from "./sessions";
import { estimateLoad } from "./load";
import { SESSION_TEMPLATES } from "./config";
import type { PremiumInput } from "./context";

export const PLANNING_ENGINE_VERSION = "ava-premium-planning-v1" as const;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function buildWeeklyPlan(input: PremiumInput, weekOf = input.trainingContext.weekOf ?? (input.now ?? new Date()).toISOString().slice(0, 10)): WeeklyPlan {
  const block = generateTrainingBlock(input);
  const available = input.trainingContext.availableSessionTypes;
  const mix = (available?.length ? block.sessionMix.filter((s) => available.includes(s)) : block.sessionMix);
  const usable = mix.length ? mix : block.sessionMix;

  const n = Math.max(1, Math.min(7, input.trainingContext.sessionsPerWeek));
  const sessions: PlannedSession[] = [];
  for (let i = 0; i < n; i++) {
    const type = usable[i % usable.length];
    const dayIndex = Math.min(6, Math.round((i * 7) / n));
    sessions.push({ day: DAYS[dayIndex], session: generateSession(input, type), emphasis: emphasisFor(type) });
  }

  const load = estimateLoad(input);
  const confidence: Confidence = estimated(0.55, "weekly plan is an individualized suggestion");

  return {
    id: `week-${weekOf}`,
    weekOf,
    blockType: block.type,
    objectives: block.primaryObjectives,
    sessions,
    load,
    notes: [
      "Volumes are suggestions — auto-regulate to readiness.",
      ...(load.band === "very_high" || load.band === "high" ? ["Load is elevated; keep an easy day flexible."] : []),
    ],
    confidence,
  };
}

export function buildMonthlyPlan(input: PremiumInput, weeks = 4, monthOf = (input.now ?? new Date()).toISOString().slice(0, 7)): MonthlyPlan {
  const block = generateTrainingBlock(input);
  const deloadWeekIndex = weeks >= 3 ? weeks - 1 : null;

  const weekPlans: WeeklyPlan[] = [];
  for (let w = 0; w < weeks; w++) {
    const isDeload = w === deloadWeekIndex;
    const weekInput: PremiumInput = isDeload
      ? { ...input, trainingContext: { ...input.trainingContext, sessionsPerWeek: Math.max(1, input.trainingContext.sessionsPerWeek - 1), recentSessionLoads: (input.trainingContext.recentSessionLoads ?? []).map((l) => l * 0.6) } }
      : input;
    const plan = buildWeeklyPlan(weekInput, `${monthOf}-w${w + 1}`);
    if (isDeload) plan.notes = ["Deload week — reduced volume to absorb prior work.", ...plan.notes];
    weekPlans.push(plan);
  }

  return {
    id: `month-${monthOf}`,
    monthOf,
    blockType: block.type,
    weeks: weekPlans,
    progression: [
      "Progressively raise the quality/intensity of the primary emphasis across weeks 1–3.",
      "Hold technical standards constant; increase difficulty only when quality holds.",
      deloadWeekIndex != null ? `Deload in week ${deloadWeekIndex + 1} to consolidate adaptation.` : "No deload scheduled in this short block.",
    ],
    deloadWeekIndex,
    confidence: estimated(0.5, "monthly progression is a coaching suggestion"),
  };
}

function emphasisFor(type: SessionType): PlannedSession["emphasis"] {
  if (type === "recovery" || type === "mobility" || type === "tempo") return "recovery";
  return SESSION_TEMPLATES[type].loadWeight >= 0.7 ? "primary" : "secondary";
}
