/**
 * Metric Dependency Engine — CONFIGURATION (Phase 4).
 *
 * The causal graph as data: signed, typed, confidence-tagged relationships between
 * metrics; the diminishing-returns curves; and the athlete-modifier rules. Editing
 * this file re-shapes the interconnected performance model without touching engine
 * logic. Adding a metric = adding its relationships here (future metrics plug in).
 */

import { type Confidence, estimated, inferred, measured } from "../models";
import type { MetricRelationship, RelationshipType } from "./models";

export const DEPENDENCY_GRAPH_VERSION = "ava-metric-dependency-graph-v1" as const;

/** The finish result the graph flows toward. */
export const TARGET_METRIC = "finishTime" as const;

const rel = (
  from: string,
  to: string,
  type: RelationshipType,
  strength: number,
  confidence: Confidence,
  basis: string,
  athleteDependency?: string[],
): MetricRelationship => ({
  from,
  to,
  type,
  strength,
  confidence,
  evidence: { basis, category: confidence.category },
  athleteDependency,
});

/**
 * The relationship set. Two canonical reinforcing chains flow to the finish:
 *   groundContact → flightTime → strideLength → averageVelocity → finishTime
 *   acceleration → transition → peakVelocity → averageVelocity → finishTime
 * plus the classic stride-length ⇄ frequency TRADEOFF and quality→metric couplings.
 */
export const METRIC_RELATIONSHIPS: MetricRelationship[] = [
  // Velocity identity (measured — mathematically exact).
  rel("strideLength", "averageVelocity", "positive", 0.8, measured("v = stride length × frequency"), "v = SL × F", ["height", "legLength"]),
  rel("strideFrequency", "averageVelocity", "positive", 0.8, measured("v = stride length × frequency"), "v = SL × F"),
  rel("peakVelocity", "averageVelocity", "positive", 0.7, estimated(0.7, "peak raises achievable average"), "peak → average"),
  rel("averageVelocity", "finishTime", "negative", -0.95, measured("finish time = distance ÷ velocity"), "t = d ÷ v"),

  // Ground-contact / flight / stride chain.
  rel("groundContactTime", "flightTime", "negative", -0.5, inferred(0.5, "shorter contact enables more flight"), "contact ↔ flight"),
  rel("flightTime", "strideLength", "positive", 0.55, inferred(0.5, "more flight enables longer strides"), "flight → stride"),
  rel("groundContactTime", "strideLength", "negative", -0.4, inferred(0.45, "long contact is associated with shorter strides"), "contact → stride"),

  // Acceleration chain.
  rel("acceleration", "transitionEfficiency", "positive", 0.6, inferred(0.45, "acceleration feeds the transition"), "accel → transition"),
  rel("transitionEfficiency", "peakVelocity", "positive", 0.6, inferred(0.45, "smoother transition preserves top speed"), "transition → peak"),
  rel("maxVelocityMaintenance", "averageVelocity", "positive", 0.5, inferred(0.4, "holding top speed raises the average"), "maintenance → average"),

  // Quality → metric couplings (qualities modelled as graph inputs).
  rel("reactiveStrength", "groundContactTime", "negative", -0.6, inferred(0.5, "reactive strength shortens contact"), "reactive → contact", ["trainingAge", "bodyMass"]),
  rel("reactiveStrength", "elasticStiffness", "positive", 0.6, inferred(0.5, "reactive strength builds stiffness"), "reactive → stiffness"),
  rel("elasticStiffness", "groundContactTime", "negative", -0.55, inferred(0.5, "stiffness shortens contact"), "stiffness → contact"),
  rel("elasticStiffness", "strideFrequency", "positive", 0.5, inferred(0.45, "stiffness supports turnover"), "stiffness → frequency"),
  rel("projection", "strideLength", "positive", 0.6, inferred(0.5, "projection lengthens effective stride"), "projection → stride", ["height", "legLength"]),
  rel("brakingDistance", "averageVelocity", "negative", -0.5, inferred(0.4, "braking at touchdown reduces velocity"), "braking → velocity"),
  rel("touchdownPosition", "strideLength", "threshold", 0.4, inferred(0.4, "touchdown relative to COM has an optimal band"), "touchdown → stride"),
  rel("leftRightSymmetry", "averageVelocity", "threshold", 0.35, inferred(0.4, "asymmetry beyond a band caps output"), "symmetry → velocity"),

  // The classic TRADEOFF (bidirectional negative).
  rel("strideLength", "strideFrequency", "negative", -0.45, inferred(0.55, "increasing stride length can reduce frequency"), "stride ⇄ frequency tradeoff"),
  rel("strideFrequency", "strideLength", "negative", -0.45, inferred(0.55, "increasing frequency can reduce stride length"), "stride ⇄ frequency tradeoff"),
];

