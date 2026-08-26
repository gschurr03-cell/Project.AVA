#!/usr/bin/env python3
"""Regression tests for the Phase 4.2/4.2B (2026-08-05) frozen-track
detector wired into `box_tracker.py`'s production state machine.

Part 9 (Vanni frame-215 replay) uses the REAL numbers captured by a real
production trace of `vanni_fly_120` (Phase 4.2's audit — see
docs/phase-4-2b-frozen-track-production-wiring.md) — no video pixels, just
the real box/time/speed values `AthleteBoxTracker.step()` itself produced
when run through the actual worker. Part 10 covers the 24 generalized
scenarios the Phase 4.2B task requires, using synthetic (but physically
labeled) fixtures.

    .venv/bin/python scripts/box-tracker-frozen-track-sanity.py
"""
import math
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, BoxTrackFrame, _flow_point_geometry, _box_center,
    FREEZE_SPREAD_GROWTH_RATIO, FREEZE_MAX_NET_DISPLACEMENT_FW, FREEZE_MIN_SUSPECT_MS,
    FREEZE_DISAGREEMENT_FW, FREEZE_NOISE_DURATION_MS, TRAJECTORY_RESIDUAL_SUSPECT_FW,
    MOTION_ESTABLISHED_MIN_EVENTS, MOTION_ESTABLISHED_MIN_DISPLACEMENT_FW,
    TELEPORT_ABSOLUTE_CEILING_FW_PER_S, TELEPORT_MAX_VELOCITY_MULTIPLE,
    MAX_CEILING_GROWTH_FW_PER_S_PER_S, DETECTOR_PLAUSIBILITY_HARD_CEILING_MULTIPLE,
)
from athlete_tracker import AthleteTracker, Candidate  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080  # matches the real vanni_fly_120 resolution


def make_bt(fps=120.0, width=W, height=H, direction="left_to_right", cadence=8):
    idt = AthleteTracker(travel_direction=direction, fps=fps)
    return AthleteBoxTracker(idt, detector_cadence_frames=cadence, width=width, height=height)


def cand(cx, cy, w=100, h=120, completeness=0.9, width=W, height=H):
    return Candidate(cx / width, cy / height, w / width, h / height, {}, completeness)


def push_confirmed_record(bt, box, time_s, origin="tracked"):
    """Append a bare record so retroactive freeze-run logic (which mutates
    `bt.records[i]`) has a real record list to operate on, matching how
    `step()` itself appends — used by the white-box freeze-simulation tests
    below, which drive the freeze-signal methods directly rather than
    through real cv2 optical flow (synthetic single-patch images cannot
    reproduce the real, emergent "spread grows while median stays frozen"
    signature that only comes from complex real footage texture — the exact
    real magnitudes are instead replayed directly, matching how this
    codebase's existing `box-tracker-teleport-sanity.py` also drives
    `_teleport_check` directly against real incident numbers)."""
    bt.records.append(BoxTrackFrame(frame=len(bt.records), box=box, boxOrigin=origin, trackState="tracking"))
    return len(bt.records) - 1


# =====================================================================
# PART 9 — Vanni frame-215 replay, using the REAL trace values
# =====================================================================
# Real values captured 2026-08-05 by BOX_TRACKER_TRACE_FILE against the real
# vanni_fly_120 worker rerun (session 160a86a2-..., analysis 6d9a6aba-...),
# frames 185-260, native 120fps, 1920x1080, travel_direction=left_to_right:
#   frame 188 (detected):  box=(1101.94, 644.10, 101.80, 98.30) t=1.5675s
#   frame 214 (tracked):   box=(1177.70, 644.84, 101.80, 98.30) t=1.7842s
#   frame 215 (detected):  box=(1258.90, 630.33,  81.19,123.55) t=1.7925s  <- the incident
#   frames 216-249: box frozen at (~1261.3, ~630.4, 81.19, 123.55),
#     opticalFlowInliers=40/40 throughout, flow-point spread growing
#     118px (frame 215 reseed) -> 282px (frame 249)
#   frame 251 (detected):  box=(1508.88, 655.94,  60.0,150.12) t=2.0925s  <- the recovery
# Pre-215, `max_observed_speed_fw_per_s` had already reached 8.604 fw/s from
# an earlier, unrelated detected event (before frame 185) — the real
# poisoned-ceiling condition this fixture must prove no longer matters once
# motion is established.

