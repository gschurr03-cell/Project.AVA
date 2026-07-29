"use client";

import {
  memo, useCallback, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { saveGateCalibration } from "@/app/sessions/actions";
import type { OverlayFrame } from "@/lib/video/overlay";
import { propagateSourcePoint } from "@/lib/calibration/zoneAnchors";
import type { RawCameraEvidence } from "@/lib/video/recordingMode";
import {
  type Viewport, fitViewport, clampTranslation, viewportToCanonical,
  zoomAtPoint, stepZoom, resizeViewport, MIN_SCALE, MAX_SCALE,
} from "@/lib/calibration/viewportTransform";
import {
  DEFAULT_TIMING_WORKSPACE,
  isTimingWorkspaceCalibrationComplete,
  timingWorkspaceSchema,
  type TimingWorkspaceState,
} from "@/lib/calibration/timingWorkspace";

type GateName = "start" | "finish";
type Point = { x: number; y: number };
type Line = { c1: Point; c2: Point };
type CameraFrame = { frame: number; confidence: number; residualPx: number; scale: number; rotationDeg: number };
type Action =
  | { type: "patch"; patch: Partial<TimingWorkspaceState> }
  | { type: "overlay"; key: keyof TimingWorkspaceState["overlays"]; value: boolean | number }
  | { type: "gate"; gate: GateName; line: Line | null }
  | { type: "gate_review"; gate: GateName; patch: { accepted?: boolean; locked?: boolean } }
  | { type: "gate_confirm"; gate: GateName; frame: number; line: Line }
  | { type: "keyframe_add"; gate: GateName; frame: number; line: Line }
  | { type: "keyframe_delete"; id: string }
  | { type: "manual"; key: keyof TimingWorkspaceState["manual"]; value: number | null };

function reducer(state: TimingWorkspaceState, action: Action): TimingWorkspaceState {
  if (action.type === "patch") return { ...state, ...action.patch };
  if (action.type === "overlay") return { ...state, overlays: { ...state.overlays, [action.key]: action.value } };
  if (action.type === "gate") return { ...state, gates: { ...state.gates, [action.gate]: action.line } };
  if (action.type === "gate_review") return {
    ...state,
    gateReview: {
      ...state.gateReview,
      [action.gate]: { ...state.gateReview[action.gate], ...action.patch },
    },
  };
  if (action.type === "gate_confirm") return {
    ...state,
    gateReview: { ...state.gateReview, [action.gate]: { ...state.gateReview[action.gate], accepted: true } },
    gateEvidence: { ...state.gateEvidence, [action.gate]: {
      ...state.gateEvidence[action.gate], source: "manual_physical_line",
      referenceType: action.gate==="start" ? "white_tape" : "painted_transverse_line",
      userConfirmed: true, frame: action.frame, manualAdjustment: action.line, finalLine: action.line,
    } },
  };
  if (action.type === "manual") return { ...state, manual: { ...state.manual, [action.key]: action.value } };
  if (action.type === "keyframe_delete") return { ...state, keyframes: state.keyframes.filter((item) => item.id !== action.id) };
  return {
    ...state,
    keyframes: [...state.keyframes, {
      id: `${action.gate}-${action.frame}-${Date.now()}`, gate: action.gate,
      frame: action.frame, line: action.line, confidenceOverride: null,
    }],
  };
}

const SKELETON = [
  ["leftShoulder","rightShoulder"],["leftShoulder","leftElbow"],["leftElbow","leftWrist"],
  ["rightShoulder","rightElbow"],["rightElbow","rightWrist"],["leftShoulder","leftHip"],
  ["rightShoulder","rightHip"],["leftHip","rightHip"],["leftHip","leftKnee"],
  ["leftKnee","leftAnkle"],["rightHip","rightKnee"],["rightKnee","rightAnkle"],
] as const;

const Toggle = memo(function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value:boolean)=>void }) {
  return <button type="button" onClick={()=>onChange(!checked)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${checked?"bg-white/12 text-white":"text-[#7e8797] hover:bg-white/5"}`}>{label}</button>;
});

function percent(value:number){ return `${Math.round(value*100)}%`; }
function lineStats(line:Line|null){ if(!line)return {length:0,angle:0}; return {
  length:Math.hypot(line.c2.x-line.c1.x,line.c2.y-line.c1.y),
  angle:Math.atan2(line.c2.y-line.c1.y,line.c2.x-line.c1.x)*180/Math.PI,
};}

export default function TimingWorkspace({
  sessionId, videoUrl, frames, initialWorkspace, initialGates, sourceFps, duration,
  cameraFrames, cameraMode, cameraEvidence, sourceWidth, sourceHeight, initialGateAnchorFrames,
  initialDistanceM, initialRevision,
}: {
  sessionId:string; videoUrl:string; frames:OverlayFrame[]; initialWorkspace:unknown;
  initialGates:{start:Line|null;finish:Line|null}; sourceFps:number; duration:number;
  cameraFrames:CameraFrame[]; cameraMode:string;
  cameraEvidence?:RawCameraEvidence; sourceWidth?:number|null; sourceHeight?:number|null;
  initialGateAnchorFrames?:{start:number;finish:number};
  initialDistanceM?:number|null; initialRevision:number;
}) {
  const parsed=timingWorkspaceSchema.safeParse(initialWorkspace);
  const seed=parsed.success?parsed.data:{
    ...DEFAULT_TIMING_WORKSPACE,
    distanceM:initialDistanceM ?? DEFAULT_TIMING_WORKSPACE.distanceM,
    gates:initialGates,
  };
  const [state,dispatch]=useReducer(reducer,seed);
  const [currentTime,setCurrentTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
  const [loop,setLoop]=useState(false),[drag,setDrag]=useState<{gate:GateName;end:"c1"|"c2"}|null>(null);
  const videoRef=useRef<HTMLVideoElement>(null),stageRef=useRef<HTMLDivElement>(null);
  // A pointerdown on an endpoint handle is followed by a synthetic click that bubbles to
  // the stage. Without this guard that click runs addDraftGate and overwrites the gate the
  // user just moved with a fresh horizontal line — the "gates reset to horizontal" bug.
  const suppressStageClick=useRef(false);
  // Purely-visual zoom/pan of the video stage. `view` is LOCAL UI state only — it never
  // touches canonical gate coordinates, calibration revision, or analysis. scale 1 = fit.
  const [view,setView]=useState<Viewport>(()=>fitViewport(1,1));
  const viewRef=useRef(view); viewRef.current=view;
  const panRef=useRef<{sx:number;sy:number;tx0:number;ty0:number}|null>(null);
  // Keep the stage size in the viewport model so conversions/clamps are always current.
  useEffect(()=>{const el=stageRef.current;if(!el||typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(()=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)setView(v=>resizeViewport(v,r.width,r.height));});
    ro.observe(el);return()=>ro.disconnect();},[]);
  // Mouse-wheel / trackpad-pinch zoom, anchored on the pointer. Non-passive so we can
  // stop the page from scrolling while zooming the stage.
  useEffect(()=>{const el=stageRef.current;if(!el)return;
    const onWheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();
      setView(v=>zoomAtPoint({...v,width:r.width,height:r.height},v.scale*Math.exp(-e.deltaY*0.0015),e.clientX-r.left,e.clientY-r.top));};
    el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[]);
  const zoomButton=useCallback((dir:1|-1)=>{const el=stageRef.current;if(!el)return;const r=el.getBoundingClientRect();
    setView(v=>zoomAtPoint({...v,width:r.width,height:r.height},stepZoom(v.scale,dir),r.width/2,r.height/2));},[]);
  const fitView=useCallback(()=>{const el=stageRef.current;const r=el?.getBoundingClientRect();setView(fitViewport(r?.width??1,r?.height??1));},[]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.matches("input,textarea,select"))return;
    if(e.key==="+"||e.key==="="){e.preventDefault();zoomButton(1);}
    else if(e.key==="-"||e.key==="_"){e.preventDefault();zoomButton(-1);}
    else if(e.key==="0"){e.preventDefault();fitView();}};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[zoomButton,fitView]);
  const frameIndex=useMemo(() => {
    if (!frames.length) return 0;
    let low=0,high=frames.length-1;
    while(low<high){const mid=Math.floor((low+high)/2);if(frames[mid].time<currentTime)low=mid+1;else high=mid;}
    if(low>0&&Math.abs(frames[low-1].time-currentTime)<Math.abs(frames[low].time-currentTime))return low-1;
    return low;
  }, [currentTime, frames]);
  const frame=frames[frameIndex]??null;
  const camera=cameraFrames.find(item=>item.frame===(frame?.sourceFrameIndex??frameIndex));
  const poseConfidence=frame?.trackingConfidence??0;
  const gate=state.gates[state.selectedGate],stats=lineStats(gate);
  const selectedReview=state.gateReview[state.selectedGate];
  // World-lock authority: each stored gate line is canonical at its anchor SOURCE
  // frame. Display reprojects anchor→current so a gate stays painted on the track as
  // the camera pans; edits are back-projected current→anchor so canonical geometry is
  // never mutated by viewport/pan. Identity when no camera evidence (static camera).
  const anchorRef=useRef<{start:number;finish:number}>({start:initialGateAnchorFrames?.start??0,finish:initialGateAnchorFrames?.finish??0});
  const currentSourceFrame=frame?.sourceFrameIndex??frameIndex;
  const canProject=Boolean(cameraEvidence&&sourceWidth&&sourceHeight);
  const reprojectGate=useCallback((line:Line|null,name:GateName):Line|null=>{
    if(!line)return null;
    if(!canProject)return line;
    const a=propagateSourcePoint(line.c1,anchorRef.current[name],currentSourceFrame,cameraEvidence!,sourceWidth!,sourceHeight!).point;
    const b=propagateSourcePoint(line.c2,anchorRef.current[name],currentSourceFrame,cameraEvidence!,sourceWidth!,sourceHeight!).point;
    return {c1:a,c2:b};
  },[canProject,cameraEvidence,sourceWidth,sourceHeight,currentSourceFrame]);
  const pointerToCanonical=useCallback((point:Point,name:GateName):Point=>{
    if(!canProject)return point;
    return propagateSourcePoint(point,currentSourceFrame,anchorRef.current[name],cameraEvidence!,sourceWidth!,sourceHeight!).point;
  },[canProject,cameraEvidence,sourceWidth,sourceHeight,currentSourceFrame]);
  const gatesReady=isTimingWorkspaceCalibrationComplete(state);
  const readiness=[
    ["Gate A placed",Boolean(state.gates.start)],["Gate B placed",Boolean(state.gates.finish)],
    ["Valid distance entered",Boolean(state.distanceM&&state.distanceM>0)],["Pose complete",frames.length>0],
    ["Tracking evidence",Boolean(camera&&camera.confidence>=.45)],
  ] as const;

  const seek=useCallback((time:number)=>{const v=videoRef.current;if(!v)return;v.currentTime=Math.max(0,Math.min(duration,time));setCurrentTime(v.currentTime);},[duration]);
  const step=useCallback((delta:number)=>seek(currentTime+delta/sourceFps),[currentTime,seek,sourceFps]);
  const togglePlay=useCallback(()=>{const v=videoRef.current;if(!v)return;if(v.paused)v.play();else v.pause();},[]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.matches("input,textarea,select"))return;
    if(e.key===" "){e.preventDefault();togglePlay();} if(e.key==="ArrowLeft")step(-1); if(e.key==="ArrowRight")step(1);
    if(e.shiftKey&&e.key==="ArrowRight"){const next=Math.min(2,speed+.25);setSpeed(next);if(videoRef.current)videoRef.current.playbackRate=next;}
  };window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[speed,step,togglePlay]);

  const dragMove=(event:ReactPointerEvent)=>{if(!drag||!stageRef.current)return;const r=stageRef.current.getBoundingClientRect();
    // Viewport pointer → canonical normalized [0,1], removing the zoom/pan transform, so a
    // gate dragged at any zoom resolves to the correct canonical coordinate (never screen-space).
    const vc=viewportToCanonical(event.clientX-r.left,event.clientY-r.top,{...viewRef.current,width:r.width,height:r.height});
    const point={x:Math.max(0,Math.min(1,vc.x)),y:Math.max(0,Math.min(1,vc.y))};
    // Store the moved endpoint in canonical (anchor-frame) space; the other endpoint
    // is already canonical, so the whole line stays anchored to one frame.
    const canonical=pointerToCanonical(point,drag.gate);
    const existing=state.gates[drag.gate];if(existing)dispatch({type:"gate",gate:drag.gate,line:{...existing,[drag.end]:canonical}});
  };
  const addDraftGate=(event:ReactMouseEvent)=>{if(suppressStageClick.current){suppressStageClick.current=false;return;}
    if(drag||!stageRef.current||state.setupMode==="manual_crossing")return;
    const r=stageRef.current.getBoundingClientRect();
    const {x,y}=viewportToCanonical(event.clientX-r.left,event.clientY-r.top,{...viewRef.current,width:r.width,height:r.height});
    // A freshly placed gate is canonical at the frame it is drawn on.
    anchorRef.current[state.selectedGate]=currentSourceFrame;
    const length=.16;dispatch({type:"gate",gate:state.selectedGate,line:{c1:{x:Math.max(0,x-length/2),y},c2:{x:Math.min(1,x+length/2),y}}});
    dispatch({type:"gate_review",gate:state.selectedGate,patch:{accepted:false,locked:false}});
  };
  const transformGate=(kind:"rotate_left"|"rotate_right"|"extend"|"shrink"|"left"|"right"|"up"|"down")=>{
    if(!gate||selectedReview.locked)return;
    const center={x:(gate.c1.x+gate.c2.x)/2,y:(gate.c1.y+gate.c2.y)/2};
    let dx=gate.c2.x-gate.c1.x,dy=gate.c2.y-gate.c1.y;
    if(kind==="rotate_left"||kind==="rotate_right"){const angle=(kind==="rotate_left"?-2:2)*Math.PI/180;[dx,dy]=[dx*Math.cos(angle)-dy*Math.sin(angle),dx*Math.sin(angle)+dy*Math.cos(angle)];}
    if(kind==="extend"||kind==="shrink"){const scale=kind==="extend"?1.08:.92;dx*=scale;dy*=scale;}
    const shift={
      x: kind==="left" ? -.01 : kind==="right" ? .01 : 0,
      y: kind==="up" ? -.01 : kind==="down" ? .01 : 0,
    };
    const clamp=(n:number)=>Math.max(0,Math.min(1,n));
    dispatch({type:"gate",gate:state.selectedGate,line:{c1:{x:clamp(center.x-dx/2+shift.x),y:clamp(center.y-dy/2+shift.y)},c2:{x:clamp(center.x+dx/2+shift.x),y:clamp(center.y+dy/2+shift.y)}}});
  };

  const confidenceBars=useMemo(()=>frames.filter((_,i)=>i%Math.max(1,Math.floor(frames.length/180))===0).map((item,i)=>(
    <i key={i} title={`Pose ${percent(item.trackingConfidence??0)}`} style={{background:(item.trackingConfidence??0)>.75?"#89d46a":(item.trackingConfidence??0)>.45?"#f5c451":"#e46464"}} className="h-full min-w-[2px] flex-1 opacity-75"/>
  )),[frames]);

  // ── Zone Type (MVP): the single calibration concept the coach picks. Timing Goal +
  //    Setup Mode are removed from the UI; `goal`/`setupMode` are kept internally and
  //    always resolve to the manual marked-zone workflow. Legacy `goal` maps in.
  const zoneType: "acceleration" | "timed_zone" | "split_timing" =
    state.zoneType ?? (state.goal === "split" ? "split_timing" : "timed_zone");
  const setZoneType = (z: "acceleration" | "timed_zone" | "split_timing") =>
    dispatch({ type: "patch", patch: { zoneType: z, goal: z === "split_timing" ? "split" : z === "acceleration" ? "custom" : "fly", setupMode: "marked_zone" } });
  const ZONE_TYPES: { id: "acceleration" | "timed_zone" | "split_timing"; label: string; help: string }[] = [
    { id: "acceleration", label: "Acceleration", help: "Measure from the athlete’s start through a defined distance." },
    { id: "timed_zone", label: "Timed Zone", help: "Measure performance between a start gate and finish gate." },
    { id: "split_timing", label: "Split Timing", help: "Measure intermediate times within a larger timed zone." },
  ];
  // Which gates this zone type needs (drives labels + status).
  const requiredGates: GateName[] = ["start", "finish"];
  const calibrationStatus = (() => {
    const placed = requiredGates.filter((g) => state.gates[g]).length;
    const locked = requiredGates.every((g) => state.gateReview[g].accepted && state.gateReview[g].locked);
    if (gatesReady && locked) return { label: "Confirmed & locked", tone: "#89d46a" };
    if (gatesReady) return { label: "Ready to save", tone: "#89d46a" };
    if (placed === 0) return { label: "Not started", tone: "#7e8797" };
    if (placed < requiredGates.length || !state.distanceM) return { label: "In progress", tone: "#f5c451" };
    return { label: "Needs review", tone: "#f5c451" };
  })();
  const technicalReady=Boolean(sourceWidth&&sourceHeight&&sourceFps>0);
  const submissionReady=gatesReady&&technicalReady;
  const startGate=state.gates.start;
  const finishGate=state.gates.finish;
  const compensateToReference=(line:Line,name:GateName):Line=>{
    if(!canProject)return line;
    return {
      c1:propagateSourcePoint(line.c1,anchorRef.current[name],0,cameraEvidence!,sourceWidth!,sourceHeight!).point,
      c2:propagateSourcePoint(line.c2,anchorRef.current[name],0,cameraEvidence!,sourceWidth!,sourceHeight!).point,
    };
  };
  const compensatedStart=startGate?compensateToReference(startGate,"start"):null;
  const compensatedFinish=finishGate?compensateToReference(finishGate,"finish"):null;
  const workspaceForSave:TimingWorkspaceState=gatesReady?{
    ...state,
    gateReview:{
      start:{accepted:true,locked:true},
      finish:{accepted:true,locked:true},
    },
    gateEvidence:{
      start:{
        ...state.gateEvidence.start,source:"manual_physical_line",userConfirmed:true,
        frame:anchorRef.current.start,manualAdjustment:startGate,finalLine:startGate,
      },
      finish:{
        ...state.gateEvidence.finish,source:"manual_physical_line",userConfirmed:true,
        frame:anchorRef.current.finish,manualAdjustment:finishGate,finalLine:finishGate,
      },
    },
  }:state;

  return <div className="flex h-screen min-h-[760px] flex-col overflow-hidden bg-[#081019] text-[#f5f7fb]">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[.07] bg-[#081019] px-5">
      <div className="flex items-center gap-3"><a href={`/sessions/${sessionId}`} className="text-[#7e8797] hover:text-white">←</a><div><b className="text-sm">AVA Timing</b><span className="ml-3 text-[10px] uppercase tracking-[.2em] text-[#7e8797]">Calibration Workspace</span></div></div>
      <div className="flex items-center gap-3"><span className="rounded-full bg-[#182233] px-3 py-1 text-[11px] text-[#7e8797]">{cameraMode}</span>
        <form action={saveGateCalibration}>
          <input type="hidden" name="id" value={sessionId}/>
          <input type="hidden" name="workspace" value={JSON.stringify(workspaceForSave)}/>
          <input type="hidden" name="expected_revision" value={initialRevision}/>
          <input type="hidden" name="calibration_known_distance_m" value={state.distanceM??""}/>
          <input type="hidden" name="gate_start_frame" value={anchorRef.current.start}/>
          <input type="hidden" name="gate_finish_frame" value={anchorRef.current.finish}/>
          <input type="hidden" name="gate_start_time_s" value={anchorRef.current.start/sourceFps}/>
          <input type="hidden" name="gate_finish_time_s" value={anchorRef.current.finish/sourceFps}/>
          <input type="hidden" name="gate_source_width" value={sourceWidth??""}/>
          <input type="hidden" name="gate_source_height" value={sourceHeight??""}/>
          <input type="hidden" name="gate_start_c1x" value={startGate?.c1.x??""}/>
          <input type="hidden" name="gate_start_c1y" value={startGate?.c1.y??""}/>
          <input type="hidden" name="gate_start_c2x" value={startGate?.c2.x??""}/>
          <input type="hidden" name="gate_start_c2y" value={startGate?.c2.y??""}/>
          <input type="hidden" name="gate_finish_c1x" value={finishGate?.c1.x??""}/>
          <input type="hidden" name="gate_finish_c1y" value={finishGate?.c1.y??""}/>
          <input type="hidden" name="gate_finish_c2x" value={finishGate?.c2.x??""}/>
          <input type="hidden" name="gate_finish_c2y" value={finishGate?.c2.y??""}/>
          {[compensatedStart?.c1,compensatedStart?.c2,compensatedFinish?.c1,compensatedFinish?.c2].map((point,index)=><span key={index}>
            <input type="hidden" name={`gate_comp_${index}_x`} value={point?.x??""}/>
            <input type="hidden" name={`gate_comp_${index}_y`} value={point?.y??""}/>
          </span>)}
          <SaveCalibrationButton disabled={!submissionReady}/>
        </form>
      </div>
    </header>

    <div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(480px,1fr)_270px]">
      <aside className="overflow-y-auto border-r border-white/[.07] bg-[#081019] p-4">
        <section className="first:mt-0"><Label>Zone type</Label><div className="mt-2 space-y-1">
          {ZONE_TYPES.map(({id,label,help})=><button key={id} onClick={()=>setZoneType(id)} className={`flex w-full flex-col rounded px-2 py-2 text-left ${zoneType===id?"bg-white/10":"hover:bg-white/5"}`}>
            <span className={`flex items-center gap-2 text-xs font-semibold ${zoneType===id?"text-white":"text-[#b3bccb]"}`}><i className={`h-2 w-2 rounded-full ${zoneType===id?"bg-[#2f80ed]":"border border-[#555]"}`}/>{label}</span>
            <span className="mt-0.5 pl-4 text-[10px] leading-4 text-[#7e8797]">{help}</span>
          </button>)}
        </div></section>
        <section className="mt-6"><Label>Distance</Label><div className="mt-2 grid grid-cols-4 gap-1">{[10,20,30].map(n=><button key={n} onClick={()=>dispatch({type:"patch",patch:{distanceM:n}})} className={chip(state.distanceM===n)}>{n} m</button>)}<button onClick={()=>{if([10,20,30].includes(state.distanceM??0))dispatch({type:"patch",patch:{distanceM:null}});}} className={chip(state.distanceM==null||![10,20,30].includes(state.distanceM))}>Custom</button></div>
          {(state.distanceM==null||![10,20,30].includes(state.distanceM))&&<label className="mt-2 flex items-center gap-2 text-[10px] text-[#7e8797]">Distance<input aria-label="Custom distance" type="number" min="1" max="300" step="0.1" value={state.distanceM??""} onChange={e=>{const v=Number(e.target.value);dispatch({type:"patch",patch:{distanceM:Number.isFinite(v)&&v>0?v:null}});}} className="w-20 rounded bg-[#182233] px-2 py-1 text-xs text-white outline-none"/>m</label>}
        </section>
        <section className="mt-6"><Label>Body reference</Label><div className="mt-2"><button className={chip(true)}>Torso</button></div><p className="mt-1 text-[10px] text-[#7e8797]">Torso is the validated timing-crossing reference.</p></section>
        <section className="mt-6"><Label>Calibration status</Label><div className="mt-2 flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{background:calibrationStatus.tone}}/><span className="text-sm font-semibold text-[#f5f7fb]">{calibrationStatus.label}</span></div>
          <ol className="mt-3 space-y-1 text-[10px] leading-4 text-[#7e8797]"><li>1. Select the zone type</li><li>2. Set the distance</li><li>3. Place Gate A and Gate B</li><li>4. Save gates and run analysis</li></ol>
          {!gatesReady&&<p className="mt-2 text-[10px] text-[#f5c451]">{!state.gates.start?"Place Gate A. ":!state.gates.finish?"Place Gate B. ":""}{!state.distanceM?"Enter a valid known distance.":""}</p>}
          {gatesReady&&!technicalReady&&<p className="mt-2 text-[10px] text-red-300">Source video dimensions are unavailable; calibration cannot be saved safely.</p>}
        </section>
        <section className="mt-6"><Label>Overlay</Label><div className="flex flex-wrap gap-1">{Object.entries(state.overlays).filter(([k])=>k!=="opacity").map(([key,value])=><Toggle key={key} label={key.replace(/([A-Z])/g," $1")} checked={Boolean(value)} onChange={v=>dispatch({type:"overlay",key:key as keyof TimingWorkspaceState["overlays"],value:v})}/>)}</div>
          <label className="mt-3 block text-[10px] text-[#7e8797]">Opacity <input className="mt-1 w-full accent-[#2f80ed]" type="range" min="0" max="1" step=".05" value={state.overlays.opacity} onChange={e=>dispatch({type:"overlay",key:"opacity",value:Number(e.target.value)})}/></label>
        </section>
      </aside>

      <main className="flex min-w-0 flex-col bg-[#081019]">
        <div className="flex items-center gap-2 border-b border-white/[.06] px-4 py-2">
          <button onClick={()=>step(-1)} className="rounded bg-[#182233] px-3 py-1.5 text-xs text-[#b3bccb] hover:bg-white/10">◀</button><button onClick={togglePlay} className="rounded bg-[#2f80ed] px-4 py-1.5 text-xs font-semibold">{playing?"Pause":"Play"}</button><button onClick={()=>step(1)} className="rounded bg-[#182233] px-3 py-1.5 text-xs text-[#b3bccb] hover:bg-white/10">▶</button>
          <button onClick={()=>setLoop(!loop)} className={chip(loop)}>Loop</button>
          <button disabled={!state.gates.start} onClick={()=>{dispatch({type:"patch",patch:{selectedGate:"start"}});const k=state.keyframes.find(item=>item.gate==="start");if(k)seek(k.frame/sourceFps);}} className={chip(false)}>Jump Start</button>
          <button disabled={!state.gates.finish} onClick={()=>{dispatch({type:"patch",patch:{selectedGate:"finish"}});const k=state.keyframes.find(item=>item.gate==="finish");if(k)seek(k.frame/sourceFps);}} className={chip(false)}>Jump Finish</button>
          {[.25,.5,1,2].map(n=><button key={n} onClick={()=>{setSpeed(n);if(videoRef.current)videoRef.current.playbackRate=n;}} className={chip(speed===n)}>{n}×</button>)}
          <span className="ml-auto font-mono text-xs text-[#7e8797]">F {frameIndex} · {currentTime.toFixed(3)}s</span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-5">
          <div ref={stageRef} onClick={addDraftGate}
            onPointerDown={e=>{if(viewRef.current.scale<=MIN_SCALE)return;panRef.current={sx:e.clientX,sy:e.clientY,tx0:viewRef.current.tx,ty0:viewRef.current.ty};suppressStageClick.current=true;e.currentTarget.setPointerCapture?.(e.pointerId);}}
            onPointerMove={e=>{if(panRef.current){const r=stageRef.current!.getBoundingClientRect();const pan=panRef.current;setView(v=>clampTranslation({...v,width:r.width,height:r.height,tx:pan.tx0+(e.clientX-pan.sx),ty:pan.ty0+(e.clientY-pan.sy)}));return;}dragMove(e);}}
            onPointerUp={()=>{panRef.current=null;setDrag(null);setTimeout(()=>{suppressStageClick.current=false;},0);}}
            className={`relative aspect-video w-full max-w-[1100px] select-none overflow-hidden rounded-md bg-black shadow-[0_30px_90px_rgba(0,0,0,.65)] ${view.scale>MIN_SCALE?"cursor-grab active:cursor-grabbing":""}`}>
            {/* One shared transformed wrapper — video + all overlays + handles move together. */}
            <div style={{transform:`translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,transformOrigin:"0 0"}} className="absolute inset-0">
              <video ref={videoRef} src={videoUrl} draggable={false} className="h-full w-full object-contain" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)} onEnded={()=>{if(loop)seek(0)}}/>
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 562" style={{opacity:state.overlays.opacity}}>
                {state.overlays.skeleton&&frame&&SKELETON.map(([a,b])=>{const p=frame.landmarks[a],q=frame.landmarks[b];return p&&q?<line key={`${a}-${b}`} x1={p.x*1000} y1={p.y*562} x2={q.x*1000} y2={q.y*562} stroke="#E7E9ED" strokeWidth="2" vectorEffect="non-scaling-stroke"/>:null;})}
                {state.overlays.pose&&frame&&Object.entries(frame.landmarks).map(([name,p])=><circle key={name} cx={p.x*1000} cy={p.y*562} r={3/view.scale} fill="#2f80ed"/>)}
                {state.overlays.gates&&(["start","finish"] as GateName[]).map(name=>{const l=reprojectGate(state.gates[name],name);if(!l)return null;const color=name===state.selectedGate?"#89d46a":"#f5c451";return <g key={name}><line x1={l.c1.x*1000} y1={l.c1.y*562} x2={l.c2.x*1000} y2={l.c2.y*562} stroke={color} strokeWidth="4" vectorEffect="non-scaling-stroke"/>{state.overlays.plane&&<line x1={(l.c1.x-(l.c2.x-l.c1.x)*8)*1000} y1={(l.c1.y-(l.c2.y-l.c1.y)*8)*562} x2={(l.c2.x+(l.c2.x-l.c1.x)*8)*1000} y2={(l.c2.y+(l.c2.y-l.c1.y)*8)*562} stroke={color} strokeDasharray="8 8" opacity=".45" vectorEffect="non-scaling-stroke"/>}</g>;})}
                {(()=>{const dg=state.overlays.searchWindow?reprojectGate(gate,state.selectedGate):null;return dg?<rect x={(Math.min(dg.c1.x,dg.c2.x)-.05)*1000} y={(Math.min(dg.c1.y,dg.c2.y)-.07)*562} width={(Math.abs(dg.c2.x-dg.c1.x)+.1)*1000} height={(Math.abs(dg.c2.y-dg.c1.y)+.14)*562} fill="none" stroke="#60A5FA" strokeDasharray="6 5" vectorEffect="non-scaling-stroke"/>:null;})()}
              </svg>
              {state.overlays.gates&&(["start","finish"] as GateName[]).flatMap(name=>{const l=reprojectGate(state.gates[name],name);return l?(["c1","c2"] as const).map(end=><button aria-label={`${name} ${end}`} key={`${name}-${end}`} onPointerDown={e=>{e.stopPropagation();suppressStageClick.current=true;if(!state.gateReview[name].locked)setDrag({gate:name,end});}} style={{left:`${l[end].x*100}%`,top:`${l[end].y*100}%`,transform:`translate(-50%,-50%) scale(${1/view.scale})`}} className={`absolute h-4 w-4 rounded-full border-2 border-white shadow ${state.gateReview[name].locked?"cursor-not-allowed bg-[#89d46a]":"cursor-move bg-[#2f80ed]"}`}/>):[]})}
            </div>
            {/* Zoom controls (fixed in the viewport, not transformed). Stop propagation so
                interacting with them never starts a viewport pan or places a gate. */}
            <div onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-white/10 bg-black/70 p-1 text-white backdrop-blur">
              <button aria-label="Zoom out" disabled={view.scale<=MIN_SCALE} onClick={()=>zoomButton(-1)} className="grid h-6 w-6 place-items-center rounded outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-[#2f80ed]/60 disabled:opacity-30">−</button>
              <span className="min-w-[46px] text-center font-mono text-[11px]" aria-live="polite">{Math.round(view.scale*100)}%</span>
              <button aria-label="Zoom in" disabled={view.scale>=MAX_SCALE} onClick={()=>zoomButton(1)} className="grid h-6 w-6 place-items-center rounded outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-[#2f80ed]/60 disabled:opacity-30">+</button>
              <button aria-label="Fit video to view" onClick={fitView} className="ml-1 rounded px-2 py-0.5 text-[11px] font-semibold outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-[#2f80ed]/60">Fit</button>
            </div>
            <div className="pointer-events-none absolute bottom-2 right-3 rounded bg-black/55 px-2 py-0.5 text-[9px] text-white/70">Scroll to zoom · drag empty space to pan</div>
            {state.overlays.confidence&&<div className="absolute left-3 top-3 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-white">POSE {percent(poseConfidence)} · CAMERA {percent(camera?.confidence??0)}</div>}
          </div>
        </div>
      </main>

      <aside className="overflow-y-auto border-l border-white/[.07] bg-[#081019] p-4">
        <Label>Inspector</Label><div className="mt-3 grid grid-cols-2 gap-2">{(["start","finish"] as GateName[]).map(name=><button key={name} onClick={()=>dispatch({type:"patch",patch:{selectedGate:name}})} className={chip(state.selectedGate===name)}>{name} gate</button>)}</div>
        <InspectorRow label="Tracking status" value={gate?(camera?.confidence??0)>.65?"Locked":"Limited":"Unsupported"} tone={gate?"green":"red"}/>
        <InspectorRow label="Source" value="Manual"/>
        <InspectorRow label="Status" value={selectedReview.accepted?"Confirmed":gate?"Awaiting confirmation":"Not placed"} tone={selectedReview.accepted?"green":undefined}/>
        <InspectorRow label="Reference" value="User placed"/>
        <InspectorRow label="Line length" value={`${(stats.length*100).toFixed(1)}%`}/><InspectorRow label="Plane angle" value={`${stats.angle.toFixed(1)}°`}/><InspectorRow label="World-lock" value={canProject?"Camera-tracked":"Static camera"}/>
        <div className="mt-4 grid grid-cols-3 gap-1"><button disabled={!gate} onClick={()=>gate&&dispatch({type:"gate_confirm",gate:state.selectedGate,frame:frame?.sourceFrameIndex??frameIndex,line:gate})} className={chip(Boolean(gate&&selectedReview.accepted))}>Confirm manual</button><button disabled={!gate} onClick={()=>dispatch({type:"gate_review",gate:state.selectedGate,patch:{accepted:false,locked:false}})} className={chip(false)}>Reject</button><button disabled={!gate} onClick={()=>dispatch({type:"gate_review",gate:state.selectedGate,patch:{locked:!selectedReview.locked}})} className={chip(selectedReview.locked)}>{selectedReview.locked?"Unlock":"Lock"}</button></div>
        <div className="mt-2 grid grid-cols-4 gap-1">{([["↺","rotate_left"],["↻","rotate_right"],["Extend","extend"],["Shrink","shrink"],["←","left"],["→","right"],["↑","up"],["↓","down"]] as const).map(([label,kind])=><button key={kind} disabled={!gate||selectedReview.locked} onClick={()=>transformGate(kind)} className={chip(false)}>{label}</button>)}</div>
        <div className="mt-2 flex gap-2"><button disabled={!gate} onClick={()=>gate&&dispatch({type:"keyframe_add",gate:state.selectedGate,frame:frameIndex,line:gate})} className="flex-1 rounded bg-white/10 px-3 py-2 text-xs disabled:opacity-30">Add keyframe</button><button disabled={!gate} onClick={()=>{if(!gate)return;const other=state.selectedGate==="start"?"finish":"start";anchorRef.current[other]=anchorRef.current[state.selectedGate];dispatch({type:"gate",gate:other,line:gate});dispatch({type:"patch",patch:{selectedGate:other}});}} className="rounded bg-white/10 px-3 text-xs disabled:opacity-30">Duplicate</button><button disabled={!gate} onClick={()=>{dispatch({type:"gate",gate:state.selectedGate,line:null});dispatch({type:"gate_review",gate:state.selectedGate,patch:{accepted:false,locked:false}});}} className="rounded border border-red-400/20 px-3 text-xs text-red-300 disabled:opacity-30">Delete</button></div>
        <div className="mt-5"><Label>Keyframes</Label>{state.keyframes.filter(k=>k.gate===state.selectedGate).map(k=><div key={k.id} className="mt-2 flex items-center rounded bg-[#182233] px-2 py-2 text-xs"><button onClick={()=>seek(k.frame/sourceFps)} className="flex-1 text-left">Frame {k.frame}</button><button onClick={()=>dispatch({type:"keyframe_delete",id:k.id})} className="text-[#777] hover:text-red-300">×</button></div>)}</div>
        {state.setupMode==="manual_crossing"&&<div className="mt-6"><Label>Crossing review</Label><ManualCrossingEditor state={state} frames={frames.length} dispatch={dispatch}/><div className="mt-2 grid grid-cols-3 gap-1"><button onClick={()=>seek((state.manual.startBefore??0)/sourceFps)} className={chip(false)}>Previous</button><button onClick={()=>seek(((state.manual.startBefore??0)+state.manual.startInterpolation)/sourceFps)} className={chip(true)}>Current</button><button onClick={()=>seek((state.manual.startAfter??state.manual.startBefore??0)/sourceFps)} className={chip(false)}>Next</button></div><InspectorRow label="Body reference" value={state.bodyReference}/><InspectorRow label="Timing plane" value={state.overlays.plane?"Visible":"Hidden"}/></div>}
        <div className="mt-6"><Label>Camera diagnostics</Label><InspectorRow label="Pan" value={`${Math.min(100,Math.abs(camera?.rotationDeg??0)*10+35).toFixed(0)}%`}/><InspectorRow label="Zoom" value={`${(Math.abs(1-(camera?.scale??1))*100).toFixed(1)}%`}/><InspectorRow label="Shake" value={`${Math.min(100,(camera?.residualPx??0)*10).toFixed(0)}%`}/><InspectorRow label="Camera confidence" value={percent(camera?.confidence??0)}/></div>
        <div className={`mt-6 rounded-xl border p-4 ${gatesReady?"border-emerald-400/30 bg-emerald-400/5":"border-amber-400/20 bg-amber-400/5"}`}><p className="text-sm font-semibold">{gatesReady?"Ready to lock and analyze":"Needs attention"}</p>{readiness.map(([label,ok])=><p key={label} className={`mt-2 text-xs ${ok?"text-emerald-300":"text-[#7e8797]"}`}>{ok?"✓":"○"} {label}</p>)}<InspectorRow label="Distance confidence" value={state.distanceM?"Defined":"Missing"}/><InspectorRow label="Expected uncertainty" value={(camera?.confidence??0)>.75?"Lower":(camera?.confidence??0)>.45?"Elevated":"Unknown"}/><InspectorRow label="Unsupported metrics" value={cameraFrames.length?"See result trust":"Camera-derived"}/><p className="mt-3 text-[10px] text-[#7e8797]">Saving locks this calibration before AVA queues the analysis.</p></div>
      </aside>
    </div>

    <section className="h-52 shrink-0 border-t border-white/[.07] bg-[#081019] px-5 py-3">
      <div className="flex items-center gap-3"><Label>Timeline</Label><span className="font-mono text-[10px] text-[#7e8797]">{Math.round(duration*sourceFps)} frames</span><input aria-label="Timeline zoom" className="ml-auto w-28 accent-[#2f80ed]" type="range" min="1" max="8" step=".5" value={state.timelineZoom} onChange={e=>dispatch({type:"patch",patch:{timelineZoom:Number(e.target.value)}})}/></div>
      <div className="mt-2 space-y-1 overflow-x-auto" style={{scrollbarWidth:"thin"}}><div style={{width:`${state.timelineZoom*100}%`}} className="space-y-1">
        <TimelineTrack label="Pose confidence"><div className="flex h-full">{confidenceBars}</div></TimelineTrack>
        <TimelineTrack label="Tracking conf."><div className="flex h-full">{confidenceBars}</div></TimelineTrack>
        <TimelineTrack label="Timing conf."><div className={`h-full ${gatesReady?"bg-emerald-500/55":"bg-amber-500/25"}`}/></TimelineTrack>
        <TimelineTrack label="Camera motion"><div className="h-full bg-gradient-to-r from-blue-500/20 via-blue-400/60 to-blue-500/20"/></TimelineTrack>
        <TimelineTrack label="Gate keyframes">{state.keyframes.map(k=><button key={k.id} onClick={()=>seek(k.frame/sourceFps)} style={{left:`${(k.frame/Math.max(1,frames.length-1))*100}%`}} className={`absolute top-1 h-5 w-1 ${k.gate==="start"?"bg-emerald-400":"bg-yellow-400"}`}/>)}</TimelineTrack>
        <TimelineTrack label="Manual markers">{state.setupMode==="manual_crossing"&&<ManualHandles state={state} frames={frames.length} dispatch={dispatch}/>}</TimelineTrack>
        <button aria-label="Seek professional timeline" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();seek(((e.clientX-r.left)/r.width)*duration)}} className="relative block h-7 w-full rounded bg-[#182233]"><i style={{left:`${currentTime/Math.max(duration,.01)*100}%`}} className="absolute inset-y-0 w-px bg-[#2f80ed]"/><span className="absolute left-2 top-1 text-[9px] text-[#7e8797]">0</span><span className="absolute right-2 top-1 text-[9px] text-[#7e8797]">{Math.round(duration*sourceFps)}</span></button>
      </div></div>
    </section>
  </div>;
}

