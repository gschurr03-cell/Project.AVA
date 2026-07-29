import type { Observation } from "@/lib/observations";

import type {
  InterpretationContext,
} from "./contracts";
import type { AlternativeExplanation } from "./taxonomy";

export interface InterpretationDraft {
  interpretationKey: string;
  title: string;
  summary: string;
  explanation: string;
  likelyMeaning: string;
  alternativeExplanations: AlternativeExplanation[];
  excludedConclusions: string[];
  contextDependencies: Array<
    | "sprint_phase"
    | "event"
    | "session_purpose"
    | "bend_or_straight"
    | "start_type"
    | "camera_mode"
    | "fps_tier"
    | "calibration"
    | "competition_level"
    | "historical_baseline"
    | "fatigue_state"
    | "environment"
  >;
  evidenceKind: "availability" | "descriptive" | "associative";
  conflictGroup: string | null;
  mergeKey: string;
}

export interface InterpretationRule {
  ruleId: string;
  version: string;
  category: Observation["category"];
  requiredObservationKeys: string[];
  optionalObservationKeys: string[];
  exclusionObservationKeys: string[];
  requiredContext: string[];
  phaseApplicability: string[];
  eventApplicability: string[];
  cameraApplicability: string[];
  fpsApplicability: string[];
  confidencePolicy: "weakest_link_capped_moderate";
  evidenceQualityPolicy: "availability" | "descriptive" | "associative";
  conflictGroup: string | null;
  enabled: boolean;
  experimental: boolean;
  evaluationFunction(observations: Observation[], context: InterpretationContext): Observation[];
  outputFactory(observations: Observation[], context: InterpretationContext): InterpretationDraft;
}

const byRule = (ruleId: string) => (observations: Observation[]) =>
  observations.filter((item) => item.ruleId === ruleId);
const byTitle = (title: string) => (observations: Observation[]) =>
  observations.filter((item) => item.title === title);
const safe = (observations: Observation[]) =>
  observations.filter(
    (item) =>
      item.availability === "available" &&
      !["unavailable", "contradicted"].includes(item.status) &&
      item.evidence.length > 0 &&
      item.evidence.every((evidence) => evidence.value != null && evidence.availability === "available"),
  );

const rule = (
  config: Pick<
    InterpretationRule,
    "ruleId" | "category" | "requiredObservationKeys" | "conflictGroup"
  > & {
    select: (observations: Observation[]) => Observation[];
    draft: InterpretationDraft;
    phaseApplicability?: string[];
    experimental?: boolean;
  },
): InterpretationRule => ({
  ruleId: config.ruleId,
  version: "1",
  category: config.category,
  requiredObservationKeys: config.requiredObservationKeys,
  optionalObservationKeys: [],
  exclusionObservationKeys: [],
  requiredContext: [],
  phaseApplicability: config.phaseApplicability ?? ["any"],
  eventApplicability: ["any"],
  cameraApplicability: ["any"],
  fpsApplicability: ["any"],
  confidencePolicy: "weakest_link_capped_moderate",
  evidenceQualityPolicy: config.draft.evidenceKind,
  conflictGroup: config.conflictGroup,
  enabled: true,
  experimental: config.experimental ?? false,
  evaluationFunction: (observations) => safe(config.select(observations)),
  outputFactory: () => config.draft,
});

const exclusions = {
  general: [
    "Cannot establish a proven cause.",
    "Cannot predict exact performance impact.",
    "Cannot prescribe training.",
  ],
  asymmetry: [
    "Cannot diagnose injury.",
    "Cannot confirm weakness.",
    "Cannot identify pain.",
    "Cannot infer force production.",
    "Cannot prescribe rehabilitation.",
  ],
};

