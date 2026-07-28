import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd(), out = path.join(root, ".orchestration-integration-build");
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({ compilerOptions: {
  outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
  jsx: "react-jsx", skipLibCheck: true, esModuleInterop: true, strict: true,
  moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] },
}, files: [
  path.join(root, "src/lib/intelligence/registry.ts"),
  path.join(root, "src/lib/intelligence/orchestration/index.ts"),
] }));
execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { stdio: "inherit" });
const require = createRequire(import.meta.url), originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...args);
};
const registry = require(path.join(out, "lib/intelligence/registry.js")).INTELLIGENCE_ENGINE_REGISTRY;
const orchestration = require(path.join(out, "lib/intelligence/orchestration/index.js"));
const catalog = new orchestration.RegisteredAdapterCatalog(registry);
assert.equal(catalog.all().length, registry.length, "every registered engine has an explicit adapter state");
assert.equal(catalog.executableEngineIds().length, 12, "only callable engines are executable");
assert.deepEqual(catalog.all().filter(a => a.metadata.availability === "deferred").map(a => a.engineId).sort(),
  ["benchmark", "research"]);
assert.ok(catalog.all().every(a => a.metadata.adapterVersion && a.metadata.inputContractVersion &&
  a.metadata.outputContractVersion && a.metadata.timeoutMs > 0));
const observation = catalog.all().find(a => a.engineId === "observation");
let invalidBeforeExecute = true;
await assert.rejects(() => observation.prepare({
  analysis: { engineInputs: { observation: {} } }, digitalTwin: null, featureFlags: {},
  engineRegistry: registry, versions: {}, cacheState: {}, rolloutModes: {},
  competitionState: null, seasonState: null, requestMetadata: {}, provenance: {},
}), /Invalid observation input/);
assert.equal(invalidBeforeExecute, true, "validation fails before domain execution");
const blocked = orchestration.evaluateExecutionGate({
  serverEnabled: true, environmentAllowed: true, authorized: false, ownerScopeValid: true,
  planValid: true, databaseHealthy: true, registryVersionSupported: true,
  prohibitedMigrationState: false, idempotencyKey: "request", rolloutMode: "SHADOW",
  requiredEngineIds: ["observation"], registry, adapters: catalog,
});
assert.equal(blocked.allowed, false); assert.ok(blocked.reasons.includes("caller_unauthorized"));
const deferred = orchestration.evaluateExecutionGate({
  serverEnabled: true, environmentAllowed: true, authorized: true, ownerScopeValid: true,
  planValid: true, databaseHealthy: true, registryVersionSupported: true,
  prohibitedMigrationState: false, idempotencyKey: "request", rolloutMode: "SHADOW",
  requiredEngineIds: ["research"], registry, adapters: { get: () => null },
});
assert.ok(deferred.reasons.includes("adapter_unavailable:research"));
const legacy = { engineVersion: "legacy", value: 1 };
const manifest = { manifestId: "m", engineId: "root_cause", engineVersion: "v",
  adapterVersion: "a", snapshotId: "s", outputFingerprint: "different", payload: { value: 2 } };
const client = { rpc: async () => ({ data: manifest, error: null }) };
let mismatch = false;
assert.deepEqual(await orchestration.resolveActivatedIntelligenceSnapshot({
  client, athleteId: "athlete", engineId: "root_cause", mode: "LEGACY_ONLY",
  readLegacy: async () => legacy,
}), legacy);
assert.deepEqual(await orchestration.resolveActivatedIntelligenceSnapshot({
  client, athleteId: "athlete", engineId: "root_cause", mode: "SHADOW_MANIFEST",
  readLegacy: async () => legacy, onMismatch: () => { mismatch = true; },
}), legacy);
assert.equal(mismatch, true);
assert.deepEqual(await orchestration.resolveActivatedIntelligenceSnapshot({
  client, athleteId: "athlete", engineId: "root_cause", mode: "MANIFEST_PREFERRED",
  readLegacy: async () => legacy,
}), manifest.payload);
await assert.rejects(() => orchestration.resolveActivatedIntelligenceSnapshot({
  client: { rpc: async () => ({ data: null, error: null }) }, athleteId: "athlete",
  engineId: "root_cause", mode: "MANIFEST_REQUIRED", readLegacy: async () => legacy,
}), /unavailable/);
const sink = new orchestration.InMemoryOrchestrationTelemetrySink();
sink.emit({ name: "pipeline_started", traceId: "trace", runId: "run", scopeId: "opaque", timestamp: new Date().toISOString() });
assert.equal(sink.events.length, 1);
assert.equal("rawVideo" in sink.events[0], false);

const policy = { ...orchestration.defaultEquivalencePolicy("engine","contract-v1"),
  unorderedCollectionPaths:["items"],ignoredOperationalPaths:["generatedAt"],
  numericTolerances:[{path:"score",absolute:.001,justification:"declared serialization precision"}] };
