/**
 * Sprint Intelligence Engine (Day 60) — AVA's first coaching-intelligence layer.
 *
 * The other engines each answer a narrow question: what are the metrics, what do
 * they mean in real-world units (calibration), how fast could this athlete race
 * (prediction), and when in the run did each phase happen (phases). This module
 * sits *above* all of them and answers the coach's actual question: given
 * everything AVA measured, what is the single biggest thing holding this athlete
 * back, why does it matter, which part of the sprint does it hurt, and what
 * should they do about it next — with an honest confidence on every claim.
 *
 * It is a *synthesis* layer, not another metric panel:
 *  - It reuses the existing threshold evaluation ({@link evaluateMetric}) rather
 *    than inventing new bands, so a "limiter" here is consistent with the rest of
 *    the app.
 *  - It cross-references calibration confidence, the predictor's goal gap, the
 *    detected sprint phases, and the athlete's longitudinal training focus to
 *    rank limiters and frame *how much* each one costs.
 *  - Every recommendation carries a reasoning trace — no advice is ever produced
 *    without the measured evidence that generated it.
 *
 * Design guarantees:
 *  - Pure & deterministic: no I/O, inputs are read-only, same input → same
 *    output. No randomness, no clocks, stable tie-breaks.
 *  - Explainable: no machine learning, no black boxes. Every score is a small,
 *    named arithmetic combination of measured inputs.
 *  - Honest: it consumes the other engines' outputs and never modifies them or
 *    the biomechanics math; missing/low-confidence data lowers confidence and is
 *    explained via `dataGaps`, never faked.
 *
 * Extension points for later versions (historical progression, asymmetry,
 * environment, fatigue, coach feedback, ML) are called out inline.
 */

import type { AnalysisMetrics } from "@/lib/biomechanics/types";
import type { CalibrationReport } from "@/lib/calibration";
import type { PerformancePrediction } from "@/lib/prediction";
import { PHASE_LABELS, type PhaseReport, type SprintPhase } from "@/lib/phases";
import type { TrainingFocus } from "@/lib/coaching/focus";
import { evaluateMetric } from "@/lib/coaching/evaluation";
import type { MetricEvaluation } from "@/lib/coaching/types";
import { EXERCISES, type CoachingExercise } from "@/lib/coaching/knowledge/exercises";

export type IntelligenceConfidence = "high" | "medium" | "low";

/** A drill resolved from the coaching knowledge base for display. */
export interface LimiterDrill {
  id: string;
  name: string;
  category: string;
  coachingCue: string;
  difficulty: string;
}

/** One sprint phase this limiter governs, plus whether the clip captured it. */
export interface AffectedPhase {
  phase: SprintPhase;
  label: string;
  /** True when a band for this phase was actually detected in the clip. */
  observed: boolean;
  /** "0.42–1.10s" when observed, else null. */
  window: string | null;
}

/** A single performance limiter, fully explained. */
export interface Limiter {
  /** Stable key, e.g. "cadence". */
  key: string;
  /** The evaluation metric id this limiter is anchored to. */
  metricId: string;
  title: string;
  /** Off-target severity, from the shared threshold evaluation. */
  severity: "watch" | "poor";
  /** 1 = primary limiter, then 2, 3, … */
  rank: number;
  /** 0–100 estimate of how much this caps sprint performance. Ranks limiters. */
  impactScore: number;
  /** Confidence that this really is a limiter worth acting on. */
  confidence: IntelligenceConfidence;
  /** Performance-model framing of why this matters. */
  why: string;
  /** The measured evidence + reasoning that generated this limiter. */
  reasoning: string[];
  /** Sprint phases this limiter affects, with whether each was observed. */
  affectedPhases: AffectedPhase[];
  /** What to emphasise in training. */
  coachingFocus: string;
  /** Suggested drills, resolved from the knowledge base. */
  drills: LimiterDrill[];
}

/** A missing/weak input and how supplying it would sharpen the analysis. */
export interface DataGap {
  what: string;
  wouldImprove: string;
}

