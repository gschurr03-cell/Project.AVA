import type { Recommendation } from "@/lib/intelligence/recommendationEngine";
import { stableFingerprint } from "@/lib/intelligence/shared/fingerprint";

import {
  PRIORITY_ENGINE_VERSION,
  priorityInputSchema,
  priorityResultSchema,
  prioritySchema,
  type NotPriority,
  type Priority,
  type PriorityInput,
  type PriorityResult,
  type PriorityTraceEntry,
} from "./contracts";
import { recommendationFamily, scoreRecommendation, type InternalPriorityScore } from "./policy";

interface Candidate {
  recommendation: Recommendation;
  priority: Priority;
  score: InternalPriorityScore;
  family: string;
  missingEvidence: boolean;
}

const CONFIDENCE_RANK = { Unavailable: 0, Low: 1, Moderate: 2, High: 3 } as const;
const SAFETY_RANK = { tier_1: 1, tier_2: 2, tier_3: 3, tier_4: 4 } as const;

const stableHash = stableFingerprint;

function expectedImpact(
  recommendation: Recommendation,
  missingEvidence: boolean,
): Priority["expectedImpact"] {
  if (recommendation.status === "preserve_only") return "Low";
  if (missingEvidence) return recommendation.confidence === "Unavailable" ? "Unknown" : "Moderate";
  if (
    recommendation.confidence === "High" &&
    ["strong", "moderate"].includes(recommendation.interventionEvidenceQuality) &&
    ["high", "moderate"].includes(recommendation.athleteGoalRelevance)
  )
    return "High";
  if (
    recommendation.confidence === "Moderate" &&
    recommendation.interventionEvidenceQuality !== "unknown"
  )
    return "Moderate";
  if (recommendation.confidence === "Low") return "Low";
  return "Unknown";
}

function buildPriority(
  input: PriorityInput,
  recommendation: Recommendation,
  score: InternalPriorityScore,
  kind: Priority["kind"],
): Priority {
  const increased = score.components
    .filter((component) => component.effect === "increased")
    .map((component) => component.reason);
  const whySelected =
    increased.length > 0
      ? increased
      : score.components.slice(0, 3).map((component) => component.reason);
  return prioritySchema.parse({
    priorityId: `${PRIORITY_ENGINE_VERSION}:${input.context.analysisId}:${recommendation.id}`,
    recommendationId: recommendation.id,
    kind,
    title: recommendation.title,
    whyItMatters: `${recommendation.objective} The expected outcome area is ${recommendation.expectedOutcomeArea}.`,
    whySelected,
    confidence: recommendation.confidence,
    expectedImpact: expectedImpact(recommendation, kind === "missing_evidence"),
    linkedEvidence: recommendation.supportingEvidence,
    linkedObservations: recommendation.linkedObservationIds,
    linkedInterpretations: recommendation.linkedInterpretationIds,
    linkedRecommendations: [recommendation.id],
    supportingMetrics: recommendation.monitoringPlan.metricKeys,
    limitations: recommendation.limitations,
    nextValidationStep: `${recommendation.monitoringPlan.preferredRecordingSetup} ${recommendation.monitoringPlan.reviewWindow}`,
    createdAt: input.context.generatedAt,
    engineVersion: PRIORITY_ENGINE_VERSION,
  });
}

const compare = (a: Candidate, b: Candidate): number =>
  b.score.value - a.score.value ||
  SAFETY_RANK[a.recommendation.safetyTier] - SAFETY_RANK[b.recommendation.safetyTier] ||
  a.recommendation.id.localeCompare(b.recommendation.id);

function validateLayerCompatibility(input: PriorityInput): void {
  if (
    input.interpretations.analysisId !== input.context.analysisId ||
    input.recommendations.analysisId !== input.context.analysisId
  )
    throw new Error("Priority inputs must belong to the same analysis.");
  if (
    input.recommendations.sourceInterpretationEngineVersion !==
    input.interpretations.engineVersion
  )
    throw new Error("Recommendation and Interpretation Engine versions are incompatible.");
  for (const observation of input.observations)
    if (!observation.id.includes(`:${input.context.analysisId}:`))
      throw new Error("Observation belongs to a different analysis.");
}

