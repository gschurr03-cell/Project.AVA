import type { Direction, LimiterRecommendation } from "./types";

/**
 * Focused, evidence-tied intervention IDEAS (max 2–3 per limiter). NOT a workout plan —
 * detailed individualized programming is a future premium feature. Every recommendation
 * connects to the specific finding and stays conservative.
 */

export function stepLengthAsymmetryRecommendations(direction: Direction): LimiterRecommendation[] {
  const shorterSide = direction === "left_higher" ? "right" : "left";
  return [
    {
      type: "assessment",
      title: "Compare the two sides directly",
      focus: `Add a side-by-side physical comparison (e.g. single-leg jump or force testing) for the ${shorterSide} vs. opposite leg.`,
      why: `The ${shorterSide} side produced less horizontal displacement per step across the valid measured steps.`,
      observe: "Whether a measured force/power difference matches the displacement difference seen in the run.",
      caution: "Video alone cannot confirm a strength or tissue-capacity cause — physical testing is required.",
    },
    {
      type: "technical_focus",
      title: `Review ${shorterSide}-side touchdown and recovery`,
      focus: `Review the ${shorterSide}-side ground contact and recovery timing at speed.`,
      why: "Side-to-side displacement differences can sometimes relate to touchdown position or recovery timing rather than force.",
      observe: "Whether the shorter-side foot strikes further ahead of the hips or recovers later.",
    },
    {
      type: "drill",
      title: "Controlled bilateral + unilateral technical runs",
      focus: "Use low-volume, controlled technical runs and unilateral drills to expose the side difference under organized mechanics.",
      why: "Balanced technical work lets a coach observe whether the difference persists when mechanics are deliberate.",
    },
  ];
}

export function stepFrequencyAsymmetryRecommendations(direction: Direction): LimiterRecommendation[] {
  const slowerSide = direction === "left_higher" ? "right" : "left";
  return [
    {
      type: "technical_focus",
      title: `Review ${slowerSide}-side rhythm and recovery timing`,
      focus: `Observe the ${slowerSide}-side leg recovery and re-plant timing during maximal running.`,
      why: `The ${slowerSide} side turned over more slowly across the valid measured intervals.`,
      observe: "Whether the slower-side recovery is delayed or the ground contact is longer.",
      caution: "Timing differences from sprint footage are associations, not a diagnosis of the cause.",
    },
    {
      type: "rhythm",
      title: "Rhythm-focused technical runs",
      focus: "Use rhythm-oriented technical runs (e.g. metronome or wicket-supported spacing) to encourage even turnover.",
      why: "Rhythm cues let a coach check whether the side difference narrows when turnover is guided.",
    },
  ];
}
