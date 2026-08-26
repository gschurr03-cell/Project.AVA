"""
Deterministic stationary-camera athlete identity tracker (Day 95 audit;
acquisition redesigned Day 101).

Root cause this replaces: the previous pipeline had NO identity concept at
all. `num_poses=1` meant MediaPipe's own single highest-confidence detection
was trusted unconditionally every frame, with zero cross-frame continuity
check, zero direction awareness, zero rejection of a differently-scaled or
differently-positioned "person" appearing between frames. On the real Vanni
240fps clip this produced a tracked segment that moved right-to-left opposite
the configured left-to-right sprint direction — direct evidence of either an
identity switch or noise being accepted as signal.

Day 101 audit — a second, distinct real bug this module now closes: the
continuity checks above are correct once a real identity is established, but
the ORIGINAL Day 95 design locked identity on the very FIRST sufficiently-
scoring candidate, with no requirement that it be corroborated again before
becoming authoritative. On the real Vanni 240fps clip this let the tracker
lock onto a stadium bleacher stair pattern at source frame 7 — long before
the athlete ever entered the video — and its own (correct!) continuity
checks then permanently rejected every later, genuine sighting of the real
athlete, because relative to the false reference position, the real athlete
looked like an impossible identity-violating jump. The fix is NOT to loosen
those continuity checks (they were doing their job correctly); it is to make
identity harder to acquire in the first place: "tracking must earn identity."

This module is intentionally separated from MediaPipe invocation: it consumes
a plain list of CANDIDATE detections per frame (already computed) and decides
WHICH candidate (if any) is the verified continuation of the tracked athlete.
Pure, deterministic, no I/O, no OpenCV/MediaPipe dependency — every rule here
is unit-testable with synthetic candidate sequences, independent of a real
video or MediaPipe runtime.

Coordinate convention: all positions/sizes are normalized to the SOURCE frame
(x, y, w, h in [0, 1]), matching the rest of the pipeline. Velocity is in
normalized-frame-widths per second, so behavior is consistent across
resolutions and frame rates.

--- Acquisition state machine (Day 101) --------------------------------------

    UNINITIALIZED
        |  first eligible candidate (near entry, human-shaped, complete)
        v
    SEARCHING  <-------------------------------------+
        |  one hit                                    | pending candidate
        v                                              | discarded (see
    CANDIDATE                                          | rejection reasons
        |  a 2nd, continuity-consistent hit             | below) — restart
        v                                              | the search fresh
    VERIFYING -------------------------------------->--+
        |  Nth (>= MIN_VERIFICATION_HITS) consistent
        |  hit, with real accumulated motion and
        |  within the stationary-verification time
        |  budget
        v
    TRACKED  (identity LOCKED; existing continuity/teleport/scale/direction
        |     checks below, UNCHANGED from Day 95, now govern every further
        |     frame — Day 100 found these already correct)
        |
        |  a short post-lock window only (Part 6): a much stronger,
        |  near-entry candidate may still REPLACE a lock that has itself
        |  shown almost no real motion since locking — explicit,
        |  bounded, logged, never available once the lock has proven
        |  itself by moving
        |
        |  CONSECUTIVE_UNVERIFIED_BEFORE_LOST unverified frames
        v
    REACQUIRING  (search radius around last known position; unchanged)
        |  REACQUISITION_MAX_FRAMES exceeded
        v
    TERMINATED

A pending (SEARCHING/CANDIDATE/VERIFYING-phase) candidate is discarded, and
the search restarts from SEARCHING, when:
  - a detector frame produces no continuity-consistent corroboration for
    more than VERIFICATION_MAX_CONSECUTIVE_MISSES consecutive detector
    hits ("lost the thread"), or
  - MAX_STATIONARY_VERIFICATION_SECONDS have elapsed since the candidate
    was first seen without it accumulating at least
    MIN_CUMULATIVE_DISPLACEMENT of real movement ("this hasn't moved —
    almost certainly background, not an athlete about to sprint").
    A discarded stationary candidate's position is remembered for
    STATIONARY_REJECTION_COOLDOWN_SECONDS so the very next detector hit at
    the same spot cannot simply restart the same doomed verification loop.

No single frame can ever reach TRACKED. A candidate becomes the tracked
identity only after multiple, mutually-consistent, non-stationary sightings.
"""

import math

# --- Tunables (module-level, documented, not tuned to this one clip) -------

# A candidate must have at least this fraction of the 33 MediaPipe landmarks
# present with visibility >= this floor to be considered a usable detection
# at all (too incomplete to trust for identity or crop containment).
MIN_LANDMARK_COMPLETENESS = 0.45
LANDMARK_VISIBILITY_FLOOR = 0.3

# A detected box must look like a standing/running human (taller than wide);
# generous bounds so partial occlusion / limb spread doesn't false-reject.
MIN_HUMAN_ASPECT = 0.12  # width / height
MAX_HUMAN_ASPECT = 1.6

# Acquisition: how close to the configured entry edge (0.0 = left edge,
# 1.0 = right edge) a candidate must be to count as "near the expected
# entry side" during the acquisition phase. Day 101: this is now a HARD
# requirement for a candidate to be considered AT ALL while searching (see
# `_near_entry` / `_evaluate_searching_candidates`) — previously only a
# scoring preference, which is exactly how a candidate well outside the
# entry region (a stadium bleacher pattern at source frame 7 of the real
# Vanni clip) was still able to win acquisition on its individual merits.
#
# Day 103 audit: this band is measured from the raw SOURCE-FRAME edge
# (cx <= 0.4 / cx >= 0.6), with no relationship at all to the coach's
# calibrated start gate. On a real clip where the gate sits well inside the
# frame, this both under- and over-reaches: it can admit candidates already
# well past the gate (inside the measurement zone, not "pre-zone") as if
# they were "near entry," while giving no special weight to the actual
# physical pre-zone corridor the athlete runs through before the gate. It
# remains the FALLBACK when no calibrated gate is available to `_near_entry`
# (e.g. an uncalibrated preview run) — never removed, only superseded by the
# gate-relative corridor below when real calibration exists.
ACQUISITION_ENTRY_BAND = 0.4

# Day 103 (Part 3): pre-zone acquisition corridor, relative to the coach's
# CALIBRATED start gate + configured travel direction, instead of the raw
# frame edge. `entry_gate=(x, y)` (normalized source-frame coordinates —
# the same space `gateMidpoint()`/`gatesToManualPoints()` already produce in
# `src/lib/calibration/gates.ts`) is threaded in from the Node worker, which
# reads it straight from `sessions.calibration_gates` — the same calibration
# the measurement engine and zone math already trust, so there is exactly
# one source of truth for "where is the start gate."
#
# `ENTRY_CORRIDOR_DEPTH_BEFORE_GATE` extends the corridor BACKWARD from the
# gate (the direction the athlete approaches from) — generous enough to
# acquire and verify a visible athlete before they cross the gate, but
# bounded well short of the whole frame, unlike a fixed frame-edge fraction.
# `ENTRY_CORRIDOR_DEPTH_AFTER_GATE` is a small, explicit allowance FORWARD of
# the gate (into the zone): real production evidence (Day 103, this same
# Vanni clip) shows a distant athlete can remain too small for MediaPipe to
# produce a complete, confident detection until a short distance past the
# gate, even though they were visually present before it — without this
# allowance, a strict pre-zone-only corridor would silently make acquisition
# LATER than the current frame-edge band on exactly this kind of clip, the
# opposite of this task's goal. It is deliberately much smaller than the
# before-gate depth: this is a bounded tolerance for detection latency, not
# a second acquisition zone.
# `ENTRY_CORRIDOR_HALF_HEIGHT` bounds the corridor vertically around the
# gate's own y — defense in depth (independent of the Day 101 stationary-
# candidate rejection) so a spectator/background region at a very different
# height than the track lane cannot qualify merely by being horizontally
# within the corridor.
ENTRY_CORRIDOR_DEPTH_BEFORE_GATE = 0.35
ENTRY_CORRIDOR_DEPTH_AFTER_GATE = 0.15
ENTRY_CORRIDOR_HALF_HEIGHT = 0.30

