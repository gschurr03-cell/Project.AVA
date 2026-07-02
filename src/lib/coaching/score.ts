import type {
  MetricEvaluation,
  MetricStatus,
  TechniqueScoreBand,
  TechniqueScoreBreakdownItem,
  TechniqueScoreResult,
} from "./types";

/**
 * Technique score model. The score is derived from the per-metric
 * {@link MetricEvaluation}s — not passed in — so it always reflects the real
 * analysis. Each scored metric contributes `weight × statusMultiplier` points;
 * weights are redistributed across whichever metrics are actually present so the
 * maximum is always 100.
 */

/** Base weight each metric contributes before redistribution. */
const BASE_WEIGHTS: Record<string, number> = {
  groundContactTime: 25,
  strideLength: 25,
  stepFrequency: 20,
  flightTime: 15,
};

/** How much of a metric's weight is earned at each status. */
const STATUS_MULTIPLIER: Record<MetricStatus, number> = {
  elite: 1.0,
  good: 0.85,
  watch: 0.6,
  poor: 0.3,
};

/** Score → qualitative label. Ordered high-to-low; first match wins. */
export const TECHNIQUE_SCORE_BANDS: TechniqueScoreBand[] = [
  { label: "Excellent", min: 90 },
  { label: "Strong", min: 80 },
  { label: "Developing", min: 70 },
  { label: "Needs Work", min: 0 },
];

export function techniqueLabelForScore(score: number): string {
  return TECHNIQUE_SCORE_BANDS.find((band) => score >= band.min)?.label ?? "Needs Work";
}

const round = (n: number): number => Math.round(n);

/**
 * Compute the technique score from metric evaluations. Only metrics with a base
 * weight and a present evaluation are scored; their weights are redistributed to
 * total 100. Returns the whole-number score, its label, and a per-metric
 * breakdown.
 */
export function calculateTechniqueScore(evaluations: MetricEvaluation[]): TechniqueScoreResult {
  const scored = evaluations.filter((evaluation) => BASE_WEIGHTS[evaluation.id] != null);
  const totalBaseWeight = scored.reduce((sum, evaluation) => sum + BASE_WEIGHTS[evaluation.id], 0);

  if (scored.length === 0 || totalBaseWeight === 0) {
    return { score: 0, label: techniqueLabelForScore(0), breakdown: [] };
  }

  let rawScore = 0;
  const breakdown: TechniqueScoreBreakdownItem[] = scored.map((evaluation) => {
    // Redistribute active weights so the available metrics total 100.
    const weight = (BASE_WEIGHTS[evaluation.id] / totalBaseWeight) * 100;
    const multiplier = STATUS_MULTIPLIER[evaluation.status];
    const points = weight * multiplier;
    rawScore += points;

    return {
      metricId: evaluation.id,
      label: evaluation.label,
      status: evaluation.status,
      weight: round(weight),
      points: round(points),
      maxPoints: round(weight),
      explanation: `${evaluation.label} rated ${evaluation.status} (×${multiplier}) → ${round(points)} of ${round(weight)} pts.`,
    };
  });

  const score = round(rawScore);
  return { score, label: techniqueLabelForScore(score), breakdown };
}
