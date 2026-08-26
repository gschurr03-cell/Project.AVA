/**
 * Missing-contact integrity check (Day 103) — a shared, pure guard against
 * reporting a merged-contact interval as a single step.
 *
 * Real root cause (Day 103 audit, Vanni 240fps clip): when the athlete
 * tracker's acquisition corridor let evidence begin only deep into the run,
 * a real gap in detected contacts (e.g. right@1544 -> left@1646, 425ms/102
 * frames apart, in a run where only 3 raw contacts exist at all) was reported
 * as one 7.19m "step" — physically impossible for a single ground contact,
 * because a real intermediate opposite-foot contact almost certainly
 * occurred in that window and was never detected. Neither call site that
 * turns contact gaps into step lengths (`zoneStepAnalysis.ts`'s canonical
 * interval path, `measurements.ts`'s legacy two-point fallback path) had any
 * check for this — a large gap between two otherwise-valid contacts was
 * indistinguishable from a genuine long step.
 *
 * This module does not invent a missing contact's position — a rejected
 * interval is reported as unavailable (with a reason), never as a guessed
 * value. Pure, deterministic, no I/O.
 */

// Mirrors `SprintAnalyzer.ts`'s existing DEFAULT_MIN/MAX_PLAUSIBLE_STEP_MS
// (150-320ms), duplicated here rather than imported: that module is worker-
// side cadence classification, this is a pure client-safe presentation
// check. Same physical constant (a single ground-contact-to-ground-contact
// interval for one step), kept in sync by this comment, not the import graph.
export const MIN_PLAUSIBLE_STEP_DURATION_S = 0.15;
export const MAX_PLAUSIBLE_STEP_DURATION_S = 0.32;

// A gap long enough to plausibly contain a SECOND full step's worth of time
// is a structural signal that a real intermediate foot-strike was missed —
// a stronger, more specific claim than merely "slower than usual"
// (`implausible_step_duration`). Two full plausible-step durations, not one,
// because the gap must have room for an entire extra contact-to-contact
// interval, not just extra slack on the one being measured.
const MISSING_CONTACT_DURATION_S = MAX_PLAUSIBLE_STEP_DURATION_S * 2;

// Evidence-based ceiling (Part 7): an interval may not exceed this multiple
// of the athlete's OWN other measured step lengths in the same run — real
// step-to-step variation is small; a sudden multiple of it is not "a long
// step," it is missing evidence. Falls back to a fixed, generous physical
// ceiling only when there is no other in-run evidence yet to compare
// against (e.g. the very first interval) — elite sprint step lengths rarely
// exceed ~2.8m, so 3.0m is deliberately generous, not tuned to any one clip.
const NEIGHBOR_CEILING_MULTIPLE = 1.6;
const FALLBACK_DISTANCE_CEILING_M = 3.0;

export type StepIntegrityReason =
  | "missing_intermediate_contact"
  | "contact_sequence_gap"
  | "implausible_step_duration"
  | "implausible_step_distance"
  | "foot_sequence_discontinuity";

export interface StepIntegrityInput {
  fromSide: "left" | "right";
  toSide: "left" | "right";
  durationS: number;
  distanceM: number;
  /**
   * Other already-accepted interval lengths (metres) from the same run,
   * EXCLUDING this one — used only to derive the evidence-based ceiling.
   */
  neighborDistancesM?: number[];
}

export interface StepIntegrityResult {
  valid: boolean;
  reasons: StepIntegrityReason[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type AggregateStepIntegrityReason = "sparse_contact_evidence";

export interface AggregateStepLengthResult {
  valid: boolean;
  reason: AggregateStepIntegrityReason | null;
  ceilingM: number;
}

/**
 * Day 104 (Part 6) — guards a naive "zone distance ÷ contact count" aggregate
 * (measurements.ts's `avgZoneStepLengthM` "Method 1" fallback, used when
 * per-interval `zoneStepSummary` evidence isn't available) against exactly
 * the failure `evaluateStepInterval` already guards individual intervals
 * against: when real contacts are sparse (fragmented pose evidence, e.g. the
 * real Vanni 60fps clip), dividing the WHOLE zone distance by too few
 * contacts silently inflates the implied average step length — the same
 * "missing evidence, not a long step" problem, just at the aggregate level.
 * Explicitly flagged as unprotected in the Day 103 report; fixed here by
 * reusing the exact same evidence-based ceiling (median of the run's own
 * already-validated interval lengths × 1.6, or the same generous 3.0m
 * physical fallback) rather than inventing a separate threshold.
 */
export function evaluateAggregateStepLength(
  candidateM: number,
  neighborDistancesM: number[] = [],
): AggregateStepLengthResult {
  const neighbors = neighborDistancesM.filter((value) => Number.isFinite(value) && value > 0);
  const neighborMedian = median(neighbors);
  const ceilingM =
    neighborMedian != null
      ? Math.max(FALLBACK_DISTANCE_CEILING_M * 0.5, neighborMedian * NEIGHBOR_CEILING_MULTIPLE)
      : FALLBACK_DISTANCE_CEILING_M;
  if (!Number.isFinite(candidateM) || candidateM <= 0 || candidateM > ceilingM) {
    return { valid: false, reason: "sparse_contact_evidence", ceilingM };
  }
  return { valid: true, reason: null, ceilingM };
}

/**
 * Evaluate one contact-to-contact interval for integrity. Never guesses a
 * missing contact's position — only decides whether this interval is
 * trustworthy enough to report as a single step.
 */
export function evaluateStepInterval(input: StepIntegrityInput): StepIntegrityResult {
  const reasons: StepIntegrityReason[] = [];

  if (input.fromSide === input.toSide) {
    reasons.push("foot_sequence_discontinuity");
  }

  if (input.durationS > MISSING_CONTACT_DURATION_S) {
    reasons.push("missing_intermediate_contact");
    reasons.push("contact_sequence_gap");
  } else if (input.durationS > MAX_PLAUSIBLE_STEP_DURATION_S) {
    reasons.push("implausible_step_duration");
  }

  const neighbors = (input.neighborDistancesM ?? []).filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  const neighborMedian = median(neighbors);
  const ceiling =
    neighborMedian != null
      ? Math.max(FALLBACK_DISTANCE_CEILING_M * 0.5, neighborMedian * NEIGHBOR_CEILING_MULTIPLE)
      : FALLBACK_DISTANCE_CEILING_M;
  if (input.distanceM > ceiling) {
    reasons.push("implausible_step_distance");
  }

  return { valid: reasons.length === 0, reasons };
}
