/** AVA's immutable production reporting policy for time-derived performance. */
export const CONSERVATIVE_TIMING_POLICY_V1 = "CONSERVATIVE_TIMING_POLICY_V1" as const;

/**
 * Larger than binary floating-point noise at the hundredth boundary, but many
 * orders smaller than measurement precision. It prevents 1.9200000000000002
 * from being promoted to 1.93 while never hiding a real 1.9201 measurement.
 */
export const CONSERVATIVE_TIMING_EPSILON_SECONDS = 1e-12;

export interface ReportedTime {
  rawSeconds: number;
  reportedSeconds: number;
  displaySeconds: string;
  timingPolicyVersion: typeof CONSERVATIVE_TIMING_POLICY_V1;
}

export function reportTimeSeconds(rawSeconds: number): number {
  if (!Number.isFinite(rawSeconds) || rawSeconds < 0)
    throw new Error("Timed measurements must be finite and nonnegative.");
  return Math.ceil((rawSeconds - CONSERVATIVE_TIMING_EPSILON_SECONDS) * 100) / 100;
}

export function timedMetric(rawSeconds: number): ReportedTime {
  const reportedSeconds = reportTimeSeconds(rawSeconds);
  return {
    rawSeconds,
    reportedSeconds,
    displaySeconds: reportedSeconds.toFixed(2),
    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,
  };
}

/** Official velocity always divides raw distance by official reported time. */
export function velocityFromReportedTime(distanceM: number, rawTimeSeconds: number): number {
  const reportedTime = reportTimeSeconds(rawTimeSeconds);
  if (!Number.isFinite(distanceM) || distanceM < 0 || reportedTime <= 0)
    throw new Error("Velocity requires nonnegative distance and positive reported time.");
  return distanceM / reportedTime;
}

export function reportMilliseconds(rawMilliseconds: number): number {
  return reportTimeSeconds(rawMilliseconds / 1000) * 1000;
}

export function reportNullableMilliseconds(rawMilliseconds: number | null): number | null {
  return rawMilliseconds == null ? null : reportMilliseconds(rawMilliseconds);
}

export interface RawStrideWindow {
  startContactIndex: number;
  endContactIndex: number;
  distanceM: number;
  rawDurationS: number;
}

export function reportStrideWindows(windows: RawStrideWindow[]) {
  const reported = windows.map((window) => {
    const reportedDurationS = reportTimeSeconds(window.rawDurationS);
    return {
      ...window,
      reportedDurationS,
      rawVelocityMps: window.distanceM / window.rawDurationS,
      reportedVelocityMps: window.distanceM / reportedDurationS,
    };
  });
  return {
    windows: reported,
    rawTopVelocityMps: reported.length
      ? Math.max(...reported.map((window) => window.rawVelocityMps))
      : null,
    reportedTopVelocityMps: reported.length
      ? Math.max(...reported.map((window) => window.reportedVelocityMps))
      : null,
  };
}
