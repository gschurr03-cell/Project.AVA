/**
 * Full-run event stream (Day 71) — Stage 1 of the detect-then-measure pipeline.
 *
 * The architecture is deliberately two independent stages:
 *
 *   Video → full-run tracking → full-run contact detection → COMPLETE EVENT STREAM
 *        → zone calibration (Start→Finish) → zone metrics → coaching + benchmark
 *
 * This module is Stage 1: it detects EVERY reliable ground contact across the whole
 * visible run — from the first visible step to the last — with NO knowledge of the
 * calibration gates or the measurement zone. Calibration must MEASURE events, never
 * decide which events exist. The overlay and the measurement engine both consume
 * this same stream, so what a coach sees on the video is exactly what the metrics
 * are computed from (after the zone filter).
 *
 * It does NOT fabricate contacts: it only surfaces contacts the pose signal actually
 * supports (the step detector's peaks + the contact-phase durations). Where the pose
 * artifact has no trackable foot (e.g. a small/distant athlete at the far end), the
 * corresponding contacts genuinely don't exist here and are honestly absent.
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

import type { OverlayFrame } from "./overlay";
import { detectStepMarks, type StepDetectionConfig, type StepMark } from "./steps";
import { detectContactPhases, type ContactPhase, type ContactTimingConfig } from "./contacts";

/** The complete, calibration-independent event stream for one clip. */
export interface FullRunEvents {
  /** Every detected ground contact across the visible run, in time order. */
  contacts: StepMark[];
  /** Ground-contact/flight phase for each contact where measurable (Day 68). */
  contactPhases: ContactPhase[];
  /** Time (s) of the first / last detected contact — the tracked-run bounds. */
  firstContactTimeS: number | null;
  lastContactTimeS: number | null;
  totalContacts: number;
  leftContacts: number;
  rightContacts: number;
}

/**
 * Build the full-run event stream from the overlay frames. This is the single
 * source of truth for "what did the athlete do", independent of any zone.
 */
export function buildFullRunEvents(
  frames: OverlayFrame[],
  stepConfig?: StepDetectionConfig,
  contactConfig?: ContactTimingConfig,
): FullRunEvents {
  const contacts = detectStepMarks(frames, stepConfig);
  const contactPhases = detectContactPhases(frames, contacts, contactConfig);
  return {
    contacts,
    contactPhases,
    firstContactTimeS: contacts.length ? contacts[0].time : null,
    lastContactTimeS: contacts.length ? contacts[contacts.length - 1].time : null,
    totalContacts: contacts.length,
    leftContacts: contacts.filter((c) => c.side === "left").length,
    rightContacts: contacts.filter((c) => c.side === "right").length,
  };
}

/**
 * Stage 2 helper: extract the portion of the full-run stream a predicate selects
 * (e.g. contacts inside the calibrated Start→Finish zone). Calibration MEASURES the
 * stream through this filter; it never changes which contacts were detected.
 */
export function selectEvents(events: FullRunEvents, keep: (contact: StepMark) => boolean): StepMark[] {
  return events.contacts.filter(keep);
}