/** The full coaching-intelligence assessment for one analysis. */
export interface SprintIntelligenceReport {
  /** False when there aren't enough metrics to assess anything. */
  available: boolean;
  /** One-paragraph coach-facing summary. */
  headline: string;
  primaryLimiter: Limiter | null;
  secondaryLimiters: Limiter[];
  /** Overall confidence in the assessment, or null when unavailable. */
  confidence: IntelligenceConfidence | null;
  /** Magnitude framing from the predictor (goal gap), when available. */
  performanceContext: string | null;
  /** What extra data would improve the recommendations. */
  dataGaps: DataGap[];
  /** Global caveats. */
  warnings: string[];
  /** How this assessment was produced (always present). */
  method: string;
}

/** Everything the engine synthesises. Every field is optional/nullable. */
export interface IntelligenceInputs {
  metrics: AnalysisMetrics | null;
  calibration: CalibrationReport | null;
  prediction: PerformancePrediction | null;
  phases: PhaseReport | null;
  /** Longitudinal focus across the athlete's recent sessions, if computed. */
  trainingFocus: TrainingFocus | null;
  /**
   * Whether temporal metrics (ground contact / flight) are frame-rate-trustworthy
   * (Day 69). Defaults to true. When false (e.g. ≤60 fps precision mode), the
   * contact/flight limiters are NOT evaluated — a frame-quantized value must not be
   * flagged as a limiter as if it were a reliable measurement.
   */
  timingReliable?: boolean;
}

const METHOD =
  "Deterministic synthesis of AVA's measured metrics, calibration, phase detection, and predicted times — no machine learning. Every recommendation lists the evidence that produced it.";

const CONF_ORDER: IntelligenceConfidence[] = ["low", "medium", "high"];

function minConf(a: IntelligenceConfidence, b: IntelligenceConfidence): IntelligenceConfidence {
  return CONF_ORDER[Math.min(CONF_ORDER.indexOf(a), CONF_ORDER.indexOf(b))];
}

function downgrade(c: IntelligenceConfidence, steps = 1): IntelligenceConfidence {
  return CONF_ORDER[Math.max(0, CONF_ORDER.indexOf(c) - steps)];
}

function upgrade(c: IntelligenceConfidence, steps = 1): IntelligenceConfidence {
  return CONF_ORDER[Math.min(CONF_ORDER.length - 1, CONF_ORDER.indexOf(c) + steps)];
}

const round = (n: number): number => Math.round(n);

/**
 * Static limiter definitions, keyed by the shared evaluation metric id. Weights
 * mirror the technique-score model so ranking stays consistent with the rest of
 * the app; phases and drills encode fixed sprint-coaching knowledge. This table
 * is the whole "model" — transparent and hand-tunable, by design.
 */
interface LimiterDef {
  key: string;
  metricId: "stepFrequency" | "groundContactTime" | "flightTime" | "strideLength";
  title: string;
  /** How much this factor governs top-end sprint performance (technique-score weights). */
  weight: number;
  /** Sprint phases this factor most governs, primary first. */
  phases: SprintPhase[];
  why: string;
  coachingFocus: string;
  /** Exercise ids into the knowledge base (aligned with the recommendation engine). */
  drills: string[];
  /** True when the metric's value depends on camera calibration. */
  calibrationDependent: boolean;
  /** Matching recommendation-engine id, for training-focus cross-reference. */
  recommendationId: string;
}

