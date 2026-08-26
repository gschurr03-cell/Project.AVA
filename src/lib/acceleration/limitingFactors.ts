/**
 * Acceleration-specific Limiting Factors (Phase 2, Parts 4-6).
 *
 * Deliberately NOT added to the shared fly `LimiterType` union in
 * `@/lib/limitingFactors/types` — that union is exhaustively switched over in
 * `@/lib/coachingRecommendations/rules.ts`, which is fly's own rule engine and
 * out of scope here. Instead this reuses every type-independent piece of the
 * shared `Limiter` shape (measured values, targets, confidence, evidence,
 * associations, recommendations — none of which reference `LimiterType`) via
 * `Omit<Limiter, "type">`, so the UI can render an `AccelerationLimiter`
 * exactly like a fly `Limiter` without a parallel, hand-duplicated interface.
 *
 * Ranks by estimated performance impact and returns only the top findings
 * (Part 4). Every limiter includes a comparison to the athlete's OWN
 * progression (early-vs-late within this same run), not just a population
 * band (Part 5) — never a diagnosis; physical associations always carry the
 * same disclaimer pattern fly's engine uses.
 */

import type {
  Limiter,
  LimiterRecommendation,
  PhysicalAssociation,
} from "../limitingFactors/types";
import type { AccelerationIntervalMetric, AccelerationAsymmetry } from "./metrics";
import type { AccelerationStepRow } from "./steps";
import type { ProgressionAnalysis } from "./progression";

export type AccelerationLimiterType =
  | "acceleration_slow_velocity_gain"
  | "acceleration_rapid_acceleration_loss"
  | "acceleration_excessive_early_step_length"
  | "acceleration_short_early_step_length"
  | "acceleration_delayed_step_length_growth"
  | "acceleration_low_early_step_frequency"
  | "acceleration_premature_frequency_rise"
  | "acceleration_frequency_plateau_too_early"
  | "acceleration_long_early_contact_time"
  | "acceleration_step_length_asymmetry"
  | "acceleration_step_time_asymmetry"
  | "acceleration_inconsistent_rhythm"
  | "acceleration_poor_velocity_progression"
  | "acceleration_plateau_before_segment_end"
  | "acceleration_touchdown_too_far_ahead"
  | "acceleration_posture_rises_early"
  | "acceleration_posture_stays_low_without_velocity_gain"
  | "acceleration_shin_vertical_early"
  | "acceleration_length_grows_without_velocity_gain"
  | "acceleration_frequency_rises_while_projection_deteriorates"
  | "acceleration_pelvis_rises_abruptly"
  | "acceleration_inconsistent_mechanical_progression"
  | "acceleration_lr_projection_asymmetry"
  | "acceleration_abrupt_strategy_change";

export interface AccelerationLimiter extends Omit<Limiter, "type"> {
  type: AccelerationLimiterType;
}

/** The maximum number of limiters returned — "return only the highest-impact issues" (Part 4). */
const MAX_LIMITERS = 5;

/**
 * The minimal, structural slice of an acceleration result this engine reads.
 * Deliberately NOT typed against `AccelerationAnalysis` (the worker's in-memory
 * shape) — the PERSISTED shape (what the UI actually has at render time,
 * `accelerationMetricsSchema`-parsed) renames/flattens a few fields to stay
 * schema-legacy-compatible. A narrow structural type lets either shape
 * satisfy it without an adapter object.
 */
export interface AccelerationLimiterMetricsInput {
  intervalMetrics: AccelerationIntervalMetric[];
  steps: AccelerationStepRow[];
  asymmetries: AccelerationAsymmetry | null;
  progression: ProgressionAnalysis | null;
  warnings: string[];
  peakVelocityMps: number | null;
  fpsAdequate: boolean;
}

export interface AccelerationLimitingFactorsInput {
  analysis: AccelerationLimiterMetricsInput;
  athlete: {
    heightCm: number | null;
    legLengthCm: number | null;
    trochanterHeightM: number | null;
    weightKg: number | null;
    primaryEvent: string | null;
  } | null;
}

