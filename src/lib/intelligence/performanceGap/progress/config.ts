/**
 * Progress Intelligence — CONFIGURATION (Phase 10).
 *
 * Thresholds only: what counts as meaningful change vs noise, how many analyses define a
 * plateau, forecast horizon + uncertainty growth, and anomaly sensitivity. No athlete
 * target is hardcoded — everything is expressed relative to the athlete's own series.
 * Metric metadata (label/unit/direction) is pulled from the existing registries so that
 * future metrics participate automatically.
 */

import { metricDefinition } from "../config";
import { METRIC_TARGET_CONFIG } from "../blueprint/config";

export const PROGRESS_CONFIG_VERSION = "ava-progress-intelligence-config-v1" as const;

export const TREND = {
  /** Minimum points to compute a trend at all. */
  minPointsForTrend: 2,
  /** Minimum consecutive analyses to consider a plateau. */
  minPointsForPlateau: 4,
  /** |percent change| across the window below this = not meaningful (noise). */
  noisePct: 1.5,
  /** Per-analysis relative change beyond this (%) = rapid improvement/regression. */
  rapidPctPerAnalysis: 3,
  /** Fit quality below this with a non-trivial slope = inconsistent. */
  inconsistentFit: 0.35,
  /** Max per-analysis change (%) still considered a plateau. */
  plateauMaxPctPerAnalysis: 0.5,
} as const;

/** Goal/projection comparisons use a finer noise band than raw metric trends. */
export const GOAL_NOISE_PCT = 0.3;

export const FORECAST = {
  horizonAnalyses: 8,
  /** Uncertainty half-width growth per forecast step (fraction of base noise). */
  uncertaintyGrowthPerStep: 0.35,
  /** Floor for base noise as a fraction of the last value (avoids zero-width bands). */
  minNoiseFraction: 0.01,
} as const;

export const ANOMALY = {
  /** Deviation beyond k × MAD from the local median flags an anomaly. */
  madK: 3,
  minPoints: 4,
  /** Severity bands as multiples of MAD. */
  notableK: 4,
  largeK: 6,
} as const;

export const ATTRIBUTION = {
  /** Ignore metric changes smaller than this (%) when attributing. */
  minImprovementPct: 0.2,
  /** Share reserved for unattributed / other factors (honest residual). */
  otherFraction: 0.1,
  /** Metrics whose improvement plausibly drives performance (weighted by sensitivity). */
  driverMetrics: ["peakVelocity", "averageVelocity", "strideLength", "strideFrequency", "groundContactTime", "flightTime", "acceleration", "reactiveStrength"],
} as const;

/** Assumed days between analyses when dates collide (keeps per-week slopes finite). */
export const DEFAULT_DAYS_BETWEEN = 7;

export interface MetricMeta {
  label: string;
  unit: string;
  lowerIsBetter: boolean;
}

/**
 * Metric metadata resolved from the existing registries, with a graceful fallback so a
 * brand-new metric id still trends (default: higher is better). Derived (non-registry)
 * metrics can be declared here.
 */
const DERIVED_META: Record<string, MetricMeta> = {
  blueprintCompletion: { label: "Blueprint Completion", unit: "%", lowerIsBetter: false },
  developmentScore: { label: "Development Score", unit: "%", lowerIsBetter: false },
  performancePotential: { label: "Performance Potential", unit: "s", lowerIsBetter: true },
  finishTime: { label: "Finish Time", unit: "s", lowerIsBetter: true },
  symmetry: { label: "Left/Right Symmetry", unit: "%", lowerIsBetter: true },
  reactiveStrength: { label: "Reactive Strength", unit: "index", lowerIsBetter: false },
};

export function metricMeta(metricId: string): MetricMeta {
  const derived = DERIVED_META[metricId];
  if (derived) return derived;
  const def = metricDefinition(metricId);
  if (def) return { label: def.label, unit: def.unit, lowerIsBetter: def.lowerIsBetter };
  const bp = METRIC_TARGET_CONFIG.find((m) => m.metricId === metricId);
  if (bp) return { label: bp.label, unit: bp.unit, lowerIsBetter: bp.lowerIsBetter };
  return {
    label: metricId.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim(),
    unit: "",
    lowerIsBetter: false,
  };
}
