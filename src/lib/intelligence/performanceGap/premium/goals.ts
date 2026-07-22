/**
 * Goal Planning (Phase 12). Lets athletes define season, championship, performance, strength,
 * and technical goals, and continuously aligns the coaching focus toward them — mapping each
 * goal to the limiters and emphases that serve it, and flagging whether it looks on track from
 * the progress picture. Pure + deterministic.
 */

import { type Confidence, estimated, unknown } from "../models";
import type { GoalAlignment, GoalDefinition, GoalPlan } from "./models";
import { topLimiters, primaryTrendStatus, type PremiumInput } from "./context";

export const GOAL_PLANNING_VERSION = "ava-premium-goals-v1" as const;

export function buildGoalPlan(input: PremiumInput): GoalPlan {
  const goals = [...(input.goals ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const limiters = topLimiters(input, 3);
  const trend = primaryTrendStatus(input);
  const improving = trend === "improving" || trend === "rapid_improvement";

  const alignment: GoalAlignment[] = goals.map((g): GoalAlignment => {
    const focus = alignedFocus(g, limiters.map((l) => l.label));
    const onTrack = deriveOnTrack(g, input, improving);
    return {
      goalId: g.id,
      alignedFocus: focus,
      onTrack,
      note: `${g.label}: coaching is aligned via ${focus.length ? focus.join(", ") : "general development"}. ${onTrack ? "Currently on track." : "Not clearly on track — monitor and adapt."}`,
    };
  });

  const primaryGoalId = pickPrimary(goals);
  const confidence: Confidence = goals.length ? estimated(0.5, "goal alignment is a coaching estimate") : unknown("no goals defined");

  return { goals, alignment, primaryGoalId, confidence };
}

function alignedFocus(goal: GoalDefinition, limiterLabels: string[]): string[] {
  switch (goal.type) {
    case "technical": return limiterLabels.slice(0, 2);
    case "strength": return ["Strength & power development"];
    case "performance":
    case "season":
    case "championship":
    default: return limiterLabels.slice(0, 3);
  }
}

function deriveOnTrack(goal: GoalDefinition, input: PremiumInput, improving: boolean): boolean {
  // Time-based goals: on track if improving and (no target or projected toward it).
  if (goal.target != null && input.potential?.nearTerm?.range?.maxTimeS != null) {
    return input.potential.nearTerm.range.maxTimeS <= goal.target + 0.25 && improving;
  }
  return improving;
}

function pickPrimary(goals: GoalDefinition[]): string | null {
  const order: GoalDefinition["type"][] = ["championship", "season", "performance", "strength", "technical"];
  for (const type of order) {
    const g = goals.find((x) => x.type === type);
    if (g) return g.id;
  }
  return goals[0]?.id ?? null;
}
