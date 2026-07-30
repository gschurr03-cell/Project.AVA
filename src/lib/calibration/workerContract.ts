/**
 * Worker-side calibration contract (Part 1, §1). The analysis worker must
 * EXPLICITLY read and validate the calibration a run was queued with — not merely
 * assume the fields exist in `input_snapshot`. This validates the payload, surfaces
 * the authority (source/revision/schema/confirmedAt), preserves full coordinate
 * precision, and produces the provenance the worker persists onto the result and
 * logs in structured diagnostics.
 *
 * Pure & framework-free: safe to compile into the worker and to unit-test directly.
 */

import { calibrationGatesSchema, type CalibrationGates, type CalibrationSource } from "./gates";
import { calibrationAuthority } from "./authority";

export interface WorkerCalibration {
  source: CalibrationSource;
  revision: number;
  authoritySchemaVersion: string | null;
  confirmedAt: string | null;
  /** Exact, full-precision canonical gate geometry the run must use. */
  startGate: CalibrationGates["startGate"];
  finishGate: CalibrationGates["finishGate"];
  distanceM: number;
  cameraType: "stationary" | "panning";
  referenceFrameIndex: number;
  cameraTrackingSummary: CalibrationGates["cameraTrackingSummary"] | null;
  /** True when a manual-confirmed zone is authoritative over any auto detection. */
  manualAuthoritative: boolean;
  gates: CalibrationGates;
}

export class WorkerCalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerCalibrationError";
  }
}

/**
 * Parse + validate the calibration from a queued run's input snapshot
 * (`input_snapshot.session.calibrationInputs.gates`). Throws a controlled
 * {@link WorkerCalibrationError} on a malformed payload so the worker can fail the
 * job cleanly rather than proceed on bad geometry. Returns `null` when no
 * calibration was provided (uncalibrated run — a valid, non-error case).
 */
export function parseWorkerCalibration(rawGates: unknown): WorkerCalibration | null {
  if (rawGates == null) return null;
  const parsed = calibrationGatesSchema.safeParse(rawGates);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new WorkerCalibrationError(
      `invalid calibration payload at ${issue?.path.join(".") || "<root>"}: ${issue?.message ?? "unknown"}`,
    );
  }
  const gates = parsed.data;
  const authority = calibrationAuthority(gates);
  return {
    source: authority.source,
    revision: authority.revision,
    authoritySchemaVersion: gates.authoritySchemaVersion ?? null,
    confirmedAt: authority.confirmedAt,
    startGate: gates.startGate,
    finishGate: gates.finishGate,
    distanceM: gates.distanceM,
    cameraType: gates.cameraType ?? "stationary",
    referenceFrameIndex: gates.referenceFrameIndex ?? 0,
    cameraTrackingSummary: gates.cameraTrackingSummary ?? null,
    manualAuthoritative: authority.source === "manual_confirmed",
    gates,
  };
}

/** The provenance the worker persists onto a result so it can be classified later. */
export interface WorkerResultCalibrationProvenance {
  calibrationRevision: number;
  calibrationSource: CalibrationSource;
  authoritySchemaVersion: string | null;
  confirmedAt: string | null;
  cameraType: "stationary" | "panning";
  referenceFrameIndex: number;
  cameraTrackingSummary: CalibrationGates["cameraTrackingSummary"] | null;
}

export function workerResultProvenance(calibration: WorkerCalibration): WorkerResultCalibrationProvenance {
  return {
    calibrationRevision: calibration.revision,
    calibrationSource: calibration.source,
    authoritySchemaVersion: calibration.authoritySchemaVersion,
    confirmedAt: calibration.confirmedAt,
    cameraType: calibration.cameraType,
    referenceFrameIndex: calibration.referenceFrameIndex,
    cameraTrackingSummary: calibration.cameraTrackingSummary,
  };
}

/**
 * A safe, secrets-free one-line diagnostic for structured worker logs. Emits only
 * authority metadata + geometry summary — never URLs, tokens, keys, or raw payload.
 */
export function workerCalibrationLogLine(calibration: WorkerCalibration | null): Record<string, unknown> {
  if (!calibration) return { calibration: "none", manualAuthoritative: false };
  return {
    calibrationSource: calibration.source,
    calibrationRevision: calibration.revision,
    authoritySchemaVersion: calibration.authoritySchemaVersion,
    manualAuthoritative: calibration.manualAuthoritative,
    distanceM: calibration.distanceM,
    cameraType: calibration.cameraType,
    referenceFrameIndex: calibration.referenceFrameIndex,
    startMidX: (calibration.startGate.c1.x + calibration.startGate.c2.x) / 2,
    finishMidX: (calibration.finishGate.c1.x + calibration.finishGate.c2.x) / 2,
  };
}