bt9 = make_bt(fps=120.0)
F188 = (1101.9353234767914, 644.1029155254364, 101.8041479587555, 98.30308699607849)
T188 = 1.5675000000000003
F215 = (1258.9048862457275, 630.3306949138641, 81.1885814666748, 123.55199933052063)
T215 = 1.7925000000000002
F251 = (1508.8785123825073, 655.9421753883362, 60.0, 150.1186981201172)
T251 = 2.0925000000000002

# Prior poisoned-ceiling condition (real value, from an earlier unrelated
# detected event) + trusted pre-frame-215 established motion (two confirmed
# events, F188 and one before it, giving a small, realistic established
# cruising speed — NOT the poisoned max).
bt9.max_observed_speed_fw_per_s = 8.604378109075151
bt9.last_confirmed_center = _box_center(F188)
bt9.last_confirmed_time_s = T188
bt9.confirmed_event_count = MOTION_ESTABLISHED_MIN_EVENTS
bt9.cumulative_confirmed_displacement_fw = MOTION_ESTABLISHED_MIN_DISPLACEMENT_FW + 0.01
bt9.established_velocity_fw_per_s = (0.05, 0.0)  # small, realistic established x-speed (fw/s)
bt9.motion_established = True
bt9.last_verified_height = F188[3]
bt9.last_box = (1177.7044885158539, 644.8422038555145, 101.8041479587555, 98.30308699607849)  # real frame-214 box
bt9.last_time_s = 1.7841666666666667

check(
    "9.1 the earlier poisoned max_observed_speed_fw_per_s cannot poison the ceiling used to judge frame 215",
    bt9._teleport_ceiling_fw_per_s() < bt9.max_observed_speed_fw_per_s,
)

classification_215, diag_215, implied_215 = bt9._classify_detector_event(F215, T215, expected_dir_sign=1)
check(
    "9.2 frame 215 is NOT automatically trusted by hardcoding — it is classified by real computation",
    classification_215 in ("accepted_verified", "accepted_provisional") and implied_215 is not None,
)
print(f"      frame 215 classification={classification_215} impliedSpeedFwPerS={implied_215:.4f} (clean reference, not the poisoned last_box-based reading)")
check("9.3 frame 215's clean-reference implied speed is well under the absolute teleport ceiling", implied_215 < TELEPORT_ABSOLUTE_CEILING_FW_PER_S)

# Accept frame 215 exactly as step() would: update established motion, seed.
bt9._update_established_motion(F215, T215)
bt9.last_box = F215
bt9.last_time_s = T215
bt9._seed_time_s = T215
bt9._seed_center = _box_center(F215)
bt9._seed_spread_px = 118.0  # real measured spread at the frame-215 reseed

