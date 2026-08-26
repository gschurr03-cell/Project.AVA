/**
 * Trunk / touchdown / shin / pelvis PROGRESSION analysis (Phase 3, Parts
 * 6-9) — built entirely on top of the per-contact `ContactMechanics[]`
 * observations, never re-measuring pose data. Every qualitative finding
 * requires a MINIMUM number of valid observations (Part 7: "do not label a
 * contact as overstriding from one frame alone — require a repeated
 * pattern and sufficient quality"); below that floor the result is
 * `"insufficient_data"`, never a confident-sounding guess.
 *
 * Uses only athlete-relative / zone-relative language — there is
 * deliberately no universal "ideal" trunk angle, touchdown distance, or
 * pelvis height anywhere in this file (Part 6/7/9).
 */

import type { ContactMechanics } from "./mechanics";
import type { MechanicalSide } from "./mechanicsDefinitions";

/** Fewer valid observations than this and no qualitative finding is made. */
export const MIN_OBSERVATIONS_FOR_FINDING = 3;

export type Trend = "rising" | "falling" | "stable" | "insufficient_data";
export type Smoothness = "smooth" | "fluctuating" | "insufficient_data";

export interface ZoneAverages {
  earlyZone: number | null;
  middleZone: number | null;
  lateZone: number | null;
}

export interface SeriesPoint {
  stepNumber: number;
  distanceM: number;
  value: number;
  confidence: number;
  side: MechanicalSide;
}

export interface SideComparison {
  leftAverage: number | null;
  rightAverage: number | null;
  leftCount: number;
  rightCount: number;
  absoluteDifference: number | null;
  meaningful: boolean;
}

export interface MechanicalProgression {
  series: SeriesPoint[];
  changePerStep: { stepNumber: number; delta: number }[];
  zoneAverages: ZoneAverages;
  /** Least-squares rate of change per meter of zone distance ("rate of rise"); null below MIN_OBSERVATIONS_FOR_FINDING. */
  ratePerMeter: number | null;
  trend: Trend;
  smoothness: Smoothness;
  sideComparison: SideComparison;
  observationCount: number;
  findings: string[];
}

const MEANINGFUL_SIDE_DIFFERENCE_DEG = 4; // degrees, for angle-based series
const TREND_RELATIVE_THRESHOLD = 0.1;

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function stddev(values: number[]): number {
  const avg = mean(values);
  if (avg == null || values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
}

function computeZoneAverages(series: SeriesPoint[]): ZoneAverages {
  if (series.length < MIN_OBSERVATIONS_FOR_FINDING) return { earlyZone: null, middleZone: null, lateZone: null };
  const sorted = [...series].sort((a, b) => a.distanceM - b.distanceM);
  const third = Math.ceil(sorted.length / 3);
  const early = sorted.slice(0, third);
  const late = sorted.slice(-third);
  const middle = sorted.slice(third, sorted.length - third);
  return {
    earlyZone: mean(early.map((p) => p.value)),
    middleZone: middle.length ? mean(middle.map((p) => p.value)) : null,
    lateZone: mean(late.map((p) => p.value)),
  };
}

/** Least-squares slope of value vs. distance (units per meter) — the "rate of rise." */
function linearSlope(series: SeriesPoint[]): number | null {
  if (series.length < MIN_OBSERVATIONS_FOR_FINDING) return null;
  const mx = mean(series.map((p) => p.distanceM))!;
  const my = mean(series.map((p) => p.value))!;
  const denom = series.reduce((sum, p) => sum + (p.distanceM - mx) ** 2, 0);
  if (denom < 1e-9) return null;
  return series.reduce((sum, p) => sum + (p.distanceM - mx) * (p.value - my), 0) / denom;
}

function classifyTrend(zoneAverages: ZoneAverages): Trend {
  if (zoneAverages.earlyZone == null || zoneAverages.lateZone == null) return "insufficient_data";
  const range = Math.abs(zoneAverages.earlyZone) || 1;
  const relative = (zoneAverages.lateZone - zoneAverages.earlyZone) / range;
  if (relative > TREND_RELATIVE_THRESHOLD) return "rising";
  if (relative < -TREND_RELATIVE_THRESHOLD) return "falling";
  return "stable";
}

function classifySmoothness(series: SeriesPoint[]): Smoothness {
  if (series.length < MIN_OBSERVATIONS_FOR_FINDING) return "insufficient_data";
  const sorted = [...series].sort((a, b) => a.distanceM - b.distanceM);
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) deltas.push(Math.abs(sorted[i].value - sorted[i - 1].value));
  const avgAbs = mean(sorted.map((p) => Math.abs(p.value))) || 1;
  const deltaStd = stddev(deltas);
  return deltaStd / avgAbs > 0.35 ? "fluctuating" : "smooth";
}

