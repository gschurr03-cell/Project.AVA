import type { TwinTimelineEvent } from "./contracts";
import type { z } from "zod";
import { recommendationMemorySchema } from "./contracts";

export type RecommendationMemory = z.infer<typeof recommendationMemorySchema>;

export function buildRecommendationMemory(events: TwinTimelineEvent[]): RecommendationMemory[] {
  return events.flatMap((event) => {
    if (event.payload.kind !== "recommendation") return [];
    const followUp = event.payload.followUp;
    let effectSize: number | null = null;
    let effectDirection: RecommendationMemory["effectDirection"] = "unknown";
    if (followUp && followUp.baselineValue !== 0) {
      const raw = (followUp.latestValue - followUp.baselineValue) / Math.abs(followUp.baselineValue);
      effectSize = Number((raw * (followUp.higherIsBetter ? 1 : -1)).toFixed(4));
      effectDirection = Math.abs(effectSize) < 0.01 ? "no_measurable_change" : effectSize > 0 ? "improved" : "regressed";
    }
    return [{
      recommendationId: event.payload.recommendationId,
      recommendationKey: event.payload.recommendationKey, title: event.payload.title,
      date: event.occurredAt, context: event.payload.context,
      implementationStatus: event.payload.implementationStatus,
      followUpEvidence: followUp?.evidenceIds ?? [], effectSize, effectDirection,
      confidence: followUp ? event.confidence : Math.min(event.confidence, 0.4),
      futureApplicability: event.payload.futureApplicability, causalClaimAllowed: false as const,
    }];
  });
}

