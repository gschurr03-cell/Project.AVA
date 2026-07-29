/**
 * Left/Right Performance Analysis (Part B) — pure + deterministic.
 *
 * Reports per-side values, the difference, a target-difference band, an estimated
 * performance impact, confidence, and associated technical patterns + muscle groups.
 * It explicitly does NOT treat perfect symmetry as always optimal — small
 * differences are classified as normal variation, and only larger ones as limiters
 * or review-worthy. Nothing here diagnoses; a large asymmetry is flagged for
 * professional review, never called an injury.
 */

import { type Confidence, inferred, measured, unknown } from "../models";
import { metricAssociations } from "./presentationConfig";

export const LEFT_RIGHT_ANALYSIS_VERSION = "left-right-v1" as const;

export type AsymmetryClass =
  | "normal_variation"
  | "moderate_asymmetry"
  | "performance_limiter"
  | "review_recommended";

/** Configurable classification thresholds (percent difference of the mean). */
export const ASYMMETRY_THRESHOLDS = {
  normalMaxPct: 3, // ≤ 3% is normal variation — symmetry need not be perfect
  moderateMaxPct: 6,
  limiterMaxPct: 10, // > 10% → review recommended (not a diagnosis)
} as const;

export interface LeftRightAnalysis {
  metricId: string;
  label: string;
  unit: string;
  left: number | null;
  right: number | null;
  /** Absolute |left − right|. */
  difference: number | null;
  differencePct: number | null;
  /** The acceptable difference band (≤ normal threshold) — not necessarily zero. */
  targetDifferencePct: number;
  classification: AsymmetryClass;
  /** Estimated performance impact of the imbalance (0..1 of this metric's potential). */
  performanceImpact: number | null;
  confidence: Confidence;
  associatedTechnicalPatterns: string[];
  associatedMuscleGroups: string[];
  note: string;
}

const CLASS_NOTE: Record<AsymmetryClass, string> = {
  normal_variation: "Within normal variation — perfect symmetry is not required.",
  moderate_asymmetry: "Moderate asymmetry — commonly associated with side-specific technical or strength differences.",
  performance_limiter: "Large enough to be a likely performance limiter — the weaker side may cap output.",
  review_recommended: "Large asymmetry — professional review is recommended. This is not a diagnosis.",
};

export function classifyAsymmetry(differencePct: number): AsymmetryClass {
  if (differencePct <= ASYMMETRY_THRESHOLDS.normalMaxPct) return "normal_variation";
  if (differencePct <= ASYMMETRY_THRESHOLDS.moderateMaxPct) return "moderate_asymmetry";
  if (differencePct <= ASYMMETRY_THRESHOLDS.limiterMaxPct) return "performance_limiter";
  return "review_recommended";
}

export function analyzeLeftRight(input: {
  metricId: string;
  label: string;
  unit: string;
  left: number | null | undefined;
  right: number | null | undefined;
}): LeftRightAnalysis {
  const left = num(input.left);
  const right = num(input.right);
  const assoc = metricAssociations(input.metricId);

  if (left == null || right == null) {
    return {
      metricId: input.metricId,
      label: input.label,
      unit: input.unit,
      left,
      right,
      difference: null,
      differencePct: null,
      targetDifferencePct: ASYMMETRY_THRESHOLDS.normalMaxPct,
      classification: "normal_variation",
      performanceImpact: null,
      confidence: unknown("one or both sides not measured"),
      associatedTechnicalPatterns: assoc.technicalPatterns,
      associatedMuscleGroups: assoc.muscleGroups,
      note: "Not enough side-specific data to assess.",
    };
  }

  const mean = (left + right) / 2;
  const difference = Math.abs(left - right);
  const differencePct = mean !== 0 ? round((difference / Math.abs(mean)) * 100) : 0;
  const classification = classifyAsymmetry(differencePct);

  // Estimated performance impact: a metric is capped by its weaker side; impact grows
  // beyond the normal band and saturates. Only ever an estimate.
  const overNormal = Math.max(0, differencePct - ASYMMETRY_THRESHOLDS.normalMaxPct);
  const performanceImpact = round(Math.min(1, overNormal / 20));

  const confidence: Confidence =
    classification === "normal_variation"
      ? measured("side values measured; within normal band")
      : inferred(0.5, "asymmetry impact is estimated from the percent difference");

  return {
    metricId: input.metricId,
    label: input.label,
    unit: input.unit,
    left,
    right,
    difference: round(difference),
    differencePct,
    targetDifferencePct: ASYMMETRY_THRESHOLDS.normalMaxPct,
    classification,
    performanceImpact: classification === "normal_variation" ? 0 : performanceImpact,
    confidence,
    associatedTechnicalPatterns: assoc.technicalPatterns,
    associatedMuscleGroups: assoc.muscleGroups,
    note: CLASS_NOTE[classification],
  };
}

/**
 * Build the full left/right panel for the pairs AVA supports today. Future pairs
 * (force application, braking distance, touchdown position, …) plug in by adding a
 * descriptor here — no logic change.
 */
export const LEFT_RIGHT_PAIRS: { metricId: string; label: string; unit: string; leftKey: string; rightKey: string }[] = [
  { metricId: "strideLength", label: "Stride Length", unit: "m", leftKey: "strideLengthLeft", rightKey: "strideLengthRight" },
  { metricId: "strideFrequency", label: "Stride Frequency", unit: "Hz", leftKey: "strideFrequencyLeft", rightKey: "strideFrequencyRight" },
  { metricId: "groundContactTime", label: "Ground Contact Time", unit: "s", leftKey: "groundContactTimeLeft", rightKey: "groundContactTimeRight" },
  { metricId: "flightTime", label: "Flight Time", unit: "s", leftKey: "flightTimeLeft", rightKey: "flightTimeRight" },
];

export function buildLeftRightPanel(metrics: Record<string, number | null | undefined>): LeftRightAnalysis[] {
  return LEFT_RIGHT_PAIRS.map((p) =>
    analyzeLeftRight({ metricId: p.metricId, label: p.label, unit: p.unit, left: metrics[p.leftKey], right: metrics[p.rightKey] }),
  );
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
