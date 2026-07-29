/**
 * Root Cause Intelligence — data models (Phase 3).
 *
 * AVA moves from "what must improve" to "WHY is that metric limiting performance".
 * Every limiter is evaluated against ALL plausible contributors — never a single
 * guessed cause — each with a weighted likelihood, propagated confidence, an
 * evidence chain, associated muscle groups (associative, never diagnostic), and
 * intervention categories.
 *
 * Reuses the Part A confidence primitives so measurement→metric→root-cause→
 * recommendation confidence propagates through one consistent rule.
 */

import type { Confidence, EvidenceCategory } from "../models";

export type { Confidence, EvidenceCategory };

/** State of a metric relative to its estimated requirement. */
export type MetricState = "deficient" | "met" | "unknown";

export interface MetricStatus {
  metricId: string;
  state: MetricState;
  percentGap: number | null;
  value: number | null;
  target: number | null;
  confidence: Confidence;
  lowerIsBetter: boolean;
}

/** An associated muscle group — a coaching association, never a diagnosis. */
export interface AssociatedMuscleGroup {
  id: string;
  label: string;
}

/** An associated movement/technical pattern. */
export interface AssociatedPattern {
  id: string;
  label: string;
  association: string;
}

/** A category of intervention (never a prescribed program). */
export interface InterventionCategory {
  id: string;
  label: string;
  purpose: string;
  typicalImplementation: string;
}

/** One step in an explainable evidence chain. */
export interface EvidenceStep {
  metricId: string | null;
  statement: string;
  category: EvidenceCategory;
}

export interface EvidenceChain {
  steps: EvidenceStep[];
  conclusion: string;
  confidence: Confidence;
}

/** A weighted possible contributor to a limiter — never asserted as THE cause. */
export interface RootCause {
  contributorId: string;
  label: string;
  /** Relative likelihood among contributors for this limiter, 0..100. */
  likelihoodPct: number;
  confidence: Confidence;
  supportingMetrics: string[];
  reasoning: string;
  association: string;
  evidenceChain: EvidenceChain;
  associatedMuscleGroups: AssociatedMuscleGroup[];
  associatedInterventionCategories: InterventionCategory[];
  /** Rule ids that contributed weight, for auditability. */
  contributingRuleIds: string[];
}

/** The full reasoning for one limiter. */
export interface ReasoningExplanation {
  metricId: string;
  label: string;
  rootCauses: RootCause[];
  /** Highest-likelihood contributor id (never asserted as certain). */
  leadingContributorId: string | null;
  confidence: Confidence;
}

/** Optional research metadata every rule can carry (Phase 4 seam — not populated). */
export interface ResearchMetadata {
  source?: string;
  publication?: string;
  evidenceQuality?: "strong" | "moderate" | "limited" | "anecdotal";
  internalValidation?: string;
}

/** A configurable reasoning rule condition over a single metric's state. */
export interface MetricCondition {
  metric: string;
  state: MetricState;
}

/** A configurable reasoning rule condition comparing left vs right. */
export type SideComparison = "left_shorter" | "right_shorter" | "left_longer" | "right_longer" | "left_lower" | "right_lower";
export interface SideCondition {
  leftMetric: string;
  rightMetric: string;
  comparison: SideComparison;
  /** Minimum percent difference to count (configurable). */
  minPct?: number;
}

/** A weight added to a contributor when a rule matches. */
export interface ContributorBoost {
  contributor: string;
  weight: number;
}

/** A configurable reasoning rule — no coaching logic is hardcoded in the engine. */
export interface ReasoningRule {
  id: string;
  /** Which limiter(s) this rule applies to; "*" = any. */
  appliesTo: string[];
  when?: MetricCondition[];
  whenSide?: SideCondition[];
  boost: ContributorBoost[];
  reasoning: string;
  research?: ResearchMetadata;
}

/** A directed dependency between two metrics (interaction model). */
export interface MetricDependency {
  from: string;
  to: string;
  relationship: string;
  /** 0..1 configurable coupling strength. */
  strength: number;
}

/** A traced interaction chain from a metric to the finish result. */
export interface InteractionModel {
  rootMetricId: string;
  chain: { metricId: string; relationship: string; strength: number }[];
  /** Product of strengths along the chain (0..1). */
  couplingToFinish: number;
}
