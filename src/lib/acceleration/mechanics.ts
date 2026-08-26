/**
 * Contact-level mechanical model (Phase 3, Parts 4, 6-9).
 *
 * Extends each valid acceleration contact with conservative mechanical
 * observations — trunk angle, support-shin angle, thigh angle, pelvis
 * height, and touchdown position relative to the pelvis/center-of-mass
 * proxy — using ONLY the central definitions in `mechanicsDefinitions.ts`.
 * Every value is confidence-gated: a required landmark below
 * `MIN_LANDMARK_CONFIDENCE` makes the observation `"unavailable"`, never a
 * fabricated number (Part 4). Nothing here diagnoses strength, stiffness,
 * or injury — see `mechanicalLimitingFactors.ts` for the disclaimed,
 * non-diagnostic language layer built on top of these raw observations.
 */

import type { PoseSequence, PoseFrame } from "../biomechanics/pose";
import type { AccelerationStepRow } from "./steps";
import {
  MIN_LANDMARK_CONFIDENCE,
  MECHANICS_DEFINITIONS_VERSION,
  isUsable,
  combinedConfidence,
  signedAngleFromVerticalDeg,
  forwardOffset,
  midpoint,
  normalizedOffsetToMeters,
  type TravelDirection,
  type MechanicalSide,
  type ScoredPoint,
} from "./mechanicsDefinitions";

export type ObservationStatus = "observed" | "estimated" | "manually_corrected" | "unavailable" | "experimental";

export interface MechanicalObservation<T> {
  value: T | null;
  frame: number | null;
  side: MechanicalSide | null;
  confidence: number;
  status: ObservationStatus;
  provenance: "automatic" | "manual";
  /** Why the observation is unavailable/estimated — always present when value is null. */
  reason: string | null;
}

function unavailable<T>(reason: string, frame: number | null = null, side: MechanicalSide | null = null): MechanicalObservation<T> {
  return { value: null, frame, side, confidence: 0, status: "unavailable", provenance: "automatic", reason };
}

function observed<T>(value: T, frame: number, side: MechanicalSide, confidence: number): MechanicalObservation<T> {
  return {
    value,
    frame,
    side,
    confidence,
    // 2D, single-camera, projected angles are never treated as validated
    // biomechanics (see mechanicsDefinitions.ts's perspective-limitations
    // note) — always surfaced as experimental, per Part 4's status list.
    status: "experimental",
    provenance: "automatic",
    reason: null,
  };
}

export interface TouchdownOffset {
  normalizedOffset: number;
  meters: number | null;
  legLengthRatio: number | null;
  method: "calibrated_world_distance" | "unavailable";
}

export interface ContactMechanics {
  stepNumber: number;
  side: MechanicalSide;
  contactFrame: number;
  contactDistanceM: number;
  toeOffFrame: number | null;
  trunkAngleTouchdownDeg: MechanicalObservation<number>;
  trunkAngleToeOffDeg: MechanicalObservation<number>;
  shinAngleTouchdownDeg: MechanicalObservation<number>;
  thighAngleTouchdownDeg: MechanicalObservation<number>;
  pelvisHeightNormalized: MechanicalObservation<number>;
  touchdownOffsetFromPelvis: MechanicalObservation<TouchdownOffset>;
  touchdownOffsetFromCenterOfMass: MechanicalObservation<TouchdownOffset>;
}

function poseFrameAt(sequence: PoseSequence, frameIndex: number | null): PoseFrame | null {
  if (frameIndex == null) return null;
  return sequence.frames.find((f) => f.index === frameIndex) ?? sequence.frames[frameIndex] ?? null;
}

function scoredJoint(frame: PoseFrame | null, joint: string): ScoredPoint | null {
  if (!frame) return null;
  const kp = (frame.keypoints as Record<string, { x: number; y: number; score: number } | undefined>)[joint];
  if (!kp) return null;
  return { x: kp.x, y: kp.y, score: kp.score };
}

