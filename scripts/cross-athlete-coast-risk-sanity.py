#!/usr/bin/env python3
"""Deterministic cross-ATHLETE fixtures for Phase 4.2H (2026-08-07) — proves
the coast-risk model's rules depend on real EVIDENCE (elapsed time, distance,
trajectory residual, feature ownership), never on any particular athlete's
own metric values, and that two athletes with genuinely different real speed
profiles both get correctly classified from their own independent evidence.
Also proves the new exit-vs-background-lock classifier
(`localizationTerminationReason`) using real evidence patterns, and the new
Phase 4.2H diagnostic fields (`forwardBackwardValidRatio`,
`trajectoryResidualFrameWidths`, `flowProtectionLevel`).

Complements (does not replace) `scripts/cross-fps-coast-scope-sanity.py`
(Phase 4.2G, proves FPS-independence) — this file holds FPS fixed and varies
athlete SPEED instead, using the same established helper conventions (real
cv2 optical flow on textured synthetic frames, no mocking).

    .venv/bin/python scripts/cross-athlete-coast-risk-sanity.py
"""
import sys, os
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, COAST_MIN_MS_SINCE_VERIFIED, COAST_TRAJECTORY_ALT_FW,
    EXIT_EDGE_MARGIN_FRAC, EXIT_MIN_CONTINUED_DISPLACEMENT_FW,
    ROLLING_DISPLACEMENT_WINDOW_MS, COAST_RISK_STATES,
)
from athlete_tracker import AthleteTracker, Candidate  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


