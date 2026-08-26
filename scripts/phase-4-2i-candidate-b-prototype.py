#!/usr/bin/env python3
"""Phase 4.2I (Parts 5/6) — offline prototype and evaluation of Candidate B
(pose-landmark-guided per-point feature ownership) against REAL captured
evidence from two real production reruns of the actual pipeline, run with
BOX_TRACKER_TRACE_FILE enabled (a real, pre-existing, opt-in, zero-production-
cost mechanism — see box_tracker.py's own module docstring). No synthetic
data, no mocking: every point classified here is a real optical-flow point
tracked by the real pipeline on the real source video, and every skeleton
reference is a real MediaPipe landmark from a real detector confirmation.

This script does NOT modify box_tracker.py's production classification. It
independently RECOMPUTES a candidate per-point ownership label from the same
raw evidence (flow points + the most recent detector-confirmed skeleton) and
compares it, frame by frame, against the CURRENT architecture's own recorded
aggregate athlete/background ratio — the real evaluation this phase's Parts
5/6 require before any production change is made.

    .venv/bin/python scripts/phase-4-2i-candidate-b-prototype.py
"""
import json
import math
import sys

GAV_TRACE = "tmp/phase42i/gav_trace.jsonl"
VANNI240_TRACE = "tmp/phase42i/vanni240_trace.jsonl"
WIDTH, HEIGHT = 1920, 1080

# Body-segment pairs (from TRACKER_LANDMARK_NAMES, mediapipe_pose_runner.py:430)
# — the same 12 joints already computed by every real detector call. A point
# is "near" the skeleton if it lies within OWNERSHIP_RADIUS_FW of the nearest
# point on any of these line segments (or of a lone joint, for the head).
SEGMENTS = [
    ("left_shoulder", "right_shoulder"), ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"), ("left_hip", "right_hip"),
    ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
    ("left_ankle", "left_heel"), ("left_ankle", "left_foot_index"),
    ("right_hip", "right_knee"), ("right_knee", "right_ankle"),
    ("right_ankle", "right_heel"), ("right_ankle", "right_foot_index"),
    ("left_shoulder", "nose"), ("right_shoulder", "nose"),
]
# A generous radius (frame-widths) around the skeleton line — real limbs have
# real width, and this is a coarse per-joint skeleton, not a silhouette mask;
# sized to comfortably cover a real limb's visual width without being so
# large it would also cover a nearby static object under normal framing.
OWNERSHIP_RADIUS_FW = 0.04


def point_segment_distance(p, a, b):
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def skeleton_ownership_ratio(flow_points_px, landmarks_norm, width, height):
    """Fraction of `flow_points_px` (pixel coords) within OWNERSHIP_RADIUS_FW
    (a frame-WIDTH-normalized radius, box_tracker.py's own convention, but
    applied to a real 2D pixel distance) of the nearest real skeleton
    segment built from `landmarks_norm` (normalized [0,1] coords — x by
    source width, y by source height, MediaPipe's own convention, matching
    how box_tracker.py itself converts `c.cx`/`c.cy` to pixels). Returns
    None if there isn't a usable skeleton (too few confident joints) —
    never fabricates a classification from insufficient evidence, matching
    this codebase's own established pattern elsewhere."""
    if not landmarks_norm or not flow_points_px:
        return None
    joints_px = {
        name: (x * width, y * height)
        for name, (x, y, vis) in landmarks_norm.items() if vis >= 0.4
    }
    if len(joints_px) < 4:
        return None
    radius_px = OWNERSHIP_RADIUS_FW * width
    owned = 0
    for p in flow_points_px:
        best = float("inf")
        for a_name, b_name in SEGMENTS:
            a, b = joints_px.get(a_name), joints_px.get(b_name)
            if a is None or b is None:
                continue
            best = min(best, point_segment_distance(p, a, b))
        if best == float("inf"):
            for a in joints_px.values():
                best = min(best, math.hypot(p[0] - a[0], p[1] - a[1]))
        if best <= radius_px:
            owned += 1
    return owned / len(flow_points_px)


