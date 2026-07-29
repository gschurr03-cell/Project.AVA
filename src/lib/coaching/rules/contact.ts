import type { CoachingInsight, CoachingRule } from "../types";

export const eliteContactRule: CoachingRule = {
  id: "elite-contact",

  evaluate({ evaluations }): CoachingInsight | null {
    const contact = evaluations.find(
      (evaluation) => evaluation.id === "groundContactTime"
    );

    if (!contact || contact.status !== "elite") {
      return null;
    }

    return {
      id: "elite-contact",
      category: "groundContact",
      severity: "excellent",
      priority: 70,
      title: "Elite ground contact",
      explanation:
        "Ground contact time is within the elite range, suggesting strong stiffness and force application during support.",
      recommendation:
        "Maintain current stiffness qualities while focusing on projection and rhythm.",
      evidence: [
        `${contact.label}: ${contact.value} ${contact.unit}`,
        `Status: ${contact.status}`,
        `Target: ${contact.targetRange}`,
      ],
    };
  },
};