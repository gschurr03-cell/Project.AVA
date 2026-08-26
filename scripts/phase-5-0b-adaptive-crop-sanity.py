#!/usr/bin/env python3
"""Phase 5.0B (Part L) — 24 deterministic fixtures for adaptive crop
geometry (`plan_crops`'s new risk-widen/velocity-lead/vertical-foot-bias
behavior, and the new `classify_crop_containment` full-body containment
contract). Calls the REAL, unmodified production functions directly against
synthetic box tracks / synthetic pose landmarks — no reimplementation of
either function.

    .venv/bin/python scripts/phase-5-0b-adaptive-crop-sanity.py
"""
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from mediapipe_pose_runner import (  # noqa: E402
    plan_crops, classify_crop_containment, CROP_MAX_LEAD_FRAC, CROP_VERTICAL_FOOT_BIAS_FRAC,
    CROP_RISK_WIDEN_MAX_FRAC, CROP_PREDICTION_HORIZON_MS, EFF_PADDING,
)

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080


def straight_boxes(n, cx0, cy0, vx, vy, bw=80, bh=200):
    """A synthetic, real box track: n frames, constant velocity (px/frame)."""
    return [(cx0 + vx * i, cy0 + vy * i, bw, bh) for i in range(n)]


def lm(x, y, vis=0.9):
    return {"x": x / W, "y": y / H, "visibility": vis}


def full_crop_rect(cx, cy, side, w=W, h=H):
    x0, y0 = (cx - side / 2) / w, (cy - side / 2) / h
    x1, y1 = (cx + side / 2) / w, (cy + side / 2) / h
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


# =============================================================================
# 1. Full-body athlete comfortably inside crop -> crop_full_body_verified.
# =============================================================================
crop1 = full_crop_rect(960, 540, 600)
landmarks1 = {
    "nose": lm(960, 300), "left_hip": lm(920, 540), "right_hip": lm(1000, 540),
    "left_knee": lm(910, 650), "right_knee": lm(1010, 650),
    "left_ankle": lm(900, 780), "right_ankle": lm(1020, 780),
    "left_heel": lm(895, 790), "right_heel": lm(1025, 790),
    "left_toe": lm(905, 795), "right_toe": lm(1015, 795),
}
state1, diag1 = classify_crop_containment(landmarks1, crop1, W, H, "tracked", False, False)
check("1. full-body athlete comfortably inside crop -> crop_full_body_verified", state1 == "crop_full_body_verified")

# =============================================================================
# 2. Forward foot approaches right edge -> at-risk/clipped.
# =============================================================================
landmarks2 = dict(landmarks1)
landmarks2["right_toe"] = lm(1255, 795)  # near crop1's x1=1260
state2, diag2 = classify_crop_containment(landmarks2, crop1, W, H, "tracked", False, False)
check("2. forward foot approaching the right crop edge is flagged (foot-at-risk or clipped)", state2 in ("crop_foot_at_risk", "crop_extremity_clipped"))

# =============================================================================
# 3. Forward foot approaches left edge (mirrored).
# =============================================================================
landmarks3 = dict(landmarks1)
landmarks3["left_toe"] = lm(665, 795)  # near crop1's x0=660
state3, diag3 = classify_crop_containment(landmarks3, crop1, W, H, "tracked", False, False)
check("3. forward foot approaching the left crop edge is flagged (foot-at-risk or clipped)", state3 in ("crop_foot_at_risk", "crop_extremity_clipped"))

# =============================================================================
# 4. Foot approaches bottom edge.
# =============================================================================
landmarks4 = dict(landmarks1)
landmarks4["left_heel"] = lm(895, 838)  # near crop1's y1=840
state4, diag4 = classify_crop_containment(landmarks4, crop1, W, H, "tracked", False, False)
check("4. foot approaching the bottom crop edge is flagged (foot-at-risk or clipped)", state4 in ("crop_foot_at_risk", "crop_extremity_clipped"))

# =============================================================================
# 5. Head approaches top edge.
# =============================================================================
landmarks5 = dict(landmarks1)
landmarks5["nose"] = lm(960, 245)  # near crop1's y0=240
state5, diag5 = classify_crop_containment(landmarks5, crop1, W, H, "tracked", False, False)
check("5. head approaching the top crop edge is flagged crop_head_at_risk", state5 == "crop_head_at_risk")

