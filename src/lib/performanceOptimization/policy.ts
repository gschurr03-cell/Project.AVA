export const PERFORMANCE_OPTIMIZATION_POLICY = Object.freeze({
  activeFocusLimit: 2,
  competitionProtectionDays: 14,
  unknownPenaltyPerVariable: 0.025,
  maximumUnknownPenalty: 0.2,
  dependencyBonusMaximum: 0.15,
  interactionModifierMaximum: 0.12,
  lowerRankingMultiplier: 0.75,
  raiseRankingMultiplier: 1.2,
  acceptMultiplier: 1.05,
  lockScoreFloor: 99,
  seasonMatchMultiplier: 1.1,
  seasonMismatchMultiplier: 0.82,
  competitionUnsafeMultiplier: 0.35,
  competitionModerateRiskMultiplier: 0.78,
  adaptationMultiplier: {
    rapid_responder: 1.12, steady_responder: 1, slow_responder: 0.82,
    plateaus_quickly: 0.68, high_variability: 0.72, late_responder: 0.8, unknown: 0.75,
  },
  impactWeights: {
    expectedRacePerformanceInfluence: 0.16, potentialImprovement: 0.14,
    phaseTransfer: 0.08, eventTransfer: 0.07, historicalEffectiveness: 0.1,
    recommendationAdherence: 0.06, confidence: 0.09, evidenceQuality: 0.07,
    researchSupport: 0.05, measurementQuality: 0.05, digitalTwinMaturity: 0.04,
    projectionConfidence: 0.03, benchmarkEvidence: 0.03, benchmarkSimilarity: 0.03,
  },
});

