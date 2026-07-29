/**
 * Performance Gap Engine — CONFIGURATION (Part A).
 *
 * This file holds MODEL PARAMETERS only: which metrics exist, how each relates to
 * velocity, importance weights, tree templates, and the recommendation catalog.
 *
 * CRITICAL: there are NO hardcoded sprint-metric targets here. A target like
 * "stride length must be 2.45 m" is never written down — it is DERIVED from the
 * athlete's own current value scaled by the goal's velocity ratio via the models
 * below. Swapping in future research means editing THIS file (weights/elasticities/
 * templates), never the engine logic.
 */

import type { EvidenceCategory } from "./models";

export const CONFIG_VERSION = "ava-performance-gap-config-v1" as const;

/**
 * How a metric relates to sprint velocity, used by the Goal Requirement Engine to
 * derive a required value from the goal's velocity ratio (never an absolute target).
 *
 *  - multiplicative: part of the identity v = Π(metric). Required = current ×
 *    ratio^(exponentWeight / Σexponent). Stride length + frequency live here.
 *  - proportional: scales directly with velocity (peak/avg velocity).
 *  - elastic: moves by `elasticity` × (ratio − 1), in `direction` (ground contact
 *    shortens as velocity rises, etc.). Lower confidence.
 *  - none: not derivable from race velocity (informational / future data source).
 */
export type VelocityModel =
  | { kind: "multiplicative"; exponentWeight: number }
  | { kind: "proportional" }
  | { kind: "elastic"; elasticity: number; direction: "increase" | "decrease" }
  | { kind: "none" };

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  velocityModel: VelocityModel;
  /** Base importance (0..1) — configurable weight of this metric to the goal. */
  importance: number;
  /** Evidence category of a DERIVED requirement for this metric. */
  requirementEvidence: Exclude<EvidenceCategory, "unknown">;
  /** Base confidence score (0..1) for a derived requirement of this metric. */
  requirementConfidence: number;
  /** For a gap, is a LOWER value better (ground contact, flight asymmetry, …)? */
  lowerIsBetter: boolean;
  /**
   * "lever" = a trainable quality that can be prioritized as a limiter (default).
   * "outcome" = a result metric (e.g. average velocity IS distance ÷ time); it is
   * still gapped + shown as a target, but never ranked as a trainable limiter.
   */
  role?: "lever" | "outcome";
  side?: "left" | "right";
  treeTemplateId?: string;
  associatedRecommendations?: string[];
  /** Reserved extension point: external data source that could measure this. */
  externalSources?: string[];
}

/**
 * The extensible metric catalog. New metrics (or future device-measured metrics)
 * plug in by adding an entry here — engines iterate the registry, so nothing else
 * changes. `externalSources` are declared extension points only (not implemented):
 * AVA Lift, Motion IQ, force plates, Freelap, Brower, jump/strength testing, wearables.
 */
