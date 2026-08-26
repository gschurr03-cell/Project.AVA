#!/usr/bin/env python3
"""Phase 8.1A Part D -- independent raw-source-motion control.

Measures REAL background pixel motion directly from the original source
.mov file, between the reference frame (shortly after zone exit) and the
frame where AVA's own world-lock chain reports maximum drift -- using ORB
feature matching + RANSAC affine estimation on chained sampled frame pairs,
entirely independent of AVA's own camera_path.py/pose-derived estimators
(different algorithm, different code, reads raw video only).

This does NOT read any AVA-computed camera transform as input; it only reads
the tmp/phase81a/{label}-trace.json file to learn WHICH frame indices to
compare (the reference frame and the max-drift frame), and AVA's own
translationX/Y for that span purely for side-by-side reporting/comparison,
never as an input to its own independent estimate.

Read-only, standalone. Not imported by any src/ file, not on any build path.

**CORRECTED in Phase 8.1B-2A** (was a real, disclosed bug through Phase
8.1A): this script originally called `cv2.VideoCapture(...).read()` with NO
rotation correction. The production worker (`mediapipe_pose_runner.py`)
applies `cv2.ROTATE_180` to every decoded frame of all three Vanni source
files before any pose or camera-motion processing (their container `rotate`
tag / `CAP_PROP_ORIENTATION_META` is 180.0; `cv2.VideoCapture.read()` does
NOT apply that metadata on its own). This script's original, uncorrected
output therefore measured motion in a frame orientation 180 DEGREES OFF from
AVA's actual coordinate space -- a 180 deg rotation negates both translation
components (it is a point reflection through the frame center), so every
`independentCumulativeDxPx`/`independentCumulativeDyPx` value this script
produced before this fix should be treated as unreliable for sign comparison
against AVA. Phase 8.1B-1 (Vanni 120) and Phase 8.1B-2A (Vanni 240/60)
independently re-derived corrected motion estimates via
`scripts/phase-8-1b1-vanni120-adjudication.py` /
`scripts/phase-8-1b2a-cross-benchmark-adjudication.py` and found AVA's own
transform matches the corrected, properly-oriented independent estimate to
within roughly a pixel for all three Vanni benchmarks -- see
`docs/phase-8-1b1-vanni-120-camera-motion-adjudication.md` and
`docs/phase-8-1b2a-cross-benchmark-camera-motion-validation.md`.

This script is now fixed in place (rather than retired) so it remains a
correct, reusable reference implementation and so any future run reproduces
a result consistent with the corrected 8.1B-1/8.1B-2A findings instead of
silently reproducing the original orientation bug. The fix: `rotation_code_for(video_path)`
reads `cv2.VideoCapture`'s own `CAP_PROP_ORIENTATION_META` (the same signal
this whole investigation used to first discover the bug) and
`read_frames_at` now applies the matching `cv2.rotate(...)` to every decoded
frame before any feature detection, exactly mirroring the production
worker's `apply_rotation()`. The applied rotation is recorded per-benchmark
in the output JSON (`rotationCodeApplied`) so a stale/uncorrected result can
never again look identical to a corrected one.

    .venv/bin/python scripts/phase-8-1a-raw-source-motion-control.py
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase81a"

SOURCES = {
    "gav": ROOT / "tmp/phase50e/sources/gav_stationary_reference.mov",
    "vanni240": ROOT / "tmp/phase50e/sources/vanni_fly_240.mov",
    "vanni120": ROOT / "tmp/phase50e/sources/vanni_fly_120.mov",
    "vanni60": ROOT / "tmp/phase50e/sources/vanni_fly_60.mov",
}

SAMPLE_STRIDE = 15  # frames between independently-matched sample pairs

_ROTATION_CODE_BY_META = {
    90: cv2.ROTATE_90_CLOCKWISE,
    180: cv2.ROTATE_180,
    270: cv2.ROTATE_90_COUNTERCLOCKWISE,
}


def rotation_code_for(video_path: Path):
    """Mirrors `mediapipe_pose_runner.py`'s `rotation_code_for_angle()`: reads
    the real container rotation metadata and returns the cv2.ROTATE_* code
    needed to correct decoded frames to the SAME orientation the production
    worker uses, or None if the metadata indicates no correction is needed.
    This is the fix for the orientation bug documented in this file's module
    docstring -- every caller in this script MUST route frames through this
    before any feature detection."""
    cap = cv2.VideoCapture(str(video_path))
    meta = cap.get(cv2.CAP_PROP_ORIENTATION_META)
    cap.release()
    angle = round(float(meta)) % 360 if meta else 0
    return _ROTATION_CODE_BY_META.get(angle)


def orb_affine(gray_a, gray_b):
    orb = cv2.ORB_create(nfeatures=2000)
    ka, da = orb.detectAndCompute(gray_a, None)
    kb, db = orb.detectAndCompute(gray_b, None)
    if da is None or db is None or len(ka) < 20 or len(kb) < 20:
        return None
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    matches = bf.knnMatch(da, db, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance]
    if len(good) < 15:
        return None
    pa = np.float32([ka[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    pb = np.float32([kb[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    affine, inliers = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=3000, confidence=0.99)
    if affine is None:
        return None
    inlier_count = int(inliers.sum()) if inliers is not None else 0
    if inlier_count < 12:
        return None
    return {
        "translationXPx": float(affine[0, 2]),
        "translationYPx": float(affine[1, 2]),
        "matchCount": len(good),
        "inlierCount": inlier_count,
    }


def read_frames_at(video_path, indices, rotation_code):
    """Decode the source video once, returning grayscale frames at the
    requested (sorted, deduped) frame indices -- rotated to match the
    production worker's orientation (the Phase 8.1B-2A fix; see module
    docstring). `rotation_code` is None for a clip with no rotation
    metadata (e.g. Gav)."""
    wanted = sorted(set(indices))
    cap = cv2.VideoCapture(str(video_path))
    out = {}
    idx = 0
    want_set = set(wanted)
    max_wanted = wanted[-1]
    while idx <= max_wanted:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in want_set:
            if rotation_code is not None:
                frame = cv2.rotate(frame, rotation_code)
            out[idx] = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        idx += 1
    cap.release()
    return out


def main():
    summary = json.loads((OUT / "drift-summary.json").read_text())
    result = {}
    for label, video_path in SOURCES.items():
        if label not in summary:
            continue
        s = summary[label]
        ref = s["referenceFrame"]
        max_frame = s["perKey"]["bgCenter"]["maxAtFrame"] if s["perKey"].get("bgCenter") else None
        if max_frame is None or max_frame <= ref:
            result[label] = {"skipped": "no drift window (max_frame <= ref or unavailable)"}
            continue
        indices = list(range(ref, max_frame + 1, SAMPLE_STRIDE))
        if indices[-1] != max_frame:
            indices.append(max_frame)
        if not video_path.exists():
            result[label] = {"error": f"source video not found: {video_path}"}
            continue
        rotation_code = rotation_code_for(video_path)
        rotation_label = {cv2.ROTATE_90_CLOCKWISE: "ROTATE_90_CLOCKWISE", cv2.ROTATE_180: "ROTATE_180",
                           cv2.ROTATE_90_COUNTERCLOCKWISE: "ROTATE_90_COUNTERCLOCKWISE", None: "none"}[rotation_code]
        print(f"[{label}] decoding {video_path.name} (rotationCodeApplied={rotation_label}), "
              f"sampling {len(indices)} frames from {ref} to {max_frame}...")
        frames = read_frames_at(video_path, indices, rotation_code)
        pairs = []
        cum_x, cum_y = 0.0, 0.0
        ok_all = True
        for a, b in zip(indices, indices[1:]):
            if a not in frames or b not in frames:
                ok_all = False
                continue
            est = orb_affine(frames[a], frames[b])
            if est is None:
                pairs.append({"from": a, "to": b, "failed": True})
                ok_all = False
                continue
            cum_x += est["translationXPx"]
            cum_y += est["translationYPx"]
            pairs.append({"from": a, "to": b, **est})
        avaGate = s["perKey"]["startC1"]
        avaBg = s["perKey"]["bgCenter"]
        result[label] = {
            "referenceFrame": ref,
            "maxDriftFrame": max_frame,
            "sampleStride": SAMPLE_STRIDE,
            "rotationCodeApplied": rotation_label,
            "allPairsMatched": ok_all,
            "pairs": pairs,
            "independentCumulativeDxPx": cum_x,
            "independentCumulativeDyPx": cum_y,
            "independentCumulativeDistPx": math.hypot(cum_x, cum_y),
            "avaGateStartC1DxPx": avaGate["maxXPx"] if avaGate else None,
            "avaGateStartC1DyPx": avaGate["maxYPx"] if avaGate else None,
            "avaBgCenterDxPx": avaBg["maxXPx"] if avaBg else None,
            "avaBgCenterDyPx": avaBg["maxYPx"] if avaBg else None,
        }
        print(json.dumps(result[label], indent=2))
    (OUT / "raw-source-motion-control.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print("\nWrote tmp/phase81a/raw-source-motion-control.json")


if __name__ == "__main__":
    main()
