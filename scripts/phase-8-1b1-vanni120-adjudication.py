#!/usr/bin/env python3
"""Phase 8.1B-1 -- Vanni 120 end-of-clip camera-motion adjudication.

Builds, for the disputed window (padded around Phase 8.1A's reported frames
415-475), THREE independent, non-AVA background-motion estimates plus a
manual static-anchor ground control, all decoded with the SAME rotation
correction the production worker applies (cv2.ROTATE_180 -- confirmed via
`CAP_PROP_ORIENTATION_META` and visual inspection this phase; Phase 8.1A's
raw-source-motion-control.py did NOT apply this correction, a real tooling
bug this script fixes -- see the report's Part I).

Methods:
  1. sparse_flow   -- goodFeaturesToTrack + calcOpticalFlowPyrLK, CONSECUTIVE
                      frames (stride 1), chained -- Phase 6.2's own style.
  2. robust_feature -- ORB + BFMatcher + RANSAC estimateAffinePartial2D,
                      stride-5 sampled frame pairs, chained.
  3. phase_correlation -- cv2.phaseCorrelate, translation-only, stride-1
                      consecutive frames, chained.
  4. manual_anchors -- 6 hand-picked, visually verified static structures,
                      tracked via cv2.matchTemplate (normalized cross-
                      correlation) at every frame in the window.

All are compared, frame by frame, against AVA's own real per-frame local
step (`cameraEvidence.transforms[i]`) and cumulative global transform
(`cameraPath.framePaths[i].frameToGlobalMatrix`, decomposed into
rotation/scale/translation using the exact same convention as
`camera_path.py`'s own `np_to_similarity`).

Read-only, standalone. Not imported by any src/ file, not on any build path.

    .venv/bin/python scripts/phase-8-1b1-vanni120-adjudication.py
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase81b1"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "frames").mkdir(exist_ok=True)
(OUT / "sheets").mkdir(exist_ok=True)

VIDEO = ROOT / "tmp/phase50e/sources/vanni_fly_120.mov"
POSE = ROOT / "tmp/phase80a/vanni120.pose.json"
ROTATION_CODE = cv2.ROTATE_180  # confirmed: CAP_PROP_ORIENTATION_META == 180.0, verified visually this phase

WINDOW_START = 390
WINDOW_END = 483  # clip end (totalFrames=483, last index 482)
REFERENCE_FRAME = 295  # matches Phase 8.1A's own reference frame for this benchmark

W, H = 1920, 1080

# Six manually selected, visually verified static structures (picked from the
# ROTATED frame 295 image, tmp/phase81b1/frames/vanni120_ref295_295_rot180.png,
# a 100px grid overlay was used to read off coordinates precisely). All are
# fixed stadium structures (barrel, staircases, wall fixture, fence post,
# light pole) with no vegetation/shadow/moving-object risk.
MANUAL_ANCHORS = {
    "blue_barrel": (1500, 655),
    "left_staircase_corner": (215, 555),
    "tan_box_on_wall": (1195, 610),
    "light_pole_at_fence": (330, 230),
    "middle_staircase_corner": (1290, 555),
    "fence_post": (685, 555),
}
TEMPLATE_HALF = 22
SEARCH_MARGIN = 45


def read_rotated_frames(video_path, start, end):
    """Decode frames [start, end] inclusive, applying the SAME rotation the
    production worker applies before any feature/pose processing."""
    cap = cv2.VideoCapture(str(video_path))
    out = {}
    idx = 0
    while idx <= end:
        ok, frame = cap.read()
        if not ok:
            break
        if idx >= start:
            out[idx] = cv2.rotate(frame, ROTATION_CODE)
        idx += 1
    cap.release()
    return out


def decompose_affine(affine):
    """Match camera_path.py's np_to_similarity convention exactly: scale from
    the first column's norm, rotation from atan2(c, a)."""
    a, c = float(affine[0, 0]), float(affine[1, 0])
    scale = math.hypot(a, c)
    rotation_deg = math.degrees(math.atan2(c, a))
    return {"translationXPx": float(affine[0, 2]), "translationYPx": float(affine[1, 2]),
            "rotationDeg": rotation_deg, "scale": scale}


