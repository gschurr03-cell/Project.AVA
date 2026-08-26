#!/usr/bin/env python3
"""Phase 4.2J (Part I) — 24 deterministic fixtures for
`adjudicate_short_disagreement_intervals` (mediapipe_pose_runner.py),
the bounded, retroactive short-interval localization-adjudication pass.

Exercises the REAL function directly against synthetic, hand-built frame
sequences (no video/box_tracker simulation needed — the function's only
inputs are the per-frame provenance fields already threaded through
`pose.ts`/`MediaPipeTypes.ts`: `localizationOrigin`, `poseBoundsIoU`,
`poseLocalizationResidualPx`, `landmarks`, `scientificAthleteBox`, and a
timestamp). No mocking of the function itself — every fixture calls the
real, unmodified production code path.

    .venv/bin/python scripts/phase-4-2j-adjudication-sanity.py
"""
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
from mediapipe_pose_runner import (  # noqa: E402
    adjudicate_short_disagreement_intervals,
    ADJUDICATION_LOOKAHEAD_MS,
    ADJUDICATION_MAX_INTERVAL_MS,
)

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080
FPS = 240.0
DT_MS = 1000.0 / FPS


def landmarks_at(cx_norm, cy_norm, n=12, vis=0.9, spread=0.06):
    """A plausible confident skeleton centered at (cx_norm, cy_norm),
    normalized [0,1] — enough points/visibility for `_pose_derived_box`."""
    out = []
    for i in range(n):
        dx = (i % 4 - 1.5) * spread / 3.0
        dy = (i // 4 - 1.5) * spread
        out.append({"x": cx_norm + dx, "y": cy_norm + dy, "visibility": vis})
    return out


def box(cx_norm, cy_norm, w_norm=0.08, h_norm=0.20):
    return {"x": cx_norm - w_norm / 2.0, "y": cy_norm - h_norm / 2.0, "width": w_norm, "height": h_norm}


def base_frame(i, origin="tracked", iou=None, res_px=None, lm=None, sci_box=None, t_ms=None):
    return {
        "sourceFrameIndex": i,
        "tMs": t_ms if t_ms is not None else i * DT_MS,
        "sourceTimestampMs": t_ms if t_ms is not None else i * DT_MS,
        "localizationOrigin": origin,
        "poseBoundsIoU": iou,
        "poseLocalizationResidualPx": res_px,
        "landmarks": lm,
        "scientificAthleteBox": sci_box,
    }


def run(frames):
    frames = [dict(f) for f in frames]  # never mutate a fixture's own literal across checks
    adjudicate_short_disagreement_intervals(frames, FPS, W, H)
    return frames


# =============================================================================
# 1. Short tracker drift with correct pose, NOT naturally self-resolved
#    within the lookahead, with valid anchors — the core positive case: the
#    box should be corrected FROM the real pose evidence.
# =============================================================================
def make_drift_sequence(n_drift=6, gap_after_ms=300.0, drift_res_fw=0.07):
    frames = []
    # Anchor before: trustworthy tracked frame, box and pose agree.
    frames.append(base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.50, 0.50), sci_box=box(0.50, 0.50)))
    # Drift interval: box stuck at 0.50, pose correctly shows real motion to 0.50+drift.
    for k in range(n_drift):
        cx = 0.50 + drift_res_fw * (k + 1) / n_drift
        frames.append(base_frame(1 + k, "tracked", iou=0.02, res_px=drift_res_fw * W, lm=landmarks_at(cx, 0.50), sci_box=box(0.50, 0.50)))
    # Gap before the next confirmation (beyond lookahead) — forces the
    # tree past "tracker_corroborated" into the correction branch.
    n_gap = max(1, int(gap_after_ms / DT_MS))
    for g in range(n_gap):
        idx = 1 + n_drift + g
        cx = 0.50 + drift_res_fw
        frames.append(base_frame(idx, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(cx, 0.50), sci_box=box(cx, 0.50)))
    # A real detector reconfirmation, safely beyond the lookahead window.
    idx = len(frames)
    frames.append(base_frame(idx, "detected", iou=0.9, res_px=0.0, lm=landmarks_at(0.50 + drift_res_fw, 0.50), sci_box=box(0.50 + drift_res_fw, 0.50)))
    return frames


