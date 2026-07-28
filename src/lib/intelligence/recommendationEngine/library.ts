import type { z } from "zod";

import {
  actionTypeSchema,
  interventionTypeSchema,
  safetyTierSchema,
} from "./contracts";
import { EXCLUDED_RECOMMENDATION_CLAIMS, UNIVERSAL_CONTRAINDICATIONS, UNIVERSAL_STOP_CONDITIONS } from "./safety";

export type RecommendationLibraryItem = {
  libraryItemId: string;
  recommendationKey: string;
  title: string;
  summary: string;
  objective: string;
  actionType: z.infer<typeof actionTypeSchema>;
  interventionType: z.infer<typeof interventionTypeSchema>;
  applicablePhases: string[];
  applicableEvents: string[];
  applicableGoals: string[];
  defaultCues: string[];
  drillId: string | null;
  defaultImplementationNotes: string[];
  defaultMonitoringPlan: {
    preferredRecordingSetup: string;
    minimumSessions: number;
    compatibilityRequirements: string[];
    successSignal: string;
    regressionSignal: string;
    reviewWindow: string;
  };
  progressionGuidance: string;
  frequencyGuidance: string;
  stopConditions: string[];
  contraindications: string[];
  safetyTier: z.infer<typeof safetyTierSchema>;
  evidenceBasis: "strong" | "moderate" | "limited" | "heuristic" | "unknown";
  expectedOutcomeArea: string;
  requiresCoachReview: boolean;
  excludedClaims: string[];
  enabled: boolean;
};

const item = (
  value: Omit<
    RecommendationLibraryItem,
    | "applicableEvents"
    | "applicableGoals"
    | "defaultImplementationNotes"
    | "progressionGuidance"
    | "frequencyGuidance"
    | "stopConditions"
    | "contraindications"
    | "excludedClaims"
    | "enabled"
  > &
    Partial<RecommendationLibraryItem>,
): RecommendationLibraryItem => ({
  applicableEvents: ["any"],
  applicableGoals: ["any"],
  defaultImplementationNotes: ["Change one variable at a time and preserve compatible recording conditions."],
  progressionGuidance: "Progress only after the action remains controlled and repeatable.",
  frequencyGuidance: "Use a limited exposure within a coach-approved session.",
  stopConditions: UNIVERSAL_STOP_CONDITIONS,
  contraindications: UNIVERSAL_CONTRAINDICATIONS,
  excludedClaims: EXCLUDED_RECOMMENDATION_CLAIMS,
  enabled: true,
  ...value,
});

const monitorPlan = (
  successSignal: string,
  regressionSignal: string,
  minimumSessions = 2,
) => ({
  preferredRecordingSetup: "Repeat the same side view, FPS tier, phase, calibration, and timing mode.",
  minimumSessions,
  compatibilityRequirements: [
    "Same analysis contract and phase",
    "Compatible camera and FPS tier",
    "Compatible calibration and session purpose",
  ],
  successSignal,
  regressionSignal,
  reviewWindow: "Review after the minimum number of compatible sessions.",
});

