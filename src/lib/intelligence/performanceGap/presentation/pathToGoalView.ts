/**
 * Path To Goal view-model (Part B) — pure + deterministic.
 *
 * Transforms the Part A {@link AthletePerformanceModel} + left/right panel into a
 * display-ready structure the Path To Goal page renders directly. No React here.
 * Preserves every evidence category + confidence from the engines so the UI can
 * clearly separate measured vs estimated vs inferred vs unknown.
 */

import type {
  AthletePerformanceModel,
  Confidence,
  EvidenceCategory,
  PerformanceGap,
  PerformanceTree,
  PriorityLimiter,
} from "../models";
import { recommendationDetail, metricAssociations } from "./presentationConfig";
import { type LeftRightAnalysis, buildLeftRightPanel } from "./leftRight";

export const PATH_TO_GOAL_VIEW_VERSION = "path-to-goal-view-v1" as const;

export interface PathHeadline {
  distanceM: number;
  currentTimeS: number | null;
  goalTimeS: number | null;
  remainingGapS: number | null;
  currentAvgVelocityMps: number | null;
  requiredAvgVelocityMps: number | null;
}

export interface BreakdownSlice {
  metricId: string;
  label: string;
  contributionPct: number;
}

export interface TargetRow {
  metricId: string;
  label: string;
  unit: string;
  current: number | null;
  target: number | null;
  gap: number | null;
  percentGap: number | null;
  evidence: EvidenceCategory;
  confidence: Confidence;
  lowerIsBetter: boolean;
}

export interface LimiterCard {
  rank: number;
  metricId: string;
  label: string;
  current: number | null;
  target: number | null;
  gap: number | null;
  percentGap: number | null;
  contributionPct: number | null;
  confidence: Confidence;
  expectedImprovement: PriorityLimiter["expectedImprovement"];
  estimatedTimeGainS: number | null;
  whyItMatters: string;
  evidence: string[];
  associatedTechnicalPatterns: string[];
  associatedMuscleGroups: string[];
  recommendedInterventions: string[];
  tree: PerformanceTree | null;
}

export interface RecommendationCard {
  recommendationId: string;
  title: string;
  reason: string;
  confidence: Confidence;
  primaryMetricId: string | null;
  current: number | null;
  target: number | null;
  gap: number | null;
  estimatedEffects: { metricId: string; label: string; delta: number; unit: string; direction: "increase" | "decrease" }[];
  estimatedRaceTimeGainS: { min: number; max: number } | null;
  associatedMuscleGroups: string[];
  associatedTechnicalPatterns: string[];
  drills: string[];
  strengthWork: string[];
  mobilityWork: string[];
  sprintSessions: string[];
  evidenceSource: string;
  /** Placeholder handle for future weekly progress tracking (not implemented). */
  progressTrackingKey: string;
}

export interface PathToGoalView {
  version: string;
  headline: PathHeadline;
  breakdown: BreakdownSlice[];
  limiterCards: LimiterCard[];
  targetRows: TargetRow[];
  recommendationCards: RecommendationCard[];
  leftRight: LeftRightAnalysis[];
  provenance: AthletePerformanceModel["provenance"];
  generatedAt: string;
}