# Scale (height) consistency: a candidate's height must stay within this
# ratio of the tracked athlete's recent height (both directions).
MAX_SCALE_RATIO = 1.75

# Teleport rejection: implied velocity (normalized frame-widths/sec) more
# than this multiple of the tracked athlete's own recent max observed
# velocity is rejected as implausible motion for the SAME person. The
# absolute floor guards the cold-start case (no velocity history yet).
MAX_VELOCITY_MULTIPLE = 3.0
ABSOLUTE_VELOCITY_CEILING = 2.5  # generous backstop: ~2.5 frame-widths/sec

# Direction: a candidate whose implied x-velocity opposes the configured
# travel direction by more than this floor (normalized-widths/sec) is scored
# as a direction violation for THAT frame. A single such frame is just
# rejected (not selected); only a SUSTAINED run (see below) triggers
# reacquisition. The floor is the MAX of a fixed base and a fraction of the
# athlete's own established speed — a fixed-only floor this small (an
# earlier, untested value of 0.02) turned out, on real sparse/noisy
# detections spanning large gaps between verified frames, to reject the
# large majority of otherwise-legitimate candidates: any two independently-
# noisy detections separated by a real time gap routinely imply a velocity
# with some noise in the opposing sign, even while the true trend is
# correct. Scaling with established speed keeps the check meaningful (a
# clearly reversed, fast motion is still rejected) without treating normal
# measurement jitter as a direction violation.
DIRECTION_NOISE_FLOOR = 0.08
DIRECTION_RELATIVE_TOLERANCE = 0.5  # fraction of the athlete's own max observed speed
SUSTAINED_OPPOSITE_DIRECTION_FRAMES = 5

# Identity-loss / reacquisition.
# Day 102 audit — the real Vanni clip found a genuine post-lock-loss defect:
# `consecutive_unverified` only increments on DETECTOR-cadence calls to
# `step()` (identity re-verification runs once per ~DETECTOR_CADENCE_FRAMES
# video frames, default 8; box_tracker.py's cheap optical-flow continuation
# between those calls never touches this counter at all). The previous value
# (6) therefore declared identity lost after as little as ~6*8=48 video
# frames (~0.2s at 240fps) of the detector failing to re-confirm the SAME
# athlete — well under one full stride cycle. This project's own established
# plausible step-duration window (SprintAnalyzer.ts,
# DEFAULT_MIN/MAX_PLAUSIBLE_STEP_MS = 150-320ms) means a single stride
# (two steps) can legitimately take up to ~640ms, during which mid-stride
# motion blur or limb configuration can plausibly cause a FEW consecutive
# detector re-verifications to fail even though the SAME real athlete is
# still there and optical flow is still confidently tracking them. 20 is
# derived from that existing constant (640ms / (8 frames @ 240fps ≈ 33ms
# per detector interval) ≈ 19.2, rounded up) — not tuned to this one clip's
# outcome; it is sized to survive one full stride cycle's worth of detector
# misses, no more.
CONSECUTIVE_UNVERIFIED_BEFORE_LOST = 20
REACQUISITION_BASE_RADIUS = 0.12         # normalized search-region radius at loss instant
REACQUISITION_EXPANSION_PER_FRAME = 0.01
REACQUISITION_MAX_RADIUS = 0.6
REACQUISITION_MAX_FRAMES = 60            # bounded frame budget to reacquire before terminating

MIN_ACCEPT_SCORE = 0.45

# --- Day 101: multi-stage acquisition verification tunables ----------------

# How many mutually-consistent detector hits a pending candidate needs
# before its identity may become authoritative (TRACKED). 1 would reproduce
# the old immediate-lock behavior; this project's own real-world audit
# (Day 100) is the justification for requiring more than one.
MIN_VERIFICATION_HITS = 3

# A pending candidate survives this many CONSECUTIVE detector hits with no
# consistent corroboration before being discarded (some slack for ordinary
# detection noise / a briefly-missed frame — not for a candidate that's
# genuinely gone).
VERIFICATION_MAX_CONSECUTIVE_MISSES = 2

# A pending candidate must accumulate at least this much real displacement
# (normalized frame-widths, summed over consecutive corroborating hits)
# within MAX_STATIONARY_VERIFICATION_SECONDS of first being seen, or it is
# discarded as background. This is the direct, targeted defense against the
# real Day 100 failure mode: a stadium bleacher/fence pattern is confidently
# "human-shaped" and complete to MediaPipe, near-entry by chance is
# possible, but it is categorically incapable of ever moving.
MIN_CUMULATIVE_DISPLACEMENT = 0.03
MAX_STATIONARY_VERIFICATION_SECONDS = 3.0

# Once a pending candidate is discarded specifically for being stationary,
# do not let a new candidate re-open verification at (almost) the same
# position for this long — otherwise the same static false candidate simply
# restarts the doomed verification loop on the very next detector hit.
STATIONARY_REJECTION_COOLDOWN_SECONDS = 2.0
STATIONARY_REJECTION_RADIUS = 0.05

# Corroboration scoring during CANDIDATE/VERIFYING re-uses the same
# continuity math as post-lock tracking (`_score_candidate`), against the
# pending candidate's own accumulating position/velocity/scale instead of
# `self.state` — same teleport/direction/scale physics, just applied one
# stage earlier. A corroborating hit must clear this score.
MIN_CORROBORATION_SCORE = 0.35

# --- Phase R3B-1: early acquisition via strong, sustained pose corroboration -
#
# R3A proved (docs/phase-r3a-cross-fps-contact-acquisition-audit.md) that
# MIN_CUMULATIVE_DISPLACEMENT alone can make a genuinely-present, clearly-
# visible athlete wait far longer than the evidence justifies before
# localization is trusted — up to 350ms on a real Vanni 60 clip — purely
# because a small/distant athlete's real motion covers fewer NORMALIZED
# frame-width units per second than a closer framing (Gav), even though real
# MediaPipe pose evidence with high visibility already exists from the very
# first frames. Requiring physical DISPLACEMENT before trusting identity is a
# real, necessary defense (see MIN_CUMULATIVE_DISPLACEMENT's own docstring:
# it is what a static background pattern can never produce) — but it is not
# the ONLY independent way to prove "this is a real human, not background".
# A pending candidate whose corroborating pose evidence is a) essentially
# complete (near every one of MediaPipe's 33 landmarks present at high
# visibility) and b) scored highly against continuity physics (position/
# scale, not just completeness) on EVERY verification hit — not once, but
# sustained across MIN_VERIFICATION_HITS consecutive hits — may be promoted
# without waiting for displacement. This does not touch
# MIN_CUMULATIVE_DISPLACEMENT, MIN_VERIFICATION_HITS,
# VERIFICATION_MAX_CONSECUTIVE_MISSES, or any teleport/direction/scale/
# entry-corridor rejection; it adds a second, stricter, independent path to
# the SAME promotion decision.
#
# Real evidence this is a materially stricter bar than what background
# clutter has ever been proven to reach in this project: the real Day 100
# bleacher-hallucination false positive that originally motivated
# MIN_CUMULATIVE_DISPLACEMENT peaked at 17/33 landmarks (~51.5%
# completeness) at trackingConfidence 0.55 on its single best frame, and did
# NOT sustain even that across consecutive frames (0 landmarks on the
# surrounding frames) — see docs/day-100-early-zone-evidence-recovery-audit.md.
# EARLY_ACQUISITION_MIN_COMPLETENESS (0.85) and EARLY_ACQUISITION_MIN_SCORE
# (0.75), both required on EVERY hit, are set well above that incident's own
# observed ceiling, not tuned to any one benchmark's outcome.
# Set well above this project's own existing test-fixture convention for
# "ordinary good" synthetic completeness (0.9, used uniformly across
# box-tracker-sanity.py/cross-athlete-coast-risk-sanity.py/etc.) so this new
# path does not silently change the acquisition timing of generic fixtures
# that were never intended to exercise it -- verified empirically: 0.9 (the
# repo's own "good" convention) must NOT satisfy this bar; only real,
# near-complete pose evidence should.
EARLY_ACQUISITION_MIN_COMPLETENESS = 0.96
EARLY_ACQUISITION_MIN_SCORE = 0.75

