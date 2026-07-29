/**
 * FPS precision mode (Day 69) — classify each metric by how much its accuracy is
 * limited by the video frame rate, so the UI can present only what AVA can measure
 * to near its stated accuracy at the active FPS, and honestly downgrade the rest.
 *
 * The physics: at 60 fps one frame ≈ 16.7 ms. Ground contact is only ~80 ms, so a
 * single-frame error is ~20% — such temporal metrics can never be a high-confidence
 * headline number at 60 fps. Spatial/zone metrics (step length, zone distance,
 * velocity, cadence over the whole zone) are NOT frame-quantized the same way (they
 * come from calibrated positions over many frames), so they stay trustworthy.
 *
 * Pure & deterministic: no I/O.
 */

export type MetricTier = "primary" | "diagnostic" | "requiresHigherFps";

/**
 * FPS at/above which sub-frame contact/flight timing is trustworthy enough to be a
 * headline number. Below it, timing metrics are downgraded to "requires higher FPS".
 */
export const HIGH_PRECISION_TIMING_FPS = 120;

/** True when the active FPS is too low for high-precision temporal metrics. */
export function isPrecisionLimited(activeFps: number | null | undefined): boolean {
  return activeFps == null || activeFps < HIGH_PRECISION_TIMING_FPS;
}

/**
 * Metric keys whose accuracy is bounded by temporal frame quantization. Covers both
 * the worker `AnalysisMetrics` naming and the benchmark per-foot naming.
 */
export const TIMING_METRIC_KEYS: ReadonlySet<string> = new Set([
  "groundContactTimeMs",
  "flightTimeMs",
  "groundContactLeftMs",
  "groundContactRightMs",
  "flightLeftMs",
  "flightRightMs",
]);

/**
 * Per-side breakdown keys. The small left/right asymmetry they express is diagnostic
 * detail, not a headline number — at ≤60 fps the per-side spread is within the noise
 * floor of detection + frame quantization.
 */
export const PER_SIDE_METRIC_KEYS: ReadonlySet<string> = new Set([
  "leftStepLengthM",
  "rightStepLengthM",
  "leftStepFrequencyHz",
  "rightStepFrequencyHz",
  "leftContacts",
  "rightContacts",
]);

/**
 * Classify a metric for the active FPS:
 *  - `requiresHigherFps` — temporal metric that can't hit its accuracy target below
 *    {@link HIGH_PRECISION_TIMING_FPS} (promoted to `primary` at/above it);
 *  - `diagnostic` — per-side asymmetry, useful detail but never a headline number;
 *  - `primary` — trusted zone/spatial metric (step length, zone distance, velocity,
 *    combined cadence).
 */
export function classifyMetric(key: string, activeFps: number | null | undefined): MetricTier {
  if (TIMING_METRIC_KEYS.has(key)) {
    return isPrecisionLimited(activeFps) ? "requiresHigherFps" : "primary";
  }
  if (PER_SIDE_METRIC_KEYS.has(key)) return "diagnostic";
  return "primary";
}

/** UI copy explaining why timing metrics are downgraded. */
export const PRECISION_TIMING_MESSAGE =
  "Requires 120–240 fps video for high-precision timing. At this frame rate one frame is a large fraction of an ~80 ms ground contact, so contact/flight (and tiny left/right asymmetries) are shown as diagnostics, not trusted headline numbers.";

// ---------------------------------------------------------------------------
// Customer-facing metric trust (metric trust cleanup)
//
// A single, honest decision — per metric, for the active recording — used by the
// customer UI to decide whether to show a real value or a "coming soon"-style
// placeholder. It NEVER changes a metric's math; it only gates presentation so a
// number AVA can't yet stand behind is surfaced as an explicit placeholder instead
// of a misleading value or a fake 0.
// ---------------------------------------------------------------------------

/** Exact placeholder strings the customer UI shows instead of an untrusted value. */
export const NEEDS_HIGHER_FPS_MESSAGE = "Needs 120fps+";
export const NEEDS_CONFIDENCE_MESSAGE = "Needs higher confidence";
export const COMING_SOON_MESSAGE = "Coming soon";

/**
 * Minimum mean pose-tracking confidence (0..1) before a confidence-dependent metric
 * (e.g. precise joint angles), or a temporal metric at ≥120 fps, is trusted enough
 * to display. Below it the UI shows {@link NEEDS_CONFIDENCE_MESSAGE}.
 */
export const MIN_TRUSTED_POSE_CONFIDENCE = 0.6;

/**
 * Metric keys whose accuracy is bounded by temporal frame quantization — trustworthy
 * only at/above {@link HIGH_PRECISION_TIMING_FPS}. A superset of {@link TIMING_METRIC_KEYS}
 * that also names the contact/flight-DERIVED timing metrics AVA will add later
 * (ratio, stiffness, foot-strike / toe-off timing), so the gate already covers them.
 * Block/acceleration-specific timing is intentionally NOT here — it belongs to the
 * separate acceleration analysis, which this module never touches.
 */
