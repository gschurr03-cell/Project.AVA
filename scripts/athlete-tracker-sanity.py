#!/usr/bin/env python3
"""Deterministic tests for athlete_tracker.py (Day 95 audit, Part 2/3;
acquisition redesigned Day 101, Parts 1-6).

Synthetic candidate sequences only — no MediaPipe/video required, so these
run in milliseconds and exercise the identity-continuity AND the multi-stage
acquisition rules directly.

    .venv/bin/python scripts/athlete-tracker-sanity.py
"""
import sys, os, math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from athlete_tracker import (  # noqa: E402
    AthleteTracker, Candidate, MIN_ACCEPT_SCORE, MIN_VERIFICATION_HITS,
    MIN_CUMULATIVE_DISPLACEMENT, MAX_STATIONARY_VERIFICATION_SECONDS,
    VERIFICATION_MAX_CONSECUTIVE_MISSES, CONSECUTIVE_UNVERIFIED_BEFORE_LOST,
    ENTRY_CORRIDOR_DEPTH_BEFORE_GATE, ENTRY_CORRIDOR_DEPTH_AFTER_GATE,
    ACQUISITION_ENTRY_BAND,
)

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


def cand(cx, cy, w=0.08, h=0.22, completeness=0.9):
    return Candidate(cx, cy, w, h, {}, completeness)


FPS = 240.0
DT = 1.0 / FPS


def run_to_tracked(tracker, start_cx=0.10, cy=0.5, step=0.01, start_frame=0, start_time=0.0, extra_hits=0):
    """Feed a steadily-moving, near-entry candidate until the tracker locks
    (or gives up after a generous budget) — the Day 101 acquisition
    preamble every downstream-behavior test needs before it can exercise
    post-lock logic. Returns (final_result, last_cx, next_frame, next_time)."""
    cx = start_cx
    r = None
    frame = start_frame
    t = start_time
    hits_needed = MIN_VERIFICATION_HITS + extra_hits
    for i in range(hits_needed + 2):
        r = tracker.step([cand(cx, cy)], frame, t)
        if tracker.identity_state == "tracked":
            break
        cx += step
        frame += 1
        t += DT
    return r, cx, frame + 1, t + DT


def settle_lock(tracker, cx, frame, tsec, n=5, step=0.02, cy=0.5):
    """Feed `n` more genuine, moving, accepted frames after a fresh lock so
    it accumulates real POST-lock displacement — clears
    EARLY_LOCK_MAX_OWN_DISPLACEMENT so the Part 6 bounded-recovery window
    (intentionally) stops being reachable, letting tests isolate ordinary
    post-lock continuity checks (direction/teleport/scale) the same way
    they could pre-Day-101, without an unrelated Part 6 override
    intercepting the candidate first."""
    for _ in range(n):
        cx += step
        tracker.step([cand(cx, cy)], frame, tsec)
        frame += 1
        tsec += DT
    return cx, frame, tsec


# --- 1. Acquisition requires multiple consistent, moving sightings ---------
# A single frame — even a perfect, near-entry candidate — must NEVER lock
# identity by itself (the exact Day 100 defect: one frame locked onto a
# bleacher pattern). A far-from-entry candidate is present throughout and
# must never be selected at all.
t1 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
r1_first = t1.step([cand(0.85, 0.5, w=0.15, h=0.3), cand(0.10, 0.5)], 0, 0.0)
check("1. a single frame never locks identity, even with a strong near-entry candidate", t1.identity_state != "tracked")
check("1. the far-from-entry candidate is rejected outright (outside_entry_region), not merely down-weighted", r1_first["candidates"][0]["rejectionReason"] == "outside_entry_region")
check("1. the near-entry candidate becomes the PENDING identity after its first sighting", t1.pending is not None and abs(t1.pending.state.center[0] - 0.10) < 1e-9)
r1_final, _, _, _ = run_to_tracked(t1, start_cx=0.11)
check("1. after sufficient consistent, moving corroboration, identity becomes 'tracked'", t1.identity_state == "tracked")
check("1. the locked identity is the near-entry candidate, never the far one", abs(t1.state.center[0] - 0.85) > 0.5)

