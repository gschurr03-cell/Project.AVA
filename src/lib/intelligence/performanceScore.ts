/**
 * AVA Performance Score (Day 84) — a single, TRUSTED-ONLY 0–100 sprint score.
 *
 * Replaces the legacy "Technique Score", which was built on not-yet-trusted temporal
 * metrics (ground contact, flight time) and the raw worker frequency. This score uses
 * ONLY trusted outputs and deliberately has no input for ground contact / flight time
 * / raw strideFrequencyHz — they cannot influence it.
 *
 * Model v1 is intentionally simple and transparent: each trusted metric maps to a
 * 0–100 subscore via documented anchor points, then a weighted average (renormalized
 * over the metrics actually present) gives the final score.
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

export interface AvaPerformanceScoreInput {
  topSpeedMps: number | null;
  avgVelocityMps: number | null;
  frequencyHz: number | null;
  avgStrideLengthM: number | null;
  peakStrideLengthM: number | null;
  strideRetentionPct: number | null;
  trochanterHeightM: number | null;
  /** Optional 0–100 recording-quality score; excluded from the average when absent. */
  recordingQualityScore?: number | null;
}

export interface AvaPerformanceScoreComponent {
  name: string;
  /** The trusted value scored (m/s, Hz, ratio ×, %, or quality points). */
  value: number | null;
  /** 0–100 subscore. */
  score: number;
  /** Weight fraction (0–1) as applied after renormalization. */
  weight: number;
  explanation: string;
}

export interface AvaPerformanceScoreResult {
  available: boolean;
  /** 0–100, or null when there isn't enough trusted data. */
  score: number | null;
  label: string | null;
  components: AvaPerformanceScoreComponent[];
  /** Always true — this score can only ever use trusted metrics. */
  trustedOnly: true;
  /** Present when unavailable: why. */
  note?: string;
}

/** Base weights (sum = 1.0). Renormalized over the metrics that are present. */
const WEIGHTS = {
  topSpeed: 0.25,
  avgVelocity: 0.2,
  frequency: 0.15,
  peakStride: 0.2,
  retention: 0.1,
  recordingQuality: 0.1,
} as const;

const clamp100 = (v: number): number => Math.max(0, Math.min(100, v));

/** Piecewise-linear map from a value to a 0–100 subscore using ascending anchors. */
function interp(value: number, anchors: [number, number][]): number {
  if (value <= anchors[0][0]) return clamp100(anchors[0][1]);
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return clamp100(last[1]);
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (value <= x1) return clamp100(y0 + ((value - x0) / (x1 - x0)) * (y1 - y0));
  }
  return clamp100(last[1]);
}

// Anchor tables (value → subscore). Documented, hand-tunable — the whole "model".
const TOP_SPEED_ANCHORS: [number, number][] = [
  [6.5, 0], [8.0, 30], [9.4, 55], [10.2, 70], [10.8, 85], [11.5, 100],
];
const AVG_VELOCITY_ANCHORS: [number, number][] = [
  [6.5, 0], [8.0, 30], [9.5, 55], [10.0, 70], [10.4, 85], [10.9, 100],
];
// Frequency (Hz): watch 4.2, good 4.5, elite 4.8–5.2 (shared coaching thresholds).
const FREQUENCY_ANCHORS: [number, number][] = [
  [3.6, 10], [4.2, 45], [4.5, 65], [4.8, 90], [5.0, 100],
];
// Trochanter ratio: <2.00 low, 2.00–2.20 decent, 2.30 strong, 2.50+ elite.
const TROCHANTER_RATIO_ANCHORS: [number, number][] = [
  [1.8, 25], [2.0, 55], [2.2, 70], [2.3, 82], [2.5, 100],
];
// Generic peak stride length (m) fallback when leg length is unknown.
const PEAK_STRIDE_ANCHORS: [number, number][] = [
  [1.9, 25], [2.1, 55], [2.3, 72], [2.45, 88], [2.65, 100],
];
// Stride retention (%) — avg ÷ peak.
const RETENTION_ANCHORS: [number, number][] = [
  [75, 30], [85, 60], [90, 78], [95, 92], [98, 100],
];

function labelFor(score: number): string {
  if (score >= 90) return "Elite";
  if (score >= 80) return "High";
  if (score >= 70) return "Solid";
  if (score >= 60) return "Developing";
  return "Needs Work";
}

