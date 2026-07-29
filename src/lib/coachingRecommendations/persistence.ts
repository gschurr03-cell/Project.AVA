import { buildCoachingRecommendations } from "./engine";
import type { CoachingRecommendationsInput, CoachingRecommendationsResult } from "./types";

/**
 * Saved analyses retain their structured, versioned recommendation snapshot. Working
 * analyses may be deterministically regenerated. Persistence adapters can store the result
 * as JSON without parsing rendered prose; a missing saved snapshot is surfaced explicitly
 * instead of silently rewriting historical output with newer rules.
 */
export function resolveCoachingRecommendationLifecycle(input: {
  generationInput: CoachingRecommendationsInput;
  savedAnalysis: boolean;
  storedResult: CoachingRecommendationsResult | null;
}): {
  result: CoachingRecommendationsResult | null;
  behavior: "regenerated" | "immutable_snapshot" | "snapshot_required";
} {
  if (input.savedAnalysis) {
    return input.storedResult
      ? { result: input.storedResult, behavior: "immutable_snapshot" }
      : { result: null, behavior: "snapshot_required" };
  }
  return { result: buildCoachingRecommendations(input.generationInput), behavior: "regenerated" };
}
