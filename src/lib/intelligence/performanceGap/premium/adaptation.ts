/**
 * Auto-Adaptation (Phase 12). After every analysis AVA decides how the plan should change —
 * continue, progress difficulty, reduce volume, change emphasis, introduce a new
 * intervention, increase recovery, or maintain — driven by the Phase 10 progress picture and
 * the load estimate. EVERY change is explained (trigger → change → why); AVA never makes an
 * unexplained change. When an athlete plateaus, it escalates from emphasis change to a new
 * intervention rather than repeating itself. Pure + deterministic.
 */

import { type Confidence, estimated, inferred } from "../models";
import type { AdaptiveDecision, AdaptiveDecisionType, LoadEstimate } from "./models";
import { estimateLoad } from "./load";
import { plateauedMetrics, primaryTrendStatus, type PremiumInput } from "./context";

export const ADAPTATION_ENGINE_VERSION = "ava-premium-adaptation-v1" as const;

export function decideAdaptation(input: PremiumInput, load: LoadEstimate = estimateLoad(input)): AdaptiveDecision {
  const now = (input.now ?? new Date()).toISOString();
  const trend = primaryTrendStatus(input);
  const plateaus = plateauedMetrics(input);
  const priorEmphasisChanges = (input.priorAdaptations ?? []).filter((a) => a.decision === "change_emphasis");

  let decision: AdaptiveDecisionType = "maintain";
  const triggers: string[] = [];
  const changes: AdaptiveDecision["changes"] = [];
  let rationale = "";

  if (load.band === "very_high") {
    decision = "increase_recovery";
    triggers.push(`cumulative stress ${load.cumulativeStress} (very high)`);
    changes.push({ aspect: "recovery", from: "planned", to: "elevated", why: "Very high cumulative stress — protect readiness before adding stimulus." });
    rationale = "Load is very high, so recovery takes priority this cycle.";
  } else if (trend === "rapid_regression") {
    decision = "reduce_volume";
    triggers.push("rapid performance regression");
    changes.push({ aspect: "volume", from: "current", to: "reduced", why: "A rapid regression is commonly associated with excess fatigue — reduce volume and reassess." });
    rationale = "Performance is regressing quickly; back off volume and re-evaluate.";
  } else if (trend === "declining") {
    decision = "increase_recovery";
    triggers.push("declining performance trend");
    changes.push({ aspect: "recovery", from: "planned", to: "increased", why: "A decline may reflect accumulated fatigue rather than true regression." });
    rationale = "The trend is declining; add recovery before changing the stimulus.";
  } else if (plateaus.length > 0) {
    const plateauMetric = plateaus[0];
    const alreadyChanged = priorEmphasisChanges.some((a) => a.changes.some((c) => c.aspect.includes(plateauMetric)));
    decision = alreadyChanged ? "new_intervention" : "change_emphasis";
    triggers.push(`plateau in ${plateauMetric}`);
    changes.push(
      alreadyChanged
        ? { aspect: `intervention:${plateauMetric}`, from: "current approach", to: "new intervention", why: `Emphasis was already shifted for ${plateauMetric} without progress — introduce a different intervention.` }
        : { aspect: `emphasis:${plateauMetric}`, from: "current emphasis", to: "shifted emphasis", why: `${plateauMetric} has plateaued — change the emphasis to restart adaptation.` },
    );
    rationale = alreadyChanged
      ? `${plateauMetric} has stayed flat despite an emphasis change — time to try a new intervention.`
      : `${plateauMetric} has plateaued — shift emphasis to reignite progress.`;
  } else if (trend === "rapid_improvement") {
    decision = "progress_difficulty";
    triggers.push("rapid improvement");
    changes.push({ aspect: "difficulty", from: "current", to: "progressed", why: "Rapid improvement suggests the athlete can absorb a greater stimulus." });
    rationale = "The athlete is improving rapidly and can handle progression.";
  } else if (trend === "improving") {
    decision = "continue";
    triggers.push("steady improvement");
    rationale = "Steady improvement — keep the current plan; it is working.";
  } else {
    decision = "maintain";
    triggers.push(trend === "insufficient_data" ? "insufficient history" : "stable trend");
    rationale = trend === "insufficient_data" ? "Not enough history yet — maintain and keep gathering data." : "Trend is stable — maintain the current course.";
  }

  const confidence: Confidence = trend === "insufficient_data" ? inferred(0.4, "limited history") : estimated(0.6, "based on progress trend + load");

  return { decision, rationale, triggers, changes, confidence, generatedAt: now };
}
