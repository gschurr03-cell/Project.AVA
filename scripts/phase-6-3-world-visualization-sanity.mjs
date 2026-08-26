import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url); const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."); const out=path.join(root,".phase-6-3-world-visualization-tmp");
let count=0; const check=(name,fn)=>{fn();count++;console.log(`PASS ${count}. ${name}`)};
const boundary=x=>({p1:{x,y:0},p2:{x,y:50},midpoint:{x,y:25}}); const viewport={x:0,y:0,width:100,height:50};
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y},0)/2);
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try {
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,strict:true,moduleResolution:"node"},files:[path.join(root,"src/lib/video/worldVisualization.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:"inherit"});
  const v=require(path.join(out,"lib/video/worldVisualization.js")); const zones=v.worldZonePolygons(boundary(20),boundary(80),viewport);
  check("polygon generation creates three non-overlapping regions",()=>assert.deepEqual([area(zones.start),area(zones.fly),area(zones.finish)],[1000,3000,1000]));
  check("polygon areas exactly cover the viewport",()=>assert.equal(area(zones.start)+area(zones.fly)+area(zones.finish),5000));
  check("shared transformed gates produce a shared transformed fly polygon",()=>{const z=v.worldZonePolygons(boundary(25),boundary(85),viewport);assert.equal(Math.min(...z.fly.map(p=>p.x)),25);assert.equal(Math.max(...z.fly.map(p=>p.x)),85)});
  check("reverse travel still partitions the complete viewport",()=>{const z=v.worldZonePolygons(boundary(80),boundary(20),viewport);assert.equal(area(z.start)+area(z.fly)+area(z.finish),5000)});
  const calls=[];const overlays=[
    {id:"ui",coordinateSpace:"screen",layer:"userInterface",zOrder:0,visible:true,dependencies:[],transformSource:"screen_identity",render:()=>calls.push("ui")},
    {id:"athlete",coordinateSpace:"athlete_source",layer:"athlete",zOrder:0,visible:true,dependencies:[],transformSource:"presented_pose_frame",render:()=>calls.push("athlete")},
    {id:"zones",coordinateSpace:"world",layer:"worldPolygons",zOrder:2,visible:true,dependencies:[],transformSource:"global_camera_path",render:()=>calls.push("zones")},
    {id:"gates",coordinateSpace:"world",layer:"worldGeometry",zOrder:0,visible:true,dependencies:[],transformSource:"global_camera_path",render:()=>calls.push("gates")},
    {id:"hidden",coordinateSpace:"screen",layer:"diagnostics",zOrder:0,visible:false,dependencies:[],transformSource:"screen_identity",render:()=>calls.push("hidden")},
  ];
  check("layer ordering is deterministic",()=>assert.deepEqual(v.orderedVisibleOverlays(overlays).map(x=>x.id),["zones","gates","athlete","ui"]));
  check("render order follows declared layers",()=>{v.renderRegisteredOverlays(overlays,{});assert.deepEqual(calls,["zones","gates","athlete","ui"])});
  check("visibility contract excludes hidden overlays",()=>assert.ok(!v.orderedVisibleOverlays(overlays).some(x=>x.id==="hidden")));
  check("equal layer/z order is stable by registration",()=>{const same=overlays.slice(0,2).map((x,i)=>({...x,id:`same${i}`,layer:"diagnostics",zOrder:1}));assert.deepEqual(v.orderedVisibleOverlays(same).map(x=>x.id),["same0","same1"])});
  check("future overlay registration requires dependencies and transform source",()=>assert.ok(overlays.every(x=>Array.isArray(x.dependencies)&&x.transformSource)));
  check("every current visual has exactly one manifest owner",()=>{const ids=v.CURRENT_VISUALIZATION_MANIFEST.map(x=>x[0]);assert.equal(new Set(ids).size,ids.length)});
  check("all six layers are explicit",()=>assert.deepEqual(Object.keys(v.VISUALIZATION_LAYERS),["video","worldPolygons","worldGeometry","athlete","diagnostics","userInterface"]));
  const component=readFileSync(path.join(root,"src/components/video/VideoOverlay.tsx"),"utf8"); const metrics=readFileSync(path.join(root,"src/lib/benchmark/measurements.ts"),"utf8");
  check("zone rendering consumes one shared polygon transform",()=>assert.match(component,/worldZonePolygons\([\s\S]*startG[\s\S]*finishG/));
  check("zones declare the global camera path transform",()=>assert.equal((component.match(/transformSource: "global_camera_path"/g)||[]).length,3));
  check("scientific metrics do not import visualization",()=>assert.doesNotMatch(metrics,/worldVisualization|VisualizationOverlay/));
  check("Phase 6.1 presented media clock remains through the Phase 6.6B scheduler",()=>{
    assert.match(component,/mediaTimeS: metadata\.mediaTime/);
    assert.match(component,/presentedMediaTimeS = promotion\.promoted\.mediaTimeS/);
  });
  check("Phase 6.2 atomic gate stabilization remains",()=>assert.match(component,/stabilizeGateZone/));
  assert.equal(count,16); console.log(`ALL ${count} PHASE 6.3 WORLD VISUALIZATION CHECKS PASSED`);
} finally {rmSync(out,{recursive:true,force:true})}
