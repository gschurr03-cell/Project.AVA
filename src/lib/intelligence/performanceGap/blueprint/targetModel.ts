/**
 * Individualized target-range engine (Phase 5). Derives each metric's blueprint
 * range from THIS athlete's anthropometrics + goal — never a shared/absolute target.
 * Pure + deterministic; every range carries measured/estimated/unknown + confidence.
 */

import { type Confidence, estimated, measured, unknown } from "../models";
import type { AthleteContext } from "../rootCause/athleteContext";
import type { BlueprintMetric, Level, TargetRange } from "./models";
import { METRIC_TARGET_CONFIG, type MetricTargetConfig } from "./config";

export const TARGET_MODEL_VERSION = "ava-blueprint-target-model-v1" as const;

export interface TargetContext {
  context: AthleteContext;
  requiredAvgVelocityMps: number | null;
  level: Level;
}

export function buildBlueprintMetrics(
  currentMetrics: Record<string, number | null | undefined>,
  tctx: TargetContext,
): BlueprintMetric[] {
  return METRIC_TARGET_CONFIG.map((cfg) => {
    const range = deriveRange(cfg, tctx);
    return {
      metricId: cfg.metricId,
      label: cfg.label,
      currentValue: num(currentMetrics[cfg.metricId]),
      targetRange: range,
      basis: cfg.model.kind,
      evidence: range.confidence.category,
    };
  });
}

function deriveRange(cfg: MetricTargetConfig, tctx: TargetContext): TargetRange {
  const unit = cfg.unit;
  const m = cfg.model;
  const heightCm = num(tctx.context.heightCm);
  const trochM = num(tctx.context.trochanterHeightM);
  const v = num(tctx.requiredAvgVelocityMps);

  switch (m.kind) {
    case "trochanterRatio": {
      if (trochM != null) {
        return band(trochM * m.min, trochM * m.max, unit, estimated(0.7, "individualized from trochanter height × configured ratio"));
      }
      if (heightCm != null) {
        const hM = heightCm / 100;
        return band(hM * m.fallbackHeightRatio.min, hM * m.fallbackHeightRatio.max, unit,
          estimated(0.55, "individualized from height (trochanter unavailable)"));
      }
      return unknownRange(unit, "no trochanter height or height");
    }
    case "velocityFactor": {
      if (v == null) return unknownRange(unit, "no goal-derived velocity");
      const conf = m.min === 1 && m.max === 1
        ? measured("required average velocity from the goal")
        : estimated(0.7, "individualized from goal velocity × configured factor");
      return band(v * m.min, v * m.max, unit, conf);
    }
    case "heightAdjustedBand": {
      const [lo, hi] = m.base;
      let delta = 0;
      if (heightCm != null) {
        delta = heightCm < 180 ? (180 - heightCm) * m.perCmBelow180 : (heightCm - 180) * m.perCmAbove180;
      }
      const conf = heightCm != null
        ? estimated(0.6, "band individualized by height")
        : estimated(0.4, "population band (height unavailable)");
      return band(lo + delta, hi + delta, unit, conf);
    }
    case "fixedBand":
      return band(m.min, m.max, unit, estimated(0.4, "population band (weakly individualized)"));
  }
}

/** Estimate the athlete's performance level from their goal race time. */
export function estimateLevel(context: AthleteContext): Level {
  const goal = num(context.goalPbSeconds) ?? num(context.currentPbSeconds);
  const event = (context.event ?? "100m").toLowerCase();
  if (goal == null) return "intermediate";
  // Thresholds are for 100 m; scaled loosely for other events.
  const t = event.includes("200") ? goal / 2 : event.includes("60") ? goal * 1.6 : goal;
  if (t <= 10.2) return "elite";
  if (t <= 10.7) return "advanced";
  if (t <= 11.4) return "intermediate";
  return "developing";
}

function band(min: number, max: number, unit: string, confidence: Confidence): TargetRange {
  const lo = round(Math.min(min, max));
  const hi = round(Math.max(min, max));
  return { min: lo, max: hi, unit, confidence };
}
function unknownRange(unit: string, why: string): TargetRange {
  return { min: null, max: null, unit, confidence: unknown(why) };
}
function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
