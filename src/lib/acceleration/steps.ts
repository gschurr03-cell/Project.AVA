/**
 * Step-by-step acceleration table (Part 6/Part 8).
 *
 * Reuses the existing, validated primitives rather than reimplementing contact
 * detection or step classification:
 *  - `detectFootContacts` (`@/lib/biomechanics/events/FootContactDetector`) for
 *    per-foot ground-contact/toe-off events from the raw pose sequence.
 *  - `analyzeZoneSteps` (`@/lib/video/zoneStepAnalysis`) for left/right
 *    classification, step-length/asymmetry/frequency summaries, and quality
 *    flags along the calibrated start→furthest-marker axis.
 *
 * A contact is never treated as valid solely because a landmark crossed a
 * threshold: `detectFootContacts` already requires sustained local-maxima
 * geometry, and `analyzeZoneSteps` independently rejects non-alternating,
 * non-forward, or implausible-length intervals before they become a step row.
 */

import type { PoseFrame, PoseSequence } from "../biomechanics/pose";
import { detectFootContacts } from "../biomechanics/events/FootContactDetector";
import type { GaitEvent, GaitSide } from "../biomechanics/events/GaitEvents";
import { analyzeZoneSteps, type CanonicalContactInput, type ZoneStepSummary } from "../video/zoneStepAnalysis";
import type { AccelerationMarker } from "./calibration";

export interface AccelerationStepRow {
  stepNumber: number;
  side: GaitSide;
  contactFrame: number;
  toeOffFrame: number | null;
  elapsedTimeS: number;
  contactDistanceM: number;
  stepLengthM: number;
  stepTimeS: number;
  stepFrequencyHz: number;
  intervalVelocityMps: number;
  averageAccelerationMps2: number | null;
  cumulativeDistanceM: number;
  contactTimeS: number | null;
  flightTimeBeforeS: number | null;
  flightTimeAfterS: number | null;
  detectionConfidence: number;
  dataQuality: "observed" | "estimated";
  qualityFlags: string[];
  /** No per-contact manual correction UI exists yet; reserved for a future phase. */
  manualCorrection: null;
}

export interface AccelerationStepsResult {
  status: "ready" | "insufficient_contacts" | "unavailable";
  steps: AccelerationStepRow[];
  zoneSummary: ZoneStepSummary | null;
  reason: string | null;
}

const FOOT_JOINTS: Record<GaitSide, ("left_toe" | "left_heel" | "left_ankle" | "right_toe" | "right_heel" | "right_ankle")[]> = {
  left: ["left_toe", "left_heel", "left_ankle"],
  right: ["right_toe", "right_heel", "right_ankle"],
};

