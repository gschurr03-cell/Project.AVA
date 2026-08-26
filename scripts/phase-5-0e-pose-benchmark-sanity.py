#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp/phase50e"
passed = 0

def check(name, condition):
    global passed
    if not condition:
        raise AssertionError(name)
    passed += 1
    print(f"PASS {passed}: {name}")

manifest = json.load(open(WORK / "critical-frame-manifest.json"))["frames"]
mp = json.load(open(WORK / "mediapipe-results.json"))["frames"]
rt = json.load(open(WORK / "rtmpose-results.json"))["frames"]
summary = json.load(open(WORK / "summary.json"))

keys = lambda rows: [(r["benchmark"], r["sourceFrameIndex"], r["timestampMs"]) for r in rows]
check("same source frame and timestamp", keys(mp) == keys(rt))
check("same encoded crop hash", [r["cropSha256"] for r in mp] == [r["cropSha256"] for r in rt])
check("same decoded crop-pixel hash", [r["cropPixelSha256"] for r in mp] == [r["cropPixelSha256"] for r in rt])
check("manifest crop bytes remain immutable", all(hashlib.sha256((ROOT/r["cropPath"]).read_bytes()).hexdigest() == r["cropSha256"] for r in manifest))
check("unsupported landmark field explicit", all("unsupportedLandmarks" in r for r in mp + rt))
check("normalization does not fabricate unsupported joints", all(not set(r["unsupportedLandmarks"]) & set(r["sourceLandmarks"]) for r in mp + rt))
sample = rt[0]
raw = sample["rawLandmarks"]["left_hip"]; mapped = sample["sourceLandmarks"]["left_hip"]; rect = sample["cropRect"]
check("source-space x remap", abs(mapped["x"] - (rect["x0"] + raw["x"]*(rect["x1"]-rect["x0"]))) < 1e-12)
check("source-space y remap", abs(mapped["y"] - (rect["y0"] + raw["y"]*(rect["y1"]-rect["y0"]))) < 1e-12)
check("left and right mapping remain distinct", "left_hip" in sample["sourceLandmarks"] and "right_hip" in sample["sourceLandmarks"])
check("more emitted landmarks is not treated as valid", summary["backends"]["rtmpose"]["benchmarks"]["vanni_fly_240"]["contactReadyFrames"] == 0)
check("anatomical outliers are counted", summary["backends"]["rtmpose"]["benchmarks"]["vanni_fly_240"]["anatomicalOutliers"] > 0)
check("temporal evidence is measured", summary["backends"]["mediapipe"]["benchmarks"]["vanni_fly_240"]["consecutiveFootVelocitySamples"] > 0)
check("Vanni 240 dropout fixture represented", any(r["benchmark"] == "vanni_fly_240" and 430 <= r["sourceFrameIndex"] <= 550 for r in manifest))
check("alternative backend uses same crops", summary["crossBackend"]["cropPixelHashesIdentical"])
check("Gav positive controls remain contact ready", summary["backends"]["mediapipe"]["benchmarks"]["gav_stationary_reference"]["contactReadyFrames"] > 0)
check("Vanni 120 exit fixture represented", any(r["benchmark"] == "vanni_fly_120" and r["sourceFrameIndex"] == 316 for r in manifest))
check("Vanni 60 unsupported interval represented", any(r["benchmark"] == "vanni_fly_60" and r["sourceFrameIndex"] == 155 for r in manifest))
contacts = (ROOT / "src/lib/video/contacts.ts").read_text()
steps = (ROOT / "src/lib/video/steps.ts").read_text()
timing = (ROOT / "src/lib/measurement/timingPolicy.ts").read_text()
check("contact threshold unchanged", "minVisibility: 0.4" in contacts and "minVisibility: 0.4" in steps)
check("metric/contact formulas are not imported by harness", "computeSprintMeasurements" not in (ROOT/"scripts/phase-5-0e-pose-benchmark.py").read_text())
check("timing formulas untouched by harness", "CONSERVATIVE_TIMING_POLICY_V1" in timing)
check("backend provenance survives serialization", all(r["backend"] in ("mediapipe","rtmpose") and r["modelVersion"] for r in mp + rt))
check("multiple contribution is explicit and absent", all("landmarkContributors" not in r for r in mp + rt))
check("no implicit model download code", "urlopen" not in (ROOT/"scripts/phase-5-0e-pose-benchmark.py").read_text())

for backend in ("mediapipe", "rtmpose"):
    a = json.load(open(WORK / f"{backend}-results.json"))
    b = json.load(open(WORK / f"{backend}repeat-results.json"))
    for value in (a, b):
        value.pop("modelLoadTimeMs", None); value.pop("peakResidentBytes", None)
        for frame in value["frames"]: frame.pop("processingTimeMs", None)
    check(f"{backend} deterministic", a == b)

print(f"ALL {passed} PASSED")
