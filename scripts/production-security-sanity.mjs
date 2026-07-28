import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync,rmSync,writeFileSync,readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".production-security-sanity-tmp"),require=createRequire(import.meta.url);
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),
    module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node"},
    files:[path.join(root,"src/lib/operations/security.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:"inherit"});
  const security=require(path.join(out,"lib/operations/security.js"));
  const redacted=security.redactTelemetry({authorization:"Bearer abcdefghijklmnop",nested:{signedUrl:"https://private",ok:"safe"},painDescription:"private"});
  assert.equal(redacted.authorization,"[REDACTED]");assert.equal(redacted.nested.signedUrl,"[REDACTED]");assert.equal(redacted.nested.ok,"safe");
  assert.equal(security.safeCorrelationId("bad").length,36);
  assert.equal(security.privacySafeSubjectId("owner","athlete","0123456789abcdef"),security.privacySafeSubjectId("owner","athlete","0123456789abcdef"));
  const owner="00000000-0000-4000-8000-000000000001",athlete="00000000-0000-4000-8000-000000000002";
  const policy={enabled:true,accountIds:[owner],coachIds:[],athleteIds:[athlete],minimumBuild:10,supportedAnalysisTypes:["fly"]};
  assert.equal(security.authorizeClosedBeta(policy,{accountId:owner,athleteId:athlete,build:10,analysisType:"fly"}).authorized,true);
  assert.equal(security.authorizeClosedBeta(policy,{accountId:owner,athleteId:athlete,build:9,analysisType:"fly"}).authorized,false);
  assert.equal(security.verifyTrainingPlanIntegrity({ownerId:owner,athleteId:athlete,requestedOwnerId:owner,requestedAthleteId:athlete,
    lifecycle:"active",approved:true,planVersion:2,activeVersion:2,fingerprint:"x",expectedFingerprint:"x",restrictionConflict:false}).executable,true);
  assert.equal(security.verifyTrainingPlanIntegrity({ownerId:owner,athleteId:athlete,requestedOwnerId:owner,requestedAthleteId:athlete,
    lifecycle:"draft",approved:false,planVersion:1,activeVersion:2,fingerprint:"x",expectedFingerprint:"x",restrictionConflict:true}).executable,false);
  const docker=readFileSync(path.join(root,"Dockerfile.worker"),"utf8");
  assert.match(docker,/USER ava/);assert.match(docker,/HEALTHCHECK/);
  const workerRuntime=await import(pathToFileURL(path.join(root,"scripts/lib/worker-runtime.mjs")));
  const workerRedacted=workerRuntime.redactWorkerTelemetry({nested:{authorization:"Bearer abcdefghijklmnop",videoPath:"private",safe:"ok"}});
  assert.equal(workerRedacted.nested.authorization,"[REDACTED]");assert.equal(workerRedacted.nested.videoPath,"[REDACTED]");assert.equal(workerRedacted.nested.safe,"ok");
  const nextConfig=readFileSync(path.join(root,"next.config.mjs"),"utf8");
  for(const header of["X-Content-Type-Options","X-Frame-Options","Referrer-Policy","Permissions-Policy","Strict-Transport-Security"])
    assert.ok(nextConfig.includes(header));
  console.log("production security sanity: passed");
}finally{rmSync(out,{recursive:true,force:true})}
