#!/usr/bin/env python3
"""Phase R3B-2 Part A/B -- REAL, isolated MediaPipe inference against real
source video frames for the startup window of each benchmark, to answer the
core question: does the ~51.5% completeness ceiling observed in R3B-1's
stored-artifact replay reflect real MediaPipe output, or a downstream
storage-trimming artifact?

Methodology correction (found empirically this phase): a naive full-frame
(1920x1080) MediaPipe call finds NOTHING in the first 35 frames of any
benchmark -- the athlete is too small/distant relative to the whole frame
for the plain single-shot call to succeed, exactly matching the
already-established "small/distant athlete" finding (Phase 4.2/9.1A). The
REAL production worker (mediapipe_pose_runner.py) already has a proven
answer to this: `tiled_locate()` -- splits the frame into overlapping
25%-width vertical bands, upscales each 3x, and runs detection per tile.
This script re-implements that EXACT function (same constants: 0.25 tile
width, 0.125 step, 3.0 upscale) rather than approximating it, so results are
a faithful reproduction of what the real worker's own fallback path would
have found -- not a different, weaker methodology.

Uses the SAME real pose_landmarker_heavy.task model and the SAME
sequential-decode technique (never CAP_PROP_POS_FRAMES/avg_frame_rate) this
session has used since Phase 6.2B/7.3A/9.1A/R3A. Read-only: does not touch
any database row, does not write to any production artifact path.

  python3 scripts/phase-r3b2-raw-inference-trace.py
"""
import sys, os, json, time
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
MODEL_PATH = os.path.join(RUNTIME_DIR, "models/pose_landmarker_heavy.task")
OUT = os.path.join(ROOT, "tmp/phaseR3B2")
os.makedirs(os.path.join(OUT, "full-worker-startup-traces"), exist_ok=True)

sys.path.insert(0, RUNTIME_DIR)
from athlete_tracker import LANDMARK_VISIBILITY_FLOOR  # noqa: E402

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROI_TILE_WIDTH_FRAC = 0.25
ROI_TILE_STEP_FRAC = 0.125
ROI_TILE_UPSCALE = 3.0

MP_33_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
    "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot_index", "right_foot_index",
]
TORSO_NAMES = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")

BENCHMARKS = [
    ("gav", os.path.join(ROOT, "tmp/phase50e/sources/gav_stationary_reference.mov"), 60.0),
    ("vanni60", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_60.mov"), 60.0),
    ("vanni120", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_120.mov"), 120.005),
    ("vanni240", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_240.mov"), 239.981),
]


def make_landmarker():
    options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.3,
        min_pose_presence_confidence=0.3,
    )
    return mp_vision.PoseLandmarker.create_from_options(options)


def _tile_starts(width, tile_width):
    step = max(1, int(round(tile_width * ROI_TILE_STEP_FRAC / ROI_TILE_WIDTH_FRAC)))
    starts = list(range(0, max(1, width - tile_width) + step, step))
    return sorted(set(min(s, max(0, width - tile_width)) for s in starts))


def tiled_locate(frame_bgr, width, height, landmarker, hint_x=None):
    """Faithful reproduction of mediapipe_pose_runner.py's own tiled_locate."""
    tile_width = max(32, int(round(width * ROI_TILE_WIDTH_FRAC)))
    starts = _tile_starts(width, tile_width)
    if hint_x is not None:
        starts = sorted(starts, key=lambda s: abs((s + tile_width / 2.0) - hint_x))
    for tx in starts:
        tile = frame_bgr[0:height, tx:tx + tile_width]
        if tile.shape[0] < 4 or tile.shape[1] < 4:
            continue
        big = cv2.resize(tile, (int(tile.shape[1] * ROI_TILE_UPSCALE), int(tile.shape[0] * ROI_TILE_UPSCALE)), interpolation=cv2.INTER_CUBIC)
        rgb = cv2.cvtColor(big, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = landmarker.detect(mp_image)
        if result.pose_landmarks:
            lm = result.pose_landmarks[0]
            # Remap tile-normalized x back to FULL-FRAME normalized x; y is
            # already full-height-relative since tiles span the full height.
            remapped = [(name, (tx + p.x * tile_width) / float(width), p.y, getattr(p, "visibility", 0.0)) for name, p in zip(MP_33_NAMES, lm)]
            return tx, remapped
    return None, None


def process_benchmark(label, src_path, fps, max_frames=None):
    if max_frames is None:
        max_frames = int(round(fps * 0.6))  # ~600ms, comfortably past every benchmark's R3A warmup window
    if not os.path.exists(src_path):
        print(f"{label}: SKIPPED -- source file not found ({src_path})")
        return None
    cap = cv2.VideoCapture(src_path)
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    landmarker = make_landmarker()
    frames_out = []
    idx = 0
    hint_x = None
    t0 = time.time()
    while idx < max_frames:
        ok, bgr = cap.read()
        if not ok:
            break
        h, w = bgr.shape[:2]
        tile_x, remapped = tiled_locate(bgr, w, h, landmarker, hint_x=hint_x)
        record = {"sourceFrameIndex": idx, "tMs": round(idx * (1000.0 / fps), 2)}
        if remapped is None:
            record.update({"detected": False, "rawLandmarkCount": 0, "rawCompleteness": 0.0, "torsoComplete": False})
        else:
            hint_x = tile_x + max(32, int(round(w * ROI_TILE_WIDTH_FRAC))) / 2.0
            present = sum(1 for _, _, _, vis in remapped if vis >= LANDMARK_VISIBILITY_FLOOR)
            torso_present = sum(1 for name, _, _, vis in remapped if name in TORSO_NAMES and vis >= LANDMARK_VISIBILITY_FLOOR)
            xs = [x for _, x, _, _ in remapped]
            ys = [y for _, _, y, _ in remapped]
            record.update({
                "detected": True,
                "tileX": tile_x,
                "rawLandmarkCount": present,
                "rawCompleteness": present / 33.0,
                "torsoLandmarksPresent": torso_present,
                "torsoComplete": torso_present == 4,
                "poseBounds": {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)},
                "perLandmarkVisibility": {name: round(float(vis), 4) for name, _, _, vis in remapped},
                # Full per-point x/y/visibility (normalized full-frame coords) --
                # needed to reconstruct real Candidate objects for a faithful
                # AthleteTracker replay (Part L), not just summary statistics.
                "landmarks": {name: [round(float(x), 6), round(float(y), 6), round(float(vis), 4)] for name, x, y, vis in remapped},
            })
        frames_out.append(record)
        idx += 1
    cap.release()
    dt = time.time() - t0
    n_detected = sum(1 for r in frames_out if r["detected"])
    print(f"{label}: {len(frames_out)} frames real-tiled-inferenced in {dt:.1f}s -- {n_detected}/{len(frames_out)} detected")
    return frames_out


if __name__ == "__main__":
    results = {}
    for label, path, fps in BENCHMARKS:
        r = process_benchmark(label, path, fps)
        if r is not None:
            results[label] = r
            with open(os.path.join(OUT, "full-worker-startup-traces", f"{label}.json"), "w") as f:
                json.dump(r, f, indent=2)
    with open(os.path.join(OUT, "pose-completeness-stage-trace-raw.json"), "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {OUT}/pose-completeness-stage-trace-raw.json")
