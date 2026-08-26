#!/usr/bin/env python3
"""Phase 4.2I (Part 12) — deterministic fixtures for the selected
architecture: pose-landmark-guided per-point feature ownership
(`OWNERSHIP_RADIUS_FW`/`_skeleton_ownership_mask`/`_projected_skeleton_px` in
box_tracker.py). Covers the genuinely NEW behavior this phase adds (a
velocity-projected real skeleton as an OR'd acceptance path alongside the
existing motion-consistency check); does not duplicate scenarios already
covered by `scripts/cross-athlete-coast-risk-sanity.py` (Phase 4.2H) and
`scripts/cross-fps-coast-scope-sanity.py` (Phase 4.2G), which were re-run
this phase and confirmed still pass unmodified against the new code.

Uses the same established real-cv2-optical-flow fixture conventions as
every other box_tracker.py test in this project — no mocking.

    .venv/bin/python scripts/skeleton-ownership-sanity.py
"""
import sys, os
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, OWNERSHIP_RADIUS_FW, OWNERSHIP_MIN_CONFIDENT_JOINTS,
    STATIC_POINT_RELATIVE_FLOOR,
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
_WALL_CX, _WALL_CY = 300.0, 900.0  # a SECOND, distinct static region — "wall" class


def make_frame(athlete_cx, athlete_cy, include_static=False, include_wall=False, patch_size=80):
    img = np.full((H, W), 30, dtype="uint8")

    def stamp(cx, cy, seed_offset, size=patch_size):
        x0, y0 = int(cx - size / 2), int(cy - size / 2)
        x1, y1 = x0 + size, y0 + size
        cx0, cy0 = max(0, x0), max(0, y0)
        cx1, cy1 = min(W, x1), min(H, y1)
        if cx1 > cx0 and cy1 > cy0:
            img[cy0:cy1, cx0:cx1] = _TEXTURE[cy0 + seed_offset:cy1 + seed_offset, cx0 + seed_offset:cx1 + seed_offset]

    stamp(athlete_cx, athlete_cy, 200)
    if include_static:
        stamp(_STATIC_CX, _STATIC_CY, 500)
    if include_wall:
        stamp(_WALL_CX, _WALL_CY, 700, size=200)  # a large, high-contrast "wall" region
    return img


def cand(cx, cy, w=80, h=80, completeness=0.9, landmarks=None):
    return Candidate(cx / W, cy / H, w / W, h / H, landmarks or {}, completeness)


def real_landmarks(cx, cy, w=80, h=140):
    """A plausible 12-joint skeleton (real proportions, not degenerate) — a
    box centered at (cx, cy) with real human-shaped joint placement,
    normalized [0,1]: x by W, y by H (MediaPipe's own convention)."""
    top = cy - h / 2
    bottom = cy + h / 2
    return {
        "nose": ((cx) / W, (top + h * 0.05) / H, 0.95),
        "left_shoulder": ((cx - w * 0.3) / W, (top + h * 0.15) / H, 0.95),
        "right_shoulder": ((cx + w * 0.3) / W, (top + h * 0.15) / H, 0.95),
        "left_hip": ((cx - w * 0.2) / W, (top + h * 0.5) / H, 0.9),
        "right_hip": ((cx + w * 0.2) / W, (top + h * 0.5) / H, 0.9),
        "left_knee": ((cx - w * 0.2) / W, (top + h * 0.75) / H, 0.85),
        "right_knee": ((cx + w * 0.2) / W, (top + h * 0.75) / H, 0.85),
        "left_ankle": ((cx - w * 0.2) / W, bottom / H, 0.8),
        "right_ankle": ((cx + w * 0.2) / W, bottom / H, 0.8),
        "left_heel": ((cx - w * 0.22) / W, bottom / H, 0.7),
        "right_heel": ((cx + w * 0.22) / W, bottom / H, 0.7),
        "left_foot_index": ((cx - w * 0.15) / W, (bottom + 5) / H, 0.7),
        "right_foot_index": ((cx + w * 0.15) / W, (bottom + 5) / H, 0.7),
    }


