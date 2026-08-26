/**
 * Unified left/right asymmetry report (Phase 3, Part 12).
 *
 * Combines the EXISTING step-level asymmetry (step length/time, contact
 * time, velocity-gain contribution — from Phase 2's `progression.ts` /
 * `metrics.ts`) with the NEW mechanics-level asymmetry (touchdown position,
 * trunk angle, shin angle — from `mechanicsProgression.ts`'s per-metric
 * `sideComparison`) into one consistently-shaped list, so a UI can render
 * "Left/Right Balance" from a single array instead of several ad-hoc shapes.
 *
 * Every entry prefers REPEATED-side averages over single-step comparisons
 * (Part 12): `persistent` is only true once each side has at least two
 * observations AND the gap clears a meaningful threshold — a single-step
 * difference is reported as present but never flagged as persistent.
 * Nothing here implies injury or weakness; that judgment is left entirely
 * to the limiting-factor layer's disclaimed language.
 */

import type { AccelerationAsymmetry } from "./metrics";
import type { LeftRightContribution } from "./progression";
import type { MechanicalProgression } from "./mechanicsProgression";

export type ZoneChange = "widening" | "narrowing" | "stable" | "insufficient_data";

export interface MechanicalAsymmetry {
  metric: string;
  leftAverage: number | null;
  rightAverage: number | null;
  absoluteDifference: number | null;
  percentDifference: number | null;
  observationCount: number;
  confidence: number;
  persistent: boolean;
  zoneChange: ZoneChange;
}

function pctDiff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  const denom = (Math.abs(a) + Math.abs(b)) / 2;
  if (denom < 1e-9) return null;
  return (Math.abs(a - b) / denom) * 100;
}

function zoneChangeFromProgression(progression: MechanicalProgression, meaningfulThreshold: number): ZoneChange {
  if (progression.observationCount < 4) return "insufficient_data";
  const sorted = [...progression.series].sort((a, b) => a.distanceM - b.distanceM);
  const third = Math.ceil(sorted.length / 3);
  const early = sorted.slice(0, third);
  const late = sorted.slice(-third);
  const diffFor = (pts: typeof sorted) => {
    const left = pts.filter((p) => p.side === "left").map((p) => p.value);
    const right = pts.filter((p) => p.side === "right").map((p) => p.value);
    if (left.length < 1 || right.length < 1) return null;
    const la = left.reduce((s, v) => s + v, 0) / left.length;
    const ra = right.reduce((s, v) => s + v, 0) / right.length;
    return Math.abs(la - ra);
  };
  const earlyDiff = diffFor(early);
  const lateDiff = diffFor(late);
  if (earlyDiff == null || lateDiff == null) return "insufficient_data";
  const delta = lateDiff - earlyDiff;
  if (Math.abs(delta) < meaningfulThreshold * 0.5) return "stable";
  return delta > 0 ? "widening" : "narrowing";
}

function fromMechanicalProgression(metric: string, progression: MechanicalProgression, meaningfulThreshold: number): MechanicalAsymmetry {
  const s = progression.sideComparison;
  return {
    metric,
    leftAverage: s.leftAverage,
    rightAverage: s.rightAverage,
    absoluteDifference: s.absoluteDifference,
    percentDifference: pctDiff(s.leftAverage, s.rightAverage),
    observationCount: s.leftCount + s.rightCount,
    confidence: progression.series.length ? progression.series.reduce((sum, p) => sum + p.confidence, 0) / progression.series.length : 0,
    persistent: s.meaningful,
    zoneChange: zoneChangeFromProgression(progression, meaningfulThreshold),
  };
}

