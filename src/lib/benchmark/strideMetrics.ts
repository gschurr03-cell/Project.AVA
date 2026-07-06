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
 * Peak stride length = the average of the best 4 valid opposite-foot contact
 * distances. Rules:
 *  - sort valid distances descending, take the top 4, average them;
 *  - with only 2–3 valid distances, average whatever is available;
 *  - with fewer than 2 valid distances, return null.
 */
export function computePeakStrideLengthM(distances: number[]): number | null {
  const valid = distances.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => b - a);
  if (valid.length < 2) return null;
  const top = valid.slice(0, 4);
  return top.reduce((sum, v) => sum + v, 0) / top.length;
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
