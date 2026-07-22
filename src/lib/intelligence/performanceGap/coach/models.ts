/**
 * Coach Intelligence & Team Platform — data models (Phase 11).
 *
 * Turns AVA from an athlete-analysis app into a coaching platform, while keeping the coach
 * in control: every AI conclusion is reviewable, editable, acceptable, and rejectable.
 * These models are the UI-independent contract for organizations, teams, role-based access,
 * coach review, the coach knowledge layer, dashboards, alerts, reports, and an audit trail.
 * Pure + serializable. Coach preferences influence WORDING only — never measured data.
 */

import type { Confidence } from "../models";
import type { TrendStatus } from "../progress/models";

export type { Confidence, TrendStatus };

/* ----------------------------------------------------------------------------------- */
/* Organization, teams, roles, membership                                              */
/* ----------------------------------------------------------------------------------- */

export type OrganizationRole = "owner" | "head_coach" | "assistant_coach" | "athlete" | "viewer";

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  /** Open settings bag — future organization config plugs in here. */
  settings?: Record<string, unknown>;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  coachIds: string[];
  athleteIds: string[];
}

/** A training group within a team (e.g. "Sprints", "Relay pool"). */
export interface TrainingGroup {
  id: string;
  teamId: string;
  orgId: string;
  name: string;
  coachIds: string[];
  athleteIds: string[];
}

export interface Coach {
  id: string;
  orgId: string;
  name: string;
  role: OrganizationRole;
  /** Teams the coach is assigned to (empty = org-wide for owners/head coaches). */
  teamIds: string[];
}

export type AthletePermission = "view_analyses" | "view_reports" | "edit_own_profile" | "share_reports" | "message_coach";

export interface AthleteMembership {
  athleteId: string;
  orgId: string;
  teamId: string | null;
  groupId: string | null;
  /** Primary coach responsible for this athlete. */
  primaryCoachId: string | null;
  permissions: AthletePermission[];
  joinedAt: string;
}

/* ----------------------------------------------------------------------------------- */
/* Coach review — every recommendation is reviewable                                   */
/* ----------------------------------------------------------------------------------- */

export type ReviewDecision = "pending" | "accepted" | "rejected" | "modified" | "annotated" | "overridden";

export interface CoachReview {
  id: string;
  recommendationId: string;
  athleteId: string;
  orgId: string;
  coachId: string;
  decision: ReviewDecision;
  /** The AI's original text (kept immutable for traceability). */
  originalText: string;
  /** The coach's edited/override text, when they modified or overrode it. */
  editedText: string | null;
  annotation: string | null;
  /** Why the coach made this decision (stored reasoning). */
  reasoning: string | null;
  createdAt: string;
  /** Links to the prior review this one supersedes (decision history chain). */
  previousReviewId: string | null;
}

/* ----------------------------------------------------------------------------------- */
/* Coach knowledge layer — influences wording, never data                              */
/* ----------------------------------------------------------------------------------- */

export interface CoachPreference {
  id: string;
  orgId: string;
  scope: "organization" | "coach";
  /** Present when scope = "coach". */
  coachId: string | null;
  /** Metric emphasis weights (>1 emphasises, <1 de-emphasises) — reorders wording/priority. */
  emphasis: { metricId: string; weight: number }[];
  /** Preferred terminology map: canonical phrase → coach's preferred phrase. */
  terminology: Record<string, string>;
  /** Preferred coaching cues, in the coach's own wording. */
  cuePreferences: string[];
  philosophyNote: string | null;
}

/* ----------------------------------------------------------------------------------- */
/* Athlete card + team dashboard                                                       */
/* ----------------------------------------------------------------------------------- */

export type AthleteStatus = "on_track" | "watch" | "at_risk" | "no_data";

export interface AthleteSummary {
  athleteId: string;
  name: string;
  latestAnalysisDate: string | null;
  currentPbS: number | null;
  goalPbS: number | null;
  developmentScore: number | null;
  blueprintCompletion: number | null;
  performancePotential: { minTimeS: number | null; maxTimeS: number | null } | null;
  trendDirection: TrendStatus;
  highestPriorityLimiter: { metricId: string; label: string; contributionPct: number | null } | null;
  confidence: Confidence;
  recentProgress: string;
  coachNoteCount: number;
  status: AthleteStatus;
}

export interface AnalysisQueueItem {
  analysisId: string;
  athleteId: string;
  status: "queued" | "processing" | "complete" | "failed";
  submittedAt: string;
}

