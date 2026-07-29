/**
 * Engine 2 — Goal Requirement Engine.
 *
 * Estimates what each sprint metric would LIKELY need to become for the athlete to
 * hit their goal race time. Every requirement is DERIVED from the athlete's own
 * current value scaled by the goal's velocity ratio through a configurable model —
 * no absolute target is ever hardcoded. Deterministic + pure.
 */

import {
  type Confidence,
  type GoalRequirement,
  type PerformanceTarget,
  type RequiredMetric,
  estimated,
  inferred,
  measured,
  propagateConfidence,
  unknown,
} from "./models";
import { METRIC_REGISTRY, metricDefinition, CONFIG_VERSION } from "./config";

export const GOAL_REQUIREMENT_ENGINE_VERSION = "goal-requirement-v1" as const;

/** Current metric readings keyed by metricId (null = not available). */
export type MetricReadings = Record<string, number | null | undefined>;

export interface GoalRequirementInput {
  distanceM: number;
  currentTimeS: number | null;
  goalTimeS: number | null;
  currentMetrics: MetricReadings;
}

export function buildPerformanceTarget(input: {
  distanceM: number;
  currentTimeS: number | null;
  goalTimeS: number | null;
}): PerformanceTarget {
  const currentAvg =
    input.currentTimeS && input.currentTimeS > 0 ? input.distanceM / input.currentTimeS : null;
  const requiredAvg =
    input.goalTimeS && input.goalTimeS > 0 ? input.distanceM / input.goalTimeS : null;
  const velocityRatio = currentAvg && requiredAvg ? requiredAvg / currentAvg : null;
  const confidence: Confidence =
    velocityRatio != null
      ? measured("average velocity is distance ÷ time")
      : unknown("current and/or goal time is missing");
  return {
    distanceM: input.distanceM,
    currentTimeS: input.currentTimeS,
    goalTimeS: input.goalTimeS,
    currentAvgVelocityMps: currentAvg,
    requiredAvgVelocityMps: requiredAvg,
    velocityRatio,
    confidence,
  };
}

export function buildGoalRequirement(input: GoalRequirementInput): GoalRequirement {
  const target = buildPerformanceTarget(input);
  const ratio = target.velocityRatio;

  // Normalize multiplicative exponent weights across the multiplicative metrics
  // that have a current value, so v = Π(metric) stays exactly consistent: the
  // product of the derived requirements reproduces the required velocity.
  const multiplicativePresent = METRIC_REGISTRY.filter(
    (m) => m.velocityModel.kind === "multiplicative" && numeric(input.currentMetrics[m.id]),
  );
  const exponentSum = multiplicativePresent.reduce(
    (s, m) => s + (m.velocityModel.kind === "multiplicative" ? m.velocityModel.exponentWeight : 0),
    0,
  );

  const requiredMetrics: RequiredMetric[] = [];
  for (const def of METRIC_REGISTRY) {
    const current = numeric(input.currentMetrics[def.id]);
    if (current == null) continue; // only model metrics we actually have

    let requiredValue: number | null = null;
    let baseConf: Confidence;

    if (ratio == null) {
      requiredValue = null;
      baseConf = unknown("no goal velocity ratio");
    } else {
      switch (def.velocityModel.kind) {
        case "multiplicative": {
          const w = exponentSum > 0 ? def.velocityModel.exponentWeight / exponentSum : 0;
          requiredValue = current * Math.pow(ratio, w);
          baseConf = estimated(def.requirementConfidence, "v = Π(metric); ratio split by configured weights");
          break;
        }
        case "proportional": {
          // Average velocity target is the required velocity itself (measured);
          // peak velocity is assumed to scale with average (estimated).
          if (def.id === "averageVelocity") {
            requiredValue = target.requiredAvgVelocityMps;
            baseConf = measured("required average velocity = distance ÷ goal time");
          } else {
            requiredValue = current * ratio;
            baseConf = estimated(def.requirementConfidence, "assumes peak scales with average velocity");
          }
          break;
        }
        case "elastic": {
          const change = def.velocityModel.elasticity * (ratio - 1);
          requiredValue =
            def.velocityModel.direction === "decrease" ? current * (1 - change) : current * (1 + change);
          baseConf = inferred(def.requirementConfidence, "elastic response to the velocity change (weak model)");
          break;
        }
        case "none":
          requiredValue = null;
          baseConf = unknown("not derivable from race velocity");
          break;
      }
    }

    requiredMetrics.push({
      metricId: def.id,
      label: def.label,
      unit: def.unit,
      currentValue: current,
      requiredValue: requiredValue == null ? null : round(requiredValue),
      model: `${def.velocityModel.kind}`,
      confidence: propagateConfidence([baseConf, target.confidence]),
    });
  }

  return { target, requiredMetrics, modelVersion: `${GOAL_REQUIREMENT_ENGINE_VERSION}/${CONFIG_VERSION}` };
}

export function metricLabel(metricId: string): string {
  return metricDefinition(metricId)?.label ?? metricId;
}

function numeric(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
