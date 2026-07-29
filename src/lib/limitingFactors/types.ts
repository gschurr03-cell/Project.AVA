/**
 * Limiting Factors Intelligence — domain types.
 *
 * A "limiter" is a ranked, evidence-backed, confidence-weighted hypothesis about what is
 * most likely constraining a sprint performance. The model deliberately keeps MEASUREMENT,
 * COMPARISON (targets), INTERPRETATION, CONFIDENCE, EVIDENCE, ASSOCIATION, and
 * RECOMMENDATION as separate concerns so the UI can be honest about what AVA knows vs.
 * infers. Nothing here performs a diagnosis; sprint footage cannot confirm muscular cause.
 */

export type LimiterType =
  | "step_length_below_expectation"
  | "step_length_above_expectation"
  | "step_frequency_below_expectation"
  | "step_frequency_above_expectation"
  | "step_length_asymmetry"
  | "step_frequency_asymmetry"
  | "velocity_limitation"
  | "peak_velocity_limitation"
  | "peak_vs_average_gap";

export type LimiterImpact = "very_high" | "high" | "moderate" | "low" | "negligible";

export type ConfidenceLabel = "very_high" | "high" | "moderate" | "low" | "insufficient";

/** How a comparison range was derived — these are NOT interchangeable. */
export type TargetType =
  | "individualized" // a validated per-athlete model
  | "research_reference" // a published population reference range
  | "historical_baseline" // this athlete's own prior sessions
  | "coach_defined" // a coach-entered target
  | "unavailable"; // no legitimate comparison exists yet

export type LimiterStatus =
  | "detected"
  | "not_detected"
  | "insufficient_data"
  | "model_unavailable";

export type Direction = "above" | "below" | "left_higher" | "right_higher" | null;

export interface LimiterMeasuredValue {
  label: string;
  value: number | null;
  unit: string;
  /** Optional per-side / sample context shown beside the value. */
  detail?: string;
}

export interface LimiterTarget {
  type: TargetType;
  minimum?: number | null;
  maximum?: number | null;
  unit?: string | null;
  sourceLabel?: string | null;
  explanation?: string | null;
}

export interface LimiterEvidenceItem {
  label: string;
  value: string;
  /** Whether this line is a direct measurement or a derived comparison. */
  kind: "measurement" | "comparison" | "context";
}

export interface PhysicalAssociation {
  category: string;
  muscleGroups?: string[];
  disclaimer: string;
}

export interface LimiterRecommendation {
  type:
    | "technical_focus"
    | "drill"
    | "strength_emphasis"
    | "plyometric_emphasis"
    | "resisted_sprint"
    | "hill_sprint"
    | "wicket"
    | "rhythm"
    | "assessment"
    | "testing";
  title: string;
  focus: string;
  why: string;
  observe?: string;
  caution?: string;
}

export interface Confidence {
  measurement: number | null; // 0..1 — reliability of the underlying measured values
  reasoning: number | null; // 0..1 — how strongly the data supports the interpretation
  overall: number | null; // 0..1 — conservative aggregate (never above weakest major input)
  label: ConfidenceLabel;
  explanation: string;
}

export interface Limiter {
  id: string;
  type: LimiterType;
  status: LimiterStatus;
  rank: number;
  title: string;
  summary: string;

  impact: {
    level: LimiterImpact;
    score: number; // 0..1 normalized, for deterministic sorting
    explanation: string;
  };

  confidence: Confidence;

  measuredValues: LimiterMeasuredValue[];
  target: LimiterTarget;
  deviation: {
    absolute?: number | null;
    percentage?: number | null;
    direction?: Direction;
  };

  evidence: LimiterEvidenceItem[];
  reasoning: string[];
  possibleTechnicalAssociations: string[];
  possiblePhysicalAssociations: PhysicalAssociation[];
  recommendations: LimiterRecommendation[];
  dataQualityWarnings: string[];
}

/** The single normalized input the engine consumes — mapped from the authoritative
 *  measurement + trusted-metric + athlete records by the page (never re-measured here). */
export interface LimitingFactorsInput {
  sessionId: string;
  sessionDate: string | null;
  zoneDistanceM: number | null;
  analysisType: string | null;
  calibrationConfirmed: boolean;
  /** Spatial (metre-scale) metrics are trustworthy for this recording. */
  spatialAvailable: boolean;
  measurementConfidence: "high" | "medium" | "low" | null;

  athlete: {
    heightCm: number | null;
    legLengthCm: number | null;
    trochanterHeightM: number | null;
    weightKg: number | null;
  } | null;

  metrics: {
    avgStepLengthM: number | null;
    peakStepLengthM: number | null;
    stepFrequencyHz: number | null;
    avgVelocityMps: number | null;
    peakVelocityMps: number | null;
    validStepCount: number | null;

    leftStepLengthM: number | null;
    rightStepLengthM: number | null;
    leftStepSampleCount: number;
    rightStepSampleCount: number;

    leftStepFrequencyHz: number | null;
    rightStepFrequencyHz: number | null;
  };
}

export interface LimitingFactorsResult {
  status: "ok" | "processing" | "failed" | "calibration_missing" | "insufficient_data";
  limiters: Limiter[];
  /** Concise primary-constraint sentence generated from the ranked limiters (never hardcoded). */
  primaryConstraint: string | null;
  meaningfulCount: number;
  overallDataQuality: ConfidenceLabel;
  zoneDistanceM: number | null;
  sessionDate: string | null;
  /** Notes about which expectation models are unavailable (scientific-honesty surface). */
  unavailableModels: string[];
}
