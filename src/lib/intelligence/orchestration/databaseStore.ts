import type {
  ExecutionContext, ExecutionPlan, ExecutionTrace, OrchestrationFailure,
  PersistedSnapshot, ScheduledJob,
} from "./contracts";
import type { OrchestrationStore } from "./runtime";
import type { ShadowComparisonReport, ShadowExecutionStore, ShadowManifest } from "./shadow";

export interface OrchestrationDatabaseClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}
export class SupabaseShadowExecutionStore implements ShadowExecutionStore {
  constructor(private readonly database: OrchestrationDatabaseClient) {}
  async createShadowManifest(plan: ExecutionPlan, snapshots: Record<string, PersistedSnapshot>): Promise<ShadowManifest> {
    // Snapshots must already be staged by the job lifecycle; the RPC validates that set.
    if (Object.keys(snapshots).length !== plan.snapshotTargets.length) throw new Error("Shadow snapshot set is incomplete");
    const manifestId = await this.rpc<string>("create_shadow_intelligence_manifest",
      { p_execution_plan_id: plan.executionPlanId, p_replay_run_id: null });
    return { manifestId, executionPlanId: plan.executionPlanId, status: "shadow",
      authoritative: false, snapshots, createdAt: new Date().toISOString() };
  }
  async persistComparison(report: ShadowComparisonReport) {
    await this.rpc("persist_shadow_intelligence_comparison", {
      p_execution_plan_id: report.executionPlanId, p_shadow_manifest_id: report.shadowManifestId,
      p_report: bounded(report, 320_000),
    });
  }
  private async rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.database.rpc(name, args);
    if (error) throw new Error(`Shadow orchestration RPC ${name} failed: ${error.message}`);
    return data as T;
  }
}
export type ExecutionContextLoader = (plan: ExecutionPlan) => Promise<ExecutionContext>;
const MAX_TRACE_BYTES = 32_768;

/** Trusted-server store. All mutations go through service-role-only transition RPCs. */
export class SupabaseOrchestrationStore implements OrchestrationStore {
  constructor(
    private readonly database: OrchestrationDatabaseClient,
    private readonly contextLoader: ExecutionContextLoader,
    private readonly actorId: string,
    private readonly shadowExecution = true,
  ) {}
  async loadPlan(planId: string) {
    return this.rpc<ExecutionPlan>("get_intelligence_execution_plan_internal", { p_plan_id: planId });
  }
  async loadJob(planId: string, jobId: string) {
    return this.rpc<ScheduledJob>("get_intelligence_execution_job_internal", { p_plan_id: planId, p_job_id: jobId });
  }
  async loadContext(plan: ExecutionPlan) { return this.contextLoader(plan); }
  async updateJob(planId: string, jobId: string, patch: Partial<ScheduledJob>) {
    await this.rpc("transition_intelligence_execution_job", {
      p_plan_id: planId, p_job_id: jobId, p_patch: bounded(patch), p_actor_id: this.actorId,
    });
  }
  async recordTrace(planId: string, jobId: string, trace: ExecutionTrace) {
    await this.rpc("append_intelligence_execution_trace", {
      p_plan_id: planId, p_job_id: jobId, p_trace: bounded(trace, MAX_TRACE_BYTES),
    });
  }
  async recordRetry(planId: string, jobId: string, failure: OrchestrationFailure, delayMs: number) {
    await this.rpc("schedule_intelligence_execution_retry", {
      p_plan_id: planId, p_job_id: jobId, p_failure: bounded(failure), p_delay_ms: delayMs,
    });
  }
  async stageSnapshot(planId: string, snapshot: PersistedSnapshot) {
    await this.rpc("stage_intelligence_snapshot", {
      p_plan_id: planId, p_snapshot: bounded(snapshot, 512_000), p_actor_id: this.actorId,
    });
  }
  async activateIfComplete(planId: string) {
    if (this.shadowExecution) return;
    await this.rpc("activate_staged_intelligence_pipeline", { p_execution_plan_id: planId, p_actor_id: this.actorId });
  }
  async rollback(planId: string, failure: OrchestrationFailure) {
    // A run that never activated has nothing to roll back; this RPC marks it terminal
    // without disturbing the currently authoritative manifest.
    await this.rpc("fail_intelligence_execution_plan", {
      p_plan_id: planId, p_failure: bounded(failure), p_actor_id: this.actorId,
    });
  }
  private async rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.database.rpc(name, args);
    if (error) throw new Error(`Orchestration database RPC ${name} failed: ${error.message}`);
    return data as T;
  }
}
function bounded(value: unknown, maxBytes = 64_000): unknown {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("Orchestration payload exceeds persistence limit");
  return JSON.parse(text) as unknown;
}