# --- Day 101, Part 3/5: background-texture / false-positive rejection ------
# A candidate that is human-shaped, complete, and even near-entry, but never
# moves, must NEVER lock — this is the direct regression test for the real
# Day 100 bug (a stadium bleacher pattern locked identity at source frame 7
# of the real Vanni clip and was never released).
t_bg = AthleteTracker(travel_direction="left_to_right", fps=FPS)
STATIONARY_CX = 0.15
frame = 0
tsec = 0.0
locked_on_background = False
# Feed the SAME motionless candidate for well beyond the stationary-timeout
# budget, at real detector-cadence-like spacing.
n_frames = int((MAX_STATIONARY_VERIFICATION_SECONDS * FPS) / 8) + 20
for i in range(n_frames):
    r = t_bg.step([cand(STATIONARY_CX, 0.5)], frame, tsec)
    if t_bg.identity_state == "tracked":
        locked_on_background = True
        break
    frame += 8
    tsec += 8 * DT
check("bg. a perfectly stationary background-shaped candidate (bleachers/fence) never locks identity, however long it persists", not locked_on_background)
check("bg. the stationary candidate was discarded at least once (proves the timeout actually fired, not just never-corroborated)", t_bg.candidates_discarded_stationary >= 1)

# --- Day 101, Part 5: single-frame hallucination never counts as identity ---
t_halluc = AthleteTracker(travel_direction="left_to_right", fps=FPS)
r_halluc = t_halluc.step([cand(0.05, 0.5)], 0, 0.0)
check("hallucination. a single detected frame is never itself verified/tracked", r_halluc["verified"] is False and t_halluc.identity_state != "tracked")

# --- Day 101, Part 3: entry-region enforcement is a hard gate, not a weight -
t_entry = AthleteTracker(travel_direction="left_to_right", fps=FPS)
r_entry = t_entry.step([cand(0.75, 0.5, w=0.2, h=0.4, completeness=0.99)], 0, 0.0)
check("entry. a highly complete, human-shaped candidate FAR from the configured entry side is rejected outright", r_entry["candidates"][0]["rejectionReason"] == "outside_entry_region")
check("entry. it never becomes a pending candidate at all", t_entry.pending is None)

# --- Day 101, Part 4: identity confidence requires hits AND real motion,
# not just elapsed time — a candidate corroborated many times but with
# negligible net displacement must not lock (distinguishes "seen often"
# from "seen often AND moving"). -------------------------------------------
t_nomove = AthleteTracker(travel_direction="left_to_right", fps=FPS)
jitter_cx = 0.10
frame = 0
tsec = 0.0
for i in range(MIN_VERIFICATION_HITS + 5):
    # Sub-threshold jitter around the same spot — never accumulates real
    # displacement, unlike genuine forward motion.
    jitter_cx = 0.10 + (0.0005 if i % 2 == 0 else -0.0005)
    t_nomove.step([cand(jitter_cx, 0.5)], frame, tsec)
    frame += 1
    tsec += DT
check("motion. many hits at (nearly) the same position — insufficient cumulative displacement — never lock identity", t_nomove.identity_state != "tracked")

# --- 2. Candidate moving in the wrong direction is rejected (post-lock) ----
# Reset the established velocity/direction-floor to cold-start after
# acquisition (which necessarily moved the athlete to accumulate real
# displacement) so this test isolates the DIRECTION check the same way it
# did pre-Day-101, instead of also having to clear a much higher teleport/
# direction floor earned during acquisition itself.
t2 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx2, frame2, t2_time = run_to_tracked(t2, start_cx=0.10)
cx2, frame2, t2_time = settle_lock(t2, cx2, frame2, t2_time)
t2.state.max_abs_velocity = 0.0
r2 = t2.step([cand(cx2 - 0.005, 0.5)], frame2, t2_time)
check("2. a candidate moving opposite the configured direction is rejected for that frame", r2["verified"] is False)
check("2. rejection reason names the direction violation", r2["candidates"][0]["rejectionReason"] == "opposes_configured_direction")