const ANKLE = { left: "left_ankle", right: "right_ankle" } as const;
const KNEE = { left: "left_knee", right: "right_knee" } as const;
const HIP = { left: "left_hip", right: "right_hip" } as const;
function trunkAt(frame: PoseFrame | null, travelDirection: TravelDirection): { angleDeg: number; confidence: number } | null {
  const lHip = scoredJoint(frame, "left_hip");
  const rHip = scoredJoint(frame, "right_hip");
  const lShoulder = scoredJoint(frame, "left_shoulder");
  const rShoulder = scoredJoint(frame, "right_shoulder");
  if (!isUsable(lHip) || !isUsable(rHip) || !isUsable(lShoulder) || !isUsable(rShoulder)) return null;
  const hipMid = midpoint(lHip, rHip);
  const shoulderMid = midpoint(lShoulder, rShoulder);
  return {
    angleDeg: signedAngleFromVerticalDeg(hipMid, shoulderMid, travelDirection),
    confidence: combinedConfidence([lHip, rHip, lShoulder, rShoulder]),
  };
}

function supportShinAt(frame: PoseFrame | null, side: MechanicalSide, travelDirection: TravelDirection): { angleDeg: number; confidence: number } | null {
  const ankle = scoredJoint(frame, ANKLE[side]);
  const knee = scoredJoint(frame, KNEE[side]);
  if (!isUsable(ankle) || !isUsable(knee)) return null;
  return { angleDeg: signedAngleFromVerticalDeg(ankle, knee, travelDirection), confidence: combinedConfidence([ankle, knee]) };
}

function thighAt(frame: PoseFrame | null, side: MechanicalSide, travelDirection: TravelDirection): { angleDeg: number; confidence: number } | null {
  const knee = scoredJoint(frame, KNEE[side]);
  const hip = scoredJoint(frame, HIP[side]);
  if (!isUsable(knee) || !isUsable(hip)) return null;
  return { angleDeg: signedAngleFromVerticalDeg(knee, hip, travelDirection), confidence: combinedConfidence([knee, hip]) };
}

/** Pelvis height ABOVE the support ankle (ground proxy) — a within-frame,
 *  camera-relative proxy, not an absolute height; only trend/progression
 *  across contacts is meaningful, never a single absolute reading. */
function pelvisHeightAt(frame: PoseFrame | null, side: MechanicalSide): { heightNormalized: number; confidence: number } | null {
  const lHip = scoredJoint(frame, "left_hip");
  const rHip = scoredJoint(frame, "right_hip");
  const ankle = scoredJoint(frame, ANKLE[side]);
  if (!isUsable(lHip) || !isUsable(rHip) || !isUsable(ankle)) return null;
  const hipMid = midpoint(lHip, rHip);
  return { heightNormalized: ankle.y - hipMid.y, confidence: combinedConfidence([lHip, rHip, ankle]) };
}

function touchdownOffset(
  reference: ScoredPoint | null,
  foot: ScoredPoint | null,
  travelDirection: TravelDirection,
  metersPerNormalizedUnit: number | null,
  legLengthM: number | null,
): { offset: TouchdownOffset; confidence: number } | null {
  if (!isUsable(reference) || !isUsable(foot)) return null;
  const normalizedOffset = forwardOffset(reference, foot, travelDirection);
  const converted = normalizedOffsetToMeters({ offsetNormalized: normalizedOffset, metersPerNormalizedUnit, legLengthM });
  return {
    offset: { normalizedOffset, meters: converted.meters, legLengthRatio: converted.legLengthRatio, method: converted.method },
    confidence: combinedConfidence([reference, foot]),
  };
}

/**
 * Computes the mechanical observation set for one valid contact. Never
 * throws; every field independently degrades to `"unavailable"` when its
 * own required landmarks are missing or below `MIN_LANDMARK_CONFIDENCE`.
 */
