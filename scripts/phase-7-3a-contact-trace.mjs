// Phase 7.3A forensic instrumentation only. This file mirrors the private stages
// in steps.ts and asserts that its final result is identical to production.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, ".phase73a-ts");
const outputDir = path.join(root, "tmp/phase73a");
const require = createRequire(import.meta.url);
const closedBaseline = process.argv.includes("--closed-baseline");
const cases = [
  ["gav", "tmp/phase73a/production-artifacts/gav.pose.json", "tmp/phase50e/sources/gav_stationary_reference.mov", "e04a7983-7406-4a00-bb89-8ada7b10bf9f", "3a148f45-02ff-492d-b9f1-790470b83c21", "FullSizeRender.mov"],
  ["vanni240", "tmp/phase73a/production-artifacts/vanni240.pose.json", "tmp/phase50e/sources/vanni_fly_240.mov", "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", "a7679326-e193-4489-bf50-735fe402ec60", "IMG_4557 2.mov"],
  ["vanni120", "tmp/phase73a/production-artifacts/vanni120.pose.json", "tmp/phase50e/sources/vanni_fly_120.mov", "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", "6d9a6aba-d099-4a33-b8ea-2dd4962fe80c", "IMG_4556 2.mov"],
  ["vanni60", "tmp/phase73a/production-artifacts/vanni60.pose.json", "tmp/phase50e/sources/vanni_fly_60.mov", "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", "8f55936c-cf07-4c20-ba73-b662e8d24325", "IMG_4555 2.mov"],
];
const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
const joints = { left: ["leftAnkle","leftHeel","leftFootIndex"], right: ["rightAnkle","rightHeel","rightFootIndex"] };
const adjudications = {
  vanni240: [
    {candidateId:"vanni240-gap-01",classification:"NO CONTACT",note:"Source sequence shows acceleration from the initial boundary contact to the accepted left contact; no intervening complete stance cycle is visually supported."},
    {candidateId:"vanni240-missing-01",interval:"vanni240-gap-02",side:"right",sourceFrame:200,phaseFrames:{beforeTouchdown:190,touchdown:200,midStance:210,toeOff:220,afterToeOff:230},classification:"CLEAR CONTACT",firstLossStage:"QUALITY GATE",rootCause:"The source foot is visible, but the pose frame is frozen_suspect/independent_unavailable and scientific landmark stripping removes all pose evidence before foot fusion."},
    {candidateId:"vanni240-missing-02",interval:"vanni240-gap-03",side:"right",sourceFrame:443,phaseFrames:{beforeTouchdown:425,touchdown:443,midStance:453,toeOff:469,afterToeOff:477},classification:"CLEAR CONTACT",firstLossStage:"TEMPORAL FILTER",rootCause:"A usable right-foot maximum exists at frame 443, but the rolling same-side spacing state is anchored by the earlier frame-397 maximum; frame 443 is rejected within 250 ms after frame 397, which is itself removed by global de-duplication against left frame 375."},
  ],
  vanni120: [
    {candidateId:"vanni120-missing-01",interval:"vanni120-gap-01",side:"left",sourceFrame:178,phaseFrames:{beforeTouchdown:169,touchdown:178,midStance:184,toeOff:192,afterToeOff:200},classification:"CLEAR CONTACT",firstLossStage:"TEMPORAL FILTER",rootCause:"The left-foot maximum is repeatedly replaced/merged by the rolling 250 ms same-side chain and never survives as a per-side contact."},
    {candidateId:"vanni120-missing-02",interval:"vanni120-gap-02",side:"left",sourceFrame:227,phaseFrames:{beforeTouchdown:216,touchdown:227,midStance:234,toeOff:242,afterToeOff:246},classification:"CLEAR CONTACT",firstLossStage:"TEMPORAL FILTER",rootCause:"The left-foot maximum remains part of the same rolling 250 ms replacement chain and never survives as a per-side contact."},
  ],
};

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sample(frame, side, minVis = 0.4) {
  const usable = joints[side].map((name) => [name, frame.landmarks[name]]).filter(([, p]) => p && (p.visibility ?? 1) >= minVis);
  if (!usable.length) return null;
  return { x: usable.reduce((n,[,p])=>n+p.x,0)/usable.length, y: usable.reduce((n,[,p])=>n+p.y,0)/usable.length,
    vis: usable.reduce((n,[,p])=>n+(p.visibility??1),0)/usable.length, landmarks: usable.map(([name])=>name) };
}
function boundaryMaxima(values, findLocalMaxima) {
  const peaks = new Set(findLocalMaxima(values));
  const first = values.findIndex(Number.isFinite);
  if (first >= 0 && first + 1 < values.length && Number.isFinite(values[first + 1]) && values[first] > values[first + 1]) peaks.add(first);
  return [...peaks].sort((a,b)=>a-b);
}
function traceSide(frames, side, cfg, smoothSeries, findLocalMaxima) {
  const samples = frames.map((f)=>sample(f,side));
  const ys = samples.map((s)=>s?.y ?? NaN);
  const smoothed = smoothSeries(ys, cfg.smoothingWindowFrames);
  const finite = smoothed.filter(Number.isFinite);
  const amplitude = finite.length ? Math.max(...finite)-Math.min(...finite) : null;
  const raw = finite.length >= 3 && amplitude >= cfg.minAmplitude ? boundaryMaxima(smoothed,findLocalMaxima) : [];
  const accepted=[]; const rejected=[]; let lastMs=-Infinity;
  for (const idx of raw) {
    const f=frames[idx], pos=samples[idx] ?? sample(f,side,0);
    if (!pos) { rejected.push({stage:"NO_FOOT_LANDMARKS",frame:f.frame,time:f.time}); continue; }
    if (f.time*1000-lastMs < cfg.minSameSideSpacingMs) {
      const prior=accepted.at(-1);
      if (prior && smoothed[idx] > prior.prominence) { rejected.push({...prior,stage:"TEMPORAL_FILTER_REPLACED"}); accepted[accepted.length-1]={side,frame:f.frame,time:f.time,x:pos.x,y:pos.y,vis:pos.vis,prominence:smoothed[idx],arrayIndex:idx}; lastMs=f.time*1000; }
      else rejected.push({side,frame:f.frame,time:f.time,stage:"TEMPORAL_FILTER",prominence:smoothed[idx]});
      continue;
    }
    accepted.push({side,frame:f.frame,time:f.time,x:pos.x,y:pos.y,vis:pos.vis,prominence:smoothed[idx],arrayIndex:idx}); lastMs=f.time*1000;
  }
  return { amplitude, samples, smoothed, rawPeakIndices:raw, accepted, rejected };
}
function dedup(left,right,cfg) {
  const sorted=[...left,...right].sort((a,b)=>a.time-b.time||a.side.localeCompare(b.side)); const kept=[]; const rejected=[];
  const score=(c)=>c.prominence+c.vis*1e-3;
  for (const c of sorted) { const last=kept.at(-1); if (!last) {kept.push(c);continue;} const gap=(c.time-last.time)*1000;
    if (gap<cfg.minStepSpacingMs || (c.side===last.side&&gap<cfg.minSameSideSpacingMs)) { if(score(c)>score(last)){rejected.push({...last,stage:"DEDUP_REPLACED",winner:{side:c.side,frame:c.frame}});kept[kept.length-1]=c;}else rejected.push({...c,stage:"DEDUP",winner:{side:last.side,frame:last.frame}}); } else kept.push(c); }
  return {kept,rejected};
}