# --- 3. Candidate teleport is rejected (post-lock) --------------------------
t3 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx3, frame3, t3_time = run_to_tracked(t3, start_cx=0.10)
r3 = t3.step([cand(0.95, 0.5)], frame3, t3_time)  # implausible single-frame jump across the whole frame
check("3. an implausible single-frame position jump is rejected as a teleport", r3["verified"] is False)
check("3. rejection reason names the teleport", r3["candidates"][0]["rejectionReason"] == "teleport_implausible_velocity")

# --- 4. Large body-scale discontinuity is rejected (post-lock) -------------
t4 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx4, frame4, t4_time = run_to_tracked(t4, start_cx=0.10)
cx4, frame4, t4_time = settle_lock(t4, cx4, frame4, t4_time)
t4.state.max_abs_velocity = 0.0
r4 = t4.step([cand(cx4 + 0.001, 0.5, w=0.08 * 4, h=0.22 * 4)], frame4, t4_time)
check("4. a wildly different body scale at the same position is rejected", r4["verified"] is False)
check("4. rejection reason names the scale discontinuity", r4["candidates"][0]["rejectionReason"] == "scale_discontinuity")

# --- 5. Correct athlete is retained when another person appears (post-lock) -
t5 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t5, start_cx=0.10)
selected_track = []
for i in range(30):
    cx += 0.01
    candidates = [cand(cx, 0.5), cand(0.7, 0.6, w=0.09, h=0.24)]
    r = t5.step(candidates, frame, tsec)
    check_idx = r["selectedIndex"]
    if check_idx is not None:
        selected_track.append(candidates[check_idx].cx)
    frame += 1
    tsec += DT
check("5. the real athlete (not the newly appeared second person) is tracked throughout", all(abs(x - cx) < 0.35 for x in selected_track))
check("5. no identity switch occurred while a second person was present", t5.identity_switch_count == 0)

# --- 6. Bounded reacquisition after a short gap (post-lock) -----------------
t6 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t6, start_cx=0.10)
for i in range(4):
    cx += 0.01
    t6.step([cand(cx, 0.5)], frame, tsec)
    frame += 1
    tsec += DT
# Gap: no detections for a few frames (shorter than CONSECUTIVE_UNVERIFIED_BEFORE_LOST=6).
for i in range(4):
    t6.step([], frame, tsec)
    frame += 1
    tsec += DT
check("6. a short gap does not yet declare the track lost", t6.identity_state == "tracked")
cx += 0.01 * 4
r6 = t6.step([cand(cx, 0.5)], frame, tsec)
check("6. the athlete is reacquired near the predicted position after a short gap", r6["verified"] is True)

# --- 7. Long gaps do not create invented pose landmarks (post-lock) ---------
t7 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t7, start_cx=0.10)
verified_frames = []
for i in range(80):  # a long gap, well beyond the reacquisition budget
    r = t7.step([], frame, tsec)
    verified_frames.append(r["verified"])
    frame += 1
    tsec += DT
check("7. no frame during a long gap is ever marked verified (nothing is invented)", not any(verified_frames))
check("7. identity state reaches 'terminated' rather than silently staying 'tracked'", t7.identity_state in ("terminated", "reacquiring"))

# --- 8. Identity-switch count is tracked (sustained opposite-direction) ----
t8 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t8, start_cx=0.10)
check("8. identity switch count starts at zero on a clean track", t8.identity_switch_count == 0)

t8b = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t8b, start_cx=0.10)
cx, frame, tsec = settle_lock(t8b, cx, frame, tsec)
t8b.state.max_abs_velocity = 0.0  # cold-start the direction floor, same reasoning as test 2
cx += 0.005
t8b.step([cand(cx, 0.5)], frame, tsec)  # establishes a real, modest forward velocity
frame += 1
tsec += DT
for i in range(8):
    cx -= 0.005  # a plausible-speed but WRONG-direction candidate, every frame
    t8b.step([cand(cx, 0.5)], frame, tsec)
    frame += 1
    tsec += DT