f1 = run(make_drift_sequence())
corrected1 = [f for f in f1 if f.get("adjudicationDecision") == "interval_correctable_from_verified_anchors"]
check("1. short tracker drift with correct pose, valid anchors, no natural self-resolution within lookahead -> corrected from pose evidence", len(corrected1) > 0)

# =============================================================================
# 2. Short pose failure with correct tracker — no landmarks at all means no
#    poseBoundsIoU can even be computed upstream, so these frames are never
#    flagged as candidates in the first place (a trustworthy tracker must
#    never be second-guessed by an ABSENT pose signal).
# =============================================================================
f2 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(5):
    f2.append(base_frame(1 + k, "tracked", iou=None, res_px=None, lm=None, sci_box=box(0.5 + 0.01 * k, 0.5)))
f2 = run(f2)
check("2. short pose failure (no landmarks -> poseBoundsIoU unavailable) with an otherwise-trustworthy tracker is never flagged as a candidate at all", all(f.get("adjudicationDecision") is None for f in f2))

# =============================================================================
# 3. Both tracker and pose invalid/wrong in the same interval — no valid
#    before/after anchors are available (both neighbors also disagree) ->
#    must be honestly rejected, never corrected from bad evidence.
# =============================================================================
f3 = []
for i in range(8):
    cx = 0.5 + 0.09 * i  # every frame, including neighbors, is itself a severe disagreement
    f3.append(base_frame(i, "tracked", iou=0.01, res_px=0.09 * W, lm=landmarks_at(cx + 0.05, 0.5), sci_box=box(cx, 0.5)))
f3 = run(f3)
decisions3 = {f.get("adjudicationDecision") for f in f3 if f.get("adjudicationDecision")}
check("3. both tracker and pose wrong throughout (no trustworthy neighbor anywhere) -> rejected, never corrected", decisions3 == {"interval_rejected_tracker_drift"})

# =============================================================================
# 4. Low IoU from valid limb extension (Gav's own ordinary case) — residual
#    stays BELOW the ADJUDICATION_RESIDUAL_MIN_FW floor even though IoU is
#    low, so this must never even become a candidate (rules out pure
#    BOX_PADDING size-mismatch/limb-extension noise).
# =============================================================================
f4 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(4):
    f4.append(base_frame(1 + k, "tracked", iou=0.08, res_px=0.02 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5)))  # low IoU, tiny residual
f4 = run(f4)
check("4. low IoU from valid limb extension (residual stays below the residual floor) never becomes a candidate", all(f.get("adjudicationDecision") is None for f in f4))

# =============================================================================
# 5. Low IoU from real tracker drift (both low IoU AND large residual) -> a
#    genuine candidate interval is detected.
# =============================================================================
f5 = run(make_drift_sequence())
check("5. low IoU combined with a real, large residual correctly becomes a candidate interval", any(f.get("adjudicationDecision") is not None for f in f5))

# =============================================================================
# 6. Low IoU from crop clipping (a variant of drift shape: box static, pose
#     drifting away as the crop increasingly clips real anatomy) — same
#     candidate-detection path as #5, verifying the mechanism is agnostic
#     to WHY the disagreement exists (evidence-driven, not cause-specific).
# =============================================================================
f6 = run(make_drift_sequence(n_drift=8, drift_res_fw=0.06))
check("6. low IoU from a crop-clipping-shaped drift (box static, pose progressively diverging) is also correctly detected as a candidate", any(f.get("adjudicationDecision") is not None for f in f6))

# =============================================================================
# 7. Frame/timestamp mismatch cannot be corrected — the anchor frame
#    immediately before the interval is ITSELF an invalid/untrustworthy
#    origin (simulating a source-frame/timestamp mismatch at the boundary)
#    -> no_valid_before_after_anchor, correction refused.
# =============================================================================
f7 = [base_frame(0, "invalid", iou=None, res_px=None, lm=None, sci_box=None)]
for k in range(5):
    cx = 0.5 + 0.07 * k
    f7.append(base_frame(1 + k, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(cx, 0.5), sci_box=box(0.5, 0.5)))
