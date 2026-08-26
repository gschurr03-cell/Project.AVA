#!/usr/bin/env python3
"""Phase 5.0C (Part E) — diagnostic comparison of candidate secondary-crop
geometries on real Vanni 240 frames with missing/at-risk foot evidence.
Uses the REAL current localization box for each frame (from the current
production artifact) and the REAL source video — no fabricated evidence.
Diagnostic only; does not select or change any production crop.

    .venv/bin/python scripts/phase-5-0c-secondary-crop-diagnostic.py
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
ARTIFACT = "tmp/phase50b-final/vanni240.pose.json"
CANDIDATE_FRAMES = [88, 94, 344, 350, 353]

with open(ARTIFACT, encoding="utf8") as fh:
    artifact = json.load(fh)
W, H = artifact["width"], artifact["height"]
frames_by_index = {f["sourceFrameIndex"]: f for f in artifact["frames"]}

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
TORSO_INDICES = {0: "nose", 11: "left_shoulder", 12: "right_shoulder", 23: "left_hip", 24: "right_hip"}


def geometries(box_cx, box_cy, box_w, box_h):
    """Real, evidence-derived candidate geometries — never a blind uniform
    scale. All anchored on the SAME real localization box center."""
    base_side = max(box_w, box_h) * mpr.EFF_PADDING
    out = {}
    # (a) primary crop as-is (today's real production geometry).
    out["primary"] = (box_cx, box_cy, base_side, base_side)
    # (b) lower-body-preserving: same size, shifted down (more bottom margin,
    #     less top margin) — no change in resolution/zoom.
    out["lower_body_preserving"] = (box_cx, box_cy + base_side * 0.15, base_side, base_side)
    # (c) modest full-body-expanded: uniform +15% (a bounded, real reference
    #     point against Phase 5.0B's own crop-scale-tradeoff evidence).
    out["modest_expanded_15pct"] = (box_cx, box_cy, base_side * 1.15, base_side * 1.15)
    # (d) directional (asymmetric bottom + forward margin only — the
    #     smallest, most targeted real change: taller (not wider) crop,
    #     biased down).
    out["directional_bottom_bias"] = (box_cx, box_cy + base_side * 0.10, base_side, base_side * 1.20)
    return out


cap = cv2.VideoCapture(VIDEO)
results = []
for target_idx in CANDIDATE_FRAMES:
    f = frames_by_index.get(target_idx)
    if not f or not f.get("scientificAthleteBox"):
        continue
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx)
    ok, frame_bgr = cap.read()
    if not ok:
        continue
    frame_bgr = cv2.rotate(frame_bgr, cv2.ROTATE_180)  # registry-documented 180deg rotation
    box = f["scientificAthleteBox"]
    bcx, bcy = (box["x"] + box["width"] / 2.0) * W, (box["y"] + box["height"] / 2.0) * H
    bw, bh = box["width"] * W, box["height"] * H

    for name, (cx, cy, cw, ch) in geometries(bcx, bcy, bw, bh).items():
        x0, y0 = max(0, int(cx - cw / 2)), max(0, int(cy - ch / 2))
        x1, y1 = min(W, int(cx + cw / 2)), min(H, int(cy + ch / 2))
        if x1 - x0 < 8 or y1 - y0 < 8:
            continue
        crop = frame_bgr[y0:y1, x0:x1]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        t0 = time.time()
        result = landmarker.detect(mp_image)
        elapsed_ms = (time.time() - t0) * 1000.0

        detected = bool(result.pose_landmarks)
        foot_conf, torso_conf = {}, {}
        if detected:
            lm = result.pose_landmarks[0]
            for idx, name2 in FOOT_INDICES.items():
                if idx < len(lm):
                    foot_conf[name2] = float(getattr(lm[idx], "visibility", 0.0) or 0.0)
            for idx, name2 in TORSO_INDICES.items():
                if idx < len(lm):
                    torso_conf[name2] = float(getattr(lm[idx], "visibility", 0.0) or 0.0)

        results.append({
            "sourceFrameIndex": target_idx,
            "geometry": name,
            "cropWidthPx": x1 - x0, "cropHeightPx": y1 - y0,
            "detected": detected,
            "ankleRecovered": bool(foot_conf.get("left_ankle", 0) >= 0.4 or foot_conf.get("right_ankle", 0) >= 0.4),
            "heelRecovered": bool(foot_conf.get("left_heel", 0) >= 0.4 or foot_conf.get("right_heel", 0) >= 0.4),
            "footIndexRecovered": bool(foot_conf.get("left_toe", 0) >= 0.4 or foot_conf.get("right_toe", 0) >= 0.4),
            "torsoRetained": bool(torso_conf.get("left_hip", 0) >= 0.4 and torso_conf.get("right_hip", 0) >= 0.4),
            "meanFootConfidence": (sum(foot_conf.values()) / len(foot_conf)) if foot_conf else 0.0,
            "meanTorsoConfidence": (sum(torso_conf.values()) / len(torso_conf)) if torso_conf else 0.0,
            "processingTimeMs": elapsed_ms,
        })
cap.release()
landmarker.close()

by_geom = {}
for r in results:
    by_geom.setdefault(r["geometry"], []).append(r)
summary = {}
for geom, rows in by_geom.items():
    n = len(rows)
    summary[geom] = {
        "n": n,
        "detectRate": sum(1 for r in rows if r["detected"]) / n,
        "ankleRecoveredRate": sum(1 for r in rows if r["ankleRecovered"]) / n,
        "heelRecoveredRate": sum(1 for r in rows if r["heelRecovered"]) / n,
        "footIndexRecoveredRate": sum(1 for r in rows if r["footIndexRecovered"]) / n,
        "torsoRetainedRate": sum(1 for r in rows if r["torsoRetained"]) / n,
        "meanFootConfidence": sum(r["meanFootConfidence"] for r in rows) / n,
        "meanTorsoConfidence": sum(r["meanTorsoConfidence"] for r in rows) / n,
        "meanProcessingTimeMs": sum(r["processingTimeMs"] for r in rows) / n,
    }

output = {"candidateFrames": CANDIDATE_FRAMES, "perFrame": results, "summaryByGeometry": summary}
print(json.dumps(output, indent=2))
with open("tmp/phase50c-secondary-crop-diagnostic.json", "w", encoding="utf8") as fh:
    json.dump(output, fh, indent=2)