const disclaimer = (category: string, muscleGroups: string[]): PhysicalAssociation => ({
  category,
  muscleGroups,
  disclaimer:
    "This pattern is commonly associated with the categories below — not a diagnosis. Video analysis cannot confirm muscular strength, weakness, or force production.",
});

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function stddev(values: number[]): number {
  const avg = mean(values);
  if (avg == null || values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
}

/** Part 5: "comparison to the athlete's own progression" — an evidence line
 *  built from the same early-vs-late split `progression.stepProgression` uses,
 *  reused verbatim so every limiter can cite it, not just asymmetry-related ones. */
function ownProgressionEvidence(progression: ProgressionAnalysis | null): { label: string; value: string; kind: "comparison" }[] {
  if (!progression) return [];
  const { stepLengthTrend, stepFrequencyTrend } = progression.stepProgression;
  if (stepLengthTrend === "insufficient_data" && stepFrequencyTrend === "insufficient_data") return [];
  return [
    {
      label: "Compared to this athlete's own progression",
      value: `Step length ${stepLengthTrend.replace(/_/g, " ")}; step frequency ${stepFrequencyTrend.replace(/_/g, " ")} across the zone.`,
      kind: "comparison",
    },
  ];
}

/**
 * Builds ranked, evidence-backed acceleration limiters from an already-computed
 * `AccelerationAnalysis` (never re-measures pose data). Athlete context is used
 * only to caveat comparisons — no universal ideal step length or frequency is
 * applied.
 */
export function buildAccelerationLimitingFactors(
  input: AccelerationLimitingFactorsInput,
): AccelerationLimiter[] {
  const { analysis } = input;
  const limiters: AccelerationLimiter[] = [];
  const dataQualityWarnings = analysis.warnings;
  const ownProgression = ownProgressionEvidence(analysis.progression);
  const earlySteps = analysis.steps.slice(0, Math.min(4, analysis.steps.length));

  // 1. Slow velocity gain over the first calibrated interval(s).
  const first = analysis.intervalMetrics[0];
  if (first?.accelerationMps2 == null && first?.velocityMps != null && first.timeS) {
    const impliedAccel = first.velocityMps / first.timeS;
    if (impliedAccel < 3.2) {
      limiters.push({
        id: "acceleration-slow-velocity-gain",
        type: "acceleration_slow_velocity_gain",
        status: "detected",
        rank: 1,
        title: "Early acceleration develops slowly",
        summary: `Average acceleration to ${first.endM} m was ${impliedAccel.toFixed(2)} m/s², below the range typically seen in this phase.`,
        impact: { level: "high", score: 0.75, explanation: "Early acceleration disproportionately determines total time over short distances." },
        confidence: {
          measurement: analysis.fpsAdequate ? 0.8 : 0.55,
          reasoning: 0.6,
          overall: analysis.fpsAdequate ? 0.6 : 0.4,
          label: analysis.fpsAdequate ? "moderate" : "low",
          explanation: "Derived from a single calibrated interval; a broad research band, not an individualized model.",
        },
        measuredValues: [{ label: "Average acceleration", value: impliedAccel, unit: "m/s²", detail: `0–${first.endM} m` }],
        target: { type: "research_reference", minimum: 3.2, maximum: null, unit: "m/s²", sourceLabel: "Broad acceleration-phase reference band", explanation: "Wide band; not individualized to this athlete." },
        deviation: { absolute: 3.2 - impliedAccel, percentage: ((3.2 - impliedAccel) / 3.2) * 100, direction: "below" },
        evidence: [{ label: "Interval", value: `0–${first.endM} m in ${first.timeS.toFixed(2)} s`, kind: "measurement" }, ...ownProgression],
        reasoning: ["Average acceleration over the first observed interval fell below the reference band."],
        possibleTechnicalAssociations: ["Insufficient forward lean at push-off", "Late first-step ground contact", "Weak initial drive angle"],
        possiblePhysicalAssociations: [disclaimer("Lower-body power", ["Quadriceps", "Gluteals", "Hip flexors"])],
        recommendations: [fallingStartsRecommendation(), heavySledPushRecommendation(), hipExtensionStrengthRecommendation()],
        dataQualityWarnings,
      });
    }
  }

  // 2. Rapid loss of acceleration mid-zone (a sharp decline, distinct from the
  // gradual end-of-zone plateau in #14).
  if (analysis.progression) {
    const decline = analysis.progression.accelerationDeclineStep;
    const declineGain = analysis.progression.stepGains.find((g) => g.stepNumber === decline?.stepNumber);
    if (decline && declineGain?.accelerationGainMps2 != null && declineGain.accelerationGainMps2 < -4) {
      const isNearEnd = analysis.steps.length > 0 && decline.stepNumber >= analysis.steps[analysis.steps.length - 1].stepNumber - 1;
      if (!isNearEnd) {
        limiters.push({
          id: "acceleration-rapid-loss",
          type: "acceleration_rapid_acceleration_loss",
          status: "detected",
          rank: limiters.length + 1,
          title: "Rapid loss of acceleration mid-zone",
          summary: `Acceleration dropped sharply (${declineGain.accelerationGainMps2.toFixed(2)} m/s² change) at step ${decline.stepNumber}, well before the end of the zone.`,
          impact: { level: "high", score: 0.7, explanation: "A sharp mid-zone drop (not a gradual approach to top speed) suggests a real limiting event, not natural velocity ceiling." },
          confidence: { measurement: 0.55, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Derived from consecutive-step acceleration deltas; sensitive to any single missed contact." },
          measuredValues: [{ label: "Acceleration change", value: declineGain.accelerationGainMps2, unit: "m/s²", detail: `at step ${decline.stepNumber}` }],
          target: { type: "unavailable" },
          deviation: { direction: null },
          evidence: [{ label: "Decline step", value: `Step ${decline.stepNumber} (${decline.distanceM.toFixed(1)} m)`, kind: "measurement" }, ...ownProgression],
          reasoning: ["Acceleration fell sharply well before the calibrated zone ended, not gradually near the end."],
          possibleTechnicalAssociations: ["Premature transition to upright posture", "Loss of rhythm or a mistimed step"],
          possiblePhysicalAssociations: [disclaimer("Repeated high-force output", ["Hamstrings", "Gluteals"])],
          recommendations: [lowAngleProjectionRecommendation()],
          dataQualityWarnings,
        });
      }
    }
  }

  // 3. Excessive vs. short early step length (first step only, most diagnostic).
  const firstStep = analysis.steps[0];
  if (firstStep && input.athlete?.legLengthCm) {
    const legM = input.athlete.legLengthCm / 100;
    const ratio = firstStep.stepLengthM / legM;
    if (ratio > 1.35) {
      limiters.push(excessiveEarlyStepLength(firstStep.stepLengthM, ratio, dataQualityWarnings, ownProgression, limiters.length + 1));
    } else if (ratio < 0.75) {
      limiters.push(shortEarlyStepLength(firstStep.stepLengthM, ratio, dataQualityWarnings, ownProgression, limiters.length + 1));
    }
  }

  // 4. Delayed step-length growth: early steps stay well short of the athlete's
  // OWN later step length (distinct from #3, which only looks at step one).
  if (analysis.steps.length >= 5) {
    const lastTwo = analysis.steps.slice(-2);
    const firstTwoAvg = mean(analysis.steps.slice(0, 2).map((s) => s.stepLengthM));
    const lastTwoAvg = mean(lastTwo.map((s) => s.stepLengthM));
    if (firstTwoAvg != null && lastTwoAvg != null && lastTwoAvg > 0 && firstTwoAvg / lastTwoAvg < 0.7) {
      limiters.push({
        id: "acceleration-delayed-step-length-growth",
        type: "acceleration_delayed_step_length_growth",
        status: "detected",
        rank: limiters.length + 1,
        title: "Step-length growth is delayed",
        summary: `Early steps averaged ${firstTwoAvg.toFixed(2)} m, only ${Math.round((firstTwoAvg / lastTwoAvg) * 100)}% of this athlete's own later step length (${lastTwoAvg.toFixed(2)} m).`,
        impact: { level: "moderate", score: 0.55, explanation: "Length that develops later than it could limits how quickly velocity builds through the zone." },
        confidence: { measurement: 0.6, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Compares the athlete's own first and last steps; a small sample." },
        measuredValues: [{ label: "First-two-step average", value: firstTwoAvg, unit: "m" }, { label: "Last-two-step average", value: lastTwoAvg, unit: "m" }],
        target: { type: "individualized", minimum: null, maximum: null, unit: "m", sourceLabel: "Athlete's own later step length" },
        deviation: { percentage: (1 - firstTwoAvg / lastTwoAvg) * 100, direction: "below" },
        evidence: [{ label: "Growth ratio", value: `${Math.round((firstTwoAvg / lastTwoAvg) * 100)}%`, kind: "comparison" }, ...ownProgression],
        reasoning: ["Early step length was well below the athlete's own later step length in this same run."],
        possibleTechnicalAssociations: ["Conservative or tentative early drive", "Slow transition out of a compressed starting posture"],
        possiblePhysicalAssociations: [disclaimer("Drive-phase power output", ["Gluteals", "Quadriceps", "Hip flexors"])],
        recommendations: [wallSwitchRecommendation(), horizontalPlyometricRecommendation()],
        dataQualityWarnings,
      });
    }
  }

  // 5. Low early step frequency.
  const earlyFreq = mean(earlySteps.map((s) => s.stepFrequencyHz).filter((v) => v > 0));
  if (earlyFreq != null && earlyFreq < 3.6) {
    limiters.push({
      id: "acceleration-low-early-step-frequency",
      type: "acceleration_low_early_step_frequency",
      status: "detected",
      rank: limiters.length + 1,
      title: "Low step frequency in the first steps",
      summary: `Average step frequency over the first ${earlySteps.length} steps was ${earlyFreq.toFixed(2)} Hz.`,
      impact: { level: "moderate", score: 0.55, explanation: "Low early frequency alongside adequate step length can still limit rate of velocity gain." },
      confidence: { measurement: 0.65, reasoning: 0.55, overall: 0.5, label: "moderate", explanation: "Based on detected contacts only; undercounts if any early contact was missed." },
      measuredValues: [{ label: "Early step frequency", value: earlyFreq, unit: "Hz", detail: `first ${earlySteps.length} steps` }],
      target: { type: "research_reference", minimum: 3.6, maximum: null, unit: "Hz", sourceLabel: "Broad acceleration-phase reference band" },
      deviation: { absolute: 3.6 - earlyFreq, percentage: ((3.6 - earlyFreq) / 3.6) * 100, direction: "below" },
      evidence: [{ label: "Steps sampled", value: String(earlySteps.length), kind: "measurement" }, ...ownProgression],
      reasoning: ["Mean frequency across the earliest detected steps fell below the reference band."],
      possibleTechnicalAssociations: ["Prolonged ground-contact time", "Delayed leg recovery"],
      possiblePhysicalAssociations: [disclaimer("Reactive/elastic strength", ["Gastrocnemius", "Soleus"])],
      recommendations: [wicketRecommendation(), calfReactiveStrengthRecommendation()],
      dataQualityWarnings,
    });
  }

  // 6. Frequency rises while length stagnates (premature frequency rise).
  if (analysis.steps.length >= 6) {
    const firstHalf = analysis.steps.slice(0, Math.floor(analysis.steps.length / 2));
    const secondHalf = analysis.steps.slice(Math.floor(analysis.steps.length / 2));
    const freqDelta = (mean(secondHalf.map((s) => s.stepFrequencyHz)) ?? 0) - (mean(firstHalf.map((s) => s.stepFrequencyHz)) ?? 0);
    const lengthDelta = (mean(secondHalf.map((s) => s.stepLengthM)) ?? 0) - (mean(firstHalf.map((s) => s.stepLengthM)) ?? 0);
    if (freqDelta > 0.3 && lengthDelta < 0.05) {
      limiters.push({
        id: "acceleration-premature-frequency-rise",
        type: "acceleration_premature_frequency_rise",
        status: "detected",
        rank: limiters.length + 1,
        title: "Frequency rising faster than step length is developing",
        summary: `Step frequency rose ${freqDelta.toFixed(2)} Hz while step length grew only ${lengthDelta.toFixed(2)} m across the segment.`,
        impact: { level: "moderate", score: 0.5, explanation: "Rushing frequency before length development typically caps peak velocity." },
        confidence: { measurement: 0.6, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Trend across two halves of a short segment; not a validated model." },
        measuredValues: [
          { label: "Frequency change", value: freqDelta, unit: "Hz" },
          { label: "Step-length change", value: lengthDelta, unit: "m" },
        ],
        target: { type: "unavailable" },
        deviation: { direction: null },
        evidence: [{ label: "Segment split", value: "First half vs. second half of detected steps", kind: "context" }, ...ownProgression],
        reasoning: ["Frequency increased substantially while step length stayed roughly flat."],
        possibleTechnicalAssociations: ["Rushed turnover before force application develops"],
        possiblePhysicalAssociations: [disclaimer("Force application under load", ["Gluteals", "Hamstrings"])],
        recommendations: [lowAngleProjectionRecommendation()],
        dataQualityWarnings,
      });
    }
  }

  // 7. Frequency plateaus too early — the opposite pattern from #6: frequency
  // simply stops climbing well before the zone ends.
  if (analysis.progression && analysis.progression.stepProgression.stepFrequencyTrend === "plateauing" && analysis.steps.length >= 5) {
    limiters.push({
      id: "acceleration-frequency-plateau-too-early",
      type: "acceleration_frequency_plateau_too_early",
      status: "detected",
      rank: limiters.length + 1,
      title: "Step frequency plateaus early",
      summary: "Step frequency stopped increasing well before the end of the calibrated zone.",
      impact: { level: "moderate", score: 0.45, explanation: "Frequency that plateaus early can cap the rate of velocity gain through the remainder of the zone." },
      confidence: { measurement: 0.55, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Early-vs-late comparison within a short segment." },
      measuredValues: [],
      target: { type: "individualized", minimum: null, maximum: null, unit: "Hz", sourceLabel: "Athlete's own early-vs-late trend" },
      deviation: { direction: null },
      evidence: [...ownProgression],
      reasoning: ["Step frequency in the second half of the zone was not meaningfully higher than the first half."],
      possibleTechnicalAssociations: ["Early transition to a maintenance rhythm rather than continued turnover development"],
      possiblePhysicalAssociations: [disclaimer("Reactive/elastic strength", ["Gastrocnemius", "Soleus"])],
      recommendations: [calfReactiveStrengthRecommendation(), frontSideMechanicsRecommendation()],
      dataQualityWarnings,
    });
  }

  // 8. Long early ground-contact times.
  const earlyContactTimes = earlySteps.map((s) => s.contactTimeS).filter((v): v is number => v != null);
  const earlyContactMean = mean(earlyContactTimes);
  if (earlyContactMean != null && earlyContactTimes.length >= 2 && earlyContactMean > 0.19) {
    limiters.push({
      id: "acceleration-long-early-contact-time",
      type: "acceleration_long_early_contact_time",
      status: "detected",
      rank: limiters.length + 1,
      title: "Long ground-contact time in the first steps",
      summary: `Average early ground-contact time was ${(earlyContactMean * 1000).toFixed(0)} ms.`,
      impact: { level: "moderate", score: 0.5, explanation: "Extended contact time in early acceleration is commonly associated with slower force application." },
      confidence: { measurement: 0.55, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Contact-time detection is heuristic; treat as directional, not exact." },
      measuredValues: [{ label: "Early contact time", value: earlyContactMean, unit: "s", detail: `${earlyContactTimes.length} samples` }],
      target: { type: "research_reference", minimum: null, maximum: 0.19, unit: "s", sourceLabel: "Broad acceleration-phase reference band" },
      deviation: { absolute: earlyContactMean - 0.19, direction: "above" },
      evidence: [{ label: "Samples", value: String(earlyContactTimes.length), kind: "measurement" }, ...ownProgression],
      reasoning: ["Mean early ground-contact time exceeded the reference band."],
      possibleTechnicalAssociations: ["Braking at touchdown", "Insufficient stiffness through the ankle/knee"],
      possiblePhysicalAssociations: [disclaimer("Reactive strength", ["Gastrocnemius", "Soleus", "Quadriceps"])],
      recommendations: [heavySledPushRecommendation(), resistedAccelerationRecommendation()],
      dataQualityWarnings,
    });
  }

  // 9/10. Left/right step-length and step-time asymmetry — only when large
  // enough to be meaningful (Part 3: "do not over-report tiny differences").
  const asym = analysis.asymmetries;
  const lr = analysis.progression?.leftRight;
  if (asym && lr?.meaningfulStepLengthAsymmetry && asym.stepLengthAsymmetryPct != null) {
    limiters.push({
      id: "acceleration-step-length-asymmetry",
      type: "acceleration_step_length_asymmetry",
      status: "detected",
      rank: limiters.length + 1,
      title: "Left/right step-length imbalance",
      summary: `Step length differs ${asym.stepLengthAsymmetryPct.toFixed(1)}% between sides (L ${asym.leftStepAverageM?.toFixed(2) ?? "—"} m, R ${asym.rightStepAverageM?.toFixed(2) ?? "—"} m).`,
      impact: { level: asym.stepLengthAsymmetryPct > 15 ? "high" : "moderate", score: Math.min(1, asym.stepLengthAsymmetryPct / 20), explanation: "Persistent asymmetry can indicate a limiting side or a compensation pattern." },
      confidence: { measurement: 0.6, reasoning: 0.55, overall: 0.5, label: "moderate", explanation: `Based on ${asym.leftStepSampleCount + asym.rightStepSampleCount} detected steps.` },
      measuredValues: [
        { label: "Left step length", value: asym.leftStepAverageM, unit: "m" },
        { label: "Right step length", value: asym.rightStepAverageM, unit: "m" },
      ],
      target: { type: "individualized", minimum: 0, maximum: 8, unit: "%", sourceLabel: "Athlete's own bilateral symmetry" },
      deviation: { percentage: asym.stepLengthAsymmetryPct, direction: (asym.leftStepAverageM ?? 0) > (asym.rightStepAverageM ?? 0) ? "left_higher" : "right_higher" },
      evidence: [{ label: "Trend", value: asym.trend.replace(/_/g, " "), kind: "context" }, ...ownProgression],
      reasoning: ["Left/right step-length difference exceeded the meaningful-difference threshold."],
      possibleTechnicalAssociations: ["Unilateral force-application deficit", "Compensation from a prior injury"],
      possiblePhysicalAssociations: [disclaimer("Unilateral lower-body strength", ["Gluteals", "Hamstrings", "Quadriceps"])],
      recommendations: [trunkPositionCueRecommendation()],
      dataQualityWarnings,
    });
  }
  if (lr?.meaningfulStepTimeAsymmetry && lr.stepTimeAsymmetryPct != null) {
    limiters.push({
      id: "acceleration-step-time-asymmetry",
      type: "acceleration_step_time_asymmetry",
      status: "detected",
      rank: limiters.length + 1,
      title: "Left/right step-timing imbalance",
      summary: `Step time differs ${lr.stepTimeAsymmetryPct.toFixed(1)}% between sides (L ${lr.leftStepTimeS?.toFixed(3) ?? "—"} s, R ${lr.rightStepTimeS?.toFixed(3) ?? "—"} s).`,
      impact: { level: lr.stepTimeAsymmetryPct > 15 ? "high" : "moderate", score: Math.min(1, lr.stepTimeAsymmetryPct / 20), explanation: "A persistent timing gap between sides can slow overall turnover." },
      confidence: { measurement: 0.55, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Step-time asymmetry from detected contacts; a small sample." },
      measuredValues: [
        { label: "Left step time", value: lr.leftStepTimeS, unit: "s" },
        { label: "Right step time", value: lr.rightStepTimeS, unit: "s" },
      ],
      target: { type: "individualized", minimum: 0, maximum: 8, unit: "%", sourceLabel: "Athlete's own bilateral symmetry" },
      deviation: { percentage: lr.stepTimeAsymmetryPct, direction: (lr.leftStepTimeS ?? 0) > (lr.rightStepTimeS ?? 0) ? "left_higher" : "right_higher" },
      evidence: [
        { label: "Left velocity contribution", value: `${lr.leftVelocityContributionMps.toFixed(2)} m/s`, kind: "measurement" },
        { label: "Right velocity contribution", value: `${lr.rightVelocityContributionMps.toFixed(2)} m/s`, kind: "measurement" },
        ...ownProgression,
      ],
      reasoning: ["Left/right step-time difference exceeded the meaningful-difference threshold."],
      possibleTechnicalAssociations: ["Uneven rhythm between sides", "A lingering compensation from a prior issue"],
      possiblePhysicalAssociations: [disclaimer("Unilateral reactive strength", ["Gastrocnemius", "Soleus"])],
      recommendations: [trunkPositionCueRecommendation()],
      dataQualityWarnings,
    });
  }

  // 11. Inconsistent rhythm — high step-to-step timing variance, independent
  // of any left/right pattern.
  if (analysis.steps.length >= 5) {
    const stepTimes = analysis.steps.map((s) => s.stepTimeS);
    const avgStepTime = mean(stepTimes);
    const cv = avgStepTime && avgStepTime > 0 ? stddev(stepTimes) / avgStepTime : 0;
    if (cv > 0.18) {
      limiters.push({
        id: "acceleration-inconsistent-rhythm",
        type: "acceleration_inconsistent_rhythm",
        status: "detected",
        rank: limiters.length + 1,
        title: "Inconsistent step rhythm",
        summary: `Step-to-step timing varied by ${(cv * 100).toFixed(0)}% of the mean, more than expected for a smooth acceleration.`,
        impact: { level: "moderate", score: Math.min(1, cv), explanation: "Uneven rhythm can indicate compensation, fatigue, or a technical breakdown mid-zone." },
        confidence: { measurement: 0.5, reasoning: 0.45, overall: 0.4, label: "low", explanation: "Sensitive to any single missed or mistimed contact detection." },
        measuredValues: [{ label: "Step-time variability", value: cv * 100, unit: "% CV" }],
        target: { type: "unavailable" },
        deviation: { direction: null },
        evidence: [...ownProgression],
        reasoning: ["Coefficient of variation in step time exceeded the smooth-acceleration threshold."],
        possibleTechnicalAssociations: ["A mistimed step or brief loss of rhythm", "Fatigue within the sampled zone"],
        possiblePhysicalAssociations: [],
        recommendations: [],
        dataQualityWarnings,
      });
    }
  }

  // 12. Poor velocity progression overall — real drops or outlier spikes in
  // the velocity/acceleration curves (distinct from the first-interval-only
  // check in #1).
  if (analysis.progression && !analysis.progression.smoothness.smooth && analysis.progression.smoothness.velocityDrops.length > 0) {
    const drop = analysis.progression.smoothness.velocityDrops[0];
    limiters.push({
      id: "acceleration-poor-velocity-progression",
      type: "acceleration_poor_velocity_progression",
      status: "detected",
      rank: limiters.length + 1,
      title: "Velocity progression is not smooth",
      summary: `Velocity dropped ${Math.abs(drop.dropMps).toFixed(2)} m/s from the previous step at step ${drop.stepNumber} (${drop.distanceM.toFixed(1)} m) — not the expected steady rise.`,
      impact: { level: "moderate", score: 0.5, explanation: "A real velocity drop during acceleration (not measurement noise) usually reflects a technical break." },
      confidence: { measurement: 0.5, reasoning: 0.45, overall: 0.4, label: "low", explanation: "A single-step drop could reflect a detection error rather than a true velocity loss." },
      measuredValues: [{ label: "Velocity change", value: drop.dropMps, unit: "m/s", detail: `step ${drop.stepNumber}` }],
      target: { type: "unavailable" },
      deviation: { direction: null },
      evidence: [{ label: "Total drops observed", value: String(analysis.progression.smoothness.velocityDrops.length), kind: "measurement" }, ...ownProgression],
      reasoning: ["At least one step showed a real velocity decrease rather than the expected continued rise."],
      possibleTechnicalAssociations: ["A mistimed or braking step", "Loss of forward posture mid-zone"],
      possiblePhysicalAssociations: [],
      recommendations: [],
      dataQualityWarnings,
    });
  }

  // 13. Acceleration plateau before the end of the observed segment.
  if (analysis.intervalMetrics.length >= 2) {
    const last = analysis.intervalMetrics[analysis.intervalMetrics.length - 1];
    if (last.accelerationMps2 != null && last.accelerationMps2 < 0.3 && last.velocityMps != null && analysis.peakVelocityMps != null) {
      const gap = analysis.peakVelocityMps - last.velocityMps;
      if (gap > 0.15) {
        limiters.push({
          id: "acceleration-plateau-before-segment-end",
          type: "acceleration_plateau_before_segment_end",
          status: "detected",
          rank: limiters.length + 1,
          title: "Acceleration plateaus before the end of the observed segment",
          summary: `Velocity gain nearly stopped in the final interval (${last.accelerationMps2.toFixed(2)} m/s²) before reaching the observed peak.`,
          impact: { level: "low", score: 0.35, explanation: "May reflect the natural approach to top speed, or an early plateau depending on distance calibrated." },
          confidence: { measurement: 0.55, reasoning: 0.4, overall: 0.35, label: "low", explanation: "Cannot distinguish a natural velocity plateau from a limiting one without more distance calibrated." },
          measuredValues: [{ label: "Final interval acceleration", value: last.accelerationMps2, unit: "m/s²" }],
          target: { type: "unavailable" },
          deviation: { direction: null },
          evidence: [{ label: "Final interval", value: `${last.startM}–${last.endM} m`, kind: "measurement" }, ...ownProgression],
          reasoning: ["The last calibrated interval showed near-zero acceleration."],
          possibleTechnicalAssociations: ["Approaching maximum velocity within the calibrated distance"],
          possiblePhysicalAssociations: [],
          recommendations: [],
          dataQualityWarnings,
        });
      }
    }
  }

  return limiters
    .sort((a, b) => b.impact.score - a.impact.score)
    .slice(0, MAX_LIMITERS)
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

function excessiveEarlyStepLength(
  valueM: number,
  ratio: number,
  warnings: string[],
  ownProgression: { label: string; value: string; kind: "comparison" }[],
  rank: number,
): AccelerationLimiter {
  return {
    id: "acceleration-excessive-early-step-length",
    type: "acceleration_excessive_early_step_length",
    status: "detected",
    rank,
    title: "Excessive early reaching",
    summary: `First step measured ${valueM.toFixed(2)} m (${ratio.toFixed(2)}× leg length).`,
    impact: { level: "moderate", score: 0.5, explanation: "An overly long first step often means reaching rather than driving, reducing force application." },
    confidence: { measurement: 0.6, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Single-step measurement; treat as directional." },
    measuredValues: [{ label: "First step length", value: valueM, unit: "m" }, { label: "Leg-length ratio", value: ratio, unit: "×" }],
    target: { type: "individualized", minimum: 0.75, maximum: 1.35, unit: "×leg length", sourceLabel: "Leg-length-relative band" },
    deviation: { direction: "above" },
    evidence: [{ label: "First step", value: `${valueM.toFixed(2)} m`, kind: "measurement" }, ...ownProgression],
    reasoning: ["First step length exceeded the leg-length-relative band."],
    possibleTechnicalAssociations: ["Reaching for the first step instead of driving down and back"],
    possiblePhysicalAssociations: [disclaimer("Drive-phase mechanics", ["Gluteals", "Hip flexors"])],
    recommendations: [fallingStartsRecommendation()],
    dataQualityWarnings: warnings,
  };
}

function shortEarlyStepLength(
  valueM: number,
  ratio: number,
  warnings: string[],
  ownProgression: { label: string; value: string; kind: "comparison" }[],
  rank: number,
): AccelerationLimiter {
  return {
    id: "acceleration-short-early-step-length",
    type: "acceleration_short_early_step_length",
    status: "detected",
    rank,
    title: "Short early steps",
    summary: `First step measured ${valueM.toFixed(2)} m (${ratio.toFixed(2)}× leg length).`,
    impact: { level: "moderate", score: 0.5, explanation: "An overly short first step can indicate insufficient drive or a conservative, upright start." },
    confidence: { measurement: 0.6, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Single-step measurement; treat as directional." },
    measuredValues: [{ label: "First step length", value: valueM, unit: "m" }, { label: "Leg-length ratio", value: ratio, unit: "×" }],
    target: { type: "individualized", minimum: 0.75, maximum: 1.35, unit: "×leg length", sourceLabel: "Leg-length-relative band" },
    deviation: { direction: "below" },
    evidence: [{ label: "First step", value: `${valueM.toFixed(2)} m`, kind: "measurement" }, ...ownProgression],
    reasoning: ["First step length fell below the leg-length-relative band."],
    possibleTechnicalAssociations: ["Insufficient hip/knee extension at push-off", "Overly upright starting posture"],
    possiblePhysicalAssociations: [disclaimer("Drive-phase power", ["Gluteals", "Quadriceps"])],
    recommendations: [wallSwitchRecommendation()],
    dataQualityWarnings: warnings,
  };
}

// --- Recommendation catalogue (Part 6). Each function returns one candidate;
// `buildAccelerationRecommendations` selects 2-3 from the top-ranked
// limiters, deduplicated by type. Never a full program.

function fallingStartsRecommendation(): LimiterRecommendation {
  return {
    type: "drill",
    title: "Falling starts",
    focus: "Aggressive forward projection off an unstable lean",
    why: "Reinforces driving the first steps low and long without a block or blank-cue start.",
    observe: "Shin angle at the first two ground contacts",
  };
}

function heavySledPushRecommendation(): LimiterRecommendation {
  return {
    type: "resisted_sprint",
    title: "Heavy sled push",
    focus: "Force application during the drive phase",
    why: "Heavy loads emphasize horizontal force production and extend the drive phase.",
    caution: "Keep load heavy enough to slow the athlete meaningfully, but not so heavy that posture collapses.",
  };
}

function resistedAccelerationRecommendation(): LimiterRecommendation {
  return {
    type: "resisted_sprint",
    title: "Resisted acceleration (band or light sled)",
    focus: "Horizontal force production while preserving sprint mechanics",
    why: "Lighter resistance than a heavy sled push keeps stride mechanics closer to free sprinting while still overloading acceleration.",
  };
}

function wicketRecommendation(): LimiterRecommendation {
  return {
    type: "wicket",
    title: "Low mini-hurdle progression",
    focus: "Ground-contact rhythm and turnover in the acceleration phase",
    why: "Constrains ground time and reinforces quicker turnover without overreaching for length.",
  };
}

function lowAngleProjectionRecommendation(): LimiterRecommendation {
  return {
    type: "technical_focus",
    title: "Low-angle projection drill",
    focus: "Sustaining forward shin/trunk angle before rising",
    why: "Delays the rise to upright so step length has room to develop before frequency takes over.",
  };
}

function wallSwitchRecommendation(): LimiterRecommendation {
  return {
    type: "drill",
    title: "Wall drill (switches)",
    focus: "Full hip/knee extension at push-off",
    why: "Isolates drive-leg extension against a fixed surface to build first-step amplitude.",
  };
}

function trunkPositionCueRecommendation(): LimiterRecommendation {
  return {
    type: "technical_focus",
    title: "Bilateral drive cue",
    focus: "Even force application on both sides through the drive phase",
    why: "A simple side-by-side video comparison drill to make the imbalance visible to the athlete.",
    caution: "Rule out injury/soreness on the shorter side before assuming it is purely technical.",
  };
}

function calfReactiveStrengthRecommendation(): LimiterRecommendation {
  return {
    type: "plyometric_emphasis",
    title: "Calf/soleus reactive-strength work",
    focus: "Short-contact reactive strength through the ankle",
    why: "Commonly associated with the ability to raise step frequency without lengthening ground-contact time.",
  };
}

function hipExtensionStrengthRecommendation(): LimiterRecommendation {
  return {
    type: "strength_emphasis",
    title: "Hip-extension strength emphasis",
    focus: "Posterior-chain force production for the drive phase",
    why: "Commonly associated with the ability to sustain forward force production across early steps.",
  };
}

function frontSideMechanicsRecommendation(): LimiterRecommendation {
  return {
    type: "technical_focus",
    title: "Front-side mechanics drill",
    focus: "Knee drive and foot recovery ahead of the body",
    why: "Reinforces a front-side recovery pattern, which is commonly associated with smoother frequency development.",
  };
}

function horizontalPlyometricRecommendation(): LimiterRecommendation {
  return {
    type: "plyometric_emphasis",
    title: "Horizontal plyometric emphasis (bounds, broad jumps)",
    focus: "Horizontal force production and elastic power",
    why: "Horizontally-oriented (not vertical) plyometrics transfer more directly to acceleration mechanics.",
  };
}

// --- Part 14 additions: mechanics-driven recommendation categories not
// covered by Phase 2's catalogue (mobility screening, additional physical
// testing, and unilateral strength/jump testing). Still no weekly schedule
// or exact loading prescription — a suggestion to investigate, not a program.

function mobilityScreeningRecommendation(): LimiterRecommendation {
  return {
    type: "assessment",
    title: "Ankle dorsiflexion / hip-extension mobility screen",
    focus: "Ruling out a mobility restriction as a contributing factor",
    why: "A restricted range at the ankle or hip can shape the postures observed here independent of strength.",
    observe: "Passive and active range compared side to side.",
  };
}

function additionalPhysicalTestingRecommendation(): LimiterRecommendation {
  return {
    type: "testing",
    title: "Additional physical testing",
    focus: "Distinguishing a strength, mobility, or purely technical explanation",
    why: "Video alone cannot separate these causes; a simple field test (e.g. isometric or jump-based) narrows the explanation before prescribing a fix.",
    caution: "Video analysis cannot confirm the underlying physical cause — this is a suggestion to test, not a finding.",
  };
}

function lrJumpTestingRecommendation(): LimiterRecommendation {
  return {
    type: "testing",
    title: "Left/right unilateral strength or jump testing",
    focus: "Quantifying whether a side-to-side difference exists outside of sprinting",
    why: "A single-leg jump or strength test confirms (or rules out) whether the asymmetry seen on video is present under controlled conditions.",
  };
}

function ankleRangeScreeningRecommendation(): LimiterRecommendation {
  return {
    type: "assessment",
    title: "Ankle-range screening",
    focus: "Checking available dorsiflexion range at the support ankle",
    why: "A near-vertical shin very early in ground contact can sometimes reflect available ankle range rather than a technical choice.",
  };
}

function trunkControlRecommendation(): LimiterRecommendation {
  return {
    type: "technical_focus",
    title: "Trunk-control cue and drill",
    focus: "Maintaining a consistent trunk angle through the drive phase",
    why: "A simple postural cue paired with video feedback can help stabilize a fluctuating or prematurely-rising trunk position.",
  };
}

/**
 * Two or three focused interventions (Part 6), drawn only from the top-ranked
 * limiter(s) and deduplicated by recommendation title — never a full program.
 */
export function buildAccelerationRecommendations(limiters: AccelerationLimiter[]): LimiterRecommendation[] {
  const seen = new Set<string>();
  const picked: LimiterRecommendation[] = [];
  for (const limiter of limiters.slice(0, 3)) {
    for (const rec of limiter.recommendations) {
      if (seen.has(rec.title)) continue;
      seen.add(rec.title);
      picked.push(rec);
      if (picked.length >= 3) return picked;
    }
  }
  return picked;
}

// Exported so tests / future limiters can reference the catalogue directly
// without re-deriving a recommendation from a synthetic limiter.
export const ACCELERATION_RECOMMENDATION_CATALOGUE = {
  fallingStarts: fallingStartsRecommendation,
  heavySledPush: heavySledPushRecommendation,
  resistedAcceleration: resistedAccelerationRecommendation,
  wicket: wicketRecommendation,
  lowAngleProjection: lowAngleProjectionRecommendation,
  wallSwitch: wallSwitchRecommendation,
  trunkPositionCue: trunkPositionCueRecommendation,
  calfReactiveStrength: calfReactiveStrengthRecommendation,
  hipExtensionStrength: hipExtensionStrengthRecommendation,
  frontSideMechanics: frontSideMechanicsRecommendation,
  horizontalPlyometric: horizontalPlyometricRecommendation,
  mobilityScreening: mobilityScreeningRecommendation,
  additionalPhysicalTesting: additionalPhysicalTestingRecommendation,
  lrJumpTesting: lrJumpTestingRecommendation,
  ankleRangeScreening: ankleRangeScreeningRecommendation,
  trunkControl: trunkControlRecommendation,
};

export {
  fallingStartsRecommendation,
  heavySledPushRecommendation,
  resistedAccelerationRecommendation,
  wicketRecommendation,
  lowAngleProjectionRecommendation,
  wallSwitchRecommendation,
  trunkPositionCueRecommendation,
  calfReactiveStrengthRecommendation,
  hipExtensionStrengthRecommendation,
  frontSideMechanicsRecommendation,
  horizontalPlyometricRecommendation,
  mobilityScreeningRecommendation,
  additionalPhysicalTestingRecommendation,
  lrJumpTestingRecommendation,
  ankleRangeScreeningRecommendation,
  trunkControlRecommendation,
  disclaimer,
};
