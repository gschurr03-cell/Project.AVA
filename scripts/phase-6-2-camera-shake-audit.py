#!/usr/bin/env python3
"""Read-only Phase 6.2 source-pixel background audit and debug renderer."""
import json, math, statistics
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase62"
BENCHMARKS = {
    "gav": (ROOT / "tmp/phase42k-final-gav.pose.json", ROOT / "tmp/phase50e/sources/gav_stationary_reference.mov"),
    "vanni240": (ROOT / "tmp/phase42k-final-vanni240.pose.json", ROOT / "tmp/phase50e/sources/vanni_fly_240.mov"),
    "vanni120": (ROOT / "tmp/phase42k-final-vanni120.pose.json", ROOT / "tmp/phase50e/sources/vanni_fly_120.mov"),
    "vanni60": (ROOT / "tmp/phase42k-final-vanni60.pose.json", ROOT / "tmp/phase50e/sources/vanni_fly_60.mov"),
}

def percentile(values, fraction):
    values = sorted(values)
    return values[min(len(values) - 1, round((len(values) - 1) * fraction))] if values else None

def stats(values):
    return None if not values else {"p50": percentile(values,.5), "p95": percentile(values,.95), "max": max(values), "mean": statistics.fmean(values)}

def apply_affine(point, transform, width, height):
    theta=math.radians(transform["rotationDeg"]); c=math.cos(theta)*transform["scale"]; s=math.sin(theta)*transform["scale"]
    x=point[0]*width; y=point[1]*height
    return ((c*x-s*y+transform["translationX"]*width)/width,(s*x+c*y+transform["translationY"]*height)/height)

def gate_motion_audit(artifact, calibration):
    w=artifact["width"]; h=artifact["height"]; transforms=artifact["cameraEvidence"]["transforms"]
    gates=calibration["calibrationGates"]; raw=[(gates["startGate"]["c1"]["x"],gates["startGate"]["c1"]["y"]),(gates["startGate"]["c2"]["x"],gates["startGate"]["c2"]["y"]),(gates["finishGate"]["c1"]["x"],gates["finishGate"]["c1"]["y"]),(gates["finishGate"]["c2"]["x"],gates["finishGate"]["c2"]["y"])]
    displayed=list(raw); raw_moves=[]; display_moves=[]; lengths=[[],[]]; angles=[[],[]]; held=0
    for index,t in enumerate(transforms):
        scientific=raw if index==0 else [apply_affine(p,t,w,h) for p in raw]
        current=scientific
        if index:
            movement=max(math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h) for a,b in zip(current,displayed)); raw_moves.append(movement)
            if movement < .5: current=displayed; held+=1
            display_moves.append(max(math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h) for a,b in zip(current,displayed)))
        displayed=list(current); raw=list(scientific)
        for gate_index,(a,b) in enumerate(((displayed[0],displayed[1]),(displayed[2],displayed[3]))):
            dx=(b[0]-a[0])*w;dy=(b[1]-a[1])*h; lengths[gate_index].append(math.hypot(dx,dy));angles[gate_index].append(math.degrees(math.atan2(dy,dx)))
    return {"deadzoneSourcePx":.5,"rawEndpointMotionPx":stats(raw_moves),"displayEndpointMotionPx":stats(display_moves),"heldFrameCount":held,"gateLengthRangePx":max(max(v)-min(v) for v in lengths),"gateAngleRangeDeg":max(max(v)-min(v) for v in angles)}

def mask_for(frame, box):
    mask = np.full(frame.shape[:2], 255, np.uint8)
    if not box: return mask
    h,w=frame.shape[:2]; cx=box["x"]*w; cy=box["y"]*h; bw=box["width"]*w; bh=box["height"]*h
    mx=max(20,bw*.8); my=max(20,bh*.35)
    mask[max(0,int(cy-bh/2-my)):min(h,int(cy+bh/2+my)), max(0,int(cx-bw/2-mx)):min(w,int(cx+bw/2+mx))]=0
    return mask

def read_pair(video_path, index):
    cap=cv2.VideoCapture(str(video_path)); a=b=None; ok=ok2=False
    for frame_index in range(index + 1):
        success,frame=cap.read()
        if not success: break
        if frame_index == index - 1: a=frame; ok=True
        if frame_index == index: b=frame; ok2=True
    cap.release()
    if not ok or not ok2: raise RuntimeError(f"decode failed {video_path} frame {index}")
    return a,b

def decodable_frame_count(video_path):
    cap=cv2.VideoCapture(str(video_path)); count=0
    while True:
        ok,_=cap.read()
        if not ok: break
        count+=1
    cap.release(); return count

