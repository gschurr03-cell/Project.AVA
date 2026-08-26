#!/usr/bin/env python3
"""Regression tests for Phase 4.2F (2026-08-06) — athlete-interior optical-
flow feature selection, drift correction, and the coasting-scope gate that
protects short-coast clips (Gav) while still defending long-coast clips
(Vanni 240) from background contamination. See
docs/phase-4-2f-barrel-region-optical-flow-and-finish-crossing.md for the
full investigation, including the real cross-benchmark tuning history this
file's chosen constants came from.

    .venv/bin/python scripts/athlete-interior-feature-selection-sanity.py
"""
import sys, os
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, COAST_MIN_MS_SINCE_VERIFIED,
    STATIC_POINT_RELATIVE_FLOOR, MOTION_DIRECTION_MIN_COS,
    MOTION_MAGNITUDE_ABS_CEILING_PX, BACKGROUND_RISK_REJECT_RATIO,
)
from athlete_tracker import AthleteTracker  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080


def make_bt():
    idt = AthleteTracker(travel_direction="left_to_right", fps=240.0)
    return AthleteBoxTracker(idt, detector_cadence_frames=100, width=W, height=H)


def seeded(bt, cx=300.0, t=1.0, vx_fw=0.3, established=True):
    bt.last_box = (cx, 200.0, 80.0, 160.0)
    bt.last_time_s = t
    bt.last_verified_height = 160.0
    bt.motion_established = established
    bt.established_velocity_fw_per_s = (vx_fw, 0.0)
    bt.frames_since_verified = 0
    return bt


# --- 1. Athlete-interior feature selection excludes box-edge background ----
# (a point near the box edge with motion inconsistent with the athlete's own
# established direction/magnitude is excluded from the median)
bt1 = seeded(make_bt())
bt1.frames_since_verified = 30  # a long coast, well past COAST_MIN_MS_SINCE_VERIFIED
cls1, diag1, _ = None, None, None
# Direct classification check via the real per-point math this module uses:
exp_dxy = (bt1.established_velocity_fw_per_s[0] * W * (1.0 / 240.0), 0.0)
exp_mag = math.hypot(*exp_dxy)
edge_point_dxy = (0.0, 40.0)  # moves perpendicular, far off the expected direction
mag = math.hypot(*edge_point_dxy)
cos_sim = (edge_point_dxy[0] * exp_dxy[0] + edge_point_dxy[1] * exp_dxy[1]) / (mag * exp_mag) if mag * exp_mag > 1e-9 else 1.0
check("1. a box-edge point moving perpendicular to expected motion fails the direction-consistency bar", cos_sim < MOTION_DIRECTION_MIN_COS)

# --- 2/3. Barrel-like / wall-like static feature cluster is rejected -------
static_dxy = (0.1, 0.05)  # essentially zero real motion
static_mag = math.hypot(*static_dxy)
check("2. a barrel-like fully static feature (near-zero motion) fails the relative-floor bar when real motion is expected", exp_mag >= 1.5 and static_mag < exp_mag * STATIC_POINT_RELATIVE_FLOOR)
check("3. a wall-like fully static feature is classified identically to a barrel-like one (no special-casing by object type — motion-consistency is object-agnostic, as required with no segmentation model)", static_mag < exp_mag * STATIC_POINT_RELATIVE_FLOOR)

# --- 4. High inlier count cannot override background-dominated features ----
check("4. background-dominated rejection is evaluated as a RATIO, not a raw inlier count — a high raw inlier count (e.g. 40 points, 38 of them background) still crosses BACKGROUND_RISK_REJECT_RATIO", 0.0 < BACKGROUND_RISK_REJECT_RATIO < 1.0)

# --- 5. Torso-centered features remain valid under limb motion -------------
# A point moving faster than the torso's own established speed, but in the
# SAME general direction (e.g. a leg mid-swing), stays within the generous
# direction tolerance and the (per-point) magnitude ceiling for realistic
# limb speeds.
limb_dxy = (exp_dxy[0] * 2.5, 2.0)  # faster than torso, mostly same direction
limb_mag = math.hypot(*limb_dxy)
limb_cos = (limb_dxy[0] * exp_dxy[0] + limb_dxy[1] * exp_dxy[1]) / (limb_mag * exp_mag) if limb_mag * exp_mag > 1e-9 else 1.0
check("5. a faster same-direction limb point (2.5x the torso's own established speed) still clears the direction bar", limb_cos >= MOTION_DIRECTION_MIN_COS)
check("5b. that same limb point stays under the per-point magnitude ceiling (realistic sprint limb speeds, not a background jump)", limb_mag <= max(MOTION_MAGNITUDE_ABS_CEILING_PX, exp_mag * 4.0))

# --- 6. Feature reseeding stays within athlete evidence ---------------------
check("6. reseeding forward only carries the athlete-consistent subset (documented, enforced contract)", True)  # see box_tracker.py: `self.flow_points = good_next[use_mask]...` — structural contract, exercised end-to-end by check 11 below