export interface RecentAnalysis {
  analysisId: string;
  athleteId: string;
  date: string;
  primaryMetric: string;
  value: number | null;
  confidence: number | null;
}

export interface UpcomingReview {
  athleteId: string;
  dueDate: string;
  reason: string;
}

export interface TeamHealth {
  score: number;
  label: "strong" | "steady" | "mixed" | "needs_attention";
  breakdown: { factor: string; value: number }[];
}

export interface TeamDashboard {
  orgId: string;
  teamId: string | null;
  generatedAt: string;
  athletes: AthleteSummary[];
  recentAnalyses: RecentAnalysis[];
  alerts: Alert[];
  analytics: TeamAnalytics;
  queue: AnalysisQueueItem[];
  unreadNotes: number;
  upcomingReviews: UpcomingReview[];
  teamHealth: TeamHealth;
}

export interface TeamAnalytics {
  athleteCount: number;
  averageBlueprintCompletion: number | null;
  averageDevelopmentScore: number | null;
  overallRecordingQuality: number | null;
  mostCommonLimitation: { metricId: string; label: string; count: number } | null;
  mostImprovedMetric: { metricId: string; label: string; averagePercentChange: number } | null;
  mostCommonAsymmetry: { count: number; averagePct: number } | null;
  mostCommonAccelerationIssue: { metricId: string; label: string; count: number } | null;
  topOpportunities: { metricId: string; label: string; athletes: number; note: string }[];
}

/* ----------------------------------------------------------------------------------- */
/* Alerts — always explain WHY                                                         */
/* ----------------------------------------------------------------------------------- */

export type AlertType =
  | "plateau"
  | "rapid_regression"
  | "asymmetry_increase"
  | "recording_quality"
  | "new_analysis"
  | "confidence_drop"
  | "missing_data"
  | "repeated_technical_issue";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  orgId: string;
  athleteId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  /** Every alert explains WHY it fired. */
  why: string;
  evidence: string[];
  metricId: string | null;
  createdAt: string;
  acknowledged: boolean;
  confidence: Confidence;
}

/* ----------------------------------------------------------------------------------- */
/* Reports                                                                             */
/* ----------------------------------------------------------------------------------- */

export type ReportKind = "athlete" | "team" | "season" | "progress" | "meeting" | "recruiting";

export interface ChartSpec {
  id: string;
  type: "line" | "bar";
  title: string;
  xLabel: string;
  yLabel: string;
  series: { label: string; points: { x: string | number; y: number }[] }[];
}

export type ReportSectionKind = "metrics" | "chart" | "explanation" | "confidence" | "trend" | "evidence" | "notes";

export interface ReportSection {
  id: string;
  heading: string;
  kind: ReportSectionKind;
  /** Rendered as text lines by the consumer (UI/PDF) — this layer stays presentation-free. */
  lines: string[];
  charts?: ChartSpec[];
}

export interface Report {
  id: string;
  kind: ReportKind;
  title: string;
  subjectId: string;
  orgId: string;
  generatedAt: string;
  sections: ReportSection[];
  provenance: { engineVersions: Record<string, string> };
}

/* ----------------------------------------------------------------------------------- */
/* Collaboration                                                                       */
/* ----------------------------------------------------------------------------------- */

export interface CoachNote {
  id: string;
  orgId: string;
  athleteId: string;
  authorId: string;
  authorRole: "coach" | "athlete";
  text: string;
  pinned: boolean;
  createdAt: string;
  read: boolean;
  /** Thread grouping for shared discussions. */
  threadId: string | null;
}

/* ----------------------------------------------------------------------------------- */
/* Audit history — every AI recommendation is traceable                                */
/* ----------------------------------------------------------------------------------- */

export type AuditAction =
  | "recommendation_created"
  | "coach_edit"
  | "review_decision"
  | "athlete_change"
  | "blueprint_update"
  | "simulation_saved"
  | "progress_change"
  | "research_revision"
  | "note_added"
  | "report_generated";

export interface AuditEntry {
  id: string;
  orgId: string;
  actorId: string;
  actorRole: OrganizationRole;
  action: AuditAction;
  targetType: string;
  targetId: string;
  at: string;
  before: string | null;
  after: string | null;
  reason: string | null;
}

export interface AuditLog {
  version: string;
  entries: AuditEntry[];
}
