export type OrchestrationTelemetryEventName =
  | "pipeline_started" | "pipeline_completed" | "pipeline_failed" | "pipeline_cancelled"
  | "job_started" | "job_completed" | "job_failed" | "job_retried"
  | "cache_hit" | "cache_miss" | "lease_acquired" | "lease_expired"
  | "snapshot_staged" | "manifest_activated" | "manifest_activation_failed"
  | "rollback_completed" | "legacy_manifest_mismatch";
export interface OrchestrationTelemetryEvent {
  name: OrchestrationTelemetryEventName;
  traceId: string;
  runId: string;
  scopeId: string;
  timestamp: string;
  jobId?: string;
  engineId?: string;
  engineVersion?: string;
  adapterVersion?: string;
  durationMs?: number;
  attempt?: number;
  failureClassification?: string;
  cacheStatus?: "hit" | "miss";
}
export interface OrchestrationTelemetrySink {
  emit(event: Readonly<OrchestrationTelemetryEvent>): void | Promise<void>;
}
export class InMemoryOrchestrationTelemetrySink implements OrchestrationTelemetrySink {
  readonly events: OrchestrationTelemetryEvent[] = [];
  emit(event: Readonly<OrchestrationTelemetryEvent>) { this.events.push({ ...event }); }
}
export class ConsoleOrchestrationTelemetrySink implements OrchestrationTelemetrySink {
  emit(event: Readonly<OrchestrationTelemetryEvent>) {
    // The event contract intentionally has no raw input/output, video, notes, email or name fields.
    console.info(JSON.stringify({ subsystem: "intelligence_orchestration", ...event }));
  }
}

