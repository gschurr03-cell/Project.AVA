import type { EngineRegistryEntry } from "../shared/contracts";

export const ORCHESTRATION_VERSION = "intelligence-orchestration-v1";
export const PIPELINE_VERSION = "intelligence-pipeline-v1";
export type EngineId = string;
export type ExecutionState =
  | "queued" | "waiting" | "ready" | "running" | "retrying"
  | "succeeded" | "failed" | "cancelled" | "rolled_back";
export type FailureKind =
  | "validation" | "missing_dependency" | "contract" | "unsupported_version"
  | "deterministic_transient" | "infrastructure" | "cancelled";

export interface DependencyGraph {
  nodes: EngineId[];
  edges: ReadonlyArray<readonly [EngineId, EngineId]>;
}
export interface ScheduledJob {
  jobId: string;
  engineId: EngineId;
  engineVersion: string;
  dependencies: EngineId[];
  state: ExecutionState;
  attemptCount: number;
  maxAttempts: number;
  cacheHit: boolean | null;
}
export interface ExecutionPlan {
  executionPlanId: string;
  analysisId: string;
  athleteId: string;
  pipelineVersion: string;
  orchestrationVersion: string;
  engineVersions: Record<EngineId, string>;
  dependencyGraph: DependencyGraph;
  executionOrder: EngineId[];
  parallelStages: EngineId[][];
  scheduledJobs: ScheduledJob[];
  snapshotTargets: EngineId[];
  createdAt: string;
  inputFingerprint: string;
}
export interface ExecutionContext {
  analysis: Readonly<Record<string, unknown>>;
  digitalTwin: Readonly<Record<string, unknown>> | null;
  featureFlags: Readonly<Record<string, boolean | string>>;
  engineRegistry: readonly EngineRegistryEntry[];
  versions: Readonly<Record<string, string>>;
  cacheState: Readonly<Record<EngineId, PersistedSnapshot | null>>;
  rolloutModes: Readonly<Record<string, string>>;
  competitionState: Readonly<Record<string, unknown>> | null;
  seasonState: Readonly<Record<string, unknown>> | null;
  requestMetadata: Readonly<Record<string, unknown>>;
  provenance: Readonly<Record<string, unknown>>;
}
export interface PreparedExecution<TInput = unknown> {
  input: TInput;
  inputFingerprint: string;
  cachedSnapshot?: PersistedSnapshot;
}
export interface PersistedSnapshot {
  snapshotId: string;
  engineId: EngineId;
  engineVersion: string;
  adapterVersion: string;
  outputFingerprint: string;
  output: unknown;
}
export interface AdapterMetadata {
  adapterVersion: string;
  inputContractVersion: string;
  outputContractVersion: string;
  requiredDependencySnapshotTypes: readonly string[];
  cachePolicy: string;
  timeoutMs: number;
  retryEligible: boolean;
  deterministicFingerprintFields: readonly string[];
  availability: "executable" | "deferred";
  unavailableReason: string | null;
}
export interface EngineExecutionAdapter<TInput = unknown, TOutput = unknown> {
  readonly engineId: EngineId;
  readonly engineVersion: string;
  readonly metadata: AdapterMetadata;
  prepare(context: ExecutionContext): Promise<PreparedExecution<TInput>>;
  validate(prepared: PreparedExecution<TInput>, context: ExecutionContext): Promise<void>;
  execute(prepared: PreparedExecution<TInput>, context: ExecutionContext): Promise<TOutput>;
  validateOutput(output: TOutput, context: ExecutionContext): Promise<void>;
  persist(output: TOutput, context: ExecutionContext): Promise<PersistedSnapshot>;
  /** Stages a snapshot reference. Only the orchestrator commits the pipeline activation. */
  activate(snapshot: PersistedSnapshot, context: ExecutionContext): Promise<void>;
  complete(snapshot: PersistedSnapshot, context: ExecutionContext): Promise<void>;
}
export interface OrchestrationFailure {
  kind: FailureKind;
  code: string;
  message: string;
  retryable: boolean;
}
export interface ExecutionTrace {
  engineId: EngineId;
  engineVersion: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  inputFingerprint: string;
  outputFingerprint: string | null;
  cacheHit: boolean;
  retryCount: number;
  failure: OrchestrationFailure | null;
}
export interface ExecutionProgress {
  overallPercent: number;
  currentEngines: EngineId[];
  remainingEngines: EngineId[];
  elapsedMs: number;
  estimatedCompletionMs: number | null;
}
export interface ActivationRequest {
  executionPlanId: string;
  athleteId: string;
  analysisId: string;
  pipelineVersion: string;
  snapshotIds: Record<EngineId, string>;
  expectedEngineVersions: Record<EngineId, string>;
}
