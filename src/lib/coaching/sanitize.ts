/**
 * Some coaching metrics require camera calibration and arrive as `0` until that
 * work lands (e.g. stride length in metres). A `0` here means "not yet
 * available", not a genuinely poor value — evaluating it would surface a fake
 * "poor" metric and unfairly drag the technique score down. We drop those
 * calibration-dependent zeros before evaluation so they're excluded from
 * evaluation, insights, and scoring entirely.
 *
 * Only the metrics listed here are affected; every other metric — including
 * legitimate zeros where `0` is a real, meaningful value — is left untouched.
 */
export const CALIBRATION_DEPENDENT_METRICS = ["strideLength"] as const;

export function sanitizeCoachingMetrics(
  metrics: Record<string, number | null | undefined>,
): Record<string, number | null | undefined> {
  const sanitized: Record<string, number | null | undefined> = { ...metrics };
  for (const id of CALIBRATION_DEPENDENT_METRICS) {
    if (sanitized[id] === 0) delete sanitized[id];
  }
  return sanitized;
}
