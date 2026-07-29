import type { Interpretation } from "@/lib/intelligence/interpretations";
import { stableFingerprint } from "@/lib/intelligence/shared/fingerprint";

import { CUE_LIBRARY } from "./cues";
import { DRILL_LIBRARY } from "./drills";
import {
  RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_LIBRARY_VERSION,
  recommendationInputSchema,
  recommendationResultSchema,
  recommendationSchema,
  type Recommendation,
  type RecommendationContext,
  type RecommendationInput,
  type RecommendationResult,
  type RecommendationTraceEntry,
} from "./contracts";
import { recommendationLibraryItem, type RecommendationLibraryItem } from "./library";
import { RECOMMENDATION_RULES, type RecommendationRule } from "./registry";
import { assertSafeRecommendationLanguage, safetyGate } from "./safety";

const CONFIDENCE_RANK = { Unavailable: 0, Low: 1, Moderate: 2, High: 3 } as const;
const QUALITY_RANK = { unavailable: 0, unknown: 0, heuristic: 1, limited: 2, moderate: 3, strong: 4 } as const;
const SAFETY_RANK = { tier_1: 1, tier_2: 2, tier_3: 3, tier_4: 4 } as const;
const ACTION_ORDER: Record<Recommendation["actionType"], number> = {
  record_again: 1,
  improve_recording_setup: 1,
  collect_more_data: 2,
  preserve_strength: 3,
  no_action_needed: 3,
  monitor_pattern: 4,
  technical_cue: 5,
  low_risk_drill: 6,
  sprint_drill: 7,
  strength_consideration: 8,
  mobility_assessment: 8,
  coach_review: 9,
  medical_review: 10,
  unavailable: 11,
};

interface Candidate {
  recommendation: Recommendation;
  rule: RecommendationRule;
  item: RecommendationLibraryItem;
}

const stableHash = stableFingerprint;

const goalRelevance = (
  item: RecommendationLibraryItem,
  context: RecommendationContext,
): Recommendation["athleteGoalRelevance"] => {
  if (!context.athlete.goals.length) return "unknown";
  if (item.applicableGoals.includes("any")) return "moderate";
  return item.applicableGoals.some((goal) => context.athlete.goals.includes(goal as never))
    ? "high"
    : "unrelated";
};

const phaseMatches = (item: RecommendationLibraryItem, context: RecommendationContext): boolean =>
  item.applicablePhases.includes("any") || item.applicablePhases.includes(context.phase);

function interpretationRejection(
  interpretation: Interpretation,
  input: RecommendationInput,
): string | null {
  if (interpretation.provenance.sourceAnalysisId !== input.context.analysisId)
    return "Interpretation belongs to a different analysis.";
  if (interpretation.engineVersion !== "ava-interpretations-v1")
    return "Interpretation Engine version is incompatible.";
  if (["unavailable", "insufficient_evidence", "contradicted"].includes(interpretation.status))
    return "Interpretation is unavailable, insufficient, or contradicted.";
  if (!interpretation.supportingEvidence.length) return "Interpretation has no evidence.";
  if (interpretation.supportingEvidence.some((item) => item.value == null || item.availability !== "available"))
    return "Interpretation contains null or withheld evidence.";
  return null;
}