export const METRIC_REGISTRY: MetricDefinition[] = [
  {
    id: "strideLength",
    label: "Stride Length",
    unit: "m",
    velocityModel: { kind: "multiplicative", exponentWeight: 0.6 },
    importance: 0.9,
    requirementEvidence: "estimated",
    requirementConfidence: 0.7,
    lowerIsBetter: false,
    treeTemplateId: "strideLength",
    associatedRecommendations: ["reactiveStrength", "hipExtensionTiming", "projectionMechanics"],
    externalSources: ["motion_iq", "force_plate"],
  },
  {
    id: "strideFrequency",
    label: "Stride Frequency",
    unit: "Hz",
    velocityModel: { kind: "multiplicative", exponentWeight: 0.4 },
    importance: 0.85,
    requirementEvidence: "estimated",
    requirementConfidence: 0.7,
    lowerIsBetter: false,
    treeTemplateId: "strideFrequency",
    associatedRecommendations: ["reactiveStrength", "frontSideMechanics"],
    externalSources: ["motion_iq"],
  },
  {
    id: "peakVelocity",
    label: "Peak Velocity",
    unit: "m/s",
    velocityModel: { kind: "proportional" },
    importance: 0.95,
    requirementEvidence: "estimated",
    requirementConfidence: 0.75,
    lowerIsBetter: false,
    treeTemplateId: "peakVelocity",
    associatedRecommendations: ["maxVelocityExposure", "reactiveStrength"],
    externalSources: ["freelap", "brower"],
  },
  {
    id: "averageVelocity",
    label: "Average Velocity",
    unit: "m/s",
    velocityModel: { kind: "proportional" },
    importance: 0.8,
    requirementEvidence: "measured",
    requirementConfidence: 0.9,
    lowerIsBetter: false,
    role: "outcome",
    associatedRecommendations: ["maxVelocityExposure"],
    externalSources: ["freelap", "brower"],
  },
  {
    id: "groundContactTime",
    label: "Ground Contact Time",
    unit: "s",
    velocityModel: { kind: "elastic", elasticity: 0.5, direction: "decrease" },
    importance: 0.6,
    requirementEvidence: "inferred",
    requirementConfidence: 0.45,
    lowerIsBetter: true,
    treeTemplateId: "groundContactTime",
    associatedRecommendations: ["reactiveStrength", "elasticStiffness"],
    externalSources: ["force_plate", "motion_iq"],
  },
  {
    id: "flightTime",
    label: "Flight Time",
    unit: "s",
    velocityModel: { kind: "elastic", elasticity: 0.3, direction: "increase" },
    importance: 0.4,
    requirementEvidence: "inferred",
    requirementConfidence: 0.4,
    lowerIsBetter: false,
    associatedRecommendations: ["reactiveStrength"],
    externalSources: ["force_plate"],
  },
  {
    id: "acceleration",
    label: "Acceleration Quality",
    unit: "m/s²",
    velocityModel: { kind: "elastic", elasticity: 0.6, direction: "increase" },
    importance: 0.75,
    requirementEvidence: "inferred",
    requirementConfidence: 0.4,
    lowerIsBetter: false,
    treeTemplateId: "acceleration",
    associatedRecommendations: ["hillSprints", "resistedAcceleration"],
    externalSources: ["freelap", "force_plate"],
  },
  {
    id: "transitionEfficiency",
    label: "Transition Efficiency",
    unit: "index",
    velocityModel: { kind: "elastic", elasticity: 0.4, direction: "increase" },
    importance: 0.55,
    requirementEvidence: "inferred",
    requirementConfidence: 0.35,
    lowerIsBetter: false,
    associatedRecommendations: ["maxVelocityExposure", "frontSideMechanics"],
    externalSources: ["freelap"],
  },
  {
    id: "maxVelocityMaintenance",
    label: "Maximum Velocity Maintenance",
    unit: "index",
    velocityModel: { kind: "elastic", elasticity: 0.5, direction: "increase" },
    importance: 0.65,
    requirementEvidence: "inferred",
    requirementConfidence: 0.4,
    lowerIsBetter: false,
    associatedRecommendations: ["speedEndurance"],
    externalSources: ["freelap", "brower"],
  },
  // Left/right split metrics — derive like their bilateral counterpart.
  {
    id: "strideLengthLeft",
    label: "Stride Length (Left)",
    unit: "m",
    velocityModel: { kind: "elastic", elasticity: 1, direction: "increase" },
    importance: 0.5,
    requirementEvidence: "estimated",
    requirementConfidence: 0.55,
    lowerIsBetter: false,
    side: "left",
    treeTemplateId: "strideLength",
    associatedRecommendations: ["reactiveStrength"],
  },
  {
    id: "strideLengthRight",
    label: "Stride Length (Right)",
    unit: "m",
    velocityModel: { kind: "elastic", elasticity: 1, direction: "increase" },
    importance: 0.5,
    requirementEvidence: "estimated",
    requirementConfidence: 0.55,
    lowerIsBetter: false,
    side: "right",
    treeTemplateId: "strideLength",
    associatedRecommendations: ["reactiveStrength"],
  },
  {
    id: "strideFrequencyLeft",
    label: "Stride Frequency (Left)",
    unit: "Hz",
    velocityModel: { kind: "elastic", elasticity: 1, direction: "increase" },
    importance: 0.45,
    requirementEvidence: "estimated",
    requirementConfidence: 0.55,
    lowerIsBetter: false,
    side: "left",
    treeTemplateId: "strideFrequency",
    associatedRecommendations: ["frontSideMechanics"],
  },
  {
    id: "strideFrequencyRight",
    label: "Stride Frequency (Right)",
    unit: "Hz",
    velocityModel: { kind: "elastic", elasticity: 1, direction: "increase" },
    importance: 0.45,
    requirementEvidence: "estimated",
    requirementConfidence: 0.55,
    lowerIsBetter: false,
    side: "right",
    treeTemplateId: "strideFrequency",
    associatedRecommendations: ["frontSideMechanics"],
  },
];

