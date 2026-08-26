#!/usr/bin/env python3
"""Phase 8.1B-2A -- corrected cross-benchmark (Vanni 240, Vanni 60) end-of-clip
camera-motion validation. Generalizes the corrected methodology proven in
Phase 8.1B-1 for Vanni 120: decode with the SAME rotation correction the
production worker applies (cv2.ROTATE_180 for all three Vanni clips,
confirmed via CAP_PROP_ORIENTATION_META + visual inspection), then run three
independent background-motion estimators plus a manual static-anchor ground
control, and compare all of them against AVA's real cameraPath transform.

This directly reuses (does not reinvent) the exact methods and decomposition
convention from scripts/phase-8-1b1-vanni120-adjudication.py.

Read-only, standalone. Not imported by any src/ file, not on any build path.

    .venv/bin/python scripts/phase-8-1b2a-cross-benchmark-adjudication.py <benchmark>

    <benchmark> is "vanni240" or "vanni60".
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase81b2a"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "frames").mkdir(exist_ok=True)
(OUT / "sheets").mkdir(exist_ok=True)

ROTATION_CODE = cv2.ROTATE_180  # confirmed for all 3 Vanni clips: CAP_PROP_ORIENTATION_META == 180.0
W, H = 1920, 1080

BENCHMARKS = {
    "vanni240": {
        "video": ROOT / "tmp/phase50e/sources/vanni_fly_240.mov",
        "pose": ROOT / "tmp/phase80a/vanni240.pose.json",
        "window_start": 560, "window_end": 1019,
        "anchors": {
            "blue_barrel_right": (1450, 675),
            "left_staircase_corner": (200, 590),
            "tan_box_on_wall": (1230, 630),
            "light_pole_at_fence": (390, 250),
            "fence_post": (790, 555),
        },
    },
    "vanni60": {
        "video": ROOT / "tmp/phase50e/sources/vanni_fly_60.mov",
        "pose": ROOT / "tmp/phase80a/vanni60.pose.json",
        "window_start": 145, "window_end": 232,
        "anchors": {
            "left_staircase_corner": (90, 590),
            "tan_box_on_wall": (1280, 630),
            "fence_post": (700, 555),
            "light_pole_at_fence": (335, 220),
            "blue_barrel": (1520, 655),
            "door_corner": (800, 590),
        },
    },
}

TEMPLATE_HALF = 22
SEARCH_MARGIN = 45


def read_rotated_frames(video_path, start, end):
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
    a, c = float(affine[0, 0]), float(affine[1, 0])
    scale = math.hypot(a, c)
    rotation_deg = math.degrees(math.atan2(c, a))
    return {"translationXPx": float(affine[0, 2]), "translationYPx": float(affine[1, 2]),
            "rotationDeg": rotation_deg, "scale": scale}


def sparse_flow_chain(frames, indices):
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


def manual_anchor_tracking(frames, indices, anchors):
    ref_frame = frames[indices[0]]
    tracks = {}
    for name, (x0, y0) in anchors.items():
        if x0 < TEMPLATE_HALF + SEARCH_MARGIN or x0 > W - TEMPLATE_HALF - SEARCH_MARGIN \
                or y0 < TEMPLATE_HALF + SEARCH_MARGIN or y0 > H - TEMPLATE_HALF - SEARCH_MARGIN:
            raise ValueError(f"anchor {name} at ({x0},{y0}) is too close to the frame edge "
                              f"for template_half={TEMPLATE_HALF}+search_margin={SEARCH_MARGIN}; pick an anchor "
                              f"at least {TEMPLATE_HALF + SEARCH_MARGIN}px from every edge")
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
            if max_val > 0.6:
                cur_x, cur_y = found_x, found_y
        tracks[name] = {"referenceXY": [x0, y0], "trajectory": rows}
    return tracks


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


def cumulative_from_steps(steps, ref_index):
    cum = {ref_index: {"x": 0.0, "y": 0.0, "rot": 0.0}}
    cx, cy, crot = 0.0, 0.0, 0.0
    for s in steps:
        if s.get("failed"):
            cum[s["to"]] = None
            continue
        cx += s["translationXPx"]
        cy += s["translationYPx"]
        crot += s.get("rotationDeg", 0.0)
        cum[s["to"]] = {"x": cx, "y": cy, "rot": crot}
    return cum


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in BENCHMARKS:
        print("usage: phase-8-1b2a-cross-benchmark-adjudication.py <vanni240|vanni60>")
        sys.exit(1)
    label = sys.argv[1]
    cfg = BENCHMARKS[label]

    print(f"[{label}] decoding frames {cfg['window_start']}..{cfg['window_end']} (rotated 180deg)...")
    frames = read_rotated_frames(cfg["video"], cfg["window_start"], cfg["window_end"])
    indices = sorted(frames.keys())
    print(f"[{label}] decoded {len(indices)} frames.")

    seq = json.loads(cfg["pose"].read_text())

    print(f"[{label}] Method 1: sparse optical flow...")
    m1 = sparse_flow_chain(frames, indices)
    print(f"[{label}] Method 2: ORB + RANSAC (stride 5)...")
    m2 = robust_feature_chain(frames, indices, stride=5)
    print(f"[{label}] Method 3: phase correlation...")
    m3 = phase_correlation_chain(frames, indices)
    print(f"[{label}] manual anchor tracking...")
    manual = manual_anchor_tracking(frames, indices, cfg["anchors"])

    ava_global = ava_global_trace(seq, indices)
    cum1 = cumulative_from_steps(m1, indices[0])
    cum2 = cumulative_from_steps(m2, indices[0])
    cum3 = cumulative_from_steps(m3, indices[0])

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
            "sparseFlowCumulative": cum1.get(i),
            "robustFeatureCumulative": cum2.get(i),
            "phaseCorrCumulative": cum3.get(i),
        })

    result = {
        "schemaVersion": "ava-phase-8-1b2a-cross-benchmark-adjudication-v1",
        "benchmark": label,
        "video": str(cfg["video"].relative_to(ROOT)),
        "pose": str(cfg["pose"].relative_to(ROOT)),
        "rotationCodeApplied": "ROTATE_180",
        "windowStart": cfg["window_start"], "windowEnd": cfg["window_end"], "referenceFrame": indices[0],
        "manualAnchors": cfg["anchors"],
        "method1SparseFlow": m1,
        "method2RobustFeature": m2,
        "method3PhaseCorrelation": m3,
        "manualAnchorTracks": manual,
        "comparison": comparison,
    }
    out_path = OUT / f"{label}-adjudication.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"\n[{label}] wrote {out_path}")

    # Residual summary
    def stats(vals):
        s = sorted(vals)
        return {"median": s[len(s) // 2], "p95": s[int(len(s) * 0.95)], "max": s[-1], "mean": sum(s) / len(s)} if s else None

    for method_key in ["sparseFlowCumulative", "robustFeatureCumulative", "phaseCorrCumulative"]:
        resids = [math.hypot(r["avaCumulative"]["x"] - r[method_key]["x"], r["avaCumulative"]["y"] - r[method_key]["y"])
                  for r in comparison if r["avaCumulative"] and r[method_key]]
        print(f"[{label}] {method_key} residual px:", stats(resids))

    last = comparison[-1]
    print(f"[{label}] final frame {last['frameIndex']}: AVA cumulative =", last["avaCumulative"])
    print(f"[{label}] final frame sparse-flow cumulative =", last["sparseFlowCumulative"])


if __name__ == "__main__":
    main()
