/**
 * Performance Potential — CONFIGURATION (Phase 6). Model parameters only: what
 * fraction of the current→ceiling headroom is plausibly closable in the near vs long
 * term, how the individualized ceiling is derived, the confidence-factor weights, and
 * the scenario multipliers. No absolute performance number is hardcoded — everything
 * is a function of the athlete's current values, blueprint, and goal.
 */

export const POTENTIAL_CONFIG_VERSION = "ava-performance-potential-config-v1" as const;

/**
 * Fraction of the (current → individualized-ceiling) velocity headroom assumed
 * closable per horizon, as a [min,max] range → produces a projection RANGE, never a
 * single number. Long-term closes more of the headroom than near-term.
 */
export const CLOSABLE_FRACTION = {
  nearTerm: { min: 0.18, max: 0.35 },
  longTerm: { min: 0.55, max: 0.82 },
} as const;

/** Scenario headroom fractions (applied to the same current→ceiling headroom). */
export const SCENARIO_FRACTION: Record<"conservative" | "expected" | "optimistic", { min: number; max: number }> = {
  conservative: { min: 0.15, max: 0.3 },
  expected: { min: 0.4, max: 0.6 },
  optimistic: { min: 0.7, max: 0.9 },
};

/**
 * Ceiling model: the individualized ceiling AVERAGE velocity is derived by raising
 * the athlete's top-speed toward the blueprint's peak-velocity target while PRESERVING
 * their current average-to-peak ratio (their acceleration/transition profile). This
 * keeps the ceiling individual, not a generic elite time.
 */
export const CEILING = {
  /** Where in the blueprint peak-velocity target range the ceiling sits (0=min, 1=max). */
  blueprintPeakAnchor: 0.85,
  /** Hard sanity cap on how far the ceiling can exceed current velocity (safety). */
  maxHeadroomRatio: 1.15,
} as const;

/** Confidence-factor weights (sum ≈ 1). Longer projections get a lower distance factor. */
export const CONFIDENCE_WEIGHTS = {
  measurementQuality: 0.25,
  dataCompleteness: 0.2,
  athleteSimilarity: 0.15,
  projectionDistance: 0.25,
  historicalConsistency: 0.15,
} as const;

/** Projection-distance factor per horizon (near-term is closer → higher). */
export const DISTANCE_FACTOR = { current: 1, near_term: 0.85, long_term: 0.55 } as const;

/** Key metrics used to assess data completeness of the projection. */
export const KEY_METRICS = ["strideLength", "strideFrequency", "peakVelocity", "groundContactTime"] as const;
