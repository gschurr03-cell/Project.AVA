/**
 * Acceleration Summary Card (Phase 2, Part 8).
 *
 * A concise, glanceable synthesis of everything else in this module —
 * understandable in under 30 seconds. Never computes anything new from pose
 * data; it only selects and labels values already produced by
 * `computeAccelerationAnalysis`, the limiting-factor engine, and the
 * recommendation engine.
 */

import type { AccelerationLimiter } from "./limitingFactors";
import type { LimiterRecommendation } from "../limitingFactors/types";
import type { ProgressionAnalysis } from "./progression";

export type AccelerationRating = "strong" | "developing" | "needs_focus" | "insufficient_data";

export interface AccelerationSummaryCard {
  rating: AccelerationRating;
  ratingExplanation: string;
  biggestStrength: string;
  biggestLimiter: string | null;
  peakVelocityMps: number | null;
  peakAccelerationMps2: number | null;
  mostEfficientPhase: string | null;
  primaryRecommendation: string | null;
}

function rate(limiters: AccelerationLimiter[]): { rating: AccelerationRating; explanation: string } {
  if (limiters.length === 0) {
    return { rating: "insufficient_data", explanation: "Not enough calibrated data to rate this run." };
  }
  const highCount = limiters.filter((l) => l.impact.level === "high" || l.impact.level === "very_high").length;
  if (highCount >= 2) return { rating: "needs_focus", explanation: `${highCount} high-impact limiters were identified.` };
  if (highCount === 1) return { rating: "developing", explanation: "One high-impact limiter is capping this run." };
  if (limiters.length >= 1) return { rating: "developing", explanation: "A few moderate-impact patterns were found." };
  return { rating: "strong", explanation: "No high-impact limiters were identified in this run." };
}

function findStrength(limiters: AccelerationLimiter[], progression: ProgressionAnalysis | null, peakAccelerationMps2: number | null): string {
  const flaggedTypes = new Set(limiters.map((l) => l.type));
  if (peakAccelerationMps2 != null && peakAccelerationMps2 >= 7 && !flaggedTypes.has("acceleration_slow_velocity_gain")) {
    return `Strong peak acceleration (${peakAccelerationMps2.toFixed(2)} m/s²).`;
  }
  if (progression?.smoothness.smooth) {
    return "Smooth, consistent acceleration curve with no real drops or spikes.";
  }
  if (!flaggedTypes.has("acceleration_step_length_asymmetry") && !flaggedTypes.has("acceleration_step_time_asymmetry")) {
    return "Well-balanced left/right mechanics.";
  }
  if (progression?.stepProgression.stepFrequencyTrend === "increasing") {
    return "Step frequency develops well through the zone.";
  }
  if (progression?.stepProgression.stepLengthTrend === "increasing") {
    return "Step length develops well through the zone.";
  }
  return "No standout strength was clearly identified from this clip.";
}

export function buildAccelerationSummary(input: {
  limiters: AccelerationLimiter[];
  recommendations: LimiterRecommendation[];
  progression: ProgressionAnalysis | null;
  peakVelocityMps: number | null;
}): AccelerationSummaryCard {
  const { rating, explanation } = rate(input.limiters);
  const peakAccelerationMps2 = input.progression?.peakAcceleration?.value ?? null;
  const mostEfficient = input.progression?.stepProgression.mostEfficientStep ?? null;

  return {
    rating,
    ratingExplanation: explanation,
    biggestStrength: findStrength(input.limiters, input.progression, peakAccelerationMps2),
    biggestLimiter: input.limiters[0]?.title ?? null,
    peakVelocityMps: input.peakVelocityMps,
    peakAccelerationMps2,
    mostEfficientPhase: mostEfficient ? `Step ${mostEfficient.stepNumber} (${mostEfficient.distanceM.toFixed(1)} m, +${mostEfficient.velocityGainMps.toFixed(2)} m/s)` : null,
    primaryRecommendation: input.recommendations[0]?.title ?? null,
  };
}
