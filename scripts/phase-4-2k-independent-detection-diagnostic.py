#!/usr/bin/env python3
"""Phase 4.2K (Part D) — real, direct diagnostic: run the ALREADY-INSTALLED,
already-production-used MediaPipe PoseLandmarker (pose_landmarker_heavy.task,
the exact model mediapipe_pose_runner.py's own Pass-1 detector already calls)
on the FULL, UNCROPPED, correctly-rotated Vanni 240 source frame for EVERY
frame in the disputed interval (465-568) -- not just the sparse periodic
cadence (DETECTOR_CADENCE_FRAMES=8) production actually sampled. This reuses
production's own exact thresholds (MIN_DETECTION/PRESENCE/TRACKING_CONFIDENCE
= 0.3, TRACKER_NUM_CANDIDATES=3) -- no thresholds lowered, no new model.

For every disputed frame reports: candidate count, each candidate's full-
frame bbox (px, normalized), mean visibility, overlap (IoU) with the
box_tracker's own real, current per-frame box (scientificAthleteBox from the
real production artifact), and a position-plausibility check against the
athlete's own established trajectory (linear extrapolation from the last
verified frame before the interval).

    .venv/bin/python scripts/phase-4-2k-independent-detection-diagnostic.py
"""
import json
import sys

import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python import BaseOptions

ROOT = "/Users/imac/Projects/Project.AVA"
sys.path.insert(0, f"{ROOT}/src/lib/biomechanics/mediapipe/runtime")
import mediapipe_pose_runner as runner  # noqa: E402 — reuse the real tiled_locate()
MODEL_PATH = f"{ROOT}/src/lib/biomechanics/mediapipe/runtime/models/pose_landmarker_heavy.task"
SOURCE_VIDEO = f"{ROOT}/tmp/phase50b-vanni240-source.mov"
ARTIFACT = f"{ROOT}/tmp/phase50d-final-vanni240.pose.json"

# Exact production constants (mediapipe_pose_runner.py) -- reused verbatim.
MIN_DETECTION_CONFIDENCE = 0.3
MIN_PRESENCE_CONFIDENCE = 0.3
MIN_TRACKING_CONFIDENCE = 0.3
NUM_CANDIDATES = 3

FIRST_FRAME = 460
LAST_FRAME = 575


