/**
 * Calibration lifecycle (Part 1 completion) — the pure, deterministic logic for:
 *   • rejecting stale worker results against a newer calibration revision (§4);
 *   • classifying whether current analysis outputs are current/superseded/pending (§9/§11);
 *   • deciding whether a recompute must be enqueued, idempotently (§10);
 *   • the Reset-to-Auto authority transition (§6).
 *
 * No I/O, no coordinate math. Anchoring/authority live in `./authority`; this is
 * the layer above them that governs result freshness and recomputation.
 */

import type { CalibrationGates, CalibrationSource } from "./gates";
import { CALIBRATION_AUTHORITY_SCHEMA_VERSION } from "./gates";
import { calibrationAuthority } from "./authority";

export type CalibrationResultStatus = "current" | "superseded" | "pending";

/** The revision a gates payload represents (authority revision → legacy version → 0). */
export function calibrationRevisionOf(gates: CalibrationGates | null | undefined): number {
  if (!gates) return 0;
  return calibrationAuthority(gates).revision;
}

/**
 * Every output whose meaning depends on the timing zone. A calibration change
 * must mark ALL of these stale rather than clearing fields ad hoc — this is the
 * single dependency boundary (§9).
 */
export const CALIBRATION_DEPENDENT_OUTPUTS = [
  "zoneStart",
  "zoneFinish",
  "zoneDuration",
  "averageVelocity",
  "peakVelocity",
  "inZoneSteps",
  "stepCount",
  "strideLength",
  "strideFrequency",
  "strideRetention",
  "asymmetry",
  "evidenceClips",
  "recommendationInputs",
  "coachingRecommendations",
  "confidence",
  "provenance",
  "generatedAt",
] as const;
export type CalibrationDependentOutput = (typeof CALIBRATION_DEPENDENT_OUTPUTS)[number];

const DEPENDENT = new Set<string>(CALIBRATION_DEPENDENT_OUTPUTS);
export function isCalibrationDependent(field: string): boolean {
  return DEPENDENT.has(field);
}

/**
 * Classify an analysis result against the CURRENT durable calibration revision.
 * Guarantees a revision-4 result can never be shown as current once revision 5 is
 * confirmed (§4): an older-revision result is `superseded`; a run that has not
 * produced a current-revision result yet is `pending`.
 *
 * `resultCalibrationRevision` is read from the RESULT's own input snapshot
 * (`input_snapshot.session.calibrationInputs.gates`), so it is intrinsically tied
 * to the calibration the run used. A legacy result without a revision link is
 * treated as revision 0, so it is only ever `current` when calibration is also
 * un-revised (0) — never falsely current after a manual confirmation.
 */
export function classifyResultStatus(input: {
  hasResult: boolean;
  resultCalibrationRevision: number | null;
  currentCalibrationRevision: number;
  recomputePending?: boolean;
}): CalibrationResultStatus {
  if (input.recomputePending) return "pending";
  if (!input.hasResult) return "pending";
  const resultRev = input.resultCalibrationRevision ?? 0;
  if (resultRev === input.currentCalibrationRevision) return "current";
  if (resultRev < input.currentCalibrationRevision) return "superseded";
  // resultRev > current should not happen; treat defensively as current (no crash).
  return "current";
}

/** A revision-N result may only become the authoritative current result for revision N. */
export function acceptResultForCurrentRevision(
  resultCalibrationRevision: number | null,
  currentCalibrationRevision: number,
): boolean {
  return (resultCalibrationRevision ?? 0) === currentCalibrationRevision;
}

/**
 * Decide whether a recompute must be enqueued. Idempotent: repeated saves/polls at
 * the same revision never enqueue a duplicate — a job (or completed result) already
 * covering the current revision is sufficient (§10).
 */
export function shouldEnqueueRecompute(input: {
  currentCalibrationRevision: number;
  runningJobRevision: number | null;
  latestResultRevision: number | null;
}): boolean {
  if (input.runningJobRevision === input.currentCalibrationRevision) return false;
  if (input.latestResultRevision === input.currentCalibrationRevision) return false;
  return true;
}

/** Provenance recorded on / derivable for every current result (§11). */
export interface CalibrationResultProvenance {
  calibrationRevision: number;
  calibrationSource: CalibrationSource;
  authoritySchemaVersion: string | null;
  status: CalibrationResultStatus;
}

export function buildResultProvenance(
  currentGates: CalibrationGates | null,
  resultCalibrationRevision: number | null,
  opts: { hasResult: boolean; recomputePending?: boolean },
): CalibrationResultProvenance {
  const auth = currentGates ? calibrationAuthority(currentGates) : null;
  return {
    calibrationRevision: auth?.revision ?? 0,
    calibrationSource: auth?.source ?? "auto",
    authoritySchemaVersion: currentGates?.authoritySchemaVersion ?? null,
    status: classifyResultStatus({
      hasResult: opts.hasResult,
      resultCalibrationRevision,
      currentCalibrationRevision: auth?.revision ?? 0,
      recomputePending: opts.recomputePending,
    }),
  };
}

/**
 * The explicit Reset-to-Auto authority transition (§6). Supersedes the manual
 * zone: source → auto, revision incremented, prior manual revision/source recorded
 * for provenance, confirmation cleared. Coordinates are left in place for a
 * re-detect run to replace; nothing is deleted. Pure; `now` injected for tests.
 */
export function resetToAutoAuthority(current: CalibrationGates, now: Date = new Date()): CalibrationGates {
  const prior = calibrationAuthority(current);
  return {
    ...current,
    calibrationSource: "auto",
    revision: prior.revision + 1,
    updatedAt: now.toISOString(),
    confirmedAt: undefined,
    authoritySchemaVersion: CALIBRATION_AUTHORITY_SCHEMA_VERSION,
    supersededFromRevision: prior.revision,
    supersededFromSource: prior.source,
  };
}
