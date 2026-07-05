/**
 * Ground-contact / flight timing from the overlay foot trajectory (Day 68).
 *
 * The step detector ({@link detectStepMarks}) marks the INSTANT of each ground
 * contact (the lowest point of the foot's y-trajectory). This module measures the
 * DURATION of that contact and the flight (airborne) time that follows, directly
 * from the same foot-y signal — so contact/flight are consistent with the steps
 * shown on the overlay and can be restricted to the calibration zone.
 *
 * Model — a "contact phase" is the span the foot stays near its lowest point:
 * around each contact peak, expand while the smoothed foot-y is within
 * `contactReleaseFraction` of the peak's vertical range. The touchdown (rise into
 * contact) and toe-off (rise out of contact) times are then INTERPOLATED to the
 * sub-frame instant the trajectory crosses that threshold — beating the raw frame
 * quantization (at 60 fps one frame ≈ 16.7 ms ≈ 20% of an 80 ms contact).
 *
 * This is a presentation/benchmark computation on the overlay pose; it does NOT
 * touch the worker biomechanics engine (which stores its own contact/flight).
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

import { smoothSeries } from "@/lib/biomechanics/events/FootContactDetector";
import type { OverlayFrame } from "./overlay";
import type { StepMark, StepSide } from "./steps";

/** One measured ground-contact phase, aligned 1:1 with a {@link StepMark}. */
export interface ContactPhase {
  side: StepSide;
  /** OverlayFrame.frame of the contact peak (matches the StepMark). */
  frame: number;
  /** Contact-peak time (seconds) — the instant the step was marked. */
  contactTimeS: number;
  /** Sub-frame interpolated touchdown time (foot arrives at the ground). */
  touchdownTimeS: number;
  /** Sub-frame interpolated toe-off time (foot leaves the ground). */
  toeOffTimeS: number;
  /** Ground-contact duration, milliseconds (toe-off − touchdown). */
  contactMs: number;
  /** Whole frames the foot stayed within the contact band (for the fps floor). */
  contactFrames: number;
}

export interface ContactTimingConfig {
  minVisibility: number;
  smoothingWindowFrames: number;
  /**
   * The foot is treated as "in contact" while its smoothed y stays within this
   * fraction of its full vertical range below the peak (lowest point). ~0.15 ≈ the
   * lowest sixth of the foot's travel — the planted phase. Tunable; the dominant
   * error at ≤60 fps is frame quantization, not this threshold.
   */
  contactReleaseFraction: number;
}

export const DEFAULT_CONTACT_TIMING_CONFIG: ContactTimingConfig = {
  minVisibility: 0.4,
  smoothingWindowFrames: 3,
  // 0.13 balances ground-contact and flight against the VueMotion 20 m reference
  // (contact ≈ the lowest ~13% of the foot's vertical travel). The dominant error
  // at ≤60 fps is frame quantization, not this exact value.
  contactReleaseFraction: 0.13,
};

const SIDE_FOOT_JOINTS: Record<StepSide, string[]> = {
  left: ["leftAnkle", "leftHeel", "leftFootIndex"],
  right: ["rightAnkle", "rightHeel", "rightFootIndex"],
};

/** Mean foot y over the usable (visible) foot keypoints, or NaN. */
function footY(frame: OverlayFrame, joints: string[], minVis: number): number {
  let sum = 0;
  let n = 0;
  for (const joint of joints) {
    const p = frame.landmarks[joint];
    if (p && (p.visibility ?? 1) >= minVis) {
      sum += p.y;
      n += 1;
    }
  }
  return n > 0 ? sum / n : NaN;
}

/** Smoothed foot-y series + amplitude (max−min) for one side. */
function sideSeries(frames: OverlayFrame[], side: StepSide, cfg: ContactTimingConfig) {
  const ys = frames.map((f) => footY(f, SIDE_FOOT_JOINTS[side], cfg.minVisibility));
  const smoothed = smoothSeries(ys, cfg.smoothingWindowFrames);
  const finite = smoothed.filter((v): v is number => Number.isFinite(v));
  const amplitude = finite.length ? Math.max(...finite) - Math.min(...finite) : 0;
  return { smoothed, amplitude };
}

/**
 * Measure the contact phase around a peak frame `p` in a smoothed foot-y series.
 * Expands left/right while y stays within `frac` of `amplitude` below the peak,
 * then interpolates the sub-frame threshold-crossing times. Returns null when the
 * amplitude is too small to define a band.
 */
