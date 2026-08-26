/**
 * Phase R4C — ground-truth error metrics (Parts G, H, K, L, M, N, O, P).
 * Pure functions only: given already-matched ground-truth and AVA numbers,
 * compute errors. Nothing here calls production analysis code or mutates
 * anything — see `scripts/validate-ground-truth-trial.mjs` for the runner
 * that supplies the inputs.
 */
import type { ContactMatch } from "@/lib/validation/groundTruthMatching";

export interface ErrorSample {
  label: string;
  errorAbs: number;
}

export interface ErrorSummary {
  n: number;
  mae: number | null;
  rmse: number | null;
  medianAbsError: number | null;
  p95AbsError: number | null;
  meanSignedBias: number | null;
  maxAbsError: number | null;
}

/** Part P — MAE, RMSE, median, p95, signed bias, max, over a set of signed errors (estimate − truth). */
export function summarizeErrors(signedErrors: number[]): ErrorSummary {
  const n = signedErrors.length;
  if (n === 0) {
    return { n: 0, mae: null, rmse: null, medianAbsError: null, p95AbsError: null, meanSignedBias: null, maxAbsError: null };
  }
  const abs = signedErrors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const mae = abs.reduce((s, v) => s + v, 0) / n;
  const rmse = Math.sqrt(signedErrors.reduce((s, v) => s + v * v, 0) / n);
  const median = abs.length % 2 === 1 ? abs[(abs.length - 1) / 2] : (abs[abs.length / 2 - 1] + abs[abs.length / 2]) / 2;
  const p95Index = Math.min(abs.length - 1, Math.ceil(0.95 * abs.length) - 1);
  const p95 = abs[Math.max(0, p95Index)];
  const bias = signedErrors.reduce((s, v) => s + v, 0) / n;
  const max = abs[abs.length - 1];
  return { n, mae, rmse, medianAbsError: median, p95AbsError: p95, meanSignedBias: bias, maxAbsError: max };
}

export type UncertaintyClassification = "WITHIN_GROUND_TRUTH_UNCERTAINTY" | "OUTSIDE_GROUND_TRUTH_UNCERTAINTY" | "UNCERTAINTY_UNKNOWN";

/** Part O — never imply false precision: no declared GT uncertainty means "unknown", not "exact." */
export function classifyAgainstUncertainty(errorAbs: number, gtUncertainty: number | null): UncertaintyClassification {
  if (gtUncertainty == null) return "UNCERTAINTY_UNKNOWN";
  return Math.abs(errorAbs) <= gtUncertainty ? "WITHIN_GROUND_TRUTH_UNCERTAINTY" : "OUTSIDE_GROUND_TRUTH_UNCERTAINTY";
}

export interface GroundTruthStepInterval {
  fromContactNumber: number;
  toContactNumber: number;
  gtStepLengthM: number;
}

/** Part G — GT_stepLength_i = s_GT(i) − s_GT(i−1), for consecutive numbered ground-truth contacts. */
export function computeGroundTruthStepLengths(contacts: { contactNumber: number; sGroundTruthM: number }[]): GroundTruthStepInterval[] {
  const sorted = [...contacts].sort((a, b) => a.contactNumber - b.contactNumber);
  const out: GroundTruthStepInterval[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].contactNumber !== sorted[i - 1].contactNumber + 1) continue; // only true consecutive contacts define a step
    out.push({ fromContactNumber: sorted[i - 1].contactNumber, toContactNumber: sorted[i].contactNumber, gtStepLengthM: sorted[i].sGroundTruthM - sorted[i - 1].sGroundTruthM });
  }
  return out;
}

export interface StepLengthErrorRow {
  fromContactNumber: number;
  toContactNumber: number;
  gtStepLengthM: number;
  modelStepLengthM: number | null;
  /** estimate − truth */
  errorM: number | null;
  errorCm: number | null;
  absErrorCm: number | null;
  percentError: number | null;
  comparable: boolean;
  reason?: string;
}

/**
 * Part G/I — aligns GT step intervals to a model's step lengths using ONLY
 * the pre-computed contact matches (never by searching for whichever AVA
 * interval minimizes error). An interval is only "comparable" when both its
 * endpoint GT contacts matched an AVA contact AND those two AVA contacts are
 * themselves adjacent in AVA's own step list (i.e. no missed/extra contact
 * sits between them on the AVA side) — otherwise the two intervals are not
 * measuring the same physical step and are marked non-comparable, not
 * force-aligned.
 */
