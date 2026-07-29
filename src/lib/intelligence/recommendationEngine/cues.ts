export interface CueItem {
  cueId: string;
  shortCue: string;
  expandedCue: string;
  category: string;
  applicablePhases: string[];
  intendedFocus: string;
  contraindications: string[];
  safetyTier: "tier_1" | "tier_2";
  evidenceBasis: "limited" | "heuristic";
  athleteReadingLevel: "plain";
}

export const CUE_LIBRARY: CueItem[] = [
  { cueId: "preserve_torso", shortCue: "Maintain the torso position you already show well.", expandedCue: "Keep the same controlled torso behavior while reviewing other mechanics.", category: "posture", applicablePhases: ["any"], intendedFocus: "preservation", contraindications: [], safetyTier: "tier_1", evidenceBasis: "heuristic", athleteReadingLevel: "plain" },
  { cueId: "controlled_transition", shortCue: "Stay controlled through the transition.", expandedCue: "Allow posture to change with the phase while keeping the movement controlled.", category: "posture", applicablePhases: ["transition"], intendedFocus: "posture awareness", contraindications: ["unknown_phase"], safetyTier: "tier_2", evidenceBasis: "heuristic", athleteReadingLevel: "plain" },
  { cueId: "front_side_recovery", shortCue: "Recover the thigh forward without forcing height.", expandedCue: "Use a relaxed forward recovery and avoid exaggerating the knee position.", category: "front_side", applicablePhases: ["transition", "maximum_velocity"], intendedFocus: "front-side coordination", contraindications: ["unknown_phase"], safetyTier: "tier_2", evidenceBasis: "heuristic", athleteReadingLevel: "plain" },
  { cueId: "even_rhythm", shortCue: "Keep the rhythm even between sides.", expandedCue: "Use the same relaxed rhythm on both sides without forcing cadence.", category: "rhythm", applicablePhases: ["any"], intendedFocus: "bilateral rhythm awareness", contraindications: [], safetyTier: "tier_2", evidenceBasis: "heuristic", athleteReadingLevel: "plain" },
  { cueId: "preserve_setup", shortCue: "Repeat the same recording setup.", expandedCue: "Keep camera position, phase, run-in, calibration, and timing mode compatible.", category: "recording", applicablePhases: ["any"], intendedFocus: "evidence compatibility", contraindications: [], safetyTier: "tier_1", evidenceBasis: "limited", athleteReadingLevel: "plain" },
];
