/**
 * Athlete Training Focus — longitudinal synthesis of the per-session
 * recommendation engine.
 *
 * A single sprint tells a coach what to fix *today*; a training block needs to
 * know what this athlete's *persistent* limiter is. This module runs the
 * deterministic {@link buildRecommendations} engine over an athlete's recent
 * completed analyses and aggregates the results into a ranked set of focus
 * areas. Each area carries how often the limiter recurred (persistence), a
 * recency-weighted urgency, and — most usefully — whether it is getting worse
 * or improving session over session.
 *
 * Pure and deterministic: no I/O, the input array is never mutated, and the
 * same analyses always yield the same focus. Analyses whose `metrics` fail
 * validation are skipped. The all-clear "maintain progress" recommendation is
 * excluded from aggregation — it is the *absence* of a focus, not a focus.
 */

import { analysisMetricsSchema, type AnalysisMetrics } from "@/lib/biomechanics/types";

import {
  buildRecommendations,
  clampScore,
  type CoachingRecommendation,
} from "./recommendations";

/** Recommendation id returned when every metric is within target. */
const ALL_CLEAR_ID = "general";

/** Direction of a limiter across the aggregated sessions (higher score = worse). */
export type FocusTrend = "worsening" | "improving" | "steady";

/** A single recurring limiter, synthesized across an athlete's recent sprints. */
export interface FocusArea {
  /** Stable recommendation id (e.g. "step-frequency"), from the rules engine. */
  id: string;
  title: string;
  category: string;
  /** Coach-facing "what to do" copy, taken from the most recent occurrence. */
  explanation: string;
  /** Concise "why this matters", taken from the most recent occurrence. */
  rationale: string;
  /** Exercise ids (see EXERCISES / getExercise), from the most recent occurrence. */
  drills: string[];
  /** How many analyzed sessions this limiter appeared in. */
  occurrences: number;
  /** Total analyzed sessions the focus was computed over (denominator). */
  sessionsAnalyzed: number;
  /** occurrences / sessionsAnalyzed, as a rounded 0–100 percentage. */
  persistencePct: number;
  /** 0–100 recency-weighted urgency, discounted by persistence. Ranks areas. */
  focusScore: number;
  /** Confidence of the most recent occurrence, 0–100. */
  latestConfidence: number;
  /** Whether the limiter is worsening, improving, or steady over time. */
  trend: FocusTrend;
  /** Supporting metric readings from the most recent occurrence. */
  supportingMetrics: CoachingRecommendation["supportingMetrics"];
}

/** The athlete-level training focus derived from a run of recent analyses. */
export interface TrainingFocus {
  /** Number of analyses that parsed and contributed to the focus. */
  sessionsAnalyzed: number;
  /** True when at least one session was analyzed and none triggered a limiter. */
  allClear: boolean;
  /** Highest-ranked focus area, or null when there is nothing to focus on. */
  primary: FocusArea | null;
  /** All focus areas, ranked most-urgent first. */
  areas: FocusArea[];
}

/** Minimal analysis shape this helper needs. `metrics` is opaque until parsed. */
export interface FocusAnalysisInput {
  id: string;
  created_at: string;
  metrics: unknown;
}

/** Map validated analysis metrics onto the recommendation engine's keys. */
function toCoachingMetrics(data: AnalysisMetrics) {
  return {
    stepFrequency: data.strideFrequencyHz,
    groundContactTime: data.groundContactTimeMs,
    flightTime: data.flightTimeMs,
    strideLength: data.avgStrideLengthM,
  };
}

/** Mutable accumulator, one per recommendation id, collapsed into a FocusArea. */
interface Accumulator {
  occurrences: number;
  weightedScoreSum: number;
  weightSum: number;
  /** priorityScore at the earliest session this limiter appeared in. */
  firstScore: number;
  /** priorityScore at the most recent session this limiter appeared in. */
  lastScore: number;
  /** Snapshot of the most recent occurrence (drives display copy). */
  latest: CoachingRecommendation;
}

/** Classify a limiter's direction from its earliest vs. latest urgency. */
function classifyTrend(first: number, last: number, occurrences: number): FocusTrend {
  if (occurrences < 2) return "steady";
  // priorityScore rises the further a metric drifts off target, so a higher
  // latest score means the limiter is getting worse.
  if (last > first + 1) return "worsening";
  if (last < first - 1) return "improving";
  return "steady";
}

/**
 * Synthesize an athlete's training focus from their recent completed analyses.
 *
 * @param analyses Completed analyses in any order; sorted internally oldest →
 *   newest so more recent sessions carry more weight.
 */
export function buildTrainingFocus(analyses: FocusAnalysisInput[]): TrainingFocus {
  const sorted = [...analyses].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const accumulators = new Map<string, Accumulator>();
  let validSessions = 0;

  for (const analysis of sorted) {
    const parsed = analysisMetricsSchema.safeParse(analysis.metrics);
    if (!parsed.success) continue;

    validSessions += 1;
    // Linear recency weight: oldest valid session = 1, most recent = N.
    const weight = validSessions;

    for (const rec of buildRecommendations(toCoachingMetrics(parsed.data))) {
      if (rec.id === ALL_CLEAR_ID) continue;

      const existing = accumulators.get(rec.id);
      if (existing) {
        existing.occurrences += 1;
        existing.weightedScoreSum += rec.priorityScore * weight;
        existing.weightSum += weight;
        // `sorted` is chronological, so the last write wins as "latest".
        existing.lastScore = rec.priorityScore;
        existing.latest = rec;
      } else {
        accumulators.set(rec.id, {
          occurrences: 1,
          weightedScoreSum: rec.priorityScore * weight,
          weightSum: weight,
          firstScore: rec.priorityScore,
          lastScore: rec.priorityScore,
          latest: rec,
        });
      }
    }
  }

  if (validSessions === 0) {
    return { sessionsAnalyzed: 0, allClear: false, primary: null, areas: [] };
  }

  const areas: FocusArea[] = Array.from(accumulators.values()).map((acc) => {
    const persistence = acc.occurrences / validSessions;
    const meanUrgency = acc.weightedScoreSum / acc.weightSum;
    // Discount a one-off spike, reward a limiter that keeps showing up: a focus
    // present in every session keeps full urgency, a single appearance halves it.
    const focusScore = clampScore(meanUrgency * (0.5 + 0.5 * persistence));

    return {
      id: acc.latest.id,
      title: acc.latest.title,
      category: acc.latest.category,
      explanation: acc.latest.explanation,
      rationale: acc.latest.rationale,
      drills: acc.latest.drills,
      occurrences: acc.occurrences,
      sessionsAnalyzed: validSessions,
      persistencePct: clampScore(persistence * 100),
      focusScore,
      latestConfidence: acc.latest.confidence,
      trend: classifyTrend(acc.firstScore, acc.lastScore, acc.occurrences),
      supportingMetrics: acc.latest.supportingMetrics,
    };
  });

  // Rank most-urgent first; deterministic tie-breaks keep output stable.
  areas.sort(
    (a, b) =>
      b.focusScore - a.focusScore ||
      b.occurrences - a.occurrences ||
      a.id.localeCompare(b.id),
  );

  return {
    sessionsAnalyzed: validSessions,
    allClear: areas.length === 0,
    primary: areas[0] ?? null,
    areas,
  };
}
