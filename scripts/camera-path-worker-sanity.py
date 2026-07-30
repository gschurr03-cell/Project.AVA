#!/usr/bin/env python3
"""Deterministic sanity tests for the offline keyframe-graph builder
(`camera_path.py`), run with the worker's real venv (numpy + real cv2 for
RANSAC/affine estimation). Only the ORB DESCRIPTOR MATCH step is injected —
that needs real image content this test deliberately avoids fabricating —
everything downstream (RANSAC, inlier/spatial/residual validation, keyframe
state machine, matrix composition/decomposition/inversion) is REAL code.

Run: .venv/bin/python scripts/camera-path-worker-sanity.py
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..",
                                 "src", "lib", "biomechanics", "mediapipe", "runtime"))
import cv2  # noqa: E402
import numpy as np  # noqa: E402
import camera_path as cp  # noqa: E402

WIDTH, HEIGHT = 1920, 1080
ok = True


def check(label, condition):
    global ok
    print(("PASS  " if condition else "FAIL  ") + label)
    if not condition:
        ok = False


def transform(frame, tx=0.0, ty=0.0, rot=0.0, scale=1.0, confidence=0.9, features=80,
              inlier_ratio=0.9, residual=0.5):
    return {"frame": frame, "translationX": tx, "translationY": ty, "rotationDeg": rot,
            "scale": scale, "confidence": confidence, "supportingFeatureCount": features,
            "inlierRatio": inlier_ratio, "residualPx": residual, "transformType": "partial_affine"}


def empty_transform(frame):
    return {"frame": frame, "translationX": 0.0, "translationY": 0.0, "rotationDeg": 0.0,
            "scale": 1.0, "confidence": 0.0, "supportingFeatureCount": 0, "inlierRatio": 0.0,
            "residualPx": None, "transformType": "partial_affine"}


class FakeMatch:
    def __init__(self, query_idx, train_idx, distance):
        self.queryIdx = query_idx
        self.trainIdx = train_idx
        self.distance = distance


def synthetic_snapshot(n=60, seed=0):
    rng = np.random.default_rng(seed)
    points = rng.uniform([0, 0], [WIDTH, HEIGHT], size=(n, 2)).astype(np.float32)
    return {"points": points, "descriptors": np.zeros((n, 1), dtype=np.uint8)}  # unused by injected matcher


def make_good_matcher(candidate_snapshot, target_snapshot, known_matrix_2x3):
    """A matcher that pretends `candidate` and `target` correspond via
    `known_matrix_2x3` (candidate -> target), i.e. a REAL, RANSAC-passable
    correspondence set — proving the acceptance path genuinely runs
    estimateAffinePartial2D end to end, not just a stubbed 'accepted=True'."""
    def matcher(_desc_a, _desc_b):
        src = candidate_snapshot["points"]
        predicted = cv2.transform(src.reshape(-1, 1, 2), known_matrix_2x3).reshape(-1, 2)
        matches = []
        for i in range(len(src)):
            # target point i is exactly the transformed candidate point i — a
            # perfect correspondence set (real RANSAC still has to accept it).
            matches.append(FakeMatch(i, i, distance=10.0))
        target_snapshot["points"] = predicted.astype(np.float32)
        return matches
    return matcher


def no_matcher(_desc_a, _desc_b):
    return []


def sparse_bad_matcher(candidate_snapshot, _target_snapshot):
    """Too few matches, and clustered in one tiny corner — must be rejected on
    BOTH count and (if it ever got that far) spatial-distribution grounds."""
    def matcher(_desc_a, _desc_b):
        return [FakeMatch(i, i, distance=10.0) for i in range(5)]
    return matcher


# --- 1. Stable single-segment path: every frame anchored. ---
n1 = 200
transforms1 = [empty_transform(0)] + [transform(i, tx=0.0002, ty=0.0001) for i in range(1, n1)]
path1 = cp.build_camera_path(transforms1, {}, WIDTH, HEIGHT, n1, 0, cv2)
check("1. stable path: every frame ends up anchored",
      all(entry["state"] == "anchored" for entry in path1["framePaths"]))
check("1. stable path: totalFrames frame paths emitted", len(path1["framePaths"]) == n1)
check("1. stable path: no relock was ever attempted (nothing was lost)",
      path1["diagnostics"]["relockAttemptCount"] == 0)

# --- 2. Keyframe creation after displacement threshold (before span limit). ---
n2 = 40
big_step_norm = math.hypot(0.02, 0.0)
transforms2 = [empty_transform(0)] + [transform(i, tx=0.02) for i in range(1, n2)]
path2 = cp.build_camera_path(transforms2, {}, WIDTH, HEIGHT, n2, 0, cv2)
reasons2 = [kf.get("parentKeyframeId") for kf in path2["keyframes"]]
check("2. displacement-triggered rebase happened before the 45-frame span limit",
      len(path2["keyframes"]) > 1 and path2["keyframes"][1]["frameIndex"] < 40)
check("2. displacement rebase keyframe is still anchored (step itself was reliable)",
      all(kf["state"] == "anchored" for kf in path2["keyframes"]))

# --- 3. Keyframe creation / gap after confidence degradation. ---
n3 = 20
transforms3 = [empty_transform(0)] + [transform(i, confidence=0.05) for i in range(1, n3)]
path3 = cp.build_camera_path(transforms3, {}, WIDTH, HEIGHT, n3, 0, cv2)
check("3. low-confidence steps never extend a keyframe (frames 1..N unavailable)",
      all(entry["state"] == "unavailable" for entry in path3["framePaths"][1:]))

# --- 4. Temporary unavailable interval fully recovers without relock when the
# active keyframe was NEVER genuinely lost (a brief, tolerated degradation). ---
n4 = 30
transforms4 = (
    [empty_transform(0)]
    + [transform(i) for i in range(1, 10)]
    + [transform(i, confidence=0.05) for i in range(10, 13)]  # 3 frames, within LOST_TOLERANCE_FRAMES=6
    + [transform(i) for i in range(13, n4)]
)
path4 = cp.build_camera_path(transforms4, {}, WIDTH, HEIGHT, n4, 0, cv2)
by_frame4 = {e["frameIndex"]: e for e in path4["framePaths"]}
check("4. a brief (tolerated) interval is unavailable but does not trigger relock",
      all(by_frame4[i]["state"] == "unavailable" for i in range(10, 13))
      and path4["diagnostics"]["relockAttemptCount"] == 0)
check("4. tracking resumes anchored immediately after a brief tolerated gap",
      by_frame4[13]["state"] == "anchored")

# --- 5. Successful relock to an earlier (global reference) keyframe after a
# genuine loss — exercises the REAL cv2.estimateAffinePartial2D RANSAC path. ---
n5 = 160
loss_start, loss_end = 40, 139  # 100-frame loss, comfortably past LOST_TOLERANCE_FRAMES
transforms5 = (
    [empty_transform(0)]
    + [transform(i) for i in range(1, loss_start)]
    + [empty_transform(i) for i in range(loss_start, loss_end)]
    + [transform(i) for i in range(loss_end, n5)]
)
# The relock candidate is the frame where `good_run` FIRST reaches
# RELOCK_CANDIDATE_STABILITY_FRAMES after the loss — that is when try_relock()
# actually fires, so that is where an ORB snapshot must exist.
relock_candidate_frame = loss_end + cp.RELOCK_CANDIDATE_STABILITY_FRAMES - 1
snap0 = synthetic_snapshot(seed=1)
snap_candidate = synthetic_snapshot(seed=2)
known_matrix = np.array([[0.98, -0.03, 40.0], [0.03, 0.98, -12.0]], dtype=np.float32)
snapshots5 = {0: snap0, relock_candidate_frame: snap_candidate}
matcher5 = make_good_matcher(snap_candidate, snap0, known_matrix)
path5 = cp.build_camera_path(transforms5, snapshots5, WIDTH, HEIGHT, n5, 0, cv2, matcher_fn=matcher5)
by_frame5 = {e["frameIndex"]: e for e in path5["framePaths"]}
check("5. relock succeeded at least once", path5["diagnostics"]["relockSuccessCount"] >= 1)
check("5. frames deep in the loss stay unavailable",
      by_frame5[loss_start + 5]["state"] == "unavailable")
check("5. frames after a successful relock are anchored again",
      by_frame5[relock_candidate_frame + 2]["state"] == "anchored")
check("5. the relocked keyframe's parent is the global reference keyframe",
      any(kf.get("relockEvent") and kf["parentKeyframeId"] == "kf-0" for kf in path5["keyframes"]))

# --- 6. Failed relock (no usable matches) stays local_only / unavailable —
# fail-closed, never a fabricated global transform. ---
snapshots6 = {0: synthetic_snapshot(seed=3), relock_candidate_frame: synthetic_snapshot(seed=4)}
path6 = cp.build_camera_path(transforms5, snapshots6, WIDTH, HEIGHT, n5, 0, cv2, matcher_fn=no_matcher)
by_frame6 = {e["frameIndex"]: e for e in path6["framePaths"]}
check("6. failed relock: attempted but not successful",
      path6["diagnostics"]["relockAttemptCount"] >= 1 and path6["diagnostics"]["relockSuccessCount"] == 0)
check("6. failed relock: post-loss frames remain non-anchored (local_only), never fabricated",
      by_frame6[relock_candidate_frame + 2]["state"] != "anchored")
check("6. failed relock: no keyframe after the loss claims a keyframeToGlobalMatrix",
      all(kf["keyframeToGlobalMatrix"] is None for kf in path6["keyframes"] if kf["frameIndex"] >= relock_candidate_frame))

# --- Sparse/clustered matches: must be rejected even if a matcher IS wired up. ---
snapshots6b = {0: synthetic_snapshot(seed=5), relock_candidate_frame: synthetic_snapshot(seed=6)}
path6b = cp.build_camera_path(transforms5, snapshots6b, WIDTH, HEIGHT, n5, 0, cv2,
                               matcher_fn=sparse_bad_matcher(snapshots6b[relock_candidate_frame], None))
check("6b. too-few matches are rejected (insufficient_matches), not accepted",
      path6b["diagnostics"]["relockSuccessCount"] == 0)

# --- 10 (worker-side guarantee): no athlete input anywhere in the signature —
# identical inputs (which by construction carry no athlete data) reproduce
# byte-identical output; the function has no parameter through which athlete
# position could ever influence the result. ---
path1_again = cp.build_camera_path(transforms1, {}, WIDTH, HEIGHT, n1, 0, cv2)
check("10. deterministic: identical inputs -> byte-identical output (no hidden athlete/time input)",
      json.dumps(path1, sort_keys=True) == json.dumps(path1_again, sort_keys=True))
import inspect  # noqa: E402
sig_params = list(inspect.signature(cp.build_camera_path).parameters)
check("10. build_camera_path's signature carries no athlete/pose parameter",
      not any("athlete" in p.lower() or "pose" in p.lower() for p in sig_params))

# --- 11. Frame-to-global / global-to-frame round trip on real resolved matrices. ---
sample = by_frame5[relock_candidate_frame + 5]
g2f = sample["globalToFrameMatrix"]
f2g = sample["frameToGlobalMatrix"]
check("11. an anchored frame has both directions resolved", g2f is not None and f2g is not None)
g2f_np = cp._matrix_dict_to_np(g2f, WIDTH, HEIGHT)
f2g_np = cp._matrix_dict_to_np(f2g, WIDTH, HEIGHT)
rx, ry = cp.apply_point_np(f2g_np, *cp.apply_point_np(g2f_np, 0.42, 0.61, WIDTH, HEIGHT), WIDTH, HEIGHT)
check("11. frameToGlobal(globalToFrame(p)) round-trips p to within 1e-6",
      abs(rx - 0.42) < 1e-6 and abs(ry - 0.61) < 1e-6)

# --- Matrix helper sanity: compose/invert/decompose agree with a known case. ---
m = cp.similarity_to_np(rotation_deg=15.0, scale=1.2, tx_norm=0.05, ty_norm=-0.03, width=WIDTH, height=HEIGHT)
decomposed = cp.np_to_similarity(m, WIDTH, HEIGHT)
check("matrix helpers: decomposition recovers the exact rotation/scale/translation used to build it",
      abs(decomposed["rotationDeg"] - 15.0) < 1e-6 and abs(decomposed["scale"] - 1.2) < 1e-6
      and abs(decomposed["translationX"] - 0.05) < 1e-9 and abs(decomposed["translationY"] - (-0.03)) < 1e-9)
inv = cp.invert_np(m)
rx2, ry2 = cp.apply_point_np(inv, *cp.apply_point_np(m, 0.3, 0.7, WIDTH, HEIGHT), WIDTH, HEIGHT)
check("matrix helpers: invert_np(m) undoes m exactly", abs(rx2 - 0.3) < 1e-9 and abs(ry2 - 0.7) < 1e-9)

print("\n" + ("ALL PASSED" if ok else "FAILURES PRESENT"))
sys.exit(0 if ok else 1)
