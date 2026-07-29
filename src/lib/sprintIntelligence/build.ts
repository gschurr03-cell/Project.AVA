/**
 * buildSprintIntelligence — the deterministic Sprint Intelligence engine.
 *
 * It composes an explanation report from the authoritative Limiting Factors output plus the
 * already-computed session context. It NEVER measures anything, never invents a target the
 * engine did not produce, and never asserts a diagnosis. Given identical input (including the
 * injected `generatedAt`) it returns byte-identical output.
 *
 * Scientific-honesty stance encoded here: AVA has no validated individualized step-length /
 * step-frequency / velocity-dominance model (the engine reports these as `unavailableModels`).
 * So the velocity-relationship conclusion is classified `insufficient_evidence` rather than
 * claiming length- or frequency-dominance — we explain WHY it cannot be attributed instead of
 * fabricating a target comparison.
 */

import type { Limiter } from "@/lib/limitingFactors/types";
import { ASYMMETRY_BANDS, MIN_SIDE_SAMPLES } from "@/lib/limitingFactors/thresholds";
import { SPRINT_INTELLIGENCE_VERSION } from "./version";
import {
  alternativeExplanations,
  conclusionAssumptions,
  conclusionChangeConditions,
  recommendationDoesNotProve,
  basisSourceLabel,
  PHYSICAL_DISCLAIMER,
  ASSOCIATION_NOT_MEASURED,
} from "./templates";
import type {
  SprintIntelligenceInput,
  SprintIntelligenceReport,
  IntelligenceConclusion,
  IntelligenceEvidenceItem,
  IntelligenceConfidence,
  IntelligenceAssumption,
  IntelligenceMissingInput,
  IntelligenceChangeCondition,
  ComparisonBasis,
  SprintIntelligenceStatus,
} from "./types";

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const uniq = (xs: string[]) => Array.from(new Set(xs));

/** Reasons confidence is high / limited for a limiter, given the session context. */
function confidenceRaisesReduces(
  limiter: Limiter,
  ctx: SprintIntelligenceInput["context"],
): { raises: string[]; reduces: string[] } {
  const raises: string[] = [];
  const reduces: string[] = [];

  if (ctx.calibrationConfirmed) raises.push("Calibration was confirmed for this session.");
  if (ctx.measurementConfidence === "high") raises.push("Pose and measurement quality remained high.");
  if (ctx.validStepCount != null && ctx.validStepCount >= 8) raises.push(`${ctx.validStepCount} valid steps were analyzed.`);
  if ((limiter.confidence.reasoning ?? 0) >= 0.7) raises.push("The measured difference is clear relative to step-to-step noise.");

  if (ctx.measurementConfidence === "low" || ctx.measurementConfidence === "medium")
    reduces.push("Measurement/tracking quality was not high, which limits measured-value reliability.");
  if (ctx.validStepCount != null && ctx.validStepCount < 6) reduces.push(`Only ${ctx.validStepCount} valid steps were available.`);
  if (!limiter.target.type || limiter.target.type === "research_reference")
    reduces.push("The comparison band is provisional and pending validation against ground truth.");
  if (!ctx.historicalBaselineAvailable) reduces.push("No previous athlete baseline was available for comparison.");
  for (const w of limiter.dataQualityWarnings) reduces.push(w);

  return { raises: uniq(raises), reduces: uniq(reduces) };
}