# --- Phase R3B-3: early acquisition via sustained TORSO-only corroboration --
#
# R3B-2 (docs/phase-r3b2-full-fidelity-startup-acquisition-audit.md) proved
# real bilateral torso landmarks (shoulders+hips) are present far more often
# (81.7% of real detected startup frames) than the 96%-full-body-completeness
# EARLY_ACQUISITION_MIN_COMPLETENESS bar above ever sustains, because real
# MediaPipe detection is intermittent even for a genuinely-present athlete.
# R3B-3 evaluated whether torso completeness could safely SUBSTITUTE for
# MIN_CUMULATIVE_DISPLACEMENT the same way ready_via_strong_pose's full-body
# completeness does. It cannot, safely, on its own: an honest adversarial
# reconstruction of the real Day 100 incident (a stationary candidate with a
# complete, geometrically plausible torso and the SAME 51.5% total
# completeness the real incident's own best frame reached) promotes within
# 2-3 hits under a pure torso-completeness+corroboration contract, because
# the existing corroboration score (`score_candidate_continuity`) rewards
# position self-consistency, which a static target trivially maximizes. Only
# 4 of 33 landmarks is too weak an anti-hallucination signal on its own,
# unlike full-body 96% completeness.
#
# The safe variant kept here therefore does NOT remove the displacement
# requirement -- it REDUCES it. TORSO_MIN_CUMULATIVE_DISPLACEMENT is real,
# evidence-derived: across real full-fidelity replay of all 4 benchmarks
# (tmp/phaseR3B3/true-athlete-evidence.json), genuine torso-corroborated
# candidates had already accumulated between 0.0098 (Vanni 240) and 0.077
# (Gav) cumulative displacement by their natural 3rd qualifying hit --
# 0.008 sits comfortably below every real benchmark's own naturally-achieved
# value (costs no real benchmark extra hits/time) while remaining
# categorically unreachable by a truly stationary background pattern
# (cumulative_displacement is monotonically non-decreasing and a static
# target contributes exactly 0.0 forever) -- the same anti-hallucination
# property MIN_CUMULATIVE_DISPLACEMENT itself relies on, just a lower bar.
# The adversarial Day 100 reconstruction above is REJECTED by this reduced
# floor (scripts/phase-r3b3-torso-startup-identity-sanity.py, check 8).
#
# Torso geometry plausibility (Part B) was ALSO evidence-corrected during
# R3B-3: a strict shoulders-above-hips / width-ratio gate was tested against
# 196 real torso-complete frames and rejected 35% of genuine early-clip
# evidence (real small/distant-athlete torso landmarks are frequently noisy
# at this scale -- comparable in magnitude to MediaPipe's own per-frame
# jitter). Only a scale-invariant degenerate-point guard survived real-data
# testing; ordinary geometric ordering is NOT a reliable per-frame signal at
# real startup detection scale and is deliberately not enforced here.
#
# TORSO_QUALIFYING_WINDOW_MS bounds how far apart (in real, physical time,
# never frame count) the MIN_VERIFICATION_HITS qualifying hits may span --
# real observed qualifying windows across all 4 benchmarks topped out at
# 366.67ms (Vanni 60); 750ms is a generous ~2x margin above that, not tuned
# to any single clip.
TORSO_LANDMARK_NAMES = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
TORSO_MIN_SPAN_FRACTION = 0.02  # fraction of the candidate's OWN bounding-box width -- scale-invariant
TORSO_MIN_CUMULATIVE_DISPLACEMENT = 0.008
TORSO_QUALIFYING_WINDOW_MS = 750.0

# --- Day 101 (Part 6): bounded post-lock re-evaluation ----------------------
#
# A lock is normally permanent (that is the entire point of continuity
# checks). The one narrow exception: for a short window immediately after
# locking, if the newly-tracked identity has itself shown almost no real
# motion (i.e. it has not yet PROVEN itself the way accumulated displacement
# during verification usually would have), and a substantially stronger,
# near-entry candidate appears, the lock may be replaced. This is bounded on
# every axis so it can never reopen identity switching once a lock has
# earned real trust by moving.
EARLY_LOCK_REEVALUATION_SECONDS = 1.0
EARLY_LOCK_MAX_OWN_DISPLACEMENT = 0.02
EARLY_LOCK_OVERRIDE_SCORE_MARGIN = 0.25


class Candidate:
    __slots__ = ("cx", "cy", "w", "h", "landmarks", "completeness")

    def __init__(self, cx, cy, w, h, landmarks, completeness):
        self.cx, self.cy, self.w, self.h = cx, cy, w, h
        self.landmarks = landmarks  # dict: name -> (x, y, visibility) in SOURCE-normalized space
        self.completeness = completeness


def candidate_from_landmarks(landmark_points, width, height, name_for_index):
    """Build a Candidate from a raw MediaPipe per-person landmark list (pixel
    or normalized — pass already-normalized-to-source-frame x/y). Returns
    None if there are no usable points at all."""
    xs, ys, present = [], [], 0
    landmarks = {}
    for i, lm in enumerate(landmark_points):
        vis = getattr(lm, "visibility", None)
        vis = 1.0 if vis is None else max(0.0, min(1.0, float(vis)))
        name = name_for_index.get(i)
        if name:
            landmarks[name] = (lm.x, lm.y, vis)
        if vis >= LANDMARK_VISIBILITY_FLOOR:
            present += 1
            xs.append(lm.x)
            ys.append(lm.y)
    if not xs:
        return None
    completeness = present / max(1, len(landmark_points))
    cx, cy = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
    w, h = max(1e-6, max(xs) - min(xs)), max(1e-6, max(ys) - min(ys))
    return Candidate(cx, cy, w, h, landmarks, completeness)


def _human_shaped(c):
    aspect = c.w / c.h
    return MIN_HUMAN_ASPECT <= aspect <= MAX_HUMAN_ASPECT


def _torso_complete(c):
    """Phase R3B-3 -- bilateral shoulders+hips present at the SAME
    visibility floor identity/completeness already uses elsewhere (no new
    tunable for this axis). Identity evidence, not contact evidence: this
    intentionally says nothing about ankles/heels/toes."""
    for name in TORSO_LANDMARK_NAMES:
        lm = c.landmarks.get(name)
        if lm is None:
            return False
        x, y, vis = lm
        if vis < LANDMARK_VISIBILITY_FLOOR or not (math.isfinite(x) and math.isfinite(y)):
            return False
    return True


