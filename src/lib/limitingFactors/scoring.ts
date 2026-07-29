import type { ConfidenceLabel, LimiterImpact } from "./types";

/** Clamp to [0,1]. */
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Base reliability of the measured values from the coarse engine confidence. */
export function measurementConfidenceBase(level: "high" | "medium" | "low" | null): number {
  switch (level) {
    case "high":
      return 0.9;
    case "medium":
      return 0.65;
    case "low":
      return 0.4;
    default:
      return 0.3;
  }
}

/**
 * Overall confidence is CONSERVATIVE: it never exceeds the weaker of measurement and
 * reasoning confidence, and is pulled slightly lower when the two disagree (an interpretation
 * is only as trustworthy as its weakest supporting pillar). Documented so it is not a naive
 * average.
 */
export function overallConfidence(measurement: number | null, reasoning: number | null): number | null {
  if (measurement == null && reasoning == null) return null;
  if (measurement == null) return reasoning;
  if (reasoning == null) return measurement;
  const weakest = Math.min(measurement, reasoning);
  const spread = Math.abs(measurement - reasoning);
  return clamp01(weakest - spread * 0.1);
}

export function confidenceLabel(score: number | null): ConfidenceLabel {
  if (score == null) return "insufficient";
  if (score >= 0.85) return "very_high";
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "moderate";
  if (score >= 0.3) return "low";
  return "insufficient";
}

export function impactLevel(score: number): LimiterImpact {
  if (score >= 0.8) return "very_high";
  if (score >= 0.6) return "high";
  if (score >= 0.4) return "moderate";
  if (score >= 0.2) return "low";
  return "negligible";
}

export const CONFIDENCE_LABEL_TEXT: Record<ConfidenceLabel, string> = {
  very_high: "Very High",
  high: "High",
  moderate: "Moderate",
  low: "Low",
  insufficient: "Insufficient",
};

export const IMPACT_LABEL_TEXT: Record<LimiterImpact, string> = {
  very_high: "Very High",
  high: "High",
  moderate: "Moderate",
  low: "Low",
  negligible: "Negligible",
};

/** As a percentage string for display, or a dash when unknown. */
export const pct = (score: number | null): string => (score == null ? "—" : `${Math.round(score * 100)}%`);