function measurePhase(
  smoothed: number[],
  times: number[],
  p: number,
  amplitude: number,
  frac: number,
): { touchdown: number; toeoff: number; frames: number } | null {
  const peak = smoothed[p];
  if (!Number.isFinite(peak) || amplitude <= 0) return null;
  const thr = peak - frac * amplitude;

  let L = p;
  while (L - 1 >= 0 && Number.isFinite(smoothed[L - 1]) && smoothed[L - 1] >= thr) L -= 1;
  let R = p;
  while (R + 1 < smoothed.length && Number.isFinite(smoothed[R + 1]) && smoothed[R + 1] >= thr) R += 1;

  // Sub-frame interpolate the touchdown (rise into the band) and toe-off (fall out).
  let touchdown = times[L];
  if (L - 1 >= 0 && Number.isFinite(smoothed[L - 1]) && smoothed[L] !== smoothed[L - 1]) {
    const f = (thr - smoothed[L - 1]) / (smoothed[L] - smoothed[L - 1]);
    touchdown = times[L - 1] + f * (times[L] - times[L - 1]);
  }
  let toeoff = times[R];
  if (R + 1 < smoothed.length && Number.isFinite(smoothed[R + 1]) && smoothed[R] !== smoothed[R + 1]) {
    const f = (smoothed[R] - thr) / (smoothed[R] - smoothed[R + 1]);
    toeoff = times[R] + f * (times[R + 1] - times[R]);
  }
  return { touchdown, toeoff, frames: R - L };
}

/**
 * Contact phases for each detected step mark, in the same order. A phase carries
 * the touchdown/toe-off (sub-frame) and the contact duration; marks whose phase
 * can't be measured (too little foot amplitude) are dropped.
 */
export function detectContactPhases(
  frames: OverlayFrame[],
  marks: StepMark[],
  config: ContactTimingConfig = DEFAULT_CONTACT_TIMING_CONFIG,
): ContactPhase[] {
  if (!frames.length || !marks.length) return [];
  const times = frames.map((f) => f.time);
  const indexByFrame = new Map<number, number>();
  frames.forEach((f, i) => indexByFrame.set(f.frame, i));

  const series: Record<StepSide, ReturnType<typeof sideSeries>> = {
    left: sideSeries(frames, "left", config),
    right: sideSeries(frames, "right", config),
  };

  const phases: ContactPhase[] = [];
  for (const m of marks) {
    const p = indexByFrame.get(m.frame);
    if (p == null) continue;
    const { smoothed, amplitude } = series[m.side];
    const w = measurePhase(smoothed, times, p, amplitude, config.contactReleaseFraction);
    if (!w) continue;
    phases.push({
      side: m.side,
      frame: m.frame,
      contactTimeS: m.time,
      touchdownTimeS: w.touchdown,
      toeOffTimeS: w.toeoff,
      contactMs: (w.toeoff - w.touchdown) * 1000,
      contactFrames: w.frames,
    });
  }
  return phases;
}

/** Mean of a numeric sample, or null when empty. */
function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface ContactFlightSummary {
  groundContactLeftMs: number | null;
  groundContactRightMs: number | null;
  groundContactCombinedMs: number | null;
  flightLeftMs: number | null;
  flightRightMs: number | null;
  flightCombinedMs: number | null;
  /** Mean whole-frame contact width per foot, for the precision-floor readout. */
  contactFramesLeft: number | null;
  contactFramesRight: number | null;
  leftContacts: number;
  rightContacts: number;
}

/**
 * Summarise per-foot contact + flight from an ORDERED, time-consecutive set of
 * contact phases (already restricted to the measurement zone by the caller).
 * Flight after a contact = the next contact's touchdown − this contact's toe-off,
 * computed only BETWEEN the supplied phases — so a zone-restricted list yields
 * purely through-zone flight (nothing past the finish gate).
 */
export function summariseContactFlight(phases: ContactPhase[]): ContactFlightSummary {
  const ordered = [...phases].sort((a, b) => a.contactTimeS - b.contactTimeS);
  const cL: number[] = [];
  const cR: number[] = [];
  const fL: number[] = [];
  const fR: number[] = [];
  const framesL: number[] = [];
  const framesR: number[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const ph = ordered[i];
    (ph.side === "left" ? cL : cR).push(ph.contactMs);
    (ph.side === "left" ? framesL : framesR).push(ph.contactFrames);
    if (i + 1 < ordered.length) {
      const flightMs = (ordered[i + 1].touchdownTimeS - ph.toeOffTimeS) * 1000;
      if (flightMs >= 0) (ph.side === "left" ? fL : fR).push(flightMs);
    }
  }

  return {
    groundContactLeftMs: mean(cL),
    groundContactRightMs: mean(cR),
    groundContactCombinedMs: mean([...cL, ...cR]),
    flightLeftMs: mean(fL),
    flightRightMs: mean(fR),
    flightCombinedMs: mean([...fL, ...fR]),
    contactFramesLeft: mean(framesL),
    contactFramesRight: mean(framesR),
    leftContacts: cL.length,
    rightContacts: cR.length,
  };
}