/** Turn a ranked limiter into an intelligence conclusion (reuses its evidence + confidence). */
function conclusionFromLimiter(
  limiter: Limiter,
  ctx: SprintIntelligenceInput["context"],
  isPrimary: boolean,
): IntelligenceConclusion {
  const measured: IntelligenceEvidenceItem[] = limiter.measuredValues.map((mv) => ({
    label: mv.label,
    value: mv.value == null ? "—" : `${mv.value} ${mv.unit}${mv.detail ? ` (${mv.detail})` : ""}`,
    kind: "measurement",
    weight: 0.6,
  }));

  // Evidence FOR — weight the comparison (effect size) above raw measurements.
  const evidenceFor: IntelligenceEvidenceItem[] = limiter.evidence
    .map((e) => ({
      label: e.label,
      value: e.value,
      kind: e.kind,
      weight: e.kind === "comparison" ? (/asymmetry|difference/i.test(e.label) ? 0.95 : 0.8) : e.kind === "measurement" ? 0.6 : 0.3,
    }))
    .sort((a, b) => b.weight - a.weight);

  const { raises, reduces } = confidenceRaisesReduces(limiter, ctx);

  // Evidence AGAINST — the concrete confidence-reducers, shown as counter-evidence.
  const evidenceAgainst: IntelligenceEvidenceItem[] = reduces.map((r) => ({
    label: "Reduces confidence",
    value: r,
    kind: "context",
    weight: 0.7,
  }));

  const comparedWith: ComparisonBasis[] = [
    {
      metricLabel: limiter.type.includes("frequency") ? "Left–right step frequency" : "Left–right step length",
      basis: "within_athlete_symmetry",
      sourceLabel: basisSourceLabel("within_athlete_symmetry"),
      validated: false,
      rangeText: "Balanced ≤3% · low 3–6% · moderate 6–10% · high >10%",
      note: limiter.target.explanation ?? null,
    },
  ];

  const confidence: IntelligenceConfidence = {
    measurement: limiter.confidence.measurement,
    reasoning: limiter.confidence.reasoning,
    overall: limiter.confidence.overall,
    label: limiter.confidence.label,
    explanation: limiter.confidence.explanation,
    raises,
    reduces,
  };

  return {
    id: `conclusion-${limiter.id}`,
    limiterId: limiter.id,
    classification: limiter.type.includes("asymmetry") ? "asymmetry" : isPrimary ? "primary_limiter" : "supporting_limiter",
    title: limiter.title,
    conciseSummary: limiter.summary,
    detailedExplanation: limiter.reasoning.join(" "),
    measured,
    comparedWith,
    evidenceFor,
    evidenceAgainst,
    neutralContext: ([
      ctx.validStepCount != null
        ? { label: "Valid steps analyzed", value: `${ctx.validStepCount}`, kind: "context", weight: 0.3 }
        : null,
      ctx.zoneDistanceM != null
        ? { label: "Measured zone", value: `${round(ctx.zoneDistanceM, 1)} m`, kind: "context", weight: 0.3 }
        : null,
    ] as (IntelligenceEvidenceItem | null)[]).filter((x): x is IntelligenceEvidenceItem => x != null),
    interpretation: limiter.reasoning[0] ?? limiter.summary,
    alternativeExplanations: alternativeExplanations(limiter.type),
    confidence,
    technicalAssociations: limiter.possibleTechnicalAssociations.length
      ? [
          {
            category: "Possible technical associations",
            items: limiter.possibleTechnicalAssociations,
            disclaimer: ASSOCIATION_NOT_MEASURED,
            directlyMeasured: false,
          },
        ]
      : [],
    physicalAssociations: limiter.possiblePhysicalAssociations.map((pa) => ({
      category: pa.category,
      items: pa.muscleGroups ?? [],
      muscleGroups: pa.muscleGroups,
      disclaimer: pa.disclaimer || PHYSICAL_DISCLAIMER,
      directlyMeasured: false as const,
    })),
    recommendations: limiter.recommendations.slice(0, 3).map((r) => ({
      limiterId: limiter.id,
      type: r.type,
      title: r.title,
      focus: r.focus,
      why: r.why,
      observe: r.observe ?? null,
      doesNotProve: recommendationDoesNotProve(limiter.type),
    })),
    assumptions: conclusionAssumptions(limiter.type),
    limitations: limiter.dataQualityWarnings,
    changeConditions: conclusionChangeConditions(limiter.type),
  };
}

/**
 * Velocity-relationship conclusion. Honest by construction: without a validated individualized
 * expectation model, dominance (length vs frequency) cannot be attributed, so this is
 * classified `insufficient_evidence` and explains why rather than guessing.
 */
