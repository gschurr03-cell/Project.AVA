export type OrchestrationHealthState = "healthy" | "degraded" | "unhealthy" | "execution_disabled" | "validation_incomplete";
export interface OrchestrationHealthMetrics {
  executionEnabled: boolean; validationComplete: boolean; successfulPipelineRate: number;
  materialShadowMismatchRate: number; contractMismatchRate: number; cacheValidityRate: number;
  retryRate: number; terminalFailureRate: number; expiredLeaseRate: number;
  recoverySuccessRate: number; activationFailureRate: number; rollbackRate: number;
  averageDurationMs: number; p95DurationMs: number; queueBacklog: number; deadLetterCount: number;
  adapterCoverageRate: number; storeHealthy: boolean; migrationCompatible: boolean;
}
export interface OrchestrationHealthThresholds {
  minimumSuccessRate: number; maximumMaterialMismatchRate: number; maximumTerminalFailureRate: number;
  maximumActivationFailureRate: number; maximumP95DurationMs: number; maximumQueueBacklog: number;
  minimumAdapterCoverageRate: number;
}
export const DEFAULT_HEALTH_THRESHOLDS: OrchestrationHealthThresholds = {
  minimumSuccessRate: .98, maximumMaterialMismatchRate: .01, maximumTerminalFailureRate: .02,
  maximumActivationFailureRate: .005, maximumP95DurationMs: 120_000, maximumQueueBacklog: 100,
  minimumAdapterCoverageRate: 1,
};
export function evaluateOrchestrationHealth(metrics: OrchestrationHealthMetrics,
  thresholds = DEFAULT_HEALTH_THRESHOLDS): { state: OrchestrationHealthState; reasons: string[]; metrics: OrchestrationHealthMetrics } {
  if (!metrics.executionEnabled) return { state: "execution_disabled", reasons: ["execution_flag_off"], metrics };
  if (!metrics.validationComplete) return { state: "validation_incomplete", reasons: ["required_validation_incomplete"], metrics };
  const reasons: string[] = [];
  if (!metrics.storeHealthy) reasons.push("store_unhealthy");
  if (!metrics.migrationCompatible) reasons.push("migration_incompatible");
  if (metrics.adapterCoverageRate < thresholds.minimumAdapterCoverageRate) reasons.push("adapter_coverage_below_threshold");
  if (metrics.successfulPipelineRate < thresholds.minimumSuccessRate) reasons.push("pipeline_success_below_threshold");
  if (metrics.materialShadowMismatchRate > thresholds.maximumMaterialMismatchRate) reasons.push("material_mismatch_above_threshold");
  if (metrics.terminalFailureRate > thresholds.maximumTerminalFailureRate) reasons.push("terminal_failures_above_threshold");
  if (metrics.activationFailureRate > thresholds.maximumActivationFailureRate) reasons.push("activation_failures_above_threshold");
  if (metrics.p95DurationMs > thresholds.maximumP95DurationMs) reasons.push("p95_duration_above_threshold");
  if (metrics.queueBacklog > thresholds.maximumQueueBacklog) reasons.push("queue_backlog_above_threshold");
  const critical = reasons.some((reason) => ["store_unhealthy","migration_incompatible","material_mismatch_above_threshold"].includes(reason));
  return { state: reasons.length ? critical ? "unhealthy" : "degraded" : "healthy", reasons, metrics };
}

