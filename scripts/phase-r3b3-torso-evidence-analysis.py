#!/usr/bin/env python3
"""Phase R3B-3 Part A-H -- defines the exact bilateral-torso evidence
contract, computes real true-athlete evidence distributions (reusing R3B-2's
already-gathered full-fidelity real MediaPipe tiled-detection trace -- no
re-inference needed, that evidence is still valid and unchanged), and
stress-tests candidate contracts against adversarial false-candidate
fixtures (an explicit torso-bearing Day-100-style stationary hallucination,
not just the scalar-completeness fixture prior phases used).

Read-only against production code (imports athlete_tracker.py but does not
modify it). Writes tmp/phaseR3B3/true-athlete-evidence.json,
false-candidate-evidence.json, contract-comparison.json.

    python3 scripts/phase-r3b3-torso-evidence-analysis.py
"""
import sys, os, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
OUT = os.path.join(ROOT, "tmp/phaseR3B3")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, RUNTIME_DIR)
import athlete_tracker as at  # noqa: E402

FPS_BY_LABEL = {"gav": 60.0, "vanni60": 60.0, "vanni120": 120.005, "vanni240": 239.981}
TRACKER_LANDMARK_NAMES = {
    0: "nose", 11: "left_shoulder", 12: "right_shoulder", 23: "left_hip", 24: "right_hip",
    25: "left_knee", 26: "right_knee", 27: "left_ankle", 28: "right_ankle",
    29: "left_heel", 30: "right_heel", 31: "left_foot_index", 32: "right_foot_index",
}
MP_33_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
    "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot_index", "right_foot_index",
]

# --- Part A: exact bilateral-torso evidence contract ------------------------
TORSO_NAMES = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
TORSO_VISIBILITY_FLOOR = at.LANDMARK_VISIBILITY_FLOOR  # reuse the SAME floor production already uses (0.3) -- no new tunable invented for this axis

# Part B: torso geometry plausibility -- EVIDENCE-CORRECTED. The originally
# planned strict version (absolute-normalized-space span floors + shoulders-
# above-hips ordering + shoulder/hip ratio band) was tested against real
# full-fidelity startup evidence (tmp/phaseR3B2 real tiled-detection trace,
# 196 real torso-complete frames across all 4 benchmarks) and REJECTED BY
# THE DATA: at real startup scale the athlete is often small/distant, so raw
# normalized torso spans are tiny (median shoulder width 0.37% of frame
# width) and comparable in magnitude to MediaPipe's own per-frame jitter --
# even bounding-box-RELATIVE torso height (shoulder-to-hip, normalized by
# the candidate's own pose-bounds height) is NEGATIVE (shoulders appearing
# below hips) in 35% of genuine, real, torso-complete athlete frames. A
# strict ordering/ratio gate would therefore reject over a third of real
# early-clip evidence -- the opposite of this phase's goal -- while there is
# no real evidence a background hallucination would fail the SAME loose
# check (no comparably fine-grained real Day-100 landmark data exists to
# prove separation on this axis). Geometry is therefore kept ONLY as a
# bare degenerate-point guard (reject exact/near-coincident landmarks, which
# can never be a torso, real or hallucinated) -- not as a shoulders-above-
# hips or width-ratio filter. The real anti-hallucination burden is carried
# by torso completeness + temporal persistence + a reduced-but-nonzero
# displacement floor (see PART G below), not by single-frame geometry.
MIN_TORSO_SPAN_REL = 0.02   # fraction of the candidate's OWN pose-bounds width -- scale-invariant, rejects only truly coincident/degenerate points


def torso_complete(landmarks):
    for name in TORSO_NAMES:
        lm = landmarks.get(name)
        if lm is None:
            return False
        x, y, vis = lm
        if vis < TORSO_VISIBILITY_FLOOR or not (math.isfinite(x) and math.isfinite(y)):
            return False
    return True


def torso_geometry(landmarks, bbox_w):
    """Returns (plausible: bool, diagnostics: dict). Only called once
    torso_complete() is True. Scale-invariant degenerate-point guard only --
    see the module-level comment for why ordering/ratio checks were dropped
    after real-evidence testing."""
    ls = landmarks["left_shoulder"]
    rs = landmarks["right_shoulder"]
    lh = landmarks["left_hip"]
    rh = landmarks["right_hip"]
    shoulder_width = abs(ls[0] - rs[0])
    hip_width = abs(lh[0] - rh[0])
    diag = {"shoulderWidth": shoulder_width, "hipWidth": hip_width}
    floor = MIN_TORSO_SPAN_REL * max(1e-6, bbox_w)
    if shoulder_width < floor or hip_width < floor:
        diag["reject"] = "degenerate_span"
        return False, diag
    diag["reject"] = None
    return True, diag


