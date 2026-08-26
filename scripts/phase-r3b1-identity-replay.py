#!/usr/bin/env python3
"""Phase R3B-1 -- real replay of AthleteTracker's identity-acquisition state
machine against REAL stored MediaPipe landmark data (tmp/phase94/*.pose.json,
the same Phase 9.4 fresh-rerun artifacts used throughout this session), for
all 4 benchmarks, BEFORE (a throwaway reverted copy of athlete_tracker.py)
and AFTER (the real, current, modified file) this phase's fix.

Scope note: this validates the IDENTITY layer directly (AthleteTracker.step),
which is the only code this phase changed. It does not additionally replay
box_tracker.py's optical-flow layer (unmodified, needs real cv2 frames) --
during the pre-lock "acquiring" window specifically (what this phase is
about), box_tracker.py's wants_detector_frame() returns True on every frame
regardless (R3A finding, verified again in Part B of this phase's own
report), so a detector candidate is available every frame in real
production too -- this replay is a faithful match for that window.

  python3 scripts/phase-r3b1-identity-replay.py [before|after] <outfile>
"""
import sys
import os
import json
import shutil
import importlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")

MP_ORDER = [
    (0, "nose"), (11, "left_shoulder"), (12, "right_shoulder"), (13, "left_elbow"),
    (14, "right_elbow"), (15, "left_wrist"), (16, "right_wrist"), (23, "left_hip"),
    (24, "right_hip"), (25, "left_knee"), (26, "right_knee"), (27, "left_ankle"),
    (28, "right_ankle"), (29, "left_heel"), (30, "right_heel"), (31, "left_toe"), (32, "right_toe"),
]
NAME_FOR_INDEX = {i: name for i, name in MP_ORDER}
NUM_MP_LANDMARKS = 33  # MediaPipe's full pose model point count -- completeness denominator.


class _LM:
    __slots__ = ("x", "y", "visibility")

    def __init__(self, x, y, visibility):
        self.x, self.y, self.visibility = x, y, visibility


def build_landmark_points(frame_keypoints):
    """Build a length-33 list (index i -> _LM or a zero-visibility stub for
    untracked indices) matching candidate_from_landmarks's expected input
    shape -- only the 17 points this project's artifacts store are ever
    real; the rest are legitimately absent (never fabricated) and
    contribute 0 to `present` via visibility 0.0."""
    points = [_LM(0.0, 0.0, 0.0) for _ in range(NUM_MP_LANDMARKS)]
    for i, name in MP_ORDER:
        kp = frame_keypoints.get(name)
        if kp is not None:
            vis = kp.get("visibility", kp.get("score", 0.0))
            points[i] = _LM(kp["x"], kp["y"], vis)
    return points


def replay(pose_path, fps, mode):
    sys.path.insert(0, RUNTIME_DIR)
    for mod in ("athlete_tracker", "box_tracker"):
        if mod in sys.modules:
            del sys.modules[mod]
    at = importlib.import_module("athlete_tracker")

    with open(pose_path) as f:
        seq = json.load(f)

    tracker = at.AthleteTracker(travel_direction="left_to_right", fps=fps, entry_gate=None)
    timeline = []
    first_tracked_frame = None
    for frame in seq["frames"]:
        lm_points = build_landmark_points(frame["keypoints"])
        cand = at.candidate_from_landmarks(lm_points, 1.0, 1.0, NAME_FOR_INDEX)
        candidates = [cand] if cand is not None else [None]
        result = tracker.step(candidates, frame["index"], frame["tMs"] / 1000.0)
        timeline.append({
            "sourceFrameIndex": frame["sourceFrameIndex"],
            "tMs": frame["tMs"],
            "identityState": result["identityState"],
            "selectedIndex": result["selectedIndex"],
            "completeness": cand.completeness if cand is not None else None,
        })
        if first_tracked_frame is None and result["identityState"] == "tracked":
            first_tracked_frame = {"sourceFrameIndex": frame["sourceFrameIndex"], "tMs": frame["tMs"]}
    return {"mode": mode, "firstTrackedFrame": first_tracked_frame, "timeline": timeline[:60]}


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "after"
    outfile = sys.argv[2] if len(sys.argv) > 2 else None

    BENCHMARKS = {
        "gav": (os.path.join(ROOT, "tmp/phase94/gav.pose.json"), 60.0),
        "vanni60": (os.path.join(ROOT, "tmp/phase94/vanni60.pose.json"), 60.0),
        "vanni120": (os.path.join(ROOT, "tmp/phase94/vanni120.pose.json"), 120.005),
        "vanni240": (os.path.join(ROOT, "tmp/phase94/vanni240.pose.json"), 239.981),
    }

    revert_dir = None
    if mode == "before":
        # Throwaway reverted copy: strip this phase's additive changes from a
        # COPY only -- the real src/ file is never touched.
        revert_dir = os.path.join(ROOT, ".r3b1-before-runtime")
        if os.path.exists(revert_dir):
            shutil.rmtree(revert_dir)
        shutil.copytree(RUNTIME_DIR, revert_dir)
        target = os.path.join(revert_dir, "athlete_tracker.py")
        with open(target) as f:
            src = f.read()
        # Revert: promotion uses only the original displacement path.
        src = src.replace(
            "if self.pending.ready_to_promote(time_s) or self.pending.ready_via_strong_pose():",
            "if self.pending.ready_to_promote(time_s):",
        )
        with open(target, "w") as f:
            f.write(src)
        globals()["RUNTIME_DIR"] = revert_dir

    results = {}
    for label, (pose_path, fps) in BENCHMARKS.items():
        results[label] = replay(pose_path, fps, mode)
        ft = results[label]["firstTrackedFrame"]
        print(f"{label}: mode={mode} firstTracked={ft}")

    if revert_dir:
        shutil.rmtree(revert_dir, ignore_errors=True)

    if outfile:
        with open(outfile, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Wrote {outfile}")
