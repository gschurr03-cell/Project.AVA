/**
 * Sprint knowledge base: structured, coach-facing definitions for the drills the
 * recommendation engine references by id. Pure static data — no logic, no I/O —
 * so any part of the coaching module can look a drill up without duplicating
 * descriptions. Keep entries concise and coach-focused.
 */

export interface CoachingExercise {
  id: string;
  name: string;
  category:
    | "Acceleration"
    | "Max Velocity"
    | "Elasticity"
    | "Technique"
    | "Strength"
    | "Mobility";

  purpose: string;

  coachingCue: string;

  commonMistakes: string[];

  difficulty: "Beginner" | "Intermediate" | "Advanced";
}

/** All known drills, keyed by their stable `id`. */
export const EXERCISES: Record<string, CoachingExercise> = {
  "sprint-dribbles": {
    id: "sprint-dribbles",
    name: "Sprint Dribbles",
    category: "Technique",
    purpose: "Groove front-side mechanics and quick turnover at a low, controllable intensity.",
    coachingCue: "Stay tall, quick feet, and strike the ground directly under the hips.",
    commonMistakes: [
      "Reaching the foot out in front of the body",
      "Sitting in the hips instead of running tall",
      "Rushing until posture breaks down",
    ],
    difficulty: "Beginner",
  },

  "wicket-runs": {
    id: "wicket-runs",
    name: "Wicket Runs",
    category: "Max Velocity",
    purpose: "Build a rhythmic, repeatable stride pattern and fast ground contacts at top-end speed.",
    coachingCue: "Punch the ground, drive the knee up, and stay tall through each wicket.",
    commonMistakes: [
      "Over-striding to reach the next wicket",
      "Looking down at the wickets",
      "Braking on ground contact",
    ],
    difficulty: "Intermediate",
  },

  "a-skips": {
    id: "a-skips",
    name: "A-Skips",
    category: "Technique",
    purpose: "Reinforce knee drive, dorsiflexion, and front-side mechanics in a coordinated pattern.",
    coachingCue: "Knee up, toe up, then strike down and back under the hip.",
    commonMistakes: [
      "Low, lazy knee drive",
      "Pointed (plantarflexed) foot",
      "Leaning back away from the drive leg",
    ],
    difficulty: "Beginner",
  },

  "fly-30s": {
    id: "fly-30s",
    name: "Fly 30s",
    category: "Max Velocity",
    purpose: "Develop and express maximum velocity through a rolling, built-up entry.",
    coachingCue: "Build speed smoothly, then relax the face and shoulders at top speed.",
    commonMistakes: [
      "Tensing up at maximum speed",
      "Reaching top speed too early in the run-in",
      "Over-striding to chase speed",
    ],
    difficulty: "Advanced",
  },

  "straight-leg-bounds": {
    id: "straight-leg-bounds",
    name: "Straight-leg Bounds",
    category: "Elasticity",
    purpose: "Build ankle stiffness and elastic return with an active, pawing ground strike.",
    coachingCue: "Paw the ground with a stiff ankle and near-straight leg.",
    commonMistakes: [
      "Bending the knees through contact",
      "Soft, collapsing ankles",
      "Reaching for the ground instead of pawing back",
    ],
    difficulty: "Intermediate",
  },

  bounding: {
    id: "bounding",
    name: "Bounding",
    category: "Elasticity",
    purpose: "Develop horizontal power and long, powerful, rhythmic strides.",
    coachingCue: "Drive the knee, cover ground, and hold big rhythmic bounds.",
    commonMistakes: [
      "Short, choppy bounds",
      "Collapsing on landing",
      "Passive arm drive",
    ],
    difficulty: "Advanced",
  },

  "resisted-sled-sprints": {
    id: "resisted-sled-sprints",
    name: "Resisted Sled Sprints",
    category: "Acceleration",
    purpose: "Build horizontal force production and acceleration-specific strength.",
    coachingCue: "Push the ground back with aggressive shin angles and a patient rise.",
    commonMistakes: [
      "Standing up too early",
      "Loading so heavy that posture breaks",
      "Short, choppy steps",
    ],
    difficulty: "Intermediate",
  },

  "hill-accelerations": {
    id: "hill-accelerations",
    name: "Hill Accelerations",
    category: "Acceleration",
    purpose: "Reinforce acceleration posture and force application against a natural resistance.",
    coachingCue: "Stay low, drive the arms, and push through the whole foot.",
    commonMistakes: [
      "Popping upright too early",
      "Over-striding up the hill",
      "Choosing a hill that is too steep",
    ],
    difficulty: "Beginner",
  },

  "pogo-hops": {
    id: "pogo-hops",
    name: "Pogo Hops",
    category: "Elasticity",
    purpose: "Develop ankle stiffness and fast, reactive ground contacts.",
    coachingCue: "Stiff ankles, quick contacts, and minimal knee bend.",
    commonMistakes: [
      "Bending the knees to absorb the landing",
      "Slow, heavy ground contacts",
      "Landing flat-footed",
    ],
    difficulty: "Beginner",
  },

  "low-hurdle-hops": {
    id: "low-hurdle-hops",
    name: "Low Hurdle Hops",
    category: "Elasticity",
    purpose: "Build reactive strength with fast, stiff ground contacts between low hurdles.",
    coachingCue: "Land tall and springy and spend as little time on the ground as possible.",
    commonMistakes: [
      "Sinking into a deep squat on landing",
      "Long ground-contact times",
      "Knees collapsing inward",
    ],
    difficulty: "Intermediate",
  },

  "ankle-stiffness-series": {
    id: "ankle-stiffness-series",
    name: "Ankle Stiffness Series",
    category: "Elasticity",
    purpose: "Build reactive ankle stiffness to shorten ground-contact times.",
    coachingCue: "Toes up, bounce off a firm ankle, and stay tall.",
    commonMistakes: [
      "Letting the heel drop or collapse",
      "Bending at the knee to create the bounce",
      "Slow, deliberate contacts",
    ],
    difficulty: "Beginner",
  },
};