def project_landmarks(landmarks_norm, last_conf_time_s, cur_time_s, established_v_fw, width):
    """Extrapolate each joint's normalized position forward using the
    athlete's own independently-established velocity — the SAME reference
    box_tracker.py's existing trajectory-residual check already uses. A
    naive (unprojected) skeleton reference goes stale the moment real time
    elapses; this variant tests whether projecting it forward fixes the
    naive version's real failure mode (Part 6 finding: a frozen/stuck point
    trivially stays close to a STALE, unmoved skeleton)."""
    if not landmarks_norm or last_conf_time_s is None:
        return landmarks_norm
    dt = cur_time_s - last_conf_time_s
    if dt <= 0:
        return landmarks_norm
    vx_fw, vy_fw = established_v_fw
    dx_norm = vx_fw * dt  # already frame-width-normalized, same units as x
    dy_norm = vy_fw * dt * (width / HEIGHT)  # convert fw/s to the y-axis's own height-normalized units
    return {name: (x + dx_norm, y + dy_norm, vis) for name, (x, y, vis) in landmarks_norm.items()}


def evaluate(trace_path, label):
    frames = []
    with open(trace_path) as f:
        for line in f:
            frames.append(json.loads(line))

    last_landmarks = None
    last_conf_time_s = None
    rows = []
    for fr in frames:
        if fr.get("candidateLandmarks"):
            last_landmarks = fr["candidateLandmarks"]
            last_conf_time_s = fr.get("timeS")
        flow_points = fr.get("flowPoints") or []
        current_ratio = fr.get("backgroundRiskFeatureRatio")
        skel_ratio_naive = skeleton_ownership_ratio(flow_points, last_landmarks, WIDTH, HEIGHT)
        projected = project_landmarks(
            last_landmarks, last_conf_time_s, fr.get("timeS"),
            tuple(fr.get("establishedVelocityFwPerS") or (0.0, 0.0)), WIDTH,
        )
        skel_ratio_projected = skeleton_ownership_ratio(flow_points, projected, WIDTH, HEIGHT)
        rows.append({
            "frame": fr["frame"],
            "boxOrigin": fr.get("boxOrigin"),
            "currentBackgroundRiskRatio": current_ratio,
            "skeletonBackgroundRatioNaive": (1.0 - skel_ratio_naive) if skel_ratio_naive is not None else None,
            "skeletonBackgroundRatioProjected": (1.0 - skel_ratio_projected) if skel_ratio_projected is not None else None,
            "flowPointCount": len(flow_points),
        })

    print(f"\n=== {label} ({len(rows)} traced frames) ===")
    tracked = [r for r in rows if r["boxOrigin"] == "tracked" and r["skeletonBackgroundRatioNaive"] is not None]
    print(f"  tracked frames with a usable skeleton reference: {len(tracked)} / {len([r for r in rows if r['boxOrigin']=='tracked'])} tracked total")
    return rows


def summarize_interval(rows, lo, hi, label):
    sub = [r for r in rows if lo <= r["frame"] <= hi and r["skeletonBackgroundRatioNaive"] is not None]
    if not sub:
        print(f"  {label} (frames {lo}-{hi}): no usable skeleton-referenced frames in this interval")
        return
    cur = [r["currentBackgroundRiskRatio"] for r in sub if r["currentBackgroundRiskRatio"] is not None]
    naive = [r["skeletonBackgroundRatioNaive"] for r in sub]
    proj = [r["skeletonBackgroundRatioProjected"] for r in sub if r["skeletonBackgroundRatioProjected"] is not None]
    print(f"  {label} (frames {lo}-{hi}, n={len(sub)}):")
    print(f"    current motion-consistency backgroundRiskRatio:      mean={sum(cur)/len(cur):.3f} max={max(cur):.3f}" if cur else "    current: n/a")
    print(f"    Candidate B (naive, stale skeleton) backgroundRatio: mean={sum(naive)/len(naive):.3f} max={max(naive):.3f}")
    print(f"    Candidate B (velocity-projected) backgroundRatio:    mean={sum(proj)/len(proj):.3f} max={max(proj):.3f}" if proj else "    projected: n/a")


if __name__ == "__main__":
    gav_rows = evaluate(GAV_TRACE, "Gav (full clip, real trace)")
    v240_rows = evaluate(VANNI240_TRACE, "Vanni 240 (frames 250-1019, real trace)")

    print("\n--- Gav: representative intervals (legitimate limb motion, no known incident) ---")
    summarize_interval(gav_rows, 0, 141, "full clip")

    print("\n--- Vanni 240: the real, known barrel-region incident (frames 655-720) ---")
    summarize_interval(v240_rows, 655, 720, "onset + early lock")
    print("\n--- Vanni 240: the deep lock tail (frames 720-1019) ---")
    summarize_interval(v240_rows, 720, 1019, "deep lock")
    print("\n--- Vanni 240: an earlier, short in-zone episode (frames 340-360) ---")
    summarize_interval(v240_rows, 340, 360, "short in-zone episode")