def _torso_geometry_plausible(c):
    """Phase R3B-3 -- scale-invariant degenerate-point guard only (real-data
    testing rejected a stricter shoulders-above-hips/width-ratio gate -- see
    the TORSO_MIN_SPAN_FRACTION docstring above). Only called once
    `_torso_complete` is True."""
    ls = c.landmarks["left_shoulder"]
    rs = c.landmarks["right_shoulder"]
    lh = c.landmarks["left_hip"]
    rh = c.landmarks["right_hip"]
    floor = TORSO_MIN_SPAN_FRACTION * max(1e-6, c.w)
    return abs(ls[0] - rs[0]) >= floor and abs(lh[0] - rh[0]) >= floor


def _near_entry(c, direction, entry_gate=None):
    """True when candidate is within the acquisition region for `direction`.

    Day 103: when a calibrated `entry_gate=(x, y)` is supplied, the region is
    the bounded pre-zone corridor around that gate (see the ENTRY_CORRIDOR_*
    constants above) — corridor extends BACKWARD from the gate opposite the
    travel direction, plus a small forward allowance into the zone. Without a
    calibrated gate (or an unknown/auto direction, which the corridor cannot
    orient), falls back to the original frame-edge ACQUISITION_ENTRY_BAND.
    """
    if entry_gate is not None and direction in ("left_to_right", "right_to_left"):
        gate_x, gate_y = entry_gate
        if direction == "left_to_right":
            lo, hi = gate_x - ENTRY_CORRIDOR_DEPTH_BEFORE_GATE, gate_x + ENTRY_CORRIDOR_DEPTH_AFTER_GATE
        else:
            lo, hi = gate_x - ENTRY_CORRIDOR_DEPTH_AFTER_GATE, gate_x + ENTRY_CORRIDOR_DEPTH_BEFORE_GATE
        if not (lo <= c.cx <= hi):
            return False
        if gate_y is not None and abs(c.cy - gate_y) > ENTRY_CORRIDOR_HALF_HEIGHT:
            return False
        return True
    if direction == "left_to_right":
        return c.cx <= ACQUISITION_ENTRY_BAND
    if direction == "right_to_left":
        return c.cx >= (1.0 - ACQUISITION_ENTRY_BAND)
    return True  # unknown/auto direction: no entry-side preference


def score_candidate_continuity(c, dt, reference, expected_dir):
    """Pure continuity scorer — the exact physics `AthleteTracker._score_candidate`
    applies post-lock (teleport/direction/scale rejection + weighted position/
    completeness/scale score), extracted to module scope (Day 104) so the
    same, unweakened rules can also drive `track_backward` below without a
    live `AthleteTracker` instance. `AthleteTracker._score_candidate` now
    delegates here; this is a pure refactor — no behavior changed for the
    existing forward/pre-lock paths, which is why the pre-existing
    athlete-tracker sanity suite is the regression guard for this function,
    not a new one.

    `dt` may be NEGATIVE (the backward walker scores a candidate at an
    EARLIER frame against a `reference` anchored at a LATER frame/time) — the
    velocity/direction math below is symmetric in sign, so a negative dt
    correctly flips the implied-direction check rather than needing a special
    case: an athlete who moved left-to-right FORWARD in time was, at the
    earlier frame, to the LEFT of the reference, which is exactly what
    `(c.cx - reference.center[0]) / dt` with dt<0 implies for a candidate to
    the left.
    """
    diag = {}
    if c.completeness < MIN_LANDMARK_COMPLETENESS:
        return 0.0, "insufficient_landmark_completeness", diag
    if not _human_shaped(c):
        return 0.0, "implausible_human_aspect", diag

    implied_vx = None
    if reference.center is not None and dt is not None and dt != 0:
        implied_vx = (c.cx - reference.center[0]) / dt
        implied_vy = (c.cy - reference.center[1]) / dt
        implied_speed = math.hypot(implied_vx, implied_vy)
        diag["impliedVelocity"] = implied_vx
        velocity_ceiling = max(ABSOLUTE_VELOCITY_CEILING, reference.max_abs_velocity * MAX_VELOCITY_MULTIPLE)
        if implied_speed > velocity_ceiling:
            return 0.0, "teleport_implausible_velocity", diag
        direction_floor = max(DIRECTION_NOISE_FLOOR, reference.max_abs_velocity * DIRECTION_RELATIVE_TOLERANCE)
        if (
            expected_dir != 0
            and (implied_vx * expected_dir) < -direction_floor
        ):
            diag["candidateDirection"] = "right_to_left" if implied_vx < 0 else "left_to_right"
            return 0.0, "opposes_configured_direction", diag
    if reference.height is not None:
        ratio = c.h / reference.height if reference.height > 0 else 1.0
        diag["scaleRatio"] = ratio
        if ratio > MAX_SCALE_RATIO or ratio < 1.0 / MAX_SCALE_RATIO:
            return 0.0, "scale_discontinuity", diag

    # Weighted continuity score from independent, bounded sub-scores.
    completeness_score = min(1.0, c.completeness / 0.9)
    position_score = 1.0
    if reference.center is not None and dt is not None and dt != 0:
        predicted_cx = reference.center[0] + reference.velocity[0] * dt
        predicted_cy = reference.center[1] + reference.velocity[1] * dt
        err = math.hypot(c.cx - predicted_cx, c.cy - predicted_cy)
        # Generous normalization: a quarter-frame-width error scores ~0.5.
        position_score = max(0.0, 1.0 - err / 0.5)
    scale_score = 1.0
    if reference.height is not None and reference.height > 0:
        ratio = c.h / reference.height
        scale_score = max(0.0, 1.0 - abs(1.0 - ratio))
    score = 0.4 * position_score + 0.3 * completeness_score + 0.3 * scale_score
    diag["positionScore"] = position_score
    diag["scaleScore"] = scale_score
    diag["completenessScore"] = completeness_score
    return score, None, diag


