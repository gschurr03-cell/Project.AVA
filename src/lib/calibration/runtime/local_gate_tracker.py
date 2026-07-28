#!/usr/bin/env python3
"""Independent local physical-line lock. Global affine is prediction only."""
from __future__ import annotations
import argparse, json, math
from dataclasses import dataclass, asdict
import cv2
import numpy as np

TRACKER_VERSION="ava-local-gate-tracker-v1"
LOCK_VERSIONS={"start":"ava-start-line-lock-v1","finish":"ava-finish-line-lock-v1"}

def angle(line): return math.degrees(math.atan2(line[1][1]-line[0][1],line[1][0]-line[0][0]))
def midpoint(line): return ((line[0][0]+line[1][0])/2,(line[0][1]+line[1][1])/2)
def length(line): return math.hypot(line[1][0]-line[0][0],line[1][1]-line[0][1])
def angular_error(a,b):
    value=abs((a-b+180)%360-180); return min(value,abs(180-value))
def sample_gray(gray,p):
    x=int(round(max(0,min(gray.shape[1]-1,p[0])))); y=int(round(max(0,min(gray.shape[0]-1,p[1])))); return float(gray[y,x])
def appearance(gray,line):
    a,b=np.array(line[0],float),np.array(line[1],float); direction=b-a; norm=np.linalg.norm(direction)
    if norm<4:return (0,0)
    normal=np.array([-direction[1],direction[0]])/norm
    values=[]; contrast=[]
    for t in np.linspace(.08,.92,19):
        p=a+t*direction; center=sample_gray(gray,p); values.append(center)
        surround=(sample_gray(gray,p+normal*6)+sample_gray(gray,p-normal*6))/2; contrast.append(center-surround)
    return float(np.mean(values))/255,float(np.mean(contrast))/255
def clip_roi(mid,w,h,margin):
    return (max(0,int(mid[0]-margin)),max(0,int(mid[1]-margin)),min(w,int(mid[0]+margin)),min(h,int(mid[1]+margin)))
def intersects(line,w,h):
    return cv2.clipLine((0,0,w,h),tuple(map(round,line[0])),tuple(map(round,line[1])))[0]

@dataclass
class Candidate:
    line:list; score:float; appearanceScore:float; contrastScore:float; midpointErrorPx:float
    angularErrorDeg:float; lengthRatio:float

def detect(gray,predicted,athlete_points):
    h,w=gray.shape; pm=midpoint(predicted); plen=length(predicted); pa=angle(predicted); margin=max(70,int(plen*1.15))
    x1,y1,x2,y2=clip_roi(pm,w,h,margin)
    roi=gray[y1:y2,x1:x2].copy()
    # The analyzed athlete must never become local line evidence.
    if athlete_points:
        xs=[p[0] for p in athlete_points]; ys=[p[1] for p in athlete_points]
        ax1=max(x1,int(min(xs)-25)); ay1=max(y1,int(min(ys)-25)); ax2=min(x2,int(max(xs)+25)); ay2=min(y2,int(max(ys)+25))
        if ax2>ax1 and ay2>ay1: roi[ay1-y1:ay2-y1,ax1-x1:ax2-x1]=0
    lsd=cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    detected=lsd.detect(roi)[0]; candidates=[]
    predicted_bright,predicted_contrast=appearance(gray,predicted)
    if predicted_bright>=.42 and predicted_contrast>=.035:
        candidates.append(Candidate([list(predicted[0]),list(predicted[1])],.60+min(.2,predicted_contrast),predicted_bright,predicted_contrast,0,0,1))
    if detected is None:return max(candidates,key=lambda value:value.score) if candidates else None
    for raw in detected[:,0,:]:
        line=[(float(raw[0]+x1),float(raw[1]+y1)),(float(raw[2]+x1),float(raw[3]+y1))]
        current_length=length(line); current_angle=angle(line); ae=angular_error(current_angle,pa); me=math.dist(midpoint(line),pm); ratio=current_length/plen
        if ae>12 or me>margin*.72 or ratio<.32 or ratio>1.65: continue
        bright,contrast=appearance(gray,line)
        if bright<.42 or contrast<.035: continue
        score=max(0,1-me/(margin*.72))*.24+max(0,1-ae/12)*.10+min(1,bright)*.26+min(1,contrast/.35)*.35+max(0,1-abs(1-ratio))*.05
        candidates.append(Candidate([list(line[0]),list(line[1])],score,bright,contrast,me,ae,ratio))
    return max(candidates,key=lambda value:value.score) if candidates else None

