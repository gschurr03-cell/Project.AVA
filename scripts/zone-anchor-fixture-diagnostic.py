#!/usr/bin/env python3
"""Internal-only real-fixture boundary alignment report and annotated frame strip."""
import json, math, os, sys
import cv2

root = os.getcwd()
video_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/real-side-pan-fly-001.mov"
pose_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/ava-pan-pose.json"
snapshot_path = sys.argv[3] if len(sys.argv) > 3 else None
annotations_path = os.path.join(root, "validation/fixtures/panning/real-side-pan-fly-001.zone-anchors.json")
with open(pose_path, encoding="utf8") as handle: pose = json.load(handle)
with open(annotations_path, encoding="utf8") as handle: annotations = json.load(handle)
transforms = {item["frame"]: item for item in pose["cameraEvidence"]["transforms"]}
width, height = annotations["sourceDimensions"].values()

def forward(point, transform):
    theta = math.radians(transform["rotationDeg"]); scale = transform["scale"]
    c, s = math.cos(theta) * scale, math.sin(theta) * scale
    x, y = point
    return (c*x - s*y + transform["translationX"]*width,
            s*x + c*y + transform["translationY"]*height)

def inverse(point, transform):
    theta = math.radians(transform["rotationDeg"]); scale = transform["scale"]
    c, s = math.cos(theta) * scale, math.sin(theta) * scale; det = c*c+s*s
    x, y = point[0]-transform["translationX"]*width, point[1]-transform["translationY"]*height
    return ((c*x+s*y)/det, (-s*x+c*y)/det)

def propagate(point, setup, target):
    output = tuple(point); used = []
    if target > setup:
        for frame in range(setup+1, target+1): output=forward(output, transforms[frame]); used.append(transforms[frame])
    else:
        for frame in range(setup, target, -1): output=inverse(output, transforms[frame]); used.append(transforms[frame])
    confidence = min([item["confidence"] for item in used], default=1)
    return output, confidence

def midpoint(line): return ((line[0][0]+line[1][0])/2, (line[0][1]+line[1][1])/2)
def angle(line): return math.degrees(math.atan2(line[1][1]-line[0][1], line[1][0]-line[0][0]))
def distance(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])

capture=cv2.VideoCapture(video_path); frame_cache={}; wanted=[]
for boundary in annotations["boundaries"].values(): wanted += [item["frame"] for item in boundary["manualVisibleLineAnnotations"]]
for frame_index in sorted(set(wanted)):
    capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index); ok, image=capture.read()
    if ok: frame_cache[frame_index]=image
capture.release(); rows=[]; rendered=[]
crossings={}
for boundary_name,boundary in annotations["boundaries"].items():
    setup=boundary["setupFrame"]
    for manual in boundary["manualVisibleLineAnnotations"]:
        predicted=[]; confidences=[]
        for endpoint in boundary["setupLine"]:
            point,confidence=propagate(endpoint,setup,manual["frame"]); predicted.append(point); confidences.append(confidence)
        observed=[tuple(value) for value in manual["line"]]
        row={"boundary":boundary_name,"frame":manual["frame"],"role":manual["role"],
             "midpointErrorPx":distance(midpoint(predicted),midpoint(observed)),
             "endpointErrorPx":sum(distance(predicted[i],observed[i]) for i in range(2))/2,
             "angularErrorDeg":abs(angle(predicted)-angle(observed)),"confidence":min(confidences)}
        rows.append(row)
        image=frame_cache.get(manual["frame"])
        if image is not None:
            canvas=image.copy(); cv2.line(canvas,tuple(map(round,observed[0])),tuple(map(round,observed[1])),(255,0,255),4)
            cv2.line(canvas,tuple(map(round,predicted[0])),tuple(map(round,predicted[1])),(0,255,0),3)
            cv2.putText(canvas,f"{boundary_name} f{manual['frame']} err {row['midpointErrorPx']:.1f}px conf {row['confidence']:.2f}",(24,42),cv2.FONT_HERSHEY_SIMPLEX,.8,(255,255,255),2)
            rendered.append(cv2.resize(canvas,(640,360)))
    previous=None
    expected="negative_to_positive" if boundary_name == "start" else "positive_to_negative"
    for frame in pose["frames"]:
        keypoints=frame.get("keypoints",{}); names=("left_shoulder","right_shoulder","left_hip","right_hip")
        points=[keypoints.get(name) for name in names]
        if any(point is None or point.get("visibility",point.get("score",0)) < .4 for point in points): continue
        body=(sum(point["x"] for point in points)/4*width,sum(point["y"] for point in points)/4*height)
        line=[]; confidence=1
        for endpoint in boundary["setupLine"]:
            point,current_confidence=propagate(endpoint,boundary["setupFrame"],frame.get("sourceFrameIndex",frame["index"]))
            line.append(point); confidence=min(confidence,current_confidence)
        side=(line[1][0]-line[0][0])*(body[1]-line[0][1])-(line[1][1]-line[0][1])*(body[0]-line[0][0])
        if previous and ((expected=="negative_to_positive" and previous["side"]<0<side) or
                         (expected=="positive_to_negative" and previous["side"]>0>side)):
            fraction=abs(previous["side"])/(abs(previous["side"])+abs(side))
            crossings[boundary_name]={"beforeFrame":previous["frame"],"afterFrame":frame["index"],
              "timestampSeconds":previous["time"]+fraction*(frame["tMs"]/1000-previous["time"]),
              "confidence":min(previous["confidence"],confidence),"safe":min(previous["confidence"],confidence)>=.45}
            break
        previous={"frame":frame["index"],"time":frame["tMs"]/1000,"side":side,"confidence":confidence}