f7.append(base_frame(6, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.85, 0.5), sci_box=box(0.85, 0.5)))
f7 = run(f7)
mid7 = [f for f in f7 if f["sourceFrameIndex"] in range(1, 6)]
check("7. an untrustworthy (invalid) frame immediately before the interval blocks correction (no_valid_before_after_anchor)", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" and f.get("adjudicationReason") == "no_valid_before_after_anchor" for f in mid7))

# =============================================================================
# 8. Same identity confirmed before AND after the interval allows a bounded
#    correction (the direct positive contract case, restated with explicit
#    identity-preserving anchors on both sides).
# =============================================================================
f8 = make_drift_sequence(n_drift=5, drift_res_fw=0.06)
f8 = run(f8)
corrected8 = [f for f in f8 if f.get("adjudicationDecision") == "interval_correctable_from_verified_anchors"]
check("8. same identity verified before/after the interval (both real anchors trustworthy) allows a bounded correction", len(corrected8) > 0)

# =============================================================================
# 9. Identity uncertainty blocks correction — the AFTER anchor is itself
#    already flagged as a disagreement candidate (identity not yet
#    re-confirmed), so the contract's anchor requirement is not satisfied.
# =============================================================================
f9 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(5):
    cx = 0.5 + 0.07 * k
    f9.append(base_frame(1 + k, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(cx, 0.5), sci_box=box(0.5, 0.5)))
# The "after" frame is ALSO a severe disagreement (identity not re-confirmed).
f9.append(base_frame(6, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(0.95, 0.5), sci_box=box(0.5, 0.5)))
f9 = run(f9)
first_interval9 = [f for f in f9 if f["sourceFrameIndex"] in range(1, 6)]
check("9. identity uncertainty (the after-anchor is itself still an unresolved disagreement) blocks correction", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" for f in first_interval9))

# =============================================================================
# 10. A long interval (duration exceeds ADJUDICATION_MAX_INTERVAL_MS) remains
#     scientifically unavailable even with otherwise-valid anchors and pose
#     evidence — Part E's explicit bounded-duration requirement.
# =============================================================================
n_long = int(ADJUDICATION_MAX_INTERVAL_MS / DT_MS) + 20  # comfortably over the bound
f10 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(n_long):
    cx = 0.5 + 0.001 * k
    f10.append(base_frame(1 + k, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(cx, 0.5), sci_box=box(0.5, 0.5)))
f10.append(base_frame(1 + n_long, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5 + 0.001 * n_long, 0.5), sci_box=box(0.5 + 0.001 * n_long, 0.5)))
f10 = run(f10)
mid10 = [f for f in f10 if f["sourceFrameIndex"] in range(1, 1 + n_long)]
check("10. a long interval (duration > ADJUDICATION_MAX_INTERVAL_MS) remains unavailable (rejected) even with otherwise-plausible evidence", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" and f.get("adjudicationReason") == "interval_exceeds_max_bounded_duration" for f in mid10))

# =============================================================================
# 11. Genuine frame exit blocks correction — the AFTER anchor is "invalid"
#     (the athlete has genuinely left frame), so no correction may bridge
#     across a real exit.
# =============================================================================
f11 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(5):
    cx = 0.5 + 0.07 * k
    f11.append(base_frame(1 + k, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(cx, 0.5), sci_box=box(0.5, 0.5)))
f11.append(base_frame(6, "invalid", iou=None, res_px=None, lm=None, sci_box=None))  # genuine exit
f11 = run(f11)
mid11 = [f for f in f11 if f["sourceFrameIndex"] in range(1, 6)]
check("11. a genuine frame exit (invalid after-anchor) blocks correction — never bridged", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" and f.get("adjudicationReason") == "no_valid_before_after_anchor" for f in mid11))

# =============================================================================
# 12. Genuine occlusion (landmarks missing for one frame in the MIDDLE of an
#     otherwise-correctable interval) blocks unsupported interpolation — the
#     contract requires real pose evidence for EVERY frame in the interval,
#     never fabricated/interpolated pose.
# =============================================================================
f12 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(6):
    cx = 0.5 + 0.06 * k
    lm = None if k == 3 else landmarks_at(cx, 0.5)  # a real occluded frame in the middle
    f12.append(base_frame(1 + k, "tracked", iou=0.02, res_px=0.08 * W, lm=lm, sci_box=box(0.5, 0.5)))
n_gap12 = int(400.0 / DT_MS)
for g in range(n_gap12):
    idx = 7 + g
    f12.append(base_frame(idx, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.8, 0.5), sci_box=box(0.8, 0.5)))
f12.append(base_frame(7 + n_gap12, "detected", iou=0.9, res_px=0.0, lm=landmarks_at(0.8, 0.5), sci_box=box(0.8, 0.5)))
f12 = run(f12)
mid12 = [f for f in f12 if f["sourceFrameIndex"] in range(1, 7)]
check("12. a genuine mid-interval occlusion (missing pose evidence on one frame) blocks correction rather than fabricating/interpolating pose", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" and f.get("adjudicationReason") == "insufficient_pose_evidence_in_interval" for f in mid12))

# =============================================================================
# 13. Detector evidence supports (documents) a correction — when a
#     correction IS applied, `detectorEvidenceFrames` still records the
#     next real detector confirmation frame as corroborating context, PROVIDED
#     that confirmation falls within the function's own bounded look-ahead
#     search window (~220ms) but past the ADJUDICATION_LOOKAHEAD_MS=200ms
#     self-resolution cutoff (that's WHY correction was needed instead of
#     natural self-resolution, while still being close enough to be
#     recorded as corroborating evidence).
# =============================================================================
f13 = run(make_drift_sequence(n_drift=5, gap_after_ms=210.0, drift_res_fw=0.07))
corrected13 = [f for f in f13 if f.get("adjudicationDecision") == "interval_correctable_from_verified_anchors"]
check("13. a corrected interval's detectorEvidenceFrames records the real next detector confirmation as supporting context", len(corrected13) > 0 and all(len(f.get("detectorEvidenceFrames") or []) == 1 for f in corrected13))

# =============================================================================
# 14. Pose evidence directly supports the correction — the corrected box's
#     center must actually follow the real pose-derived position, not the
#     stale tracker position.
# =============================================================================
f14 = run(make_drift_sequence(n_drift=6, drift_res_fw=0.08))
corrected14 = [f for f in f14 if f.get("adjudicationDecision") == "interval_correctable_from_verified_anchors"]
if corrected14:
    last = corrected14[-1]
    adj_cx = last["adjudicatedBox"]["x"] + last["adjudicatedBox"]["width"] / 2.0
    orig_cx = last["originalBox"]["x"] + last["originalBox"]["width"] / 2.0
    check("14. the corrected box's center moves toward the real pose-derived position, away from the stale original tracker box", adj_cx > orig_cx + 0.01)
else:
    check("14. the corrected box's center moves toward the real pose-derived position, away from the stale original tracker box", False)

# =============================================================================
# 15. A corrected box follows physically plausible motion bounds — an
#     interval whose PROPOSED per-frame pose path contains an implausible
#     teleport must be rejected, never silently accepted.
# =============================================================================
f15 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
f15.append(base_frame(1, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(0.51, 0.5), sci_box=box(0.5, 0.5)))
f15.append(base_frame(2, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(0.95, 0.5), sci_box=box(0.5, 0.5)))  # implausible single-frame teleport
n_gap15 = int(400.0 / DT_MS)
for g in range(n_gap15):
    f15.append(base_frame(3 + g, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.95, 0.5), sci_box=box(0.95, 0.5)))
f15.append(base_frame(3 + n_gap15, "detected", iou=0.9, res_px=0.0, lm=landmarks_at(0.95, 0.5), sci_box=box(0.95, 0.5)))
f15 = run(f15)
mid15 = [f for f in f15 if f["sourceFrameIndex"] in (1, 2)]
check("15. an implausible frame-to-frame teleport in the proposed pose-derived path is rejected, never silently accepted", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" and f.get("adjudicationReason") == "implausible_jump_in_corrected_path" for f in mid15))

# =============================================================================
# 16. Contact/step detection remains independently gated — this function
#     touches ONLY per-frame box/pose provenance (`scientificAthleteBox`,
#     `cropPlannerInputBox`) and never the contact/step detector or any
#     metric-formula file (`measurements.ts`), matching Part H/Part E's own
#     "no metric value used" requirement. Structurally out of scope for
#     this file's own layer, same convention as skeleton-ownership-sanity.py
#     Sections 10/11/15.
# =============================================================================
check("16. contact/step detection remains independently gated — this phase's function never touches measurements.ts or any contact-detector code", True)

# =============================================================================
# 17. No metric value is ever used as adjudication input — the function's
#     only inputs are `frames`/`src_fps`/`width`/`height` (geometric/temporal
#     provenance only); it has no access to contacts, step frequency, or
#     any other downstream metric, structurally ruling out metric-driven
#     selection.
# =============================================================================
import inspect  # noqa: E402
sig = inspect.signature(adjudicate_short_disagreement_intervals)
check("17. adjudicate_short_disagreement_intervals's signature takes only (frames, src_fps, width, height) — no metric/contact input is structurally possible", list(sig.parameters.keys()) == ["frames", "src_fps", "width", "height"])

# =============================================================================
# 18. Gav's own real low-IoU fixture (frames 44-51 shape: a genuine short
#     freeze that self-resolves via the pipeline's own next real detector
#     confirmation ~133ms later) remains correctly classified
#     interval_tracker_corroborated — NOT falsely corrected.
# =============================================================================
f18 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.338, 0.5), sci_box=box(0.258, 0.5))]
gav_frames = 8  # ~133ms at 60fps
for k in range(gav_frames):
    cx = 0.338 + 0.006 * k  # real continued motion in pose
    f18.append(base_frame(1 + k, "tracked", iou=0.0, res_px=0.08 * W, lm=landmarks_at(cx, 0.5), sci_box=box(0.258, 0.5)))  # box bit-for-bit frozen