def sparse_flow_chain(frames, indices):
    """Method 1: consecutive-frame goodFeaturesToTrack + calcOpticalFlowPyrLK,
    RANSAC-fit to a partial-affine per step, chained across the window."""
    results = []
    for a, b in zip(indices, indices[1:]):
        ga = cv2.cvtColor(frames[a], cv2.COLOR_BGR2GRAY)
        gb = cv2.cvtColor(frames[b], cv2.COLOR_BGR2GRAY)
        pts = cv2.goodFeaturesToTrack(ga, 300, 0.01, 8, blockSize=7)
        if pts is None or len(pts) < 20:
            results.append({"from": a, "to": b, "failed": True})
            continue
        nxt, status, _ = cv2.calcOpticalFlowPyrLK(ga, gb, pts, None, winSize=(21, 21), maxLevel=3)
        status = status.reshape(-1) == 1
        p0 = pts[status].reshape(-1, 2)
        p1 = nxt[status].reshape(-1, 2)
        if len(p0) < 15:
            results.append({"from": a, "to": b, "failed": True})
            continue
        affine, inliers = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=2.0, maxIters=2000, confidence=0.99)
        if affine is None:
            results.append({"from": a, "to": b, "failed": True})
            continue
        d = decompose_affine(affine)
        d.update({"from": a, "to": b, "featureCount": len(p0), "inlierCount": int(inliers.sum())})
        results.append(d)
    return results


