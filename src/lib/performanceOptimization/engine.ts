import {
  PERFORMANCE_IMPACT_MODEL_VERSION,
  PERFORMANCE_OPTIMIZATION_ENGINE_VERSION,
  PERFORMANCE_OPTIMIZATION_SCHEMA_VERSION,
  performanceOptimizationInputSchema,
  performanceOptimizationStateSchema,
  type OptimizationCandidate,
  type OptimizationDecision,
  type PerformanceOptimizationInput,
  type PerformanceOptimizationState,
} from "./contracts";
import { dependencyBonus, interactionEffect, validateDependencyGraph } from "./graph";
import { calculatePerformanceImpact, diminishingReturnMultiplier } from "./impact";
import { PERFORMANCE_OPTIMIZATION_POLICY as POLICY } from "./policy";
import { confidenceLevel100 } from "@/lib/intelligence/shared/confidence";
import { stableFingerprint } from "@/lib/intelligence/shared/fingerprint";

const clamp = (value: number, lower = 0, upper = 1) =>
  Math.min(upper, Math.max(lower, value));
const round = (value: number, places = 6) => Number(value.toFixed(places));
const unique = (values: string[]) => [...new Set(values)].sort();

function confidenceLevel(score: number) {
  return confidenceLevel100(score);
}

function gainFor(
  item: OptimizationCandidate, score: number, confidence: number,
): OptimizationDecision["expectedPerformanceGain"] {
  const expected = clamp(score / 100 * item.potentialImprovement *
    item.probabilityOfSuccess * confidence);
  const lower = expected * Math.max(0.25, confidence);
  const upper = Math.min(1, expected + item.potentialImprovement * (1 - confidence) * 0.5);
  const classification = confidence < 0.3 ? "insufficient" :
    expected >= 0.35 ? "potentially_high" :
    expected >= 0.15 ? "potentially_moderate" : "potentially_low";
  return {
    normalizedLower: round(lower), normalizedExpected: round(expected),
    normalizedUpper: round(Math.max(expected, upper)), classification,
    calibratedToRaceTime: false as const,
  };
}

