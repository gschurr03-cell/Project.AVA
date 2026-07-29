/**
 * Premium Coaching — CONFIGURATION (Phase 12).
 *
 * Block templates, session templates, load weights, taper defaults, and explanation depth
 * settings. These are coaching-model parameters, not measured data or guarantees. A new
 * block type, session type, or emphasis plugs in by adding an entry here — the generators
 * iterate the templates, so engine logic never changes. Volumes are SUGGESTIONS, scaled by
 * athlete level and block, and always coach-reviewable.
 */

import type { BlockType, SessionType, Level } from "./models";

export const PREMIUM_CONFIG_VERSION = "ava-premium-coaching-config-v1" as const;

export interface BlockTemplate {
  label: string;
  primaryObjectives: string[];
  secondaryObjectives: string[];
  technicalEmphasis: string[];
  physicalEmphasis: string[];
  monitoringPriorities: string[];
  successIndicators: string[];
  sessionMix: SessionType[];
}

export const BLOCK_TEMPLATES: Record<BlockType, BlockTemplate> = {
  general_prep: {
    label: "General Preparation",
    primaryObjectives: ["Build work capacity", "Develop a broad strength base"],
    secondaryObjectives: ["Movement quality", "Tissue tolerance"],
    technicalEmphasis: ["Postural control", "Rhythm and relaxation"],
    physicalEmphasis: ["General strength", "Aerobic/tempo capacity", "Mobility"],
    monitoringPriorities: ["Recording quality", "Movement competency", "Recovery"],
    successIndicators: ["Improved tempo capacity", "Cleaner mechanics under low speed"],
    sessionMix: ["tempo", "strength", "mobility", "technical", "plyometrics"],
  },
  specific_prep: {
    label: "Specific Preparation",
    primaryObjectives: ["Develop maximum velocity", "Convert strength to speed"],
    secondaryObjectives: ["Acceleration mechanics", "Reactive strength"],
    technicalEmphasis: ["Front-side mechanics", "Ground-contact quality"],
    physicalEmphasis: ["Power", "Reactive strength", "Max velocity exposure"],
    monitoringPriorities: ["Top speed", "Ground contact", "Stride metrics"],
    successIndicators: ["Higher peak velocity", "Shorter ground contact"],
    sessionMix: ["maximum_velocity", "acceleration", "plyometrics", "strength", "technical"],
  },
  pre_competition: {
    label: "Pre-Competition",
    primaryObjectives: ["Sharpen speed", "Race-model rehearsal"],
    secondaryObjectives: ["Maintain strength", "Refine transitions"],
    technicalEmphasis: ["Acceleration-to-upright transition", "Maximal intent"],
    physicalEmphasis: ["Speed", "Power maintenance"],
    monitoringPriorities: ["Freshness", "Top speed", "Technical consistency"],
    successIndicators: ["Fast, repeatable efforts", "Stable technique at speed"],
    sessionMix: ["maximum_velocity", "acceleration", "speed_endurance", "recovery"],
  },
  competition: {
    label: "Competition",
    primaryObjectives: ["Peak and express speed", "Compete fresh"],
    secondaryObjectives: ["Maintain readiness"],
    technicalEmphasis: ["Race execution"],
    physicalEmphasis: ["Speed maintenance", "Recovery"],
    monitoringPriorities: ["Readiness", "Recovery", "Competition results"],
    successIndicators: ["Season-best performances", "Consistent readiness"],
    sessionMix: ["acceleration", "maximum_velocity", "recovery", "technical"],
  },
  transition: {
    label: "Transition",
    primaryObjectives: ["Recover and regenerate", "Address niggles"],
    secondaryObjectives: ["Maintain general fitness"],
    technicalEmphasis: ["Movement variety"],
    physicalEmphasis: ["Low-intensity general activity", "Mobility"],
    monitoringPriorities: ["Recovery", "Well-being"],
    successIndicators: ["Restored freshness", "Resolved minor issues"],
    sessionMix: ["recovery", "mobility", "tempo"],
  },
  rehabilitation: {
    label: "Rehabilitation",
    primaryObjectives: ["Restore capacity of the affected area (coaching-side)", "Rebuild tolerance gradually"],
    secondaryObjectives: ["Maintain unaffected qualities"],
    technicalEmphasis: ["Controlled, pain-free mechanics"],
    physicalEmphasis: ["Progressive loading", "Mobility"],
    monitoringPriorities: ["Symptom response", "Load tolerance", "Symmetry"],
    successIndicators: ["Increasing pain-free tolerance", "Restored symmetry"],
    sessionMix: ["mobility", "strength", "recovery", "tempo"],
  },
  return_to_play: {
    label: "Return-to-Play",
    primaryObjectives: ["Reintroduce speed progressively", "Rebuild confidence"],
    secondaryObjectives: ["Re-establish reactive strength"],
    technicalEmphasis: ["Graded exposure to acceleration and top speed"],
    physicalEmphasis: ["Progressive plyometrics", "Speed re-exposure"],
    monitoringPriorities: ["Symptom response", "Symmetry", "Recording quality"],
    successIndicators: ["Full-speed tolerance", "Symmetry within range"],
    sessionMix: ["acceleration", "plyometrics", "technical", "recovery"],
  },
};

export interface SessionTemplate {
  label: string;
  purpose: string;
  associatedQualities: string[];
  baseVolume: string;
  baseRecovery: string;
  intensity: string;
  cues: string[];
  monitoring: string[];
  adjustmentNotes: string[];
  /** Relative load contribution (0..1) of one such session. */
  loadWeight: number;
}

