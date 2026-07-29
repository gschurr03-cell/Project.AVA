import type { Observation } from "@/lib/observations";

import type {
  InterpretationConfidence,
  InterpretationContext,
} from "./types";

const RANK: Record<Observation["confidence"], number> = {
  Unavailable: 0,
  Low: 1,
  Moderate: 2,
  High: 3,
};
const LABELS: InterpretationConfidence[] = ["Unavailable", "Low", "Moderate", "High"];

export function aggregateInterpretationConfidence(
  observations: Observation[],
  context: InterpretationContext,
  alternativeExplanationCount: number,
): { confidence: InterpretationConfidence; reasons: string[] } {
  if (!observations.length) {
    return { confidence: "Unavailable", reasons: ["No accepted observations."] };
  }
  const weakest = Math.min(...observations.map((item) => RANK[item.confidence]));
  // Interpretations are inferential: v1 never promotes an interpretation above
  // Moderate even when every underlying measurement is High confidence.
  let rank = Math.min(weakest, 2);
  const reasons = [
    `Weakest linked observation confidence is ${LABELS[weakest]}.`,
    `${observations.length} observation${observations.length === 1 ? "" : "s"} support the interpretation.`,
    "Interpretation confidence is capped at Moderate because meaning is inferred.",
  ];
  if (context.phase === "unknown") {
    rank = Math.min(rank, 1);
    reasons.push("Sprint phase is unknown.");
  } else {
    reasons.push(`Sprint phase is ${context.phase}.`);
  }
  if (context.cameraMode?.includes("pan")) {
    rank = Math.min(rank, 1);
    reasons.push("The recording used a panning camera.");
  }
  if (context.fpsTier === "experimental_30") {
    rank = Math.min(rank, 1);
    reasons.push("The source uses the experimental 30 FPS tier.");
  }
  if (observations.some((item) => item.experimental)) {
    rank = Math.min(rank, 1);
    reasons.push("At least one linked observation is experimental.");
  }
  if (alternativeExplanationCount >= 4) {
    rank = Math.min(rank, 1);
    reasons.push("Multiple plausible alternative explanations remain.");
  }
  return { confidence: LABELS[rank], reasons };
}
