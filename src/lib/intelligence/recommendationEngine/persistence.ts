import type { RecommendationInput, RecommendationResult } from "./contracts";
import { generateRecommendations } from "./evaluate";

export function resolveRecommendationLifecycle(input: {
  generationInput: RecommendationInput;
  savedVersion: boolean;
  storedResult: RecommendationResult | null;
}): {
  result: RecommendationResult | null;
  behavior: "regenerated" | "immutable_snapshot" | "snapshot_required";
} {
  if (input.savedVersion)
    return input.storedResult
      ? { result: input.storedResult, behavior: "immutable_snapshot" }
      : { result: null, behavior: "snapshot_required" };
  return { result: generateRecommendations(input.generationInput), behavior: "regenerated" };
}
