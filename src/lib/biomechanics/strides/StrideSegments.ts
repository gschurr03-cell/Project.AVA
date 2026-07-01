import type { GaitSide } from "../events";

/**
 * Structured step and stride segments derived from a `GaitEvent[]` stream.
 *
 * A **step** spans one foot's contact to the opposite foot's next contact.
 * A **stride** spans one foot's contact to that same foot's next contact (and
 * contains the steps that start within it). Optional fields are left `undefined`
 * when the underlying events are missing, so partial data yields partial —
 * never invalid — segments.
 */
export interface StepSegment {
  index: number;
  side: GaitSide;
  startContactFrame: number;
  startContactMs: number;
  toeOffFrame?: number;
  toeOffMs?: number;
  /** Next opposite-side contact (the step's end). */
  nextContactFrame?: number;
  nextContactMs?: number;
  /** startContact → next opposite contact. */
  durationMs?: number;
  /** startContact → toe-off. */
  groundContactMs?: number;
  /** toe-off → next opposite contact. */
  flightTimeMs?: number;
  confidence: number;
  source: "gait_events";
}

export interface StrideSegment {
  index: number;
  side: GaitSide;
  startContactFrame: number;
  startContactMs: number;
  nextSameSideContactFrame: number;
  nextSameSideContactMs: number;
  durationMs: number;
  stepCount: number;
  steps: StepSegment[];
  confidence: number;
  source: "gait_events";
}