export const FPS_LIMITED_METRIC_KEYS: ReadonlySet<string> = new Set([
  "groundContactTimeMs",
  "flightTimeMs",
  "groundContactLeftMs",
  "groundContactRightMs",
  "flightLeftMs",
  "flightRightMs",
  "contactFlightRatio",
  "legStiffnessKNm",
  "verticalStiffness",
  "footStrikeTimingMs",
  "toeOffTimingMs",
]);

/**
 * Metric keys limited by pose-tracking confidence rather than frame rate — precise
 * joint angles. These can display at any FPS, but only when tracking is confident.
 */
export const CONFIDENCE_DEPENDENT_METRIC_KEYS: ReadonlySet<string> = new Set([
  "peakKneeFlexionDeg",
  "avgTrunkLeanDeg",
]);

/**
 * Keys where a value of exactly 0 means "not measured", never a real reading — so the
 * UI must render a placeholder, never a fake 0. (A real sprint has non-zero top speed,
 * stride length, cadence, contact/flight, and knee flexion.)
 */
export const ZERO_MEANS_UNAVAILABLE_KEYS: ReadonlySet<string> = new Set([
  "topSpeedMps",
  "avgStrideLengthM",
  "strideFrequencyHz",
  "groundContactTimeMs",
  "flightTimeMs",
  "peakKneeFlexionDeg",
]);

/** Trust decision for one metric on one recording. */
export type MetricTrust =
  | { state: "available" }
  | { state: "needsHigherFps"; message: string }
  | { state: "needsConfidence"; message: string }
  | { state: "comingSoon"; message: string };

/** True when a metric value can't be shown as a real reading (null/NaN, or a 0 that
 *  means "not measured" for that key). */
export function isMetricValueUnavailable(key: string, value: number | null | undefined): boolean {
  return (
    value == null ||
    Number.isNaN(value) ||
    (value === 0 && ZERO_MEANS_UNAVAILABLE_KEYS.has(key))
  );
}

/**
 * Decide whether a metric may be shown as a real value on this recording, or must be
 * replaced with an honest placeholder — the single rule behind the "Coming Soon /
 * Experimental Metrics" bin:
 *
 *  - Frame-rate-limited timing metrics (contact/flight and their derivatives) are
 *    `needsHigherFps` below 120 fps (rule 1). At/above 120 fps they may appear only
 *    if tracking confidence passes and a value exists (rule 5); otherwise
 *    `needsConfidence` / `comingSoon`.
 *  - Confidence-dependent metrics (precise joint angles) are `needsConfidence` when
 *    tracking confidence is below {@link MIN_TRUSTED_POSE_CONFIDENCE}, regardless of FPS.
 *  - Every other (spatial/zone) metric stays trusted at any FPS when a real value
 *    exists (rule 2); a missing/zero value is `comingSoon`, never a fake 0 (rule 6).
 *
 * `poseConfidence` is optional: when unknown (null) it is NOT treated as low, so a
 * recording without a confidence signal still shows spatial metrics.
 */
export function metricTrust(params: {
  key: string;
  activeFps: number | null | undefined;
  poseConfidence?: number | null;
  value?: number | null;
}): MetricTrust {
  const { key, activeFps, poseConfidence = null, value = null } = params;
  const unavailable = isMetricValueUnavailable(key, value);
  const lowConfidence = poseConfidence != null && poseConfidence < MIN_TRUSTED_POSE_CONFIDENCE;

  if (FPS_LIMITED_METRIC_KEYS.has(key)) {
    if (isPrecisionLimited(activeFps)) {
      return { state: "needsHigherFps", message: NEEDS_HIGHER_FPS_MESSAGE };
    }
    if (lowConfidence) return { state: "needsConfidence", message: NEEDS_CONFIDENCE_MESSAGE };
    if (unavailable) return { state: "comingSoon", message: COMING_SOON_MESSAGE };
    return { state: "available" };
  }

  if (CONFIDENCE_DEPENDENT_METRIC_KEYS.has(key)) {
    if (lowConfidence) return { state: "needsConfidence", message: NEEDS_CONFIDENCE_MESSAGE };
    if (unavailable) return { state: "comingSoon", message: COMING_SOON_MESSAGE };
    return { state: "available" };
  }

  if (unavailable) return { state: "comingSoon", message: COMING_SOON_MESSAGE };
  return { state: "available" };
}

/** Panel copy for the "Coming Soon / Experimental Metrics" bin (rule 4). */
export const EXPERIMENTAL_BIN_DESCRIPTION =
  "These require higher frame-rate video or stronger tracking confidence before AVA treats them as trusted.";
