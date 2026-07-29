import {
  type Limiter,
  type LimiterImpact,
  type LimitingFactorsInput,
  type LimitingFactorsResult,
  type Direction,
} from "./types";
import { ASYMMETRY_BANDS, MIN_SIDE_SAMPLES, MIN_VALID_STEPS } from "./thresholds";
import {
  clamp01,
  confidenceLabel,
  impactLevel,
  measurementConfidenceBase,
  overallConfidence,
  CONFIDENCE_LABEL_TEXT,
} from "./scoring";
import {
  stepFrequencyAsymmetryRecommendations,
  stepLengthAsymmetryRecommendations,
} from "./recommendations";

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const meanRelPct = (l: number, r: number) => (Math.abs(l - r) / ((l + r) / 2)) * 100;

/** Map an asymmetry percentage to an impact level + normalized score (magnitude-driven). */
function asymmetryImpact(pct: number): { level: LimiterImpact; score: number } {
  const score = clamp01(pct / 12); // 12% ≈ full impact
  return { level: impactLevel(score), score };
}

const ASYMMETRY_DISCLAIMER =
  "Sprint footage alone cannot determine whether strength, tissue capacity, mobility, or muscular function is the cause. Additional physical testing would be required.";

/** Shared asymmetry detector for a per-side pair (step length or step frequency). */
function detectAsymmetry(
  input: LimitingFactorsInput,
  opts: {
    type: "step_length_asymmetry" | "step_frequency_asymmetry";
    metricLabel: string;
    unit: string;
    left: number | null;
    right: number | null;
    leftSamples: number;
    rightSamples: number;
    technical: string[];
    physicalCategory: string;
    physicalMuscles: string[];
    recommend: (d: Direction) => Limiter["recommendations"];
  },
): Limiter | null {
  const { left, right, leftSamples, rightSamples } = opts;
  const base: Limiter = {
    id: opts.type,
    type: opts.type,
    status: "detected",
    rank: 0,
    title: "",
    summary: "",
    impact: { level: "negligible", score: 0, explanation: "" },
    confidence: { measurement: null, reasoning: null, overall: null, label: "insufficient", explanation: "" },
    measuredValues: [],
    target: {
      type: "research_reference",
      unit: "%",
      sourceLabel: "Provisional within-athlete symmetry band",
      explanation: "Balanced ≤3%; low 3–6%; moderate 6–10%; high >10% (provisional, pending validation).",
    },
    deviation: {},
    evidence: [],
    reasoning: [],
    possibleTechnicalAssociations: [],
    possiblePhysicalAssociations: [],
    recommendations: [],
    dataQualityWarnings: [],
  };

  // Insufficient side-specific data → architecture present, no fabricated values.
  if (left == null || right == null) {
    return { ...base, status: "insufficient_data", title: `${opts.metricLabel} asymmetry`, summary: `Side-specific ${opts.metricLabel.toLowerCase()} values are not available for this session.` };
  }
  if (leftSamples < MIN_SIDE_SAMPLES.value || rightSamples < MIN_SIDE_SAMPLES.value) {
    return {
      ...base,
      status: "insufficient_data",
      title: `${opts.metricLabel} asymmetry`,
      summary: `Too few valid steps per side to compare sides (left ${leftSamples}, right ${rightSamples}; ${MIN_SIDE_SAMPLES.value} required each).`,
      dataQualityWarnings: [`Side samples below the minimum of ${MIN_SIDE_SAMPLES.value} per side.`],
    };
  }

  const pct = meanRelPct(left, right);
  const absolute = round(Math.abs(left - right), 3);
  const direction: Direction = left > right ? "left_higher" : right > left ? "right_higher" : null;
  const higher = left >= right ? "Left" : "Right";
  const lower = left >= right ? "right" : "left";

  // Balanced → not a meaningful limiter (do not create a card to fill the page).
  if (pct < ASYMMETRY_BANDS.negligiblePct.value) {
    return {
      ...base,
      status: "not_detected",
      title: `${opts.metricLabel} symmetry`,
      summary: `Left and right ${opts.metricLabel.toLowerCase()} were balanced (${round(pct, 1)}% difference).`,
    };
  }

  const impact = asymmetryImpact(pct);
  // Measurement confidence: base engine confidence, downweighted for calibration + side balance.
  const sideBalance = Math.min(leftSamples, rightSamples) / Math.max(leftSamples, rightSamples);
  const measurement = clamp01(
    measurementConfidenceBase(input.measurementConfidence) *
      (input.calibrationConfirmed ? 1 : 0.7) *
      (0.7 + 0.3 * sideBalance),
  );
  // Reasoning confidence: larger, clearer differences with more samples support the reading.
  const reasoning = clamp01(0.45 + Math.min(0.35, pct / 30) + Math.min(0.2, (leftSamples + rightSamples) / 40));
  const overall = overallConfidence(measurement, reasoning);

  const isLength = opts.type === "step_length_asymmetry";
  return {
    ...base,
    status: "detected",
    title: `${higher === "Left" ? "Right" : "Left"}-side ${isLength ? "step-length" : "step-frequency"} reduction`,
    summary: `${higher} ${opts.metricLabel.toLowerCase()} averaged higher than the ${lower} side across the valid measured ${isLength ? "steps" : "intervals"} (${round(pct, 1)}% difference).`,
    impact: {
      level: impact.level,
      score: impact.score,
      explanation: `A ${round(pct, 1)}% side-to-side difference falls in the ${impact.level.replace("_", " ")} band.`,
    },
    confidence: {
      measurement,
      reasoning,
      overall,
      label: confidenceLabel(overall),
      explanation: `Measurement ${CONFIDENCE_LABEL_TEXT[confidenceLabel(measurement)]} (pose/calibration + ${leftSamples + rightSamples} side samples); reasoning ${CONFIDENCE_LABEL_TEXT[confidenceLabel(reasoning)]} (difference size + sample count). Overall is the conservative aggregate.`,
    },
    measuredValues: [
      { label: `Left ${opts.metricLabel.toLowerCase()}`, value: round(left, 3), unit: opts.unit, detail: `${leftSamples} samples` },
      { label: `Right ${opts.metricLabel.toLowerCase()}`, value: round(right, 3), unit: opts.unit, detail: `${rightSamples} samples` },
    ],
    deviation: { absolute, percentage: round(pct, 1), direction },
    evidence: [
      { label: `Left ${opts.metricLabel.toLowerCase()}`, value: `${round(left, 3)} ${opts.unit} (${leftSamples} samples)`, kind: "measurement" },
      { label: `Right ${opts.metricLabel.toLowerCase()}`, value: `${round(right, 3)} ${opts.unit} (${rightSamples} samples)`, kind: "measurement" },
      { label: "Absolute difference", value: `${absolute} ${opts.unit}`, kind: "comparison" },
      { label: "Asymmetry", value: `${round(pct, 1)}%`, kind: "comparison" },
    ],
    reasoning: [
      `${higher} side produced ${isLength ? "more horizontal displacement per step" : "faster turnover"} than the ${lower} side.`,
      "This is a within-athlete comparison and does not depend on an external target model.",
    ],
    possibleTechnicalAssociations: opts.technical,
    possiblePhysicalAssociations: [
      { category: opts.physicalCategory, muscleGroups: opts.physicalMuscles, disclaimer: ASYMMETRY_DISCLAIMER },
    ],
    recommendations: opts.recommend(direction),
    dataQualityWarnings: sideBalance < 0.5 ? ["Uneven number of samples between sides — interpret the difference cautiously."] : [],
  };
}

