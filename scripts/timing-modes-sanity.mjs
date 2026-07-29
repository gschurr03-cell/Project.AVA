import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".timing-modes-sanity-tmp");rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try {
  execFileSync("npx",["tsc","src/lib/calibration/timingSetup.ts","src/lib/analysis/historyCompatibility.ts","--outDir",out,"--rootDir","src/lib","--module","commonjs","--target","es2022","--skipLibCheck","--esModuleInterop","--moduleResolution","node","--strict"],{cwd:root,stdio:"inherit"});
  const require=createRequire(import.meta.url),timing=require(path.join(out,"calibration/timingSetup.js")),history=require(path.join(out,"analysis/historyCompatibility.js"));
  const distance={distanceM:null,status:"unknown",measurementMethod:null,uncertaintyM:null,evidence:null,confirmedAt:null};
  const technique=timing.timingSetupSchema.parse({schemaVersion:timing.TIMING_SETUP_SCHEMA_VERSION,setupVersion:1,setupMode:"technique_only",distance,bodyReference:"torso",validationStatus:"eligible"});
  assert.equal(timing.timingTrust(technique,60).buttonState,"Technique only");
  assert.equal(timing.timingTrust(technique,60).timingEligible,false);
  const line={c1:{x:.2,y:.4},c2:{x:.8,y:.42}};
  const marked=timing.timingSetupSchema.parse({schemaVersion:timing.TIMING_SETUP_SCHEMA_VERSION,setupVersion:2,setupMode:"marked_zone",distance:{...distance,distanceM:30,status:"user_measured"},bodyReference:"torso",validationStatus:"pending_validation",start:{confirmed:true,readiness:"ready",line},finish:{confirmed:true,readiness:"ready",line}});
  assert.equal(timing.timingTrust(marked,60).compatibilityGroup,"marked-zone-validated-60-v1");
  assert.equal(timing.timingTrust(marked,60).timingEligible,true);
  assert.equal(timing.timingTrust({...marked,start:{...marked.start,readiness:"limited"}},60).timingEligible,false);
  const identity={analysis_fps:60,model_version:"model",analysis_pipeline_version:"pipeline",metric_schema_version:"metrics",timing_policy_version:"policy",recording_mode_version:"recording",camera_motion_model_version:"camera",compatibility_group:"validated-60-v1",timing_compatibility_group:"marked-zone-validated-60-v1"};
  assert.equal(history.analysesAreCompatible(history.versionIdentity(identity),history.versionIdentity(identity)),true);
  assert.equal(history.analysesAreCompatible(history.versionIdentity(identity),history.versionIdentity({...identity,timing_compatibility_group:"manual-crossing-experimental-v1"})),false);
  const candidates=timing.rankLineSnapCandidates([
    {line,contrast:.9,straightness:.9,orientation:.9,continuity:.9,proximity:.9},
    {line,contrast:.2,straightness:.2,orientation:.2,continuity:.2,proximity:.2},
  ]);
  assert.ok(candidates[0].score>candidates[1].score);assert.equal(candidates[0].requiresConfirmation,true);
  const ui=readFileSync("src/app/sessions/[id]/TimingSetupForm.tsx","utf8");
  for(const label of ["Marked zone","Fixed landmarks","Manual crossing","Technique only"]) assert.match(ui,new RegExp(label));
  const migration=readFileSync("supabase/migrations/0032_timing_setup_modes.sql","utf8");
  assert.match(migration,/timing_setup/);assert.match(migration,/timing_compatibility_group/);
  console.log("timing modes sanity: passed");
} finally {rmSync(out,{recursive:true,force:true});}