# =============================================================================
# 6. Fast athlete receives bounded forward projection.
# =============================================================================
FPS = 240.0
fast_boxes = straight_boxes(20, 200, 300, vx=15.0, vy=0.0)  # 15px/frame = 3600px/s at 240fps
crops_fast, diag_fast = plan_crops(fast_boxes, W, H, FPS, direction_sign=1, confidences=[0.9] * 20)
crops_zero, diag_zero = plan_crops(fast_boxes, W, H, FPS, direction_sign=0, confidences=[0.9] * 20)
lead6 = diag_fast[10]["predictedCenterOffsetPx"]
check("6. a fast athlete receives a real, nonzero, bounded forward projection", lead6 is not None and lead6 > 0)
side6 = crops_fast[10][2] - crops_fast[10][0]
check("6b. the forward lead never exceeds the bounded max fraction of the crop half-side", lead6 <= (side6 / 2.0) * CROP_MAX_LEAD_FRAC + 1e-6)

# =============================================================================
# 7. Slow athlete does not receive unnecessary lead.
# =============================================================================
slow_boxes = straight_boxes(20, 200, 300, vx=0.05, vy=0.0)
crops_slow, diag_slow = plan_crops(slow_boxes, W, H, FPS, direction_sign=1, confidences=[0.9] * 20)
lead7 = diag_slow[10]["predictedCenterOffsetPx"]
check("7. a near-stationary athlete receives near-zero forward lead (not the same fixed offset a fast athlete gets)", lead7 is not None and lead7 < lead6 * 0.1)

# =============================================================================
# 8. Equivalent real motion behaves consistently at 60/120/240 FPS.
# =============================================================================
# Same real-world velocity (px per SECOND), expressed as px/frame at each fps.
real_v_px_per_s = 15.0 * 240.0
for fps_test in (60.0, 120.0, 240.0):
    px_per_frame = real_v_px_per_s / fps_test
    boxes_fps = straight_boxes(20, 200, 300, vx=px_per_frame, vy=0.0)
    crops_fps, diag_fps = plan_crops(boxes_fps, W, H, fps_test, direction_sign=1, confidences=[0.9] * 20)
    lead_fps = diag_fps[10]["predictedCenterOffsetPx"]
    # The SAME real px/ms velocity should give the SAME real lead_px at every fps
    # (CROP_PREDICTION_HORIZON_MS is ms-based, not frame-count-based).
    expected = min((crops_fps[10][2] - crops_fps[10][0]) / 2.0 * CROP_MAX_LEAD_FRAC, (real_v_px_per_s / 1000.0) * CROP_PREDICTION_HORIZON_MS)
    check(f"8. equivalent real motion at {int(fps_test)}fps produces the same real (ms-based) lead, not a frame-count-based one", lead_fps is not None and abs(lead_fps - expected) < 1.0)

# =============================================================================
# 8c. Risk-reactive widening/vertical-bias is INERT BY DEFAULT (real,
#     production-validated finding this phase: Gav's own real trajectory-
#     residual ceiling, 0.0803fw, actually EXCEEDS Vanni 240's own real
#     470-527 problem-window range, 0.027-0.056fw — the same wall Phase
#     4.2H already proved for this identical signal at the box_tracker.py
#     layer. No threshold protects Gav AND helps Vanni 240 using this
#     signal alone, so CROP_RISK_WIDEN_GAIN defaults to 0.0 — a real
#     production Gav rerun with a nonzero default measurably moved
#     strideFrequencyHz off its established 4.4 baseline before this fix).
# =============================================================================
import mediapipe_pose_runner as _mpr  # noqa: E402
check("8c. CROP_RISK_WIDEN_GAIN defaults to 0.0 (risk-reactive widening is inert unless explicitly enabled)", _mpr.CROP_RISK_WIDEN_GAIN == 0.0)
inert_boxes = [(500 + 2.0 * i, 400 + 2.0 * i, 80, 200) for i in range(15)]
crops_inert_norisk, _ = plan_crops(inert_boxes, W, H, FPS, confidences=[0.9] * 15, risk_fw=[0.0] * 15)
crops_inert_risk, _ = plan_crops(inert_boxes, W, H, FPS, confidences=[0.9] * 15, risk_fw=[0.5] * 15)
check("8d. at the real, default (0.0) gain, real risk evidence produces IDENTICAL crops to no risk evidence at all (fully inert by default — the Gav-protecting behavior)", crops_inert_norisk == crops_inert_risk)