export interface DiminishingConfig {
  metricId: string;
  /** Population-level optimal band (NOT the athlete's goal target). */
  optimalRange?: { min: number; max: number };
  /** Curve sharpness — higher = faster diminishing near the target. */
  sharpness: number;
}

/**
 * Diminishing-returns curves. Marginal gain is modelled RELATIVE to the athlete's
 * own required value (from Phase 1), so no goal target is hardcoded. `optimalRange`
 * is an optional population band used only to flag a physiological plateau.
 */
export const DIMINISHING_CONFIG: Record<string, DiminishingConfig> = {
  strideLength: { metricId: "strideLength", sharpness: 1.4, optimalRange: { min: 2.0, max: 2.7 } },
  strideFrequency: { metricId: "strideFrequency", sharpness: 1.6, optimalRange: { min: 4.2, max: 5.4 } },
  peakVelocity: { metricId: "peakVelocity", sharpness: 1.3, optimalRange: { min: 9, max: 12.5 } },
  groundContactTime: { metricId: "groundContactTime", sharpness: 1.5, optimalRange: { min: 0.075, max: 0.12 } },
  acceleration: { metricId: "acceleration", sharpness: 1.2 },
};

/** Athlete-modifier rules: adjust a relationship's strength by athlete attributes. */
export interface ModifierRule {
  from: string;
  to: string;
  /** Predicate over the athlete context; returns a multiplier (1 = no change). */
  factor: (ctx: {
    heightCm: number | null;
    legLengthCm: number | null;
    bodyMassKg: number | null;
    trainingAgeYears: number | null;
  }) => { factor: number; reason: string } | null;
}

export const MODIFIER_RULES: ModifierRule[] = [
  {
    from: "strideLength",
    to: "averageVelocity",
    factor: (ctx) =>
      ctx.heightCm != null && ctx.heightCm >= 185
        ? { factor: 1.1, reason: "taller athletes tend to leverage stride length more" }
        : ctx.heightCm != null && ctx.heightCm <= 168
          ? { factor: 0.92, reason: "shorter athletes tend to rely more on frequency" }
          : null,
  },
  {
    from: "strideFrequency",
    to: "averageVelocity",
    factor: (ctx) =>
      ctx.heightCm != null && ctx.heightCm <= 168
        ? { factor: 1.1, reason: "shorter athletes tend to leverage frequency more" }
        : null,
  },
  {
    from: "reactiveStrength",
    to: "groundContactTime",
    factor: (ctx) =>
      ctx.trainingAgeYears != null && ctx.trainingAgeYears >= 6
        ? { factor: 1.12, reason: "reactive strength transfers more readily in trained athletes" }
        : ctx.trainingAgeYears != null && ctx.trainingAgeYears <= 2
          ? { factor: 0.9, reason: "reactive-strength transfer is less established in novices" }
          : null,
  },
  {
    from: "projection",
    to: "strideLength",
    factor: (ctx) =>
      ctx.legLengthCm != null && ctx.heightCm != null && ctx.legLengthCm / ctx.heightCm >= 0.49
        ? { factor: 1.08, reason: "longer levers amplify projection into stride length" }
        : null,
  },
];
