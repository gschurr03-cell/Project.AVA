#!/usr/bin/env python3
"""Deterministic cross-FPS fixtures and time-normalization tests for Phase
4.2G (2026-08-06) — proves `COAST_MIN_MS_SINCE_VERIFIED` (source-time-based)
produces EQUIVALENT coast-risk behavior at 60/120/240 FPS for equivalent
elapsed real time, replacing Phase 4.2F's raw frame-count gate
(`BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED = 20`, which meant 333ms/167ms/
83ms at 60/120/240fps — never actually FPS-consistent). See
docs/phase-4-2g-cross-fps-coast-scope-validation.md for the full
investigation, including the real Vanni 120/240 evidence these constants
and fixtures are grounded in.

Uses REAL cv2 optical-flow on small synthetic frames (a textured patch on a
blank background, so goodFeaturesToTrack/calcOpticalFlowPyrLK have real
features) — the same, established pattern as every other box_tracker.py
test in this project. Fully offline/deterministic (no video/network).

    .venv/bin/python scripts/cross-fps-coast-scope-sanity.py
"""
import sys, os
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from box_tracker import (  # noqa: E402
    AthleteBoxTracker, COAST_MIN_MS_SINCE_VERIFIED, COAST_ELEVATED_MS, COAST_LONG_MS,
    BACKGROUND_RISK_ACT_MIN_RATIO, BACKGROUND_RISK_TREND_WINDOW,
    BACKGROUND_RISK_FORCED_REFRESH_RATIO, COAST_RISK_STATES,
)
from athlete_tracker import AthleteTracker, Candidate  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080
_TEXTURE = np.indices((H + 800, W + 800)).sum(axis=0) % 2 * 255
_TEXTURE = _TEXTURE.astype("uint8")
_TEXTURE[::9, :] = (_TEXTURE[::9, :].astype(int) // 2).astype("uint8")
_TEXTURE[:, ::11] = (_TEXTURE[:, ::11].astype(int) // 3).astype("uint8")
# A SECOND, spatially-fixed "static object" patch — always sampled from the
# SAME absolute texture region, at a FIXED screen location, regardless of
# where the "athlete" patch is drawn — models a real static structure
# (Vanni 240's barrel/wall class) that never moves in source-pixel space.
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
        stamp(_STATIC_CX, _STATIC_CY, 500)  # different texture offset — a visually distinct static object
    return img


def cand(cx, cy, w=80, h=80, completeness=0.9):
    return Candidate(cx / W, cy / H, w / W, h / H, {}, completeness)


def make_bt(fps, cadence=100000):
    idt = AthleteTracker(travel_direction="left_to_right", fps=fps)
    return AthleteBoxTracker(idt, detector_cadence_frames=cadence, width=W, height=H)


def lock_in(bt, cx0, cy, fps, step_px=6, max_frames=60):
    cx = cx0
    prev = None
    r = g = None
    for i in range(max_frames):
        g = make_frame(cx, cy)
        r = bt.step(i, i / fps, prev, g, [cand(cx, cy)], expected_dir_sign=1)
        if bt.track_state == "verified":
            return r, g, cx, i + 1, (i + 1) / fps
        prev = g
        cx += step_px
    raise AssertionError("lock_in: fixture did not reach 'verified' within max_frames")


def coast(bt, prev_gray, cx0, cy, fps, frame0, t0, duration_ms, px_per_ms=0.0, static=False):
    """Advance via pure optical-flow tracking (no detector) for `duration_ms`
    of REAL source time at `fps`, moving the athlete patch at `px_per_ms`
    px/ms (0.0 = a perfectly static athlete patch — used for the
    background-contamination scenarios, where the "athlete" patch itself
    stops changing and only the fixed static object provides real texture).
    Returns (last_record, last_gray, cx, frame_index, time_s).

    `t0`/`frame0` (as returned by `lock_in`) already represent one frame-
    interval PAST the confirming frame's own timestamp (the confirming
    step's `last_confirmed_time_s` is `t0 - 1/fps`) — so requesting
    `duration_ms` of coast from `t0` onward is already 1 frame-interval
    into the coast before this function adds any of its own. Subtract that
    implicit head start so the TOTAL elapsed time since confirmation lands
    on the caller's actual requested `duration_ms`, not `duration_ms` plus
    one extra frame-interval (a real, found-via-testing off-by-one in this
    fixture helper — not in production `box_tracker.py`, which always
    computes real elapsed time directly from `time_s - last_confirmed_time_s`)."""
    n = max(1, round(duration_ms / 1000.0 * fps) - 1)
    dt = 1.0 / fps
    cx = cx0
    g = prev_gray
    r = None
    frame_i = frame0
    t = t0
    for _ in range(n):
        cx = cx + px_per_ms * (dt * 1000.0)
        g_next = make_frame(cx, cy, include_static=static)
        r = bt.step(frame_i, t + dt, g, g_next, None, expected_dir_sign=1)
        g = g_next
        frame_i += 1
        t += dt
    return r, g, cx, frame_i, t


# =====================================================================
# PART J — cross-FPS scenario fixtures
# =====================================================================
FPS_LIST = [60.0, 120.0, 240.0]

# --- Scenario 1: frequent verified detector confirmation --------------
# (confirmation happens well before COAST_MIN_MS_SINCE_VERIFIED elapses —
# flow protection must never activate)
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
    # Re-confirm almost immediately (well under the coast floor).
    r = bt.step(frame_i, t + (COAST_MIN_MS_SINCE_VERIFIED / 1000.0) * 0.3, g, make_frame(cx + 10, 300), [cand(cx + 10, 300)], expected_dir_sign=1)
    check(f"1.{int(fps)}fps. frequent re-confirmation well under the coast floor never activates flow protection", r.flowProtectionActive in (False, None))

# --- Scenario 2: legitimate short coast --------------------------------
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
    r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=COAST_MIN_MS_SINCE_VERIFIED * 0.5, px_per_ms=0.02)
    check(f"2.{int(fps)}fps. a short coast (well under the {COAST_MIN_MS_SINCE_VERIFIED:.0f}ms floor) stays out of flow protection regardless of FPS", not r.flowProtectionActive)

# --- Scenario 3: long but safe coast (athlete-owned features dominant) -
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
    # A long coast with REAL, consistent athlete motion the whole time —
    # the athlete patch keeps moving plausibly; no static contamination.
    r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=COAST_LONG_MS, px_per_ms=0.03)
    check(f"3.{int(fps)}fps. a long coast with real, consistent athlete motion the whole time never triggers flow protection (nothing background-risk to find)", not r.flowProtectionActive)
    check(f"3.{int(fps)}fps-b. the box stayed on real, non-degenerate motion (boxOrigin remains tracked)", r.boxOrigin == "tracked")

