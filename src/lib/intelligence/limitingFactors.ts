/**
 * Limiting-Factor Diagnosis (Day 78) — AVA's pivot from "metrics dashboard" to
 * "performance diagnosis platform." This is a presentation-support layer that
 * reframes the already-ranked limiters from {@link buildSprintIntelligence} into
 * the customer-facing "Top 3 Limiting Factors," and estimates the top-speed head-
 * room from correcting them ("Performance Potential").
 *
 * It ADDS NO new biomechanics math and modifies nothing upstream:
 *  - Rank, confidence, and the "why" come straight from the intelligence engine.
 *  - Current value, unit, and the elite target range are surfaced from the shared
 *    threshold evaluation the engine already ran (now carried on `Limiter`).
 *  - Elite benchmark edges come from the shared {@link METRIC_THRESHOLDS}.
 *  - Deficits are simple arithmetic (current vs the nearest elite edge).
 *
 * The ONE modeling layer is the velocity-gain estimate. It uses the exact sprint
 * identity v = L · f (top speed = step length × step frequency), which AVA already
 * uses in `measurements.ts`:
 *  - Cadence and step-length limiters map DIRECTLY onto f and L (coupling = 1.0),
 *    so their gain estimate is first-order exact.
 *  - Ground-contact and flight-time limiters influence speed INDIRECTLY (via
 *    turnover / projection). They use a conservative coupling constant
 *    ({@link INDIRECT_COUPLING}) — flagged as `velocityGainModeled` — pending a
 *    validated velocity-sensitivity model. These are transparent v1 estimates, not
 *    measured values.
 *
 * Pure & deterministic: no I/O, inputs read-only, same input → same output.
 */

import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import { METRIC_THRESHOLDS } from "@/lib/coaching/knowledge/thresholds";
import type { IntelligenceConfidence, Limiter, SprintIntelligenceReport } from "./index";

/** How many limiters we surface as headline "limiting factors". */
export const MAX_FACTORS = 3;

/** Cap on the fractional deficit fed into the velocity model, so a wildly
 *  off-target reading can't imply an implausible gain. */
const DEFICIT_FRACTION_CAP = 0.5;

/**
 * Velocity coupling per metric. 1.0 = the metric IS a term of v = L·f (exact,
 * first-order). <1.0 = an INDIRECT influence modeled with a conservative constant
 * (flagged as modeled). These constants are transparent v1 assumptions.
 */
const VELOCITY_COUPLING: Record<string, number> = {
  stepFrequency: 1.0, // f term — direct
  strideLength: 1.0, // L term — direct
  groundContactTime: 0.5, // shorter contact → higher turnover (modeled)
  flightTime: 0.4, // longer flight → more projection (modeled)
};

/** Metrics where a HIGHER value is better (deficit = target − current). Ground
 *  contact time is the lone lower-is-better metric. */
const HIGHER_IS_BETTER: Record<string, boolean> = {
  stepFrequency: true,
  strideLength: true,
  flightTime: true,
  groundContactTime: false,
};

const CONF_ORDER: IntelligenceConfidence[] = ["low", "medium", "high"];
const minConf = (a: IntelligenceConfidence, b: IntelligenceConfidence): IntelligenceConfidence =>
  CONF_ORDER[Math.min(CONF_ORDER.indexOf(a), CONF_ORDER.indexOf(b))];
const downgrade = (c: IntelligenceConfidence): IntelligenceConfidence =>
  CONF_ORDER[Math.max(0, CONF_ORDER.indexOf(c) - 1)];

/** One customer-facing limiting factor, ready to render. */
export interface LimitingFactor {
  rank: number; // 1 = biggest limiter
  key: string;
  metricId: string;
  title: string;
  /** Measured value + unit. */
  currentValue: number;
  unit: string;
  currentText: string; // "112 ms"
  /** Elite benchmark, human range + the nearest edge used for the deficit. */
  eliteBenchmarkText: string; // "75–95 ms"
  eliteTargetValue: number;
  /** How far off elite, signed toward "worse", + magnitude %. */
  deficitText: string; // "17 ms over elite" / "0.35 Hz below elite"
  deficitPct: number;
  /** First-order top-speed gain (m/s) if corrected to elite; null if no velocity base. */
  estimatedVelocityGainMps: number | null;
  /** True when the gain came from an indirect coupling constant (a v1 estimate). */
  velocityGainModeled: boolean;
  confidence: IntelligenceConfidence;
  why: string;
}

/** Top-speed headroom from correcting the surfaced limiting factors. */
export interface PerformancePotential {
  available: boolean;
  currentTopSpeedMps: number | null;
  achievableTopSpeedMps: number | null;
  percentImprovement: number | null;
  /** How many factors contributed a velocity gain. */
  factorsApplied: number;
  confidence: IntelligenceConfidence | null;
  /** Plain-language basis (always present). */
  basis: string;
}

export interface LimitingFactorDiagnosis {
  available: boolean;
  factors: LimitingFactor[];
  potential: PerformancePotential;
}

const POTENTIAL_BASIS =
  "First-order estimate from the sprint identity top speed = step length × cadence. Cadence and step-length gains are direct; ground-contact and flight-time gains use a conservative modeled coupling. Combined with diminishing returns — not a guaranteed outcome.";

