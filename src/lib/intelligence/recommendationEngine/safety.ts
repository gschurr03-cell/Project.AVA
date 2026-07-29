import type { RecommendationContext } from "./contracts";

export const UNIVERSAL_STOP_CONDITIONS = [
  "Stop if pain or increasing discomfort occurs.",
  "Stop if coordination or technique deteriorates substantially.",
  "Stop for dizziness, an unsafe surface, or unstable equipment.",
];

export const UNIVERSAL_CONTRAINDICATIONS = [
  "Do not perform during active pain or acute injury.",
  "Follow any clinician restriction.",
  "Use suitable footwear, a safe surface, and an appropriate warm-up.",
  "Do not add the activity when excessively fatigued.",
];

export const EXCLUDED_RECOMMENDATION_CLAIMS = [
  "Does not guarantee a faster sprint time.",
  "Does not diagnose weakness or mobility restriction.",
  "Does not replace a qualified coach.",
  "Does not replace medical assessment.",
  "Does not establish injury risk.",
  "Does not prescribe a complete training program.",
];

export function safetyGate(
  context: RecommendationContext,
  tier: "tier_1" | "tier_2" | "tier_3" | "tier_4",
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (context.athlete.reportedPain === true || context.athlete.activeLimitation) {
    if (tier === "tier_2") {
      return {
        allowed: false,
        reasons: ["Active athlete-reported pain or limitation blocks ordinary drill recommendations."],
      };
    }
    reasons.push("Athlete-reported pain or limitation is present.");
  }
  if (tier === "tier_4" && context.athlete.reportedPain !== true && !context.athlete.activeLimitation)
    return {
      allowed: false,
      reasons: ["Professional medical review cannot be triggered by biomechanics alone."],
    };
  return { allowed: true, reasons };
}

const UNSAFE = [
  /\bthis will make you faster\b/i,
  /\bcaused by weakness\b/i,
  /\binjury risk\b/i,
  /\bguaranteed\b/i,
  /\boptimal\b/i,
  /\bperfect\b/i,
  /\bfix your imbalance\b/i,
  /\bcure\b/i,
  /\bprevent injury\b/i,
  /\bincrease speed by\b/i,
  /\breduce your time by\b/i,
];

export const unsafeRecommendationPhrases = (text: string): string[] =>
  UNSAFE.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);

export function assertSafeRecommendationLanguage(fields: string[]): void {
  const unsafe = unsafeRecommendationPhrases(fields.join(" "));
  if (unsafe.length) throw new Error(`Unsafe recommendation language: ${unsafe.join(", ")}`);
}
