import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".local-gate-lock-sanity-tmp");rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try {
  execFileSync("npx",["tsc","src/lib/calibration/localGateLock.ts","src/lib/calibration/zoneAnchors.ts","src/lib/video/recordingMode.ts","--outDir",out,"--rootDir","src/lib","--module","commonjs","--target","es2022","--skipLibCheck","--esModuleInterop","--moduleResolution","node","--strict"],{cwd:root,stdio:"inherit"});
  const require=createRequire(import.meta.url),lock=require(path.join(out,"calibration/localGateLock.js"));
  const base={frameIndex:10,finalLine:{c1:{x:.2,y:.4},c2:{x:.3,y:.45}},confidence:.8,appearanceScore:.8,forwardBackwardErrorPx:.4,correctionResidualPx:1,midpointVelocityPx:2,angularVelocityDeg:.2,scaleChange:.01,reasonCodes:[]};
  const locked=lock.localGateFrameSchema.parse({...base,state:"locked",render:true,timingEligible:true});assert.ok(lock.lockedLineForTiming(locked));
  assert.equal(lock.lockedLineForTiming(lock.localGateFrameSchema.parse({...base,state:"limited",render:true,timingEligible:false})),null);
  assert.equal(lock.lockedLineForTiming(lock.localGateFrameSchema.parse({...base,state:"lost",finalLine:null,render:false,timingEligible:false})),null);
  assert.throws(()=>lock.localGateFrameSchema.parse({...base,state:"lost",render:true,timingEligible:false}));
  assert.throws(()=>lock.localGateFrameSchema.parse({...base,state:"limited",render:true,timingEligible:true}));
  const python=readFileSync("src/lib/calibration/runtime/local_gate_tracker.py","utf8");
  assert.match(python,/athlete must never become local line evidence/);assert.doesNotMatch(python,/yellow|cone/i);
  assert.match(python,/correction_jump>8/);assert.match(python,/predicted_segment_offscreen/);assert.match(python,/local_physical_line_unavailable/);
  assert.match(python,/calcOpticalFlowPyrLK/);assert.match(python,/backward/);
  console.log("local gate lock sanity: passed");
} finally {rmSync(out,{recursive:true,force:true});}
