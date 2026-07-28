import type { z } from "zod";

import { explanationTypeSchema } from "./contracts";

export type AlternativeExplanation = z.infer<typeof explanationTypeSchema>;

export const ALTERNATIVE_EXPLANATION_LABELS: Record<AlternativeExplanation, string> = {
  technical_strategy: "Technical strategy",
  phase_transition: "Sprint-phase transition",
  fatigue: "Fatigue effect",
  strength_difference: "Strength difference",
  mobility_difference: "Mobility difference",
  coordination_difference: "Coordination difference",
  anthropometric_difference: "Anthropometric difference",
  recording_angle: "Recording angle",
  camera_motion: "Camera movement",
  frame_rate: "Frame-rate limitation",
  calibration_error: "Calibration uncertainty",
  pose_estimation_error: "Pose-estimation variation",
  event_detection_error: "Event-detection variation",
  environmental_context: "Environmental context",
  athlete_variability: "Normal athlete variability",
  insufficient_sample: "Insufficient sample",
  unknown: "Unknown explanation",
};

export const COMMON_ASYMMETRY_EXPLANATIONS: AlternativeExplanation[] = [
  "technical_strategy",
  "fatigue",
  "strength_difference",
  "mobility_difference",
  "coordination_difference",
  "recording_angle",
  "athlete_variability",
  "insufficient_sample",
];

export const NO_DIAGNOSIS_CONCLUSIONS = [
  "Cannot diagnose injury.",
  "Cannot confirm weakness.",
  "Cannot identify pain.",
  "Cannot prescribe rehabilitation.",
];
