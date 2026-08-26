/**
 * Trusted Sprint Metrics — THE single source of truth for all customer-facing
 * output (Day 79). Every user-facing surface (the Trusted Sprint Metrics card,
 * the limiting-factor diagnosis, Performance Potential) must read from this one
 * object, so a coach never sees the same quantity reported two different ways.
 *
 * It is derived ONLY from `computeSprintMeasurements` — the calibrated, zone-based
 * measurement engine — and deliberately excludes the calibration engine's separate
 * anthropometric estimates (leg-length stride, whole-clip velocity), which are
 * setup diagnostics, not performance output, and historically conflicted.
 *
 * Day 98: per-metric availability is now delegated to `evaluateMetricEvidence`
 * (`@/lib/intelligence/metricEvidence`) — each of the five core metrics stands
 * on its own evidence instead of sharing one whole-recording gate. This file's
 * shape and every existing consumer's call site are unchanged; only how each
 * field's `null`-vs-value decision is made improved.
 *
 * Pure & deterministic: no I/O, input read-only.
 */

import type { SprintMeasurements, ZoneCoverage } from "@/lib/benchmark/measurements";
import { computeStrideRetentionPct } from "@/lib/benchmark/strideMetrics";
import type { RecordingAssessment } from "@/lib/video/recordingMode";
import {
  evaluateMetricEvidence,
  type MetricEvidence,
  type MetricEvidenceOptions,
} from "@/lib/intelligence/metricEvidence";

export type TrustedConfidence = "high" | "medium" | "low";

/**
 * The canonical, user-facing performance values. `null` until calibrated, or
 * per-field null when that specific metric's own evidence contract
 * (`@/lib/intelligence/metricEvidence`) doesn't clear its bar — never a
 * shared, all-or-nothing gate.
 *
 * AVA "stride length" = opposite-foot (R→L / L→R) contact distance. The DIAGNOSIS
 * value (`strideLengthM`) prefers Peak Stride Length when available so trochanter
 * optimization and the unlock simulator judge the athlete's best expressed strides;
 * the UI can still show the zone average alongside it.
 */
export interface TrustedMetrics {
  /** Peak single-stride velocity (m/s). */
  topSpeedMps: number | null;
  /** Zone distance ÷ zone time (m/s). */
  avgVelocityMps: number | null;
  /** Zone average stride length (m) — the trusted headline average. */
  avgStrideLengthM: number | null;
  /** Peak Stride Length (m) — average of the best 4 opposite-foot strides. */
  peakStrideLengthM: number | null;
  /** avg ÷ peak × 100 — how well the athlete holds their best strides. */
  strideRetentionPct: number | null;
  /** The DIAGNOSIS stride length = peak when available, else average. */
  strideLengthM: number | null;
  /** Combined step frequency (Hz) — a.k.a. cadence / step / stride frequency. */
  frequencyHz: number | null;
  /** Gate-to-gate distance (m). */
  zoneDistanceM: number | null;
  /** Measured zone time (s) — null unless BOTH crossings are verified (see
   *  `timingAvailabilityReason`); never a clip-duration/pose-track/contact-span
   *  fallback. */
  zoneTimeS: number | null;
  /** Structured reason `zoneTimeS` is null, e.g. "crossing_extrapolated_not_verified".
   *  Null when zoneTimeS is available, or when the run isn't calibrated at all. */
  timingAvailabilityReason: string | null;
  /** Confidence in the stride-length figure (the weakest trusted input). */
  stepLengthConfidence: TrustedConfidence;
  /** Day 98 — the full independent evidence contract behind every field above
   *  (status, reason, internal confidence category, provenance), keyed by
   *  metric. Surfaces per-metric "why unavailable" without a second gate. */
  evidence: MetricEvidence[];
  /** Day 99 (Part 8) — how much of the calibrated zone the eligible steps
   *  actually span; null when the run isn't calibrated. Lets the UI disclose
   *  a partial-zone measurement instead of presenting it as full-zone. */
  zoneCoverage: ZoneCoverage | null;
}

/**
 * Build the trusted metrics object from the measurement engine. Returns `null`
 * when the run isn't calibrated (no timing zone) — the trusted set requires a
 * real-world scale, so callers show an "awaiting calibration" state instead of
 * inventing numbers.
 *
 * The step-length selection here is the ONE place that choice is made, so the
 * Trusted Sprint Metrics card and the diagnosis can never disagree on it.
 *
 * Day 98: availability is delegated to `evaluateMetricEvidence`, which checks
 * each metric's OWN evidence rather than one shared `spatialAvailable` flag —
 * see that module's header for the panning-safety boundary this preserves.
 * `options.calibrationCameraType` must come from the coach-confirmed
 * `calibration_gates.cameraType`; omit it (as every pre-existing call site
 * still does) to keep the fully conservative original behavior unchanged.
 */
export function buildTrustedMetrics(
  measurements: SprintMeasurements | null,
  recordingAssessment?: RecordingAssessment,
  options?: MetricEvidenceOptions,
): TrustedMetrics | null {
  if (!measurements || !measurements.calibrated) return null;
  const evidence = evaluateMetricEvidence(measurements, recordingAssessment, options);
  const byMetric = new Map(evidence.map((e) => [e.metric, e]));
  const get = (key: string): number | null => byMetric.get(key as never)?.value ?? null;

  const avgStrideLengthM = get("avgStrideLengthM");
  const peakStrideLengthM = get("peakStrideLengthM");
  // The DIAGNOSIS value prefers peak; UI can still show the average separately.
  const strideLengthM = peakStrideLengthM ?? avgStrideLengthM;
  const strideRetentionPct = computeStrideRetentionPct(avgStrideLengthM, peakStrideLengthM);
  const zoneTimeEvidence = byMetric.get("zoneTimeS");

  return {
    topSpeedMps: get("topSpeedMps"),
    avgVelocityMps: get("avgVelocityMps"),
    avgStrideLengthM,
    peakStrideLengthM,
    strideRetentionPct,
    strideLengthM,
    frequencyHz: get("frequencyHz"),
    zoneDistanceM: measurements.zone?.distanceM ?? null,
    zoneTimeS: zoneTimeEvidence?.value ?? null,
    timingAvailabilityReason: zoneTimeEvidence?.reasonCode ?? null,
    stepLengthConfidence: byMetric.get("avgStrideLengthM")?.confidenceCategory ?? measurements.stepLengthConfidence,
    evidence,
    zoneCoverage: measurements.diagnostics?.zoneCoverage ?? null,
  };
}
