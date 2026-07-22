/**
 * Team Dashboard (Phase 11). Aggregates everything a coach sees at the organization level:
 * athlete cards, recent analyses, alerts, team analytics, the analysis queue, unread notes,
 * upcoming reviews, and an overall team-health score. Pure aggregation over already-built
 * pieces — deterministic and serializable.
 */

import type { Alert, AnalysisQueueItem, AthleteSummary, CoachNote, RecentAnalysis, TeamAnalytics, TeamDashboard, TeamHealth, UpcomingReview } from "./models";
import { TEAM_HEALTH } from "./config";

export const TEAM_DASHBOARD_VERSION = "ava-coach-dashboard-v1" as const;

export interface TeamDashboardInput {
  orgId: string;
  teamId?: string | null;
  athletes: AthleteSummary[];
  alerts: Alert[];
  analytics: TeamAnalytics;
  recentAnalyses?: RecentAnalysis[];
  queue?: AnalysisQueueItem[];
  notes?: CoachNote[];
  upcomingReviews?: UpcomingReview[];
  now: Date;
}

export function buildTeamDashboard(input: TeamDashboardInput): TeamDashboard {
  const athletes = [...input.athletes].sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name));
  const alerts = [...input.alerts].sort((a, b) => sev(b.severity) - sev(a.severity) || a.type.localeCompare(b.type));
  const recentAnalyses = [...(input.recentAnalyses ?? [])].sort((a, b) => b.date.localeCompare(a.date) || a.analysisId.localeCompare(b.analysisId));
  const queue = [...(input.queue ?? [])].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.analysisId.localeCompare(b.analysisId));
  const upcomingReviews = [...(input.upcomingReviews ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.athleteId.localeCompare(b.athleteId));
  const unreadNotes = (input.notes ?? []).filter((n) => !n.read).length;

  return {
    orgId: input.orgId,
    teamId: input.teamId ?? null,
    generatedAt: input.now.toISOString(),
    athletes,
    recentAnalyses,
    alerts,
    analytics: input.analytics,
    queue,
    unreadNotes,
    upcomingReviews,
    teamHealth: computeTeamHealth(athletes, alerts, input.analytics),
  };
}

export function computeTeamHealth(athletes: AthleteSummary[], alerts: Alert[], analytics: TeamAnalytics): TeamHealth {
  const total = Math.max(1, athletes.length);
  const onTrackFraction = athletes.filter((a) => a.status === "on_track").length / total;
  const avgCompletionNorm = (analytics.averageBlueprintCompletion ?? 0) / 100;
  const pressing = alerts.filter((a) => a.severity === "critical" || a.severity === "warning").length;
  const alertPenalty = Math.min(1, pressing / (total * TEAM_HEALTH.alertSaturationPerAthlete));
  const alertScore = 1 - alertPenalty;

  const w = TEAM_HEALTH.weights;
  const score01 = w.onTrackFraction * onTrackFraction + w.avgCompletion * avgCompletionNorm + w.alertLoad * alertScore;
  const score = Math.round(score01 * 100);
  const label: TeamHealth["label"] =
    score >= TEAM_HEALTH.bands.strong ? "strong" : score >= TEAM_HEALTH.bands.steady ? "steady" : score >= TEAM_HEALTH.bands.mixed ? "mixed" : "needs_attention";

  return {
    score,
    label,
    breakdown: [
      { factor: "onTrackFraction", value: round(onTrackFraction, 3) },
      { factor: "avgBlueprintCompletion", value: round(avgCompletionNorm, 3) },
      { factor: "alertLoad", value: round(alertScore, 3) },
    ],
  };
}

function statusRank(s: AthleteSummary["status"]): number {
  return s === "at_risk" ? 0 : s === "watch" ? 1 : s === "on_track" ? 2 : 3;
}
function sev(s: Alert["severity"]): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}
function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
