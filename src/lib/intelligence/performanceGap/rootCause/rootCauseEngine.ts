/**
 * Root Cause Engine (Phase 3). For each limiter, evaluates ALL plausible contributors
 * — never a single guessed cause — combining configurable priors, matched reasoning
 * rules, and athlete-context adaptation into a normalized weighted likelihood. Builds
 * an explainable evidence chain per contributor and propagates confidence from the
 * underlying measurement quality. Pure + deterministic.
 */

import {
  type Confidence,
  type PerformanceGap,
  estimated,
  inferred,
  propagateConfidence,
  unknown,
} from "../models";
import type {
  EvidenceChain,
  EvidenceStep,
  MetricState,
  MetricStatus,
  ReasoningExplanation,
  RootCause,
} from "./models";
import {
  candidateContributors,
  contributor as contributorDef,
  interventionCategory,
  muscleGroup,
} from "./catalog";
import { rulesForMetric } from "./rules";
import { evaluateRule } from "./ruleEngine";
import { contextModifiers, type AthleteContext } from "./athleteContext";

export const ROOT_CAUSE_ENGINE_VERSION = "ava-root-cause-engine-v1" as const;

/** Percent-gap below which a metric counts as "met" (configurable). */
const MET_THRESHOLD_PCT = 1;

/** Derive metric states from the Part A performance gaps. */
export function computeMetricStatuses(gaps: PerformanceGap[]): Map<string, MetricStatus> {
  const map = new Map<string, MetricStatus>();
  for (const g of gaps) {
    let state: MetricState;
    if (g.currentValue == null || g.targetValue == null) state = "unknown";
    else if ((g.absoluteGap ?? 0) > 0 && (g.percentGap ?? 0) > MET_THRESHOLD_PCT) state = "deficient";
    else state = "met";
    map.set(g.metricId, {
      metricId: g.metricId,
      state,
      percentGap: g.percentGap,
      value: g.currentValue,
      target: g.targetValue,
      confidence: g.confidence,
      lowerIsBetter: g.lowerIsBetter,
    });
  }
  return map;
}

export interface RootCauseInput {
  metricId: string;
  label: string;
  gaps: PerformanceGap[];
  rawMetrics: Record<string, number | null | undefined>;
  context?: AthleteContext;
}

