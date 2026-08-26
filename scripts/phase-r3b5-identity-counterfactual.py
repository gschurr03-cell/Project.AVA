#!/usr/bin/env python3
"""Phase R3B-5 Part N -- feeds the POST-FIX real detection stream (using the
now-modified production tiled_locate/_primary_pass_has_plausible_candidate)
through the UNCHANGED (R3B-3-shipped, untouched this phase) AthleteTracker,
and compares against the pre-fix stream, to determine whether Vanni 60's
identity lock improves beyond 400ms. Captures full per-landmark data (the
post-fix candidate-traces script only kept box-level summaries) so real
Candidate objects (with .landmarks, needed by R3B-3's torso-corroboration
path) can be reconstructed faithfully.

    python3 scripts/phase-r3b5-identity-counterfactual.py
"""
import sys, os, json, time, contextlib
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
MODEL_PATH = os.path.join(RUNTIME_DIR, "models/pose_landmarker_heavy.task")
OUT = os.path.join(ROOT, "tmp/phaseR3B5")
sys.path.insert(0, RUNTIME_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ensure_ffprobe_on_path  # noqa: E402,F401 -- Phase R3C fix: must precede real ffprobe-dependent calls (see that module's own docstring for the exact bug this prevents)
import mediapipe_pose_runner as mpr  # noqa: E402
import athlete_tracker as at  # noqa: E402

SRC = os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_60.mov")
FPS = 60.0
MAX_FRAMES = int(round(FPS * 0.7))


def make_primary_landmarker():
    return mp_vision.PoseLandmarker.create_from_options(
        mpr.make_options(MODEL_PATH, mp_python, mp_vision, num_poses=mpr.TRACKER_NUM_CANDIDATES)
    )


def make_tile_landmarker():
    return mp_vision.PoseLandmarker.create_from_options(
        mp_vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=max(0.2, mpr.MIN_DETECTION_CONFIDENCE * 0.7),
            min_pose_presence_confidence=max(0.2, mpr.MIN_PRESENCE_CONFIDENCE * 0.7),
            min_tracking_confidence=max(0.2, mpr.MIN_TRACKING_CONFIDENCE * 0.7),
        )
    )


def gather_post_fix_candidates():
    """Real production replay, POST-FIX, capturing full per-candidate
    landmark dicts (cx,cy,w,h,landmarks,completeness) so real Candidate
    objects can be replayed through athlete_tracker.py exactly."""
    rotation_code = mpr.rotation_code_for_angle(mpr.probe_rotation_degrees(SRC), cv2)
    cap = cv2.VideoCapture(SRC)
    primary = make_primary_landmarker()
    tile_landmarker = make_tile_landmarker()
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if rotation_code in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
        width, height = height, width

    frames_out = []
    last_located_x = None
    prev_ts = None
    idx = 0
    while idx < MAX_FRAMES:
        ok, frame_bgr = cap.read()
        if not ok:
            break
        frame_bgr = mpr.apply_rotation(frame_bgr, rotation_code, cv2)
        source_timestamp_ms = mpr.monotonic_media_timestamp(cap.get(cv2.CAP_PROP_POS_MSEC), idx, FPS, prev_ts)
        prev_ts = source_timestamp_ms
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        primary_result = primary.detect_for_video(mp_image, int(round(source_timestamp_ms)))
        primary_candidates = [
            at.candidate_from_landmarks(lm, width, height, mpr.TRACKER_LANDMARK_NAMES)
            for lm in (primary_result.pose_landmarks or [])
        ]
        candidates = list(primary_candidates)
        primary_plausible = mpr._primary_pass_has_plausible_candidate(primary_candidates)
        if not primary_plausible:
            tile_box, tile_confidence, tile_landmarks_list = mpr.tiled_locate(
                frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=last_located_x
            )
            for tile_lm in (tile_landmarks_list or []):
                candidates.append(at.candidate_from_landmarks(tile_lm, width, height, mpr.TRACKER_LANDMARK_NAMES))
        best = max((c for c in candidates if c is not None), key=lambda c: c.completeness, default=None)
        box = (best.cx * width, best.cy * height, best.w * width, best.h * height) if best else None
        if box is not None:
            last_located_x = box[0]
        frames_out.append({
            "sourceFrameIndex": idx, "tMs": round(source_timestamp_ms, 2),
            "candidates": [
                {"cx": c.cx, "cy": c.cy, "w": c.w, "h": c.h, "completeness": c.completeness, "landmarks": {k: list(v) for k, v in c.landmarks.items()}}
                for c in candidates if c is not None
            ],
        })
        idx += 1
    cap.release()
    return frames_out


def build_candidates(record):
    out = []
    for c in record["candidates"]:
        lm = {k: tuple(v) for k, v in c["landmarks"].items()}
        out.append(at.Candidate(c["cx"], c["cy"], c["w"], c["h"], lm, c["completeness"]))
    return out


def replay(frames, fps=FPS):
    tracker = at.AthleteTracker(travel_direction="left_to_right", fps=fps, entry_gate=None)
    first_tracked = None
    for fr in frames:
        cands = build_candidates(fr)
        result = tracker.step(cands if cands else [None], fr["sourceFrameIndex"], fr["tMs"] / 1000.0)
        if first_tracked is None and result["identityState"] == "tracked":
            first_tracked = {"sourceFrameIndex": fr["sourceFrameIndex"], "tMs": fr["tMs"], "reason": result["identityPromotionReason"]}
            break
    return first_tracked


if __name__ == "__main__":
    print("Gathering post-fix candidates with full landmark data (this reruns real MediaPipe inference)...")
    post_fix_frames = gather_post_fix_candidates()
    with open(os.path.join(OUT, "post-fix-vanni60-full-candidates.json"), "w") as f:
        json.dump(post_fix_frames, f, indent=2)

    after = replay(post_fix_frames)
    print(f"Vanni60 identity lock (post-fix real detection stream, unchanged athlete_tracker.py): {after}")

    result = {
        "postFixIdentityLock": after,
        "priorR3B3ShippedResult": {"sourceFrameIndex": 24, "tMs": 400.0, "reason": "torso_corroborated"},
        "comparisonNote": "R3B-3's own shipped result (400.0ms) was measured against R3B-4's PRE-FIX candidate stream (same underlying video, same unchanged athlete_tracker.py) -- this run uses the exact same unchanged identity code against the NEW, POST-FIX detection stream (R3B-5's only change).",
    }
    with open(os.path.join(OUT, "startup-latency-identity-counterfactual.json"), "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))
