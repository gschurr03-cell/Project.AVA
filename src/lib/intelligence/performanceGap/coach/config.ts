/**
 * Coach Platform — CONFIGURATION (Phase 11).
 *
 * The role → permission matrix, alert thresholds, team-health weights, and status bands.
 * Editing this file re-shapes access control and alerting without touching engine logic;
 * a new organization role plugs in by adding a row here. No measured data lives here.
 */

export const COACH_PLATFORM_CONFIG_VERSION = "ava-coach-platform-config-v1" as const;

/** Every guarded action in the platform. */
export const ACTIONS = [
  "view_own_analyses",
  "view_team",
  "view_all_teams",
  "manage_org",
  "manage_teams",
  "manage_membership",
  "review_recommendations",
  "edit_blueprint",
  "manage_preferences",
  "generate_reports",
  "view_reports",
  "add_coach_notes",
  "add_athlete_notes",
  "view_audit",
  "acknowledge_alerts",
  "export_data",
] as const;

export type PlatformAction = (typeof ACTIONS)[number];

/**
 * Role → permitted actions. Owners get everything; coaches get scoped management;
 * athletes see only their own data; viewers are read-only.
 */
export const ROLE_PERMISSIONS: Record<string, PlatformAction[]> = {
  owner: [...ACTIONS],
  head_coach: [
    "view_team", "view_all_teams", "manage_teams", "manage_membership",
    "review_recommendations", "edit_blueprint", "manage_preferences",
    "generate_reports", "view_reports", "add_coach_notes", "view_audit",
    "acknowledge_alerts", "export_data",
  ],
  assistant_coach: [
    "view_team", "review_recommendations", "generate_reports", "view_reports",
    "add_coach_notes", "acknowledge_alerts",
  ],
  athlete: ["view_own_analyses", "view_reports", "add_athlete_notes"],
  viewer: ["view_team", "view_reports"],
};

/** Alert thresholds (all comparisons are relative to the athlete's own history). */
export const ALERT = {
  /** Confidence falling by more than this (absolute, 0..1) between analyses. */
  confidenceDropDelta: 0.2,
  /** Recording quality at/below this (0..1) is flagged. */
  recordingQualityMin: 0.6,
  /** Asymmetry rising by more than this many percentage points. */
  asymmetryIncreasePts: 3,
  /** Days without a new analysis before "missing data" fires. */
  missingDataDays: 45,
  /** Repeated recording-quality issues across this many recent analyses. */
  repeatedIssueCount: 3,
} as const;

/** Athlete status bands from development score + trend. */
export const STATUS = {
  onTrackMinScore: 65,
  atRiskMaxScore: 40,
} as const;

/** Team-health weighting. */
export const TEAM_HEALTH = {
  weights: { onTrackFraction: 0.4, avgCompletion: 0.35, alertLoad: 0.25 },
  /** Critical/warning alerts per athlete that fully saturate the alert-load penalty. */
  alertSaturationPerAthlete: 1.5,
  bands: { strong: 78, steady: 60, mixed: 42 },
} as const;