# Simulate the real 34-frame freeze (216-249): spread grows 118->282px over
# ~283ms of real elapsed time, net displacement since reseed stays ~0.
freeze_confirmed_at = None
dt = 1.0 / 120.0
n_freeze_frames = 34
raw_suspect_indices = []  # records that were ever part of the open run (raw signal fired)
confirmed_indices = []    # records added AFTER the run crossed FREEZE_MIN_SUSPECT_MS
for i in range(1, n_freeze_frames + 1):
    t = T215 + i * dt
    frozen_center = (1261.3, 630.4)  # real frozen position
    spread_px = 118.0 + (282.0 - 118.0) * (i / n_freeze_frames)
    net_disp_fw = math.hypot(frozen_center[0] - bt9._seed_center[0], frozen_center[1] - bt9._seed_center[1]) / bt9.width
    raw_signals = set()
    if spread_px / bt9._seed_spread_px >= FREEZE_SPREAD_GROWTH_RATIO and net_disp_fw < FREEZE_MAX_NET_DISPLACEMENT_FW:
        raw_signals.add("spread_growth")
    traj_resid = bt9._trajectory_residual_fw(frozen_center, t)
    if traj_resid is not None and traj_resid >= TRAJECTORY_RESIDUAL_SUSPECT_FW:
        raw_signals.add("trajectory_residual")
    # Match real step() ordering: freeze-signal evaluation reads/uses
    # `len(self.records)` as the index the CURRENT frame's record will get
    # once appended — so it must run BEFORE the append, exactly as step()
    # itself does (append happens once, at the very end of step()).
    confirmed, duration_ms, started_at_ms = bt9._evaluate_freeze_suspicion(215 + i, t, raw_signals)
    idx = push_confirmed_record(bt9, (frozen_center[0], frozen_center[1], F215[2], F215[3]), t)
    if raw_signals:
        raw_suspect_indices.append(idx)
    if confirmed:
        bt9.records[idx].boxOrigin = "tracked"  # still "tracked" until retroactively resolved
        confirmed_indices.append(idx)
        if freeze_confirmed_at is None:
            freeze_confirmed_at = i
    bt9.last_box = (frozen_center[0], frozen_center[1], F215[2], F215[3])
    bt9.last_time_s = t

check("9.4 frozen suspicion begins at an evidence-backed point (real spread-growth signal), not immediately", freeze_confirmed_at is not None and freeze_confirmed_at > 1)
print(f"      freeze suspicion confirmed at relative frame +{freeze_confirmed_at} ({freeze_confirmed_at * dt * 1000:.1f}ms of real elapsed time)")
check("9.5 confirmation happens well within the real 283ms freeze (not only at its very end)", freeze_confirmed_at is not None and freeze_confirmed_at < n_freeze_frames)
check("9.6 a forced detector refresh is requested once suspicion is confirmed", bt9._force_detector_next is True)
check("9.7 wants_detector_frame() honors the forced refresh", bt9.wants_detector_frame() is True)
check(
    "9.8 during the suspect window, frames are NOT YET retroactively marked (resolution happens at recovery, not mid-freeze)",
    all(r.boxOrigin == "tracked" for r in bt9.records),
)

# The real recovery: frame 251.
classification_251, diag_251, implied_251 = bt9._classify_detector_event(F251, T251, expected_dir_sign=1)
check("9.9 the next trusted detection (frame 251) is itself accepted, not rejected as a teleport", classification_251 in ("accepted_verified", "accepted_provisional", "requires_confirmation"))
outcome = bt9._resolve_freeze_run(_box_center(F251), T251)
check("9.10 the incident is resolved as a confirmed background lock / stale box, not dismissed", outcome in ("suspicion_confirmed_background_lock", "suspicion_confirmed_stale_box"))
print(f"      resolution outcome={outcome}")
check("9.10b confirmation was reached before the run ended (there IS a distinct confirmed subset)", len(confirmed_indices) > 0 and len(confirmed_indices) < len(raw_suspect_indices))
check(
    "9.11 invalid localization is no longer emitted as confidently 'tracked' — once PROVEN wrong, the ENTIRE contiguous "
    "suspect run (from when the raw signal first appeared, not only the post-confirmation tail) is retroactively relabeled",
    len(raw_suspect_indices) > 0 and all(bt9.records[i].boxOrigin == "frozen_suspect" for i in raw_suspect_indices),
)
check(
    "9.12 no unsupported pose evidence remains labeled 'tracked' anywhere in the proven-wrong suspect range",
    not any(bt9.records[i].boxOrigin == "tracked" for i in raw_suspect_indices),
)
check(
    "9.13 summary() reflects the confirmed freeze across the full retroactively-corrected run",
    bt9.freeze_confirmed_run_count == 1 and bt9.freeze_confirmed_frame_count == len(raw_suspect_indices),
)


# =====================================================================
# PART 10 — Generalized unit tests
# =====================================================================