export const SESSION_TEMPLATES: Record<SessionType, SessionTemplate> = {
  acceleration: { label: "Acceleration", purpose: "Develop early horizontal force and posture.", associatedQualities: ["acceleration", "transitionEfficiency"], baseVolume: "6–8 × 20–30 m", baseRecovery: "3–5 min", intensity: "high", cues: ["Push the ground back", "Gradual rise"], monitoring: ["Shin angle", "Ground contact"], adjustmentNotes: ["Cut volume if intent drops"], loadWeight: 0.8 },
  maximum_velocity: { label: "Maximum Velocity", purpose: "Express and raise top speed.", associatedQualities: ["peakVelocity", "strideFrequency", "strideLength"], baseVolume: "4–6 × 30–60 m flys", baseRecovery: "full (6–8 min)", intensity: "very high", cues: ["Tall and relaxed", "Quick ground"], monitoring: ["Top speed", "Stride metrics"], adjustmentNotes: ["Stop on velocity drop-off"], loadWeight: 0.9 },
  speed_endurance: { label: "Speed Endurance", purpose: "Hold speed under fatigue.", associatedQualities: ["maxVelocityMaintenance"], baseVolume: "3–5 × 80–150 m", baseRecovery: "long (8–12 min)", intensity: "high", cues: ["Relax and maintain"], monitoring: ["Speed drop-off"], adjustmentNotes: ["Reduce reps if form degrades"], loadWeight: 1.0 },
  tempo: { label: "Tempo", purpose: "Aerobic/work-capacity and recovery.", associatedQualities: [], baseVolume: "1000–2000 m of extensive tempo", baseRecovery: "short (30–60 s)", intensity: "low", cues: ["Smooth and controlled"], monitoring: ["Rhythm"], adjustmentNotes: ["Scale to feel"], loadWeight: 0.4 },
  plyometrics: { label: "Plyometrics", purpose: "Reactive strength and stiffness.", associatedQualities: ["reactiveStrength", "groundContactTime"], baseVolume: "40–80 contacts", baseRecovery: "full between sets", intensity: "high", cues: ["Stiff, quick contacts"], monitoring: ["Contact quality"], adjustmentNotes: ["Reduce contacts if quality drops"], loadWeight: 0.6 },
  strength: { label: "Strength", purpose: "Force base and robustness.", associatedQualities: ["strideLength"], baseVolume: "3–5 sets × 2–6 reps", baseRecovery: "2–4 min", intensity: "high", cues: ["Intent on every rep"], monitoring: ["Bar speed", "Technique"], adjustmentNotes: ["Auto-regulate by readiness"], loadWeight: 0.7 },
  mobility: { label: "Mobility", purpose: "Range of motion and tissue prep.", associatedQualities: [], baseVolume: "15–25 min", baseRecovery: "n/a", intensity: "low", cues: ["Controlled range"], monitoring: ["Range", "Comfort"], adjustmentNotes: ["Daily as needed"], loadWeight: 0.2 },
  recovery: { label: "Recovery", purpose: "Facilitate regeneration.", associatedQualities: [], baseVolume: "20–40 min light", baseRecovery: "n/a", intensity: "very low", cues: ["Easy and relaxed"], monitoring: ["Well-being"], adjustmentNotes: ["Prioritise sleep/nutrition"], loadWeight: 0.1 },
  technical: { label: "Technical", purpose: "Refine sprint mechanics.", associatedQualities: ["strideFrequency", "strideLength", "transitionEfficiency"], baseVolume: "drills + 4–6 × 30 m build-ups", baseRecovery: "as needed", intensity: "moderate", cues: ["Front-side, tall posture"], monitoring: ["Mechanics"], adjustmentNotes: ["Keep quality high"], loadWeight: 0.3 },
  combined: { label: "Combined", purpose: "Blend qualities in one session.", associatedQualities: ["acceleration", "peakVelocity"], baseVolume: "mixed (see components)", baseRecovery: "per component", intensity: "high", cues: ["Prioritise the primary quality"], monitoring: ["Primary quality"], adjustmentNotes: ["Front-load the priority"], loadWeight: 0.85 },
};

/** Volume scaling by athlete level (suggestions, not prescriptions). */
export const LEVEL_VOLUME_SCALE: Record<Level, number> = {
  developing: 0.7,
  intermediate: 0.85,
  advanced: 1,
  elite: 1.1,
};

/** Load-management model. */
export const LOAD = {
  /** Band thresholds on the 0..100 cumulative-stress scale. */
  bands: { low: 30, moderate: 55, high: 78 },
  weights: { frequency: 0.35, intensity: 0.3, regression: 0.2, trend: 0.15 },
  /** Sessions/week that saturate the frequency factor. */
  frequencySaturation: 8,
  disclaimer: "Coaching guidance only — not a medical assessment. AVA never diagnoses and cannot guarantee injury prevention.",
} as const;

/** Competition taper defaults. */
export const TAPER = {
  startDaysOut: 10,
  volumeReductionPct: 40,
  intensityNote: "Maintain intensity, cut volume — keep the nervous system sharp.",
} as const;

/** Adaptive-decision thresholds (relative to the athlete's own progress). */
export const ADAPT = {
  /** Recent load band at/above which recovery is prioritised. */
  highLoadBand: "high" as const,
} as const;
