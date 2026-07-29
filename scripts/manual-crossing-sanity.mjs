import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".manual-crossing-sanity-tmp");rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try {
  execFileSync("npx",["tsc","src/lib/calibration/timingSetup.ts","--outDir",out,"--rootDir","src/lib","--module","commonjs","--target","es2022","--skipLibCheck","--esModuleInterop","--moduleResolution","node","--strict"],{cwd:root,stdio:"inherit"});
  const timing=createRequire(import.meta.url)(path.join(out,"calibration/timingSetup.js"));
  const bracket={beforeFrame:99,beforeTimestampS:3.3,afterFrame:100,afterTimestampS:10/3,interpolation:.25};
  const crossing=timing.manualCrossingTimestamp(bracket,1/30);
  assert.equal(crossing.method,"user_interpolated");assert.ok(crossing.rawTimestampS>3.3&&crossing.rawTimestampS<10/3);
  const conservative=timing.manualCrossingTimestamp({...bracket,afterFrame:null,afterTimestampS:null,interpolation:null},1/30);
  assert.equal(conservative.method,"conservative_frame_boundary");assert.equal(conservative.uncertaintyS,1/30);
  const setup=timing.timingSetupSchema.parse({schemaVersion:timing.TIMING_SETUP_SCHEMA_VERSION,setupVersion:1,setupMode:"manual_crossing",distance:{distanceM:30,status:"user_asserted",measurementMethod:"coach entry",uncertaintyM:null,evidence:null,confirmedAt:new Date().toISOString()},bodyReference:"torso",validationStatus:"experimental_ready",modelVersion:timing.MANUAL_TIMING_MODEL_VERSION,start:bracket,finish:{beforeFrame:166,beforeTimestampS:166/30,afterFrame:167,afterTimestampS:167/30,interpolation:null},notes:null});
  const trust=timing.timingTrust(setup,60);assert.equal(trust.category,"experimental_manual");assert.equal(trust.buttonState,"Experimental ready");assert.equal(trust.compatibilityGroup,"manual-crossing-experimental-v1");
  const result=timing.calculateManualTiming(setup,1/60);assert.equal(result.label,"Experimental manual video timing");
  assert.ok(result.rawTimeS>0);assert.ok(result.reportedTimeS>=result.rawTimeS);assert.equal(result.reportedVelocityMps,30/result.reportedTimeS);
  assert.throws(()=>timing.timingSetupSchema.parse({...setup,start:{...bracket,afterFrame:98}}));
  const ui=readFileSync("src/app/sessions/[id]/TimingSetupForm.tsx","utf8");assert.match(ui,/Experimental manual video timing/);assert.match(ui,/conservative frame boundary/);
  console.log("manual crossing sanity: passed");
} finally {rmSync(out,{recursive:true,force:true});}
