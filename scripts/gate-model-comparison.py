#!/usr/bin/env python3
"""Compare gate projection models against independent real-fixture annotations."""
import cv2,json,math,numpy as np
VIDEO="/tmp/real-side-pan-fly-001.mov"
with open("/tmp/ava-local-gate-lock.json",encoding="utf8") as h:locks=json.load(h)
with open("validation/fixtures/panning/real-side-pan-fly-001.zone-anchors.json",encoding="utf8") as h:ann=json.load(h)
cap=cv2.VideoCapture(VIDEO);images=[]
while True:
 ok,img=cap.read()
 if not ok:break
 images.append(img)
cap.release()
def mid(line):return ((line[0][0]+line[1][0])/2,(line[0][1]+line[1][1])/2)
def metrics(line,truth):
 a=lambda l:math.degrees(math.atan2(l[1][1]-l[0][1],l[1][0]-l[0][0]));d=abs((a(line)-a(truth)+180)%360-180);d=min(d,abs(180-d))
 return {"midpointErrorPx":math.dist(mid(line),mid(truth)),"endpointMeanErrorPx":sum(math.dist(line[i],truth[i]) for i in range(2))/2,"angularErrorDeg":d}
def homography_line(setup,target,line):
 gray1=cv2.cvtColor(images[setup],cv2.COLOR_BGR2GRAY);gray2=cv2.cvtColor(images[target],cv2.COLOR_BGR2GRAY);orb=cv2.ORB_create(nfeatures=3000)
 k1,d1=orb.detectAndCompute(gray1,None);k2,d2=orb.detectAndCompute(gray2,None)
 if d1 is None or d2 is None:return None
 matches=cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(d1,d2,k=2);good=[m for m,n in matches if m.distance<.72*n.distance]
 if len(good)<12:return None
 src=np.float32([k1[m.queryIdx].pt for m in good]);dst=np.float32([k2[m.trainIdx].pt for m in good]);matrix,mask=cv2.findHomography(src,dst,cv2.RANSAC,3)
 if matrix is None or int(mask.sum())<10:return None
 points=cv2.perspectiveTransform(np.float32([line]),matrix)[0];return points.tolist()
rows=[]
for gate in ("start","finish"):
 setup=ann["boundaries"][gate]["setupFrame"];setup_line=ann["boundaries"][gate]["setupLine"]
 by_frame={item["frame"]:item for item in locks["gates"][gate]["frames"]}
 for item in ann["boundaries"][gate]["manualVisibleLineAnnotations"]:
  frame=by_frame[item["frame"]];models={"partial_affine":frame.get("globalPredictedLine") or frame.get("predictedLine"),"local_optical":frame.get("localFlowPredictedLine"),"hybrid_local_lock":frame.get("finalLine"),"full_homography":homography_line(setup,item["frame"],setup_line)}
  for model,line in models.items():
   if line:rows.append({"gate":gate,"frame":item["frame"],"model":model,**metrics(line,item["line"])})
summary={}
for model in sorted(set(row["model"] for row in rows)):
 current=[row for row in rows if row["model"]==model];summary[model]={"count":len(current),"meanMidpointErrorPx":sum(r["midpointErrorPx"] for r in current)/len(current),"meanEndpointErrorPx":sum(r["endpointMeanErrorPx"] for r in current)/len(current),"maxAngularErrorDeg":max(r["angularErrorDeg"] for r in current)}
output={"rows":rows,"summary":summary,"selection":"hybrid_local_lock" if summary.get("hybrid_local_lock",{}).get("meanMidpointErrorPx",999)<summary.get("full_homography",{}).get("meanMidpointErrorPx",999) else "full_homography"}
with open("/tmp/ava-gate-model-comparison.json","w",encoding="utf8") as h:json.dump(output,h,indent=2)
print(json.dumps(output,indent=2))
