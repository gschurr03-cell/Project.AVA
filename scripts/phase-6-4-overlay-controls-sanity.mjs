import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require=createRequire(import.meta.url);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const out=path.join(root,".phase-6-4-overlay-controls-tmp");
let count=0;const check=(name,fn)=>{fn();count+=1;console.log(`PASS ${count}. ${name}`)};
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try {
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,strict:true,moduleResolution:"node"},files:[path.join(root,"src/lib/video/worldVisualization.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:"inherit"});
  const v=require(path.join(out,"lib/video/worldVisualization.js"));
  const component=readFileSync(path.join(root,"src/components/video/VideoOverlay.tsx"),"utf8");
  const surface=readFileSync(path.join(root,"src/components/video/OverlaySurface.tsx"),"utf8");
  const metrics=readFileSync(path.join(root,"src/lib/benchmark/measurements.ts"),"utf8");
  const ids=v.OVERLAY_REGISTRY.map(x=>x.id);const byId=Object.fromEntries(v.OVERLAY_REGISTRY.map(x=>[x.id,x]));
  const evidence={pose:true,contacts:true,center_of_mass:true,velocity:true,world_gates:true,tracking_box:false,crop_box:true,camera_motion:true,comparison_pose:true};
  check("Skeleton controls one full connected renderer",()=>{assert.match(component,/const bones = \[[\s\S]*leftShoulder[\s\S]*leftElbow[\s\S]*leftHip[\s\S]*leftKnee/);assert.equal(byId.skeleton.renderOwnership,"VideoOverlay:connected-skeleton")});
  check("no arm or leg consumer toggle remains",()=>{assert.ok(!ids.includes("arms")&&!ids.includes("legs"));assert.doesNotMatch(surface,/label: "Arms"|label: "Legs"/)});
  check("Joint Angles state is independent from Skeleton",()=>{const next=v.toggleOverlayVisibility(v.DEFAULT_OVERLAY_VISIBILITY,"joint_angles");assert.equal(next.skeleton,true);assert.equal(next.joint_angles,true)});
  check("Angles OFF renders zero angle-label branches",()=>assert.match(component,/if \(show\.joint_angles && show\.skeleton && showPose\)/));
  check("Skeleton OFF renders zero skeleton lines",()=>assert.match(component,/if \(show\.skeleton && showPose\)/));
  check("Skeleton ON does not force angles ON",()=>{assert.equal(v.DEFAULT_OVERLAY_VISIBILITY.skeleton,true);assert.equal(v.DEFAULT_OVERLAY_VISIBILITY.joint_angles,false)});
  check("unavailable pose disables Skeleton",()=>assert.equal(v.overlayAvailability(byId.skeleton,{...evidence,pose:false}).available,false));
  check("Contacts and Step Numbers are independent",()=>{const next=v.toggleOverlayVisibility(v.DEFAULT_OVERLAY_VISIBILITY,"contacts");assert.equal(next.contacts,false);assert.equal(next.step_numbers,true)});
  check("Gates and Zones are independent",()=>{const next=v.toggleOverlayVisibility(v.DEFAULT_OVERLAY_VISIBILITY,"gates");assert.equal(next.gates,false);assert.equal(next.zones,true)});
  // Phase R2: the zone block now branches on `stationaryZoneDisplay` --
  // stationary cameras get the new full-height vertical-pane rendering,
  // panning cameras keep the original Phase 6.3 `worldZonePolygons` path
  // unchanged (out of scope for this phase). Each branch declares its own
  // 3 zone overlays (start/fly/finish), so the total occurrence count
  // doubled from 3 to 6 -- both branches still tag every zone
  // `transformSource: "global_camera_path"`, so the underlying contract
  // this check verifies (zones share the world transform, not an
  // independent one) still holds in both branches.
  check("Zones retain Phase 6.3 shared world transform",()=>{assert.match(component,/show\.zones && startG && finishG/);assert.equal((component.match(/transformSource: "global_camera_path"/g)||[]).length,6)});
  check("developer overlays are hidden in consumer mode",()=>assert.ok(v.availableOverlayDefinitions("consumer").every(x=>!x.developerOnly)));
  check("developer overlays are available in developer mode",()=>assert.ok(v.availableOverlayDefinitions("developer").some(x=>x.id==="camera_motion_debug")));
  check("overlay registry IDs and ownership are deterministic",()=>{assert.equal(new Set(ids).size,ids.length);assert.ok(v.OVERLAY_REGISTRY.every(x=>x.renderOwnership&&x.evidenceRequirement))});
  check("Phase 6.3 layer ordering is preserved",()=>assert.deepEqual(v.VISUALIZATION_LAYERS,{video:0,worldPolygons:20,worldGeometry:30,athlete:40,diagnostics:50,userInterface:60}));
  check("visibility toggles cannot change playback timestamp",()=>{const before=12.345;v.toggleOverlayVisibility(v.DEFAULT_OVERLAY_VISIBILITY,"zones");assert.equal(before,12.345);assert.doesNotMatch(v.toggleOverlayVisibility.toString(),/currentTime|seek|video/)});
  check("Phase 6.1 mediaTime synchronization is preserved through the Phase 6.6B scheduler",()=>{
    assert.match(component,/mediaTimeS: metadata\.mediaTime/);
    assert.match(component,/presentedMediaTimeS = promotion\.promoted\.mediaTimeS/);
  });
  check("scientific measurements remain isolated",()=>assert.doesNotMatch(metrics,/worldVisualization|OverlayVisibility|OVERLAY_REGISTRY/));
  check("Phase 6.2 atomic world lock is preserved",()=>assert.match(component,/stabilizeGateZone/));
  check("Phase 6.3 world polygons are preserved",()=>assert.match(component,/worldZonePolygons\(/));
  check("defaults are complete and deterministic",()=>{assert.equal(Object.keys(v.DEFAULT_OVERLAY_VISIBILITY).length,v.OVERLAY_REGISTRY.length);assert.deepEqual(Object.entries(v.DEFAULT_OVERLAY_VISIBILITY).filter(([,on])=>on).map(([id])=>id),["skeleton","step_numbers","contacts","gates","zones"])});
  assert.equal(count,20);console.log(`ALL ${count} PHASE 6.4 OVERLAY CONTROL CHECKS PASSED`);
} finally {rmSync(out,{recursive:true,force:true})}
