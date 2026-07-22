/**
 * Communication Layer (Phase 12). Renders the same underlying recommendation or plan at
 * different explanation depths — athlete-friendly, coach-level, a concise summary, or a
 * detailed report. Depth changes the LANGUAGE and amount of detail, never the substance.
 * Pure + deterministic.
 */

import type { CoachingExplanation, ExplanationDepth, PremiumRecommendation, WeeklyPlan } from "./models";

export const COMMUNICATION_ENGINE_VERSION = "ava-premium-communication-v1" as const;

export function explainRecommendation(rec: PremiumRecommendation, depth: ExplanationDepth): CoachingExplanation {
  const benefit = rec.expectedBenefit ? `${rec.expectedBenefit.direction === "increase" ? "improve" : "reduce"} ${rec.expectedBenefit.label} (${rec.expectedBenefit.magnitude})` : "support progress";

  switch (depth) {
    case "summary":
      return { depth, subjectId: rec.id, text: `${rec.title}.`, keyPoints: [rec.why] };
    case "athlete":
      return {
        depth,
        subjectId: rec.id,
        text: `${rec.what} This should help ${benefit}. ${plain(rec.whyNow)}`,
        keyPoints: [plain(rec.why), "Your coach can adjust this anytime."],
      };
    case "coach":
      return {
        depth,
        subjectId: rec.id,
        text: `${rec.what} Why: ${rec.why} Why now: ${rec.whyNow} Expected: ${benefit}. Confidence: ${rec.confidence.category}${rec.confidence.score != null ? ` (${rec.confidence.score})` : ""}.`,
        keyPoints: [...rec.evidence, ...(rec.alternatives.length ? [`Alternatives: ${rec.alternatives.map((a) => a.label).join(", ")}`] : [])],
      };
    case "detailed":
    default:
      return {
        depth: "detailed",
        subjectId: rec.id,
        text: `${rec.title}. ${rec.what}\nWhy: ${rec.why}\nWhy now: ${rec.whyNow}\nExpected benefit: ${benefit}.\nConfidence: ${rec.confidence.category}${rec.confidence.score != null ? ` (${rec.confidence.score})` : ""}.`,
        keyPoints: [
          ...rec.evidence.map((e) => `Evidence: ${e}`),
          ...rec.alternatives.map((a) => `Alternative: ${a.label} — ${a.note}`),
          `Coach override: ${rec.coachOverride.status}${rec.coachOverride.locked ? " (locked)" : ""}`,
        ],
      };
  }
}

export function explainWeeklyPlan(plan: WeeklyPlan, depth: ExplanationDepth): CoachingExplanation {
  const sessionList = plan.sessions.map((s) => `${s.day}: ${s.session.label} (${s.emphasis})`).join(", ");
  if (depth === "summary") {
    return { depth, subjectId: plan.id, text: `${plan.sessions.length}-session week (${plan.blockType}), load ${plan.load.band}.`, keyPoints: plan.objectives };
  }
  if (depth === "athlete") {
    return { depth, subjectId: plan.id, text: `This week: ${sessionList}. Keep quality high and tell your coach how you feel.`, keyPoints: ["Volumes are guides, not rules."] };
  }
  return {
    depth: depth === "coach" ? "coach" : "detailed",
    subjectId: plan.id,
    text: `Week of ${plan.weekOf} (${plan.blockType}). ${sessionList}. Load: ${plan.load.band} (${plan.load.cumulativeStress}).`,
    keyPoints: [...plan.objectives, ...plan.notes, plan.load.disclaimer],
  };
}

/** Strip parenthetical/percentage jargon for athlete-facing text. */
function plain(text: string): string {
  return text.replace(/\s*\([^)]*%[^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}