function detectStepLengthAsymmetry(input: LimitingFactorsInput): Limiter | null {
  const m = input.metrics;
  return detectAsymmetry(input, {
    type: "step_length_asymmetry",
    metricLabel: "Step length",
    unit: "m",
    left: m.leftStepLengthM,
    right: m.rightStepLengthM,
    leftSamples: m.leftStepSampleCount,
    rightSamples: m.rightStepSampleCount,
    technical: [
      "side-to-side touchdown position relative to the hips",
      "recovery timing",
      "pelvic control",
      "confidence in ground contact",
    ],
    physicalCategory: "Unilateral horizontal-force expression",
    physicalMuscles: ["hamstrings", "gluteus maximus", "calf–Achilles complex", "hip flexors"],
    recommend: stepLengthAsymmetryRecommendations,
  });
}

function detectStepFrequencyAsymmetry(input: LimitingFactorsInput): Limiter | null {
  const m = input.metrics;
  // Side frequency reuses the per-side step samples as its interval-count proxy.
  return detectAsymmetry(input, {
    type: "step_frequency_asymmetry",
    metricLabel: "Step frequency",
    unit: "Hz",
    left: m.leftStepFrequencyHz,
    right: m.rightStepFrequencyHz,
    leftSamples: m.leftStepSampleCount,
    rightSamples: m.rightStepSampleCount,
    technical: ["leg recovery timing", "re-plant timing", "ground-contact duration"],
    physicalCategory: "Recovery timing / reactive qualities",
    physicalMuscles: ["hip flexors", "hamstrings", "calf–Achilles complex"],
    recommend: stepFrequencyAsymmetryRecommendations,
  });
}

