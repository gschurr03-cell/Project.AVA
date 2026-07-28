/**
 * Progress Tracking V1 — compare an athlete's latest fly session to the previous one
 * and report which trusted metrics improved, held, or declined, and whether the metric
 * the previous session's recommendation targeted actually moved.
 *
 * Pure & deterministic: no I/O, no metric math. It only diffs per-session snapshots
 * the caller supplies. Frame-rate-limited timing (ground contact, flight, stiffness)
 * is intentionally NOT part of the tracked set, so 60 fps progress never leans on it.
 */

import type { AnalysisMetrics } from "@/lib/biomechanics/types";

export type ProgressDirection = "improved" | "unchanged" | "declined";

/** The metrics AVA tracks over time. All trusted / spatial / zone — no 60 fps timing. */
export type ProgressMetricKey =
  | "twentyMTimeS"
  | "avgVelocityMps"
  | "topSpeedMps"
  | "frequencyHz"
  | "strideLengthM"
  | "stepLengthM"
  | "performanceScore";

interface MetricDef {
  key: ProgressMetricKey;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  /** Rounding for display of the change. */
  decimals: number;
}

/** Default display order (before the latest limiter's metric is pulled to the front). */
const METRIC_DEFS: MetricDef[] = [
  { key: "twentyMTimeS", label: "20 m time", unit: "s", higherIsBetter: false, decimals: 3 },
  { key: "avgVelocityMps", label: "Average velocity", unit: "m/s", higherIsBetter: true, decimals: 2 },
  { key: "topSpeedMps", label: "Supported peak velocity", unit: "m/s", higherIsBetter: true, decimals: 2 },
  { key: "frequencyHz", label: "Step frequency", unit: "Hz", higherIsBetter: true, decimals: 2 },
  { key: "strideLengthM", label: "Stride length", unit: "m", higherIsBetter: true, decimals: 2 },
  { key: "stepLengthM", label: "Step length", unit: "m", higherIsBetter: true, decimals: 2 },
  { key: "performanceScore", label: "AVA Performance Score", unit: "", higherIsBetter: true, decimals: 0 },
];

/** Below this |percent change| a metric is treated as unchanged (within noise). */
export const UNCHANGED_BAND_PCT = 1.0;

/** Map a limiter category to the metric it targets (for highlight ordering). */
export const LIMITER_METRIC: Record<string, ProgressMetricKey> = {
  stride_length: "strideLengthM",
  frequency: "frequencyHz",
  asymmetry: "frequencyHz", // left/right rhythm — tracked via step frequency
  speed: "topSpeedMps",
  rhythm: "avgVelocityMps",
};

/** One athlete session reduced to its tracked, comparable values. */
export interface ProgressSnapshot {
  sessionId: string;
  /** ISO timestamp; used to order latest vs previous. */
  createdAt: string;
  metrics: Partial<Record<ProgressMetricKey, number | null>>;
  /** The limiter category AVA flagged for this session, if known. */
  topLimiterCategory?: string | null;
}

export interface ProgressMetricChange {
  key: ProgressMetricKey;
  label: string;
  unit: string;
  previous: number;
  latest: number;
  delta: number;
  percentChange: number;
  direction: ProgressDirection;
  higherIsBetter: boolean;
  /** True for the metric the LATEST recommendation targeted (shown first). */
  highlighted: boolean;
}

export interface ProgressReport {
  available: boolean;
  /** Set only when unavailable, e.g. "More sessions needed to track progress." */
  message?: string;
  latestSessionId?: string;
  previousSessionId?: string;
  latestDate?: string;
  previousDate?: string;
  /** Ordered changes (highlighted metric first); only metrics present in BOTH sessions. */
  metrics: ProgressMetricChange[];
  /** Did the metric the PREVIOUS session's recommendation targeted improve? null if unknown. */
  previousRecommendationImproved: boolean | null;
  /** The metric key the previous recommendation targeted, if known. */
  previousRecommendationMetric?: ProgressMetricKey | null;
  latestLimiterCategory?: string | null;
}

export const NEEDS_MORE_SESSIONS_MESSAGE = "More sessions needed to track progress.";

/** A present, finite, non-zero reading. A 0 on any tracked metric means "not measured"
 *  (uncalibrated / unavailable), never a real value — so it is not comparable. */
function usableReading(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v !== 0;
}

function directionFor(def: MetricDef, delta: number, percentChange: number): ProgressDirection {
  if (Math.abs(percentChange) < UNCHANGED_BAND_PCT) return "unchanged";
  const better = def.higherIsBetter ? delta > 0 : delta < 0;
  return better ? "improved" : "declined";
}

/**
 * Build the progress report from an athlete's session snapshots (any order). Compares
 * the two most recent. Returns `available:false` with a fallback message when there
 * are fewer than two sessions with comparable data. Pure.
 */