def rigid_fuse(predicted,candidate):
    """Correct local position while retaining the rigid predicted orientation/length."""
    plen=length(predicted); cm=np.array(midpoint(candidate.line)); theta=math.radians(angle(predicted)); direction=np.array([math.cos(theta),math.sin(theta)])
    return [(cm-direction*plen/2).tolist(),(cm+direction*plen/2).tolist()]

def local_flow_predictions(images,setup,line):
    """Bidirectional local optical prediction with FB checks and per-frame RANSAC."""
    predictions={setup:[list(line[0]),list(line[1])]}
    def direction(indices):
        current=[list(line[0]),list(line[1])]; previous_gray=cv2.cvtColor(images[setup],cv2.COLOR_BGR2GRAY)
        x1=max(0,int(min(line[0][0],line[1][0])-70));x2=min(previous_gray.shape[1],int(max(line[0][0],line[1][0])+70))
        y1=max(0,int(min(line[0][1],line[1][1])-70));y2=min(previous_gray.shape[0],int(max(line[0][1],line[1][1])+70))
        mask=np.zeros_like(previous_gray);mask[y1:y2,x1:x2]=255
        points=cv2.goodFeaturesToTrack(previous_gray,maxCorners=180,qualityLevel=.01,minDistance=5,mask=mask,blockSize=5)
        previous_index=setup
        for index in indices:
            gray=cv2.cvtColor(images[index],cv2.COLOR_BGR2GRAY)
            if points is None or len(points)<10:break
            forward,status,_=cv2.calcOpticalFlowPyrLK(previous_gray,gray,points,None,winSize=(31,31),maxLevel=4,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
            backward,back_status,_=cv2.calcOpticalFlowPyrLK(gray,previous_gray,forward,None,winSize=(31,31),maxLevel=4,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
            valid=(status[:,0]==1)&(back_status[:,0]==1)&(np.linalg.norm(points[:,0]-backward[:,0],axis=1)<1.5)
            src=points[valid,0];dst=forward[valid,0]
            if len(src)<10:break
            matrix,inliers=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=2,maxIters=1000,confidence=.99)
            if matrix is None or inliers is None or int(inliers.sum())<8:break
            current=[(matrix@np.array([p[0],p[1],1])).tolist() for p in current];predictions[index]=current
            points=dst[inliers[:,0]==1].reshape(-1,1,2).astype(np.float32);previous_gray=gray;previous_index=index
    direction(range(setup+1,len(images)))
    direction(range(setup-1,-1,-1))
    return predictions

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--video",required=True); parser.add_argument("--pose",required=True); parser.add_argument("--snapshot",required=True); parser.add_argument("--output",required=True)
    args=parser.parse_args()
    with open(args.pose,encoding="utf8") as h:pose=json.load(h)
    with open(args.snapshot,encoding="utf8") as h:snapshot=json.load(h)
    gates=snapshot["session"]["calibrationInputs"]["gates"]; width,height=pose["width"],pose["height"]
    transforms={item["frame"]:item for item in pose["cameraEvidence"]["transforms"]}; pose_frames={item["index"]:item for item in pose["frames"]}
    def transform(point,t,invert=False):
        theta=math.radians(t["rotationDeg"]); c=math.cos(theta)*t["scale"]; s=math.sin(theta)*t["scale"]
        matrix=np.array([[c,-s,t["translationX"]*width],[s,c,t["translationY"]*height],[0,0,1]],float)
        if invert:matrix=np.linalg.inv(matrix)
        out=matrix@np.array([point[0],point[1],1]); return (out[0],out[1])
    def predict(gate,index):
        line=[(gate["sourceFrameLine"][key]["x"]*width,gate["sourceFrameLine"][key]["y"]*height) for key in ("c1","c2")]; setup=gate["setupFrameIndex"]
        if index>setup:
            for frame in range(setup+1,index+1):line=[transform(p,transforms[frame]) for p in line]
        else:
            for frame in range(setup,index,-1):line=[transform(p,transforms[frame],True) for p in line]
        return line
    capture=cv2.VideoCapture(args.video); source=[]
    while True:
        ok,image=capture.read()
        if not ok:break
        source.append(image)
    capture.release(); result={"trackerVersion":TRACKER_VERSION,"gates":{}}
    for name in ("start","finish"):
        gate=gates[f"{name}Boundary"]; frame_results=[]; previous_locked=None; previous_correction=None
        setup_line=[(gate["sourceFrameLine"][key]["x"]*width,gate["sourceFrameLine"][key]["y"]*height) for key in ("c1","c2")]
        seeds=[(gate["setupFrameIndex"],setup_line)]
        for keyframe in gate.get("localTracking",{}).get("keyframes",[]):
            keyline=keyframe["line"]
            seeds.append((keyframe["frameIndex"],[(keyline[key]["x"]*width,keyline[key]["y"]*height) for key in ("c1","c2")]))
        seed_predictions=[(seed,local_flow_predictions(source,seed,line)) for seed,line in seeds]
        local_predictions={index:min(((abs(index-seed),lines[index]) for seed,lines in seed_predictions if index in lines),default=(0,None))[1] for index in range(len(source))}
        local_predictions={index:line for index,line in local_predictions.items() if line is not None}
        for index,image in enumerate(source):
            global_predicted=predict(gate,index); predicted=local_predictions.get(index,global_predicted)
            if math.dist(midpoint(predicted),midpoint(global_predicted))>90: predicted=global_predicted
            if not intersects(predicted,width,height):
                frame_results.append({"frame":index,"state":"lost","reason":"predicted_segment_offscreen","render":False}); continue
            points=[]
            for value in pose_frames.get(index,{}).get("keypoints",{}).values():
                if isinstance(value,dict) and "x" in value and "y" in value:points.append((value["x"]*width,value["y"]*height))
            candidate=detect(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),predicted,points)
            if candidate is None:
                frame_results.append({"frame":index,"state":"lost","reason":"local_physical_line_unavailable","render":False,"predictedLine":predicted}); previous_locked=None; previous_correction=None; continue
            fused=rigid_fuse(predicted,candidate); jump=math.dist(midpoint(fused),midpoint(previous_locked)) if previous_locked else 0
            rotation_jump=angular_error(angle(fused),angle(previous_locked)) if previous_locked else 0; scale_jump=abs(length(fused)/length(previous_locked)-1) if previous_locked else 0
            pm,cm=midpoint(predicted),midpoint(candidate.line); correction=(cm[0]-pm[0],cm[1]-pm[1]); correction_jump=math.dist(correction,previous_correction) if previous_correction else 0
            discontinuous=jump>55 or rotation_jump>5 or scale_jump>.08 or correction_jump>8
            state="locked" if candidate.score>=.63 and not discontinuous else "limited"
            if state=="locked":previous_locked=fused; previous_correction=correction
            frame_results.append({"frame":index,"state":state,"render":True,"timingEligible":state=="locked","predictedLine":predicted,"detectedLine":candidate.line,"finalLine":fused,
              "globalPredictedLine":global_predicted,"localFlowPredictedLine":local_predictions.get(index),"confidence":candidate.score,"appearanceScore":candidate.appearanceScore,"contrastScore":candidate.contrastScore,"predictionCorrectionPx":candidate.midpointErrorPx,
              "correctionVectorPx":correction,"correctionJumpPx":correction_jump,"angularCorrectionDeg":candidate.angularErrorDeg,"frameToFrameMidpointPx":jump,"frameToFrameRotationDeg":rotation_jump,"scaleChange":scale_jump,
              "reason":None if state=="locked" else ("discontinuous_local_update" if discontinuous else "local_confidence_limited")})
        result["gates"][name]={"gateId":gate.get("gateId",gate["boundaryId"]),"lockVersion":LOCK_VERSIONS[name],"frames":frame_results}
    with open(args.output,"w",encoding="utf8") as handle:json.dump(result,handle,separators=(",",":"))
if __name__=="__main__":main()