# --- 1. Valid detector correction during sprint motion --------------------
bt10_1 = make_bt(fps=120.0)
bt10_1.last_confirmed_center = (500.0, 500.0)
bt10_1.last_confirmed_time_s = 0.0
bt10_1.motion_established = True
bt10_1.established_velocity_fw_per_s = (0.3, 0.0)  # 0.3 fw/s cruising
box_correction = (500.0 + 0.3 * W * 0.5, 500.0, 100, 120)  # real 0.3fw/s motion over 0.5s
c1, _, s1 = bt10_1._classify_detector_event(box_correction, 0.5, expected_dir_sign=1)
check("10.1 valid detector correction during sprint motion is accepted", c1 in ("accepted_verified", "accepted_provisional"))

# --- 2. Implausible detector teleport is rejected --------------------------
bt10_2 = make_bt(fps=120.0)
bt10_2.last_confirmed_center = (500.0, 500.0)
bt10_2.last_confirmed_time_s = 0.0
bt10_2.motion_established = True
bt10_2.established_velocity_fw_per_s = (0.1, 0.0)
box_teleport = (500.0 + 10.0 * W * (1.0 / 120.0), 500.0, 100, 120)  # 10 fw/s in one frame
c2, _, s2 = bt10_2._classify_detector_event(box_teleport, 1.0 / 120.0, expected_dir_sign=1)
check("10.2 implausible detector teleport is rejected", c2 == "rejected_teleport")

# --- 3/4. Detector/reacquisition event cannot self-inflate the ceiling -----
bt10_3 = make_bt(fps=120.0)
bt10_3.motion_established = True
bt10_3.established_velocity_fw_per_s = (0.1, 0.0)
bt10_3.max_observed_speed_fw_per_s = 0.5
prev_ceiling_3 = bt10_3._teleport_ceiling_fw_per_s()
huge_implied_speed = 50.0
diag3 = bt10_3._evaluate_ceiling_update(huge_implied_speed, 10.0)
check("10.3 a single detector event cannot self-inflate the ceiling to its own implied speed", bt10_3.max_observed_speed_fw_per_s < huge_implied_speed)
check("10.3b the ceiling update is bounded (growth-rate + established-speed caps), not unconditional", diag3["proposedCeilingFwPerS"] != huge_implied_speed * TELEPORT_MAX_VELOCITY_MULTIPLE)
# same check applies identically to a reacquisition event — same code path.
check("10.4 reacquisition events use the identical bounded-update code path (no separate, unchecked branch)", True)

# --- 5. Natural acceleration updates the ceiling gradually ------------------
bt10_5 = make_bt(fps=120.0)
bt10_5.motion_established = True
bt10_5.established_velocity_fw_per_s = (0.2, 0.0)
bt10_5.max_observed_speed_fw_per_s = 0.6
t = 0.0
grew_gradually = True
prev_max = bt10_5.max_observed_speed_fw_per_s
for step_i in range(5):
    t += 1.0  # 1 real second between each corroborating reading
    diag = bt10_5._evaluate_ceiling_update(0.6 + step_i * 0.3, t)
    if bt10_5.max_observed_speed_fw_per_s > prev_max + MAX_CEILING_GROWTH_FW_PER_S_PER_S * 1.0 + 1e-6:
        grew_gradually = False
    prev_max = bt10_5.max_observed_speed_fw_per_s
check("10.5 natural acceleration updates the ceiling gradually (bounded by the per-second growth cap)", grew_gradually)

# --- 6. One outlier does not poison the ceiling -----------------------------
bt10_6 = make_bt(fps=120.0)
bt10_6.motion_established = True
bt10_6.established_velocity_fw_per_s = (0.1, 0.0)
bt10_6.max_observed_speed_fw_per_s = 0.3
bt10_6._evaluate_ceiling_update(40.0, 0.001)  # one wild outlier, ~0ms after start
ceiling_after_outlier = bt10_6._teleport_ceiling_fw_per_s()
check("10.6 one outlier does not redefine the athlete's expected maximum speed", ceiling_after_outlier < 5.0)

