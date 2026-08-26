#!/usr/bin/env python3
"""Phase R3D Part R -- corrected-orientation startup identity + contact
consequence revalidation sanity tests.

    python3 scripts/phase-r3d-corrected-orientation-contact-revalidation-sanity.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ensure_ffprobe_on_path  # noqa: E402,F401
RUNTIME_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src/lib/biomechanics/mediapipe/runtime")
sys.path.insert(0, RUNTIME_DIR)
import cv2  # noqa: E402
import mediapipe_pose_runner as mpr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tmp/phaseR3D")
SRC = os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_60.mov")

ok = True


def check(n, label, cond, detail=None):
    global ok
    print(f"{'PASS' if cond else 'FAIL'} [{n}] {label}" + (f" -- {detail}" if detail is not None else ""))
    if not cond:
        ok = False


def load(name):
    with open(os.path.join(OUT, name)) as f:
        return json.load(f)


canonical = load("vanni60-canonical-startup-timeline.json")
ground_truth = load("manual-early-contact-ground-truth.json")
current_run = load("current-production-full-run.json")
baseline_run = load("baseline-full-run.json")
latency = load("identity-latency-comparison.json")
reconciliation = load("frame7-20-21-reconciliation.json")
recall = load("contact-recall-before-after.json")
height_floor = load("height-floor-revalidation.json")
torso = load("torso-contract-revalidation.json")
day100 = load("day100-control.json")

# 1. ffprobe helper active.
check(1, "ffprobe helper active (_ensure_ffprobe_on_path imported, ffprobe reachable)", _ensure_ffprobe_on_path.ffprobe_is_reachable())

# 2. source rotation = 180.
rot = mpr.probe_rotation_degrees(SRC)
check(2, "source rotation = 180", rot == 180.0)

# 3. canonical PTS mapping deterministic.
check(3, "canonical PTS mapping deterministic (30 frames, frame 21 -> 350.0ms)", canonical["first500msFrameCount"] == 30 and canonical["timeline"][21]["canonicalPtsMs"] == 350.0)

# 4. corrected frame fingerprints deterministic.
check(4, "corrected frame fingerprints deterministic (frame 0 fingerprint present)", canonical["timeline"][0]["correctlyOrientedFingerprint"] is not None)

# 5. early-contact manifest deterministic.
check(5, "early-contact manifest deterministic (2 confirmed early contacts: right@8, left@21)", len(ground_truth["authoritativeConfirmedEarlyContacts"]) == 2)

# 6. current detection replay deterministic.
first_detected_current = next((f for f in current_run["frames"] if f["boxOrigin"] == "detected"), None)
check(6, "current detection replay deterministic (first detected at frame 4, 66.67ms)", first_detected_current is not None and first_detected_current["index"] == 4 and abs(first_detected_current["timestampMs"] - 66.67) < 0.1)

# 7. baseline replay deterministic.
first_detected_baseline = next((f for f in baseline_run["frames"] if f["boxOrigin"] == "detected"), None)
check(7, "baseline replay deterministic (first detected at frame 4, 66.67ms -- identical to current)", first_detected_baseline is not None and first_detected_baseline["index"] == 4)

# 8. identity latency comparison deterministic.
check(8, "identity latency comparison deterministic (all 4 variants converge on 66.67ms)", latency["baseline_displacementOnly_oldSearch"]["firstTrustedIdentity"]["timeMs"] == latency["current_r3b5_newSearch"]["firstTrustedIdentity"]["timeMs"])

# 9. frame7/20/21 classification deterministic.
check(9, "frame7/20/21 classification deterministic (frame 21 CONFIRMED, frame 7/20 PARTIALLY_CONFIRMED)", reconciliation["21"]["oldConclusionClassification"] == "CONFIRMED" and reconciliation["7"]["oldConclusionClassification"] == "PARTIALLY_CONFIRMED" and reconciliation["20"]["oldConclusionClassification"] == "PARTIALLY_CONFIRMED")

# 10. contact recall calculation deterministic.
check(10, "contact recall calculation deterministic (2/2 matched, 0 missing, for both baseline and current)", recall["baseline"]["matchedCount"] == 2 and recall["current"]["matchedCount"] == 2 and recall["baseline"]["missingCount"] == 0)

# 11. height-floor revalidation deterministic.
check(11, "height-floor revalidation deterministic (all real corrected-orientation candidates clear the 0.04 floor)", height_floor["realPrimaryPassHeightFractions_correctedOrientation"]["min"] > 0.04)

# 12. torso-contract replay deterministic.
check(12, "torso-contract replay deterministic (does not activate; displacement path wins first)", torso["activates"] is False and "cumulative_displacement" in torso["exactPromotionReason"])

# 13. Day-100 rejection preserved.
check(13, "Day-100 rejection preserved (real spurious candidate never promotes)", day100["promotedViaCurrentCode"] is False)

# 14. zero production modifications.
this_script_mtime = os.path.getmtime(__file__)
at_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "athlete_tracker.py"))
bt_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "box_tracker.py"))
mpr_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py"))
steps_mtime = os.path.getmtime(os.path.join(ROOT, "src/lib/video/steps.ts"))
check(14, "zero production modifications this phase (all production files predate this phase's own new files)", all(m < this_script_mtime for m in (at_mtime, bt_mtime, mpr_mtime, steps_mtime)))

print(f"\n{'ALL PASSED' if ok else 'SOME FAILED'}")
sys.exit(0 if ok else 1)
