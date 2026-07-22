/**
 * Root Cause Intelligence (Phase 3) — public surface + model-level orchestration.
 *
 * Consumes the Phase 1 {@link AthletePerformanceModel} (unchanged) and produces a
 * weighted, explainable reasoning set for every limiter: all plausible contributors,
 * each with likelihood, propagated confidence, an evidence chain, associated muscle
 * groups, and intervention categories. Pure + deterministic.
 */

import type { AthletePerformanceModel } from "../models";
import type { AthleteContext } from "./athleteContext";
import type { ReasoningExplanation, InteractionModel } from "./models";
import { evaluateRootCauses, ROOT_CAUSE_ENGINE_VERSION } from "./rootCauseEngine";
import { traceInteraction, INTERACTION_MODEL_VERSION } from "./interactions";
import { REASONING_RULES_VERSION } from "./rules";
import { ROOT_CAUSE_CATALOG_VERSION } from "./catalog";
import { ATHLETE_CONTEXT_VERSION } from "./athleteContext";

export * from "./models";
export * from "./catalog";
export * from "./rules";
export * from "./interactions";
export * from "./athleteContext";
export * from "./ruleEngine";
export * from "./rootCauseEngine";

export const ROOT_CAUSE_INTELLIGENCE_VERSION = "root-cause-intelligence-v1" as const;

export interface RootCauseReport {
  version: string;
  explanations: ReasoningExplanation[];
  interactions: InteractionModel[];
  provenance: {
    engineVersions: Record<string, string>;
  };
}

/**
 * Evaluate root causes for every trainable limiter in a performance model. Left/right
 * raw values are supplied separately (the model carries only the primary gaps).
 */
export function buildRootCauseReport(
  model: AthletePerformanceModel,
  opts: { rawMetrics?: Record<string, number | null | undefined>; context?: AthleteContext } = {},
): RootCauseReport {
  const rawMetrics = opts.rawMetrics ?? {};
  const explanations = model.priorities.map((p) =>
    evaluateRootCauses({
      metricId: p.metricId,
      label: p.label,
      gaps: model.gaps,
      rawMetrics,
      context: opts.context,
    }),
  );
  const interactions = model.priorities.map((p) => traceInteraction(p.metricId));

  return {
    version: ROOT_CAUSE_INTELLIGENCE_VERSION,
    explanations,
    interactions,
    provenance: {
      engineVersions: {
        rootCauseEngine: ROOT_CAUSE_ENGINE_VERSION,
        rules: REASONING_RULES_VERSION,
        catalog: ROOT_CAUSE_CATALOG_VERSION,
        interactions: INTERACTION_MODEL_VERSION,
        athleteContext: ATHLETE_CONTEXT_VERSION,
      },
    },
  };
}
