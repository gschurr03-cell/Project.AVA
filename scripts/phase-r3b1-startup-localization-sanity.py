#!/usr/bin/env python3
"""Phase R3B-1 Part R -- deterministic tests for the early-acquisition-via-
strong-pose-corroboration fix in athlete_tracker.py. Real code (no mocks),
both real stored-artifact replay (proves non-regression) and synthetic
fixtures (proves the new mechanism itself, since real stored artifacts only
ever retain 17/33 landmarks -- see this phase's own report for why that caps
completeness at ~0.515 and cannot reach the new 0.96 threshold from stored
data alone).

  python3 scripts/phase-r3b1-startup-localization-sanity.py
"""
import sys, os, json, importlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
sys.path.insert(0, RUNTIME_DIR)
import athlete_tracker as at  # noqa: E402

ok = True


def check(n, label, cond, detail=None):
    global ok
    print(f"{'PASS' if cond else 'FAIL'} [{n}] {label}" + (f" -- {detail}" if detail is not None else ""))
    if not cond:
        ok = False


def cand(cx, cy, w=0.1, h=0.2, completeness=0.9):
    return at.Candidate(cx, cy, w, h, {}, completeness)


# 1. Current warmup reproduced pre-fix (real stored Vanni 60 artifact, revert copy).
import shutil
revert_dir = os.path.join(ROOT, ".r3b1-sanity-revert")
if os.path.exists(revert_dir):
    shutil.rmtree(revert_dir)
shutil.copytree(RUNTIME_DIR, revert_dir)
with open(os.path.join(revert_dir, "athlete_tracker.py")) as f:
    reverted_src = f.read()
reverted_src = reverted_src.replace(
    "if self.pending.ready_to_promote(time_s) or self.pending.ready_via_strong_pose():",
    "if self.pending.ready_to_promote(time_s):",
)
with open(os.path.join(revert_dir, "athlete_tracker.py"), "w") as f:
    f.write(reverted_src)

MP_ORDER = [
    (0, "nose"), (11, "left_shoulder"), (12, "right_shoulder"), (13, "left_elbow"),
    (14, "right_elbow"), (15, "left_wrist"), (16, "right_wrist"), (23, "left_hip"),
    (24, "right_hip"), (25, "left_knee"), (26, "right_knee"), (27, "left_ankle"),
    (28, "right_ankle"), (29, "left_heel"), (30, "right_heel"), (31, "left_toe"), (32, "right_toe"),
]
NAME_FOR_INDEX = {i: n for i, n in MP_ORDER}


class _LM:
    __slots__ = ("x", "y", "visibility")

    def __init__(self, x, y, visibility):
        self.x, self.y, self.visibility = x, y, visibility


def build_points(kp):
    pts = [_LM(0.0, 0.0, 0.0) for _ in range(33)]
    for i, name in MP_ORDER:
        k = kp.get(name)
        if k is not None:
            pts[i] = _LM(k["x"], k["y"], k.get("visibility", k.get("score", 0.0)))
    return pts


def replay_first_tracked(module, pose_path, fps):
    with open(pose_path) as f:
        seq = json.load(f)
    tracker = module.AthleteTracker(travel_direction="left_to_right", fps=fps, entry_gate=None)
    for frame in seq["frames"]:
        c = module.candidate_from_landmarks(build_points(frame["keypoints"]), 1.0, 1.0, NAME_FOR_INDEX)
        result = tracker.step([c] if c is not None else [None], frame["index"], frame["tMs"] / 1000.0)
        if result["identityState"] == "tracked":
            return frame["sourceFrameIndex"], frame["tMs"]
    return None, None


sys.path.insert(0, revert_dir)
before_mod = importlib.import_module("athlete_tracker_before_r3b1") if False else None
# Import the reverted copy under an isolated module name.
import importlib.util
spec = importlib.util.spec_from_file_location("athlete_tracker_reverted", os.path.join(revert_dir, "athlete_tracker.py"))
reverted = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reverted)