export function evaluatePerformanceOptimization(
  rawInput: PerformanceOptimizationInput,
): PerformanceOptimizationState {
  const input = performanceOptimizationInputSchema.parse(rawInput);
  const ordered = [...input.candidates].sort((a, b) =>
    a.candidate.candidateId.localeCompare(b.candidate.candidateId));
  validateDependencyGraph(ordered.map((item) => item.candidate.candidateId), input.dependencyGraph);
  const generatedMs = Date.parse(input.generatedAt);
  const competitionMs = input.competitionSchedule.nextCompetitionAt
    ? Date.parse(input.competitionSchedule.nextCompetitionAt) : null;
  const daysToCompetition = competitionMs == null || competitionMs < generatedMs
    ? null : Math.ceil((competitionMs - generatedMs) / 86_400_000);
  const competitionProtected = daysToCompetition != null &&
    daysToCompetition <= POLICY.competitionProtectionDays;
  const maturity = clamp(input.digitalTwin.confidenceScore.score / 100);
  const memories = new Map(input.digitalTwin.recommendationHistory
    .map((memory) => [memory.recommendationKey, memory]));
  const overrides = new Map(input.coachOverrides
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) ||
      a.overrideId.localeCompare(b.overrideId)).map((override) => [override.candidateId, override]));
  const prereqs = new Map<string, string[]>();
  for (const edge of input.dependencyGraph) prereqs.set(edge.unlockedCandidateId,
    [...(prereqs.get(edge.unlockedCandidateId) ?? []), edge.prerequisiteCandidateId].sort());

  const evaluated = ordered.map((item) => {
    const id = item.candidate.candidateId;
    const impact = calculatePerformanceImpact({
      item, measurementQuality: input.measurementQuality, digitalTwinMaturity: maturity,
    });
    const modifiers: OptimizationDecision["modifiers"] = [];
    const add = (modifier: string, multiplier: number, reason: string, sourceIds: string[] = []) =>
      modifiers.push({ modifier, multiplier: round(multiplier), contribution: 0, reason, sourceIds });
    add("probability_and_specificity",
      clamp(item.probabilityOfSuccess * 0.55 + item.athleteSpecificity * 0.25 +
        item.expectedPersistence * 0.2, 0.2, 1),
      "Combines success probability, athlete specificity, and expected persistence.");
    add("maintenance_cost", clamp(1 - item.maintenanceCost * 0.4, 0.6, 1),
      "Reduces return when maintaining the change consumes more training attention.");
    add("diminishing_returns", diminishingReturnMultiplier(item),
      "Accounts for prior investment, captured benefit, and plateau evidence.");
    add("adaptation_profile", POLICY.adaptationMultiplier[item.adaptationProfile],
      `Uses the stored ${item.adaptationProfile.replaceAll("_", " ")} adaptation profile.`);
    const dependency = dependencyBonus(id, input.dependencyGraph);
    add("dependency_unlock", 1 + Math.min(POLICY.dependencyBonusMaximum, dependency.value * 0.05),
      "Rewards only explicit evidence-linked downstream unlocks.", dependency.sourceIds);
    const interaction = interactionEffect(id, input.interactions);
    add("mechanical_interaction",
      clamp(1 + interaction.value * 0.05, 1 - POLICY.interactionModifierMaximum,
        1 + POLICY.interactionModifierMaximum),
      "Applies only explicit evidence-linked positive or negative interactions.",
      interaction.sourceIds);
    const seasonMatch = item.preferredSeasonStages.includes(input.seasonContext.stage);
    add("season_context", seasonMatch ? POLICY.seasonMatchMultiplier :
      POLICY.seasonMismatchMultiplier,
    seasonMatch ? "The focus matches the declared season stage." :
      "The focus is valid but not preferred in the declared season stage.");
    const competitionMultiplier = !competitionProtected ? 1 :
      !item.candidate.competitionSafe || item.changeRisk === "high"
        ? POLICY.competitionUnsafeMultiplier :
        item.changeRisk === "moderate" || item.changeRisk === "unknown"
          ? POLICY.competitionModerateRiskMultiplier : 1;
    add("competition_timing", competitionMultiplier,
      !competitionProtected ? "No active competition protection window." :
        competitionMultiplier === 1 ? "The focus is low risk and competition-safe." :
          "Near competition, AVA protects execution from risky technical change.",
      [input.competitionSchedule.scheduleVersion]);
    const unknowns = unique([...input.unknownVariables, ...item.unknownVariables]);
    add("unknown_variables", 1 - Math.min(POLICY.maximumUnknownPenalty,
      unknowns.length * POLICY.unknownPenaltyPerVariable),
    "Reduces expected return in proportion to declared unknown context.");
    const confidence = clamp(Math.min(item.candidate.confidence, item.evidenceQuality,
      input.measurementQuality, maturity));
    add("confidence", Math.max(0.35, confidence),
      "The weakest validated confidence input bounds the decision.");
    const override = overrides.get(id);
    if (override?.action === "raise_ranking") add("coach_override", POLICY.raiseRankingMultiplier,
      "A structured coach override raised this ranking.", [override.overrideId]);
    if (override?.action === "lower_ranking") add("coach_override", POLICY.lowerRankingMultiplier,
      "A structured coach override lowered this ranking.", [override.overrideId]);
    if (override?.action === "accept") add("coach_override", POLICY.acceptMultiplier,
      "A structured coach override accepted this focus.", [override.overrideId]);
    let running = impact.impactScore;
    for (const modifier of modifiers) {
      const before = running; running *= modifier.multiplier;
      modifier.contribution = round(running - before);
    }
    let score = round(clamp(running, 0, 100));
    if (override?.action === "lock") score = Math.max(POLICY.lockScoreFloor, score);
    const memory = memories.get(item.candidate.recommendationKey);
    let fixed: OptimizationDecision["disposition"] | null = null;
    let reason = "Eligible for investment ranking by expected long-term performance return.";
    if (override?.action === "disable" || memory?.futureApplicability === "not_supported") {
      fixed = "retired"; reason = override
        ? "Disabled by a structured coach override."
        : "Retired because stored follow-up marks future applicability as not supported.";
    } else if (override?.action === "reject") {
      fixed = "ignored"; reason = "Rejected by a structured coach override.";
    } else if (item.candidate.priorityKind === "strength") {
      fixed = "maintenance"; reason = "Preserved as an established strength.";
    } else if (item.candidate.priorityKind === "missing_evidence" ||
      item.candidate.status !== "validated" || confidence < 0.3) {
      fixed = "monitoring"; reason = "Withheld from investment because evidence is incomplete.";
    } else if (competitionProtected && competitionMultiplier <= POLICY.competitionUnsafeMultiplier) {
      fixed = "monitoring"; reason = "Withheld from a new high-risk change during competition protection.";
    }
    const history = unique([
      ...item.candidate.supportingEvidence.map((e) => e.evidenceId),
      ...input.digitalTwin.priorityHistory.filter((event) =>
        event.payload.kind === "priority" &&
        event.payload.category === item.candidate.category).map((event) => event.eventId),
    ]);
    return {
      item, score, impact, modifiers, confidence, unknowns, fixed, reason, history,
      overrideIds: override ? [override.overrideId] : [],
    };
  });

  const eligible = evaluated.filter((item) => item.fixed == null)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence ||
      a.item.candidate.candidateId.localeCompare(b.item.candidate.candidateId));
  const locked = eligible.filter((item) => overrides.get(item.item.candidate.candidateId)?.action === "lock");
  const investment = [...locked, ...eligible.filter((item) => !locked.includes(item))]
    .slice(0, POLICY.activeFocusLimit);
  const investmentIds = new Set(investment.map((item) => item.item.candidate.candidateId));
  const makeDecision = (
    row: typeof evaluated[number], disposition: OptimizationDecision["disposition"],
    rank: number | null,
  ): OptimizationDecision => {
    const missingPrereqs = (prereqs.get(row.item.candidate.candidateId) ?? [])
      .filter((id) => !investmentIds.has(id));
    const reason = disposition === "investment"
      ? `Selected at investment rank ${rank} because it has the highest eligible evidence-bounded return.`
      : disposition === "deferred"
        ? "Deferred because two eligible focuses have higher expected return on limited training time."
        : row.reason;
    return {
      candidateId: row.item.candidate.candidateId, candidate: row.item.candidate,
      disposition, rank, optimizationScore: row.score,
      impactScore: round(row.impact.impactScore), expectedPerformanceGain:
        gainFor(row.item, row.score, row.confidence),
      impactComponents: row.impact.components.map((component) => ({
        ...component, rawValue: round(component.rawValue),
        weightedValue: round(component.weightedValue),
      })),
      modifiers: row.modifiers, requiredPrerequisites: missingPrereqs,
      historicalSupport: row.history, confidence: round(row.confidence),
      whySelectedOrDeferred: reason,
      conditionsThatChangeDecision: unique([
        "New compatible analysis evidence",
        "Changed competition schedule or season stage",
        "Changed adaptation or recommendation-effectiveness evidence",
        "Structured coach override",
        ...(missingPrereqs.length ? ["Prerequisite focus becomes supported or completed"] : []),
      ]),
      unknownVariables: row.unknowns, overrideIds: row.overrideIds,
    };
  };
  const decisions = evaluated.map((row) => {
    const selectedIndex = investment.findIndex((item) => item === row);
    return makeDecision(row, row.fixed ?? (selectedIndex >= 0 ? "investment" : "deferred"),
      selectedIndex >= 0 ? selectedIndex + 1 : null);
  }).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) ||
    b.optimizationScore - a.optimizationScore || a.candidateId.localeCompare(b.candidateId));
  const byDisposition = (kind: OptimizationDecision["disposition"]) =>
    decisions.filter((decision) => decision.disposition === kind);
  const selected = byDisposition("investment");
  const deferred = byDisposition("deferred");
  const expected = selected.length
    ? selected.reduce((sum, item) => sum + item.expectedPerformanceGain.normalizedExpected, 0) /
      selected.length : 0;
  const aggregateConfidence = selected.length
    ? Math.min(...selected.map((item) => item.confidence), maturity, input.measurementQuality) : 0;
  const limitingFactors = unique([
    ...input.unknownVariables,
    ...(maturity < 0.55 ? ["Digital Twin maturity limits optimization confidence."] : []),
    ...(input.measurementQuality < 0.55 ? ["Measurement quality limits optimization confidence."] : []),
    ...(!selected.length ? ["No validated investment focus is available."] : []),
  ]);
  const inputFingerprint = stableFingerprint({
    ...input, candidates: ordered,
    dependencyGraph: [...input.dependencyGraph].sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
    interactions: [...input.interactions].sort((a, b) => a.interactionId.localeCompare(b.interactionId)),
    coachOverrides: [...input.coachOverrides].sort((a, b) => a.overrideId.localeCompare(b.overrideId)),
    engineVersion: PERFORMANCE_OPTIMIZATION_ENGINE_VERSION,
  });
  return performanceOptimizationStateSchema.parse({
    optimizationId: input.optimizationId, athleteId: input.athleteId,
    engineVersion: PERFORMANCE_OPTIMIZATION_ENGINE_VERSION,
    optimizationVersion: PERFORMANCE_OPTIMIZATION_SCHEMA_VERSION,
    impactModelVersion: PERFORMANCE_IMPACT_MODEL_VERSION,
    generatedAt: input.generatedAt, inputFingerprint,
    highestReturnFocus: selected[0] ?? null, recommendedInvestmentOrder: selected,
    expectedPerformanceGain: {
      normalizedExpected: round(expected),
      classification: aggregateConfidence < 0.3 ? "insufficient" :
        expected >= 0.35 ? "potentially_high" :
        expected >= 0.15 ? "potentially_moderate" : "potentially_low",
      calibratedToRaceTime: false,
    },
    confidence: {
      score: Math.round(aggregateConfidence * 100),
      level: confidenceLevel(aggregateConfidence * 100), limitingFactors,
    },
    optimizationScore: round(selected[0]?.optimizationScore ?? 0),
    tradeoffs: selected.flatMap((chosen) => deferred.slice(0, 1).map((alternative) => ({
      chosenCandidateId: chosen.candidateId, alternativeCandidateId: alternative.candidateId,
      scoreDifference: round(Math.max(0, chosen.optimizationScore - alternative.optimizationScore)),
      explanation: `${chosen.candidate.title} was funded while ${alternative.candidate.title} was deferred because its evidence-bounded return score was lower.`,
    }))),
    ignoredFocuses: byDisposition("ignored"), deferredFocuses: deferred,
    maintenanceFocuses: byDisposition("maintenance"),
    monitoringFocuses: byDisposition("monitoring"), retiredFocuses: byDisposition("retired"),
    optimizedCandidates: ordered.map((item) => item.candidate),
    dependencyGraph: input.dependencyGraph, interactions: input.interactions,
    requiredPrerequisites: selected.flatMap((decision) =>
      input.dependencyGraph.filter((edge) => edge.unlockedCandidateId === decision.candidateId)
        .map((edge) => ({
          selectedCandidateId: decision.candidateId,
          prerequisiteCandidateId: edge.prerequisiteCandidateId,
          satisfiedBySelection: investmentIds.has(edge.prerequisiteCandidateId),
          evidenceIds: edge.evidence.map((item) => item.evidenceId).sort(),
        }))),
    competitionAdjustments: decisions.map((decision) => {
      const modifier = decision.modifiers.find((item) => item.modifier === "competition_timing")!;
      return { candidateId: decision.candidateId, multiplier: modifier.multiplier, reason: modifier.reason };
    }),
    seasonAdjustments: decisions.map((decision) => {
      const modifier = decision.modifiers.find((item) => item.modifier === "season_context")!;
      return { candidateId: decision.candidateId, multiplier: modifier.multiplier, reason: modifier.reason };
    }),
    historicalSupport: unique(decisions.flatMap((item) => item.historicalSupport)),
    unknownVariables: unique([...input.unknownVariables,
      ...decisions.flatMap((item) => item.unknownVariables)]),
    overrideAudit: input.coachOverrides,
    trace: decisions.map((decision) => ({
      candidateId: decision.candidateId, impactComponents: decision.impactComponents,
      modifiers: decision.modifiers, finalScore: decision.optimizationScore,
      finalDisposition: decision.disposition, finalRank: decision.rank,
    })),
    invalidationContext: {
      twinUpdatedAt: input.digitalTwin.updatedAt, priorityVersion: input.priorityVersion,
      recommendationVersion: input.recommendationVersion,
      benchmarkVersion: input.benchmarkVersion, projectionVersion: input.projectionVersion,
      researchVersion: input.researchVersion,
      scheduleVersion: input.competitionSchedule.scheduleVersion,
      seasonContextVersion: input.seasonContext.contextVersion,
      overrideIds: input.coachOverrides.map((item) => item.overrideId).sort(),
    },
    computePolicy: {
      evaluatedOn: "server", servedFromCache: true, offlineCompatible: true,
      externalModelCalls: 0, deterministic: true,
    },
  });
}
