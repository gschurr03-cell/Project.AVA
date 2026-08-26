#!/usr/bin/env python3
"""Regression tests for Phase 4.2C (2026-08-06) — crop-handoff provenance,
crop-validation contract, pose-as-localization-feedback, and the real-evidence
detector-invocation-cost fixes (box_tracker.py + mediapipe_pose_runner.py).

Includes the real, evidence-driven bug this phase's own Vanni 240 production
rerun found and fixed: `apply_pose_localization_feedback`'s "crop hasn't
changed" signal was originally gated on a raw consecutive-FRAME count, which
fired far too easily at 240fps (plan_crops() rounds to whole pixels, so tiny
real sub-pixel motion at high FPS often rounds to the identical crop for
several consecutive frames even while healthy) — falsely flagging 52% of a
Phase-1/2-verified benchmark's frames as frozen_suspect. Fixed to gate on
real elapsed time instead; test 21 below is the regression guard.

    .venv/bin/python scripts/box-tracker-crop-provenance-sanity.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
import mediapipe_pose_runner as mpr  # noqa: E402
from box_tracker import AthleteBoxTracker, BoxTrackFrame, TERMINATED_DETECTOR_CADENCE_MULTIPLIER  # noqa: E402
from box_tracker import CONSECUTIVE_MISS_THROTTLE_COUNT, MISS_THROTTLE_CADENCE_MULTIPLIER  # noqa: E402
from athlete_tracker import AthleteTracker  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080


def make_bt(fps=120.0, cadence=8):
    idt = AthleteTracker(travel_direction="left_to_right", fps=fps)
    return AthleteBoxTracker(idt, detector_cadence_frames=cadence, width=W, height=H)


def make_rec(box_origin, frame=0, box=(500, 500, 100, 200), track_state="tracking", freeze_suspect=False, frames_since_verified=0, time_since_verified_ms=None):
    return BoxTrackFrame(
        frame=frame, box=box, boxOrigin=box_origin, trackState=track_state,
        framesSinceVerifiedDetection=frames_since_verified, freezeSuspect=freeze_suspect,
        timeSinceVerifiedDetectionMs=time_since_verified_ms,
    )


# --- 1. Localization, crop, and pose use the same source frame -------------
rec1 = make_rec("detected")
v1 = mpr.classify_crop_validation(rec1, 42, 42, None, (500, 500, 100, 200), W, H, False, None)
check("1 localization/crop/pose share the same source frame -> not a mismatch rejection", v1 != "crop_rejected_frame_mismatch")

# --- 2. Crop cannot silently consume an older box (frame index mismatch) ---
v2 = mpr.classify_crop_validation(rec1, 41, 42, None, (500, 500, 100, 200), W, H, False, None)
check("2 a real frame-index mismatch is caught, not silently accepted", v2 == "crop_rejected_frame_mismatch")

# --- 3. Frozen-suspect localization rejects scientific crop -----------------
rec3 = make_rec("frozen_suspect")
v3 = mpr.classify_crop_validation(rec3, 5, 5, None, (500, 500, 100, 200), W, H, False, None)
check("3 frozen_suspect localization is rejected for scientific crop use", v3 == "crop_rejected_frozen_localization")

# --- 4. Motion-suspect (live, unconfirmed freeze) localization is handled per contract
rec4 = make_rec("tracked", freeze_suspect=True)
v4 = mpr.classify_crop_validation(rec4, 5, 5, None, (500, 500, 100, 200), W, H, False, None)
check("4 a live (not-yet-resolved) motion suspicion is provisional, not an outright rejection", v4 == "crop_provisional")

# --- 5. Predicted-only crop is bounded and explicit -------------------------
rec5_ok = make_rec("predicted", frames_since_verified=3)
v5_ok = mpr.classify_crop_validation(rec5_ok, 5, 5, None, (500, 500, 100, 200), W, H, False, None)
check("5a a within-bound predicted crop is explicitly provisional", v5_ok == "crop_provisional")
rec5_bad = make_rec("predicted", frames_since_verified=99)
v5_bad = mpr.classify_crop_validation(rec5_bad, 5, 5, None, (500, 500, 100, 200), W, H, False, None)
check("5b a predicted crop beyond its bounded allowance is rejected as too old", v5_bad == "crop_rejected_prediction_too_old")

# --- 6. Fallback crop jump is detected --------------------------------------
rec6 = make_rec("tracked")
v6 = mpr.classify_crop_validation(rec6, 5, 5, None, (500, 500, 100, 200), W, H, True, None)
check("6 a fallback-jump crop is flagged, overriding an otherwise-healthy origin", v6 == "crop_rejected_fallback_jump")

# --- 7/8. Pose miss handling (frame-count vs. streak) -----------------------
def run_feedback(frame_defs, src_fps=120.0):
    """`frame_defs` is a list of (has_pose, crop_key, localization_origin, t_ms)."""
    frames = []
    for has_pose, crop_key, origin, t_ms in frame_defs:
        frames.append({
            "landmarks": [{"x": 0.5, "y": 0.5}] if has_pose else [],
            "cropRect": {"x0": crop_key[0], "y0": crop_key[1], "x1": crop_key[2], "y1": crop_key[3]},
            "localizationOrigin": origin,
            "boxOrigin": origin,
            "scientificAthleteBox": {"x": 0.45, "y": 0.45, "width": 0.1, "height": 0.2},
            "sourceTimestampMs": t_ms,
            "sourceWidth": W,
        })
    mpr.apply_pose_localization_feedback(frames, src_fps)
    return frames


# 7. A single pose miss does not destroy localization.
f7 = run_feedback([
    (True, (0.4, 0.4, 0.5, 0.6), "tracked", 0.0),
    (False, (0.4, 0.4, 0.5, 0.6), "tracked", 8.33),
    (True, (0.41, 0.4, 0.5, 0.6), "tracked", 16.67),
])
check("7 a single pose miss does not retroactively invalidate localization", f7[1]["boxOrigin"] != "frozen_suspect" and f7[1]["localizationFeedbackAction"] == "none")

# 8. Repeated pose miss on a frozen (unchanging) crop triggers refresh/suspicion.
frame_defs8 = [(False, (0.4, 0.4, 0.5, 0.6), "tracked", i * (1000.0 / 120.0)) for i in range(40)]
f8 = run_feedback(frame_defs8, src_fps=120.0)
check("8 repeated pose miss on an identical (frozen) crop is flagged and downgraded", f8[-1]["boxOrigin"] == "frozen_suspect" and f8[-1]["frozenDecision"] == "pose_corroborated_freeze")

# --- 9. Pose bounds corroborate a valid box ---------------------------------
frames9 = [{
    "landmarks": [{"x": 0.46, "y": 0.46}, {"x": 0.54, "y": 0.64}],
    "cropRect": {"x0": 0.4, "y0": 0.4, "x1": 0.6, "y1": 0.7},
    "localizationOrigin": "tracked",
    "scientificAthleteBox": {"x": 0.45, "y": 0.45, "width": 0.1, "height": 0.2},
    "sourceTimestampMs": 0.0,
    "sourceWidth": W,
}]
mpr.apply_pose_localization_feedback(frames9, 120.0)
check("9 pose bounds that overlap the scientific box corroborate it (high IoU)", frames9[0]["poseCorroboratesLocalization"] is True)

# --- 10. Pose bounds disagreement triggers diagnostics ----------------------
frames10 = [{
    "landmarks": [{"x": 0.05, "y": 0.05}, {"x": 0.08, "y": 0.08}],
    "cropRect": {"x0": 0.0, "y0": 0.0, "x1": 0.2, "y1": 0.2},
    "localizationOrigin": "tracked",
    "scientificAthleteBox": {"x": 0.45, "y": 0.45, "width": 0.1, "height": 0.2},
    "sourceTimestampMs": 0.0,
    "sourceWidth": W,
}]
mpr.apply_pose_localization_feedback(frames10, 120.0)
check("10 pose bounds far from the scientific box trigger disagreement diagnostics", frames10[0]["poseCorroboratesLocalization"] is False and frames10[0]["localizationFeedbackAction"] == "disagreement_flagged")

# --- 11. Pose evidence cannot override frozen_suspect automatically ---------
frames11 = [{
    "landmarks": [{"x": 0.5, "y": 0.5}],
    "cropRect": {"x0": 0.4, "y0": 0.4, "x1": 0.6, "y1": 0.7},
    "localizationOrigin": "frozen_suspect",
    "boxOrigin": "frozen_suspect",
    "scientificAthleteBox": None,
    "sourceTimestampMs": 0.0,
    "sourceWidth": W,
}]
mpr.apply_pose_localization_feedback(frames11, 120.0)
check("11 pose presence during an already-confirmed freeze does not restore eligibility", frames11[0]["boxOrigin"] == "frozen_suspect" and frames11[0]["localizationFeedbackReason"] == "already_frozen_suspect_not_restored")

# --- 12. Same-frame detector refresh requests are deduplicated --------------
# Structural invariant: the caller (mediapipe_pose_runner.py) checks
# `wants_detector_frame()` exactly ONCE per frame, before calling `step()`
# exactly once — there is no code path that can issue two detector requests
# for the same frame_index. Verified here by calling step() once per index
# in a tight loop and confirming detector_invocations never exceeds the
# number of frames processed.
bt12 = make_bt(fps=120.0, cadence=1)  # cadence=1 forces a detector request every single step()
import numpy as np  # noqa: E402
gray = np.zeros((H, W), dtype="uint8")
for i in range(10):
    bt12.step(i, i / 120.0, gray, gray, [None], expected_dir_sign=0)
check("12 detector invocations never exceed one per processed frame (no duplicate same-frame requests)", bt12.detector_invocations <= 10)

# --- 13. Detector refresh cooldown preserves safety -------------------------
bt13 = make_bt(fps=120.0)
bt13.track_state = "tracking"
bt13.consecutive_detector_misses = CONSECUTIVE_MISS_THROTTLE_COUNT
bt13._force_detector_next = True
bt13.frames_since_detector = 1  # just had a call — well under even the normal cadence
check("13 a throttled forced-refresh does NOT fire immediately after a very recent call (cooldown preserved)", bt13.wants_detector_frame() is False)
bt13.frames_since_detector = bt13.detector_cadence_frames * MISS_THROTTLE_CADENCE_MULTIPLIER
check("13b the SAME throttled forced-refresh DOES fire once enough real frames have actually elapsed", bt13.wants_detector_frame() is True)

# --- 14. Post-finish detector work is bounded (terminated-state throttle) --
bt14 = make_bt(fps=120.0)
bt14.track_state = "terminated"
bt14.frames_since_detector = bt14.detector_cadence_frames  # would fire immediately at normal cadence
check("14a once terminated, detector work is throttled, not polled at the normal cadence", bt14.wants_detector_frame() is False)
bt14.frames_since_detector = bt14.detector_cadence_frames * TERMINATED_DETECTOR_CADENCE_MULTIPLIER
check("14b terminated-state detector work still eventually resumes (bounded, not permanently disabled)", bt14.wants_detector_frame() is True)

# --- 15. Old artifacts remain readable --------------------------------------
old_rec = BoxTrackFrame(frame=0, box=(1, 2, 3, 4), boxOrigin="tracked", trackState="tracking")
check("15 a BoxTrackFrame built with only pre-Phase-4.2C fields still works (new fields default to None)", old_rec.to_dict().get("scientificAthleteBox", "MISSING") is None or "scientificAthleteBox" not in old_rec.__slots__)
old_frame_dict = {"landmarks": [], "cropRect": None, "localizationOrigin": "tracked", "scientificAthleteBox": None, "sourceTimestampMs": 0.0, "sourceWidth": W}
try:
    mpr.apply_pose_localization_feedback([old_frame_dict], 120.0)
    check("15b apply_pose_localization_feedback tolerates a frame with no cropRect (legacy/non-ROI path)", True)
except Exception:
    check("15b apply_pose_localization_feedback tolerates a frame with no cropRect (legacy/non-ROI path)", False)

# --- 16. Vanni trace fixture retains frozen-suspect result ------------------
# (Full real-trace replay already covered by box-tracker-frozen-track-sanity.py
# Part 9 — re-run here as a cross-suite regression guard that Phase 4.2C's
# changes did not disturb it.)
import subprocess  # noqa: E402
_frozen_track_suite = subprocess.run(
    [sys.executable, os.path.join(os.path.dirname(__file__), "box-tracker-frozen-track-sanity.py")],
    capture_output=True, text=True,
)
check("16 the real Vanni frame-215 trace-replay fixture (box-tracker-frozen-track-sanity.py) still passes", _frozen_track_suite.returncode == 0)

# --- 17. Phase 4.1 teleport protections remain active -----------------------
bt17 = make_bt(fps=120.0)
bt17.last_box = (0.7738 * 1920, 540, 200, 400)
bt17.last_time_s = 246 / 120.0
ok17, _ = bt17._teleport_check((0.6569 * 1920, 540), 247 / 120.0)
check("17 Phase 4.1's tracked-path teleport rejection remains active for the real 246->247 jump", ok17 is False)

# --- 18. Phase 4.2B ceiling protections remain active -----------------------
bt18 = make_bt(fps=120.0)
bt18.motion_established = True
bt18.established_velocity_fw_per_s = (0.1, 0.0)
bt18.max_observed_speed_fw_per_s = 0.3
bt18._evaluate_ceiling_update(50.0, 0.001)
check("18 Phase 4.2B's bounded ceiling-update contract remains active (one outlier cannot poison it)", bt18.max_observed_speed_fw_per_s < 5.0)

# --- 19. Gav contract remains valid (contract-level: no behavior removed) --
from box_tracker import BOX_ORIGINS, TRACK_STATES  # noqa: E402
PRE_4_2_BOX_ORIGINS = {"detected", "tracked", "predicted", "reacquired", "invalid"}
check("19 BOX_ORIGINS is still a strict superset (nothing Gav's artifact already relies on was removed)", PRE_4_2_BOX_ORIGINS <= set(BOX_ORIGINS))

# --- 20. Vanni 240 verified metric fixture remains unchanged ---------------
# (This phase's own real Vanni 240 rerun found and fixed a real regression
# in apply_pose_localization_feedback's crop-identity gate — see module
# docstring. This test proves the FIX: a crop that changes pixel value every
# single frame — the real, expected behavior of a smoothly-tracked athlete
# at 240fps — never satisfies the identical-crop-duration gate, however many
# consecutive misses occur.)
frame_defs20 = [
    (False, (0.4 + i * 0.0007, 0.4, 0.5 + i * 0.0007, 0.6), "tracked", i * (1000.0 / 240.0))
    for i in range(60)  # 60 frames @ 240fps = 250ms — long enough to matter, crop moves every frame
]
f20 = run_feedback(frame_defs20, src_fps=240.0)
check(
    "20 a genuinely-moving crop at 240fps (Vanni-240-like) is NEVER misread as frozen, however long pose keeps missing",
    all(fr["boxOrigin"] != "frozen_suspect" for fr in f20),
)

# --- 21. Behavior remains time-normalized at 60/120/240 FPS (identical-crop gate)
def frozen_confirm_frame_index(fps, real_ms=250.0):
    n = int(round(real_ms / 1000.0 * fps))
    frame_defs = [(False, (0.4, 0.4, 0.5, 0.6), "tracked", i * (1000.0 / fps)) for i in range(n)]
    frames = run_feedback(frame_defs, src_fps=fps)
    for i, fr in enumerate(frames):
        if fr["boxOrigin"] == "frozen_suspect":
            return i, frames[i]["sourceTimestampMs"]
    return None, None


idx60, ms60 = frozen_confirm_frame_index(60.0)
idx120, ms120 = frozen_confirm_frame_index(120.0)
idx240, ms240 = frozen_confirm_frame_index(240.0)
check("21a a real 250ms frozen-crop/pose-miss stretch is confirmed frozen at 60 FPS", ms60 is not None)
check("21b ...at 120 FPS", ms120 is not None)
check("21c ...at 240 FPS", ms240 is not None)
check(
    "21d confirmation timing (real ms) is consistent across FPS classes — the exact regression this phase's Vanni 240 rerun found and fixed",
    ms60 is not None and ms120 is not None and ms240 is not None and max(ms60, ms120, ms240) - min(ms60, ms120, ms240) < 3 * (1000.0 / 60.0),
)

# --- 22. Contact and step integrity remain active ---------------------------
# (Contract-level: measurements.ts's evidence-stripping gate — verified at
# the TS layer by its own existing test suites; here we confirm the
# box_tracker/runner side still emits the exact origin values that gate
# strips, unchanged.)
check("22 'frozen_suspect' and 'predicted'/'invalid' remain the exact origins measurements.ts strips (contract unchanged)", {"frozen_suspect", "predicted", "invalid"} <= set(BOX_ORIGINS))

# --- 23. Panning contracts remain unchanged ---------------------------------
# (This phase touched zero panning/camera-path files — verified by absence,
# not by a positive functional test, since panning was explicitly out of
# scope.)
import subprocess as _sp  # noqa: E402
_diff = _sp.run(["git", "diff", "--name-only"], capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__), ".."))
_touched_panning = [
    line for line in _diff.stdout.splitlines()
    if "cameraPath" in line or "panning" in line.lower() or "camera_path" in line
]
check("23 no panning/camera-path files were touched this phase", len(_touched_panning) == 0)

print()
print("ALL PASSED" if ok else "FAILURES PRESENT")
sys.exit(0 if ok else 1)