function formatValue(value: number, unit: string): string {
  if (unit === "ms" || unit === "°") return `${Math.round(value)} ${unit}`;
  return `${value.toFixed(2)} ${unit}`;
}

/** Elite band edge nearest to the current value (the reach-to-elite target). */
function eliteTarget(metricId: string): { value: number; text: string } | null {
  const threshold = METRIC_THRESHOLDS[metricId];
  if (!threshold) return null;
  const elite = threshold.bands.find((b) => b.status === "elite");
  if (!elite) return null;
  const higher = HIGHER_IS_BETTER[metricId] ?? true;
  return { value: higher ? elite.min : elite.max, text: threshold.targetRange };
}

function factorFromLimiter(
  limiter: Limiter,
  velocityBase: number | null,
): LimitingFactor {
  const target = eliteTarget(limiter.metricId);
  const higher = HIGHER_IS_BETTER[limiter.metricId] ?? true;
  const targetValue = target?.value ?? limiter.currentValue;

  const deficit = higher
    ? Math.max(0, targetValue - limiter.currentValue)
    : Math.max(0, limiter.currentValue - targetValue);
  const deficitPct = targetValue > 0 ? (deficit / targetValue) * 100 : 0;
  const deficitText =
    deficit === 0
      ? "at or above elite"
      : `${formatValue(deficit, limiter.unit)} ${higher ? "below" : "over"} elite`;

  // Velocity gain: v = L·f. Fractional deficit × coupling × current top speed.
  const coupling = VELOCITY_COUPLING[limiter.metricId] ?? 0;
  const deficitFraction = Math.min(DEFICIT_FRACTION_CAP, targetValue > 0 ? deficit / targetValue : 0);
  const estimatedVelocityGainMps =
    velocityBase != null && coupling > 0
      ? Number((velocityBase * deficitFraction * coupling).toFixed(2))
      : null;

  return {
    rank: limiter.rank,
    key: limiter.key,
    metricId: limiter.metricId,
    title: limiter.title,
    currentValue: limiter.currentValue,
    unit: limiter.unit,
    currentText: formatValue(limiter.currentValue, limiter.unit),
    eliteBenchmarkText: target?.text ?? limiter.targetRange,
    eliteTargetValue: targetValue,
    deficitText,
    deficitPct: Number(deficitPct.toFixed(1)),
    estimatedVelocityGainMps,
    velocityGainModeled: coupling > 0 && coupling < 1,
    confidence: limiter.confidence,
    why: limiter.why,
  };
}

/**
 * Turn the intelligence report into the Top-N limiting factors + a performance-
 * potential projection. Pure. Velocity estimates require a measured top speed;
 * without one, factors still render (deficits only) and potential is unavailable.
 */
export function deriveLimitingFactors(
  report: SprintIntelligenceReport,
  measurements: SprintMeasurements | null,
): LimitingFactorDiagnosis {
  const ranked = [report.primaryLimiter, ...report.secondaryLimiters].filter(
    (l): l is Limiter => l != null,
  );
  const top = ranked.slice(0, MAX_FACTORS);

  const currentTopSpeedMps = measurements?.maxVelocityMps ?? measurements?.zoneVelocityMps ?? null;
  const factors = top.map((l) => factorFromLimiter(l, currentTopSpeedMps));

  // Performance potential: blend the per-factor fractional gains with diminishing
  // returns so they don't naively add. achievable = v0 · (1 + blend).
  const gains = factors
    .map((f) => f.estimatedVelocityGainMps)
    .filter((g): g is number => g != null && g > 0);

  let potential: PerformancePotential;
  if (currentTopSpeedMps != null && currentTopSpeedMps > 0 && gains.length > 0) {
    const blended =
      1 - gains.reduce((acc, g) => acc * (1 - g / currentTopSpeedMps), 1);
    const achievable = currentTopSpeedMps * (1 + blended);
    // Confidence: the weakest contributing factor, then one step down (it's a projection).
    const factorConf = factors
      .filter((f) => (f.estimatedVelocityGainMps ?? 0) > 0)
      .reduce<IntelligenceConfidence>((acc, f) => minConf(acc, f.confidence), "high");
    potential = {
      available: true,
      currentTopSpeedMps: Number(currentTopSpeedMps.toFixed(2)),
      achievableTopSpeedMps: Number(achievable.toFixed(2)),
      percentImprovement: Number((blended * 100).toFixed(1)),
      factorsApplied: gains.length,
      confidence: downgrade(factorConf),
      basis: POTENTIAL_BASIS,
    };
  } else {
    potential = {
      available: false,
      currentTopSpeedMps: currentTopSpeedMps != null ? Number(currentTopSpeedMps.toFixed(2)) : null,
      achievableTopSpeedMps: null,
      percentImprovement: null,
      factorsApplied: 0,
      confidence: null,
      basis:
        currentTopSpeedMps == null
          ? "Calibrate a timing zone to measure top speed, then AVA can project achievable top speed."
          : "No correctable limiting factors detected — the scored metrics are within elite range.",
    };
  }

  return { available: factors.length > 0, factors, potential };
}
