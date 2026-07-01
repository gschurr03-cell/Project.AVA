/**
 * Sprint biomechanics metric definitions and derivations.
 *
 * The AI pipeline produces a per-frame stream of 2D/3D keypoints (a pose). This
 * module turns that raw pose stream into the spatiotemporal metrics coaches
 * care about. Keep the analysis worker and the UI in agreement by deriving
 * every displayed number from these functions rather than re-implementing them.
 */

import type { Keypoint } from "./pose";

// `Keypoint`, `JointName`, `PoseFrame`, and `PoseSequence` are the canonical,
// backend-agnostic pose vocabulary and now live in `pose.ts`. This module keeps
// the sprint math and its derived shapes (`GaitEvent`, `SprintMetrics`).

/** A detected foot-strike or toe-off event, keyed to a frame index. */
export interface GaitEvent {
  frame: number;
  side: "left" | "right";
  type: "contact" | "toe_off";
}

/**
 * The headline metrics surfaced on a session page. All values are in SI units
 * unless the field name says otherwise. These are persisted as the `metrics`
 * JSONB column on the `analyses` table.
 */
export interface SprintMetrics {
  topSpeedMps: number;
  avgStrideLengthM: number;
  strideFrequencyHz: number;
  groundContactTimeMs: number;
  flightTimeMs: number;
  /** Peak knee flexion angle during swing, degrees. */
  peakKneeFlexionDeg: number;
  /** Forward trunk lean relative to vertical, degrees. */
  avgTrunkLeanDeg: number;
}

/**
 * Interior angle (degrees) at joint `b` formed by segments b->a and b->c.
 * Used for knee flexion, hip angle, etc.
 */
export function jointAngleDeg(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

/**
 * Stride frequency = steps per second, derived from the spacing between
 * consecutive foot contacts. `fps` is the video frame rate.
 */
export function strideFrequencyHz(events: GaitEvent[], fps: number): number {
  const contacts = events.filter((e) => e.type === "contact").map((e) => e.frame);
  if (contacts.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < contacts.length; i++) gaps.push(contacts[i] - contacts[i - 1]);
  const avgGapFrames = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return fps / avgGapFrames;
}

/**
 * Ground contact time (ms) = average frames between a contact and the following
 * toe-off on the same side, converted to milliseconds.
 */
export function groundContactTimeMs(events: GaitEvent[], fps: number): number {
  const durations: number[] = [];
  for (const side of ["left", "right"] as const) {
    const sideEvents = events.filter((e) => e.side === side).sort((a, b) => a.frame - b.frame);
    for (let i = 0; i < sideEvents.length - 1; i++) {
      if (sideEvents[i].type === "contact" && sideEvents[i + 1].type === "toe_off") {
        durations.push(sideEvents[i + 1].frame - sideEvents[i].frame);
      }
    }
  }
  if (durations.length === 0) return 0;
  const avgFrames = durations.reduce((s, d) => s + d, 0) / durations.length;
  return (avgFrames / fps) * 1000;
}
