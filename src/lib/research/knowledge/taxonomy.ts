import type { ResearchMetricDefinition } from "./contracts";

export const RESEARCH_CATEGORIES = [
  "acceleration", "maximum_velocity", "sprint_kinematics", "sprint_kinetics",
  "contact_mechanics", "flight_mechanics", "stride_length", "stride_frequency",
  "posture", "front_side_mechanics", "backside_mechanics", "asymmetry", "strength",
  "plyometrics", "resisted_sprinting", "overspeed", "fatigue", "speed_endurance",
  "anthropometrics", "measurement_validity", "camera_analysis", "timing_technology",
  "injury_and_return_to_sport_boundaries",
] as const;

export const RESEARCH_METRIC_DEFINITIONS: ResearchMetricDefinition[] = [
  {
    metricKey: "strideFrequencyHz", displayName: "Stride frequency",
    definition: "Complete gait cycles per second for the declared event-detection protocol.",
    unit: "Hz", calculationFamily: "temporal_cycle", eventDefinition: "Same-side contact to subsequent same-side contact.",
    phaseApplicability: ["acceleration", "transition", "maximum_velocity"],
    knownAliases: ["stride rate"], knownProtocolDifferences: ["Some sources report steps per second as stride frequency."],
    avaContractVersion: "ava-metrics-v1",
    comparabilityRules: ["Both sources must use cycles per second, not steps per second.", "Phase and event detection must be compatible."],
    limitations: ["Terminology is inconsistent across publications."], evidenceReferences: [], version: "ava-research-metric-v1",
  },
  {
    metricKey: "groundContactTimeMs", displayName: "Ground contact time",
    definition: "Elapsed time from the declared initial-contact event to the declared toe-off event.",
    unit: "ms", calculationFamily: "temporal_support", eventDefinition: "Initial contact to toe-off.",
    phaseApplicability: ["acceleration", "transition", "maximum_velocity"],
    knownAliases: ["contact time", "support time"],
    knownProtocolDifferences: ["Force plate, contact mat, high-speed video, and pose-derived event definitions differ."],
    avaContractVersion: "ava-metrics-v1",
    comparabilityRules: ["Timing technology and event thresholds must be compatible.", "Analysis FPS must satisfy the metric contract."],
    limitations: ["Small event-detection differences materially affect short durations."], evidenceReferences: [], version: "ava-research-metric-v1",
  },
  {
    metricKey: "topSpeedMps", displayName: "Peak velocity",
    definition: "Highest supported velocity estimate within the declared smoothing window and analyzed phase.",
    unit: "m/s", calculationFamily: "spatial_velocity", eventDefinition: "Protocol-specific peak of the velocity series.",
    phaseApplicability: ["transition", "maximum_velocity"],
    knownAliases: ["maximum velocity", "top speed"],
    knownProtocolDifferences: ["Instantaneous, split-derived, radar, and smoothed video estimates are not automatically equivalent."],
    avaContractVersion: "ava-metrics-v1",
    comparabilityRules: ["Measurement technology, smoothing window, calibration, and phase must match."],
    limitations: ["Peak values are sensitive to smoothing and calibration."], evidenceReferences: [], version: "ava-research-metric-v1",
  },
];

export const TERMINOLOGY_MAPPINGS = [
  { originalTerm: "support time", normalizedKey: "groundContactTimeMs", relationship: "contextual_alias", context: "running stance phase", preserveDistinct: false, version: "ava-terms-v1" },
  { originalTerm: "contact time", normalizedKey: "groundContactTimeMs", relationship: "contextual_alias", context: "requires event-definition review", preserveDistinct: false, version: "ava-terms-v1" },
  { originalTerm: "maximum velocity", normalizedKey: "topSpeedMps", relationship: "contextual_alias", context: "requires protocol review", preserveDistinct: false, version: "ava-terms-v1" },
  { originalTerm: "step frequency", normalizedKey: "strideFrequencyHz", relationship: "related_not_equivalent", context: "steps per second differs from cycles per second", preserveDistinct: true, version: "ava-terms-v1" },
  { originalTerm: "flight time", normalizedKey: "swing_time", relationship: "related_not_equivalent", context: "whole-body flight and limb swing are distinct", preserveDistinct: true, version: "ava-terms-v1" },
] as const;