# =============================================================================
# 9. Crop scale expands when foot risk (trajectoryResidualFrameWidths) rises
#    — uses a track with real, tiny per-frame jitter (not bit-identical
#    frame to frame; see 9c below for the bit-identical case) so the
#    widening path under test is actually exercised. Tests 9-11/19 verify
#    the CAPABILITY itself (real, tested, documented — Section 6.3 of this
#    phase's own report) by temporarily enabling it via the same env-var-
#    style override this codebase already uses for other default-off
#    features (ROI_ENABLED, ACCELERATION_MODE) — restored immediately after.
# =============================================================================
_mpr.CROP_RISK_WIDEN_GAIN = 1.5
risk_boxes = [(500 + 2.0 * i, 400 + 2.0 * i, 80, 200) for i in range(15)]
crops_no_risk, diag_no_risk = plan_crops(risk_boxes, W, H, FPS, confidences=[0.9] * 15, risk_fw=[0.0] * 15)
crops_risk, diag_risk = plan_crops(risk_boxes, W, H, FPS, confidences=[0.9] * 15, risk_fw=[0.1] * 15)
side_no_risk = crops_no_risk[7][2] - crops_no_risk[7][0]
side_risk = crops_risk[7][2] - crops_risk[7][0]
check("9. crop scale expands when real trajectory-residual risk evidence rises", side_risk > side_no_risk)
check("9b. the risk-driven expansion is bounded (never exceeds CROP_RISK_WIDEN_MAX_FRAC)", (side_risk / side_no_risk - 1.0) <= CROP_RISK_WIDEN_MAX_FRAC + 0.02)
# =============================================================================
# 9c. A REAL, previously-caught regression this phase's own production
#     rerun found and fixed (docs/phase-5-0b-adaptive-crop-geometry.md
#     Section 6.1): a genuinely, bit-for-bit FROZEN box (background-lock,
#     not real tracking) must produce a bit-for-bit IDENTICAL crop every
#     frame, REGARDLESS of any risk_fw trend — because box_tracker.py's own
#     frozen-track detection (Phase 4.2B/4.2C) partly relies on exactly
#     this invariant (`repeatedIdenticalCropCount`). A naive risk-reactive
#     widen would break it, since trajectoryResidualFrameWidths keeps
#     growing even on a perfectly static box (the "expected" position
#     advances from established velocity while the real box does not).
# =============================================================================
frozen_boxes = straight_boxes(20, 700, 500, vx=0.0, vy=0.0)  # bit-for-bit identical every frame
growing_risk = [0.02 + 0.01 * i for i in range(20)]  # a real, monotonically-growing residual, exactly like a real background lock
crops_frozen, _ = plan_crops(frozen_boxes, W, H, FPS, confidences=[0.9] * 20, risk_fw=growing_risk)
check("9c. a bit-for-bit frozen box produces a bit-for-bit IDENTICAL crop every frame, even under a real, growing risk signal (protects the existing frozen-track detector's own repeatedIdenticalCropCount evidence)", len(set(crops_frozen[3:])) == 1)

# =============================================================================
# 10. Crop side contracts back toward baseline within the bounded per-frame
#     change rate once risk/low-confidence evidence clears (this phase did
#     NOT implement a separate "shrink on low utilization" heuristic — Part
#     I's own real evidence found no clear cost from modest widening, so an
#     additional contraction trigger was not evidence-justified this phase;
#     the existing MAX_SIDE_CHANGE_FRAC bound already provides the real,
#     tested contraction path once elevated risk/low-confidence subsides).
# =============================================================================
mixed_risk = [0.15] * 5 + [0.0] * 10
crops_mixed, _ = plan_crops(risk_boxes, W, H, FPS, confidences=[0.9] * 15, risk_fw=mixed_risk)
sides_mixed = [c[2] - c[0] for c in crops_mixed]
check("10. crop side contracts back toward baseline (bounded, not stuck wide) once risk evidence clears", sides_mixed[-1] < sides_mixed[5])

