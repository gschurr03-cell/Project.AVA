/**
 * Left/right balance analysis (Day 75) — turn AVA's per-side measurements into
 * specific, coach-useful guidance: which side is limiting, what that means, why it
 * matters, and concrete drills/cues to even it out.
 *
 * This is deliberately HONEST about confidence: step length is spatial and reliable
 * at any frame rate, but per-side step FREQUENCY is a temporal metric that a ≤60 fps
 * clip can only read directionally (Day 69). So a frequency asymmetry is surfaced as
 * a direction to explore + verify, never a hard diagnosis.
 *
 * Pure & deterministic: no I/O, inputs read-only. No fabricated numbers — every value
 * comes straight from the measurement engine.
 */

import type { SprintMeasurements } from "@/lib/benchmark/measurements";

export type Side = "left" | "right";

export interface AsymmetryInsight {
  key: "stepLength" | "stepFrequency";
  metricLabel: string;
  /** The limiting (weaker) side. */
  weakerSide: Side;
  leftValue: number;
  rightValue: number;
  unit: string;
  /** Percent difference relative to the stronger side. */
  differencePct: number;
  /** True when the reading is frame-rate-trustworthy (spatial, or ≥120 fps timing). */
  reliable: boolean;
  /** Plain-language "what this is". */
  what: string;
  /** Why it limits performance. */
  why: string;
  /** Specific, side-aware coaching fixes. */
  fixes: string[];
  /** Honest confidence caveat. */
  confidenceNote: string;
}

/** Below this the two sides are treated as balanced (within the noise floor). */
export const ASYMMETRY_MIN_PCT = 4;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function pctDiff(a: number, b: number): number {
  const hi = Math.max(a, b);
  return hi > 0 ? (Math.abs(a - b) / hi) * 100 : 0;
}

function stepLengthInsight(left: number, right: number): AsymmetryInsight {
  const weakerSide: Side = left < right ? "left" : "right";
  const diff = pctDiff(left, right);
  return {
    key: "stepLength",
    metricLabel: "Step length",
    weakerSide,
    leftValue: left,
    rightValue: right,
    unit: "m",
    differencePct: Number(diff.toFixed(1)),
    reliable: true,
    what: `The athlete's ${weakerSide}-leg step covers less ground than the ${weakerSide === "left" ? "right" : "left"} (${left.toFixed(2)} m vs ${right.toFixed(2)} m — about ${diff.toFixed(0)}% shorter on the ${weakerSide}).`,
    why: "A shorter step off one leg caps top speed and usually points to less horizontal force or reduced hip extension on that side — the athlete leaves ground unclaimed every stride.",
    fixes: [
      `Single-leg bounds and alternating bounds emphasising a full push off the ${weakerSide} leg.`,
      `Unilateral strength on the ${weakerSide} side (split squats, step-ups, hip-thrust variations) to close the force gap.`,
      `Wicket runs / acceleration ladders cueing complete extension on each ${weakerSide} contact.`,
    ],
    confidenceNote: "Step length is spatial and calibrated — reliable at any frame rate.",
  };
}

function stepFrequencyInsight(left: number, right: number, reliable: boolean): AsymmetryInsight {
  const weakerSide: Side = left < right ? "left" : "right";
  const diff = pctDiff(left, right);
  return {
    key: "stepFrequency",
    metricLabel: "Step frequency",
    weakerSide,
    leftValue: left,
    rightValue: right,
    unit: "steps/s",
    differencePct: Number(diff.toFixed(1)),
    reliable,
    what: `The athlete's ${weakerSide}-leg turnover reads lower than the ${weakerSide === "left" ? "right" : "left"} (${left.toFixed(2)} vs ${right.toFixed(2)} steps/s — about ${diff.toFixed(0)}% slower to reset the ${weakerSide} leg).`,
    why: "Slower recovery on one side unbalances the stride cycle: the athlete spends longer repositioning that leg, which leaks speed and can shift load onto the opposite side.",
    fixes: [
      `${cap(weakerSide)}-lead A-skips and dribble drills to speed up recovery and front-side mechanics on the ${weakerSide} leg.`,
      `Single-leg wall drives on the ${weakerSide} side for a quicker knee punch and foot strike.`,
      `Hip-flexor / dead-bug and band-resisted leg-reset work to accelerate the ${weakerSide} swing phase.`,
    ],
    confidenceNote: reliable
      ? "Captured at ≥120 fps — per-side timing is trustworthy."
      : "At this frame rate per-side timing is directional, not exact — confirm the pattern across sessions or with 120–240 fps footage before over-correcting.",
  };
}

/**
 * Produce the left/right balance insights, most pronounced first. Returns `[]` when
 * the sides are balanced (within {@link ASYMMETRY_MIN_PCT}) or the data is missing.
 * `timingReliable` (default from the FPS) gates the honesty of the frequency insight.
 */
export function analyzeAsymmetry(
  m: SprintMeasurements,
  opts: { timingReliable?: boolean } = {},
): AsymmetryInsight[] {
  const timingReliable = opts.timingReliable !== false;
  const insights: AsymmetryInsight[] = [];

  if (
    m.leftStepLengthM != null &&
    m.rightStepLengthM != null &&
    pctDiff(m.leftStepLengthM, m.rightStepLengthM) >= ASYMMETRY_MIN_PCT
  ) {
    insights.push(stepLengthInsight(m.leftStepLengthM, m.rightStepLengthM));
  }

  if (
    m.leftStepFrequencyHz != null &&
    m.rightStepFrequencyHz != null &&
    pctDiff(m.leftStepFrequencyHz, m.rightStepFrequencyHz) >= ASYMMETRY_MIN_PCT
  ) {
    insights.push(stepFrequencyInsight(m.leftStepFrequencyHz, m.rightStepFrequencyHz, timingReliable));
  }

  return insights.sort((a, b) => b.differencePct - a.differencePct);
}
