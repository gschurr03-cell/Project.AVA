import type { Observation, ObservationEvidence } from "@/lib/observations";
import { stableFingerprint } from "@/lib/intelligence/shared/fingerprint";

import { aggregateInterpretationConfidence } from "./confidence";
import {
  INTERPRETATION_ENGINE_VERSION,
  interpretationInputSchema,
  interpretationResultSchema,
  interpretationSchema,
  type Interpretation,
  type InterpretationInput,
  type InterpretationResult,
  type InterpretationTraceEntry,
} from "./contracts";
import { determineEvidenceQuality } from "./evidenceQuality";
import { assertSafeInterpretationLanguage } from "./languageSafety";
import {
  INTERPRETATION_RULES,
  type InterpretationDraft,
  type InterpretationRule,
} from "./registry";

interface Candidate {
  interpretation: Interpretation;
  rule: InterpretationRule;
  draft: InterpretationDraft;
}

const unique = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const stableHash = stableFingerprint;

function evidenceKey(item: ObservationEvidence): string {
  return `${item.metric}:${String(item.value)}:${item.source}:${item.frameRange?.startFrame ?? ""}:${item.frameRange?.endFrame ?? ""}`;
}

function inputRejection(observation: Observation, analysisId: string): string | null {
  if (!observation.id.includes(`:${analysisId}:`)) return "Observation belongs to a different analysis.";
  if (observation.engineVersion !== "ava-observations-v1") return "Observation engine version is incompatible.";
  if (observation.status === "contradicted") return "Observation is contradicted.";
  if (observation.status === "unavailable" || observation.availability !== "available")
    return "Observation is unavailable or withheld.";
  if (!observation.evidence.length) return "Observation has no evidence.";
  if (observation.evidence.some((item) => item.value == null || item.availability !== "available"))
    return "Observation evidence is null, unavailable, or withheld.";
  if (observation.confidence === "Unavailable") return "Observation confidence is unavailable.";
  return null;
}

function candidateScore(candidate: Candidate): number {
  const confidence = { Unavailable: 0, Low: 1, Moderate: 2, High: 3 }[
    candidate.interpretation.confidence
  ];
  const quality = { unavailable: 0, heuristic: 1, limited: 2, moderate: 3, strong: 4 }[
    candidate.interpretation.evidenceQuality
  ];
  return (
    candidate.interpretation.linkedObservationIds.length * 100 +
    quality * 10 +
    confidence -
    (candidate.interpretation.experimental ? 1 : 0)
  );
}

function buildInterpretation(
  input: InterpretationInput,
  rule: InterpretationRule,
  observations: Observation[],
  draft: InterpretationDraft,
  inputHash: string,
  contextRequired: boolean,
): Interpretation {
  const confidenceResult = aggregateInterpretationConfidence(
    observations,
    input.context,
    draft.alternativeExplanations.length,
  );
  const qualityResult = determineEvidenceQuality(observations, draft.evidenceKind);
  const experimental =
    rule.experimental ||
    observations.some((item) => item.experimental) ||
    input.context.fpsTier === "experimental_30";
  const status =
    draft.interpretationKey === "contradictory_asymmetry"
      ? "contradicted"
      : experimental
        ? "experimental"
        : contextRequired
          ? "context_required"
          : confidenceResult.confidence === "Low" || qualityResult.quality === "heuristic"
            ? "limited"
            : "supported";
  const fields = {
    title: draft.title,
    summary: draft.summary,
    explanation: draft.explanation,
    likelyMeaning: draft.likelyMeaning,
  };
  assertSafeInterpretationLanguage(fields);
  const limitations = unique(
    observations.flatMap((item) => item.limitations),
    (item) => `${item.code}:${item.source}`,
  );
  if (contextRequired) {
    limitations.push({
      code: "required_context_missing",
      message: "Required sprint-phase context is missing or incompatible.",
      source: "interpretation.context",
    });
  }
  const linkedIds = observations.map((item) => item.id).sort();
  return interpretationSchema.parse({
    id: `${INTERPRETATION_ENGINE_VERSION}:${input.context.analysisId}:${rule.ruleId}`,
    interpretationKey: draft.interpretationKey,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    category: rule.category,
    ...fields,
    alternativeExplanations: draft.alternativeExplanations,
    linkedObservationIds: linkedIds,
    supportingEvidence: unique(
      observations.flatMap((item) => item.evidence),
      evidenceKey,
    ),
    status,
    confidence: confidenceResult.confidence,
    confidenceReasons: confidenceResult.reasons,
    evidenceQuality: qualityResult.quality,
    evidenceQualityReasons: qualityResult.reasons,
    severity: observations[0]?.severity ?? "Unknown",
    phase: input.context.phase,
    side:
      new Set(observations.map((item) => item.side).filter(Boolean)).size === 1
        ? observations.find((item) => item.side)?.side ?? null
        : null,
    limitations,
    contextDependencies: draft.contextDependencies,
    excludedConclusions: draft.excludedConclusions,
    experimental,
    createdAt: input.context.generatedAt,
    engineVersion: INTERPRETATION_ENGINE_VERSION,
    provenance: {
      sourceObservationEngineVersion: "ava-observations-v1",
      sourceObservationIds: linkedIds,
      sourceObservationRuleIds: observations.map((item) => item.ruleId).sort(),
      sourceAnalysisId: input.context.analysisId,
      inputHash,
      contextVersion: input.context.contextVersion,
    },
  });
}