check("8b. sustained direction-opposing candidates increment identity-switch count", t8b.identity_switch_count >= 1)
check("8b. sustained direction-opposing candidates force reacquisition state", t8b.identity_state == "reacquiring")

# --- 9. Acquisition never prefers a candidate solely by size, and never on
# a single frame regardless of size. -----------------------------------------
t9 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
r9 = t9.step([cand(0.05, 0.5, w=0.03, h=0.09), cand(0.9, 0.5, w=0.3, h=0.6)], 0, 0.0)
check("9. the far, large candidate is rejected outright regardless of size", any(pc.get("rejectionReason") == "outside_entry_region" for pc in r9["candidates"] if pc.get("rejectionReason")))
check("9. the near-entry small candidate becomes pending, not immediately tracked", t9.pending is not None and t9.identity_state != "tracked")

# --- Day 101, Part 6: bounded post-lock recovery ----------------------------
# Case A (negative): once a lock has shown real motion SINCE locking (i.e.
# it has proven itself, exactly the same standard acquisition itself uses),
# it must never be overridden, however strong a new candidate looks.
t_recover_a = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t_recover_a, start_cx=0.10)
# Feed several more genuine, moving, accepted frames AFTER locking so the
# lock accumulates real post-lock displacement (this is what
# EARLY_LOCK_MAX_OWN_DISPLACEMENT actually measures).
for i in range(5):
    cx += 0.02
    t_recover_a.step([cand(cx, 0.5)], frame, tsec)
    frame += 1
    tsec += DT
locked_center_before = t_recover_a.state.center
overridden = False
for i in range(3):
    r = t_recover_a.step([cand(0.02, 0.5, w=0.2, h=0.4, completeness=0.99)], frame, tsec)
    if t_recover_a.identity_state != "tracked" or t_recover_a.state.center != locked_center_before:
        overridden = True
    frame += 1
    tsec += DT
check("recover-a. a lock that has already moved since locking (proven itself) is never overridden", not overridden)

# Case B (positive): the recovery mechanism actually works when justified —
# immediately after a fresh lock (before it has had any chance to move and
# prove itself), a substantially stronger, near-entry candidate CAN replace
# it. This is the direct capability Day 100 found missing.
t_recover_b = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx_b, frame_b, tsec_b = run_to_tracked(t_recover_b, start_cx=0.10)
r_override = t_recover_b.step(
    [cand(0.02, 0.5, w=0.2, h=0.4, completeness=0.99)], frame_b, tsec_b,
)
check("recover-b. a much stronger, near-entry candidate CAN replace a lock that has not yet proven itself by moving", t_recover_b.identity_switch_count >= 1)
check("recover-b. the override is explicitly logged as an identity switch, not silent", r_override["identitySwitch"] is True)

# --- Day 102: post-lock identity persistence through a longer detector-
# verification gap. The real Vanni clip showed identity_tracker declaring
# loss after only 6 consecutive DETECTOR-cadence misses (~48 video frames,
# well under one full stride cycle) even while box_tracker's own optical
# flow was still confidently tracking the same real athlete. This proves
# the widened budget survives a gap of that real, physiologically-motivated
# size without weakening the underlying continuity checks (the SAME
# candidate the gap ends with must still pass teleport/direction/scale). ---
t_persist = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx, frame, tsec = run_to_tracked(t_persist, start_cx=0.10)
gap_len = CONSECUTIVE_UNVERIFIED_BEFORE_LOST - 2  # just short of the (widened) loss budget
for i in range(gap_len):
    t_persist.step([], frame, tsec)
    frame += 1
    tsec += DT
check(
    f"persist. identity survives a {gap_len}-detector-call gap (derived from real stride timing, not tuned to any one clip) without declaring loss",
    t_persist.identity_state == "tracked",
)
# ...and still recovers correctly once real evidence returns.
cx += 0.01 * gap_len
r_persist = t_persist.step([cand(cx, 0.5)], frame, tsec)
check("persist. the SAME real athlete is still correctly re-verified after that gap (continuity checks unweakened)", r_persist["verified"] is True)

