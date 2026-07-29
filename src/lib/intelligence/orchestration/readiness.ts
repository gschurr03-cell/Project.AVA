export type ReadinessGateStatus = "pass" | "fail" | "missing" | "stale";
export interface CutoverEvidence {
  successfulShadowRuns: number; distinctSubjects: number; adapterCoverageRate: number;
  unresolvedContractIncompatibilities: number; materialMismatchRate: number;
  terminalFailureRate: number; activationFailureRate: number;
  recoveryTestPassed: boolean; rollbackTestPassed: boolean; ownerIsolationTestPassed: boolean;
  migrationValidated: boolean; telemetryAvailable: boolean; dashboardVisible: boolean;
  documentationComplete: boolean; manualApproval: boolean; evaluatedAt: string;
}
export interface CutoverThresholds {
  minimumShadowRuns: number; minimumDistinctSubjects: number; requiredAdapterCoverageRate: number;
  maximumMaterialMismatchRate: number; maximumTerminalFailureRate: number;
  maximumActivationFailureRate: number; maximumEvidenceAgeHours: number;
}
export const DEFAULT_CUTOVER_THRESHOLDS: CutoverThresholds = {
  minimumShadowRuns: 50, minimumDistinctSubjects: 10, requiredAdapterCoverageRate: 1,
  maximumMaterialMismatchRate: 0, maximumTerminalFailureRate: .02,
  maximumActivationFailureRate: 0, maximumEvidenceAgeHours: 24,
};
export interface CutoverGateResult {
  gate: string; status: ReadinessGateStatus; measuredValue: string | number | boolean;
  requiredThreshold: string | number | boolean; evidenceSource: string; blockerReason: string | null;
  lastEvaluatedAt: string;
}
export function evaluateCutoverReadiness(evidence: CutoverEvidence, thresholds = DEFAULT_CUTOVER_THRESHOLDS,
  now = new Date()): { ready: boolean; gates: CutoverGateResult[] } {
  const stale = now.getTime() - new Date(evidence.evaluatedAt).getTime() > thresholds.maximumEvidenceAgeHours * 3_600_000;
  const checks: Array<[string, string | number | boolean, string | number | boolean, boolean, string]> = [
    ["shadow_runs",evidence.successfulShadowRuns,thresholds.minimumShadowRuns,evidence.successfulShadowRuns>=thresholds.minimumShadowRuns,"shadow_comparison_reports"],
    ["distinct_subjects",evidence.distinctSubjects,thresholds.minimumDistinctSubjects,evidence.distinctSubjects>=thresholds.minimumDistinctSubjects,"shadow_run_scopes"],
    ["adapter_coverage",evidence.adapterCoverageRate,thresholds.requiredAdapterCoverageRate,evidence.adapterCoverageRate>=thresholds.requiredAdapterCoverageRate,"engine_registry"],
    ["contract_incompatibilities",evidence.unresolvedContractIncompatibilities,0,evidence.unresolvedContractIncompatibilities===0,"comparison_reports"],
    ["material_mismatch_rate",evidence.materialMismatchRate,thresholds.maximumMaterialMismatchRate,evidence.materialMismatchRate<=thresholds.maximumMaterialMismatchRate,"comparison_reports"],
    ["terminal_failure_rate",evidence.terminalFailureRate,thresholds.maximumTerminalFailureRate,evidence.terminalFailureRate<=thresholds.maximumTerminalFailureRate,"execution_jobs"],
    ["activation_failure_rate",evidence.activationFailureRate,thresholds.maximumActivationFailureRate,evidence.activationFailureRate<=thresholds.maximumActivationFailureRate,"audit_events"],
    ["recovery_test",evidence.recoveryTestPassed,true,evidence.recoveryTestPassed,"test_evidence"],
    ["rollback_test",evidence.rollbackTestPassed,true,evidence.rollbackTestPassed,"test_evidence"],
    ["owner_isolation_test",evidence.ownerIsolationTestPassed,true,evidence.ownerIsolationTestPassed,"test_evidence"],
    ["migration_validation",evidence.migrationValidated,true,evidence.migrationValidated,"migration_history"],
    ["telemetry",evidence.telemetryAvailable,true,evidence.telemetryAvailable,"telemetry_sink"],
    ["dashboard",evidence.dashboardVisible,true,evidence.dashboardVisible,"dashboard"],
    ["documentation",evidence.documentationComplete,true,evidence.documentationComplete,"documentation_catalog"],
    ["manual_approval",evidence.manualApproval,true,evidence.manualApproval,"manual_governance"],
  ];
  const gates = checks.map<CutoverGateResult>(([gate, measuredValue, requiredThreshold, passed, source]) => ({
    gate, status: stale ? "stale" : passed ? "pass" : "fail", measuredValue, requiredThreshold,
    evidenceSource: source, blockerReason: stale ? "evidence_stale" : passed ? null : `${gate}_not_satisfied`,
    lastEvaluatedAt: evidence.evaluatedAt,
  }));
  return { ready: gates.every((gate) => gate.status === "pass"), gates };
}

