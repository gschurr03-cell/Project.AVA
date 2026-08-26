/**
 * Phase R4C — cross-trial aggregation (Part R). A single trial cannot decide
 * which model is scientifically better (one athlete/run is noise); this
 * groups the per-trial outputs `scripts/validate-ground-truth-trial.mjs`
 * produces and reduces each group to the `AggregateModelStats` shape
 * `evaluateModelSelectionPolicy()` consumes. Pure — no I/O, no analysis math.
 */
import { summarizeErrors } from "@/lib/validation/groundTruthMetrics";
import type { ContactDetectionStats } from "@/lib/validation/groundTruthMatching";
import type { AggregateModelStats } from "@/lib/validation/modelSelectionPolicy";

export interface TrialSummaryForAggregation {
  trialId: string;
  athlete: string | null;
  fps: number | null;
  cameraPosition: string | null;
  zoneLengthMeters: number | null;
  travelDirection: string | null;
  /** Signed errors (estimate − truth), cm, for comparable step intervals only. */
  legacyStepLengthSignedErrorsCm: number[];
  canonicalStepLengthSignedErrorsCm: number[];
  /** LEGACY_2D has no native per-contact coordinate — null means "not applicable," not "zero error." */
  legacyPositionSignedErrorsCm: number[] | null;
  canonicalPositionSignedErrorsCm: number[];
  legacyContactStats: ContactDetectionStats;
  canonicalContactStats: ContactDetectionStats;
  /** Max |relative diff| observed this trial across Step Frequency / Average Velocity / zone time between the two models — should be ~0 by construction (R4B left these unchanged). */
  unrelatedMetricDriftPercent: number | null;
}

export type GroupKey = "athlete" | "fps" | "cameraPosition" | "zoneLengthMeters" | "travelDirection" | "all";

export function groupTrials(trials: TrialSummaryForAggregation[], groupKey: GroupKey): Map<string, TrialSummaryForAggregation[]> {
  const groups = new Map<string, TrialSummaryForAggregation[]>();
  for (const trial of trials) {
    const key = groupKey === "all" ? "all" : String(trial[groupKey] ?? "unknown");
    const bucket = groups.get(key) ?? [];
    bucket.push(trial);
    groups.set(key, bucket);
  }
  return groups;
}

export function aggregateGroup(trials: TrialSummaryForAggregation[]): AggregateModelStats {
  const legacyStepErrors = trials.flatMap((t) => t.legacyStepLengthSignedErrorsCm);
  const canonicalStepErrors = trials.flatMap((t) => t.canonicalStepLengthSignedErrorsCm);
  const legacyPositionErrors = trials.every((t) => t.legacyPositionSignedErrorsCm != null) ? trials.flatMap((t) => t.legacyPositionSignedErrorsCm as number[]) : null;
  const canonicalPositionErrors = trials.flatMap((t) => t.canonicalPositionSignedErrorsCm);

  const legacyContactTotals = sumContactStats(trials.map((t) => t.legacyContactStats));
  const canonicalContactTotals = sumContactStats(trials.map((t) => t.canonicalContactStats));

  const drifts = trials.map((t) => t.unrelatedMetricDriftPercent).filter((v): v is number => v != null);

  return {
    independentTrialCount: trials.length,
    distinctAthleteCount: new Set(trials.map((t) => t.athlete).filter((a): a is string => a != null)).size,
    fpsClassesCovered: Array.from(new Set(trials.map((t) => t.fps).filter((f): f is number => f != null))).sort((a, b) => a - b),
    legacyMedianAbsStepLengthErrorCm: summarizeErrors(legacyStepErrors).medianAbsError,
    canonicalMedianAbsStepLengthErrorCm: summarizeErrors(canonicalStepErrors).medianAbsError,
    legacyMedianAbsPositionErrorCm: legacyPositionErrors != null ? summarizeErrors(legacyPositionErrors).medianAbsError : null,
    canonicalMedianAbsPositionErrorCm: summarizeErrors(canonicalPositionErrors).medianAbsError,
    legacyContactDetectionF1: f1FromTotals(legacyContactTotals),
    canonicalContactDetectionF1: f1FromTotals(canonicalContactTotals),
    maxUnrelatedMetricDriftPercentObserved: drifts.length ? Math.max(...drifts) : null,
  };
}

function sumContactStats(stats: ContactDetectionStats[]): { tp: number; fp: number; fn: number } {
  return stats.reduce((acc, s) => ({ tp: acc.tp + s.truePositives, fp: acc.fp + s.falsePositives, fn: acc.fn + s.falseNegatives }), { tp: 0, fp: 0, fn: 0 });
}

function f1FromTotals(totals: { tp: number; fp: number; fn: number }): number | null {
  const precision = totals.tp + totals.fp > 0 ? totals.tp / (totals.tp + totals.fp) : null;
  const recall = totals.tp + totals.fn > 0 ? totals.tp / (totals.tp + totals.fn) : null;
  if (precision == null || recall == null || precision + recall === 0) return null;
  return (2 * precision * recall) / (precision + recall);
}
