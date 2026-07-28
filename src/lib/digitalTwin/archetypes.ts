import type { ArchetypeSignal, MovementArchetype } from "./contracts";

const mapping = {
  acceleration_strength: "power_accelerator", frequency_dominance: "frequency_dominant",
  stride_dominance: "stride_dominant", balanced_mechanics: "balanced_sprinter",
  elastic_behavior: "elastic_runner", high_variability: "high_variability",
  late_development: "late_developer", technical_strength: "technical_specialist",
} as const;

export function buildMovementArchetypes(
  signals: ArchetypeSignal[], snapshotId: string, observedAt: string,
  previous: MovementArchetype[] = [],
): MovementArchetype[] {
  const grouped = new Map<MovementArchetype["archetype"], ArchetypeSignal[]>();
  signals.forEach((signal) => {
    const archetype = mapping[signal.signalKey];
    grouped.set(archetype, [...(grouped.get(archetype) ?? []), signal]);
  });
  if (!grouped.size) return [];
  return [...grouped].map(([archetype, evidence]) => {
    const confidence = Number((evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length).toFixed(3));
    const prior = previous.find((item) => item.archetype === archetype);
    return {
      archetype, confidence,
      supportingEvidence: [...new Set(evidence.flatMap((item) => item.supportingEventIds))].sort(),
      history: [...(prior?.history ?? []), { snapshotId, confidence, observedAt }],
      experimental: true as const,
    };
  }).sort((a, b) => a.archetype.localeCompare(b.archetype));
}