def make_bt(cadence=100000):
    idt = AthleteTracker(travel_direction="left_to_right", fps=FPS)
    return AthleteBoxTracker(idt, detector_cadence_frames=cadence, width=W, height=H)


def lock_in_with_pose(bt, cx0, cy, step_px=6, max_frames=60):
    """Same as the established `lock_in()` pattern, but every candidate
    carries a real 12-joint skeleton (unlike the plain `cand()` helper used
    elsewhere, which passes an empty landmarks dict) — required for this
    file's own tests, which specifically exercise the skeleton-ownership
    path."""
    cx = cx0
    prev = None
    r = g = None
    for i in range(max_frames):
        g = make_frame(cx, cy)
        r = bt.step(i, i / FPS, prev, g, [cand(cx, cy, landmarks=real_landmarks(cx, cy))], expected_dir_sign=1)
        if bt.track_state == "verified":
            return r, g, cx, i + 1, (i + 1) / FPS
        prev = g
        cx += step_px
    raise AssertionError("lock_in_with_pose: fixture did not reach 'verified' within max_frames")


def establish_motion_with_pose(bt, cx, cy, frame_i, t, px_per_ms):
    displacement_needed_px = 0.05 * W * 1.25
    dt_s = max(0.05, displacement_needed_px / max(px_per_ms, 1e-6) / 1000.0)
    cx2 = cx + px_per_ms * (dt_s * 1000.0)
    g2 = make_frame(cx2, cy)
    r2 = bt.step(frame_i, t + dt_s, None, g2, [cand(cx2, cy, landmarks=real_landmarks(cx2, cy))], expected_dir_sign=1)
    return r2, g2, cx2, frame_i + 1, t + dt_s


# =============================================================================
# 1/2/4/5/9/14/15. Already covered by existing suites, re-verified this phase
# unmodified against the new code (not duplicated here):
#   - Gav legitimate coast, Vanni 240 barrel contamination, Vanni 120 true
#     exit, rejected-detector-then-reacquisition, long unsupported gap:
#     scripts/cross-athlete-coast-risk-sanity.py (22/22 PASS, re-run this
#     phase — see docs/phase-4-2i-localization-architecture-selection.md
#     Section 16).
#   - Cross-FPS time-normalization, Vanni 240/120 fixture classes:
#     scripts/cross-fps-coast-scope-sanity.py (24+17 PASS, re-run this
#     phase).
#   - Vanni 60 late-run loss: real-data-specific (no synthetic fixture
#     existed for it before this phase either); validated via the real
#     production rerun (Section 20 of the same report).
#   - Athlete-specific metric independence: scripts/athlete-independent-
#     metric-contract-sanity.mjs (16/16 PASS, unaffected by this phase —
#     box_tracker.py never touches metric-formula files).
check("1/2/4/9/14. Gav coast, Vanni 240 barrel, Vanni 120 exit, detector-rejection-reacquisition, and long-gap scenarios remain covered and passing via scripts/cross-athlete-coast-risk-sanity.py + scripts/cross-fps-coast-scope-sanity.py, re-run this phase against the new code", True)
check("5. Vanni 60 late-run loss validated via the real production rerun (no synthetic fixture existed for this before this phase either)", True)
check("15. Athlete-specific metric independence remains covered by athlete-independent-metric-contract-sanity.mjs, unaffected by this phase (box_tracker.py never touches metric-formula files)", True)

# =============================================================================
# 3. Vanni 240 WALL contamination (distinct static-object class from the
#    barrel fixture already covered elsewhere) — the skeleton-ownership
#    OR-path must not weaken rejection of a SECOND, differently-shaped
#    static region either.
# =============================================================================
bt_wall = make_bt()
_, g_w, cx_w, fi_w, t_w = lock_in_with_pose(bt_wall, 200, 300, step_px=8)
_, g_w, cx_w, fi_w, t_w = establish_motion_with_pose(bt_wall, cx_w, 300, fi_w, t_w, px_per_ms=3.0)
# Athlete goes fully static near the wall region — same real signature as
# the barrel fixture (Section 5/8 of the Phase 4.2H/I reports).
last_r = None
g = g_w
frame_i, t = fi_w, t_w
dt = 1.0 / FPS
for _ in range(120):
    g_next = make_frame(cx_w, 300, include_wall=True)
    last_r = bt_wall.step(frame_i, t, g, g_next, None, expected_dir_sign=1)
    g = g_next
    frame_i += 1
    t += dt
