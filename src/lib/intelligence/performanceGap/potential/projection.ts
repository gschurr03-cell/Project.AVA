/**
 * Projection engine (Phase 6). Turns the current→ceiling velocity headroom into
 * near-term and long-term time/velocity RANGES (never single numbers), each with an
 * explanation (why) and its assumptions. Also builds the current-capacity range.
 * Pure + deterministic.
 */

import type { AthletePerformanceModel } from "../models";
import type { AthleteBlueprint } from "../blueprint/models";
import type {
  PerformanceProjection,
  PotentialRange,
  ProjectionAssumption,
  ProjectionConfidence,
  ProjectionEvidence,
} from "./models";
import { CLOSABLE_FRACTION } from "./config";

export const PROJECTION_ENGINE_VERSION = "ava-performance-projection-v1" as const;

export function buildCurrentCapacity(
  distanceM: number,
  currentAvgV: number | null,
  confidence: ProjectionConfidence,
): PotentialRange {
  if (currentAvgV == null || currentAvgV <= 0) return emptyRange(confidence);
  const t = round(distanceM / currentAvgV);
  return { minTimeS: t, maxTimeS: t, minVelocityMps: round(currentAvgV), maxVelocityMps: round(currentAvgV), confidence };
}

export function buildProjection(input: {
  horizon: "near_term" | "long_term";
  distanceM: number;
  currentAvgV: number | null;
  ceilingAvgV: number | null;
  confidence: ProjectionConfidence;
  model: AthletePerformanceModel;
  blueprint: AthleteBlueprint;
  leadingRootCauseLabel?: string | null;
}): PerformanceProjection {
  const frac = input.horizon === "near_term" ? CLOSABLE_FRACTION.nearTerm : CLOSABLE_FRACTION.longTerm;
  const range = rangeFromHeadroom(input.distanceM, input.currentAvgV, input.ceilingAvgV, frac.min, frac.max, input.confidence);
  return {
    horizon: input.horizon,
    label: input.horizon === "near_term" ? "Estimated Near-Term Potential" : "Estimated Long-Term Potential",
    range,
    evidence: buildEvidence(input.model, input.blueprint, input.leadingRootCauseLabel),
    assumptions: buildAssumptions(input.horizon),
    category: range.minTimeS == null ? "unknown" : "projected",
  };
}

export function rangeFromHeadroom(
  distanceM: number,
  currentAvgV: number | null,
  ceilingAvgV: number | null,
  fracMin: number,
  fracMax: number,
  confidence: ProjectionConfidence,
): PotentialRange {
  if (currentAvgV == null || ceilingAvgV == null || currentAvgV <= 0) return emptyRange(confidence);
  const headroom = Math.max(0, ceilingAvgV - currentAvgV);
  const vLow = currentAvgV + headroom * fracMin; // less improvement → slower
  const vHigh = currentAvgV + headroom * fracMax; // more improvement → faster
  return {
    minTimeS: round(distanceM / vHigh),
    maxTimeS: round(distanceM / vLow),
    minVelocityMps: round(vLow),
    maxVelocityMps: round(vHigh),
    confidence,
  };
}

function buildEvidence(
  model: AthletePerformanceModel,
  blueprint: AthleteBlueprint,
  leadingRootCauseLabel?: string | null,
): ProjectionEvidence[] {
  const ev: ProjectionEvidence[] = [];
  const bp = new Map(blueprint.performanceBlueprint.metrics.map((m) => [m.metricId, m]));

  for (const metricId of ["strideFrequency", "peakVelocity", "strideLength", "groundContactTime"]) {
    const gap = model.gaps.find((g) => g.metricId === metricId);
    const target = bp.get(metricId)?.targetRange;
    if (!gap || gap.currentValue == null || target?.min == null || target.max == null) continue;
    const label = gap.label;
    const cat = gap.confidence.category;
    if (gap.lowerIsBetter) {
      if (gap.currentValue > target.max) ev.push({ statement: `${label} remains above its estimated target.`, category: cat });
      else ev.push({ statement: `${label} already meets its estimated target.`, category: cat });
    } else if (gap.currentValue >= target.min) {
      ev.push({ statement: `${label} already matches projected requirements.`, category: cat });
    } else {
      const pctToMin = ((target.min - gap.currentValue) / target.min) * 100;
      ev.push({ statement: `${label} is within ${pctToMin.toFixed(1)}% of the projected requirement.`, category: cat });
    }
  }
  if (leadingRootCauseLabel) {
    ev.push({
      statement: `${leadingRootCauseLabel} improvements could reasonably close part of the remaining gap.`,
      category: "inferred",
    });
  }
  return ev;
}

function buildAssumptions(horizon: "near_term" | "long_term"): ProjectionAssumption[] {
  const base: ProjectionAssumption[] = [
    { statement: "Identified limiters are substantially improved toward the individualized blueprint." },
    { statement: "The athlete's acceleration/transition profile is broadly preserved." },
    { statement: "Consistent, appropriate training with no significant injury interruption." },
  ];
  if (horizon === "long_term") base.push({ statement: "Sustained multi-season development." });
  return base;
}

function emptyRange(confidence: ProjectionConfidence): PotentialRange {
  return { minTimeS: null, maxTimeS: null, minVelocityMps: null, maxVelocityMps: null, confidence };
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