function sideComparison(series: SeriesPoint[], meaningfulThreshold: number): SideComparison {
  const left = series.filter((p) => p.side === "left").map((p) => p.value);
  const right = series.filter((p) => p.side === "right").map((p) => p.value);
  const leftAverage = mean(left);
  const rightAverage = mean(right);
  const absoluteDifference = leftAverage != null && rightAverage != null ? Math.abs(leftAverage - rightAverage) : null;
  return {
    leftAverage,
    rightAverage,
    leftCount: left.length,
    rightCount: right.length,
    absoluteDifference,
    meaningful:
      left.length >= 2 &&
      right.length >= 2 &&
      absoluteDifference != null &&
      absoluteDifference >= meaningfulThreshold,
  };
}

function buildProgression(
  series: SeriesPoint[],
  meaningfulSideThreshold: number,
  findingsFor: (trend: Trend, smoothness: Smoothness, zoneAverages: ZoneAverages, side: SideComparison) => string[],
): MechanicalProgression {
  const zoneAverages = computeZoneAverages(series);
  const trend = classifyTrend(zoneAverages);
  const smoothness = classifySmoothness(series);
  const side = sideComparison(series, meaningfulSideThreshold);
  const changePerStep: { stepNumber: number; delta: number }[] = [];
  const sorted = [...series].sort((a, b) => a.stepNumber - b.stepNumber);
  for (let i = 1; i < sorted.length; i++) {
    changePerStep.push({ stepNumber: sorted[i].stepNumber, delta: sorted[i].value - sorted[i - 1].value });
  }
  return {
    series: sorted,
    changePerStep,
    zoneAverages,
    ratePerMeter: linearSlope(series),
    trend,
    smoothness,
    sideComparison: side,
    observationCount: series.length,
    findings: series.length >= MIN_OBSERVATIONS_FOR_FINDING ? findingsFor(trend, smoothness, zoneAverages, side) : [],
  };
}

/** Part 6 — trunk-angle progression. Athlete-/zone-relative language only;
 *  never claims a universal ideal, never implies "lower is always better." */
export function analyzeTrunkProgression(contacts: ContactMechanics[]): MechanicalProgression {
  const series = contacts
    .filter((c) => c.trunkAngleTouchdownDeg.value != null)
    .map((c) => ({
      stepNumber: c.stepNumber,
      distanceM: c.contactDistanceM,
      value: c.trunkAngleTouchdownDeg.value!,
      confidence: c.trunkAngleTouchdownDeg.confidence,
      side: c.side,
    }));
  return buildProgression(series, MEANINGFUL_SIDE_DIFFERENCE_DEG, (trend, smoothness, zoneAverages) => {
    const findings: string[] = [];
    if (zoneAverages.earlyZone != null && zoneAverages.earlyZone < 15) {
      findings.push("Trunk transition toward upright appears unusually early relative to this athlete's own zone.");
    }
    if (zoneAverages.lateZone != null && zoneAverages.lateZone > 35) {
      findings.push("Trunk remains angled forward later into the zone than this athlete's own early contacts.");
    }
    if (smoothness === "fluctuating") findings.push("Trunk angle varies substantially contact-to-contact rather than progressing smoothly.");
    else if (trend === "rising" && smoothness === "smooth") findings.push("Smooth, progressive rise toward upright posture across the zone.");
    if (trend === "insufficient_data") findings.push("Not enough reliable contacts to characterize the trend.");
    return findings;
  });
}

