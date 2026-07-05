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
});
export type GateBar = z.infer<typeof gateBarSchema>;

/** Two timing-gate bars a known distance apart. Stored as `sessions.calibration_gates` (jsonb). */
export const calibrationGatesSchema = z.object({
  startGate: gateBarSchema,
  finishGate: gateBarSchema,
  distanceM: z.number().positive(),
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