const LIMITER_DEFS: LimiterDef[] = [
  {
    key: "groundContact",
    metricId: "groundContactTime",
    title: "Long ground contact",
    weight: 25,
    phases: ["maxVelocity", "acceleration"],
    why: "Long ground contact bleeds horizontal velocity — the foot spends too long on the ground, so less force converts into speed at the moment it matters most.",
    coachingFocus:
      "Build reactive ankle and foot stiffness so force is applied faster on each contact, shortening support time.",
    drills: ["pogo-hops", "low-hurdle-hops", "ankle-stiffness-series"],
    calibrationDependent: false,
    recommendationId: "ground-contact-time",
  },
  {
    key: "strideLength",
    metricId: "strideLength",
    title: "Short stride length",
    weight: 25,
    phases: ["maxVelocity", "acceleration"],
    why: "Short strides cover less ground per step, so top velocity stays capped even when turnover is high.",
    coachingFocus:
      "Develop horizontal force production and projection so each stride covers more ground without over-reaching.",
    drills: ["resisted-sled-sprints", "bounding", "hill-accelerations"],
    calibrationDependent: true,
    recommendationId: "stride-length",
  },
  {
    key: "cadence",
    metricId: "stepFrequency",
    title: "Low cadence / turnover",
    weight: 20,
    phases: ["maxVelocity", "maintenance"],
    why: "Turnover sets how quickly each leg is repositioned; below target it caps top-end velocity even when stride length is good.",
    coachingFocus:
      "Raise turnover with quick-feet and front-side mechanics work while keeping posture tall so form does not collapse.",
    drills: ["sprint-dribbles", "wicket-runs", "a-skips"],
    calibrationDependent: false,
    recommendationId: "step-frequency",
  },
  {
    key: "projection",
    metricId: "flightTime",
    title: "Limited projection / flight",
    weight: 15,
    phases: ["maxVelocity", "acceleration"],
    why: "Short flight time means each stride projects less; the athlete covers less ground per step and struggles to express top speed.",
    coachingFocus:
      "Develop elastic projection and hip extension to stay airborne longer per stride.",
    drills: ["fly-30s", "straight-leg-bounds", "wicket-runs"],
    calibrationDependent: false,
    recommendationId: "flight-time",
  },
];

/** Severity multiplier: a clearly-poor metric limits more than a borderline one. */
const SEVERITY_FACTOR: Record<"watch" | "poor", number> = { poor: 1, watch: 0.6 };

/** Resolve drill ids to their knowledge-base entries (dropping any unknown id). */
function resolveDrills(ids: string[]): LimiterDrill[] {
  return ids
    .map((id) => EXERCISES[id])
    .filter((e): e is CoachingExercise => !!e)
    .map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      coachingCue: e.coachingCue,
      difficulty: e.difficulty,
    }));
}

/**
 * Pull the value for each evaluable metric out of the raw + calibrated inputs.
 * Stride length is calibration-dependent: the worker metric arrives as 0 until
 * calibration lands, so we prefer the calibrated estimate and fall back to a
 * genuine (non-zero) worker value only if present.
 */
function resolveMetricValues(inputs: IntelligenceInputs): {
  values: Record<LimiterDef["metricId"], number | null>;
  strideFromCalibration: boolean;
} {
  const m = inputs.metrics;
  const calibratedStride =
    inputs.calibration?.measurements.find((x) => x.key === "strideLength")?.value ?? null;

  const workerStride = m && m.avgStrideLengthM > 0 ? m.avgStrideLengthM : null;
  const strideFromCalibration = calibratedStride != null;

  // Precision mode (Day 69): when timing isn't frame-rate-trustworthy, withhold the
  // temporal metrics so their limiters aren't evaluated (a null value → no limiter).
  const timingReliable = inputs.timingReliable !== false;

  return {
    values: {
      groundContactTime: timingReliable && m ? m.groundContactTimeMs : null,
      strideLength: calibratedStride ?? workerStride,
      stepFrequency: m ? m.strideFrequencyHz : null,
      flightTime: timingReliable && m ? m.flightTimeMs : null,
    },
    strideFromCalibration,
  };
}

/** First detected band for each phase (for attribution windows). */
function indexPhaseBands(
  report: PhaseReport | null,
): Partial<Record<SprintPhase, { start: number; end: number; confidence: IntelligenceConfidence }>> {
  const map: Partial<
    Record<SprintPhase, { start: number; end: number; confidence: IntelligenceConfidence }>
  > = {};
  if (!report?.available) return map;
  for (const band of report.bands) {
    if (!map[band.phase]) {
      map[band.phase] = {
        start: band.startTime,
        end: band.endTime,
        confidence: band.confidence,
      };
    }
  }
  return map;
}