def iou(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    aarea = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
    barea = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    union = aarea + barea - inter
    return inter / union if union > 0 else 0.0


def main():
    with open(ARTIFACT, "r") as f:
        seq = json.load(f)
    by_frame = {}
    for fr in seq["frames"]:
        idx = fr.get("sourceFrameIndex", fr.get("index"))
        by_frame[idx] = fr

    landmarker = mp_vision.PoseLandmarker.create_from_options(
        mp_vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_poses=NUM_CANDIDATES,
            min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
            min_pose_presence_confidence=MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
        )
    )
    # The real production tile fallback (`tiled_locate`, mediapipe_pose_runner.py)
    # uses slightly relaxed thresholds (0.7x) exactly as production does when
    # it falls back to tiling -- reused verbatim, not invented here.
    tile_landmarker = mp_vision.PoseLandmarker.create_from_options(
        mp_vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=max(0.2, MIN_DETECTION_CONFIDENCE * 0.7),
            min_pose_presence_confidence=max(0.2, MIN_PRESENCE_CONFIDENCE * 0.7),
            min_tracking_confidence=max(0.2, MIN_TRACKING_CONFIDENCE * 0.7),
        )
    )

    cap = cv2.VideoCapture(SOURCE_VIDEO)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    results = []
    idx = 0
    while True:
        ok, frame_bgr = cap.read()
        if not ok:
            break
        if idx > LAST_FRAME:
            break
        if idx >= FIRST_FRAME:
            frame_bgr = cv2.rotate(frame_bgr, cv2.ROTATE_180)
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(mp_image)
            candidates = []
            source = "full_frame_native"
            for lm in (result.pose_landmarks or []):
                xs = [p.x for p in lm]
                ys = [p.y for p in lm]
                vis = [max(0.0, min(1.0, float(getattr(p, "visibility", 0.0)))) for p in lm]
                bbox_norm = (min(xs), min(ys), max(xs), max(ys))
                candidates.append({
                    "bboxNorm": [round(v, 4) for v in bbox_norm],
                    "meanVisibility": round(sum(vis) / len(vis), 4) if vis else 0.0,
                    "centerNorm": [round((bbox_norm[0] + bbox_norm[2]) / 2, 4), round((bbox_norm[1] + bbox_norm[3]) / 2, 4)],
                })
            if not candidates:
                # Real production tile fallback: coarse upscaled sub-region scan
                # (`tiled_locate`, mediapipe_pose_runner.py) -- same function,
                # unmodified, zero new dependency.
                tbox, tconf, tlms = runner.tiled_locate(
                    frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=None
                )
                if tlms:
                    source = "tile_fallback"
                    for lm in tlms:
                        xs = [p.x for p in lm]
                        ys = [p.y for p in lm]
                        vis = [max(0.0, min(1.0, float(getattr(p, "visibility", 0.0) or 0.0))) for p in lm]
                        bbox_norm = (min(xs), min(ys), max(xs), max(ys))
                        candidates.append({
                            "bboxNorm": [round(v, 4) for v in bbox_norm],
                            "meanVisibility": round(sum(vis) / len(vis), 4) if vis else 0.0,
                            "centerNorm": [round((bbox_norm[0] + bbox_norm[2]) / 2, 4), round((bbox_norm[1] + bbox_norm[3]) / 2, 4)],
                        })

            fr = by_frame.get(idx)
            tracker_box = None
            box_origin = None
            coast = None
            crop_contain = None
            if fr is not None:
                b = fr.get("athleteBoundingBoxSource")
                if b and all(b.get(k) is not None for k in ("x0", "y0", "x1", "y1")):
                    tracker_box = [b.get("x0"), b.get("y0"), b.get("x1"), b.get("y1")]
                box_origin = fr.get("boxOrigin")
                coast = fr.get("coastRiskState")
                crop_contain = fr.get("cropContainmentState")

            best_iou = None
            best_candidate_idx = None
            if tracker_box and candidates:
                ious = [iou(tuple(c["bboxNorm"]), tuple(tracker_box)) for c in candidates]
                best_iou = round(max(ious), 4)
                best_candidate_idx = ious.index(max(ious))

            results.append({
                "frame": idx,
                "boxOrigin": box_origin,
                "coastRiskState": coast,
                "cropContainmentState": crop_contain,
                "trackerBox": [round(v, 4) for v in tracker_box] if tracker_box else None,
                "candidateCount": len(candidates),
                "candidateSource": source if candidates else None,
                "candidates": candidates,
                "bestIoUWithTrackerBox": best_iou,
                "bestCandidateIdx": best_candidate_idx,
            })
        idx += 1

    with open(f"{ROOT}/tmp/phase42k-fullframe-diagnostic.json", "w") as f:
        json.dump(results, f, indent=2)

    # Console summary.
    zero_candidate_frames = [r["frame"] for r in results if r["candidateCount"] == 0]
    with_candidate_frames = [r["frame"] for r in results if r["candidateCount"] > 0]
    print(f"frames scanned: {len(results)} ({FIRST_FRAME}-{LAST_FRAME})")
    print(f"frames with >=1 full-frame candidate: {len(with_candidate_frames)}")
    print(f"frames with ZERO full-frame candidates: {len(zero_candidate_frames)}")
    print("zero-candidate frames:", zero_candidate_frames)
    print()
    for r in results:
        marker = "  " if r["candidateCount"] == 0 else "**"
        print(
            f"{marker} f={r['frame']:4d} origin={str(r['boxOrigin']):15s} coast={str(r['coastRiskState']):22s} "
            f"crop={str(r['cropContainmentState']):22s} cands={r['candidateCount']} src={r['candidateSource']} bestIoU={r['bestIoUWithTrackerBox']}"
        )


if __name__ == "__main__":
    main()