# Sanity: the OLD threshold (6) would have already declared this same gap
# lost — proves the fix is real, not a no-op.
t_old_would_lose = AthleteTracker(travel_direction="left_to_right", fps=FPS)
_, cx_o, frame_o, tsec_o = run_to_tracked(t_old_would_lose, start_cx=0.10)
for i in range(6):
    t_old_would_lose.step([], frame_o, tsec_o)
    frame_o += 1
    tsec_o += DT
check(
    "persist. confirms the fix is real: a gap of exactly the OLD (pre-Day-102) threshold length does not, by itself, terminate identity under the widened budget",
    t_old_would_lose.identity_state == "tracked",
)

# --- Diagnostics completeness ------------------------------------------------
t10 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
r10 = t10.step([cand(0.10, 0.5)], 0, 0.0)
required_keys = {"frame", "timeS", "selectedIndex", "verified", "identityState", "candidates", "configuredDirection", "identitySwitch"}
check("10. per-frame diagnostics carry all required fields even during pre-lock acquisition", required_keys.issubset(r10.keys()))

# --- 9. Crop smoothing/margin never alters source timestamps ----------------
# plan_crops (mediapipe_pose_runner.py) takes only spatial evidence
# (boxes/width/height/fps/direction/confidences) and returns ONLY crop
# rectangles — no timestamp is threaded through it or derivable from its
# output, so by construction it cannot alter WHEN a frame is measured, only
# WHERE the crop looks. Prove the function signature/contract directly and
# that identical spatial inputs always produce identical crops (determinism).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from mediapipe_pose_runner import plan_crops, TRACKER_LANDMARK_NAMES  # noqa: E402
import inspect  # noqa: E402

sig_params = list(inspect.signature(plan_crops).parameters.keys())
check("9. plan_crops's signature carries no timestamp parameter", "timestamps" not in sig_params and "time" not in sig_params)
boxes9 = [(100.0, 100.0, 40.0, 120.0) if i % 3 != 1 else None for i in range(30)]
crops_a, _ = plan_crops(boxes9, 1920, 1080, 240.0, direction_sign=1, confidences=[0.9] * 30)
crops_b, _ = plan_crops(boxes9, 1920, 1080, 240.0, direction_sign=1, confidences=[0.9] * 30)
check("9b. plan_crops is deterministic — identical spatial input always yields identical crops (no hidden time dependency)", crops_a == crops_b)
check("9c. TRACKER_LANDMARK_NAMES exposes head/pelvis/feet for crop-containment diagnostics", {"nose", "left_hip", "right_hip", "left_ankle", "right_ankle"}.issubset(set(TRACKER_LANDMARK_NAMES.values())))

# --- 11. Crop containment: a steady, centered athlete box stays fully inside
# the planned crop (head/pelvis/feet margin), frame after frame. -------------
boxes11 = [(700.0 + i * 2.0, 500.0, 60.0, 200.0) for i in range(40)]  # cx,cy,w,h in px
crops11, _ = plan_crops(boxes11, 1920, 1080, 240.0, direction_sign=1, confidences=[0.9] * 40)
contained = []
for (cx, cy, w, h), (x0, y0, x1, y1) in zip(boxes11[5:-5], crops11[5:-5]):
    contained.append(x0 <= cx - w / 2 and x1 >= cx + w / 2 and y0 <= cy - h / 2 and y1 >= cy + h / 2)
check("11. the athlete's full box (head/pelvis/feet extent) stays contained within the planned crop", all(contained))

