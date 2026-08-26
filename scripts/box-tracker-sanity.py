#!/usr/bin/env python3
"""Deterministic tests for box_tracker.py (Day 96 audit, Parts 2-4; Day 104
Part 4 adaptive detector refresh).

Uses REAL cv2 optical-flow/tracking on small synthetic frames (a textured
patch on a blank background, so goodFeaturesToTrack/calcOpticalFlowPyrLK have
real features) — not mocked, but fully offline/deterministic (no video/network).

Day 104 note: this file previously assumed a SINGLE detector candidate could
immediately lock identity (`track_state == "verified"` after one `step()`
call). That stopped being true once Day 101 introduced multi-stage
acquisition (SEARCHING -> CANDIDATE -> VERIFYING -> TRACKED, requiring
MIN_VERIFICATION_HITS consistent, moving hits before a lock is trusted) —
this file was never updated for that and was not wired into `package.json`,
so it had been silently stale ever since. Rewired into `box-tracker:sanity`
this session; every fixture below now goes through `lock_in()` (mirroring
`athlete-tracker-sanity.py`'s own `run_to_tracked` helper) instead of
assuming a one-frame lock.

    .venv/bin/python scripts/box-tracker-sanity.py
"""
import sys, os
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, ACCELERATED_REFRESH_INLIER_RATIO,
    ACCELERATED_REFRESH_MIN_FRAMES, ACCELERATED_REFRESH_TREND_WINDOW,
    TRACKING_UNRELIABLE_ZERO_INLIER_RATIO,
)
from athlete_tracker import AthleteTracker, Candidate  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 640, 360
# A FIXED checkerboard texture, large enough that any translated window still
# samples real, corner-rich, self-consistent content — this is what makes
# optical flow have genuine correspondence between frames (a moving patch of
# INDEPENDENTLY random noise per frame, tried initially, has no true
# correspondence and understates real-world tracking behavior).
_TEXTURE = np.indices((H + 400, W + 400)).sum(axis=0) % 2 * 255
_TEXTURE = _TEXTURE.astype("uint8")
_TEXTURE[::9, :] = (_TEXTURE[::9, :].astype(int) // 2).astype("uint8")  # break pure periodicity a bit
_TEXTURE[:, ::11] = (_TEXTURE[:, ::11].astype(int) // 3).astype("uint8")


def make_frame(patch_cx, patch_cy, patch_size=60):
    """A blank frame with a textured square patch at (patch_cx, patch_cy),
    sampled from a fixed global texture so the SAME content appears at a
    shifted location when the patch moves — genuine optical-flow correspondence."""
    img = np.full((H, W), 30, dtype="uint8")
    x0, y0 = int(patch_cx - patch_size / 2), int(patch_cy - patch_size / 2)
    x1, y1 = x0 + patch_size, y0 + patch_size
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(W, x1), min(H, y1)
    if cx1 > cx0 and cy1 > cy0:
        img[cy0:cy1, cx0:cx1] = _TEXTURE[cy0 + 200:cy1 + 200, cx0 + 200:cx1 + 200]
    return img


def cand(cx, cy, w=60, h=60, completeness=0.9):
    return Candidate(cx / W, cy / H, w / W, h / H, {}, completeness)


def lock_in(bt, cx0, cy, step_px=8, fps=60.0, max_frames=30):
    """Feed enough consecutive, moving, near-entry candidates for `bt` to
    reach a real Day 101 identity lock (`track_state == "verified"`) — a
    single-frame candidate can never lock identity under the current
    multi-stage acquisition design. Returns (last_record, last_gray, cx,
    next_frame_index, next_time_s)."""
    cx = cx0
    prev = None
    r = None
    g = None
    for i in range(max_frames):
        g = make_frame(cx, cy)
        r = bt.step(i, i / fps, prev, g, [cand(cx, cy)], expected_dir_sign=1)
        if bt.track_state == "verified":
            return r, g, cx, i + 1, (i + 1) / fps
        prev = g
        cx += step_px
    raise AssertionError("lock_in: fixture did not reach 'verified' within max_frames")


# --- 1. Detector refresh cadence --------------------------------------------
id_tracker = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt = AthleteBoxTracker(id_tracker, detector_cadence_frames=6, width=W, height=H)
check("1. wants_detector_frame() is True before any acquisition", bt.wants_detector_frame())
r0, g_last, cx0, frame0, t0 = lock_in(bt, 100, 180, step_px=5, fps=60.0)
check("1b. after enough corroborating hits, state becomes 'verified' (Day 101 lock)", bt.track_state == "verified")
cadence_hits = []
prev = g_last
for i in range(12):
    g = make_frame(cx0 + i * 5, 180)
    wants = bt.wants_detector_frame()
    cadence_hits.append(wants)
    bt.step(frame0 + i, t0 + i / 60.0, prev, g, [cand(cx0 + i * 5, 180)] if wants else None, expected_dir_sign=1)
    prev = g
check("1c. detector is NOT requested on every frame (cadence < 1.0)", sum(cadence_hits) < len(cadence_hits))
check("1d. detector IS requested again once the cadence interval elapses", any(cadence_hits[4:7]))

# --- 2. Box tracking between detector frames (optical flow) ----------------
id_tracker2 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt2 = AthleteBoxTracker(id_tracker2, detector_cadence_frames=100, width=W, height=H)  # effectively "detect once"
_, g0, cx2, frame2, t2 = lock_in(bt2, 150, 180, step_px=5, fps=60.0)
g1 = make_frame(cx2 + 10, 180)  # patch moved +10px — pure optical-flow tracking, no detector
r1 = bt2.step(frame2, t2, g0, g1, None, expected_dir_sign=1)
check("2. a non-detector frame is tracked via optical flow, not re-detected", r1.boxOrigin == "tracked")
check("2b. the tracked box moved in the direction the patch actually moved", r1.box[0] > cx2)
check("2c. tracked frames report real (non-zero) optical-flow inlier evidence", r1.opticalFlowInliers > 0)

# --- 3/4/5. Predicted boxes are structurally distinct from verified evidence
id_tracker3 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt3 = AthleteBoxTracker(id_tracker3, detector_cadence_frames=100, width=W, height=H)
_, g0, cx3, frame3, t3 = lock_in(bt3, 150, 180, step_px=5, fps=60.0)
# A blank (featureless) next frame — optical flow has nothing to track, forcing prediction.
blank = np.full((H, W), 30, dtype="uint8")
r_pred = bt3.step(frame3, t3, g0, blank, None, expected_dir_sign=1)
check("3. when tracking evidence is unavailable, the box is marked 'predicted', not 'tracked'/'detected'", r_pred.boxOrigin == "predicted")
check("4. a predicted frame carries zero detectionConfidence (no pose evidence)", r_pred.detectionConfidence is None)
check("5. a predicted frame's identityContinuityScore is 0.0 (never counts as verified)", r_pred.identityContinuityScore == 0.0)

# --- 6. Direction-inconsistent tracked motion is rejected -------------------
id_tracker4 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt4 = AthleteBoxTracker(id_tracker4, detector_cadence_frames=100, width=W, height=H)
_, g0, cx4, frame4, t4 = lock_in(bt4, 150, 180, step_px=5, fps=60.0)
g1 = make_frame(cx4 - 70, 180)  # patch moved -70px: strongly opposite the configured left_to_right direction
r_dir = bt4.step(frame4, t4, g0, g1, None, expected_dir_sign=1)
check("6. a tracked box moving opposite the configured direction is not accepted as 'tracked'", r_dir.boxOrigin != "tracked")

# --- 7. Another person entering does not steal identity (detector frames) --
id_tracker5 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt5 = AthleteBoxTracker(id_tracker5, detector_cadence_frames=1, width=W, height=H)
cx = 100
prev = None
selected = []  # (loop index, selected x) pairs — only populated once a real lock exists
for i in range(30):
    g = make_frame(cx, 180)
    candidates = [cand(cx, 180), cand(400, 250)]  # a second, unrelated, STATIC "person"
    r = bt5.step(i, i / 60.0, prev, g, candidates, expected_dir_sign=1)
    if r.boxOrigin in ("detected", "reacquired"):
        selected.append((i, r.box[0]))
    prev = g
    cx += 8
check("7. identity actually locked during this fixture", len(selected) > 0)
check("7. the real (moving, entry-consistent) athlete is selected over the static second person every time", all(abs(x - (100 + 8 * i)) < 1 for i, x in selected))

# --- 8. Short detector gaps preserve crop continuity ------------------------
id_tracker6 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt6 = AthleteBoxTracker(id_tracker6, detector_cadence_frames=5, width=W, height=H)
_, g_last6, cx6, frame6, t6 = lock_in(bt6, 100, 180, step_px=6, fps=60.0)
prev = g_last6
cx = cx6
for i in range(5):
    g = make_frame(cx, 180)
    wants = bt6.wants_detector_frame()
    bt6.step(frame6 + i, t6 + i / 60.0, prev, g, [cand(cx, 180)] if wants else None, expected_dir_sign=1)
    prev = g
    cx += 6
check("8. across a short (sub-cadence) gap the track never drops to 'lost'/'terminated'", bt6.track_state not in ("lost", "terminated"))
check("8b. the box position tracks the real motion (didn't freeze) across the gap", bt6.last_box[0] > cx6)

# --- 9. Long tracking-quality loss enters reacquisition ---------------------
id_tracker7 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt7 = AthleteBoxTracker(id_tracker7, detector_cadence_frames=100, width=W, height=H)
_, g0, cx7, frame7, t7 = lock_in(bt7, 150, 180, step_px=5, fps=60.0)
prev = g0
for i in range(9):
    blank = np.full((H, W), 30, dtype="uint8")
    bt7.step(frame7 + i, t7 + i / 60.0, prev, blank, None, expected_dir_sign=1)
    prev = blank
check("9. sustained tracking-quality loss (no flow evidence) enters 'reacquiring'", bt7.track_state == "reacquiring")

# --- 10. Track termination after bounded failure ----------------------------
id_tracker8 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt8 = AthleteBoxTracker(id_tracker8, detector_cadence_frames=100, width=W, height=H)
_, g0, cx8, frame8, t8 = lock_in(bt8, 150, 180, step_px=5, fps=60.0)
prev = g0
for i in range(219):  # well beyond REACQUISITION_MAX_FRAMES*2
    blank = np.full((H, W), 30, dtype="uint8")
    bt8.step(frame8 + i, t8 + i / 60.0, prev, blank, None, expected_dir_sign=1)
    prev = blank
check("10. an unbounded failure eventually reaches 'terminated', not an infinite 'reacquiring'", bt8.track_state == "terminated")

# --- Summary sanity ----------------------------------------------------------
s = bt5.summary()
# Not every detector invocation yields a selected candidate (a SEARCHING-phase
# call can run the detector and still find nothing corroborated yet — that's
# an "invalid" frame, not a bug) — so detected+reacquired is a LOWER bound on
# detectorInvocations, not an equality, under the Day 101 multi-stage model.
check(
    "summary() reports consistent totals",
    s["totalFrames"] == 30 and s["detectedFrames"] + s["reacquiredFrames"] <= s["detectorInvocations"],
)

# --- Day 104 (Part 4): adaptive detector refresh on declining quality -------
# White-box: directly seeds `frames_since_detector` / `recent_inlier_ratios`
# and calls `wants_detector_frame()` — deterministic and precisely isolates
# the new trend logic from real cv2 optical-flow noise (real end-to-end
# behavior is already covered by tests 1-10 above using genuine cv2 tracking).


def wants_with(bt_obj, frames_since_detector, ratios, state="tracking"):
    bt_obj.track_state = state
    bt_obj.frames_since_detector = frames_since_detector
    bt_obj.recent_inlier_ratios = list(ratios)
    return bt_obj.wants_detector_frame()


probe_tracker = AthleteTracker(travel_direction="left_to_right", fps=240.0)
bt9 = AthleteBoxTracker(probe_tracker, detector_cadence_frames=20, width=W, height=H)

check(
    "P4.1. a high, stable inlier-ratio trend does NOT force an early detector request",
    not wants_with(bt9, ACCELERATED_REFRESH_MIN_FRAMES + 2, [0.95, 0.92, 0.9, 0.93]),
)
check(
    "P4.2. a trend clearly below the accelerated-refresh threshold DOES force an early request, before the normal cadence",
    wants_with(bt9, ACCELERATED_REFRESH_MIN_FRAMES + 2, [0.6, 0.5, 0.4, 0.3]),
)
check(
    "P4.3. a declining trend is still respected only after the minimum-frames floor (no per-frame thrashing)",
    not wants_with(bt9, ACCELERATED_REFRESH_MIN_FRAMES - 1, [0.6, 0.5, 0.4, 0.3]),
)
check(
    "P4.4. a trend shorter than the trend window is not yet actionable (insufficient evidence, not a false trigger)",
    not wants_with(bt9, ACCELERATED_REFRESH_MIN_FRAMES + 2, [0.3, 0.3]),
)
check(
    "P4.5. the normal cadence still fires regardless of quality (additive, not a replacement)",
    wants_with(bt9, 20, [0.95, 0.95, 0.95, 0.95]),
)
check(
    "P4.6. the accelerated-refresh threshold itself is a real, non-trivial constant (not accidentally 0 or 1)",
    0.0 < ACCELERATED_REFRESH_INLIER_RATIO < 1.0,
)

# A fresh identity-verified lock must clear any stale declining-quality
# history, so the FIRST frame after a re-detection never immediately forces
# another one just because of pre-relock noise.
id_tracker10 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt10 = AthleteBoxTracker(id_tracker10, detector_cadence_frames=20, width=W, height=H)
_, _, _, _, _ = lock_in(bt10, 150, 180, step_px=5, fps=60.0)
check("P4.7. recent_inlier_ratios is reset immediately after a fresh identity-verified detection", bt10.recent_inlier_ratios == [])

# --- R5B.4: zero-inlier flow evidence triggers immediate reacquisition -----
# White-box the exact boundary observed in Vanni: optical flow returns a box
# but has ZERO inlier support.  The test deliberately preserves the genuine
# Day-101 lock and feeds the normal candidate/identity path on recovery.
id_tracker11 = AthleteTracker(travel_direction="left_to_right", fps=60.0)
bt11 = AthleteBoxTracker(id_tracker11, detector_cadence_frames=20, width=W, height=H)
_, g11, cx11, frame11, t11 = lock_in(bt11, 150, 180, step_px=5, fps=60.0)
saved_box11 = bt11.last_box
blank11 = np.full((H, W), 30, dtype="uint8")
bt11._track_via_optical_flow = lambda prev, cur, time_s: (saved_box11, 0, TRACKING_UNRELIABLE_ZERO_INLIER_RATIO, {  # noqa: E731
    "athleteInteriorFeatureRatio": None, "backgroundRiskFeatureRatio": None,
    "flowRejectedBackgroundDominated": False,
})
r11 = bt11.step(frame11, t11, g11, blank11, None, expected_dir_sign=1)
check("R5B4.1. zero-inlier retained flow transitions directly to reacquiring", r11.trackState == "reacquiring" and r11.trackingUnreliable)
check("R5B4.2. unreliable transition preserves identity/last verified box", bt11.last_box == saved_box11 and id_tracker11.identity_state == "tracked")
check("R5B4.3. reacquiring requests the existing full-frame detector every frame", bt11.wants_detector_frame())
recovery_frame = make_frame(cx11 + 5, 180)
r11_recovered = bt11.step(frame11 + 1, t11 + 1 / 60.0, blank11, recovery_frame, [cand(cx11 + 5, 180)], expected_dir_sign=1)
check("R5B4.4. accepted existing candidate returns reacquiring to verified tracking", r11_recovered.boxOrigin == "reacquired" and r11_recovered.trackState == "verified")
check("R5B4.5. healthy optical-flow tracking does not create an unreliable transition", bt2.summary()["trackingUnreliableTransitions"] == 0)

# --- Day 104 (Part 2) regression guard: `track_state` is NOT a reliable
# "still pre-lock" signal ---------------------------------------------------
# Caught via a real end-to-end production rerun (not a synthetic test): the
# first Day 104 implementation of backward identity recovery in
# mediapipe_pose_runner.py checked `box_tracker.track_state == "acquiring"`
# to decide which frames' candidates to buffer for the backward walk. That
# is wrong — `track_state` flips from "acquiring" to "reacquiring" the very
# first time a detector call fails to select a candidate (reached via the
# prediction-fallback branch whenever `last_box is None`, i.e. every frame
# before the true first lock) and never reverts, so it is only ever
# "acquiring" for a frame or two. This test documents and guards that real
# behavior explicitly, so any future pre-lock-detection logic reaches for
# `AthleteTracker.identity_state` (searching/candidate/verifying — which
# correctly stays pre-lock for the whole real pre-lock period) instead of
# repeating the same mistake.
id_tracker11 = AthleteTracker(travel_direction="left_to_right", fps=240.0)
bt11 = AthleteBoxTracker(id_tracker11, detector_cadence_frames=8, width=W, height=H)
g0 = make_frame(100, 180)
r0 = bt11.step(0, 0.0, None, g0, [cand(100, 180)], expected_dir_sign=1)
check(
    "REGRESSION: after ONE detector call that doesn't yet select a candidate, box_tracker.track_state already left 'acquiring'",
    bt11.track_state != "acquiring" and id_tracker11.identity_state in ("candidate", "verifying"),
)
check(
    "REGRESSION: identity_tracker.identity_state correctly still reports pre-lock here — the signal Day 104's fix uses",
    id_tracker11.identity_state in ("searching", "candidate", "verifying"),
)

print("\n" + ("ALL PASSED" if ok else "FAILURES PRESENT"))
sys.exit(0 if ok else 1)
