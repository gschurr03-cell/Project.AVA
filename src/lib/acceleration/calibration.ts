/**
 * Stationary-camera acceleration calibration (MVP Phase — Acceleration Analysis).
 *
 * The coach identifies known physical distance markers (start line, 5 m, 10 m,
 * 20 m, 30 m) visible in the clip by clicking each one in intrinsic source-video
 * coordinates. This is DELIBERATELY independent of the panning world-lock
 * transform machinery in `@/lib/video/zoneAnchors` and `@/lib/video/cameraPath*`
 * — acceleration is stationary-camera only for this phase, so a marker's pixel
 * position means the same thing on every frame; no camera-motion compensation
 * is needed or applied.
 *
 * Persistence reuses the EXISTING `sessions.calibration_gates` jsonb column (no
 * DB migration) and the same source/revision/confirmedAt/updatedAt authority
 * SHAPE already proven for fly's two-gate calibration (`@/lib/calibration/gates`,
 * `@/lib/calibration/authority`). The stored shape is structurally different
 * (an array of N markers, not two gate bars), so it is validated with its own
 * schema rather than being force-fit into `calibrationGatesSchema`.
 *
 * The authority constants below (`CALIBRATION_SOURCE_RANK`,
 * `CALIBRATION_AUTHORITY_SCHEMA_VERSION`) are INTENTIONALLY re-declared here,
 * verbatim, rather than imported from `@/lib/calibration/gates` /
 * `@/lib/calibration/authority` — importing them pulls in
 * `@/lib/calibration/index.ts`, which uses `@/*` path aliases the analysis
 * worker's isolated (alias-free) `tsc acceleration/*.ts` build cannot resolve.
 * This is the one deliberate, justified small duplication in this phase.
 */

import { z } from "zod";

export const ACCELERATION_CALIBRATION_SCHEMA_VERSION = "ava-acceleration-calibration-v1" as const;
export const CALIBRATION_AUTHORITY_SCHEMA_VERSION = "ava-calibration-authority-v1" as const;
export const calibrationSourceSchema = z.enum(["auto", "manual_draft", "manual_confirmed"]);
export type CalibrationSource = z.infer<typeof calibrationSourceSchema>;
export const CALIBRATION_SOURCE_RANK: Record<CalibrationSource, number> = {
  auto: 0,
  manual_draft: 1,
  manual_confirmed: 2,
};
export interface CalibrationAuthority {
  source: CalibrationSource;
  revision: number;
  confirmedAt: string | null;
  updatedAt: string | null;
}

/**
 * Pure distance markers — deliberately NO special "start" label and NO fixed
 * preset list (Part 2.5: "the zone should support arbitrary calibrated
 * ranges"). A calibrated ZONE is just [min, max] of whichever distances are
 * placed: 0m+10m defines a 0-10m zone; 12m+27m defines a 12-27m zone entirely
 * on its own, with no dependency on a 0m marker existing anywhere and no
 * requirement to land on a round 5m increment. `label` is a pure DISPLAY
 * string derived from `distanceM` (see {@link formatMarkerDistanceLabel}),
 * never a separately-validated identifier — there is nothing to "mislabel."
 */
const MAX_MARKER_DISTANCE_M = 400;
export const accelerationMarkerDistanceSchema = z.number().nonnegative().max(MAX_MARKER_DISTANCE_M);

/** The display string for a marker's distance — e.g. `formatMarkerDistanceLabel(12.5)` → `"12.5m"`. */
export function formatMarkerDistanceLabel(distanceM: number): string {
  return `${Number(distanceM.toFixed(2)).toString()}m`;
}

const normalizedCoordSchema = z.number().min(0).max(1);

export const accelerationMarkerSchema = z.object({
  id: z.string().min(1),
  distanceM: accelerationMarkerDistanceSchema,
  point: z.object({ x: normalizedCoordSchema, y: normalizedCoordSchema }),
  frameIndex: z.number().int().nonnegative().nullable().optional(),
  placedAt: z.string().datetime().optional(),
});
export type AccelerationMarker = z.infer<typeof accelerationMarkerSchema>;