function velocityRelationshipConclusion(ctx: SprintIntelligenceInput["context"]): IntelligenceConclusion | null {
  const m = ctx.metrics;
  if (m.avgVelocityMps == null || m.avgStepLengthM == null || m.stepFrequencyHz == null) return null;

  const measured: IntelligenceEvidenceItem[] = [
    { label: "Average velocity", value: `${round(m.avgVelocityMps)} m/s`, kind: "measurement", weight: 0.9 },
    { label: "Average step length", value: `${round(m.avgStepLengthM)} m`, kind: "measurement", weight: 0.7 },
    { label: "Step frequency", value: `${round(m.stepFrequencyHz)} Hz`, kind: "measurement", weight: 0.7 },
    ...(m.peakVelocityMps != null
      ? [{ label: "Peak velocity", value: `${round(m.peakVelocityMps)} m/s`, kind: "measurement" as const, weight: 0.6 }]
      : []),
  ];

  return {
    id: "conclusion-velocity-relationship",
    limiterId: null,
    classification: "insufficient_evidence",
    title: "Velocity relationship",
    conciseSummary:
      "AVA cannot yet attribute average velocity more to step length or to step frequency for this athlete.",
    detailedExplanation:
      "Average velocity reflects both how far the athlete travels per step and how quickly steps are taken. Deciding which is the stronger constraint requires an individualized expectation for this athlete's step length and frequency, which AVA does not have validated yet.",
    measured,
    comparedWith: [
      {
        metricLabel: "Step length & frequency vs individualized expectation",
        basis: "unavailable",
        sourceLabel: basisSourceLabel("unavailable"),
        validated: false,
        rangeText: null,
        note: "An individualized, biomechanics-aware expectation model is required to attribute length- vs frequency-dominance.",
      },
    ],
    evidenceFor: measured,
    evidenceAgainst: [],
    neutralContext: [],
    interpretation:
      "Because no validated per-athlete target exists, AVA reports the measured values without claiming which factor limited velocity. A within-athlete historical baseline or a coach-defined target would let AVA make this comparison.",
    alternativeExplanations: [],
    confidence: {
      measurement: ctx.measurementConfidence === "high" ? 0.9 : ctx.measurementConfidence === "medium" ? 0.65 : 0.4,
      reasoning: null,
      overall: null,
      label: "insufficient",
      explanation:
        "The underlying values are measured, but the dominance interpretation has no validated comparison model, so no confidence is assigned to it.",
      raises: [],
      reduces: ["No individualized or historical step-length / frequency expectation is available."],
    },
    technicalAssociations: [],
    physicalAssociations: [],
    recommendations: [],
    assumptions: [],
    limitations: ["Dominance between step length and frequency is not attributable without a validated expectation model."],
    changeConditions: [
      "A per-athlete historical baseline is established from repeated sessions.",
      "A coach-defined step-length or frequency target is entered.",
    ],
  };
}