export function generatePriorities(rawInput: PriorityInput): PriorityResult {
  const input = priorityInputSchema.parse(rawInput);
  validateLayerCompatibility(input);
  const inputHash = stableHash({
    observationIds: input.observations.map((item) => item.id).sort(),
    interpretationInputHash: input.interpretations.inputHash,
    recommendationInputHash: input.recommendations.inputHash,
    context: input.context,
    engineVersion: PRIORITY_ENGINE_VERSION,
  });
  const highQualityRecording = input.observations.some(
    (item) =>
      item.ruleId === "recording.high_quality.v1" &&
      item.status === "supported" &&
      item.confidence !== "Unavailable",
  );
  const activeRecommendations = [
    ...input.recommendations.monitoringRecommendations,
    ...input.recommendations.recommendations,
  ].filter((item) => !["suppressed", "unavailable", "contradicted"].includes(item.status));
  const preserve = input.recommendations.preserveRecommendations;
  const trace: PriorityTraceEntry[] = [];

  const candidates: Candidate[] = activeRecommendations.map((recommendation) => {
    const linkedObservationCount = new Set(recommendation.linkedObservationIds).size;
    const score = scoreRecommendation(
      recommendation,
      input.context,
      linkedObservationCount,
      highQualityRecording,
    );
    const missingEvidence = [
      "record_again",
      "improve_recording_setup",
      "collect_more_data",
    ].includes(recommendation.actionType);
    const priority = buildPriority(
      input,
      recommendation,
      score,
      missingEvidence ? "missing_evidence" : "action",
    );
    trace.push({
      recommendationId: recommendation.id,
      recommendationKey: recommendation.recommendationKey,
      scoreComponents: score.components,
      classification: missingEvidence ? "missing_evidence" : "secondary",
      mergeBehavior: null,
      conflictHandling: null,
      suppressedBy: null,
    });
    return {
      recommendation,
      priority,
      score,
      family: recommendationFamily(recommendation),
      missingEvidence,
    };
  });

  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.family) ?? [];
    group.push(candidate);
    groups.set(candidate.family, group);
  }
  const deduped: Candidate[] = [];
  const notPriorities: NotPriority[] = [];
  for (const group of groups.values()) {
    const [winner, ...duplicates] = [...group].sort(compare);
    if (!winner) continue;
    deduped.push(winner);
    for (const duplicate of duplicates) {
      const entry = trace.find(
        (item) => item.recommendationId === duplicate.recommendation.id,
      );
      if (entry) {
        entry.classification = "suppressed";
        entry.mergeBehavior = `Merged into ${winner.recommendation.recommendationKey}.`;
        entry.suppressedBy = winner.recommendation.id;
      }
      notPriorities.push({
        id: `${PRIORITY_ENGINE_VERSION}:not:${duplicate.recommendation.id}`,
        title: duplicate.recommendation.title,
        reason: `Merged with ${winner.recommendation.title} because both address the same evidence family.`,
        linkedRecommendationId: duplicate.recommendation.id,
        linkedInterpretationIds: duplicate.recommendation.linkedInterpretationIds,
        confidence: duplicate.recommendation.confidence,
      });
    }
  }

  const strengths: Priority[] = [];
  for (const recommendation of preserve) {
    const score = scoreRecommendation(
      recommendation,
      input.context,
      new Set(recommendation.linkedObservationIds).size,
      highQualityRecording,
    );
    const family = recommendationFamily(recommendation);
    const competing = deduped.find((candidate) => candidate.family === family);
    if (
      competing &&
      CONFIDENCE_RANK[recommendation.confidence] >=
        CONFIDENCE_RANK[competing.recommendation.confidence]
    ) {
      deduped.splice(deduped.indexOf(competing), 1);
      const entry = trace.find(
        (item) => item.recommendationId === competing.recommendation.id,
      );
      if (entry) {
        entry.classification = "suppressed";
        entry.conflictHandling = `Preserve recommendation ${recommendation.id} has equal or stronger confidence.`;
        entry.suppressedBy = recommendation.id;
      }
      notPriorities.push({
        id: `${PRIORITY_ENGINE_VERSION}:not:${competing.recommendation.id}`,
        title: competing.recommendation.title,
        reason: "A stronger preserve finding conflicts with changing this evidence family.",
        linkedRecommendationId: competing.recommendation.id,
        linkedInterpretationIds: competing.recommendation.linkedInterpretationIds,
        confidence: competing.recommendation.confidence,
      });
    }
    strengths.push(buildPriority(input, recommendation, score, "strength"));
    notPriorities.push({
      id: `${PRIORITY_ENGINE_VERSION}:not:${recommendation.id}`,
      title: recommendation.title,
      reason: `${recommendation.expectedOutcomeArea} is currently a supported strength to preserve, not a change priority.`,
      linkedRecommendationId: recommendation.id,
      linkedInterpretationIds: recommendation.linkedInterpretationIds,
      confidence: recommendation.confidence,
    });
    trace.push({
      recommendationId: recommendation.id,
      recommendationKey: recommendation.recommendationKey,
      scoreComponents: score.components,
      classification: "strength",
      mergeBehavior: null,
      conflictHandling: null,
      suppressedBy: null,
    });
  }

  for (const suppressed of input.recommendations.suppressedRecommendations) {
    notPriorities.push({
      id: `${PRIORITY_ENGINE_VERSION}:not:${suppressed.id}`,
      title: suppressed.title,
      reason: "The Recommendation Engine suppressed this overlapping or conflicting action.",
      linkedRecommendationId: suppressed.id,
      linkedInterpretationIds: suppressed.linkedInterpretationIds,
      confidence: suppressed.confidence,
    });
  }

  const ranked = [...deduped].sort(compare);
  const top = ranked.slice(0, 3);
  const secondary = ranked.slice(3, 8);
  for (const candidate of top) {
    const entry = trace.find(
      (item) => item.recommendationId === candidate.recommendation.id,
    );
    if (entry) entry.classification = "top";
  }
  for (const candidate of secondary) {
    const entry = trace.find(
      (item) => item.recommendationId === candidate.recommendation.id,
    );
    if (entry) entry.classification = "secondary";
  }

  const missingEvidencePriorities = ranked
    .filter((candidate) => candidate.missingEvidence)
    .map((candidate) => candidate.priority);
  const warnings = [
    ...(ranked.length === 0 ? ["No actionable recommendation was available to rank."] : []),
    ...(input.context.persistenceSignals.length === 0
      ? ["Cross-session persistence is unavailable and contributes no ranking benefit."]
      : []),
    ...(input.context.phase === "unknown"
      ? ["Sprint phase is unknown; phase-specific actions receive less support."]
      : []),
  ];
  return priorityResultSchema.parse({
    analysisId: input.context.analysisId,
    engineVersion: PRIORITY_ENGINE_VERSION,
    generatedAt: input.context.generatedAt,
    topPriorities: top.map((candidate) => candidate.priority),
    supportingStrengths: strengths,
    secondaryPriorities: secondary.map((candidate) => candidate.priority),
    notPriorities,
    missingEvidencePriorities,
    warnings,
    sourceRecommendationEngineVersion: "ava-recommendations-v1",
    inputHash,
    trace,
  });
}