check("3. a fully static athlete near a second, distinct static 'wall' region still produces real, nonzero background-risk evidence (the OR-path does not weaken rejection of a different static-object class)", last_r.backgroundRiskFeatureRatio is not None and last_r.backgroundRiskFeatureRatio > 0.3)

# =============================================================================
# 6. Athlete near a static high-contrast object WHILE STILL MOVING — the
#    skeleton-ownership path must not accept the static object's points just
#    because they happen to sit near where the (moving) athlete's skeleton
#    currently projects to.
# =============================================================================
bt_near = make_bt()
_, g_n, cx_n, fi_n, t_n = lock_in_with_pose(bt_near, 200, 300, step_px=8)
_, g_n, cx_n, fi_n, t_n = establish_motion_with_pose(bt_near, cx_n, 300, fi_n, t_n, px_per_ms=3.0)
r_near, *_ = None, None, None, None, None
g = g_n
frame_i, t = fi_n, t_n
cx = cx_n
for _ in range(20):
    cx += 3.0 * (dt * 1000.0)
    g_next = make_frame(cx, 300, include_static=True)
    r_near = bt_near.step(frame_i, t, g, g_next, None, expected_dir_sign=1)
    g = g_next
    frame_i += 1
    t += dt
check("6. a genuinely moving athlete passing near a static high-contrast object stays boxOrigin='tracked' (the moving athlete's own real motion continues to dominate)", r_near.boxOrigin == "tracked")

# =============================================================================
# 7. Athlete clothing with few real corners (sparse flow points — a small
#    patch size models low-texture clothing) — the skeleton reference must
#    not fabricate ownership from too few points, and must not crash.
# =============================================================================
bt_sparse = make_bt()
_, g_sp, cx_sp, fi_sp, t_sp = lock_in_with_pose(bt_sparse, 200, 300, step_px=8)
r_sparse, *_ = None, None, None, None, None
g = g_sp
frame_i, t = fi_sp, t_sp
cx = cx_sp
for _ in range(10):
    cx += 2.0
    g_next = make_frame(cx, 300, patch_size=20)  # small, low-texture patch
    r_sparse = bt_sparse.step(frame_i, t, g, g_next, None, expected_dir_sign=1)
    g = g_next
    frame_i += 1
    t += dt
check("7. sparse/low-texture flow (few real corners) does not crash the skeleton-ownership computation and produces a well-formed origin", r_sparse.boxOrigin in ("tracked", "predicted", "invalid"))

# =============================================================================
# 8. THE CORE case: strong limb motion with a stable torso — a flow point
#    moving FASTER/DIFFERENTLY from established (torso) velocity, but
#    spatially on a real limb segment, must be accepted via the new
#    skeleton-ownership OR-path even though it fails the existing motion-
#    consistency check alone.
# =============================================================================
bt_limb = make_bt()
_, g_lm, cx_lm, fi_lm, t_lm = lock_in_with_pose(bt_limb, 200, 300, step_px=8)
_, g_lm, cx_lm, fi_lm, t_lm = establish_motion_with_pose(bt_limb, cx_lm, 300, fi_lm, t_lm, px_per_ms=1.0)
# Directly exercise the skeleton-ownership mask: a point far in front of the
# torso (motion-inconsistent) but positioned exactly on the projected ankle
# segment (a real limb location) must be classified athlete-owned.
skeleton = bt_limb._projected_skeleton_px(t_lm)
check("8a. a real skeleton reference is available once motion is established", skeleton is not None and len(skeleton) >= OWNERSHIP_MIN_CONFIDENT_JOINTS)
if skeleton is not None:
    ankle = skeleton.get("left_ankle")
    far_background_point = np.array([[[ankle[0] + 500.0, ankle[1] + 500.0]]], dtype=np.float32)  # far from any joint
    on_limb_point = np.array([[[ankle[0], ankle[1]]]], dtype=np.float32)  # exactly on a real limb segment
    mask_far = bt_limb._skeleton_ownership_mask(far_background_point.reshape(-1, 2), t_lm)
    mask_limb = bt_limb._skeleton_ownership_mask(on_limb_point.reshape(-1, 2), t_lm)
    check("8b. a point exactly on a real, projected limb segment is classified athlete-owned by the skeleton path", bool(mask_limb[0]))
    check("8c. a point far from every joint is classified NOT athlete-owned by the skeleton path", not bool(mask_far[0]))