export const RECOMMENDATION_LIBRARY: RecommendationLibraryItem[] = [
  item({ libraryItemId: "record_60fps", recommendationKey: "repeat_at_60fps", title: "Repeat the recording at 60 FPS or higher", summary: "Collect a compatible validated recording before making event-level changes.", objective: "Improve event-timing confidence.", actionType: "record_again", interventionType: "recording_task", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("Event timing becomes available under the validated FPS tier.", "Timing remains unavailable or inconsistent."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "recording confidence", requiresCoachReview: false }),
  item({ libraryItemId: "static_side_view", recommendationKey: "use_static_side_view", title: "Repeat with a static side view", summary: "Use a stable side view when the session allows it.", objective: "Reduce camera-motion limitations.", actionType: "improve_recording_setup", interventionType: "recording_task", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("Camera mode is classified as static and target metrics remain available.", "Camera movement or body visibility remains limiting."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "recording confidence", requiresCoachReview: false }),
  item({ libraryItemId: "preserve_recording_setup", recommendationKey: "preserve_recording_setup", title: "Preserve the current recording setup", summary: "Keep the successful setup compatible across future recordings.", objective: "Protect measurement comparability.", actionType: "preserve_strength", interventionType: "preserve_current_pattern", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("Recording quality remains high across compatible sessions.", "Recording quality or metric availability declines."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "recording confidence", requiresCoachReview: false }),
  item({ libraryItemId: "preserve_timing_setup", recommendationKey: "preserve_timing_setup", title: "Preserve the compatible timing setup", summary: "Repeat the same timing mode and event definitions for comparison.", objective: "Maintain timing comparability.", actionType: "preserve_strength", interventionType: "preserve_current_pattern", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("Timing remains available and compatible.", "Timing mode or event definitions change."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "timing reliability", requiresCoachReview: false }),
  item({ libraryItemId: "repeat_velocity_zone", recommendationKey: "repeat_velocity_zone", title: "Repeat the same measured zone", summary: "Use the same run-in, phase, calibration, and timing setup before comparing velocity.", objective: "Collect comparable velocity evidence.", actionType: "collect_more_data", interventionType: "observation_task", applicablePhases: ["maximum_velocity", "transition", "unknown"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("Velocity remains available across compatible sessions.", "Calibration or phase compatibility changes."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "timing reliability", requiresCoachReview: false }),
  item({ libraryItemId: "monitor_cadence", recommendationKey: "monitor_cadence", title: "Monitor cadence without forcing a change", summary: "Repeat cadence measurement before treating rhythm as a change target.", objective: "Establish whether rhythm is repeatable.", actionType: "monitor_pattern", interventionType: "observation_task", applicablePhases: ["any"], defaultCues: [], drillId: null, defaultMonitoringPlan: monitorPlan("Cadence remains consistent across compatible segments.", "Cadence changes materially under compatible conditions."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "rhythm consistency", requiresCoachReview: false }),
  item({ libraryItemId: "monitor_asymmetry", recommendationKey: "monitor_asymmetry", title: "Monitor the side-to-side pattern", summary: "Repeat the same measurement before selecting a corrective action.", objective: "Determine whether the observed side difference persists.", actionType: "monitor_pattern", interventionType: "asymmetry_monitoring", applicablePhases: ["any"], defaultCues: ["even_rhythm"], drillId: "bilateral_rhythm_rehearsal", defaultMonitoringPlan: monitorPlan("The direction and size of the side difference become repeatable.", "The direction changes or the observation becomes unavailable.", 3), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "side-to-side balance", requiresCoachReview: false }),
  item({ libraryItemId: "coach_asymmetry_review", recommendationKey: "coach_review_repeated_asymmetry", title: "Discuss the repeated pattern with a qualified coach", summary: "Review the coordinated side-to-side observations before changing training.", objective: "Add qualified context to a multi-metric pattern.", actionType: "coach_review", interventionType: "coach_discussion", applicablePhases: ["any"], defaultCues: [], drillId: null, defaultMonitoringPlan: monitorPlan("A coach confirms a repeatable pattern across compatible sessions.", "Metrics disagree or the pattern does not repeat.", 3), safetyTier: "tier_3", evidenceBasis: "limited", expectedOutcomeArea: "athlete understanding", requiresCoachReview: true }),
  item({ libraryItemId: "reconfirm_front_side", recommendationKey: "reconfirm_front_side", title: "Reconfirm front-side position", summary: "Repeat the same phase and camera setup before making a mechanical change.", objective: "Confirm the front-side observation.", actionType: "collect_more_data", interventionType: "observation_task", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("The same phase-relative observation repeats.", "Phase, angle, or observation direction changes."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "front-side recovery", requiresCoachReview: false }),
  item({ libraryItemId: "front_side_awareness", recommendationKey: "front_side_awareness", title: "Use a relaxed front-side awareness cue", summary: "Rehearse forward recovery without forcing knee height.", objective: "Explore front-side coordination conservatively.", actionType: "technical_cue", interventionType: "technique_focus", applicablePhases: ["transition", "maximum_velocity"], defaultCues: ["front_side_recovery"], drillId: "a_march_low", defaultMonitoringPlan: monitorPlan("The position becomes repeatable without loss of rhythm.", "Rhythm, comfort, or coordination deteriorates."), safetyTier: "tier_2", evidenceBasis: "heuristic", expectedOutcomeArea: "front-side recovery", requiresCoachReview: false }),
  item({ libraryItemId: "preserve_front_side", recommendationKey: "preserve_front_side", title: "Preserve the current front-side pattern", summary: "Avoid forcing additional range while the position matches the configured reference.", objective: "Maintain a currently supported pattern.", actionType: "preserve_strength", interventionType: "preserve_current_pattern", applicablePhases: ["any"], defaultCues: [], drillId: null, defaultMonitoringPlan: monitorPlan("Reference agreement remains stable.", "The pattern becomes variable or moves away from the reference."), safetyTier: "tier_1", evidenceBasis: "limited", expectedOutcomeArea: "front-side recovery", requiresCoachReview: false }),
  item({ libraryItemId: "preserve_torso", recommendationKey: "preserve_torso", title: "Preserve the current torso stability", summary: "Maintain the repeatable torso behavior while reviewing other mechanics.", objective: "Avoid disrupting a supported strength.", actionType: "preserve_strength", interventionType: "preserve_current_pattern", applicablePhases: ["any"], defaultCues: ["preserve_torso"], drillId: null, defaultMonitoringPlan: monitorPlan("Torso behavior remains repeatable.", "Torso variability increases under compatible conditions."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "posture control", requiresCoachReview: false }),
  item({ libraryItemId: "posture_awareness", recommendationKey: "posture_awareness", title: "Use a controlled posture-awareness cue", summary: "Explore controlled torso behavior without prescribing a universal angle.", objective: "Improve awareness of phase-appropriate posture control.", actionType: "technical_cue", interventionType: "posture_drill", applicablePhases: ["transition"], defaultCues: ["controlled_transition"], drillId: "a_march_low", defaultMonitoringPlan: monitorPlan("Torso behavior becomes more repeatable within the same phase.", "Comfort, rhythm, or phase-appropriate movement deteriorates."), safetyTier: "tier_2", evidenceBasis: "heuristic", expectedOutcomeArea: "posture control", requiresCoachReview: false }),
  item({ libraryItemId: "monitor_posture", recommendationKey: "monitor_posture", title: "Monitor torso behavior in the same phase", summary: "Collect another compatible segment before using a phase-specific cue.", objective: "Separate true variability from phase or recording effects.", actionType: "monitor_pattern", interventionType: "observation_task", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("The same variability pattern repeats in one known phase.", "The pattern changes with phase or camera setup."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "posture control", requiresCoachReview: false }),
  item({ libraryItemId: "preserve_repeatability", recommendationKey: "preserve_repeatability", title: "Preserve the repeatable movement pattern", summary: "Avoid changing stable mechanics without stronger evidence.", objective: "Protect currently repeatable movement.", actionType: "preserve_strength", interventionType: "preserve_current_pattern", applicablePhases: ["any"], defaultCues: ["preserve_torso"], drillId: null, defaultMonitoringPlan: monitorPlan("Multiple available mechanics remain repeatable.", "A previously stable observation becomes variable."), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "movement consistency", requiresCoachReview: false }),
  item({ libraryItemId: "resolve_contradiction", recommendationKey: "resolve_contradictory_evidence", title: "Collect compatible evidence before changing mechanics", summary: "The current interpretations disagree, so no corrective action is recommended.", objective: "Resolve contradictory evidence safely.", actionType: "collect_more_data", interventionType: "observation_task", applicablePhases: ["any"], defaultCues: ["preserve_setup"], drillId: null, defaultMonitoringPlan: monitorPlan("Compatible metrics agree on the presence or absence of a pattern.", "The evidence remains directionally inconsistent.", 3), safetyTier: "tier_1", evidenceBasis: "moderate", expectedOutcomeArea: "athlete understanding", requiresCoachReview: false }),
];

export const recommendationLibraryItem = (id: string): RecommendationLibraryItem => {
  const found = RECOMMENDATION_LIBRARY.find((entry) => entry.libraryItemId === id);
  if (!found) throw new Error(`Unknown recommendation library item: ${id}`);
  return found;
};
