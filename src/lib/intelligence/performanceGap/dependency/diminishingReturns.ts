/**
 * Diminishing Returns Model (Phase 4). Estimates the marginal gain available from
 * improving a metric further: gains are larger when far from the physiological ceiling
 * and smaller near it (e.g. 2.05→2.15 m yields more than 2.35→2.45 m). Uses a
 * CONFIGURABLE population optimal band as the ceiling — never the athlete's goal
 * target — so no goal number is hardcoded. Pure + deterministic.
 */

import { type Confidence, clamp01, estimated, unknown } from "../models";
import type { DiminishingRegime, DiminishingReturns } from "./models";
import { DIMINISHING_CONFIG } from "./graphConfig";

export const DIMINISHING_ENGINE_VERSION = "ava-diminishing-returns-v1" as const;

export function computeDiminishingReturns(input: {
  metricId: string;
  currentValue: number | null;
  targetValue: number | null;
}): DiminishingReturns {
  const cfg = DIMINISHING_CONFIG[input.metricId.replace(/(Left|Right)$/, "")];
  const current = num(input.currentValue);

  if (!cfg?.optimalRange || current == null) {
    return {
      metricId: input.metricId,
      currentValue: current,
      targetValue: num(input.targetValue),
      marginalGainFactor: null,
      regime: "unknown",
      optimalRange: cfg?.optimalRange ?? null,
      confidence: unknown("no optimal band or current value"),
    };
  }

  const { min, max } = cfg.optimalRange;
  // Headroom to the ceiling as a 0..1 fraction of the band.
  const headroom = clamp01((max - current) / (max - min));
  // Sharpness shapes the curve — more headroom → more marginal gain remaining.
  const marginalGainFactor = round(Math.pow(headroom, cfg.sharpness));

  let regime: DiminishingRegime;
  if (current >= max) regime = "plateau";
  else if (headroom >= 0.66) regime = "rising";
  else if (headroom >= 0.2) regime = "diminishing";
  else regime = "plateau";

  const confidence: Confidence = estimated(0.5, "marginal gain estimated from a population optimal band");

  return {
    metricId: input.metricId,
    currentValue: current,
    targetValue: num(input.targetValue),
    marginalGainFactor,
    regime,
    optimalRange: cfg.optimalRange,
    confidence,
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