def robust_feature_chain(frames, indices, stride):
    """Method 2: ORB + BFMatcher(knn) + RANSAC partial-affine, sampled at
    `stride`, chained across the window."""
    sampled = indices[::stride]
    if sampled[-1] != indices[-1]:
        sampled.append(indices[-1])
    results = []
    orb = cv2.ORB_create(nfeatures=2000)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    for a, b in zip(sampled, sampled[1:]):
        ga = cv2.cvtColor(frames[a], cv2.COLOR_BGR2GRAY)
        gb = cv2.cvtColor(frames[b], cv2.COLOR_BGR2GRAY)
        ka, da = orb.detectAndCompute(ga, None)
        kb, db_ = orb.detectAndCompute(gb, None)
        if da is None or db_ is None:
            results.append({"from": a, "to": b, "failed": True})
            continue
        matches = bf.knnMatch(da, db_, k=2)
        good = [m for m, n in matches if m.distance < 0.75 * n.distance]
        if len(good) < 15:
            results.append({"from": a, "to": b, "failed": True})
            continue
        pa = np.float32([ka[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        pb = np.float32([kb[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        affine, inliers = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=3000, confidence=0.99)
        if affine is None:
            results.append({"from": a, "to": b, "failed": True})
            continue
        d = decompose_affine(affine)
        d.update({"from": a, "to": b, "matchCount": len(good), "inlierCount": int(inliers.sum())})
        results.append(d)
    return results


def phase_correlation_chain(frames, indices):
    """Method 3: cv2.phaseCorrelate, translation-only, consecutive frames."""
    results = []
    hann = None
    for a, b in zip(indices, indices[1:]):
        ga = cv2.cvtColor(frames[a], cv2.COLOR_BGR2GRAY).astype(np.float32)
        gb = cv2.cvtColor(frames[b], cv2.COLOR_BGR2GRAY).astype(np.float32)
        if hann is None:
            hann = cv2.createHanningWindow((ga.shape[1], ga.shape[0]), cv2.CV_32F)
        (dx, dy), response = cv2.phaseCorrelate(ga, gb, hann)
        results.append({"from": a, "to": b, "translationXPx": float(dx), "translationYPx": float(dy), "response": float(response)})
    return results


def manual_anchor_tracking(frames, indices):
    """Part D: track each hand-picked static structure via normalized
    cross-correlation template matching, seeded from the reference frame and
    re-seeded from its own last known good position each step (small
    per-frame search window, since drift here is only a few px/frame max)."""
    ref_frame = frames[indices[0]]
    tracks = {}
    for name, (x0, y0) in MANUAL_ANCHORS.items():
        template = ref_frame[y0 - TEMPLATE_HALF:y0 + TEMPLATE_HALF, x0 - TEMPLATE_HALF:x0 + TEMPLATE_HALF].copy()
        cur_x, cur_y = x0, y0
        rows = [{"frameIndex": indices[0], "x": x0, "y": y0, "score": 1.0}]
        for idx in indices[1:]:
            frame = frames[idx]
            sx0, sy0 = max(0, cur_x - SEARCH_MARGIN), max(0, cur_y - SEARCH_MARGIN)
            sx1, sy1 = min(W, cur_x + SEARCH_MARGIN), min(H, cur_y + SEARCH_MARGIN)
            search = frame[sy0:sy1, sx0:sx1]
            if search.shape[0] < template.shape[0] or search.shape[1] < template.shape[1]:
                rows.append({"frameIndex": idx, "x": None, "y": None, "score": None})
                continue
            result = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            found_x = sx0 + max_loc[0] + TEMPLATE_HALF
            found_y = sy0 + max_loc[1] + TEMPLATE_HALF
            rows.append({"frameIndex": idx, "x": int(found_x), "y": int(found_y), "score": float(max_val)})
            if max_val > 0.6:  # only re-seed the search center on a confident match
                cur_x, cur_y = found_x, found_y
        tracks[name] = {"referenceXY": [x0, y0], "trajectory": rows}
    return tracks


def ava_local_steps(seq, indices):
    transforms = seq["cameraEvidence"]["transforms"]
    return {i: transforms[i] for i in indices if i < len(transforms)}


def ava_global_trace(seq, indices):
    fp_by_index = {r["frameIndex"]: r for r in seq["cameraPath"]["framePaths"]}
    out = {}
    for i in indices:
        row = fp_by_index.get(i)
        if row is None or row.get("frameToGlobalMatrix") is None:
            out[i] = None
            continue
        m = row["frameToGlobalMatrix"]
        out[i] = {
            "translationXPx": m["translationX"] * W, "translationYPx": m["translationY"] * H,
            "rotationDeg": m["rotationDeg"], "scale": m["scale"],
            "state": row["state"], "keyframeId": row["keyframeId"],
            "confidence": row["confidence"], "featureCount": row["featureCount"],
            "inlierRatio": row["inlierRatio"], "residualPx": row["residualPx"],
        }
    return out


def main():
    print(f"Decoding frames {WINDOW_START}..{WINDOW_END} (rotated 180deg to match production worker)...")
    frames = read_rotated_frames(VIDEO, WINDOW_START, WINDOW_END)
    indices = sorted(frames.keys())
    print(f"Decoded {len(indices)} frames.")

    seq = json.loads(POSE.read_text())

    print("Method 1: sparse optical flow (consecutive frames)...")
    m1 = sparse_flow_chain(frames, indices)

    print("Method 2: ORB + RANSAC robust feature matching (stride 5)...")
    m2 = robust_feature_chain(frames, indices, stride=5)

    print("Method 3: phase correlation (consecutive frames)...")
    m3 = phase_correlation_chain(frames, indices)

    print("Manual static-anchor template tracking...")
    manual = manual_anchor_tracking(frames, indices)

    ava_local = ava_local_steps(seq, indices)
    ava_global = ava_global_trace(seq, indices)

    # Cumulative trajectories (translation) for each per-frame-step method,
    # integrated from indices[0] forward, for direct comparison against AVA's
    # own cumulative frameToGlobalMatrix (also relative to indices[0]).
    def cumulative_from_steps(steps, key_from="from", key_to="to"):
        cum = {indices[0]: {"x": 0.0, "y": 0.0, "rot": 0.0}}
        cx, cy, crot = 0.0, 0.0, 0.0
        for s in steps:
            if s.get("failed"):
                cum[s[key_to]] = None
                continue
            cx += s["translationXPx"]
            cy += s["translationYPx"]
            crot += s.get("rotationDeg", 0.0)
            cum[s[key_to]] = {"x": cx, "y": cy, "rot": crot}
        return cum

    cum1 = cumulative_from_steps(m1)
    cum2 = cumulative_from_steps(m2)
    cum3 = cumulative_from_steps(m3)

    ava_base = ava_global.get(indices[0])
    ava_cumulative = {}
    for i in indices:
        g = ava_global.get(i)
        if g is None or ava_base is None:
            ava_cumulative[i] = None
            continue
        ava_cumulative[i] = {"x": g["translationXPx"] - ava_base["translationXPx"],
                              "y": g["translationYPx"] - ava_base["translationYPx"],
                              "rot": g["rotationDeg"] - ava_base["rotationDeg"]}

    comparison = []
    for i in indices:
        comparison.append({
            "frameIndex": i,
            "avaCumulative": ava_cumulative.get(i),
            "avaGlobal": ava_global.get(i),
            "avaLocalStep": ava_local.get(i),
            "sparseFlowCumulative": cum1.get(i),
            "robustFeatureCumulative": cum2.get(i),
            "phaseCorrCumulative": cum3.get(i),
        })

    result = {
        "schemaVersion": "ava-phase-8-1b1-vanni120-adjudication-v1",
        "video": str(VIDEO.relative_to(ROOT)),
        "pose": str(POSE.relative_to(ROOT)),
        "rotationCodeApplied": "ROTATE_180",
        "windowStart": WINDOW_START, "windowEnd": WINDOW_END, "referenceFrame": indices[0],
        "manualAnchors": MANUAL_ANCHORS,
        "method1SparseFlow": m1,
        "method2RobustFeature": m2,
        "method3PhaseCorrelation": m3,
        "manualAnchorTracks": manual,
        "comparison": comparison,
    }
    (OUT / "vanni120-adjudication.json").write_text(json.dumps(result, indent=2))
    print(f"\nWrote {OUT / 'vanni120-adjudication.json'}")

    # Console summary
    for i in [415, 430, 445, 460, 475, 482]:
        row = next((c for c in comparison if c["frameIndex"] == i), None)
        if not row:
            continue
        print(f"\nframe {i}:")
        print("  AVA cumulative:", row["avaCumulative"])
        print("  sparse-flow cumulative:", row["sparseFlowCumulative"])
        print("  robust-feature cumulative:", row["robustFeatureCumulative"])
        print("  phase-corr cumulative:", row["phaseCorrCumulative"])


if __name__ == "__main__":
    main()
