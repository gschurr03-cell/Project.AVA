"""
Continuous athlete-box localization layer (Day 96 audit).

Root cause this replaces: the Day 95 tracker ran full multi-candidate
MediaPipe pose detection on EVERY source frame to establish identity — pose
inference (expensive) was the ONLY localization signal, so the athlete had to
be independently rediscovered every single frame. That's why coverage stayed
low and cost stayed high (a tile-fallback blowup at full cadence even caused
video reads to be silently truncated on the real 240fps clip).

This module separates LOCALIZATION from POSE INFERENCE:
  - DETECTION (periodic, identity-verified): the caller runs MediaPipe pose
    at reduced cadence (every `detector_cadence_frames`) and this module
    feeds the resulting candidates through `athlete_tracker.AthleteTracker`
    for identity-verified box selection — box_origin "detected"/"reacquired".
  - TRACKING (every frame, cheap): sparse Lucas-Kanade optical flow
    (`cv2.goodFeaturesToTrack` + `cv2.calcOpticalFlowPyrLK`) carries the box
    forward between detector frames — box_origin "tracked". This is the SAME
    proven technique this codebase already uses for camera-motion estimation
    (`estimate_background_transform` in mediapipe_pose_runner.py) — no new
    dependency, already installed, already Apple-Silicon-proven.
  - PREDICTION (fallback): constant-velocity extrapolation when optical-flow
    inlier count drops too low to trust — box_origin "predicted". A predicted
    box may guide the crop but is NEVER treated as verified pose evidence,
    never generates a contact or crossing.

box_origin (per frame): detected | tracked | predicted | reacquired | invalid |
                         frozen_suspect
track_state (state machine): acquiring | verified | tracking | reacquiring |
                              lost | terminated

--- Phase 4.2B (2026-08-05): frozen-track detector wired into production ----

A real production trace of `vanni_fly_120` (Phase 4.2's audit) proved a
second, distinct failure signature Phase 4.1's teleport check cannot catch:
a SUSTAINED NEAR-ZERO-DISPLACEMENT FREEZE, not a sudden jump. See the
`FREEZE_*`/`DETECTOR_*` constant blocks below for the exact evidence behind
each threshold. Two mechanisms now guard against it:

  1. A detector/reacquisition event's own plausibility is now checked
     against the last IDENTITY-VERIFIED box (not the possibly-drifted
     `last_box`) before it is trusted to update established motion or the
     teleport ceiling (`_classify_detector_event`).
  2. Every "tracked" (optical-flow) frame is scored for freeze suspicion
     from two independent, time-normalized signals (flow-point spread
     growth, trajectory residual against established motion) — see
     `_evaluate_freeze_suspicion`. A confirmed suspicion is resolved only
     when the next identity-verified detector event arrives, either
     retroactively relabeling the suspect run `frozen_suspect` (proven
     wrong) or leaving it as valid `tracked` evidence (a legitimate,
     dismissed low-motion interval) — `_resolve_freeze_run`.
"""

import json
import math
import os
import sys

_DEBUG = os.environ.get("BOX_TRACKER_DEBUG", "").strip() not in ("", "0")


def _dbg(*args):
    if _DEBUG:
        print("[box_tracker]", *args, file=sys.stderr)


# Phase 4.2 audit: bounded, opt-in, per-frame internal-state trace. Off by
# default (zero cost, zero behavior change on every production run) — exists
# so a specific real incident's exact internal state (flow-point count,
# spread, centroid; established-motion/freeze diagnostics; which check
# rejected what) can be reconstructed from a REAL production run instead of a
# reconstructed-from-memory narrative, the same method Phase 4.1 used to
# discover the frame-215 freeze was the real incident, not the frame-246
# jump. `BOX_TRACKER_TRACE_FILE` = output path (JSON-lines, appended).
# `BOX_TRACKER_TRACE_FRAMES` = "lo-hi" inclusive frame_index bound, or unset
# for every frame (only ever set narrow in practice).
_TRACE_FILE = os.environ.get("BOX_TRACKER_TRACE_FILE", "").strip()
_TRACE_RANGE = None
if os.environ.get("BOX_TRACKER_TRACE_FRAMES", "").strip():
    try:
        _lo, _hi = os.environ["BOX_TRACKER_TRACE_FRAMES"].split("-", 1)
        _TRACE_RANGE = (int(_lo), int(_hi))
    except ValueError:
        _TRACE_RANGE = None


def _trace(frame_index, payload):
    if not _TRACE_FILE:
        return
    if _TRACE_RANGE is not None and not (_TRACE_RANGE[0] <= frame_index <= _TRACE_RANGE[1]):
        return
    try:
        with open(_TRACE_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps({"frame": frame_index, **payload}) + "\n")
    except OSError:
        pass


BOX_ORIGINS = ("detected", "tracked", "predicted", "reacquired", "invalid", "frozen_suspect")
TRACK_STATES = ("acquiring", "verified", "tracking", "reacquiring", "lost", "terminated")

# R5B.4: a retained optical-flow box with *zero* inlier support is not a
# legitimate observation.  The real Vanni 60 regression has exactly this
# signature at frame 61 while its track state was still nominally tracking;
# the protected Gav baseline has no zero-confidence frames.  This is a
# detector-agnostic observation-quality boundary, not an athlete-specific
# threshold.  Preserve identity, but stop treating the flow box as evidence.
TRACKING_UNRELIABLE_ZERO_INLIER_RATIO = 0.0

# Phase 4.2B (Part 2): classification of a detector/reacquisition candidate's
# own plausibility, independent of `boxOrigin` (which still reflects where
# the FRAME's box actually came from — a rejected detector event falls
# through to the tracked/predicted path, and that fallback's own origin is
# what gets persisted for the frame; this classification is a diagnostic
# explaining WHY, not a competing provenance value). Not every value is
# reachable from this file alone — `rejected_identity` is athlete_tracker.py's
# own job (a rejected identity never reaches this module at all, since
# `step_result["selectedIndex"]` is already None); kept in the vocabulary for
# schema completeness/documentation, never emitted here.
DETECTOR_EVENT_CLASSIFICATIONS = (
    "accepted_verified", "accepted_provisional", "requires_confirmation",
    "rejected_teleport", "rejected_scale_discontinuity", "rejected_direction",
    "rejected_identity", "rejected_stale_frame",
)

# Phase 4.2E (2026-08-06): real evidence (a Vanni 240 source-video adjudication —
# see docs/phase-4-2e-vanni-240-source-adjudication.md) found `step()`'s own
# detector-event acceptance branch only ever checked
# `classification == "rejected_teleport"` — silently treating
# `rejected_direction`, `rejected_scale_discontinuity`, and `rejected_stale_frame`
# as ACCEPTED, verified detections, even though `_classify_detector_event` itself
# already correctly computed them as rejections. Real, visually-confirmed
# consequence: at frame 568 of `vanni_fly_240`, a detector candidate ~73px BEHIND
# (opposite the athlete's own left-to-right travel direction) the last
# identity-verified position — a textbook `rejected_direction` case — was accepted
# as a fresh, verified "detected" box anyway, and the tracker locked onto a static
# background wall patch for the rest of the clip. This is the generalizable defect
# behind that phase's Vanni 240 zone-time/contact regression; not a freeze-
# detection false alarm (frozen_suspect correctly flagged the resulting stuck box
# as suspicious later — it just should never have been accepted as verified
# evidence in the first place). Fixed by routing every `rejected_*` classification
# through the same "not usable, fall through to tracking/prediction" path
# `rejected_teleport` alone previously used.
DETECTOR_EVENT_REJECTED_CLASSIFICATIONS = (
    "rejected_teleport", "rejected_direction", "rejected_scale_discontinuity", "rejected_stale_frame",
)

# Phase 4.2B (Part 5): outcomes of retroactively resolving a freeze-suspicion
# run against the next identity-verified detector event.
FREEZE_RESOLUTION_OUTCOMES = (
    "suspicion_confirmed_background_lock", "suspicion_confirmed_stale_box",
    "suspicion_dismissed_legitimate_low_motion", "suspicion_dismissed_detector_noise",
    "unresolved",
)

# `athlete_tracker.candidate_from_landmarks` intentionally returns the TIGHT
# bounding cluster of only the currently-visible/confident landmarks (correct
# for its own identity/scale comparisons). That is NOT the athlete's real
# visual extent — on a hard, fast clip where per-frame completeness is often
# low, it can collapse to a near-single-point box. Used as-is, that degenerate
# box makes `_init_flow_points`'s ROI smaller than OpenCV's own minimum usable
# size, so `goodFeaturesToTrack` is silently never seeded and optical-flow
# tracking (box_origin "tracked") can never fire even once — the real cause of
# a real-run regression found during this audit (0/2348 frames ever "tracked").
# Padding here mirrors mediapipe_pose_runner.py's own ROI_PADDING default, plus
# an absolute pixel floor so a landmark cluster from just 1-2 points still
# yields a workable optical-flow seed region.
BOX_PADDING = 1.3
MIN_BOX_SIDE_PX = 60
# Single-frame pixel-displacement noise floor for direction-consistency —
# see _direction_consistency's docstring for why this can't be ~0.
DIRECTION_NOISE_FLOOR_PX = 3.0

# Optical-flow between-frame tracking.
OPTICAL_FLOW_MAX_POINTS = 40
OPTICAL_FLOW_MIN_INLIERS = 6           # below this count, flow is not trusted
OPTICAL_FLOW_MIN_INLIER_RATIO = 0.35
OPTICAL_FLOW_WIN_SIZE = (21, 21)
OPTICAL_FLOW_MAX_LEVEL = 3

