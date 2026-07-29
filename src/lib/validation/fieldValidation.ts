/**
 * Field validation (Day 77) — compare AVA's measured numbers against real-world
 * ground truth from a timing-gate + tape-grid trial. PURE and reporting-only: it
 * never changes analysis math, it only computes error rows. Reused by the
 * `field-validation` script today and available to a dev-only panel later.
 *
 * Definitional care (so no comparison is misleading):
 *  - VELOCITY is compared as distance ÷ time on both sides.
 *  - CADENCE is compared as contacts ÷ gate-time on BOTH sides — the same formula —
 *    so a hand count over the gate interval is apples-to-apples. This deliberately
 *    differs from AVA's *displayed* combined frequency (which uses the contact-to-
 *    contact span, not the gate time); that headline value is surfaced as context,
 *    not scored, to avoid a fake error from mixing definitions.
 */

export type ValidationUnit = "s" | "m/s" | "count" | "Hz" | "m";

/** Ground truth a coach can actually capture on testing day. All optional so the
 *  report degrades gracefully to whatever was measured. */
export interface FieldTruth {
  label?: string;
  /** Gate-to-gate distance; defaults to AVA's zone distance when omitted. */
  zoneDistanceM?: number | null;
  /** Timing-gate (Freelap/OVR) result for the zone. */
  gateTimeS?: number | null;
  gateSystem?: string | null;
  /** Foot ground-contacts hand-counted through the zone. */
  manualStepCount?: number | null;
  /** Per-step lengths read off 0.5 m tape-grid marks, oldest→newest. */
  manualStepLengthsM?: number[] | null;
}

/** The AVA-side numbers to grade — a flat, source-agnostic view (a script recompute
 *  or a stored analysis can both produce this). */
export interface AvaObserved {
  zoneTimeS: number | null;
  zoneDistanceM: number | null;
  zoneVelocityMps: number | null;
  validContacts: number | null;
  /** AVA's DISPLAYED combined frequency (contact-span definition) — context only. */
  combinedStepFrequencyHz: number | null;
  avgIndividualStepLengthM: number | null;
  /** Per in-zone step, contact-to-contact, oldest→newest. */
  stepLengthsM: number[];
}

export interface ValidationRow {
  metric: string;
  unit: ValidationUnit;
  ava: number | null;
  truth: number | null;
  /** ava − truth, in the row's unit. */
  errorAbs: number | null;
  errorPct: number | null;
  note?: string;
}

export interface StepValidationRow {
  index: number;
  ava: number | null;
  truth: number | null;
  errorM: number | null;
  errorCm: number | null;
  errorPct: number | null;
}

export interface FieldValidationReport {
  label: string;
  rows: ValidationRow[];
  steps: StepValidationRow[];
  /** AVA's displayed combined frequency, shown for context (not scored). */
  displayedFrequencyHz: number | null;
  summary: {
    pairedSteps: number;
    meanAbsStepErrorCm: number | null;
    maxAbsStepErrorCm: number | null;
  };
  /** What truth data was missing (so a partial trial is transparent, not silent). */
  gaps: string[];
}

function pct(errorAbs: number | null, truth: number | null): number | null {
  if (errorAbs == null || truth == null || truth === 0) return null;
  return (errorAbs / Math.abs(truth)) * 100;
}

function mean(a: number[]): number | null {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}

/**
 * Build the field-validation report. Pure — no I/O, inputs untouched. Rows appear
 * only when both the AVA value and the corresponding ground truth exist; anything
 * missing is recorded in `gaps` instead of producing a null/misleading row.
 */
