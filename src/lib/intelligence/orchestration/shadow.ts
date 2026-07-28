import type { ExecutionPlan, PersistedSnapshot } from "./contracts";
import type { AuthoritativeBaseline, BaselineResolutionMode } from "./baseline";
import { AuthoritativeBaselineResolver } from "./baseline";
import { compareEngineOutputs, defaultEquivalencePolicy, type EquivalencePolicy, type EquivalenceResult } from "./equivalence";
export const SHADOW_COMPARISON_VERSION = "orchestration-shadow-comparison-v1";
export interface ShadowManifest {
  manifestId: string; executionPlanId: string; status: "shadow"; authoritative: false;
  snapshots: Record<string, PersistedSnapshot>; createdAt: string;
}
export interface ShadowComparisonReport {
  reportVersion: string; runId: string; executionPlanId: string; executionPlanFingerprint: string;
  shadowManifestId: string; baselineMode: BaselineResolutionMode;
  baselineSources: Record<string, Omit<AuthoritativeBaseline,"payload"> | null>;
  results: EquivalenceResult[]; comparedEngines: string[]; missingEngines: string[];
  exactMatches: string[]; acceptableDifferences: string[]; materialMismatches: string[];
  contractMismatches: string[]; cacheOutcomes: Record<string, boolean>;
  engineVersions: Record<string, string>; adapterVersions: Record<string, string>;
  startedAt: string; completedAt: string; readiness: "ready" | "blocked";
  blockerReasons: string[]; traceReferences: string[];
}
export interface ShadowExecutionStore {
  createShadowManifest(plan: ExecutionPlan, snapshots: Record<string, PersistedSnapshot>): Promise<ShadowManifest>;
  persistComparison(report: ShadowComparisonReport): Promise<void>;
}
export interface ShadowPipelineExecutor {
  execute(plan: ExecutionPlan, options: { cacheEnabled: boolean; authoritative: false }): Promise<{
    snapshots: Record<string, PersistedSnapshot>; cacheOutcomes: Record<string, boolean>; traceReferences: string[];
  }>;
}
export class ShadowExecutionCoordinator {
  constructor(
    private readonly executor: ShadowPipelineExecutor,
    private readonly store: ShadowExecutionStore,
    private readonly baselines: AuthoritativeBaselineResolver,
    private readonly policyFor: (engineId: string, contractVersion: string) => EquivalencePolicy = defaultEquivalencePolicy,
  ) {}
  async run(input: { runId: string; plan: ExecutionPlan; baselineMode: BaselineResolutionMode; cacheEnabled: boolean; startedAt?: string }) {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const execution = await this.executor.execute(input.plan, { cacheEnabled: input.cacheEnabled, authoritative: false });
    const manifest = await this.store.createShadowManifest(input.plan, execution.snapshots);
    if (manifest.authoritative !== false || manifest.status !== "shadow") throw new Error("Shadow manifest authority violation");
    const baselineSources: Record<string, Omit<AuthoritativeBaseline,"payload"> | null> = {};
    const results: EquivalenceResult[] = [];
    for (const engineId of input.plan.snapshotTargets) {
      const baseline = await this.baselines.resolve(engineId, input.baselineMode);
      baselineSources[engineId] = baseline ? withoutPayload(baseline) : null;
      const shadow = execution.snapshots[engineId];
      const contract = baseline?.contractVersion ?? `registry:${engineId}`;
      results.push(compareEngineOutputs({ policy: this.policyFor(engineId, contract),
        baseline: baseline?.payload, shadow: shadow?.output,
        baselineContractVersion: contract, shadowContractVersion: contract }));
    }
    const material = results.filter((item) => ["user_visible_material","contract_incompatibility","comparison_impossible"].includes(item.severity));
    const report: ShadowComparisonReport = {
      reportVersion: SHADOW_COMPARISON_VERSION, runId: input.runId,
      executionPlanId: input.plan.executionPlanId,
      executionPlanFingerprint: input.plan.inputFingerprint, shadowManifestId: manifest.manifestId,
      baselineMode: input.baselineMode, baselineSources, results,
      comparedEngines: results.filter((item) => item.severity !== "comparison_impossible").map((item) => item.engineId),
      missingEngines: results.filter((item) => item.severity === "comparison_impossible").map((item) => item.engineId),
      exactMatches: results.filter((item) => item.severity === "identical").map((item) => item.engineId),
      acceptableDifferences: results.filter((item) => ["operational_only","acceptable_normalization","non_user_visible"].includes(item.severity)).map((item) => item.engineId),
      materialMismatches: results.filter((item) => item.severity === "user_visible_material").map((item) => item.engineId),
      contractMismatches: results.filter((item) => item.severity === "contract_incompatibility").map((item) => item.engineId),
      cacheOutcomes: execution.cacheOutcomes, engineVersions: input.plan.engineVersions,
      adapterVersions: Object.fromEntries(Object.entries(execution.snapshots).map(([id, snapshot]) => [id, snapshot.adapterVersion])),
      startedAt, completedAt: new Date().toISOString(),
      readiness: material.length ? "blocked" : "ready",
      blockerReasons: material.map((item) => `${item.engineId}:${item.severity}`),
      traceReferences: execution.traceReferences,
    };
    await this.store.persistComparison(report);
    return { manifest, report };
  }
}
function withoutPayload(baseline: AuthoritativeBaseline): Omit<AuthoritativeBaseline,"payload"> {
  return {
    resolutionMode:baseline.resolutionMode,snapshotId:baseline.snapshotId,
    snapshotType:baseline.snapshotType,engineId:baseline.engineId,engineVersion:baseline.engineVersion,
    contractVersion:baseline.contractVersion,deterministicFingerprint:baseline.deterministicFingerprint,
    createdAt:baseline.createdAt,activatedAt:baseline.activatedAt,sourceManifestId:baseline.sourceManifestId,
  };
}
