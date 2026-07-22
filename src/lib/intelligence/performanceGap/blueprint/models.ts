/**
 * Athlete Blueprint Engine — data models (Phase 5).
 *
 * AVA estimates what an elite version of THIS athlete would likely look like — an
 * individualized performance blueprint from their own anthropometrics + goal, never
 * generic elites, world records, or one-size-fits-all targets. Every target is a
 * confidence-tagged RANGE and an estimate, never a requirement. Pure + UI-independent.
 */

import type { Confidence, EvidenceCategory } from "../models";

export type { Confidence, EvidenceCategory };

/** An individualized target expressed as a range with confidence. */
export interface TargetRange {
  min: number | null;
  max: number | null;
  unit: string;
  confidence: Confidence;
}

/** One metric in the blueprint: current vs individualized target range. */
export interface BlueprintMetric {
  metricId: string;
  label: string;
  currentValue: number | null;
  targetRange: TargetRange;
  /** The model that produced the range (audit/swappability). */
  basis: string;
  evidence: EvidenceCategory;
}

export type Level = "developing" | "intermediate" | "advanced" | "elite";

/** Individualized body-composition estimates (never presented as requirements). */
export interface BodyProfile {
  currentMassKg: number | null;
  currentBmi: number | null;
  targetMassKg: TargetRange;
  targetBmi: TargetRange;
  leanMassKg: TargetRange;
  estimatedStrengthLevel: Level;
  estimatedPowerLevel: Level;
  confidence: Confidence;
}

/** An estimated strength benchmark range — an estimate, never mandatory. */
export interface StrengthBenchmark {
  id: string;
  label: string;
  /** Absolute range (e.g. kg) for this athlete. */
  range: TargetRange;
  /** The relative-to-bodyweight band it was derived from. */
  relativeToBodyweight: { min: number; max: number };
  confidence: Confidence;
  note: string;
}

/** A comparison to a similar-build archetype — never a named world-record holder. */
export interface EliteComparison {
  archetypeId: string;
  label: string;
  /** 0..1 anthropometric/event similarity. */
  similarity: number;
  basis: string[];
  velocityProfile: string;
  accelerationProfile: string;
  style: string;
  note: string;
  confidence: Confidence;
}

/** How close the athlete is to their blueprint in one development area. */
export interface ProgressScore {
  areaId: string;
  label: string;
  scorePct: number;
  confidence: Confidence;
  contributingMetrics: string[];
}

/** A prioritized development area (largest remaining difference first). */
export interface DevelopmentArea {
  areaId: string;
  label: string;
  scorePct: number;
  gapDescription: string;
  priority: number;
}

export interface PerformanceBlueprint {
  metrics: BlueprintMetric[];
  scores: ProgressScore[];
  overallCompletionPct: number;
}

/** The complete individualized blueprint — the Phase 5 output. */
export interface AthleteBlueprint {
  version: string;
  generatedAt: string;
  athleteId: string | null;
  bodyProfile: BodyProfile;
  performanceBlueprint: PerformanceBlueprint;
  strengthBenchmarks: StrengthBenchmark[];
  eliteComparison: EliteComparison | null;
  developmentAreas: DevelopmentArea[];
  provenance: { engineVersions: Record<string, string>; configVersion: string };
}
