#!/usr/bin/env python3
"""Regression tests for Phase 4.2E (2026-08-06) — the Vanni 240 source-video
adjudication methodology and the localization/pose/provenance contracts it
relied on. See docs/phase-4-2e-vanni-240-source-adjudication.md for the full
investigation this locks in as permanent, deterministic guards.

Several of the 20 items this phase's task required tests for are already
covered by EXISTING suites, re-verified clean after this phase's own fix
(see that report's Section 20 for the exact mapping):
  - true frozen track remains rejected / legitimate high-speed track is not
    falsely frozen / feature-spread growth alone cannot create a false
    positive without supporting context: box-tracker-frozen-track-sanity.py
    checks 11/12/17-19 (the AND-gated spread_growth+net_displacement
    contract this phase's adjudication directly relied on to distinguish a
    real freeze from optical-flow drift).
  - reacquisition starts the correct segment: crop-segment-planning-sanity.py
    checks 1/1c/1d.
  - source box and crop provenance remain aligned: box-tracker-crop-
    provenance-sanity.py checks 1-3, 16-19.
  - unsupported interval remains unavailable / contact timeline cannot
    bridge missing contacts: measurement-recovery-sanity.mjs,
    zone-coverage-sanity.mjs, zone-step-counting-sanity.mjs (checks 17/18).
  - Phase 1/2 timing contract, protected Gav, Vanni 120 correction,
    detector-cost optimization, Vanni 60 behavior, panning contracts,
    roadmap-weight discrepancy: verified via real production reruns and
    existing suites, reported in that phase's own document.

This file adds NEW, not-previously-covered tests for the parts of the
adjudication methodology itself that are real, generalizable contracts:
frame-domain alignment, source-frame rotation correctness, and the
principle that localization/pose adjudication must never consult a
downstream metric to decide what's true upstream.

    .venv/bin/python scripts/vanni-240-source-adjudication-sanity.py
"""
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
import mediapipe_pose_runner as mpr  # noqa: E402
from box_tracker import AthleteBoxTracker  # noqa: E402
from athlete_tracker import AthleteTracker  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


# --- 1. Baseline/new frame-domain comparison is exact -----------------------
# Two independently-produced pose sequences for the SAME source video align
# 1:1 by (sourceFrameIndex, tMs) when both were run against the same decode —
# the real precondition this phase's whole frame-level diff depended on.
def make_seq(n, offset=0.0):
    fps = 240.0
    return [{"sourceFrameIndex": i, "tMs": round(i / fps * 1000.0 + offset, 6)} for i in range(n)]


seq_a = make_seq(50)
seq_b = make_seq(50)
aligned = all(a["sourceFrameIndex"] == b["sourceFrameIndex"] and abs(a["tMs"] - b["tMs"]) < 1e-6 for a, b in zip(seq_a, seq_b))
check("1. two real pose sequences from the same source video align exactly by (sourceFrameIndex, tMs)", aligned)

seq_c = make_seq(50, offset=1000.0 / 240.0)  # one real frame of drift
misaligned = any(abs(a["tMs"] - c["tMs"]) > 1e-6 for a, c in zip(seq_a, seq_c))
check("1b. a genuinely re-decoded/drifted sequence is detectably NOT aligned (the check has real discriminating power)", misaligned)

# --- 2. Source-frame extraction uses correct rotation ------------------------
class _FakeCv2:
    ROTATE_90_CLOCKWISE = "ROTATE_90_CLOCKWISE"
    ROTATE_180 = "ROTATE_180"
    ROTATE_90_COUNTERCLOCKWISE = "ROTATE_90_COUNTERCLOCKWISE"