/**
 * Deliberately NOT modeled on race convention (no "hand release," "block
 * exit," etc.) — the Zone Start Event (Part 3) is a single, uniform concept
 * ("first movement inside the calibrated zone") that never depends on race
 * reaction, a gun, or block release. This label is purely an optional coach
 * note about WHY they adjusted the frame; it never changes what t=0 means.
 */
export const accelerationStartEventTypeSchema = z.enum(["first_movement_in_zone", "custom"]);
export type AccelerationStartEventType = z.infer<typeof accelerationStartEventTypeSchema>;

/**
 * A coach-confirmed override of the automatically suggested Zone Start Event
 * (Part 3). The confirmed manual frame is always authoritative over the
 * automatic suggestion — this record exists only when a coach has explicitly
 * confirmed one. Stores exactly the three things Part 3 requires:
 * `zoneStartFrame`, `provenance`, `confidence` (always 1 for a manual
 * confirmation) — plus enough provenance to show what was overridden.
 */
export const accelerationStartOverrideSchema = z.object({
  zoneStartFrame: z.number().int().nonnegative(),
  provenance: z.literal("manual"),
  confidence: z.literal(1),
  startEventType: accelerationStartEventTypeSchema.optional(),
  confirmedBy: z.string().min(1),
  confirmedAt: z.string().datetime(),
  suggestedFrameIndex: z.number().int().nonnegative().nullable().optional(),
  suggestedConfidence: z.number().min(0).max(1).nullable().optional(),
});
export type AccelerationStartOverride = z.infer<typeof accelerationStartOverrideSchema>;

export const accelerationTravelDirectionSchema = z.enum(["left_to_right", "right_to_left"]);
export type AccelerationTravelDirection = z.infer<typeof accelerationTravelDirectionSchema>;

/** Persisted in `sessions.calibration_gates` for `analysis_type === "acceleration"` sessions. */
export const accelerationCalibrationGatesSchema = z.object({
  schemaVersion: z.literal(ACCELERATION_CALIBRATION_SCHEMA_VERSION),
  markers: z.array(accelerationMarkerSchema).min(2),
  travelDirection: accelerationTravelDirectionSchema,
  manualStartOverride: accelerationStartOverrideSchema.nullable().optional(),
  // --- Authority metadata — same field names/shape as fly's calibrationGatesSchema,
  // reusing the same CALIBRATION_SOURCE_RANK policy. All optional so a
  // partially-saved draft still parses.
  calibrationSource: calibrationSourceSchema.optional(),
  confirmedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  revision: z.number().int().nonnegative().optional(),
  authoritySchemaVersion: z.literal(CALIBRATION_AUTHORITY_SCHEMA_VERSION).optional(),
  sourceFrameWidth: z.number().int().positive().optional(),
  sourceFrameHeight: z.number().int().positive().optional(),
});
export type AccelerationCalibrationGates = z.infer<typeof accelerationCalibrationGatesSchema>;

export type AccelerationCalibrationRejectionReason =
  | "insufficient_markers"
  | "duplicate_distance"
  | "reversed_or_unordered_markers"
  | "markers_not_collinear";

export interface AccelerationCalibrationValidation {
  valid: boolean;
  reasons: AccelerationCalibrationRejectionReason[];
  coverageMinM: number | null;
  coverageMaxM: number | null;
}

/** The zone a calibration defines: entry = lowest calibrated marker, exit = highest. */
export interface AccelerationZone {
  entryMarker: AccelerationMarker;
  exitMarker: AccelerationMarker;
  entryDistanceM: number;
  exitDistanceM: number;
}

