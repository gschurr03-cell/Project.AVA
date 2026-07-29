import {
  ADAPTIVE_COACHING_ENGINE_VERSION, COACHING_STATE_SCHEMA_VERSION,
  adaptiveCoachingInputSchema, coachingStateSchema,
  type AdaptiveCoachingInput, type CoachingCandidate, type CoachingFocus,
  type CoachingState,
} from "./contracts";
import { ADAPTIVE_COACHING_POLICY as POLICY } from "./policy";
import { confidenceLevel100 } from "@/lib/intelligence/shared/confidence";
import { stableFingerprint } from "@/lib/intelligence/shared/fingerprint";

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString();
const unique = <T>(values: T[]) => [...new Set(values)];
const stableHash = stableFingerprint;

function focusFor(
  candidate: CoachingCandidate, disposition: CoachingFocus["disposition"],
  generatedAt: string, unknownVariables: string[], explanation: string,
  historicalSupport: string[], confidence: number,
): CoachingFocus {
  return {
    focusId: `${ADAPTIVE_COACHING_ENGINE_VERSION}:${disposition}:${candidate.candidateId}`,
    candidateId: candidate.candidateId, recommendationId: candidate.recommendationId,
    priorityId: candidate.priorityId, disposition, category: candidate.category,
    title: candidate.title, objective: candidate.objective,
    evidence: candidate.supportingEvidence, historicalSupport,
    confidence: Math.min(candidate.confidence, confidence), explanation,
    unknownVariables, reviewAt: addDays(generatedAt, candidate.monitoringPlan.reviewWindowDays),
    monitoringPlan: candidate.monitoringPlan, engineVersion: ADAPTIVE_COACHING_ENGINE_VERSION,
  };
}

