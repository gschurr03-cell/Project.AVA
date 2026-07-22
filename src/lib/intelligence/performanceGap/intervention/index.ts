/**
 * Intervention Intelligence Engine (Phase 7) — public surface + orchestration.
 *
 * Connects performance gaps → root causes → intervention categories → expected
 * direction of improvement → confidence, and returns a ranked, explained set of
 * educational interventions. AVA educates; it does NOT prescribe: no schedules, no
 * days, no sets/reps for the athlete. Pure + deterministic.
 *
 * Consumes Phase 1 (gaps), Phase 3 (root causes), Phase 5 (level). It works WITHOUT
 * Phase 6 (Performance Potential), which is not required for matching.
 */

import type { AthletePerformanceModel } from "../models";
import type { ReasoningExplanation } from "../rootCause/models";
import type { InterventionReport, Level } from "./models";
import { INTERVENTION_LIBRARY_VERSION } from "./library";
import { matchInterventions, INTERVENTION_MATCHING_VERSION } from "./matching";

export * from "./models";
export * from "./library";
export * from "./matching";

export const INTERVENTION_INTELLIGENCE_VERSION = "intervention-intelligence-v1" as const;

export interface InterventionReportInput {
  athleteId?: string | null;
  model: AthletePerformanceModel;
  rootCauses?: ReasoningExplanation[];
  level?: Level;
  limit?: number;
  now?: Date;
}

export function buildInterventionReport(input: InterventionReportInput): InterventionReport {
  const priorities = matchInterventions({
    model: input.model,
    rootCauses: input.rootCauses,
    level: input.level,
    limit: input.limit,
  });
  return {
    version: INTERVENTION_INTELLIGENCE_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    priorities,
    provenance: {
      engineVersions: { matching: INTERVENTION_MATCHING_VERSION },
      libraryVersion: INTERVENTION_LIBRARY_VERSION,
    },
  };
}