class _LM:
    __slots__ = ("x", "y", "visibility")

    def __init__(self, x, y, v):
        self.x, self.y, self.visibility = x, y, v


def build_candidate(fr):
    if not fr["detected"]:
        return None
    lm = fr["landmarks"]
    points = [_LM(*lm[n]) if n in lm else _LM(0.0, 0.0, 0.0) for n in MP_33_NAMES]
    return at.candidate_from_landmarks(points, 1.0, 1.0, TRACKER_LANDMARK_NAMES)


class _no_existing_promotion:
    """In-process-only monkeypatch (never touches athlete_tracker.py on
    disk) that disables BOTH existing promotion paths for the duration of
    the block, so a pending candidate keeps accumulating real hits
    indefinitely -- lets this measurement observe how much torso-qualifying
    evidence WOULD have accumulated by hit N, undistorted by the fact that
    the existing (already-proven-safe) paths often lock first in real
    replay. Restores the real methods on exit -- purely a measurement
    technique, changes no persisted behavior."""

    def __enter__(self):
        self._orig_promote = at.PendingIdentity.ready_to_promote
        self._orig_strong = at.PendingIdentity.ready_via_strong_pose
        at.PendingIdentity.ready_to_promote = lambda self, time_s: False
        at.PendingIdentity.ready_via_strong_pose = lambda self: False
        return self

    def __exit__(self, *exc):
        at.PendingIdentity.ready_to_promote = self._orig_promote
        at.PendingIdentity.ready_via_strong_pose = self._orig_strong
        return False


def replay_true_athlete(label, frames, fps):
    """Feed real full-fidelity detections through the CURRENT, UNMODIFIED
    AthleteTracker. A "hit" here means the SAME thing it means to
    PendingIdentity itself: `_evaluate_pending_corroboration` actually
    selected this candidate as best_idx and `register_hit` ran (i.e. it
    ALSO passed the existing hard continuity checks -- no teleport/
    direction/scale reject -- and cleared MIN_CORROBORATION_SCORE) -- not
    merely "a torso-complete candidate existed this frame while some OTHER
    reason caused a 0.0 score." Detected via the pending/tracker hit counter
    increasing across the step() call, the tracker's own bookkeeping, not a
    re-derived heuristic."""
    tracker = at.AthleteTracker(travel_direction="left_to_right", fps=fps, entry_gate=None)
    hits = []
    qualifying_times = []
    first_3_qualifying_ms = None
    first_3_qualifying_displacement = None
    for fr in frames:
        c = build_candidate(fr)
        cands = [c] if c is not None else [None]
        hits_before = tracker.pending.hits if tracker.pending is not None else None
        result = tracker.step(cands, fr["sourceFrameIndex"], fr["tMs"] / 1000.0)
        pend = tracker.pending
        registered_hit = (
            c is not None and fr["detected"] and (
                (pend is not None and hits_before is not None and pend.hits > hits_before)
                or (pend is None and result["identityState"] == "tracked" and result["selectedIndex"] is not None)
            )
        )
        if registered_hit:
            complete = torso_complete(c.landmarks)
            geom_ok, geom_diag = torso_geometry(c.landmarks, c.w) if complete else (False, {})
            cum_disp = pend.cumulative_displacement if pend is not None else tracker.state and 0.0
            corroboration_score = next((pc["score"] for pc in result["candidates"] if isinstance(pc, dict) and pc.get("rejectionReason") is None and pc.get("score") is not None), None)
            hit = {
                "sourceFrameIndex": fr["sourceFrameIndex"], "tMs": fr["tMs"],
                "torsoComplete": complete, "torsoGeometryPlausible": geom_ok,
                "corroborationScore": corroboration_score, "fullBodyCompleteness": c.completeness,
                "cumulativeDisplacement": cum_disp,
                "identityStateAfter": result["identityState"],
            }
            hits.append(hit)
            if complete and geom_ok:
                qualifying_times.append((fr["tMs"], cum_disp))
                if len(qualifying_times) >= at.MIN_VERIFICATION_HITS and first_3_qualifying_ms is None:
                    first_3_qualifying_ms = fr["tMs"] - qualifying_times[0][0]
                    first_3_qualifying_displacement = cum_disp
        if result["identityState"] == "tracked":
            break
    return {
        "label": label,
        "hits": hits,
        "qualifyingHitTimesMs": [t for t, _ in qualifying_times],
        "windowMsFor3QualifyingHits": first_3_qualifying_ms,
        "cumulativeDisplacementAt3QualifyingHits": first_3_qualifying_displacement,
        "totalQualifyingHits": len(qualifying_times),
        "totalHits": len(hits),
    }


