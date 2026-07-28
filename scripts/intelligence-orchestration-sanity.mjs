import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const out = resolve(".orchestration-sanity-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync("npx", ["tsc", "--module", "commonjs", "--target", "ES2022", "--esModuleInterop",
  "--skipLibCheck", "--outDir", out,
  "src/lib/intelligence/shared/contracts.ts",
  "src/lib/intelligence/orchestration/contracts.ts",
  "src/lib/intelligence/orchestration/graph.ts",
  "src/lib/intelligence/orchestration/planner.ts",
  "src/lib/intelligence/orchestration/policy.ts",
  "src/lib/intelligence/orchestration/queue.ts",
  "src/lib/intelligence/orchestration/worker.ts",
  "src/lib/intelligence/orchestration/invalidation.ts"], { stdio: "inherit" });
const require = createRequire(import.meta.url);
const graph = require(resolve(out, "orchestration/graph.js"));
const planner = require(resolve(out, "orchestration/planner.js"));
const policy = require(resolve(out, "orchestration/policy.js"));
const queueModule = require(resolve(out, "orchestration/queue.js"));
const workerModule = require(resolve(out, "orchestration/worker.js"));
const invalidation = require(resolve(out, "orchestration/invalidation.js"));

const contract = { inputContract: "Input", outputContract: "Output", versioned: true,
  stronglyTyped: true, serializable: true, immutableOutput: true, cacheCompatible: true,
  offlineCompatible: true, futureCompatibility: "additive_versioned" };
const cachePolicy = { strategy: "derived_result", appOpenBehavior: "not_applicable",
  offlineCompatible: true, idempotentFingerprint: true, invalidationOwner: "test",
  persistenceMigration: null };
const engine = (engineId, pipelinePredecessor = null, dependencies = pipelinePredecessor ? [pipelinePredecessor] : []) =>
  ({ engineId, displayName: engineId, engineVersion: `${engineId}-v1`, status: "active",
    lifecycle: "production", dependencies, pipelinePredecessor, contract, cachePolicy,
    featureFlags: [], documentation: ["test"], dashboard: null, tests: ["test"], owner: "test" });
const registry = [engine("a"), engine("b"), engine("c", "a"), engine("d", "a"), engine("e", "c")];
const validated = graph.validateRegistryGraph(registry);
assert.deepEqual(validated.stages, [["a", "b"], ["c", "d"], ["e"]], "parallel topological stages");
const plan = planner.buildExecutionPlan({ analysisId: "analysis", athleteId: "athlete", registry,
  inputIdentity: { z: 1, a: 2 }, now: "2026-01-01T00:00:00.000Z", idFactory: (() => { let n=0; return () => `id-${++n}`; })() });
assert.deepEqual(plan.executionOrder, ["a", "b", "c", "d", "e"]);
assert.equal(plan.scheduledJobs.length, 5);
assert.equal(planner.buildExecutionPlan({ analysisId: "analysis", athleteId: "athlete", registry,
  inputIdentity: { a: 2, z: 1 }, now: plan.createdAt, idFactory: () => "x" }).inputFingerprint, plan.inputFingerprint, "idempotent fingerprint");
assert.throws(() => graph.validateRegistryGraph([engine("a", "b"), engine("b", "a")]), /cycle/);
assert.throws(() => graph.validateRegistryGraph([engine("a", "missing")]), /unknown|requires/);
assert.throws(() => graph.validateRegistryGraph([{ ...engine("a"), engineVersion: "" }]), /no version/);
assert.throws(() => graph.validateRegistryGraph([{ ...engine("a"), dependencies: ["b", "b"] }, engine("b")]), /repeats/);
assert.equal(policy.shouldRetry("deterministic_transient", 1), true);
for (const kind of ["validation", "missing_dependency", "contract", "unsupported_version", "infrastructure"])
  assert.equal(policy.shouldRetry(kind, 1), false, `${kind} must not retry`);
assert.deepEqual(policy.readyJobs(plan, plan.scheduledJobs, true).map((j) => j.engineId), ["a", "b"]);
assert.deepEqual(invalidation.downstreamInvalidations(plan.dependencyGraph, ["a"]), ["a", "c", "d", "e"]);

const queue = new queueModule.InMemoryQueueProvider();
await queue.enqueue({ jobId: "job", executionPlanId: "plan", availableAt: Date.now() });
let runs = 0;
const failedWorker = new workerModule.OrchestrationWorker("worker-1", queue, { execute: async () => { runs++; throw new Error("restart"); } }, 1);
await assert.rejects(() => failedWorker.runOnce(), /restart/);
const restartedWorker = new workerModule.OrchestrationWorker("worker-2", queue, { execute: async () => { runs++; } });
assert.equal(await restartedWorker.runOnce(), true, "replacement worker claims released work");
assert.equal(await restartedWorker.runOnce(), false, "acknowledged job executes once");
assert.equal(runs, 2);

rmSync(out, { recursive: true, force: true });
console.log("intelligence orchestration sanity: passed");

