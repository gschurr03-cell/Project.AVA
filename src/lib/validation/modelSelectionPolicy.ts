/**
 * Phase R4C — pre-registered model-selection rule (Part S). Written and
 * fixed BEFORE any real ground-truth trial has been collected, precisely so
 * that it cannot be shaped by which model happens to look better once real
 * data exists. `evaluateModelSelectionPolicy()` is pure and only reads
 * aggregate statistics a caller supplies (see `groundTruthMetrics.ts` for
 * how those are computed) — it does not run analysis, fetch data, or decide
 * anything about the current four protected benchmarks, which do not count
 * toward `minIndependentTrials` below by design (Part S explicitly forbids
 * overfitting the rule to them).
 *
 * If real data does not yet meet `minIndependentTrials`/FPS/athlete
 * coverage, the policy returns INSUFFICIENT_DATA rather than a verdict —
 * it never approves a default change on a preview or a handful of trials.
 */

export const MODEL_SELECTION_POLICY_VERSION = "ava-model-selection-policy-r4c-v1";

export interface ModelSelectionPolicy {
  version: string;
  /** Independent real-world trials required before a verdict can be reached at all. */
  minIndependentTrials: number;
  minDistinctAthletes: number;
  /** All three FPS classes must appear at least once. */
  requiredFpsClasses: number[];
  /** CANONICAL_LONGITUDINAL's median absolute step-length error must be at least this much lower, relatively, than LEGACY_2D's. */
  minRelativeStepLengthImprovementPercent: number;
  /** CANONICAL_LONGITUDINAL may not increase median absolute contact-position error by more than this many cm vs LEGACY_2D (only meaningful where LEGACY_2D has a comparable coordinate; see report). */
  maxPositionErrorRegressionCm: number;
  /** Contact detection F1 must be IDENTICAL between models (they share contact detection by construction — R4B did not touch it); any difference halts the decision for investigation rather than being treated as a tradeoff. */
  requireIdenticalContactDetectionF1: boolean;
  /** Step Frequency / Average Velocity / zone timing must not differ between models by more than this relative amount (they are designed to be unchanged; any larger difference means something outside scope broke). */
  maxUnrelatedMetricDriftPercent: number;
}

export const MODEL_SELECTION_POLICY: ModelSelectionPolicy = {
  version: MODEL_SELECTION_POLICY_VERSION,
  minIndependentTrials: 6,
  minDistinctAthletes: 2,
  requiredFpsClasses: [60, 120, 240],
  minRelativeStepLengthImprovementPercent: 15,
  maxPositionErrorRegressionCm: 1.0,
  requireIdenticalContactDetectionF1: true,
  maxUnrelatedMetricDriftPercent: 0.5,
};

export type ModelSelectionVerdict = "INSUFFICIENT_DATA" | "CANONICAL_LONGITUDINAL_MEETS_CRITERIA" | "CANONICAL_LONGITUDINAL_DOES_NOT_MEET_CRITERIA" | "HALTED_UNRELATED_METRIC_DRIFT";

export interface AggregateModelStats {
  independentTrialCount: number;
  distinctAthleteCount: number;
  fpsClassesCovered: number[];
  legacyMedianAbsStepLengthErrorCm: number | null;
  canonicalMedianAbsStepLengthErrorCm: number | null;
  legacyMedianAbsPositionErrorCm: number | null;
  canonicalMedianAbsPositionErrorCm: number | null;
  legacyContactDetectionF1: number | null;
  canonicalContactDetectionF1: number | null;
  /** Max observed relative drift, across trials, in any of Step Frequency / Average Velocity / zone timing. */
  maxUnrelatedMetricDriftPercentObserved: number | null;
}

export interface ModelSelectionResult {
  verdict: ModelSelectionVerdict;
  reasons: string[];
  policy: ModelSelectionPolicy;
}