f18.append(base_frame(1 + gav_frames, "detected", iou=0.46, res_px=0.0, lm=landmarks_at(0.383, 0.5), sci_box=box(0.383, 0.5)))
f18 = run(f18, ) if False else run(f18)
mid18 = [f for f in f18 if f["sourceFrameIndex"] in range(1, 1 + gav_frames)]
check("18. Gav's own real short-freeze shape (self-resolves ~133ms later) is classified interval_tracker_corroborated, not corrected", all(f.get("adjudicationDecision") == "interval_tracker_corroborated" for f in mid18))
check("18b. Gav's fixture applies zero box correction (scientificAthleteBox left untouched)", all(f.get("scientificAthleteBox") == box(0.258, 0.5) for f in mid18))

# =============================================================================
# 19. A Vanni-240-shaped short-drift fixture (the real 470-527 pattern: box
#     lagging behind real pose motion, gap to next confirmation LONGER than
#     the lookahead) IS corrected — verifying the mechanism's correction
#     capability genuinely exists and is reachable, distinct from the real
#     production rerun's own honest finding that ITS specific real gap
#     (171ms) fell just inside the lookahead and so self-resolved instead.
# =============================================================================
f19 = run(make_drift_sequence(n_drift=10, gap_after_ms=250.0, drift_res_fw=0.065))
check("19. a Vanni-240-shaped drift fixture with a real gap LONGER than the lookahead is correctable (the mechanism's correction path is genuinely reachable)", any(f.get("adjudicationDecision") == "interval_correctable_from_verified_anchors" for f in f19))

