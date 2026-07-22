/**
 * Progress Intelligence Engine — data models (Phase 10).
 *
 * AVA evolves from analysing ONE sprint to understanding an athlete's whole development
 * journey — trends over weeks, months, and seasons, not isolated measurements. These
 * models are the longitudinal contract: every analysis becomes part of a history, and
 * the engine distinguishes meaningful adaptation from day-to-day noise. Observations are
 * always kept separate from hypotheses; nothing is ever guaranteed. Pure + UI-independent.
 */

import type { Confidence } from "../models";

export type { Confidence };

/** One recorded analysis in the athlete's history — open to future metadata. */
export interface AnalysisRecord {
  id: string;
  /** ISO date the analysis was captured. */
  date: string;
  sessionType: "competition" | "practice" | "test" | "unknown";
  isCompetition: boolean;
  surface?: string | null;
  footwear?: string | null;
  environment?: { temperatureC?: number | null; windMps?: number | null; notes?: string | null } | null;
  recordingQuality?: number | null;
  videoQuality?: number | null;
  /** Overall confidence in this analysis (0..1). */
  confidence: number | null;
  /** Every metric recorded, keyed by metricId. */
  metrics: Record<string, number | null>;
  /** Future metadata plugs in here without a schema change. */
  metadata?: Record<string, unknown>;
}

/** The full longitudinal history. */
export interface AthleteHistory {
  version: string;
  athleteId: string | null;
  records: AnalysisRecord[];
  /** All metric ids seen across the history (future metrics appear automatically). */
  trackedMetrics: string[];
  firstDate: string | null;
  lastDate: string | null;
}

/** One point in a metric's time series. */
export interface TrendPoint {
  date: string;
  value: number;
  confidence: number | null;
  recordId: string;
  isCompetition: boolean;
}

/** A single metric's chronological series. */
export interface MetricHistory {
  metricId: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  points: TrendPoint[];
}

export type TrendStatus =
  | "improving"
  | "stable"
  | "declining"
  | "inconsistent"
  | "plateaued"
  | "rapid_improvement"
  | "rapid_regression"
  | "insufficient_data";

/** A computed trend for one metric. */
export interface ProgressTrend {
  metricId: string;
  label: string;
  unit: string;
  status: TrendStatus;
  /** Movement relative to "better" (+ = improving), value units per analysis. */
  slopePerAnalysis: number | null;
  slopePerWeek: number | null;
  /** Signed percent change across the window (+ = toward better). */
  percentChange: number | null;
  /** Regression fit quality 0..1 (how consistent the trend is). */
  fitQuality: number | null;
  confidence: Confidence;
  points: TrendPoint[];
  note: string;
}

/** A detected plateau, with likely contributing factors linked to other engines. */
export interface Plateau {
  metricId: string;
  label: string;
  detected: boolean;
  analysesSpanned: number;
  sinceDate: string | null;
  confidence: Confidence;
  likelyFactors: { metricId: string; label: string; linkedEngine: string; note: string }[];
  note: string;
}

export type AdaptationHypothesisType =
  | "technical_adaptation"
  | "physical_adaptation"
  | "measurement_noise"
  | "natural_variability"
  | "temporary_fatigue"
  | "incomplete_evidence";

/** An adaptation assessment: an OBSERVATION plus ranked HYPOTHESES (kept distinct). */
export interface AdaptationAssessment {
  metricId: string;
  label: string;
  /** What was measured — a fact, not an interpretation. */
  observation: string;
  hypotheses: { type: AdaptationHypothesisType; likelihood: number; rationale: string }[];
  confidence: Confidence;
}

/** An unexpected change — flagged WITHOUT assuming injury. */
export interface Anomaly {
  metricId: string;
  label: string;
  date: string;
  value: number;
  expectedRange: { min: number; max: number };
  deviation: number;
  severity: "minor" | "notable" | "large";
  note: string;
  confidence: Confidence;
}

/** One metric's estimated share of a performance gain. */
export interface ImprovementContribution {
  metricId: string;
  label: string;
  contributionPct: number;
  direction: "improved" | "declined";
  confidence: Confidence;
}

/** Attribution of a performance change to its contributing metrics. */
export interface ImprovementAttribution {
  fromDate: string | null;
  toDate: string | null;
  performanceMetric: string;
  performanceDeltaPct: number | null;
  contributions: ImprovementContribution[];
}

/** A short-term forecast for one metric — always with uncertainty, never a guarantee. */
export interface Forecast {
  metricId: string;
  label: string;
  unit: string;
  horizonAnalyses: number;
  method: string;
  steps: { step: number; expected: number; min: number; max: number }[];
  /** The value at the forecast horizon, as a range. */
  expectedAtHorizon: { expected: number; min: number; max: number } | null;
  confidence: Confidence;
  assumptions: string[];
  note: string;
}

/** A chronological, filterable performance timeline. */
export interface TimelineEntry {
  date: string;
  recordId: string;
  sessionType: AnalysisRecord["sessionType"];
  isCompetition: boolean;
  metrics: Record<string, number | null>;
  recordingQuality?: number | null;
  annotations: string[];
}

export interface PerformanceTimeline {
  athleteId: string | null;
  metrics: string[];
  entries: TimelineEntry[];
}

/** Progress toward one tracked goal/target, comparing the latest vs the previous value. */
export interface GoalProgressItem {
  id: string;
  label: string;
  target: number | null;
  current: number | null;
  previous: number | null;
  trend: TrendStatus;
  lowerIsBetter: boolean;
  note: string;
}

export interface GoalProgress {
  items: GoalProgressItem[];
}

/** The complete Phase 10 output. */
export interface ProgressIntelligence {
  version: string;
  generatedAt: string;
  athleteId: string | null;
  history: {
    analyses: number;
    firstDate: string | null;
    lastDate: string | null;
    trackedMetrics: string[];
  };
  trends: ProgressTrend[];
  plateaus: Plateau[];
  adaptations: AdaptationAssessment[];
  anomalies: Anomaly[];
  attribution: ImprovementAttribution | null;
  forecasts: Forecast[];
  timeline: PerformanceTimeline;
  goalProgress: GoalProgress;
  provenance: { engineVersions: Record<string, string>; configVersion: string };
}