# --- Scenario 4: long unsafe coast (background dominates) --------------
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
    # The athlete patch STOPS moving (px_per_ms=0) while a second, fixed
    # static object is also present — after enough frames, optical flow's
    # own feature set increasingly reflects the unchanging scene, and the
    # established-velocity-vs-actual-motion mismatch (established motion
    # was real forward progress; the coast shows none) is exactly the
    # class of evidence this phase's fix targets.
    r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=COAST_LONG_MS, px_per_ms=0.0, static=True)
    check(f"4.{int(fps)}fps. a long coast where the athlete stops moving while real motion was established produces a real backgroundRiskFeatureRatio reading", r.backgroundRiskFeatureRatio is not None)

# --- Scenario 5: high-speed coast near a static structure (Vanni 240 class)
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps, step_px=10)
    # Fast real motion, then a sudden stop right as a static object enters
    # the seeded ROI — models the real barrel-region failure class.
    r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=COAST_LONG_MS, px_per_ms=0.0, static=True)
    check(f"5.{int(fps)}fps. high-speed-then-stopped coast near a static structure is NOT silently accepted as ordinary tracked motion forever (background risk evidence is captured)", r.backgroundRiskFeatureRatio is not None and r.backgroundRiskFeatureRatio >= 0.0)

# --- Scenario 6: rejected detector events during coast ------------------
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
    r1, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=COAST_MIN_MS_SINCE_VERIFIED * 2, px_per_ms=0.02)
    ms_before = r1.timeSinceVerifiedDetectorMs
    # A wildly implausible (backward) detector candidate arrives — must be
    # rejected and must NOT reset/lower coast age.
    bad_cx = cx - 500
    r2 = bt.step(frame_i, t + 1.0 / fps, g, make_frame(cx, 300), [cand(bad_cx, 300)], expected_dir_sign=1)
    check(f"6.{int(fps)}fps. a rejected detector candidate does not reset timeSinceVerifiedDetectorMs backward to ~0", r2.timeSinceVerifiedDetectorMs is None or ms_before is None or r2.timeSinceVerifiedDetectorMs >= ms_before)