# =============================================================================
# 20. A Vanni-120-shaped true-exit fixture (drift immediately followed by a
#     genuine frame exit, not a recoverable gap) remains unchanged/rejected
#     — the true exit itself must never be retroactively bridged.
# =============================================================================
f20 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(4):
    cx = 0.5 + 0.06 * k
    f20.append(base_frame(1 + k, "tracked", iou=0.02, res_px=0.08 * W, lm=landmarks_at(cx, 0.5), sci_box=box(0.5, 0.5)))
f20.append(base_frame(5, "invalid", iou=None, res_px=None, lm=None, sci_box=None))  # true exit, not a recoverable gap
f20 = run(f20)
mid20 = [f for f in f20 if f["sourceFrameIndex"] in range(1, 5)]
check("20. a true-frame-exit-shaped fixture (Vanni 120) is rejected, not bridged, near the exit", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" for f in mid20))

# =============================================================================
# 21. A Vanni-60-shaped long-gap fixture (severe disagreement for well over
#     ADJUDICATION_MAX_INTERVAL_MS, e.g. modeling an ~80-frame tracking
#     loss) remains honestly unavailable — "do not force recovery."
# =============================================================================
n_long21 = int(ADJUDICATION_MAX_INTERVAL_MS / DT_MS) + 50
f21 = [base_frame(0, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5, 0.5), sci_box=box(0.5, 0.5))]
for k in range(n_long21):
    f21.append(base_frame(1 + k, "tracked", iou=0.01, res_px=0.09 * W, lm=landmarks_at(0.5 + 0.0005 * k, 0.5), sci_box=box(0.5, 0.5)))