/**
 * Compute the AVA Performance Score from trusted metrics only. Requires top speed,
 * average velocity, frequency, and peak stride length; without those it returns
 * `available: false` (never a fake 0). Retention and recording quality are optional
 * and are excluded from the weighted average (with renormalization) when absent.
 */
export function calculateAvaPerformanceScore(
  input: AvaPerformanceScoreInput,
): AvaPerformanceScoreResult {
  const { topSpeedMps, avgVelocityMps, frequencyHz, peakStrideLengthM } = input;

  // Required trusted inputs. Missing any → not enough trusted data.
  if (topSpeedMps == null || avgVelocityMps == null || frequencyHz == null || peakStrideLengthM == null) {
    return {
      available: false,
      score: null,
      label: null,
      components: [],
      trustedOnly: true,
      note: "Not enough trusted data — a calibrated run with top speed, velocity, frequency, and peak stride length is required.",
    };
  }

  const raw: { name: string; value: number; score: number; weight: number; explanation: string }[] = [];

  raw.push({
    name: "Top Speed",
    value: topSpeedMps,
    score: interp(topSpeedMps, TOP_SPEED_ANCHORS),
    weight: WEIGHTS.topSpeed,
    explanation: "Peak single-stride velocity — the ceiling everything else builds toward.",
  });
  raw.push({
    name: "Average Velocity",
    value: avgVelocityMps,
    score: interp(avgVelocityMps, AVG_VELOCITY_ANCHORS),
    weight: WEIGHTS.avgVelocity,
    explanation: "Zone distance ÷ time — how much of top speed is expressed across the run.",
  });
  raw.push({
    name: "Frequency",
    value: frequencyHz,
    score: interp(frequencyHz, FREQUENCY_ANCHORS),
    weight: WEIGHTS.frequency,
    explanation: "Trusted calibrated step frequency (Hz). Elite turnover is 4.8–5.2 Hz.",
  });

  // Peak stride length: score by TROCHANTER RATIO when trochanter height is known, else by a
  // generic peak-stride-length band.
  if (input.trochanterHeightM != null && input.trochanterHeightM > 0) {
    const ratio = peakStrideLengthM / input.trochanterHeightM;
    raw.push({
      name: "Peak Stride (trochanter ratio)",
      value: Number(ratio.toFixed(2)),
      score: interp(ratio, TROCHANTER_RATIO_ANCHORS),
      weight: WEIGHTS.peakStride,
      explanation: `Peak stride ${peakStrideLengthM.toFixed(2)} m = ${ratio.toFixed(2)}× trochanter length. Elite is 2.50×+.`,
    });
  } else {
    raw.push({
      name: "Peak Stride Length",
      value: peakStrideLengthM,
      score: interp(peakStrideLengthM, PEAK_STRIDE_ANCHORS),
      weight: WEIGHTS.peakStride,
      explanation: "Best-4 stride length (m). Add trochanter height to score by body proportion.",
    });
  }

  // Optional: stride retention.
  if (input.strideRetentionPct != null) {
    raw.push({
      name: "Stride Retention",
      value: Number(input.strideRetentionPct.toFixed(1)),
      score: interp(input.strideRetentionPct, RETENTION_ANCHORS),
      weight: WEIGHTS.retention,
      explanation: "Average ÷ peak stride — how well the best strides are held across the zone.",
    });
  }

  // Optional: recording quality (already 0–100).
  if (input.recordingQualityScore != null) {
    raw.push({
      name: "Recording Quality",
      value: Number(input.recordingQualityScore.toFixed(0)),
      score: clamp100(input.recordingQualityScore),
      weight: WEIGHTS.recordingQuality,
      explanation: "How well the capture supports trusted measurement.",
    });
  }

  // Weighted average, renormalized over the components actually present.
  const totalWeight = raw.reduce((s, c) => s + c.weight, 0);
  const score = clamp100(raw.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);

  const components: AvaPerformanceScoreComponent[] = raw.map((c) => ({
    name: c.name,
    value: c.value,
    score: Math.round(c.score),
    weight: Number((c.weight / totalWeight).toFixed(3)),
    explanation: c.explanation,
  }));

  return {
    available: true,
    score: Math.round(score),
    label: labelFor(score),
    components,
    trustedOnly: true,
  };
}