def track_backward(pre_lock_records, anchor_frame, anchor_center, anchor_height, anchor_time_s, travel_direction, min_frame=0):
    """Day 104 (Part 2) — bidirectional offline identity recovery.

    Uploaded-video analysis is offline: the whole clip is already decoded and
    every frame from 0..anchor_frame-1 already had a full MediaPipe
    multi-candidate detection run against it, because `AthleteBoxTracker`
    requests the (expensive) detector on EVERY frame while `track_state`
    stays "acquiring" (i.e. before the first identity lock) — see
    `box_tracker.py::wants_detector_frame`. Those per-frame candidate lists
    were previously discarded once `AthleteTracker.step()` consumed them.
    This function re-uses that ALREADY-COMPUTED evidence (`pre_lock_records`,
    a dict `frame_index -> (time_s, candidates)`) to walk backward from the
    anchor (the first strong identity lock, i.e. the frame `identity_state`
    first became "tracked") toward frame `min_frame`, applying the exact same
    unweakened continuity physics (`score_candidate_continuity`) forward
    TRACKED tracking already relies on — no new/looser threshold.

    Deliberately does NOT run the Day 101 SEARCHING-phase gates (near-entry
    corridor, stationary-candidate timeout): those exist to bound where an
    identity may be ACQUIRED FROM SCRATCH with no reference to compare
    against. Here there is always a trusted reference (the anchor, or the
    most recently backward-recovered frame), so the teleport/direction/scale
    checks below are a STRONGER per-frame defense than the forward
    acquisition gates ever were — a stadium bleacher or spectator has to
    additionally match the walking reference's implied position/scale/
    direction every single frame, not just look human-shaped once.

    Stops at the FIRST frame with no continuity-consistent candidate — never
    skips a gap and resumes further back, and never predicts/extrapolates a
    box for a frame with no real detection (Part 2's explicit "predicted
    boxes may guide a crop but cannot create pose evidence" — this function
    only ever returns REAL detected-and-verified candidates).

    Returns (recovered, diagnostics):
      recovered   — dict frame_index -> {"cx","cy","w","h","score"}, one
                    entry per successfully recovered frame (normalized
                    source-frame coordinates, same convention as `Candidate`).
      diagnostics — dict with `anchorFrame`, `stopFrame`, `stopReason`,
                    `recoveredFrameCount`, `firstRecoveredFrame`,
                    `lastRecoveredFrame`, and a bounded `rejectedSamples`
                    list (first few rejected-frame reasons, for the
                    developer diagnostics this task's Part 3 requires).
    """
    expected_dir = {"left_to_right": 1, "right_to_left": -1}.get(travel_direction, 0)
    reference = TrackedState()
    reference.center = anchor_center
    reference.height = anchor_height
    reference.time = anchor_time_s
    reference.velocity = (0.0, 0.0)
    reference.max_abs_velocity = 0.0

    recovered = {}
    rejected_samples = []
    stop_frame = None
    stop_reason = "reached_min_frame"

    frame_indices = sorted(f for f in pre_lock_records if min_frame <= f < anchor_frame)
    for f in reversed(frame_indices):
        time_s, candidates = pre_lock_records[f]
        dt = time_s - reference.time  # negative: f is earlier than reference.time
        if dt == 0:
            stop_frame, stop_reason = f, "non_advancing_timestamp"
            break
        best_idx, best_score, best_diag = None, -1.0, None
        per_candidate = []
        for i, c in enumerate(candidates or []):
            if c is None:
                per_candidate.append({"rejectionReason": "no_detection"})
                continue
            score, reject, diag = score_candidate_continuity(c, dt, reference, expected_dir)
            diag["rejectionReason"] = reject
            diag["score"] = score
            per_candidate.append(diag)
            if reject is None and score >= MIN_ACCEPT_SCORE and score > best_score:
                best_score, best_idx, best_diag = score, i, diag
        if best_idx is None:
            stop_frame = f
            stop_reason = "no_continuity_consistent_candidate"
            if len(rejected_samples) < 10:
                rejected_samples.append({"frame": f, "candidates": per_candidate})
            break
        c = candidates[best_idx]
        recovered[f] = {"cx": c.cx, "cy": c.cy, "w": c.w, "h": c.h, "score": best_score}
        vx, vy = (c.cx - reference.center[0]) / dt, (c.cy - reference.center[1]) / dt
        reference.velocity = (vx, vy)
        reference.max_abs_velocity = max(reference.max_abs_velocity, math.hypot(vx, vy))
        reference.center = (c.cx, c.cy)
        reference.height = c.h
        reference.time = time_s

    recovered_frames = sorted(recovered)
    diagnostics = {
        "anchorFrame": anchor_frame,
        "minFrame": min_frame,
        "stopFrame": stop_frame,
        "stopReason": stop_reason,
        "recoveredFrameCount": len(recovered_frames),
        "firstRecoveredFrame": recovered_frames[0] if recovered_frames else None,
        "lastRecoveredFrame": recovered_frames[-1] if recovered_frames else None,
        "rejectedSamples": rejected_samples,
    }
    return recovered, diagnostics


class TrackedState:
    """A rolling position/scale/velocity reference — used both for the
    authoritative tracked athlete (`AthleteTracker.state`) AND, identically,
    for a not-yet-locked pending candidate under verification
    (`PendingIdentity.state`). Updated ONLY on a verified/corroborated
    sample — never on a rejected/predicted one, so it can never drift onto
    noise."""

    def __init__(self):
        self.center = None          # (cx, cy)
        self.height = None
        self.time = None
        self.velocity = (0.0, 0.0)  # normalized units/sec
        self.max_abs_velocity = 0.0
        self.recent_direction_sign = 0  # -1, 0, +1 (sign of vx, smoothed)


class PendingIdentity:
    """A candidate under verification — not yet the tracked athlete. Tracks
    its own continuity state (exactly like `TrackedState`) plus the
    acquisition-specific bookkeeping (hit count, misses, accumulated real
    displacement, first-seen time) that decides whether it ever gets
    promoted to TRACKED."""

    def __init__(self, c, frame_index, time_s):
        self.state = TrackedState()
        self.state.center = (c.cx, c.cy)
        self.state.height = c.h
        self.state.time = time_s
        self.first_frame = frame_index
        self.first_time = time_s
        self.hits = 1
        self.consecutive_misses = 0
        self.cumulative_displacement = 0.0
        # Phase R3B-1: sustained-pose-quality bookkeeping for the early-
        # acquisition path (`ready_via_strong_pose`) — independent of
        # displacement. `min_completeness` starts from the INITIAL
        # candidate's own completeness (the first observation counts too);
        # `min_corroboration_score` only starts accumulating once a real
        # corroboration score exists (the initial candidate has no
        # continuity score of its own to compare against yet).
        self.min_completeness = c.completeness
        self.min_corroboration_score = None
        # Phase R3B-3: physical-time-stamped hits whose candidate satisfied
        # the torso evidence contract (see TORSO_* constants above). The
        # initial candidate has no corroboration score of its own yet
        # (nothing to corroborate against), so it qualifies on torso
        # completeness/geometry alone -- same asymmetry `min_corroboration_score`
        # already has for hit 1.
        self.torso_qualifying_hit_times = (
            [time_s] if (_torso_complete(c) and _torso_geometry_plausible(c)) else []
        )

    def stage(self):
        if self.hits <= 1:
            return "candidate"
        return "verifying"

    def register_hit(self, c, time_s, score=None):
        dt = None if self.state.time is None else max(0.0, time_s - self.state.time)
        if self.state.center is not None:
            self.cumulative_displacement += math.hypot(c.cx - self.state.center[0], c.cy - self.state.center[1])
        if self.state.center is not None and dt and dt > 0:
            vx = (c.cx - self.state.center[0]) / dt
            vy = (c.cy - self.state.center[1]) / dt
            self.state.velocity = (vx, vy)
            self.state.max_abs_velocity = max(self.state.max_abs_velocity, math.hypot(vx, vy))
        self.state.center = (c.cx, c.cy)
        self.state.height = c.h
        self.state.time = time_s
        self.hits += 1
        self.consecutive_misses = 0
        self.min_completeness = min(self.min_completeness, c.completeness)
        if score is not None:
            self.min_corroboration_score = score if self.min_corroboration_score is None else min(self.min_corroboration_score, score)
        if (
            _torso_complete(c)
            and _torso_geometry_plausible(c)
            and (score is None or score >= EARLY_ACQUISITION_MIN_SCORE)
        ):
            self.torso_qualifying_hit_times.append(time_s)

    def stationary_elapsed_s(self, time_s):
        return time_s - self.first_time

    def is_stationary_timeout(self, time_s):
        return (
            self.cumulative_displacement < MIN_CUMULATIVE_DISPLACEMENT
            and self.stationary_elapsed_s(time_s) >= MAX_STATIONARY_VERIFICATION_SECONDS
        )

    def ready_to_promote(self, time_s):
        return (
            self.hits >= MIN_VERIFICATION_HITS
            and self.cumulative_displacement >= MIN_CUMULATIVE_DISPLACEMENT
        )

    def ready_via_strong_pose(self):
        """Phase R3B-1 — the early-acquisition path: the SAME
        MIN_VERIFICATION_HITS evidence-count requirement as
        `ready_to_promote`, but in place of MIN_CUMULATIVE_DISPLACEMENT,
        requires every single hit (including the initial candidate) to have
        been essentially-complete, high-visibility MediaPipe pose AND every
        corroborating hit (post-initial) to have scored highly against
        continuity physics (position/scale, not completeness alone). Time-
        and FPS-independent by construction: it is a pure evidence-quality
        gate over a fixed count of hits, never a duration or frame-count
        threshold."""
        return (
            self.hits >= MIN_VERIFICATION_HITS
            and self.min_completeness >= EARLY_ACQUISITION_MIN_COMPLETENESS
            and (self.min_corroboration_score is None or self.min_corroboration_score >= EARLY_ACQUISITION_MIN_SCORE)
        )

    def ready_via_torso_corroboration(self):
        """Phase R3B-3 -- the third, independent promotion path: at least
        MIN_VERIFICATION_HITS torso-qualifying hits (see
        `torso_qualifying_hit_times`) within TORSO_QUALIFYING_WINDOW_MS of
        real physical time (never frame count -- consistent across 60/120/
        240fps by construction), AND real accumulated displacement past the
        REDUCED (not eliminated) TORSO_MIN_CUMULATIVE_DISPLACEMENT floor --
        the floor that makes this safe against a stationary background
        candidate (see the TORSO_MIN_CUMULATIVE_DISPLACEMENT docstring
        above); torso completeness alone was proven NOT safe on its own."""
        times = self.torso_qualifying_hit_times
        if len(times) < MIN_VERIFICATION_HITS:
            return False
        window_s = times[-1] - times[-MIN_VERIFICATION_HITS]
        if window_s * 1000.0 > TORSO_QUALIFYING_WINDOW_MS:
            return False
        return self.cumulative_displacement >= TORSO_MIN_CUMULATIVE_DISPLACEMENT