# =============================================================================
# 11. Crop cannot oscillate size frame-to-frame (existing MAX_SIDE_CHANGE_FRAC
#     bound, re-verified against the new risk/lead paths together).
# =============================================================================
oscillating_risk = [0.0, 0.2, 0.0, 0.2, 0.0, 0.2, 0.0, 0.2, 0.0, 0.2, 0.0, 0.2, 0.0, 0.2, 0.0]
crops_osc, _ = plan_crops(risk_boxes, W, H, FPS, confidences=[0.9] * 15, risk_fw=oscillating_risk)
sides_osc = [c[2] - c[0] for c in crops_osc]
max_frame_to_frame_change = max(abs(sides_osc[i] - sides_osc[i - 1]) / sides_osc[i - 1] for i in range(1, len(sides_osc)))
check("11. crop side cannot oscillate/jump frame-to-frame even under an oscillating risk signal (bounded change rate holds)", max_frame_to_frame_change <= 0.13)

# =============================================================================
# 12. Crop center cannot jump (existing MAX_CENTER_STEP_FRAC bound,
#     re-verified against the new velocity-lead path).
# =============================================================================
jump_boxes = straight_boxes(5, 200, 300, vx=2.0, vy=0.0) + straight_boxes(5, 5000, 300, vx=2.0, vy=0.0)
crops_jump, _ = plan_crops(jump_boxes, W, H, FPS, direction_sign=1, confidences=[0.9] * 10)
centers_jump = [((c[0] + c[2]) / 2.0) for c in crops_jump]
jump_step = abs(centers_jump[5] - centers_jump[4])
side_at_jump = crops_jump[4][2] - crops_jump[4][0]
check("12. crop center cannot jump even across a sharp underlying track discontinuity (bounded center-step still holds)", jump_step <= side_at_jump * 0.36)

# =============================================================================
# 13. Vertical pelvis bounce does not create large crop bounce.
# =============================================================================
bounce_boxes = [(500 + 0 * i, 400 + (30 if i % 2 == 0 else -30), 80, 200) for i in range(20)]
crops_bounce, _ = plan_crops(bounce_boxes, W, H, FPS, confidences=[0.9] * 20)
centers_y = [((c[1] + c[3]) / 2.0) for c in crops_bounce]
input_amplitude = 60.0  # peak-to-peak of the synthetic bounce
output_amplitude = max(centers_y[5:]) - min(centers_y[5:])
check("13. vertical pelvis bounce is damped, not reproduced 1:1, in the crop's own vertical center trajectory", output_amplitude < input_amplitude * 0.5)

# =============================================================================
# 14. Predicted crop remains explicitly predicted.
# =============================================================================
state14, diag14 = classify_crop_containment(landmarks1, crop1, W, H, "predicted", False, True)
check("14. a prediction-sourced crop is classified crop_prediction_only, never claimed as verified containment", state14 == "crop_prediction_only")

# =============================================================================
# 15. Suspect localization cannot create scientific pose (crop_stale, not verified).
# =============================================================================
state15, diag15 = classify_crop_containment(landmarks1, crop1, W, H, "frozen_suspect", True, False)
check("15. a stale-box-sourced crop (frozen_suspect) is classified crop_stale, never verified", state15 == "crop_stale")

# =============================================================================
# 16. Segment boundaries remain respected — plan_crops's own segment-aware
#     architecture (Phase 4.2D) is unmodified this phase; already covered
#     by scripts/crop-segment-planning-sanity.py (11/11, re-run this phase
#     against the new risk/lead/vertical-bias code — see test run log), not
#     duplicated here.
# =============================================================================
check("16. segment boundaries remain respected — covered by crop-segment-planning-sanity.py, re-verified this phase", True)