export function alignStepLengthErrors(
  gtSteps: GroundTruthStepInterval[],
  matches: ContactMatch[],
  modelStepLengthByAvaIntervalKey: Map<string, number | null>,
): StepLengthErrorRow[] {
  const matchByGtNumber = new Map(matches.filter((m) => m.classification === "MATCHED" && m.gtContactNumber != null).map((m) => [m.gtContactNumber as number, m]));

  return gtSteps.map((step) => {
    const fromMatch = matchByGtNumber.get(step.fromContactNumber);
    const toMatch = matchByGtNumber.get(step.toContactNumber);
    if (!fromMatch || !toMatch || !fromMatch.avaContactId || !toMatch.avaContactId) {
      return { ...step, modelStepLengthM: null, errorM: null, errorCm: null, absErrorCm: null, percentError: null, comparable: false, reason: "one or both endpoint contacts unmatched" };
    }
    const key = `${fromMatch.avaContactId}->${toMatch.avaContactId}`;
    const modelStepLengthM = modelStepLengthByAvaIntervalKey.get(key) ?? null;
    if (modelStepLengthM == null) {
      return { ...step, modelStepLengthM: null, errorM: null, errorCm: null, absErrorCm: null, percentError: null, comparable: false, reason: "matched AVA contacts are not an adjacent AVA step interval (an unmatched contact likely sits between them)" };
    }
    const errorM = modelStepLengthM - step.gtStepLengthM;
    const percentError = step.gtStepLengthM !== 0 ? (Math.abs(errorM) / Math.abs(step.gtStepLengthM)) * 100 : null;
    return { ...step, modelStepLengthM, errorM, errorCm: errorM * 100, absErrorCm: Math.abs(errorM) * 100, percentError, comparable: true };
  });
}

export interface PositionErrorRow {
  gtContactNumber: number;
  avaContactId: string;
  sGroundTruthM: number;
  sAvaM: number;
  errorM: number;
  errorCm: number;
}

/**
 * Part H — positionError = s_AVA − s_GT, per matched contact. Only defined
 * for a model that has a native per-contact longitudinal coordinate.
 * LEGACY_2D has no such coordinate (it only ever computes pairwise 2D
 * distances between consecutive contacts) — callers must not invent one; see
 * the R4C report for why this asymmetry is itself a finding, not a gap to
 * paper over.
 */
export function computePositionErrors(
  gtContacts: { contactNumber: number; sGroundTruthM: number }[],
  matches: ContactMatch[],
  sAvaByContactId: Map<string, number | null>,
): PositionErrorRow[] {
  const gtByNumber = new Map(gtContacts.map((c) => [c.contactNumber, c.sGroundTruthM]));
  const rows: PositionErrorRow[] = [];
  for (const m of matches) {
    if (m.classification !== "MATCHED" || m.gtContactNumber == null || m.avaContactId == null) continue;
    const sGt = gtByNumber.get(m.gtContactNumber);
    const sAva = sAvaByContactId.get(m.avaContactId);
    if (sGt == null || sAva == null) continue;
    const errorM = sAva - sGt;
    rows.push({ gtContactNumber: m.gtContactNumber, avaContactId: m.avaContactId, sGroundTruthM: sGt, sAvaM: sAva, errorM, errorCm: errorM * 100 });
  }
  return rows;
}

export interface RateComparison {
  gtValue: number | null;
  avaValue: number | null;
  errorAbs: number | null;
  errorPercent: number | null;
  note?: string;
}

/** Part K — GT_frequency = numberOfIntervals / (tn − t0) over adjudicated ground-truth timestamps. */
export function computeGroundTruthFrequencyHz(gtContacts: { timestampS: number | null }[]): number | null {
  const times = gtContacts.map((c) => c.timestampS).filter((t): t is number => t != null).sort((a, b) => a - b);
  if (times.length < 2) return null;
  const span = times[times.length - 1] - times[0];
  if (span <= 0) return null;
  return (times.length - 1) / span;
}

function compareRate(gtValue: number | null, avaValue: number | null, note?: string): RateComparison {
  if (gtValue == null || avaValue == null) return { gtValue, avaValue, errorAbs: null, errorPercent: null, note };
  const errorAbs = avaValue - gtValue;
  const errorPercent = gtValue !== 0 ? (Math.abs(errorAbs) / Math.abs(gtValue)) * 100 : null;
  return { gtValue, avaValue, errorAbs, errorPercent, note };
}