export function computeContactMechanics(
  sequence: PoseSequence,
  step: AccelerationStepRow,
  travelDirection: TravelDirection,
  scale: { metersPerNormalizedUnit: number | null; legLengthM: number | null },
): ContactMechanics {
  const side = step.side as MechanicalSide;
  const touchdownFrame = poseFrameAt(sequence, step.contactFrame);
  const toeOffFrame = poseFrameAt(sequence, step.toeOffFrame);

  const trunkTouchdown = trunkAt(touchdownFrame, travelDirection);
  const trunkToeOff = trunkAt(toeOffFrame, travelDirection);
  const shinTouchdown = supportShinAt(touchdownFrame, side, travelDirection);
  const thighTouchdown = thighAt(touchdownFrame, side, travelDirection);
  const pelvisTouchdown = pelvisHeightAt(touchdownFrame, side);

  const footTouchdown = scoredJoint(touchdownFrame, side === "left" ? "left_toe" : "right_toe") ?? scoredJoint(touchdownFrame, ANKLE[side]);
  const lHipTd = scoredJoint(touchdownFrame, "left_hip");
  const rHipTd = scoredJoint(touchdownFrame, "right_hip");
  const pelvisRef = isUsable(lHipTd) && isUsable(rHipTd) ? midpoint(lHipTd, rHipTd) : null;
  const comRef =
    isUsable(lHipTd) && isUsable(rHipTd) && isUsable(scoredJoint(touchdownFrame, "left_shoulder")) && isUsable(scoredJoint(touchdownFrame, "right_shoulder"))
      ? midpoint(midpoint(lHipTd, rHipTd), midpoint(scoredJoint(touchdownFrame, "left_shoulder")!, scoredJoint(touchdownFrame, "right_shoulder")!))
      : null;

  const offsetFromPelvis = touchdownOffset(pelvisRef, footTouchdown, travelDirection, scale.metersPerNormalizedUnit, scale.legLengthM);
  const offsetFromCoM = touchdownOffset(comRef, footTouchdown, travelDirection, scale.metersPerNormalizedUnit, scale.legLengthM);

  return {
    stepNumber: step.stepNumber,
    side,
    contactFrame: step.contactFrame,
    contactDistanceM: step.contactDistanceM,
    toeOffFrame: step.toeOffFrame,
    trunkAngleTouchdownDeg: trunkTouchdown
      ? observed(trunkTouchdown.angleDeg, step.contactFrame, side, trunkTouchdown.confidence)
      : unavailable("Hip and/or shoulder landmarks missing or below confidence floor at touchdown.", step.contactFrame, side),
    trunkAngleToeOffDeg:
      step.toeOffFrame != null && trunkToeOff
        ? observed(trunkToeOff.angleDeg, step.toeOffFrame, side, trunkToeOff.confidence)
        : unavailable(
            step.toeOffFrame == null ? "No reliable toe-off frame for this contact." : "Hip and/or shoulder landmarks missing or below confidence floor at toe-off.",
            step.toeOffFrame,
            side,
          ),
    shinAngleTouchdownDeg: shinTouchdown
      ? observed(shinTouchdown.angleDeg, step.contactFrame, side, shinTouchdown.confidence)
      : unavailable("Support-side knee and/or ankle landmarks missing or below confidence floor.", step.contactFrame, side),
    thighAngleTouchdownDeg: thighTouchdown
      ? observed(thighTouchdown.angleDeg, step.contactFrame, side, thighTouchdown.confidence)
      : unavailable("Support-side hip and/or knee landmarks missing or below confidence floor.", step.contactFrame, side),
    pelvisHeightNormalized: pelvisTouchdown
      ? observed(pelvisTouchdown.heightNormalized, step.contactFrame, side, pelvisTouchdown.confidence)
      : unavailable("Hip and/or support-ankle landmarks missing or below confidence floor.", step.contactFrame, side),
    touchdownOffsetFromPelvis: offsetFromPelvis
      ? observed(offsetFromPelvis.offset, step.contactFrame, side, offsetFromPelvis.confidence)
      : unavailable("Pelvis midpoint and/or foot landmark missing or below confidence floor.", step.contactFrame, side),
    touchdownOffsetFromCenterOfMass: offsetFromCoM
      ? observed(offsetFromCoM.offset, step.contactFrame, side, offsetFromCoM.confidence)
      : unavailable("Center-of-mass proxy and/or foot landmark missing or below confidence floor.", step.contactFrame, side),
  };
}

export function computeAllContactMechanics(
  sequence: PoseSequence,
  steps: AccelerationStepRow[],
  travelDirection: TravelDirection,
  scale: { metersPerNormalizedUnit: number | null; legLengthM: number | null },
): ContactMechanics[] {
  return steps.map((step) => computeContactMechanics(sequence, step, travelDirection, scale));
}

export { MECHANICS_DEFINITIONS_VERSION, MIN_LANDMARK_CONFIDENCE };