export function metricDefinition(metricId: string): MetricDefinition | undefined {
  return METRIC_REGISTRY.find((m) => m.id === metricId);
}

/**
 * Expandable reasoning-tree TEMPLATES (Engine 4). Purely associative — every node
 * is framed "commonly associated with …", never as a diagnosis. Node ids reference
 * the recommendation catalog. Adding depth/branches here changes explainability
 * without touching engine code.
 */
export interface TreeTemplateNode {
  id: string;
  label: string;
  category: EvidenceCategory;
  confidence: number | null;
  association?: string;
  supportingMetrics?: string[];
  associatedRecommendations?: string[];
  children?: TreeTemplateNode[];
}

export const TREE_TEMPLATES: Record<string, TreeTemplateNode> = {
  strideLength: {
    id: "strideLength",
    label: "Stride Length",
    category: "measured",
    confidence: null,
    children: [
      {
        id: "verticalForce",
        label: "Vertical Force Production",
        category: "inferred",
        confidence: 0.5,
        association: "commonly associated with the ability to project the body between steps",
        associatedRecommendations: ["reactiveStrength", "maxStrength"],
        children: [
          {
            id: "groundStrikePosition",
            label: "Ground Strike Position",
            category: "inferred",
            confidence: 0.45,
            association: "commonly associated with front-side mechanics and posture",
            associatedRecommendations: ["frontSideMechanics"],
            children: [
              {
                id: "hipExtensionTiming",
                label: "Hip Extension Timing",
                category: "inferred",
                confidence: 0.4,
                association: "commonly associated with projection and elastic stiffness",
                associatedRecommendations: ["hipExtensionTiming", "projectionMechanics", "elasticStiffness"],
              },
            ],
          },
        ],
      },
    ],
  },
  strideFrequency: {
    id: "strideFrequency",
    label: "Stride Frequency",
    category: "measured",
    confidence: null,
    children: [
      {
        id: "frontSideMechanics",
        label: "Front-side Mechanics",
        category: "inferred",
        confidence: 0.45,
        association: "commonly associated with quicker limb repositioning",
        associatedRecommendations: ["frontSideMechanics", "reactiveStrength"],
        children: [
          {
            id: "elasticStiffness",
            label: "Elastic Stiffness",
            category: "inferred",
            confidence: 0.4,
            association: "commonly associated with reduced ground contact time",
            associatedRecommendations: ["elasticStiffness", "reactiveStrength"],
          },
        ],
      },
    ],
  },
  groundContactTime: {
    id: "groundContactTime",
    label: "Ground Contact Time",
    category: "measured",
    confidence: null,
    children: [
      {
        id: "reactiveStrengthLimit",
        label: "Reactive Strength",
        category: "inferred",
        confidence: 0.5,
        association: "commonly associated with elastic stiffness and stance-phase force",
        associatedRecommendations: ["reactiveStrength", "elasticStiffness"],
      },
    ],
  },
  peakVelocity: {
    id: "peakVelocity",
    label: "Peak Velocity",
    category: "measured",
    confidence: null,
    children: [
      {
        id: "maxVelocityCapacity",
        label: "Maximum Velocity Capacity",
        category: "inferred",
        confidence: 0.5,
        association: "commonly associated with force applied in very short ground contacts",
        associatedRecommendations: ["maxVelocityExposure", "reactiveStrength"],
      },
    ],
  },
  acceleration: {
    id: "acceleration",
    label: "Acceleration Quality",
    category: "measured",
    confidence: null,
    children: [
      {
        id: "horizontalForce",
        label: "Horizontal Force Production",
        category: "inferred",
        confidence: 0.45,
        association: "commonly associated with early-acceleration shin angle and force orientation",
        associatedRecommendations: ["resistedAcceleration", "hillSprints", "maxStrength"],
      },
    ],
  },
};

/** Recommendation catalog with ESTIMATED per-metric effects (Engine 5). */
export interface RecommendationDefinition {
  id: string;
  label: string;
  /** Estimated absolute effects on metrics (per training block). Never guaranteed. */
  effects: { metricId: string; delta: number; unit: string; direction: "increase" | "decrease" }[];
  confidence: number;
  evidenceSource: string;
  reasoning: string;
}