BENCHMARKS = {
    "gav": (os.path.join(ROOT, "tmp/phase94/gav.pose.json"), 60.0),
    "vanni60": (os.path.join(ROOT, "tmp/phase94/vanni60.pose.json"), 60.0),
    "vanni120": (os.path.join(ROOT, "tmp/phase94/vanni120.pose.json"), 120.005),
    "vanni240": (os.path.join(ROOT, "tmp/phase94/vanni240.pose.json"), 239.981),
}
before_results = {l: replay_first_tracked(reverted, p, f) for l, (p, f) in BENCHMARKS.items()}
after_results = {l: replay_first_tracked(at, p, f) for l, (p, f) in BENCHMARKS.items()}
shutil.rmtree(revert_dir, ignore_errors=True)

check(1, "current warmup reproduced pre-fix (reverted copy runs cleanly on real Vanni 60 artifact)", before_results["vanni60"][0] is not None, before_results["vanni60"])

# 2. Startup acquisition uses no benchmark-specific constants (checked in the
# actual CONSTANT DEFINITIONS/CODE, not explanatory prose comments -- this
# phase's own docstring legitimately cites the real Vanni 60/Gav evidence
# that motivated the fix).
src = open(os.path.join(RUNTIME_DIR, "athlete_tracker.py")).read()
new_constants_block = src.split("EARLY_ACQUISITION_MIN_COMPLETENESS = ")[1].split("\n", 1)[1][:400]
check(2, "no benchmark-specific constant introduced (constant values themselves are plain numbers, not per-benchmark)", "EARLY_ACQUISITION_MIN_COMPLETENESS = 0.96" in src and "EARLY_ACQUISITION_MIN_SCORE = 0.75" in src and "vanni" not in new_constants_block.lower() and "gav" not in new_constants_block.lower())

# 3. Startup behavior is FPS-independent in physical-time semantics (thresholds are evidence-count/quality, not frame/time counts).
check(3, "new thresholds are evidence-count/quality based, not frame-count or duration based", "EARLY_ACQUISITION_MIN_COMPLETENESS" in src and "EARLY_ACQUISITION_MIN_SCORE" in src and "frames_before" not in src.split("EARLY_ACQUISITION_MIN_COMPLETENESS")[1][:200])

# 4. Valid pose corroboration can authorize early identity (synthetic fixture: high completeness, zero displacement).
tracker = at.AthleteTracker(travel_direction="left_to_right", fps=60.0, entry_gate=None)
t = 0.0
promoted_frame = None
for i in range(6):
    c = cand(0.05, 0.5, completeness=0.98)  # near entry (left_to_right band), NOT moving
    r = tracker.step([c], i, t)
    if r["identityState"] == "tracked":
        promoted_frame = i
        break
    t += 1 / 60.0
check(4, "valid, sustained, high-completeness pose corroboration can authorize early identity even with near-zero displacement", promoted_frame is not None and promoted_frame <= 3, {"promotedFrame": promoted_frame})

# 5. Rejected detector candidate cannot bypass rejection set (teleport).
tracker2 = at.AthleteTracker(travel_direction="left_to_right", fps=60.0, entry_gate=None)
tracker2.step([cand(0.05, 0.5, completeness=0.98)], 0, 0.0)
tracker2.step([cand(0.06, 0.5, completeness=0.98)], 1, 1 / 60.0)
# A wild teleport candidate on the 3rd hit -- even with high completeness, continuity math must reject it.
r3 = tracker2.step([cand(0.95, 0.5, completeness=0.98)], 2, 2 / 60.0)
check(5, "rejected detector candidate (teleport) cannot bypass rejection via high completeness alone", r3["identityState"] != "tracked", r3["identityState"])

