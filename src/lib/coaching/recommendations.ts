/**
 * Deterministic, side-effect-free training recommendation engine. Turns a
 * session's key sprint metrics into a *ranked* set of actionable
 * recommendations: each carries a priority score and confidence, the metrics
 * that support it, and a concise "why this matters" rationale. Rules are
 * evaluated in a fixed order and the result is sorted by priority score, so the
 * same metrics always yield the same ranking. When nothing triggers, a single
 * low-scored "maintain progress" item is returned so callers always have a top
 * recommendation to show.
 *
 * Drills are stored as references (ids) into the sprint knowledge base rather
 * than as free-text names, so display copy lives in one place. Use
 * {@link getExercise} to resolve a drill id to its full definition.
 */

import { EXERCISES, type CoachingExercise } from "./knowledge/exercises";

export type RecommendationPriority = "high" | "medium" | "low";

export interface CoachingRecommendation {
  id: string;
  priority: RecommendationPriority;
  category: string;
  title: string;
  explanation: string;
  /** Exercise ids referencing the knowledge base (see EXERCISES / getExercise). */
  drills: string[];
  /** 0–100 ranking weight; higher = more urgent. Recommendations are sorted by this. */
  priorityScore: number;
  /** 0–100 confidence that this is the right emphasis given how far off-target the metric is. */
  confidence: number;
  /** The metric readings that drove this recommendation, pre-formatted for display. */
  supportingMetrics: Array<{ label: string; value: string }>;
  /** Concise, coach-facing "why this matters". */
  rationale: string;
}

export interface RecommendationMetrics {
  stepFrequency: number;
  groundContactTime: number;
  flightTime: number;
  strideLength: number;
}

/** Target thresholds a metric is compared against. */
const STEP_FREQUENCY_TARGET = 4.7;
const GROUND_CONTACT_TARGET = 90;
const FLIGHT_TIME_TARGET = 115;
const STRIDE_LENGTH_TARGET = 2.1;

/** Round and clamp a raw score into the 0–100 range. */
export function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

const formatHz = (value: number): string => `${value.toFixed(2)} Hz`;
const formatMs = (value: number): string => `${Math.round(value)} ms`;
const formatMeters = (value: number): string => `${value.toFixed(2)} m`;

export function buildRecommendations(metrics: RecommendationMetrics): CoachingRecommendation[] {
  const recommendations: CoachingRecommendation[] = [];

  if (metrics.stepFrequency < STEP_FREQUENCY_TARGET) {
    const deficit = STEP_FREQUENCY_TARGET - metrics.stepFrequency;
    recommendations.push({
      id: "step-frequency",
      priority: "high",
      category: "Technique",
      title: "Increase cadence",
      explanation:
        "Step frequency is below the 4.7 Hz target. Raise turnover so less time is spent between steps.",
      drills: ["sprint-dribbles", "wicket-runs", "a-skips"],
      priorityScore: clampScore(80 + deficit * 40),
      confidence: clampScore(80 + deficit * 33),
      supportingMetrics: [
        { label: "Step Frequency", value: formatHz(metrics.stepFrequency) },
        { label: "Target", value: `≥ ${formatHz(STEP_FREQUENCY_TARGET)}` },
      ],
      rationale:
        "Cadence is the quickest lever for sprint speed — raising turnover usually yields the fastest gains.",
    });
  }

  if (metrics.groundContactTime > GROUND_CONTACT_TARGET) {
    const excess = metrics.groundContactTime - GROUND_CONTACT_TARGET;
    recommendations.push({
      id: "ground-contact-time",
      priority: "high",
      category: "Power",
      title: "Reduce contact time",
      explanation:
        "Ground contact time is above 90 ms. Apply force more explosively to shorten each ground contact.",
      drills: ["pogo-hops", "low-hurdle-hops", "ankle-stiffness-series"],
      priorityScore: clampScore(80 + excess),
      confidence: clampScore(82 + excess),
      supportingMetrics: [
        { label: "Ground Contact", value: formatMs(metrics.groundContactTime) },
        { label: "Target", value: `≤ ${formatMs(GROUND_CONTACT_TARGET)}` },
      ],
      rationale:
        "Shorter ground contact applies force faster, directly supporting higher top-end speed.",
    });
  }

  if (metrics.flightTime < FLIGHT_TIME_TARGET) {
    const deficit = FLIGHT_TIME_TARGET - metrics.flightTime;
    recommendations.push({
      id: "flight-time",
      priority: "medium",
      category: "Elasticity",
      title: "Improve projection",
      explanation:
        "Flight time is below 115 ms. Develop elastic projection to stay airborne longer on each stride.",
      drills: ["fly-30s", "straight-leg-bounds", "wicket-runs"],
      priorityScore: clampScore(70 + deficit * 0.7),
      confidence: clampScore(70 + deficit * 0.5),
      supportingMetrics: [
        { label: "Flight Time", value: formatMs(metrics.flightTime) },
        { label: "Target", value: `≥ ${formatMs(FLIGHT_TIME_TARGET)}` },
      ],
      rationale:
        "More flight time lets each stride project further, supporting longer, faster strides.",
    });
  }

  if (metrics.strideLength < STRIDE_LENGTH_TARGET) {
    const deficit = STRIDE_LENGTH_TARGET - metrics.strideLength;
    recommendations.push({
      id: "stride-length",
      priority: "medium",
      category: "Force",
      title: "Increase stride length",
      explanation:
        "Stride length is below 2.1 m. Build force production to cover more ground on each stride.",
      drills: ["resisted-sled-sprints", "bounding", "hill-accelerations"],
      priorityScore: clampScore(70 + deficit * 40),
      confidence: clampScore(70 + deficit * 20),
      supportingMetrics: [
        { label: "Stride Length", value: formatMeters(metrics.strideLength) },
        { label: "Target", value: `≥ ${formatMeters(STRIDE_LENGTH_TARGET)}` },
      ],
      rationale:
        "Longer strides cover more ground per step; added force production raises stride length at speed.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "general",
      priority: "low",
      category: "General",
      title: "Maintain current progress",
      explanation:
        "Your key sprint metrics are within their target ranges. Keep building on your current program.",
      drills: [],
      priorityScore: 15,
      confidence: 30,
      supportingMetrics: [
        { label: "Step Frequency", value: formatHz(metrics.stepFrequency) },
        { label: "Ground Contact", value: formatMs(metrics.groundContactTime) },
        { label: "Flight Time", value: formatMs(metrics.flightTime) },
        { label: "Stride Length", value: formatMeters(metrics.strideLength) },
      ],
      rationale:
        "Every key metric is within its target range — keep your current emphasis and progress steadily.",
    });
  }

  // Rank most-urgent first. Stable sort keeps rule order for equal scores.
  return recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
}

/** Resolve a drill id to its full knowledge-base definition, if it exists. */
export function getExercise(id: string): CoachingExercise | undefined {
  return EXERCISES[id];
}