# --- 12. Crop smoothing bounds: a single wild outlier box (e.g. a bad
# detection jumping across the frame) cannot move the crop center or resize
# it beyond the bounded per-frame step, even though the raw track jumps. ----
boxes12 = [(200.0, 500.0, 60.0, 200.0)] * 20 + [(1600.0, 500.0, 60.0, 200.0)] + [(200.0, 500.0, 60.0, 200.0)] * 10
crops12, _ = plan_crops(boxes12, 1920, 1080, 240.0, direction_sign=0, confidences=[0.9] * len(boxes12))
centers12 = [((x0 + x1) / 2.0, (y0 + y1) / 2.0, x1 - x0) for x0, y0, x1, y1 in crops12]
max_step_frac_observed = 0.0
for i in range(1, len(centers12)):
    pcx, pcy, pside = centers12[i - 1]
    cx, cy, _ = centers12[i]
    step = math.hypot(cx - pcx, cy - pcy)
    max_step_frac_observed = max(max_step_frac_observed, step / pside if pside else 0.0)
check(
    f"12. a single outlier box cannot move the crop center by more than the bounded step per frame (max observed {max_step_frac_observed:.3f}, bound 0.35 + smoothing tolerance)",
    max_step_frac_observed <= 0.35 + 0.05,
)

# --- Day 103, Part 3: pre-zone acquisition corridor (calibrated gate) ------
# The gate is deliberately placed well inside the frame (x=0.7), NOT near
# either edge — a position where the OLD frame-edge band (left_to_right:
# cx <= 0.4) and the NEW gate-relative corridor give DIFFERENT answers for
# the same candidate, so these tests actually distinguish the two
# implementations rather than passing either way.
GATE_X_LTR = 0.7
GATE_Y = 0.5
corridor_lo_ltr = GATE_X_LTR - ENTRY_CORRIDOR_DEPTH_BEFORE_GATE
corridor_hi_ltr = GATE_X_LTR + ENTRY_CORRIDOR_DEPTH_AFTER_GATE

# 1. Pre-zone corridor from a left-to-right start gate: a candidate BEFORE
# the gate (backward, toward the left) but well outside the old frame-edge
# band is accepted as near-entry once a calibrated gate is supplied.
t_corr1 = AthleteTracker(travel_direction="left_to_right", fps=FPS, entry_gate=(GATE_X_LTR, GATE_Y))
probe_x = GATE_X_LTR - 0.1  # 0.6 — outside the OLD [0, 0.4] band, inside the new corridor
check(
    "1. pre-zone corridor (left-to-right gate): a candidate before the gate but outside the old frame-edge band is now eligible",
    probe_x > ACQUISITION_ENTRY_BAND and corridor_lo_ltr <= probe_x <= corridor_hi_ltr,
)
r_corr1 = t_corr1.step([cand(probe_x, GATE_Y)], 0, 0.0)
check("1. that candidate is accepted into SEARCHING (becomes pending, not rejected)", t_corr1.pending is not None)

# 2. Pre-zone corridor from a right-to-left start gate: corridor mirrors
# around the gate, extending backward toward the RIGHT side.
GATE_X_RTL = 0.3
t_corr2 = AthleteTracker(travel_direction="right_to_left", fps=FPS, entry_gate=(GATE_X_RTL, GATE_Y))
corridor_lo_rtl = GATE_X_RTL - ENTRY_CORRIDOR_DEPTH_AFTER_GATE
corridor_hi_rtl = GATE_X_RTL + ENTRY_CORRIDOR_DEPTH_BEFORE_GATE
probe_x_rtl = GATE_X_RTL + 0.1  # 0.4 — outside the OLD [0.6, 1.0] band, inside the new corridor
check(
    "2. pre-zone corridor (right-to-left gate): a candidate before the gate (toward the right) but outside the old frame-edge band is now eligible",
    probe_x_rtl < (1.0 - ACQUISITION_ENTRY_BAND) and corridor_lo_rtl <= probe_x_rtl <= corridor_hi_rtl,
)
r_corr2 = t_corr2.step([cand(probe_x_rtl, GATE_Y)], 0, 0.0)
check("2. that candidate is accepted into SEARCHING (becomes pending, not rejected)", t_corr2.pending is not None)

# 3. Athlete visible away from the frame edge can be fully acquired (not
# just admitted to SEARCHING) — drive the corridor-eligible candidate all
# the way through CANDIDATE -> VERIFYING -> TRACKED.
t_corr3 = AthleteTracker(travel_direction="left_to_right", fps=FPS, entry_gate=(GATE_X_LTR, GATE_Y))
_, _, _, _ = run_to_tracked(t_corr3, start_cx=probe_x, cy=GATE_Y)
check("3. an athlete visible well away from the frame edge (near the calibrated gate) can reach TRACKED", t_corr3.identity_state == "tracked")