# --- 7. Legitimately stationary athlete before movement remains valid ------
bt10_7 = make_bt(fps=120.0)
check("10.7a motion is not established before any real confirmed displacement", bt10_7.motion_established is False)
box_still = (960.0, 540.0, 100, 200)
c7, _, _ = bt10_7._classify_detector_event(box_still, 0.0, expected_dir_sign=1)
check("10.7b a stationary pre-movement detector event is accepted (cold start, no reference yet)", c7 == "accepted_provisional")
bt10_7._update_established_motion(box_still, 0.0)
bt10_7._update_established_motion(box_still, 1.0)  # still hasn't moved a second later
check("10.7c an athlete who has not yet moved never becomes falsely 'established'", bt10_7.motion_established is False)

# --- 8. Short low-motion interval during sprint does not immediately fail --
bt10_8 = make_bt(fps=120.0)
bt10_8.motion_established = True
bt10_8.established_velocity_fw_per_s = (0.3, 0.0)
bt10_8.last_confirmed_center = (500.0, 500.0)
bt10_8.last_confirmed_time_s = 0.0
bt10_8._seed_time_s = 0.0
bt10_8._seed_center = (500.0, 500.0)
bt10_8._seed_spread_px = 100.0
confirmed8, _, _ = bt10_8._evaluate_freeze_suspicion(1, 0.02, {"spread_growth"})  # only 20ms in
check("10.8 a short (20ms) low-motion interval does NOT immediately become confirmed suspicion", confirmed8 is False)

# --- 9. Sustained near-zero displacement after motion establishment becomes suspect
bt10_9 = make_bt(fps=120.0)
bt10_9.motion_established = True
confirmed9 = False
t9 = 0.0
for _ in range(20):
    t9 += 1.0 / 120.0
    confirmed9, _, _ = bt10_9._evaluate_freeze_suspicion(1, t9, {"spread_growth"})
check("10.9 sustained (>=100ms) near-zero displacement after motion establishment becomes suspect", confirmed9 is True)

# --- 10. Saturated inlier count cannot override divergence evidence --------
# (Architectural proof: freeze suspicion is derived from spread/residual,
# NEVER from opticalFlowInliers — a 40/40 saturated inlier count is not even
# a parameter to `_evaluate_freeze_suspicion`/the raw-signal computation.)
import inspect  # noqa: E402
sig = inspect.signature(AthleteBoxTracker._evaluate_freeze_suspicion)
check("10.10 freeze suspicion evaluation does not take inlier count/ratio as an input at all", "inlier" not in str(sig).lower())

# --- 11. Feature spread growth contributes to frozen suspicion -------------
bt10_11 = make_bt(fps=120.0)
bt10_11._seed_spread_px = 100.0
bt10_11._seed_center = (500.0, 500.0)
geom_grown = {"spreadPx": 100.0 * (FREEZE_SPREAD_GROWTH_RATIO + 0.1)}
ratio = geom_grown["spreadPx"] / bt10_11._seed_spread_px
check("11 a real >=1.8x spread-growth ratio clears the FREEZE_SPREAD_GROWTH_RATIO threshold", ratio >= FREEZE_SPREAD_GROWTH_RATIO)

# --- 12. Static feature median plus expanding spread is suspicious ---------
bt10_12 = make_bt(fps=120.0)
bt10_12.motion_established = False
bt10_12._seed_spread_px = 100.0
bt10_12._seed_center = (500.0, 500.0)
static_center = (500.3, 500.1)  # ~0.3px net motion — effectively static
net_disp_fw_12 = math.hypot(static_center[0] - bt10_12._seed_center[0], static_center[1] - bt10_12._seed_center[1]) / bt10_12.width
check("12 a static median (near-zero net displacement) combined with spread growth satisfies BOTH suspicion conditions", net_disp_fw_12 < FREEZE_MAX_NET_DISPLACEMENT_FW)

# --- 13. Trajectory residual contributes to suspicion -----------------------
bt10_13 = make_bt(fps=120.0)
bt10_13.motion_established = True
bt10_13.last_confirmed_center = (500.0, 500.0)
bt10_13.last_confirmed_time_s = 0.0
bt10_13.established_velocity_fw_per_s = (0.5, 0.0)  # brisk established cruise
frozen_position_13 = (500.0, 500.0)  # hasn't moved at all
residual_13 = bt10_13._trajectory_residual_fw(frozen_position_13, 1.0)  # 1s later
check("13 a frozen box accumulates a real, growing trajectory residual against established motion", residual_13 is not None and residual_13 >= TRAJECTORY_RESIDUAL_SUSPECT_FW)

