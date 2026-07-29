/**
 * Intervention Intelligence Engine — data models (Phase 7).
 *
 * AVA educates, it does NOT prescribe. This layer connects performance gaps → root
 * causes → metric dependencies → intervention CATEGORIES and explains WHY an
 * intervention may help, WHEN it is commonly used, WHAT quality it develops, and
 * WHICH metrics it commonly influences — never a weekly schedule, never sets/reps
 * assigned to the athlete. Pure + UI-independent.
 */

import type { Confidence, EvidenceCategory } from "../models";
import type { Level } from "../blueprint/models";

export type { Confidence, EvidenceCategory, Level };

export type EvidenceStrength = "strong" | "moderate" | "limited" | "anecdotal";

/** A metric an intervention commonly influences, and in which direction. */
export interface AssociatedMetric {
  metricId: string;
  direction: "increase" | "decrease";
  /** Direct = the intervention targets it; indirect = via a downstream dependency. */
  kind: "direct" | "indirect";
}

/** A movement/technical pattern an intervention is associated with. */
export interface AssociatedPattern {
  id: string;
  label: string;
}

/** A category of interventions (educational grouping). */
export interface InterventionCategory {
  id: string;
  label: string;
  description: string;
}

/** A single intervention with full educational metadata. Not a prescription. */
export interface Intervention {
  id: string;
  name: string;
  category: string;
  primaryQualities: string[];
  secondaryQualities: string[];
  commonUses: string[];
  typicalLevel: Level[];
  typicalPhase: string[];
  typicalDistances: string;
  typicalVolume: string;
  typicalRest: string;
  coachingCues: string[];
  commonMistakes: string[];
  associatedMuscleGroups: string[];
  evidenceStrength: EvidenceStrength;
  contraindications: string[];
  /** Metrics this intervention is commonly associated with moving. */
  associatedMetrics: AssociatedMetric[];
  /** Root-cause contributor ids (Phase 3) this intervention commonly addresses. */
  rootCausesAddressed: string[];
  confidence: number;
}

/** A relationship where an intervention develops several qualities/metrics. */
export interface InterventionRelationship {
  interventionId: string;
  develops: string[];
  influencesMetrics: string[];
}

/** A single coaching cue. */
export interface CoachingCue {
  interventionId: string;
  cue: string;
}

/** Educational implementation guidance — concepts only, never a program. */
export interface ImplementationGuidance {
  typicalDistances: string;
  typicalVolume: string;
  typicalRest: string;
  typicalPhase: string[];
  coachingCues: string[];
  note: string;
}

/** Expected DIRECTION of a metric change — never a guaranteed magnitude. */
export interface ExpectedImprovement {
  metricId: string;
  label: string;
  direction: "increase" | "decrease";
  kind: "direct" | "indirect";
  confidence: Confidence;
}

/** A ranked, matched intervention with its reasoning. */
export interface InterventionPriority {
  rank: number;
  intervention: Intervention;
  priorityScore: number;
  confidence: Confidence;
  reasoning: string;
  supportingEvidence: string[];
  associatedMetrics: string[];
  addressedLimiters: string[];
  addressedRootCauses: string[];
  expectedImprovements: ExpectedImprovement[];
  implementationGuidance: ImplementationGuidance;
}

/** The Phase 7 output. */
export interface InterventionReport {
  version: string;
  generatedAt: string;
  athleteId: string | null;
  priorities: InterventionPriority[];
  provenance: { engineVersions: Record<string, string>; libraryVersion: string };
}
