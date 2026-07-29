/**
 * Progress Intelligence Engine (Phase 10) — public surface + orchestration.
 *
 * Turns a stream of individual analyses into an understanding of the athlete's whole
 * development journey: a longitudinal history, per-metric trends with confidence, plateau
 * detection (linked to the other engines), adaptation assessment (observation vs
 * hypothesis), anomaly detection (never assuming injury), improvement attribution,
 * short-term forecasting (always with uncertainty), a filterable timeline, and progress
 * against goals. Pure + deterministic + serializable.
 *
 * Do NOT redesign unrelated UI. Do NOT generate workout plans. No coach collaboration yet.
 */

import type { SensitivityScore } from "../dependency/models";
import type { AnalysisRecord, ProgressIntelligence, Plateau, AdaptationAssessment, Anomaly, Forecast } from "./models";
import { PROGRESS_CONFIG_VERSION } from "./config";
import { buildAthleteHistory, getMetricHistory, ATHLETE_HISTORY_VERSION } from "./history";
import { computeAllTrends, computeTrend, TREND_ENGINE_VERSION } from "./trends";
import { detectPlateau, PLATEAU_ENGINE_VERSION } from "./plateau";
import { assessAdaptation, ADAPTATION_ENGINE_VERSION } from "./adaptation";
import { detectAnomalies, ANOMALY_ENGINE_VERSION } from "./anomaly";
import { attributeImprovement, ATTRIBUTION_ENGINE_VERSION } from "./attribution";
import { forecastMetric, FORECAST_ENGINE_VERSION } from "./forecast";
import { buildTimeline, TIMELINE_ENGINE_VERSION } from "./timeline";
import { buildGoalProgress, GOALS_ENGINE_VERSION, type GoalSeries } from "./goals";

export * from "./models";
export * from "./config";
export * from "./stats";
export * from "./history";
export * from "./trends";
export * from "./plateau";
export * from "./adaptation";
export * from "./anomaly";
export * from "./attribution";
export * from "./forecast";
export * from "./timeline";
export * from "./goals";

export const PROGRESS_INTELLIGENCE_VERSION = "progress-intelligence-v1" as const;

export interface ProgressIntelligenceInput {
  athleteId?: string | null;
  records: AnalysisRecord[];
  /** Phase 4 sensitivity — enriches plateau factors + improvement attribution. */
  sensitivity?: SensitivityScore[];
  /** Performance outcome to attribute improvements to (default averageVelocity). */
  performanceMetric?: string;
  /** Metrics to overlay on the timeline (defaults to all tracked). */
  timelineMetrics?: string[];
  /** Goal/target series to track progress against. */
  goals?: GoalSeries[];
  now?: Date;
}

export function buildProgressIntelligence(input: ProgressIntelligenceInput): ProgressIntelligence {
  const history = buildAthleteHistory(input.athleteId ?? null, input.records);
  const trends = computeAllTrends(history);
  const trendById = new Map(trends.map((t) => [t.metricId, t]));

  const plateaus: Plateau[] = [];
  const adaptations: AdaptationAssessment[] = [];
  const anomalies: Anomaly[] = [];
  const forecasts: Forecast[] = [];

  for (const metricId of history.trackedMetrics) {
    const mh = getMetricHistory(history, metricId);
    const trend = trendById.get(metricId) ?? computeTrend(mh);
    if (trend.status === "insufficient_data") continue;

    const plateau = detectPlateau({ history: mh, trend, sensitivity: input.sensitivity });
    if (plateau.detected) plateaus.push(plateau);

    adaptations.push(assessAdaptation(mh, trend));
    anomalies.push(...detectAnomalies(mh));
    forecasts.push(forecastMetric(mh, trend));
  }

  plateaus.sort((a, b) => a.metricId.localeCompare(b.metricId));
  adaptations.sort((a, b) => a.metricId.localeCompare(b.metricId));
  anomalies.sort((a, b) => b.deviation - a.deviation || a.metricId.localeCompare(b.metricId) || a.date.localeCompare(b.date));
  forecasts.sort((a, b) => a.metricId.localeCompare(b.metricId));

  const attribution = attributeImprovement({ history, performanceMetric: input.performanceMetric, sensitivity: input.sensitivity });
  const timeline = buildTimeline(history, input.timelineMetrics);
  const goalProgress = input.goals?.length ? buildGoalProgress({ goals: input.goals }) : { items: [] };

  return {
    version: PROGRESS_INTELLIGENCE_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    athleteId: input.athleteId ?? null,
    history: {
      analyses: history.records.length,
      firstDate: history.firstDate,
      lastDate: history.lastDate,
      trackedMetrics: history.trackedMetrics,
    },
    trends,
    plateaus,
    adaptations,
    anomalies,
    attribution,
    forecasts,
    timeline,
    goalProgress,
    provenance: {
      engineVersions: {
        history: ATHLETE_HISTORY_VERSION,
        trends: TREND_ENGINE_VERSION,
        plateau: PLATEAU_ENGINE_VERSION,
        adaptation: ADAPTATION_ENGINE_VERSION,
        anomaly: ANOMALY_ENGINE_VERSION,
        attribution: ATTRIBUTION_ENGINE_VERSION,
        forecast: FORECAST_ENGINE_VERSION,
        timeline: TIMELINE_ENGINE_VERSION,
        goals: GOALS_ENGINE_VERSION,
      },
      configVersion: PROGRESS_CONFIG_VERSION,
    },
  };
}