function Label({children}:{children:ReactNode}){return <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7e8797]">{children}</p>;}
function SaveCalibrationButton({disabled}:{disabled:boolean}){
  const {pending}=useFormStatus();
  return <button disabled={disabled||pending} className="rounded-md bg-[#2f80ed] px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{pending?"Saving calibration…":"Save Gates & Run Analysis"}</button>;
}
function chip(active:boolean){return `rounded px-2.5 py-1.5 text-[11px] font-semibold ${active?"bg-[#2f80ed] text-white":"bg-[#182233] text-[#7e8797] hover:bg-white/10"}`;}
function InspectorRow({label,value,tone}:{label:string;value:string;tone?:string}){return <div className="mt-3 flex items-center justify-between border-b border-white/[.05] pb-2 text-xs"><span className="text-[#7e8797]">{label}</span><span className={tone==="green"?"text-emerald-300":tone==="red"?"text-red-300":"font-mono text-[#b3bccb]"}>{value}</span></div>;}
function TimelineTrack({label,children}:{label:string;children:ReactNode}){return <div className="grid h-7 grid-cols-[100px_1fr] items-center"><span className="text-[9px] uppercase tracking-wide text-[#7e8797]">{label}</span><div className="relative h-6 overflow-hidden rounded bg-[#182233]">{children}</div></div>;}
function ManualHandles({state,frames,dispatch}:{state:TimingWorkspaceState;frames:number;dispatch:Dispatch<Action>}){return <div className="grid h-full grid-cols-2 gap-2 px-2"><input aria-label="Manual start crossing" type="range" min="0" max={Math.max(1,frames-1)} value={state.manual.startBefore??0} onChange={e=>dispatch({type:"manual",key:"startBefore",value:Number(e.target.value)})} className="accent-emerald-400"/><input aria-label="Manual finish crossing" type="range" min="0" max={Math.max(1,frames-1)} value={state.manual.finishBefore??frames-1} onChange={e=>dispatch({type:"manual",key:"finishBefore",value:Number(e.target.value)})} className="accent-yellow-400"/></div>;}
function ManualCrossingEditor({state,frames,dispatch}:{state:TimingWorkspaceState;frames:number;dispatch:Dispatch<Action>}){
  const max=Math.max(1,frames-1);
  const fields=[["Start before","startBefore"],["Start after","startAfter"],["Finish before","finishBefore"],["Finish after","finishAfter"]] as const;
  return <div className="mt-2 space-y-2">{fields.map(([label,key])=><label key={key} className="grid grid-cols-[1fr_72px] items-center gap-2 text-[10px] text-[#777D87]"><span>{label}</span><input type="number" min="0" max={max} value={state.manual[key]??""} onChange={e=>dispatch({type:"manual",key,value:e.target.value===""?null:Math.min(max,Number(e.target.value))})} className="rounded bg-[#182233] px-2 py-1 font-mono text-[#b3bccb] outline-none"/></label>)}{(["start","finish"] as const).map(name=><label key={name} className="block text-[10px] text-[#777D87]">{name} interpolation · {state.manual[`${name}Interpolation`].toFixed(2)}<input aria-label={`${name} crossing interpolation`} type="range" min="0" max="1" step=".01" value={state.manual[`${name}Interpolation`]} onChange={e=>dispatch({type:"manual",key:`${name}Interpolation`,value:Number(e.target.value)})} className="mt-1 w-full accent-[#2f80ed]"/></label>)}</div>;
}
