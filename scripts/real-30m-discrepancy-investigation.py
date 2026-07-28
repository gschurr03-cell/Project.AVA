#!/usr/bin/env python3
"""Read-only forensic artifacts for the protected real 30 m fixture."""
import cv2, json, math, os, numpy as np

VIDEO = "/tmp/real-side-pan-fly-001.mov"
POSE = "/tmp/ava-real-30m-pose.json"
SNAPSHOT = "/tmp/ava-real-30m-snapshot.json"

with open(POSE, encoding="utf8") as handle: pose = json.load(handle)
with open(SNAPSHOT, encoding="utf8") as handle: snapshot = json.load(handle)
frames = {frame["index"]: frame for frame in pose["frames"]}
width, height = pose["width"], pose["height"]
transforms = {item["frame"]: item for item in pose["cameraEvidence"]["transforms"]}
gates = snapshot["session"]["calibrationInputs"]["gates"]

def forward(point, transform):
    theta=math.radians(transform["rotationDeg"]); c=math.cos(theta)*transform["scale"]; s=math.sin(theta)*transform["scale"]
    px,py=point[0]*width,point[1]*height
    return ((c*px-s*py+transform["translationX"]*width)/width,(s*px+c*py+transform["translationY"]*height)/height)
def inverse(point, transform):
    theta=math.radians(transform["rotationDeg"]); c=math.cos(theta)*transform["scale"]; s=math.sin(theta)*transform["scale"]; det=c*c+s*s
    x=point[0]*width-transform["translationX"]*width; y=point[1]*height-transform["translationY"]*height
    return ((c*x+s*y)/det/width,(-s*x+c*y)/det/height)
def propagate(point, setup, target):
    current=point; used=[]
    if target>setup:
        for index in range(setup+1,target+1): current=forward(current,transforms[index]); used.append(transforms[index])
    else:
        for index in range(setup,target,-1): current=inverse(current,transforms[index]); used.append(transforms[index])
    return current,used
def gate_line(name,index):
    gate=gates[f"{name}Boundary"]
    return [propagate((gate["sourceFrameLine"][key]["x"],gate["sourceFrameLine"][key]["y"]),gate["setupFrameIndex"],index)[0] for key in ("c1","c2")]
def signed_side(point,line):
    length=math.hypot(line[1][0]-line[0][0],line[1][1]-line[0][1])
    return ((line[1][0]-line[0][0])*(point[1]-line[0][1])-(line[1][1]-line[0][1])*(point[0]-line[0][0]))/length
def keypoint(frame,name):
    point=frame["keypoints"][name]; return (point["x"],point["y"])
def midpoint(*points): return (sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points))
def references(frame):
    ls,rs,lh,rh=(keypoint(frame,name) for name in ("left_shoulder","right_shoulder","left_hip","right_hip"))
    chest=midpoint(ls,rs); pelvis=midpoint(lh,rh); torso=midpoint(ls,rs,lh,rh)
    com=(chest[0]*.43+pelvis[0]*.57,chest[1]*.43+pelvis[1]*.57)
    shoulders=[ls,rs]; feet=[keypoint(frame,"left_ankle"),keypoint(frame,"right_ankle")]
    return {"torso":torso,"pelvis":pelvis,"chest":chest,"estimated_com":com,
      "leading_shoulder":max(shoulders,key=lambda p:p[0]),"leading_foot":max(feet,key=lambda p:p[0])}
def crossing(name,reference):
    expected=(-1,1) if name=="start" else (1,-1); previous=None
    for index in sorted(frames):
        try: point=references(frames[index])[reference]
        except KeyError: previous=None; continue
        side=signed_side(point,gate_line(name,index))
        if previous and ((expected==( -1,1) and previous[1]<0<side) or (expected==(1,-1) and previous[1]>0>side)):
            fraction=abs(previous[1])/(abs(previous[1])+abs(side))
            before_t=frames[previous[0]]["tMs"]/1000; after_t=frames[index]["tMs"]/1000
            return {"before":previous[0],"after":index,"fraction":fraction,"timestamp":before_t+fraction*(after_t-before_t)}
        previous=(index,side)
    return None
def extend_line(line):
    a=(line[0][0]*width,line[0][1]*height); b=(line[1][0]*width,line[1][1]*height)
    dx,dy=b[0]-a[0],b[1]-a[1]; scale=20
    return ((round(a[0]-dx*scale),round(a[1]-dy*scale)),(round(b[0]+dx*scale),round(b[1]+dy*scale)))

def read_frames(indices):
    capture = cv2.VideoCapture(VIDEO); result = {}
    for index in indices:
        capture.set(cv2.CAP_PROP_POS_FRAMES, index); ok, image = capture.read()
        if ok: result[index] = image
    capture.release(); return result

