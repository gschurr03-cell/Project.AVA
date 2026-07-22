/**
 * Adaptation Assessment (Phase 10). For an observed change, estimates whether it likely
 * represents technical adaptation, physical adaptation, measurement noise, natural
 * variability, temporary fatigue, or incomplete evidence. Crucially, it keeps the
 * OBSERVATION (a measured fact) separate from the HYPOTHESES (ranked possibilities) — AVA
 * never overreacts to one analysis or presents a guess as a finding. Pure + deterministic.
 */

import { type Confidence, estimated, inferred } from "../models";
import type { AdaptationAssessment, AdaptationHypothesisType, MetricHistory, ProgressTrend } from "./models";
import { round } from "./stats";

export const ADAPTATION_ENGINE_VERSION = "ava-progress-adaptation-v1" as const;

export function assessAdaptation(history: MetricHistory, trend: ProgressTrend): AdaptationAssessment {
  const n = history.points.length;
  const pct = trend.percentChange ?? 0;
  const fit = trend.fitQuality ?? 0;
  const observation = `${history.label} changed ${signed(round(pct, 1))}% across ${n} analyses (fit ${round(fit, 2)}, status: ${trend.status}).`;

  const hypotheses: { type: AdaptationHypothesisType; likelihood: number; rationale: string }[] = [];
  const push = (type: AdaptationHypothesisType, likelihood: number, rationale: string) => hypotheses.push({ type, likelihood: round(clamp01(likelihood), 2), rationale });

  const consistent = fit >= 0.5;
  const directional = Math.abs(pct) >= 1.5;

  if (directional && consistent && (trend.status === "improving" || trend.status === "rapid_improvement")) {
    push("technical_adaptation", 0.45 + 0.2 * fit, "A consistent directional improvement is commonly associated with technical or physical adaptation.");
    push("physical_adaptation", 0.4 + 0.15 * fit, "Sustained gains across sessions are commonly associated with physical adaptation.");
  }
  if (directional && !consistent) {
    push("natural_variability", 0.5, "A change without a consistent linear pattern is commonly associated with natural variability.");
    push("measurement_noise", 0.4, "Scatter across analyses is commonly associated with measurement uncertainty.");
  }
  if (!directional) {
    push("measurement_noise", 0.5, "A change within the day-to-day noise band is not distinguishable from measurement noise.");
    push("natural_variability", 0.45, "Small fluctuations are commonly associated with normal variability.");
  }
  if (trend.status === "declining" || trend.status === "rapid_regression") {
    push("temporary_fatigue", 0.4, "A short-term decline is commonly associated with fatigue or accumulated load — not necessarily a lasting regression.");
    push("natural_variability", 0.35, "A decline within a noisy series may reflect variability rather than true regression.");
  }
  if (n < 4) push("incomplete_evidence", 0.6, "Few analyses on record — evidence is incomplete, so treat any interpretation cautiously.");
  if (hypotheses.length === 0) push("incomplete_evidence", 0.5, "No dominant pattern; more analyses would clarify.");

  hypotheses.sort((a, b) => b.likelihood - a.likelihood || a.type.localeCompare(b.type));

  const confidence: Confidence = consistent && n >= 4
    ? estimated(clamp01(0.4 + 0.3 * fit), "consistent multi-analysis pattern")
    : inferred(0.4, "limited or noisy evidence");

  return { metricId: history.metricId, label: history.label, observation, hypotheses: hypotheses.slice(0, 3), confidence };
}

function signed(p: number): string {
  return `${p >= 0 ? "+" : ""}${p}`;
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
