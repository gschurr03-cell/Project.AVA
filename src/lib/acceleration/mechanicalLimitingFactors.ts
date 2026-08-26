/**
 * Mechanics-derived Limiting Factors (Phase 3, Part 13).
 *
 * Extends the Phase 2 step-level limiting-factor engine (`limitingFactors.ts`)
 * with NEW findings drawn from the Part 4/6-9 mechanical observations
 * (trunk/shin/touchdown/pelvis progression), the Part 10 strategy
 * classification, and the Part 12 asymmetry report. Reuses the exact same
 * `AccelerationLimiter` shape so a UI renders both kinds identically.
 *
 * STRICT non-diagnostic language throughout (Part 13): every mechanics
 * limiter uses the same disclaimer carrying the two required phrases —
 * "This pattern can sometimes be associated with…" and "Additional
 * physical testing would be needed to distinguish…" — and none of these
 * checks ever names a weakness, stiffness deficiency, tendon dysfunction,
 * mobility restriction, injury, or neuromuscular impairment as a finding;
 * only broad, hedged movement-quality CATEGORIES are ever cited.
 *
 * Every check requires `MIN_OBSERVATIONS_FOR_FINDING` valid observations
 * before firing — a single noisy contact never becomes a limiter.
 */

import type { LimiterEvidenceItem, PhysicalAssociation } from "../limitingFactors/types";
import type { AccelerationLimiter, AccelerationLimiterType } from "./limitingFactors";
import {
  lowAngleProjectionRecommendation,
  wallSwitchRecommendation,
  calfReactiveStrengthRecommendation,
  trunkPositionCueRecommendation,
  mobilityScreeningRecommendation,
  additionalPhysicalTestingRecommendation,
  lrJumpTestingRecommendation,
  ankleRangeScreeningRecommendation,
  trunkControlRecommendation,
} from "./limitingFactors";
import type { MechanicalProgression } from "./mechanicsProgression";
import { MIN_OBSERVATIONS_FOR_FINDING } from "./mechanicsProgression";
import type { StrategyClassification } from "./strategyClassification";
import type { MechanicalAsymmetry } from "./mechanicsAsymmetry";
import type { AccelerationStepRow } from "./steps";
import type { ProgressionAnalysis } from "./progression";

const MAX_MECHANICAL_LIMITERS = 5;

const nonDiagnosticDisclaimer = (category: string, muscleGroups: string[]): PhysicalAssociation => ({
  category,
  muscleGroups,
  disclaimer:
    "This pattern can sometimes be associated with the categories below — it is not a diagnosis. Additional physical testing would be needed to distinguish a strength, mobility, or purely technical explanation.",
});

function ownComparisonEvidence(progression: MechanicalProgression, label: string, unit: string, digits = 1): LimiterEvidenceItem[] {
  const { earlyZone, lateZone } = progression.zoneAverages;
  if (earlyZone == null || lateZone == null) return [];
  return [
    {
      label: `${label}: this athlete's own early-vs-late zone`,
      value: `${earlyZone.toFixed(digits)}${unit} → ${lateZone.toFixed(digits)}${unit}`,
      kind: "comparison",
    },
  ];
}

function contactEvidence(progression: MechanicalProgression): LimiterEvidenceItem {
  const steps = progression.series.map((p) => p.stepNumber);
  return { label: "Relevant contacts", value: steps.length ? `Steps ${steps.join(", ")}` : "None", kind: "measurement" };
}

function baseConfidence(progression: MechanicalProgression): { measurement: number; reasoning: number; overall: number; label: "high" | "moderate" | "low"; explanation: string } {
  const avg = progression.series.length ? progression.series.reduce((s, p) => s + p.confidence, 0) / progression.series.length : 0;
  const overall = Math.min(avg, progression.observationCount >= 6 ? 0.7 : 0.5);
  return {
    measurement: avg,
    reasoning: 0.5,
    overall,
    label: overall >= 0.6 ? "moderate" : "low",
    explanation: "2D monocular mechanical observations; experimental, not validated biomechanics.",
  };
}

