#!/usr/bin/env python3
"""Phase R3B-4 Parts A/B/C/E/F/G/M/N -- runs the REAL, unmodified production
detection stack (mediapipe_pose_runner.py's own `tiled_locate`,
`make_options`, `apply_rotation`, `rotation_code_for_angle`,
`monotonic_media_timestamp`, `TRACKER_LANDMARK_NAMES`, confidence constants)
against the real Vanni 60 (and Gav/Vanni120/Vanni240 control) source videos.

Deliberately does NOT reimplement tiled_locate or the primary detector call
-- imports and calls the real functions directly, per this phase's explicit
requirement. The only thing NOT replicated is the full box_tracker.py
continuous-tracking/optical-flow state machine (a separate, already-audited
layer) -- `hint_x` here is computed the same way production's own
`last_located_x` is in the common "a real candidate existed" case (updated
from whichever candidate -- primary-pass or tile-fallback -- was found each
frame), which is the same quantity `tiled_locate` actually consumes. This
scope boundary is disclosed, not hidden.

Read-only: never writes to Supabase, never touches a production artifact
path, never mutates the DB.

    python3 scripts/phase-r3b4-real-production-replay.py
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
OUT = os.path.join(ROOT, "tmp/phaseR3B4")
os.makedirs(os.path.join(OUT, "tile-layouts"), exist_ok=True)
os.makedirs(os.path.join(OUT, "candidate-traces"), exist_ok=True)

sys.path.insert(0, RUNTIME_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ensure_ffprobe_on_path  # noqa: E402,F401 -- Phase R3C fix: must precede real ffprobe-dependent calls (see that module's own docstring for the exact bug this prevents)
import mediapipe_pose_runner as mpr  # noqa: E402  -- the REAL production module, unmodified
import athlete_tracker as at  # noqa: E402

BENCHMARKS = [
    ("gav", os.path.join(ROOT, "tmp/phase50e/sources/gav_stationary_reference.mov"), 60.0),
    ("vanni60", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_60.mov"), 60.0),
    ("vanni120", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_120.mov"), 120.005),
    ("vanni240", os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_240.mov"), 239.981),
]

CRITICAL_VANNI60_FRAMES = {0, 6, 7, 8, 20, 21, 27, 30, 32, 33}


def make_primary_landmarker():
    """The REAL primary pass's own options: num_poses=TRACKER_NUM_CANDIDATES
    (3), VIDEO mode -- exactly mediapipe_pose_runner.py's own `loc`."""
    return mp_vision.PoseLandmarker.create_from_options(
        mpr.make_options(MODEL_PATH, mp_python, mp_vision, num_poses=mpr.TRACKER_NUM_CANDIDATES)
    )


def make_tile_landmarker():
    """The REAL tile-fallback landmarker's own options -- exactly
    mediapipe_pose_runner.py's own `tile_landmarker` construction."""
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


