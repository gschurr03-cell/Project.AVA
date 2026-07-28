import type { EvidenceReference, Limiter, LimiterInput } from "./contracts";

export function buildLimiters(inputs: LimiterInput[], evidence: EvidenceReference[]): Limiter[] {
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  return inputs.flatMap((input, index) => {
    const supportingEvidence = input.supportingEvidenceIds.flatMap((id) => {
      const item = evidenceById.get(id);
      return item ? [item] : [];
    });
    if (supportingEvidence.length !== input.supportingEvidenceIds.length) return [];
    return [{
      ...input,
      limiterId: `${input.upstreamSource}:${input.category}:${index + 1}`,
      supportingEvidence,
    }];
  });
}