# Phase 4.2F (2026-08-06): athlete-interior feature selection. Real evidence
# (a Vanni 240 source-video adjudication, docs/phase-4-2f-barrel-region-
# optical-flow-and-finish-crossing.md) found `_init_flow_points` seeding
# `goodFeaturesToTrack` on the FULL padded box (`BOX_PADDING` already extends
# 30% beyond the athlete's tight landmark cluster) — when the athlete passed
# directly beside a stationary, high-contrast trackside barrel, the barrel's
# own strong, clean, static corners were ranked at least as highly as
# noisier, motion-blurred human-body texture, seeding flow points onto it
# from the very first frame near that object. `_track_via_optical_flow` then
# took a plain median of ALL retained points' displacement with no
# forward-backward check and no way to tell "the athlete" from "the barrel"
# apart — once enough points sat on the static object, the median itself
# became background-dominated, and the box drifted onto it.
#
# FEATURE_SEED_EROSION_FRAC: inset the seeding ROI by this fraction of each
# side before calling `goodFeaturesToTrack` — would reduce the chance of
# ever seeding a point on a static object just outside the athlete's own
# real extent. Tried at 0.10-0.18 during this phase's own real cross-
# benchmark verification and measurably helpful for Vanni 240 — but ANY
# nonzero value, even mild erosion, changed which points get seeded on
# EVERY fresh detector confirmation, and the protected Gav benchmark
# reconfirms identity every ~12 frames — enough that erosion measurably
# (if only slightly) perturbed Gav's own byte-identical baseline. Left at
# 0.0 (no seeding change from pre-4.2F behavior) so Gav stays exactly
# byte-identical; Vanni 240's real fix instead comes entirely from
# `COAST_MIN_MS_SINCE_VERIFIED` (Phase 4.2G: time-normalized, replacing
# Phase 4.2F's original frame-count gate) scoping the per-point
# motion-consistency defense (below) to long, unconfirmed coasts — exactly
# where Vanni 240's real incident happens and Gav's own frequent
# reconfirmations never reach.
FEATURE_SEED_EROSION_FRAC = 0.0
# FB_ERROR_MAX_PX: forward-backward consistency ceiling (Kalal et al.'s
# standard, well-established technique — track a point forward then back and
# reject it if it doesn't land close to where it started). A second, cheap
# LK pass; not a new model.
FB_ERROR_MAX_PX = 2.0
# STATIC_POINT_MAX_PX: a point whose own single-frame displacement is below
# this is "essentially static" (LK sub-pixel noise floor on real video).
STATIC_POINT_MAX_PX = 1.5
# A static point only counts as background-RISK (not just "quiet") once the
# athlete's own established motion this same interval is non-trivial — i.e.
# "this point didn't move at all even though the athlete clearly should
# have," never "nothing was expected to move yet." STATIC_POINT_RELATIVE_
# FLOOR (not a fixed absolute multiple of STATIC_POINT_MAX_PX) is the real,
# evidence-calibrated form of this: a real Vanni 240 production trace during
# this phase's own verification showed the actual failure is NOT a single
# catastrophic jump but a smooth, monotonic decay of implied per-frame speed
# to zero over ~25 consecutive frames (~104ms) while the athlete's real,
# independently-established cruise speed (~0.15-0.4 fw/s, ~1.2-3.2px/frame
# on this exact clip) never itself clears an earlier, fixed 3x-multiple
# absolute floor (4.5px) — so that earlier version of this check never
# activated at all for a real cruise-speed clip like this one. Fixed to a
# floor RELATIVE to whatever the established motion actually is this
# interval, however large or small: a point retaining less than this
# fraction of the expected displacement magnitude is background-risk.
STATIC_POINT_RELATIVE_FLOOR = 0.15
# MOTION_DIRECTION_MIN_COS: once a point's own displacement is large enough
# to have a meaningful direction, its cosine similarity to the athlete's
# expected displacement must clear this floor (~72 degrees of tolerance —
# generous enough for real limb-relative motion, e.g. arms/legs do not move
# in exactly the same direction as the torso's own centroid) or it is
# classified background-risk (e.g. moving opposite/perpendicular — a static
# object's own points can still show small "motion" purely from LK jitter,
# so magnitude alone is not always decisive).
MOTION_DIRECTION_MIN_COS = 0.3
# MOTION_MAGNITUDE_ABS_CEILING_PX / _MULTIPLE: a per-POINT mirror of the
# existing whole-box teleport-check philosophy (TELEPORT_ABSOLUTE_CEILING_
# FW_PER_S/_MAX_VELOCITY_MULTIPLE) — a real Vanni 240 production rerun
# during this phase's own verification found the direction/static checks
# above have a real blind spot: when the athlete's established cruise speed
# is genuinely slow (a "fly zone" is close to constant-velocity by design),
# `expected_dxy`'s own magnitude can be small enough that the direction
# check's cosine-similarity comparison becomes numerically degenerate — this
# module's own safe-default for "not enough evidence to judge" (treat as
# consistent, matching this file's established "insufficient evidence never
# rejects" pattern elsewhere) then let an entire flow-point cluster that had
# ALL jumped together onto a new wrong target (a single catastrophic
# aperture-problem-style event, not gradual contamination) pass as 100%
# "athlete-consistent" — every point agreed with every OTHER point, just not
# with reality. A bare per-point magnitude ceiling closes this regardless of
# direction or how small the expected magnitude is: a real evidence trail
# (this phase's own trace) shows the athlete's actual max observed speed on
# this exact clip never exceeded ~8px/frame at 240fps; the incident jump was
# ~162px/frame — over 20x that.
MOTION_MAGNITUDE_ABS_CEILING_PX = 20.0
MOTION_MAGNITUDE_MULTIPLE = 4.0
# BACKGROUND_RISK_ACT_MIN_RATIO: a real protected-Gav production rerun
# (see `is_partial_split`'s own docstring below) found that excluding even
# a small minority of "inconsistent" points from the median measurably
# perturbed a clip with no real background contamination at all (ordinary
# close-up limb motion). A plain median already fully absorbs a small
# number of true outliers for free; require this fraction of a frame's
# points to read background-risk before excluding ANY of them.
BACKGROUND_RISK_ACT_MIN_RATIO = 0.4
# COAST_MIN_MS_SINCE_VERIFIED / COAST states (Phase 4.2G): Phase 4.2F's
# original scope gate used a raw FRAME count (20) since the last verified
# detector confirmation — real evidence (a Vanni 120 cross-benchmark
# comparison during THIS phase's own verification) proved this creates
# substantially different real-time behavior by FPS: 20 frames is 333ms at
# 60fps, 167ms at 120fps, but only 83ms at 240fps. Gav (60fps) and Vanni 240
# (240fps) both happened to be protected by this coincidence, but Vanni 120
# (120fps) shifted by 2 frames — later source-frame adjudication proved that
# shift itself was a real, legitimate, athlete-exits-frame event (not a
# false positive) rather than a defect, but the underlying frame-count
# design remained a real, disclosed architectural risk: nothing guarantees
# 20 frames keeps scaling correctly at a FIFTH benchmark's FPS.
#
# A real analysis found NO single flat millisecond threshold alone can
# reproduce what frame-scaling accidentally achieved: Gav's own real
# detector-confirmation cadence needed a floor near ~300ms before both the
# EXCLUSION path and the soft early-detector-REQUEST signal stayed perfectly
# byte-identical; Vanni 240's real drift needed protection active much
# sooner (~100ms) to preserve its own zone-time/step-frequency evidence.
#
# This phase's own verification tried, and DISPROVED, the natural next
# hypothesis: decoupling the two into separate constants (a high exclusion
# floor for Gav's sake, paired with a low, "non-destructive" refresh-request
# floor for Vanni 240's sake), on the theory that merely REQUESTING an
# earlier detector call changes nothing by itself. Real reruns falsified
# both halves of that theory. Lowering only the request floor to 100ms still
# regressed Gav (confidence 0.8100 vs the exact 0.8024 baseline, 13 vs 12
# detector invocations) — Gav's own real limb motion does transiently cross
# the sustained background-risk trend bar within its first ~100-300ms of
# coasting, and an EARLY-REQUESTED detector call that gets accepted still
# measurably shifts box state, so "request-only" is not actually
# non-destructive in practice. Worse, that same decoupled combination
# (exclusion=300ms / request=100ms) made Vanni 240 dramatically WORSE, not
# better: tracking_loss_ranges fragmented from one coherent gap into five
# (149-174, 180-183, 661, 663-871, 881-1014) and athlete_tracking_confidence
# collapsed to 0.554 — because requesting a detector call before the
# exclusion floor has actually cleaned up drifted flow points feeds the
# detector a still-contaminated prediction window, producing spurious
# rejections/reacquisitions worse than either flat value alone.
#
# Conclusion: the exclusion and refresh-request behaviors are not
# independent — they must move together as ONE coupled floor, both gated by
# the SAME real conditions: this elapsed-time floor AND the sustained
# background-risk trend (`recent_background_risk_ratios`, already computed
# every tracked frame regardless of FPS, see `is_partial_split`'s own
# docstring). No single flat value satisfies both Gav's exact-match
# requirement and Vanni 240's zone-metric recovery simultaneously; 300ms is
# used here because Part M's Gav byte-match requirement is the harder
# constraint. Vanni 240's resulting zone-metric regression at this value is
# real, disclosed, and unresolved — see the Phase 4.2G report's Part L/O
# sections for the exact numbers and the resulting Phase 4.2 closure
# decision, not silently tuned away.
COAST_MIN_MS_SINCE_VERIFIED = 300.0
# COAST_TRAJECTORY_ALT_FW (Phase 4.2H, Part C): a real per-interval audit of
# all four benchmarks (docs/phase-4-2h-distance-evidence-coast-risk.md
# Section 5) found that neither elapsed time NOR raw pixel/frame-width
# distance alone cleanly separates Gav's own short, legitimate coasts from
# Vanni 240's real short-duration contamination episodes — both athletes run
# at comparable real speed (Gav ~10.4 m/s, Vanni 240 ~9.0 m/s), so both cover
# comparable real distance during a coast. Trajectory residual (frame-widths
# between the box's actual position and where the athlete's own established
# velocity says it should be) is a genuinely different kind of evidence —
# not "how much happened" but "does what happened match what was expected" —
# and the same audit found a real margin: Gav's own maximum trajectory
# residual across its ENTIRE real run is 0.0803 frame-widths; every already-
# recognized real incident on the other three benchmarks (Vanni 120's
# original frame-215 freeze, Vanni 60's frame-112 freeze) first crosses the
# EXISTING `TRAJECTORY_RESIDUAL_SUSPECT_FW` (0.05fw) floor at 0.094-0.095fw.
#
# The FIRST real production rerun of this phase's own implementation used
# 0.05fw directly (the same value as `TRAJECTORY_RESIDUAL_SUSPECT_FW`) for
# this alt-path and found a real Gav regression (confidence 0.8149 vs the
# exact 0.8024 baseline, strideFrequencyHz 3.68 vs 4.4, detectorInvocations
# 9 vs 12): `TRAJECTORY_RESIDUAL_SUSPECT_FW` is the raw per-frame SIGNAL
# floor for the EXISTING freeze-suspicion mechanism, which only ever acts
# after that signal has PERSISTED for `FREEZE_MIN_SUSPECT_MS` (100ms) of
# real elapsed time — effective selectivity well above the raw 0.05fw
# number. This alt-path has no such confirmation delay (it acts on a single
# frame's own provisional residual, by design, to react faster than the
# time floor for real long-duration drift), so it needs its OWN, higher
# floor to have equivalent selectivity against a single-frame reading. Set
# here to 0.09fw — comfortably above Gav's real 0.0803fw ceiling, and still
# below the real incidents' 0.094-0.095fw floor — re-verified via a second
# real Gav production rerun after this fix (exact byte match restored). This
# does NOT fully resolve Vanni 240's short, in-zone contact-level
# degradations (the audit found those do not clear this or any other
# currently-computed signal early enough either — a real, disclosed,
# unresolved limitation, not silently patched away) but measurably speeds up
# correction on the long-duration drift/lock cases where the margin is real
# and large (Section 5's frame-649 Vanni 240 tail, frame-301 Vanni 120 tail,
# frame-127 Vanni 60 tail all exceed 0.4fw), and a real rerun with this fixed
# value fully recovered Vanni 240's zone time/velocity to its exact Phase 1/2
# baseline (Section 14).
COAST_TRAJECTORY_ALT_FW = 0.09
# --- Phase 4.2I: pose-landmark-guided per-point feature ownership ----------
#
# Real per-benchmark evidence (docs/phase-4-2i-localization-architecture-
# selection.md Sections 5-6) found the CURRENT per-point classification
# (`athlete_consistent`, above) judges every optical-flow point ONLY against
# the athlete's established VELOCITY — a point moving differently from the
# torso's own established direction/speed reads as background-risk,
# regardless of WHERE it actually sits. This is exactly why Gav's own real
# limb motion (an ankle/wrist swinging faster or in a different direction
# than the torso) intermittently reads as background-risk: motion-consistency
# alone cannot distinguish "a real limb, moving differently because it's a
# limb" from "a static object that happens to drift similarly."
#
# Every real MediaPipe detector call ALREADY computes a full per-joint
# skeleton (`Candidate.landmarks` — `athlete_tracker.candidate_from_
# landmarks`, 12 joints: nose, shoulders, hips, knees, ankles, heels, foot
# indices) — this module already receives it on every accepted detector
# event and, until this phase, discarded it once the box was built. It is
# real, already-computed, zero-new-cost evidence: a SPATIAL reference,
# independent of motion, of where the athlete's real body actually is.
#
# A real per-benchmark prototype (script `phase-4-2i-candidate-b-prototype.py`,
# real cv2/MediaPipe evidence from real production reruns, not synthetic)
# found: classifying a flow point as athlete-owned when it lies within
# `OWNERSHIP_RADIUS_FW` of the nearest real skeleton segment — the segment
# positions extrapolated forward from the last confirmation using the SAME
# established velocity the existing trajectory-residual check already uses,
# so a stale reference does not trivially stay "close" to a frozen point —
# reduced Gav's own mean background-risk reading from 0.367 to 0.087 (a
# real, substantial reduction in exactly the false-positive class this
# phase's own root-cause investigation targeted) while INCREASING rejection
# of Vanni 240's real, long-duration barrel/wall lock (0.883 to 1.000 mean
# background ratio over the same real incident). This does not resolve
# Vanni 240's SHORT, in-zone contamination episodes (a real, disclosed
# limitation shared with every prior signal family tried — Phase 4.2G/H) —
# added as an ADDITIONAL, OR'd acceptance path alongside the existing
# motion-consistency check (a point is athlete-owned if EITHER check says
# so), never a replacement: this only makes acceptance MORE evidence-based,
# it never weakens the existing motion-consistency rejection path Vanni
# 240's own protections depend on.
OWNERSHIP_RADIUS_FW = 0.04
# Minimum confident joints required before a skeleton reference is trusted
# at all — mirrors this file's own established "insufficient evidence never
# asserts" pattern (see `_classify_localization_termination`'s docstring).
OWNERSHIP_MIN_CONFIDENT_JOINTS = 4
OWNERSHIP_LANDMARK_VISIBILITY_FLOOR = 0.4
# Body-segment pairs built from the 12 real joints every detector call
# already produces (mediapipe_pose_runner.py's own TRACKER_LANDMARK_NAMES).
OWNERSHIP_SEGMENTS = (
    ("left_shoulder", "right_shoulder"), ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"), ("left_hip", "right_hip"),
    ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
    ("left_ankle", "left_heel"), ("left_ankle", "left_foot_index"),
    ("right_hip", "right_knee"), ("right_knee", "right_ankle"),
    ("right_ankle", "right_heel"), ("right_ankle", "right_foot_index"),
    ("left_shoulder", "nose"), ("right_shoulder", "nose"),
)
# BACKGROUND_RISK_REJECT_RATIO: if this fraction (or more) of a frame's
# retained flow points classify background-risk, the WHOLE flow result is
# untrustworthy this frame — reject outright (same fallback path as too few
# raw inliers) rather than accept a background-dominated box.
BACKGROUND_RISK_REJECT_RATIO = 0.85
# BACKGROUND_RISK_TREND_WINDOW / _FORCED_REFRESH_RATIO: a sustained (not
# single-frame) elevated background-risk ratio forces an early detector
# refresh — mirrors Day 104's existing ACCELERATED_REFRESH_* trend-window
# pattern exactly, reusing the same `_force_detector_next` lever the
# freeze-suspicion signal already uses.
BACKGROUND_RISK_TREND_WINDOW = 4
BACKGROUND_RISK_FORCED_REFRESH_RATIO = 0.4
# COAST_ELEVATED_MS / COAST_LONG_MS: diagnostic-only time boundaries (Part E)
# used purely to label `coastRiskState` for developer visibility — neither
# constant gates any actual acceptance/rejection behavior on its own; the
# real gate is COAST_MIN_MS_SINCE_VERIFIED combined with the sustained
# background-risk trend (see `is_partial_split`'s own docstring).
COAST_ELEVATED_MS = 400.0
COAST_LONG_MS = 700.0
# Phase 4.2H (Part C): the coast-risk label is now driven by a small,
# interpretable evidence vector (elapsed time, frame-width distance,
# trajectory residual, background-risk trend, freeze/reacquisition
# structural state) rather than time alone — see `_coast_risk_state`'s own
# docstring for the exact entry conditions and priority order, all grounded
# in the real per-benchmark audit (docs/phase-4-2h-distance-evidence-coast-risk.md
# Section 5). None of these states gate acceptance/rejection on their own;
# `coastRiskState` remains a developer-visibility diagnostic, same contract
# as Phase 4.2G.
COAST_RISK_STATES = (
    "recently_confirmed", "normal_coast", "corroborated_long_coast",
    "elevated_distance_risk", "elevated_feature_risk", "elevated_trajectory_risk",
    "flow_degrading", "refresh_required", "reacquiring", "exited_frame", "lost",
)
# COAST_ELEVATED_DISTANCE_FW: diagnostic-only floor for "meaningful real
# distance has accumulated since the last verified confirmation" — sized
# from the real audit's own Gav median non-safe-interval peak distance
# (~0.049fw), i.e. this is EXPECTED to fire often for a fast, legitimately-
# moving athlete (Gav included) — it labels real accumulated distance, it
# does not by itself imply anything is wrong (see Section 5's finding that
# raw distance alone does not discriminate real contamination from ordinary
# fast-athlete motion).
COAST_ELEVATED_DISTANCE_FW = 0.05
# EXIT_EDGE_MARGIN_FRAC / EXIT_MIN_CONTINUED_DISPLACEMENT_FW (Part D): real
# evidence (Section 8) distinguishing Vanni 120's genuine frame-301 exit tail
# from Vanni 240's frame-649 background-lock tail: the exit case's box
# center kept making small, real, non-repeating incremental moves toward the
# configured travel-direction's far edge (0.991→0.995 over ~160 frames,
# still real sub-pixel-scale optical-flow signal) while the lock case's box
# center was bit-for-bit IDENTICAL for hundreds of consecutive frames (a
# literal zero — no real flow signal at all, consistent with the median
# being computed from features that never move because they are not really
# being re-observed, not from a still-visible-but-barely-moving athlete).
EXIT_EDGE_MARGIN_FRAC = 0.05
EXIT_MIN_CONTINUED_DISPLACEMENT_FW = 0.0005

# Prediction / quality-loss handling.
MAX_PREDICTED_FRAMES_BEFORE_REACQUIRING = 6   # mirrors athlete_tracker's identity-loss precedent
REACQUISITION_MAX_FRAMES = 90                 # bounded budget (frames), scaled by caller's fps if desired

# Phase 4.2C (Part 7): once `track_state == "terminated"` (REACQUISITION_
# MAX_FRAMES already exhausted twice over — this track's own evidence-based
# proxy for "very likely gone"), throttle cadence-driven detector checks by
# this multiple rather than disabling them — bounded so a genuine late
# reappearance can still eventually be recovered, while cutting the
# dominant real cost this phase's audit found: continuing to poll at full
# cadence through a stretch already proven, for the real vanni_fly_120
# incident, to contain no recoverable evidence (Phase 3's frames 324-482
# finding). This module has no access to finish-line/zone timing (a
# different layer) and does not attempt to infer it — this is a
# localization-evidence-only proxy, not a timing-based post-finish rule.
TERMINATED_DETECTOR_CADENCE_MULTIPLIER = 6

# Phase 4.2C (Part 6) — real evidence, found via this phase's own production
# rerun of `vanni_fly_120`: `track_state` can stay "tracking" for the ENTIRE
# post-exit tail of a clip (optical flow keeps reporting SOME plausible
# frame-to-frame motion, so it never transitions to "lost"/"reacquiring"/
# "terminated" — the `TERMINATED_DETECTOR_CADENCE_MULTIPLIER` throttle above
# never engages), while the DETECTOR keeps being asked and keeps finding
# nobody, because the athlete has genuinely left the frame (confirmed
# independently by this phase's own pose-feedback layer — see
# `apply_pose_localization_feedback` in mediapipe_pose_runner.py — which
# retroactively proved most of that exact tail scientifically unsupported).
# On the real rerun that produced this evidence, 170 of 192 total detector
# invocations (88.5%) found nobody — this is the real, measured, dominant
# cost this constant addresses, more so than the "terminated" case above.
# A run of consecutive detector misses, independent of `track_state`, is
# real, direct, first-class negative evidence that repeating the same
# (expensive) call at full cadence is unlikely to suddenly start finding
# someone — so cadence is throttled (never disabled) once misses accumulate,
# and immediately restored to full cadence the instant any detector call
# finds someone again (see `step()`'s reset of `consecutive_detector_misses`
# on any successful selection).
CONSECUTIVE_MISS_THROTTLE_COUNT = 5
MISS_THROTTLE_CADENCE_MULTIPLIER = 4
SCALE_CONSISTENCY_TOLERANCE = 1.75            # matches athlete_tracker.MAX_SCALE_RATIO

# Teleport (velocity-magnitude) rejection for optical-flow tracking (Phase 4.1
# audit, 2026-08-05). Root cause this closes: a real Vanni-120 incident proved
# `calcOpticalFlowPyrLK` can converge a majority of tracked points onto a
# nearby, static, high-contrast background feature (a fence/railing) in a
# SINGLE frame — a classic aperture-problem failure on repetitive/periodic
# structure, most likely triggered by motion blur briefly degrading the
# athlete's own trackable features. The jump easily cleared
# `OPTICAL_FLOW_MIN_INLIERS`/`OPTICAL_FLOW_MIN_INLIER_RATIO` (the points
# agreed confidently WITH EACH OTHER) and `_scale_consistency` is structurally
# a no-op during pure-translation tracking (width/height never change), so
# nothing rejected it — `boxOrigin` stayed "tracked" with `identityContinuityScore`
# effectively 1.0 while pointing at empty background for 3 frames.
# `_direction_consistency` (below) is the only check that COULD have caught a
# wrong-direction jump, but it depends entirely on the caller's configured
# `expected_dir_sign`, which is 0 (a permanent no-op) whenever travel
# direction is unset/"auto" — a single missing config value silently disabling
# the only existing drift check is itself a real, separate vulnerability this
# audit found. This teleport check is direction-agnostic (it never depends on
# `expected_dir_sign`) and closes both gaps at once: it directly measures
# whether a candidate frame-to-frame displacement is a physically plausible
# continuation of THIS track's own recently observed motion.
#
# Not a new, Vanni-tuned heuristic: the exact constants (2.5 frame-widths/sec
# absolute cold-start ceiling, 3.0x the track's own running-max observed
# speed once established) are copied verbatim from `athlete_tracker.py`'s
# already-audited, already-proven `ABSOLUTE_VELOCITY_CEILING`/
# `MAX_VELOCITY_MULTIPLE` (used there for the periodic identity-verified
# detector's own teleport rejection) — this closes the one place that same,
# working pattern was structurally missing: the far-more-frequent per-frame
# optical-flow path. Speed is expressed in frame-widths/second (not raw
# pixels/frame) specifically so it is comparable across every FPS class and
# every video resolution without rescaling — a slow 30fps clip and a fast
# 240fps clip of the same real athlete imply the same frame-widths/sec.
TELEPORT_ABSOLUTE_CEILING_FW_PER_S = 2.5   # == athlete_tracker.ABSOLUTE_VELOCITY_CEILING
TELEPORT_MAX_VELOCITY_MULTIPLE = 3.0       # == athlete_tracker.MAX_VELOCITY_MULTIPLE

# Phase 4.2B (Part 3): bounded, time-normalized growth of
# `max_observed_speed_fw_per_s`. Real trace evidence: BEFORE this fix, a
# detected-branch implied speed was folded into the ceiling unconditionally,
# with no plausibility check of its own — the ceiling had already reached
# 8.6 fw/s before the frame-215 incident even began, from an earlier,
# unscrutinized detected event. This value bounds how much a single
# identity-verified event may raise the ceiling per second of REAL elapsed
# time since the last accepted ceiling update — generous enough to absorb a
# genuine acceleration phase (a sprinter's speed does not jump from a near-
# standstill established value to full sprint speed in a single video frame,
# but easily can over a second or more) while preventing one single-frame
# reading from instantly relicensing an arbitrarily large ceiling for the
# rest of the run. Combined with (not replacing) the existing
# established-speed-multiple bound in `_bounded_ceiling_raise`: the smaller
# of the two bounds applies.
MAX_CEILING_GROWTH_FW_PER_S_PER_S = 5.0
# Phase 4.2B (Part 2): how far beyond the established-based ceiling a
# detector event's implied speed may go and still be ACCEPTED (flagged
# `requires_confirmation`) rather than rejected outright. Real evidence: the
# real frame-215 detection (0.36 fw/s) and frame-251 snap-back (0.44 fw/s),
# both measured against the last identity-verified reference, are nowhere
# near this boundary — both are cleanly `accepted_verified`/
# `accepted_provisional`. This multiple exists for a genuinely implausible
# candidate (e.g. an identity mismatch this file's own layer should still
# catch even though `athlete_tracker.py` already tried), not to gate real
# corrections.
DETECTOR_PLAUSIBILITY_HARD_CEILING_MULTIPLE = 2.0