function footPoint(frame: PoseFrame, side: GaitSide): { x: number; y: number; confidence: number } | null {
  let sx = 0;
  let sy = 0;
  let sc = 0;
  let n = 0;
  for (const joint of FOOT_JOINTS[side]) {
    const kp = frame.keypoints[joint];
    if (kp && kp.score >= 0.4) {
      sx += kp.x;
      sy += kp.y;
      sc += kp.score;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n, confidence: sc / n };
}

/** Nearest toe-off of the same side strictly after the given contact event, by array order. */
function findToeOffAfter(events: GaitEvent[], side: GaitSide, afterFrame: number): GaitEvent | null {
  return (
    events
      .filter((e) => e.type === "toe_off" && e.side === side && e.frame > afterFrame)
      .sort((a, b) => a.frame - b.frame)[0] ?? null
  );
}

/** Nearest contact of either side strictly after the given frame, by time. */
function findContactAfter(events: GaitEvent[], afterTMs: number): GaitEvent | null {
  return (
    events
      .filter((e) => e.type === "contact" && e.tMs > afterTMs)
      .sort((a, b) => a.tMs - b.tMs)[0] ?? null
  );
}

/**
 * Derives the canonical step-level table for the calibrated acceleration
 * segment. `startTimeS` is the confirmed start event's timestamp (elapsed
 * time is reported relative to it, per Part 6).
 */
export function computeAccelerationSteps(
  sequence: PoseSequence,
  markers: AccelerationMarker[],
  startTimeS: number,
): AccelerationStepsResult {
  if (!sequence?.frames || sequence.frames.length < 5) {
    return { status: "unavailable", steps: [], zoneSummary: null, reason: "Not enough tracked pose frames." };
  }
  const sorted = [...markers].sort((a, b) => a.distanceM - b.distanceM);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last || last.distanceM <= first.distanceM) {
    return { status: "unavailable", steps: [], zoneSummary: null, reason: "Calibration markers do not define a positive-distance axis." };
  }

  const gaitEvents = detectFootContacts(sequence);
  const contactEvents = gaitEvents.filter((e) => e.type === "contact");
  if (contactEvents.length < 2) {
    return {
      status: "insufficient_contacts",
      steps: [],
      zoneSummary: null,
      reason: "Fewer than two foot contacts were detected in this clip.",
    };
  }

  const contacts: CanonicalContactInput[] = [];
  const frameLookup = new Map<string, PoseFrame>();
  for (const event of contactEvents) {
    const frame = sequence.frames[event.frame];
    if (!frame) continue;
    const point = footPoint(frame, event.side);
    if (!point) continue;
    const id = `accel-contact-${event.frame}-${event.side}`;
    contacts.push({
      id,
      side: event.side,
      timeS: event.tMs / 1000,
      // NOTE: intentionally `frame.index`, not `frame.sourceFrameIndex` — this
      // must match the `AccelerationFrame.frame` convention used throughout the
      // rest of the acceleration engine (see `accelerationOverlayFrames` in the
      // worker and `AccelerationStartEvent.frame`), so step rows can be
      // cross-referenced back into `AccelerationFrame[]` by this same value.
      sourceFrameIndex: frame.index,
      x: point.x,
      y: point.y,
      confidence: Math.min(point.confidence, event.confidence),
    });
    frameLookup.set(id, frame);
  }
  if (contacts.length < 2) {
    return {
      status: "insufficient_contacts",
      steps: [],
      zoneSummary: null,
      reason: "Foot contacts were detected but lacked usable toe/heel/ankle positions.",
    };
  }

  const zoneSummary = analyzeZoneSteps({
    contacts,
    start: first.point,
    finish: last.point,
    distanceM: last.distanceM - first.distanceM,
  });

  const contactById = new Map(zoneSummary.contacts.map((c) => [c.id, c]));
  const rows: AccelerationStepRow[] = [];
  let cumulative = first.distanceM;
  let previousVelocity: number | null = null;
  let stepNumber = 0;

  for (const interval of zoneSummary.intervals) {
    if (!interval.valid || interval.longitudinalLengthM == null) continue;
    if (interval.durationS <= 0) continue; // degenerate (non-positive elapsed time) — never fabricated
    const toContact = contactById.get(interval.toContactId);
    const toEvent = contactEvents.find(
      (e) => `accel-contact-${e.frame}-${e.side}` === interval.toContactId,
    );
    if (!toContact || !toEvent) continue;

    stepNumber += 1;
    const distanceM = first.distanceM + toContact.longitudinalM;
    cumulative = distanceM;
    const stepTimeS = interval.durationS;
    const velocity = stepTimeS > 0 ? interval.longitudinalLengthM / stepTimeS : 0;
    const acceleration =
      previousVelocity != null && stepTimeS > 0 ? (velocity - previousVelocity) / stepTimeS : null;

    const toeOff = findToeOffAfter(gaitEvents, toEvent.side, toEvent.frame);
    const contactTimeS = toeOff ? (toeOff.tMs - toEvent.tMs) / 1000 : null;
    const nextContact = findContactAfter(gaitEvents, toeOff ? toeOff.tMs : toEvent.tMs);
    const flightTimeAfterS = toeOff && nextContact ? (nextContact.tMs - toeOff.tMs) / 1000 : null;
    const priorToeOff = gaitEvents
      .filter((e) => e.type === "toe_off" && e.tMs < toEvent.tMs)
      .sort((a, b) => b.tMs - a.tMs)[0];
    const flightTimeBeforeS = priorToeOff ? (toEvent.tMs - priorToeOff.tMs) / 1000 : null;

    const qualityFlags = [...interval.qualityFlags, ...toContact.qualityFlags];
    rows.push({
      stepNumber,
      side: toContact.side,
      contactFrame: toContact.sourceFrameIndex,
      toeOffFrame: toeOff ? (sequence.frames[toeOff.frame]?.index ?? toeOff.frame) : null,
      elapsedTimeS: toContact.timeS - startTimeS,
      contactDistanceM: distanceM,
      stepLengthM: interval.longitudinalLengthM,
      stepTimeS,
      stepFrequencyHz: stepTimeS > 0 ? 1 / stepTimeS : 0,
      intervalVelocityMps: velocity,
      averageAccelerationMps2: acceleration,
      cumulativeDistanceM: cumulative,
      contactTimeS: contactTimeS != null && contactTimeS > 0 ? contactTimeS : null,
      flightTimeBeforeS: flightTimeBeforeS != null && flightTimeBeforeS > 0 ? flightTimeBeforeS : null,
      flightTimeAfterS: flightTimeAfterS != null && flightTimeAfterS > 0 ? flightTimeAfterS : null,
      detectionConfidence: toContact.confidence,
      dataQuality: qualityFlags.length ? "estimated" : "observed",
      qualityFlags,
      manualCorrection: null,
    });
    previousVelocity = velocity;
  }

  return {
    status: rows.length ? "ready" : "insufficient_contacts",
    steps: rows,
    zoneSummary,
    reason: rows.length ? null : "No valid alternating step intervals were found inside the calibrated segment.",
  };
}