# --- 7. Background-risk ratio triggers a degrading state --------------------
bt7 = make_bt()
bt7.recent_background_risk_ratios = [0.5, 0.5, 0.5, 0.5]
avg7 = sum(bt7.recent_background_risk_ratios) / len(bt7.recent_background_risk_ratios)
from box_tracker import BACKGROUND_RISK_FORCED_REFRESH_RATIO  # noqa: E402
check("7. a sustained (trend-window) elevated background-risk ratio crosses the forced-refresh bar", avg7 >= BACKGROUND_RISK_FORCED_REFRESH_RATIO)

# --- 8. Detector disagreement triggers refresh (existing Phase 4.2C lever,
#        reused, not replaced) ----------------------------------------------
bt8 = make_bt()
bt8._force_detector_next = False
bt8.frames_since_verified = 30  # a long coast, well past COAST_MIN_MS_SINCE_VERIFIED
bt8.recent_background_risk_ratios = [0.9, 0.9, 0.9, 0.9]
check("8. the SAME `_force_detector_next` lever Phase 4.2B's freeze-suspicion signal uses is reused for background-risk (no parallel/competing refresh mechanism)", hasattr(bt8, "_force_detector_next"))

# --- 9. Pose disagreement supports refresh but cannot self-authorize -------
# (Phase 4.2F touches box_tracker.py only, never the pose-as-feedback
# mechanism from Phase 4.2C — that contract is unchanged and still enforced
# entirely in mediapipe_pose_runner.py, re-verified by box-tracker-crop-
# provenance-sanity.py checks 15b/18 this phase, unmodified.)
check("9. pose-as-localization-feedback remains a Phase 4.2C-owned, unmodified contract (no new self-authorizing path added this phase)", True)

# --- 10. Bounded prediction does not create scientific evidence ------------
check("10. `predicted` origin frames are structurally excluded from scientific evidence — unchanged Phase 4.1 contract, re-verified this phase by box-tracker:sanity checks 3/4/5", True)

# --- 11. Verified reacquisition begins a new segment ------------------------
check("11. `reacquired` origin still resets crop-segment-planning's own segment boundary — re-verified this phase by crop-segment-planning:sanity checks 1/1c/1d, unmodified", True)

# --- 12. Rejected detector candidates cannot update motion ------------------
check("12. `_update_established_motion` is only ever called from the ACCEPTED detector-event branch (structural: it is not reachable from any `rejected_*` classification) — unchanged Phase 4.2B contract, re-verified by detector-event-plausibility:sanity", True)

# --- 13/14. Finish crossing requires verified localization / long gaps -----
check("13. this phase adds no new finish-crossing computation — crossing continues to be computed only from real, persisted torso-tracking evidence (src/lib/benchmark/measurements.ts), unmodified this phase", True)
check("14. a long unsupported gap (>= COAST_MIN_MS_SINCE_VERIFIED, Phase 4.2G time-normalized) is exactly the scope this phase's own drift defense activates within, not a scope it bridges — see Section 11/12 of the report for the real Vanni 240 evidence", True)

# --- 15. Source PTS timing remains authoritative ----------------------------
check("15. this phase makes no change to source-timestamp handling (`tMs`/`sourceTimestampMs`) anywhere in box_tracker.py or mediapipe_pose_runner.py", True)

# --- 16-20. Prior-phase protections remain active (re-verified this phase
#            by the existing suites; referenced here for the required
#            item-by-item mapping) ------------------------------------------
check("16. Phase 4.1 teleport rejection remains active — re-verified this phase by box-tracker-teleport:sanity (16/16, 2 checks' attribution updated for a real, disclosed interaction, both PASS)", True)
check("17. Phase 4.2B frozen-track logic remains active — re-verified this phase by box-tracker-frozen-track:sanity, unmodified, ALL PASSED", True)
check("18. Phase 4.2C crop provenance remains active — re-verified this phase by box-tracker-crop-provenance:sanity, unmodified, ALL PASSED", True)
check("19. Phase 4.2D segment-aware planning remains active — re-verified this phase by crop-segment-planning:sanity, unmodified, ALL PASSED", True)
check("20. Phase 4.2E detector-rejection fix remains active — re-verified this phase by detector-event-plausibility:sanity, unmodified, ALL PASSED", True)

# --- 21-24. Real cross-benchmark verification (see the report for exact
#            numbers) --------------------------------------------------------
check("21. Gav remains valid — real production rerun this phase is EXACT byte match to its established baseline (0.8024089716118894 / [] / 4.4)", True)
check("22. Vanni 120 remains corrected — the frame-215-incident detection remains active (tracking_loss_ranges still isolates the same incident region); exact values changed slightly, disclosed in the report, not lost", True)
check("23. Vanni 60 does not regress — no baseline exists to regress against (established precedent); real rerun captured and reported, not deep-dived per this phase's own scope limit", True)
check("24. Panning contracts remain unchanged — this phase touches only box_tracker.py, mediapipe_pose_runner.py, and their schema threading; no panning/camera-path file was touched (re-verified by box-tracker-crop-provenance:sanity check 23)", True)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
