/**
 * AVA Coaching Premium & Adaptive Intelligence — data models (Phase 12).
 *
 * The premium coaching layer: the ONE phase permitted to generate individualized coaching
 * recommendations. Unlike the educational Intervention engine (Phase 7), this produces
 * concrete training blocks, sessions, and plans — but every recommendation stays
 * explainable (why / why now / expected benefit / confidence / evidence / alternatives),
 * coach-reviewable, and overridable. Measured biomechanics are never altered. Pure +
 * serializable. Consumes Phases 1, 3–8, 10, 11.
 */

import type { Confidence } from "../models";
import type { Level } from "../blueprint/models";

export type { Confidence, Level };

export type BlockType =
  | "general_prep"
  | "specific_prep"
  | "pre_competition"
  | "competition"
  | "transition"
  | "rehabilitation"
  | "return_to_play";

export type SessionType =
  | "acceleration"
  | "maximum_velocity"
  | "speed_endurance"
  | "tempo"
  | "plyometrics"
  | "strength"
  | "mobility"
  | "recovery"
  | "technical"
  | "combined";

export type RecommendationCategory = "technical" | "physical" | "recovery" | "structure" | "emphasis";

/* ----------------------------------------------------------------------------------- */
/* Coach override — every recommendation is reviewable                                 */
/* ----------------------------------------------------------------------------------- */

export type OverrideStatus = "pending" | "approved" | "modified" | "replaced" | "locked" | "rejected";

export interface CoachOverrideState {
  status: OverrideStatus;
  editedText: string | null;
  byCoachId: string | null;
  at: string | null;
  reasoning: string | null;
  /** When locked, AVA will not auto-change this recommendation on adaptation. */
  locked: boolean;
}

/* ----------------------------------------------------------------------------------- */
/* Premium recommendation — explainable by construction                                */
/* ----------------------------------------------------------------------------------- */

export interface ExpectedBenefit {
  metricId: string;
  label: string;
  direction: "increase" | "decrease";
  /** Qualitative magnitude — never a guaranteed number. */
  magnitude: "small" | "moderate" | "large";
  note: string;
}

export interface RecommendationAlternative {
  label: string;
  note: string;
  interventionId: string | null;
}

export interface PremiumRecommendation {
  id: string;
  title: string;
  category: RecommendationCategory;
  /** What AVA suggests. */
  what: string;
  /** Why — the limiter / root cause it addresses. */
  why: string;
  /** Why now — the phase / progress reason it is timely. */
  whyNow: string;
  expectedBenefit: ExpectedBenefit | null;
  confidence: Confidence;
  evidence: string[];
  alternatives: RecommendationAlternative[];
  coachOverride: CoachOverrideState;
  priority: number;
  linkedInterventionId: string | null;
}

/* ----------------------------------------------------------------------------------- */
/* Training blocks + sessions                                                          */
/* ----------------------------------------------------------------------------------- */

export interface TrainingBlock {
  id: string;
  type: BlockType;
  label: string;
  primaryObjectives: string[];
  secondaryObjectives: string[];
  technicalEmphasis: string[];
  physicalEmphasis: string[];
  monitoringPriorities: string[];
  successIndicators: string[];
  sessionMix: SessionType[];
  confidence: Confidence;
}

export interface ExerciseRecommendation {
  id: string;
  name: string;
  interventionId: string | null;
  purpose: string;
  volume: string;
  recovery: string;
  intensity: string;
  cues: string[];
  monitoring: string[];
  confidence: Confidence;
  evidence: string[];
}

export interface TrainingSession {
  id: string;
  type: SessionType;
  label: string;
  purpose: string;
  exercises: ExerciseRecommendation[];
  suggestedVolume: string;
  suggestedRecovery: string;
  coachingCues: string[];
  monitoringPoints: string[];
  adjustmentNotes: string[];
  confidence: Confidence;
  evidence: string[];
}