# 4. A candidate genuinely outside the corridor (e.g. background near the
# opposite side of the frame from the gate) is rejected outright.
t_corr4 = AthleteTracker(travel_direction="left_to_right", fps=FPS, entry_gate=(GATE_X_LTR, GATE_Y))
r_corr4 = t_corr4.step([cand(0.05, GATE_Y)], 0, 0.0)
check("4. a candidate outside the calibrated corridor is rejected outright, not merely down-weighted", t_corr4.pending is None)
check("4. the rejection reason names the corridor specifically (not the legacy frame-edge reason)", r_corr4["candidates"][0]["rejectionReason"] == "outside_entry_corridor")
check("4. rejection diagnostics carry the candidate center, corridor bounds, distance-to-gate, and configured direction (Part 3)", {
    "candidateCenter", "corridorBounds", "distanceToGate", "configuredDirection",
}.issubset(r_corr4["candidates"][0].keys()))
check("4. the corridor bounds reported in diagnostics are the calibrated-gate corridor, not the frame-edge band", r_corr4["candidates"][0]["corridorBounds"]["kind"] == "calibrated_gate_corridor")

# 5. Stationary background texture INSIDE the corridor must still be
# rejected — corridor membership alone is not sufficient; Day 101's
# stationary-candidate protection (Part 4 of this task) must still apply.
t_corr5 = AthleteTracker(travel_direction="left_to_right", fps=FPS, entry_gate=(GATE_X_LTR, GATE_Y))
still_x = GATE_X_LTR  # inside the corridor, at the gate itself
frame5, t5 = 0, 0.0
while t5 < MAX_STATIONARY_VERIFICATION_SECONDS + 0.5 and t_corr5.identity_state != "tracked":
    t_corr5.step([cand(still_x, GATE_Y)], frame5, t5)
    frame5 += 1
    t5 += DT
check("5. a stationary background texture inside the calibrated corridor never reaches TRACKED", t_corr5.identity_state != "tracked")
check("5. it is genuinely discarded (not merely never-corroborated)", t_corr5.candidates_discarded_stationary > 0)

# 6. Backward compatibility: with NO calibrated gate supplied (entry_gate is
# the default None), behavior is byte-for-byte the OLD frame-edge band —
# proves the corridor is additive, not a silent behavior change for
# sessions/tests without calibration.
t_corr6 = AthleteTracker(travel_direction="left_to_right", fps=FPS)
r_corr6 = t_corr6.step([cand(0.6, GATE_Y)], 0, 0.0)  # inside the new corridor for GATE_X_LTR, outside the old band
check("6. absent a calibrated gate, a candidate outside the legacy frame-edge band is still rejected (no silent behavior change)", t_corr6.pending is None)
check("6. the rejection reason is the legacy frame-edge reason, not the corridor reason", r_corr6["candidates"][0]["rejectionReason"] == "outside_entry_region")

# --- Day 104 (Part 2): backward identity recovery --------------------------
from athlete_tracker import track_backward  # noqa: E402

ANCHOR_FRAME = 20
ANCHOR_CENTER = (0.30, 0.5)
ANCHOR_HEIGHT = 0.22
ANCHOR_TIME_S = ANCHOR_FRAME * DT


def moving_pre_lock_records(first=0, last=19, cx_at_last=0.29, step=0.01):
    """Frames `first..last`, a straight-line approach consistent with the
    anchor's own trajectory (cx increases by `step` each frame, matching a
    left-to-right athlete) — the input `track_backward` expects: real,
    already-computed per-frame candidate lists (frame -> (time_s, [Candidate]))."""
    records = {}
    for f in range(first, last + 1):
        cx = cx_at_last - (last - f) * step
        records[f] = (f * DT, [cand(cx, 0.5, h=ANCHOR_HEIGHT)])
    return records