/** 1. Touchdown reaches progressively further ahead of the body through the zone. */
function touchdownTooFarAhead(touchdown: MechanicalProgression): AccelerationLimiter | null {
  if (touchdown.observationCount < MIN_OBSERVATIONS_FOR_FINDING) return null;
  const { earlyZone, lateZone } = touchdown.zoneAverages;
  if (earlyZone == null || lateZone == null || lateZone <= 0.04 || touchdown.trend !== "rising") return null;
  return {
    id: "acceleration-touchdown-too-far-ahead",
    type: "acceleration_touchdown_too_far_ahead",
    status: "detected",
    rank: 0,
    title: "Touchdown reaches progressively further ahead of the body",
    summary: `Touchdown offset moved from ${earlyZone.toFixed(3)} to ${lateZone.toFixed(3)} (normalized) across the zone — a rising reach pattern.`,
    impact: { level: "moderate", score: 0.55, explanation: "Reaching for touchdown ahead of the body can increase braking forces at contact and slow velocity gain." },
    confidence: baseConfidence(touchdown),
    measuredValues: [{ label: "Late-zone touchdown offset", value: lateZone, unit: "normalized" }],
    target: { type: "individualized", minimum: null, maximum: null, unit: "normalized", sourceLabel: "Athlete's own early-zone touchdown pattern" },
    deviation: { direction: "above" },
    evidence: [contactEvidence(touchdown), ...ownComparisonEvidence(touchdown, "Touchdown offset", "", 3)],
    reasoning: ["Touchdown offset relative to the pelvis/center-of-mass proxy rose consistently across observed contacts."],
    possibleTechnicalAssociations: ["Overreaching at touchdown rather than landing under the hips"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Ground-contact quality", ["Hamstrings", "Gluteals"])],
    recommendations: [lowAngleProjectionRecommendation(), additionalPhysicalTestingRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 2. Trunk reaches an upright posture unusually early relative to the athlete's own zone. */
function postureRisesEarly(trunk: MechanicalProgression): AccelerationLimiter | null {
  if (trunk.observationCount < MIN_OBSERVATIONS_FOR_FINDING) return null;
  const { earlyZone } = trunk.zoneAverages;
  if (earlyZone == null || earlyZone >= 15) return null;
  return {
    id: "acceleration-posture-rises-early",
    type: "acceleration_posture_rises_early",
    status: "detected",
    rank: 0,
    title: "Trunk posture rises toward upright early in the zone",
    summary: `Early-zone trunk angle averaged ${earlyZone.toFixed(1)}° from vertical, already close to upright.`,
    impact: { level: "moderate", score: 0.5, explanation: "An early transition to upright posture can reduce the horizontal force available in early acceleration." },
    confidence: baseConfidence(trunk),
    measuredValues: [{ label: "Early-zone trunk angle", value: earlyZone, unit: "deg" }],
    target: { type: "individualized", minimum: null, maximum: null, unit: "deg", sourceLabel: "Athlete's own zone-relative trunk progression" },
    deviation: { direction: "below" },
    evidence: [contactEvidence(trunk), ...ownComparisonEvidence(trunk, "Trunk angle", "°")],
    reasoning: ["Trunk angle in the early third of the zone was already close to vertical rather than progressively rising."],
    possibleTechnicalAssociations: ["Early rise out of the drive phase"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Postural control under acceleration", ["Erector spinae", "Abdominals", "Hip flexors"])],
    recommendations: [trunkControlRecommendation(), lowAngleProjectionRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 3. Trunk stays forward-angled late in the zone without a corresponding velocity gain. */
function postureStaysLowWithoutVelocityGain(trunk: MechanicalProgression, progression: ProgressionAnalysis | null): AccelerationLimiter | null {
  if (trunk.observationCount < MIN_OBSERVATIONS_FOR_FINDING || !progression) return null;
  const { lateZone } = trunk.zoneAverages;
  if (lateZone == null || lateZone <= 30) return null;
  const lateGains = progression.stepGains.slice(-3).map((g) => g.velocityGainMps).filter((v): v is number => v != null);
  const lateGainAvg = lateGains.length ? lateGains.reduce((a, b) => a + b, 0) / lateGains.length : null;
  if (lateGainAvg == null || lateGainAvg > 0.1) return null;
  return {
    id: "acceleration-posture-stays-low-without-velocity-gain",
    type: "acceleration_posture_stays_low_without_velocity_gain",
    status: "detected",
    rank: 0,
    title: "Trunk stays angled forward late in the zone without continued velocity gain",
    summary: `Trunk remained forward-angled (avg ${lateZone.toFixed(1)}°) late in the zone while velocity gain per step averaged ${lateGainAvg.toFixed(2)} m/s.`,
    impact: { level: "moderate", score: 0.5, explanation: "A sustained forward posture is only useful while it is still producing velocity gain; without it, this may indicate the posture is no longer paying off." },
    confidence: baseConfidence(trunk),
    measuredValues: [{ label: "Late-zone trunk angle", value: lateZone, unit: "deg" }, { label: "Late-zone velocity gain per step", value: lateGainAvg, unit: "m/s" }],
    target: { type: "unavailable" },
    deviation: { direction: null },
    evidence: [contactEvidence(trunk), ...ownComparisonEvidence(trunk, "Trunk angle", "°")],
    reasoning: ["Trunk angle remained forward-leaning late in the zone while step-to-step velocity gain had largely flattened."],
    possibleTechnicalAssociations: ["A posture held past the point it is contributing to acceleration"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Sustained force application", ["Gluteals", "Hamstrings"])],
    recommendations: [trunkControlRecommendation(), additionalPhysicalTestingRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 4. Support shin becomes close to vertical unusually early. */
function shinVerticalEarly(shin: MechanicalProgression): AccelerationLimiter | null {
  if (shin.observationCount < MIN_OBSERVATIONS_FOR_FINDING) return null;
  const { earlyZone } = shin.zoneAverages;
  if (earlyZone == null || earlyZone >= 3) return null;
  return {
    id: "acceleration-shin-vertical-early",
    type: "acceleration_shin_vertical_early",
    status: "detected",
    rank: 0,
    title: "Support shin is close to vertical early in the zone",
    summary: `Early-zone shin angle averaged ${earlyZone.toFixed(1)}° from vertical.`,
    impact: { level: "low", score: 0.4, explanation: "A more vertical shin at touchdown earlier than expected can reduce forward force projection in early acceleration." },
    confidence: baseConfidence(shin),
    measuredValues: [{ label: "Early-zone shin angle", value: earlyZone, unit: "deg" }],
    target: { type: "individualized", minimum: null, maximum: null, unit: "deg", sourceLabel: "Athlete's own zone-relative shin progression" },
    deviation: { direction: "below" },
    evidence: [contactEvidence(shin), ...ownComparisonEvidence(shin, "Shin angle", "°")],
    reasoning: ["Support-shin angle at touchdown was already close to vertical in the early third of the zone."],
    possibleTechnicalAssociations: ["Reduced forward shin projection at early ground contacts"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Ankle range and positioning", ["Gastrocnemius", "Soleus", "Tibialis anterior"])],
    recommendations: [ankleRangeScreeningRecommendation(), mobilityScreeningRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 5. Step length is growing but not translating into velocity gain. */
function lengthGrowsWithoutVelocityGain(steps: AccelerationStepRow[], strategy: StrategyClassification): AccelerationLimiter | null {
  if (strategy.observationCount < MIN_OBSERVATIONS_FOR_FINDING) return null;
  if (strategy.label !== "length_dominant_growth") return null;
  const lastThree = steps.slice(-3);
  const velGain = lastThree.length >= 2 ? lastThree[lastThree.length - 1].intervalVelocityMps - lastThree[0].intervalVelocityMps : null;
  if (velGain == null || velGain > 0.3) return null;
  return {
    id: "acceleration-length-grows-without-velocity-gain",
    type: "acceleration_length_grows_without_velocity_gain",
    status: "detected",
    rank: 0,
    title: "Step length is growing without a matching velocity gain",
    summary: `Step length is the dominant growth pattern, but velocity changed only ${velGain.toFixed(2)} m/s over the last ${lastThree.length} steps.`,
    impact: { level: "moderate", score: 0.5, explanation: "Length that grows without contributing to velocity may reflect reaching rather than productive projection." },
    confidence: { measurement: 0.55, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Compares step-length trend to a short late-zone velocity window." },
    measuredValues: [{ label: "Late-zone velocity change", value: velGain, unit: "m/s" }],
    target: { type: "unavailable" },
    deviation: { direction: null },
    evidence: [{ label: "Strategy evidence", value: strategy.evidence.join(" "), kind: "comparison" }],
    reasoning: ["Step length was the dominant growing metric while velocity gain over the same late-zone window stayed flat."],
    possibleTechnicalAssociations: ["Reaching for length rather than driving through the ground"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Force application efficiency", ["Gluteals", "Hamstrings", "Quadriceps"])],
    recommendations: [wallSwitchRecommendation(), additionalPhysicalTestingRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 6. Step frequency is rising while touchdown projection is simultaneously deteriorating. */
function frequencyRisesWhileProjectionDeteriorates(steps: AccelerationStepRow[], touchdown: MechanicalProgression): AccelerationLimiter | null {
  if (touchdown.observationCount < MIN_OBSERVATIONS_FOR_FINDING || steps.length < MIN_OBSERVATIONS_FOR_FINDING) return null;
  const third = Math.ceil(steps.length / 3);
  const earlyFreq = steps.slice(0, third).reduce((s, x) => s + x.stepFrequencyHz, 0) / third;
  const lateFreq = steps.slice(-third).reduce((s, x) => s + x.stepFrequencyHz, 0) / third;
  const freqRising = lateFreq - earlyFreq > 0.3;
  if (!freqRising || touchdown.trend !== "rising") return null;
  return {
    id: "acceleration-frequency-rises-while-projection-deteriorates",
    type: "acceleration_frequency_rises_while_projection_deteriorates",
    status: "detected",
    rank: 0,
    title: "Step frequency rises while touchdown projection worsens",
    summary: `Step frequency rose from ${earlyFreq.toFixed(2)} to ${lateFreq.toFixed(2)} Hz while touchdown offset simultaneously trended further ahead of the body.`,
    impact: { level: "moderate", score: 0.55, explanation: "Turning over faster while reaching further ahead at touchdown can compound braking forces rather than adding useful speed." },
    confidence: baseConfidence(touchdown),
    measuredValues: [{ label: "Early-zone frequency", value: earlyFreq, unit: "Hz" }, { label: "Late-zone frequency", value: lateFreq, unit: "Hz" }],
    target: { type: "unavailable" },
    deviation: { direction: null },
    evidence: [contactEvidence(touchdown), ...ownComparisonEvidence(touchdown, "Touchdown offset", "", 3)],
    reasoning: ["Step frequency increased across the zone at the same time touchdown offset trended further ahead of the body."],
    possibleTechnicalAssociations: ["Turnover increasing before touchdown position is under control"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Reactive strength under load", ["Gastrocnemius", "Soleus"])],
    recommendations: [lowAngleProjectionRecommendation(), calfReactiveStrengthRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 7. Pelvis height rises abruptly rather than progressively. */
function pelvisRisesAbruptly(pelvis: MechanicalProgression): AccelerationLimiter | null {
  if (pelvis.observationCount < MIN_OBSERVATIONS_FOR_FINDING) return null;
  if (pelvis.trend !== "rising" || pelvis.smoothness !== "fluctuating") return null;
  return {
    id: "acceleration-pelvis-rises-abruptly",
    type: "acceleration_pelvis_rises_abruptly",
    status: "detected",
    rank: 0,
    title: "Pelvis height rises abruptly rather than progressively",
    summary: "Pelvis-height proxy trends upward through the zone but with an uneven, non-smooth pattern rather than a steady rise.",
    impact: { level: "low", score: 0.4, explanation: "An abrupt rather than gradual rise in pelvis height may reflect an inconsistent transition out of the drive phase." },
    confidence: baseConfidence(pelvis),
    measuredValues: [],
    target: { type: "unavailable" },
    deviation: { direction: null },
    evidence: [contactEvidence(pelvis)],
    reasoning: ["Pelvis-height proxy showed a rising trend with high contact-to-contact variability rather than a smooth progression."],
    possibleTechnicalAssociations: ["An inconsistent transition out of the drive phase"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Postural transition control", ["Erector spinae", "Abdominals"])],
    recommendations: [trunkControlRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 8. Multiple mechanical measures show inconsistent (fluctuating), not smooth, progression. */
function inconsistentMechanicalProgression(progressions: { name: string; progression: MechanicalProgression }[]): AccelerationLimiter | null {
  const fluctuating = progressions.filter((p) => p.progression.smoothness === "fluctuating" && p.progression.observationCount >= MIN_OBSERVATIONS_FOR_FINDING);
  if (fluctuating.length < 2) return null;
  const names = fluctuating.map((p) => p.name).join(", ");
  return {
    id: "acceleration-inconsistent-mechanical-progression",
    type: "acceleration_inconsistent_mechanical_progression",
    status: "detected",
    rank: 0,
    title: "Multiple mechanical measures progress inconsistently",
    summary: `${names} all show contact-to-contact fluctuation rather than a smooth trend across the zone.`,
    impact: { level: "moderate", score: 0.5, explanation: "Fluctuation across several mechanical measures at once suggests an inconsistent movement pattern rather than a single isolated measurement." },
    confidence: { measurement: 0.5, reasoning: 0.5, overall: 0.45, label: "moderate", explanation: "Combines smoothness classifications across independently-computed mechanical series." },
    measuredValues: [],
    target: { type: "unavailable" },
    deviation: { direction: null },
    evidence: fluctuating.map((p) => contactEvidence(p.progression)),
    reasoning: [`${fluctuating.length} of the tracked mechanical measures (${names}) were classified as fluctuating rather than smooth.`],
    possibleTechnicalAssociations: ["An inconsistent overall movement pattern through the zone"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Movement consistency", ["Core stabilizers", "Hip stabilizers"])],
    recommendations: [additionalPhysicalTestingRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 9. Left/right touchdown projection differs persistently. */
function lrProjectionAsymmetry(asymmetries: MechanicalAsymmetry[]): AccelerationLimiter | null {
  const entry = asymmetries.find((a) => a.metric === "touchdownOffset");
  if (!entry || !entry.persistent || entry.absoluteDifference == null) return null;
  return {
    id: "acceleration-lr-projection-asymmetry",
    type: "acceleration_lr_projection_asymmetry",
    status: "detected",
    rank: 0,
    title: "Left/right touchdown projection differs",
    summary: `Touchdown offset differs between sides (L ${entry.leftAverage?.toFixed(3) ?? "—"}, R ${entry.rightAverage?.toFixed(3) ?? "—"}, normalized) across repeated observations.`,
    impact: { level: "moderate", score: 0.5, explanation: "A persistent side-to-side difference in touchdown projection can reflect an asymmetric contact strategy." },
    confidence: { measurement: entry.confidence, reasoning: 0.5, overall: Math.min(entry.confidence, 0.6), label: entry.confidence >= 0.6 ? "moderate" : "low", explanation: "Based on repeated per-side observations, not a single step." },
    measuredValues: [{ label: "Left touchdown offset", value: entry.leftAverage, unit: "normalized" }, { label: "Right touchdown offset", value: entry.rightAverage, unit: "normalized" }],
    target: { type: "individualized", minimum: 0, maximum: null, unit: "normalized", sourceLabel: "Athlete's own bilateral symmetry" },
    deviation: { percentage: entry.percentDifference, direction: (entry.leftAverage ?? 0) > (entry.rightAverage ?? 0) ? "left_higher" : "right_higher" },
    evidence: [{ label: "Observations", value: `${entry.observationCount} contacts (zone change: ${entry.zoneChange})`, kind: "measurement" }],
    reasoning: ["Touchdown offset differed between sides across multiple repeated observations, not a single step."],
    possibleTechnicalAssociations: ["An asymmetric touchdown or reaching strategy on one side"],
    possiblePhysicalAssociations: [nonDiagnosticDisclaimer("Unilateral force application", ["Gluteals", "Hamstrings"])],
    recommendations: [lrJumpTestingRecommendation(), trunkPositionCueRecommendation()],
    dataQualityWarnings: [],
  };
}

/** 10. An abrupt (single large step-to-step) change in a mechanical measure, distinct from a gradual trend. */
function abruptStrategyChange(progressions: { name: string; progression: MechanicalProgression }[]): AccelerationLimiter | null {
  let worst: { name: string; stepNumber: number; delta: number; medianAbs: number } | null = null;
  for (const { name, progression } of progressions) {
    if (progression.changePerStep.length < MIN_OBSERVATIONS_FOR_FINDING) continue;
    const abs = progression.changePerStep.map((c) => Math.abs(c.delta)).sort((a, b) => a - b);
    const median = abs[Math.floor(abs.length / 2)] || 0;
    const max = progression.changePerStep.reduce((best, c) => (Math.abs(c.delta) > Math.abs(best.delta) ? c : best));
    if (median > 0 && Math.abs(max.delta) > median * 2.5 && (!worst || Math.abs(max.delta) > Math.abs(worst.delta))) {
      worst = { name, stepNumber: max.stepNumber, delta: max.delta, medianAbs: median };
    }
  }
  if (!worst) return null;
  return {
    id: "acceleration-abrupt-strategy-change",
    type: "acceleration_abrupt_strategy_change",
    status: "detected",
    rank: 0,
    title: `Abrupt change in ${worst.name} at step ${worst.stepNumber}`,
    summary: `${worst.name} changed by ${worst.delta.toFixed(2)} at step ${worst.stepNumber}, well above this athlete's own typical step-to-step change (${worst.medianAbs.toFixed(2)}).`,
    impact: { level: "low", score: 0.4, explanation: "A single abrupt change stands out against an otherwise gradual pattern and may reflect a one-off event rather than a sustained strategy shift." },
    confidence: { measurement: 0.5, reasoning: 0.45, overall: 0.4, label: "low", explanation: "A single-step outlier; could reflect measurement noise rather than a true mechanical change." },
    measuredValues: [{ label: "Step change", value: worst.delta, unit: "", detail: `step ${worst.stepNumber}` }],
    target: { type: "individualized", minimum: null, maximum: null, unit: "", sourceLabel: "Athlete's own typical step-to-step change" },
    deviation: { direction: null },
    evidence: [{ label: "Comparison", value: `${Math.abs(worst.delta).toFixed(2)} vs. typical ${worst.medianAbs.toFixed(2)}`, kind: "comparison" }],
    reasoning: [`${worst.name} showed a single change far larger than the athlete's own typical step-to-step variation.`],
    possibleTechnicalAssociations: ["A single mistimed step or a genuine one-off strategy shift"],
    possiblePhysicalAssociations: [],
    recommendations: [],
    dataQualityWarnings: [],
  };
}

export function buildMechanicalLimitingFactors(input: {
  trunk: MechanicalProgression;
  touchdown: MechanicalProgression;
  shin: MechanicalProgression;
  pelvis: MechanicalProgression;
  steps: AccelerationStepRow[];
  progression: ProgressionAnalysis | null;
  strategy: StrategyClassification;
  asymmetries: MechanicalAsymmetry[];
}): AccelerationLimiter[] {
  const named = [
    { name: "trunk angle", progression: input.trunk },
    { name: "shin angle", progression: input.shin },
    { name: "touchdown offset", progression: input.touchdown },
    { name: "pelvis height", progression: input.pelvis },
  ];

  const candidates = [
    touchdownTooFarAhead(input.touchdown),
    postureRisesEarly(input.trunk),
    postureStaysLowWithoutVelocityGain(input.trunk, input.progression),
    shinVerticalEarly(input.shin),
    lengthGrowsWithoutVelocityGain(input.steps, input.strategy),
    frequencyRisesWhileProjectionDeteriorates(input.steps, input.touchdown),
    pelvisRisesAbruptly(input.pelvis),
    inconsistentMechanicalProgression(named),
    lrProjectionAsymmetry(input.asymmetries),
    abruptStrategyChange(named),
  ].filter((l): l is AccelerationLimiter => l != null);

  return candidates
    .sort((a, b) => b.impact.score - a.impact.score)
    .slice(0, MAX_MECHANICAL_LIMITERS)
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

/** Merges step-level (Phase 2) and mechanics-level (Phase 3) limiters into one ranked list. */
export function combineAccelerationLimiters(stepLimiters: AccelerationLimiter[], mechanicalLimiters: AccelerationLimiter[], maxLimiters = 5): AccelerationLimiter[] {
  return [...stepLimiters, ...mechanicalLimiters]
    .sort((a, b) => b.impact.score - a.impact.score)
    .slice(0, maxLimiters)
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

export type { AccelerationLimiterType };