/** Peak-vs-average velocity relationship — a careful contextual finding (never a fatigue call). */
function peakVsAverageConclusion(ctx: SprintIntelligenceInput["context"]): IntelligenceConclusion | null {
  const m = ctx.metrics;
  if (m.avgVelocityMps == null || m.peakVelocityMps == null) return null;
  const gap = round(m.peakVelocityMps - m.avgVelocityMps);
  const gapPct = m.avgVelocityMps > 0 ? round((gap / m.avgVelocityMps) * 100, 1) : null;
  const aligned = gapPct != null && gapPct < 3;

  return {
    id: "conclusion-peak-vs-average",
    limiterId: null,
    classification: "contextual_finding",
    title: aligned ? "Peak and average velocity closely aligned" : "Peak-to-average velocity gap",
    conciseSummary: aligned
      ? "The fastest valid step interval was close to the zone average."
      : `The fastest valid step interval was ${gap} m/s (${gapPct}%) faster than the zone average.`,
    detailedExplanation: aligned
      ? "Peak and average velocity being close means the athlete's speed was fairly even across the measured zone."
      : "A gap between peak and average means the single fastest valid interval was meaningfully faster than the whole-zone average. A longer zone or repeated sessions would be required to determine whether this reflects normal variation or reduced velocity maintenance.",
    measured: [
      { label: "Average velocity", value: `${round(m.avgVelocityMps)} m/s`, kind: "measurement", weight: 0.8 },
      { label: "Peak velocity", value: `${round(m.peakVelocityMps)} m/s`, kind: "measurement", weight: 0.8 },
      { label: "Peak − average", value: `${gap} m/s${gapPct != null ? ` (${gapPct}%)` : ""}`, kind: "comparison", weight: 0.7 },
    ],
    comparedWith: [],
    evidenceFor: [],
    evidenceAgainst: [],
    neutralContext:
      ctx.zoneDistanceM != null
        ? [{ label: "Measured zone", value: `${round(ctx.zoneDistanceM, 1)} m`, kind: "context", weight: 0.3 }]
        : [],
    interpretation: aligned
      ? "Speed was maintained fairly evenly across the measured zone."
      : "The gap describes zone variation only; it does not indicate fatigue or speed-endurance from a short measured zone alone.",
    alternativeExplanations: aligned
      ? []
      : ["Normal within-zone variation.", "The peak interval fell on a favourable step.", "A short measured zone amplifying the gap."],
    confidence: {
      measurement: ctx.measurementConfidence === "high" ? 0.9 : ctx.measurementConfidence === "medium" ? 0.65 : 0.4,
      reasoning: null,
      overall: null,
      label: "insufficient",
      explanation: "Peak and average are measured; interpreting the gap as fatigue or endurance is not supported by a short zone.",
      raises: [],
      reduces: ["A short measured zone limits interpretation of velocity maintenance."],
    },
    technicalAssociations: [],
    physicalAssociations: [],
    recommendations: [],
    assumptions: [],
    limitations: ["Fatigue and speed-endurance cannot be concluded from a single short measured zone."],
    changeConditions: ["A longer measured zone or repeated sessions clarify whether the gap is variation or maintenance."],
  };
}

