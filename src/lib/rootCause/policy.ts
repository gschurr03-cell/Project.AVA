export const ROOT_CAUSE_POLICY = Object.freeze({
  supportedThreshold: 0.68, possibleThreshold: 0.38,
  evidenceRequestThreshold: 0.58, unknownPenaltyPerVariable: 0.035,
  maximumUnknownPenalty: 0.25, contradictionPenaltyPerItem: 0.08,
  missingEvidencePenaltyPerItem: 0.04, maximumMissingPenalty: 0.2,
  coachConfirmMultiplier: 1.08, coachUpgradeMultiplier: 1.12,
  coachDowngradeMultiplier: 0.75,
  weights: {
    interpretationConfidence: 0.2, measurementQuality: 0.16,
    observationConsistency: 0.16, digitalTwinMaturity: 0.12,
    historicalStability: 0.1, researchQuality: 0.08,
    benchmarkSimilarity: 0.08, supportingEvidence: 0.1,
  },
});