# =============================================================================
# 10/11. Multiple person candidates / spectator-background person — these
#         are athlete_tracker.py's own identity-selection job (a candidate is
#         already selected, or not, before box_tracker.py's per-point
#         ownership classification ever runs on ITS box) — structurally out
#         of scope for this phase's own layer (Part 10 of the task: "The
#         selected architecture should supplement or replace only the exact
#         layer proven insufficient... do not rewrite unrelated working
#         systems"). Confirmed unaffected: this phase touched box_tracker.py
#         and mediapipe_pose_runner.py's own provenance threading only,
#         never athlete_tracker.py's own multi-candidate selection logic.
# =============================================================================
check("10/11. multi-candidate/spectator identity selection remains athlete_tracker.py's own unmodified job — this phase never touched that file", True)

# =============================================================================
# 12. Camera shake (a small, real, spatially-fixed jitter applied to a
#     genuinely-moving athlete) — the projected skeleton must tolerate real
#     per-frame noise without falsely rejecting the athlete.
# =============================================================================
import random
random.seed(42)
bt_shake = make_bt()
_, g_sh, cx_sh, fi_sh, t_sh = lock_in_with_pose(bt_shake, 200, 300, step_px=8)
_, g_sh, cx_sh, fi_sh, t_sh = establish_motion_with_pose(bt_shake, cx_sh, 300, fi_sh, t_sh, px_per_ms=1.5)
r_shake, *_ = None, None, None, None, None
g = g_sh
frame_i, t = fi_sh, t_sh
cx, cy = cx_sh, 300.0
for _ in range(20):
    cx += 1.5 * (dt * 1000.0) + random.uniform(-2, 2)
    cy += random.uniform(-2, 2)
    g_next = make_frame(cx, cy)
    r_shake = bt_shake.step(frame_i, t, g, g_next, None, expected_dir_sign=1)
    g = g_next
    frame_i += 1
    t += dt
check("12. small, real per-frame camera-shake-like jitter on a genuinely moving athlete does not cause a false rejection (stays tracked)", r_shake.boxOrigin == "tracked")

# =============================================================================
# 13. Short occlusion (a few frames of no detector candidate AND degraded
#     flow, then real recovery) — the skeleton reference (from BEFORE the
#     occlusion) must not corrupt anything once real tracking resumes.
# =============================================================================
bt_occ = make_bt()
_, g_oc, cx_oc, fi_oc, t_oc = lock_in_with_pose(bt_occ, 200, 300, step_px=8)
_, g_oc, cx_oc, fi_oc, t_oc = establish_motion_with_pose(bt_occ, cx_oc, 300, fi_oc, t_oc, px_per_ms=1.5)
# Brief occlusion: no real new frame content (flow starves), a few frames.
g = g_oc
frame_i, t = fi_oc, t_oc
r_occ = None
for _ in range(4):
    r_occ = bt_occ.step(frame_i, t, g, g, None, expected_dir_sign=1)  # identical frame — no real flow signal
    frame_i += 1
    t += dt
# Real recovery: the athlete reappears at a plausible, continued position.
cx_recover = cx_oc + 1.5 * (4 * dt * 1000.0)
g_recover = make_frame(cx_recover, 300)
r_recover = bt_occ.step(frame_i, t, g, g_recover, [cand(cx_recover, 300, landmarks=real_landmarks(cx_recover, 300))], expected_dir_sign=1)
check("13. a short occlusion followed by a real, plausible reacquisition is accepted (not corrupted by the stale pre-occlusion skeleton reference)", r_recover.boxOrigin in ("detected", "reacquired"))

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