/**
 * Expectation-based limiters (step length / frequency below or above an INDIVIDUALIZED
 * expectation, and velocity-limitation classification) require a validated per-athlete
 * target model that AVA does not have yet. Rather than invent a threshold, we report which
 * models are unavailable so the UI can say so honestly.
 * TODO(science): implement validated individualized expectation models (height / leg-length /
 * velocity / sprint-context aware) before these become ranked findings.
 */
function unavailableExpectationModels(input: LimitingFactorsInput): string[] {
  const notes = [
    "Individualized step-length expectation",
    "Individualized step-frequency expectation",
    "Velocity-limitation classification (needs an expectation model)",
  ];
  if (!input.athlete?.heightCm && !input.athlete?.legLengthCm && !input.athlete?.trochanterHeightM) {
    notes.push("Athlete height / leg-length profile (not on file)");
  }
  return notes;
}

function rankLimiters(limiters: Limiter[]): Limiter[] {
  // Deterministic: impact score desc, then overall confidence desc, then stable type order.
  const typeOrder: Record<string, number> = { step_length_asymmetry: 0, step_frequency_asymmetry: 1 };
  return [...limiters]
    .sort((a, b) => {
      if (b.impact.score !== a.impact.score) return b.impact.score - a.impact.score;
      const ca = a.confidence.overall ?? 0;
      const cb = b.confidence.overall ?? 0;
      if (cb !== ca) return cb - ca;
      return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
    })
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

function primaryConstraintSentence(ranked: Limiter[]): string | null {
  const top = ranked[0];
  if (!top) return null;
  if (top.type === "step_length_asymmetry")
    return `A left–right step-length difference (${top.deviation.percentage}%) is the strongest identifiable pattern in this session.`;
  if (top.type === "step_frequency_asymmetry")
    return `A left–right step-frequency difference (${top.deviation.percentage}%) is the strongest identifiable pattern in this session.`;
  return top.summary;
}

/** Build the deterministic limiting-factors result from the normalized input. */
export function buildLimitingFactors(input: LimitingFactorsInput): LimitingFactorsResult {
  const base: Omit<LimitingFactorsResult, "status" | "limiters" | "primaryConstraint" | "meaningfulCount" | "overallDataQuality"> = {
    zoneDistanceM: input.zoneDistanceM,
    sessionDate: input.sessionDate,
    unavailableModels: unavailableExpectationModels(input),
  };

  if (!input.calibrationConfirmed) {
    return { ...base, status: "calibration_missing", limiters: [], primaryConstraint: null, meaningfulCount: 0, overallDataQuality: "insufficient" };
  }
  if (!input.spatialAvailable || (input.metrics.validStepCount ?? 0) < MIN_VALID_STEPS.value) {
    return { ...base, status: "insufficient_data", limiters: [], primaryConstraint: null, meaningfulCount: 0, overallDataQuality: "insufficient" };
  }

  const candidates = [detectStepLengthAsymmetry(input), detectStepFrequencyAsymmetry(input)].filter(
    (l): l is Limiter => l != null,
  );
  const detected = candidates.filter((l) => l.status === "detected" && l.impact.level !== "negligible");
  const ranked = rankLimiters(detected);

  const confidences = ranked.map((l) => l.confidence.overall ?? 0);
  const overallDataQuality = confidenceLabel(confidences.length ? Math.min(...confidences) : null);

  return {
    ...base,
    status: "ok",
    limiters: ranked,
    primaryConstraint: primaryConstraintSentence(ranked),
    meaningfulCount: ranked.length,
    overallDataQuality,
  };
}
