/**
 * Benchmark validation (Day 62) — compare AVA's computed sprint metrics against a
 * stored reference ("ground truth", e.g. VueMotion) and report percent error.
 *
 * This layer is deliberately GENERIC and data-driven. A benchmark is just a row
 * in the `benchmarks` table carrying a `reference_metrics` map keyed by the
 * canonical metric keys below. Adding a new benchmark video (Flying 30,
 * Acceleration, Curve, …) is a DB insert — no code change. The only thing code
 * owns is the shared metric *vocabulary* (labels + units) and how each key is
 * read off AVA's computed measurements.
 *
 * Pure & deterministic: no I/O.
 */

import { z } from "zod";

import type { SprintMeasurements } from "./measurements";

/** Canonical metric vocabulary: key → how to label + unit it. Display order. */
export const BENCHMARK_METRICS: { key: string; label: string; unit: string }[] = [
  { key: "activeFps", label: "FPS", unit: "fps" },
  { key: "zoneTimeS", label: "Zone time (20 m)", unit: "s" },
  { key: "avgVelocityMps", label: "Average velocity", unit: "m/s" },
  { key: "maxVelocityMps", label: "Max velocity", unit: "m/s" },
  { key: "avgStepLengthM", label: "Average step length", unit: "m" },
  { key: "leftStepLengthM", label: "Left step length", unit: "m" },
  { key: "rightStepLengthM", label: "Right step length", unit: "m" },
  { key: "combinedStepFrequencyHz", label: "Combined step frequency", unit: "steps/s" },
  { key: "leftStepFrequencyHz", label: "Left step frequency", unit: "steps/s" },
  { key: "rightStepFrequencyHz", label: "Right step frequency", unit: "steps/s" },
  { key: "groundContactLeftMs", label: "Ground contact (L)", unit: "ms" },
  { key: "groundContactRightMs", label: "Ground contact (R)", unit: "ms" },
  { key: "flightLeftMs", label: "Flight time (L)", unit: "ms" },
  { key: "flightRightMs", label: "Flight time (R)", unit: "ms" },
  { key: "totalContacts", label: "Total contacts", unit: "" },
  { key: "leftContacts", label: "Left contacts", unit: "" },
  { key: "rightContacts", label: "Right contacts", unit: "" },
];

/** reference_metrics is an open map of canonical key → measured value. */
export const referenceMetricsSchema = z.record(z.string(), z.number());
export type ReferenceMetrics = z.infer<typeof referenceMetricsSchema>;

/** A benchmark reference row (loaded from the `benchmarks` table). */
export interface Benchmark {
  id: string;
  name: string;
  source: string | null;
  kind: string | null;
  distanceM: number | null;
  referenceMetrics: ReferenceMetrics;
  notes: string | null;
}

/** Worker-derived metrics AVA can also validate (per-side is not split, so shared). */
export interface AvaBiomechMetrics {
  groundContactTimeMs?: number | null;
  flightTimeMs?: number | null;
}

export type ComparisonStatus = "ok" | "warn" | "off" | "missing" | "info";

export interface BenchmarkComparisonRow {
  key: string;
  label: string;
  unit: string;
  /** AVA's computed value, or null when AVA couldn't compute it. */
  avaValue: number | null;
  /** The benchmark reference value, or null when the benchmark didn't measure it. */
  benchmarkValue: number | null;
  absError: number | null;
  percentError: number | null;
  status: ComparisonStatus;
}

const OK_PCT = 10;
const WARN_PCT = 25;

/**
 * Accuracy targets (Day 65) — the maximum acceptable percent error for AVA's
 * headline metrics vs the benchmark reference. Temporal metrics (frequency) are
 * held to a tight 5%; spatial metrics that depend on calibration/camera
 * compensation get more slack. `avgStepLengthM` uses AVA's TRUSTED zone estimate
 * (known distance ÷ valid steps), not the camera-comp-limited individual gaps.
 */
export const ACCURACY_TARGETS: { key: string; label: string; unit: string; maxErrorPct: number }[] = [
  { key: "combinedStepFrequencyHz", label: "Combined step frequency", unit: "steps/s", maxErrorPct: 5 },
  { key: "zoneTimeS", label: "Zone time (20 m)", unit: "s", maxErrorPct: 5 },
  { key: "avgVelocityMps", label: "Average velocity", unit: "m/s", maxErrorPct: 5 },
  { key: "avgStepLengthM", label: "Average step length", unit: "m", maxErrorPct: 10 },
];

export interface AccuracyRow {
  key: string;
  label: string;
  unit: string;
  avaValue: number | null;
  benchmarkValue: number | null;
  errorPct: number | null;
  targetPct: number;
  /** Met the target, missed it, or couldn't be evaluated (missing value). */
  status: "pass" | "fail" | "unavailable";
}

/**
 * Evaluate AVA's headline metrics against their accuracy targets. Pure: pass/fail
 * per metric with the actual error, so the UI can show which targets are met and,
 * for the ones that aren't, the honest gap.
 */