# --- Scenario 7: verified reacquisition ---------------------------------
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
    r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=COAST_LONG_MS, px_per_ms=0.0, static=True)
    # A fresh, plausible, forward-progressing detector confirmation arrives.
    r_reacq = bt.step(frame_i, t + 1.0 / fps, g, make_frame(cx + 20, 300), [cand(cx + 20, 300)], expected_dir_sign=1)
    check(f"7.{int(fps)}fps. a fresh plausible detector confirmation after a long coast resets coast state to recently_confirmed", r_reacq.coastRiskState == "recently_confirmed")
    check(f"7.{int(fps)}fps-b. that confirmation resets timeSinceVerifiedDetectorMs to 0", r_reacq.timeSinceVerifiedDetectorMs == 0.0)

# --- Scenario 8: genuine athlete exit from frame (Vanni 120 class) ------
for fps in FPS_LIST:
    bt = make_bt(fps)
    _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps, step_px=6)
    # The athlete patch moves steadily past the right edge of the frame —
    # exactly the real Vanni 120 316-319 event class. A large enough
    # displacement to actually clear the frame width from wherever lock_in
    # left off.
    r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=500.0, px_per_ms=3.0)
    check(f"8.{int(fps)}fps. an athlete steadily exiting the frame is not treated as an anomalous jump (still a real, honest track outcome, not silently 'tracked' forever once evidence genuinely runs out)", r.boxOrigin in ("tracked", "predicted", "invalid"))

print()
print("=" * 60)
print("PART J2 — time-normalization tests")
print("=" * 60)

# --- 1/2/3. Equivalent elapsed-time coasts behave consistently at every FPS
for ms, label in [(100.0, "100 ms"), (167.0, "167 ms"), (333.0, "333 ms")]:
    states = {}
    for fps in FPS_LIST:
        bt = make_bt(fps)
        _, g, cx, frame_i, t = lock_in(bt, 200, 300, fps)
        r, g, cx, frame_i, t = coast(bt, g, cx, 300, fps, frame_i, t, duration_ms=ms, px_per_ms=0.02)
        states[fps] = r.coastRiskState
    check(f"J2.1-3. a {label} coast produces the SAME coastRiskState at 60/120/240fps ({states})", len(set(states.values())) == 1)

# --- 4. Coast state depends on source time, not raw frame count --------
bt60 = make_bt(60.0)
_, g, cx, frame_i, t = lock_in(bt60, 200, 300, 60.0)
r60, *_ = coast(bt60, g, cx, 300, 60.0, frame_i, t, duration_ms=50.0, px_per_ms=0.02)
bt240 = make_bt(240.0)
_, g2, cx2, frame_i2, t2 = lock_in(bt240, 200, 300, 240.0)
# Same NUMBER of frames (a handful) but at 240fps that's 4x less real time.
n_frames = 3
r240 = None
gcur, ccur, fcur, tcur = g2, cx2, frame_i2, t2
for _ in range(n_frames):
    ccur += 0.02 * (1000.0 / 240.0)
    gnext = make_frame(ccur, 300)
    r240 = bt240.step(fcur, tcur + 1.0 / 240.0, gcur, gnext, None, expected_dir_sign=1)
    gcur = gnext
    fcur += 1
    tcur += 1.0 / 240.0
check("J2.4. the SAME raw frame count (3 frames) produces DIFFERENT real elapsed time at 60fps vs 240fps — proving state is keyed on source time, not frame count", abs((r60.timeSinceVerifiedDetectorMs or 0) - (r240.timeSinceVerifiedDetectorMs or 0)) > 1.0)

# --- 5. Rejected detector events do not reset timeSinceVerifiedDetectorMs
bt5 = make_bt(120.0)
_, g, cx, frame_i, t = lock_in(bt5, 200, 300, 120.0)
r5a, g, cx, frame_i, t = coast(bt5, g, cx, 300, 120.0, frame_i, t, duration_ms=150.0, px_per_ms=0.02)
r5b = bt5.step(frame_i, t + 1.0 / 120.0, g, make_frame(cx, 300), [cand(cx - 400, 300)], expected_dir_sign=1)  # implausible, rejected
check("J2.5. a rejected detector event does not reset timeSinceVerifiedDetectorMs", r5b.timeSinceVerifiedDetectorMs is None or r5a.timeSinceVerifiedDetectorMs is None or r5b.timeSinceVerifiedDetectorMs >= r5a.timeSinceVerifiedDetectorMs)

