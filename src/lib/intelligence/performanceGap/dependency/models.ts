/**
 * Metric Dependency Engine — data models (Phase 4).
 *
 * Sprint metrics are not independent: changing one changes several others. This is
 * the interconnected performance model — a causal graph of signed, confidence-tagged
 * relationships that later powers the What-If Simulator, performance prediction,
 * season forecasting, and training prioritization. Pure + UI-independent.
 */

import type { Confidence, EvidenceCategory } from "../models";
import type { ResearchMetadata } from "../rootCause/models";

export type { Confidence, EvidenceCategory, ResearchMetadata };

/** How two metrics relate. */
export type RelationshipType = "positive" | "negative" | "threshold" | "plateau" | "nonlinear" | "unknown";

export interface RelationshipEvidence {
  basis: string;
  category: EvidenceCategory;
  /** Phase 5 seam — research provenance for this relationship. */
  research?: ResearchMetadata;
}

/** A directed metric→metric relationship. */
export interface MetricRelationship {
  from: string;
  to: string;
  type: RelationshipType;
  /** Signed coupling in [-1, 1]: +ve reinforcing, -ve opposing (tradeoff). */
  strength: number;
  confidence: Confidence;
  evidence: RelationshipEvidence;
  /** Athlete attributes this relationship is sensitive to. */
  athleteDependency?: string[];
}

/** A node in the causal graph, with its influences + dependents. */
export interface DependencyNode {
  metricId: string;
  label: string;
  primaryInfluences: string[];
  secondaryInfluences: string[];
  dependents: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: RelationshipType;
  strength: number;
  confidence: Confidence;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  version: string;
}

/** A multi-layer influence path between two metrics. */
export interface InfluencePath {
  metricIds: string[];
  /** Product of |strength| along the path (0..1). */
  coupling: number;
  /** Net sign of the path (+1 reinforcing → target, −1 opposing). */
  netSign: 1 | -1;
}

export interface InfluenceScore {
  metricId: string;
  label: string;
  directInfluence: number;
  /** Direct + indirect influence toward the target (finish), 0..1 normalized later. */
  totalInfluence: number;
  confidence: Confidence;
  paths: InfluencePath[];
}

/** How much improving a metric is estimated to ripple downstream. */
export interface SensitivityScore {
  metricId: string;
  label: string;
  /** 0..1 normalized downstream influence. */
  sensitivity: number;
  affectedMetrics: { metricId: string; estimatedEffect: number }[];
  confidence: Confidence;
}

/** A detected tradeoff: improving `metricId` may harm `affects`. */
export interface Tradeoff {
  metricId: string;
  affects: string;
  type: RelationshipType;
  strength: number;
  note: string;
  confidence: Confidence;
}

export type DiminishingRegime = "rising" | "diminishing" | "plateau" | "unknown";

/** Diminishing-returns model for a metric, expressed relative to its requirement. */
export interface DiminishingReturns {
  metricId: string;
  currentValue: number | null;
  targetValue: number | null;
  /** Marginal gain multiplier at the current value (1 = full return, →0 near plateau). */
  marginalGainFactor: number | null;
  regime: DiminishingRegime;
  /** Optional configurable optimal band (population-level, not the athlete's goal). */
  optimalRange: { min: number; max: number } | null;
  confidence: Confidence;
}

/** A per-relationship multiplier derived from athlete attributes. */
export interface AthleteModifier {
  relationshipKey: string;
  factor: number;
  reason: string;
}

/** The full Phase 4 output. */
export interface MetricDependencyReport {
  version: string;
  graph: DependencyGraph;
  sensitivity: SensitivityScore[];
  tradeoffs: Tradeoff[];
  diminishingReturns: DiminishingReturns[];
  athleteModifiers: AthleteModifier[];
  provenance: { engineVersions: Record<string, string> };
}
