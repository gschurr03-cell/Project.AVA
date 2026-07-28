import type {
  EngineExecutionAdapter, ExecutionContext, ExecutionPlan, ExecutionTrace,
  OrchestrationFailure, PersistedSnapshot, ScheduledJob,
} from "./contracts";
import { retryDelayMs, shouldRetry } from "./policy";
import { RetryJobError, type JobExecutor } from "./worker";

export class ClassifiedOrchestrationError extends Error {
  constructor(public readonly failure: OrchestrationFailure) {
    super(failure.message);
    this.name = "ClassifiedOrchestrationError";
  }
}
export interface OrchestrationStore {
  loadPlan(planId: string): Promise<ExecutionPlan>;
  loadJob(planId: string, jobId: string): Promise<ScheduledJob>;
  loadContext(plan: ExecutionPlan): Promise<ExecutionContext>;
  updateJob(planId: string, jobId: string, patch: Partial<ScheduledJob>): Promise<void>;
  recordTrace(planId: string, jobId: string, trace: ExecutionTrace): Promise<void>;
  recordRetry(planId: string, jobId: string, failure: OrchestrationFailure, delayMs: number): Promise<void>;
  stageSnapshot(planId: string, snapshot: PersistedSnapshot): Promise<void>;
  activateIfComplete(planId: string): Promise<void>;
  rollback(planId: string, failure: OrchestrationFailure): Promise<void>;
}
export interface AdapterCatalog {
  get(engineId: string, engineVersion: string): EngineExecutionAdapter | null;
}

/** Identical lifecycle for in-process, database-queue and future distributed workers. */
export class IntelligenceJobExecutor implements JobExecutor {
  constructor(
    private readonly store: OrchestrationStore,
    private readonly adapters: AdapterCatalog,
    private readonly retryEnabled = true,
  ) {}
  async execute(jobId: string, executionPlanId: string): Promise<void> {
    const plan = await this.store.loadPlan(executionPlanId);
    const job = await this.store.loadJob(executionPlanId, jobId);
    const adapter = this.adapters.get(job.engineId, job.engineVersion);
    if (!adapter) return this.fail(plan, job, failure("unsupported_version", "adapter_not_registered",
      `No adapter for ${job.engineId}@${job.engineVersion}`));
    if (plan.engineVersions[job.engineId] !== adapter.engineVersion)
      return this.fail(plan, job, failure("unsupported_version", "plan_version_mismatch", "Stored plan version does not match adapter"));
    const context = await this.store.loadContext(plan);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    await this.store.updateJob(plan.executionPlanId, job.jobId,
      { state: "running", attemptCount: job.attemptCount + 1 });
    try {
      const prepared = await adapter.prepare(context);
      await adapter.validate(prepared, context);
      let snapshot: PersistedSnapshot;
      let cacheHit = false;
      if (prepared.cachedSnapshot) {
        cacheHit = true;
        snapshot = prepared.cachedSnapshot;
      } else {
        const output = await adapter.execute(prepared, context);
        await adapter.validateOutput(output, context);
        snapshot = await adapter.persist(output, context);
      }
      await adapter.activate(snapshot, context);
      await this.store.stageSnapshot(plan.executionPlanId, snapshot);
      await adapter.complete(snapshot, context);
      const finished = Date.now();
      await this.store.recordTrace(plan.executionPlanId, job.jobId, {
        engineId: job.engineId, engineVersion: job.engineVersion, startedAt,
        finishedAt: new Date(finished).toISOString(), durationMs: finished - started,
        inputFingerprint: prepared.inputFingerprint, outputFingerprint: snapshot.outputFingerprint,
        cacheHit, retryCount: job.attemptCount, failure: null,
      });
      await this.store.updateJob(plan.executionPlanId, job.jobId, { state: "succeeded", cacheHit });
      await this.store.activateIfComplete(plan.executionPlanId);
    } catch (error) {
      const classified = error instanceof ClassifiedOrchestrationError ? error.failure :
        failure("infrastructure", "unclassified_execution_failure",
          error instanceof Error ? error.message : "Unknown orchestration failure");
      await this.fail(plan, { ...job, attemptCount: job.attemptCount + 1 }, classified, startedAt, started);
    }
  }
  private async fail(plan: ExecutionPlan, job: ScheduledJob, reason: OrchestrationFailure,
    startedAt = new Date().toISOString(), started = Date.now()) {
    const retry = shouldRetry(reason.kind, job.attemptCount, this.retryEnabled);
    const delay = retryDelayMs(job.attemptCount);
    await this.store.recordTrace(plan.executionPlanId, job.jobId, {
      engineId: job.engineId, engineVersion: job.engineVersion, startedAt,
      finishedAt: new Date().toISOString(), durationMs: Math.max(0, Date.now() - started),
      inputFingerprint: plan.inputFingerprint, outputFingerprint: null, cacheHit: false,
      retryCount: Math.max(0, job.attemptCount - 1), failure: reason,
    });
    if (retry) {
      await this.store.recordRetry(plan.executionPlanId, job.jobId, reason, delay);
      await this.store.updateJob(plan.executionPlanId, job.jobId, { state: "retrying", attemptCount: job.attemptCount });
      throw new RetryJobError(Date.now() + delay);
    }
    await this.store.updateJob(plan.executionPlanId, job.jobId, { state: "failed", attemptCount: job.attemptCount });
    await this.store.rollback(plan.executionPlanId, reason);
  }
}
function failure(kind: OrchestrationFailure["kind"], code: string, message: string): OrchestrationFailure {
  return { kind, code, message, retryable: kind === "deterministic_transient" };
}