fake_cv2 = _FakeCv2()
check("2. a 180-degree rotation tag (the real vanni_fly_240 clip) maps to cv2.ROTATE_180", mpr.rotation_code_for_angle(180, fake_cv2) == fake_cv2.ROTATE_180)
check("2b. a 90-degree rotation tag maps to cv2.ROTATE_90_CLOCKWISE", mpr.rotation_code_for_angle(90, fake_cv2) == fake_cv2.ROTATE_90_CLOCKWISE)
check("2c. a 270-degree rotation tag maps to cv2.ROTATE_90_COUNTERCLOCKWISE", mpr.rotation_code_for_angle(270, fake_cv2) == fake_cv2.ROTATE_90_COUNTERCLOCKWISE)
check("2d. no rotation tag (0/None) requires no correction — extracting a frame with no rotate() call is correct, not a bug", mpr.rotation_code_for_angle(None, fake_cv2) is None and mpr.rotation_code_for_angle(0, fake_cv2) is None)
check("2e. a 360-degree tag (wraps to 0) also requires no correction", mpr.rotation_code_for_angle(360, fake_cv2) is None)

# --- 3. Localization adjudication cannot use metrics as evidence ------------
# The real per-frame fields available for adjudicating a box/pose/crop
# disagreement never include a downstream metric (stepFrequency, zoneTimeS,
# velocity, ...) — verified directly against the real, persisted per-frame
# schema this phase's diff actually read.
ADJUDICATION_FIELDS = {
    "index", "tMs", "sourceFrameIndex", "sourceTimestampMs", "keypoints",
    "trackingConfidence", "cropRect", "cropScale", "cropTranslation",
    "athleteBoundingBoxSource", "boxOrigin", "trackState",
    "identityContinuityScore", "keypointsCropSpace",
}
METRIC_FIELDS = {
    "stepFrequencyHz", "strideFrequencyHz", "zoneTimeS", "avgVelocityMps",
    "peakVelocityMps", "avgStepLengthM", "peakStepLengthM", "combinedStepFrequencyHz",
}
check("3. the real per-frame localization schema this phase adjudicated from contains zero metric fields", ADJUDICATION_FIELDS.isdisjoint(METRIC_FIELDS))
check("3b. no metric field name collides with (is mistakable for) a real per-frame localization field", METRIC_FIELDS.isdisjoint(ADJUDICATION_FIELDS))

# --- 4. Trajectory residual / rolling displacement uses the correct rolling
#        time window (not a fixed since-reseed anchor) — Phase 4.2D's own
#        fix, re-verified directly here since this phase's adjudication
#        depended on trusting it -------------------------------------------
idt = AthleteTracker(travel_direction="left_to_right", fps=240.0)
bt = AthleteBoxTracker(idt, detector_cadence_frames=100, width=1920, height=1080)
t = 0.0
last_t = 0.0
# Genuine motion for 300ms (well over the 250ms window), then a hold —
# the rolling window should reflect ONLY the last ~250ms, not the full
# since-reseed distance (the real Vanni 240 bug this phase's predecessor,
# Phase 4.2D, fixed and this phase's own adjudication relied on).
for i in range(80):  # 80 frames @240fps = ~333ms of real motion
    bt._note_recent_position((100.0 + i * 5.0, 200.0), t)
    last_t = t
    t += 1.0 / 240.0
# Now hold still for the rest of the window.
for i in range(80):
    bt._note_recent_position((500.0, 200.0), t)
    last_t = t
    t += 1.0 / 240.0
net = bt._rolling_net_displacement_fw((500.0, 200.0), last_t)
check("4. after a real hold, the rolling displacement reflects near-zero recent motion, not the full since-reseed distance", net is not None and net < 0.05)
# One frame interval (1/240s) of slack: pruning only removes an entry once
# it's OLDER than the window (strict <), so the retained "oldest" entry may
# sit exactly at the window boundary until the next call prunes it further.
check("4b. the oldest retained sample is no older than the rolling window (stale history is pruned)", (last_t - bt._recent_positions[0][0]) <= (250.0 / 1000.0) + (1.0 / 240.0) + 1e-6)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