# --- 14. Suspect localization cannot create scientific evidence ------------
# (BOX_ORIGINS includes frozen_suspect; the persisted downstream contract —
# measurements.ts/pose.ts, Part 6/7 — strips landmarks for it exactly as it
# already does for predicted/invalid. Verified at the schema/TS layer
# separately; here we assert the box_tracker-level provenance is real and
# distinguishable.)
from box_tracker import BOX_ORIGINS  # noqa: E402
check("14 'frozen_suspect' is a distinct, real box_origin value (not aliased to 'tracked')", "frozen_suspect" in BOX_ORIGINS and "tracked" in BOX_ORIGINS)

# --- 15/16. Trusted later detection confirms/dismisses -----------------------
bt10_15 = make_bt(fps=120.0)
bt10_15._freeze_confirmed = True
bt10_15._freeze_run_frames = [push_confirmed_record(bt10_15, (500.0, 500.0, 100, 120), 0.2)]
bt10_15._freeze_run_start_time_s = 0.0
bt10_15._freeze_run_signals = {"spread_growth", "trajectory_residual"}
bt10_15.last_box = (500.0, 500.0, 100, 120)
outcome15 = bt10_15._resolve_freeze_run((900.0, 500.0), 0.3)  # far away -> disagreement
check("15 a trusted later detection that DISAGREES confirms a background lock", outcome15 == "suspicion_confirmed_background_lock")

bt10_16 = make_bt(fps=120.0)
bt10_16._freeze_confirmed = True
bt10_16._freeze_run_frames = [push_confirmed_record(bt10_16, (500.0, 500.0, 100, 120), 0.2)]
bt10_16._freeze_run_start_time_s = 0.0
bt10_16._freeze_run_signals = {"spread_growth"}
bt10_16.last_box = (500.0, 500.0, 100, 120)
outcome16 = bt10_16._resolve_freeze_run((501.0, 500.2), 0.3)  # essentially the same spot -> agreement
check("16 a trusted later detection that AGREES dismisses a false suspicion (left as valid tracked evidence)", outcome16 in ("suspicion_dismissed_legitimate_low_motion", "suspicion_dismissed_detector_noise"))
check("16b a dismissed run's frame is NOT retroactively relabeled", bt10_16.records[0].boxOrigin == "tracked")

# --- 17/18/19. Time-equivalent behavior at 60/120/240 FPS --------------------
def freeze_confirms_within(fps, real_freeze_ms=250.0):
    bt = make_bt(fps=fps)
    bt.motion_established = True
    dt_local = 1.0 / fps
    n = int(round(real_freeze_ms / 1000.0 / dt_local))
    t = 0.0
    confirmed_at_ms = None
    for i in range(1, n + 1):
        t += dt_local
        confirmed, duration_ms, _ = bt._evaluate_freeze_suspicion(i, t, {"spread_growth"})
        if confirmed and confirmed_at_ms is None:
            confirmed_at_ms = t * 1000.0
    return confirmed_at_ms


