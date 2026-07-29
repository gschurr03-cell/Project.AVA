/**
 * Calibration authority (Part 1) — the ONE place that decides whether a timing
 * zone is auto, a manual draft, or manually confirmed, and how competing copies
 * merge. Pure & framework-free: no I/O, no coordinate math, no rounding.
 *
 * Why this exists: manually placed gates were drifting a few pixels after save and
 * again after reruns/FPS-normalization. Two causes were proven:
 *   1. The overlay drew a DERIVED geometry (`startBoundary.compensatedAnchorLine`,
 *      re-propagated by the camera model) in preference to the exact dragged
 *      `startGate.c1/c2`. See {@link selectRenderableGateGeometry}.
 *   2. Two sources of truth (session vs analysis-snapshot) could disagree. See
 *      {@link mergeCalibrationAuthority}.
 *
 * The authority rule is: manual_confirmed > manual_draft > auto, and within the
 * same source a higher `revision` wins. A manual_confirmed zone is never silently
 * downgraded to auto by an incoming auto/older payload.
 */

import type { CalibrationGates, CalibrationSource } from "./gates";
import { CALIBRATION_AUTHORITY_SCHEMA_VERSION } from "./gates";

/** Ordering used for authority comparisons. Higher wins. */
export const CALIBRATION_SOURCE_RANK: Record<CalibrationSource, number> = {
  auto: 0,
  manual_draft: 1,
  manual_confirmed: 2,
};

export interface CalibrationAuthority {
  source: CalibrationSource;
  /** Monotonic revision (falls back to the legacy `version`, else 0). */
  revision: number;
  confirmedAt: string | null;
  updatedAt: string | null;
}

/**
 * The single authority-decision function. Uses the explicit `calibrationSource`
 * when present; otherwise infers CONSERVATIVELY and deterministically from
 * existing evidence — a record whose two ground boundaries were `selectedByUser`
 * was placed and saved by a user (the only way `saveGateCalibration` stamps that
 * flag), which is sufficient evidence of a manual confirmation. Anything else is
 * treated as `auto`. Never guesses `manual_confirmed` without such evidence.
 */
export function calibrationAuthority(gates: CalibrationGates): CalibrationAuthority {
  const revision = gates.revision ?? gates.version ?? 0;
  const confirmedAt = gates.confirmedAt ?? null;
  const updatedAt = gates.updatedAt ?? null;

  if (gates.calibrationSource) {
    return { source: gates.calibrationSource, revision, confirmedAt, updatedAt };
  }

  const userPlaced =
    gates.startBoundary?.selectedByUser === true && gates.finishBoundary?.selectedByUser === true;
  if (userPlaced) {
    return { source: "manual_confirmed", revision, confirmedAt, updatedAt };
  }
  return { source: "auto", revision, confirmedAt: null, updatedAt };
}

/** The canonical raw geometry to render a manual-confirmed gate from directly. */
export interface CanonicalGateGeometry {
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  timeS: number;
  /** Immutable source frame the endpoints were placed in, for authoritative reprojection. */
  setupFrameIndex?: number;
}

/**
 * The rendering selector. For `manual_confirmed`, the overlay MUST draw from the
 * exact persisted `startGate/finishGate.c1/c2 + timeS` (canonical raw) and never
 * from the derived boundary/migrated geometry — this is what stops the post-save
 * pixel shift. For anything else it keeps the existing derived-priority chain.
 *
 * Pure and stable: identical input → identical output on every call and hydration.
 */
export type RenderableGateDirective =
  | {
      mode: "canonical_raw";
      reason: "manual_confirmed";
      start: CanonicalGateGeometry;
      finish: CanonicalGateGeometry;
    }
  | { mode: "derived_priority"; reason: CalibrationSource };

export function selectRenderableGateGeometry(gates: CalibrationGates): RenderableGateDirective {
  const { source } = calibrationAuthority(gates);
  if (source === "manual_confirmed") {
    return {
      mode: "canonical_raw",
      reason: "manual_confirmed",
      start: { c1: gates.startGate.c1, c2: gates.startGate.c2, timeS: gates.startGate.timeS, setupFrameIndex: gates.startGate.setupFrameIndex },
      finish: { c1: gates.finishGate.c1, c2: gates.finishGate.c2, timeS: gates.finishGate.timeS, setupFrameIndex: gates.finishGate.setupFrameIndex },
    };
  }
  return { mode: "derived_priority", reason: source };
}

/**
 * Merge two calibration copies into the authoritative one. Guarantees:
 *  - higher authority wins (manual_confirmed never downgraded by auto);
 *  - within equal authority, the higher revision wins;
 *  - equal authority + equal revision keeps `current` (idempotent, stable);
 *  - a stale/out-of-order incoming copy can never overwrite a newer one.
 */
export function mergeCalibrationAuthority(
  current: CalibrationGates | null,
  incoming: CalibrationGates | null,
): CalibrationGates | null {
  if (!current) return incoming;
  if (!incoming) return current;
  const a = calibrationAuthority(current);
  const b = calibrationAuthority(incoming);
  const rankA = CALIBRATION_SOURCE_RANK[a.source];
  const rankB = CALIBRATION_SOURCE_RANK[b.source];
  if (rankB > rankA) return incoming;
  if (rankB < rankA) return current;
  return b.revision > a.revision ? incoming : current;
}

/**
 * Stamp an explicit authority onto a legacy record WITHOUT touching coordinates.
 * Idempotent: a record that already carries `calibrationSource` is returned
 * unchanged. Deterministic: the inferred source/revision come only from existing
 * evidence via {@link calibrationAuthority}.
 */
export function normalizeCalibrationAuthority(gates: CalibrationGates): CalibrationGates {
  if (gates.calibrationSource) return gates;
  const { source, revision } = calibrationAuthority(gates);
  return {
    ...gates,
    calibrationSource: source,
    revision,
    authoritySchemaVersion: CALIBRATION_AUTHORITY_SCHEMA_VERSION,
  };
}

/**
 * Build the authority fields for a fresh manual confirmation (used by the save
 * action). `revision` is the caller's monotonic version; `now` is injected for
 * deterministic tests.
 */
export function manualConfirmedAuthorityFields(revision: number, now: Date = new Date()): {
  calibrationSource: CalibrationSource;
  confirmedAt: string;
  updatedAt: string;
  revision: number;
  authoritySchemaVersion: typeof CALIBRATION_AUTHORITY_SCHEMA_VERSION;
} {
  const iso = now.toISOString();
  return {
    calibrationSource: "manual_confirmed",
    confirmedAt: iso,
    updatedAt: iso,
    revision,
    authoritySchemaVersion: CALIBRATION_AUTHORITY_SCHEMA_VERSION,
  };
}