def tile(images, columns, output, target=(640,360)):
    rendered=[]
    for index,image in images:
        canvas=cv2.resize(image,target)
        cv2.rectangle(canvas,(0,0),(190,38),(0,0,0),-1)
        cv2.putText(canvas,f"source frame {index}",(10,27),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
        rendered.append(canvas)
    blank = rendered[0]*0 if rendered else None
    while rendered and len(rendered)%columns: rendered.append(blank.copy())
    if rendered:
        rows=[cv2.hconcat(rendered[i:i+columns]) for i in range(0,len(rendered),columns)]
        cv2.imwrite(output,cv2.vconcat(rows))

broad=list(range(0,197,8)); broad_images=read_frames(broad)
tile([(i,broad_images[i]) for i in broad if i in broad_images],5,"/tmp/ava-track-map-contact-sheet.jpg")
start=list(range(95,104)); start_images=read_frames(start)
tile([(i,start_images[i]) for i in start if i in start_images],3,"/tmp/ava-start-raw-strip.jpg")
finish=list(range(162,172)); finish_images=read_frames(finish)
tile([(i,finish_images[i]) for i in finish if i in finish_images],5,"/tmp/ava-finish-raw-strip.jpg")
for index in [0,16,32,48,64,72,80,88,96,99,100,104,120,136,152,162,166,167,170,176,184,192]:
    source=(start_images if index in start_images else finish_images if index in finish_images else read_frames([index])).get(index)
    if source is not None: cv2.imwrite(f"/tmp/ava-track-frame-{index:03d}.png",source)

map_source=read_frames([72,170,176]); map_panels=[]
for index in (72,170,176):
    image=map_source[index].copy()
    if index==72:
        line=[(847,524),(943,503)]; cv2.line(image,*line,(0,255,0),6)
        cv2.putText(image,"SAVED START: longitudinal paint dash (no distance label)",(18,45),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
        cv2.arrowedLine(image,(400,70),(895,510),(0,255,255),4)
    elif index==170:
        cv2.line(image,(1023,459),(1105,496),(0,255,0),6)
        cv2.putText(image,"SAVED FINISH: diagonal line beside LANE numbers 3-7",(18,45),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
        cv2.arrowedLine(image,(590,70),(1060,478),(0,255,255),4)
    else:
        cv2.putText(image,"Separate tripod/cone timing equipment beyond saved finish",(18,45),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
        cv2.arrowedLine(image,(670,70),(1135,430),(0,255,255),4)
    map_panels.append((index,image))
tile(map_panels,3,"/tmp/ava-track-mark-map-annotated.jpg")

# Exact saved geometry, infinite analytical plane, normal, and athlete references.
diagnostic=[]
palette={"torso":(0,0,255),"pelvis":(255,0,255),"chest":(0,165,255),"leading_foot":(255,0,0)}
all_review=read_frames(list(range(95,104))+list(range(162,172)))
for name,indices in (("start",range(95,104)),("finish",range(162,172))):
    for index in indices:
        image=all_review[index].copy(); line=gate_line(name,index); segment=[(round(p[0]*width),round(p[1]*height)) for p in line]
        cv2.line(image,*extend_line(line),(255,255,0),2); cv2.line(image,segment[0],segment[1],(0,255,0),5)
        mid=((segment[0][0]+segment[1][0])//2,(segment[0][1]+segment[1][1])//2); dx=segment[1][0]-segment[0][0]; dy=segment[1][1]-segment[0][1]
        norm=math.hypot(dx,dy); normal=(round(mid[0]-dy/norm*90),round(mid[1]+dx/norm*90)); cv2.arrowedLine(image,mid,normal,(0,255,255),3)
        refs=references(frames[index])
        for ref,color in palette.items():
            point=(round(refs[ref][0]*width),round(refs[ref][1]*height)); cv2.circle(image,point,7,color,-1)
        for foot in ("left_ankle","right_ankle"):
            point=keypoint(frames[index],foot); cv2.circle(image,(round(point[0]*width),round(point[1]*height)),6,(255,0,0),-1)
        side=signed_side(refs["torso"],line); cv2.rectangle(image,(0,0),(1280,88),(0,0,0),-1)
        cv2.putText(image,f"{name} f{index} t={frames[index]['tMs']/1000:.6f}s torso side={side:+.6f}",(16,32),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
        cv2.putText(image,"green=saved segment cyan=infinite plane yellow=normal red=torso magenta=pelvis orange=chest blue=feet",(16,68),cv2.FONT_HERSHEY_SIMPLEX,.52,(255,255,255),2)
        diagnostic.append((name,index,image))
tile([(i,img) for name,i,img in diagnostic if name=="start"],3,"/tmp/ava-start-crossing-forensic.jpg")
tile([(i,img) for name,i,img in diagnostic if name=="finish"],5,"/tmp/ava-finish-crossing-forensic.jpg")

# Athlete-reference trajectory against the saved planes.
trajectory=[]
for name,base_index,indices in (("start",99,range(84,104)),("finish",166,range(158,172))):
    image=all_review[base_index].copy() if base_index in all_review else read_frames([base_index])[base_index]
    line=gate_line(name,base_index); cv2.line(image,*extend_line(line),(255,255,0),3)
    for reference,color in palette.items():
        points=[]
        for index in indices:
            try:
                point=references(frames[index])[reference]
                # Map each point into the base frame through the same camera evidence.
                mapped=propagate(point,index,base_index)[0]
                points.append((round(mapped[0]*width),round(mapped[1]*height)))
            except KeyError: pass
        if len(points)>1: cv2.polylines(image,[__import__('numpy').array(points)],False,color,3)
    cv2.putText(image,f"{name}: reference trajectories in frame {base_index} coordinates",(18,40),cv2.FONT_HERSHEY_SIMPLEX,.75,(255,255,255),2)
    trajectory.append((base_index,image))
tile(trajectory,2,"/tmp/ava-athlete-reference-trajectories.jpg")

reference_results={}
for reference in ("torso","pelvis","chest","estimated_com","leading_shoulder","leading_foot"):
    start_cross=crossing("start",reference); finish_cross=crossing("finish",reference)
    reference_results[reference]={"start":start_cross,"finish":finish_cross,
      "duration":finish_cross["timestamp"]-start_cross["timestamp"] if start_cross and finish_cross else None}

# Independent visual clue: because the selected start paint dash is longitudinal,
# it cannot itself define a cross-lane plane. This records when each reference
# passes the dash midpoint in the left-to-right image direction; it is not a
# replacement production gate.
longitudinal_start={}
for reference in ("torso","pelvis","chest","estimated_com","leading_shoulder","leading_foot"):
    previous=None
    for index in sorted(frames):
        try: point=references(frames[index])[reference]
        except KeyError: previous=None; continue
        line=gate_line("start",index); midpoint_x=(line[0][0]+line[1][0])/2; delta=point[0]-midpoint_x
        if previous and previous[1]<0<=delta:
            fraction=abs(previous[1])/(abs(previous[1])+abs(delta)); before_t=frames[previous[0]]["tMs"]/1000; after_t=frames[index]["tMs"]/1000
            longitudinal_start[reference]={"before":previous[0],"after":index,"fraction":fraction,"timestamp":before_t+fraction*(after_t-before_t)}; break
        previous=(index,delta)

propagation={}
for name,index in (("start",99),("finish",166)):
    gate=gates[f"{name}Boundary"]; _,used=propagate((gate["sourceFrameLine"]["c1"]["x"],gate["sourceFrameLine"]["c1"]["y"]),gate["setupFrameIndex"],index)
    composite=np.eye(3)
    ordered=used if index>gate["setupFrameIndex"] else used
    for transform in ordered:
        theta=math.radians(transform["rotationDeg"]); c=math.cos(theta)*transform["scale"]; s=math.sin(theta)*transform["scale"]
        matrix=np.array([[c,-s,transform["translationX"]*width],[s,c,transform["translationY"]*height],[0,0,1]],dtype=float)
        if index<gate["setupFrameIndex"]: matrix=np.linalg.inv(matrix)
        composite=matrix@composite
    composed_scale=math.hypot(composite[0,0],composite[1,0]); composed_rotation=math.degrees(math.atan2(composite[1,0],composite[0,0]))
    propagation[name]={"setupFrame":gate["setupFrameIndex"],"crossingFrame":index,"direction":"forward" if index>gate["setupFrameIndex"] else "inverse",
      "steps":len(used),"accumulatedTranslationX":sum(t["translationX"] for t in used),"accumulatedTranslationY":sum(t["translationY"] for t in used),
      "accumulatedRotationDeg":sum(t["rotationDeg"] for t in used),"scaleProduct":math.prod(t["scale"] for t in used),
      "composedPixelMatrix":composite.tolist(),"composedTranslationPx":[composite[0,2],composite[1,2]],"composedRotationDeg":composed_rotation,"composedScale":composed_scale,
      "minimumConfidence":min(t["confidence"] for t in used),"maximumResidualPx":max(t["residualPx"] for t in used)}

print(json.dumps({"trackMap":"/tmp/ava-track-map-contact-sheet.jpg","annotatedTrackMap":"/tmp/ava-track-mark-map-annotated.jpg","startRaw":"/tmp/ava-start-raw-strip.jpg",
 "finishRaw":"/tmp/ava-finish-raw-strip.jpg","startForensic":"/tmp/ava-start-crossing-forensic.jpg",
 "finishForensic":"/tmp/ava-finish-crossing-forensic.jpg","referenceResults":reference_results,"propagation":propagation,
 "startMarkerLongitudinalPassClue":longitudinal_start,"trajectoryArtifact":"/tmp/ava-athlete-reference-trajectories.jpg",
 "individualFrames":22},indent=2))
