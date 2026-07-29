/**
 * Performance Gap Engine — shared data models (Part A).
 *
 * These models are the UI-INDEPENDENT contract that every future AVA coaching
 * feature (Path To Goal, What-If Simulator, weekly tracking, coach reports,
 * season planning) will consume. Nothing here renders anything; nothing here is
 * a sprint-metric TARGET. Targets are always DERIVED from the athlete's own
 * current values + goal + a configurable model (see `config.ts`).
 *
 * Scientific-honesty rule baked into the types: every conclusion carries an
 * {@link EvidenceCategory} and, when estimated/inferred, a confidence score.
 * AVA never diagnoses — associative nodes are labelled "commonly associated with".
 */

/** How AVA knows a value. Never fabricate certainty. */
export type EvidenceCategory = "measured" | "estimated" | "inferred" | "unknown";

/** A confidence envelope attached to every non-measured conclusion. */
export interface Confidence {
  category: EvidenceCategory;
  /** 0..1 for estimated/inferred; null for measured (certain) or unknown. */
  score: number | null;
  /** Short, non-diagnostic rationale ("derived from v = SL × F"). */
  rationale?: string;
}

/** A single metric reading with provenance. */
export interface MetricValue {
  metricId: string;
  value: number | null;
  unit: string;
  confidence: Confidence;
  /** Where this value came from, e.g. "ava_analysis" | "athlete_pb" | "model". */
  source: string;
}

/** The goal, expressed as a race target + the velocity it implies. */
export interface PerformanceTarget {
  distanceM: number;
  currentTimeS: number | null;
  goalTimeS: number | null;
  currentAvgVelocityMps: number | null;
  requiredAvgVelocityMps: number | null;
  /** required ÷ current average velocity (≥ 1 when the goal is faster). */
  velocityRatio: number | null;
  confidence: Confidence;
}

/** What a metric would likely need to become to reach the goal (Engine 2). */
export interface RequiredMetric {
  metricId: string;
  label: string;
  unit: string;
  currentValue: number | null;
  requiredValue: number | null;
  /** The model that produced the requirement (for swappability + audit). */
  model: string;
  confidence: Confidence;
}

export interface GoalRequirement {
  target: PerformanceTarget;
  requiredMetrics: RequiredMetric[];
  modelVersion: string;
}

/** Estimated share of the total improvement a metric could provide (Engine 1/3). */
export interface GapContribution {
  /** 0..1 fraction of the overall performance improvement, estimated. */
  fraction: number | null;
  estimatedTimeGainS: number | null;
  confidence: Confidence;
}

/** A measured-vs-required gap for one metric (Engine 1). */
export interface PerformanceGap {
  metricId: string;
  label: string;
  unit: string;
  currentValue: number | null;
  targetValue: number | null;
  absoluteGap: number | null;
  percentGap: number | null;
  /** Configurable base importance weight (0..1) for this metric. */
  importance: number;
  confidence: Confidence;
  contribution: GapContribution;
  /** True when the gap direction is "needs to reduce" (e.g. ground contact). */
  lowerIsBetter: boolean;
}

export type ExpectedImprovement = "largest" | "large" | "moderate" | "small";

/** A ranked limiter, ordered by ESTIMATED IMPACT — never by raw gap (Engine 3). */
export interface PriorityLimiter {
  rank: number;
  metricId: string;
  label: string;
  /** 0..100 estimated share of achievable improvement. */
  contributionPct: number | null;
  confidence: Confidence;
  reason: string;
  evidence: string[];
  associatedMetrics: string[];
  estimatedTimeGainS: number | null;
  expectedImprovement: ExpectedImprovement;
}

/** One node in an expandable reasoning tree (Engine 4). Associative, never diagnostic. */
export interface PerformanceNode {
  id: string;
  label: string;
  category: EvidenceCategory;
  confidence: Confidence;
  supportingMetrics: string[];
  associatedRecommendations: string[];
  /** "commonly associated with …" — the non-diagnostic framing. */
  association?: string;
  children: PerformanceNode[];
}

export interface PerformanceTree {
  rootMetricId: string;
  root: PerformanceNode;
}

/** An estimated effect of one intervention on one metric (Engine 5). */
export interface MetricEffect {
  metricId: string;
  estimatedDelta: number;
  unit: string;
  direction: "increase" | "decrease";
}

/** Estimated impact of a recommendation — always ranged, never a guarantee (Engine 5). */
export interface RecommendationImpact {
  recommendationId: string;
  label: string;
  estimatedEffects: MetricEffect[];
  estimatedRaceTimeGainS: { min: number; max: number } | null;
  confidence: Confidence;
  evidenceSource: string;
  reasoning: string;
}

/** The complete, serializable athlete performance model — the subsystem's output. */
export interface AthletePerformanceModel {
  modelVersion: string;
  generatedAt: string;
  athleteId: string | null;
  target: PerformanceTarget;
  goalRequirement: GoalRequirement;
  gaps: PerformanceGap[];
  priorities: PriorityLimiter[];
  trees: PerformanceTree[];
  recommendationImpacts: RecommendationImpact[];
  provenance: {
    engineVersions: Record<string, string>;
    configVersion: string;
  };
}

/** Convenience constructors keep confidence handling consistent across engines. */
export const measured = (rationale?: string): Confidence => ({ category: "measured", score: null, rationale });
export const unknown = (rationale?: string): Confidence => ({ category: "unknown", score: null, rationale });
export const estimated = (score: number, rationale?: string): Confidence => ({
  category: "estimated",
  score: clamp01(score),
  rationale,
});
export const inferred = (score: number, rationale?: string): Confidence => ({
  category: "inferred",
  score: clamp01(score),
  rationale,
});

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Combine confidences multiplicatively and take the WEAKEST evidence category —
 * the deterministic confidence-propagation rule used across engines. A chain is
 * never more certain than its least-certain link.
 */
const CATEGORY_RANK: Record<EvidenceCategory, number> = {
  measured: 3,
  estimated: 2,
  inferred: 1,
  unknown: 0,
};
export function propagateConfidence(parts: Confidence[], rationale?: string): Confidence {
  if (parts.length === 0) return unknown(rationale);
  let weakest: EvidenceCategory = "measured";
  let product = 1;
  let sawScore = false;
  for (const p of parts) {
    if (CATEGORY_RANK[p.category] < CATEGORY_RANK[weakest]) weakest = p.category;
    if (p.score != null) {
      product *= p.score;
      sawScore = true;
    }
  }
  if (weakest === "measured") return measured(rationale);
  if (weakest === "unknown") return unknown(rationale);
  return { category: weakest, score: sawScore ? clamp01(product) : null, rationale };
}