export function generateInterpretations(
  rawInput: InterpretationInput,
  rules: InterpretationRule[] = INTERPRETATION_RULES,
  options: { allowExperimental?: boolean } = {},
): InterpretationResult {
  const input = interpretationInputSchema.parse(rawInput);
  const inputHash = stableHash({
    observations: [...input.observations].sort((a, b) => a.id.localeCompare(b.id)),
    context: input.context,
    engineVersion: INTERPRETATION_ENGINE_VERSION,
  });
  const globalRejected = new Map<string, string>();
  for (const observation of input.observations) {
    const reason =
      options.allowExperimental === false && observation.experimental
        ? "Experimental interpretations are disabled."
        : inputRejection(observation, input.context.analysisId);
    if (reason) globalRejected.set(observation.id, reason);
  }
  const eligible = input.observations.filter((item) => !globalRejected.has(item.id));
  const trace: InterpretationTraceEntry[] = [];
  const candidates: Candidate[] = [];

  for (const rule of rules) {
    const considered = input.observations.filter(
      (item) =>
        rule.requiredObservationKeys.includes(item.ruleId) ||
        rule.requiredObservationKeys.some((key) => key.startsWith("two_")) ||
        item.category === rule.category,
    );
    if (!rule.enabled) {
      trace.push({
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        observationsConsidered: considered.map((item) => item.id),
        observationsAccepted: [],
        observationsRejected: [],
        contextChecks: [],
        exclusions: rule.exclusionObservationKeys,
        confidenceCalculation: [],
        evidenceQualityCalculation: [],
        alternativeExplanationsSelected: [],
        conflictResolution: null,
        mergeBehavior: null,
        finalOutputId: null,
        suppressionReason: "Rule disabled.",
      });
      continue;
    }
    if (rule.experimental && options.allowExperimental === false) {
      trace.push({
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        observationsConsidered: considered.map((item) => item.id),
        observationsAccepted: [],
        observationsRejected: considered.map((item) => ({
          id: item.id,
          reason: "Experimental interpretations are disabled.",
        })),
        contextChecks: [],
        exclusions: rule.exclusionObservationKeys,
        confidenceCalculation: [],
        evidenceQualityCalculation: [],
        alternativeExplanationsSelected: [],
        conflictResolution: null,
        mergeBehavior: null,
        finalOutputId: null,
        suppressionReason: "Experimental interpretations are disabled.",
      });
      continue;
    }
    const accepted = rule.evaluationFunction(eligible, input.context);
    const phaseApplicable =
      rule.phaseApplicability.includes("any") ||
      rule.phaseApplicability.includes(input.context.phase);
    const contextRequired =
      !phaseApplicable || (input.context.phase === "unknown" && !rule.phaseApplicability.includes("any"));
    const rejected = considered
      .filter((item) => !accepted.some((acceptedItem) => acceptedItem.id === item.id))
      .map((item) => ({
        id: item.id,
        reason: globalRejected.get(item.id) ?? "Rule conditions did not accept this observation.",
      }));
    if (!accepted.length) {
      trace.push({
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        observationsConsidered: considered.map((item) => item.id),
        observationsAccepted: [],
        observationsRejected: rejected,
        contextChecks: [`phase=${input.context.phase}`, `phaseApplicable=${phaseApplicable}`],
        exclusions: rule.exclusionObservationKeys,
        confidenceCalculation: [],
        evidenceQualityCalculation: [],
        alternativeExplanationsSelected: [],
        conflictResolution: null,
        mergeBehavior: null,
        finalOutputId: null,
        suppressionReason: "Required trusted observations were not available.",
      });
      continue;
    }
    const draft = rule.outputFactory(accepted, input.context);
    const interpretation = buildInterpretation(
      input,
      rule,
      accepted,
      draft,
      inputHash,
      contextRequired,
    );
    candidates.push({ interpretation, rule, draft });
    trace.push({
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      observationsConsidered: considered.map((item) => item.id),
      observationsAccepted: accepted.map((item) => item.id),
      observationsRejected: rejected,
      contextChecks: [`phase=${input.context.phase}`, `phaseApplicable=${phaseApplicable}`],
      exclusions: draft.excludedConclusions,
      confidenceCalculation: interpretation.confidenceReasons,
      evidenceQualityCalculation: interpretation.evidenceQualityReasons,
      alternativeExplanationsSelected: draft.alternativeExplanations,
      conflictResolution: null,
      mergeBehavior: null,
      finalOutputId: interpretation.id,
      suppressionReason: null,
    });
  }

  const mergeGroups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const phase = candidate.interpretation.phase;
    const side = candidate.interpretation.side ?? "none";
    const key = `${candidate.draft.mergeKey}:${phase}:${side}`;
    const group = mergeGroups.get(key) ?? [];
    group.push(candidate);
    mergeGroups.set(key, group);
  }
  const merged: Candidate[] = [];
  for (const group of mergeGroups.values()) {
    const [winner, ...duplicates] = [...group].sort(
      (a, b) => candidateScore(b) - candidateScore(a) || a.rule.ruleId.localeCompare(b.rule.ruleId),
    );
    if (!winner) continue;
    merged.push(winner);
    for (const duplicate of duplicates) {
      const entry = trace.find((item) => item.ruleId === duplicate.rule.ruleId);
      if (entry) {
        entry.mergeBehavior = `Merged into ${winner.rule.ruleId}.`;
        entry.suppressionReason = "Overlapping interpretation family.";
        entry.finalOutputId = null;
      }
    }
  }

  const conflictGroups = new Map<string, Candidate[]>();
  for (const candidate of merged) {
    const key = candidate.rule.conflictGroup ?? `none:${candidate.rule.ruleId}`;
    const group = conflictGroups.get(key) ?? [];
    group.push(candidate);
    conflictGroups.set(key, group);
  }
  const final: Candidate[] = [];
  for (const group of conflictGroups.values()) {
    const [winner, ...conflicts] = [...group].sort(
      (a, b) => candidateScore(b) - candidateScore(a) || a.rule.ruleId.localeCompare(b.rule.ruleId),
    );
    if (!winner) continue;
    final.push(winner);
    for (const conflict of conflicts) {
      const entry = trace.find((item) => item.ruleId === conflict.rule.ruleId);
      if (entry) {
        entry.conflictResolution = `Suppressed by ${winner.rule.ruleId}.`;
        entry.suppressionReason = "Stronger conflicting interpretation retained.";
        entry.finalOutputId = null;
      }
    }
  }

  const interpretations = final
    .map((item) => item.interpretation)
    .filter((item) => !["unavailable", "contradicted"].includes(item.status))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const contradictedInterpretations = final
    .map((item) => item.interpretation)
    .filter((item) => item.status === "contradicted");
  const availableConfidence = interpretations.map((item) => item.confidence);
  const confidenceRank = ["Unavailable", "Low", "Moderate", "High"] as const;
  const overallInterpretationConfidence =
    availableConfidence.length > 0
      ? [...availableConfidence].sort(
          (a, b) => confidenceRank.indexOf(a) - confidenceRank.indexOf(b),
        )[0]
      : "Unavailable";
  const warnings = [
    ...(input.observations.length === 0 ? ["No observations were supplied."] : []),
    ...(eligible.length === 0 && input.observations.length > 0
      ? ["No trusted available observations could be interpreted."]
      : []),
    ...(interpretations.length === 0 && contradictedInterpretations.length === 0
      ? ["No safe interpretation could be generated from the currently trusted observations."]
      : []),
  ];
  return interpretationResultSchema.parse({
    analysisId: input.context.analysisId,
    engineVersion: INTERPRETATION_ENGINE_VERSION,
    generatedAt: input.context.generatedAt,
    interpretations,
    unavailableInterpretations: [],
    contradictedInterpretations,
    warnings,
    overallInterpretationConfidence,
    sourceObservationEngineVersion: "ava-observations-v1",
    ruleVersions: Object.fromEntries(rules.map((rule) => [rule.ruleId, rule.version])),
    inputHash,
    trace,
  });
}
