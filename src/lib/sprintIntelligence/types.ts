/**
 * Sprint Intelligence — the interpretive explanation layer between the authoritative five
 * metrics + the Limiting Factors engine and the coaching surface.
 *
 * It answers "why did AVA reach this conclusion?" by keeping the reasoning layers explicitly
 * separated (contract):
 *   MEASUREMENT  → what was observed/calculated
 *   COMPARISON   → how it relates to an available (and honestly-labelled) target
 *   INTERPRETATION → what the combination may indicate
 *   ASSOCIATION  → technical/physical patterns commonly linked (never "measured")
 *   RECOMMENDATION → what to investigate next (references the limiter engine; no workouts)
 *
 * Everything here is DETERMINISTIC and TRANSPORT-SAFE (plain JSON: no Date objects, no JSX,
 * no functions) so the same report drives web, a future iOS client, API responses, and PDF
 * reports. Conclusions are composed from the Limiting Factors output — this layer never
 * invents a conclusion, target, or confidence the engine did not produce.
 */

import type { ConfidenceLabel, LimitingFactorsResult } from "@/lib/limitingFactors/types";

/** What kind of finding a conclusion represents. */
export type IntelligenceClassification =
  | "primary_limiter"
  | "supporting_limiter"
  | "asymmetry"
  | "performance_strength"
  | "contextual_finding"
  | "insufficient_evidence";

/** Where a comparison target came from — these are NOT interchangeable and must be shown. */
export type ComparisonBasisType =
  | "individualized"
  | "historical_baseline"
  | "coach_defined"
  | "research_reference"
  | "session_goal"
  | "within_athlete_symmetry"
  | "unavailable";

export interface ComparisonBasis {
  metricLabel: string;
  basis: ComparisonBasisType;
  sourceLabel: string;
  /** false → provisional / not yet validated against ground truth. */
  validated: boolean;
  /** e.g. "2.17–2.22 m", or null when no numeric range exists. */
  rangeText: string | null;
  note: string | null;
}

export interface IntelligenceEvidenceItem {
  label: string;
  value: string;
  kind: "measurement" | "comparison" | "context";
  /** 0..1 importance used to order evidence; strongest first. */
  weight: number;
}

/**
 * A technical or physical pattern commonly linked to a measured result. Associations are
 * NEVER presented as directly measured — `directlyMeasured` is always false and every
 * physical association carries a disclaimer.
 */
export interface IntelligenceAssociation {
  category: string;
  items: string[];
  muscleGroups?: string[];
  disclaimer: string;
  directlyMeasured: false;
}

export interface IntelligenceRecommendationReference {
  limiterId: string | null;
  type: string;
  title: string;
  focus: string;
  why: string;
  observe: string | null;
  /** Scientific honesty: what emphasising this does NOT prove. */
  doesNotProve: string;
}

export interface IntelligenceConfidence {
  measurement: number | null;
  reasoning: number | null;
  overall: number | null;
  label: ConfidenceLabel;
  explanation: string;
  /** Concrete reasons confidence is as high as it is. */
  raises: string[];
  /** Concrete reasons confidence is limited (counter-evidence at the conclusion level). */
  reduces: string[];
}

export interface IntelligenceConclusion {
  id: string;
  limiterId: string | null;
  classification: IntelligenceClassification;

  title: string;
  conciseSummary: string;
  detailedExplanation: string;

  /** The reasoning chain, kept as structured sections rather than one paragraph. */
  measured: IntelligenceEvidenceItem[];
  comparedWith: ComparisonBasis[];
  evidenceFor: IntelligenceEvidenceItem[];
  evidenceAgainst: IntelligenceEvidenceItem[];
  neutralContext: IntelligenceEvidenceItem[];
  interpretation: string;
  alternativeExplanations: string[];

  confidence: IntelligenceConfidence;

  technicalAssociations: IntelligenceAssociation[];
  physicalAssociations: IntelligenceAssociation[];

  recommendations: IntelligenceRecommendationReference[];

  assumptions: string[];
  limitations: string[];
  changeConditions: string[];
}