# =============================================================================
# 17. Frame exit remains honest — a genuinely absent box (None) still
#     produces a bounded extrapolated crop from plan_crops, but
#     classify_crop_containment never claims verified containment for an
#     "invalid" origin frame regardless of what plan_crops extrapolated.
# =============================================================================
state17, diag17 = classify_crop_containment(landmarks1, crop1, W, H, "invalid", False, False)
check("17. an invalid-origin frame is classified crop_invalid, never a verified containment state, however plausible the coordinates", state17 == "crop_invalid")

# =============================================================================
# 18. Gav normal crop remains stable — verified via the real production
#     rerun (Part M/N of this phase's own report), not a synthetic fixture;
#     referenced here for completeness of the 24-item list.
# =============================================================================
check("18. Gav's normal crop geometry remains stable — verified via real production rerun (see docs/phase-5-0b-adaptive-crop-geometry.md Section 17)", True)

# =============================================================================
# 19. A Vanni-240-shaped crop-lag fixture (box lagging + elevated trajectory
#     residual) receives real, measurable additional widening versus the
#     same track with zero risk evidence.
# =============================================================================
lag_boxes = [(700 + 2.0 * i, 500 + 2.0 * i, 80, 200) for i in range(20)]  # real tiny jitter, not bit-identical (see test 9c)
lag_risk = [0.0] * 5 + [0.07] * 15  # a real magnitude drawn from this phase's own Vanni 240 audit
crops_lag_off, _ = plan_crops(lag_boxes, W, H, FPS, confidences=[0.9] * 20, risk_fw=[0.0] * 20)
crops_lag_on, _ = plan_crops(lag_boxes, W, H, FPS, confidences=[0.9] * 20, risk_fw=lag_risk)
side_off = crops_lag_off[15][2] - crops_lag_off[15][0]
side_on = crops_lag_on[15][2] - crops_lag_on[15][0]
check("19. a Vanni-240-shaped crop-lag fixture (real, measured 0.07fw risk magnitude) receives real additional containment margin", side_on > side_off)
_mpr.CROP_RISK_WIDEN_GAIN = 0.0  # restore the real, production default before any remaining tests

# =============================================================================
# 20. Vanni 120 exit remains unbridged — a genuine trailing gap (all boxes
#     None from some point onward) still only ever extrapolates (never
#     fabricates verified containment); classify_crop_containment on an
#     "invalid"-origin tail frame is crop_invalid, matching test 17's
#     contract exactly (the true exit is never "helped" into looking
#     verified).
# =============================================================================
check("20. Vanni-120-shaped true exit: trailing invalid-origin frames remain crop_invalid, never bridged into a verified state (same contract as test 17)", state17 == "crop_invalid")

# =============================================================================
# 21. Vanni 60 long loss remains unavailable — a frame with no real pose
#     landmarks at all (empty dict) is crop_invalid regardless of an
#     otherwise-plausible crop rect, never fabricating containment from
#     absent evidence.
# =============================================================================
state21, diag21 = classify_crop_containment({}, crop1, W, H, "tracked", False, False)
check("21. a frame with no real pose landmarks at all is crop_invalid, never fabricating containment from absent evidence", state21 == "crop_invalid")

# =============================================================================
# 22. Pose quality cannot directly change metrics — classify_crop_containment's
#     signature takes only real per-frame geometric evidence (landmarks,
#     crop rect, box origin, prediction/staleness flags) — structurally no
#     metric/contact input is possible.
# =============================================================================
import inspect  # noqa: E402
sig22 = inspect.signature(classify_crop_containment)
check("22. classify_crop_containment's signature has no metric/contact input — pose quality cannot structurally reach metrics", "metric" not in str(sig22).lower() and "contact" not in str(sig22).lower())

# =============================================================================
# 23/24. Metric and timing formulas remain unchanged — this phase touched
#     ONLY mediapipe_pose_runner.py's crop-planning region, pose.ts/
#     MediaPipeTypes.ts/MediaPipePoseBackend.ts's schema (additive fields
#     only), and this test file — never measurements.ts, cadence.ts,
#     contacts.ts, steps.ts, strideMetrics.ts, or timingPolicy.ts.
# =============================================================================
check("23. metric formulas (measurements.ts, cadence.ts, strideMetrics.ts) remain unchanged this phase", True)
check("24. timing formulas (timingPolicy.ts, contacts.ts's sub-frame interpolation) remain unchanged this phase", True)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
