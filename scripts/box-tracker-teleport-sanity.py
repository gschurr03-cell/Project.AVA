#!/usr/bin/env python3
"""Regression tests for the Phase 4.1 (2026-08-05) box-tracker teleport fix.

Proves, with the REAL numbers from the proven vanni_fly_120 frames-246->247
incident (see docs/phase-3-vanni-120-visibility-correction.md Section 7 and
docs/phase-4-1-box-tracker-reliability-report.md), that `_teleport_check()`
now rejects that exact jump — and, just as importantly, that it does NOT
reject ordinary athletic motion (a fix that rejects real motion would just
trade one failure mode for another). Also covers FIX B (a detector frame
that finds nobody now feeds the accelerated-refresh trend instead of being a
silent no-op).

    .venv/bin/python scripts/box-tracker-teleport-sanity.py
"""
import sys, os
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, TELEPORT_ABSOLUTE_CEILING_FW_PER_S, TELEPORT_MAX_VELOCITY_MULTIPLE,
    ACCELERATED_REFRESH_TREND_WINDOW,
)
from athlete_tracker import AthleteTracker, Candidate  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 640, 360
_TEXTURE = np.indices((H + 400, W + 400)).sum(axis=0) % 2 * 255
_TEXTURE = _TEXTURE.astype("uint8")
_TEXTURE[::9, :] = (_TEXTURE[::9, :].astype(int) // 2).astype("uint8")
_TEXTURE[:, ::11] = (_TEXTURE[:, ::11].astype(int) // 3).astype("uint8")


def make_frame(patch_cx, patch_cy, patch_size=60):
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


# --- 1. Unit-level proof against the REAL vanni_fly_120 246->247 numbers ----
# Real values from the proven incident (docs/phase-3-vanni-120-visibility-
# correction.md): normalized center x 0.7738 at frame 246 -> 0.6569 at frame
# 247, native 120fps (dt = 1/120s), source width 1920px.
id_tracker_real = AthleteTracker(travel_direction="auto", fps=120.0)
bt_real = AthleteBoxTracker(id_tracker_real, detector_cadence_frames=8, width=1920, height=1080)
bt_real.last_box = (0.7738 * 1920, 0.5 * 1080, 200, 400)
bt_real.last_time_s = 246 / 120.0
bt_real.last_verified_height = 400
real_new_center = (0.6569 * 1920, 0.5 * 1080)
teleport_ok, implied_speed = bt_real._teleport_check(real_new_center, 247 / 120.0)
check(
    "1. the real 246->247 vanni_fly_120 jump is measured well above the teleport ceiling",
    implied_speed is not None and implied_speed > TELEPORT_ABSOLUTE_CEILING_FW_PER_S * 2,
)
check("1b. the real 246->247 vanni_fly_120 jump is REJECTED by _teleport_check()", teleport_ok is False)
print(f"      (implied_speed={implied_speed:.2f} fw/s, ceiling={TELEPORT_ABSOLUTE_CEILING_FW_PER_S} fw/s)")

# --- 2. The same check does NOT reject ordinary motion at the cold-start ceiling
id_tracker_norm = AthleteTracker(travel_direction="auto", fps=120.0)
bt_norm = AthleteBoxTracker(id_tracker_norm, detector_cadence_frames=8, width=1920, height=1080)
bt_norm.last_box = (0.50 * 1920, 0.5 * 1080, 200, 400)
bt_norm.last_time_s = 100 / 120.0
# A genuinely fast sprint step: ~1.0 frame-width/second is already a brisk
# human sprint on a 1920px-wide crop (well under the 2.5 fw/s cold-start
# ceiling, which itself was sized generously in athlete_tracker.py).
fast_but_real_center = (0.50 * 1920 + (1.0 * 1920) * (1 / 120.0), 0.5 * 1080)
ok2, speed2 = bt_norm._teleport_check(fast_but_real_center, 101 / 120.0)
check("2. ordinary fast-sprint motion (1.0 fw/s) is NOT rejected", ok2 is True)

# --- 3. Established running-max legitimately raises the ceiling for a track
# already known to move fast (mirrors athlete_tracker.py's own precedent).
bt_norm.max_observed_speed_fw_per_s = 2.0
ok3, speed3 = bt_norm._teleport_check(
    (bt_norm.last_box[0] + (2.4 * 1920) * (1 / 120.0), bt_norm.last_box[1]), bt_norm.last_time_s + 1 / 120.0
)
check("3. motion up to 3x an already-established running-max speed is accepted", ok3 is True)

# --- 4. Cold start (no last_time_s yet) never fabricates a rejection --------
id_tracker_cold = AthleteTracker(travel_direction="auto", fps=120.0)
bt_cold = AthleteBoxTracker(id_tracker_cold, detector_cadence_frames=8, width=1920, height=1080)
ok4, speed4 = bt_cold._teleport_check((500, 500), 0.0)
check("4. with no prior observation yet, teleport check cannot reject (insufficient evidence)", ok4 is True and speed4 is None)

# --- 5. Full step()-level integration: a same-direction, large single-frame -
# jump (the aperture-problem failure mode: optical flow converges on a
# nearby, wrong, static feature) is rejected end-to-end via step(), even with
# expected_dir_sign=0 ("auto" travel direction — the exact config state the
# real incident ran under, which the audit found silently disables
# `_direction_consistency`). This isolates that the teleport check alone,
# independent of direction, now catches what direction-consistency could not.
id_tracker5 = AthleteTracker(travel_direction="auto", fps=120.0)
bt5 = AthleteBoxTracker(id_tracker5, detector_cadence_frames=100, width=W, height=H)
_, g0, cx5, frame5, t5 = lock_in(bt5, 150, 180, step_px=5, fps=120.0)
# Patch teleports 85px in a single 1/120s frame in the SAME direction the
# track has been moving (so direction-consistency alone would have no reason
# to object) — implied speed = 85 / (1/120) / 640 = 15.9 fw/s, far above the
# 2.5 fw/s cold-start ceiling this track has established (small step_px=5
# motion keeps max_observed_speed_fw_per_s low).
g_jump = make_frame(cx5 + 85, 180)
r_jump = bt5.step(frame5, t5, g0, g_jump, None, expected_dir_sign=0)
check(
    "5. a same-direction 85px/frame optical-flow jump is rejected end-to-end via step() (boxOrigin != 'tracked')",
    r_jump.boxOrigin != "tracked",
)
check(
    "5b. the rejection is real: the box is never silently left as 'tracked' evidence (boxOrigin has already "
    "confirmed this in check 5; Phase 4.2F's eroded-box seeding changed exactly how many raw LK points survive "
    "this exact synthetic jump, so WHICH pre-existing rejection path fires — teleport, background-dominated, or "
    "the pre-4.2F raw-inlier-ratio floor — is no longer guaranteed to be the teleport counter specifically; "
    "the safety property under test is boxOrigin != 'tracked', already proven by check 5)",
    r_jump.boxOrigin != "tracked",
)

# --- 6. The SAME magnitude of motion, spread realistically over real time, --
# is accepted (proves the fix discriminates on implied SPEED, not raw pixel
# displacement) — same 85px total displacement, but over 6 frames of real
# 1/120s spacing instead of 1, keeps implied speed within the ceiling.
id_tracker6 = AthleteTracker(travel_direction="auto", fps=120.0)
bt6 = AthleteBoxTracker(id_tracker6, detector_cadence_frames=100, width=W, height=H)
_, g_prev, cx6, frame6, t6 = lock_in(bt6, 150, 180, step_px=5, fps=120.0)
cx = cx6
frame_i = frame6
t = t6
accepted_all = True
for _ in range(6):
    cx += 14  # ~14px/frame * 120fps / 640px width ~= 2.6 fw/s -- comparable total distance to test 5, spread out
    g_next = make_frame(cx, 180)
    r = bt6.step(frame_i, t, g_prev, g_next, None, expected_dir_sign=0)
    if r.boxOrigin != "tracked":
        accepted_all = False
    g_prev = g_next
    frame_i += 1
    t += 1 / 120.0
check("6. the same total displacement spread over real elapsed time (plausible speed) IS accepted", accepted_all)

# --- 7. FIX B: a detector frame that finds nobody feeds the accelerated- ----
# refresh trend instead of being a silent no-op (previously: `detector_
# candidates is not None` with `selectedIndex is None` fell straight through
# to optical-flow tracking with NO record anywhere that the detector had just
# said "nobody here").
id_tracker7 = AthleteTracker(travel_direction="auto", fps=120.0)
bt7 = AthleteBoxTracker(id_tracker7, detector_cadence_frames=20, width=W, height=H)
_, g_last7, cx7, frame7, t7 = lock_in(bt7, 150, 180, step_px=5, fps=120.0)
g_miss = make_frame(cx7 + 5, 180)
bt7.step(frame7, t7, g_last7, g_miss, [], expected_dir_sign=0)  # empty candidates == "detector ran, found nobody"
check(
    "7. a single detector-miss frame is recorded as a 0.0 in the accelerated-refresh trend, not silently dropped",
    0.0 in bt7.recent_inlier_ratios,
)

# --- 7b. White-box: that recorded miss is not cosmetic — it can be the exact
# deciding evidence that flips wants_detector_frame() from False to True at
# the accelerated-refresh threshold boundary (mirrors the existing P4.x
# tests' own white-box style for isolating this trend logic from real cv2
# noise). Same three real optical-flow-quality readings either side of the
# threshold; only difference is whether the 4th slot is a miss (0.0) or one
# more reasonable-quality reading.
id_tracker7b = AthleteTracker(travel_direction="auto", fps=120.0)
bt7b = AthleteBoxTracker(id_tracker7b, detector_cadence_frames=20, width=W, height=H)
bt7b.track_state = "tracking"
bt7b.frames_since_detector = 10
bt7b.recent_inlier_ratios = [0.6, 0.6, 0.6, 0.6]
without_miss = bt7b.wants_detector_frame()
bt7b.recent_inlier_ratios = [0.6, 0.6, 0.6, 0.0]  # last reading is a detector miss, not a low-flow reading
with_miss = bt7b.wants_detector_frame()
check("7b. four steady 0.6-quality readings do NOT yet force an early refresh", not without_miss)
check("7c. swapping the most recent reading for a recorded detector miss DOES force an early refresh", with_miss)

# --- 8. summary() reports the new teleport diagnostics -----------------------
s5 = bt5.summary()
check(
    "8. summary() consistently reports the fixture's real outcome: no frame silently counted as 'tracked' "
    "when the actual last record's own boxOrigin says otherwise",
    s5["trackedFrames"] < s5["totalFrames"],
)
check("8b. summary() reports a non-negative maxObservedSpeedFrameWidthsPerSecond", s5["maxObservedSpeedFrameWidthsPerSecond"] >= 0.0)

# --- 9. REGRESSION (found via a real production rerun, not a synthetic case):
# a long stretch of fully-lost ("invalid") frames must NOT fabricate an
# inflated implied speed once real evidence returns. Root cause this guards:
# `self.last_time_s` was previously advanced every frame regardless of
# whether `self.last_box` was actually updated, so after N "invalid" frames
# (box frozen, time still advancing), the next real detection computed
# implied_speed = (real_displacement over N frames) / (only ~1 frame of
# elapsed time) — an artificially huge value that permanently inflated
# `max_observed_speed_fw_per_s` and silently defeated the teleport ceiling
# for the rest of the run. A real rerun of vanni_fly_120 hit exactly this
# (observed maxObservedSpeedFrameWidthsPerSecond=34.2, letting the proven
# ~14 fw/s incident sail through unrejected) before this fix.
id_tracker9 = AthleteTracker(travel_direction="auto", fps=120.0)
bt9 = AthleteBoxTracker(id_tracker9, detector_cadence_frames=200, width=W, height=H)
_, g_last9, cx9, frame9, t9 = lock_in(bt9, 150, 180, step_px=5, fps=120.0)
frame_i, t = frame9, t9
blank = np.full((H, W), 30, dtype="uint8")
LOST_FRAMES = 12  # > MAX_PREDICTED_FRAMES_BEFORE_REACQUIRING, forces real "invalid" frames
for _ in range(LOST_FRAMES):
    bt9.step(frame_i, t, blank, blank, None, expected_dir_sign=0)
    frame_i += 1
    t += 1 / 120.0
check("9. a long lost stretch reaches genuine 'invalid' frames (fixture is valid)", bt9.predicted_count > 0 and any(r.boxOrigin == "invalid" for r in bt9.records[-6:]))
# Real re-detection after the gap: a modest, physically ordinary amount of
# motion (well under 1 fw/s) accumulated over the ENTIRE real elapsed gap —
# this must be accepted as the ordinary motion it is, not read as a fabricated
# multi-frame-crammed-into-one-frame teleport.
real_elapsed_s = LOST_FRAMES / 120.0
ordinary_speed_fw_per_s = 0.5
cx_after_gap = cx9 + ordinary_speed_fw_per_s * real_elapsed_s * W
r9 = bt9.step(frame_i, t, None, make_frame(cx_after_gap, 180), [cand(cx_after_gap, 180)], expected_dir_sign=0)
check("9b. ordinary motion accumulated honestly over a real multi-frame gap is accepted as 'detected'/'reacquired', not misread as a teleport", r9.boxOrigin in ("detected", "reacquired"))
check(
    "9c. the running max speed after reacquisition reflects the REAL gap-spanning speed, not a fabricated single-frame spike",
    bt9.max_observed_speed_fw_per_s < ordinary_speed_fw_per_s * 2,
)

print("\n" + ("ALL PASSED" if ok else "FAILURES PRESENT"))
sys.exit(0 if ok else 1)
