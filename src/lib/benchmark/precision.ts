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
