/**
 * Configurable reasoning rules (Phase 3). Coaching logic lives HERE as data, never
 * hardcoded in the engine. Each rule matches metric-state / side conditions and adds
 * weighted evidence to contributors, with a reasoning string and a research-metadata
 * seam for Phase 4. Editing/adding rules changes AVA's reasoning without code changes.
 */

import type { ReasoningRule } from "./models";

export const REASONING_RULES_VERSION = "ava-reasoning-rules-v1" as const;

export const REASONING_RULES: ReasoningRule[] = [
  {
    id: "reactive_force_stride",
    appliesTo: ["strideLength"],
    when: [
      { metric: "strideLength", state: "deficient" },
      { metric: "groundContactTime", state: "deficient" },
      { metric: "strideFrequency", state: "met" },
    ],
    boost: [
      { contributor: "reactiveStrength", weight: 0.4 },
      { contributor: "projection", weight: 0.25 },
      { contributor: "verticalForce", weight: 0.2 },
    ],
    reasoning:
      "Short strides with long ground contact but adequate turnover is a pattern commonly associated with reduced reactive force production and projection.",
    research: { evidenceQuality: "moderate" },
  },
  {
    id: "front_side_stride",
    appliesTo: ["strideLength", "strideFrequency"],
    when: [
      { metric: "strideLength", state: "deficient" },
      { metric: "strideFrequency", state: "deficient" },
    ],
    boost: [
      { contributor: "frontSideMechanics", weight: 0.3 },
      { contributor: "timingCoordination", weight: 0.2 },
    ],
    reasoning:
      "Both stride length and frequency below target is commonly associated with front-side mechanics and inter-limb coordination.",
  },
  {
    id: "overreach_stride",
    appliesTo: ["strideLength"],
    when: [
      { metric: "strideLength", state: "deficient" },
      { metric: "groundContactTime", state: "deficient" },
      { metric: "strideFrequency", state: "deficient" },
    ],
    boost: [
      { contributor: "technicalOverreaching", weight: 0.25 },
      { contributor: "groundStrikePosition", weight: 0.2 },
    ],
    reasoning:
      "Long contact with low turnover can be associated with reaching for stride length and braking at touchdown.",
  },
  {
    id: "elastic_frequency",
    appliesTo: ["strideFrequency"],
    when: [
      { metric: "strideFrequency", state: "deficient" },
      { metric: "groundContactTime", state: "deficient" },
    ],
    boost: [
      { contributor: "elasticStiffness", weight: 0.35 },
      { contributor: "reactiveStrength", weight: 0.25 },
    ],
    reasoning:
      "Low turnover with long ground contact is commonly associated with reduced elastic stiffness.",
  },
  {
    id: "contact_reactive",
    appliesTo: ["groundContactTime"],
    when: [{ metric: "groundContactTime", state: "deficient" }],
    boost: [
      { contributor: "reactiveStrength", weight: 0.4 },
      { contributor: "elasticStiffness", weight: 0.3 },
    ],
    reasoning: "Ground contact above the estimated requirement is commonly associated with reactive strength.",
  },
  {
    id: "peak_velocity_ceiling",
    appliesTo: ["peakVelocity"],
    when: [{ metric: "peakVelocity", state: "deficient" }],
    boost: [
      { contributor: "reactiveStrength", weight: 0.3 },
      { contributor: "frontSideMechanics", weight: 0.25 },
      { contributor: "projection", weight: 0.2 },
    ],
    reasoning: "A peak-velocity ceiling is commonly associated with force in short contacts and top-end mechanics.",
  },
  {
    id: "accel_horizontal_force",
    appliesTo: ["acceleration"],
    when: [{ metric: "acceleration", state: "deficient" }],
    boost: [
      { contributor: "verticalForce", weight: 0.3 },
      { contributor: "hipExtensionTiming", weight: 0.25 },
      { contributor: "projection", weight: 0.2 },
    ],
    reasoning: "Below-target acceleration is commonly associated with early horizontal force and extension timing.",
  },
  {
    id: "mobility_general",
    appliesTo: ["*"],
    when: [{ metric: "strideLength", state: "deficient" }],
    boost: [{ contributor: "mobilityRestriction", weight: 0.12 }],
    reasoning: "A stride-length deficit can be associated with hip or ankle mobility restrictions.",
  },
  // ---- Left/right side rules ----
  {
    id: "left_force_limitation",
    appliesTo: ["strideLength", "strideFrequency"],
    whenSide: [
      { leftMetric: "strideLengthLeft", rightMetric: "strideLengthRight", comparison: "left_shorter", minPct: 3 },
      { leftMetric: "groundContactTimeLeft", rightMetric: "groundContactTimeRight", comparison: "left_longer", minPct: 3 },
    ],
    boost: [
      { contributor: "leftSideForce", weight: 0.4 },
      { contributor: "delayedRecovery", weight: 0.3 },
      { contributor: "timingAsymmetry", weight: 0.3 },
    ],
    reasoning:
      "A shorter left stride with longer left ground contact is commonly associated with a left-sided force or recovery difference.",
  },
  {
    id: "right_force_limitation",
    appliesTo: ["strideLength", "strideFrequency"],
    whenSide: [
      { leftMetric: "strideLengthLeft", rightMetric: "strideLengthRight", comparison: "right_shorter", minPct: 3 },
      { leftMetric: "groundContactTimeLeft", rightMetric: "groundContactTimeRight", comparison: "right_longer", minPct: 3 },
    ],
    boost: [
      { contributor: "rightSideForce", weight: 0.4 },
      { contributor: "delayedRecovery", weight: 0.3 },
      { contributor: "timingAsymmetry", weight: 0.3 },
    ],
    reasoning:
      "A shorter right stride with longer right ground contact is commonly associated with a right-sided force or recovery difference.",
  },
];

export function rulesForMetric(metricId: string): ReasoningRule[] {
  const base = metricId.replace(/(Left|Right)$/, "");
  return REASONING_RULES.filter((r) => r.appliesTo.includes("*") || r.appliesTo.includes(base));
}
