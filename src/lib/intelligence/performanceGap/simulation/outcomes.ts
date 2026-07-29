/**
 * Outcome estimation (Phase 9). Turns the propagated relative-change map into estimated
 * metric values, race times, velocity profile, and — by REUSING the Phase 5 development
 * score — an updated blueprint completion. Velocity flows from the exact identity
 * v = stride length × frequency; event times apply transparent top-speed transfer
 * factors. This is scenario exploration, not prediction. Pure + deterministic.
 */

import type { AthleteBlueprint, BlueprintMetric } from "../blueprint/models";
import { metricScore, buildProgressScores, overallCompletion } from "../blueprint/developmentScore";
import type { SensitivityScore } from "../dependency/models";
import { labelFor } from "../dependency/dependencyGraph";
import { metricDefinition } from "../config";
import { measured, estimated } from "../models";
import type { RelChange } from "./propagation";
import { relOf } from "./propagation";
import type { SimulatedMetricChange, SimulatedEventOutcome, ScenarioConfidence } from "./models";
import { EVENTS, EVENT_TRANSFER, EVENT_TIME_RATIO, PROPAGATION, constraintBound } from "./config";

export const OUTCOME_ENGINE_VERSION = "ava-simulation-outcomes-v1" as const;

export interface OutcomeInput {
  rel: Record<string, RelChange>;
  currentMetrics: Record<string, number | null>;
  currentTimes: Record<string, number | null>;
  blueprint: AthleteBlueprint;
  sensitivity: SensitivityScore[];
  confidence: ScenarioConfidence;
}

export interface OutcomeResult {
  metricChanges: SimulatedMetricChange[];
  eventOutcomes: SimulatedEventOutcome[];
  velocity: {
    speedRatio: number;
    peakVelocityMps: { current: number | null; simulated: number | null };
    averageVelocityMps: { current: number | null; simulated: number | null };
  };
  developmentScore: { current: number; simulated: number; deltaPct: number };
  blueprintCompletion: { current: number; simulated: number; deltaPct: number };
  /** Simulated absolute value per metric (for downstream reuse). */
  simulatedValues: Record<string, number>;
}

