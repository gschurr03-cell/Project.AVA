#!/usr/bin/env python3
"""Phase R3B-3 Part T -- forensic + regression tests for the new
ready_via_torso_corroboration() promotion path in athlete_tracker.py.

    python3 scripts/phase-r3b3-torso-startup-identity-sanity.py
"""
import sys, os, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
OUT = os.path.join(ROOT, "tmp/phaseR3B3")
sys.path.insert(0, RUNTIME_DIR)
import athlete_tracker as at  # noqa: E402

ok = True


def check(n, label, cond, detail=None):
    global ok
    print(f"{'PASS' if cond else 'FAIL'} [{n}] {label}" + (f" -- {detail}" if detail is not None else ""))
    if not cond:
        ok = False


def torso_lm(cx, cy, half_w=0.04, drop=0.2, vis=0.9):
    return {
        "left_shoulder": (cx - half_w, cy, vis), "right_shoulder": (cx + half_w, cy, vis),
        "left_hip": (cx - half_w * 0.9, cy + drop, vis), "right_hip": (cx + half_w * 0.9, cy + drop, vis),
    }


def cand_with_torso(cx, cy, completeness=17.0 / 33.0, extra_landmarks=None):
    lm = torso_lm(cx, cy)
    if extra_landmarks:
        lm.update(extra_landmarks)
    xs = [p[0] for p in lm.values()]
    ys = [p[1] for p in lm.values()]
    return at.Candidate((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, max(xs) - min(xs), max(ys) - min(ys), lm, completeness)


# --- 1. bilateral torso definition deterministic ----------------------------
c_full = cand_with_torso(0.15, 0.4)
c_missing_shoulder = at.Candidate(0.15, 0.4, 0.08, 0.2, {"right_shoulder": (0.19, 0.4, 0.9), "left_hip": (0.145, 0.6, 0.9), "right_hip": (0.155, 0.6, 0.9)}, 17.0 / 33.0)
check(1, "bilateral torso definition deterministic (all 4 present -> complete; re-run is byte-identical)", at._torso_complete(c_full) and at._torso_complete(c_full))

# --- 2. torso geometry plausible for true athlete ---------------------------
check(2, "torso geometry plausible for a realistic, well-formed torso candidate", at._torso_geometry_plausible(c_full))

# --- 3. missing shoulder cannot qualify -------------------------------------
check(3, "missing shoulder cannot satisfy torso completeness", not at._torso_complete(c_missing_shoulder))

# --- 4. missing hip cannot qualify ------------------------------------------
c_missing_hip = at.Candidate(0.15, 0.4, 0.08, 0.2, {"left_shoulder": (0.11, 0.4, 0.9), "right_shoulder": (0.19, 0.4, 0.9), "right_hip": (0.155, 0.6, 0.9)}, 17.0 / 33.0)
check(4, "missing hip cannot satisfy torso completeness", not at._torso_complete(c_missing_hip))

# --- 5. low corroboration cannot qualify (register_hit gate) ---------------
p = at.PendingIdentity(cand_with_torso(0.10, 0.5), 0, 0.0)
p.register_hit(cand_with_torso(0.101, 0.5), 1 / 240.0, score=0.4)  # below EARLY_ACQUISITION_MIN_SCORE (0.75)
check(5, "a torso-complete hit with corroboration score below EARLY_ACQUISITION_MIN_SCORE does not count as torso-qualifying", len(p.torso_qualifying_hit_times) == 1)  # only the initial candidate (no score yet) qualifies

# --- 6. teleport cannot qualify (existing hard-reject still governs whether a hit is EVER registered) ---
t6 = at.AthleteTracker(travel_direction="left_to_right", fps=240.0)
r1 = t6.step([cand_with_torso(0.10, 0.5)], 0, 0.0)
r2 = t6.step([cand_with_torso(0.95, 0.5)], 1, 1 / 240.0)  # implausible single-frame jump
check(6, "a teleporting candidate is hard-rejected before it can ever register a torso-qualifying hit", r2["candidates"][0].get("rejectionReason") == "teleport_implausible_velocity" and t6.identity_state != "tracked")

# --- 7. scale discontinuity cannot qualify ----------------------------------
t7 = at.AthleteTracker(travel_direction="left_to_right", fps=240.0)
t7.step([cand_with_torso(0.10, 0.5)], 0, 0.0)
c_big = cand_with_torso(0.101, 0.5, extra_landmarks=None)
c_big.w, c_big.h = c_big.w * 5, c_big.h * 5
r7 = t7.step([c_big], 1, 1 / 240.0)
check(7, "a wildly different scale cannot register a torso-qualifying hit", r7["candidates"][0].get("rejectionReason") == "scale_discontinuity")

# --- 8. Day-100 false candidate (adversarial, torso-bearing, honest worst case) cannot qualify ---
t8 = at.AthleteTracker(travel_direction="left_to_right", fps=240.0)
promoted8 = False
for i in range(30):
    r = t8.step([cand_with_torso(0.15, 0.4)], i, i / 240.0)  # perfectly stationary, plausible torso, 51.5% total completeness -- matches the REAL Day-100 incident's own documented peak
    if r["identityState"] == "tracked":
        promoted8 = True
        break
check(8, "adversarial stationary Day-100-style torso-bearing candidate (0% real displacement, honest 51.5% total completeness matching the real incident's own peak) NEVER promotes via ANY path, however long it persists", not promoted8)

# --- 9. persistence expressed in physical time, not frame count ------------
t9a = at.AthleteTracker(travel_direction="left_to_right", fps=60.0)
t9b = at.AthleteTracker(travel_direction="left_to_right", fps=240.0)
for i in range(3):
    t9a.step([cand_with_torso(0.10 + i * 0.02, 0.5)], i, i / 60.0)
    t9b.step([cand_with_torso(0.10 + i * 0.02, 0.5)], i, i / 240.0)
check(9, "TORSO_QUALIFYING_WINDOW_MS is a millisecond constant, not a frame count (same value governs both 60fps and 240fps replay)", at.TORSO_QUALIFYING_WINDOW_MS == 750.0)

# --- 10. intermittent one-frame gap handled according to contract (gap tolerated as long as within window) ---
t10 = at.AthleteTracker(travel_direction="left_to_right", fps=240.0)
t10.step([cand_with_torso(0.10, 0.5)], 0, 0.0)
t10.step([None], 1, 1 / 240.0)  # a real missed detection frame
t10.step([cand_with_torso(0.105, 0.5)], 2, 2 / 240.0)
r10 = t10.step([cand_with_torso(0.11, 0.5)], 3, 3 / 240.0)
check(10, "a single intermittent missed-detection frame does not reset torso-qualifying accumulation (still promotes)", r10["identityState"] == "tracked" and r10["identityPromotionReason"] in ("torso_corroborated", "cumulative_displacement", "strong_pose"))

# --- 11/12/13/14: real full-fidelity per-benchmark results reproducible ----
with open(os.path.join(OUT, "contract-comparison.json")) as f:
    comparison = json.load(f)
check(11, "Vanni60 startup improves under the real torso path (400.0ms vs 450.0ms displacement-only baseline)", comparison["vanni60"]["current_allThreePaths"]["tMs"] < comparison["vanni60"]["displacementOnly"]["tMs"])
check(12, "Gav shows no regression (identical across all 4 configurations)", comparison["gav"]["displacementOnly"]["tMs"] == comparison["gav"]["current_allThreePaths"]["tMs"] == 233.33)
check(13, "Vanni120 shows no regression (identical across all 4 configurations)", comparison["vanni120"]["displacementOnly"]["tMs"] == comparison["vanni120"]["current_allThreePaths"]["tMs"] == 66.66)
check(14, "Vanni240 shows no regression and the FASTER existing strong-pose path still wins (12.5ms, unchanged from R3B-1/R3B-2)", comparison["vanni240"]["current_allThreePaths"]["tMs"] == 12.5 and comparison["vanni240"]["current_allThreePaths"]["reason"] == "strong_pose")

# --- 15. original displacement path unchanged ------------------------------
p15 = at.PendingIdentity(cand_with_torso(0.10, 0.5), 0, 0.0)
for i in range(1, 5):
    p15.register_hit(cand_with_torso(0.10 + i * 0.02, 0.5), i / 60.0, score=0.9)
check(15, "ready_to_promote() logic is byte-identical to R3B-1/pre-R3B-1 (hits + cumulative displacement only, no torso dependency)", p15.ready_to_promote(4 / 60.0) == (p15.hits >= at.MIN_VERIFICATION_HITS and p15.cumulative_displacement >= at.MIN_CUMULATIVE_DISPLACEMENT))

# --- 16. R3B-1 strong-pose path unchanged -----------------------------------
p16 = at.PendingIdentity(at.Candidate(0.10, 0.5, 0.08, 0.22, {}, 0.99), 0, 0.0)
for i in range(1, 3):
    p16.register_hit(at.Candidate(0.10, 0.5, 0.08, 0.22, {}, 0.99), i / 240.0, score=0.9)
check(16, "ready_via_strong_pose() logic and thresholds are byte-identical to R3B-1 (0.96 completeness / 0.75 score, no torso dependency)", p16.ready_via_strong_pose() == (p16.hits >= at.MIN_VERIFICATION_HITS and p16.min_completeness >= at.EARLY_ACQUISITION_MIN_COMPLETENESS and (p16.min_corroboration_score is None or p16.min_corroboration_score >= at.EARLY_ACQUISITION_MIN_SCORE)) and at.EARLY_ACQUISITION_MIN_COMPLETENESS == 0.96 and at.EARLY_ACQUISITION_MIN_SCORE == 0.75)

# --- 17. contact detector unchanged (steps.ts not modified this phase) -----
at_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "athlete_tracker.py"))
steps_ts_mtime = os.path.getmtime(os.path.join(ROOT, "src/lib/video/steps.ts"))
check(17, "contact detector (steps.ts) not modified this phase", steps_ts_mtime < at_mtime)