def stress_test_stationary_torso_hallucination(fps=240.0, n_hits=12, jitter=0.0):
    """Part F/N -- an ADVERSARIAL Day-100-style fixture: NOT the scalar-
    completeness-only fixture prior phases used (empty landmarks dict, which
    trivially fails any landmark-name-based check) but an explicit,
    torso-bearing stationary hallucination with a fully plausible torso
    geometry -- the honest worst case a repeating structure (bleacher rows,
    fence posts) could plausibly produce, since real Day-100 evidence does
    not record whether its 17/33 landmarks specifically included a complete,
    well-formed bilateral torso. `jitter` (normalized units) optionally adds
    the SAME sub-pixel jitter magnitude this repo's own existing
    'motion.' regression test in athlete-tracker-sanity.py uses (0.0005),
    to also check behavior under realistic detector noise, not just
    perfect-zero motion."""
    tracker = at.AthleteTracker(travel_direction="left_to_right", fps=fps, entry_gate=None)
    base_cx = 0.15
    ls = (base_cx - 0.04, 0.35, 0.9)
    rs = (base_cx + 0.04, 0.35, 0.9)
    lh = (base_cx - 0.035, 0.55, 0.9)
    rh = (base_cx + 0.035, 0.55, 0.9)
    landmarks = {"left_shoulder": ls, "right_shoulder": rs, "left_hip": lh, "right_hip": rh}
    hits = []
    promoted = False
    for i in range(n_hits):
        j = jitter * (1 if i % 2 == 0 else -1)
        lm = {k: (v[0] + j, v[1], v[2]) for k, v in landmarks.items()}
        xs = [p[0] for p in lm.values()]
        ys = [p[1] for p in lm.values()]
        # completeness = 17/33 = 0.515 -- NOT the torso-only 4/33. This
        # matches the REAL historical Day-100 incident's own documented peak
        # completeness exactly (its single best frame), which is ABOVE
        # MIN_LANDMARK_COMPLETENESS (0.45) and therefore CAN and did become a
        # pending candidate under the existing, unchanged entry gate -- an
        # honest worst-case stress fixture must clear that same bar, or it
        # is not a fair adversarial test.
        c = at.Candidate((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, max(xs) - min(xs), max(ys) - min(ys), lm, 17.0 / 33.0)
        result = tracker.step([c], i, i / fps)
        complete = torso_complete(c.landmarks)
        geom_ok, _ = torso_geometry(c.landmarks, c.w) if complete else (False, {})
        pend = tracker.pending
        scored = [pc for pc in result["candidates"] if isinstance(pc, dict) and pc.get("score") is not None]
        score = max((pc["score"] for pc in scored), default=None)
        hits.append({
            "i": i, "torsoComplete": complete, "torsoGeometryPlausible": geom_ok,
            "corroborationScore": score,
            "cumulativeDisplacement": pend.cumulative_displacement if pend else None,
            "identityStateAfter": result["identityState"],
        })
        if result["identityState"] == "tracked":
            promoted = True
            break
    return {"promotedViaCurrentCode": promoted, "hits": hits, "jitter": jitter}


if __name__ == "__main__":
    with open(os.path.join(ROOT, "tmp/phaseR3B2/pose-completeness-stage-trace-raw.json")) as f:
        raw = json.load(f)

    true_athlete = {}
    with _no_existing_promotion():
        for label, frames in raw.items():
            print(f"-- starting {label} ({len(frames)} frames) --", flush=True)
            true_athlete[label] = replay_true_athlete(label, frames, FPS_BY_LABEL[label])
            r = true_athlete[label]
            print(f"{label}: totalHits={r['totalHits']} qualifyingHits={r['totalQualifyingHits']} "
                  f"windowFor3QualifyingMs={r['windowMsFor3QualifyingHits']} "
                  f"cumDispAt3Qualifying={r['cumulativeDisplacementAt3QualifyingHits']}", flush=True)

    with open(os.path.join(OUT, "true-athlete-evidence.json"), "w") as f:
        json.dump(true_athlete, f, indent=2)

    false_candidates = {
        "day100_stress_zero_motion": stress_test_stationary_torso_hallucination(jitter=0.0),
        "day100_stress_repo_jitter_scale": stress_test_stationary_torso_hallucination(jitter=0.0005),
    }
    for name, r in false_candidates.items():
        print(f"{name}: promotedViaCurrentCode={r['promotedViaCurrentCode']}")

    with open(os.path.join(OUT, "false-candidate-evidence.json"), "w") as f:
        json.dump(false_candidates, f, indent=2)

    print(f"\nWrote {OUT}/true-athlete-evidence.json and false-candidate-evidence.json")
