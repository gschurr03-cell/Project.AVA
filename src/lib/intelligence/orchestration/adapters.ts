import { randomUUID } from "node:crypto";
import { z, type ZodType } from "zod";
import { adaptiveCoachingInputSchema, coachingStateSchema, evaluateAdaptiveCoaching } from "@/lib/adaptiveCoaching";
import { digitalTwinInputSchema, athleteDigitalTwinSchema, buildAthleteDigitalTwin } from "@/lib/digitalTwin";
import { generateInterpretations, interpretationInputSchema, interpretationResultSchema } from "@/lib/intelligence/interpretations";
import { generatePriorities, priorityInputSchema, priorityResultSchema } from "@/lib/intelligence/priorityEngine";
import { generateRecommendations, recommendationInputSchema, recommendationResultSchema } from "@/lib/intelligence/recommendationEngine";
import { coachReportInputSchema, coachReportSchema, composeCoachReport } from "@/lib/intelligence/reports";
import { completedAnalysisObservationInputSchema, generateObservationResult } from "@/lib/observations";
import { evaluatePerformanceOptimization, performanceOptimizationInputSchema, performanceOptimizationStateSchema } from "@/lib/performanceOptimization";
import { buildPerformanceProjection, projectionInputSchema, projectionOutputSchema } from "@/lib/projectionEngine";
import { evaluateRootCauseIntelligence, rootCauseInputSchema, rootCauseStateSchema } from "@/lib/rootCause";
import { generateDraftTrainingPlan, trainingPlanSnapshotSchema, trainingProgramInputSchema } from "@/lib/trainingProgram";
import { adapterContextSchema, adapterInputSchema, evaluateRootCauseRecommendationAdapter } from "@/lib/rootCauseRecommendation";
import { stableFingerprint } from "../shared/fingerprint";
import type { EngineRegistryEntry } from "../shared/contracts";
import type {
  EngineExecutionAdapter, ExecutionContext, PersistedSnapshot, PreparedExecution,
} from "./contracts";
import { ClassifiedOrchestrationError, type AdapterCatalog } from "./runtime";

export const PRODUCTION_ADAPTER_VERSION = "ava-orchestration-adapter-v1";
type EngineBinding = {
  input: ZodType;
  output: ZodType;
  execute: (input: never) => unknown;
};
const observationOutput = z.object({ observations: z.array(z.unknown()), trace: z.array(z.unknown()) });
const BINDINGS: Record<string, EngineBinding> = {
  observation: { input: completedAnalysisObservationInputSchema, output: observationOutput, execute: generateObservationResult },
  interpretation: { input: interpretationInputSchema, output: interpretationResultSchema, execute: generateInterpretations },
  root_cause: { input: rootCauseInputSchema, output: rootCauseStateSchema, execute: evaluateRootCauseIntelligence },
  root_cause_recommendation_adapter: { input: adapterInputSchema, output: adapterContextSchema, execute: evaluateRootCauseRecommendationAdapter },
  recommendation: { input: recommendationInputSchema, output: recommendationResultSchema, execute: generateRecommendations },
  priority: { input: priorityInputSchema, output: priorityResultSchema, execute: generatePriorities },
  performance_optimization: { input: performanceOptimizationInputSchema, output: performanceOptimizationStateSchema, execute: evaluatePerformanceOptimization },
  adaptive_coaching: { input: adaptiveCoachingInputSchema, output: coachingStateSchema, execute: evaluateAdaptiveCoaching },
  coach_report: { input: coachReportInputSchema, output: coachReportSchema, execute: composeCoachReport },
  projection: { input: projectionInputSchema, output: projectionOutputSchema, execute: buildPerformanceProjection },
  digital_twin: { input: digitalTwinInputSchema, output: athleteDigitalTwinSchema, execute: buildAthleteDigitalTwin },
  training_program: { input: trainingProgramInputSchema, output: trainingPlanSnapshotSchema, execute: generateDraftTrainingPlan },
};