export function estimateOutcomes(input: OutcomeInput): OutcomeResult {
  const { rel, currentMetrics, currentTimes, blueprint, sensitivity } = input;

  // Top-speed ratio from the velocity identity v = SL × F (the exact relationship),
  // else from a direct user peak/average-velocity adjustment.
  const speedRatio = deriveSpeedRatio(rel);

  // Simulated absolute value per metric.
  const simulatedValues: Record<string, number> = {};
  const metricIds = new Set<string>(Object.keys(rel));
  for (const m of blueprint.performanceBlueprint.metrics) metricIds.add(m.metricId);

  for (const id of metricIds) {
    const current = num(currentMetrics[id]) ?? num(blueprint.performanceBlueprint.metrics.find((m) => m.metricId === id)?.currentValue);
    if (current == null) continue;
    if (id === "peakVelocity" || id === "averageVelocity") {
      // Velocities are outcomes of the identity — keep them consistent with speedRatio.
      const userSet = rel[id]?.source === "user";
      simulatedValues[id] = userSet ? current * (1 + relOf(rel, id)) : current * speedRatio;
    } else {
      simulatedValues[id] = current * (1 + relOf(rel, id));
    }
  }

  // Metric-change rows (deterministic order).
  const metricChanges: SimulatedMetricChange[] = [...metricIds]
    .sort()
    .map((id): SimulatedMetricChange | null => {
      const current = num(currentMetrics[id]) ?? num(blueprint.performanceBlueprint.metrics.find((m) => m.metricId === id)?.currentValue);
      const sim = simulatedValues[id];
      const r = rel[id];
      if (current == null && sim == null) return null;
      const source = r?.source ?? "propagated";
      // Only include metrics that actually participate in the scenario.
      if (!r && !(id === "peakVelocity" || id === "averageVelocity")) return null;
      const deltaPct = current != null && current !== 0 && sim != null ? ((sim - current) / current) * 100 : null;
      const sens = sensitivity.find((s) => s.metricId === id)?.sensitivity ?? null;
      return {
        metricId: id,
        label: labelFor(id),
        unit: unitFor(id),
        currentValue: current != null ? round(current) : null,
        simulatedValue: sim != null ? round(sim) : null,
        deltaPct: deltaPct != null ? round(deltaPct) : null,
        source,
        sensitivity: sens,
        confidence: source === "locked" ? measured("held constant") : source === "user" ? estimated(0.85, "user-specified adjustment") : estimated(0.6, "dependency-propagated estimate"),
      };
    })
    .filter((x): x is SimulatedMetricChange => x !== null);

  // Race outcomes per event.
  const time100 = num(currentTimes["100m"]);
  const eventOutcomes: SimulatedEventOutcome[] = EVENTS.map((event): SimulatedEventOutcome => {
    let current = num(currentTimes[event]);
    let baseline: "measured" | "estimated" = "measured";
    if (current == null && time100 != null) {
      current = time100 * EVENT_TIME_RATIO[event];
      baseline = "estimated";
    }
    const transfer = EVENT_TRANSFER[event] ?? 0.8;
    const simulated = current != null ? current / (1 + (speedRatio - 1) * transfer) : null;
    return {
      event,
      currentTimeS: current != null ? round(current) : null,
      simulatedTimeS: simulated != null ? round(simulated) : null,
      deltaS: current != null && simulated != null ? round(simulated - current) : null,
      baseline,
      confidence: baseline === "estimated" ? lowerLevel(input.confidence) : input.confidence,
    };
  });

  // Development score + blueprint completion via Phase 5 (reused, not re-implemented).
  // Only override metrics the blueprint already scores, so the current/simulated metric
  // SET stays identical — the two scores are always an apples-to-apples comparison.
  const simMetrics: BlueprintMetric[] = blueprint.performanceBlueprint.metrics.map((m) => ({
    ...m,
    currentValue: m.currentValue != null && simulatedValues[m.metricId] != null ? simulatedValues[m.metricId] : m.currentValue,
  }));
  const currentScore = blueprint.performanceBlueprint.overallCompletionPct;
  const simulatedScore = overallCompletion(buildProgressScores(simMetrics));

  const curCompletion = completionPct(blueprint.performanceBlueprint.metrics);
  const simCompletion = completionPct(simMetrics);

  const peakCur = num(currentMetrics["peakVelocity"]);
  const avgCur = num(currentMetrics["averageVelocity"]) ?? (time100 != null ? 100 / time100 : null);

  return {
    metricChanges,
    eventOutcomes,
    velocity: {
      speedRatio: round(speedRatio),
      peakVelocityMps: { current: peakCur, simulated: peakCur != null ? round(simulatedValues["peakVelocity"] ?? peakCur * speedRatio) : null },
      averageVelocityMps: { current: avgCur != null ? round(avgCur) : null, simulated: avgCur != null ? round(avgCur * speedRatio) : null },
    },
    developmentScore: { current: currentScore, simulated: simulatedScore, deltaPct: simulatedScore - currentScore },
    blueprintCompletion: { current: curCompletion, simulated: simCompletion, deltaPct: simCompletion - curCompletion },
    simulatedValues,
  };
}

/** Top-speed ratio, clamped to a physiologically plausible band. */
function deriveSpeedRatio(rel: Record<string, RelChange>): number {
  const relSL = relOf(rel, "strideLength");
  const relF = relOf(rel, "strideFrequency");
  let ratio: number;
  if (Math.abs(relSL) > 1e-9 || Math.abs(relF) > 1e-9) {
    ratio = (1 + relSL) * (1 + relF);
  } else if (rel["peakVelocity"]?.source === "user") {
    ratio = 1 + relOf(rel, "peakVelocity");
  } else if (rel["averageVelocity"]?.source === "user") {
    ratio = 1 + relOf(rel, "averageVelocity");
  } else {
    ratio = 1;
  }
  return Math.max(PROPAGATION.speedRatioRange.min, Math.min(PROPAGATION.speedRatioRange.max, ratio));
}

/** Percentage of scored blueprint metrics that meet their individualized target range. */
function completionPct(metrics: BlueprintMetric[]): number {
  const scored = metrics.map((m) => metricScore(m)).filter((s): s is number => s != null);
  if (scored.length === 0) return 0;
  const met = scored.filter((s) => s >= 1 - 1e-9).length;
  return Math.round((met / scored.length) * 100);
}

function lowerLevel(c: ScenarioConfidence): ScenarioConfidence {
  const order: ScenarioConfidence["level"][] = ["low", "moderate", "high"];
  const i = Math.max(0, order.indexOf(c.level) - 1);
  return { ...c, level: order[i], score: round(c.score * 0.85) };
}

function unitFor(metricId: string): string {
  return metricDefinition(metricId)?.unit ?? constraintBound(metricId)?.unit ?? "";
}
function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