export function evaluateRootCauses(input: RootCauseInput): ReasoningExplanation {
  const statuses = computeMetricStatuses(input.gaps);
  const rules = rulesForMetric(input.metricId);
  const modifiers = input.context ? contextModifiers(input.context) : {};

  const candidates = candidateContributors(input.metricId);

  // Accumulate weight + evidence per contributor.
  type Acc = { weight: number; ruleIds: string[]; metrics: Set<string>; reasons: string[]; evidenceConfs: Confidence[] };
  const acc = new Map<string, Acc>();
  for (const id of candidates) {
    const def = contributorDef(id);
    acc.set(id, { weight: def?.prior ?? 0.03, ruleIds: [], metrics: new Set(), reasons: [], evidenceConfs: [] });
  }

  for (const rule of rules) {
    const match = evaluateRule(rule, statuses, input.rawMetrics);
    if (!match.matched) continue;
    const ruleConf = match.supportingMetrics
      .map((m) => statuses.get(m)?.confidence)
      .filter((c): c is Confidence => !!c);
    for (const b of rule.boost) {
      const a = acc.get(b.contributor);
      if (!a) continue; // only boost contributors that are candidates for this limiter
      // Weight the boost by the evidence confidence behind the rule.
      const confScore = averageConfidenceScore(ruleConf);
      a.weight += b.weight * confScore;
      a.ruleIds.push(rule.id);
      match.supportingMetrics.forEach((m) => a.metrics.add(m));
      a.reasons.push(rule.reasoning);
      a.evidenceConfs.push(...ruleConf);
    }
  }

  // Apply athlete-context modifiers (multiplicative), then normalize to %.
  const rows = candidates.map((id) => {
    const a = acc.get(id)!;
    const mod = modifiers[id] ?? 1;
    return { id, weight: Math.max(0, a.weight * mod), a };
  });
  const total = rows.reduce((s, r) => s + r.weight, 0);

  const rootCauses: RootCause[] = rows
    .map((r): RootCause => {
      const def = contributorDef(r.id);
      const likelihoodPct = total > 0 ? round((r.weight / total) * 100) : 0;
      const supportingMetrics = [...r.a.metrics];
      const hadRuleEvidence = r.a.ruleIds.length > 0;
      const confidence = buildContributorConfidence(r.a.evidenceConfs, hadRuleEvidence, input.context != null);
      const evidenceChain = buildEvidenceChain(supportingMetrics, statuses, def?.association ?? "", confidence);
      return {
        contributorId: r.id,
        label: def?.label ?? r.id,
        likelihoodPct,
        confidence,
        supportingMetrics,
        reasoning: r.a.reasons[0] ?? `${def?.label ?? r.id} is a plausible contributor evaluated for this limiter.`,
        association: def?.association ?? "",
        evidenceChain,
        associatedMuscleGroups: (def?.muscleGroups ?? []).map(muscleGroup),
        associatedInterventionCategories: (def?.interventionCategories ?? []).map(interventionCategory),
        contributingRuleIds: r.a.ruleIds,
      };
    })
    .sort((a, b) => b.likelihoodPct - a.likelihoodPct || a.contributorId.localeCompare(b.contributorId));

  const leading = rootCauses[0] ?? null;
  return {
    metricId: input.metricId,
    label: input.label,
    rootCauses,
    leadingContributorId: leading?.contributorId ?? null,
    confidence: leading ? leading.confidence : unknown("no contributors evaluated"),
  };
}

function buildContributorConfidence(evidenceConfs: Confidence[], hadRuleEvidence: boolean, hadContext: boolean): Confidence {
  if (!hadRuleEvidence) {
    // Prior-only contributor: an inferred baseline, low confidence.
    return inferred(0.25, "prior likelihood only — no matching evidence rule");
  }
  // Propagate from the measurement quality of the supporting metrics, then temper
  // by whether athlete context was available to individualize the reasoning.
  const base = propagateConfidence(evidenceConfs, "root-cause reasoning from measured evidence");
  if (base.category === "measured") return estimated(hadContext ? 0.75 : 0.65, "rule-matched on measured metrics");
  return base;
}

function buildEvidenceChain(
  supportingMetrics: string[],
  statuses: Map<string, MetricStatus>,
  association: string,
  confidence: Confidence,
): EvidenceChain {
  const steps: EvidenceStep[] = supportingMetrics.map((m) => {
    const s = statuses.get(m);
    const dir = s?.lowerIsBetter ? "above" : "below";
    const statement =
      s?.state === "deficient"
        ? `${labelize(m)} ${dir} its estimated requirement${s.percentGap != null ? ` (${s.percentGap.toFixed(1)}%)` : ""}`
        : s?.state === "met"
          ? `${labelize(m)} at its estimated requirement`
          : `${labelize(m)} not assessed`;
    return { metricId: m, statement, category: s?.confidence.category ?? "unknown" };
  });
  return {
    steps,
    conclusion: association ? `Pattern ${association}.` : "Pattern commonly associated with this contributor.",
    confidence,
  };
}

function averageConfidenceScore(confs: Confidence[]): number {
  if (confs.length === 0) return 0.5;
  let sum = 0;
  for (const c of confs) sum += c.score ?? (c.category === "measured" ? 1 : c.category === "unknown" ? 0 : 0.5);
  return sum / confs.length;
}

function labelize(metricId: string): string {
  return metricId
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/\bLeft\b/, "(Left)")
    .replace(/\bRight\b/, "(Right)")
    .trim();
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
