import type { QueueProvider } from "./queue";

export interface JobExecutor { execute(jobId: string, executionPlanId: string): Promise<void>; }
export class RetryJobError extends Error {
  constructor(public readonly availableAt: number) { super("Orchestration retry scheduled"); }
}
export class OrchestrationWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: QueueProvider,
    private readonly executor: JobExecutor,
    private readonly leaseMs = 60_000,
  ) {}
  async runOnce(): Promise<boolean> {
    const job = await this.queue.claim(this.workerId, this.leaseMs);
    if (!job) return false;
    try {
      await this.executor.execute(job.jobId, job.executionPlanId);
      await this.queue.acknowledge(job.jobId, this.workerId);
    } catch (error) {
      await this.queue.release(job.jobId, this.workerId,
        error instanceof RetryJobError ? error.availableAt : Date.now());
      if (error instanceof RetryJobError) return true;
      throw error;
    }
    return true;
  }
}