export function buildFieldValidation(ava: AvaObserved, truth: FieldTruth): FieldValidationReport {
  const rows: ValidationRow[] = [];
  const gaps: string[] = [];
  const zoneDistanceM = truth.zoneDistanceM ?? ava.zoneDistanceM ?? null;

  // Zone time — AVA vs the timing gate.
  if (ava.zoneTimeS != null && truth.gateTimeS != null) {
    const err = ava.zoneTimeS - truth.gateTimeS;
    rows.push({
      metric: `Zone time${truth.gateSystem ? ` (vs ${truth.gateSystem})` : ""}`,
      unit: "s",
      ava: ava.zoneTimeS,
      truth: truth.gateTimeS,
      errorAbs: err,
      errorPct: pct(err, truth.gateTimeS),
    });
  } else if (truth.gateTimeS == null) {
    gaps.push("No timing-gate result entered — zone time and gate velocity not validated.");
  }

  // Average velocity — AVA vs distance ÷ gate time.
  if (ava.zoneVelocityMps != null && truth.gateTimeS != null && zoneDistanceM != null) {
    const gateVel = zoneDistanceM / truth.gateTimeS;
    const err = ava.zoneVelocityMps - gateVel;
    rows.push({
      metric: "Average velocity",
      unit: "m/s",
      ava: ava.zoneVelocityMps,
      truth: gateVel,
      errorAbs: err,
      errorPct: pct(err, gateVel),
      note: `gate velocity = ${zoneDistanceM} m ÷ ${truth.gateTimeS} s`,
    });
  }

  // Contact count — AVA vs hand count.
  if (ava.validContacts != null && truth.manualStepCount != null) {
    const err = ava.validContacts - truth.manualStepCount;
    rows.push({
      metric: "In-zone contact count",
      unit: "count",
      ava: ava.validContacts,
      truth: truth.manualStepCount,
      errorAbs: err,
      errorPct: pct(err, truth.manualStepCount),
    });
  } else if (truth.manualStepCount == null) {
    gaps.push("No manual step count entered — contact count and cadence not validated.");
  }

  // Cadence — contacts ÷ gate time on BOTH sides (apples-to-apples; see file header).
  if (ava.validContacts != null && truth.gateTimeS != null && truth.manualStepCount != null) {
    const avaCadence = ava.validContacts / truth.gateTimeS;
    const manualCadence = truth.manualStepCount / truth.gateTimeS;
    const err = avaCadence - manualCadence;
    rows.push({
      metric: "Cadence (contacts ÷ gate time)",
      unit: "Hz",
      ava: avaCadence,
      truth: manualCadence,
      errorAbs: err,
      errorPct: pct(err, manualCadence),
      note: "same formula both sides; differs from AVA's displayed combined frequency (contact-span based)",
    });
  }

  // Average step length — AVA vs mean of tape-grid steps.
  const manualLengths = truth.manualStepLengthsM ?? null;
  if (ava.avgIndividualStepLengthM != null && manualLengths && manualLengths.length > 0) {
    const truthMean = mean(manualLengths);
    if (truthMean != null) {
      const err = ava.avgIndividualStepLengthM - truthMean;
      rows.push({
        metric: "Average step length",
        unit: "m",
        ava: ava.avgIndividualStepLengthM,
        truth: truthMean,
        errorAbs: err,
        errorPct: pct(err, truthMean),
      });
    }
  } else if (!manualLengths || manualLengths.length === 0) {
    gaps.push("No manual tape-grid step lengths entered — per-step accuracy not validated.");
  }

  // Per-step lengths — AVA vs tape grid, aligned by index.
  const steps: StepValidationRow[] = [];
  if (manualLengths && manualLengths.length > 0) {
    const n = Math.max(ava.stepLengthsM.length, manualLengths.length);
    for (let i = 0; i < n; i++) {
      const a = ava.stepLengthsM[i] ?? null;
      const t = manualLengths[i] ?? null;
      const errM = a != null && t != null ? a - t : null;
      steps.push({
        index: i + 1,
        ava: a,
        truth: t,
        errorM: errM,
        errorCm: errM != null ? errM * 100 : null,
        errorPct: pct(errM, t),
      });
    }
    if (ava.stepLengthsM.length !== manualLengths.length) {
      gaps.push(
        `Step count differs — AVA ${ava.stepLengthsM.length} vs manual ${manualLengths.length}; per-step rows are index-aligned and may be offset by a boundary step.`,
      );
    }
  }

  const stepErrsCm = steps
    .map((s) => (s.errorCm == null ? null : Math.abs(s.errorCm)))
    .filter((v): v is number => v != null);

  return {
    label: truth.label ?? "Field trial",
    rows,
    steps,
    displayedFrequencyHz: ava.combinedStepFrequencyHz,
    summary: {
      pairedSteps: stepErrsCm.length,
      meanAbsStepErrorCm: mean(stepErrsCm),
      maxAbsStepErrorCm: stepErrsCm.length ? Math.max(...stepErrsCm) : null,
    },
    gaps,
  };
}