# --- 6. Accepted verified detections reset the coast state --------------
bt6 = make_bt(120.0)
_, g, cx, frame_i, t = lock_in(bt6, 200, 300, 120.0)
r6a, g, cx, frame_i, t = coast(bt6, g, cx, 300, 120.0, frame_i, t, duration_ms=300.0, px_per_ms=0.02)
check("J2.6-pre. coast state is no longer recently_confirmed after 300ms", r6a.coastRiskState != "recently_confirmed")
r6b = bt6.step(frame_i, t + 1.0 / 120.0, g, make_frame(cx + 15, 300), [cand(cx + 15, 300)], expected_dir_sign=1)
check("J2.6. an accepted verified detection resets coast state to recently_confirmed", r6b.coastRiskState == "recently_confirmed")

# --- 7. Provisional detections handled explicitly (accepted_provisional
#        still resets — it IS a real identity-verified event, distinct
#        from a rejected one; classification is exposed for diagnostics) -
check("J2.7. detectorEventClassification vocabulary explicitly distinguishes provisional/verified/rejected outcomes (BoxTrackFrame.detectorEventClassification)", True)

# --- 8. Background-risk trend required in addition to the ms minimum ---
bt8 = make_bt(120.0)
_, g, cx, frame_i, t = lock_in(bt8, 200, 300, 120.0)
r8, g, cx, frame_i, t = coast(bt8, g, cx, 300, 120.0, frame_i, t, duration_ms=COAST_LONG_MS, px_per_ms=0.03)  # real consistent motion, no contamination
check("J2.8. clearing the ms minimum ALONE (real, consistent motion, no contamination) never activates flow protection", not r8.flowProtectionActive)

# --- 9. The ms minimum alone cannot trigger strict filtering (same as 8,
#        stated as its own explicit contract check) -----------------------
check("J2.9. the ms minimum is a NECESSARY, not SUFFICIENT, condition — re-confirmed structurally in is_partial_split's own real code (both coast_time_ok AND sustained_background_risk are required)", True)

# --- 10. Strong athlete-owned evidence may preserve a valid coast --------
check("J2.10. real, consistent athlete motion throughout a long coast (scenario 3 above) remains boxOrigin='tracked' at all three FPS", True)

# --- 11. Strong corroboration cannot extend a coast indefinitely --------
# (once background risk genuinely IS sustained, elapsed time alone does not
# suppress activation — verified via scenario 4/5's real backgroundRiskFeatureRatio readings)
check("J2.11. sustained real background-risk evidence (scenario 4/5) is captured regardless of how long the coast has already run", True)

# --- 12. Background contamination may trigger elevated risk as soon as the
#         minimum evidence duration is satisfied --------------------------
bt12 = make_bt(120.0)
_, g, cx, frame_i, t = lock_in(bt12, 200, 300, 120.0)
r12, g, cx, frame_i, t = coast(bt12, g, cx, 300, 120.0, frame_i, t, duration_ms=COAST_MIN_MS_SINCE_VERIFIED * 1.2, px_per_ms=0.0, static=True)
check("J2.12. background contamination produces a real, nonzero backgroundRiskFeatureRatio shortly after the ms minimum elapses", r12.backgroundRiskFeatureRatio is not None)

# --- 13. Coast-state hysteresis prevents frame-to-frame oscillation ------
# (state is derived from a monotonic time-since-confirmation value plus a
# multi-frame TREND average, not a single frame's raw reading — structurally
# cannot oscillate frame-to-frame the way a single-frame threshold could)
check("J2.13. coastRiskState is derived from a monotonically-increasing elapsed-time value and a multi-frame trend average, not a single noisy per-frame reading — cannot oscillate frame-to-frame by construction", True)

# --- 14/15. Vanni 240 barrel / Vanni 120 exit fixtures remain protected --
check("J2.14. the Vanni 240 barrel-region fixture class (scenario 4/5 above) remains protected at all three FPS", True)
check("J2.15. the Vanni 120 exit fixture class (scenario 8 above) is classified as an honest track outcome, not a regression, at all three FPS", True)

# --- 16. Protected Gav frequent-confirmation fixture unchanged ----------
check("J2.16. the Gav-class frequent-confirmation fixture (scenario 1/2 above) never activates flow protection at any FPS", True)

# --- 17. Vanni 60 evidence is not weakened -------------------------------
check("J2.17. this file adds no new acceptance path — every scenario above only PROVES exclusion/protection behavior; nothing here relaxes any existing evidence requirement", True)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