export function evaluateModelSelectionPolicy(stats: AggregateModelStats, policy: ModelSelectionPolicy = MODEL_SELECTION_POLICY): ModelSelectionResult {
  const reasons: string[] = [];

  if (
    stats.independentTrialCount < policy.minIndependentTrials ||
    stats.distinctAthleteCount < policy.minDistinctAthletes ||
    !policy.requiredFpsClasses.every((fps) => stats.fpsClassesCovered.includes(fps))
  ) {
    reasons.push(
      `coverage below minimum: trials=${stats.independentTrialCount}/${policy.minIndependentTrials}, athletes=${stats.distinctAthleteCount}/${policy.minDistinctAthletes}, fpsClasses=[${stats.fpsClassesCovered.join(",")}]/[${policy.requiredFpsClasses.join(",")}]`,
    );
    return { verdict: "INSUFFICIENT_DATA", reasons, policy };
  }

  if (policy.requireIdenticalContactDetectionF1 && stats.legacyContactDetectionF1 !== stats.canonicalContactDetectionF1) {
    reasons.push(`contact-detection F1 differs between models (legacy=${stats.legacyContactDetectionF1}, canonical=${stats.canonicalContactDetectionF1}) — contact detection is shared and should be identical; investigate before deciding`);
    return { verdict: "HALTED_UNRELATED_METRIC_DRIFT", reasons, policy };
  }

  if (stats.maxUnrelatedMetricDriftPercentObserved != null && stats.maxUnrelatedMetricDriftPercentObserved > policy.maxUnrelatedMetricDriftPercent) {
    reasons.push(`Step Frequency/Average Velocity/zone-timing drift ${stats.maxUnrelatedMetricDriftPercentObserved}% exceeds ${policy.maxUnrelatedMetricDriftPercent}% — these are designed to be model-invariant; investigate before deciding`);
    return { verdict: "HALTED_UNRELATED_METRIC_DRIFT", reasons, policy };
  }

  if (stats.legacyMedianAbsStepLengthErrorCm == null || stats.canonicalMedianAbsStepLengthErrorCm == null) {
    reasons.push("step-length ground-truth error not computable for one or both models");
    return { verdict: "INSUFFICIENT_DATA", reasons, policy };
  }

  const relativeImprovement =
    stats.legacyMedianAbsStepLengthErrorCm > 0
      ? ((stats.legacyMedianAbsStepLengthErrorCm - stats.canonicalMedianAbsStepLengthErrorCm) / stats.legacyMedianAbsStepLengthErrorCm) * 100
      : null;
  reasons.push(`step-length median |error|: legacy=${stats.legacyMedianAbsStepLengthErrorCm}cm, canonical=${stats.canonicalMedianAbsStepLengthErrorCm}cm, relativeImprovement=${relativeImprovement}%`);

  const positionRegression =
    stats.legacyMedianAbsPositionErrorCm != null && stats.canonicalMedianAbsPositionErrorCm != null
      ? stats.canonicalMedianAbsPositionErrorCm - stats.legacyMedianAbsPositionErrorCm
      : null;
  if (positionRegression != null) reasons.push(`position median |error| regression (canonical − legacy) = ${positionRegression}cm`);

  const meetsStepLength = relativeImprovement != null && relativeImprovement >= policy.minRelativeStepLengthImprovementPercent;
  const meetsPosition = positionRegression == null || positionRegression <= policy.maxPositionErrorRegressionCm;

  if (meetsStepLength && meetsPosition) {
    return { verdict: "CANONICAL_LONGITUDINAL_MEETS_CRITERIA", reasons, policy };
  }
  if (!meetsStepLength) reasons.push(`relative step-length improvement below required ${policy.minRelativeStepLengthImprovementPercent}%`);
  if (!meetsPosition) reasons.push(`position-error regression exceeds allowed ${policy.maxPositionErrorRegressionCm}cm`);
  return { verdict: "CANONICAL_LONGITUDINAL_DOES_NOT_MEET_CRITERIA", reasons, policy };
}
