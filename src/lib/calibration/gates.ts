/**
 * Timing-gate bar calibration (Day 66) — the coach marks two physical timing
 * gates on the track, each a BAR drawn cone-to-cone across the lane:
 *
 *   Start gate  = bar from yellow cone → yellow cone (at the start of the 20 m)
 *   Finish gate = bar from yellow cone → yellow cone (at the end of the 20 m)
 *
 * The known distance (e.g. 20 m) is the gap between the two gates. This supersedes
 * the old two-floating-points workflow: gates now look like real electronic timing
 * bars, and the run is timed by the athlete's TORSO crossing each bar.
 *
 * A gate bar is stored as its two clicked cone points (normalized to the source
 * frame) plus the clip time it was placed (so world-anchoring can account for any
 * camera motion). Each gate reduces to a single representative x — the midpoint of
 * its two cones — which is exactly the two-point {@link ManualCalibrationPoints}
 * the measurement + benchmark engines already consume, so all downstream maths
 * (scale, zone, velocity, benchmark) is unchanged; only the INPUT is richer.
 *
 * Pure & framework-free.
 */

import { z } from "zod";

import type { ManualCalibrationPoints } from "./index";
import { groundBoundarySchema, GROUND_ANCHOR_SCHEMA_VERSION } from "./zoneAnchors";
import { WORLD_COORDINATE_SCHEMA_VERSION } from "../video/worldProjection";
import { manualCameraPathRepairSchema } from "../video/cameraPathSchema";

const gatePointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type GatePoint = z.infer<typeof gatePointSchema>;

const gateBarSchema = z.object({
  /** The two cones the bar is drawn between (normalized frame coords). */
  c1: gatePointSchema,
  c2: gatePointSchema,
  /** Clip time (seconds) the gate was placed. */
  timeS: z.number().min(0),
  setupFrameIndex: z.number().int().nonnegative().optional(),
});
export type GateBar = z.infer<typeof gateBarSchema>;

/** Two timing-gate bars a known distance apart. Stored as `sessions.calibration_gates` (jsonb). */
export const CALIBRATION_AUTHORITY_SCHEMA_VERSION = "ava-calibration-authority-v1" as const;

/**
 * Explicit calibration authority (Part 1). Ordered `auto < manual_draft <
 * manual_confirmed`. A `manual_confirmed` zone is canonical: refresh, polling,
 * worker completion, rerun, resize, and FPS normalization must never move or
 * replace it — only an explicit Reset-to-Auto / Re-detect may. See
 * `@/lib/calibration/authority`.
 */
export const calibrationSourceSchema = z.enum(["auto", "manual_draft", "manual_confirmed"]);
export type CalibrationSource = z.infer<typeof calibrationSourceSchema>;
export const calibrationCameraTypeSchema = z.enum(["stationary", "panning"]);
export type CalibrationCameraType = z.infer<typeof calibrationCameraTypeSchema>;
export const cameraTrackingSummarySchema = z.object({
  methodVersion: z.string().min(1),
  transformCount: z.number().int().nonnegative(),
  reliableTransformCount: z.number().int().nonnegative(),
  reliabilityRatio: z.number().min(0).max(1),
  meanFeatureCount: z.number().nonnegative(),
  meanInlierRatio: z.number().min(0).max(1),
  p95ReprojectionErrorPx: z.number().nonnegative().nullable(),
  lastReliableFrame: z.number().int().nonnegative().nullable(),
  longestLostRunFrames: z.number().int().nonnegative(),
  reviewed: z.boolean().default(false),
});
export type CameraTrackingSummary = z.infer<typeof cameraTrackingSummarySchema>;

export const calibrationGatesSchema = z.object({
  startGate: gateBarSchema,
  finishGate: gateBarSchema,
  distanceM: z.number().positive(),
  zoneDistanceMeters: z.number().positive().optional(),
  startGateId: z.string().min(1).optional(),
  finishGateId: z.string().min(1).optional(),
  connectedZoneVisualizationDeprecated: z.boolean().optional(),
  schemaVersion: z.literal(GROUND_ANCHOR_SCHEMA_VERSION).optional(),
  version: z.number().int().positive().optional(),
  travelDirection: z.enum(["left_to_right", "right_to_left"]).optional(),
  bodyReference: z.enum(["torso", "hips", "head"]).optional(),
  startBoundary: groundBoundarySchema.optional(),
  finishBoundary: groundBoundarySchema.optional(),
  // --- Authority metadata (Part 1) — all optional so legacy records still parse.
  // Carried inside the calibration_gates jsonb, so NO database migration is needed.
  calibrationSource: calibrationSourceSchema.optional(),
  /** ISO-8601 UTC time the user confirmed the manual zone. */
  confirmedAt: z.string().datetime().optional(),
  /** ISO-8601 UTC time of the last authority write. */
  updatedAt: z.string().datetime().optional(),
  /** Monotonic authority revision; stale (lower) writes must not overwrite newer. */
  revision: z.number().int().nonnegative().optional(),
  authoritySchemaVersion: z.literal(CALIBRATION_AUTHORITY_SCHEMA_VERSION).optional(),
  coordinateSchemaVersion: z.literal(WORLD_COORDINATE_SCHEMA_VERSION).optional(),
  cameraType: calibrationCameraTypeSchema.optional(),
  cameraTrackingSummary: cameraTrackingSummarySchema.optional(),
  referenceFrameIndex: z.number().int().nonnegative().optional(),
  sourceFrameWidth: z.number().int().positive().optional(),
  sourceFrameHeight: z.number().int().positive().optional(),
  /** Provenance: the revision this one superseded (e.g. a Reset-to-Auto over a manual zone). */
  supersededFromRevision: z.number().int().nonnegative().optional(),
  supersededFromSource: calibrationSourceSchema.optional(),
  /**
   * Phase 2 (Part 9/10): confirmed manual World-Lock Repairs, carried inside
   * the SAME `calibration_gates` jsonb column — no new table, no migration.
   * This is the authoritative SOURCE the worker reads on every rerun to
   * rebuild the repaired global camera path (Part 11); it is NOT the same
   * array as `CameraPathArtifact.repairs` (the worker's own record of what
   * it actually applied, written back into the pose artifact each run).
   * Optimistic concurrency/ownership/staleness all reuse the existing
   * `version`/RLS machinery above — a repair bumps `version` exactly like a
   * gate save does.
   */
  worldLockRepairs: z.array(manualCameraPathRepairSchema).optional(),
});
export type CalibrationGates = z.infer<typeof calibrationGatesSchema>;

/** The midpoint of a gate bar — its single representative point on the track. */
export function gateMidpoint(bar: GateBar): GatePoint {
  return { x: (bar.c1.x + bar.c2.x) / 2, y: (bar.c1.y + bar.c2.y) / 2 };
}

/**
 * Reduce the two gate bars to the two-point {@link ManualCalibrationPoints} the
 * existing calibration/measurement engines use: gate midpoints become the A/B
 * points, and each gate's placement time carries through for world-anchoring.
 */
export function gatesToManualPoints(gates: CalibrationGates): ManualCalibrationPoints {
  const start = gateMidpoint(gates.startGate);
  const finish = gateMidpoint(gates.finishGate);
  return {
    ax: start.x,
    ay: start.y,
    bx: finish.x,
    by: finish.y,
    distanceM: gates.distanceM,
    aTimeS: gates.startGate.timeS,
    bTimeS: gates.finishGate.timeS,
  };
}