def full_tile_sweep(frame_bgr, width, height, tile_landmarker, hint_x=None):
    """Diagnostic-only (Part B/C/D/J): the REAL tile geometry/upscale/detect
    call, per tile, WITHOUT stopping at the first hit (production's real
    `tiled_locate` stops early -- this continues, using the exact same
    `mpr._tile_starts`, same tile width/upscale constants, same per-tile
    `landmarker.detect()` call) so every tile's outcome is visible for
    coverage/ranking analysis. Does not change what `tiled_locate` itself
    returns; called SEPARATELY from the real `tiled_locate` call below."""
    tile_width = max(32, int(round(width * mpr.ROI_TILE_WIDTH_FRAC)))
    starts = mpr._tile_starts(width, tile_width)
    ordered = sorted(starts, key=lambda s: abs((s + tile_width / 2.0) - hint_x)) if hint_x is not None else starts
    results = []
    for tx in ordered:
        tile = frame_bgr[0:height, tx:tx + tile_width]
        if tile.shape[0] < 4 or tile.shape[1] < 4:
            results.append({"tileX": tx, "tileWidth": tile_width, "skipped": "degenerate_tile"})
            continue
        big = cv2.resize(tile, (int(tile.shape[1] * mpr.ROI_TILE_UPSCALE), int(tile.shape[0] * mpr.ROI_TILE_UPSCALE)), interpolation=cv2.INTER_CUBIC)
        rgb = cv2.cvtColor(big, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = tile_landmarker.detect(mp_image)
        if result.pose_landmarks:
            lm = result.pose_landmarks[0]
            values = [max(0.0, min(1.0, float(getattr(p, "visibility", 0.0)))) for p in lm]
            confidence = sum(values) / len(values) if values else 0.0
            remapped_cx = (tx + lm[0].x * tile_width) / float(width)  # nose x, remapped -- coarse locator, matches production's own box[0] semantics
            results.append({"tileX": tx, "tileWidth": tile_width, "detected": True, "meanVisibilityConfidence": confidence, "remappedNoseX": remapped_cx, "landmarkCount": len(lm)})
        else:
            results.append({"tileX": tx, "tileWidth": tile_width, "detected": False})
    return results


def full_frame_control(frame_bgr, width, height, control_landmarker):
    """Part E -- diagnostic full-frame pass using the SAME production model
    file and confidence thresholds as the primary pass, num_poses=3, but in
    IMAGE mode (single-shot, no video timestamp state) so it can be rerun
    freely on arbitrary frames without corrupting a VIDEO-mode timestamp
    stream. This is the production detector, not a new one."""
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = control_landmarker.detect(mp_image)
    out = []
    for lm in (result.pose_landmarks or []):
        values = [max(0.0, min(1.0, float(getattr(p, "visibility", 0.0)))) for p in lm]
        confidence = sum(values) / len(values) if values else 0.0
        xs = [p.x for p in lm]
        out.append({"meanVisibilityConfidence": confidence, "noseX": lm[0].x, "boundsX": [min(xs), max(xs)]})
    return out


def upscale_control(frame_bgr, width, height, control_landmarker, cx_norm, cy_norm, half_w_norm, factors):
    """Part F -- crop the SAME real region a real athlete occupies (from
    that frame's own resolved candidate/box, not a guess) and re-detect at
    several resize factors, using the production model/thresholds. Reports
    athlete pixel height/width at each scale and whether the SAME model
    detects it there."""
    x0 = max(0, int((cx_norm - half_w_norm) * width))
    x1 = min(width, int((cx_norm + half_w_norm) * width))
    y0, y1 = 0, height
    crop = frame_bgr[y0:y1, x0:x1]
    out = {}
    for factor in factors:
        if crop.shape[0] < 4 or crop.shape[1] < 4:
            out[str(factor)] = {"skipped": "degenerate_crop"}
            continue
        big = cv2.resize(crop, (int(crop.shape[1] * factor), int(crop.shape[0] * factor)), interpolation=cv2.INTER_CUBIC)
        rgb = cv2.cvtColor(big, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = control_landmarker.detect(mp_image)
        detected = bool(result.pose_landmarks)
        athlete_px_h = None
        if detected:
            lm = result.pose_landmarks[0]
            ys = [p.y * big.shape[0] for p in lm]
            xs = [p.x * big.shape[1] for p in lm]
            athlete_px_h = max(ys) - min(ys)
            athlete_px_w = max(xs) - min(xs)
        out[str(factor)] = {
            "cropPixelSize": [crop.shape[1], crop.shape[0]],
            "resizedPixelSize": [big.shape[1], big.shape[0]],
            "detected": detected,
            "athletePixelHeightAtThisScale": athlete_px_h if detected else None,
        }
    return out


def process_benchmark(label, src_path, fps, critical_frames=None, max_frames=None):
    if not os.path.exists(src_path):
        print(f"{label}: SKIPPED -- {src_path} not found")
        return None
    if max_frames is None:
        max_frames = int(round(fps * 0.7))  # ~700ms, comfortably past every benchmark's own warmup window
    _probed_rotation_degrees = mpr.probe_rotation_degrees(src_path)
    rotation_code = mpr.rotation_code_for_angle(_probed_rotation_degrees, cv2)

    cap = cv2.VideoCapture(src_path)
    primary = make_primary_landmarker()
    tile_landmarker = make_tile_landmarker()
    control_landmarker = mp_vision.PoseLandmarker.create_from_options(
        mpr.make_options(MODEL_PATH, mp_python, mp_vision, num_poses=mpr.TRACKER_NUM_CANDIDATES)
    )  # IMAGE-mode-compatible instance reused for full-frame/upscale controls -- must be IMAGE mode
    control_landmarker_image = mp_vision.PoseLandmarker.create_from_options(
        mp_vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_poses=mpr.TRACKER_NUM_CANDIDATES,
            min_pose_detection_confidence=mpr.MIN_DETECTION_CONFIDENCE,
            min_pose_presence_confidence=mpr.MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=mpr.MIN_TRACKING_CONFIDENCE,
        )
    )

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if rotation_code in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
        width, height = height, width

    frames_out = []
    last_located_x = None
    prev_ts = None
    idx = 0
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
        record = {
            "sourceFrameIndex": idx, "tMs": round(source_timestamp_ms, 2),
            "rotationCode": rotation_code, "probedRotationDegrees": _probed_rotation_degrees,
            "width": width, "height": height,
            "primaryPassPoseCount": len(primary_result.pose_landmarks or []),
            "primaryPassCandidateCount": len([c for c in primary_candidates if c is not None]),
            "primaryPassCandidates": [
                {"cx": c.cx, "cy": c.cy, "w": c.w, "h": c.h, "completeness": c.completeness} if c else None
                for c in primary_candidates
            ],
            "hintXBeforeThisFrame": last_located_x,
        }
        used_tile_fallback = not any(primary_candidates)
        if used_tile_fallback:
            tile_box, tile_confidence, tile_landmarks_list = mpr.tiled_locate(
                frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=last_located_x
            )
            record["tileFallback"] = {
                "invoked": True,
                "resultBox": tile_box, "resultConfidence": tile_confidence,
                "resultCandidateCount": len(tile_landmarks_list or []),
            }
            record["tileSweepDiagnostic"] = full_tile_sweep(frame_bgr, width, height, tile_landmarker, hint_x=last_located_x) if idx in (critical_frames or set()) else None
            box = tile_box
        else:
            record["tileFallback"] = {"invoked": False}
            best = max((c for c in primary_candidates if c is not None), key=lambda c: c.completeness, default=None)
            box = (best.cx * width, best.cy * height, best.w * width, best.h * height) if best else None

        if idx in (critical_frames or set()):
            record["fullFrameControl"] = full_frame_control(frame_bgr, width, height, control_landmarker_image)
            hx = (box[0] / width) if box else (last_located_x / width if last_located_x else 0.15)
            hy = 0.4
            record["upscaleControl"] = upscale_control(frame_bgr, width, height, control_landmarker_image, hx, hy, 0.15, [1.0, 2.0, 3.0, 4.5, 6.0])

        if box is not None:
            last_located_x = box[0]
        frames_out.append(record)
        idx += 1
    cap.release()
    dt = time.time() - t0
    n_primary_hit = sum(1 for r in frames_out if r["primaryPassCandidateCount"] > 0)
    n_tile_invoked = sum(1 for r in frames_out if r["tileFallback"]["invoked"])
    n_tile_hit = sum(1 for r in frames_out if r["tileFallback"]["invoked"] and r["tileFallback"]["resultBox"] is not None)
    print(f"{label}: {len(frames_out)} frames in {dt:.1f}s -- primaryHit={n_primary_hit} tileInvoked={n_tile_invoked} tileHit={n_tile_hit}")
    with open(os.path.join(OUT, "candidate-traces", f"{label}.json"), "w") as f:
        json.dump(frames_out, f, indent=2)
    return frames_out


if __name__ == "__main__":
    identities = {
        "gav": {"sessionId": "e04a7983-7406-4a00-bb89-8ada7b10bf9f", "source": "tmp/phase50e/sources/gav_stationary_reference.mov", "fps": 60.0},
        "vanni60": {"sessionId": "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", "source": "tmp/phase50e/sources/vanni_fly_60.mov", "fps": 60.0},
        "vanni120": {"sessionId": "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", "source": "tmp/phase50e/sources/vanni_fly_120.mov", "fps": 120.005},
        "vanni240": {"sessionId": "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", "source": "tmp/phase50e/sources/vanni_fly_240.mov", "fps": 239.981},
    }
    with open(os.path.join(OUT, "benchmark-identities.json"), "w") as f:
        json.dump(identities, f, indent=2)

    for label, path, fps in BENCHMARKS:
        crit = CRITICAL_VANNI60_FRAMES if label == "vanni60" else set()
        process_benchmark(label, path, fps, critical_frames=crit)

    print(f"\nWrote {OUT}/candidate-traces/*.json and {OUT}/benchmark-identities.json")