export const RECOMMENDATION_CATALOG: RecommendationDefinition[] = [
  {
    id: "reactiveStrength",
    label: "Reactive Strength Development",
    effects: [
      { metricId: "strideLength", delta: 0.03, unit: "m", direction: "increase" },
      { metricId: "groundContactTime", delta: 0.003, unit: "s", direction: "decrease" },
      { metricId: "peakVelocity", delta: 0.05, unit: "m/s", direction: "increase" },
    ],
    confidence: 0.5,
    evidenceSource: "sprint-mechanics literature (associative)",
    reasoning:
      "Higher reactive strength is commonly associated with shorter ground contact and greater projection.",
  },
  {
    id: "maxVelocityExposure",
    label: "Maximum Velocity Exposure",
    effects: [
      { metricId: "peakVelocity", delta: 0.08, unit: "m/s", direction: "increase" },
      { metricId: "strideFrequency", delta: 0.05, unit: "Hz", direction: "increase" },
    ],
    confidence: 0.5,
    evidenceSource: "speed-training practice (associative)",
    reasoning: "Regular near-maximal exposure is commonly associated with raising the velocity ceiling.",
  },
  {
    id: "hipExtensionTiming",
    label: "Hip Extension Timing",
    effects: [{ metricId: "strideLength", delta: 0.02, unit: "m", direction: "increase" }],
    confidence: 0.4,
    evidenceSource: "technical-model (associative)",
    reasoning: "Better extension timing is commonly associated with more ground covered per step.",
  },
  {
    id: "projectionMechanics",
    label: "Projection Mechanics",
    effects: [{ metricId: "strideLength", delta: 0.025, unit: "m", direction: "increase" }],
    confidence: 0.4,
    evidenceSource: "technical-model (associative)",
    reasoning: "Improved projection is commonly associated with longer effective strides without overstriding.",
  },
  {
    id: "frontSideMechanics",
    label: "Front-side Mechanics",
    effects: [{ metricId: "strideFrequency", delta: 0.04, unit: "Hz", direction: "increase" }],
    confidence: 0.4,
    evidenceSource: "technical-model (associative)",
    reasoning: "Front-side mechanics are commonly associated with quicker recovery and turnover.",
  },
  {
    id: "elasticStiffness",
    label: "Elastic Stiffness",
    effects: [{ metricId: "groundContactTime", delta: 0.004, unit: "s", direction: "decrease" }],
    confidence: 0.45,
    evidenceSource: "plyometric literature (associative)",
    reasoning: "Higher stiffness is commonly associated with shorter, more forceful ground contacts.",
  },
  {
    id: "resistedAcceleration",
    label: "Resisted Acceleration",
    effects: [{ metricId: "acceleration", delta: 0.3, unit: "m/s²", direction: "increase" }],
    confidence: 0.4,
    evidenceSource: "resisted-sprint literature (associative)",
    reasoning: "Resisted work is commonly associated with greater early horizontal force.",
  },
  {
    id: "hillSprints",
    label: "Hill Sprints",
    effects: [{ metricId: "acceleration", delta: 0.25, unit: "m/s²", direction: "increase" }],
    confidence: 0.35,
    evidenceSource: "practice (associative)",
    reasoning: "Incline sprinting is commonly associated with acceleration mechanics and force.",
  },
  {
    id: "maxStrength",
    label: "Maximal Strength",
    effects: [{ metricId: "strideLength", delta: 0.02, unit: "m", direction: "increase" }],
    confidence: 0.35,
    evidenceSource: "strength-training literature (associative)",
    reasoning: "A higher force base is commonly associated with greater force capacity per contact.",
  },
  {
    id: "speedEndurance",
    label: "Speed Endurance",
    effects: [{ metricId: "maxVelocityMaintenance", delta: 0.05, unit: "index", direction: "increase" }],
    confidence: 0.4,
    evidenceSource: "conditioning practice (associative)",
    reasoning: "Speed-endurance work is commonly associated with holding top speed longer.",
  },
];

export function recommendationDefinition(id: string): RecommendationDefinition | undefined {
  return RECOMMENDATION_CATALOG.find((r) => r.id === id);
}

/** Global model tuning knobs (all swappable; no absolute targets). */
export const MODEL_PARAMS = {
  /** Seconds gained ≈ this fraction of the velocity gap, per unit of contribution. */
  timeGainSensitivity: 1,
  /** Impact = gap% × importance × confidence × elasticityWeight (Engine 3). */
  impactWeights: { gap: 1, importance: 1, confidence: 1 },
} as const;
