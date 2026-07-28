import type { TwinTimelineEvent } from "./contracts";
import { DIGITAL_TWIN_POLICY } from "./policy";
import { confidenceLevel100 } from "@/lib/intelligence/shared/confidence";

export function calculateTwinConfidence(events: TwinTimelineEvent[], generatedAt: string) {
  if (!events.length) return {
    score: 0, level: "Insufficient" as const, lastEvidenceAt: null,
    reasons: ["No versioned athlete evidence has been accumulated."],
  };
  const latest = events.at(-1)!;
  const averageEvidence = events.reduce((sum, event) => sum + event.confidence, 0) / events.length;
  const coverage = Math.min(1, events.length / 20);
  let score = 100 * averageEvidence * (0.45 + coverage * 0.55);
  const inactiveDays = Math.max(0, (Date.parse(generatedAt) - Date.parse(latest.occurredAt)) / 86_400_000);
  const reasons = [`Confidence uses ${events.length} immutable historical event(s).`];
  if (inactiveDays > DIGITAL_TWIN_POLICY.confidenceGraceDays) {
    const periods = (inactiveDays - DIGITAL_TWIN_POLICY.confidenceGraceDays) / 30;
    const decay = periods * DIGITAL_TWIN_POLICY.confidenceDecayPer30Days;
    score = Math.max(DIGITAL_TWIN_POLICY.confidenceMinimumWithEvidence, score - decay);
    reasons.push(`Confidence decayed after ${Math.floor(inactiveDays)} days without new evidence.`);
  }
  score = Math.round(Math.min(100, score));
  return {
    score, level: confidenceLevel100(score),
    lastEvidenceAt: latest.occurredAt, reasons,
  };
}