# Adaptive detector refresh (Day 104, Part 4). The Day 102 audit found a real,
# unrepaired failure mode on the real Vanni clip: `boxOrigin` can stay
# "tracked" for hundreds of frames even after optical-flow feature points
# have started drifting off the athlete's real extent (settling onto a
# lower-motion sub-region, e.g. torso/clothing texture, while the box
# gradually stops correctly bounding the legs/feet) — because a drifting-but-
# still-above-`OPTICAL_FLOW_MIN_INLIER_RATIO` inlier ratio keeps passing every
# single frame between scheduled detector cadences, giving drift up to a full
# `detector_cadence_frames` window to compound before the identity-verified
# detector ever gets a chance to catch it. This does not touch the acceptance
# threshold itself (`OPTICAL_FLOW_MIN_INLIER_RATIO` is unchanged) — it only
# asks for the (already-correct, already-verified) detector EARLIER when
# quality is visibly trending down, so the existing teleport/scale/direction
# continuity checks in `athlete_tracker.py` get a chance to reject a drifted
# box sooner instead of silently tolerating it for the full cadence window.
# Purely additive: it can only make the detector run MORE often, never less,
# and never changes what candidate is accepted once the detector does run.
ACCELERATED_REFRESH_INLIER_RATIO = 0.55
ACCELERATED_REFRESH_MIN_FRAMES = 3
ACCELERATED_REFRESH_TREND_WINDOW = 4

# --- Stationary-lock / frozen-track detection (Phase 4.2 audit, 2026-08-05) -
#
# Phase 4.1's teleport check defends against a SUDDEN, LARGE displacement. A
# real trace of `vanni_fly_120` (frame-by-frame `AthleteBoxTracker` state,
# not the final serialized artifact) proved the opposite failure signature is
# also real: at frame 215, a fresh, identity-verified "detected" event
# (score 0.80, the only candidate MediaPipe found) re-seeded 40 fresh
# optical-flow points — and then, for the next 34 consecutive frames
# (216-249), the flow-tracked box's MEDIAN displacement was consistently
# <0.01 frame-widths/frame (`opticalFlowInliers` stayed pegged at 40/40 the
# entire time, so the existing inlier-count/ratio gate never once objected),
# while the persisted, independently pass-2-detected landmark box for the
# SAME frames kept advancing smoothly and substantially (confirming the real
# athlete kept moving normally). A velocity-ceiling check cannot catch this —
# near-zero displacement never exceeds any ceiling.
#
# The one signal that DID move during the freeze: `_flow_point_geometry`'s
# spread measure grew continuously and monotonically, 118px at the reseed
# (frame 215) to 282px by frame 249 (2.4x) — even though the 40 points'
# MEDIAN stayed frozen. The only way a robust median can stay put while the
# point cloud's own bounding spread keeps growing is a split population: a
# minority of points still (weakly) tracking the real, deforming, moving
# athlete drift away over time, while a majority sits on nearby static
# structure and anchors the median — consistent with `athlete_tracker.py`'s
# own documented "aperture problem"/background-lock precedent, just observed
# here at the FEATURE level instead of only at the box-displacement level.
# The seeded box at frame 215 was also unusually small (81x123px, versus the
# ~102x98px box tracked immediately before it) — a momentary, tightly-
# gathered limb configuration mid-stride — which independently explains why
# a fixed-size (never re-measured mid-flight) optical-flow window stopped
# containing enough of the real, fast-deforming athlete within a fraction of
# a second.
#
# Two independent, complementary, time-normalized signals are used (either
# alone is sufficient to suspect a freeze; neither alone was tuned to make
# frame 215 pass — both thresholds have real margin against the measured
# 2.4x spread growth and the measured cross-frame drift residual):
#
#   1. FEATURE-SPREAD GROWTH: the flow-point cloud's bounding spread grows
#      well beyond its value at the last re-seed while the box's own net
#      displacement since that re-seed stays near zero — exactly the
#      real, measured signature above.
#   2. TRAJECTORY RESIDUAL: once this track has ESTABLISHED real motion
#      (>= MOTION_ESTABLISHED_MIN_EVENTS identity-verified detector
#      confirmations with real accumulated displacement between them — the
#      same "must earn trust by moving" philosophy `athlete_tracker.py`
#      already uses for its own MIN_CUMULATIVE_DISPLACEMENT/
#      MAX_STATIONARY_VERIFICATION_SECONDS anti-background-lock defense,
#      ported here to the optical-flow layer it was never applied to), the
#      box's actual position is compared against where the LAST
#      identity-verified velocity implies it should now be. A frozen box
#      falls further and further behind that expectation the longer it sits
#      still while real motion continues.
#
# Both use real elapsed time (milliseconds / `time_s` deltas), not frame
# counts, and both use frame-widths (normalized by `self.width`), so the
# same thresholds mean the same physical thing at 60/120/240fps and at any
# resolution without rescaling — matching Phase 4.1's own generalization
# requirement ("do not tune specifically for one clip; solutions must
# generalize").
#
# Suspicion is NEVER a hard rejection by itself (Part 7's staged-response
# requirement: "do not immediately mark the athlete lost on one suspicious
# frame"). Once a raw signal fires it must PERSIST for >= FREEZE_MIN_SUSPECT_MS
# of real elapsed time before it is treated as CONFIRMED suspicion (not
# single-frame noise) — at that point it (a) forces an earlier detector
# refresh (like Day 104's accelerated-refresh trend, but immediate rather
# than trend-based) and (b) is resolved DEFINITIVELY only when the next
# identity-verified detector event arrives: if that fresh, verified box
# substantially DISAGREES with the frozen position, the entire suspect run is
# retroactively relabeled `frozen_suspect` (Part 6/7's "verified detector-
# confirmation contract" — a detected event corrects history only when it
# actually contradicts it, not automatically); if it AGREES, the run was a
# legitimately near-stationary moment (acceleration-block setup, a real
# brief slowdown) and is left as valid `tracked` evidence, satisfying Part
# 3's explicit requirement not to treat "no movement for N frames" alone as
# failure.
FREEZE_SPREAD_GROWTH_RATIO = 1.8          # flow-point spread vs. its value at last reseed
FREEZE_MAX_NET_DISPLACEMENT_FW = 0.02     # net box displacement over the ROLLING window (see below) that still counts as "frozen"
FREEZE_MIN_SUSPECT_MS = 100.0             # real elapsed time before spread growth alone is trusted (not 1-frame noise)
FREEZE_DISAGREEMENT_FW = 0.04             # frozen-vs-fresh-detection gap that confirms the freeze was wrong
# Phase 4.2D (2026-08-06) — real bug found via a production rerun of
# `vanni_fly_240`: the net-displacement half of the spread-growth signal
# originally measured cumulative displacement since the LAST RESEED
# (`_seed_center`), fixed at whatever position the track was at when flow
# points were last re-selected. That is correct only when a freeze begins
# immediately at reseed (the real `vanni_fly_120` frame-215 incident this
# signal was designed against). On `vanni_fly_240`, the athlete moved
# genuinely and substantially (~77px over ~55 real frames) for a while
# AFTER reseeding before actually freezing — by the time the freeze began,
# cumulative displacement since that stale seed had ALREADY permanently
# exceeded `FREEZE_MAX_NET_DISPLACEMENT_FW`, so the signal could never fire
# again for the rest of that seed's lifetime, no matter how long the
# SUBSEQUENT freeze lasted (confirmed directly: `featureSpreadGrowthRatio`
# reached 3.5×+ on the real clip while `freezeSuspect` stayed `False` the
# entire time). Fixed: net displacement is now measured over a bounded,
# continuously-rolling REAL-TIME window (how far has the box moved in
# roughly the last `ROLLING_DISPLACEMENT_WINDOW_MS`), not cumulatively
# since an ever-more-stale reseed — this correctly "forgets" real motion
# that happened before the window, so a freeze is detected whenever RECENT
# motion stalls, regardless of how much real motion happened earlier under
# the same seed. Sized comfortably larger than `FREEZE_MIN_SUSPECT_MS` so
# the window itself is never the limiting factor on confirmation latency.
ROLLING_DISPLACEMENT_WINDOW_MS = 250.0
FREEZE_NOISE_DURATION_MS = 200.0          # a resolved-but-brief run is "detector noise", not "legitimate low motion"
TRAJECTORY_RESIDUAL_SUSPECT_FW = 0.05     # established-trajectory residual that raises suspicion
assert COAST_TRAJECTORY_ALT_FW > TRAJECTORY_RESIDUAL_SUSPECT_FW, (
    "COAST_TRAJECTORY_ALT_FW must stay ABOVE this raw per-frame signal floor "
    "(see COAST_TRAJECTORY_ALT_FW's own docstring for why: it acts on a "
    "single frame's own reading with no confirmation delay, unlike this "
    "constant's own sustained-confirmation-gated freeze-suspicion path, so "
    "it needs a higher floor for equivalent selectivity)."
)
MOTION_ESTABLISHED_MIN_EVENTS = 2         # identity-verified confirmations needed before trajectory residual is trusted
MOTION_ESTABLISHED_MIN_DISPLACEMENT_FW = 0.05  # cumulative real displacement across those confirmations (mirrors
                                                # athlete_tracker.MIN_CUMULATIVE_DISPLACEMENT's "must earn trust by
                                                # moving" philosophy, sized for box-tracker's coarser per-detector-
                                                # interval sampling rather than per-frame)


class BoxTrackFrame:
    """One frame's full track-quality record (Part 4)."""
    __slots__ = (
        "frame", "box", "boxOrigin", "detectionConfidence", "trackingConfidence",
        "identityContinuityScore", "directionConsistency", "scaleConsistency",
        "opticalFlowInliers", "framesSinceVerifiedDetection", "trackState",
        # Phase 4.2B — stationary-lock diagnostics, additive (None on any
        # frame where they don't apply — backward-compatible with every
        # existing consumer, which only ever reads the original fields).
        "motionEstablished", "freezeSuspect", "freezeSuspicionStartedAtMs",
        "freezeDurationMs", "trajectoryResidualPx", "featureSpreadPx",
        "featureSpreadGrowthRatio", "timeSinceVerifiedDetectionMs",
        "frozenSignals", "frozenDecision", "frozenDecisionReason",
        "detectorEventClassification",
        # Phase 4.2F — athlete-interior feature-selection diagnostics,
        # additive (None wherever they don't apply).
        "athleteInteriorFeatureRatio", "backgroundRiskFeatureRatio",
        "flowQualityDegrading", "featureMaskSource", "flowRejectedBackgroundDominated",
        # Phase 4.2G — time-normalized coast-risk diagnostics, additive.
        "timeSinceVerifiedDetectorMs", "distanceSinceVerifiedDetectorPx",
        "distanceSinceVerifiedDetectorFrameWidths", "coastRiskState",
        "coastRiskSignals", "flowProtectionActive", "flowProtectionReason",
        # Phase 4.2H — distance-and-evidence-based coast-risk diagnostics,
        # additive (None wherever they don't apply). `athleteOwnedFeatureRatio`/
        # `backgroundRiskRatio` mirror `athleteInteriorFeatureRatio`/
        # `backgroundRiskFeatureRatio` under this phase's own field names
        # (kept alongside, not replacing, the Phase 4.2F names — both real,
        # both read by real consumers: the 4.2F names by the existing
        # cross-FPS fixture suite, these by the new cross-athlete one).
        "expectedDistanceFrameWidths", "trajectoryResidualFrameWidths",
        "athleteOwnedFeatureRatio", "backgroundRiskRatio", "forwardBackwardValidRatio",
        "coastRiskReasons", "flowProtectionLevel", "localizationTerminationReason",
        # Phase 4.2I — pose-landmark-guided per-point ownership diagnostic,
        # additive (None wherever it doesn't apply — no usable skeleton
        # reference yet, or a non-tracked frame).
        "skeletonOwnershipRatio",
        # R5B.4: additive, developer-visible failure-aware reacquisition
        # provenance.  Does not participate in metrics or pose thresholds.
        "trackingUnreliable", "trackingUnreliableReason",
    )

    def __init__(self, **kwargs):
        for k in self.__slots__:
            setattr(self, k, kwargs.get(k))

    def to_dict(self):
        return {k: getattr(self, k) for k in self.__slots__}


def _flow_point_geometry(points):
    """Diagnostics-only summary of the current optical-flow point set:
    count, centroid, and a bounding-area "spread" measure (Phase 4.2, Part 5
    — used to tell "points still spread across the athlete's real extent"
    apart from "points have concentrated onto a small static patch of
    background", which a bare inlier count/ratio cannot distinguish)."""
    if points is None or len(points) == 0:
        return {"count": 0, "centroid": None, "spreadPx": None}
    xs = [float(p[0][0]) for p in points]
    ys = [float(p[0][1]) for p in points]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    spread = max(max(xs) - min(xs), max(ys) - min(ys))
    return {"count": len(points), "centroid": (cx, cy), "spreadPx": spread}


def _box_center(box):
    """Boxes in this module are always (cx, cy, w, h) — the center IS the
    first two elements. (Named/kept as a function, not inlined, so every call
    site is self-documenting about what it's extracting.)"""
    return (box[0], box[1])


