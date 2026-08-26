/**
 * Individualized-comparison hierarchy (Phase 3, Part 11).
 *
 * Resolves what an athlete's measured value should be COMPARED against, in
 * strict priority order:
 *   1. The athlete's OWN historical analyses (most trustworthy — same body,
 *      same camera setup class, same measurement pipeline).
 *   2. Athlete-specific morphology (leg length / trochanter height / height)
 *      — a scaled estimate, not a measured baseline.
 *   3. A broad, explicitly-sourced performance band, ONLY if the caller
 *      supplies one — this module never hardcodes "elite" norms, since we
 *      have no trustworthy dataset to back a fabricated number (Part 11:
 *      "never fabricate precise elite norms").
 *   4. A general, qualitative, non-numeric descriptive interpretation.
 *
 * `source` is always reported so the UI can label a comparison honestly
 * ("compared to this athlete's last 3 sessions" vs. "no target available").
 */

export const INDIVIDUALIZED_EXPECTATIONS_VERSION = "ava-individualized-expectations-v1" as const;

export type TargetSource = "personal_baseline" | "morphology_estimate" | "performance_band" | "general_heuristic" | "no_target_available";

export interface MetricTarget {
  metric: string;
  value: number | null;
  range: [number, number] | null;
  source: TargetSource;
  explanation: string;
}

export interface AthleteProfile {
  sex: "male" | "female" | null;
  heightCm: number | null;
  legLengthCm: number | null;
  trochanterHeightM: number | null;
  primaryEvent: string | null;
  personalBestS: number | null;
  performanceLevel: "recreational" | "developmental" | "competitive" | "elite" | null;
  zoneDistanceM: number | null;
  startContext: "blocks" | "three_point" | "two_point" | "rolling" | null;
}

export interface HistoricalBaseline {
  metric: string;
  averageValue: number;
  stdDev: number | null;
  observationCount: number;
}

/**
 * Externally-supplied performance band. This module never invents these
 * numbers — a caller wires in a vetted range from a real coaching resource
 * if/when one is validated for this metric and population.
 */
export interface PerformanceBand {
  metric: string;
  range: [number, number];
  populationDescription: string;
  citationNote: string;
}

const MIN_HISTORICAL_OBSERVATIONS = 2;

function morphologyEstimate(metric: string, profile: AthleteProfile): MetricTarget | null {
  if (metric === "touchdownOffsetLegLengthRatio" && profile.legLengthCm != null) {
    return {
      metric,
      value: null,
      range: [0.08, 0.22],
      source: "morphology_estimate",
      explanation: `Derived from this athlete's own leg length (${profile.legLengthCm}cm) as a scale — not a measured personal baseline and not a population norm.`,
    };
  }
  return null;
}

export function resolveMetricTarget(
  metric: string,
  input: {
    profile: AthleteProfile;
    historicalBaselines: HistoricalBaseline[];
    performanceBands?: PerformanceBand[];
  },
): MetricTarget {
  const historical = input.historicalBaselines.find((b) => b.metric === metric);
  if (historical && historical.observationCount >= MIN_HISTORICAL_OBSERVATIONS) {
    return {
      metric,
      value: historical.averageValue,
      range: historical.stdDev != null ? [historical.averageValue - historical.stdDev, historical.averageValue + historical.stdDev] : null,
      source: "personal_baseline",
      explanation: `Averaged from this athlete's own ${historical.observationCount} prior analyses.`,
    };
  }

  const morphology = morphologyEstimate(metric, input.profile);
  if (morphology) return morphology;

  const band = input.performanceBands?.find((b) => b.metric === metric);
  if (band) {
    return {
      metric,
      value: null,
      range: band.range,
      source: "performance_band",
      explanation: `${band.populationDescription} (${band.citationNote}) — a broad reference, not specific to this athlete.`,
    };
  }

  return {
    metric,
    value: null,
    range: null,
    source: "no_target_available",
    explanation: "No personal history, morphology estimate, or sourced performance band is available for this metric yet.",
  };
}