export function buildMechanicalAsymmetryReport(input: {
  stepAsymmetry: AccelerationAsymmetry | null;
  leftRight: LeftRightContribution;
  touchdown: MechanicalProgression;
  trunk: MechanicalProgression;
  shin: MechanicalProgression;
}): MechanicalAsymmetry[] {
  const { stepAsymmetry, leftRight, touchdown, trunk, shin } = input;
  const report: MechanicalAsymmetry[] = [];
  // stepTime/contactTime/velocityGain all derive from the same per-step data
  // as step length, so its sample counts describe them too. `leftRight`
  // itself carries no counts — without this, a single-step comparison could
  // read as "persistent," exactly what Part 12 says never to over-report.
  const stepSampleCount = (stepAsymmetry?.leftStepSampleCount ?? 0) + (stepAsymmetry?.rightStepSampleCount ?? 0);
  const hasRepeatedSides = (stepAsymmetry?.leftStepSampleCount ?? 0) >= 2 && (stepAsymmetry?.rightStepSampleCount ?? 0) >= 2;

  if (stepAsymmetry) {
    report.push({
      metric: "stepLength",
      leftAverage: stepAsymmetry.leftStepAverageM,
      rightAverage: stepAsymmetry.rightStepAverageM,
      absoluteDifference:
        stepAsymmetry.leftStepAverageM != null && stepAsymmetry.rightStepAverageM != null
          ? Math.abs(stepAsymmetry.leftStepAverageM - stepAsymmetry.rightStepAverageM)
          : null,
      percentDifference: stepAsymmetry.stepLengthAsymmetryPct,
      observationCount: stepAsymmetry.leftStepSampleCount + stepAsymmetry.rightStepSampleCount,
      confidence: stepAsymmetry.leftStepSampleCount >= 2 && stepAsymmetry.rightStepSampleCount >= 2 ? 0.8 : 0.4,
      persistent: stepAsymmetry.leftStepSampleCount >= 2 && stepAsymmetry.rightStepSampleCount >= 2 && (stepAsymmetry.stepLengthAsymmetryPct ?? 0) >= 8,
      zoneChange:
        stepAsymmetry.trend === "insufficient_data"
          ? "insufficient_data"
          : stepAsymmetry.trend === "worsening"
            ? "widening"
            : stepAsymmetry.trend === "improving"
              ? "narrowing"
              : "stable",
    });
  }

  report.push({
    metric: "stepTime",
    leftAverage: leftRight.leftStepTimeS,
    rightAverage: leftRight.rightStepTimeS,
    absoluteDifference: leftRight.leftStepTimeS != null && leftRight.rightStepTimeS != null ? Math.abs(leftRight.leftStepTimeS - leftRight.rightStepTimeS) : null,
    percentDifference: leftRight.stepTimeAsymmetryPct,
    observationCount: stepSampleCount,
    confidence: leftRight.meaningfulStepTimeAsymmetry && hasRepeatedSides ? 0.8 : 0.5,
    persistent: leftRight.meaningfulStepTimeAsymmetry && hasRepeatedSides,
    zoneChange: "insufficient_data",
  });

  report.push({
    metric: "contactTime",
    leftAverage: leftRight.leftContactTimeS,
    rightAverage: leftRight.rightContactTimeS,
    absoluteDifference:
      leftRight.leftContactTimeS != null && leftRight.rightContactTimeS != null ? Math.abs(leftRight.leftContactTimeS - leftRight.rightContactTimeS) : null,
    percentDifference: leftRight.contactTimeAsymmetryPct,
    observationCount: stepSampleCount,
    confidence: leftRight.meaningfulContactTimeAsymmetry && hasRepeatedSides ? 0.8 : 0.5,
    persistent: leftRight.meaningfulContactTimeAsymmetry && hasRepeatedSides,
    zoneChange: "insufficient_data",
  });

  report.push({
    metric: "velocityGainContribution",
    leftAverage: leftRight.leftVelocityContributionMps,
    rightAverage: leftRight.rightVelocityContributionMps,
    absoluteDifference: Math.abs(leftRight.leftVelocityContributionMps - leftRight.rightVelocityContributionMps),
    percentDifference: pctDiff(leftRight.leftVelocityContributionMps, leftRight.rightVelocityContributionMps),
    observationCount: stepSampleCount,
    confidence: hasRepeatedSides ? 0.6 : 0.4,
    persistent: false,
    zoneChange: "insufficient_data",
  });

  report.push(fromMechanicalProgression("touchdownOffset", touchdown, 0.02));
  report.push(fromMechanicalProgression("trunkAngle", trunk, 4));
  report.push(fromMechanicalProgression("shinAngle", shin, 4));

  return report;
}