export const INTERPRETATION_RULES: InterpretationRule[] = [
  rule({
    ruleId: "interpretation.recording.experimental_fps.v1",
    category: "Recording",
    requiredObservationKeys: ["recording.experimental_fps.v1"],
    conflictGroup: "recording_depth",
    experimental: true,
    select: byRule("recording.experimental_fps.v1"),
    draft: {
      interpretationKey: "recording_event_review_limited",
      title: "Event-level interpretation is limited",
      summary: "The recording supports broad movement review, but event-level timing requires caution.",
      explanation: "The linked observation comes from an experimental frame-rate pipeline.",
      likelyMeaning: "Broad movement patterns may be reviewed, while precise event timing requires confirmation.",
      alternativeExplanations: ["frame_rate", "event_detection_error", "insufficient_sample"],
      excludedConclusions: exclusions.general,
      contextDependencies: ["fps_tier"],
      evidenceKind: "availability",
      conflictGroup: "recording_depth",
      mergeKey: "recording_review_depth",
    },
  }),
  rule({
    ruleId: "interpretation.recording.panning.v1",
    category: "Recording",
    requiredObservationKeys: ["recording.panning.v1"],
    conflictGroup: null,
    select: byRule("recording.panning.v1"),
    draft: {
      interpretationKey: "panning_context",
      title: "Panning affects interpretation scope",
      summary: "Technique evidence may remain useful, while spatial meaning depends on camera compensation and calibration.",
      explanation: "Camera movement is part of the measurement context and can affect spatial conclusions.",
      likelyMeaning: "The recording may support broad technique review more strongly than absolute spatial comparison.",
      alternativeExplanations: ["camera_motion", "recording_angle", "calibration_error"],
      excludedConclusions: exclusions.general,
      contextDependencies: ["camera_mode", "calibration"],
      evidenceKind: "availability",
      conflictGroup: null,
      mergeKey: "panning_context",
    },
  }),
  rule({
    ruleId: "interpretation.recording.high_quality.v1",
    category: "DataQuality",
    requiredObservationKeys: ["recording.high_quality.v1"],
    conflictGroup: "recording_depth",
    select: byRule("recording.high_quality.v1"),
    draft: {
      interpretationKey: "recording_supports_review",
      title: "Recording supports deeper review",
      summary: "The recording setup supports review of metrics that are individually available and trusted.",
      explanation: "High recording quality improves the evidence context but does not validate every metric.",
      likelyMeaning: "Available technique measurements can be reviewed with fewer recording-quality reservations.",
      alternativeExplanations: ["pose_estimation_error", "athlete_variability"],
      excludedConclusions: [...exclusions.general, "Cannot validate unavailable metrics."],
      contextDependencies: ["camera_mode", "fps_tier", "calibration"],
      evidenceKind: "descriptive",
      conflictGroup: "recording_depth",
      mergeKey: "recording_review_depth",
    },
  }),
  rule({
    ruleId: "interpretation.timing.trusted.v1",
    category: "Timing",
    requiredObservationKeys: ["timing.classification.v1"],
    conflictGroup: "timing_scope",
    select: (items) => byTitle("Timing is available")(items),
    draft: {
      interpretationKey: "timing_supports_event_review",
      title: "Timing supports event review",
      summary: "The available timing evidence can support cautious event-level comparison.",
      explanation: "The completed analysis marked timing as available under its existing trust policy.",
      likelyMeaning: "Event timing may be compared within the same compatible analysis context.",
      alternativeExplanations: ["event_detection_error", "frame_rate", "athlete_variability"],
      excludedConclusions: [...exclusions.general, "Cannot infer force production."],
      contextDependencies: ["event", "fps_tier"],
      evidenceKind: "descriptive",
      conflictGroup: "timing_scope",
      mergeKey: "timing_scope",
    },
  }),
  rule({
    ruleId: "interpretation.velocity.available.v1",
    category: "MaximumVelocity",
    requiredObservationKeys: ["velocity.top_speed.v1"],
    conflictGroup: "velocity_scope",
    select: (items) => byTitle("Velocity available")(items),
    draft: {
      interpretationKey: "velocity_context_available",
      title: "Absolute velocity can be reviewed",
      summary: "Trusted velocity evidence supports absolute speed review within compatible recording conditions.",
      explanation: "Availability indicates that the existing spatial and timing trust gates were satisfied.",
      likelyMeaning: "The measured speed can be used as context, but availability alone does not show a plateau or limiter.",
      alternativeExplanations: ["calibration_error", "camera_motion", "environmental_context"],
      excludedConclusions: [...exclusions.general, "Cannot confirm true maximum velocity from availability alone."],
      contextDependencies: ["calibration", "camera_mode", "sprint_phase"],
      evidenceKind: "availability",
      conflictGroup: "velocity_scope",
      mergeKey: "velocity_scope",
    },
  }),
  rule({
    ruleId: "interpretation.cadence.available.v1",
    category: "StrideFrequency",
    requiredObservationKeys: ["cadence.availability.v1"],
    conflictGroup: "rhythm_scope",
    select: (items) => byTitle("Cadence available")(items),
    draft: {
      interpretationKey: "cadence_context_available",
      title: "Stride rhythm can be reviewed",
      summary: "Cadence is available for rhythm description within this analyzed segment.",
      explanation: "A cadence value exists, but a single aggregate value does not establish consistency or limitation.",
      likelyMeaning: "Stride rhythm can be described, while repeatability requires step-level consistency evidence.",
      alternativeExplanations: ["phase_transition", "fatigue", "event_detection_error", "athlete_variability"],
      excludedConclusions: [...exclusions.general, "Cannot label cadence as a limiter from availability alone."],
      contextDependencies: ["sprint_phase", "event"],
      evidenceKind: "availability",
      conflictGroup: "rhythm_scope",
      mergeKey: "rhythm_scope",
    },
  }),
  ...([
    ["stride_length_asymmetry", "spatial", "Stride-length difference may represent an isolated side-to-side pattern."],
    ["stride_frequency_asymmetry", "rhythm", "Stride-frequency difference may represent asymmetrical limb timing."],
    ["contact_asymmetry", "support timing", "Contact-time difference may represent unequal support timing."],
    ["flight_asymmetry", "step-cycle timing", "Flight-time difference may represent unequal step-cycle timing."],
  ] as const).map(([key, label, meaning]) =>
    rule({
      ruleId: `interpretation.asymmetry.${key}.v1`,
      category: "Asymmetry",
      requiredObservationKeys: [`asymmetry.${key}.v1`],
      conflictGroup: "asymmetry_pattern",
      select: byRule(`asymmetry.${key}.v1`),
      draft: {
        interpretationKey: `isolated_${key}`,
        title: `Isolated ${label} asymmetry`,
        summary: `One metric shows a side-to-side ${label} difference.`,
        explanation: "A single side comparison is not enough to establish a persistent or causal pattern.",
        likelyMeaning: `${meaning} Repeated compatible recordings are needed before treating it as persistent.`,
        alternativeExplanations: [
          "technical_strategy",
          "fatigue",
          "strength_difference",
          "mobility_difference",
          "recording_angle",
          "athlete_variability",
          "insufficient_sample",
        ],
        excludedConclusions: exclusions.asymmetry,
        contextDependencies: ["sprint_phase", "historical_baseline", "fatigue_state"],
        evidenceKind: "associative",
        conflictGroup: "asymmetry_pattern",
        mergeKey: `asymmetry_${key}`,
      },
    }),
  ),
  rule({
    ruleId: "interpretation.asymmetry.converging.v1",
    category: "Asymmetry",
    requiredObservationKeys: ["two_asymmetry_observations"],
    conflictGroup: "asymmetry_pattern",
    select: (items) => {
      const asymmetries = safe(items.filter((item) => item.category === "Asymmetry"));
      if (asymmetries.length < 2) return [];
      const sides = new Set(asymmetries.map((item) => item.side).filter(Boolean));
      return sides.size === 1 ? asymmetries : [];
    },
    draft: {
      interpretationKey: "converging_asymmetry",
      title: "Multiple metrics show the same side difference",
      summary: "More than one available observation points to the same side.",
      explanation: "Agreement across separate metrics makes a one-metric anomaly less likely, while causes remain unresolved.",
      likelyMeaning: "A coordinated side-to-side pattern may be present and requires confirmation across compatible sessions.",
      alternativeExplanations: ["technical_strategy", "fatigue", "coordination_difference", "recording_angle", "athlete_variability"],
      excludedConclusions: exclusions.asymmetry,
      contextDependencies: ["sprint_phase", "historical_baseline"],
      evidenceKind: "associative",
      conflictGroup: "asymmetry_pattern",
      mergeKey: "asymmetry_pattern",
    },
  }),
  rule({
    ruleId: "interpretation.asymmetry.contradictory.v1",
    category: "Asymmetry",
    requiredObservationKeys: ["two_asymmetry_observations"],
    conflictGroup: "asymmetry_pattern",
    select: (items) => {
      const asymmetries = safe(items.filter((item) => item.category === "Asymmetry"));
      if (asymmetries.length < 2) return [];
      const sides = new Set(asymmetries.map((item) => item.side).filter(Boolean));
      return sides.size > 1 ? asymmetries : [];
    },
    draft: {
      interpretationKey: "contradictory_asymmetry",
      title: "Side-to-side evidence does not agree",
      summary: "Available asymmetry observations point in different directions.",
      explanation: "The current observations do not support one consistent asymmetry direction.",
      likelyMeaning: "AVA cannot identify a coordinated side-to-side pattern from this analysis.",
      alternativeExplanations: ["athlete_variability", "event_detection_error", "recording_angle", "insufficient_sample"],
      excludedConclusions: exclusions.asymmetry,
      contextDependencies: ["sprint_phase", "historical_baseline"],
      evidenceKind: "associative",
      conflictGroup: "asymmetry_pattern",
      mergeKey: "asymmetry_pattern",
    },
  }),
  rule({
    ruleId: "interpretation.front_side.reduced.v1",
    category: "FrontSideMechanics",
    requiredObservationKeys: ["front_side.knee_reference.v1"],
    conflictGroup: "front_side_range",
    phaseApplicability: ["early_acceleration", "mid_acceleration", "late_acceleration", "transition", "maximum_velocity"],
    select: (items) => byTitle("Knee height below reference")(items),
    draft: {
      interpretationKey: "reduced_front_side_position",
      title: "Front-side range appears reduced",
      summary: "Measured knee position was below the configured phase reference.",
      explanation: "This describes range relative to a configured reference, not a universal technique standard.",
      likelyMeaning: "The athlete may be expressing less front-side range during this phase.",
      alternativeExplanations: ["technical_strategy", "phase_transition", "fatigue", "mobility_difference", "anthropometric_difference", "recording_angle", "pose_estimation_error"],
      excludedConclusions: [...exclusions.general, "Cannot confirm hip-flexor weakness.", "Cannot establish poor technique without phase context."],
      contextDependencies: ["sprint_phase", "camera_mode"],
      evidenceKind: "associative",
      conflictGroup: "front_side_range",
      mergeKey: "front_side_range",
    },
  }),
  rule({
    ruleId: "interpretation.front_side.consistent.v1",
    category: "FrontSideMechanics",
    requiredObservationKeys: ["front_side.knee_reference.v1"],
    conflictGroup: "front_side_range",
    phaseApplicability: ["early_acceleration", "mid_acceleration", "late_acceleration", "transition", "maximum_velocity"],
    select: (items) => byTitle("Knee height consistent with reference")(items),
    draft: {
      interpretationKey: "front_side_matches_reference",
      title: "Front-side position matches the configured reference",
      summary: "Measured knee position remained consistent with the configured phase reference.",
      explanation: "Reference agreement is descriptive and does not establish a universal ideal.",
      likelyMeaning: "Front-side position is not the clearest visible difference from the configured reference in this segment.",
      alternativeExplanations: ["technical_strategy", "anthropometric_difference", "pose_estimation_error"],
      excludedConclusions: exclusions.general,
      contextDependencies: ["sprint_phase"],
      evidenceKind: "descriptive",
      conflictGroup: "front_side_range",
      mergeKey: "front_side_range",
    },
  }),
  ...([
    ["Torso position stable", "stable", "Torso position appears repeatable through this segment.", "The current torso evidence is not the clearest visible source of inconsistency."],
    ["Torso position variable", "variable", "Torso position changes meaningfully through this segment.", "The variation may reflect transition mechanics, fatigue, balance demands, or recording variation."],
  ] as const).map(([title, key, summary, meaning]) =>
    rule({
      ruleId: `interpretation.posture.${key}.v1`,
      category: "Posture",
      requiredObservationKeys: ["posture.torso_stability.v1"],
      conflictGroup: "torso_stability",
      select: byTitle(title),
      draft: {
        interpretationKey: `torso_${key}`,
        title: key === "stable" ? "Torso behavior is repeatable" : "Torso behavior varies",
        summary,
        explanation: "Torso variation is interpreted within the analyzed segment and available phase context.",
        likelyMeaning: meaning,
        alternativeExplanations: key === "stable"
          ? ["technical_strategy", "athlete_variability"]
          : ["phase_transition", "fatigue", "recording_angle", "pose_estimation_error", "athlete_variability"],
        excludedConclusions: exclusions.general,
        contextDependencies: ["sprint_phase", "camera_mode"],
        evidenceKind: key === "stable" ? "descriptive" : "associative",
        conflictGroup: "torso_stability",
        mergeKey: "torso_stability",
      },
    }),
  ),
  rule({
    ruleId: "interpretation.consistency.repeatable.v1",
    category: "Consistency",
    requiredObservationKeys: ["stable_posture", "consistent_cadence"],
    conflictGroup: "mechanical_consistency",
    select: (items) => {
      const posture = byTitle("Torso position stable")(items);
      const cadence = items.filter((item) => item.ruleId === "consistency.cadence.v1" && /consistent/i.test(item.title));
      return safe([...posture, ...cadence]).length >= 2 ? safe([...posture, ...cadence]) : [];
    },
    draft: {
      interpretationKey: "mechanically_repeatable_segment",
      title: "Available mechanics are repeatable",
      summary: "Multiple trusted observations remained stable through the analyzed segment.",
      explanation: "Agreement across posture and rhythm observations supports a broad consistency interpretation.",
      likelyMeaning: "Movement appears repeatable across the currently available metrics.",
      alternativeExplanations: ["athlete_variability", "insufficient_sample"],
      excludedConclusions: [...exclusions.general, "Cannot conclude that unmeasured mechanics were consistent."],
      contextDependencies: ["sprint_phase"],
      evidenceKind: "descriptive",
      conflictGroup: "mechanical_consistency",
      mergeKey: "mechanical_consistency",
    },
  }),
];
