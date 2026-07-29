#!/usr/bin/env python3
"""Run and score the protected local-gate-lock fixture; no performance timing."""
import cv2, json, math, os, subprocess

ROOT=os.getcwd(); VIDEO="/tmp/real-side-pan-fly-001.mov"; OUTPUT="/tmp/ava-local-gate-lock.json"
with open("/tmp/ava-real-30m-snapshot.json",encoding="utf8") as h:snapshot=json.load(h)
with open("validation/fixtures/panning/real-side-pan-fly-001.local-gates.json",encoding="utf8") as h:local_manual=json.load(h)
for name in ("start","finish"):
 gate=snapshot["session"]["calibrationInputs"]["gates"][f"{name}Boundary"]
 gate["localTracking"]={"trackerVersion":"ava-local-gate-tracker-v1","lockVersion":f"ava-{name}-line-lock-v1",
  "setupPatchPath":f"private-validation/{name}.png","localRoi":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1},{"x":0,"y":1}],
  "expectedOrientationDeg":0,"expectedLengthPx":100,"expectedContrast":.2,"appearanceDescriptor":[1],"excludedObjectClasses":["person","cone","hurdle","railing","shadow"],
  "keyframes":[{"frameIndex":item["frame"],"line":{"c1":{"x":item["line"][0][0]/1280,"y":item["line"][0][1]/720},"c2":{"x":item["line"][1][0]/1280,"y":item["line"][1][1]/720}},"selectedByUser":True} for item in local_manual["gates"][name]["keyframes"]]}
with open("/tmp/ava-local-gate-lock-snapshot.json","w",encoding="utf8") as h:json.dump(snapshot,h)
subprocess.run([os.path.join(ROOT,".venv/bin/python"),os.path.join(ROOT,"src/lib/calibration/runtime/local_gate_tracker.py"),
 "--video",VIDEO,"--pose","/tmp/ava-real-30m-pose.json","--snapshot","/tmp/ava-local-gate-lock-snapshot.json","--output",OUTPUT],check=True)
with open(OUTPUT,encoding="utf8") as h:result=json.load(h)
with open("validation/fixtures/panning/real-side-pan-fly-001.zone-anchors.json",encoding="utf8") as h:annotations=json.load(h)
manual={(name,item["frame"]):(item["line"]) for name,boundary in annotations["boundaries"].items() for item in boundary["manualVisibleLineAnnotations"]}
manual.update({(name,item["frame"]):item["line"] for name,gate in local_manual["gates"].items() for item in gate["keyframes"]})
def mid(line):return ((line[0][0]+line[1][0])/2,(line[0][1]+line[1][1])/2)
def angle(line):return math.degrees(math.atan2(line[1][1]-line[0][1],line[1][0]-line[0][0]))
def ae(a,b):value=abs((a-b+180)%360-180);return min(value,abs(180-value))
rows=[]
for name in ("start","finish"):
 for frame in result["gates"][name]["frames"]:
  observed=manual.get((name,frame["frame"])); line=frame.get("finalLine")
  if observed and line:
   rows.append({"gate":name,"frame":frame["frame"],"midpointErrorPx":math.dist(mid(observed),mid(line)),"endpointMeanErrorPx":sum(math.dist(observed[i],line[i]) for i in range(2))/2,"angularErrorDeg":ae(angle(observed),angle(line)),"state":frame["state"]})
capture=cv2.VideoCapture(VIDEO); width=int(capture.get(cv2.CAP_PROP_FRAME_WIDTH));height=int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT));fps=capture.get(cv2.CAP_PROP_FPS)
writer=cv2.VideoWriter("/tmp/ava-local-gate-lock-diagnostic.mp4",cv2.VideoWriter_fourcc(*"mp4v"),fps,(width,height)); strips=[]; index=0
while True:
 ok,image=capture.read()
 if not ok:break
 for gate,color in (("start",(255,255,0)),("finish",(0,165,255))):
  frame=result["gates"][gate]["frames"][index]; predicted=frame.get("predictedLine"); detected=frame.get("detectedLine"); final=frame.get("finalLine")
  if predicted:
   cv2.line(image,tuple(map(round,predicted[0])),tuple(map(round,predicted[1])),(0,255,255),2)
  if detected:cv2.line(image,tuple(map(round,detected[0])),tuple(map(round,detected[1])),(255,0,255),3)
  if final:
   style=5 if frame["state"]=="locked" else 2; cv2.line(image,tuple(map(round,final[0])),tuple(map(round,final[1])),(0,255,0),style)
  cv2.putText(image,f"{gate} {frame['state']} conf={frame.get('confidence',0):.2f} appearance={frame.get('appearanceScore',0):.2f}",(18,42 if gate=="start" else 76),cv2.FONT_HERSHEY_SIMPLEX,.72,color,2)
 writer.write(image)
 if index in list(range(95,104))+list(range(162,172)):strips.append((index,cv2.resize(image,(640,360))))
 index+=1
capture.release();writer.release()
def write_strip(items,output,columns):
 blank=items[0][1]*0
 while len(items)%columns:items.append((-1,blank.copy()))
 rendered=[]
 for i,image in items:
  cv2.putText(image,f"f{i}",(8,28),cv2.FONT_HERSHEY_SIMPLEX,.7,(255,255,255),2);rendered.append(image)
 rows2=[cv2.hconcat(rendered[i:i+columns]) for i in range(0,len(rendered),columns)];cv2.imwrite(output,cv2.vconcat(rows2))
write_strip(strips[:9],"/tmp/ava-local-gate-lock-start.jpg",3);write_strip(strips[9:],"/tmp/ava-local-gate-lock-finish.jpg",5)
summary={"trackerVersion":result["trackerVersion"],"annotations":rows,"summary":{}}
for gate in ("start","finish"):
 current=[r for r in rows if r["gate"]==gate]; summary["summary"][gate]={"meanMidpointErrorPx":sum(r["midpointErrorPx"] for r in current)/len(current),"maxMidpointErrorPx":max(r["midpointErrorPx"] for r in current),"meanEndpointErrorPx":sum(r["endpointMeanErrorPx"] for r in current)/len(current),"maxAngularErrorDeg":max(r["angularErrorDeg"] for r in current),"lockedAnnotations":sum(r["state"]=="locked" for r in current),"annotationCount":len(current)}
summary["artifacts"]={"video":"/tmp/ava-local-gate-lock-diagnostic.mp4","start":"/tmp/ava-local-gate-lock-start.jpg","finish":"/tmp/ava-local-gate-lock-finish.jpg"}
with open("/tmp/ava-local-gate-lock-fixture-summary.json","w",encoding="utf8") as handle:json.dump(summary,handle,indent=2)
print(json.dumps(summary,indent=2))
