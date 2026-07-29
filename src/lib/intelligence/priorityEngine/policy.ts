import type { Recommendation } from "@/lib/intelligence/recommendationEngine";

import type { PriorityContext, PriorityScoreComponent } from "./contracts";

const CONFIDENCE_POINTS = { Unavailable: 0, Low: 12, Moderate: 24, High: 36 } as const;
const QUALITY_POINTS = { unknown: 0, heuristic: 8, limited: 16, moderate: 24, strong: 32 } as const;
const GOAL_POINTS = { unrelated: 0, unknown: 3, low: 6, moderate: 12, high: 20 } as const;
const SAFETY_POINTS = { tier_1: 15, tier_2: 8, tier_3: 2, tier_4: -5 } as const;

export interface InternalPriorityScore {
  value: number;
  components: PriorityScoreComponent[];
}

const component = (
  factor: string,
  effect: PriorityScoreComponent["effect"],
  reason: string,
): PriorityScoreComponent => ({ factor, effect, reason });

/** Numeric weights remain private; only categorical factor explanations leave this module. */
export function scoreRecommendation(
  recommendation: Recommendation,
  context: PriorityContext,
  linkedObservationCount: number,
  highQualityRecording: boolean,
): InternalPriorityScore {
  let value =
    CONFIDENCE_POINTS[recommendation.confidence] +
    QUALITY_POINTS[recommendation.interventionEvidenceQuality] +
    GOAL_POINTS[recommendation.athleteGoalRelevance] +
    SAFETY_POINTS[recommendation.safetyTier];
  const components: PriorityScoreComponent[] = [
    component(
      "evidence_confidence",
      recommendation.confidence === "High" || recommendation.confidence === "Moderate"
        ? "increased"
        : "decreased",
      `Recommendation confidence is ${recommendation.confidence}.`,
    ),
    component(
      "evidence_quality",
      ["strong", "moderate"].includes(recommendation.interventionEvidenceQuality)
        ? "increased"
        : "decreased",
      `Intervention evidence quality is ${recommendation.interventionEvidenceQuality}.`,
    ),
    component(
      "athlete_goal",
      ["high", "moderate"].includes(recommendation.athleteGoalRelevance)
        ? "increased"
        : recommendation.athleteGoalRelevance === "unrelated"
          ? "decreased"
          : "neutral",
      `Athlete-goal relevance is ${recommendation.athleteGoalRelevance}.`,
    ),
    component(
      "safety",
      recommendation.safetyTier === "tier_1" ? "increased" : "neutral",
      `${recommendation.safetyTier} is the selected safety tier.`,
    ),
  ];

  if (linkedObservationCount > 1) {
    value += 10;
    components.push(component("multi_metric_agreement", "increased", "Multiple linked observations support the action."));
  } else {
    components.push(component("multi_metric_agreement", "neutral", "Only one linked observation is available."));
  }

  const persistence = context.persistenceSignals.find(
    (signal) => signal.recommendationKey === recommendation.recommendationKey,
  );
  if (persistence?.persistent && persistence.compatibleSessionCount >= 2) {
    value += 18;
    components.push(component("cross_session_persistence", "increased", `The pattern persisted across ${persistence.compatibleSessionCount} compatible sessions.`));
  } else {
    components.push(component("cross_session_persistence", "neutral", "No compatible repeated-session persistence is available."));
  }
  if (persistence?.directionConsistent && persistence.compatibleSessionCount >= 2) {
    value += 12;
    components.push(component("repeatability", "increased", "The direction remained consistent across compatible sessions."));
  } else {
    components.push(component("repeatability", "neutral", "Repeatability has not been established."));
  }

  const baseline = context.baselineSignals.find(
    (signal) => signal.recommendationKey === recommendation.recommendationKey,
  );
  if (baseline?.compatibleBaselineAvailable && baseline.deviationClassification === "meaningful") {
    value += 14;
    components.push(component("personal_baseline", "increased", "A meaningful deviation from a compatible personal baseline is available."));
  } else {
    components.push(component("personal_baseline", "neutral", "No meaningful compatible personal-baseline deviation is available."));
  }

  if (context.phase === "unknown" && recommendation.safetyTier !== "tier_1") {
    value -= 10;
    components.push(component("sprint_phase", "decreased", "Sprint phase is unknown for a phase-specific action."));
  } else {
    value += context.phase === recommendation.phase && context.phase !== "unknown" ? 8 : 0;
    components.push(component("sprint_phase", context.phase === "unknown" ? "neutral" : "increased", context.phase === "unknown" ? "Sprint phase is unknown." : `The action matches the ${context.phase} phase.`));
  }

  if (context.primaryEvent && recommendation.event === context.primaryEvent) {
    value += 8;
    components.push(component("primary_event", "increased", "The action matches the athlete's primary event."));
  } else {
    components.push(component("primary_event", "neutral", "No supported primary-event match is available."));
  }
  if (context.coachRelevantAreas.includes(recommendation.expectedOutcomeArea)) {
    value += 8;
    components.push(component("coach_relevance", "increased", "The expected outcome area is marked coach-relevant."));
  } else {
    components.push(component("coach_relevance", "neutral", "No explicit coach-relevance signal is available."));
  }
  if (highQualityRecording) {
    value += 6;
    components.push(component("recording_confidence", "increased", "A high-quality recording observation supports the analysis context."));
  } else {
    components.push(component("recording_confidence", "neutral", "High recording quality was not established."));
  }

  const missingEvidence = ["record_again", "improve_recording_setup", "collect_more_data"].includes(
    recommendation.actionType,
  );
  if (missingEvidence) {
    value += 20;
    components.push(component("training_applicability", "increased", "Evidence collection is safer than a speculative mechanical change."));
  } else if (recommendation.status === "limited" || recommendation.experimental) {
    value -= 12;
    components.push(component("training_applicability", "decreased", "The action is limited or experimental."));
  } else {
    value += 6;
    components.push(component("training_applicability", "increased", "The recommendation is currently applicable."));
  }
  return { value, components };
}

export const recommendationFamily = (recommendation: Recommendation): string => {
  const key = recommendation.recommendationKey;
  if (key.includes("front_side")) return "front_side";
  if (key.includes("asymmetry")) return "asymmetry";
  if (key.includes("torso") || key.includes("posture")) return "posture";
  if (key.includes("cadence") || key.includes("rhythm")) return "rhythm";
  if (key.includes("velocity") || key.includes("timing")) return "timing_velocity";
  return key;
};
