/**
 * Performance Simulation Engine — CONFIGURATION (Phase 9).
 *
 * Model parameters only: physiologically plausible constraint bounds, event top-speed
 * transfer factors, propagation damping, and confidence weights. No athlete-specific
 * target is hardcoded — constraints are plausibility rails, and anthropometric limits
 * are derived from the athlete's own measurements at runtime. Future metrics that are
 * not listed here still simulate via the default relative bound, so the registry stays
 * open (a new metric plugs in without touching engine logic).
 */

export const SIMULATION_CONFIG_VERSION = "ava-performance-simulation-config-v1" as const;

/** A physiologically plausible absolute range for a simulatable metric. */
export interface ConstraintBound {
  metricId: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** When set, the max is additionally capped by the athlete's anthropometrics. */
  anthropometric?: "strideLength";
  note: string;
}

/**
 * Constraint rails — deliberately wide plausibility bounds (not goal targets). They
 * exist to stop impossible scenarios (frequency rising forever, ground contact →0),
 * not to constrain a specific athlete's goal.
 */
export const CONSTRAINT_BOUNDS: ConstraintBound[] = [
  { metricId: "strideLength", label: "Stride Length", unit: "m", min: 1.4, max: 2.9, anthropometric: "strideLength", note: "capped by leg length — stride length cannot exceed anthropometric reach" },
  { metricId: "strideFrequency", label: "Stride Frequency", unit: "Hz", min: 3.4, max: 5.6, note: "turnover cannot rise indefinitely" },
  { metricId: "peakVelocity", label: "Peak Velocity", unit: "m/s", min: 6, max: 12.8, note: "near the human ceiling for peak sprint velocity" },
  { metricId: "averageVelocity", label: "Average Velocity", unit: "m/s", min: 5, max: 12, note: "average velocity is bounded by peak velocity" },
  { metricId: "groundContactTime", label: "Ground Contact Time", unit: "s", min: 0.07, max: 0.22, note: "ground contact cannot approach impossible (near-zero) values" },
  { metricId: "flightTime", label: "Flight Time", unit: "s", min: 0.08, max: 0.2, note: "flight time is bounded by realistic projection" },
  { metricId: "acceleration", label: "Acceleration Quality", unit: "m/s²", min: 3, max: 10, note: "early-acceleration capacity has a physiological ceiling" },
  { metricId: "transitionEfficiency", label: "Transition Efficiency", unit: "index", min: 0.5, max: 1.1, note: "an index bounded near 1.0" },
  { metricId: "maxVelocityMaintenance", label: "Maximum Velocity Maintenance", unit: "index", min: 0.5, max: 1.05, note: "cannot exceed perfect maintenance" },
  { metricId: "reactiveStrength", label: "Reactive Strength", unit: "index", min: 1.0, max: 3.8, note: "reactive strength index has an elite ceiling" },
  { metricId: "symmetry", label: "Left/Right Symmetry", unit: "%", min: 0, max: 20, note: "symmetry difference cannot be negative" },
  { metricId: "brakingDistance", label: "Braking Distance", unit: "m", min: 0, max: 0.5, note: "braking distance cannot be negative" },
  { metricId: "projection", label: "Projection", unit: "index", min: 0.3, max: 1.05, note: "projection is a bounded index" },
];

export function constraintBound(metricId: string): ConstraintBound | undefined {
  return CONSTRAINT_BOUNDS.find((b) => b.metricId === metricId);
}

/** When a metric has no explicit bound (future metrics), allow ±this fraction. */
export const DEFAULT_RELATIVE_BOUND = 0.25;

/** Anthropometric stride-length cap = trochanter height × this ratio. */
export const STRIDE_LENGTH_ANTHRO_RATIO = 2.6;

/**
 * How much a top-speed change transfers to each event's time. 100 m is the most
 * top-speed-dependent; 60 m is more acceleration-limited; 200 m adds speed endurance.
 * These are transparent scenario-exploration coefficients, not a prediction model.
 */
export const EVENT_TRANSFER: Record<string, number> = {
  "60m": 0.72,
  "100m": 0.9,
  "200m": 0.8,
};

/** Rough time ratios to estimate a missing event baseline from the 100 m time. */
export const EVENT_TIME_RATIO: Record<string, number> = {
  "60m": 0.62,
  "100m": 1,
  "200m": 2.02,
};

export const EVENTS = ["60m", "100m", "200m"] as const;

/** Propagation controls: damping, and the maximum plausible propagated change. */
export const PROPAGATION = {
  /** Additional attenuation per hop beyond the first. */
  damping: 0.85,
  /** Cap on any single propagated relative change (keeps scenarios plausible). */
  maxRelChange: 0.15,
  /** Clamp on the derived top-speed ratio (physiological plausibility). */
  speedRatioRange: { min: 0.8, max: 1.25 },
} as const;

/** Weights for the scenario confidence factors (sum ≈ 1). */
export const SIM_CONFIDENCE_WEIGHTS = {
  measurementQuality: 0.2,
  evidenceStrength: 0.15,
  projectionDistance: 0.2,
  athleteSimilarity: 0.12,
  dependencyConfidence: 0.18,
  researchSupport: 0.08,
  historicalConsistency: 0.07,
} as const;

/** Adjustment magnitude (summed |relative change|) that halves the distance factor. */
export const PROJECTION_DISTANCE_SCALE = 0.3;
