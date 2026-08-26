/**
 * Descriptive (NON-diagnostic) acceleration-strategy classification (Phase
 * 3, Part 10). Combines step length/time, touchdown position, trunk/shin/
 * pelvis progression, and velocity gain into a single label that describes
 * HOW the athlete's projection is changing through the zone — never WHY,
 * and never a strength/injury/deficiency claim. Every label carries an
 * `evidence` list of concrete measured values so a coach can check the
 * claim against the numbers, not just trust a label.
 *
 * Requires `MIN_OBSERVATIONS_FOR_FINDING` valid steps; below that the
 * result is `"insufficient_data"` with no evidence fabricated.
 */

import type { AccelerationStepRow } from "./steps";
import type { MechanicalProgression } from "./mechanicsProgression";
import { MIN_OBSERVATIONS_FOR_FINDING } from "./mechanicsProgression";

export type StrategyLabel =
  | "length_dominant_growth"
  | "frequency_dominant_growth"
  | "combined_growth"
  | "plateauing_projection"
  | "mixed_pattern"
  | "insufficient_data";

export interface StrategyClassification {
  label: StrategyLabel;
  evidence: string[];
  observationCount: number;
  confidence: number;
}

const RELATIVE_GROWTH_THRESHOLD = 0.08;

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function splitEarlyLate<T>(items: T[]): { early: T[]; late: T[] } {
  const third = Math.max(1, Math.ceil(items.length / 3));
  return { early: items.slice(0, third), late: items.slice(-third) };
}

function relativeChange(early: number | null, late: number | null): number | null {
  if (early == null || late == null || Math.abs(early) < 1e-9) return null;
  return (late - early) / Math.abs(early);
}

export function classifyAccelerationStrategy(input: {
  steps: AccelerationStepRow[];
  trunk: MechanicalProgression;
  touchdown: MechanicalProgression;
  shin: MechanicalProgression;
  pelvis: MechanicalProgression;
}): StrategyClassification {
  const { steps, trunk, touchdown, shin, pelvis } = input;
  const validSteps = steps.filter((s) => s.dataQuality === "observed" || s.dataQuality === "estimated");

  if (validSteps.length < MIN_OBSERVATIONS_FOR_FINDING) {
    return { label: "insufficient_data", evidence: [], observationCount: validSteps.length, confidence: 0 };
  }

  const { early, late } = splitEarlyLate(validSteps);
  const earlyLen = mean(early.map((s) => s.stepLengthM));
  const lateLen = mean(late.map((s) => s.stepLengthM));
  const earlyFreq = mean(early.map((s) => s.stepFrequencyHz));
  const lateFreq = mean(late.map((s) => s.stepFrequencyHz));
  const earlyVel = mean(early.map((s) => s.intervalVelocityMps));
  const lateVel = mean(late.map((s) => s.intervalVelocityMps));

  const lenChange = relativeChange(earlyLen, lateLen);
  const freqChange = relativeChange(earlyFreq, lateFreq);
  const velChange = relativeChange(earlyVel, lateVel);

  const evidence: string[] = [];
  if (earlyLen != null && lateLen != null) {
    evidence.push(`Step length: early-zone avg ${earlyLen.toFixed(2)}m → late-zone avg ${lateLen.toFixed(2)}m.`);
  }
  if (earlyFreq != null && lateFreq != null) {
    evidence.push(`Step frequency: early-zone avg ${earlyFreq.toFixed(2)}Hz → late-zone avg ${lateFreq.toFixed(2)}Hz.`);
  }
  if (earlyVel != null && lateVel != null) {
    evidence.push(`Interval velocity: early-zone avg ${earlyVel.toFixed(2)}m/s → late-zone avg ${lateVel.toFixed(2)}m/s.`);
  }
  if (touchdown.trend !== "insufficient_data" && touchdown.zoneAverages.earlyZone != null && touchdown.zoneAverages.lateZone != null) {
    evidence.push(
      `Touchdown offset: early-zone avg ${touchdown.zoneAverages.earlyZone.toFixed(3)} → late-zone avg ${touchdown.zoneAverages.lateZone.toFixed(3)} (normalized, ${touchdown.trend}).`,
    );
  }
  if (trunk.trend !== "insufficient_data" && trunk.zoneAverages.earlyZone != null && trunk.zoneAverages.lateZone != null) {
    evidence.push(`Trunk angle: early-zone avg ${trunk.zoneAverages.earlyZone.toFixed(1)}° → late-zone avg ${trunk.zoneAverages.lateZone.toFixed(1)}° (${trunk.trend}).`);
  }
  if (shin.trend !== "insufficient_data" && shin.zoneAverages.earlyZone != null && shin.zoneAverages.lateZone != null) {
    evidence.push(`Shin angle: early-zone avg ${shin.zoneAverages.earlyZone.toFixed(1)}° → late-zone avg ${shin.zoneAverages.lateZone.toFixed(1)}° (${shin.trend}).`);
  }
  if (pelvis.trend !== "insufficient_data" && pelvis.zoneAverages.earlyZone != null && pelvis.zoneAverages.lateZone != null) {
    evidence.push(`Pelvis-height proxy: ${pelvis.trend} across the zone.`);
  }

  let label: StrategyLabel;
  const lenGrew = lenChange != null && lenChange > RELATIVE_GROWTH_THRESHOLD;
  const freqGrew = freqChange != null && freqChange > RELATIVE_GROWTH_THRESHOLD;
  const lenFlatOrFell = lenChange != null && lenChange <= RELATIVE_GROWTH_THRESHOLD;
  const freqFlatOrFell = freqChange != null && freqChange <= RELATIVE_GROWTH_THRESHOLD;
  const velStalling = velChange != null && velChange < RELATIVE_GROWTH_THRESHOLD;

  if (lenGrew && freqGrew) {
    label = "combined_growth";
  } else if (lenGrew && freqFlatOrFell) {
    label = "length_dominant_growth";
  } else if (freqGrew && lenFlatOrFell) {
    label = "frequency_dominant_growth";
  } else if (lenFlatOrFell && freqFlatOrFell && velStalling) {
    label = "plateauing_projection";
  } else {
    label = "mixed_pattern";
  }

  const confidenceInputs = [trunk, touchdown, shin, pelvis]
    .filter((p) => p.observationCount >= MIN_OBSERVATIONS_FOR_FINDING)
    .map((p) => p.series.reduce((sum, pt) => sum + pt.confidence, 0) / Math.max(1, p.series.length));
  const stepConfidence = mean(validSteps.map((s) => s.detectionConfidence)) ?? 0.5;
  const confidence = mean([stepConfidence, ...confidenceInputs]) ?? stepConfidence;

  return { label, evidence, observationCount: validSteps.length, confidence };
}