export function compareStepFrequency(gtFrequencyHz: number | null, avaFrequencyHz: number | null): RateComparison {
  return compareRate(gtFrequencyHz, avaFrequencyHz, "Hz");
}

/** Part L — timing gate vs AVA entry/exit/zone time, reported in ms + %. */
export interface TimingComparisonRow {
  metric: "entryTime" | "exitTime" | "zoneTime";
  gtS: number | null;
  avaS: number | null;
  errorMs: number | null;
  errorPercent: number | null;
}
export function compareTiming(
  gt: { entryTimeS: number | null; exitTimeS: number | null; zoneTimeS: number | null },
  ava: { entryTimeS: number | null; exitTimeS: number | null; zoneTimeS: number | null },
): TimingComparisonRow[] {
  const rows: TimingComparisonRow[] = [];
  for (const metric of ["entryTime", "exitTime", "zoneTime"] as const) {
    const key = metric === "entryTime" ? "entryTimeS" : metric === "exitTime" ? "exitTimeS" : "zoneTimeS";
    const gtS = gt[key];
    const avaS = ava[key];
    if (gtS == null || avaS == null) {
      rows.push({ metric, gtS: gtS ?? null, avaS: avaS ?? null, errorMs: null, errorPercent: null });
      continue;
    }
    const errorS = avaS - gtS;
    rows.push({ metric, gtS, avaS, errorMs: errorS * 1000, errorPercent: gtS !== 0 ? (Math.abs(errorS) / Math.abs(gtS)) * 100 : null });
  }
  return rows;
}

/** Part M — GT_avgVelocity = zoneLength / independentZoneTime, vs AVA's zoneLength/zoneTime. */
export function compareAverageVelocity(zoneLengthMeters: number, gtZoneTimeS: number | null, avaZoneVelocityMps: number | null): RateComparison {
  const gtVelocity = gtZoneTimeS != null && gtZoneTimeS > 0 ? zoneLengthMeters / gtZoneTimeS : null;
  return compareRate(gtVelocity, avaZoneVelocityMps, "m/s — validates AVA's crossing-time estimation, since Average Velocity is already zoneLength/zoneTime on the AVA side");
}

export interface PeakVelocityValidation {
  available: boolean;
  reason: string;
  gtValueMps: number | null;
  avaValueMps: number | null;
  errorAbs: number | null;
  errorPercent: number | null;
}

/**
 * Part N — a full-zone timing gate does NOT independently establish peak
 * (instantaneous) velocity, and AVA's own output is never substituted as
 * truth. Only a trial that explicitly declares an independent peak-velocity
 * measurement (radar, laser, or a short high-resolution timing segment) can
 * produce a comparison; everything else returns `available: false`.
 */
export function comparePeakVelocity(
  gtPeak: { available: boolean; valueMps: number | null; method: string | null },
  avaPeakVelocityMps: number | null,
): PeakVelocityValidation {
  if (!gtPeak.available || gtPeak.valueMps == null) {
    return { available: false, reason: "no independent peak-velocity measurement supplied (a full-zone timing gate cannot establish this) — AVA's own value is not treated as ground truth", gtValueMps: null, avaValueMps: avaPeakVelocityMps, errorAbs: null, errorPercent: null };
  }
  if (!gtPeak.method || /ava/i.test(gtPeak.method)) {
    return { available: false, reason: "declared peak-velocity method is missing or references AVA itself — rejected as not independent", gtValueMps: gtPeak.valueMps, avaValueMps: avaPeakVelocityMps, errorAbs: null, errorPercent: null };
  }
  if (avaPeakVelocityMps == null) {
    return { available: false, reason: "AVA produced no peak velocity for this trial", gtValueMps: gtPeak.valueMps, avaValueMps: null, errorAbs: null, errorPercent: null };
  }
  const errorAbs = avaPeakVelocityMps - gtPeak.valueMps;
  return { available: true, reason: `independent measurement via ${gtPeak.method}`, gtValueMps: gtPeak.valueMps, avaValueMps: avaPeakVelocityMps, errorAbs, errorPercent: gtPeak.valueMps !== 0 ? (Math.abs(errorAbs) / Math.abs(gtPeak.valueMps)) * 100 : null };
}
