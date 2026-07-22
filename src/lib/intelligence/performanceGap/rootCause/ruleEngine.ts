/**
 * Rule Engine (Phase 3). Deterministically evaluates a configurable reasoning rule
 * against the athlete's metric states + raw left/right values. Pure: returns whether
 * the rule matched and which metrics supported it — the root-cause engine turns those
 * into weighted contributors + evidence chains.
 */

import type { MetricStatus, ReasoningRule, SideCondition } from "./models";

export const RULE_ENGINE_VERSION = "ava-rule-engine-v1" as const;

export interface RuleMatch {
  ruleId: string;
  matched: boolean;
  supportingMetrics: string[];
}

export function evaluateRule(
  rule: ReasoningRule,
  states: Map<string, MetricStatus>,
  rawMetrics: Record<string, number | null | undefined>,
): RuleMatch {
  const supporting = new Set<string>();

  // Metric-state conditions: every one must hold (and be known).
  if (rule.when) {
    for (const cond of rule.when) {
      const s = states.get(cond.metric);
      if (!s || s.state === "unknown" || s.state !== cond.state) {
        return { ruleId: rule.id, matched: false, supportingMetrics: [] };
      }
      supporting.add(cond.metric);
    }
  }

  // Side conditions: every one must hold.
  if (rule.whenSide) {
    for (const cond of rule.whenSide) {
      if (!sideConditionHolds(cond, rawMetrics)) {
        return { ruleId: rule.id, matched: false, supportingMetrics: [] };
      }
      supporting.add(cond.leftMetric);
      supporting.add(cond.rightMetric);
    }
  }

  // A rule with no conditions never matches (guards against empty rules).
  if (!rule.when?.length && !rule.whenSide?.length) {
    return { ruleId: rule.id, matched: false, supportingMetrics: [] };
  }

  return { ruleId: rule.id, matched: true, supportingMetrics: [...supporting] };
}

function sideConditionHolds(cond: SideCondition, raw: Record<string, number | null | undefined>): boolean {
  const l = num(raw[cond.leftMetric]);
  const r = num(raw[cond.rightMetric]);
  if (l == null || r == null) return false;
  const mean = (l + r) / 2;
  if (mean === 0) return false;
  const diffPct = (Math.abs(l - r) / Math.abs(mean)) * 100;
  if (diffPct < (cond.minPct ?? 0)) return false;
  switch (cond.comparison) {
    case "left_shorter":
    case "left_lower":
      return l < r;
    case "right_shorter":
    case "right_lower":
      return r < l;
    case "left_longer":
      return l > r;
    case "right_longer":
      return r > l;
  }
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