export function buildPathToGoalView(
  model: AthletePerformanceModel,
  leftRightMetrics: Record<string, number | null | undefined> = {},
): PathToGoalView {
  const gapById = new Map<string, PerformanceGap>(model.gaps.map((g) => [g.metricId, g]));
  const treeById = new Map(model.trees.map((t) => [t.rootMetricId, t]));

  const headline: PathHeadline = {
    distanceM: model.target.distanceM,
    currentTimeS: model.target.currentTimeS,
    goalTimeS: model.target.goalTimeS,
    remainingGapS:
      model.target.currentTimeS != null && model.target.goalTimeS != null
        ? round(Math.max(0, model.target.currentTimeS - model.target.goalTimeS))
        : null,
    currentAvgVelocityMps: model.target.currentAvgVelocityMps,
    requiredAvgVelocityMps: model.target.requiredAvgVelocityMps,
  };

  const breakdown: BreakdownSlice[] = model.priorities
    .filter((p) => p.contributionPct != null)
    .map((p) => ({ metricId: p.metricId, label: p.label, contributionPct: p.contributionPct as number }));

  const limiterCards: LimiterCard[] = model.priorities.map((p) => {
    const gap = gapById.get(p.metricId);
    const assoc = metricAssociations(p.metricId);
    return {
      rank: p.rank,
      metricId: p.metricId,
      label: p.label,
      current: gap?.currentValue ?? null,
      target: gap?.targetValue ?? null,
      gap: gap?.absoluteGap ?? null,
      percentGap: gap?.percentGap ?? null,
      contributionPct: p.contributionPct,
      confidence: p.confidence,
      expectedImprovement: p.expectedImprovement,
      estimatedTimeGainS: p.estimatedTimeGainS,
      whyItMatters: p.reason,
      evidence: p.evidence,
      associatedTechnicalPatterns: assoc.technicalPatterns,
      associatedMuscleGroups: assoc.muscleGroups,
      recommendedInterventions: recommendationsForMetric(p.metricId),
      tree: treeById.get(p.metricId) ?? null,
    };
  });

  const targetRows: TargetRow[] = model.gaps.map((g) => ({
    metricId: g.metricId,
    label: g.label,
    unit: g.unit,
    current: g.currentValue,
    target: g.targetValue,
    gap: g.absoluteGap,
    percentGap: g.percentGap,
    evidence: g.confidence.category,
    confidence: g.confidence,
    lowerIsBetter: g.lowerIsBetter,
  }));

  const recommendationCards: RecommendationCard[] = model.recommendationImpacts.map((imp) => {
    const detail = recommendationDetail(imp.recommendationId);
    const primaryMetricId = imp.estimatedEffects[0]?.metricId ?? null;
    const primaryGap = primaryMetricId ? gapById.get(primaryMetricId) : undefined;
    return {
      recommendationId: imp.recommendationId,
      title: imp.label,
      reason: imp.reasoning,
      confidence: imp.confidence,
      primaryMetricId,
      current: primaryGap?.currentValue ?? null,
      target: primaryGap?.targetValue ?? null,
      gap: primaryGap?.absoluteGap ?? null,
      estimatedEffects: imp.estimatedEffects.map((e) => ({
        metricId: e.metricId,
        label: labelFor(model, e.metricId),
        delta: e.estimatedDelta,
        unit: e.unit,
        direction: e.direction,
      })),
      estimatedRaceTimeGainS: imp.estimatedRaceTimeGainS,
      associatedMuscleGroups: detail.associatedMuscleGroups,
      associatedTechnicalPatterns: detail.associatedTechnicalPatterns,
      drills: detail.drills,
      strengthWork: detail.strengthWork,
      mobilityWork: detail.mobilityWork,
      sprintSessions: detail.sprintSessions,
      evidenceSource: imp.evidenceSource,
      progressTrackingKey: `progress:${imp.recommendationId}`,
    };
  });

  return {
    version: PATH_TO_GOAL_VIEW_VERSION,
    headline,
    breakdown,
    limiterCards,
    targetRows,
    recommendationCards,
    leftRight: buildLeftRightPanel(leftRightMetrics),
    provenance: model.provenance,
    generatedAt: model.generatedAt,
  };
}

function recommendationsForMetric(metricId: string): string[] {
  // Uses the same associations the engines expose; presentation-only join.
  const map: Record<string, string[]> = {
    strideLength: ["reactiveStrength", "hipExtensionTiming", "projectionMechanics"],
    strideFrequency: ["frontSideMechanics", "reactiveStrength"],
    groundContactTime: ["reactiveStrength", "elasticStiffness"],
    peakVelocity: ["maxVelocityExposure", "reactiveStrength"],
    acceleration: ["resistedAcceleration", "hillSprints", "maxStrength"],
  };
  return map[metricId.replace(/(Left|Right)$/, "")] ?? [];
}

function labelFor(model: AthletePerformanceModel, metricId: string): string {
  return model.gaps.find((g) => g.metricId === metricId)?.label ?? metricId;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