/** Derives the analysis zone from a validated marker set — no "start" label required. */
export function accelerationZoneFromMarkers(markers: AccelerationMarker[]): AccelerationZone {
  const sorted = [...markers].sort((a, b) => a.distanceM - b.distanceM);
  const entryMarker = sorted[0];
  const exitMarker = sorted[sorted.length - 1];
  return {
    entryMarker,
    exitMarker,
    entryDistanceM: entryMarker.distanceM,
    exitDistanceM: exitMarker.distanceM,
  };
}

const EPS = 1e-9;

/**
 * Structural + geometric validation (Part 4): marker ordering, no duplicate or
 * reversed distances, and — since real lens/perspective distortion is small but
 * nonzero — markers must project onto the start→furthest axis in the same order
 * as their real distances (a marker wildly off that axis usually means a
 * misclick, not a real track feature).
 */
export function validateAccelerationCalibration(
  markers: AccelerationMarker[],
): AccelerationCalibrationValidation {
  const reasons: AccelerationCalibrationRejectionReason[] = [];

  if (markers.length < 2) {
    reasons.push("insufficient_markers");
    return { valid: false, reasons, coverageMinM: null, coverageMaxM: null };
  }

  const distances = new Set(markers.map((m) => m.distanceM));
  if (distances.size !== markers.length) reasons.push("duplicate_distance");

  const sorted = [...markers].sort((a, b) => a.distanceM - b.distanceM);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dx = last.point.x - first.point.x;
  const dy = last.point.y - first.point.y;
  const axisLength = Math.hypot(dx, dy);

  if (axisLength <= EPS) {
    reasons.push("reversed_or_unordered_markers");
  } else {
    const ux = dx / axisLength;
    const uy = dy / axisLength;
    let previousProjection = -Infinity;
    let unordered = false;
    let offAxis = false;
    for (const marker of sorted) {
      const relX = marker.point.x - first.point.x;
      const relY = marker.point.y - first.point.y;
      const along = relX * ux + relY * uy;
      const lateral = Math.abs(relX * -uy + relY * ux);
      if (along <= previousProjection + EPS) unordered = true;
      // Lateral deviation tolerance: 8% of the axis length accounts for a
      // camera that is only near-perpendicular, not perfectly perpendicular.
      if (lateral > axisLength * 0.08) offAxis = true;
      previousProjection = along;
    }
    if (unordered) reasons.push("reversed_or_unordered_markers");
    if (offAxis) reasons.push("markers_not_collinear");
  }

  const coverageMinM = sorted[0]?.distanceM ?? null;
  const coverageMaxM = sorted[sorted.length - 1]?.distanceM ?? null;

  return { valid: reasons.length === 0, reasons, coverageMinM, coverageMaxM };
}

export interface AxisProjection {
  distanceM: number;
  lateralM: number;
  quality: "observed" | "interpolated" | "extrapolated";
}

/**
 * Projects a source-space point onto the calibrated track axis using PIECEWISE
 * LINEAR interpolation between consecutive markers (not a single global linear
 * fit) — this honors each marker's real, individually-observed position rather
 * than smoothing away genuine lens/perspective nonlinearity between segments.
 * Points beyond the calibrated range are extrapolated from the nearest segment
 * and flagged `"extrapolated"` so callers can label the result honestly.
 *
 * Requires `markers` to already be valid per {@link validateAccelerationCalibration}.
 */
