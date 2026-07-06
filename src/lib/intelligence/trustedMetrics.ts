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
 * Pure & deterministic: no I/O, input read-only.
 */

import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import { computeStrideRetentionPct } from "@/lib/benchmark/strideMetrics";

export type TrustedConfidence = "high" | "medium" | "low";

/**
 * The canonical, user-facing performance values. `null` until calibrated.
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
  /** Measured zone time (s). */
  zoneTimeS: number | null;
  /** Confidence in the stride-length figure (the weakest trusted input). */
  stepLengthConfidence: TrustedConfidence;
}

/**
 * Build the trusted metrics object from the measurement engine. Returns `null`
 * when the run isn't calibrated (no timing zone) — the trusted set requires a
 * real-world scale, so callers show an "awaiting calibration" state instead of
 * inventing numbers.
 *
 * The step-length selection here is the ONE place that choice is made, so the
 * Trusted Sprint Metrics card and the diagnosis can never disagree on it.
 */
export function buildTrustedMetrics(
  measurements: SprintMeasurements | null,
): TrustedMetrics | null {
  if (!measurements || !measurements.calibrated) return null;
  const m = measurements;

  // Trusted zone AVERAGE stride length: individual mean when reliable, else the zone
  // average (distance ÷ steps). This is the ONE place that choice is made.
  const avgStrideLengthM =
    m.stepLengthConfidence === "high" && m.avgIndividualStepLengthM != null
      ? m.avgIndividualStepLengthM
      : (m.avgZoneStepLengthM ?? m.avgIndividualStepLengthM);

  const peakStrideLengthM = m.peakStrideLengthM;
  // The DIAGNOSIS value prefers peak; UI can still show the average separately.
  const strideLengthM = peakStrideLengthM ?? avgStrideLengthM;
  const strideRetentionPct = computeStrideRetentionPct(avgStrideLengthM, peakStrideLengthM);

  return {
    topSpeedMps: m.maxVelocityMps,
    avgVelocityMps: m.zoneVelocityMps,
    avgStrideLengthM,
    peakStrideLengthM,
    strideRetentionPct,
    strideLengthM,
    frequencyHz: m.combinedStepFrequencyHz,
    zoneDistanceM: m.zone?.distanceM ?? null,
    zoneTimeS: m.zoneTimeS,
    stepLengthConfidence: m.stepLengthConfidence,
  };
}
