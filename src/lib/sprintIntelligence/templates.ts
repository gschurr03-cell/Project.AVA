/**
 * Deterministic explanation templates. Every function returns plain strings composed from
 * REAL values passed in — there is no generative model and no hidden randomness. Wording is
 * deliberately cautious: associations use "can sometimes be associated with", physical
 * factors always carry a disclaimer, and no phrase asserts an unmeasured diagnosis.
 */

import type { LimiterType } from "@/lib/limitingFactors/types";

export const PHYSICAL_DISCLAIMER =
  "Sprint footage alone cannot determine whether strength, mobility, tissue capacity, pain, or muscular function caused this pattern. Additional physical testing would be required.";

export const ASSOCIATION_NOT_MEASURED =
  "These are commonly-linked patterns, not directly measured findings — this analysis did not measure touchdown position, joint forces, or muscular function.";

/** Alternative interpretations for a detected pattern — focused, never a generic list. */
export function alternativeExplanations(type: LimiterType): string[] {
  switch (type) {
    case "step_length_asymmetry":
      return [
        "A side-to-side difference in touchdown timing or ground-contact organisation.",
        "An intentional or habitual technical asymmetry rather than a physical limitation.",
        "Normal step-to-step variability exaggerated by a small number of valid steps.",
        "Side-label uncertainty from video quality affecting which foot was measured.",
      ];
    case "step_frequency_asymmetry":
      return [
        "A side-to-side difference in leg-recovery or re-plant timing.",
        "Normal turnover variability across a short measured zone.",
        "Side-label uncertainty from video quality.",
      ];
    default:
      return [];
  }
}

/** Assumptions that, if wrong, could change a conclusion of the given type. */
export function conclusionAssumptions(type: LimiterType): string[] {
  const shared = [
    "Left and right foot labels were assigned correctly from the video.",
    "The athlete ran at near-maximal intent through the measured zone.",
  ];
  if (type === "step_length_asymmetry" || type === "step_frequency_asymmetry") {
    return [...shared, "The valid steps per side are representative of the athlete's typical pattern."];
  }
  return shared;
}

/** Conditions under which AVA would revise a conclusion of the given type. */
export function conclusionChangeConditions(type: LimiterType): string[] {
  switch (type) {
    case "step_length_asymmetry":
    case "step_frequency_asymmetry":
      return [
        "Additional valid steps reduce the observed side-to-side difference toward balance.",
        "Repeated sessions show the difference does not persist.",
        "Improved video quality changes which side each contact is assigned to.",
      ];
    default:
      return [];
  }
}

/** What a recommendation does NOT prove (honesty line attached to every recommendation). */
export function recommendationDoesNotProve(type: LimiterType): string {
  if (type === "step_length_asymmetry" || type === "step_frequency_asymmetry")
    return "Trying this does not confirm the cause of the asymmetry — it is a way to observe whether the pattern changes, not a diagnosis.";
  return "This is a direction to investigate, not a diagnosis of cause.";
}

/** Short human label for a comparison basis. */
export function basisSourceLabel(
  basis:
    | "individualized"
    | "historical_baseline"
    | "coach_defined"
    | "research_reference"
    | "session_goal"
    | "within_athlete_symmetry"
    | "unavailable",
): string {
  switch (basis) {
    case "individualized":
      return "Individualized model";
    case "historical_baseline":
      return "Athlete historical baseline";
    case "coach_defined":
      return "Coach-defined target";
    case "research_reference":
      return "Research reference";
    case "session_goal":
      return "Session goal";
    case "within_athlete_symmetry":
      return "Within-athlete symmetry (provisional)";
    case "unavailable":
      return "No validated comparison available";
  }
}
