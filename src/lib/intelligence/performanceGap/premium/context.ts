/**
 * Premium coaching context (Phase 12). The input bundle every generator reads from — the
 * athlete's prior-phase outputs plus training context and goals — and a set of pure
 * accessors that normalise "what are this athlete's top limiters / plateaus / trends" so no
 * engine re-derives them. Consumes Phases 1, 6, 7, 10, 11. Pure.
 */

import type { AthletePerformanceModel } from "../models";
import type { PerformancePotential } from "../potential/models";
import type { ProgressIntelligence } from "../progress/models";
import type { InterventionReport } from "../intervention/models";
import type { ResolvedPreferences } from "../coach/preferences";
import type { AdaptiveDecision, BlockType, GoalDefinition, Level, SessionType } from "./models";

export interface TrainingContext {
  blockType: BlockType;
  competitionDate?: string | null;
  sessionsPerWeek: number;
  athleteLevel: Level;
  availableSessionTypes?: SessionType[];
  /** Recent per-session relative loads (0..1), most recent last. */
  recentSessionLoads?: number[];
  weekOf?: string;
}

export interface PremiumInput {
  athleteId?: string | null;
  now?: Date;
  trainingContext: TrainingContext;
  model?: AthletePerformanceModel | null;
  potential?: PerformancePotential | null;
  progress?: ProgressIntelligence | null;
  interventions?: InterventionReport | null;
  preferences?: ResolvedPreferences | null;
  goals?: GoalDefinition[];
  priorAdaptations?: AdaptiveDecision[];
}

export interface LimiterRef {
  metricId: string;
  label: string;
  contributionPct: number | null;
}

/** The athlete's top limiters — from Phase 1 priorities, falling back to Phase 6 bottlenecks. */
export function topLimiters(input: PremiumInput, n = 3): LimiterRef[] {
  const fromModel = (input.model?.priorities ?? []).map((p) => ({ metricId: p.metricId, label: p.label, contributionPct: p.contributionPct }));
  if (fromModel.length > 0) return fromModel.slice(0, n);
  const fromPotential = (input.potential?.bottlenecks ?? []).map((b) => ({ metricId: b.metricId, label: b.label, contributionPct: b.contributionPct }));
  return fromPotential.slice(0, n);
}

/** Metric ids currently plateaued (Phase 10). */
export function plateauedMetrics(input: PremiumInput): string[] {
  return (input.progress?.plateaus ?? []).filter((p) => p.detected).map((p) => p.metricId);
}

/** The primary-performance trend status (Phase 10), default averageVelocity. */
export function primaryTrendStatus(input: PremiumInput, metricId = "averageVelocity"): string {
  return input.progress?.trends.find((t) => t.metricId === metricId)?.status ?? "insufficient_data";
}

/** Days until competition (from now), or null. */
export function daysToCompetition(input: PremiumInput): number | null {
  const date = input.trainingContext.competitionDate;
  if (!date) return null;
  const now = input.now ?? new Date();
  const ms = new Date(date).getTime() - now.getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}
