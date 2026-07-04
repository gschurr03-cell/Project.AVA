/**
 * Step cadence & step-based velocity (Day 62) — derive frequency and top speed
 * from *verified ground contacts*, never from contact-time / flight-time.
 *
 * Step marks (see {@link StepMark}) carry a timestamp per true ground contact and,
 * once calibrated, a real-world gap to the previous contact. This module turns
 * those into:
 *   • step frequency — how many steps happen per second, measured directly from
 *     the contact timestamps over the run (or a supplied window); and
 *   • max velocity — the classic sprint identity `step length × step frequency`,
 *     available only once step distances are calibrated to metres.
 *
 * Frequency here is *steps per second*: across N contacts spanning `Δt` seconds
 * from the first to the last contact there are `N − 1` completed steps, so the
 * rate is `(N − 1) / Δt`. This is deliberately distinct from contact time and
 * flight time (which are durations of a single support/airborne phase) — it is a
 * rate computed purely from when the foot struck the ground.
 *
 * Pure & deterministic: no I/O, inputs are read-only.
 */

import type { StepMark } from "./steps";

/** A time window (seconds) to restrict cadence to a segment of the clip. */
export interface ContactWindow {
  start: number;
  end: number;
}

const EPS = 1e-6;

/** Median of a numeric sample (upper-middle for even lengths); `[]` → null. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Contacts whose timestamp falls inside `window` (inclusive), or all of them. */
function contactsInWindow(marks: StepMark[], window?: ContactWindow | null): StepMark[] {
  if (!window) return marks;
  return marks.filter((m) => m.time >= window.start - EPS && m.time <= window.end + EPS);
}

/**
 * Step frequency (steps per second) from verified ground contacts. Uses the span
 * between the first and last contact in the window: `(N − 1) / (tLast − tFirst)`.
 * Needs at least two contacts spanning a positive time; otherwise null.
 */
export function stepFrequencyFromContacts(
  marks: StepMark[],
  window?: ContactWindow | null,
): number | null {
  const inWindow = contactsInWindow(marks, window);
  if (inWindow.length < 2) return null;
  const times = inWindow.map((m) => m.time);
  const span = Math.max(...times) - Math.min(...times);
  if (!(span > 0)) return null;
  return (inWindow.length - 1) / span;
}

/** Combined + per-side step frequency (steps/s), VueMotion definition. */
export interface StepFrequencies {
  combined: number | null;
  left: number | null;
  right: number | null;
}

/**
 * Step frequency the VueMotion way (Day 63). A "step" is the interval between two
 * consecutive contacts, and its side is the landing foot (the later contact).
 * Frequency = 1 / mean(step interval): combined over all intervals, left/right
 * over the intervals landing on that foot. Left + right therefore do NOT sum to
 * combined — they mirror how VueMotion reports per-side cadence, so benchmark
 * comparisons line up directly. Combined equals {@link stepFrequencyFromContacts}.
 */
export function stepFrequenciesFromContacts(
  marks: StepMark[],
  window?: ContactWindow | null,
): StepFrequencies {
  const inWindow = contactsInWindow(marks, window);
  const all: number[] = [];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 1; i < inWindow.length; i++) {
    const dt = inWindow[i].time - inWindow[i - 1].time;
    if (!(dt > 0)) continue;
    all.push(dt);
    (inWindow[i].side === "left" ? left : right).push(dt);
  }
  const freq = (intervals: number[]): number | null => {
    if (intervals.length === 0) return null;
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return meanInterval > 0 ? 1 / meanInterval : null;
  };
  return { combined: freq(all), left: freq(left), right: freq(right) };
}

/**
 * Median calibrated step length in metres from the marks' `distanceMetersFromPrev`
 * gaps (set by {@link applyRealWorldStepDistances}). Null when no gap is
 * calibrated — i.e. there is no metre scale yet.
 */
export function medianStepLengthMeters(
  marks: StepMark[],
  window?: ContactWindow | null,
): number | null {
  const gaps = contactsInWindow(marks, window)
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);
  return median(gaps);
}

/**
 * Max velocity from the sprint identity `step length × step frequency`, in m/s.
 * Requires calibrated step distances (metres) and at least two contacts. Returns
 * null when either the frequency or a calibrated step length is unavailable, so
 * callers fall back to the COM-based estimate instead of inventing a number.
 */
export function maxVelocityFromSteps(
  marks: StepMark[],
  window?: ContactWindow | null,
): number | null {
  const frequency = stepFrequencyFromContacts(marks, window);
  const stepLengthM = medianStepLengthMeters(marks, window);
  if (frequency == null || stepLengthM == null) return null;
  return stepLengthM * frequency;
}
