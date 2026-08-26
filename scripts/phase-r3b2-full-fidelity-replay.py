#!/usr/bin/env python3
"""Phase R3B-2 Part C-F/L -- feeds the REAL, full-fidelity tiled MediaPipe
detections (tmp/phaseR3B2/full-worker-startup-traces/*.json) through the
REAL AthleteTracker state machine (current code WITH R3B-1's fix, and a
throwaway reverted copy WITHOUT it), to answer definitively: does
full-fidelity evidence actually reach trusted identity earlier?

  python3 scripts/phase-r3b2-full-fidelity-replay.py
"""
import sys, os, json, shutil, importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
OUT = os.path.join(ROOT, "tmp/phaseR3B2")
sys.path.insert(0, RUNTIME_DIR)
import athlete_tracker as at_current  # noqa: E402

FPS_BY_LABEL = {"gav": 60.0, "vanni60": 60.0, "vanni120": 120.005, "vanni240": 239.981}
TRACKER_LANDMARK_NAMES = {
    0: "nose", 11: "left_shoulder", 12: "right_shoulder", 23: "left_hip", 24: "right_hip",
    25: "left_knee", 26: "right_knee", 27: "left_ankle", 28: "right_ankle",
    29: "left_heel", 30: "right_heel", 31: "left_foot_index", 32: "right_foot_index",
}
MP_33_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
    "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot_index", "right_foot_index",
]


class _LM:
    __slots__ = ("x", "y", "visibility")

    def __init__(self, x, y, visibility):
        self.x, self.y, self.visibility = x, y, visibility


def load_reverted_module():
    revert_dir = os.path.join(ROOT, ".r3b2-reverted-runtime")
    if os.path.exists(revert_dir):
        shutil.rmtree(revert_dir)
    shutil.copytree(RUNTIME_DIR, revert_dir)
    target = os.path.join(revert_dir, "athlete_tracker.py")
    with open(target) as f:
        src = f.read()
    src = src.replace(
        "if self.pending.ready_to_promote(time_s) or self.pending.ready_via_strong_pose():",
        "if self.pending.ready_to_promote(time_s):",
    )
    with open(target, "w") as f:
        f.write(src)
    spec = importlib.util.spec_from_file_location("athlete_tracker_reverted", target)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    shutil.rmtree(revert_dir, ignore_errors=True)
    return mod


def build_candidate(module, frame_record):
    """Builds a real Candidate from this phase's own real tiled-detection
    trace, via the SAME candidate_from_landmarks() production function."""
    if not frame_record["detected"]:
        return None
    lm_dict = frame_record["landmarks"]  # name -> [x, y, visibility]
    points = []
    for name in MP_33_NAMES:
        if name in lm_dict:
            x, y, vis = lm_dict[name]
            points.append(_LM(x, y, vis))
        else:
            points.append(_LM(0.0, 0.0, 0.0))
    return module.candidate_from_landmarks(points, 1.0, 1.0, TRACKER_LANDMARK_NAMES)


def replay(module, frames):
    tracker = module.AthleteTracker(travel_direction="left_to_right", fps=FPS_BY_LABEL_CURRENT, entry_gate=None)
    timeline = []
    first_tracked = None
    for fr in frames:
        c = build_candidate(module, fr)
        result = tracker.step([c] if c is not None else [None], fr["sourceFrameIndex"], fr["tMs"] / 1000.0)
        timeline.append({"sourceFrameIndex": fr["sourceFrameIndex"], "tMs": fr["tMs"], "identityState": result["identityState"], "selectedIndex": result["selectedIndex"]})
        if first_tracked is None and result["identityState"] == "tracked":
            first_tracked = {"sourceFrameIndex": fr["sourceFrameIndex"], "tMs": fr["tMs"]}
    return first_tracked, timeline


if __name__ == "__main__":
    reverted = load_reverted_module()
    with open(os.path.join(OUT, "pose-completeness-stage-trace-raw.json")) as f:
        traces = json.load(f)

    results = {}
    for label, frames in traces.items():
        FPS_BY_LABEL_CURRENT = FPS_BY_LABEL[label]  # noqa: F841 -- used via closure below
        globals()["FPS_BY_LABEL_CURRENT"] = FPS_BY_LABEL[label]
        before_first, before_timeline = replay(reverted, frames)
        after_first, after_timeline = replay(at_current, frames)
        results[label] = {
            "beforeFirstTracked": before_first,
            "afterFirstTracked": after_first,
            "improvementMs": (before_first["tMs"] - after_first["tMs"]) if (before_first and after_first) else None,
            "beforeTimeline": before_timeline,
            "afterTimeline": after_timeline,
        }
        print(f"{label}: before={before_first} after={after_first}")

    with open(os.path.join(OUT, "full-fidelity-acquisition-replay.json"), "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {OUT}/full-fidelity-acquisition-replay.json")
