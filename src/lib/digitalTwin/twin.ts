import {
  DIGITAL_TWIN_ENGINE_VERSION, DIGITAL_TWIN_SCHEMA_VERSION,
  athleteDigitalTwinSchema, digitalTwinInputSchema,
  type AthleteDigitalTwin, type DigitalTwinInput, type TwinTimelineEvent,
} from "./contracts";
import { buildMechanicalBaselines } from "./baselines";
import { buildTwinTrends } from "./trends";
import { buildRecommendationMemory } from "./memory";
import { buildMovementArchetypes } from "./archetypes";
import { accumulateTimeline } from "./timeline";
import { calculateTwinConfidence } from "./confidence";
import { buildMemoryTrends } from "./memoryTrends";

const select = (events: TwinTimelineEvent[], kind: TwinTimelineEvent["payload"]["kind"]) =>
  events.filter((event) => event.payload.kind === kind);

export function buildAthleteDigitalTwin(rawInput: DigitalTwinInput): AthleteDigitalTwin {
  const input = digitalTwinInputSchema.parse(rawInput);
  const accumulated = accumulateTimeline(input.timeline);
  const timeline = accumulated.timeline;
  const baselines = buildMechanicalBaselines(timeline);
  const trends = [...buildTwinTrends(timeline), ...buildMemoryTrends(timeline)];
  const previousArchetypes = input.previousSnapshot?.twin.movementArchetype ?? [];
  const archetypes = buildMovementArchetypes(input.archetypeSignals, input.snapshotId, input.generatedAt, previousArchetypes);
  const priorityEvents = select(timeline, "priority");
  const priorityGroups = new Map<string, TwinTimelineEvent[]>();
  priorityEvents.forEach((event) => {
    if (event.payload.kind !== "priority") return;
    priorityGroups.set(event.payload.category, [...(priorityGroups.get(event.payload.category) ?? []), event]);
  });
  const trendRisks = trends.flatMap((trend) =>
    trend.classification === "regressing" || trend.classification === "highly_variable"
      ? [{
          type: trend.classification === "regressing" ? "regression" as const : "measurement_instability" as const,
          summary: `${trend.metric} is classified as ${trend.classification.replace("_", " ")} in compatible history.`,
          confidence: trend.confidence, sourceEventIds: trend.sourceEventIds, nonClinical: true as const,
        }] : []);
  const recurringPriorityRisks = [...priorityGroups.entries()].flatMap(([category, events]) =>
    events.length >= 3 ? [{
      type: "recurring_priority" as const,
      summary: `${category} recurred as a priority across ${events.length} stored events.`,
      confidence: Math.min(...events.map((event) => event.confidence)),
      sourceEventIds: events.map((event) => event.eventId), nonClinical: true as const,
    }] : []);
  const healthEvents = select(timeline, "reported_health_context");
  const trainingInterruptions = select(timeline, "training").filter((event) =>
    event.payload.kind === "training" && event.payload.eventType.includes("interruption"));
  const latestAnalysis = [...select(timeline, "analysis")].at(-1);
  const latestSessionQuality = latestAnalysis?.payload.kind === "analysis" && latestAnalysis.payload.metrics.length
    ? latestAnalysis.payload.metrics.reduce((sum, metric) => sum + metric.confidence, 0) / latestAnalysis.payload.metrics.length
    : null;
  return athleteDigitalTwinSchema.parse({
    twinId: input.twinId, athleteId: input.athleteId,
    createdAt: input.previousSnapshot?.twin.createdAt ?? input.generatedAt,
    updatedAt: input.generatedAt, engineVersion: DIGITAL_TWIN_ENGINE_VERSION,
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    confidenceScore: calculateTwinConfidence(timeline, input.generatedAt),
    identity: input.identity, competitionProfile: input.competitionProfile,
    performanceHistory: select(timeline, "performance_result"),
    mechanicalFingerprint: input.mechanicalFingerprint,
    adaptationHistory: select(timeline, "validated_change"),
    trainingHistory: select(timeline, "training"), seasonHistory: select(timeline, "season"),
    injuryHistory: healthEvents,
    recommendationHistory: buildRecommendationMemory(timeline),
    priorityHistory: priorityEvents, benchmarkHistory: select(timeline, "benchmark"),
    projectionHistory: select(timeline, "projection"), reportHistory: select(timeline, "report"),
    trendHistory: trends, mechanicalBaselines: baselines, movementArchetype: archetypes,
    riskFlags: [
      ...trendRisks, ...recurringPriorityRisks,
      ...trainingInterruptions.map((event) => ({
        type: "training_interruption" as const, summary: "A reported training interruption is present.",
        confidence: event.confidence, sourceEventIds: [event.eventId], nonClinical: true as const,
      })),
      ...healthEvents.map((event) => ({
        type: "reported_health_context" as const,
        summary: "Reported health context is present; this is not an injury prediction.",
        confidence: event.confidence, sourceEventIds: [event.eventId], nonClinical: true as const,
      })),
      ...(input.unknownVariables.length ? [{
        type: "data_gap" as const, summary: `${input.unknownVariables.length} athlete context variable(s) remain unknown.`,
        confidence: 1, sourceEventIds: [], nonClinical: true as const,
      }] : []),
    ],
    coachMemory: select(timeline, "coach_interaction"),
    unknownVariables: input.unknownVariables,
    dataQuality: {
      compatibleAnalysisCount: select(timeline, "analysis").filter((event) =>
        event.payload.kind === "analysis" && (event.payload.status === "validated" || event.payload.status === "limited") && event.compatibilityKey).length,
      excludedEventCount: select(timeline, "analysis").filter((event) =>
        event.payload.kind === "analysis" && (event.payload.status === "experimental" || event.payload.status === "invalid")).length,
      latestSessionQuality: latestSessionQuality == null ? null : Number(latestSessionQuality.toFixed(3)),
      warnings: [
        ...(accumulated.duplicateCount ? [`${accumulated.duplicateCount} exact duplicate event(s) were ignored.`] : []),
        "Archetypes are experimental descriptive labels, not biological classifications.",
      ],
    },
    timeline,
  });
}