/** Deterministic performance strengths — only where a REAL comparison supports them. */
function buildStrengths(ctx: SprintIntelligenceInput["context"]): IntelligenceConclusion[] {
  const out: IntelligenceConclusion[] = [];
  const sym = ctx.symmetry;

  const balancedStrength = (
    id: string,
    metricLabel: string,
    diffPct: number,
    what: string,
  ): IntelligenceConclusion => ({
    id,
    limiterId: null,
    classification: "performance_strength",
    title: `Balanced ${metricLabel.toLowerCase()}`,
    conciseSummary: `Left and right ${metricLabel.toLowerCase()} were balanced (${round(diffPct, 1)}% difference).`,
    detailedExplanation: `${what} A small left–right difference within the provisional balanced band is a positive, and is a within-athlete comparison that does not depend on any external target model.`,
    measured: [{ label: `${metricLabel} asymmetry`, value: `${round(diffPct, 1)}%`, kind: "comparison", weight: 0.6 }],
    comparedWith: [
      {
        metricLabel,
        basis: "within_athlete_symmetry",
        sourceLabel: basisSourceLabel("within_athlete_symmetry"),
        validated: false,
        rangeText: "Balanced ≤3% (provisional)",
        note: null,
      },
    ],
    evidenceFor: [{ label: `${metricLabel} asymmetry`, value: `${round(diffPct, 1)}%`, kind: "comparison", weight: 0.6 }],
    evidenceAgainst: [],
    neutralContext: [],
    interpretation: `${metricLabel} was balanced across the valid measured steps.`,
    alternativeExplanations: [],
    confidence: {
      measurement: ctx.measurementConfidence === "high" ? 0.9 : ctx.measurementConfidence === "medium" ? 0.65 : 0.4,
      reasoning: 0.6,
      overall: ctx.measurementConfidence === "high" ? 0.7 : 0.55,
      label: ctx.measurementConfidence === "high" ? "high" : "moderate",
      explanation: "Balance is a within-athlete measurement; the provisional band is clearly labelled.",
      raises: ctx.calibrationConfirmed ? ["Calibration was confirmed."] : [],
      reduces: ["The symmetry band is provisional, pending validation."],
    },
    technicalAssociations: [],
    physicalAssociations: [],
    recommendations: [],
    assumptions: [],
    limitations: ["The symmetry band is provisional."],
    changeConditions: ["Additional valid steps could reveal a difference not visible in the current sample."],
  });

  if (
    sym &&
    sym.stepLengthDiffPct != null &&
    sym.stepLengthDiffPct < ASYMMETRY_BANDS.negligiblePct.value &&
    sym.minSideSamples >= MIN_SIDE_SAMPLES.value
  ) {
    out.push(
      balancedStrength(
        "strength-step-length-balance",
        "Step length",
        sym.stepLengthDiffPct,
        "The athlete produced similar horizontal displacement on both sides.",
      ),
    );
  }
  if (
    sym &&
    sym.stepFrequencyDiffPct != null &&
    sym.stepFrequencyDiffPct < ASYMMETRY_BANDS.negligiblePct.value &&
    sym.minSideSamples >= MIN_SIDE_SAMPLES.value
  ) {
    out.push(
      balancedStrength(
        "strength-step-frequency-balance",
        "Step frequency",
        sym.stepFrequencyDiffPct,
        "The athlete maintained similar turnover on both sides.",
      ),
    );
  }

  // High measurement quality — a data-quality strength (compared against AVA's own bar).
  if (ctx.measurementConfidence === "high" && ctx.calibrationConfirmed && (ctx.validStepCount ?? 0) >= 8) {
    out.push({
      id: "strength-measurement-quality",
      limiterId: null,
      classification: "performance_strength",
      title: "High measurement quality",
      conciseSummary: `Calibration was confirmed and ${ctx.validStepCount} valid steps were tracked at high pose quality.`,
      detailedExplanation: "High measurement quality means the metrics for this session are more trustworthy than a typical recording — a strength of the capture, not of the athlete's mechanics.",
      measured: [{ label: "Valid steps", value: `${ctx.validStepCount}`, kind: "context", weight: 0.4 }],
      comparedWith: [],
      evidenceFor: [{ label: "Measurement confidence", value: "High", kind: "context", weight: 0.5 }],
      evidenceAgainst: [],
      neutralContext: [],
      interpretation: "The capture conditions supported reliable measurement.",
      alternativeExplanations: [],
      confidence: {
        measurement: 0.9,
        reasoning: 0.8,
        overall: 0.8,
        label: "high",
        explanation: "Directly reflects confirmed calibration, valid-step count, and pose quality.",
        raises: ["Calibration confirmed.", `${ctx.validStepCount} valid steps.`],
        reduces: [],
      },
      technicalAssociations: [],
      physicalAssociations: [],
      recommendations: [],
      assumptions: [],
      limitations: [],
      changeConditions: [],
    });
  }

  return out;
}

