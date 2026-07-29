/**
 * AVA stride-length aggregates (Day 82). Pure, standalone (no heavy deps) so the
 * measurement engine can use them and a sanity script can unit-test them.
 *
 * AVA TERMINOLOGY: "stride length" = the distance between consecutive OPPOSITE-foot
 * contacts (R→L, L→R) — NOT the textbook same-leg definition. The inputs here are
 * exactly those opposite-foot contact distances (`individualStepLengthsM` in the
 * measurement engine, which are contact-to-contact gaps between alternating feet).
 */

/**
 * Peak stride length = the athlete's best SUSTAINED stride expression: the highest
 * ROLLING average of consecutive valid opposite-foot strides (Day 85).
 *
 * The input is chronological, opposite-foot stride distances. We keep only valid
 * strides (>0), PRESERVING ORDER — we deliberately do NOT sort or cherry-pick the
 * biggest individual strides. We then take the highest rolling average over a window
 * of 4 consecutive strides, falling back to 3, then 2, then null:
 *  - ≥4 valid → best rolling average of 4 consecutive;
 *  - exactly 3 → best rolling average of 3 (the single window);
 *  - exactly 2 → best rolling average of 2 (the single window);
 *  - <2 valid → null.
 */
export function computePeakStrideLengthM(distances: number[]): number | null {
  const valid = distances.filter((d) => Number.isFinite(d) && d > 0);
  if (valid.length < 2) return null;
  const window = Math.min(4, valid.length);
  return bestRollingAverage(valid, window);
}

/** Highest average over any `window` consecutive values (order preserved). */
function bestRollingAverage(values: number[], window: number): number {
  let best = -Infinity;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) best = Math.max(best, sum / window);
  }
  return best;
}

/**
 * Stride retention = average ÷ peak, as a percent. How well the athlete holds their
 * best strides across the whole zone. Null unless both inputs exist and peak > 0.
 */
export function computeStrideRetentionPct(
  avgStrideM: number | null | undefined,
  peakStrideM: number | null | undefined,
): number | null {
  if (avgStrideM == null || peakStrideM == null || peakStrideM <= 0) return null;
  return (avgStrideM / peakStrideM) * 100;
}
