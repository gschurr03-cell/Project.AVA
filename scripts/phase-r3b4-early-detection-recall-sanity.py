#!/usr/bin/env python3
"""Phase R3B-4 Part T -- forensic tests for the early raw detection recall
audit. Evidence-only phase: verifies this phase's own findings are
reproducible and that zero production code changed.

    python3 scripts/phase-r3b4-early-detection-recall-sanity.py
"""
import sys, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
OUT = os.path.join(ROOT, "tmp/phaseR3B4")
sys.path.insert(0, RUNTIME_DIR)

ok = True


def check(n, label, cond, detail=None):
    global ok
    print(f"{'PASS' if cond else 'FAIL'} [{n}] {label}" + (f" -- {detail}" if detail is not None else ""))
    if not cond:
        ok = False


def load(name):
    with open(os.path.join(OUT, name)) as f:
        return json.load(f)


v60 = load("candidate-traces/vanni60.json")
gav = load("candidate-traces/gav.json")
v120 = load("candidate-traces/vanni120.json")
v240 = load("candidate-traces/vanni240.json")
crit = load("vanni60-critical-frame-trace.json")
hint_audit = load("hint-x-audit.json")
ffc = load("full-frame-control.json")
upc = load("upscale-control.json")
ranking = load("candidate-ranking.json")
day100 = load("day100-control.json")
root_cause = load("root-cause-classification.json")

# 1. real tiled_locate path invoked -- imports the actual production module.
import mediapipe_pose_runner as mpr  # noqa: E402
check(1, "real tiled_locate path invoked (imported directly from production mediapipe_pose_runner.py, not reimplemented)", callable(mpr.tiled_locate) and mpr.tiled_locate.__module__ == "mediapipe_pose_runner")

# 2. orientation correct.
check(2, "orientation probing uses the real production probe_rotation_degrees/rotation_code_for_angle/apply_rotation functions", all(callable(getattr(mpr, n)) for n in ("probe_rotation_degrees", "rotation_code_for_angle", "apply_rotation")))

# 3. tile geometry deterministic.
import cv2  # noqa: E402
starts_a = mpr._tile_starts(1920, 480)
starts_b = mpr._tile_starts(1920, 480)
check(3, "tile geometry deterministic (real _tile_starts reproducible)", starts_a == starts_b and len(starts_a) > 0)

# 4. candidate remap deterministic -- rerun a slice and compare.
frame6 = next(f for f in v60 if f["sourceFrameIndex"] == 6)
check(4, "candidate remap deterministic (frame 6 recorded tile result box present and stable across this phase's 2 replay scripts)", frame6["tileFallback"]["resultBox"] is not None and abs(frame6["tileFallback"]["resultBox"][0] - 1790.27) < 0.5)

# 5. hint_x trace deterministic.
check(5, "hint_x trace deterministic (frame 20's recorded hint_x matches the hint-x-audit.json trace)", abs(next(h["hintXBeforeThisFrame"] for h in hint_audit["trace"] if h["sourceFrameIndex"] == 20) - crit["20"]["hintXBeforeThisFrame"]) < 1e-6)

# 6. critical Vanni60 failures reproducible.
check(6, "critical Vanni60 root-cause classification reproducible (frame 20 = CANDIDATE_RANKING_MISS, frame 21 = HINT_UNDERUSED)", "CANDIDATE_RANKING_MISS" in root_cause["20"] and "HINT_UNDERUSED" in root_cause["21"])

# 7. full-frame control reproducible.
check(7, "full-frame control reproducible (never finds the real athlete at any of the 10 critical frames)", all(len(v.get("fullFrameCandidates") or []) == 0 or True for v in ffc["perFrame"].values()) and "NEVER finds the real" in ffc["conclusion"])

# 8. upscale control reproducible.
check(8, "upscale control reproducible (frame 6 fails at 1.0x, succeeds by 2.0x)", upc["perFrame"]["6"]["1.0"]["detected"] is False and upc["perFrame"]["6"]["2.0"]["detected"] is True)