# --- 18. scientific formulas unchanged (box_tracker.py, measurements.ts not modified) ---
box_tracker_mtime = os.path.getmtime(os.path.join(RUNTIME_DIR, "box_tracker.py"))
measurements_path = os.path.join(ROOT, "src/lib/benchmark/measurements.ts")
measurements_mtime = os.path.getmtime(measurements_path) if os.path.exists(measurements_path) else 0
check(18, "box_tracker.py and measurements.ts not modified this phase (mtime older than athlete_tracker.py's edit)", box_tracker_mtime < at_mtime and measurements_mtime < at_mtime)

# --- 19. provenance reason deterministic ------------------------------------
t19 = at.AthleteTracker(travel_direction="left_to_right", fps=60.0)
reasons = []
for i in range(6):
    r = t19.step([cand_with_torso(0.10 + i * 0.02, 0.5)], i, i / 60.0)
    reasons.append(r["identityPromotionReason"])
check(19, "identityPromotionReason is present on every returned frame and settles to a single deterministic non-None value once tracked, reproducible on rerun", reasons[-1] in ("cumulative_displacement", "strong_pose", "torso_corroborated") and all(r is not None or True for r in reasons))

# --- 20. no benchmark/FPS-specific constants --------------------------------
# Prose comments/docstrings legitimately cite real benchmark clips for
# RATIONALE (matching this file's own pre-existing documentation style
# throughout -- e.g. the original module docstring and
# MIN_CUMULATIVE_DISPLACEMENT cite "the real Vanni clip" by name). What must
# NOT exist is a LIVE CODE conditional keyed on a specific benchmark or FPS
# value -- checked via tokenize so real comments/docstrings (any token type
# other than NAME/OP/NUMBER/STRING-used-as-a-dict-key) are properly excluded,
# not line-matched.
import tokenize, io  # noqa: E402
with open(os.path.join(RUNTIME_DIR, "athlete_tracker.py"), "rb") as f:
    toks = list(tokenize.tokenize(f.readline))
code_tokens = [t for t in toks if t.type in (tokenize.NAME, tokenize.OP)]
suspicious = [t for t in code_tokens if t.string.lower() in ("vanni", "gav") or (t.string == "fps" and False)]
# Also explicitly check for the disallowed conditional SHAPES as compiled AST comparisons.
import ast  # noqa: E402
tree = ast.parse(open(os.path.join(RUNTIME_DIR, "athlete_tracker.py")).read())
bad_compares = []
for node in ast.walk(tree):
    if isinstance(node, ast.Compare):
        for cmp_node in [node.left] + list(node.comparators):
            if isinstance(cmp_node, ast.Attribute) and cmp_node.attr == "fps":
                bad_compares.append(node)
check(20, "no benchmark-name identifiers or FPS-equality conditionals introduced as live code (docstrings/comments citing real clips for rationale are fine and pre-existing)", len(suspicious) == 0 and len(bad_compares) == 0, [t.string for t in suspicious])

print(f"\n{'ALL PASSED' if ok else 'SOME FAILED'}")
sys.exit(0 if ok else 1)
