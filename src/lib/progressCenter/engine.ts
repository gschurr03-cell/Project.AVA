import { accelerationMetricsSchema } from "@/lib/acceleration/schema";
import { persistedAnalysisMetricsSchema } from "@/lib/biomechanics/types";
import { calculateMetricConfidence } from "@/lib/confidence";
import { evaluateMetric } from "@/lib/coaching/evaluation";

export const PROGRESS_CENTER_VERSION = "ava-progress-center-v1" as const;

export type HistoricalMetricKey =
  | "peakVelocity"
  | "averageVelocity"
  | "acceleration"
  | "groundContact"
  | "flightTime"
  | "strideLength"
  | "stepFrequency"
  | "cadence"
  | "asymmetry"
  | "priorityScore"
  | "recordingQuality"
  | "confidence";

export type TrendDirection = "improving" | "stable" | "declining" | "insufficient";
export type ComparisonDirection = "improved" | "unchanged" | "declined";

export interface ProgressAnalysisInput {
  id: string;
  sessionId: string;
  sessionName: string;
  sessionCreatedAt: string;
  recordedAt?: string | null;
  analysisCreatedAt: string;
  completedAt?: string | null;
  status: string;
  metrics: unknown;
  analysisFps?: number | null;
  sourceFps?: number | null;
  calibrationPresent: boolean;
  analysisType?: "fly" | "acceleration" | null;
  isCurrentWorking?: boolean | null;
  versionNumber?: number | null;
  recordingMode?: string | null;
}

export interface HistoricalMetricValue {
  value: number;
  unit: string;
  source: "stored" | "derived";
}

export interface HistoricalPoint {
  analysisId: string;
  sessionId: string;
  sessionName: string;
  date: string;
  conditions: string[];
  analysisType: "fly" | "acceleration" | null;
  metrics: Partial<Record<HistoricalMetricKey, HistoricalMetricValue>>;
  limiter: { key: string; label: string; priorityScore: number; status: "High" | "Medium" | "Resolved" } | null;
}

export interface MetricTrend {
  key: HistoricalMetricKey;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  points: Array<{ date: string; value: number; analysisId: string; sessionId: string; sessionName: string }>;
  direction: TrendDirection;
  changePct: number;
  summary: string;
  personalBest: HistoricalPoint | null;
  seasonBest: HistoricalPoint | null;
  recentBest: HistoricalPoint | null;
}

export interface ProgressComparison {
  left: HistoricalPoint;
  right: HistoricalPoint;
  metrics: Array<{
    key: HistoricalMetricKey;
    label: string;
    unit: string;
    left: number;
    right: number;
    delta: number;
    percentChange: number;
    direction: ComparisonDirection;
  }>;
  intelligenceDifference: string;
  confidenceDifference: number | null;
  recordingDifference: number | null;
}

export interface ProgressCenterReport {
  version: typeof PROGRESS_CENTER_VERSION;
  points: HistoricalPoint[];
  trends: MetricTrend[];
  insights: string[];
  currentPbs: MetricTrend[];
  recentImprovements: MetricTrend[];
  improving: MetricTrend[];
  regressing: MetricTrend[];
  highestPriorityLimiter: HistoricalPoint["limiter"];
  currentConfidence: number | null;
  latestRecordingQuality: number | null;
  limiterEvolution: Array<{ key: string; label: string; points: Array<{ date: string; score: number; status: string }> }>;
}