export class RegisteredEngineAdapter implements EngineExecutionAdapter {
  readonly metadata;
  constructor(readonly entry: EngineRegistryEntry, private readonly binding: EngineBinding | null) {
    this.metadata = Object.freeze({
      adapterVersion: PRODUCTION_ADAPTER_VERSION,
      inputContractVersion: entry.contract.inputContract,
      outputContractVersion: entry.contract.outputContract,
      requiredDependencySnapshotTypes: Object.freeze([...entry.dependencies]),
      cachePolicy: entry.cachePolicy.strategy,
      timeoutMs: 30_000,
      retryEligible: false,
      deterministicFingerprintFields: Object.freeze(["engineId", "engineVersion", "input", "versions"]),
      availability: binding ? "executable" as const : "deferred" as const,
      unavailableReason: binding ? null :
        entry.engineId === "research" ? "A reviewed ResearchCatalog loader is not registered."
          : entry.engineId === "benchmark" ? "An activated metric-specific BenchmarkDataset loader is not registered."
            : "No production execution binding is registered.",
    });
  }
  get engineId() { return this.entry.engineId; }
  get engineVersion() { return this.entry.engineVersion; }
  async prepare(context: ExecutionContext): Promise<PreparedExecution> {
    this.assertAvailable();
    const inputs = context.analysis.engineInputs;
    const input = inputs && typeof inputs === "object" ? (inputs as Record<string, unknown>)[this.engineId] : undefined;
    if (input === undefined) throw classified("missing_dependency", "engine_input_missing", `Missing input for ${this.engineId}`);
    const parsed = this.binding!.input.safeParse(input);
    if (!parsed.success) throw classified("validation", "engine_input_invalid", `Invalid ${this.engineId} input`);
    const inputFingerprint = stableFingerprint({
      engineId: this.engineId, engineVersion: this.engineVersion, input: parsed.data,
      versions: context.versions,
    });
    const cachedSnapshot = context.cacheState[this.engineId] ?? undefined;
    if (cachedSnapshot && (cachedSnapshot.engineId !== this.engineId ||
      cachedSnapshot.engineVersion !== this.engineVersion ||
      cachedSnapshot.adapterVersion !== PRODUCTION_ADAPTER_VERSION))
      throw classified("unsupported_version", "cached_snapshot_version_mismatch", `Cached ${this.engineId} snapshot is incompatible`);
    return { input: parsed.data, inputFingerprint, cachedSnapshot };
  }
  async validate(prepared: PreparedExecution) {
    this.assertAvailable();
    if (!this.binding!.input.safeParse(prepared.input).success)
      throw classified("validation", "prepared_input_invalid", `Prepared ${this.engineId} input is invalid`);
  }
  async execute(prepared: PreparedExecution) {
    this.assertAvailable();
    return this.binding!.execute(prepared.input as never);
  }
  async validateOutput(output: unknown) {
    this.assertAvailable();
    if (!this.binding!.output.safeParse(output).success)
      throw classified("contract", "engine_output_invalid", `Invalid ${this.engineId} output`);
  }
  async persist(output: unknown): Promise<PersistedSnapshot> {
    this.assertAvailable();
    const parsed = this.binding!.output.parse(output);
    return {
      snapshotId: randomUUID(), engineId: this.engineId, engineVersion: this.engineVersion,
      adapterVersion: PRODUCTION_ADAPTER_VERSION, outputFingerprint: stableFingerprint(parsed), output: parsed,
    };
  }
  async activate() { /* Deliberately staging-only; pipeline transaction owns publication. */ }
  async complete() { /* Domain behavior has already completed; trace is orchestrator-owned. */ }
  private assertAvailable() {
    if (!this.binding) throw classified("missing_dependency", "adapter_deferred", this.metadata.unavailableReason!);
  }
}

export class RegisteredAdapterCatalog implements AdapterCatalog {
  private readonly adapters: Map<string, RegisteredEngineAdapter>;
  constructor(registry: readonly EngineRegistryEntry[]) {
    this.adapters = new Map(registry.map((entry) => [entry.engineId, new RegisteredEngineAdapter(entry, BINDINGS[entry.engineId] ?? null)]));
  }
  get(engineId: string, engineVersion: string) {
    const adapter = this.adapters.get(engineId);
    return adapter?.engineVersion === engineVersion ? adapter : null;
  }
  all() { return [...this.adapters.values()]; }
  executableEngineIds() { return this.all().filter((adapter) => adapter.metadata.availability === "executable").map((adapter) => adapter.engineId); }
}
function classified(kind: "validation" | "missing_dependency" | "contract" | "unsupported_version", code: string, message: string) {
  return new ClassifiedOrchestrationError({ kind, code, message, retryable: false });
}