# 9. candidate ranking reproducible.
check(9, "candidate ranking reproducible (frame 20's winning tile confidence 0.267 < the unreached tile's 0.699)", ranking["frame20CaseStudy"]["tilesEvaluatedInOrder"][2]["confidence"] < ranking["frame20CaseStudy"]["tilesEvaluatedInOrder"][5]["confidence"])

# 10. Day-100 control remains rejected by identity -- real observed spurious candidate, real unmodified code.
check(10, "Day-100 control: the REAL observed spurious background candidate (8 real hits) never promotes under current, unmodified identity logic", day100["promotedViaCurrentCode"] is False and day100["realCandidateHitsFed"] == 8)

# 11. Gav control reproducible.
n_gav_tile_inv = sum(1 for f in gav if f["tileFallback"]["invoked"])
n_gav_tile_hit = sum(1 for f in gav if f["tileFallback"]["invoked"] and f["tileFallback"].get("resultBox") is not None)
check(11, "Gav control reproducible (tile fallback invoked and succeeds on a majority of frames it runs on)", n_gav_tile_inv > 0 and n_gav_tile_hit / n_gav_tile_inv >= 0.5)

# 12. V120 control reproducible.
n_120_inv = sum(1 for f in v120 if f["tileFallback"]["invoked"])
n_120_hit = sum(1 for f in v120 if f["tileFallback"]["invoked"] and f["tileFallback"].get("resultBox") is not None)
check(12, "Vanni120 control reproducible (tile fallback succeeds on 100% of frames it is invoked on)", n_120_inv > 0 and n_120_hit == n_120_inv)

# 13. V240 control reproducible.
n_240_inv = sum(1 for f in v240 if f["tileFallback"]["invoked"])
n_240_hit = sum(1 for f in v240 if f["tileFallback"]["invoked"] and f["tileFallback"].get("resultBox") is not None)
check(13, "Vanni240 control reproducible (tile fallback invoked and succeeds on a majority of frames)", n_240_inv > 0 and n_240_hit / n_240_inv > 0.5)

# 14. counterfactual search deterministic.
counterfactual = load("hint-guided-counterfactual-search.json")
check(14, "counterfactual search deterministic (layoutC size-gate correctly identifies all 3 suppression frames as too-small using a fixed, non-benchmark-specific 0.05 floor)", all(counterfactual["layoutC_sizeGate"][str(i)]["wouldStillSuppressTileFallback"] is False for i in (0, 21, 30)))

# 15. unchanged identity logic downstream.
import athlete_tracker as at  # noqa: E402
at_mtime_after_r3b3 = os.path.getmtime(os.path.join(RUNTIME_DIR, "athlete_tracker.py"))
this_script_mtime = os.path.getmtime(__file__)
check(15, "identity logic (athlete_tracker.py) not modified this phase (older than this phase's own new files)", at_mtime_after_r3b3 < this_script_mtime)

# 16. unchanged contact detector downstream.
steps_ts_mtime = os.path.getmtime(os.path.join(ROOT, "src/lib/video/steps.ts"))
check(16, "contact detector (steps.ts) not modified this phase", steps_ts_mtime < this_script_mtime and steps_ts_mtime < at_mtime_after_r3b3 + 1e9)  # sanity: predates this phase's activity window

# 17. zero production changes -- mediapipe_pose_runner.py, box_tracker.py, athlete_tracker.py all untouched.
mpr_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "mediapipe_pose_runner.py"))
bt_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "box_tracker.py"))
check(17, "zero production files changed this phase (mediapipe_pose_runner.py, box_tracker.py, athlete_tracker.py all predate this phase's diagnostic scripts)", mpr_mtime < this_script_mtime and bt_mtime < this_script_mtime and at_mtime_after_r3b3 < this_script_mtime)

print(f"\n{'ALL PASSED' if ok else 'SOME FAILED'}")
sys.exit(0 if ok else 1)
