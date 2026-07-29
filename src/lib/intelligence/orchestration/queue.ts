export interface QueueMessage { jobId: string; executionPlanId: string; availableAt: number; }
export interface QueueProvider {
  enqueue(message: QueueMessage): Promise<void>;
  claim(workerId: string, leaseMs: number): Promise<QueueMessage | null>;
  acknowledge(jobId: string, workerId: string): Promise<void>;
  release(jobId: string, workerId: string, availableAt: number): Promise<void>;
}
type Item = QueueMessage & { claimedBy?: string; leaseUntil?: number };
/** Single-process reference provider. Durable/database providers implement the same contract. */
export class InMemoryQueueProvider implements QueueProvider {
  private readonly items = new Map<string, Item>();
  async enqueue(message: QueueMessage) { if (!this.items.has(message.jobId)) this.items.set(message.jobId, { ...message }); }
  async claim(workerId: string, leaseMs: number) {
    const now = Date.now();
    const item = [...this.items.values()].sort((a, b) => a.availableAt - b.availableAt)
      .find((value) => value.availableAt <= now && (!value.leaseUntil || value.leaseUntil <= now));
    if (!item) return null;
    item.claimedBy = workerId; item.leaseUntil = now + leaseMs;
    return { jobId: item.jobId, executionPlanId: item.executionPlanId, availableAt: item.availableAt };
  }
  async acknowledge(jobId: string, workerId: string) {
    const item = this.items.get(jobId);
    if (item?.claimedBy === workerId) this.items.delete(jobId);
  }
  async release(jobId: string, workerId: string, availableAt: number) {
    const item = this.items.get(jobId);
    if (item?.claimedBy === workerId) Object.assign(item, { availableAt, claimedBy: undefined, leaseUntil: undefined });
  }
}