/** Map a limiter's conceptual phases onto what the clip actually captured. */
function buildAffectedPhases(
  def: LimiterDef,
  phaseIndex: ReturnType<typeof indexPhaseBands>,
): AffectedPhase[] {
  return def.phases.map((phase) => {
    const band = phaseIndex[phase];
    return {
      phase,
      label: PHASE_LABELS[phase],
      observed: !!band,
      window: band ? `${band.start.toFixed(2)}–${band.end.toFixed(2)}s` : null,
    };
  });
}

/**
 * Confidence that a limiter is real and worth acting on. Calibration-dependent
 * limiters inherit the calibration confidence; others start at medium and only
 * reach high when a clearly-poor reading is corroborated by a detected phase it
 * governs.
 */
function limiterConfidence(
  def: LimiterDef,
  status: "watch" | "poor",
  calibrationConfidence: IntelligenceConfidence | null,
  affected: AffectedPhase[],
): IntelligenceConfidence {
  if (def.calibrationDependent) {
    return calibrationConfidence ?? "low";
  }
  const base: IntelligenceConfidence = "medium";
  const corroborated = affected.some((p) => p.observed);
  if (status === "poor" && corroborated) return upgrade(base);
  return base;
}

/** Positive "seconds slower than goal" gaps from the predictor, largest first. */
function goalGaps(
  prediction: PerformancePrediction | null,
): Array<{ distance: number; seconds: number }> {
  if (!prediction?.available) return [];
  return prediction.estimates
    .filter((e) => e.diffFromGoal != null && e.diffFromGoal > 0)
    .map((e) => ({ distance: e.distance, seconds: e.diffFromGoal as number }))
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * Build the full Sprint Intelligence assessment. Returns `available: false` with
 * an explanation when there aren't enough metrics to assess, rather than
 * inventing a limiter.
 */
export function buildSprintIntelligence(inputs: IntelligenceInputs): SprintIntelligenceReport {
  const warnings: string[] = [];

  if (!inputs.metrics) {
    return {
      available: false,
      headline:
        "No completed analysis yet — run pose estimation on this sprint to unlock coaching intelligence.",
      primaryLimiter: null,
      secondaryLimiters: [],
      confidence: null,
      performanceContext: null,
      dataGaps: [
        {
          what: "A completed biomechanics analysis",
          wouldImprove: "Metrics are the foundation for every limiter and recommendation below.",
        },
      ],
      warnings,
      method: METHOD,
    };
  }

  const calibrationConfidence: IntelligenceConfidence | null =
    inputs.calibration?.scale?.confidence ?? null;
  const { values, strideFromCalibration } = resolveMetricValues(inputs);
  const phaseIndex = indexPhaseBands(inputs.phases);

  // Evaluate each metric against the shared thresholds (reused, not reinvented).
  const evaluations = new Map<string, MetricEvaluation>();
  for (const def of LIMITER_DEFS) {
    const evaluation = evaluateMetric(def.metricId, values[def.metricId]);
    if (evaluation) evaluations.set(def.metricId, evaluation);
  }

  const strong = (id: string): boolean => {
    const s = evaluations.get(id)?.status;
    return s === "elite" || s === "good";
  };

  // Build a limiter for every metric flagged watch/poor.
  const limiters: Limiter[] = [];
  for (const def of LIMITER_DEFS) {
    const evaluation = evaluations.get(def.metricId);
    if (!evaluation) continue;
    const status = evaluation.status;
    if (status !== "watch" && status !== "poor") continue;

    const affectedPhases = buildAffectedPhases(def, phaseIndex);
    const impactScore = Math.min(100, round(def.weight * SEVERITY_FACTOR[status] * 4));
    const confidence = limiterConfidence(def, status, calibrationConfidence, affectedPhases);

    const reasoning: string[] = [
      `${evaluation.label} is ${evaluation.value} ${evaluation.unit} (${status}; target ${evaluation.targetRange}).`,
      evaluation.meaning,
    ];

    // Synthesis: when turnover is already strong, stride/projection is the
    // higher-value lever than chasing faster cadence (mirrors the cadence/stride rule).
    if (
      (def.key === "strideLength" || def.key === "projection") &&
      strong("stepFrequency")
    ) {
      reasoning.push(
        "Turnover is already at target, so covering more ground per stride is a higher-value lever than chasing faster cadence.",
      );
    }
    if (def.calibrationDependent) {
      reasoning.push(
        strideFromCalibration
          ? `Value is calibrated (${calibrationConfidence ?? "low"}-confidence scale), so treat it accordingly.`
          : "Value comes from an uncalibrated worker estimate — calibrate the clip to firm this up.",
      );
    }

    // Phase attribution note.
    const observed = affectedPhases.filter((p) => p.observed);
    if (observed.length > 0) {
      reasoning.push(
        `Most affects ${observed.map((p) => `${p.label} (${p.window})`).join(" and ")} in this run.`,
      );
    } else if (inputs.phases?.available) {
      reasoning.push(
        `The phase(s) this most affects (${def.phases.map((p) => PHASE_LABELS[p]).join(", ")}) were not captured in this clip.`,
      );
    }

    // Longitudinal cross-reference: flag a persistent limiter from training focus.
    const focusMatch =
      inputs.trainingFocus?.areas.find((a) => a.id === def.recommendationId) ?? null;
    if (focusMatch && focusMatch.occurrences >= 2) {
      reasoning.push(
        `Recurs across ${focusMatch.occurrences} of ${focusMatch.sessionsAnalyzed} recent sessions (${focusMatch.trend}) — a persistent limiter, not a one-off.`,
      );
    }

    limiters.push({
      key: def.key,
      metricId: def.metricId,
      title: def.title,
      severity: status,
      rank: 0, // assigned after ranking
      impactScore,
      confidence,
      why: def.why,
      reasoning,
      affectedPhases,
      coachingFocus: def.coachingFocus,
      drills: resolveDrills(def.drills),
    });
  }

  // Rank most-limiting first; deterministic tie-breaks (severity, then metric id).
  limiters.sort(
    (a, b) =>
      b.impactScore - a.impactScore ||
      (a.severity === b.severity ? 0 : a.severity === "poor" ? -1 : 1) ||
      a.metricId.localeCompare(b.metricId),
  );
  limiters.forEach((l, i) => (l.rank = i + 1));

  const gaps = goalGaps(inputs.prediction);
  const performanceContext = buildPerformanceContext(inputs.prediction, gaps, limiters.length > 0);

  // Fold the goal gap into the primary limiter's "why" so the headline issue
  // carries the stakes.
  const primaryLimiter = limiters[0] ?? null;
  if (primaryLimiter && gaps.length > 0) {
    const g = gaps[0];
    primaryLimiter.reasoning.push(
      `AVA projects you ${g.seconds.toFixed(2)}s short of your ${g.distance} m goal — improving this limiter is the most direct way to close that gap.`,
    );
  }

  const dataGaps = collectDataGaps(inputs, evaluations, strideFromCalibration);
  const confidence = overallConfidence(primaryLimiter, calibrationConfidence, inputs.phases);
  const headline = buildHeadline(primaryLimiter, limiters, evaluations, performanceContext);

  if (inputs.phases && !inputs.phases.available) {
    warnings.push(
      "Sprint phases could not be detected, so limiters are not tied to a specific part of the run.",
    );
  }
  if (calibrationConfidence === "low") {
    warnings.push("Calibration is low-confidence, so distance-based limiters are approximate.");
  }

  return {
    available: true,
    headline,
    primaryLimiter,
    secondaryLimiters: limiters.slice(1),
    confidence,
    performanceContext,
    dataGaps,
    warnings,
    method: METHOD,
  };
}

/** Magnitude framing: how far off goal the athlete is projected to be. */
function buildPerformanceContext(
  prediction: PerformancePrediction | null,
  gaps: Array<{ distance: number; seconds: number }>,
  hasLimiters: boolean,
): string | null {
  if (!prediction?.available) return null;
  if (gaps.length > 0) {
    const g = gaps[0];
    return `AVA projects roughly ${g.seconds.toFixed(2)}s short of the ${g.distance} m goal. The limiters below are the biomechanics most likely holding that back.`;
  }
  const hasGoals = prediction.estimates.some((e) => e.goal != null);
  if (hasGoals) {
    return hasLimiters
      ? "Projected times are on track with the current goals — the limiters below are refinements rather than blockers."
      : "Projected times are on track with the current goals.";
  }
  return null;
}

/** Compose the one-paragraph coaching summary. */
function buildHeadline(
  primary: Limiter | null,
  limiters: Limiter[],
  evaluations: Map<string, MetricEvaluation>,
  performanceContext: string | null,
): string {
  if (!primary) {
    const scored = evaluations.size;
    if (scored === 0) {
      return "Not enough scored metrics to identify a limiter yet — add calibration and full-run footage to unlock the assessment.";
    }
    return "No single biomechanical limiter stands out — the scored metrics are within their target ranges. Keep the current emphasis and progress steadily.";
  }
  const others = limiters.length - 1;
  const tail =
    others > 0
      ? ` ${others} secondary limiter${others === 1 ? "" : "s"} ${others === 1 ? "is" : "are"} ranked below it.`
      : "";
  const context = performanceContext ? ` ${performanceContext}` : "";
  return `The biggest limiter is ${primary.title.toLowerCase()} (${primary.severity}). ${primary.why}${tail}${context}`;
}

/** What extra data would improve the recommendations. */
function collectDataGaps(
  inputs: IntelligenceInputs,
  evaluations: Map<string, MetricEvaluation>,
  strideFromCalibration: boolean,
): DataGap[] {
  const gaps: DataGap[] = [];

  if (!inputs.calibration?.calibrated || inputs.calibration?.scale?.confidence === "low") {
    gaps.push({
      what: "Camera calibration (athlete leg length or a known distance)",
      wouldImprove:
        "Enables real-world stride length and velocity, and firms up the stride-length limiter and predicted times.",
    });
  } else if (!strideFromCalibration && !evaluations.has("strideLength")) {
    gaps.push({
      what: "A calibrated stride-length measurement",
      wouldImprove: "Lets AVA judge stride length, one of the two biggest velocity levers.",
    });
  }

  if (!inputs.phases?.available) {
    gaps.push({
      what: "Continuously-tracked, full-run footage",
      wouldImprove: "Lets AVA segment the sprint into phases and tie each limiter to where in the run it hurts.",
    });
  } else if (inputs.phases.warnings.some((w) => /still rising/i.test(w))) {
    gaps.push({
      what: "Footage that captures top speed (the run continued past the clip)",
      wouldImprove: "The max-velocity phase was off-camera, so top-end limiters can't be fully confirmed.",
    });
  }

  if (!inputs.prediction?.available) {
    gaps.push({
      what: "Analysed sprint metrics or a calibrated top velocity",
      wouldImprove: "Lets AVA project race times and quantify how much each limiter is costing.",
    });
  } else if (!inputs.prediction.estimates.some((e) => e.goal != null)) {
    gaps.push({
      what: "The athlete's goal times",
      wouldImprove: "Lets AVA frame each limiter by how far it leaves the athlete from their targets.",
    });
  }

  const sessions = inputs.trainingFocus?.sessionsAnalyzed ?? 0;
  if (sessions < 2) {
    gaps.push({
      what: "More analysed sessions for this athlete",
      wouldImprove:
        "Distinguishes persistent limiters from one-off readings and reveals whether they are improving.",
    });
  }

  return gaps;
}

/**
 * Overall confidence: anchored to the primary limiter's confidence, then
 * downgraded once for each major missing signal (no calibration, no phases).
 */
function overallConfidence(
  primary: Limiter | null,
  calibrationConfidence: IntelligenceConfidence | null,
  phases: PhaseReport | null,
): IntelligenceConfidence {
  let confidence: IntelligenceConfidence = primary ? primary.confidence : "medium";
  if (calibrationConfidence == null) confidence = downgrade(confidence);
  if (!phases?.available) confidence = downgrade(confidence);
  return primary ? confidence : minConf(confidence, "medium");
}