class AthleteTracker:
    """Consumes one frame of candidates at a time (`step`); returns which
    candidate (if any) is the verified athlete, plus full diagnostics.

    Identity state machine (Day 101): searching -> candidate -> verifying ->
    tracked -> (lost ->) reacquiring -> tracked | terminated. See module
    docstring for the full diagram and every transition's requirements.
    """

    def __init__(self, travel_direction="left_to_right", fps=60.0, entry_gate=None):
        self.travel_direction = travel_direction if travel_direction in ("left_to_right", "right_to_left") else "auto"
        self.fps = max(1.0, fps)
        # Day 103 (Part 3): (x, y) of the calibrated start gate, normalized to
        # the source frame — None when no calibration is available yet (falls
        # back to the frame-edge ACQUISITION_ENTRY_BAND via `_near_entry`).
        self.entry_gate = entry_gate
        self.state = TrackedState()
        self.identity_state = "searching"
        self.pending = None  # PendingIdentity | None
        self._stationary_rejection = None  # (cx, cy, time_s) | None — cooldown
        self._lock_time = None
        self._lock_start_center = None
        self.consecutive_unverified = 0
        self.frames_since_lost = 0
        self.identity_switch_count = 0
        self.reacquisition_count = 0
        self.direction_reject_count = 0
        self._consecutive_direction_rejections = 0
        self._last_accepted_cx = None
        # Diagnostics-only counters (Day 101) — never gate any decision.
        self.candidates_discarded_stationary = 0
        self.candidates_discarded_inconsistent = 0
        self.early_lock_overrides = 0
        # Phase R3B-3 (Part Q): developer/scientific provenance only -- never
        # gates any decision, never exposed as a consumer-facing confidence
        # percentage. One of "cumulative_displacement", "strong_pose",
        # "torso_corroborated", or None (not yet locked).
        self.last_promotion_reason = None

    def _direction_sign(self):
        if self.travel_direction == "left_to_right":
            return 1
        if self.travel_direction == "right_to_left":
            return -1
        return 0

    def _score_candidate(self, c, dt, reference):
        """Return (score 0..1, hard_reject_reason|None, diagnostics dict),
        scored against `reference` (a `TrackedState`) — either the
        authoritative `self.state` (post-lock) or a `PendingIdentity.state`
        (pre-lock verification). Identical physics either way: a candidate
        must not teleport, must not oppose the configured direction by more
        than noise, and must not jump scale, relative to whichever reference
        it is being corroborated against."""
        return score_candidate_continuity(c, dt, reference, self._direction_sign())

    def _search_radius(self):
        return min(
            REACQUISITION_MAX_RADIUS,
            REACQUISITION_BASE_RADIUS + REACQUISITION_EXPANSION_PER_FRAME * self.frames_since_lost,
        )

    def _in_stationary_cooldown(self, c, time_s):
        if self._stationary_rejection is None:
            return False
        rcx, rcy, rtime = self._stationary_rejection
        if time_s - rtime > STATIONARY_REJECTION_COOLDOWN_SECONDS:
            self._stationary_rejection = None
            return False
        return math.hypot(c.cx - rcx, c.cy - rcy) <= STATIONARY_REJECTION_RADIUS

    def _entry_corridor_bounds(self):
        """Day 103 (Part 3) diagnostics: the acquisition region actually in
        effect this run — the calibrated corridor when `entry_gate` is set,
        else the legacy frame-edge band. Always returns a dict, never None,
        so every rejection can carry the exact geometry it was judged
        against."""
        if self.entry_gate is not None and self.travel_direction in ("left_to_right", "right_to_left"):
            gate_x, gate_y = self.entry_gate
            if self.travel_direction == "left_to_right":
                lo, hi = gate_x - ENTRY_CORRIDOR_DEPTH_BEFORE_GATE, gate_x + ENTRY_CORRIDOR_DEPTH_AFTER_GATE
            else:
                lo, hi = gate_x - ENTRY_CORRIDOR_DEPTH_AFTER_GATE, gate_x + ENTRY_CORRIDOR_DEPTH_BEFORE_GATE
            return {
                "kind": "calibrated_gate_corridor",
                "xMin": lo, "xMax": hi,
                "yMin": (gate_y - ENTRY_CORRIDOR_HALF_HEIGHT) if gate_y is not None else None,
                "yMax": (gate_y + ENTRY_CORRIDOR_HALF_HEIGHT) if gate_y is not None else None,
                "gateX": gate_x, "gateY": gate_y,
            }
        if self.travel_direction == "left_to_right":
            return {"kind": "frame_edge_band", "xMin": 0.0, "xMax": ACQUISITION_ENTRY_BAND, "yMin": None, "yMax": None, "gateX": None, "gateY": None}
        if self.travel_direction == "right_to_left":
            return {"kind": "frame_edge_band", "xMin": 1.0 - ACQUISITION_ENTRY_BAND, "xMax": 1.0, "yMin": None, "yMax": None, "gateX": None, "gateY": None}
        return {"kind": "unbounded_auto_direction", "xMin": 0.0, "xMax": 1.0, "yMin": None, "yMax": None, "gateX": None, "gateY": None}

    def _entry_rejection_diagnostics(self, c):
        bounds = self._entry_corridor_bounds()
        distance_to_gate = (
            math.hypot(c.cx - bounds["gateX"], c.cy - bounds["gateY"])
            if bounds["gateX"] is not None and bounds["gateY"] is not None
            else None
        )
        return {
            "rejectionReason": "outside_entry_corridor" if bounds["kind"] == "calibrated_gate_corridor" else "outside_entry_region",
            "candidateCenter": {"cx": c.cx, "cy": c.cy},
            "corridorBounds": bounds,
            "distanceToGate": distance_to_gate,
            "configuredDirection": self.travel_direction,
        }

    def _evaluate_searching_candidates(self, candidates, time_s):
        """SEARCHING: find a fresh eligible candidate to start verifying.
        Day 101 — `near_entry` is now a HARD requirement here (previously
        only a soft scoring preference), and a candidate inside the
        stationary-rejection cooldown radius is skipped outright. Returns
        (best_idx|None, per_candidate diagnostics list)."""
        per_candidate = []
        best_idx, best_score = None, -1.0
        for i, c in enumerate(candidates):
            if c is None:
                per_candidate.append({"rejectionReason": "no_detection"})
                continue
            if c.completeness < MIN_LANDMARK_COMPLETENESS:
                per_candidate.append({"rejectionReason": "insufficient_landmark_completeness"})
                continue
            if not _human_shaped(c):
                per_candidate.append({"rejectionReason": "implausible_human_aspect"})
                continue
            if not _near_entry(c, self.travel_direction, self.entry_gate):
                per_candidate.append(self._entry_rejection_diagnostics(c))
                continue
            if self._in_stationary_cooldown(c, time_s):
                per_candidate.append({"rejectionReason": "recently_rejected_stationary_region"})
                continue
            score = 0.6 + 0.4 * min(1.0, c.completeness / 0.9)
            entry = {"score": score, "nearEntry": True, "rejectionReason": None}
            per_candidate.append(entry)
            if score > best_score:
                best_score, best_idx = score, i
        accepted = best_idx is not None and best_score >= MIN_ACCEPT_SCORE
        return (best_idx if accepted else None), per_candidate

    def _evaluate_pending_corroboration(self, candidates, time_s):
        """CANDIDATE/VERIFYING: score every candidate against the pending
        identity's own accumulating continuity state, same physics as
        post-lock tracking. Returns (best_idx|None, per_candidate)."""
        dt = None if self.pending.state.time is None else max(0.0, time_s - self.pending.state.time)
        per_candidate = []
        best_idx, best_score = None, -1.0
        for i, c in enumerate(candidates):
            if c is None:
                per_candidate.append({"rejectionReason": "no_detection"})
                continue
            score, reject, diag = self._score_candidate(c, dt, self.pending.state)
            diag["rejectionReason"] = reject
            diag["score"] = score
            per_candidate.append(diag)
            if reject is None and score >= MIN_CORROBORATION_SCORE and score > best_score:
                best_score, best_idx = score, i
        return best_idx, per_candidate

    def _maybe_early_lock_override(self, candidates, time_s):
        """Part 6 — bounded post-lock re-evaluation. Only reachable within
        EARLY_LOCK_REEVALUATION_SECONDS of locking, and only when the
        current lock has itself barely moved (hasn't yet earned trust by
        displacement). Requires a candidate that is BOTH near-entry AND
        clears the current lock's own corroboration score by a wide,
        explicit margin — this is a high, deliberately narrow bar, not a
        general re-opening of identity switching."""
        if self._lock_time is None or (time_s - self._lock_time) > EARLY_LOCK_REEVALUATION_SECONDS:
            return None
        if self.state.center is None or self._lock_start_center is None:
            return None
        own_displacement = math.hypot(
            self.state.center[0] - self._lock_start_center[0],
            self.state.center[1] - self._lock_start_center[1],
        )
        if own_displacement > EARLY_LOCK_MAX_OWN_DISPLACEMENT:
            return None  # the current lock has already proven itself — never override
        # The current lock has no "candidate" of its own to score against —
        # it IS the reference. Compare challengers against a fixed neutral
        # baseline instead, so the override bar is an explicit, constant
        # margin above "an average acceptable detection" rather than a
        # circular self-comparison.
        current_score = 0.5
        best_idx, best_score = None, -1.0
        for i, c in enumerate(candidates):
            if c is None or not _near_entry(c, self.travel_direction, self.entry_gate):
                continue
            if c.completeness < MIN_LANDMARK_COMPLETENESS or not _human_shaped(c):
                continue
            score = 0.6 + 0.4 * min(1.0, c.completeness / 0.9)
            if score > best_score:
                best_score, best_idx = score, i
        if best_idx is not None and best_score >= current_score + EARLY_LOCK_OVERRIDE_SCORE_MARGIN:
            return best_idx
        return None

    def step(self, candidates, frame_index, time_s):
        """Process one frame's candidates. Returns a dict with the selected
        candidate index (or None), identity state, and full diagnostics —
        never mutates `candidates`."""
        identity_switch = False

        # --- Pre-lock phase: SEARCHING / CANDIDATE / VERIFYING -------------
        if self.identity_state in ("searching", "candidate", "verifying"):
            if self.pending is None:
                best_idx, per_candidate = self._evaluate_searching_candidates(candidates, time_s)
                if best_idx is not None:
                    self.pending = PendingIdentity(candidates[best_idx], frame_index, time_s)
                    self.identity_state = self.pending.stage()
                return {
                    "frame": frame_index, "timeS": time_s,
                    "selectedIndex": None, "verified": False,
                    "identityState": self.identity_state, "candidates": per_candidate,
                    "configuredDirection": self.travel_direction, "identitySwitch": False,
                    "verifiedCenter": None, "predictedCenter": None,
                    "identityPromotionReason": self.last_promotion_reason,
                }

            best_idx, per_candidate = self._evaluate_pending_corroboration(candidates, time_s)
            if best_idx is not None:
                # Phase R3B-1: the corroboration score itself (position/scale
                # continuity) is NOT independent anti-background evidence on
                # its own — a static texture trivially "corroborates" its own
                # unmoving position every frame, exactly the failure mode the
                # comment below already warns about. It is tracked here only
                # as a SECONDARY, ADDITIONAL requirement alongside pose
                # completeness (`ready_via_strong_pose`) — completeness,
                # which measures whether MediaPipe found a full human pose
                # STRUCTURE, is the load-bearing anti-hallucination signal;
                # sustained high completeness is what a static background
                # pattern has never been shown to produce (see the
                # EARLY_ACQUISITION_MIN_COMPLETENESS docstring above).
                hit_score = per_candidate[best_idx].get("score") if best_idx < len(per_candidate) else None
                self.pending.register_hit(candidates[best_idx], time_s, score=hit_score)
                self.identity_state = self.pending.stage()
                # A candidate that corroborates perfectly every hit (exactly
                # what a static background texture does — it always "matches
                # itself") must still be discarded once it has had long
                # enough to prove real motion and hasn't: corroboration
                # succeeding is not evidence of a real athlete on its own,
                # only real displacement is.
                if self.pending.is_stationary_timeout(time_s):
                    self.candidates_discarded_stationary += 1
                    self._stationary_rejection = (self.pending.state.center[0], self.pending.state.center[1], time_s)
                    self.pending = None
                    self.identity_state = "searching"
                    return {
                        "frame": frame_index, "timeS": time_s,
                        "selectedIndex": None, "verified": False,
                        "identityState": self.identity_state, "candidates": per_candidate,
                        "configuredDirection": self.travel_direction, "identitySwitch": False,
                        "verifiedCenter": None, "predictedCenter": None,
                        "identityPromotionReason": self.last_promotion_reason,
                    }
                # Phase R3B-1/R3B-3: promote via the ORIGINAL displacement-
                # earned path, the sustained-strong-full-pose path, OR the
                # sustained-torso-corroboration path — any one is
                # independently sufficient; none weakens the others.
                if self.pending.ready_to_promote(time_s):
                    promotion_reason = "cumulative_displacement"
                elif self.pending.ready_via_strong_pose():
                    promotion_reason = "strong_pose"
                elif self.pending.ready_via_torso_corroboration():
                    promotion_reason = "torso_corroborated"
                else:
                    promotion_reason = None
                if promotion_reason is not None:
                    c = candidates[best_idx]
                    self.state = self.pending.state
                    self.identity_state = "tracked"
                    self._lock_time = time_s
                    self._lock_start_center = self.state.center
                    self.consecutive_unverified = 0
                    self.frames_since_lost = 0
                    self._last_accepted_cx = c.cx
                    self.pending = None
                    self.last_promotion_reason = promotion_reason
                    return {
                        "frame": frame_index, "timeS": time_s,
                        "selectedIndex": best_idx, "verified": True,
                        "identityState": "tracked", "candidates": per_candidate,
                        "configuredDirection": self.travel_direction, "identitySwitch": False,
                        "verifiedCenter": self.state.center, "predictedCenter": self.state.center,
                        "identityPromotionReason": promotion_reason,
                    }
                return {
                    "frame": frame_index, "timeS": time_s,
                    "selectedIndex": None, "verified": False,
                    "identityState": self.identity_state, "candidates": per_candidate,
                    "configuredDirection": self.travel_direction, "identitySwitch": False,
                    "verifiedCenter": None, "predictedCenter": self.pending.state.center,
                    "identityPromotionReason": self.last_promotion_reason,
                }

            # No corroboration this frame.
            self.pending.consecutive_misses += 1
            discard_reason = None
            if self.pending.is_stationary_timeout(time_s):
                discard_reason = "pending_candidate_stationary"
            elif self.pending.consecutive_misses > VERIFICATION_MAX_CONSECUTIVE_MISSES:
                discard_reason = "pending_candidate_lost_continuity"
            if discard_reason == "pending_candidate_stationary":
                self.candidates_discarded_stationary += 1
                self._stationary_rejection = (self.pending.state.center[0], self.pending.state.center[1], time_s)
            elif discard_reason == "pending_candidate_lost_continuity":
                self.candidates_discarded_inconsistent += 1
            if discard_reason is not None:
                self.pending = None
                self.identity_state = "searching"
            return {
                "frame": frame_index, "timeS": time_s,
                "selectedIndex": None, "verified": False,
                "identityState": self.identity_state, "candidates": per_candidate,
                "configuredDirection": self.travel_direction, "identitySwitch": False,
                "verifiedCenter": None, "predictedCenter": self.pending.state.center if self.pending else None,
                "identityPromotionReason": self.last_promotion_reason,
            }

        # --- Post-lock phases: TRACKED / REACQUIRING (Day 95 logic,
        # unchanged — Day 100 found this half of the pipeline correct). ----
        dt = None if self.state.time is None else max(0.0, time_s - self.state.time)
        per_candidate = []
        best_idx, best_score = None, -1.0
        for i, c in enumerate(candidates):
            if c is None:
                per_candidate.append({"rejectionReason": "no_detection"})
                continue
            if self.identity_state == "reacquiring" and self.state.center is not None:
                radius = self._search_radius()
                dist = math.hypot(c.cx - self.state.center[0], c.cy - self.state.center[1])
                if dist > radius:
                    per_candidate.append({"rejectionReason": "outside_search_region", "searchRadius": radius})
                    continue
            score, reject, diag = self._score_candidate(c, dt, self.state)
            diag["rejectionReason"] = reject
            diag["score"] = score
            per_candidate.append(diag)
            if reject == "opposes_configured_direction":
                self.direction_reject_count += 1
            if reject is None and score > best_score:
                best_score, best_idx = score, i
        accepted = best_idx is not None and best_score >= MIN_ACCEPT_SCORE
        result_state = self.identity_state

        # Part 6: a short post-lock window where a much stronger, near-entry
        # candidate may still override a lock that has proven nothing yet.
        if not accepted and self.identity_state == "tracked":
            override_idx = self._maybe_early_lock_override(candidates, time_s)
            if override_idx is not None:
                self.early_lock_overrides += 1
                self.identity_switch_count += 1
                self.pending = PendingIdentity(candidates[override_idx], frame_index, time_s)
                self.identity_state = self.pending.stage()
                per_candidate[override_idx] = {
                    "score": 1.0, "rejectionReason": None, "earlyLockOverride": True,
                }
                self.last_promotion_reason = None
                return {
                    "frame": frame_index, "timeS": time_s,
                    "selectedIndex": None, "verified": False,
                    "identityState": self.identity_state, "candidates": per_candidate,
                    "configuredDirection": self.travel_direction, "identitySwitch": True,
                    "verifiedCenter": None, "predictedCenter": self.pending.state.center,
                    "identityPromotionReason": self.last_promotion_reason,
                }

        frame_had_only_direction_rejections = (
            not accepted
            and per_candidate
            and all(pc.get("rejectionReason") in ("opposes_configured_direction", "no_detection") for pc in per_candidate)
            and any(pc.get("rejectionReason") == "opposes_configured_direction" for pc in per_candidate)
        )
        if frame_had_only_direction_rejections:
            self._consecutive_direction_rejections += 1
        else:
            self._consecutive_direction_rejections = 0

        if accepted:
            c = candidates[best_idx]
            if self.identity_state == "reacquiring":
                self.reacquisition_count += 1
            result_state = "tracked"
            if self.state.center is not None and dt and dt > 0:
                vx = (c.cx - self.state.center[0]) / dt
                vy = (c.cy - self.state.center[1]) / dt
                self.state.velocity = (vx, vy)
                self.state.max_abs_velocity = max(self.state.max_abs_velocity, math.hypot(vx, vy))
            self.state.center = (c.cx, c.cy)
            self.state.height = c.h
            self.state.time = time_s
            self.consecutive_unverified = 0
            self.frames_since_lost = 0
            self._last_accepted_cx = c.cx
        else:
            self.consecutive_unverified += 1
            if result_state == "tracked" and self.consecutive_unverified >= CONSECUTIVE_UNVERIFIED_BEFORE_LOST:
                result_state = "reacquiring"
            elif result_state == "reacquiring":
                self.frames_since_lost += 1
                if self.frames_since_lost > REACQUISITION_MAX_FRAMES:
                    result_state = "terminated"

        self.identity_state = result_state
        if self._consecutive_direction_rejections >= SUSTAINED_OPPOSITE_DIRECTION_FRAMES:
            self.identity_state = "reacquiring"
            self.consecutive_unverified = max(self.consecutive_unverified, CONSECUTIVE_UNVERIFIED_BEFORE_LOST)
            self._consecutive_direction_rejections = 0
            identity_switch = True
            self.identity_switch_count += 1

        return {
            "frame": frame_index,
            "timeS": time_s,
            "selectedIndex": best_idx if accepted else None,
            "verified": accepted,
            "identityState": self.identity_state,
            "candidates": per_candidate,
            "configuredDirection": self.travel_direction,
            "identitySwitch": identity_switch,
            "verifiedCenter": self.state.center if accepted else None,
            "predictedCenter": (
                (self.state.center[0] + self.state.velocity[0] * dt, self.state.center[1] + self.state.velocity[1] * dt)
                if (self.state.center is not None and dt) else self.state.center
            ),
            "identityPromotionReason": self.last_promotion_reason,
        }