class AthleteBoxTracker:
    """Maintains one continuous athlete box across a whole clip.

    Coordinates are PIXEL space (matching the rest of mediapipe_pose_runner.py's
    `boxes[]` convention: box = (cx, cy, w, h) in source pixels).
    """

    def __init__(self, identity_tracker, detector_cadence_frames=8, width=1, height=1):
        self.identity_tracker = identity_tracker  # athlete_tracker.AthleteTracker
        self.detector_cadence_frames = max(1, int(detector_cadence_frames))
        self.width, self.height = width, height
        self.track_state = "acquiring"
        self.last_box = None            # (cx, cy, w, h) pixels
        self.last_velocity = (0.0, 0.0)  # px/frame
        self.last_verified_height = None
        self.frames_since_detector = 0
        self.frames_since_verified = 0
        self.reacquiring_frames = 0
        self.flow_points = None  # cv2 points currently tracked, or None
        self.recent_inlier_ratios = []  # bounded trend window — Day 104 adaptive refresh
        # Phase 4.2F: athlete-interior feature-selection state.
        self._feature_seed_source = None  # "eroded_box" on the frame flow_points was (re)seeded
        self.recent_background_risk_ratios = []  # bounded trend window, mirrors recent_inlier_ratios
        self.background_risk_forced_refresh_count = 0
        self.flow_rejected_background_dominated_count = 0
        self.tracking_unreliable_count = 0
        self.detector_invocations = 0
        self.tracked_count = 0
        self.predicted_count = 0
        self.reacquired_count = 0
        self.detected_count = 0
        self.teleport_rejected_count = 0
        self.records = []
        # Phase 4.1: teleport-rejection state — a running max of this track's
        # own observed speed (frame-widths/sec) and the last frame's real
        # timestamp, so implied velocity can be computed from actual elapsed
        # time rather than assumed frame spacing (matches athlete_tracker.py's
        # `max_abs_velocity` pattern exactly).
        self.max_observed_speed_fw_per_s = 0.0
        self.last_time_s = None
        # Phase 4.2B (Part 3): when the ceiling was last (accepted-event-)
        # updated — anchors the bounded, per-second growth-rate cap.
        self._ceiling_last_update_time_s = None

        # Phase 4.2: stationary-lock / frozen-track detection state.
        # -- Feature-spread-growth signal (reset on every re-seed) --
        self._seed_time_s = None
        self._seed_center = None
        self._seed_spread_px = None
        # -- Phase 4.2D: rolling recent-position buffer for the net-
        #    displacement half of the spread-growth signal — see
        #    ROLLING_DISPLACEMENT_WINDOW_MS's docstring above for why this
        #    replaced a fixed since-reseed anchor. List of (time_s, center).
        self._recent_positions = []
        # -- Suspicion-run bookkeeping (reset whenever a frame is NOT
        #    suspect, or whenever flow points are freshly re-seeded) --
        self._freeze_run_start_index = None
        self._freeze_run_start_time_s = None
        self._freeze_run_frames = []  # indices into self.records for the current suspect run
        self._freeze_run_signals = set()  # union of raw signals that fired during the run
        self._freeze_confirmed = False  # has the run crossed FREEZE_MIN_SUSPECT_MS yet
        # -- Established-motion context (updated ONLY on identity-verified
        #    detected/reacquired events that themselves pass plausibility —
        #    never on optical-flow "tracked" frames, so it can never be
        #    corrupted by the exact failure mode this phase investigates) --
        self.last_confirmed_center = None
        self.last_confirmed_time_s = None
        self.established_velocity_fw_per_s = (0.0, 0.0)
        self.confirmed_event_count = 0
        self.cumulative_confirmed_displacement_fw = 0.0
        self.motion_established = False
        # Phase 4.2I: the real per-joint skeleton from the last identity-
        # verified detector confirmation (never from optical-flow tracking,
        # same non-corruptible-reference contract as last_confirmed_center/
        # established_velocity_fw_per_s above) — normalized [0,1] coords,
        # x by source width, y by source height (MediaPipe's own convention).
        self._last_confirmed_landmarks = None
        # -- Diagnostics counters --
        self.freeze_suspect_frame_count = 0
        self.freeze_confirmed_run_count = 0
        self.freeze_confirmed_frame_count = 0
        self.freeze_dismissed_run_count = 0
        self.forced_refresh_count = 0
        self.detector_events_rejected_teleport = 0
        self.detector_events_rejected_direction = 0
        self.detector_events_rejected_scale_discontinuity = 0
        self.detector_events_rejected_stale_frame = 0
        self.detector_events_requires_confirmation = 0
        self._force_detector_next = False
        # Phase 4.2C (Part 6): why each detector invocation happened, and
        # whether it actually changed anything — real evidence for the
        # detector-invocation-cost audit, not an estimate.
        self._last_detector_reason = None
        self.detector_invocation_reasons = {}
        self.detector_invocations_changed_box = 0
        self.detector_invocations_resolved_suspicion = 0
        self.consecutive_detector_misses = 0

    def wants_detector_frame(self):
        """True when the caller should run the (expensive) MediaPipe detector
        this frame — either the scheduled cadence, or because tracking
        quality has degraded enough to need a fresh identity-verified fix.

        Phase 4.2C (Part 6): every `True` return now records WHY in
        `self._last_detector_reason` (read by `step()` into
        `self.detector_invocation_reasons`, a real per-reason count — the
        evidence this phase's detector-invocation-cost audit needs, not a
        guess). Phase 4.2C (Part 7): once `track_state == "terminated"`
        (box_tracker's OWN evidence-based proxy for "this athlete is very
        likely gone" — REACQUISITION_MAX_FRAMES x2 already exhausted; this
        module has no access to finish-line/zone timing, which lives in a
        different layer, so it cannot and does not try to detect "the
        finish" itself), cadence/accelerated-refresh checks are throttled to
        a much lower frequency rather than fully disabled — bounded so a
        real, late reappearance can still eventually be recovered, but not
        polled at full cost during a stretch already proven unrecoverable
        for this specific real incident (see Phase 3's `vanni_fly_120`
        finding: frames 324-482 have no recoverable evidence)."""
        self._last_detector_reason = None
        if self.track_state == "terminated":
            throttled_cadence = self.detector_cadence_frames * TERMINATED_DETECTOR_CADENCE_MULTIPLIER
            if self.frames_since_detector >= throttled_cadence:
                self._last_detector_reason = "terminated_throttled_cadence"
                return True
            return False
        if self.track_state in ("acquiring", "reacquiring", "lost"):
            self._last_detector_reason = "state_" + self.track_state
            return True
        # Phase 4.2C (Part 6) — real bug found via this phase's own
        # production rerun: `_force_detector_next` previously bypassed
        # every throttle unconditionally and has no cooldown of its own —
        # once a freeze suspicion is confirmed and NOTHING ever accepts a
        # fresh candidate again (exactly the "athlete has genuinely left
        # frame" case), it stays `True` forever, forcing a detector call on
        # LITERALLY EVERY SUBSEQUENT FRAME for the rest of the clip (worse
        # than plain full-cadence polling). Measured on the real rerun that
        # exposed this: adding the miss-count throttle below WITHOUT also
        # gating this branch left `detectorInvocations` completely
        # unchanged (192 -> 192) — the forced-refresh path was silently
        # absorbing 100% of the "savings" the cadence throttle should have
        # produced. Fixed: a forced refresh still fires IMMEDIATELY the
        # first few times (a real, not-yet-explained suspicion deserves a
        # prompt check), but once misses have also piled up, it folds into
        # the SAME throttled cadence as a normal scheduled check instead of
        # bypassing it.
        effective_cadence = self.detector_cadence_frames
        throttled_for_misses = self.consecutive_detector_misses >= CONSECUTIVE_MISS_THROTTLE_COUNT
        if throttled_for_misses:
            effective_cadence = self.detector_cadence_frames * MISS_THROTTLE_CADENCE_MULTIPLIER
        if self._force_detector_next:
            if not throttled_for_misses:
                self._last_detector_reason = "freeze_suspicion_forced"
                return True
            if self.frames_since_detector >= effective_cadence:
                self._last_detector_reason = "freeze_suspicion_forced_throttled_after_misses"
                return True
        elif self.frames_since_detector >= effective_cadence:
            # Phase 4.2C (Part 6): a real, sustained run of consecutive
            # detector MISSES (independent of `track_state`, which can stay
            # "tracking" throughout — see CONSECUTIVE_MISS_THROTTLE_COUNT's
            # docstring for the real evidence) throttles the scheduled
            # cadence rather than polling at full frequency for a region
            # repeatedly proven, by the detector's own recent results,
            # unlikely to suddenly find someone.
            self._last_detector_reason = "scheduled_cadence_throttled_after_misses" if throttled_for_misses else "scheduled_cadence"
            return True
        # Day 104 (Part 4): declining-quality early refresh — see
        # ACCELERATED_REFRESH_* docstring above.
        if (
            self.frames_since_detector >= ACCELERATED_REFRESH_MIN_FRAMES
            and len(self.recent_inlier_ratios) >= ACCELERATED_REFRESH_TREND_WINDOW
        ):
            window = self.recent_inlier_ratios[-ACCELERATED_REFRESH_TREND_WINDOW:]
            if (sum(window) / len(window)) < ACCELERATED_REFRESH_INLIER_RATIO:
                self._last_detector_reason = "accelerated_refresh_trend"
                return True
        return False

    def _init_flow_points(self, gray, box):
        import cv2
        import numpy as np
        x0f = box[0] - box[2] / 2
        y0f = box[1] - box[3] / 2
        x1f = box[0] + box[2] / 2
        y1f = box[1] + box[3] / 2

        def _seed(x0f_, y0f_, x1f_, y1f_):
            x0_ = max(0, int(x0f_))
            y0_ = max(0, int(y0f_))
            x1_ = min(gray.shape[1], int(x1f_))
            y1_ = min(gray.shape[0], int(y1f_))
            if x1_ - x0_ < 8 or y1_ - y0_ < 8:
                return None, (x0_, y0_, x1_, y1_)
            roi_ = gray[y0_:y1_, x0_:x1_]
            pts_ = cv2.goodFeaturesToTrack(
                roi_, maxCorners=OPTICAL_FLOW_MAX_POINTS, qualityLevel=0.01, minDistance=4, blockSize=5,
            )
            if pts_ is None:
                return None, (x0_, y0_, x1_, y1_)
            pts_[:, 0, 0] += x0_
            pts_[:, 0, 1] += y0_
            return pts_, (x0_, y0_, x1_, y1_)

        # Phase 4.2F: seed on an ERODED (inset) ROI first — see
        # FEATURE_SEED_EROSION_FRAC's module-level docstring for the real
        # evidence this defends against.
        ex = (x1f - x0f) * FEATURE_SEED_EROSION_FRAC
        ey = (y1f - y0f) * FEATURE_SEED_EROSION_FRAC
        pts, roi_bounds = _seed(x0f + ex, y0f + ey, x1f - ex, y1f - ey)
        source = "eroded_box"
        if pts is None:
            # Eroded ROI too small/featureless (a genuinely tiny or
            # low-texture box) — fall back to the full box rather than
            # failing to seed at all; this preserves the pre-4.2F behavior
            # exactly for boxes where erosion isn't viable.
            pts, roi_bounds = _seed(x0f, y0f, x1f, y1f)
            source = "full_box_fallback"
        if pts is None:
            _dbg(f"_init_flow_points: degenerate/featureless ROI {roi_bounds} from box={box} — flow_points stays None")
            self.flow_points = None
            self._feature_seed_source = None
            return
        self.flow_points = pts
        self._feature_seed_source = source
        _dbg(f"_init_flow_points: roi={roi_bounds} source={source} points={len(pts)}")

    def _track_via_optical_flow(self, prev_gray, gray, time_s):
        """Returns (new_box, inlier_count, inlier_ratio, diag) or
        (None, raw_inlier_count, inlier_ratio, diag). `diag` (Phase 4.2F)
        carries athlete-interior/background-risk feature-ownership
        diagnostics regardless of whether a box was produced.

        Athlete-interior feature selection: a raw LK inlier is only trusted
        as "athlete motion" evidence if it (1) passes a forward-backward
        consistency check (a standard, well-established LK quality check —
        not a new model) and (2) its own displacement is consistent with
        the athlete's independently ESTABLISHED velocity
        (`established_velocity_fw_per_s`, updated only by identity-verified
        detector events — never by optical flow itself, so this reference
        can never be corrupted by the exact failure this classification
        defends against). A point that stays essentially static while real
        athlete motion is expected, or moves in a clearly inconsistent
        direction, is classified background-risk and is (a) excluded from
        this frame's box-motion estimate and (b) DROPPED from
        `self.flow_points` going forward — background contamination cannot
        silently persist across frames once identified.
        """
        import cv2
        import numpy as np
        diag = {
            "athleteInteriorFeatureRatio": None, "backgroundRiskFeatureRatio": None,
            "flowRejectedBackgroundDominated": False,
            "timeSinceVerifiedDetectorMs": (
                (time_s - self.last_confirmed_time_s) * 1000.0 if self.last_confirmed_time_s is not None else None
            ),
            "flowProtectionActive": False, "flowProtectionReason": None,
            "forwardBackwardValidRatio": None,
            "expectedDistanceFrameWidths": None, "trajectoryResidualFrameWidths": None,
            "skeletonOwnershipRatio": None,
        }
        if self.flow_points is None or len(self.flow_points) == 0 or prev_gray is None:
            _dbg(f"_track_via_optical_flow: bail flow_points={None if self.flow_points is None else len(self.flow_points)} prev_gray={'None' if prev_gray is None else 'ok'}")
            return None, 0, 0.0, diag
        nxt, status, _ = cv2.calcOpticalFlowPyrLK(
            prev_gray, gray, self.flow_points, None,
            winSize=OPTICAL_FLOW_WIN_SIZE, maxLevel=OPTICAL_FLOW_MAX_LEVEL,
        )
        if nxt is None or status is None:
            _dbg("_track_via_optical_flow: calcOpticalFlowPyrLK returned None")
            return None, 0, 0.0, diag
        mask = status.reshape(-1) == 1
        good_prev = self.flow_points[mask]
        good_next = nxt[mask]
        inlier_count = len(good_next)
        total = len(self.flow_points)
        inlier_ratio = inlier_count / float(max(1, total))
        if inlier_count < OPTICAL_FLOW_MIN_INLIERS or inlier_ratio < OPTICAL_FLOW_MIN_INLIER_RATIO:
            _dbg(f"_track_via_optical_flow: too few inliers count={inlier_count} ratio={inlier_ratio:.2f}")
            return None, inlier_count, inlier_ratio, diag

        # Forward-backward consistency (Kalal et al.) — track good_next back
        # into prev_gray and keep only points whose round trip lands close
        # to where they started.
        back, back_status, _ = cv2.calcOpticalFlowPyrLK(
            gray, prev_gray, good_next, None,
            winSize=OPTICAL_FLOW_WIN_SIZE, maxLevel=OPTICAL_FLOW_MAX_LEVEL,
        )
        fb_ok = np.ones(inlier_count, dtype=bool)
        if back is not None and back_status is not None:
            fb_err = np.linalg.norm((back.reshape(-1, 2) - good_prev.reshape(-1, 2)), axis=1)
            fb_ok = (back_status.reshape(-1) == 1) & (fb_err <= FB_ERROR_MAX_PX)
        # Phase 4.2H (Part C/G): forward-backward-valid ratio surfaced as its
        # own diagnostic — a genuinely different quality signal from the
        # athlete-consistency classification below (FB failure means the LK
        # round-trip itself didn't converge; athlete-inconsistency means it
        # converged somewhere that doesn't match the athlete's own expected
        # motion). Both were already computed; only FB's own ratio was never
        # exposed on its own before this phase.
        diag["forwardBackwardValidRatio"] = float(fb_ok.sum()) / float(inlier_count) if inlier_count > 0 else None

        dxy = (good_next.reshape(-1, 2) - good_prev.reshape(-1, 2))

        # Expected athlete displacement this interval, from the
        # independently-established (never flow-derived) velocity.
        expected_dxy = None
        if self.motion_established and self.last_time_s is not None:
            dt = time_s - self.last_time_s
            if dt > 0:
                vx_fw, vy_fw = self.established_velocity_fw_per_s
                expected_dxy = (vx_fw * self.width * dt, vy_fw * self.width * dt)

        if expected_dxy is not None:
            exp_mag = math.hypot(expected_dxy[0], expected_dxy[1])
            mags = np.linalg.norm(dxy, axis=1)
            athlete_consistent = fb_ok.copy()
            if exp_mag >= STATIC_POINT_MAX_PX:
                # Real athlete motion is expected this interval — a point
                # retaining less than STATIC_POINT_RELATIVE_FLOOR of that
                # expected magnitude is background-risk (see its own
                # docstring for the real evidence behind this being
                # relative, not a fixed absolute floor).
                athlete_consistent &= mags >= (exp_mag * STATIC_POINT_RELATIVE_FLOOR)
            # Direction check only where a point's own motion is large
            # enough to have a meaningful direction at all.
            has_direction = mags >= STATIC_POINT_MAX_PX
            if exp_mag > 1e-6:
                cos_sim = np.divide(
                    dxy[:, 0] * expected_dxy[0] + dxy[:, 1] * expected_dxy[1],
                    mags * exp_mag,
                    out=np.ones_like(mags), where=(mags * exp_mag) > 1e-9,
                )
                athlete_consistent &= ~(has_direction & (cos_sim < MOTION_DIRECTION_MIN_COS))
            # Per-point magnitude ceiling (see MOTION_MAGNITUDE_ABS_CEILING_PX's
            # docstring for the real incident this closes) — catches an
            # entire cluster jumping together onto a new wrong target, which
            # the direction check alone cannot when `exp_mag` is small enough
            # to make cosine similarity numerically degenerate.
            magnitude_ceiling = max(MOTION_MAGNITUDE_ABS_CEILING_PX, exp_mag * MOTION_MAGNITUDE_MULTIPLE)
            athlete_consistent &= mags <= magnitude_ceiling
        else:
            # No established prior yet (early in a clip, or motion not yet
            # confirmed) — cannot classify against an athlete-specific
            # expectation; fall back to trusting every FB-consistent point,
            # exactly the pre-4.2F behavior for this case.
            athlete_consistent = fb_ok.copy()

        # Phase 4.2I: a point that FAILS motion-consistency may still be
        # confirmed athlete-owned by a genuinely different, spatial signal —
        # the real, velocity-projected skeleton from the last identity-
        # verified detector confirmation (see OWNERSHIP_RADIUS_FW's own
        # docstring for the real evidence this OR-path is grounded in).
        # FB validity is still required either way (a point whose LK
        # round-trip didn't converge is unreliable regardless of where it
        # sits); this only widens which FB-valid points also pass athlete-
        # consistency, it never narrows it — Vanni 240's own real
        # protections (the motion-consistency path above) are unchanged.
        skeleton_mask = self._skeleton_ownership_mask(good_next.reshape(-1, 2), time_s)
        diag["skeletonOwnershipRatio"] = float(skeleton_mask.sum()) / float(inlier_count) if skeleton_mask is not None else None
        if skeleton_mask is not None:
            athlete_consistent = athlete_consistent | (fb_ok & skeleton_mask)

        athlete_consistent_count = int(athlete_consistent.sum())
        background_risk_ratio = 1.0 - (float(athlete_consistent_count) / float(inlier_count))
        diag["athleteInteriorFeatureRatio"] = 1.0 - background_risk_ratio
        diag["backgroundRiskFeatureRatio"] = background_risk_ratio

        # Phase 4.2H (Part C): a PROVISIONAL, unrestricted-median position
        # (every retained point, exactly what Phase 4.2F/G would have used
        # before any exclusion decision) — needed to measure this frame's own
        # trajectory residual as a real, independent corroborating signal for
        # the exclusion gate below, BEFORE deciding whether to exclude
        # anything. Excluding points can only ever move the box TOWARD the
        # athlete-consistent subset's own median, so if even the unrestricted
        # position already disagrees substantially with where established
        # velocity says the athlete should be, that disagreement is real
        # evidence, not an artifact of the exclusion decision itself.
        provisional_dx = float(np.median(dxy[:, 0]))
        provisional_dy = float(np.median(dxy[:, 1]))
        if expected_dxy is not None:
            diag["expectedDistanceFrameWidths"] = math.hypot(expected_dxy[0], expected_dxy[1]) / self.width if self.width else None
        provisional_trajectory_residual_fw = None
        if self.motion_established and self.last_confirmed_center is not None and self.last_confirmed_time_s is not None and self.last_box is not None:
            provisional_center = (self.last_box[0] + provisional_dx, self.last_box[1] + provisional_dy)
            dt = time_s - self.last_confirmed_time_s
            vx, vy = self.established_velocity_fw_per_s
            expected_x = self.last_confirmed_center[0] + vx * self.width * dt
            expected_y = self.last_confirmed_center[1] + vy * self.width * dt
            provisional_trajectory_residual_fw = math.hypot(provisional_center[0] - expected_x, provisional_center[1] - expected_y) / self.width
        diag["trajectoryResidualFrameWidths"] = provisional_trajectory_residual_fw

        # Phase 4.2F: only treat this as GENUINE background contamination —
        # and act on it — when there is a real, partial split (some points
        # consistent, some not). A real box-tracker-teleport-sanity.py
        # regression found during this phase's own verification: when
        # optical flow loses the athlete ENTIRELY in one catastrophic frame
        # (the athlete jumps clean out of every seeded point's search
        # window, an aperture-problem case the pre-existing Phase 4.1
        # teleport check already catches well), literally every retained
        # point reads "inconsistent" — there is no split to exploit, and
        # forcibly excluding all of them here would just re-implement a
        # cruder version of the SAME rejection the teleport check already
        # performs downstream, while stealing its diagnostic attribution
        # (`teleportRejectedFrames`) for no real gain. Left to fall through
        # unmodified in that all-or-nothing case, the plain median of every
        # retained point is computed exactly as before 4.2F, and the
        # existing, well-tested teleport/direction/scale checks downstream
        # remain the ones that reject it.
        # Phase 4.2F: a real protected-Gav production rerun during this
        # phase's own verification found that acting on ANY nonzero
        # background-risk reading — even a single noisy point out of dozens
        # — measurably (if very slightly) shifted Gav's median-derived box
        # position frame over frame, compounding into a real, if small,
        # confidence/metric drift on a benchmark that must stay byte-
        # identical. A plain median is already fully robust to a small
        # number of true outliers (removing them changes nothing); the only
        # thing removing a SMALL minority of "inconsistent" points can do is
        # introduce noise on a clip where those readings were never real
        # contamination in the first place (ordinary limb-relative motion
        # during a close-up sprint, not background). Require a real,
        # substantial minority before acting at all.
        # Phase 4.2G: time-normalized, evidence-backed coast gate — replaces
        # Phase 4.2F's raw frame-count gate (see COAST_MIN_MS_SINCE_VERIFIED's
        # own docstring for the real cross-FPS evidence). Two independent
        # conditions, both real evidence, neither a raw frame count:
        # (1) a short elapsed-time floor since the last verified detector
        #     confirmation — long enough that a single noisy frame can never
        #     trigger anything, short enough to engage before a real
        #     contamination event (like Vanni 240's) reaches full lock;
        # (2) the SUSTAINED background-risk trend (the same rolling window
        #     already driving the soft early-refresh trigger) must itself be
        #     elevated — this is what actually distinguishes real,
        #     progressive contamination from ordinary limb-relative motion,
        #     and it is derived from real per-frame flow geometry, not a
        #     clock, so it naturally normalizes across FPS.
        time_since_verified_ms = (
            (time_s - self.last_confirmed_time_s) * 1000.0 if self.last_confirmed_time_s is not None else None
        )
        sustained_background_risk = (
            len(self.recent_background_risk_ratios) >= BACKGROUND_RISK_TREND_WINDOW
            and (sum(self.recent_background_risk_ratios) / len(self.recent_background_risk_ratios)) >= BACKGROUND_RISK_ACT_MIN_RATIO
        )
        diag["timeSinceVerifiedDetectorMs"] = time_since_verified_ms
        # Phase 4.2H (Part C): the time floor is no longer the ONLY path to
        # satisfying "enough real evidence has accumulated to act" — real,
        # independently-corroborated positional drift (the provisional
        # trajectory residual computed above, from the UNRESTRICTED median,
        # so it cannot be an artifact of the exclusion decision it feeds)
        # crossing the same floor the existing freeze-suspicion mechanism
        # already uses (`TRAJECTORY_RESIDUAL_SUSPECT_FW`, aliased here as
        # `COAST_TRAJECTORY_ALT_FW`) is an equally valid, evidence-backed
        # reason to act sooner. See `COAST_TRAJECTORY_ALT_FW`'s own
        # docstring for the real per-benchmark margin this is grounded in.
        coast_time_ok = (
            (time_since_verified_ms is not None and time_since_verified_ms >= COAST_MIN_MS_SINCE_VERIFIED)
            or (provisional_trajectory_residual_fw is not None and provisional_trajectory_residual_fw >= COAST_TRAJECTORY_ALT_FW)
        )
        is_partial_split = (
            0 < athlete_consistent_count < inlier_count
            and background_risk_ratio >= BACKGROUND_RISK_ACT_MIN_RATIO
            and coast_time_ok
            and sustained_background_risk
        )
        diag["flowProtectionActive"] = is_partial_split
        diag["flowProtectionReason"] = (
            "sustained_background_risk_during_coast" if is_partial_split
            else ("insufficient_coast_time" if not coast_time_ok and background_risk_ratio >= BACKGROUND_RISK_ACT_MIN_RATIO
                  else ("risk_not_sustained" if coast_time_ok and background_risk_ratio >= BACKGROUND_RISK_ACT_MIN_RATIO and not sustained_background_risk
                        else None))
        )

        if is_partial_split and (background_risk_ratio >= BACKGROUND_RISK_REJECT_RATIO or athlete_consistent_count < OPTICAL_FLOW_MIN_INLIERS):
            # A majority (or too few remaining) of this frame's retained
            # points are background-risk, WITH a genuine split observed —
            # the flow result as a whole is untrustworthy. Reject outright
            # (same fallback path as too few raw inliers) rather than accept
            # a background-dominated box.
            diag["flowRejectedBackgroundDominated"] = True
            self.flow_rejected_background_dominated_count += 1
            _dbg(f"_track_via_optical_flow: background-dominated, rejecting (risk={background_risk_ratio:.2f})")
            return None, inlier_count, inlier_ratio, diag

        use_mask = athlete_consistent if is_partial_split else np.ones(inlier_count, dtype=bool)
        consistent_dxy = dxy[use_mask]
        med_dx = float(np.median(consistent_dxy[:, 0]))
        med_dy = float(np.median(consistent_dxy[:, 1]))
        cx, cy, w, h = self.last_box
        new_box = (cx + med_dx, cy + med_dy, w, h)
        # Phase 4.2F: reseed forward with ONLY the athlete-consistent points
        # when a genuine partial split was found — background-risk points
        # are dropped, not carried forward, so contamination cannot
        # silently persist/accumulate across frames. In the all-consistent
        # or all-inconsistent case, every retained point carries forward
        # exactly as before 4.2F.
        self.flow_points = good_next[use_mask].reshape(-1, 1, 2)
        return new_box, inlier_count, inlier_ratio, diag

    def _direction_consistency(self, new_center, expected_dir_sign, reference_center=None):
        """`reference_center` defaults to `self.last_box`'s center (the
        tracked-path usage, unchanged from Phase 4.1). Phase 4.2B's
        detector-event plausibility check passes an explicit clean
        `(cx, cy)` reference instead (see `_classify_detector_event`), since
        `last_box` can itself be a drifted/frozen optical-flow box —
        exactly the evidence this phase's real trace exposed. Only index
        [0] (x) is used, so either a 2-tuple center or a full 4-tuple box
        works."""
        ref = reference_center if reference_center is not None else self.last_box
        if ref is None or expected_dir_sign == 0:
            return 1.0
        vx = new_center[0] - ref[0]
        # `vx` is a raw single-frame PIXEL displacement from sparse optical
        # flow, which carries a few pixels of measurement noise even when the
        # athlete is genuinely still (e.g. in the "set" position before a
        # sprint start). The prior epsilon (1e-6) was far tighter than that
        # noise floor, so it rejected near-zero real motion as direction-
        # opposing on pure jitter — the real cause of a real-run regression
        # found during this audit (optical-flow tracking never surviving past
        # its first frame). Mirrors athlete_tracker.py's own
        # DIRECTION_NOISE_FLOOR pattern, sized in pixels instead of normalized
        # units since this module works in pixel space.
        if abs(vx) < DIRECTION_NOISE_FLOOR_PX:
            return 1.0
        return 1.0 if (vx * expected_dir_sign) >= 0 else 0.0

    def _scale_consistency(self, new_h):
        if self.last_verified_height is None or self.last_verified_height <= 0:
            return 1.0
        ratio = new_h / self.last_verified_height
        if ratio > SCALE_CONSISTENCY_TOLERANCE or ratio < 1.0 / SCALE_CONSISTENCY_TOLERANCE:
            return 0.0
        return max(0.0, 1.0 - abs(1.0 - ratio))

    def _implied_speed_fw_per_s(self, new_center, time_s):
        """Implied speed of `new_center` vs. `self.last_box`, in frame-widths
        per second (real elapsed time, not an assumed frame interval) — None
        when there isn't enough evidence yet (cold start / non-increasing
        timestamp) to say anything."""
        if self.last_box is None or self.last_time_s is None or self.width <= 0:
            return None
        dt = time_s - self.last_time_s
        if dt <= 0:
            return None
        dx = new_center[0] - self.last_box[0]
        dy = new_center[1] - self.last_box[1]
        return math.hypot(dx, dy) / dt / self.width

    def _implied_speed_fw_per_s_from(self, reference_center, reference_time_s, new_center, time_s):
        """Same as `_implied_speed_fw_per_s`, but against an explicit
        reference instead of `self.last_box`/`self.last_time_s` (Phase 4.2B —
        the detector-event plausibility check must be judged against the
        last IDENTITY-VERIFIED box, which can differ from `last_box`)."""
        if reference_center is None or reference_time_s is None or self.width <= 0:
            return None
        dt = time_s - reference_time_s
        if dt <= 0:
            return None
        dx = new_center[0] - reference_center[0]
        dy = new_center[1] - reference_center[1]
        return math.hypot(dx, dy) / dt / self.width

    def _teleport_check(self, new_center, time_s):
        """Direction-agnostic velocity-magnitude drift check (Phase 4.1) — see
        `TELEPORT_ABSOLUTE_CEILING_FW_PER_S`/`TELEPORT_MAX_VELOCITY_MULTIPLE`'s
        module-level docstring for the full rationale and evidence. Returns
        `(ok, implied_speed_fw_per_s)`; `ok=True` when there isn't yet enough
        evidence to judge (cold start) — this can only REJECT with real
        evidence, never fabricate a rejection from insufficient data."""
        implied_speed = self._implied_speed_fw_per_s(new_center, time_s)
        if implied_speed is None:
            return True, None
        ceiling = max(TELEPORT_ABSOLUTE_CEILING_FW_PER_S, self.max_observed_speed_fw_per_s * TELEPORT_MAX_VELOCITY_MULTIPLE)
        return implied_speed <= ceiling, implied_speed

    def _established_speed_fw_per_s(self):
        return math.hypot(*self.established_velocity_fw_per_s)

    def _teleport_ceiling_fw_per_s(self):
        """The ceiling currently in force for judging NEW evidence — always
        computed from state accumulated BEFORE the candidate under judgment,
        never from the candidate itself (Part 3: "detector/reacquisition
        events cannot self-validate by first raising the ceiling")."""
        if self.motion_established:
            return max(TELEPORT_ABSOLUTE_CEILING_FW_PER_S, self._established_speed_fw_per_s() * TELEPORT_MAX_VELOCITY_MULTIPLE)
        return max(TELEPORT_ABSOLUTE_CEILING_FW_PER_S, self.max_observed_speed_fw_per_s * TELEPORT_MAX_VELOCITY_MULTIPLE)

    def _evaluate_ceiling_update(self, implied_speed, time_s):
        """Phase 4.2B (Part 3) — the bounded, time-normalized, diagnosed
        speed-ceiling update contract for DETECTOR/REACQUISITION events.
        Called ONLY for an event that has already passed
        `_classify_detector_event` — this is specifically the path the real
        incident's evidence proved unsafe (an unconditional, unchecked fold
        of a single event's own implied speed into the ceiling). The
        tracked (optical-flow) path keeps its own, deliberately UNCHANGED
        Phase 4.1 growth (see `step()`'s tracked-acceptance branch) because
        each tracked step is already self-gated by passing its own teleport
        check against the CURRENT ceiling before contributing — bounded and
        incremental by construction, not a single-shot poisoning risk, and
        removing it was tried and reverted during this phase's own
        implementation once it regressed `box-tracker-teleport:sanity`
        check 6 (a real, legitimate multi-frame acceleration wrongly
        rejected) — see the Phase 4.2B report's speed-ceiling-contract
        section for the full account.

        Growth is bounded by TWO independent caps, and the smaller applies:
          1. `MAX_CEILING_GROWTH_FW_PER_S_PER_S` x real elapsed seconds since
             the last accepted ceiling update (an acceleration-like bound —
             the ceiling cannot jump further than a physically reasonable
             rate of change allows, regardless of how large one single
             event's implied speed is).
          2. `TELEPORT_MAX_VELOCITY_MULTIPLE` x the track's own established
             cruising speed (Phase 4.1's original bound, still in force,
             still prevents raising the ceiling from a single anomalous
             corroboration-free reading).
        The ceiling never decays (a deliberate, disclosed choice — see the
        Phase 4.2B report's speed-ceiling-contract section): it is a running
        "highest speed ever legitimately observed for this athlete," and
        decaying it would reopen exactly the failure class this phase
        defends against (an athlete who legitimately slows down should not
        make a LATER, real fast segment look newly implausible)."""
        prev_ceiling = self._teleport_ceiling_fw_per_s()
        if self._ceiling_last_update_time_s is None:
            rate_bound = implied_speed  # cold start: no rate history to bound against yet
        else:
            dt = max(0.0, time_s - self._ceiling_last_update_time_s)
            rate_bound = self.max_observed_speed_fw_per_s + MAX_CEILING_GROWTH_FW_PER_S_PER_S * dt
        established_bound = (
            max(TELEPORT_ABSOLUTE_CEILING_FW_PER_S, self._established_speed_fw_per_s() * TELEPORT_MAX_VELOCITY_MULTIPLE)
            if self.motion_established else implied_speed
        )
        bounded_speed = min(implied_speed, rate_bound, max(established_bound, TELEPORT_ABSOLUTE_CEILING_FW_PER_S))
        new_max = max(self.max_observed_speed_fw_per_s, bounded_speed)
        accepted = new_max > self.max_observed_speed_fw_per_s
        diag = {
            "currentEstablishedSpeedFwPerS": self._established_speed_fw_per_s() if self.motion_established else None,
            "proposedEventSpeedFwPerS": implied_speed,
            "currentCeilingFwPerS": prev_ceiling,
            "proposedCeilingFwPerS": max(TELEPORT_ABSOLUTE_CEILING_FW_PER_S, new_max * TELEPORT_MAX_VELOCITY_MULTIPLE),
            "updateAccepted": accepted,
            "reason": (
                "raised" if accepted else "not_higher_than_current_max"
            ),
        }
        if accepted:
            self.max_observed_speed_fw_per_s = new_max
            self._ceiling_last_update_time_s = time_s
        _dbg(f"ceiling update: {diag}")
        return diag

    def _classify_detector_event(self, box, time_s, expected_dir_sign):
        """Phase 4.2B (Part 2) — the detector-event plausibility contract.

        Judged against `self.last_confirmed_center`/`last_confirmed_time_s`
        (the last IDENTITY-VERIFIED box), never against `self.last_box`
        (which may itself be a drifted/frozen optical-flow box — exactly
        the contaminated reference that let the real frame-215 incident's
        own athlete_tracker.py check under-react, since ITS reference was
        already stale by the time of the jump). Real evidence: measured
        this way, the actual frame-215 detection implies only 0.36 fw/s
        (dt=0.225s against the frame-188 reference) and the frame-251
        snap-back implies 0.44 fw/s (dt=0.3s against frame-215) — both
        cleanly plausible. The old, contaminated `last_box`-based reading
        (dt=1 frame against an already-drifted box) is what made frame 215
        LOOK like a 5.16 fw/s teleport; it never was one against clean
        evidence. This is why frame 215 is correctly NOT rejected by this
        check — it is a real, legitimate detection; the actual freeze
        problem is the optical-flow behavior AFTER it, caught separately by
        `_evaluate_freeze_suspicion`.

        Returns (classification, diagnostics, implied_speed_fw_per_s).
        """
        center = _box_center(box)
        diag = {}
        if self.last_confirmed_time_s is not None and time_s <= self.last_confirmed_time_s:
            return "rejected_stale_frame", diag, None
        scale_ok = self._scale_consistency(box[3])
        if scale_ok < 0.3 and self.last_verified_height is not None:
            diag["scaleConsistency"] = scale_ok
            return "rejected_scale_discontinuity", diag, None
        direction_ok = self._direction_consistency(center, expected_dir_sign, reference_center=self.last_confirmed_center)
        if direction_ok < 1.0:
            diag["directionConsistency"] = direction_ok
            return "rejected_direction", diag, None
        implied_speed = self._implied_speed_fw_per_s_from(
            self.last_confirmed_center, self.last_confirmed_time_s, center, time_s,
        )
        if implied_speed is None:
            return "accepted_provisional", diag, implied_speed
        ceiling = self._teleport_ceiling_fw_per_s()
        hard_ceiling = ceiling * DETECTOR_PLAUSIBILITY_HARD_CEILING_MULTIPLE
        diag.update({"impliedSpeedFwPerS": implied_speed, "ceilingFwPerS": ceiling, "hardCeilingFwPerS": hard_ceiling})
        if implied_speed > hard_ceiling:
            return "rejected_teleport", diag, implied_speed
        if implied_speed > ceiling:
            return "requires_confirmation", diag, implied_speed
        return "accepted_verified", diag, implied_speed

    def _update_established_motion(self, box, time_s, landmarks=None):
        """Phase 4.2 (Part 4): update the established-motion context from a
        fresh IDENTITY-VERIFIED box that has ALREADY PASSED
        `_classify_detector_event` — never from optical-flow "tracked"
        evidence, so this reference can never be corrupted by the exact
        class of failure (a frozen or drifted optical-flow box) this phase
        defends against. Mirrors `athlete_tracker.py`'s own "must earn trust
        by moving" pattern (`MIN_CUMULATIVE_DISPLACEMENT`): motion is not
        "established" from a single sample, only once
        >= MOTION_ESTABLISHED_MIN_EVENTS confirmed sightings have
        accumulated real displacement between them.

        Phase 4.2I: also refreshes the real per-joint skeleton reference
        (`landmarks`, the SAME identity-verified candidate's own MediaPipe
        landmarks — never from optical flow) used by the skeleton-ownership
        classification in `_track_via_optical_flow`."""
        center = _box_center(box)
        if landmarks:
            self._last_confirmed_landmarks = landmarks
        if self.last_confirmed_center is not None and self.last_confirmed_time_s is not None:
            dt = time_s - self.last_confirmed_time_s
            if dt > 0:
                dx_fw = (center[0] - self.last_confirmed_center[0]) / self.width
                dy_fw = (center[1] - self.last_confirmed_center[1]) / self.width
                vx, vy = dx_fw / dt, dy_fw / dt
                # Light EMA so one noisy confirmed interval cannot single-
                # handedly redefine "established" cruising speed/direction.
                if self.confirmed_event_count >= 1:
                    prev_vx, prev_vy = self.established_velocity_fw_per_s
                    vx = 0.5 * prev_vx + 0.5 * vx
                    vy = 0.5 * prev_vy + 0.5 * vy
                self.established_velocity_fw_per_s = (vx, vy)
                self.cumulative_confirmed_displacement_fw += math.hypot(dx_fw, dy_fw)
        self.confirmed_event_count += 1
        self.last_confirmed_center = center
        self.last_confirmed_time_s = time_s
        if (
            self.confirmed_event_count >= MOTION_ESTABLISHED_MIN_EVENTS
            and self.cumulative_confirmed_displacement_fw >= MOTION_ESTABLISHED_MIN_DISPLACEMENT_FW
        ):
            self.motion_established = True

    def _trajectory_residual_fw(self, center, time_s):
        """Phase 4.2 (Part 3/4): distance (frame-widths) between `center` and
        where the last identity-verified velocity implies the athlete should
        now be. None when motion is not yet established (nothing to compare
        against) — never fabricates suspicion from insufficient evidence,
        matching `_teleport_check`'s own "insufficient evidence never
        rejects" philosophy."""
        if not self.motion_established or self.last_confirmed_center is None or self.last_confirmed_time_s is None:
            return None
        dt = time_s - self.last_confirmed_time_s
        vx, vy = self.established_velocity_fw_per_s
        expected_x = self.last_confirmed_center[0] + vx * self.width * dt
        expected_y = self.last_confirmed_center[1] + vy * self.width * dt
        return math.hypot(center[0] - expected_x, center[1] - expected_y) / self.width

    @staticmethod
    def _point_segment_distance_px(p, a, b):
        """Shortest distance (pixels) from point `p` to the line segment
        `a`-`b` — real per-point geometry, not a bounding-box approximation."""
        px, py = p
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        if dx == 0.0 and dy == 0.0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        cx, cy = ax + t * dx, ay + t * dy
        return math.hypot(px - cx, py - cy)

    def _projected_skeleton_px(self, time_s):
        """Phase 4.2I: the last identity-verified skeleton
        (`self._last_confirmed_landmarks`), converted to real pixel
        coordinates (x by `self.width`, y by `self.height` — MediaPipe's own
        per-joint normalization, NOT this file's own frame-width-only
        convention used elsewhere for box-center displacement) and then
        extrapolated forward using the SAME established velocity the
        existing trajectory-residual check already uses. A real per-
        benchmark prototype (see OWNERSHIP_RADIUS_FW's own docstring) found
        an UNPROJECTED (stale) reference trivially stays "close" to a
        frozen/stuck point — projecting forward is what lets this
        correctly recognize that a frozen point has fallen behind where the
        athlete actually is. Returns `None` when there isn't a usable
        confirmed skeleton yet (never fabricates a reference)."""
        if not self._last_confirmed_landmarks or self.last_confirmed_time_s is None or self.width <= 0 or self.height <= 0:
            return None
        dt = time_s - self.last_confirmed_time_s
        vx_fw, vy_fw = self.established_velocity_fw_per_s
        # Matches _trajectory_residual_fw's own convention: displacement in
        # PIXELS is `v_fw * self.width * dt` for BOTH axes (this file treats
        # "frame-widths" as the single unit for 2D box-center displacement,
        # not a per-axis normalization) — applied here to each joint's own
        # pixel position after converting from MediaPipe's raw per-axis
        # normalization.
        dx_px = vx_fw * self.width * dt
        dy_px = vy_fw * self.width * dt
        projected = {}
        for name, (x, y, vis) in self._last_confirmed_landmarks.items():
            if vis < OWNERSHIP_LANDMARK_VISIBILITY_FLOOR:
                continue
            projected[name] = (x * self.width + dx_px, y * self.height + dy_px)
        return projected if len(projected) >= OWNERSHIP_MIN_CONFIDENT_JOINTS else None

    def _skeleton_ownership_mask(self, points_px, time_s):
        """Phase 4.2I: boolean mask, one per point in `points_px` (pixel
        coords), True where the point lies within `OWNERSHIP_RADIUS_FW` of
        the nearest segment of the real, velocity-projected skeleton. `None`
        when no usable skeleton reference exists (never fabricates
        acceptance OR rejection from insufficient evidence — a caller
        treats `None` as "this signal has no opinion," not as false)."""
        import numpy as np
        skeleton = self._projected_skeleton_px(time_s)
        if skeleton is None:
            return None
        radius_px = OWNERSHIP_RADIUS_FW * self.width
        mask = np.zeros(len(points_px), dtype=bool)
        joints = list(skeleton.values())
        for i, p in enumerate(points_px):
            best = float("inf")
            for a_name, b_name in OWNERSHIP_SEGMENTS:
                a, b = skeleton.get(a_name), skeleton.get(b_name)
                if a is None or b is None:
                    continue
                best = min(best, self._point_segment_distance_px(p, a, b))
            if best == float("inf"):
                for a in joints:
                    best = min(best, math.hypot(p[0] - a[0], p[1] - a[1]))
            mask[i] = best <= radius_px
        return mask

    def _note_recent_position(self, center, time_s):
        """Phase 4.2D: record a real observed position into the rolling
        buffer used by `_rolling_net_displacement_fw`, pruning anything
        older than `ROLLING_DISPLACEMENT_WINDOW_MS`. Called on every frame
        with a real box (tracked AND detected/reacquired) — deliberately
        NOT reset at reseed (unlike `_seed_center`): "how far have I moved
        recently" should keep working across a reseed, not restart from
        nothing."""
        self._recent_positions.append((time_s, center))
        cutoff = time_s - ROLLING_DISPLACEMENT_WINDOW_MS / 1000.0
        while len(self._recent_positions) > 1 and self._recent_positions[0][0] < cutoff:
            self._recent_positions.pop(0)

    def _rolling_net_displacement_fw(self, current_center, time_s):
        """Phase 4.2D: distance (frame-widths) between `current_center` and
        the OLDEST position still inside the rolling
        `ROLLING_DISPLACEMENT_WINDOW_MS` window — "how far has the box
        actually moved in roughly the last quarter-second," not "how far
        has it moved since some arbitrarily-old reseed event." `None` when
        there isn't yet a full window of history (cold start / just
        reseeded — never fabricates a freeze reading from insufficient
        evidence, matching this file's established pattern)."""
        if not self._recent_positions:
            return None
        oldest_time_s, oldest_center = self._recent_positions[0]
        if time_s - oldest_time_s < ROLLING_DISPLACEMENT_WINDOW_MS / 1000.0 * 0.5:
            # Less than half the window has actually elapsed — the "oldest"
            # sample isn't old enough yet to say anything meaningful about
            # "recent" motion (avoids a false-frozen reading immediately
            # after a reseed, before the window has had time to fill).
            return None
        return math.hypot(current_center[0] - oldest_center[0], current_center[1] - oldest_center[1]) / self.width

    def _classify_localization_termination(self, center, expected_dir_sign, net_displacement_fw):
        """Phase 4.2H (Part D) — distinguishes a genuine frame exit from a
        suspected background lock, using real evidence from this phase's own
        cross-benchmark audit (docs/phase-4-2h-distance-evidence-coast-risk.md
        Section 8): Vanni 120's real, adjudicated frame-301 exit tail kept
        making small, real, non-repeating incremental moves toward the
        configured travel-direction's far edge (rolling net displacement
        stayed genuinely nonzero); Vanni 240's real frame-649 background-lock
        tail was bit-for-bit IDENTICAL for hundreds of consecutive frames —
        a true zero, not just "slow." Frozen position (no real flow signal
        at all) is treated as background-lock evidence REGARDLESS of where
        in frame it sits — a real, exiting athlete keeps producing real
        (if small) flow signal until evidence genuinely runs out; a locked
        box does not. `None` when there isn't enough evidence to say either
        way (this file's established "insufficient evidence never asserts"
        pattern) — never fabricates a classification from a single frame."""
        if self.width <= 0 or net_displacement_fw is None:
            return None
        frozen = net_displacement_fw < EXIT_MIN_CONTINUED_DISPLACEMENT_FW
        if frozen:
            return "background_lock_suspected"
        x_norm = center[0] / self.width
        near_far_edge = (
            (expected_dir_sign > 0 and x_norm >= 1.0 - EXIT_EDGE_MARGIN_FRAC)
            or (expected_dir_sign < 0 and x_norm <= EXIT_EDGE_MARGIN_FRAC)
        )
        return "genuine_frame_exit" if near_far_edge else None

    def _coast_risk_state(
        self, time_since_verified_ms, distance_fw, trajectory_residual_fw,
        background_risk_trend, flow_quality_degrading, termination_reason,
    ):
        """Phase 4.2H (Part C) — developer-visibility label for the current
        coast state, now driven by a small, interpretable EVIDENCE VECTOR
        (elapsed time, frame-width distance, trajectory residual, sustained
        background-risk trend, structural track/termination state) instead
        of elapsed time alone. Purely diagnostic: no acceptance/rejection
        decision anywhere in this module reads this value back — the real
        gates are computed directly where they are used (`is_partial_split`,
        the refresh-request block). Priority order (most urgent/specific
        first), grounded in the real per-benchmark audit
        (docs/phase-4-2h-distance-evidence-coast-risk.md Section 5):
        structural loss/reacquisition first, then the two termination
        classes (Part D), then risk signals ordered by how directly each one
        was shown to correlate with a real incident (trajectory residual's
        real margin was the largest found; raw distance's was the smallest,
        see Section 5), then the two non-risk "coasting fine" labels."""
        if self.track_state in ("lost", "terminated"):
            return "lost"
        if self.track_state == "reacquiring":
            return "reacquiring"
        if self._force_detector_next:
            return "refresh_required"
        if termination_reason == "genuine_frame_exit":
            return "exited_frame"
        if trajectory_residual_fw is not None and trajectory_residual_fw >= TRAJECTORY_RESIDUAL_SUSPECT_FW:
            return "elevated_trajectory_risk"
        if flow_quality_degrading:
            return "flow_degrading"
        if background_risk_trend is not None and background_risk_trend >= BACKGROUND_RISK_ACT_MIN_RATIO:
            return "elevated_feature_risk"
        if distance_fw is not None and distance_fw >= COAST_ELEVATED_DISTANCE_FW:
            return "elevated_distance_risk"
        if time_since_verified_ms is None:
            return "recently_confirmed"
        if time_since_verified_ms < COAST_MIN_MS_SINCE_VERIFIED:
            return "recently_confirmed"
        if time_since_verified_ms >= COAST_LONG_MS:
            return "corroborated_long_coast"
        # COAST_ELEVATED_MS no longer has its own dedicated state — real
        # risk in this mid-range is now surfaced by the richer signals above
        # (trajectory residual, background-risk trend, distance), which the
        # audit found are each more directly evidenced than time alone; a
        # coast in this range with none of those signals elevated really is
        # just an ordinary coast.
        return "normal_coast"

    def _evaluate_freeze_suspicion(self, frame_index, time_s, raw_signals):
        """Phase 4.2B (Part 4) — time-gated suspicion tracking. `raw_signals`
        is the set of per-frame signal names that fired THIS frame (from
        `{"spread_growth", "trajectory_residual"}`). A run opens on the
        first frame with any raw signal and stays open across consecutive
        suspect frames; it only becomes CONFIRMED (returned `True`) once the
        run's real elapsed duration reaches `FREEZE_MIN_SUSPECT_MS` — a
        single suspect frame, or a couple of noisy ones, never triggers a
        forced refresh or downstream consequence on their own (Part 4: "do
        not trigger from one signal alone unless mathematically decisive").
        Returns (confirmed, duration_ms, suspicion_started_at_ms)."""
        if not raw_signals:
            self._freeze_run_start_index = None
            self._freeze_run_start_time_s = None
            self._freeze_run_frames = []
            self._freeze_run_signals = set()
            self._freeze_confirmed = False
            return False, None, None
        if self._freeze_run_start_index is None:
            self._freeze_run_start_index = len(self.records)
            self._freeze_run_start_time_s = time_s
            self._freeze_run_frames = []
            self._freeze_confirmed = False
        self._freeze_run_frames.append(len(self.records))
        self._freeze_run_signals |= raw_signals
        duration_ms = (time_s - self._freeze_run_start_time_s) * 1000.0
        confirmed = duration_ms >= FREEZE_MIN_SUSPECT_MS
        if confirmed and not self._freeze_confirmed:
            self._freeze_confirmed = True
            self._force_detector_next = True
            self.forced_refresh_count += 1
        if confirmed:
            self.freeze_suspect_frame_count += 1
        return confirmed, (duration_ms if confirmed else None), self._freeze_run_start_time_s * 1000.0

    def _resolve_freeze_run(self, fresh_center, time_s):
        """Phase 4.2B (Part 5/6) — the definitive action. Called exactly when
        a fresh identity-verified (accepted, non-rejected) box arrives while
        a suspicion run is open (a run only reaches this point at all once
        it has been CONFIRMED — see `_evaluate_freeze_suspicion` — never for
        a run still within its unconfirmed grace period). If the fresh box
        substantially DISAGREES with the position the suspect run has been
        frozen at, the run is proven wrong: EVERY frame in the run —
        including the frames from when the raw signal first appeared,
        before the run crossed FREEZE_MIN_SUSPECT_MS and became confirmed —
        is retroactively relabeled `frozen_suspect` (never `invalid` — a
        distinct origin so it is diagnosable as "we actively distrusted
        this," not merely "we had no evidence"). Correcting the WHOLE
        contiguous run, not only its post-confirmation tail, is deliberate:
        once real evidence proves the run's final position was wrong, the
        earlier ramp-up frames (which showed the same raw signal, just not
        yet for long enough to justify forcing a refresh on their own) were
        equally not on the athlete — withholding the confirmation delay
        from them now that the run's outcome is known would leave genuinely
        unsupported frames labeled `tracked`. Downstream (`measurements.ts`,
        mirroring its existing predicted/invalid handling) withholds
        `frozen_suspect` frames as pose evidence.
        If the fresh box AGREES (within `FREEZE_DISAGREEMENT_FW`), the run
        was a legitimately near-stationary moment — left untouched as valid
        `tracked` evidence (Part 3's explicit requirement: do not treat low
        movement alone as failure). This never rewrites `box`/`trackState`/
        `identityContinuityScore` — only `boxOrigin` and the `frozenDecision*`
        diagnostics — so no fabricated position is ever introduced (Part 5:
        "do not rewrite source evidence silently")."""
        had_open_run = bool(self._freeze_run_frames)
        had_confirmed_run = self._freeze_confirmed and had_open_run
        if not had_confirmed_run or self.last_box is None:
            self._freeze_run_start_index = None
            self._freeze_run_frames = []
            self._freeze_run_signals = set()
            self._freeze_confirmed = False
            # A run that was open but never crossed FREEZE_MIN_SUSPECT_MS is
            # "unresolved" (fresh evidence arrived before suspicion could be
            # confirmed either way) rather than silently dropped — captured
            # in `frozenDecision`-style trace diagnostics, never persisted
            # onto any BoxTrackFrame (those frames were never marked
            # `freezeSuspect` in the first place, so there is nothing to
            # correct).
            return "unresolved" if had_open_run else None
        frozen_center = _box_center(self.last_box)
        gap_fw = math.hypot(fresh_center[0] - frozen_center[0], fresh_center[1] - frozen_center[1]) / self.width
        signals = self._freeze_run_signals
        start_time_s = self._freeze_run_start_time_s
        duration_ms = (time_s - start_time_s) * 1000.0 if start_time_s is not None else None
        if gap_fw >= FREEZE_DISAGREEMENT_FW:
            outcome = (
                "suspicion_confirmed_background_lock"
                if {"spread_growth", "trajectory_residual"} <= signals
                else "suspicion_confirmed_stale_box"
            )
            for i in self._freeze_run_frames:
                rec = self.records[i]
                if rec.boxOrigin == "tracked":
                    rec.boxOrigin = "frozen_suspect"
                    rec.frozenDecision = outcome
                    rec.frozenDecisionReason = f"gapFw={gap_fw:.4f} signals={sorted(signals)}"
                    self.freeze_confirmed_frame_count += 1
            self.freeze_confirmed_run_count += 1
            _dbg(f"freeze run confirmed ({outcome}): frames={self._freeze_run_frames[0]}..{self._freeze_run_frames[-1]} gapFw={gap_fw:.4f}")
        else:
            outcome = (
                "suspicion_dismissed_detector_noise"
                if (duration_ms is not None and duration_ms < FREEZE_NOISE_DURATION_MS)
                else "suspicion_dismissed_legitimate_low_motion"
            )
            for i in self._freeze_run_frames:
                rec = self.records[i]
                if rec.boxOrigin == "tracked":
                    rec.frozenDecision = outcome
                    rec.frozenDecisionReason = f"gapFw={gap_fw:.4f} signals={sorted(signals)}"
            self.freeze_dismissed_run_count += 1
        self._freeze_run_start_index = None
        self._freeze_run_frames = []
        self._freeze_run_signals = set()
        self._freeze_confirmed = False
        return outcome

    def step(self, frame_index, time_s, prev_gray, gray, detector_candidates, expected_dir_sign):
        """`detector_candidates` is non-None ONLY on frames where the caller
        actually ran MediaPipe (i.e. `wants_detector_frame()` was honored) —
        a list of athlete_tracker.Candidate-or-None to feed the identity
        tracker. Pass None on frames where the detector was skipped.

        Phase 4.2B ordered flow (Part 8):
          1. Read source-time input (frame_index/time_s — params).
          2. Evaluate the detector candidate via athlete_tracker.py (unchanged).
          3. If a candidate was selected: classify its OWN plausibility
             against the last identity-verified box (`_classify_detector_event`)
             — this uses only PRIOR trusted evidence, never the candidate
             itself or the (possibly-frozen) `last_box`, so there is no
             circularity between "the selected box defines the expected
             trajectory" and "the same trajectory self-validates the box".
          4. rejected_teleport falls through to the SAME tracking/prediction
             path used when the detector finds nobody — it never updates
             established motion, the ceiling, or `last_box`.
          5. Any accepted classification resolves an open freeze-suspicion
             run (using the OLD `last_box`, still valid at this point),
             updates established motion, updates the ceiling (bounded), and
             then proceeds with the existing box/state overwrite.
          6. Otherwise (no detector this frame, or detector found nobody):
             optical-flow tracking or prediction, as before, PLUS Phase
             4.2B's freeze-suspicion signal evaluation on every tracked
             frame — never on predicted/invalid frames (already correctly
             withheld from scientific evidence, nothing to add).
        """
        self.frames_since_detector += 1
        record_kwargs = dict(
            frame=frame_index, framesSinceVerifiedDetection=self.frames_since_verified,
            motionEstablished=self.motion_established,
        )

        if detector_candidates is not None:
            self.detector_invocations += 1
            self.frames_since_detector = 0
            # Phase 4.2C (Part 6): real accounting for WHY this call
            # happened and, once we know the outcome below, whether it
            # actually did anything (changed the authoritative box,
            # resolved an open suspicion run) — evidence for the
            # detector-invocation-cost audit, not an estimate.
            _reason = self._last_detector_reason or "unspecified"
            self.detector_invocation_reasons[_reason] = self.detector_invocation_reasons.get(_reason, 0) + 1
            _had_open_freeze_run = bool(self._freeze_run_frames)
            _prev_box_before_call = self.last_box
            step_result = self.identity_tracker.step(detector_candidates, frame_index, time_s)
            idx = step_result["selectedIndex"]
            if _DEBUG:
                n_cand = len([c for c in detector_candidates if c is not None])
                reasons = [c.get("rejectionReason") for c in step_result.get("candidates", []) if c.get("rejectionReason")]
                _dbg(f"frame={frame_index} candidates={n_cand} selectedIndex={idx} reasons={reasons} flow_points={0 if self.flow_points is None else len(self.flow_points)}")
            if idx is not None:
                c = detector_candidates[idx]
                raw_w = c.w * self.width
                raw_h = c.h * self.height
                # Pad (center-preserving) and floor the box — see BOX_PADDING's
                # docstring above for why: the raw landmark-cluster box is
                # frequently too small/degenerate on low-completeness frames to
                # seed optical flow or crop the athlete reliably.
                box_w = max(raw_w * BOX_PADDING, MIN_BOX_SIDE_PX)
                box_h = max(raw_h * BOX_PADDING, MIN_BOX_SIDE_PX)
                box = (c.cx * self.width, c.cy * self.height, box_w, box_h)

                # Phase 4.2B (Part 2): plausibility-check the candidate BEFORE
                # it is allowed to touch established motion, the ceiling, or
                # `last_box`.
                classification, plaus_diag, implied_speed = self._classify_detector_event(box, time_s, expected_dir_sign)
                if classification in DETECTOR_EVENT_REJECTED_CLASSIFICATIONS:
                    # Phase 4.2C (Part 6): a rejected candidate is not a
                    # usable position either — counts toward the same
                    # consecutive-miss throttle as "found nobody at all".
                    # Phase 4.2E: this branch now covers EVERY rejection
                    # classification `_classify_detector_event` can return, not
                    # just `rejected_teleport` — see
                    # `DETECTOR_EVENT_REJECTED_CLASSIFICATIONS`'s docstring for
                    # the real, visually-confirmed incident this closes.
                    self.consecutive_detector_misses += 1
                    if classification == "rejected_teleport":
                        self.detector_events_rejected_teleport += 1
                    elif classification == "rejected_direction":
                        self.detector_events_rejected_direction += 1
                    elif classification == "rejected_scale_discontinuity":
                        self.detector_events_rejected_scale_discontinuity += 1
                    elif classification == "rejected_stale_frame":
                        self.detector_events_rejected_stale_frame += 1
                    _dbg(f"frame={frame_index}: detector event {classification} diag={plaus_diag}")
                    # Treated exactly like "detector found nothing verified" —
                    # real negative evidence into the accelerated-refresh
                    # trend, then fall through to tracking/prediction below.
                    self.recent_inlier_ratios.append(0.0)
                    if len(self.recent_inlier_ratios) > ACCELERATED_REFRESH_TREND_WINDOW:
                        self.recent_inlier_ratios = self.recent_inlier_ratios[-ACCELERATED_REFRESH_TREND_WINDOW:]
                    record_kwargs["detectorEventClassification"] = classification
                else:
                    # Phase 4.2C (Part 6): any accepted, usable position
                    # immediately restores full cadence.
                    self.consecutive_detector_misses = 0
                    if classification == "requires_confirmation":
                        self.detector_events_requires_confirmation += 1
                    was_lost = self.track_state in ("reacquiring", "lost", "acquiring")
                    origin = "reacquired" if (was_lost and self.last_box is not None) else "detected"

                    # Resolve any open freeze-suspicion run using the box
                    # BEING REPLACED (still `self.last_box` at this point) —
                    # must happen before it is overwritten below.
                    frozen_decision = None
                    if self._freeze_run_frames:
                        frozen_decision = self._resolve_freeze_run(_box_center(box), time_s)
                    if _had_open_freeze_run and frozen_decision is not None:
                        self.detector_invocations_resolved_suspicion += 1
                    if _prev_box_before_call is None or box != _prev_box_before_call:
                        self.detector_invocations_changed_box += 1

                    # Fold this event's implied velocity into established
                    # motion and the (now-bounded) ceiling — only reachable
                    # here, i.e. only for a plausibility-checked event.
                    ceiling_diag = None
                    if implied_speed is not None:
                        ceiling_diag = self._evaluate_ceiling_update(implied_speed, time_s)
                    self._update_established_motion(box, time_s, landmarks=c.landmarks)
                    self._note_recent_position(_box_center(box), time_s)

                    self.track_state = "verified"
                    self.last_box = box
                    self.last_verified_height = box[3]
                    self.last_time_s = time_s
                    self.frames_since_verified = 0
                    self.reacquiring_frames = 0
                    # Fresh, identity-verified evidence — any prior declining-
                    # quality trend is now stale and must not force an
                    # unnecessary immediate re-refresh.
                    self.recent_inlier_ratios = []
                    self.recent_background_risk_ratios = []
                    self._init_flow_points(gray, box)
                    # Phase 4.2B: (re-)establish the feature-spread-growth
                    # baseline at every fresh seed.
                    geom = _flow_point_geometry(self.flow_points)
                    self._seed_time_s = time_s
                    self._seed_center = _box_center(box)
                    self._seed_spread_px = geom["spreadPx"]
                    # A fresh, accepted identity-verified event resolves the
                    # need for a forced refresh.
                    self._force_detector_next = False
                    if origin == "reacquired":
                        self.reacquired_count += 1
                    else:
                        self.detected_count += 1
                    record_kwargs.update(
                        box=box, boxOrigin=origin,
                        detectionConfidence=step_result["candidates"][idx].get("score"),
                        trackingConfidence=1.0,
                        identityContinuityScore=step_result["candidates"][idx].get("score") or 0.0,
                        directionConsistency=1.0, scaleConsistency=1.0,
                        opticalFlowInliers=0, trackState=self.track_state,
                        motionEstablished=self.motion_established,
                        detectorEventClassification=classification,
                        featureMaskSource=self._feature_seed_source,
                        flowQualityDegrading=False,
                        timeSinceVerifiedDetectorMs=0.0,
                        distanceSinceVerifiedDetectorPx=0.0,
                        distanceSinceVerifiedDetectorFrameWidths=0.0,
                        expectedDistanceFrameWidths=0.0,
                        trajectoryResidualFrameWidths=0.0,
                        athleteOwnedFeatureRatio=None,
                        backgroundRiskRatio=None,
                        forwardBackwardValidRatio=None,
                        skeletonOwnershipRatio=None,
                        coastRiskState="recently_confirmed",
                        coastRiskSignals=None,
                        coastRiskReasons=None,
                        flowProtectionActive=False,
                        flowProtectionReason=None,
                        flowProtectionLevel="none",
                        localizationTerminationReason=None,
                    )
                    if _TRACE_FILE:
                        _trace(frame_index, {
                            "timeS": time_s,
                            "box": box, "boxOrigin": origin, "trackState": self.track_state,
                            "trackingConfidence": 1.0, "identityContinuityScore": record_kwargs.get("identityContinuityScore"),
                            "directionConsistency": 1.0, "scaleConsistency": 1.0,
                            "opticalFlowInliers": 0, "teleportOk": True, "impliedSpeedFwPerS": implied_speed,
                            "framesSinceDetector": 0, "framesSinceVerifiedDetection": 0,
                            "flowPointCount": geom["count"], "flowPointCentroid": geom["centroid"],
                            "flowPointSpreadPx": geom["spreadPx"], "maxObservedSpeedFwPerS": self.max_observed_speed_fw_per_s,
                            "detectorSelectedScore": step_result["candidates"][idx].get("score"),
                            "detectorCandidateCount": len([c for c in detector_candidates if c is not None]),
                            "detectorEventClassification": classification,
                            "frozenDecision": frozen_decision,
                            "ceilingDiag": ceiling_diag,
                            # Phase 4.2I (Candidate B prototyping, opt-in trace
                            # only — zero production cost, never read by any
                            # acceptance/rejection logic): the raw per-joint
                            # landmark positions MediaPipe's own detector call
                            # already computed for this candidate, currently
                            # discarded once the box is built. Exists so a
                            # pose-guided per-point ownership prototype can be
                            # evaluated against real captured evidence without
                            # any production wiring.
                            "candidateLandmarks": {
                                k: [float(v[0]), float(v[1]), float(v[2])]
                                for k, v in (c.landmarks or {}).items()
                            } if c.landmarks else None,
                        })
                    self.records.append(BoxTrackFrame(**record_kwargs))
                    return self.records[-1]
            else:
                # Detector ran but found nothing verified this frame. Per the
                # Phase 4.1 audit ("MediaPipe returning 'no person' does not
                # currently invalidate the tracker"): this is real negative
                # evidence, not a no-op — feed it into the SAME accelerated-refresh
                # trend `recent_inlier_ratios` already drives (Day 104), so a
                # detector miss makes the NEXT check come sooner rather than
                # waiting a full cadence, without retrying on literally every
                # subsequent frame (`wants_detector_frame()`'s existing cadence
                # logic still governs exactly when that next check happens).
                # Phase 4.2C (Part 6): also the primary input to the
                # consecutive-miss cadence throttle above.
                self.consecutive_detector_misses += 1
                self.recent_inlier_ratios.append(0.0)
                if len(self.recent_inlier_ratios) > ACCELERATED_REFRESH_TREND_WINDOW:
                    self.recent_inlier_ratios = self.recent_inlier_ratios[-ACCELERATED_REFRESH_TREND_WINDOW:]
                # Fall through to tracking/prediction below using whatever box we
                # already had.

        # No detector this frame (or detector found nothing / was rejected) —
        # track or predict.
        new_box, inliers, inlier_ratio = (None, 0, 0.0)
        flow_diag = {"athleteInteriorFeatureRatio": None, "backgroundRiskFeatureRatio": None, "flowRejectedBackgroundDominated": False}
        if self.last_box is not None:
            new_box, inliers, inlier_ratio, flow_diag = self._track_via_optical_flow(prev_gray, gray, time_s)
            # Phase 4.2F (Part D, stage "request detector refresh"): a
            # sustained (not single-frame) elevated background-risk ratio
            # forces an early detector refresh — reuses the SAME
            # `_force_detector_next` lever the freeze-suspicion signal
            # already drives, mirroring Day 104's ACCELERATED_REFRESH_*
            # trend-window pattern exactly.
            # Phase 4.2G: gated on the SAME COAST_MIN_MS_SINCE_VERIFIED floor
            # as the exclusion path (see its own docstring) — a real
            # production rerun this phase proved a separately-lowered
            # request-only floor is NOT actually non-destructive (an early
            # detector call, once accepted, still shifts box state), and
            # requesting a call before the exclusion floor has cleaned up
            # drifted flow points made Vanni 240 measurably worse, not
            # better. The two paths must stay coupled.
            # Phase 4.2H: the trajectory-residual alt-path added to the
            # exclusion gate (see COAST_TRAJECTORY_ALT_FW's docstring)
            # applies equally here, for the same coupling reason.
            if flow_diag["backgroundRiskFeatureRatio"] is not None:
                self.recent_background_risk_ratios.append(flow_diag["backgroundRiskFeatureRatio"])
                if len(self.recent_background_risk_ratios) > BACKGROUND_RISK_TREND_WINDOW:
                    self.recent_background_risk_ratios = self.recent_background_risk_ratios[-BACKGROUND_RISK_TREND_WINDOW:]
                time_since_verified_ms_refresh = (
                    (time_s - self.last_confirmed_time_s) * 1000.0 if self.last_confirmed_time_s is not None else None
                )
                refresh_time_ok = (
                    (time_since_verified_ms_refresh is not None and time_since_verified_ms_refresh >= COAST_MIN_MS_SINCE_VERIFIED)
                    or (flow_diag.get("trajectoryResidualFrameWidths") is not None and flow_diag["trajectoryResidualFrameWidths"] >= COAST_TRAJECTORY_ALT_FW)
                )
                if (
                    len(self.recent_background_risk_ratios) >= BACKGROUND_RISK_TREND_WINDOW
                    and (sum(self.recent_background_risk_ratios) / len(self.recent_background_risk_ratios)) >= BACKGROUND_RISK_FORCED_REFRESH_RATIO
                    and refresh_time_ok
                    and not self._force_detector_next
                ):
                    self._force_detector_next = True
                    self.background_risk_forced_refresh_count += 1
                    _dbg(f"frame={frame_index}: background-risk trend forced an early detector refresh")

        teleport_ok, implied_speed_fw_per_s = True, None
        if new_box is not None:
            direction_ok = self._direction_consistency(_box_center(new_box), expected_dir_sign)
            scale_ok = self._scale_consistency(new_box[3])
            teleport_ok, implied_speed_fw_per_s = self._teleport_check(_box_center(new_box), time_s)
            if direction_ok < 1.0 or scale_ok < 0.3 or not teleport_ok:
                # The tracked box itself now looks like it may have drifted
                # onto something else — do not silently keep following it.
                _dbg(
                    f"frame={frame_index}: optical-flow box rejected direction_ok={direction_ok} "
                    f"scale_ok={scale_ok} teleport_ok={teleport_ok} implied_speed_fw_per_s={implied_speed_fw_per_s} "
                    f"new_box={new_box}"
                )
                if not teleport_ok:
                    self.teleport_rejected_count += 1
                new_box = None

        freeze_diag = {}
        if new_box is not None:
            # R5B.4: do not silently carry a box whose flow has absolutely no
            # supporting inliers.  Crucially, retain `last_box`/identity state
            # rather than replacing it with this stale observation; the next
            # frame's `wants_detector_frame()` sees `reacquiring` and invokes
            # the existing full-frame detector every frame until recovery.
            if (
                detector_candidates is None
                and self.track_state in ("tracking", "verified")
                and inlier_ratio <= TRACKING_UNRELIABLE_ZERO_INLIER_RATIO
            ):
                self.track_state = "reacquiring"
                self.reacquiring_frames = 0
                self.frames_since_verified += 1
                self.tracking_unreliable_count += 1
                record_kwargs.update(
                    box=None, boxOrigin="invalid", detectionConfidence=None,
                    trackingConfidence=inlier_ratio, identityContinuityScore=0.0,
                    directionConsistency=None, scaleConsistency=None,
                    opticalFlowInliers=inliers, trackState=self.track_state,
                    flowRejectedBackgroundDominated=flow_diag["flowRejectedBackgroundDominated"],
                    featureMaskSource=self._feature_seed_source,
                    trackingUnreliable=True,
                    trackingUnreliableReason="zero_optical_flow_inliers",
                    coastRiskState="reacquiring",
                    coastRiskSignals=["zero_optical_flow_inliers"],
                    coastRiskReasons=["zero_optical_flow_inliers"],
                    flowProtectionActive=False, flowProtectionLevel="none",
                    localizationTerminationReason=None,
                )
                self.records.append(BoxTrackFrame(**record_kwargs))
                return self.records[-1]
            self.track_state = "tracking" if self.track_state != "reacquiring" else "reacquiring"
            self.last_box = new_box
            self.last_time_s = time_s
            # Phase 4.2B (Part 3) — deliberately UNCHANGED from Phase 4.1: a
            # tracked-path acceptance may still gradually raise
            # `max_observed_speed_fw_per_s`, because it is not "unverified"
            # evidence in the sense Part 3 means to exclude — it has ALREADY
            # passed its OWN teleport check against the CURRENT ceiling
            # (immediately above) before being allowed to raise it further,
            # so growth here is self-limiting and incremental (each step can
            # only extend the ceiling by about as much as it itself was
            # already judged plausible against), never a single-shot jump.
            # This is what lets a real, sustained acceleration (many
            # consecutive small legitimate steps between detector frames)
            # keep being accepted rather than rejected once its speed
            # exceeds a stale, slower-established baseline — required by
            # Part 3 ("natural sprint speed increases must not be
            # rejected"; confirmed by `box-tracker-teleport:sanity` check 6,
            # which regressed when this was first (incorrectly) removed
            # during Phase 4.2B's initial wiring pass.
            # The REAL, evidenced poisoning risk this phase's audit found
            # (Section: speed-ceiling contract) was specifically a
            # DETECTOR/REACQUISITION event folding its own implied speed in
            # UNCONDITIONALLY, with no plausibility check of its own, before
            # ever being compared against anything — that is what
            # `_evaluate_ceiling_update`/`_classify_detector_event` below
            # now gate; a self-checked incremental tracked-path step was
            # never the mechanism of the real incident and is left as-is.
            if implied_speed_fw_per_s is not None:
                self.max_observed_speed_fw_per_s = max(self.max_observed_speed_fw_per_s, implied_speed_fw_per_s)
            self.frames_since_verified += 1
            self.tracked_count += 1
            self.recent_inlier_ratios.append(inlier_ratio)
            if len(self.recent_inlier_ratios) > ACCELERATED_REFRESH_TREND_WINDOW:
                self.recent_inlier_ratios = self.recent_inlier_ratios[-ACCELERATED_REFRESH_TREND_WINDOW:]

            # Phase 4.2B (Part 4) — freeze-suspicion signals, evaluated on
            # every tracked frame.
            geom = _flow_point_geometry(self.flow_points)
            new_center = _box_center(new_box)
            spread_growth_ratio = None
            if self._seed_spread_px and self._seed_spread_px > 0 and geom["spreadPx"] is not None:
                spread_growth_ratio = geom["spreadPx"] / self._seed_spread_px
            # Phase 4.2D: rolling-window net displacement (see
            # ROLLING_DISPLACEMENT_WINDOW_MS's docstring) — replaces a fixed
            # since-reseed anchor, which a real vanni_fly_240 rerun proved
            # goes permanently stale once genuine motion happens before a
            # later freeze under the SAME seed.
            self._note_recent_position(new_center, time_s)
            net_displacement_fw = self._rolling_net_displacement_fw(new_center, time_s)
            trajectory_residual_fw = self._trajectory_residual_fw(new_center, time_s)

            raw_signals = set()
            if (
                spread_growth_ratio is not None and spread_growth_ratio >= FREEZE_SPREAD_GROWTH_RATIO
                and net_displacement_fw is not None and net_displacement_fw < FREEZE_MAX_NET_DISPLACEMENT_FW
            ):
                raw_signals.add("spread_growth")
            if trajectory_residual_fw is not None and trajectory_residual_fw >= TRAJECTORY_RESIDUAL_SUSPECT_FW:
                raw_signals.add("trajectory_residual")

            confirmed, duration_ms, started_at_ms = self._evaluate_freeze_suspicion(frame_index, time_s, raw_signals)
            time_since_verified_ms = (
                (time_s - self.last_confirmed_time_s) * 1000.0 if self.last_confirmed_time_s is not None else None
            )
            freeze_diag = {
                "freezeSuspect": confirmed,
                "freezeSuspicionStartedAtMs": started_at_ms,
                "freezeDurationMs": duration_ms,
                "trajectoryResidualPx": (trajectory_residual_fw * self.width) if trajectory_residual_fw is not None else None,
                "featureSpreadPx": geom["spreadPx"],
                "featureSpreadGrowthRatio": spread_growth_ratio,
                "timeSinceVerifiedDetectionMs": time_since_verified_ms,
                "frozenSignals": sorted(raw_signals) if raw_signals else None,
            }

            flow_quality_degrading = (
                len(self.recent_background_risk_ratios) > 0
                and (sum(self.recent_background_risk_ratios) / len(self.recent_background_risk_ratios)) >= (BACKGROUND_RISK_FORCED_REFRESH_RATIO * 0.75)
            )
            background_risk_trend = (
                sum(self.recent_background_risk_ratios) / len(self.recent_background_risk_ratios)
                if self.recent_background_risk_ratios else None
            )
            dist_px = None
            dist_fw = None
            if self.last_confirmed_center is not None:
                dist_px = math.hypot(new_center[0] - self.last_confirmed_center[0], new_center[1] - self.last_confirmed_center[1])
                dist_fw = dist_px / self.width if self.width else None
            # Phase 4.2H (Part D): exit-vs-background-lock classification,
            # using the SAME rolling net displacement the freeze-suspicion
            # signal above already computed (real, not a duplicate model).
            termination_reason = self._classify_localization_termination(new_center, expected_dir_sign, net_displacement_fw)
            coast_signals = []
            if flow_diag.get("flowProtectionActive"):
                coast_signals.append("sustained_background_risk")
            if flow_quality_degrading:
                coast_signals.append("flow_quality_degrading")
            if confirmed:
                coast_signals.append("freeze_suspect_confirmed")
            if termination_reason:
                coast_signals.append(termination_reason)
            # Phase 4.2H (Part G): flowProtectionLevel — a leveled view of
            # the same exclusion/trend evidence flowProtectionActive already
            # carries: "active" when the exclusion gate actually fired this
            # frame, "monitoring" when the background-risk trend is already
            # elevated but has not (yet) cleared the joint gate, "none"
            # otherwise.
            if flow_diag.get("flowProtectionActive"):
                flow_protection_level = "active"
            elif background_risk_trend is not None and background_risk_trend >= BACKGROUND_RISK_ACT_MIN_RATIO:
                flow_protection_level = "monitoring"
            else:
                flow_protection_level = "none"
            record_kwargs.update(
                box=new_box, boxOrigin="tracked", detectionConfidence=None,
                trackingConfidence=inlier_ratio,
                identityContinuityScore=inlier_ratio,
                directionConsistency=self._direction_consistency(_box_center(new_box), expected_dir_sign),
                scaleConsistency=self._scale_consistency(new_box[3]),
                opticalFlowInliers=inliers, trackState=self.track_state,
                athleteInteriorFeatureRatio=flow_diag["athleteInteriorFeatureRatio"],
                backgroundRiskFeatureRatio=flow_diag["backgroundRiskFeatureRatio"],
                flowQualityDegrading=flow_quality_degrading,
                featureMaskSource=self._feature_seed_source,
                flowRejectedBackgroundDominated=flow_diag["flowRejectedBackgroundDominated"],
                timeSinceVerifiedDetectorMs=flow_diag.get("timeSinceVerifiedDetectorMs"),
                distanceSinceVerifiedDetectorPx=dist_px,
                distanceSinceVerifiedDetectorFrameWidths=dist_fw,
                expectedDistanceFrameWidths=flow_diag.get("expectedDistanceFrameWidths"),
                trajectoryResidualFrameWidths=trajectory_residual_fw,
                athleteOwnedFeatureRatio=flow_diag["athleteInteriorFeatureRatio"],
                backgroundRiskRatio=flow_diag["backgroundRiskFeatureRatio"],
                forwardBackwardValidRatio=flow_diag.get("forwardBackwardValidRatio"),
                skeletonOwnershipRatio=flow_diag.get("skeletonOwnershipRatio"),
                coastRiskState=self._coast_risk_state(
                    flow_diag.get("timeSinceVerifiedDetectorMs"), dist_fw, trajectory_residual_fw,
                    background_risk_trend, flow_quality_degrading, termination_reason,
                ),
                coastRiskSignals=sorted(coast_signals) if coast_signals else None,
                coastRiskReasons=sorted(coast_signals) if coast_signals else None,
                flowProtectionActive=flow_diag.get("flowProtectionActive", False),
                flowProtectionReason=flow_diag.get("flowProtectionReason"),
                flowProtectionLevel=flow_protection_level,
                localizationTerminationReason=termination_reason,
                **freeze_diag,
            )
        else:
            # Phase 4.1 audit fix: do NOT advance `self.last_time_s` here.
            # `_implied_speed_fw_per_s` divides a position delta by a time
            # delta — the two must always describe the SAME interval. This
            # branch (predicted or fully invalid) either holds `last_box`
            # frozen (predicted, zero-velocity fallback) or leaves it
            # untouched entirely (invalid) — advancing `last_time_s` every
            # such frame while the position reference stays stale silently
            # shrinks the time half of that ratio without shrinking the
            # position half. A real run proved this: after a long
            # invalid/predicted stretch, the next real detection or tracked
            # frame computed an implied speed of ~34 frame-widths/second from
            # a position delta spanning many real frames divided by a time
            # delta of only ~1 frame — a fabricated "legitimate" high speed
            # that permanently raised `max_observed_speed_fw_per_s` far
            # beyond the real 246->247 jump's ~14 fw/s, defeating the
            # teleport ceiling for the rest of the run. Leaving `last_time_s`
            # anchored to the last frame `last_box` was genuinely true means
            # the next real comparison correctly divides by the FULL real
            # elapsed gap, not a fabricated single-frame one.
            # Predicted (constant-velocity) fallback — NEVER pose evidence.
            self.frames_since_verified += 1
            if self.last_box is not None and self.frames_since_verified <= MAX_PREDICTED_FRAMES_BEFORE_REACQUIRING:
                cx, cy, w, h = self.last_box
                vx, vy = self.last_velocity
                predicted = (cx + vx, cy + vy, w, h)
                self.last_box = predicted
                self.predicted_count += 1
                if self.track_state not in ("reacquiring", "lost"):
                    self.track_state = "reacquiring"
                self.reacquiring_frames += 1
                record_kwargs.update(
                    box=predicted, boxOrigin="predicted", detectionConfidence=None, trackingConfidence=0.0,
                    identityContinuityScore=0.0, directionConsistency=1.0, scaleConsistency=1.0,
                    opticalFlowInliers=inliers, trackState=self.track_state,
                    athleteInteriorFeatureRatio=flow_diag["athleteInteriorFeatureRatio"],
                    backgroundRiskFeatureRatio=flow_diag["backgroundRiskFeatureRatio"],
                    flowRejectedBackgroundDominated=flow_diag["flowRejectedBackgroundDominated"],
                    featureMaskSource=self._feature_seed_source,
                    timeSinceVerifiedDetectorMs=flow_diag.get("timeSinceVerifiedDetectorMs"),
                    expectedDistanceFrameWidths=flow_diag.get("expectedDistanceFrameWidths"),
                    trajectoryResidualFrameWidths=flow_diag.get("trajectoryResidualFrameWidths"),
                    athleteOwnedFeatureRatio=flow_diag["athleteInteriorFeatureRatio"],
                    backgroundRiskRatio=flow_diag["backgroundRiskFeatureRatio"],
                    forwardBackwardValidRatio=flow_diag.get("forwardBackwardValidRatio"),
                    skeletonOwnershipRatio=flow_diag.get("skeletonOwnershipRatio"),
                    coastRiskState=self._coast_risk_state(
                        flow_diag.get("timeSinceVerifiedDetectorMs"), None, flow_diag.get("trajectoryResidualFrameWidths"),
                        None, False, None,
                    ),
                    flowProtectionActive=flow_diag.get("flowProtectionActive", False),
                    flowProtectionReason=flow_diag.get("flowProtectionReason"),
                    flowProtectionLevel="none",
                    localizationTerminationReason=None,
                )
            else:
                self.track_state = "reacquiring" if self.reacquiring_frames <= REACQUISITION_MAX_FRAMES else "lost"
                self.reacquiring_frames += 1
                if self.track_state == "lost" and self.reacquiring_frames > REACQUISITION_MAX_FRAMES * 2:
                    self.track_state = "terminated"
                record_kwargs.update(
                    box=None, boxOrigin="invalid", detectionConfidence=None, trackingConfidence=0.0,
                    identityContinuityScore=0.0, directionConsistency=None, scaleConsistency=None,
                    opticalFlowInliers=inliers, trackState=self.track_state,
                    athleteInteriorFeatureRatio=flow_diag["athleteInteriorFeatureRatio"],
                    backgroundRiskFeatureRatio=flow_diag["backgroundRiskFeatureRatio"],
                    flowRejectedBackgroundDominated=flow_diag["flowRejectedBackgroundDominated"],
                    featureMaskSource=self._feature_seed_source,
                    timeSinceVerifiedDetectorMs=flow_diag.get("timeSinceVerifiedDetectorMs"),
                    expectedDistanceFrameWidths=flow_diag.get("expectedDistanceFrameWidths"),
                    trajectoryResidualFrameWidths=flow_diag.get("trajectoryResidualFrameWidths"),
                    athleteOwnedFeatureRatio=flow_diag["athleteInteriorFeatureRatio"],
                    backgroundRiskRatio=flow_diag["backgroundRiskFeatureRatio"],
                    forwardBackwardValidRatio=flow_diag.get("forwardBackwardValidRatio"),
                    skeletonOwnershipRatio=flow_diag.get("skeletonOwnershipRatio"),
                    coastRiskState=self._coast_risk_state(
                        flow_diag.get("timeSinceVerifiedDetectorMs"), None, flow_diag.get("trajectoryResidualFrameWidths"),
                        None, False, None,
                    ),
                    flowProtectionActive=flow_diag.get("flowProtectionActive", False),
                    flowProtectionReason=flow_diag.get("flowProtectionReason"),
                    flowProtectionLevel="none",
                    localizationTerminationReason=None,
                )

        if _TRACE_FILE:
            geom = _flow_point_geometry(self.flow_points)
            _trace(frame_index, {
                "timeS": time_s,
                "box": record_kwargs.get("box"),
                "boxOrigin": record_kwargs.get("boxOrigin"),
                "trackState": record_kwargs.get("trackState"),
                "trackingConfidence": record_kwargs.get("trackingConfidence"),
                "identityContinuityScore": record_kwargs.get("identityContinuityScore"),
                "directionConsistency": record_kwargs.get("directionConsistency"),
                "scaleConsistency": record_kwargs.get("scaleConsistency"),
                "opticalFlowInliers": record_kwargs.get("opticalFlowInliers"),
                "teleportOk": teleport_ok,
                "impliedSpeedFwPerS": implied_speed_fw_per_s,
                "framesSinceDetector": self.frames_since_detector,
                "framesSinceVerifiedDetection": record_kwargs.get("framesSinceVerifiedDetection"),
                "flowPointCount": geom["count"],
                "flowPointCentroid": geom["centroid"],
                "flowPointSpreadPx": geom["spreadPx"],
                "maxObservedSpeedFwPerS": self.max_observed_speed_fw_per_s,
                # Phase 4.2F: raw feature coordinates + ownership diagnostics
                # — opt-in/zero production cost, exists so a real incident's
                # exact flow-point geometry can be reconstructed and
                # classified against source pixels (Part A/B evidence).
                "flowPoints": [[float(p[0][0]), float(p[0][1])] for p in self.flow_points] if self.flow_points is not None else [],
                "athleteInteriorFeatureRatio": record_kwargs.get("athleteInteriorFeatureRatio"),
                "backgroundRiskFeatureRatio": record_kwargs.get("backgroundRiskFeatureRatio"),
                "flowRejectedBackgroundDominated": record_kwargs.get("flowRejectedBackgroundDominated"),
                "featureMaskSource": record_kwargs.get("featureMaskSource"),
                # Phase 4.2I (Candidate A/B prototyping, opt-in trace only):
                # the established-motion reference these classifications are
                # already judged against, so an offline prototype can
                # reproduce the exact same expected-displacement geometry
                # without re-deriving it from scratch.
                "establishedVelocityFwPerS": list(self.established_velocity_fw_per_s),
                "lastConfirmedCenter": list(self.last_confirmed_center) if self.last_confirmed_center is not None else None,
                "motionEstablishedForTrace": self.motion_established,
                **freeze_diag,
            })

        self.records.append(BoxTrackFrame(**record_kwargs))
        return self.records[-1]

    def summary(self):
        origins = [r.boxOrigin for r in self.records]
        return {
            "totalFrames": len(self.records),
            "detectorInvocations": self.detector_invocations,
            "detectedFrames": self.detected_count,
            "reacquiredFrames": self.reacquired_count,
            "trackedFrames": self.tracked_count,
            "predictedFrames": self.predicted_count,
            "invalidFrames": origins.count("invalid"),
            "frozenSuspectFrames": origins.count("frozen_suspect"),
            # Phase 4.1: how many optical-flow candidates were rejected as a
            # physically implausible teleport (see TELEPORT_* docstring) —
            # zero on a clean track; a real, informative signal when nonzero.
            "teleportRejectedFrames": self.teleport_rejected_count,
            "maxObservedSpeedFrameWidthsPerSecond": self.max_observed_speed_fw_per_s,
            # Phase 4.2B: frozen-track detector diagnostics.
            "motionEstablished": self.motion_established,
            "establishedSpeedFrameWidthsPerSecond": self._established_speed_fw_per_s(),
            "freezeSuspicionsConfirmed": self.freeze_confirmed_run_count,
            "freezeSuspicionsDismissed": self.freeze_dismissed_run_count,
            "freezeConfirmedFrames": self.freeze_confirmed_frame_count,
            "forcedRefreshCount": self.forced_refresh_count,
            "detectorEventsRejectedTeleport": self.detector_events_rejected_teleport,
            # Phase 4.2E: these three were previously computed by
            # `_classify_detector_event` but never actually enforced — see
            # `DETECTOR_EVENT_REJECTED_CLASSIFICATIONS`'s docstring.
            "detectorEventsRejectedDirection": self.detector_events_rejected_direction,
            "detectorEventsRejectedScaleDiscontinuity": self.detector_events_rejected_scale_discontinuity,
            "detectorEventsRejectedStaleFrame": self.detector_events_rejected_stale_frame,
            "detectorEventsRequiresConfirmation": self.detector_events_requires_confirmation,
            # Phase 4.2C (Part 6): real, per-reason detector-invocation
            # accounting — the evidence trail this phase's cost audit uses.
            "detectorInvocationReasons": dict(self.detector_invocation_reasons),
            "detectorInvocationsChangedBox": self.detector_invocations_changed_box,
            "detectorInvocationsResolvedSuspicion": self.detector_invocations_resolved_suspicion,
            "terminatedFrames": sum(1 for s in (r.trackState for r in self.records) if s == "terminated"),
            "finalConsecutiveDetectorMisses": self.consecutive_detector_misses,
            # Phase 4.2F: athlete-interior feature-selection diagnostics.
            "backgroundRiskForcedRefreshCount": self.background_risk_forced_refresh_count,
            "flowRejectedBackgroundDominatedCount": self.flow_rejected_background_dominated_count,
            "trackingUnreliableTransitions": self.tracking_unreliable_count,
        }