export function evaluateAdaptiveCoaching(rawInput: AdaptiveCoachingInput): CoachingState {
  const input = adaptiveCoachingInputSchema.parse(rawInput);
  const optimization = input.optimizationState;
  const generatedMs = Date.parse(input.generatedAt);
  const competitionMs = input.competitionSchedule.nextCompetitionAt
    ? Date.parse(input.competitionSchedule.nextCompetitionAt) : null;
  const daysToCompetition = competitionMs == null || competitionMs < generatedMs
    ? null : Math.ceil((competitionMs - generatedMs) / 86_400_000);
  const toFocus = (
    decision: typeof optimization.recommendedInvestmentOrder[number],
    disposition: CoachingFocus["disposition"],
  ) => focusFor(decision.candidate, disposition, input.generatedAt,
    unique([...input.unknownVariables, ...decision.unknownVariables]).sort(),
    decision.whySelectedOrDeferred, decision.historicalSupport, decision.confidence);
  const active = optimization.recommendedInvestmentOrder.map((decision, index) =>
    toFocus(decision, index === 0 ? "primary" : "secondary"));
  const maintenance = optimization.maintenanceFocuses.map((decision) =>
    toFocus(decision, "maintenance"));
  const monitoring = [
    ...optimization.monitoringFocuses,
    ...optimization.deferredFocuses,
    ...optimization.ignoredFocuses,
  ].map((decision) => toFocus(decision, "monitoring"));
  const retired = optimization.retiredFocuses.map((decision) => toFocus(decision, "retired"));
  const latestEvidenceAt = input.digitalTwin.confidenceScore.lastEvidenceAt;
  const ageDays = latestEvidenceAt == null ? null :
    Math.max(0, Math.floor((generatedMs - Date.parse(latestEvidenceAt)) / 86_400_000));
  const freshness = ageDays == null ? "unavailable" : ageDays <= POLICY.freshEvidenceDays
    ? "fresh" : ageDays <= POLICY.agingEvidenceDays ? "aging" : "stale";
  let confidenceScore = Math.round(Math.min(
    optimization.confidence.score, input.digitalTwin.confidenceScore.score,
    input.measurementQuality * 100,
  ));
  if (freshness === "stale") confidenceScore = Math.min(confidenceScore, 49);
  const limitingFactors = unique([
    ...optimization.confidence.limitingFactors,
    ...(freshness === "stale" ? ["Digital Twin evidence is stale."] : []),
    ...(!active.length ? ["Optimizer found no validated active investment focus."] : []),
  ]);
  const confidenceLevel = confidenceLevel100(confidenceScore);
  const reviewDays = active.length
    ? Math.min(...active.map((focus) => focus.monitoringPlan.reviewWindowDays))
    : POLICY.baseReviewDays;
  const reviewAt = addDays(input.generatedAt,
    daysToCompetition != null ? Math.min(reviewDays, Math.max(1, daysToCompetition)) : reviewDays);
  const allDecisions = [
    ...optimization.recommendedInvestmentOrder, ...optimization.maintenanceFocuses,
    ...optimization.monitoringFocuses, ...optimization.deferredFocuses,
    ...optimization.ignoredFocuses, ...optimization.retiredFocuses,
  ];
  const evidenceSummary = unique(allDecisions.flatMap((decision) =>
    decision.candidate.supportingEvidence.map((evidence) => JSON.stringify(evidence))))
    .map((item) => JSON.parse(item));
  const inputFingerprint = stableHash({
    athleteId: input.athleteId, generatedAt: input.generatedAt,
    twinId: input.digitalTwin.twinId, twinUpdatedAt: input.digitalTwin.updatedAt,
    optimizationId: optimization.optimizationId,
    optimizationFingerprint: optimization.inputFingerprint,
    processedTriggerIds: input.processedTriggers.map((item) => item.triggerId).sort(),
    engineVersion: ADAPTIVE_COACHING_ENGINE_VERSION,
  });
  const previousPrimary = input.previousState?.primaryCandidateId ?? null;
  const currentPrimary = active[0]?.candidateId ?? null;
  const change = !input.previousState ? "initialized" :
    previousPrimary === currentPrimary ? (currentPrimary ? "retained" : "none") :
      currentPrimary == null ? "cleared" : "changed";
  const competitionAdjustments: CoachingState["competitionAdjustments"] =
    optimization.competitionAdjustments
      .filter((item) => item.multiplier < 1)
      .map((item) => ({
        candidateId: item.candidateId,
        adjustment: item.multiplier <= 0.35 ? "moved_to_monitoring" : "maintained",
        reason: item.reason,
      }));
  return coachingStateSchema.parse({
    coachingStateId: input.coachingStateId, athleteId: input.athleteId,
    engineVersion: ADAPTIVE_COACHING_ENGINE_VERSION,
    schemaVersion: COACHING_STATE_SCHEMA_VERSION,
    generatedAt: input.generatedAt, inputFingerprint,
    currentPrimaryFocus: active[0] ?? null, secondaryFocuses: active.slice(1),
    maintenanceFocuses: maintenance.slice(0, POLICY.maximumMaintenanceFocuses),
    retiredPriorities: retired,
    monitoringFocuses: monitoring.slice(0, POLICY.maximumMonitoringFocuses),
    competitionAdjustments,
    coachingEvolution: {
      previousPrimaryCandidateId: previousPrimary, currentPrimaryCandidateId: currentPrimary,
      change,
      reason: change === "retained" ? "The optimizer retained the highest-return focus." :
        change === "changed" ? "A new cached optimization state changed investment order." :
          change === "cleared" ? "The optimizer found no validated investment focus." :
            change === "initialized" ? "Initial optimizer-directed coaching state created." :
              "No primary focus is available.",
    },
    seasonContext: {
      stage: input.seasonStage, trainingPhase: input.trainingPhase,
      nextCompetitionAt: input.competitionSchedule.nextCompetitionAt,
      daysToCompetition, scheduleVersion: input.competitionSchedule.scheduleVersion,
    },
    adaptationSummary: input.digitalTwin.trendHistory.map((trend) => ({
      signalId: trend.trendId, classification: trend.classification,
      evidenceIds: trend.sourceEventIds, confidence: trend.confidence,
    })),
    recommendationMemory: input.digitalTwin.recommendationHistory,
    coachingConfidence: { score: confidenceScore, level: confidenceLevel, limitingFactors },
    activeWarnings: [
      ...(freshness === "stale" ? ["Coaching state uses stale athlete evidence."] : []),
      ...input.digitalTwin.riskFlags.map((flag) => flag.summary),
    ],
    evidenceSummary,
    unknownVariables: unique([...input.unknownVariables, ...optimization.unknownVariables]).sort(),
    nextEvaluation: {
      reviewAt,
      reason: active.length ? "Review optimizer-selected focus monitoring evidence." :
        "Collect validated evidence before selecting a focus.",
      triggeringEvents: ["new_completed_analysis", "coach_override", "digital_twin_update",
        "competition_schedule", "season_transition"],
    },
    dataFreshness: { status: freshness, latestEvidenceAt, ageDays },
    notifications: [{
      notificationId: `${input.coachingStateId}:focus-review`, type: "focus_review",
      title: "Coaching focus review",
      body: "Review the current cached optimizer-directed coaching focus.",
      deliverAt: reviewAt,
    }],
    invalidationContext: {
      twinUpdatedAt: input.digitalTwin.updatedAt,
      benchmarkVersion: optimization.invalidationContext.benchmarkVersion,
      researchVersion: optimization.invalidationContext.researchVersion,
      scheduleVersion: input.competitionSchedule.scheduleVersion,
      overrideIds: optimization.invalidationContext.overrideIds,
      processedTriggerIds: input.processedTriggers.map((item) => item.triggerId).sort(),
      optimizationId: optimization.optimizationId,
      optimizationFingerprint: optimization.inputFingerprint,
    },
    computePolicy: {
      evaluatedOn: "server", servedFromCacheOnOpen: true,
      externalModelCalls: 0, deterministicFallback: true,
    },
  });
}