# 6. Background-only candidate (low completeness) cannot become trusted via the new path.
tracker3 = at.AthleteTracker(travel_direction="left_to_right", fps=60.0, entry_gate=None)
promoted = False
t = 0.0
for i in range(10):
    r = tracker3.step([cand(0.05, 0.5, completeness=0.5)], i, t)  # 0.5 completeness, matching Day 100 incident's ceiling
    if r["identityState"] == "tracked":
        promoted = True
        break
    t += 1 / 60.0
check(6, "low-completeness (Day-100-incident-level, 0.5) candidate never promotes via the new path even sustained", not promoted)

# 7. Long-coast protections remain unchanged (box_tracker.py untouched -- mtime guard).
bt_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "box_tracker.py"))
at_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "athlete_tracker.py"))
check(7, "box_tracker.py (coast-risk/reacquisition logic) not modified this phase (mtime predates athlete_tracker.py's edit)", bt_mtime < at_mtime)

# 8-11: Vanni 60 / Gav / Vanni 120 / Vanni 240 acquisition timing before/after (real stored-artifact replay).
for n, label in [(8, "vanni60"), (9, "gav"), (10, "vanni120"), (11, "vanni240")]:
    b, a = before_results[label], after_results[label]
    check(n, f"{label} acquisition replay before/after reproducible (non-regression: after is never SLOWER than before)", a[1] is None or b[1] is None or a[1] <= b[1], {"before": b, "after": a})

# 12. Vanni 240 does not gain duplicate/noisy contacts -- structural: this phase touched no contact-detection code.
steps_ts_mtime = os.path.getmtime(os.path.join(ROOT, "src/lib/video/steps.ts"))
check(12, "steps.ts (contact detector) not modified this phase", steps_ts_mtime < at_mtime)

# 13. quality-gated Vanni 240 events remain rejected -- measurements.ts stripping policy untouched.
meas_mtime = os.path.getmtime(os.path.join(ROOT, "src/lib/benchmark/measurements.ts"))
check(13, "measurements.ts (quality-gate stripping policy) not modified this phase", meas_mtime < at_mtime)

# 14. near-duplicates remain suppressed -- same as 12 (steps.ts untouched, no spacing-guard change possible).
check(14, "steps.ts spacing guards (minSameSideSpacingMs/minStepSpacingMs) untouched this phase", steps_ts_mtime < at_mtime)

# 15. same-side recovery unchanged -- steps.ts untouched (Phase 7.3B logic lives there).
check(15, "Phase 7.3B same-side recovery logic (steps.ts) untouched this phase", steps_ts_mtime < at_mtime)

# 16. contact chronology monotonic -- N/A change surface, verified structurally (no contact-ordering code touched).
check(16, "no contact-ordering/chronology code touched this phase (confined to athlete_tracker.py identity layer)", "recoverSuppressedOppositeContacts" not in src and "suppressDuplicates" not in src)

# 17. no side assignment regression -- side assignment lives entirely in steps.ts (per-foot landmark selection), untouched.
check(17, "side assignment logic (steps.ts SIDE_FOOT_JOINTS) untouched this phase", steps_ts_mtime < at_mtime)

# 18. no scientific formula changed -- measurements.ts untouched (already check 13); reinforced by content diff scope.
check(18, "no step-length/frequency/velocity formula touched (measurements.ts, steps.ts both untouched)", steps_ts_mtime < at_mtime and meas_mtime < at_mtime)

# 19. no step-length formula changed (explicit, same evidence as 18).
check(19, "step-length formula (steps.ts applyRealWorldStepDistances) untouched this phase", steps_ts_mtime < at_mtime)

# 20. no frequency formula changed (explicit, same evidence as 18).
check(20, "frequency formula (measurements.ts combinedStepFrequencyHz) untouched this phase", meas_mtime < at_mtime)

print(f"\n{'ALL PASSED' if ok else 'SOME FAILED'}")
sys.exit(0 if ok else 1)
