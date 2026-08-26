#!/usr/bin/env python3
"""Phase R3B-5 Parts A/H/I/L -- reruns R3B-4's exact real-production replay
methodology against the NOW-MODIFIED production `tiled_locate()` and the new
`_primary_pass_has_plausible_candidate()` gate, so pre-fix (tmp/phaseR3B4/
candidate-traces/, untouched, kept as the "before" baseline) and post-fix
(tmp/phaseR3B5/candidate-traces/) can be compared frame-for-frame using
identical methodology -- only the two things this phase actually changed
differ (the tile-search ranking policy inside tiled_locate, and the
suppression gate this script's orchestration loop mirrors exactly).

    python3 scripts/phase-r3b5-post-fix-replay.py
"""
import sys, os, json, time
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
MODEL_PATH = os.path.join(RUNTIME_DIR, "models/pose_landmarker_heavy.task")
OUT = os.path.join(ROOT, "tmp/phaseR3B5")
os.makedirs(os.path.join(OUT, "candidate-traces"), exist_ok=True)

sys.path.insert(0, RUNTIME_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ensure_ffprobe_on_path  # noqa: E402,F401 -- Phase R3C fix: must precede real ffprobe-dependent calls (see that module's own docstring for the exact bug this prevents)
import mediapipe_pose_runner as mpr  # noqa: E402  -- the REAL, now-modified production module
import athlete_tracker as at  # noqa: E402

BENCHMARKS = [
    ("gav", os.path.join(ROOT, "tmp/phase50e/sources/gav_stationary_reference.mov"), 60.0),
    ("vanni60", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_60.mov"), 60.0),
    ("vanni120", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_120.mov"), 120.005),
    ("vanni240", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_240.mov"), 239.981),
]
CRITICAL_VANNI60_FRAMES = {0, 6, 7, 8, 20, 21, 27, 30, 32, 33}


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


def process_benchmark(label, src_path, fps, critical_frames=None, max_frames=None):
    if not os.path.exists(src_path):
        print(f"{label}: SKIPPED -- {src_path} not found")
        return None
    if max_frames is None:
        max_frames = int(round(fps * 0.7))
    _probed_rotation_degrees = mpr.probe_rotation_degrees(src_path)
    rotation_code = mpr.rotation_code_for_angle(_probed_rotation_degrees, cv2)

    cap = cv2.VideoCapture(src_path)
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
    tile_locate_count = 0
    t0 = time.time()
    while idx < max_frames:
        ok, frame_bgr = cap.read()
        if not ok:
            break
        frame_bgr = mpr.apply_rotation(frame_bgr, rotation_code, cv2)
        source_timestamp_ms = mpr.monotonic_media_timestamp(cap.get(cv2.CAP_PROP_POS_MSEC), idx, fps, prev_ts)
        prev_ts = source_timestamp_ms

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        primary_result = primary.detect_for_video(mp_image, int(round(source_timestamp_ms)))
        primary_candidates = [
            at.candidate_from_landmarks(lm, width, height, mpr.TRACKER_LANDMARK_NAMES)
            for lm in (primary_result.pose_landmarks or [])
        ]
        candidates = list(primary_candidates)  # mirrors production's own `candidates` accumulation

        # This is the REAL, now-modified gate -- calls the actual production
        # helper function, not a reimplementation.
        primary_plausible = mpr._primary_pass_has_plausible_candidate(primary_candidates)
        search_source = "primary" if primary_plausible else None
        primary_fallback_reason = "primary_accepted" if primary_plausible else None
        tile_invoked = False
        tile_box = tile_confidence = None
        if not primary_plausible:
            primary_fallback_reason = "no_primary" if not any(primary_candidates) else "below_plausibility_floor"
            tile_invoked = True
            tile_box, tile_confidence, tile_landmarks_list = mpr.tiled_locate(
                frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=last_located_x
            )
            tile_locate_count += 1
            if tile_landmarks_list:
                search_source = "tiled"
            for tile_lm in (tile_landmarks_list or []):
                candidates.append(at.candidate_from_landmarks(tile_lm, width, height, mpr.TRACKER_LANDMARK_NAMES))

        record = {
            "sourceFrameIndex": idx, "tMs": round(source_timestamp_ms, 2),
            "width": width, "height": height,
            "primaryPassCandidateCount": len([c for c in primary_candidates if c is not None]),
            "primaryPassCandidates": [
                {"cx": c.cx, "cy": c.cy, "w": c.w, "h": c.h, "completeness": c.completeness} if c else None
                for c in primary_candidates
            ],
            "hintXBeforeThisFrame": last_located_x,
            "searchSource": search_source,
            "primaryFallbackReason": primary_fallback_reason,
            "tileFallback": {
                "invoked": tile_invoked,
                "resultBox": tile_box, "resultConfidence": tile_confidence,
            },
            "totalCandidateCount": len([c for c in candidates if c is not None]),
        }

        best = max((c for c in candidates if c is not None), key=lambda c: c.completeness, default=None)
        box = None
        if tile_box is not None:
            box = tile_box
        elif best is not None:
            box = (best.cx * width, best.cy * height, best.w * width, best.h * height)
        if box is not None:
            last_located_x = box[0]
        frames_out.append(record)
        idx += 1
    cap.release()
    dt = time.time() - t0
    n_primary_plausible = sum(1 for r in frames_out if r["searchSource"] == "primary")
    n_tile_invoked = sum(1 for r in frames_out if r["tileFallback"]["invoked"])
    n_tile_hit = sum(1 for r in frames_out if r["tileFallback"]["invoked"] and r["tileFallback"]["resultBox"] is not None)
    print(f"{label}: {len(frames_out)} frames in {dt:.1f}s -- primaryPlausible={n_primary_plausible} tileInvoked={n_tile_invoked} tileHit={n_tile_hit}")
    with open(os.path.join(OUT, "candidate-traces", f"{label}.json"), "w") as f:
        json.dump(frames_out, f, indent=2)
    return frames_out


if __name__ == "__main__":
    for label, path, fps in BENCHMARKS:
        crit = CRITICAL_VANNI60_FRAMES if label == "vanni60" else set()
        process_benchmark(label, path, fps, critical_frames=crit)
    print(f"\nWrote {OUT}/candidate-traces/*.json")
