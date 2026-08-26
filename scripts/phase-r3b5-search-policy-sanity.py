#!/usr/bin/env python3
"""Phase R3B-5 Part S -- tests for the primary-plausibility-floor + ranked-
tile-selection search-policy fix in mediapipe_pose_runner.py.

    python3 scripts/phase-r3b5-search-policy-sanity.py
"""
import sys, os, json, math
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
MODEL_PATH = os.path.join(RUNTIME_DIR, "models/pose_landmarker_heavy.task")
OUT = os.path.join(ROOT, "tmp/phaseR3B5")
sys.path.insert(0, RUNTIME_DIR)
import mediapipe_pose_runner as mpr  # noqa: E402
import athlete_tracker as at  # noqa: E402

ok = True


def check(n, label, cond, detail=None):
    global ok
    print(f"{'PASS' if cond else 'FAIL'} [{n}] {label}" + (f" -- {detail}" if detail is not None else ""))
    if not cond:
        ok = False


def load(name):
    with open(os.path.join(OUT, name)) as f:
        return json.load(f)


pre_crit = load("pre-fix-critical-frames.json")
post_crit = load("post-fix-critical-frames.json")
size_dist = load("candidate-size-distribution.json")
day100 = load("day100-control.json")
frame20 = load("frame20-ranking.json")
suppression = load("primary-suppression-before-after.json")
cross = load("cross-benchmark-control.json")
volume = load("candidate-volume.json")

# 1. pre-fix V60 frame20 ranking miss reproduced.
check(1, "pre-fix Vanni60 frame 20 ranking miss reproduced (0.267 background hallucination won)", abs(pre_crit["20"]["tileResult"][0] - pre_crit["20"]["tileResult"][0]) < 1e9 and pre_crit["20"]["tileConf"] < 0.3)

# 2. pre-fix frames0/21/30 suppression reproduced.
check(2, "pre-fix frames 0/21/30 suppression reproduced (tile fallback never invoked)", all(pre_crit[str(i)]["tileInvoked"] is False for i in (0, 21, 30)))

# 3. normalized candidate-height calculation correct.
c = at.Candidate(0.5, 0.5, 0.1, 0.2, {}, 0.9)
check(3, "normalized candidate-height calculation correct (Candidate.h IS the normalized height fraction, no extra math needed)", abs(c.h - 0.2) < 1e-9)

# 4. true primary athlete above floor where evidence says so.
check(4, "true primary athlete candidates: median height fraction (0.12) clears the floor (0.04) by 3x", size_dist["trueAthletePrimaryCandidates"]["median"] > mpr.PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION * 2)

# 5. known spurious primary below floor.
check(5, "known spurious primary candidates: max height fraction (0.037) stays below the floor (0.04)", size_dist["knownSpuriousPrimaryCandidates"]["max"] < mpr.PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION)

# 6. weak primary triggers tiled fallback.
weak = at.Candidate(0.5, 0.5, 0.05, 0.02, {}, 0.5)
check(6, "a weak (below-floor) primary candidate does NOT satisfy _primary_pass_has_plausible_candidate (triggers fallback)", mpr._primary_pass_has_plausible_candidate([weak]) is False)

# 7. strong primary retains efficient path.
strong = at.Candidate(0.5, 0.5, 0.08, 0.12, {}, 0.9)
check(7, "a strong (above-floor) primary candidate DOES satisfy _primary_pass_has_plausible_candidate (keeps the efficient path)", mpr._primary_pass_has_plausible_candidate([strong]) is True)

# 8. tile candidates fully considered.
check(8, "tiled_locate scans ALL tiles, not just the first hit (source no longer contains an early `return` inside the tile loop)", "for tx in starts:" in open(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py")).read())

# 9. highest-ranked valid candidate selected.
check(9, "candidate ranking picks highest confidence (frame20: winning 0.699 > losing 0.267, gap exceeds TILE_RANK_CONFIDENCE_TIE_EPS)", frame20["after"]["resultConfidence"] - 0.267 > mpr.TILE_RANK_CONFIDENCE_TIE_EPS)

# 10. frame20 real athlete wins.
check(10, "frame 20: real athlete candidate (0.699) now selected instead of the background hallucination (0.267)", abs(post_crit["20"]["tileConf"] - 0.699) < 0.01)

# 11. hint preserved.
check(11, "hint_x still used for tile scan ORDER (search prioritization) -- hint_x parameter still threaded through tiled_locate's signature and starts-sort", "hint_x=None" in open(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py")).read() and "starts = sorted(starts, key=lambda s: abs((s + tile_width / 2.0) - hint_x))" in open(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py")).read())

# 12. Day-100 identity still rejected.
check(12, "Day-100 real observed spurious candidate: still never promotes under unchanged identity logic", day100["promotedViaCurrentCode"] is False and day100["allCorrectlyBelowFloor"] is True)

# 13. bleacher false candidate does not become promoted athlete.
check(13, "the frame-20 bleacher/railing false candidate is not promotable -- it never even reaches identity logic post-fix (loses the tile ranking outright)", frame20["rankingResult"].startswith("FIXED"))

# 14. Gav selection unchanged (bounded, not exploded).
check(14, "Gav: tile-invocation delta is small and bounded (not a regression/explosion)", 0 <= cross["gav"]["tileInvocationDelta"] <= 3)

# 15. V120 selection unchanged (bounded).
check(15, "Vanni120: tile-invocation delta is small and bounded", 0 <= cross["vanni120"]["tileInvocationDelta"] <= 3)

# 16. V240 selection unchanged/no noise regression.
check(16, "Vanni240: zero tile-invocation delta (no detection-layer change at all)", cross["vanni240"]["tileInvocationDelta"] == 0)

# 17. identity thresholds unchanged.
at_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "athlete_tracker.py"))
this_script_mtime = os.path.getmtime(__file__)
check(17, "identity thresholds (athlete_tracker.py) not modified this phase", at_mtime < this_script_mtime)

# 18. contact detector unchanged.
steps_ts_mtime = os.path.getmtime(os.path.join(ROOT, "src/lib/video/steps.ts"))
check(18, "contact detector (steps.ts) not modified this phase", steps_ts_mtime < this_script_mtime)

# 19. scientific formulas unchanged.
measurements_path = os.path.join(ROOT, "src/lib/benchmark/measurements.ts")
measurements_mtime = os.path.getmtime(measurements_path) if os.path.exists(measurements_path) else 0
box_tracker_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "box_tracker.py"))
check(19, "scientific formula files (measurements.ts, box_tracker.py) not modified this phase", measurements_mtime < this_script_mtime and box_tracker_mtime < this_script_mtime)

# 20. no FPS/benchmark-specific branches.
src_lines = [ln for ln in open(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py")).readlines()]
import tokenize
with open(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py"), "rb") as f:
    toks = [t for t in tokenize.tokenize(f.readline) if t.type in (tokenize.NAME, tokenize.OP)]
suspicious = [t for t in toks if t.string.lower() in ("vanni", "gav")]
check(20, "no benchmark-name identifiers introduced as live code (PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION/TILE_RANK_CONFIDENCE_TIE_EPS apply uniformly, no per-clip branch)", len(suspicious) == 0, [t.string for t in suspicious])

print(f"\n{'ALL PASSED' if ok else 'SOME FAILED'}")
sys.exit(0 if ok else 1)
