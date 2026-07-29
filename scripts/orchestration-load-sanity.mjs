import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module,{createRequire}from"node:module";
import path from"node:path";
const root=process.cwd(),out=path.join(root,".orchestration-load-build");
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),
  module:"commonjs",target:"es2022",jsx:"react-jsx",skipLibCheck:true,esModuleInterop:true,strict:true,
  moduleResolution:"node",baseUrl:root,paths:{"@/*":["src/*"]}},files:[
  path.join(root,"src/lib/intelligence/registry.ts"),path.join(root,"src/lib/intelligence/orchestration/index.ts")]}));
execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{stdio:"inherit"});
const require=createRequire(import.meta.url),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){return resolve.call(this,request.startsWith("@/")?path.join(out,request.slice(2)):request,...rest)};
const registry=require(path.join(out,"lib/intelligence/registry.js")).INTELLIGENCE_ENGINE_REGISTRY;
const orchestration=require(path.join(out,"lib/intelligence/orchestration/index.js"));
const subjects=100,planStart=performance.now(),plans=[];
for(let index=0;index<subjects;index++)plans.push(orchestration.buildExecutionPlan({
  analysisId:`analysis-${index}`,athleteId:`athlete-${index}`,registry,targets:["coach_report"],
  inputIdentity:{analysisId:`analysis-${index}`,fixtureVersion:"load-v1"},
  idFactory:(()=>{let id=0;return()=>`${index}-${++id}`;})(),now:"2026-07-18T00:00:00.000Z"}));
const planBuildMs=performance.now()-planStart;
assert.equal(plans.length,subjects);assert.equal(new Set(plans.map(plan=>plan.inputFingerprint)).size,subjects);
const queue=new orchestration.InMemoryQueueProvider(),totalJobs=500;
for(let index=0;index<totalJobs;index++)await queue.enqueue({jobId:`job-${index}`,executionPlanId:`plan-${index%subjects}`,availableAt:Date.now()});
const seen=new Set(),claimStart=performance.now();
const workers=Array.from({length:8},(_,worker)=>new orchestration.OrchestrationWorker(`worker-${worker}`,queue,{
  execute:async jobId=>{assert.equal(seen.has(jobId),false,`duplicate claim ${jobId}`);seen.add(jobId);}
}));
await Promise.all(workers.map(async worker=>{while(await worker.runOnce()){};}));
const claimMs=performance.now()-claimStart;
assert.equal(seen.size,totalJobs);
const duplicateQueue=new orchestration.InMemoryQueueProvider();
await Promise.all(Array.from({length:20},()=>duplicateQueue.enqueue({jobId:"same-key",executionPlanId:"same-plan",availableAt:Date.now()})));
let duplicateRuns=0;const duplicateWorker=new orchestration.OrchestrationWorker("duplicate-worker",duplicateQueue,{execute:async()=>{duplicateRuns++;}});
while(await duplicateWorker.runOnce()){}assert.equal(duplicateRuns,1);
const metrics={environment:"local_in_memory_simulation",subjects,plans:plans.length,jobs:totalJobs,workers:workers.length,
  planBuildMs:Number(planBuildMs.toFixed(2)),averagePlanBuildMs:Number((planBuildMs/subjects).toFixed(3)),
  queueDrainMs:Number(claimMs.toFixed(2)),averageClaimExecuteMs:Number((claimMs/totalJobs).toFixed(3)),
  duplicateClaims:0,idempotentDuplicateExecutions:duplicateRuns};
assert.ok(metrics.averagePlanBuildMs<10,"local plan-build threshold");
assert.ok(metrics.queueDrainMs<5000,"local queue-drain threshold");
console.log(JSON.stringify(metrics,null,2));
rmSync(out,{recursive:true,force:true});
console.log("orchestration load sanity: passed");

