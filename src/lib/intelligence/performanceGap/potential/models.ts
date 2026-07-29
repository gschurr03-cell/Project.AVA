/**
 * Performance Potential Engine — data models (Phase 6).
 *
 * Answers "what am I capable of?" honestly: an informed projection, never a
 * guarantee. Everything is a RANGE with confidence and an explanation, and every
 * value is tagged measured / estimated / projected / unknown. Longer-horizon
 * projections carry lower confidence by construction. Pure + UI-independent.
 *
 * Consumes Phase 1 (gaps/target), Phase 3 (root causes), Phase 4 (sensitivity),
 * and Phase 5 (blueprint → individualized ceiling).
 */

import type { Confidence, EvidenceCategory } from "../models";

export type { Confidence, EvidenceCategory };

export type ProjectionCategory = "measured" | "estimated" | "projected" | "unknown";

/** A projection's confidence, with the factors that produced it. */
export interface ProjectionConfidence {
  level: "low" | "moderate" | "high";
  score: number;
  factors: { factor: string; contribution: number }[];
}

export interface ProjectionEvidence {
  statement: string;
  category: EvidenceCategory;
}

export interface ProjectionAssumption {
  statement: string;
}

/** A bottleneck constraining higher projections, linked back to an engine. */
export interface ProjectionConstraint {
  metricId: string;
  label: string;
  reason: string;
  severity: "primary" | "secondary";
  linkedEngine: string;
  contributionPct: number | null;
}

/** A time/velocity range — projections are never a single number. */
export interface PotentialRange {
  minTimeS: number | null;
  maxTimeS: number | null;
  minVelocityMps: number | null;
  maxVelocityMps: number | null;
  confidence: ProjectionConfidence;
}

export interface PerformanceProjection {
  horizon: "current" | "near_term" | "long_term";
  label: string;
  range: PotentialRange;
  evidence: ProjectionEvidence[];
  assumptions: ProjectionAssumption[];
  category: ProjectionCategory;
}

/** An individualized performance ceiling — never presented as destiny. */
export interface PerformanceCeiling {
  ceilingTimeS: number | null;
  ceilingVelocityMps: number | null;
  basis: string[];
  confidence: ProjectionConfidence;
  note: string;
}

/** A development scenario. */
export interface DevelopmentScenario {
  id: "current_trajectory" | "conservative" | "expected" | "optimistic";
  label: string;
  estimatedTimeS: number | null;
  range: { min: number | null; max: number | null };
  confidence: ProjectionConfidence;
  largestLimitingFactors: string[];
  greatestUncertainty: string[];
}

/** An explicitly-surfaced source of uncertainty. */
export interface UncertaintySource {
  id: string;
  description: string;
  impact: "low" | "moderate" | "high";
}

/** The Phase 6 output. */
export interface PerformancePotential {
  version: string;
  generatedAt: string;
  athleteId: string | null;
  currentCapacity: PotentialRange;
  nearTerm: PerformanceProjection;
  longTerm: PerformanceProjection;
  ceiling: PerformanceCeiling;
  scenarios: DevelopmentScenario[];
  bottlenecks: ProjectionConstraint[];
  uncertainty: UncertaintySource[];
  provenance: { engineVersions: Record<string, string>; configVersion: string };
}