export function evaluateAccuracy(
  avaValues: Record<string, number | null>,
  reference: ReferenceMetrics,
): AccuracyRow[] {
  return ACCURACY_TARGETS.map(({ key, label, unit, maxErrorPct }) => {
    const avaRaw = avaValues[key];
    const refRaw = reference[key];
    const avaValue = isNum(avaRaw) ? avaRaw : null;
    const benchmarkValue = isNum(refRaw) ? refRaw : null;
    if (avaValue == null || benchmarkValue == null || benchmarkValue === 0) {
      return { key, label, unit, avaValue, benchmarkValue, errorPct: null, targetPct: maxErrorPct, status: "unavailable" as const };
    }
    const errorPct = Number(((Math.abs(avaValue - benchmarkValue) / Math.abs(benchmarkValue)) * 100).toFixed(1));
    return {
      key,
      label,
      unit,
      avaValue,
      benchmarkValue,
      errorPct,
      targetPct: maxErrorPct,
      status: errorPct <= maxErrorPct ? ("pass" as const) : ("fail" as const),
    };
  });
}

function classify(percentError: number): ComparisonStatus {
  if (percentError <= OK_PCT) return "ok";
  if (percentError <= WARN_PCT) return "warn";
  return "off";
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Flatten AVA's computed sprint measurements (+ optional worker biomechanics) into
 * the canonical benchmark vocabulary, so the comparator is a pure map lookup.
 */
export function assembleAvaValues(
  m: SprintMeasurements,
  biomech?: AvaBiomechMetrics | null,
  extra?: { activeFps?: number | null },
): Record<string, number | null> {
  return {
    activeFps: extra?.activeFps ?? null,
    zoneTimeS: m.zoneTimeS,
    // "Average velocity" ground truth is distance ÷ time; AVA's zone velocity is
    // exactly that. Max velocity is the longest step × cadence.
    avgVelocityMps: m.zoneVelocityMps,
    maxVelocityMps: m.maxVelocityMps,
    // Prefer the individual step length (mean of consecutive contact gaps) when it
    // is reliable — tight, camera-compensated world distances — since the zone
    // average (distance ÷ whole steps) is count-limited by boundary/partial steps.
    // Fall back to the zone average when individual gaps aren't trustworthy.
    avgStepLengthM:
      m.stepLengthConfidence === "high" && m.avgIndividualStepLengthM != null
        ? m.avgIndividualStepLengthM
        : (m.avgZoneStepLengthM ?? m.avgIndividualStepLengthM),
    leftStepLengthM: m.leftStepLengthM,
    rightStepLengthM: m.rightStepLengthM,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    leftStepFrequencyHz: m.leftStepFrequencyHz,
    rightStepFrequencyHz: m.rightStepFrequencyHz,
    // Contact/flight (Day 68): prefer the per-foot values measured from the overlay
    // foot trajectory over the IN-ZONE contacts; fall back to the worker's single
    // (non-per-foot) value only when the overlay timing couldn't be computed.
    groundContactLeftMs: m.groundContactLeftMs ?? biomech?.groundContactTimeMs ?? null,
    groundContactRightMs: m.groundContactRightMs ?? biomech?.groundContactTimeMs ?? null,
    flightLeftMs: m.flightLeftMs ?? biomech?.flightTimeMs ?? null,
    flightRightMs: m.flightRightMs ?? biomech?.flightTimeMs ?? null,
    totalContacts: m.totalContacts,
    leftContacts: m.leftContacts,
    rightContacts: m.rightContacts,
  };
}

/**
 * Compare AVA's values to a benchmark's reference metrics. One row per canonical
 * metric that either side has a value for: percent error when both are present,
 * `missing` when only the benchmark measured it, `info` when only AVA has it.
 */
export function compareToBenchmark(
  avaValues: Record<string, number | null>,
  reference: ReferenceMetrics,
): BenchmarkComparisonRow[] {
  const rows: BenchmarkComparisonRow[] = [];

  for (const { key, label, unit } of BENCHMARK_METRICS) {
    const avaRaw = avaValues[key];
    const refRaw = reference[key];
    const avaValue = isNum(avaRaw) ? avaRaw : null;
    const benchmarkValue = isNum(refRaw) ? refRaw : null;

    if (avaValue == null && benchmarkValue == null) continue;

    if (benchmarkValue == null) {
      rows.push({ key, label, unit, avaValue, benchmarkValue: null, absError: null, percentError: null, status: "info" });
      continue;
    }
    if (avaValue == null) {
      rows.push({ key, label, unit, avaValue: null, benchmarkValue, absError: null, percentError: null, status: "missing" });
      continue;
    }

    const absError = Math.abs(avaValue - benchmarkValue);
    const percentError = benchmarkValue === 0 ? 0 : (absError / Math.abs(benchmarkValue)) * 100;
    rows.push({
      key,
      label,
      unit,
      avaValue,
      benchmarkValue,
      absError: Number(absError.toFixed(3)),
      percentError: Number(percentError.toFixed(1)),
      status: classify(percentError),
    });
  }

  return rows;
}
