#!/usr/bin/env python3
"""Phase R3B-3 Part I -- compares real full-fidelity startup acquisition
latency under 4 promotion-path configurations:
  1. DISPLACEMENT-ONLY   -- the original, pre-R3B-1 path alone
  2. +STRONG-POSE        -- R3B-1's shipped state (displacement OR strong-pose)
  3. +TORSO (no strong-pose) -- isolates the NEW R3B-3 torso path's own
     contribution (displacement OR torso -- strong-pose disabled)
  4. ALL THREE (current)  -- the real, current shipped state

Uses monkeypatching (not R3B-2's string-replace revert, which silently
stopped matching once Part P changed the promotion-check code shape --
found and disclosed as a real methodology issue this phase, not silently
carried forward) -- robust to future code-shape changes, and reuses the
SAME real full-fidelity per-frame trace R3B-2 already gathered (no
re-inference).

    python3 scripts/phase-r3b3-contract-comparison.py
"""
import sys, os, json, contextlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
OUT = os.path.join(ROOT, "tmp/phaseR3B3")
sys.path.insert(0, RUNTIME_DIR)
import athlete_tracker as at  # noqa: E402

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

    def __init__(self, x, y, v):
        self.x, self.y, self.visibility = x, y, v


def build_candidate(fr):
    if not fr["detected"]:
        return None
    lm = fr["landmarks"]
    points = [_LM(*lm[n]) if n in lm else _LM(0.0, 0.0, 0.0) for n in MP_33_NAMES]
    return at.candidate_from_landmarks(points, 1.0, 1.0, TRACKER_LANDMARK_NAMES)


@contextlib.contextmanager
def _patched(disable_strong_pose=False, disable_torso=False):
    orig_strong = at.PendingIdentity.ready_via_strong_pose
    orig_torso = at.PendingIdentity.ready_via_torso_corroboration
    if disable_strong_pose:
        at.PendingIdentity.ready_via_strong_pose = lambda self: False
    if disable_torso:
        at.PendingIdentity.ready_via_torso_corroboration = lambda self: False
    try:
        yield
    finally:
        at.PendingIdentity.ready_via_strong_pose = orig_strong
        at.PendingIdentity.ready_via_torso_corroboration = orig_torso


def replay(frames, fps):
    tracker = at.AthleteTracker(travel_direction="left_to_right", fps=fps, entry_gate=None)
    for fr in frames:
        c = build_candidate(fr)
        result = tracker.step([c] if c is not None else [None], fr["sourceFrameIndex"], fr["tMs"] / 1000.0)
        if result["identityState"] == "tracked":
            return {"sourceFrameIndex": fr["sourceFrameIndex"], "tMs": fr["tMs"], "reason": result["identityPromotionReason"]}
    return None


if __name__ == "__main__":
    with open(os.path.join(ROOT, "tmp/phaseR3B2/pose-completeness-stage-trace-raw.json")) as f:
        raw = json.load(f)

    results = {}
    for label, frames in raw.items():
        fps = FPS_BY_LABEL[label]
        with _patched(disable_strong_pose=True, disable_torso=True):
            displacement_only = replay(frames, fps)
        with _patched(disable_torso=True):
            plus_strong_pose = replay(frames, fps)
        with _patched(disable_strong_pose=True):
            plus_torso_only = replay(frames, fps)
        current = replay(frames, fps)  # no patch -- all 3 paths active, real shipped behavior
        results[label] = {
            "displacementOnly": displacement_only,
            "plusStrongPose_R3B1": plus_strong_pose,
            "plusTorsoOnly_R3B3_isolated": plus_torso_only,
            "current_allThreePaths": current,
        }
        print(f"{label}: displacementOnly={displacement_only and displacement_only['tMs']} "
              f"plusStrongPose={plus_strong_pose and plus_strong_pose['tMs']} "
              f"plusTorsoOnly={plus_torso_only and plus_torso_only['tMs']} "
              f"current={current and current['tMs']} (reason={current and current['reason']})")

    with open(os.path.join(OUT, "contract-comparison.json"), "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {OUT}/contract-comparison.json")