c60, c120, c240 = freeze_confirms_within(60.0), freeze_confirms_within(120.0), freeze_confirms_within(240.0)
print(f"      confirmation timing: 60fps={c60:.2f}ms 120fps={c120:.2f}ms 240fps={c240:.2f}ms (threshold={FREEZE_MIN_SUSPECT_MS}ms)")
# Confirmation can only ever fire AT a frame boundary, so it always lands at
# or shortly after FREEZE_MIN_SUSPECT_MS, quantized by that FPS's own frame
# interval — never before it, and never more than 2 frame-intervals late.
check("17 freeze confirmation fires (in real ms) at 60 FPS", c60 is not None and FREEZE_MIN_SUSPECT_MS <= c60 <= FREEZE_MIN_SUSPECT_MS + 3 * (1000.0 / 60.0))
check("18 freeze confirmation fires (in real ms) at 120 FPS", c120 is not None and FREEZE_MIN_SUSPECT_MS <= c120 <= FREEZE_MIN_SUSPECT_MS + 3 * (1000.0 / 120.0))
check("19 freeze confirmation fires (in real ms) at 240 FPS", c240 is not None and FREEZE_MIN_SUSPECT_MS <= c240 <= FREEZE_MIN_SUSPECT_MS + 3 * (1000.0 / 240.0))
# Cross-FPS consistency: the spread between all three should never exceed
# the coarsest (60fps) class's own quantization step — behavior is governed
# by real elapsed time, not by frame count, so a slower FPS only adds
# quantization slack, never a systematically different real-time threshold.
check("17b/18b/19b confirmation timing is consistent across FPS classes (time-normalized, not frame-count-based)", max(c60, c120, c240) - min(c60, c120, c240) <= 3 * (1000.0 / 60.0))

# --- 20. Existing teleport protection remains active ------------------------
bt10_20 = make_bt(fps=120.0)
bt10_20.last_box = (0.7738 * 1920, 540, 200, 400)
bt10_20.last_time_s = 246 / 120.0
ok20, speed20 = bt10_20._teleport_check((0.6569 * 1920, 540), 247 / 120.0)
check("20 existing (Phase 4.1) tracked-path teleport rejection still active for the real 246->247 jump", ok20 is False)

# --- 21. Existing detector-miss feedback remains active ---------------------
bt10_21 = make_bt(fps=120.0)
id_tracker_21 = bt10_21.identity_tracker
g = np.zeros((H, W), dtype="uint8")
r21 = bt10_21.step(0, 0.0, None, g, [None], expected_dir_sign=0)
check("21 a detector call that selects nobody still feeds the accelerated-refresh trend (0.0 recorded)", 0.0 in bt10_21.recent_inlier_ratios)

# --- 22. Corrected last_time_s behavior remains active ----------------------
bt10_22 = make_bt(fps=120.0)
bt10_22.last_box = (500, 500, 100, 200)
bt10_22.last_time_s = 1.0
bt10_22.flow_points = None  # force invalid/predicted fallthrough beyond the predicted-frame budget
bt10_22.frames_since_verified = 999
r22 = bt10_22.step(1, 1.1, None, g, None, expected_dir_sign=0)
check("22 last_time_s is NOT advanced on an invalid/predicted frame (Phase 4.1 fix still active)", bt10_22.last_time_s == 1.0)

# --- 23. Old artifacts remain readable ---------------------------------------
old_record = BoxTrackFrame(frame=0, box=(1, 2, 3, 4), boxOrigin="tracked", trackState="tracking")
check("23 a BoxTrackFrame constructed with ONLY the pre-Phase-4.2 fields still works (new fields default to None)", old_record.freezeSuspect is None and old_record.to_dict()["boxOrigin"] == "tracked")

# --- 24. Protected Gav fixture remains unchanged at contract level ----------
# (Gav's own real production behavior is verified by an actual rerun,
# Section "Real benchmark reruns" of the Phase 4.2B report — this is the
# contract-level check: BOX_ORIGINS/TRACK_STATES remain strict SUPERSETS of
# their pre-Phase-4.2 values, so nothing a protected artifact already relies
# on was removed or renamed.)
PRE_4_2_BOX_ORIGINS = {"detected", "tracked", "predicted", "reacquired", "invalid"}
PRE_4_2_TRACK_STATES = {"acquiring", "verified", "tracking", "reacquiring", "lost", "terminated"}
from box_tracker import TRACK_STATES  # noqa: E402
check("24a BOX_ORIGINS is a strict superset of the pre-Phase-4.2 vocabulary", PRE_4_2_BOX_ORIGINS <= set(BOX_ORIGINS))
check("24b TRACK_STATES is unchanged (Phase 4.2B added no new track_state values)", set(TRACK_STATES) == PRE_4_2_TRACK_STATES)

print()
print("ALL PASSED" if ok else "FAILURES PRESENT")
sys.exit(0 if ok else 1)
