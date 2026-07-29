import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".landmark-plane-sanity-tmp");rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try {
  execFileSync("npx",["tsc","src/lib/calibration/timingSetup.ts","--outDir",out,"--rootDir","src/lib","--module","commonjs","--target","es2022","--skipLibCheck","--esModuleInterop","--moduleResolution","node","--strict"],{cwd:root,stdio:"inherit"});
  const timing=createRequire(import.meta.url)(path.join(out,"calibration/timingSetup.js"));
  const point={x:.3,y:.5},other={x:.7,y:.52};
  const definition={construction:"two_fixed_points",referenceType:"fixed cone pair",points:[point,other],laneOrientationDeg:null,analyticalPlane:{c1:point,c2:other},physicalEvidence:"Pair fixed at measured plane",confidence:.8,confirmed:true,readiness:"needs_confirmation"};
  const base={schemaVersion:timing.TIMING_SETUP_SCHEMA_VERSION,setupVersion:1,setupMode:"fixed_landmarks",distance:{distanceM:30,status:"hardware_defined",measurementMethod:"timing rig",uncertaintyM:.02,evidence:"survey sheet",confirmedAt:new Date().toISOString()},bodyReference:"torso",validationStatus:"pending_validation",modelVersion:timing.LANDMARK_PLANE_MODEL_VERSION,laneIdentity:"lane 4"};
  assert.doesNotThrow(()=>timing.timingSetupSchema.parse({...base,start:definition,finish:definition}));
  assert.throws(()=>timing.timingSetupSchema.parse({...base,start:{...definition,points:[point]},finish:definition}),/two fixed points/i);
  const pointNormal={...definition,construction:"point_plus_lane_normal",points:[point],laneOrientationDeg:90};
  assert.doesNotThrow(()=>timing.timingSetupSchema.parse({...base,start:pointNormal,finish:definition}));
  assert.throws(()=>timing.timingSetupSchema.parse({...base,start:{...pointNormal,laneOrientationDeg:null},finish:definition}),/explicit lane orientation/i);
  console.log("landmark plane sanity: passed");
} finally {rmSync(out,{recursive:true,force:true});}
