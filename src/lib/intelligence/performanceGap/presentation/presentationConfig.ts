/**
 * Part B presentation config — ADDITIVE to the Part A engines (never modifies them).
 *
 * Maps engine ids (recommendations, metrics) to coaching-facing detail: associated
 * muscle groups, technical patterns, and suggested drill / strength / mobility /
 * sprint work. All associative + scientifically honest ("commonly associated with"),
 * never diagnostic. New entries plug in here without touching engine logic.
 */

export interface RecommendationDetail {
  associatedMuscleGroups: string[];
  associatedTechnicalPatterns: string[];
  drills: string[];
  strengthWork: string[];
  mobilityWork: string[];
  sprintSessions: string[];
}

/** Keyed by recommendationId (see RECOMMENDATION_CATALOG in config.ts). */
export const RECOMMENDATION_DETAIL: Record<string, RecommendationDetail> = {
  reactiveStrength: {
    associatedMuscleGroups: ["calf complex", "quadriceps", "glutes"],
    associatedTechnicalPatterns: ["elastic ground contact", "stiff ankle at touchdown"],
    drills: ["pogo hops", "ankling", "low hurdle bounces"],
    strengthWork: ["depth jumps", "hurdle hops", "isometric calf holds"],
    mobilityWork: ["ankle dorsiflexion mobility"],
    sprintSessions: ["short accelerations 10–20 m", "flying 20 m"],
  },
  maxVelocityExposure: {
    associatedMuscleGroups: ["hip flexors", "hamstrings", "glutes"],
    associatedTechnicalPatterns: ["front-side mechanics", "relaxed top-end rhythm"],
    drills: ["wicket runs", "build-ups", "A-skips into sprint"],
    strengthWork: ["hamstring eccentrics"],
    mobilityWork: ["hip flexor mobility"],
    sprintSessions: ["flying 30 m", "ins-and-outs 60 m"],
  },
  hipExtensionTiming: {
    associatedMuscleGroups: ["glutes", "hamstrings"],
    associatedTechnicalPatterns: ["timely hip extension", "projection off the ground"],
    drills: ["A-runs", "straight-leg bounds"],
    strengthWork: ["hip thrusts", "Romanian deadlifts"],
    mobilityWork: ["hip extension mobility"],
    sprintSessions: ["acceleration to fly 30 m"],
  },
  projectionMechanics: {
    associatedMuscleGroups: ["glutes", "posterior chain"],
    associatedTechnicalPatterns: ["projection", "avoiding overstride/braking"],
    drills: ["bounding", "single-leg bounds"],
    strengthWork: ["trap-bar jumps"],
    mobilityWork: ["thoracic + hip mobility"],
    sprintSessions: ["flying sprints with projection cue"],
  },
  frontSideMechanics: {
    associatedMuscleGroups: ["hip flexors", "core"],
    associatedTechnicalPatterns: ["front-side recovery", "knee drive timing"],
    drills: ["A-skips", "dribble series", "wall drills"],
    strengthWork: ["banded hip flexion"],
    mobilityWork: ["hip flexor + hamstring mobility"],
    sprintSessions: ["max-velocity wickets"],
  },
  elasticStiffness: {
    associatedMuscleGroups: ["calf complex", "Achilles tendon"],
    associatedTechnicalPatterns: ["short, stiff ground contact"],
    drills: ["pogo hops", "continuous hurdle hops"],
    strengthWork: ["stiffness plyometrics", "isometric calf work"],
    mobilityWork: ["ankle mobility"],
    sprintSessions: ["flying 20 m"],
  },
  resistedAcceleration: {
    associatedMuscleGroups: ["glutes", "quadriceps", "calves"],
    associatedTechnicalPatterns: ["positive shin angle", "horizontal force orientation"],
    drills: ["sled marches", "wall accelerations"],
    strengthWork: ["heavy sled pushes", "back squats"],
    mobilityWork: ["ankle + hip mobility"],
    sprintSessions: ["resisted starts 10–20 m"],
  },
  hillSprints: {
    associatedMuscleGroups: ["glutes", "hamstrings", "calves"],
    associatedTechnicalPatterns: ["acceleration posture", "force application"],
    drills: ["incline build-ups"],
    strengthWork: ["step-ups"],
    mobilityWork: ["hip mobility"],
    sprintSessions: ["hill sprints 20–30 m"],
  },
  maxStrength: {
    associatedMuscleGroups: ["glutes", "quadriceps", "posterior chain"],
    associatedTechnicalPatterns: ["force capacity per contact"],
    drills: [],
    strengthWork: ["back squats", "trap-bar deadlifts", "split squats"],
    mobilityWork: ["hip + ankle mobility"],
    sprintSessions: ["short accelerations"],
  },
  speedEndurance: {
    associatedMuscleGroups: ["hamstrings", "glutes"],
    associatedTechnicalPatterns: ["maintained top-speed rhythm"],
    drills: ["relaxation runs"],
    strengthWork: ["hamstring eccentrics"],
    mobilityWork: ["hip mobility"],
    sprintSessions: ["speed-endurance 80–120 m", "ins-and-outs"],
  },
};

export function recommendationDetail(id: string): RecommendationDetail {
  return (
    RECOMMENDATION_DETAIL[id] ?? {
      associatedMuscleGroups: [],
      associatedTechnicalPatterns: [],
      drills: [],
      strengthWork: [],
      mobilityWork: [],
      sprintSessions: [],
    }
  );
}

/** Associated technical patterns + muscle groups per metric, for left/right + limiter cards. */
export interface MetricAssociations {
  technicalPatterns: string[];
  muscleGroups: string[];
}
export const METRIC_ASSOCIATIONS: Record<string, MetricAssociations> = {
  strideLength: {
    technicalPatterns: ["projection", "hip extension timing", "front-side mechanics"],
    muscleGroups: ["glutes", "hamstrings", "calf complex"],
  },
  strideFrequency: {
    technicalPatterns: ["front-side recovery", "elastic stiffness"],
    muscleGroups: ["hip flexors", "calf complex", "core"],
  },
  groundContactTime: {
    technicalPatterns: ["elastic stiffness", "stiff ankle at touchdown"],
    muscleGroups: ["calf complex", "Achilles tendon", "quadriceps"],
  },
  flightTime: {
    technicalPatterns: ["projection", "vertical force"],
    muscleGroups: ["glutes", "calf complex"],
  },
  peakVelocity: {
    technicalPatterns: ["top-end mechanics", "force in short contacts"],
    muscleGroups: ["glutes", "hamstrings", "calf complex"],
  },
  acceleration: {
    technicalPatterns: ["shin angle", "horizontal force orientation"],
    muscleGroups: ["glutes", "quadriceps", "calves"],
  },
};
export function metricAssociations(metricId: string): MetricAssociations {
  const base = metricId.replace(/(Left|Right)$/, "");
  return METRIC_ASSOCIATIONS[base] ?? { technicalPatterns: [], muscleGroups: [] };
}
