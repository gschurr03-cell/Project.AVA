export const ADAPTER_POLICY=Object.freeze({
  globalMaximumPositiveModifier:.05,globalMaximumNegativeModifier:-.04,
  minimumMeasurementQuality:.65,maximumUnknownBurden:.25,maximumContradictionBurden:.3,
  coachModifier:{confirm:1.05,reject:0,merge:1,split:.9,downgrade:.75,upgrade:1.08,unknown:.8},
  protectedActionTypes:["record_again","improve_recording_setup","collect_more_data",
    "monitor_pattern","coach_review","medical_review"],
  evidenceQuality:{strong:1,moderate:.8,limited:.6,heuristic:.4},
});