const DEFS: Record<HistoricalMetricKey, { label: string; unit: string; higherIsBetter: boolean }> = {
  peakVelocity: { label: "Peak velocity", unit: "m/s", higherIsBetter: true },
  averageVelocity: { label: "Average velocity", unit: "m/s", higherIsBetter: true },
  acceleration: { label: "Acceleration", unit: "m/s²", higherIsBetter: true },
  groundContact: { label: "Ground contact", unit: "ms", higherIsBetter: false },
  flightTime: { label: "Flight time", unit: "ms", higherIsBetter: true },
  strideLength: { label: "Stride length", unit: "m", higherIsBetter: true },
  stepFrequency: { label: "Step frequency", unit: "Hz", higherIsBetter: true },
  cadence: { label: "Cadence", unit: "Hz", higherIsBetter: true },
  asymmetry: { label: "Asymmetry", unit: "%", higherIsBetter: false },
  priorityScore: { label: "Sprint Intelligence priority", unit: "/100", higherIsBetter: false },
  recordingQuality: { label: "Recording quality", unit: "/100", higherIsBetter: true },
  confidence: { label: "Measurement confidence", unit: "%", higherIsBetter: true },
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const metric = (value: unknown, unit: string, source: HistoricalMetricValue["source"] = "stored") =>
  finite(value) && value !== 0 ? { value, unit, source } : undefined;

function qualityFromMetadata(row: ProgressAnalysisInput): number {
  const fps = row.analysisFps ?? row.sourceFps;
  const fpsScore = fps == null ? 60 : fps >= 120 ? 100 : fps >= 59 ? 85 : fps >= 30 ? 60 : 30;
  const calibrationScore = row.calibrationPresent ? 100 : row.analysisType === "acceleration" ? 75 : 45;
  return Math.round(fpsScore * 0.55 + calibrationScore * 0.45);
}

function confidenceFor(row: ProgressAnalysisInput, metricId: Parameters<typeof calculateMetricConfidence>[0]): number {
  const fps = row.analysisFps ?? row.sourceFps;
  return calculateMetricConfidence(metricId, {
    calibrationCertainty: row.calibrationPresent ? 0.92 : 0,
    frameTimingStability: fps == null ? null : fps >= 120 ? 0.98 : fps >= 59 ? 0.82 : fps >= 30 ? 0.58 : 0.3,
    trackingContinuity: null,
    poseVisibility: null,
    eventDetectionConfidence: null,
    sampleSufficiency: null,
    cameraMotionStability: row.recordingMode?.includes("static") ? 0.95 : null,
    fps,
  }).score;
}

function limiterFor(metrics: HistoricalPoint["metrics"], confidence: number): HistoricalPoint["limiter"] {
  const candidates = [
    { key: "groundContact", id: "groundContactTime", label: "Ground contact", value: metrics.groundContact?.value, weight: 100 },
    { key: "strideLength", id: "strideLength", label: "Stride length", value: metrics.strideLength?.value, weight: 100 },
    { key: "frequency", id: "stepFrequency", label: "Frequency", value: metrics.stepFrequency?.value, weight: 80 },
    { key: "projection", id: "flightTime", label: "Projection", value: metrics.flightTime?.value, weight: 60 },
  ].flatMap((candidate) => {
    const evaluation = evaluateMetric(candidate.id, candidate.value);
    if (!evaluation || !["watch", "poor"].includes(evaluation.status)) return [];
    const impact = evaluation.status === "poor" ? candidate.weight : candidate.weight * 0.6;
    return [{ ...candidate, score: Math.round(impact * confidence / 100) }];
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const first = candidates[0];
  return first ? { key: first.key, label: first.label, priorityScore: first.score, status: first.score >= 70 ? "High" : "Medium" } : null;
}

function toPoint(row: ProgressAnalysisInput): HistoricalPoint | null {
  if (row.status !== "complete") return null;
  const metrics: HistoricalPoint["metrics"] = {};
  const fly = persistedAnalysisMetricsSchema.safeParse(row.metrics);
  const acceleration = accelerationMetricsSchema.safeParse(row.metrics);
  let primaryConfidence = 0;
  if (fly.success) {
    const value = fly.data;
    metrics.peakVelocity = metric(value.topSpeedMps, "m/s");
    metrics.strideLength = metric(value.avgStrideLengthM, "m");
    metrics.stepFrequency = metric(value.strideFrequencyHz, "Hz");
    metrics.cadence = metric(value.strideFrequencyHz, "Hz");
    metrics.groundContact = metric(value.groundContactTimeMs, "ms");
    metrics.flightTime = metric(value.flightTimeMs, "ms");
    primaryConfidence = confidenceFor(row, "sprint_intelligence");
  } else if (acceleration.success) {
    const value = acceleration.data;
    metrics.peakVelocity = metric(value.peakVelocity, "m/s");
    metrics.averageVelocity = metric(value.averageVelocityMps, "m/s");
    metrics.acceleration = metric(value.earlyAccelerationMps2, "m/s²");
    metrics.strideLength = metric(value.strideMetrics.averageStrideLengthM, "m");
    primaryConfidence = confidenceFor(row, "acceleration");
  } else return null;
  const recordingQuality = qualityFromMetadata(row);
  metrics.recordingQuality = { value: recordingQuality, unit: "/100", source: "derived" };
  metrics.confidence = { value: primaryConfidence, unit: "%", source: "derived" };
  const limiter = limiterFor(metrics, primaryConfidence);
  if (limiter) metrics.priorityScore = { value: limiter.priorityScore, unit: "/100", source: "derived" };
  return {
    analysisId: row.id,
    sessionId: row.sessionId,
    sessionName: row.sessionName,
    date: row.completedAt ?? row.analysisCreatedAt ?? row.sessionCreatedAt,
    conditions: [
      `${Math.round(row.analysisFps ?? row.sourceFps ?? 0) || "Unknown"} FPS`,
      row.calibrationPresent ? "Calibrated" : "Uncalibrated",
      row.recordingMode ?? "Recording mode unavailable",
    ],
    analysisType: row.analysisType ?? null,
    metrics,
    limiter,
  };
}

function direction(values: number[], higherIsBetter: boolean): { direction: TrendDirection; changePct: number } {
  if (values.length < 2) return { direction: "insufficient", changePct: 0 };
  const changePct = (values.at(-1)! - values[0]) / Math.abs(values[0]) * 100;
  if (Math.abs(changePct) < 1) return { direction: "stable", changePct };
  const better = higherIsBetter ? changePct > 0 : changePct < 0;
  return { direction: better ? "improving" : "declining", changePct };
}

function bestPoint(points: HistoricalPoint[], key: HistoricalMetricKey, higher: boolean): HistoricalPoint | null {
  return points.reduce<HistoricalPoint | null>((best, point) => {
    const value = point.metrics[key]?.value;
    if (value == null) return best;
    const bestValue = best?.metrics[key]?.value;
    return bestValue == null || (higher ? value > bestValue : value < bestValue) ? point : best;
  }, null);
}

export function buildProgressCenter(inputs: ProgressAnalysisInput[], now = new Date()): ProgressCenterReport {
  const bySession = new Map<string, ProgressAnalysisInput>();
  for (const row of inputs) {
    const existing = bySession.get(row.sessionId);
    if (!existing || row.isCurrentWorking || new Date(row.analysisCreatedAt) > new Date(existing.analysisCreatedAt))
      bySession.set(row.sessionId, row);
  }
  const points = [...bySession.values()].map(toPoint).filter((point): point is HistoricalPoint => !!point)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const seasonStart = new Date(now.getFullYear(), 0, 1).getTime();
  const recentStart = now.getTime() - 30 * 86_400_000;
  const trends = (Object.keys(DEFS) as HistoricalMetricKey[]).flatMap((key) => {
    const def = DEFS[key];
    const series = points.flatMap((point) => point.metrics[key] ? [{
      date: point.date, value: point.metrics[key]!.value, analysisId: point.analysisId,
      sessionId: point.sessionId, sessionName: point.sessionName,
    }] : []);
    if (!series.length) return [];
    const signal = direction(series.map((item) => item.value), def.higherIsBetter);
    const personalBest = bestPoint(points, key, def.higherIsBetter);
    const seasonBest = bestPoint(points.filter((p) => new Date(p.date).getTime() >= seasonStart), key, def.higherIsBetter);
    const recentBest = bestPoint(points.filter((p) => new Date(p.date).getTime() >= recentStart), key, def.higherIsBetter);
    return [{
      key, ...def, points: series, ...signal, personalBest, seasonBest, recentBest,
      summary: signal.direction === "insufficient"
        ? `${def.label} needs another comparable session.`
        : `${def.label} is ${signal.direction}; ${Math.abs(signal.changePct).toFixed(1)}% ${signal.changePct >= 0 ? "higher" : "lower"} across ${series.length} measured sessions.`,
    }];
  });
  const latest = points.at(-1) ?? null;
  const limiterKeys = [...new Set(points.flatMap((point) => point.limiter?.key ? [point.limiter.key] : []))];
  return {
    version: PROGRESS_CENTER_VERSION,
    points,
    trends,
    insights: trends.filter((trend) => trend.points.length >= 2).map((trend) => trend.summary),
    currentPbs: trends.filter((trend) => trend.personalBest?.analysisId === latest?.analysisId),
    recentImprovements: trends.filter((trend) => trend.direction === "improving").slice(0, 4),
    improving: trends.filter((trend) => trend.direction === "improving"),
    regressing: trends.filter((trend) => trend.direction === "declining"),
    highestPriorityLimiter: latest?.limiter ?? null,
    currentConfidence: latest?.metrics.confidence?.value ?? null,
    latestRecordingQuality: latest?.metrics.recordingQuality?.value ?? null,
    limiterEvolution: limiterKeys.map((key) => ({
      key,
      label: points.find((point) => point.limiter?.key === key)?.limiter?.label ?? key,
      points: points.map((point) => point.limiter?.key === key
        ? { date: point.date, score: point.limiter.priorityScore, status: point.limiter.status }
        : { date: point.date, score: 0, status: "Resolved" }),
    })),
  };
}

export function compareProgressPoints(left: HistoricalPoint, right: HistoricalPoint): ProgressComparison {
  const metrics = (Object.keys(DEFS) as HistoricalMetricKey[]).flatMap((key) => {
    const a = left.metrics[key]?.value;
    const b = right.metrics[key]?.value;
    if (a == null || b == null) return [];
    const def = DEFS[key];
    const delta = b - a;
    const percentChange = a === 0 ? 0 : delta / Math.abs(a) * 100;
    const changed = Math.abs(percentChange) >= 1;
    const improved = def.higherIsBetter ? delta > 0 : delta < 0;
    return [{ key, label: def.label, unit: def.unit, left: a, right: b, delta,
      percentChange, direction: !changed ? "unchanged" as const : improved ? "improved" as const : "declined" as const }];
  });
  const leftLimiter = left.limiter?.label ?? "Resolved";
  const rightLimiter = right.limiter?.label ?? "Resolved";
  return {
    left, right, metrics,
    intelligenceDifference: leftLimiter === rightLimiter ? `${rightLimiter} remains the highest-priority state.` : `${leftLimiter} → ${rightLimiter}`,
    confidenceDifference: left.metrics.confidence && right.metrics.confidence ? right.metrics.confidence.value - left.metrics.confidence.value : null,
    recordingDifference: left.metrics.recordingQuality && right.metrics.recordingQuality ? right.metrics.recordingQuality.value - left.metrics.recordingQuality.value : null,
  };
}

