import type { InterpretationInput, InterpretationResult } from "./contracts";
import { generateInterpretations } from "./evaluate";

/**
 * Lifecycle boundary for future storage integration. Working analyses regenerate
 * deterministically. Saved versions must return their stored snapshot and never
 * silently run newer rules.
 */
export function resolveInterpretationLifecycle(input: {
  generationInput: InterpretationInput;
  savedVersion: boolean;
  storedResult: InterpretationResult | null;
}): { result: InterpretationResult | null; behavior: "regenerated" | "immutable_snapshot" | "snapshot_required" } {
  if (input.savedVersion) {
    return input.storedResult
      ? { result: input.storedResult, behavior: "immutable_snapshot" }
      : { result: null, behavior: "snapshot_required" };
  }
  return { result: generateInterpretations(input.generationInput), behavior: "regenerated" };
}
