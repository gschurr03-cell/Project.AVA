import {
  OBSERVATION_ENGINE_VERSION,
  completedAnalysisObservationInputSchema,
  observationSchema,
  type CompletedAnalysisObservationInput,
  type Observation,
  type ObservationDebugTraceEntry,
  type ObservationEvidence,
  type ObservationGenerationResult,
} from "./contracts";
import { OBSERVATION_RULES, type ObservationRule, type ObservationRuleOutput } from "./rules";

const CONFIDENCE_RANK = { Unavailable: 0, Low: 1, Moderate: 2, High: 3 } as const;
const DIRECTNESS_RANK = { context: 0, derived: 1, direct: 2 } as const;

interface Candidate {
  rule: ObservationRule;
  output: ObservationRuleOutput;
}

const evidenceStrength = (evidence: ObservationEvidence[]): number =>
  evidence.reduce((total, item) => total + DIRECTNESS_RANK[item.directness], 0);

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    CONFIDENCE_RANK[b.output.confidence] - CONFIDENCE_RANK[a.output.confidence] ||
    evidenceStrength(b.output.evidence) - evidenceStrength(a.output.evidence) ||
    b.output.evidence.length - a.output.evidence.length ||
    a.rule.ruleId.localeCompare(b.rule.ruleId)
  );
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

const evidenceKey = (item: ObservationEvidence): string =>
  [
    item.metric,
    String(item.value),
    item.unit,
    item.source,
    item.frameRange?.startFrame ?? "",
    item.frameRange?.endFrame ?? "",
  ].join(":");

const deterministicId = (
  input: CompletedAnalysisObservationInput,
  candidate: Candidate,
): string =>
  `${OBSERVATION_ENGINE_VERSION}:${input.analysisId.replace(/[^a-zA-Z0-9-]/g, "-")}:${candidate.rule.ruleId}`;

/** Pure observation generation with a complete development trace. */
export function generateObservationResult(
  rawInput: CompletedAnalysisObservationInput,
  rules: ObservationRule[] = OBSERVATION_RULES,
): ObservationGenerationResult {
  const input = completedAnalysisObservationInputSchema.parse(rawInput);
  const trace: ObservationDebugTraceEntry[] = [];
  const candidates: Candidate[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      trace.push({
        ruleId: rule.ruleId,
        fired: false,
        evidenceConsumed: [],
        confidenceSource: null,
        reason: "Rule disabled.",
        suppressedBy: null,
        mergedInto: null,
      });
      continue;
    }
    const output = rule.evaluate(input);
    trace.push({
      ruleId: rule.ruleId,
      fired: output != null,
      evidenceConsumed: output?.evidence.map((item) => item.metric) ?? [],
      confidenceSource:
        output?.evidence.find((item) => item.confidence !== "Unavailable")?.source ?? null,
      reason: output
        ? "Rule conditions matched existing analysis evidence."
        : "Rule conditions did not match.",
      suppressedBy: null,
      mergedInto: null,
    });
    if (output) candidates.push({ rule, output });
  }

  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.output.dedupeKey) ?? [];
    group.push(candidate);
    groups.set(candidate.output.dedupeKey, group);
  }

  const merged: Candidate[] = [];
  for (const group of groups.values()) {
    const [winner, ...duplicates] = [...group].sort(compareCandidates);
    if (!winner) continue;
    winner.output.evidence = uniqueBy(
      group.flatMap((candidate) => candidate.output.evidence),
      evidenceKey,
    );
    winner.output.limitations = uniqueBy(
      group.flatMap((candidate) => candidate.output.limitations),
      (item) => `${item.code}:${item.source}`,
    );
    merged.push(winner);
    for (const duplicate of duplicates) {
      const entry = trace.find((item) => item.ruleId === duplicate.rule.ruleId);
      if (entry) {
        entry.mergedInto = winner.rule.ruleId;
        entry.reason = `Merged duplicate evidence into ${winner.rule.ruleId}.`;
      }
    }
  }

  const conflictGroups = new Map<string, Candidate[]>();
  for (const candidate of merged) {
    const key = candidate.output.conflictKey ?? `none:${candidate.output.dedupeKey}`;
    const group = conflictGroups.get(key) ?? [];
    group.push(candidate);
    conflictGroups.set(key, group);
  }

  const retained: Candidate[] = [];
  for (const group of conflictGroups.values()) {
    const [winner, ...conflicts] = [...group].sort(compareCandidates);
    if (!winner) continue;
    retained.push(winner);
    for (const conflict of conflicts) {
      const entry = trace.find((item) => item.ruleId === conflict.rule.ruleId);
      if (entry) {
        entry.suppressedBy = winner.rule.ruleId;
        entry.reason = `Suppressed by stronger conflicting observation ${winner.rule.ruleId}.`;
      }
    }
  }

  const observations = retained
    .sort((a, b) => a.rule.ruleId.localeCompare(b.rule.ruleId))
    .map((candidate): Observation =>
      observationSchema.parse({
        id: deterministicId(input, candidate),
        category: candidate.rule.category,
        title: candidate.output.title,
        summary: candidate.output.summary,
        status: candidate.output.status,
        confidence: candidate.output.confidence,
        severity: candidate.output.severity,
        evidence: candidate.output.evidence,
        limitations: candidate.output.limitations,
        phase: candidate.output.phase,
        side: candidate.output.side,
        createdAt: input.completedAt,
        engineVersion: OBSERVATION_ENGINE_VERSION,
        ruleId: candidate.rule.ruleId,
        supportingMetrics: uniqueBy(
          candidate.output.evidence.map((item) => item.metric),
          (item) => item,
        ),
        availability: candidate.output.availability,
        experimental: candidate.output.experimental,
      }),
    );

  return { observations, trace };
}

export const generateObservations = (
  input: CompletedAnalysisObservationInput,
): Observation[] => generateObservationResult(input).observations;