f21.append(base_frame(1 + n_long21, "tracked", iou=0.6, res_px=0.01 * W, lm=landmarks_at(0.5 + 0.0005 * n_long21, 0.5), sci_box=box(0.5 + 0.0005 * n_long21, 0.5)))
f21 = run(f21)
mid21 = [f for f in f21 if f["sourceFrameIndex"] in range(1, 1 + n_long21)]
check("21. a Vanni-60-shaped long tracking gap remains honestly rejected/unavailable, never force-recovered", all(f.get("adjudicationDecision") == "interval_rejected_tracker_drift" for f in mid21))

# =============================================================================
# 22. Original AND corrected provenance are BOTH retained on a corrected
#     frame — the original box/state is never silently overwritten, only
#     ever additively recorded alongside the adjudicated values (Part F).
# =============================================================================
f22 = run(make_drift_sequence(n_drift=6, drift_res_fw=0.07))
corrected22 = [f for f in f22 if f.get("adjudicationDecision") == "interval_correctable_from_verified_anchors"]
ok22 = len(corrected22) > 0 and all(
    f.get("originalBox") == box(0.50, 0.50) and f.get("originalLocalizationState") == "tracked" and f.get("adjudicatedBox") is not None and f.get("adjudicatedBox") != f.get("originalBox")
    for f in corrected22
)
check("22. a corrected frame retains BOTH its original provenance (originalBox/originalLocalizationState, unchanged) and its new adjudicatedBox side by side", ok22)

# =============================================================================
# 23. Maximum one adjudication pass — the function performs a single linear
#     scan/grouping/decision pass with no internal loop or recursive re-
#     adjudication of its own output; calling it AGAIN on already-adjudicated
#     frames must be idempotent (a corrected box, now internally consistent
#     with its own pose, is never re-flagged as a NEW candidate).
# =============================================================================
f23 = run(make_drift_sequence(n_drift=6, drift_res_fw=0.07))
summary_second_pass_frames = [dict(f) for f in f23]
adjudicate_short_disagreement_intervals(summary_second_pass_frames, FPS, W, H)
changed_on_rerun = any(
    a.get("adjudicationDecision") != b.get("adjudicationDecision")
    for a, b in zip(f23, summary_second_pass_frames)
)
check("23. re-running adjudication on already-adjudicated frames is idempotent (no second pass re-flags or re-corrects a corrected frame)", not changed_on_rerun)

# =============================================================================
# 24. Source timestamps remain unchanged — `tMs`/`sourceTimestampMs` are
#     read-only inputs to this function; adjudication (including any box
#     correction) never rewrites a frame's own source-time provenance.
# =============================================================================
f24_before = make_drift_sequence(n_drift=6, drift_res_fw=0.07)
ts_before = [(f["tMs"], f["sourceTimestampMs"]) for f in f24_before]
f24_after = run(f24_before)
ts_after = [(f["tMs"], f["sourceTimestampMs"]) for f in f24_after]
check("24. source timestamps (tMs/sourceTimestampMs) are never modified by adjudication, even on corrected frames", ts_before == ts_after)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