FPS = 240.0
W, H = 1920, 1080
_TEXTURE = np.indices((H + 800, W + 800)).sum(axis=0) % 2 * 255
_TEXTURE = _TEXTURE.astype("uint8")
_TEXTURE[::9, :] = (_TEXTURE[::9, :].astype(int) // 2).astype("uint8")
_TEXTURE[:, ::11] = (_TEXTURE[:, ::11].astype(int) // 3).astype("uint8")
_STATIC_CX, _STATIC_CY = 1400.0, 550.0


def make_frame(athlete_cx, athlete_cy, include_static=False, patch_size=80):
    img = np.full((H, W), 30, dtype="uint8")

    def stamp(cx, cy, seed_offset):
        x0, y0 = int(cx - patch_size / 2), int(cy - patch_size / 2)
        x1, y1 = x0 + patch_size, y0 + patch_size
        cx0, cy0 = max(0, x0), max(0, y0)
        cx1, cy1 = min(W, x1), min(H, y1)
        if cx1 > cx0 and cy1 > cy0:
            img[cy0:cy1, cx0:cx1] = _TEXTURE[cy0 + seed_offset:cy1 + seed_offset, cx0 + seed_offset:cx1 + seed_offset]

    stamp(athlete_cx, athlete_cy, 200)
    if include_static:
        stamp(_STATIC_CX, _STATIC_CY, 500)
    return img


def cand(cx, cy, w=80, h=80, completeness=0.9):
    return Candidate(cx / W, cy / H, w / W, h / H, {}, completeness)


def make_bt(cadence=100000):
    idt = AthleteTracker(travel_direction="left_to_right", fps=FPS)
    return AthleteBoxTracker(idt, detector_cadence_frames=cadence, width=W, height=H)


def lock_in(bt, cx0, cy, step_px=6, max_frames=60):
    cx = cx0
    prev = None
    r = g = None
    for i in range(max_frames):
        g = make_frame(cx, cy)
        r = bt.step(i, i / FPS, prev, g, [cand(cx, cy)], expected_dir_sign=1)
        if bt.track_state == "verified":
            return r, g, cx, i + 1, (i + 1) / FPS
        prev = g
        cx += step_px
    raise AssertionError("lock_in: fixture did not reach 'verified' within max_frames")


def coast(bt, prev_gray, cx0, cy, frame0, t0, duration_ms, px_per_ms=0.0, static=False):
    """Same off-by-one-corrected coast helper as cross-fps-coast-scope-sanity.py
    (see that file's own docstring for why `- 1` is needed) — held at FPS=240
    here since this file varies athlete speed, not frame rate."""
    n = max(1, round(duration_ms / 1000.0 * FPS) - 1)
    dt = 1.0 / FPS
    cx = cx0
    g = prev_gray
    r = None
    frame_i = frame0
    t = t0
    for _ in range(n):
        cx = cx + px_per_ms * (dt * 1000.0)
        g_next = make_frame(cx, cy, include_static=static)
        r = bt.step(frame_i, t, g, g_next, None, expected_dir_sign=1)
        g = g_next
        frame_i += 1
        t += dt
    return r, g, cx, frame_i, t


# =============================================================================
# 1/2. Short-stride/high-frequency vs. long-stride/lower-frequency athlete
#      profiles (approximated, at box_tracker's own layer, as different real
#      speeds and different confirmation cadences — step length/frequency
#      themselves are computed one layer up, in measurements.ts, already
#      proven athlete-independent by athlete-independent-metric-contract:sanity).
# =============================================================================
def establish_motion(bt, cx, cy, frame_i, t, px_per_ms):
    """A second, plausible detector confirmation shortly after lock_in — box
    tracker's own `motion_established` requires >= MOTION_ESTABLISHED_MIN_EVENTS
    (2) confirmed detector events with real accumulated displacement between
    them (see box_tracker.py's own MOTION_ESTABLISHED_MIN_EVENTS docstring);
    a single lock_in only produces one. The elapsed duration is derived from
    `px_per_ms` itself (not a fixed constant) so the established REFERENCE
    speed always matches the SAME speed a caller then coasts at — a fixed
    duration would force a fast confirmation window on a deliberately slow
    athlete profile, creating an artificial speed mismatch between
    "established" and "actual" that no real athlete would ever produce."""
    displacement_needed_px = 0.05 * W * 1.25  # MOTION_ESTABLISHED_MIN_DISPLACEMENT_FW, +25% margin
    dt_s = max(0.05, displacement_needed_px / max(px_per_ms, 1e-6) / 1000.0)
    cx2 = cx + px_per_ms * (dt_s * 1000.0)
    g2 = make_frame(cx2, cy)
    r2 = bt.step(frame_i, t + dt_s, None, g2, [cand(cx2, cy)], expected_dir_sign=1)
    return r2, g2, cx2, frame_i + 1, t + dt_s


bt_fast = make_bt()
_, g_fast, cx_fast, fi_fast, t_fast = lock_in(bt_fast, 200, 300, step_px=10)
_, g_fast, cx_fast, fi_fast, t_fast = establish_motion(bt_fast, cx_fast, 300, fi_fast, t_fast, px_per_ms=0.15)
r_fast, *_ = coast(bt_fast, g_fast, cx_fast, 300, fi_fast, t_fast, duration_ms=80.0, px_per_ms=0.15)
check("1. a fast-athlete profile (established speed matching its own real coast speed) stays honestly tracked through a short coast", r_fast.boxOrigin in ("tracked",))

bt_slow = make_bt()
_, g_slow, cx_slow, fi_slow, t_slow = lock_in(bt_slow, 200, 300, step_px=2)
_, g_slow, cx_slow, fi_slow, t_slow = establish_motion(bt_slow, cx_slow, 300, fi_slow, t_slow, px_per_ms=0.02)
r_slow, *_ = coast(bt_slow, g_slow, cx_slow, 300, fi_slow, t_slow, duration_ms=80.0, px_per_ms=0.02)
check("2. a slow-athlete profile (established speed matching its own real coast speed) stays honestly tracked through the SAME-duration short coast", r_slow.boxOrigin in ("tracked",))
check("2b. the fast and slow profiles reach genuinely different real established speeds (athlete-specific evidence, not a shared constant)", abs(bt_fast._established_speed_fw_per_s() - bt_slow._established_speed_fw_per_s()) > 0.01)

# =============================================================================
# 3. Coast risk behaves CONSISTENTLY for equivalent NORMALIZED evidence: two
#    athletes at genuinely different real speeds, coasted for the same
#    duration with no contamination, both remain in a non-elevated-risk
#    state — the model does not treat "faster real motion" as inherently
#    risky on its own (only trajectory residual / background-risk trend /
#    exit-vs-lock evidence should).
# =============================================================================
check("3. fast athlete's coastRiskState after a short, clean coast is NOT any of the elevated-risk states", r_fast.coastRiskState not in ("elevated_trajectory_risk", "elevated_feature_risk", "flow_degrading"))
check("3b. slow athlete's coastRiskState after the SAME-duration clean coast is NOT any of the elevated-risk states either", r_slow.coastRiskState not in ("elevated_trajectory_risk", "elevated_feature_risk", "flow_degrading"))

# =============================================================================
# 4. Frequent detector confirmation (Gav-class) remains stable regardless of
#    athlete speed — reconfirm every ~8 frames like Gav's own real cadence.
# =============================================================================
bt_gav_like = make_bt()
_, g_gav, cx_gav, fi_gav, t_gav = lock_in(bt_gav_like, 200, 300, step_px=8)
gav_states = []
for _ in range(6):
    # Re-confirm every ~50ms (comfortably under COAST_MIN_MS_SINCE_VERIFIED),
    # matching Gav's own real ~200-300ms full detector-cycle cadence at a
    # conservative fraction of it.
    r_gav, g_gav, cx_gav, fi_gav, t_gav = establish_motion(bt_gav_like, cx_gav, 300, fi_gav, t_gav, px_per_ms=2.5)
    gav_states.append(r_gav.coastRiskState)
check("4. a Gav-like frequent-reconfirmation profile never reaches an elevated-risk coast state", all(
    s not in ("elevated_trajectory_risk", "elevated_feature_risk", "flow_degrading", "lost", "reacquiring") for s in gav_states
))

# =============================================================================
# 5. Long safe coast: real, consistent athlete motion the whole time — stays
#    valid regardless of how long, because the evidence never turns risky.
# =============================================================================
bt_long_safe = make_bt()
_, g_ls, cx_ls, fi_ls, t_ls = lock_in(bt_long_safe, 200, 300, step_px=6)
_, g_ls, cx_ls, fi_ls, t_ls = establish_motion(bt_long_safe, cx_ls, 300, fi_ls, t_ls, px_per_ms=0.025)
r_ls, *_ = coast(bt_long_safe, g_ls, cx_ls, 300, fi_ls, t_ls, duration_ms=900.0, px_per_ms=0.025)
check("5. a long (900ms), real, consistently-moving coast stays boxOrigin='tracked' the whole time", r_ls.boxOrigin == "tracked")
check("5b. that long safe coast reaches corroborated_long_coast or normal_coast, never an elevated-risk label", r_ls.coastRiskState in ("corroborated_long_coast", "normal_coast"))

# =============================================================================
# 6. High-speed approach near a static object — real per-point exclusion
#    still engages (Vanni 240-style contamination defense unweakened).
# =============================================================================
bt_static = make_bt()
_, g_st, cx_st, fi_st, t_st = lock_in(bt_static, 200, 300, step_px=10)
_, g_st, cx_st, fi_st, t_st = establish_motion(bt_static, cx_st, 300, fi_st, t_st, px_per_ms=3.0)
r_st, *_ = coast(bt_static, g_st, cx_st, 300, fi_st, t_st, duration_ms=500.0, px_per_ms=0.0, static=True)
check("6. a fast-established athlete that then goes fully static near a static object produces real, nonzero background-risk evidence (contamination defense still fires)", r_st.backgroundRiskFeatureRatio is not None and r_st.backgroundRiskFeatureRatio > 0)

# =============================================================================
# 7/8. Genuine frame exit vs. background lock — the new
#      localizationTerminationReason classifier (Part D), using the real
#      evidence pattern this phase's own audit found (Vanni 120's real exit:
#      small, real, non-repeating continued displacement toward the far
#      edge; Vanni 240's real lock: bit-for-bit frozen position).
# =============================================================================
bt_exit = make_bt()
_, g_ex, cx_ex, fi_ex, t_ex = lock_in(bt_exit, 200, 300, step_px=6)
_, g_ex, cx_ex, fi_ex, t_ex = establish_motion(bt_exit, cx_ex, 300, fi_ex, t_ex, px_per_ms=3.0)
# A real, steady approach to the far edge — same real displacement pattern
# proven in cross-fps-coast-scope-sanity.py's own Scenario 8 (genuine exit).
r_exit, *_ = coast(bt_exit, g_ex, cx_ex, 300, fi_ex, t_ex, duration_ms=500.0, px_per_ms=3.0)
check("7. a real, steadily-advancing approach to the configured far edge is classified as a genuine frame exit, not background lock", r_exit.localizationTerminationReason == "genuine_frame_exit")
check("7b. the genuine-exit case's coastRiskState is an actionable state (refresh_required or exited_frame), never mistaken for a plain safe coast", r_exit.coastRiskState in ("refresh_required", "exited_frame", "reacquiring"))

bt_lock = make_bt()
_, g_lk, cx_lk, fi_lk, t_lk = lock_in(bt_lock, 200, 300, step_px=8)
_, g_lk, cx_lk, fi_lk, t_lk = establish_motion(bt_lock, cx_lk, 300, fi_lk, t_lk, px_per_ms=3.0)
# Fully static (px_per_ms=0, static=True): the "athlete" patch itself stops
# changing entirely — a real, bit-for-bit frozen position, matching the real
# Vanni 240 frame-649 tail's own signature.
r_lock, *_ = coast(bt_lock, g_lk, cx_lk, 300, fi_lk, t_lk, duration_ms=ROLLING_DISPLACEMENT_WINDOW_MS * 2.2, px_per_ms=0.0, static=True)
check("8. a box that goes bit-for-bit frozen (no real displacement at all) mid-frame is classified as a suspected background lock, not a frame exit", r_lock.localizationTerminationReason == "background_lock_suspected")

# =============================================================================
# 9. Rejected detector candidates do not reset coast age or distance, and do
#    not change the exit/lock classification path.
# =============================================================================
bt_rej = make_bt(cadence=100000)
_, g_rj, cx_rj, fi_rj, t_rj = lock_in(bt_rej, 200, 300, step_px=6)
r_before, g_before, cx_before, fi_before, t_before = coast(bt_rej, g_rj, cx_rj, 300, fi_rj, t_rj, duration_ms=100.0, px_per_ms=0.02)
time_before = r_before.timeSinceVerifiedDetectorMs
dist_before = r_before.distanceSinceVerifiedDetectorFrameWidths
# A wrong-direction candidate (a spurious false detection reported far
# BEHIND the athlete's real, continuing position) — must be rejected (not a
# plausible identity-verified event) and must not reset coast age/distance.
# The real scene keeps advancing normally (a small, continued step) so
# optical flow itself still has genuine, trackable evidence to fall through
# to — this is testing candidate rejection specifically, not simultaneously
# corrupting the real tracked scene.
cx_continued = cx_before + 3.0
g_after_reject = make_frame(cx_continued, 300)
r_reject = bt_rej.step(fi_before, t_before, g_before, g_after_reject, [cand(cx_before - 400, 300)], expected_dir_sign=1)
check("9. a wrong-direction (rejected) detector candidate does not reset timeSinceVerifiedDetectorMs backward", r_reject.timeSinceVerifiedDetectorMs is not None and r_reject.timeSinceVerifiedDetectorMs >= time_before)
check("9b. a rejected detector candidate does not reset distanceSinceVerifiedDetectorFrameWidths to zero", r_reject.distanceSinceVerifiedDetectorFrameWidths is not None and r_reject.distanceSinceVerifiedDetectorFrameWidths > 0)
check("9c. a rejected detector candidate never becomes accepted, verified evidence (boxOrigin stays a fallback, either an explicit box_tracker rejection or an identity-layer rejection — athlete_tracker's own job, per DETECTOR_EVENT_CLASSIFICATIONS' own documented `rejected_identity` vocabulary entry)", r_reject.boxOrigin not in ("detected", "reacquired"))

# =============================================================================
# 10. Verified reacquisition resets coast risk cleanly.
# =============================================================================
bt_reacq = make_bt(cadence=100000)
_, g_ra, cx_ra, fi_ra, t_ra = lock_in(bt_reacq, 200, 300, step_px=6)
_, g_ra2, cx_ra2, fi_ra2, t_ra2 = coast(bt_reacq, g_ra, cx_ra, 300, fi_ra, t_ra, duration_ms=200.0, px_per_ms=0.03)
g_fresh = make_frame(cx_ra2 + 5, 300)
r_reacq = bt_reacq.step(fi_ra2, t_ra2, g_ra2, g_fresh, [cand(cx_ra2 + 5, 300)], expected_dir_sign=1)
check("10. a fresh, plausible detector confirmation after a coast resets coastRiskState to recently_confirmed", r_reacq.coastRiskState == "recently_confirmed")
check("10b. that confirmation resets timeSinceVerifiedDetectorMs to 0", r_reacq.timeSinceVerifiedDetectorMs == 0.0)
check("10c. that confirmation resets distanceSinceVerifiedDetectorFrameWidths to 0", r_reacq.distanceSinceVerifiedDetectorFrameWidths == 0.0)

# =============================================================================
# 11. New Phase 4.2H diagnostic fields are populated and well-formed.
# =============================================================================
check("11. forwardBackwardValidRatio is populated on a tracked frame and is a valid ratio in [0,1]", r_ls.forwardBackwardValidRatio is not None and 0.0 <= r_ls.forwardBackwardValidRatio <= 1.0)
check("11b. trajectoryResidualFrameWidths is populated once motion is established", r_ls.trajectoryResidualFrameWidths is not None)
check("11c. athleteOwnedFeatureRatio and backgroundRiskFeatureRatio are complementary (sum to 1)", abs((r_ls.athleteOwnedFeatureRatio + r_ls.backgroundRiskFeatureRatio) - 1.0) < 1e-9)
check("11d. flowProtectionLevel is one of the documented values", r_ls.flowProtectionLevel in ("none", "monitoring", "active"))
check("11e. COAST_RISK_STATES includes every new Part C state", all(s in COAST_RISK_STATES for s in ("elevated_distance_risk", "elevated_feature_risk", "elevated_trajectory_risk", "corroborated_long_coast", "exited_frame", "lost")))

# =============================================================================
# 12. The trajectory-residual alt-path constant stays pinned to the existing,
#     already-evidenced TRAJECTORY_RESIDUAL_SUSPECT_FW (Section: no new,
#     unevidenced magic number was introduced for the exclusion gate).
# =============================================================================
check("12. COAST_TRAJECTORY_ALT_FW sits strictly above the raw TRAJECTORY_RESIDUAL_SUSPECT_FW signal floor (0.05fw) — a real Gav production rerun during this phase proved reusing that exact value directly regressed Gav (see box_tracker.py's own constant docstring for the full evidence)", COAST_TRAJECTORY_ALT_FW > 0.05)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
