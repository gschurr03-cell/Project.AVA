/**
 * Coach Intelligence & Team Platform (Phase 11) — public surface + orchestration.
 *
 * Turns AVA into a coaching platform without ever replacing the coach: role-based access +
 * organization isolation, a coach review system where every AI conclusion is
 * accept/reject/modify/annotate/override-able, a coach knowledge layer that reshapes wording
 * (never data), team dashboards + athlete cards + analytics, an explainable alert engine, a
 * report generator, collaboration notes, an append-only audit trail, and export seams. All
 * pure + deterministic + serializable, layered over the prior phases.
 *
 * Do NOT implement Premium Coaching. Do NOT redesign unrelated UI.
 */

import type { ProgressIntelligence } from "../progress/models";
import type { Alert, AthleteSummary, CoachNote, CoachPreference, TeamDashboard } from "./models";
import { COACH_PLATFORM_CONFIG_VERSION } from "./config";
import { RBAC_VERSION } from "./rbac";
import { COACH_REVIEW_VERSION } from "./review";
import { COACH_PREFERENCES_VERSION, resolvePreferences } from "./preferences";
import { buildAthleteSummary, ATHLETE_CARD_VERSION, type AthleteCardInput } from "./athleteCard";
import { buildTeamAnalytics, TEAM_ANALYTICS_VERSION, type TeamAnalyticsInput } from "./analytics";
import { generateAlerts, ALERT_ENGINE_VERSION, type AlertInput } from "./alerts";
import { buildTeamDashboard, TEAM_DASHBOARD_VERSION } from "./dashboard";
import { REPORT_GENERATOR_VERSION } from "./report";
import { AUDIT_VERSION } from "./audit";
import { COLLABORATION_VERSION } from "./collaboration";
import { EXPORT_VERSION } from "./export";
import { ORGANIZATION_VERSION } from "./organization";

export * from "./models";
export * from "./config";
export * from "./rbac";
export * from "./organization";
export * from "./review";
export * from "./preferences";
export * from "./athleteCard";
export * from "./analytics";
export * from "./alerts";
export * from "./dashboard";
export * from "./report";
export * from "./collaboration";
export * from "./audit";
export * from "./export";

export const COACH_PLATFORM_VERSION = "coach-platform-v1" as const;

export const COACH_PLATFORM_ENGINE_VERSIONS = {
  config: COACH_PLATFORM_CONFIG_VERSION,
  rbac: RBAC_VERSION,
  organization: ORGANIZATION_VERSION,
  review: COACH_REVIEW_VERSION,
  preferences: COACH_PREFERENCES_VERSION,
  athleteCard: ATHLETE_CARD_VERSION,
  analytics: TEAM_ANALYTICS_VERSION,
  alerts: ALERT_ENGINE_VERSION,
  dashboard: TEAM_DASHBOARD_VERSION,
  report: REPORT_GENERATOR_VERSION,
  collaboration: COLLABORATION_VERSION,
  audit: AUDIT_VERSION,
  export: EXPORT_VERSION,
} as const;

/** Per-athlete inputs the dashboard orchestrator fans out over. */
export interface DashboardAthleteInput {
  card: AthleteCardInput;
  progress?: ProgressIntelligence | null;
  recordingQualityHistory?: number[];
  confidenceHistory?: number[];
  lastAnalysisDate?: string | null;
  newAnalysisId?: string | null;
  metricChanges?: { metricId: string; percentChange: number }[];
  asymmetryPct?: number | null;
  recordingQuality?: number | null;
}

export interface CoachDashboardInput {
  orgId: string;
  teamId?: string | null;
  athletes: DashboardAthleteInput[];
  notes?: CoachNote[];
  orgPreference?: CoachPreference | null;
  coachPreference?: CoachPreference | null;
  now: Date;
}

/**
 * One-call convenience: builds athlete cards, generates alerts, aggregates team analytics,
 * and assembles the full team dashboard. Coach preferences are resolved but only ever reshape
 * wording/ordering downstream — never the underlying numbers.
 */
export function buildCoachDashboard(input: CoachDashboardInput): { dashboard: TeamDashboard; alerts: Alert[]; summaries: AthleteSummary[] } {
  resolvePreferences(input.orgPreference, input.coachPreference); // resolved for report wording; data untouched here

  const summaries: AthleteSummary[] = input.athletes.map((a) => buildAthleteSummary(a.card));

  const alerts: Alert[] = input.athletes.flatMap((a) =>
    generateAlerts({
      orgId: input.orgId,
      athleteId: a.card.athleteId,
      progress: a.progress,
      recordingQualityHistory: a.recordingQualityHistory,
      confidenceHistory: a.confidenceHistory,
      lastAnalysisDate: a.lastAnalysisDate,
      newAnalysisId: a.newAnalysisId,
      now: input.now,
    } satisfies AlertInput),
  );

  const analyticsInput: TeamAnalyticsInput = {
    summaries,
    recordingQuality: input.athletes.filter((a) => a.recordingQuality != null).map((a) => ({ athleteId: a.card.athleteId, quality: a.recordingQuality! })),
    metricChanges: input.athletes.flatMap((a) => (a.metricChanges ?? []).map((c) => ({ athleteId: a.card.athleteId, metricId: c.metricId, percentChange: c.percentChange }))),
    asymmetry: input.athletes.filter((a) => a.asymmetryPct != null).map((a) => ({ athleteId: a.card.athleteId, pct: a.asymmetryPct! })),
  };
  const analytics = buildTeamAnalytics(analyticsInput);

  const dashboard = buildTeamDashboard({
    orgId: input.orgId,
    teamId: input.teamId ?? null,
    athletes: summaries,
    alerts,
    analytics,
    notes: input.notes,
    now: input.now,
  });

  return { dashboard, alerts, summaries };
}