function profileCompletenessPct(athlete: SprintIntelligenceInput["context"]["athlete"]): number {
  if (!athlete) return 0;
  const fields = [
    athlete.heightCm != null,
    athlete.legLengthCm != null || athlete.trochanterHeightM != null,
    athlete.weightKg != null,
    athlete.event != null,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function buildCounterEvidence(input: SprintIntelligenceInput): IntelligenceEvidenceItem[] {
  const ctx = input.context;
  const items: IntelligenceEvidenceItem[] = [];
  if (ctx.validStepCount != null && ctx.validStepCount < 6)
    items.push({ label: "Limited data", value: `Only ${ctx.validStepCount} valid steps were available.`, kind: "context", weight: 0.9 });
  if (!ctx.historicalBaselineAvailable)
    items.push({ label: "No baseline", value: "No previous athlete baseline was available.", kind: "context", weight: 0.7 });
  if (input.limitingFactors.limiters.length > 0)
    items.push({ label: "Provisional model", value: "The comparison bands used are provisional, pending validation.", kind: "context", weight: 0.7 });
  if (profileCompletenessPct(ctx.athlete) < 75)
    items.push({ label: "Incomplete profile", value: "The athlete profile is incomplete, which limits individualized interpretation.", kind: "context", weight: 0.6 });
  if (ctx.measurementConfidence === "low" || ctx.measurementConfidence === "medium")
    items.push({ label: "Measurement quality", value: "Tracking/measurement quality was not high.", kind: "context", weight: 0.6 });
  if (ctx.zoneDistanceM != null && ctx.zoneDistanceM < 20)
    items.push({ label: "Short zone", value: `The measured zone (${round(ctx.zoneDistanceM, 1)} m) is short, which limits interpretation.`, kind: "context", weight: 0.5 });
  return items.sort((a, b) => b.weight - a.weight);
}

function buildMissingInputs(ctx: SprintIntelligenceInput["context"], hasLimiters: boolean): IntelligenceMissingInput[] {
  const out: IntelligenceMissingInput[] = [];
  if (!ctx.athlete || (ctx.athlete.legLengthCm == null && ctx.athlete.trochanterHeightM == null))
    out.push({ id: "leg-length", label: "Leg-length or trochanter-height measurement", wouldImprove: "Would enable an individualized step-length expectation instead of only within-athlete symmetry." });
  if (!ctx.historicalBaselineAvailable)
    out.push({ id: "baseline", label: "Previous session baseline", wouldImprove: "Would let AVA compare this session to the athlete's own normal range." });
  if (!ctx.athlete?.event)
    out.push({ id: "event", label: "Athlete event", wouldImprove: "Would sharpen context for acceleration vs maximum-velocity interpretation." });
  if ((ctx.validStepCount ?? 0) < 6)
    out.push({ id: "more-steps", label: "Additional valid steps", wouldImprove: "Would stabilise averages and side-to-side comparisons." });
  if (ctx.measurementConfidence !== "high")
    out.push({ id: "recording-quality", label: "Higher-quality / higher-frame-rate recording", wouldImprove: "Would raise measurement confidence and side-label reliability." });
  if (hasLimiters)
    out.push({ id: "physical-testing", label: "Physical testing (force, jump, strength)", wouldImprove: "Would help evaluate the physical associations AVA can only suggest from video." });
  return out;
}

/** Build the complete deterministic Sprint Intelligence report. */
export function buildSprintIntelligence(input: SprintIntelligenceInput): SprintIntelligenceReport {
  const lf = input.limitingFactors;
  const ctx = input.context;

  const methodology = {
    version: SPRINT_INTELLIGENCE_VERSION,
    metricsUsed: ["Average step length", "Peak step length", "Step frequency", "Average velocity", "Peak velocity"],
    targetBasisSummary:
      "The only available comparison was within-athlete left–right symmetry (provisional). Individualized, historical, and coach-defined targets were not available for this session.",
    rankingBasis:
      "Findings are ranked by estimated impact magnitude, then by conservative confidence (never above the weaker of measurement and reasoning confidence).",
    confidenceBasis:
      "Confidence reuses the Limiting Factors model: measurement reliability (pose, calibration, sample count) and reasoning strength (effect size, samples), aggregated conservatively.",
    provisionalModels: ["Left–right asymmetry bands"],
    unavailableModels: lf.unavailableModels,
  };

  const baseReport = {
    analysisId: input.analysisId,
    sessionId: input.sessionId,
    generatedAt: input.generatedAt,
    version: SPRINT_INTELLIGENCE_VERSION,
    methodology,
    dataQuality: {
      label: lf.overallDataQuality,
      calibrationConfirmed: ctx.calibrationConfirmed,
      spatialAvailable: ctx.spatialAvailable,
      validStepCount: ctx.validStepCount,
      measurementConfidence: ctx.measurementConfidence,
      notes: [] as string[],
    },
  };

  // --- Blocked states: mirror the Limiting Factors engine honestly. --------
  if (lf.status === "calibration_missing" || lf.status === "insufficient_data" || lf.status === "processing" || lf.status === "failed") {
    const status: SprintIntelligenceStatus = lf.status;
    const headline =
      lf.status === "calibration_missing"
        ? "Calibration is required before AVA can explain this analysis. Confirm a zone in the Timing Workspace to unlock timing metrics and the reasoning that depends on them."
        : lf.status === "insufficient_data"
          ? "There were not enough valid steps with trustworthy calibration for AVA to explain a dominant performance limiter."
          : lf.status === "processing"
            ? "Analysis is still processing — Sprint Intelligence will be available once metrics are ready."
            : "The explanation layer could not be generated for this analysis. Valid metrics and Limiting Factors remain available where present.";
    return {
      ...baseReport,
      status,
      summary: {
        headline,
        primaryConclusionId: null,
        hasPrimaryConclusion: false,
        supportedConclusionCount: 0,
        overallConfidence: null,
        overallConfidenceLabel: lf.overallDataQuality,
        dataQualityLabel: lf.overallDataQuality,
        zoneDistanceM: lf.zoneDistanceM,
        athleteProfileCompletenessPct: profileCompletenessPct(ctx.athlete),
      },
      primaryConclusion: null,
      supportingConclusions: [],
      strengths: [],
      counterEvidence: buildCounterEvidence(input),
      assumptions: [],
      missingInputs: buildMissingInputs(ctx, false),
      changeConditions: [],
      methodology,
    };
  }

  // --- OK path: compose conclusions from ranked limiters + contextual findings.
  const primaryLimiter = lf.limiters[0] ?? null;
  const primaryConclusion = primaryLimiter ? conclusionFromLimiter(primaryLimiter, ctx, true) : null;
  const supportingFromLimiters = lf.limiters.slice(1).map((l) => conclusionFromLimiter(l, ctx, false));

  const contextual: IntelligenceConclusion[] = [];
  const velocity = velocityRelationshipConclusion(ctx);
  if (velocity) contextual.push(velocity);
  const peakAvg = peakVsAverageConclusion(ctx);
  if (peakAvg) contextual.push(peakAvg);

  const supportingConclusions = [...supportingFromLimiters, ...contextual];
  const strengths = buildStrengths(ctx);

  // Assumptions (report-level): base sprint assumptions + any conclusion assumptions, deduped.
  const assumptionTexts = uniq([
    ...(ctx.analysisType === "fly" ? ["The measured zone represents maximum-velocity sprinting."] : []),
    "The athlete ran at near-maximal intent through the measured zone.",
    "The confirmed calibration revision is valid for this recording.",
    "Session conditions were not materially constrained (space, surface, wind).",
    ...(primaryConclusion?.assumptions ?? []),
  ]);
  const assumptions: IntelligenceAssumption[] = assumptionTexts.map((text, i) => ({ id: `assumption-${i}`, text, couldChangeConclusion: true }));

  const changeTexts = uniq([
    ...(primaryConclusion?.changeConditions ?? []),
    "A coach-defined target is entered for this metric.",
    "Repeated sessions establish a personal baseline.",
    "Additional profile measurements are added.",
  ]);
  const changeConditions: IntelligenceChangeCondition[] = changeTexts.map((text, i) => ({ id: `change-${i}`, text }));

  const hasPrimary = primaryConclusion != null;
  const status: SprintIntelligenceStatus = hasPrimary ? "ok" : "no_reliable_conclusion";
  const headline = hasPrimary
    ? `Primary finding: ${primaryConclusion!.conciseSummary}`
    : "AVA does not have enough evidence to identify one dominant performance limiter in this analysis. The measured metrics and any strengths below are still shown.";

  return {
    ...baseReport,
    status,
    summary: {
      headline,
      primaryConclusionId: primaryConclusion?.id ?? null,
      hasPrimaryConclusion: hasPrimary,
      supportedConclusionCount: (hasPrimary ? 1 : 0) + supportingFromLimiters.length,
      overallConfidence: primaryConclusion?.confidence.overall ?? null,
      overallConfidenceLabel: lf.overallDataQuality,
      dataQualityLabel: lf.overallDataQuality,
      zoneDistanceM: lf.zoneDistanceM,
      athleteProfileCompletenessPct: profileCompletenessPct(ctx.athlete),
    },
    primaryConclusion,
    supportingConclusions,
    strengths,
    counterEvidence: buildCounterEvidence(input),
    assumptions,
    missingInputs: buildMissingInputs(ctx, lf.limiters.length > 0),
    changeConditions,
    methodology,
  };
}