/** Part 7 — touchdown-position progression (normalized offset, forward = positive). */
export function analyzeTouchdownProgression(
  contacts: ContactMechanics[],
  useCenterOfMass: boolean,
): MechanicalProgression {
  const series = contacts
    .filter((c) => (useCenterOfMass ? c.touchdownOffsetFromCenterOfMass : c.touchdownOffsetFromPelvis).value != null)
    .map((c) => {
      const obs = useCenterOfMass ? c.touchdownOffsetFromCenterOfMass : c.touchdownOffsetFromPelvis;
      return { stepNumber: c.stepNumber, distanceM: c.contactDistanceM, value: obs.value!.normalizedOffset, confidence: obs.confidence, side: c.side };
    });
  return buildProgression(series, 0.02, (trend, smoothness, zoneAverages, side) => {
    const findings: string[] = [];
    if (zoneAverages.earlyZone != null && zoneAverages.earlyZone <= 0.01) {
      findings.push("Early contacts touch down appropriately behind or near the body.");
    }
    if (trend === "rising") findings.push("Touchdown reach ahead of the body increases later in the zone.");
    if (zoneAverages.lateZone != null && zoneAverages.lateZone > 0.04) {
      findings.push("Touchdown consistently projects ahead of the body later in the zone.");
    }
    if (side.meaningful) findings.push("Side-to-side touchdown placement differs by more than a trivial amount.");
    if (smoothness === "fluctuating") findings.push("Touchdown placement is inconsistent contact-to-contact rather than following a repeated pattern.");
    return findings;
  });
}

/** Part 8 — support-shin-angle progression. */
export function analyzeShinProgression(contacts: ContactMechanics[]): MechanicalProgression {
  const series = contacts
    .filter((c) => c.shinAngleTouchdownDeg.value != null)
    .map((c) => ({ stepNumber: c.stepNumber, distanceM: c.contactDistanceM, value: c.shinAngleTouchdownDeg.value!, confidence: c.shinAngleTouchdownDeg.confidence, side: c.side }));
  return buildProgression(series, MEANINGFUL_SIDE_DIFFERENCE_DEG, (trend, smoothness, zoneAverages, side) => {
    const findings: string[] = [];
    if (zoneAverages.earlyZone != null && zoneAverages.earlyZone > 10) findings.push("Shin orientation supports forward projection in early contacts.");
    if (zoneAverages.earlyZone != null && zoneAverages.earlyZone < 3) findings.push("Shin becomes close to vertical unusually early.");
    if (side.meaningful) findings.push("Left/right shin-angle difference exceeds the meaningful threshold.");
    if (smoothness === "fluctuating") findings.push("Shin positioning is inconsistent contact-to-contact.");
    return findings;
  });
}

/** Part 9 — pelvis-height progression (within-frame proxy; trend only, never an absolute reading). */
export function analyzePelvisProgression(contacts: ContactMechanics[]): MechanicalProgression {
  const series = contacts
    .filter((c) => c.pelvisHeightNormalized.value != null)
    .map((c) => ({ stepNumber: c.stepNumber, distanceM: c.contactDistanceM, value: c.pelvisHeightNormalized.value!, confidence: c.pelvisHeightNormalized.confidence, side: c.side }));
  return buildProgression(series, 0.02, (trend, smoothness) => {
    const findings: string[] = [];
    if (trend === "rising" && smoothness === "smooth") findings.push("Smooth rise in pelvis height through the zone.");
    if (trend === "rising" && smoothness === "fluctuating") findings.push("Pelvis height rises but with an abrupt or uneven pattern.");
    if (trend === "stable") findings.push("Limited pelvis-height rise across the observed contacts.");
    if (smoothness === "fluctuating") findings.push("Excessive contact-to-contact vertical variation relative to this athlete's own average.");
    return findings;
  });
}
