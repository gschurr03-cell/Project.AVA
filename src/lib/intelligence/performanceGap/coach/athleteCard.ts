/**
 * Athlete Cards (Phase 11). Assembles an at-a-glance AthleteSummary for the dashboard from
 * the prior engines' outputs — latest analysis, PBs, development score, blueprint
 * completion, performance potential, trend direction, top limiter, confidence, recent
 * progress, and note count — plus a derived status band. Pure aggregation, no re-analysis.
 */

import { type Confidence, unknown } from "../models";
import type { ProgressIntelligence, TrendStatus } from "../progress/models";
import type { AthleteStatus, AthleteSummary } from "./models";
import { STATUS } from "./config";

export const ATHLETE_CARD_VERSION = "ava-coach-athlete-card-v1" as const;

export interface AthleteCardInput {
  athleteId: string;
  name: string;
  latestAnalysisDate?: string | null;
  currentPbS?: number | null;
  goalPbS?: number | null;
  developmentScore?: number | null;
  blueprintCompletion?: number | null;
  performancePotential?: { minTimeS: number | null; maxTimeS: number | null } | null;
  progress?: ProgressIntelligence | null;
  priorities?: { metricId: string; label: string; contributionPct: number | null }[] | null;
  confidence?: Confidence | null;
  coachNoteCount?: number;
  /** Which metric's trend drives the card's direction (default averageVelocity). */
  primaryTrendMetric?: string;
}

export function buildAthleteSummary(input: AthleteCardInput): AthleteSummary {
  const trendMetric = input.primaryTrendMetric ?? "averageVelocity";
  const trend = input.progress?.trends.find((t) => t.metricId === trendMetric);
  const trendDirection: TrendStatus = trend?.status ?? "insufficient_data";

  const limiter = input.priorities?.[0] ?? null;
  const confidence: Confidence = input.confidence ?? trend?.confidence ?? unknown("no confidence available");

  const status = deriveStatus(input.developmentScore ?? null, trendDirection, input.latestAnalysisDate ?? null);
  const recentProgress = describeProgress(trend?.note ?? null, input.currentPbS ?? null, input.goalPbS ?? null);

  return {
    athleteId: input.athleteId,
    name: input.name,
    latestAnalysisDate: input.latestAnalysisDate ?? null,
    currentPbS: input.currentPbS ?? null,
    goalPbS: input.goalPbS ?? null,
    developmentScore: input.developmentScore ?? null,
    blueprintCompletion: input.blueprintCompletion ?? null,
    performancePotential: input.performancePotential ?? null,
    trendDirection,
    highestPriorityLimiter: limiter,
    confidence,
    recentProgress,
    coachNoteCount: input.coachNoteCount ?? 0,
    status,
  };
}

function deriveStatus(devScore: number | null, trend: TrendStatus, latestDate: string | null): AthleteStatus {
  if (devScore == null && latestDate == null) return "no_data";
  if (trend === "declining" || trend === "rapid_regression") return "at_risk";
  if (devScore != null && devScore >= STATUS.onTrackMinScore) return "on_track";
  if (devScore != null && devScore <= STATUS.atRiskMaxScore) return "at_risk";
  return "watch";
}

function describeProgress(trendNote: string | null, pb: number | null, goal: number | null): string {
  if (trendNote) return trendNote;
  if (pb != null && goal != null) {
    const remaining = pb - goal;
    return remaining <= 0 ? `At or beyond goal (${goal.toFixed(2)}s).` : `${remaining.toFixed(2)}s from goal (${goal.toFixed(2)}s).`;
  }
  return "No recent progress data.";
}