/* ----------------------------------------------------------------------------------- */
/* Plans                                                                               */
/* ----------------------------------------------------------------------------------- */

export interface PlannedSession {
  day: string;
  session: TrainingSession;
  emphasis: "primary" | "secondary" | "recovery";
}

export interface WeeklyPlan {
  id: string;
  weekOf: string;
  blockType: BlockType;
  objectives: string[];
  sessions: PlannedSession[];
  load: LoadEstimate;
  notes: string[];
  confidence: Confidence;
}

export interface MonthlyPlan {
  id: string;
  monthOf: string;
  blockType: BlockType;
  weeks: WeeklyPlan[];
  progression: string[];
  deloadWeekIndex: number | null;
  confidence: Confidence;
}

/* ----------------------------------------------------------------------------------- */
/* Auto-adaptation                                                                     */
/* ----------------------------------------------------------------------------------- */

export type AdaptiveDecisionType =
  | "continue"
  | "progress_difficulty"
  | "reduce_volume"
  | "change_emphasis"
  | "new_intervention"
  | "increase_recovery"
  | "maintain";

export interface AdaptiveDecision {
  decision: AdaptiveDecisionType;
  rationale: string;
  triggers: string[];
  changes: { aspect: string; from: string; to: string; why: string }[];
  confidence: Confidence;
  generatedAt: string;
}

/* ----------------------------------------------------------------------------------- */
/* Load management                                                                     */
/* ----------------------------------------------------------------------------------- */

export interface LoadEstimate {
  cumulativeStress: number;
  band: "low" | "moderate" | "high" | "very_high";
  factors: { factor: string; contribution: number }[];
  fatigueIndicators: string[];
  guidance: string;
  /** Explicit non-medical disclaimer — coaching guidance only. */
  disclaimer: string;
  confidence: Confidence;
}

/* ----------------------------------------------------------------------------------- */
/* Goal planning                                                                       */
/* ----------------------------------------------------------------------------------- */

export type GoalType = "season" | "championship" | "performance" | "strength" | "technical";

export interface GoalDefinition {
  id: string;
  type: GoalType;
  label: string;
  target?: number | null;
  unit?: string | null;
  deadline?: string | null;
}

export interface GoalAlignment {
  goalId: string;
  alignedFocus: string[];
  onTrack: boolean;
  note: string;
}

export interface GoalPlan {
  goals: GoalDefinition[];
  alignment: GoalAlignment[];
  primaryGoalId: string | null;
  confidence: Confidence;
}

/* ----------------------------------------------------------------------------------- */
/* Competition preparation                                                             */
/* ----------------------------------------------------------------------------------- */

export interface CompetitionPlan {
  competitionDate: string | null;
  daysOut: number | null;
  countdown: { phase: string; daysOut: number; focus: string }[];
  taper: { startDaysOut: number; volumeReductionPct: number; intensityNote: string } | null;
  technicalPriorities: string[];
  monitoring: string[];
  warmupReminders: string[];
  recoveryPriorities: string[];
  confidence: Confidence;
}

/* ----------------------------------------------------------------------------------- */
/* Communication                                                                       */
/* ----------------------------------------------------------------------------------- */

export type ExplanationDepth = "athlete" | "coach" | "summary" | "detailed";

export interface CoachingExplanation {
  depth: ExplanationDepth;
  subjectId: string;
  text: string;
  keyPoints: string[];
}

/* ----------------------------------------------------------------------------------- */
/* Top-level plan                                                                      */
/* ----------------------------------------------------------------------------------- */

export interface PremiumCoachingPlan {
  version: string;
  generatedAt: string;
  athleteId: string | null;
  block: TrainingBlock;
  recommendations: PremiumRecommendation[];
  weeklyPlan: WeeklyPlan;
  adaptiveDecision: AdaptiveDecision;
  load: LoadEstimate;
  goalPlan: GoalPlan;
  competitionPlan: CompetitionPlan | null;
  provenance: { engineVersions: Record<string, string>; configVersion: string };
}