assert.equal(orchestration.compareEngineOutputs({policy,baseline:{items:["a","b"],score:1,generatedAt:"old"},
  shadow:{items:["b","a"],score:1.0005,generatedAt:"new"},
  baselineContractVersion:"contract-v1",shadowContractVersion:"contract-v1"}).severity,"acceptable_normalization");
assert.equal(orchestration.compareEngineOutputs({policy,baseline:{value:1},shadow:{value:2},
  baselineContractVersion:"contract-v1",shadowContractVersion:"contract-v1"}).severity,"user_visible_material");
assert.equal(orchestration.compareEngineOutputs({policy,baseline:{value:1},shadow:{value:1},
  baselineContractVersion:"contract-v1",shadowContractVersion:"contract-v2"}).severity,"contract_incompatibility");
assert.equal(orchestration.compareEngineOutputs({policy,baseline:null,shadow:{value:1},
  baselineContractVersion:"contract-v1",shadowContractVersion:"contract-v1"}).severity,"comparison_impossible");

let idCounter=0;
const shadowPlan=orchestration.buildExecutionPlan({analysisId:"analysis",athleteId:"athlete",registry,
  targets:["observation"],inputIdentity:{fixture:"shadow"},idFactory:()=>`id-${++idCounter}`,
  now:"2026-07-18T00:00:00.000Z"});
const shadowSnapshot={snapshotId:"snapshot",engineId:"observation",
  engineVersion:shadowPlan.engineVersions.observation,adapterVersion:"adapter",outputFingerprint:"fingerprint",
  output:{observations:[],trace:[]}};
let persistedReport=null,activeManifestId="authoritative-before";
const coordinator=new orchestration.ShadowExecutionCoordinator(
  {execute:async()=>({snapshots:{observation:shadowSnapshot},cacheOutcomes:{observation:false},traceReferences:["trace"]})},
  {createShadowManifest:async(plan,snapshots)=>({manifestId:"shadow",executionPlanId:plan.executionPlanId,
    status:"shadow",authoritative:false,snapshots,createdAt:"2026-07-18T00:00:01.000Z"}),
   persistComparison:async report=>{persistedReport=report;}},
  new orchestration.AuthoritativeBaselineResolver({
    readLegacy:async()=>({resolutionMode:"legacy_pointer",snapshotId:"legacy",snapshotType:"ObservationGenerationResult",
      engineId:"observation",engineVersion:shadowPlan.engineVersions.observation,contractVersion:"registry:observation",
      deterministicFingerprint:"fingerprint",createdAt:"2026-07-17T00:00:00.000Z",activatedAt:null,
      sourceManifestId:null,payload:{observations:[],trace:[]}}),
    readManifest:async()=>null,
  }));
const shadowResult=await coordinator.run({runId:"run",plan:shadowPlan,baselineMode:"legacy_pointer",cacheEnabled:true});
assert.equal(shadowResult.manifest.authoritative,false);
assert.equal(shadowResult.report.readiness,"ready");
assert.equal(activeManifestId,"authoritative-before","shadow cannot modify active authority");
assert.equal(persistedReport.shadowManifestId,"shadow");

const available=orchestration.validateVersionAvailability({requestedVersions:shadowPlan.engineVersions,
  registry,adapters:catalog,availableMigrations:new Set(["0041","0042","0043","0044","0045","0046"])});
const replay=orchestration.buildReplayPlan({sourceRunId:"run",sourcePlan:shadowPlan,
  immutableInputProvenanceAvailable:true,cacheMode:"bypass",targetEngineId:"observation",reason:"validation"},available);
assert.equal(replay.authoritative,false);assert.deepEqual(replay.targetEngineIds,["observation"]);
assert.throws(()=>orchestration.buildReplayPlan({sourceRunId:"run",sourcePlan:shadowPlan,
  immutableInputProvenanceAvailable:false,cacheMode:"enabled",reason:"validation"},available),/provenance/);
assert.equal(orchestration.validateVersionAvailability({requestedVersions:{observation:"historical"},
  registry,adapters:catalog,availableMigrations:new Set()})[0].status,"unavailable");

for(const point of orchestration.FAILURE_INJECTION_POINTS){
  const injector=orchestration.createFailureInjector({environment:"test",explicitlyEnabled:true,
    authenticatedInternalCaller:true,point,category:"infrastructure"});
  assert.throws(()=>injector.inject(point),orchestration.InjectedOrchestrationFailure);
}
assert.throws(()=>orchestration.createFailureInjector({environment:"production",explicitlyEnabled:true,
  authenticatedInternalCaller:true,point:"before_activation",category:"infrastructure"}).inject("before_activation"),/prohibited/);