def audit_pair(video_path, artifact, index, output_path):
    prev,cur=read_pair(video_path,index); g0=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY); g1=cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY)
    box=artifact["frames"][max(0,index-1)].get("scientificAthleteBox")
    pts=cv2.goodFeaturesToTrack(g0,300,.01,8,blockSize=7,mask=mask_for(prev,box))
    nxt,status,_=cv2.calcOpticalFlowPyrLK(g0,g1,pts,None,winSize=(21,21),maxLevel=3)
    p0=pts[status.reshape(-1)==1].reshape(-1,2); p1=nxt[status.reshape(-1)==1].reshape(-1,2)
    affine,inliers=cv2.estimateAffinePartial2D(p0,p1,method=cv2.RANSAC,ransacReprojThreshold=2.5,maxIters=2000,confidence=.99)
    selected=inliers.reshape(-1).astype(bool); flows=p1-p0
    actual=np.median(flows[selected],axis=0); predicted=cv2.transform(p0.reshape(-1,1,2),affine).reshape(-1,2)
    residual=np.linalg.norm(predicted-p1,axis=1)[selected]
    canvas=cur.copy()
    for a,b,keep in zip(p0,p1,selected):
        color=(80,220,80) if keep else (80,80,220)
        cv2.arrowedLine(canvas,tuple(np.int32(a)),tuple(np.int32(b)),color,1,tipLength=.3)
    t=artifact["cameraEvidence"]["transforms"][index]
    lines=[f"frame {index} background features {len(p0)} inliers {int(selected.sum())}",f"flow median {actual[0]:.3f},{actual[1]:.3f}px residual {np.median(residual):.3f}px",f"stored transform {t['translationX']*artifact['width']:.3f},{t['translationY']*artifact['height']:.3f}px conf {t['confidence']:.3f}"]
    for y,text in enumerate(lines,1): cv2.putText(canvas,text,(20,30*y),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),2,cv2.LINE_AA)
    cv2.imwrite(str(output_path),canvas)
    return {"frame":index,"backgroundFeatureCount":len(p0),"inlierCount":int(selected.sum()),"actualBackgroundDxPx":float(actual[0]),"actualBackgroundDyPx":float(actual[1]),"actualBackgroundDisplacementPx":float(np.linalg.norm(actual)),"estimatedDxPx":t["translationX"]*artifact["width"],"estimatedDyPx":t["translationY"]*artifact["height"],"residualPx":float(np.median(residual)),"debugImage":str(output_path.relative_to(ROOT))}

def main():
    OUT.mkdir(parents=True,exist_ok=True); result={"schemaVersion":"ava-phase-6-2-camera-shake-audit-v1","benchmarks":{}}
    calibrations=json.loads((OUT/"calibrations.json").read_text())
    for name,(artifact_path,video_path) in BENCHMARKS.items():
        artifact=json.loads(artifact_path.read_text()); ts=artifact["cameraEvidence"]["transforms"]; w=artifact["width"];h=artifact["height"]
        motions=[math.hypot(t["translationX"]*w,t["translationY"]*h) for t in ts]
        decodable=decodable_frame_count(video_path)
        candidates=list(range(1,min(len(ts),decodable))); stable=min(candidates,key=lambda i:abs(motions[i]-percentile([motions[j] for j in candidates],.5))); shake=max(candidates,key=lambda i:motions[i])
        samples=[]
        for label,index in (("stable",stable),("shake",shake)):
            samples.append({"kind":label,**audit_pair(video_path,artifact,index,OUT/f"{name}-{label}-frame-{index}.png")})
        cumulative_x=sum(t["translationX"]*w for t in ts); cumulative_y=sum(t["translationY"]*h for t in ts)
        result["benchmarks"][name]={"sourceVideo":str(video_path.relative_to(ROOT)),"translationDisplacementPx":stats(motions),"translationXPx":stats([t["translationX"]*w for t in ts]),"translationYPx":stats([t["translationY"]*h for t in ts]),"rotationAbsDeg":stats([abs(t["rotationDeg"]) for t in ts]),"scaleDeviation":stats([abs(t["scale"]-1) for t in ts]),"residualPx":stats([t["residualPx"] for t in ts if t["residualPx"] is not None]),"cumulativeStepTranslationPx":{"x":cumulative_x,"y":cumulative_y,"magnitude":math.hypot(cumulative_x,cumulative_y)},"gateDisplay":gate_motion_audit(artifact,calibrations[name]),"samples":samples}
    (OUT/"camera-shake-audit.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(json.dumps(result,indent=2,sort_keys=True))

if __name__ == "__main__": main()