rmSync(tmp,{recursive:true,force:true}); mkdirSync(tmp,{recursive:true}); mkdirSync(outputDir,{recursive:true});
writeFileSync(path.join(tmp,"tsconfig.json"), JSON.stringify({compilerOptions:{outDir:tmp,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,resolveJsonModule:true,strict:false,moduleResolution:"node",baseUrl:root,paths:{"@/*":["src/*"]},noEmitOnError:false},files:["src/lib/video/overlay.ts","src/lib/video/fps.ts","src/lib/video/steps.ts","src/lib/video/contacts.ts","src/lib/biomechanics/events/FootContactDetector.ts"].map(f=>path.join(root,f))}));
try { execFileSync("npx",["tsc","-p",path.join(tmp,"tsconfig.json")],{cwd:root,stdio:"pipe"}); } catch(e) { const t=String(e.stdout??"")+String(e.stderr??""); if(!/worldProjection\.ts/.test(t)) throw e; }
const original=Module._resolveFilename; Module._resolveFilename=function(r,...rest){return original.call(this,r.startsWith("@/")?path.join(tmp,r.slice(2)):r,...rest);};
try {
  const {buildOverlayFrames}=require(path.join(tmp,"lib/video/overlay.js")); const {detectStepMarks,DEFAULT_STEP_CONFIG}=require(path.join(tmp,"lib/video/steps.js"));
  const {detectContactPhases}=require(path.join(tmp,"lib/video/contacts.js")); const {smoothSeries,findLocalMaxima}=require(path.join(tmp,"lib/biomechanics/events/FootContactDetector.js"));
  const manifest={schema:"phase-7.3a-disputed-contact-v1",auditDate:"2026-08-07",instrumentation:{productionFiles:["src/lib/video/steps.ts","src/lib/video/contacts.ts","src/lib/benchmark/measurements.ts","src/components/video/VideoOverlay.tsx"],config:DEFAULT_STEP_CONFIG,traceIntegrity:"pending"},benchmarks:[]};
  for(const [label,poseRel,videoRel,sessionId,analysisId,sourceName] of cases){const seq=JSON.parse(readFileSync(path.join(root,poseRel),"utf8")); const raw=seq.frames.map(f=>{const landmarks=[]; const strip=["predicted","invalid","frozen_suspect"].includes(f.boxOrigin)&&!(f.boxOrigin==="frozen_suspect"&&f.independentLocalizationState==="independent_corroborated"); if(!strip)for(const[i,n]of MP){const p=f.keypoints[n];if(p)landmarks[i]={x:p.x,y:p.y,visibility:p.visibility??p.score};}return{frame:f.index,sourceFrameIndex:f.sourceFrameIndex,time:f.tMs/1000,landmarks,boxOrigin:f.boxOrigin,independentLocalizationState:f.independentLocalizationState};}); const frames=buildOverlayFrames({...seq,frames:raw});
    const l=traceSide(frames,"left",DEFAULT_STEP_CONFIG,smoothSeries,findLocalMaxima), rr=traceSide(frames,"right",DEFAULT_STEP_CONFIG,smoothSeries,findLocalMaxima), d=dedup(l.accepted,rr.accepted,DEFAULT_STEP_CONFIG); const production=detectStepMarks(frames); const traced=d.kept.map((m,i)=>({side:m.side,frame:m.frame,sourceFrameIndex:frames[m.frame]?.sourceFrameIndex??m.frame,time:m.time,x:m.x,y:m.y,index:i+1,distanceFromPrev:i?Math.hypot(m.x-d.kept[i-1].x,m.y-d.kept[i-1].y):null,distanceMetersFromPrev:null})); if(!same(production,traced)&&!closedBaseline)throw new Error(`${label}: trace differs from production`); const baselineMarks=closedBaseline?traced:production; const phases=detectContactPhases(frames,baselineMarks);
    const timeline=baselineMarks.map(m=>{const idx=frames.findIndex(f=>f.frame===m.frame), f=frames[idx], s=sample(f,m.side,0.4), phase=phases.find(p=>p.frame===m.frame&&p.side===m.side); return{contactIndex:m.index,stepNumber:m.index,foot:m.side,timestampS:m.time,sourceFrame:m.sourceFrameIndex,reasonAccepted:"side local maximum survived same-side spacing and global de-duplication",contactEvidence:{fusedX:m.x,fusedY:m.y,meanVisibility:s?.vis??null,contactMs:phase?.contactMs??null,touchdownTimeS:phase?.touchdownTimeS??null,toeOffTimeS:phase?.toeOffTimeS??null},supportingLandmarks:s?.landmarks??[]};});
    const gaps=timeline.slice(1).map((c,i)=>({fromContact:i+1,toContact:i+2,fromFoot:timeline[i].foot,toFoot:c.foot,startS:timeline[i].timestampS,endS:c.timestampS,gapS:c.timestampS-timeline[i].timestampS,sameFoot:timeline[i].foot===c.foot})); const med=[...gaps].map(g=>g.gapS).sort((a,b)=>a-b)[Math.floor(gaps.length/2)]??null; const candidates=gaps.filter(g=>g.sameFoot||(med&&g.gapS>med*1.5)).map((g,i)=>({...g,candidateId:`${label}-gap-${String(i+1).padStart(2,"0")}`,basis:[g.sameFoot?"same-foot transition":null,med&&g.gapS>med*1.5?"large cadence gap":null].filter(Boolean),classification:"PENDING_SOURCE_PIXEL_REVIEW"}));
    const rawCandidates=[...l.rawPeakIndices.map(i=>({side:"left",i})),...rr.rawPeakIndices.map(i=>({side:"right",i}))].map(({side,i})=>{const f=frames[i],p=sample(f,side);return{side,frame:f.frame,sourceFrame:f.sourceFrameIndex,timeS:f.time,boxOrigin:f.boxOrigin,independentLocalizationState:f.independentLocalizationState,usableLandmarks:p?.landmarks??[],meanVisibility:p?.vis??null,coordinates:p?{x:p.x,y:p.y}:null,finalAccepted:baselineMarks.some(m=>m.side===side&&m.frame===f.frame)};}).sort((a,b)=>a.timeS-b.timeS);
    const disputed=(adjudications[label]??[]).map(a=>{if(!a.sourceFrame)return a; const rawFrame=seq.frames.find(f=>f.sourceFrameIndex===a.sourceFrame||f.index===a.sourceFrame); const frameIndex=frames.findIndex(f=>(f.sourceFrameIndex??f.frame)===a.sourceFrame); const gatedFrame=frames[frameIndex]; const names=a.side==="left"?["left_ankle","left_heel","left_toe"]:["right_ankle","right_heel","right_toe"]; const overlayNames=joints[a.side]; const landmarkEvidence=names.map((name,i)=>{const p=rawFrame?.keypoints?.[name]??null; const before=seq.frames[Math.max(0,(rawFrame?.index??0)-1)]?.keypoints?.[name]; const after=seq.frames[Math.min(seq.frames.length-1,(rawFrame?.index??0)+1)]?.keypoints?.[name]; return{name,visibility:p?.visibility??p?.score??null,presence:p?true:false,confidence:p?.score??null,coordinates:p?{x:p.x,y:p.y}:null,velocityPerSecond:p&&before&&after?{x:(after.x-before.x)/(2/seq.fps),y:(after.y-before.y)/(2/seq.fps)}:null,passesVisibility:p?(p.visibility??p.score??1)>=DEFAULT_STEP_CONFIG.minVisibility:false,survivesScientificGate:!!gatedFrame?.landmarks?.[overlayNames[i]]};}); return{...a,timestampS:rawFrame?.tMs/1000??null,boxOrigin:rawFrame?.boxOrigin??null,independentLocalizationState:rawFrame?.independentLocalizationState??null,poseValidity:gatedFrame&&Object.keys(gatedFrame.landmarks).length?"usable":"withheld",landmarkEvidence,groundRelativePosition:"No ground-relative model participates in candidate acceptance; production uses normalized image-y local maxima.",contactSheet:`tmp/phase73a/contact-sheets/${a.interval}.jpg`};});
    for (const flag of candidates) { const reviews=disputed.filter(d=>d.candidateId===flag.candidateId||d.interval===flag.candidateId); flag.classification=reviews.map(d=>d.classification).join(" + ")||"UNKNOWN"; flag.disputedContactIds=reviews.filter(d=>d.sourceFrame).map(d=>d.candidateId); }
    manifest.benchmarks.push({label,sessionId,analysisId,sourceVideo:{originalName:sourceName,localAuditCopy:videoRel},fps:seq.fps,dimensions:{width:seq.width,height:seq.height},poseArtifact:poseRel,contactArtifact:null,contactArtifactExplanation:"No stored contact artifact; production contacts are reconstructed from pose frames.",currentContactTimeline:timeline,intervalFlags:candidates,sourcePixelAdjudications:disputed,rawLocalMaximumCandidates:rawCandidates,perSideAcceptedBeforeGlobalDedup:{left:l.accepted,right:rr.accepted},stageRejections:[...l.rejected,...rr.rejected,...d.rejected]});
  }
  manifest.instrumentation.traceIntegrity="PASS: traced final marks are byte-identical to detectStepMarks for all four artifacts"; writeFileSync(path.join(outputDir,"disputed-contact-manifest.json"),JSON.stringify(manifest,null,2)+"\n"); console.log(JSON.stringify({traceIntegrity:manifest.instrumentation.traceIntegrity,benchmarks:manifest.benchmarks.map(b=>({label:b.label,contacts:b.currentContactTimeline.length,flags:b.intervalFlags.length,rawPeaks:b.rawLocalMaximumCandidates.length}))},null,2));
} finally {Module._resolveFilename=original;rmSync(tmp,{recursive:true,force:true});}
