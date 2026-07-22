/**
 * Performance Ceiling engine (Phase 6). Derives an INDIVIDUALIZED ceiling average
 * velocity by raising the athlete's top speed toward their blueprint's peak-velocity
 * target while preserving their current average-to-peak ratio — so the ceiling is
 * personal, never a generic elite time. Never presented as destiny. Pure.
 */

import type { AthleteBlueprint } from "../blueprint/models";
import type { PerformanceCeiling, ProjectionConfidence } from "./models";
import { CEILING } from "./config";

export const CEILING_ENGINE_VERSION = "ava-performance-ceiling-v1" as const;

export interface CeilingInput {
  distanceM: number;
  currentAvgVelocityMps: number | null;
  currentPeakVelocityMps: number | null;
  blueprint: AthleteBlueprint;
  confidence: ProjectionConfidence;
}

export function computeCeiling(input: CeilingInput): PerformanceCeiling {
  const basis: string[] = [];
  const avgV = num(input.currentAvgVelocityMps);
  const peakV = num(input.currentPeakVelocityMps);
  const metric = (id: string) => input.blueprint.performanceBlueprint.metrics.find((m) => m.metricId === id)?.targetRange;
  const bpSL = metric("strideLength");
  const bpF = metric("strideFrequency");

  if (avgV == null || peakV == null || peakV <= 0 || bpSL?.min == null || bpSL.max == null || bpF?.min == null || bpF.max == null) {
    return {
      ceilingTimeS: null,
      ceilingVelocityMps: null,
      basis,
      confidence: input.confidence,
      note: "Not enough data to estimate an individualized ceiling.",
    };
  }

  const ratio = avgV / peakV; // the athlete's own average-to-peak profile
  basis.push(`Average-to-peak ratio ${round(ratio)} preserved (individual acceleration profile).`);

  // The ceiling TOP SPEED comes from the athlete's individualized blueprint stride
  // length × frequency targets (v = SL × F), anchored near the top of each range.
  const anchor = CEILING.blueprintPeakAnchor;
  const slCeil = bpSL.min + anchor * (bpSL.max - bpSL.min);
  const fCeil = bpF.min + anchor * (bpF.max - bpF.min);
  let ceilingTopSpeed = slCeil * fCeil;
  // Never below the athlete's current top speed (the ceiling is an upper bound).
  ceilingTopSpeed = Math.max(ceilingTopSpeed, peakV * 1.02);
  basis.push(`Blueprint stride length ${round(bpSL.max)} m × frequency ${round(bpF.max)} Hz → ceiling top speed ${round(ceilingTopSpeed)} m/s.`);

  let ceilingAvgV = ceilingTopSpeed * ratio;
  const cap = avgV * CEILING.maxHeadroomRatio;
  if (ceilingAvgV > cap) {
    ceilingAvgV = cap;
    basis.push("Capped to a safe maximum headroom over current velocity.");
  }
  // The ceiling can never be slower than current performance.
  ceilingAvgV = Math.max(ceilingAvgV, avgV);

  return {
    ceilingTimeS: round(input.distanceM / ceilingAvgV),
    ceilingVelocityMps: round(ceilingAvgV),
    basis,
    confidence: input.confidence,
    note: "An individualized estimate of upper potential — an informed projection, not a destiny or a guarantee.",
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