export function projectPointToAxis(
  point: { x: number; y: number },
  markers: AccelerationMarker[],
): AxisProjection {
  const sorted = [...markers].sort((a, b) => a.distanceM - b.distanceM);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const axisDx = last.point.x - first.point.x;
  const axisDy = last.point.y - first.point.y;
  const axisLength = Math.hypot(axisDx, axisDy) || EPS;
  const ux = axisDx / axisLength;
  const uy = axisDy / axisLength;

  const along = (p: { x: number; y: number }) => (p.x - first.point.x) * ux + (p.y - first.point.y) * uy;
  const pointAlong = along(point);
  const lateralM = Math.abs((point.x - first.point.x) * -uy + (point.y - first.point.y) * ux);

  // Find the bracketing segment by arc-length projection.
  let segment = sorted[sorted.length - 2] ? [sorted[0], sorted[1]] : null;
  let quality: AxisProjection["quality"] = "interpolated";
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aAlong = along(a.point);
    const bAlong = along(b.point);
    if (pointAlong >= aAlong - EPS && pointAlong <= bAlong + EPS) {
      segment = [a, b];
      break;
    }
    segment = [a, b];
  }
  if (!segment) {
    return { distanceM: first.distanceM, lateralM, quality: "interpolated" };
  }
  const [a, b] = segment;
  const aAlong = along(a.point);
  const bAlong = along(b.point);
  const span = bAlong - aAlong || EPS;
  const t = (pointAlong - aAlong) / span;
  if (t < -EPS || t > 1 + EPS) quality = "extrapolated";
  else if (t <= EPS || t >= 1 - EPS) quality = "observed";
  const distanceM = a.distanceM + t * (b.distanceM - a.distanceM);
  return { distanceM, lateralM, quality };
}

/** Mirrors `@/lib/calibration/authority#calibrationAuthority` for the acceleration shape. */
export function accelerationCalibrationAuthority(calibration: {
  calibrationSource?: CalibrationSource;
  revision?: number;
  confirmedAt?: string | null;
  updatedAt?: string | null;
}): CalibrationAuthority {
  const revision = calibration.revision ?? 0;
  const confirmedAt = calibration.confirmedAt ?? null;
  const updatedAt = calibration.updatedAt ?? null;
  if (calibration.calibrationSource) {
    return { source: calibration.calibrationSource, revision, confirmedAt, updatedAt };
  }
  return { source: "auto", revision, confirmedAt: null, updatedAt };
}

/** Mirrors `@/lib/calibration/authority#mergeCalibrationAuthority` for the acceleration shape. */
export function mergeAccelerationCalibrationAuthority<
  T extends { calibrationSource?: CalibrationSource; revision?: number },
>(current: T | null, incoming: T | null): T | null {
  if (!current) return incoming;
  if (!incoming) return current;
  const a = accelerationCalibrationAuthority(current);
  const b = accelerationCalibrationAuthority(incoming);
  const rankA = CALIBRATION_SOURCE_RANK[a.source];
  const rankB = CALIBRATION_SOURCE_RANK[b.source];
  if (rankB > rankA) return incoming;
  if (rankB < rankA) return current;
  return b.revision > a.revision ? incoming : current;
}

const LEGACY_SINGLE_GATE_DISTANCES = [10, 20, 30] as const;

/**
 * The queue-submission gate for acceleration analysis (used by `queueAnalysis`
 * in `src/app/sessions/actions.ts`). Requires the SAME two facts the worker
 * itself requires before it will run pose estimation on an acceleration clip
 * (`calibration_point_bx` AND a known distance) — not just a chosen finish
 * distance. Picking a finish distance from the quick-setup buttons alone sets
 * `distance_m` but never places the finish marker, so `calibration_point_bx`
 * stays null; without this check that was queueable anyway, and the job would
 * only discover the missing calibration after being claimed, failing at
 * "validating" with a confusing error instead of being caught here before the
 * coach ever leaves the page. Multi-marker calibration (`calibration_gates`)
 * is authoritative on its own and bypasses the legacy single-gate check.
 */
export function hasCompletedAccelerationCalibration(session: {
  calibration_gates?: unknown;
  calibration_point_bx?: number | null;
  calibration_known_distance_m?: number | null;
  distance_m?: number | null;
}): boolean {
  if (accelerationCalibrationGatesSchema.safeParse(session.calibration_gates).success) return true;
  const distance = session.calibration_known_distance_m ?? session.distance_m ?? 0;
  return (
    session.calibration_point_bx != null &&
    (LEGACY_SINGLE_GATE_DISTANCES as readonly number[]).includes(distance)
  );
}