if rendered:
    strip=cv2.vconcat([cv2.hconcat(rendered[i:i+5]) for i in range(0,len(rendered),5)])
    cv2.imwrite("/tmp/ava-zone-anchor-diagnostic.jpg",strip)
behavior_frames=[15,72,100,130,165,167,195]
capture=cv2.VideoCapture(video_path); behavior=[]; visibility=[]
def intersects(line):
    # Liang-Barsky clip test in source pixels; drawing never changes the endpoints.
    x1,y1=line[0]; x2,y2=line[1]; dx=x2-x1; dy=y2-y1; t0,t1=0,1
    for p,q in ((-dx,x1),(dx,width-x1),(-dy,y1),(dy,height-y1)):
        if p == 0 and q < 0: return False
        if p == 0: continue
        ratio=q/p
        if p < 0: t0=max(t0,ratio)
        else: t1=min(t1,ratio)
        if t0 > t1: return False
    return True
for frame_index in behavior_frames:
    capture.set(cv2.CAP_PROP_POS_FRAMES,frame_index); ok,image=capture.read()
    if not ok: continue
    visible=[]
    for boundary_name,boundary in annotations["boundaries"].items():
        line=[propagate(endpoint,boundary["setupFrame"],frame_index)[0] for endpoint in boundary["setupLine"]]
        if intersects(line):
            cv2.line(image,tuple(map(round,line[0])),tuple(map(round,line[1])),(0,255,0),3)
            cv2.putText(image,boundary_name,tuple(map(round,line[0])),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
            visible.append(boundary_name)
    cv2.putText(image,f"frame {frame_index} visible: {','.join(visible) or 'none'} | independent gates only",(20,40),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2)
    behavior.append(cv2.resize(image,(426,240))); visibility.append({"frame":frame_index,"visibleGates":visible})
capture.release()
if behavior: cv2.imwrite("/tmp/ava-independent-gates-diagnostic.jpg",cv2.hconcat(behavior))
# Review strip for the immutable V1 timing result. Values are independently
# recomputed below from the pose frames and propagated gates; the persisted
# uncertainty/result values are labels for the validated run under review.
review_specs={"start":{"frames":[99,100],"fraction":.2631872697951886,"timestamp":3.308772908993173,
              "uncertainty":.03058385427716577,"transformConfidence":.47524176643476446,"bodyConfidence":.9015397357218193},
              "finish":{"frames":[166,167],"fraction":.5795620687127262,"timestamp":5.552652068957092,
              "uncertainty":.01870447794320461,"transformConfidence":.509105573266956,"bodyConfidence":.8771633469697201}}
review_boundaries=annotations["boundaries"]
if snapshot_path:
    with open(snapshot_path,encoding="utf8") as handle: snapshot=json.load(handle)
    gates=snapshot["session"]["calibrationInputs"]["gates"]
    review_boundaries={}
    for name in ("start","finish"):
        source=gates[f"{name}Boundary"]
        review_boundaries[name]={"setupFrame":source["setupFrameIndex"],"setupLine":[
          [source["sourceFrameLine"]["c1"]["x"]*width,source["sourceFrameLine"]["c1"]["y"]*height],
          [source["sourceFrameLine"]["c2"]["x"]*width,source["sourceFrameLine"]["c2"]["y"]*height]]}
capture=cv2.VideoCapture(video_path); review=[]; review_evidence=[]
pose_frames={frame["index"]:frame for frame in pose["frames"]}
for boundary_name,spec in review_specs.items():
    boundary=review_boundaries[boundary_name]
    crossing_torsos=[]
    for crossing_frame in spec["frames"]:
        crossing_points=[pose_frames[crossing_frame]["keypoints"][name] for name in ("left_shoulder","right_shoulder","left_hip","right_hip")]
        crossing_torsos.append((sum(point["x"] for point in crossing_points)/4*width,sum(point["y"] for point in crossing_points)/4*height))
    crossing_position=tuple(crossing_torsos[0][axis]+spec["fraction"]*(crossing_torsos[1][axis]-crossing_torsos[0][axis]) for axis in (0,1))
    for frame_index in spec["frames"]:
        capture.set(cv2.CAP_PROP_POS_FRAMES,frame_index); ok,image=capture.read()
        frame=pose_frames[frame_index]
        if not ok: continue
        line=[propagate(endpoint,boundary["setupFrame"],frame_index)[0] for endpoint in boundary["setupLine"]]
        points=[frame["keypoints"][name] for name in ("left_shoulder","right_shoulder","left_hip","right_hip")]
        torso=(sum(point["x"] for point in points)/4*width,sum(point["y"] for point in points)/4*height)
        line_norm=[(point[0]/width,point[1]/height) for point in line]
        torso_norm=(torso[0]/width,torso[1]/height)
        line_length=distance(line_norm[0],line_norm[1])
        side=((line_norm[1][0]-line_norm[0][0])*(torso_norm[1]-line_norm[0][1])-(line_norm[1][1]-line_norm[0][1])*(torso_norm[0]-line_norm[0][0]))/line_length
        review_evidence.append({"gate":boundary_name,"frame":frame_index,"timestampSeconds":frame["tMs"]/1000,"normalizedSignedDistancePx":side})
        cv2.line(image,tuple(map(round,line[0])),tuple(map(round,line[1])),(0,255,0),4)
        cv2.circle(image,tuple(map(round,torso)),8,(255,255,0),-1)
        cv2.circle(image,tuple(map(round,crossing_position)),10,(0,165,255),3)
        timestamp=frame["tMs"]/1000
        cv2.rectangle(image,(0,0),(1280,105),(0,0,0),-1)
        cv2.putText(image,f"{boundary_name.upper()} f{frame_index} t={timestamp:.6f}s side={side:+.9f}",(20,34),cv2.FONT_HERSHEY_SIMPLEX,.72,(255,255,255),2)
        cv2.putText(image,f"fraction={spec['fraction']:.9f} crossing model=ava-world-gate-crossing-v1",(20,66),cv2.FONT_HERSHEY_SIMPLEX,.65,(255,255,255),2)
        cv2.putText(image,f"cross={spec['timestamp']:.9f}s unc={spec['uncertainty']:.9f}s conf T={spec['transformConfidence']:.3f} B={spec['bodyConfidence']:.3f}",(20,96),cv2.FONT_HERSHEY_SIMPLEX,.58,(255,255,255),2)
        review.append(cv2.resize(image,(640,360)))
capture.release()
if review: cv2.imwrite("/tmp/ava-real-30m-crossings.jpg",cv2.hconcat(review))
summary={"schemaVersion":"ava-zone-anchor-diagnostic-v1","fixtureId":annotations["fixtureId"],"rows":rows,
 "summary":{"meanMidpointErrorPx":sum(r["midpointErrorPx"] for r in rows)/len(rows),
 "maxMidpointErrorPx":max(r["midpointErrorPx"] for r in rows),"meanEndpointErrorPx":sum(r["endpointErrorPx"] for r in rows)/len(rows),
 "maxAngularErrorDeg":max(r["angularErrorDeg"] for r in rows),"minimumConfidence":min(r["confidence"] for r in rows)},
 "crossings":crossings,
 "gateVisibility":visibility,"connectedPolygonRendered":False,
 "artifact":"/tmp/ava-zone-anchor-diagnostic.jpg","independentGateStrip":"/tmp/ava-independent-gates-diagnostic.jpg",
 "crossingReviewStrip":"/tmp/ava-real-30m-crossings.jpg",
 "crossingReviewEvidence":review_evidence,
 "legend":"green=propagated, magenta=manual; no connected surface"}
print(json.dumps(summary,indent=2))
