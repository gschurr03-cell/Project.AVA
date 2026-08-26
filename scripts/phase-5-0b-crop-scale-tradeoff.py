#!/usr/bin/env python3
"""Phase 5.0B (Part I) — crop-size vs pose-resolution tradeoff. For a set of
REAL, representative Vanni 240 source frames (drawn from the known 470-527
drift window plus normal frames elsewhere in the clip), crop the SAME real
source frame at multiple scales around the SAME real localization box
(scientificAthleteBox, read from the current production artifact — not
fabricated), run the SAME production PoseLandmarker model on each, and
measure real, observed differences. Diagnostic only — does not select or
change any production crop size; purely measures where more crop starts
hurting pose resolution.

    .venv/bin/python scripts/phase-5-0b-crop-scale-tradeoff.py
"""
import json
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, "src/lib/biomechanics/mediapipe/runtime")
import mediapipe_pose_runner as mpr  # noqa: E402
from mediapipe.tasks import python as mp_python  # noqa: E402
from mediapipe.tasks.python import vision as mp_vision  # noqa: E402
import mediapipe as mp  # noqa: E402

VIDEO = "tmp/phase50b-vanni240-source.mov"
ARTIFACT = "tmp/phase42j-final/vanni240.pose.json"
SCALES = [1.0, 1.05, 1.10, 1.15, 1.20]  # current crop, then +5/10/15/20%

with open(ARTIFACT, encoding="utf8") as fh:
    artifact = json.load(fh)
W, H = artifact["width"], artifact["height"]

# Representative frames: 5 from the known drift window (470-527), 5 normal
# frames from elsewhere in the clip with a real, present scientificAthleteBox.
frames_by_index = {f["sourceFrameIndex"]: f for f in artifact["frames"]}
drift_candidates = [i for i in range(470, 528) if frames_by_index.get(i, {}).get("scientificAthleteBox")]
normal_candidates = [i for i in range(50, 400, 40) if frames_by_index.get(i, {}).get("scientificAthleteBox")]
sample_frames = sorted(set(drift_candidates[::12][:5] + normal_candidates[:5]))
print("sample frames:", sample_frames, file=sys.stderr)

model_path = mpr.ensure_model()
landmarker = mp_vision.PoseLandmarker.create_from_options(
    mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        running_mode=mp_vision.RunningMode.IMAGE,
        min_pose_detection_confidence=mpr.MIN_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=mpr.MIN_PRESENCE_CONFIDENCE,
        min_tracking_confidence=mpr.MIN_TRACKING_CONFIDENCE,
    )
)

FOOT_INDICES = {27: "left_ankle", 28: "right_ankle", 29: "left_heel", 30: "right_heel", 31: "left_toe", 32: "right_toe"}

cap = cv2.VideoCapture(VIDEO)
results = []
for target_idx in sample_frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx)
    ok, frame_bgr = cap.read()
    if not ok:
        print(f"could not read frame {target_idx}", file=sys.stderr)
        continue
    # Registry-documented 180-degree rotation for this source file (ffprobe
    # unavailable in this diagnostic shell; the real worker applies this via
    # apply_rotation()/probe_rotation_degrees() using the container's own tag).
    frame_bgr = cv2.rotate(frame_bgr, cv2.ROTATE_180)
    box = frames_by_index[target_idx]["scientificAthleteBox"]
    bcx = (box["x"] + box["width"] / 2.0) * W
    bcy = (box["y"] + box["height"] / 2.0) * H
    base_side = max(box["width"] * W, box["height"] * H) * mpr.EFF_PADDING
    for scale in SCALES:
        side = base_side * scale
        half = side / 2.0
        x0, y0 = max(0, int(bcx - half)), max(0, int(bcy - half))
        x1, y1 = min(W, int(bcx + half)), min(H, int(bcy + half))
        if x1 - x0 < 8 or y1 - y0 < 8:
            continue
        crop = frame_bgr[y0:y1, x0:x1]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        t0 = time.time()
        result = landmarker.detect(mp_image)
        elapsed_ms = (time.time() - t0) * 1000.0

        detected = bool(result.pose_landmarks)
        keypoint_count = len(result.pose_landmarks[0]) if detected else 0
        foot_conf = {}
        if detected:
            lm = result.pose_landmarks[0]
            for idx, name in FOOT_INDICES.items():
                if idx < len(lm):
                    foot_conf[name] = float(getattr(lm[idx], "visibility", 0.0) or 0.0)
        mean_conf = None
        completeness = None
        if detected:
            vis_values = [float(getattr(p, "visibility", 0.0) or 0.0) for p in result.pose_landmarks[0]]
            mean_conf = sum(vis_values) / len(vis_values) if vis_values else None
            completeness = sum(1 for v in vis_values if v >= 0.4) / len(vis_values) if vis_values else None

        results.append({
            "sourceFrameIndex": target_idx,
            "inDriftWindow": 470 <= target_idx <= 527,
            "scale": scale,
            "cropWidthPx": x1 - x0,
            "cropHeightPx": y1 - y0,
            "detected": detected,
            "keypointCount": keypoint_count,
            "meanVisibility": mean_conf,
            "completeness": completeness,
            "footConfidence": foot_conf,
            "ankleAvailable": bool(foot_conf.get("left_ankle", 0) >= 0.4 or foot_conf.get("right_ankle", 0) >= 0.4),
            "heelAvailable": bool(foot_conf.get("left_heel", 0) >= 0.4 or foot_conf.get("right_heel", 0) >= 0.4),
            "footIndexAvailable": bool(foot_conf.get("left_toe", 0) >= 0.4 or foot_conf.get("right_toe", 0) >= 0.4),
            "processingTimeMs": elapsed_ms,
        })
cap.release()
landmarker.close()

# Aggregate by scale.
by_scale = {}
for r in results:
    by_scale.setdefault(r["scale"], []).append(r)
summary = {}
for scale, rows in by_scale.items():
    n = len(rows)
    summary[str(scale)] = {
        "n": n,
        "detectRate": sum(1 for r in rows if r["detected"]) / n,
        "meanKeypointCount": sum(r["keypointCount"] for r in rows) / n,
        "meanVisibility": sum(r["meanVisibility"] or 0 for r in rows) / n,
        "meanCompleteness": sum(r["completeness"] or 0 for r in rows) / n,
        "ankleAvailableRate": sum(1 for r in rows if r["ankleAvailable"]) / n,
        "heelAvailableRate": sum(1 for r in rows if r["heelAvailable"]) / n,
        "footIndexAvailableRate": sum(1 for r in rows if r["footIndexAvailable"]) / n,
        "meanProcessingTimeMs": sum(r["processingTimeMs"] for r in rows) / n,
    }

output = {"sampleFrames": sample_frames, "scales": SCALES, "perFrame": results, "summaryByScale": summary}
print(json.dumps(output, indent=2))
with open("tmp/phase50b-crop-scale-tradeoff.json", "w", encoding="utf8") as fh:
    json.dump(output, fh, indent=2)