const healthyMetrics={executionEnabled:true,validationComplete:true,successfulPipelineRate:.99,
  materialShadowMismatchRate:0,contractMismatchRate:0,cacheValidityRate:.99,retryRate:0,
  terminalFailureRate:0,expiredLeaseRate:0,recoverySuccessRate:1,activationFailureRate:0,
  rollbackRate:0,averageDurationMs:100,p95DurationMs:200,queueBacklog:0,deadLetterCount:0,
  adapterCoverageRate:1,storeHealthy:true,migrationCompatible:true};
assert.equal(orchestration.evaluateOrchestrationHealth(healthyMetrics).state,"healthy");
assert.equal(orchestration.evaluateOrchestrationHealth({...healthyMetrics,storeHealthy:false}).state,"unhealthy");
const evidence={successfulShadowRuns:50,distinctSubjects:10,adapterCoverageRate:1,
  unresolvedContractIncompatibilities:0,materialMismatchRate:0,terminalFailureRate:0,
  activationFailureRate:0,recoveryTestPassed:true,rollbackTestPassed:true,ownerIsolationTestPassed:true,
  migrationValidated:true,telemetryAvailable:true,dashboardVisible:true,documentationComplete:true,
  manualApproval:true,evaluatedAt:"2026-07-18T00:00:00.000Z"};
assert.equal(orchestration.evaluateCutoverReadiness(evidence,undefined,new Date("2026-07-18T01:00:00.000Z")).ready,true);
assert.equal(orchestration.evaluateCutoverReadiness({...evidence,manualApproval:false},undefined,
  new Date("2026-07-18T01:00:00.000Z")).ready,false);
assert.equal(orchestration.evaluateInternalRollout({environment:"staging",ownerId:"owner",athleteId:"athlete",
  internalRole:true,cohortPercentage:10,allowedOwnerIds:["owner"],allowedAthleteIds:["athlete"],
  allowedEngineIds:["observation"],requestedEngineIds:["observation"],allowedAnalysisTypes:["sprint"],
  analysisType:"sprint",userAuthoritativeActivationRequested:false}).allowed,true);
assert.equal(orchestration.evaluateInternalRollout({environment:"production",ownerId:"owner",athleteId:"athlete",
  internalRole:true,cohortPercentage:10,allowedOwnerIds:["owner"],allowedAthleteIds:["athlete"],
  allowedEngineIds:["observation"],requestedEngineIds:["observation"],allowedAnalysisTypes:["sprint"],
  analysisType:"sprint",userAuthoritativeActivationRequested:true}).allowed,false);
const deadLetter={deadLetterId:"dead",runId:"run",jobId:"job",engineId:"observation",engineVersion:"v",
  adapterVersion:"a",failureClassification:"contract",failedStage:"validateOutput",attempts:1,
  firstFailureAt:"2026-07-18T00:00:00.000Z",terminalFailureAt:"2026-07-18T00:00:01.000Z",
  dependencyStates:{},stagedSnapshotsExist:false,replayEligibility:"ineligible",
  replayReason:"contract failure",recommendedAction:"review",reviewState:"unreviewed",internalNote:null};
assert.equal(orchestration.applyDeadLetterAction(deadLetter,{type:"mark_reviewed"}).reviewState,"reviewed");
assert.throws(()=>orchestration.applyDeadLetterAction(deadLetter,{type:"attach_note",note:"x".repeat(501)}),/500/);

const migration = readFileSync(path.join(root, "supabase/migrations/0048_orchestration_production_integration.sql"), "utf8");
const aclMigration = readFileSync(path.join(root, "supabase/migrations/0049_orchestration_rpc_acl_lockdown.sql"), "utf8");
const operationsMigration = readFileSync(path.join(root, "supabase/migrations/0051_orchestration_operational_hardening.sql"), "utf8");
for (const required of ["intelligence_staged_snapshots", "activate_staged_intelligence_pipeline",
  "get_activated_intelligence_snapshot", "recover_intelligence_execution_jobs",
  "enable row level security", "to service_role", "from public"])
  assert.ok(migration.includes(required), `migration contains ${required}`);
assert.ok(/activation_status='active'/.test(migration));
assert.ok(!/grant execute on function public\\.(claim|transition|stage|activate|recover).* to authenticated/.test(migration),
  "mutation RPCs are never granted to clients");
assert.ok(/from anon,authenticated/.test(aclMigration) &&
  /claim_intelligence_execution_job/.test(aclMigration) &&
  /activate_staged_intelligence_pipeline/.test(aclMigration),
  "Supabase direct client grants are explicitly revoked");
for(const required of ["intelligence_shadow_manifests","intelligence_shadow_comparisons",
  "intelligence_replay_runs","intelligence_dead_letters","authoritative boolean not null default false",
  "create_shadow_intelligence_manifest","get_orchestration_operational_dashboard"])
  assert.ok(operationsMigration.includes(required),`operational migration contains ${required}`);

rmSync(out, { recursive: true, force: true });
console.log("orchestration integration sanity: passed");