function buildRecommendation(
  input: RecommendationInput,
  rule: RecommendationRule,
  item: RecommendationLibraryItem,
  interpretations: Interpretation[],
  inputHash: string,
): Recommendation {
  const cueItems = item.defaultCues.map((id) => CUE_LIBRARY.find((cue) => cue.cueId === id)).filter(Boolean);
  const drill = item.drillId ? DRILL_LIBRARY.find((entry) => entry.drillId === item.drillId && entry.enabled) : null;
  const weakestConfidence = interpretations
    .map((entry) => entry.confidence)
    .sort((a, b) => CONFIDENCE_RANK[a] - CONFIDENCE_RANK[b])[0] ?? "Unavailable";
  const experimental = rule.experimental || interpretations.some((entry) => entry.experimental);
  const phaseApplicable = phaseMatches(item, input.context);
  const contextRequired =
    !phaseApplicable ||
    (input.context.phase === "unknown" && item.safetyTier !== "tier_1");
  const status =
    experimental
      ? "experimental"
      : item.actionType === "preserve_strength"
        ? "preserve_only"
        : contextRequired
          ? "context_required"
          : weakestConfidence === "Low"
            ? "limited"
            : "supported";
  const volumeGuidance = {
    intensityTier:
      item.safetyTier === "tier_1"
        ? "observation_only"
        : drill?.intensity === "submaximal"
          ? "submaximal"
          : "low",
    repetitionRangeCategory:
      item.safetyTier === "tier_1" ? "not_applicable" : "few_quality_repetitions",
    recoveryCategory: item.safetyTier === "tier_1" ? "not_applicable" : "full_recovery",
    sessionFrequencyCategory:
      item.safetyTier === "tier_1" ? "single_review" : "limited_exposure",
    progressionRequirement: item.progressionGuidance,
  } as const;
  const linkedObservationIds = [...new Set(interpretations.flatMap((entry) => entry.linkedObservationIds))].sort();
  const suggestedActions = [
    item.summary,
    ...(drill ? [`Optional low-risk drill: ${drill.name}. ${drill.executionSummary}`] : []),
  ];
  assertSafeRecommendationLanguage([
    item.title,
    item.summary,
    item.objective,
    ...suggestedActions,
    ...cueItems.flatMap((cue) => [cue!.shortCue, cue!.expandedCue]),
  ]);
  return recommendationSchema.parse({
    id: `${RECOMMENDATION_ENGINE_VERSION}:${input.context.analysisId}:${rule.ruleId}`,
    recommendationKey: item.recommendationKey,
    libraryItemId: item.libraryItemId,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    category: rule.category,
    title: item.title,
    summary: item.summary,
    objective: item.objective,
    rationale: `Selected from ${interpretations.map((entry) => entry.interpretationKey).join(", ")} under the ${rule.safetyPolicy} policy.`,
    linkedInterpretationIds: interpretations.map((entry) => entry.id).sort(),
    linkedObservationIds,
    supportingEvidence: interpretations.flatMap((entry) => entry.supportingEvidence),
    actionType: item.actionType,
    interventionType: item.interventionType,
    suggestedActions,
    technicalCues: cueItems.map((cue) => cue!.shortCue),
    implementationNotes: [
      ...item.defaultImplementationNotes,
      ...(drill ? [drill.setup, `Common errors to avoid: ${drill.commonErrors.join(", ")}.`] : []),
    ],
    progressionGuidance: item.progressionGuidance,
    frequencyGuidance: item.frequencyGuidance,
    volumeGuidance,
    stopConditions: [...new Set([...item.stopConditions, ...(drill?.stopConditions ?? [])])],
    contraindicationNotes: [...new Set([...item.contraindications, ...(drill?.contraindications ?? [])])],
    monitoringPlan: {
      metricKeys: [...new Set(interpretations.flatMap((entry) => entry.supportingEvidence.map((evidence) => evidence.metric)))],
      observationKeys: [...new Set(interpretations.flatMap((entry) => entry.provenance.sourceObservationRuleIds))],
      preferredRecordingSetup: item.defaultMonitoringPlan.preferredRecordingSetup,
      preferredPhase: input.context.phase,
      minimumSessions: item.defaultMonitoringPlan.minimumSessions,
      compatibilityRequirements: item.defaultMonitoringPlan.compatibilityRequirements,
      successSignal: item.defaultMonitoringPlan.successSignal,
      regressionSignal: item.defaultMonitoringPlan.regressionSignal,
      reviewWindow: item.defaultMonitoringPlan.reviewWindow,
    },
    expectedOutcomeArea: item.expectedOutcomeArea,
    confidence: weakestConfidence,
    interventionEvidenceQuality: item.evidenceBasis,
    status,
    safetyTier: item.safetyTier,
    phase: input.context.phase,
    event: input.context.event,
    side:
      new Set(interpretations.map((entry) => entry.side).filter(Boolean)).size === 1
        ? interpretations.find((entry) => entry.side)?.side ?? null
        : null,
    athleteGoalRelevance: goalRelevance(item, input.context),
    contextRequirements: [
      ...rule.requiredContext,
      ...(contextRequired ? ["Compatible sprint phase is required before using a phase-specific action."] : []),
      ...(drill?.requiresCoachSupervision ? ["Qualified coach supervision is required."] : []),
    ],
    limitations: interpretations.flatMap((entry) => entry.limitations),
    excludedClaims: item.excludedClaims,
    experimental,
    enabled: item.enabled,
    createdAt: input.context.generatedAt,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    provenance: {
      sourceInterpretationEngineVersion: "ava-interpretations-v1",
      sourceObservationEngineVersion: "ava-observations-v1",
      sourceInterpretationIds: interpretations.map((entry) => entry.id).sort(),
      sourceAnalysisId: input.context.analysisId,
      inputHash,
      athleteContextVersion: input.context.athlete.contextVersion,
      libraryVersion: RECOMMENDATION_LIBRARY_VERSION,
    },
  });
}

