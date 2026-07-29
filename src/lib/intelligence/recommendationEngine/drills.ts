export interface DrillItem {
  drillId: string;
  name: string;
  category: string;
  objective: string;
  applicablePhases: string[];
  difficulty: "beginner" | "intermediate";
  intensity: "low" | "submaximal";
  equipment: string[];
  setup: string;
  executionSummary: string;
  keyCues: string[];
  commonErrors: string[];
  contraindications: string[];
  stopConditions: string[];
  progressionOptions: string[];
  regressionOptions: string[];
  requiresCoachSupervision: boolean;
  evidenceBasis: "limited" | "heuristic";
  enabled: boolean;
}

export const DRILL_LIBRARY: DrillItem[] = [
  { drillId: "wall_march_controlled", name: "Controlled wall march", category: "posture", objective: "Practice controlled posture and alternating positions at low intensity.", applicablePhases: ["early_acceleration", "mid_acceleration"], difficulty: "beginner", intensity: "low", equipment: ["stable wall"], setup: "Use a stable wall and safe surface.", executionSummary: "Move slowly between alternate march positions without forcing range.", keyCues: ["Stay controlled.", "Keep the support stable."], commonErrors: ["Rushing", "Forcing body angle"], contraindications: ["active pain", "unstable surface"], stopConditions: ["Pain", "Loss of balance", "Substantial technique deterioration"], progressionOptions: ["Wall switch with coach approval"], regressionOptions: ["Standing A-march"], requiresCoachSupervision: false, evidenceBasis: "heuristic", enabled: true },
  { drillId: "a_march_low", name: "Low-intensity A-march", category: "coordination", objective: "Rehearse alternating front-side positions without forcing height.", applicablePhases: ["any"], difficulty: "beginner", intensity: "low", equipment: [], setup: "Use a flat, clear surface.", executionSummary: "March with relaxed alternating rhythm and controlled posture.", keyCues: ["Recover forward without forcing height.", "Keep the rhythm even."], commonErrors: ["Reaching", "Forcing knee height"], contraindications: ["active pain"], stopConditions: ["Pain", "Loss of coordination"], progressionOptions: ["Controlled A-run"], regressionOptions: ["Stationary march"], requiresCoachSupervision: false, evidenceBasis: "heuristic", enabled: true },
  { drillId: "dribble_low", name: "Low-intensity dribble progression", category: "rhythm", objective: "Rehearse relaxed cyclic rhythm at low intensity.", applicablePhases: ["transition", "maximum_velocity"], difficulty: "intermediate", intensity: "low", equipment: [], setup: "Use a flat, clear runway.", executionSummary: "Use short relaxed dribble actions, preserving coordination rather than speed.", keyCues: ["Keep the cycle relaxed.", "Do not force cadence."], commonErrors: ["Rushing", "Excessive tension"], contraindications: ["active pain", "unknown phase"], stopConditions: ["Pain", "Loss of rhythm", "Substantial technique deterioration"], progressionOptions: ["Submaximal fly under coach approval"], regressionOptions: ["A-march"], requiresCoachSupervision: false, evidenceBasis: "heuristic", enabled: true },
  { drillId: "low_wicket_rhythm", name: "Low-intensity wicket rhythm", category: "rhythm", objective: "Rehearse repeatable max-velocity rhythm without prescribed spacing.", applicablePhases: ["transition", "maximum_velocity"], difficulty: "intermediate", intensity: "submaximal", equipment: ["low wickets"], setup: "A coach selects safe spacing and a clear runway.", executionSummary: "Run through low wickets at submaximal effort, prioritizing rhythm.", keyCues: ["Stay relaxed.", "Do not reach for spacing."], commonErrors: ["Reaching", "Excessive speed", "Forced cadence"], contraindications: ["active pain", "beginner without coach", "unknown phase"], stopConditions: ["Pain", "Clipping equipment repeatedly", "Loss of coordination"], progressionOptions: ["Coach-determined wicket progression"], regressionOptions: ["Low-intensity dribble"], requiresCoachSupervision: true, evidenceBasis: "heuristic", enabled: true },
  { drillId: "bilateral_rhythm_rehearsal", name: "Bilateral rhythm rehearsal", category: "asymmetry", objective: "Observe and rehearse even rhythm without loading one side selectively.", applicablePhases: ["any"], difficulty: "beginner", intensity: "low", equipment: [], setup: "Use the same safe environment and compatible camera view.", executionSummary: "Use relaxed bilateral marching or running while attending to even rhythm.", keyCues: ["Keep the rhythm even between sides."], commonErrors: ["Forcing the observed side", "Changing multiple variables"], contraindications: ["active pain"], stopConditions: ["Pain", "Increasing discomfort", "Loss of coordination"], progressionOptions: ["Coach-reviewed rhythm drill"], regressionOptions: ["Walking march"], requiresCoachSupervision: false, evidenceBasis: "heuristic", enabled: true },
];
