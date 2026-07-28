export const FAILURE_INJECTION_POINTS = [
  "before_plan_persistence","after_plan_persistence","before_job_claim","after_job_claim",
  "during_heartbeat","before_adapter_execution","after_domain_execution","before_snapshot_staging",
  "after_snapshot_staging","before_manifest_creation","before_activation","during_activation_transaction",
  "after_activation_before_acknowledgement","during_rollback","during_recovery",
] as const;
export type FailureInjectionPoint = typeof FAILURE_INJECTION_POINTS[number];
export type InjectedFailureCategory =
  | "deterministic_transient" | "validation" | "dependency" | "contract" | "version"
  | "infrastructure" | "lease_expiration" | "cancellation" | "worker_termination";
export interface FailureInjectionConfig {
  environment: string; explicitlyEnabled: boolean; authenticatedInternalCaller: boolean;
  point: FailureInjectionPoint; category: InjectedFailureCategory;
}
export class InjectedOrchestrationFailure extends Error {
  constructor(readonly point: FailureInjectionPoint, readonly category: InjectedFailureCategory) {
    super(`Injected orchestration failure: ${point}:${category}`); this.name = "InjectedOrchestrationFailure";
  }
}
export function createFailureInjector(config: FailureInjectionConfig) {
  const permitted = ["test","development"].includes(config.environment) &&
    config.explicitlyEnabled && config.authenticatedInternalCaller &&
    FAILURE_INJECTION_POINTS.includes(config.point);
  return {
    inject(point: FailureInjectionPoint) {
      if (point !== config.point) return;
      if (!permitted) throw new Error("Failure injection is prohibited");
      throw new InjectedOrchestrationFailure(point, config.category);
    },
  };
}