export function buildProgress(
  snapshots: ProgressSnapshot[],
  opts: { latestLimiterCategory?: string | null } = {},
): ProgressReport {
  const ordered = [...snapshots].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (ordered.length < 2) {
    return {
      available: false,
      message: NEEDS_MORE_SESSIONS_MESSAGE,
      metrics: [],
      previousRecommendationImproved: null,
    };
  }

  const latest = ordered[0];
  const previous = ordered[1];
  const latestLimiterCategory = opts.latestLimiterCategory ?? latest.topLimiterCategory ?? null;
  const highlightKey = latestLimiterCategory ? LIMITER_METRIC[latestLimiterCategory] : undefined;

  const changes: ProgressMetricChange[] = [];
  for (const def of METRIC_DEFS) {
    const p = previous.metrics[def.key];
    const l = latest.metrics[def.key];
    if (!usableReading(p) || !usableReading(l)) continue;
    const delta = l - p;
    const percentChange = p !== 0 ? (delta / Math.abs(p)) * 100 : 0;
    changes.push({
      key: def.key,
      label: def.label,
      unit: def.unit,
      previous: p,
      latest: l,
      delta: Number(delta.toFixed(def.decimals)),
      percentChange: Number(percentChange.toFixed(1)),
      direction: directionFor(def, delta, percentChange),
      higherIsBetter: def.higherIsBetter,
      highlighted: def.key === highlightKey,
    });
  }

  // Requirement 5 & 6: the latest recommendation's metric leads.
  changes.sort((a, b) => Number(b.highlighted) - Number(a.highlighted));

  // Requirement 4: did the metric the PREVIOUS session's recommendation targeted improve?
  const prevLimiter = previous.topLimiterCategory ?? null;
  const prevMetricKey = prevLimiter ? (LIMITER_METRIC[prevLimiter] ?? null) : null;
  const prevChange = prevMetricKey ? changes.find((c) => c.key === prevMetricKey) : undefined;
  const previousRecommendationImproved = prevChange ? prevChange.direction === "improved" : null;

  if (changes.length === 0) {
    return {
      available: false,
      message: NEEDS_MORE_SESSIONS_MESSAGE,
      metrics: [],
      previousRecommendationImproved: null,
    };
  }

  return {
    available: true,
    latestSessionId: latest.sessionId,
    previousSessionId: previous.sessionId,
    latestDate: latest.createdAt,
    previousDate: previous.createdAt,
    metrics: changes,
    previousRecommendationImproved,
    previousRecommendationMetric: prevMetricKey,
    latestLimiterCategory,
  };
}

/**
 * Reduce a stored fly `AnalysisMetrics` to a progress snapshot. Only the trusted,
 * 60 fps-safe fields are carried; ground contact / flight time are deliberately
 * excluded (requirement 8). `topSpeedMps` / `avgStrideLengthM` of exactly 0 mean
 * "uncalibrated" and are dropped rather than tracked as a real reading.
 */
/** Elite benchmarks — mirror the recommendation engine so a session's inferred
 *  limiter agrees with what AVA would have recommended. */
const STRIDE_ELITE = 2.45;
const FREQ_ELITE = 4.8;

/**
 * Infer the session's top limiter (stride length vs frequency) from its stored
 * metrics — the larger fractional deficit wins. Lets progress judge whether the
 * PREVIOUS session's recommendation improved without persisting the limiter. Returns
 * null when nothing is meaningfully below target. Never uses 60 fps timing.
 */
export function inferLimiterCategory(metrics: AnalysisMetrics): string | null {
  const stride = metrics.avgStrideLengthM;
  const freq = metrics.strideFrequencyHz;
  const strideDef = stride > 0 && stride < STRIDE_ELITE ? (STRIDE_ELITE - stride) / STRIDE_ELITE : 0;
  const freqDef = freq > 0 && freq < FREQ_ELITE ? (FREQ_ELITE - freq) / FREQ_ELITE : 0;
  if (strideDef === 0 && freqDef === 0) return null;
  return strideDef >= freqDef ? "stride_length" : "frequency";
}

export function snapshotFromAnalysisMetrics(
  sessionId: string,
  createdAt: string,
  metrics: AnalysisMetrics,
  extra?: { topLimiterCategory?: string | null; performanceScore?: number | null },
): ProgressSnapshot {
  return {
    sessionId,
    createdAt,
    topLimiterCategory: extra?.topLimiterCategory ?? inferLimiterCategory(metrics),
    metrics: {
      frequencyHz: metrics.strideFrequencyHz > 0 ? metrics.strideFrequencyHz : null,
      strideLengthM: metrics.avgStrideLengthM > 0 ? metrics.avgStrideLengthM : null,
      topSpeedMps: metrics.topSpeedMps > 0 ? metrics.topSpeedMps : null,
      performanceScore: extra?.performanceScore ?? null,
      // 20 m time, average velocity, and step length are not part of the stored
      // AnalysisMetrics; they populate once a session-level trusted snapshot is
      // persisted. Ground contact / flight time are excluded on purpose (60 fps).
    },
  };
}
