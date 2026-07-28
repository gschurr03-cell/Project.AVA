export interface RecoveryStore {
  recoverEligibleRuns(limit: number, cursor: string | null): Promise<{ recoveredJobIds: string[]; nextCursor: string | null }>;
}
export class OrchestrationRecoveryCoordinator {
  constructor(private readonly store: RecoveryStore, private readonly pageSize = 50) {
    if (pageSize < 1 || pageSize > 200) throw new Error("Recovery page size must be between 1 and 200");
  }
  async recoverPage(cursor: string | null = null) {
    return this.store.recoverEligibleRuns(this.pageSize, cursor);
  }
}

