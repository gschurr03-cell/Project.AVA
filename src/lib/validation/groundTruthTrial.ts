/**
 * Phase R4C — ground-truth trial schema. Defines the boundary between an AVA
 * ESTIMATE (anything `computeSprintMeasurements()` produces) and GROUND TRUTH
 * (a measurement taken independently of AVA — tape/chalk marks, an external
 * timing gate, hand-counted contacts). This file only describes and validates
 * that boundary; it contains no scientific formulas and touches no production
 * analysis code.
 *
 * Every field is optional/nullable by design (Part B): a trial degrades
 * gracefully to whatever was actually measured on the day, the same
 * philosophy `fieldValidation.ts` already uses for its coarser trial shape.
 * This schema is deliberately richer — per-contact longitudinal position,
 * per-contact side/timestamp, and explicit uncertainty — because R4C needs
 * contact-level ground truth to compare LEGACY_2D against
 * CANONICAL_LONGITUDINAL, not just aggregate zone-level numbers.
 */
import { z } from "zod";

export const GROUND_TRUTH_TRIAL_SCHEMA_VERSION = "ava-ground-truth-trial-v1";

/**
 * One physically observed foot-touchdown, located along the same longitudinal
 * axis R4A/R4B established: s = 0 at the start-gate midpoint, s = zoneLengthMeters
 * at the finish-gate midpoint (Part F). `sGroundTruthM` is required — a contact
 * entry without a position isn't ground truth for anything; everything else
 * about it (side, timestamp, uncertainty) may be unknown.
 */
export const groundTruthContactSchema = z.object({
  contactNumber: z.number().int().positive(),
  side: z.enum(["left", "right", "unknown"]).nullable().default(null),
  /** Meters from the start-gate midpoint along the running axis. Required — see above. */
  sGroundTruthM: z.number(),
  /** Independently known touchdown time, if a synced clock/timecode exists. */
  timestampS: z.number().nullable().default(null),
  /** Free text: how this position was actually measured (e.g. "tape-grid read", "chalk mark + tape measure", "high-fps reference video frame count"). */
  measurementMethod: z.string().nullable().default(null),
  /** ± meters. Null means "unknown/unstated", not "zero error." */
  uncertaintyM: z.number().nonnegative().nullable().default(null),
});
export type GroundTruthContact = z.infer<typeof groundTruthContactSchema>;

/** Independent zone timing — e.g. Freelap/OVR gates. Entirely optional. */
export const groundTruthTimingSchema = z.object({
  entryTimeS: z.number().nullable().default(null),
  exitTimeS: z.number().nullable().default(null),
  /** If present but entry/exit are not, this is trusted directly rather than derived. */
  zoneTimeS: z.number().nullable().default(null),
  timingDeviceSource: z.string().nullable().default(null),
  /** ± seconds. */
  uncertaintyS: z.number().nonnegative().nullable().default(null),
});
export type GroundTruthTiming = z.infer<typeof groundTruthTimingSchema>;

/**
 * Peak Velocity ground truth is a special case (Part N): a full-zone timing
 * gate does NOT independently establish instantaneous peak velocity, and
 * AVA's own output must never be substituted for ground truth. This field
 * defaults to unavailable; it only becomes usable when a genuinely
 * independent short-interval measurement (radar, laser, or a short
 * high-resolution timing segment) is supplied and its method is disclosed.
 */
export const groundTruthPeakVelocitySchema = z.object({
  available: z.boolean().default(false),
  valueMps: z.number().nullable().default(null),
  /** Required whenever `available` is true — radar/laser/short-segment timing, not AVA. */
  method: z.string().nullable().default(null),
  uncertaintyMps: z.number().nonnegative().nullable().default(null),
});
export type GroundTruthPeakVelocity = z.infer<typeof groundTruthPeakVelocitySchema>;

export const groundTruthTrialSchema = z
  .object({
    schemaVersion: z.literal(GROUND_TRUTH_TRIAL_SCHEMA_VERSION),
    trialId: z.string().min(1),
    sourceVideo: z.string().nullable().default(null),
    fps: z.number().positive().nullable().default(null),
    /** Measured distance between the start-gate midpoint and finish-gate midpoint (Part F). */
    zoneLengthMeters: z.number().positive(),
    travelDirection: z.enum(["left_to_right", "right_to_left"]).nullable().default(null),
    athlete: z.string().nullable().default(null),
    cameraPosition: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
    contacts: z.array(groundTruthContactSchema).default([]),
    timing: groundTruthTimingSchema.nullable().default(null),
    peakVelocity: groundTruthPeakVelocitySchema.default({ available: false, valueMps: null, method: null, uncertaintyMps: null }),
  })
  .refine(
    (trial) => trial.peakVelocity.available === false || (trial.peakVelocity.valueMps != null && trial.peakVelocity.method != null),
    { message: "peakVelocity.available=true requires both valueMps and method (an independent measurement, never AVA's own output)", path: ["peakVelocity"] },
  );
export type GroundTruthTrial = z.infer<typeof groundTruthTrialSchema>;

/** s in centimeters, unquantized — display convenience only (Part C/P). */
export function sToCm(sMeters: number): number {
  return sMeters * 100;
}
