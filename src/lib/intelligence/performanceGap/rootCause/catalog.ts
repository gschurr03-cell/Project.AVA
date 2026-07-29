/**
 * Root Cause catalog (Phase 3) — CONFIGURABLE data only.
 *
 * Contributors, their associated muscle groups + intervention categories, and the
 * set of plausible contributors evaluated for each limiter. Adding a contributor or
 * changing associations is a config edit; the engine iterates this catalog.
 */

import type { AssociatedMuscleGroup, InterventionCategory } from "./models";

export const ROOT_CAUSE_CATALOG_VERSION = "ava-root-cause-catalog-v1" as const;

/** Muscle-group catalog (associations, never diagnoses). */
export const MUSCLE_GROUPS: Record<string, AssociatedMuscleGroup> = {
  hamstrings: { id: "hamstrings", label: "Hamstrings" },
  gluteMax: { id: "gluteMax", label: "Gluteus Maximus" },
  hipFlexors: { id: "hipFlexors", label: "Hip Flexors" },
  soleus: { id: "soleus", label: "Soleus" },
  gastrocnemius: { id: "gastrocnemius", label: "Gastrocnemius" },
  quadriceps: { id: "quadriceps", label: "Quadriceps" },
  adductors: { id: "adductors", label: "Adductors" },
  core: { id: "core", label: "Core" },
  footAnkle: { id: "footAnkle", label: "Foot / Ankle Complex" },
};

/** Intervention-category catalog — categories, never prescribed programs. */
export const INTERVENTION_CATEGORIES: Record<string, InterventionCategory> = {
  flyingSprints: {
    id: "flyingSprints",
    label: "Flying Sprints",
    purpose: "Expose the athlete to maximal velocity and top-end mechanics.",
    typicalImplementation: "Typical fly zones of 10–30 m after a 20–30 m build-up.",
  },
  hillAccelerations: {
    id: "hillAccelerations",
    label: "Hill Accelerations",
    purpose: "Reinforce acceleration posture and horizontal force.",
    typicalImplementation: "Typical hill distances of 20–40 m on a moderate incline.",
  },
  wicketRuns: {
    id: "wicketRuns",
    label: "Wicket Runs",
    purpose: "Groove front-side mechanics and stride rhythm at speed.",
    typicalImplementation: "Individualized wicket spacing over 20–40 m.",
  },
  dribbleProgressions: {
    id: "dribbleProgressions",
    label: "Dribble Progressions",
    purpose: "Develop ground return and front-side recovery.",
    typicalImplementation: "Ankle/knee dribbles progressing into acceleration.",
  },
  straightLegBounds: {
    id: "straightLegBounds",
    label: "Straight-leg Bounds",
    purpose: "Build stiffness and ground return for turnover.",
    typicalImplementation: "20–30 m of continuous stiff bounding.",
  },
  alternateLegBounds: {
    id: "alternateLegBounds",
    label: "Alternate-leg Bounds",
    purpose: "Develop horizontal power and projection.",
    typicalImplementation: "20–40 m of alternate bounds for distance.",
  },
  pogoSeries: {
    id: "pogoSeries",
    label: "Pogo Series",
    purpose: "Develop reactive strength and ankle stiffness.",
    typicalImplementation: "Short pogo sets emphasizing minimal contact time.",
  },
  sprintFloatSprint: {
    id: "sprintFloatSprint",
    label: "Sprint-float-sprint",
    purpose: "Train relaxed top-speed maintenance.",
    typicalImplementation: "Accelerate, float, re-accelerate over ~60–80 m.",
  },
  wallDrills: {
    id: "wallDrills",
    label: "Wall Drills",
    purpose: "Isolate front-side mechanics and posture.",
    typicalImplementation: "Wall marches/switches emphasizing timing.",
  },
  technicalSwitches: {
    id: "technicalSwitches",
    label: "Technical Switches",
    purpose: "Improve limb switching and recovery timing.",
    typicalImplementation: "A-switch / scissor drills at controlled speed.",
  },
  mobilityFocus: {
    id: "mobilityFocus",
    label: "Mobility Focus",
    purpose: "Address range-of-motion restrictions associated with the pattern.",
    typicalImplementation: "Targeted hip/ankle mobility for the associated area.",
  },
};

export interface ContributorDefinition {
  id: string;
  label: string;
  /** Base prior weight before rule evidence (configurable). */
  prior: number;
  association: string;
  muscleGroups: string[];
  interventionCategories: string[];
}