const candidateCompare = (a: Candidate, b: Candidate): number =>
  SAFETY_RANK[a.recommendation.safetyTier] - SAFETY_RANK[b.recommendation.safetyTier] ||
  CONFIDENCE_RANK[b.recommendation.confidence] - CONFIDENCE_RANK[a.recommendation.confidence] ||
  QUALITY_RANK[b.item.evidenceBasis] - QUALITY_RANK[a.item.evidenceBasis] ||
  ACTION_ORDER[a.recommendation.actionType] - ACTION_ORDER[b.recommendation.actionType] ||
  a.rule.ruleId.localeCompare(b.rule.ruleId);

export function generateRecommendations(
  rawInput: RecommendationInput,
  rules: RecommendationRule[] = RECOMMENDATION_RULES,
  options: {
    allowExperimental?: boolean;
    allowAdvancedDrills?: boolean;
    allowProfessionalReview?: boolean;
  } = {},
): RecommendationResult {
  const input = recommendationInputSchema.parse(rawInput);
  const inputHash = stableHash({
    interpretationInputHash: input.interpretations.inputHash,
    context: input.context,
    libraryVersion: RECOMMENDATION_LIBRARY_VERSION,
  });
  const allInterpretations = [
    ...input.interpretations.interpretations,
    ...input.interpretations.contradictedInterpretations,
  ];
  const rejected = new Map<string, string>();
  for (const interpretation of allInterpretations) {
    const reason = interpretationRejection(interpretation, input);
    if (reason && interpretation.status !== "contradicted") rejected.set(interpretation.id, reason);
  }
  const eligible = allInterpretations.filter(
    (entry) => !rejected.has(entry.id) && entry.status !== "contradicted",
  );
  const trace: RecommendationTraceEntry[] = [];
  const candidates: Candidate[] = [];

  for (const rule of rules) {
    const item = recommendationLibraryItem(rule.libraryItemId);
    const considered = allInterpretations.filter((entry) =>
      rule.requiredInterpretationKeys.includes(entry.interpretationKey),
    );
    const source =
      rule.requiredInterpretationKeys.includes("contradictory_asymmetry")
        ? allInterpretations
        : eligible;
    const accepted = rule.evaluationFunction(source, input.context);
    const confidencePass = accepted.every(
      (entry) => CONFIDENCE_RANK[entry.confidence] >= CONFIDENCE_RANK[rule.minimumConfidence],
    );
    const qualityPass = accepted.every(
      (entry) => QUALITY_RANK[entry.evidenceQuality] >= QUALITY_RANK[rule.minimumEvidenceQuality],
    );
    const phasePass =
      rule.phaseApplicability.includes("any") || rule.phaseApplicability.includes(input.context.phase);
    const eventPass =
      rule.eventApplicability.includes("any") ||
      (input.context.event != null && rule.eventApplicability.includes(input.context.event));
    const gate = safetyGate(input.context, item.safetyTier);
    const featurePass =
      item.enabled &&
      rule.enabled &&
      (options.allowExperimental !== false || !rule.experimental) &&
      (options.allowProfessionalReview === true || item.actionType !== "coach_review") &&
      (options.allowAdvancedDrills === true || !DRILL_LIBRARY.find((drill) => drill.drillId === item.drillId)?.requiresCoachSupervision);
    const matches =
      accepted.length > 0 &&
      confidencePass &&
      qualityPass &&
      eventPass &&
      gate.allowed &&
      featurePass;
    if (matches) {
      const recommendation = buildRecommendation(input, rule, item, accepted, inputHash);
      // Phase-specific Tier 2/3 actions fail closed; Tier 1 evidence collection
      // remains useful when phase is unknown.
      if (phasePass || item.safetyTier === "tier_1") {
        candidates.push({ recommendation, rule, item });
      }
    }
    trace.push({
      ruleId: rule.ruleId,
      interpretationsConsidered: considered.map((entry) => entry.id),
      interpretationsAccepted: matches ? accepted.map((entry) => entry.id) : [],
      interpretationsRejected: considered
        .filter((entry) => !accepted.some((value) => value.id === entry.id) || !matches)
        .map((entry) => ({
          id: entry.id,
          reason:
            rejected.get(entry.id) ??
            (!confidencePass
              ? "Confidence threshold not met."
              : !qualityPass
                ? "Evidence-quality threshold not met."
                : !phasePass && item.safetyTier !== "tier_1"
                  ? "Phase is incompatible."
                  : !eventPass
                    ? "Event is incompatible."
                    : !gate.allowed
                      ? gate.reasons.join(" ")
                      : !featurePass
                        ? "Feature or library item disabled."
                        : "Rule did not match."),
        })),
      contextChecks: [`phase=${input.context.phase}`, `event=${input.context.event ?? "unknown"}`],
      confidenceThreshold: `${rule.minimumConfidence}: ${confidencePass ? "pass" : "fail"}`,
      evidenceQualityThreshold: `${rule.minimumEvidenceQuality}: ${qualityPass ? "pass" : "fail"}`,
      safetyTierDecision: `${item.safetyTier}: ${gate.allowed ? "allowed" : "blocked"}`,
      contraindicationChecks: gate.reasons.length ? gate.reasons : ["No active context contraindication reported."],
      goalMatching: goalRelevance(item, input.context),
      phaseMatching: phasePass ? "matched" : "not matched",
      conflictResolution: null,
      duplicateSuppression: null,
      libraryItemSelected: matches ? item.libraryItemId : null,
      finalParameterization: matches ? [item.recommendationKey, item.interventionType] : [],
      finalOutputId: matches ? `${RECOMMENDATION_ENGINE_VERSION}:${input.context.analysisId}:${rule.ruleId}` : null,
      suppressionReason: matches && (phasePass || item.safetyTier === "tier_1") ? null : "Rule safety or context requirements were not met.",
    });
  }

  const duplicateGroups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.rule.duplicateGroup}:${candidate.recommendation.phase}:${candidate.recommendation.side ?? "none"}`;
    const group = duplicateGroups.get(key) ?? [];
    group.push(candidate);
    duplicateGroups.set(key, group);
  }
  const deduped: Candidate[] = [];
  const suppressed: Recommendation[] = [];
  for (const group of duplicateGroups.values()) {
    const [winner, ...duplicates] = [...group].sort(candidateCompare);
    if (!winner) continue;
    deduped.push(winner);
    for (const duplicate of duplicates) {
      suppressed.push(recommendationSchema.parse({ ...duplicate.recommendation, status: "suppressed" }));
      const entry = trace.find((value) => value.ruleId === duplicate.rule.ruleId);
      if (entry) {
        entry.duplicateSuppression = `Suppressed by ${winner.rule.ruleId}.`;
        entry.finalOutputId = null;
        entry.suppressionReason = "Lower-risk or stronger duplicate retained.";
      }
    }
  }

  const conflictGroups = new Map<string, Candidate[]>();
  for (const candidate of deduped) {
    const key = candidate.rule.conflictGroup ?? `none:${candidate.rule.ruleId}`;
    const group = conflictGroups.get(key) ?? [];
    group.push(candidate);
    conflictGroups.set(key, group);
  }
  const final: Recommendation[] = [];
  for (const group of conflictGroups.values()) {
    const [winner, ...conflicts] = [...group].sort(candidateCompare);
    if (!winner) continue;
    final.push(winner.recommendation);
    for (const conflict of conflicts) {
      suppressed.push(recommendationSchema.parse({ ...conflict.recommendation, status: "suppressed" }));
      const entry = trace.find((value) => value.ruleId === conflict.rule.ruleId);
      if (entry) {
        entry.conflictResolution = `Suppressed by ${winner.rule.ruleId}.`;
        entry.finalOutputId = null;
        entry.suppressionReason = "Safer conflicting action retained.";
      }
    }
  }

  const preserveRecommendations = final.filter((entry) => entry.status === "preserve_only");
  const monitoringRecommendations = final.filter((entry) =>
    ["monitor_pattern", "collect_more_data", "record_again", "improve_recording_setup"].includes(entry.actionType),
  );
  const recommendations = final.filter(
    (entry) => !preserveRecommendations.includes(entry) && !monitoringRecommendations.includes(entry),
  );
  const warnings = [
    ...(allInterpretations.length === 0 ? ["No interpretations were supplied."] : []),
    ...(final.length === 0
      ? ["AVA does not have enough trusted evidence to suggest a mechanical change."]
      : []),
    ...(input.context.athlete.reportedPain === true
      ? ["Athlete-reported pain is present; ordinary drill recommendations are withheld."]
      : []),
  ];
  return recommendationResultSchema.parse({
    analysisId: input.context.analysisId,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    generatedAt: input.context.generatedAt,
    recommendations,
    preserveRecommendations,
    monitoringRecommendations,
    unavailableRecommendations: [],
    suppressedRecommendations: suppressed,
    warnings,
    trace,
    sourceInterpretationEngineVersion: "ava-interpretations-v1",
    sourceObservationEngineVersion: "ava-observations-v1",
    libraryVersion: RECOMMENDATION_LIBRARY_VERSION,
    ruleVersions: Object.fromEntries(rules.map((rule) => [rule.ruleId, rule.version])),
    inputHash,
  });
}
