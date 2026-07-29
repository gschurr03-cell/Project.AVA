import type { OptimizationCandidate } from "./contracts";
import { PERFORMANCE_OPTIMIZATION_POLICY } from "./policy";

export function calculatePerformanceImpact(input: {
  item: OptimizationCandidate; measurementQuality: number; digitalTwinMaturity: number;
}) {
  const values: Record<string, { value: number; sourceIds: string[] }> = {
    expectedRacePerformanceInfluence: { value: input.item.expectedRacePerformanceInfluence, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    potentialImprovement: { value: input.item.potentialImprovement, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    phaseTransfer: { value: input.item.phaseTransfer, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    eventTransfer: { value: input.item.eventTransfer, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    historicalEffectiveness: { value: Math.max(0,(input.item.historicalEffectiveness+1)/2), sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    recommendationAdherence: { value: input.item.recommendationAdherence, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    confidence: { value: input.item.candidate.confidence, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    evidenceQuality: { value: input.item.evidenceQuality, sourceIds: input.item.candidate.supportingEvidence.map(x=>x.evidenceId) },
    researchSupport: { value: input.item.researchSupport, sourceIds: input.item.researchEvidenceIds },
    measurementQuality: { value: input.measurementQuality, sourceIds: [] },
    digitalTwinMaturity: { value: input.digitalTwinMaturity, sourceIds: [] },
    projectionConfidence: { value: input.item.projectionConfidence, sourceIds: input.item.projectionIds },
    benchmarkEvidence: { value: input.item.benchmarkEvidence, sourceIds: input.item.benchmarkComparisonIds },
    benchmarkSimilarity: { value: input.item.benchmarkSimilarity, sourceIds: input.item.benchmarkComparisonIds },
  };
  const components = Object.entries(PERFORMANCE_OPTIMIZATION_POLICY.impactWeights).map(([component, weight]) => ({
    component, rawValue: values[component].value, weight,
    weightedValue: values[component].value*weight, sourceIds: values[component].sourceIds,
  }));
  return { components, impactScore: components.reduce((sum,item)=>sum+item.weightedValue,0)*100 };
}

export function diminishingReturnMultiplier(item: OptimizationCandidate) {
  const exposureDecay = 1 / (1 + item.priorInvestmentCount * 0.12);
  const remainingBenefit = Math.max(0.2, 1 - item.capturedBenefit * 0.75);
  const plateau = item.plateauDetected ? 0.65 : 1;
  return exposureDecay * remainingBenefit * plateau;
}
