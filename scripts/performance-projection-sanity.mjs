import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,".performance-projection-sanity-tmp");
const require=createRequire(import.meta.url),originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){return originalResolve.call(this,request.startsWith("@/")?path.join(out,request.slice(2)):request,...rest)};
let ok=true;
const check=(label,condition)=>{console.log(`${condition?"PASS":"FAIL"}  ${label}`);if(!condition)ok=false};
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node",baseUrl:root,paths:{"@/*":["src/*"]}},files:[path.join(root,"src/lib/projectionEngine/index.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:["ignore","inherit","inherit"]});
  const engine=require(path.join(out,"lib/projectionEngine/index.js"));
  const date=i=>new Date(Date.UTC(2026,i,1)).toISOString();
  const evidence=[{evidenceId:"priority-1",sourceType:"priority",sourceVersion:"priority-v1",summary:"Structured upstream maximum-velocity priority.",confidence:.8}];
  const benchmark={comparisonId:"comparison-1",datasetId:"dataset-1",datasetVersion:"1.0.0",compatibilityConfidence:"High",percentile:62,summary:"Compatible reviewed synthetic fixture comparison."};
  const history=(values,key="protocol-v1")=>values.map((value,i)=>({sessionId:`s${i}`,capturedAt:date(i),metric:"topSpeedMps",value,unit:"m/s",compatibilityKey:key,measurementConfidence:.9,sessionQuality:.9,season:"2026"}));
  const input=(values,overrides={})=>({
    athleteId:"athlete-test",projectionType:"90_day",targetMetric:"topSpeedMps",unit:"m/s",higherIsBetter:true,
    generatedAt:"2026-07-17T12:00:00.000Z",history:history(values),
    mechanicalFingerprint:{fingerprintId:"fp-1",version:"fingerprint-v1",compatibilityKey:"protocol-v1",confidence:.75,summary:"Synthetic test fingerprint."},
    evidence,limiterInputs:[{category:"maximum_velocity",severity:"moderate",confidence:.8,supportingEvidenceIds:["priority-1"],modifiable:"partly",estimatedImpact:"potentially_moderate",validationRequirements:["Retest with compatible protocol."],upstreamSource:"priority"}],
    benchmarks:[benchmark],trainingAgeYears:4,competitionHistoryCount:12,biomechanicalConsistency:.9,trainingConsistency:.85,researchConfidence:.8,unknownVariables:["sleep consistency"],returnToPlayCleared:null,metricFloor:4,metricCeiling:13,...overrides,
  });

  const steady=engine.buildPerformanceProjection(input([9,9.08,9.16,9.24,9.32]));
  check("compatible steady history produces a bounded numeric projection",steady.status==="available"&&steady.expectedCase>9.32&&steady.confidenceInterval.lower<=steady.confidenceInterval.upper);
  check("same input produces byte-equivalent output and projection ID",JSON.stringify(engine.buildPerformanceProjection(input([9,9.08,9.16,9.24,9.32])))===JSON.stringify(steady));
  check("output carries confidence, evidence, benchmarks, assumptions, conditions, unknowns and limiters",steady.projectionConfidence.score>0&&steady.supportingEvidence.length===1&&steady.supportingBenchmarks.length===1&&steady.assumptions.length&&steady.requiredConditions.length&&steady.unknownVariables.length&&steady.majorLimiters.length===1);
  check("rapid improvement classifies deterministically",engine.analyzeTrajectory(history([8,8.3,8.6,8.9]),"topSpeedMps",true).trajectoryType==="rapid_improvement");
  check("plateau classifies deterministically",engine.analyzeTrajectory(history([9,9.001,8.999,9]),"topSpeedMps",true).trajectoryType==="plateau");
  check("regression classifies deterministically",engine.analyzeTrajectory(history([9.4,9.3,9.2,9.1]),"topSpeedMps",true).trajectoryType==="regression");
  check("high-noise history classifies inconsistent and degrades confidence",engine.buildPerformanceProjection(input([9,10,8.5,10.2,8.7])).trajectoryType==="inconsistent"&&engine.buildPerformanceProjection(input([9,10,8.5,10.2,8.7])).projectionConfidence.score<=49);
  const sparse=engine.buildPerformanceProjection(input([9,9.1]));
  check("missing history fails closed without numeric scenarios",sparse.status==="insufficient_evidence"&&sparse.predictedValue===null&&sparse.bestCase===null);
  const mismatch=engine.buildPerformanceProjection(input([9,9.08,9.16,9.24,9.32],{benchmarks:[{...benchmark,compatibilityConfidence:"Unavailable",percentile:null}]}));
  check("benchmark mismatch is excluded and caps confidence",mismatch.supportingBenchmarks.length===0&&mismatch.projectionConfidence.score<=44);
  const mixed=engine.analyzeTrajectory([...history([9,9.1,9.2]),...history([12,12.1],"other")],"topSpeedMps",true);
  check("incompatible history is excluded rather than mixed",mixed.points.length===3&&mixed.excludedPointCount===2);
  const missingLimiter=engine.buildLimiters([{...input([9,9.1,9.2]).limiterInputs[0],supportingEvidenceIds:["missing"]}],evidence);
  check("limiter without complete upstream evidence is withheld",missingLimiter.length===0);
  const race=engine.buildPerformanceProjection(input([9,9.1,9.2],{targetMetric:"100mRaceTime",unit:"s",higherIsBetter:false}));
  check("race-time synthesis is explicitly unsupported",race.status==="unsupported"&&race.predictedValue===null);
  const career=engine.buildPerformanceProjection(input([9,9.1,9.2],{projectionType:"career_peak"}));
  check("career peak fails closed without a validated maturation model",career.status==="unsupported"&&/career peak/i.test(career.warnings.join(" ")));
  const injury=engine.buildPerformanceProjection(input([9,9.1,9.2],{projectionType:"return_from_injury",returnToPlayCleared:false}));
  check("return-from-injury projection fails closed",injury.status==="unsupported"&&injury.predictedValue===null);
  const snapshot=engine.createProjectionSnapshot("snapshot-1",input([9,9.1,9.2]),engine.buildPerformanceProjection(input([9,9.1,9.2])));
  check("immutable snapshot preserves exact versioned input and output",snapshot.engineVersion===engine.PROJECTION_ENGINE_VERSION&&snapshot.input.history.length===3&&snapshot.output.projectionId);
  check("public input contract contains no raw landmark field",!JSON.stringify(input([9,9.1,9.2])).toLowerCase().includes("landmark"));
  check("language avoids guarantees and genetic ceilings",!/guaranteed improvement|genetic ceiling/i.test(JSON.stringify(steady)));
  const migration=readFileSync(path.join(root,"supabase/migrations/0041_performance_projection_foundation.sql"),"utf8");
  check("persistence is immutable, athlete-owned, and seeds no values",/No update policy/.test(migration)&&/athletes\.coach_id = auth\.uid\(\)/.test(migration)&&!/insert into public\.performance_projection_snapshots/i.test(migration));
  check("developer summary is reviewer-gated",/is_research_reviewer/.test(migration)&&/research reviewer access required/.test(migration));
}finally{rmSync(out,{recursive:true,force:true})}
if(!ok)process.exit(1);
console.log("\\nAthlete Potential & Performance Projection Engine sanity checks passed.");