export interface SprintIntelligenceSummary {
  headline: string;
  primaryConclusionId: string | null;
  hasPrimaryConclusion: boolean;
  supportedConclusionCount: number;
  overallConfidence: number | null;
  overallConfidenceLabel: ConfidenceLabel;
  dataQualityLabel: ConfidenceLabel;
  zoneDistanceM: number | null;
  /** 0..100 — how complete the athlete profile is for interpretation. */
  athleteProfileCompletenessPct: number;
}

export interface IntelligenceDataQuality {
  label: ConfidenceLabel;
  calibrationConfirmed: boolean;
  spatialAvailable: boolean;
  validStepCount: number | null;
  measurementConfidence: "high" | "medium" | "low" | null;
  notes: string[];
}

export interface IntelligenceAssumption {
  id: string;
  text: string;
  /** Only assumptions that could change a conclusion are surfaced. */
  couldChangeConclusion: boolean;
}

export interface IntelligenceMissingInput {
  id: string;
  label: string;
  wouldImprove: string;
}

export interface IntelligenceChangeCondition {
  id: string;
  text: string;
}

export interface IntelligenceMethodologySummary {
  version: string;
  metricsUsed: string[];
  targetBasisSummary: string;
  rankingBasis: string;
  confidenceBasis: string;
  provisionalModels: string[];
  unavailableModels: string[];
}

export type SprintIntelligenceStatus =
  | "ok"
  | "no_reliable_conclusion"
  | "calibration_missing"
  | "insufficient_data"
  | "processing"
  | "failed";

export interface SprintIntelligenceReport {
  analysisId: string;
  sessionId: string;
  generatedAt: string;
  version: string;
  status: SprintIntelligenceStatus;

  summary: SprintIntelligenceSummary;

  primaryConclusion: IntelligenceConclusion | null;
  supportingConclusions: IntelligenceConclusion[];
  strengths: IntelligenceConclusion[];

  counterEvidence: IntelligenceEvidenceItem[];
  dataQuality: IntelligenceDataQuality;
  assumptions: IntelligenceAssumption[];
  missingInputs: IntelligenceMissingInput[];
  changeConditions: IntelligenceChangeCondition[];
  methodology: IntelligenceMethodologySummary;
}

/** Transport-safe metric snapshot the builder consumes (already computed upstream). */
export interface SprintIntelligenceMetrics {
  avgStepLengthM: number | null;
  peakStepLengthM: number | null;
  stepFrequencyHz: number | null;
  avgVelocityMps: number | null;
  peakVelocityMps: number | null;
}

export interface SprintIntelligenceAthlete {
  heightCm: number | null;
  legLengthCm: number | null;
  trochanterHeightM: number | null;
  weightKg: number | null;
  event: string | null;
}

/**
 * The single normalized input to `buildSprintIntelligence`. Everything is a plain value so
 * the builder stays pure and testable; `generatedAt` is injected for determinism.
 */
export interface SprintIntelligenceInput {
  analysisId: string;
  sessionId: string;
  generatedAt: string;
  /** The authoritative Limiting Factors output — the source of every ranked conclusion. */
  limitingFactors: LimitingFactorsResult;
  context: {
    analysisType: string | null;
    calibrationConfirmed: boolean;
    spatialAvailable: boolean;
    measurementConfidence: "high" | "medium" | "low" | null;
    zoneDistanceM: number | null;
    validStepCount: number | null;
    metrics: SprintIntelligenceMetrics;
    athlete: SprintIntelligenceAthlete | null;
    historicalBaselineAvailable: boolean;
    coachTargetAvailable: boolean;
    /**
     * Left–right symmetry read from the SAME measurement values the Limiting Factors engine
     * consumed (not re-measured here) — used only to surface a "balanced" performance strength
     * against the engine's own provisional symmetry band. Null when side data is unavailable.
     */
    symmetry: {
      stepLengthDiffPct: number | null;
      stepFrequencyDiffPct: number | null;
      minSideSamples: number;
    } | null;
  };
}
