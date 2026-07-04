import type { CoachingInsight, CoachingRule } from "../types";

export const strideLimiterRule: CoachingRule = {
  id: "stride-limiter",

  evaluate({ evaluations }): CoachingInsight | null {
    const stride = evaluations.find((evaluation) => evaluation.id === "strideLength");

    if (!stride || (stride.status !== "watch" && stride.status !== "poor")) {
      return null;
    }

    return {
      id: "stride-limiter",
      category: "stride",
      severity: stride.status,
      priority: stride.status === "poor" ? 95 : 85,
      title: "Stride length may be limiting velocity",
      explanation:
        "Stride length is below the target range, which may reduce total sprint velocity even if turnover is strong.",
      recommendation:
        "Prioritize projection, front-side mechanics, and hip extension during max velocity work.",
      evidence: [
        `${stride.label}: ${stride.value} ${stride.unit}`,
        `Status: ${stride.status}`,
        `Target: ${stride.targetRange}`,
      ],
    };
  },
};

export const cadenceStrideRule: CoachingRule = {
  id: "cadence-stride-balance",

  evaluate({ evaluations }): CoachingInsight | null {
    const cadence = evaluations.find(
      (evaluation) => evaluation.id === "stepFrequency"
    );
    const stride = evaluations.find((evaluation) => evaluation.id === "strideLength");

    if (!cadence || !stride) {
      return null;
    }

    const cadenceStrong = cadence.status === "elite" || cadence.status === "good";
    const strideLimited = stride.status === "watch" || stride.status === "poor";

    if (!cadenceStrong || !strideLimited) {
      return null;
    }

    return {
      id: "cadence-stride-balance",
      category: "maxVelocity",
      severity: "watch",
      priority: 90,
      title: "Turnover is strong, but stride length is limiting speed",
      explanation:
        "Step frequency is strong while stride length is below target, suggesting the athlete does not need to chase faster turnover first.",
      recommendation:
        "Focus on applying force through better projection, hip extension, and front-side mechanics.",
      evidence: [
        `${cadence.label}: ${cadence.value} ${cadence.unit} (${cadence.status})`,
        `${stride.label}: ${stride.value} ${stride.unit} (${stride.status})`,
      ],
    };
  },
};