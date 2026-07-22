/**
 * Development Scenarios (Phase 6). Builds current-trajectory / conservative / expected /
 * optimistic scenarios, each a headroom fraction of the current→ceiling gap with an
 * estimated time, a range, confidence, its largest limiting factors, and its greatest
 * uncertainty. Pure + deterministic.
 */

import type { DevelopmentScenario, ProjectionConfidence, ProjectionConstraint, UncertaintySource } from "./models";
import { SCENARIO_FRACTION } from "./config";
import { rangeFromHeadroom } from "./projection";

export const SCENARIO_ENGINE_VERSION = "ava-development-scenarios-v1" as const;

export function buildScenarios(input: {
  distanceM: number;
  currentTimeS: number | null;
  currentAvgV: number | null;
  ceilingAvgV: number | null;
  nearConfidence: ProjectionConfidence;
  longConfidence: ProjectionConfidence;
  bottlenecks: ProjectionConstraint[];
  uncertainty: UncertaintySource[];
}): DevelopmentScenario[] {
  const limiters = input.bottlenecks.slice(0, 3).map((b) => b.label);
  const uncertainty = input.uncertainty.slice(0, 2).map((u) => u.description);

  const scenarios: DevelopmentScenario[] = [];

  // Current trajectory: no substantial change → current performance.
  scenarios.push({
    id: "current_trajectory",
    label: "Current trajectory",
    estimatedTimeS: input.currentTimeS,
    range: { min: input.currentTimeS, max: input.currentTimeS },
    confidence: input.nearConfidence,
    largestLimitingFactors: limiters,
    greatestUncertainty: uncertainty,
  });

  for (const id of ["conservative", "expected", "optimistic"] as const) {
    const frac = SCENARIO_FRACTION[id];
    const conf = id === "conservative" ? input.nearConfidence : input.longConfidence;
    const range = rangeFromHeadroom(input.distanceM, input.currentAvgV, input.ceilingAvgV, frac.min, frac.max, conf);
    const mid =
      range.minTimeS != null && range.maxTimeS != null ? round((range.minTimeS + range.maxTimeS) / 2) : null;
    scenarios.push({
      id,
      label: id === "conservative" ? "Conservative progression" : id === "expected" ? "Expected progression" : "Optimistic progression",
      estimatedTimeS: mid,
      range: { min: range.minTimeS, max: range.maxTimeS },
      confidence: conf,
      largestLimitingFactors: limiters,
      greatestUncertainty: uncertainty,
    });
  }
  return scenarios;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
