import type { ExecutionPlan, ExecutionProgress, FailureKind, ScheduledJob } from "./contracts";

export const ORCHESTRATION_RETRY_POLICY = Object.freeze({ maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 30_000 });
export function shouldRetry(kind: FailureKind, attempt: number, enabled = true): boolean {
  return enabled && kind === "deterministic_transient" && attempt < ORCHESTRATION_RETRY_POLICY.maxAttempts;
}
export function retryDelayMs(attempt: number): number {
  return Math.min(ORCHESTRATION_RETRY_POLICY.maxDelayMs,
    ORCHESTRATION_RETRY_POLICY.baseDelayMs * 2 ** Math.max(0, attempt - 1));
}
export function readyJobs(plan: ExecutionPlan, jobs: readonly ScheduledJob[], parallel = true): ScheduledJob[] {
  const states = new Map(jobs.map((job) => [job.engineId, job.state]));
  const ready = jobs.filter((job) =>
    (job.state === "queued" || job.state === "waiting" || job.state === "ready" || job.state === "retrying") &&
    job.dependencies.every((id) => states.get(id) === "succeeded"));
  return parallel ? ready : ready.slice(0, 1);
}
export function executionProgress(plan: ExecutionPlan, jobs: readonly ScheduledJob[], startedAtMs: number, nowMs = Date.now()): ExecutionProgress {
  const done = jobs.filter((job) => job.state === "succeeded").length;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const remaining = jobs.filter((job) => !["succeeded", "failed", "cancelled", "rolled_back"].includes(job.state));
  return {
    overallPercent: jobs.length ? Math.round(done / jobs.length * 100) : 100,
    currentEngines: jobs.filter((job) => job.state === "running").map((job) => job.engineId),
    remainingEngines: remaining.map((job) => job.engineId),
    elapsedMs,
    estimatedCompletionMs: done ? Math.round(elapsedMs / done * remaining.length) : null,
  };
}