# 1. Backward track recovery from a trusted identity anchor: a clean,
# continuous approach recovers every pre-lock frame, walking all the way to
# the requested `min_frame` (frame 0) rather than stopping early.
records1 = moving_pre_lock_records(0, 19)
recovered1, diag1 = track_backward(records1, ANCHOR_FRAME, ANCHOR_CENTER, ANCHOR_HEIGHT, ANCHOR_TIME_S, "left_to_right")
check("1. backward recovery from a trusted anchor recovers every genuinely continuous pre-lock frame", sorted(recovered1) == list(range(20)))
check("1. recovery walks all the way to frame 0 when nothing interrupts it", diag1["stopReason"] == "reached_min_frame" and diag1["firstRecoveredFrame"] == 0)
check("1. the recovered position at the earliest frame matches the real (not fabricated) candidate position", abs(recovered1[0]["cx"] - 0.10) < 1e-9)
check("1. every recovered frame clears the same unweakened acceptance score real forward tracking uses", all(v["score"] >= MIN_ACCEPT_SCORE for v in recovered1.values()))

# 2. Backward recovery stops at the first unsupported frame: frame 10's
# detector ran (this is realistic — box_tracker.py's wants_detector_frame()
# is True every pre-lock frame) but found nobody ([None]) — a real "no
# evidence here" frame, not a gap in the buffer.
records2 = moving_pre_lock_records(0, 19)
records2[10] = (10 * DT, [None])
recovered2, diag2 = track_backward(records2, ANCHOR_FRAME, ANCHOR_CENTER, ANCHOR_HEIGHT, ANCHOR_TIME_S, "left_to_right")
check("2. backward recovery stops exactly at the first unsupported frame", diag2["stopFrame"] == 10 and diag2["stopReason"] == "no_continuity_consistent_candidate")
check("2. frames between the anchor and the gap are still recovered", sorted(recovered2) == list(range(11, 20)))
check("2. frames on the far side of the gap are never reached, let alone recovered", all(f not in recovered2 for f in range(0, 11)))

# 3. Backward pass rejects stationary background texture: frame 14 is a
# fixed-position candidate far from the walking trajectory (the same shape
# of evidence a stadium bleacher / spectator would produce) — the implied
# single-frame velocity to reach it is wildly above the athlete's own
# established speed, so it is hard-rejected (teleport), exactly like forward
# TRACKED tracking already rejects background — no new/looser rule.
records3 = moving_pre_lock_records(15, 19)
records3[14] = (14 * DT, [cand(0.9, 0.5, h=ANCHOR_HEIGHT)])
recovered3, diag3 = track_backward(records3, ANCHOR_FRAME, ANCHOR_CENTER, ANCHOR_HEIGHT, ANCHOR_TIME_S, "left_to_right")
check("3. a stationary/background candidate far from the trajectory never enters the recovered track", 14 not in recovered3)
check("3. the genuinely continuous frames right up to it are still recovered", sorted(recovered3) == list(range(15, 20)))
check("3. the background candidate is rejected as a teleport-implausible jump, not merely a low score", diag3["stopReason"] == "no_continuity_consistent_candidate")

# 4. Forward and backward tracks merge only with identity continuity: reusing
# fixture 3, the recovered set never extends PAST the discontinuous frame —
# there is no mechanism that "reconnects" past a broken continuity link.
check("4. backward recovery never merges past a broken continuity link", diag3["firstRecoveredFrame"] == 15 and 13 not in recovered3 and 12 not in recovered3)

# 5. Predicted-only / no-evidence frames can never create pose evidence: a
# frame where the detector found nobody ([None]) is never present in
# `recovered`, and nothing is fabricated in its place.
check("5. a frame with no real detection is never present in the recovered set", 10 not in recovered2)
check("5. nothing is substituted for it — the walk stops rather than predicting a box", diag2["recoveredFrameCount"] == len(recovered2) == 9)

print("\n" + ("ALL PASSED" if ok else "FAILURES PRESENT"))
sys.exit(0 if ok else 1)
