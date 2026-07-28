import type { Interpretation } from "@/lib/intelligence/interpretations";

import type { InterpretationConfidence, InterpretationEvidenceQuality, RecommendationContext } from "./contracts";

export interface RecommendationRule {
  ruleId: string;
  version: string;
  category: string;
  requiredInterpretationKeys: string[];
  optionalInterpretationKeys: string[];
  excludedInterpretationKeys: string[];
  requiredContext: string[];
  exclusionContext: string[];
  minimumConfidence: InterpretationConfidence;
  minimumEvidenceQuality: InterpretationEvidenceQuality;
  phaseApplicability: string[];
  eventApplicability: string[];
  athleteApplicability: string[];
  goalApplicability: string[];
  libraryItemId: string;
  safetyPolicy: string;
  conflictGroup: string | null;
  duplicateGroup: string;
  enabled: boolean;
  experimental: boolean;
  evaluationFunction(interpretations: Interpretation[], context: RecommendationContext): Interpretation[];
}

const byKey = (key: string) => (items: Interpretation[]) =>
  items.filter((item) => item.interpretationKey === key);
const rule = (
  config: Pick<RecommendationRule, "ruleId" | "requiredInterpretationKeys" | "libraryItemId" | "duplicateGroup"> &
    Partial<RecommendationRule> & {
      select?: (items: Interpretation[], context: RecommendationContext) => Interpretation[];
    },
): RecommendationRule => ({
  version: "1",
  category: "general",
  optionalInterpretationKeys: [],
  excludedInterpretationKeys: [],
  requiredContext: [],
  exclusionContext: [],
  minimumConfidence: "Low",
  minimumEvidenceQuality: "heuristic",
  phaseApplicability: ["any"],
  eventApplicability: ["any"],
  athleteApplicability: ["any"],
  goalApplicability: ["any"],
  safetyPolicy: "lowest_sufficient_tier",
  conflictGroup: null,
  enabled: true,
  experimental: false,
  evaluationFunction: config.select ?? ((items) => byKey(config.requiredInterpretationKeys[0])(items)),
  ...config,
});

export const RECOMMENDATION_RULES: RecommendationRule[] = [
  rule({ ruleId: "recommendation.recording.repeat_60fps.v1", requiredInterpretationKeys: ["recording_event_review_limited"], libraryItemId: "record_60fps", duplicateGroup: "recording_fps", experimental: true }),
  rule({ ruleId: "recommendation.recording.static_view.v1", requiredInterpretationKeys: ["panning_context"], libraryItemId: "static_side_view", duplicateGroup: "recording_camera" }),
  rule({ ruleId: "recommendation.recording.preserve_setup.v1", requiredInterpretationKeys: ["recording_supports_review"], libraryItemId: "preserve_recording_setup", duplicateGroup: "recording_preserve", minimumConfidence: "Moderate" }),
  rule({ ruleId: "recommendation.timing.preserve_setup.v1", requiredInterpretationKeys: ["timing_supports_event_review"], libraryItemId: "preserve_timing_setup", duplicateGroup: "timing_preserve", minimumConfidence: "Moderate" }),
  rule({ ruleId: "recommendation.velocity.repeat_zone.v1", requiredInterpretationKeys: ["velocity_context_available"], libraryItemId: "repeat_velocity_zone", duplicateGroup: "velocity_evidence" }),
  rule({ ruleId: "recommendation.cadence.monitor.v1", requiredInterpretationKeys: ["cadence_context_available"], libraryItemId: "monitor_cadence", duplicateGroup: "cadence_monitor" }),
  ...["isolated_stride_length_asymmetry", "isolated_stride_frequency_asymmetry", "isolated_contact_asymmetry", "isolated_flight_asymmetry"].map(
    (key): RecommendationRule =>
      rule({ ruleId: `recommendation.asymmetry.monitor.${key}.v1`, requiredInterpretationKeys: [key], libraryItemId: "monitor_asymmetry", duplicateGroup: "asymmetry_monitor" }),
  ),
  rule({ ruleId: "recommendation.asymmetry.converging_monitor.v1", requiredInterpretationKeys: ["converging_asymmetry"], libraryItemId: "monitor_asymmetry", duplicateGroup: "asymmetry_monitor" }),
  rule({ ruleId: "recommendation.asymmetry.coach_review.v1", requiredInterpretationKeys: ["converging_asymmetry"], libraryItemId: "coach_asymmetry_review", duplicateGroup: "asymmetry_review", minimumConfidence: "Moderate", minimumEvidenceQuality: "limited" }),
  rule({
    ruleId: "recommendation.asymmetry.resolve_contradiction.v1",
    requiredInterpretationKeys: ["contradictory_asymmetry"],
    libraryItemId: "resolve_contradiction",
    duplicateGroup: "asymmetry_monitor",
    select: (items) => items.filter((item) => item.interpretationKey === "contradictory_asymmetry"),
  }),
  rule({ ruleId: "recommendation.front_side.reconfirm.v1", requiredInterpretationKeys: ["reduced_front_side_position"], libraryItemId: "reconfirm_front_side", duplicateGroup: "front_side_action" }),
  rule({ ruleId: "recommendation.front_side.awareness.v1", requiredInterpretationKeys: ["reduced_front_side_position"], libraryItemId: "front_side_awareness", duplicateGroup: "front_side_action", minimumConfidence: "Moderate", minimumEvidenceQuality: "limited", phaseApplicability: ["transition", "maximum_velocity"] }),
  rule({ ruleId: "recommendation.front_side.preserve.v1", requiredInterpretationKeys: ["front_side_matches_reference"], libraryItemId: "preserve_front_side", duplicateGroup: "front_side_preserve" }),
  rule({ ruleId: "recommendation.posture.preserve.v1", requiredInterpretationKeys: ["torso_stable"], libraryItemId: "preserve_torso", duplicateGroup: "posture_preserve" }),
  rule({ ruleId: "recommendation.posture.monitor.v1", requiredInterpretationKeys: ["torso_variable"], libraryItemId: "monitor_posture", duplicateGroup: "posture_action" }),
  rule({ ruleId: "recommendation.posture.awareness.v1", requiredInterpretationKeys: ["torso_variable"], libraryItemId: "posture_awareness", duplicateGroup: "posture_action", minimumConfidence: "Moderate", minimumEvidenceQuality: "limited", phaseApplicability: ["transition"] }),
  rule({ ruleId: "recommendation.consistency.preserve.v1", requiredInterpretationKeys: ["mechanically_repeatable_segment"], libraryItemId: "preserve_repeatability", duplicateGroup: "consistency_preserve" }),
];