/** The contributor catalog. */
export const CONTRIBUTORS: Record<string, ContributorDefinition> = {
  reactiveStrength: {
    id: "reactiveStrength",
    label: "Reactive Strength",
    prior: 0.12,
    association: "commonly associated with short, forceful ground contacts and elastic return",
    muscleGroups: ["soleus", "gastrocnemius", "quadriceps", "footAnkle"],
    interventionCategories: ["pogoSeries", "straightLegBounds", "flyingSprints"],
  },
  verticalForce: {
    id: "verticalForce",
    label: "Vertical Force Production",
    prior: 0.1,
    association: "commonly associated with the ability to project the body between steps",
    muscleGroups: ["gluteMax", "quadriceps", "gastrocnemius"],
    interventionCategories: ["alternateLegBounds", "hillAccelerations"],
  },
  projection: {
    id: "projection",
    label: "Projection",
    prior: 0.1,
    association: "commonly associated with covering more ground per step without overstriding",
    muscleGroups: ["gluteMax", "hamstrings"],
    interventionCategories: ["alternateLegBounds", "flyingSprints"],
  },
  frontSideMechanics: {
    id: "frontSideMechanics",
    label: "Front-side Mechanics",
    prior: 0.1,
    association: "commonly associated with quicker limb repositioning and turnover",
    muscleGroups: ["hipFlexors", "core"],
    interventionCategories: ["wicketRuns", "wallDrills", "dribbleProgressions"],
  },
  groundStrikePosition: {
    id: "groundStrikePosition",
    label: "Ground Strike Position",
    prior: 0.08,
    association: "commonly associated with foot strike relative to the body's center of mass",
    muscleGroups: ["hamstrings", "gluteMax"],
    interventionCategories: ["wicketRuns", "technicalSwitches"],
  },
  hipExtensionTiming: {
    id: "hipExtensionTiming",
    label: "Hip Extension Timing",
    prior: 0.08,
    association: "commonly associated with the timing of force application through extension",
    muscleGroups: ["gluteMax", "hamstrings"],
    interventionCategories: ["technicalSwitches", "wallDrills"],
  },
  elasticStiffness: {
    id: "elasticStiffness",
    label: "Elastic Stiffness",
    prior: 0.08,
    association: "commonly associated with reduced ground contact time",
    muscleGroups: ["soleus", "gastrocnemius", "footAnkle"],
    interventionCategories: ["pogoSeries", "straightLegBounds"],
  },
  timingCoordination: {
    id: "timingCoordination",
    label: "Timing & Coordination",
    prior: 0.06,
    association: "commonly associated with inter-limb coordination and rhythm",
    muscleGroups: ["core"],
    interventionCategories: ["dribbleProgressions", "wallDrills"],
  },
  mobilityRestriction: {
    id: "mobilityRestriction",
    label: "Mobility Restriction",
    prior: 0.06,
    association: "commonly associated with limited range of motion at the hip or ankle",
    muscleGroups: ["hipFlexors", "adductors", "footAnkle"],
    interventionCategories: ["mobilityFocus"],
  },
  technicalOverreaching: {
    id: "technicalOverreaching",
    label: "Technical Overreaching",
    prior: 0.05,
    association: "commonly associated with reaching for stride length and braking at touchdown",
    muscleGroups: ["hamstrings"],
    interventionCategories: ["wicketRuns", "technicalSwitches"],
  },
  fatigueIndicators: {
    id: "fatigueIndicators",
    label: "Fatigue Indicators",
    prior: 0.04,
    association: "commonly associated with a within-run decline in output",
    muscleGroups: ["hamstrings", "gluteMax"],
    interventionCategories: ["sprintFloatSprint"],
  },
  leftSideForce: {
    id: "leftSideForce",
    label: "Left-side Force Production",
    prior: 0.03,
    association: "commonly associated with a side-specific force or stance difference",
    muscleGroups: ["gluteMax", "quadriceps", "soleus"],
    interventionCategories: ["straightLegBounds", "hillAccelerations"],
  },
  rightSideForce: {
    id: "rightSideForce",
    label: "Right-side Force Production",
    prior: 0.03,
    association: "commonly associated with a side-specific force or stance difference",
    muscleGroups: ["gluteMax", "quadriceps", "soleus"],
    interventionCategories: ["straightLegBounds", "hillAccelerations"],
  },
  delayedRecovery: {
    id: "delayedRecovery",
    label: "Delayed Recovery Mechanics",
    prior: 0.03,
    association: "commonly associated with slower limb recovery on one side",
    muscleGroups: ["hipFlexors"],
    interventionCategories: ["dribbleProgressions", "wallDrills"],
  },
  timingAsymmetry: {
    id: "timingAsymmetry",
    label: "Timing Asymmetry",
    prior: 0.03,
    association: "commonly associated with left/right rhythm differences",
    muscleGroups: ["core"],
    interventionCategories: ["technicalSwitches"],
  },
};

/** The plausible contributors evaluated for each limiter (the "all contributors" set). */
export const CANDIDATE_CONTRIBUTORS: Record<string, string[]> = {
  strideLength: [
    "reactiveStrength", "verticalForce", "projection", "frontSideMechanics", "groundStrikePosition",
    "hipExtensionTiming", "elasticStiffness", "timingCoordination", "mobilityRestriction",
    "technicalOverreaching", "fatigueIndicators",
    "leftSideForce", "rightSideForce", "delayedRecovery", "timingAsymmetry",
  ],
  strideFrequency: [
    "frontSideMechanics", "elasticStiffness", "reactiveStrength", "timingCoordination",
    "groundStrikePosition", "mobilityRestriction", "fatigueIndicators",
    "leftSideForce", "rightSideForce", "delayedRecovery", "timingAsymmetry",
  ],
  groundContactTime: ["reactiveStrength", "elasticStiffness", "verticalForce", "groundStrikePosition"],
  peakVelocity: ["reactiveStrength", "frontSideMechanics", "projection", "elasticStiffness", "fatigueIndicators"],
  acceleration: ["verticalForce", "hipExtensionTiming", "projection", "technicalOverreaching"],
};

export function candidateContributors(metricId: string): string[] {
  const base = metricId.replace(/(Left|Right)$/, "");
  return CANDIDATE_CONTRIBUTORS[base] ?? ["reactiveStrength", "frontSideMechanics", "mobilityRestriction"];
}
export function contributor(id: string): ContributorDefinition | undefined {
  return CONTRIBUTORS[id];
}
export function muscleGroup(id: string): AssociatedMuscleGroup {
  return MUSCLE_GROUPS[id] ?? { id, label: id };
}
export function interventionCategory(id: string): InterventionCategory {
  return (
    INTERVENTION_CATEGORIES[id] ?? { id, label: id, purpose: "", typicalImplementation: "" }
  );
}
