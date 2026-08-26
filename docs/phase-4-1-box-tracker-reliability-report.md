# Phase 4.1 — Athlete Localization Engine 2.0, Part 1: Box Tracker Reliability

**Date**: 2026-08-05
**Status**: Complete, with an honest correction (see Section 0) — the
implemented fix is real, tested, evidence-backed, and non-regressive, but a
real production revalidation proved it does **not** fully resolve the
specific `vanni_fly_120` incident this phase was commissioned to fix. The
true mechanism is more complex than the commissioning evidence described.
**Weight**: 4% (inserted into the v4.0 roadmap after Phase 3; see
`docs/stationary-roadmap-progress.md` for the disclosed weight-pool
discrepancy this creates — 105% → 109%)

---

## 0. Correction (read this first)

Sections 1–8 below were written after implementing and unit-testing the
teleport-rejection fix, before the real end-to-end production revalidation
in Section 9 was run. That revalidation — re-running the actual `vanni_fly_120`
job through the real worker/queue, with a file-level trace of
`AthleteBoxTracker`'s own per-frame state (not just the final serialized
artifact) — surfaced a fact the fix's design did not account for. In the
spirit of this project's standing rule (proven twice already, in Phase 3's
correction and here): **a prior conclusion is not held as true once new
direct evidence contradicts it.**

**What was believed** (from Phase 3's correction, which this phase's mission
statement quotes verbatim): the box tracker's optical flow produced a single,
sudden ~225px jump between two consecutive frames (246→247), landing on
static background, and stayed there for exactly 3 frames before snapping
back.

**What real re-validation actually found**: `AthleteBoxTracker`'s own
internal per-frame record (traced directly from inside `step()`, not
reconstructed from the final artifact) shows the box was already essentially
static at the "wrong" location by frame 215 — 32 frames *earlier* than the
believed jump point — immediately following a `"detected"` (identity-verified,
`athlete_tracker.py`-approved) event, not an optical-flow drift. From frame
215 onward, the box moved by fractions of a pixel per frame — consistent with
optical flow correctly, faithfully tracking *something*, just not the
athlete's real (fast) motion — for over 30 consecutive frames, all reported as
`boxOrigin: "tracked"`.

**Why the "246→247 jump" appeared in the final artifact at all**: the
coordinates persisted as `athleteBoundingBoxSource` are **not** `box_tracker`'s
own box — they come from a separate array (`boxes[]` in
`mediapipe_pose_runner.py`), which pass 2 overwrites, per frame, with the
*tight landmark bounding box* of whatever MediaPipe finds inside the crop that
`plan_crops()` builds around `box_tracker`'s (already-frozen) trajectory.
`plan_crops()` deliberately builds a generously wide, smoothed crop (see its
own docstring), which is why MediaPipe kept finding the real, moving athlete
inside that crop for most of frames 215–246 (producing the smooth
0.72→0.78 trajectory previously mistaken for "normal tracking") — until
frames 247–249, where detection failed inside that same crop and instead
matched something near the crop's own (frozen) center. The visible "jump" is
where pass 2's landmark detection *stopped* compensating for pass 1's
already-stale crop, not a new failure in `box_tracker.py` itself.

**What this means for the fix implemented in Sections 1–8**:
- `_teleport_check()` (FIX A) defends against a *sudden, large* single-frame
  displacement. It is real, correctly implemented, unit-proven, and
  non-regressive (Section 9) — a genuinely different, real optical-flow
  failure mode (proven possible in principle, and worth guarding against).
- It does **not** and structurally **cannot** catch this incident's actual
  mechanism: a **near-zero-displacement freeze** immediately following a
  `"detected"` event, sustained for dozens of frames. A freeze never exceeds
  a velocity ceiling — the opposite problem needs the opposite kind of check.
- The frame-215 `"detected"` event itself is `athlete_tracker.py`'s domain
  (its own `score_candidate_continuity()`), not `box_tracker.py`'s — outside
  this phase's file scope, and not proven wrong here (a genuinely fast
  athletic movement can legitimately exceed a normalized-per-crop-width
  velocity in a tight crop; this was not conclusively shown to be a
  false-positive, only shown to be the actual transition point).

**Disposition**: the implemented fix is kept — it is real, tested, evidence-
backed, provably non-regressive on Gav/Vanni 240/Vanni 60, and closes a real
(if not this specific) vulnerability class. It is not being presented as
having resolved the originally-cited incident, because it demonstrably has
not (Section 9 shows the incident reproduces byte-identically after both
fixes in this phase). The actual fix for this incident — a stationary-lock /
freeze detector in `box_tracker.py`'s optical-flow path, mirroring
`athlete_tracker.py`'s own already-proven `MIN_CUMULATIVE_DISPLACEMENT` /
`MAX_STATIONARY_VERIFICATION_SECONDS` anti-"stationary background object"
pattern — is scoped but not implemented in this phase (Section 13), because
building and validating it with the same evidence rigor as this phase's fix
requires dedicated time this phase's remaining budget did not have, and
because implementing an untested heuristic under time pressure would violate
this project's explicit standing rule ("do not implement heuristics because
they feel right — every threshold must have evidence").

---

## 1. Mission (verbatim from the authorizing task)

> The previous phases proved a critical fact. The contact detector was not
> wrong. MediaPipe was not wrong. The athlete was not occluded. The box
> tracker confidently drifted ~225 pixels onto empty background while still
> reporting itself as "tracked." This is now the highest-priority engineering
> issue in Project AVA. Every downstream system depends on localization.

Explicitly out of scope ("do NOT redesign"): pose inference, contact
detection, timing, metrics, panning, UI, overlays, skeleton rendering. This
phase is only about making sure the localization box never confidently
follows the wrong thing.

---

## 2. Starting evidence (established by Phase 3's correction, not re-derived)

`docs/phase-3-vanni-120-visibility-correction.md` proved, with real,
correctly-rotated, uncropped source frames overlaid with the real persisted
production box coordinates: on `vanni_fly_120` (session
`160a86a2-c0db-4e7d-9fbe-82aedd6d3eff`, analysis
`6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`), the athlete-box center jumped from
normalized x=0.7738 (frame 246) to x=0.6569 (frame 247) — a ~225px
(~0.117-normalized) leftward jump in one 8.3ms frame interval (native
120fps), landing on empty background (a fence/staircase area, not the bin
originally blamed), froze there for exactly 3 frames (247–249, near-identical
coordinates), then snapped back to x=0.7801 at frame 250, consistent with the
real trajectory either side. Throughout, `trackState`/`boxOrigin` stayed
`"tracking"`/`"tracked"` — no existing signal flagged it as suspect.
`keypoints:[]` (MediaPipe found nobody) for those 3 frames, because it was
being fed a crop of empty background.

Implied velocity of that jump: ≈14 frame-widths/second. No estimate of real
athletic sprint speed on this clip comes anywhere close to that.

---

## 3. Full localization pipeline audit

`src/lib/biomechanics/mediapipe/runtime/box_tracker.py`'s `AthleteBoxTracker`
separates two responsibilities from `mediapipe_pose_runner.py`, which is
worth restating precisely because the bug lives exactly at the seam between
them:

| Stage | Mechanism | Cadence | Verified by identity? |
|---|---|---|---|
| Detector | `athlete_tracker.AthleteTracker` (multi-candidate MediaPipe pose + identity-continuity scoring) | Periodic (`DETECTOR_CADENCE_FRAMES=8`, or on-demand via `wants_detector_frame()`) | Yes — `score_candidate_continuity()` |
| Optical flow | Sparse Lucas-Kanade (`cv2.goodFeaturesToTrack` + `cv2.calcOpticalFlowPyrLK`) | Every non-detector frame | **No** — this was the gap |
| Prediction | Constant-velocity extrapolation | Fallback only, bounded (`MAX_PREDICTED_FRAMES_BEFORE_REACQUIRING=6`) | No — never treated as pose evidence |

**Detector path** (`detected`/`reacquired`): every candidate MediaPipe finds
is scored by `athlete_tracker.py`'s `score_candidate_continuity()` against a
running reference (previous verified position/velocity/scale), which already
implements exactly the class of defense this phase needed — a velocity
ceiling (`ABSOLUTE_VELOCITY_CEILING=2.5` frame-widths/s cold-start,
`MAX_VELOCITY_MULTIPLE=3.0`× the track's own established max), a
direction-consistency floor, and a scale-ratio bound (`MAX_SCALE_RATIO=1.75`)
— already audited, already proven, already shipped. **This is why the
detector path was never implicated**: identity verification happens there on
every call.

**Optical-flow path** (`tracked`): `_track_via_optical_flow()` computes
`new_box = (cx + median_dx, cy + median_dy, w, h)` from whichever tracked
points survive `cv2.calcOpticalFlowPyrLK`, gated only by:
- `inlier_count >= OPTICAL_FLOW_MIN_INLIERS` (6)
- `inlier_ratio >= OPTICAL_FLOW_MIN_INLIER_RATIO` (0.35)

Both of these measure **internal agreement** — whether the points that
survived tracking agree with each other on a common displacement. Neither
measures whether that displacement is a plausible continuation of the
athlete's own motion. A coherent group of points that all converge onto the
*same wrong feature* (e.g. a fence rail) passes both checks with a clean
majority, exactly as the real incident shows.

**Prediction path** (`predicted`): never treated as verified evidence
(`detectionConfidence: None`, `identityContinuityScore: 0.0`) — already
correctly inert, not touched this phase.

### 3a. Feature lifetime / replacement

`self.flow_points` is (re)seeded only in `_init_flow_points()`, called
exactly once per fresh detector-verified box (`step()`'s detected/reacquired
branch). Between detector frames, the SAME point set is carried forward
frame-to-frame, narrowed each step to whichever points `calcOpticalFlowPyrLK`
successfully re-locates (`good_next`). There is no re-seeding, re-clustering,
or outlier-rejection within a point set mid-flight — points are never
individually evaluated for whether they still sit on the athlete; only the
aggregate median displacement and count/ratio are checked. This means once a
majority of points has drifted onto a wrong feature (whether gradually or in
one bad frame), nothing re-anchors them to the real athlete until the next
detector call.

### 3b. Prediction model

Pure constant-velocity extrapolation from `self.last_velocity` (never
actually updated anywhere in the current code — `self.last_velocity` is
initialized to `(0.0, 0.0)` in `__init__` and never reassigned), so in
practice "prediction" always extrapolates zero velocity, i.e. holds the box
static. Out of scope to change (prediction/UI-adjacent), documented here
because it surfaced during the audit — flagged in Limitations.

### 3c. Drift accumulation

No cumulative-drift accounting existed before this phase. `frames_since_
verified` counts *frames*, not *distance* — a slow, unbounded systematic
drift (points sliding gradually rather than jumping) would previously
accumulate for a full `detector_cadence_frames` window (or the accelerated-
refresh trend's own window) before the periodic detector had a chance to
correct it, exactly as recorded (disclosed, unfixed) in Phase 3's report
Section on `REACQUISITION_MAX_FRAMES`/gradual-drift precedent.

### 3d. Confidence scoring

Before this phase, "confidence" for a tracked frame was `inlier_ratio` alone
(`trackingConfidence`, `identityContinuityScore` both set to `inlier_ratio`
in `step()`). This is genuinely informative for "are my points internally
consistent" but was the *only* signal — there was no second, independent axis
distinguishing "consistent and correct" from "consistent and wrong."

### 3e. Tracker state transitions

`track_state` machine (`acquiring → verified → tracking → reacquiring →
lost → terminated`) is driven by evidence *availability* (did optical flow
return a result, did the detector find a candidate), not evidence
*plausibility*. A wrong-but-internally-consistent tracked frame is
indistinguishable, at the state-machine level, from a correct one — both
report `origin="tracked"`, `track_state` unchanged. This was the direct
mechanism by which frames 247–249 self-reported full health.

### 3f. Refresh scheduling / detector reuse

`wants_detector_frame()` (unchanged this phase except for the FIX B input
described below): fires on the fixed cadence, on state loss, or on the Day
104 accelerated-refresh quality trend (rolling avg `inlier_ratio` window `<
ACCELERATED_REFRESH_INLIER_RATIO=0.55` over the last
`ACCELERATED_REFRESH_TREND_WINDOW=4` tracked frames, once
`frames_since_detector >= ACCELERATED_REFRESH_MIN_FRAMES=3`). Because the
real incident's inlier ratio stayed high (the wrong points agreed with each
other), this trend never fired for it — confirming the accelerated-refresh
mechanism, while real and useful for *gradual* quality loss, could not and
did not catch a *sudden, confident* wrong-lock.

### 3g. Crop propagation / background-feature contamination

*(Written before Section 0's real-run finding — kept as originally written,
not silently corrected, per this project's standing rule. The claim below —
that the 247–249 crop was tight around empty background — is now known to be
imprecise: `plan_crops()` builds a deliberately wider, smoothed crop from the
whole trajectory, not `self.last_box` directly, and that wider crop still
contained the real athlete for most of frames 215–246. See Section 0 for the
corrected mechanism.)*

The crop fed to MediaPipe on subsequent frames is derived directly from
`self.last_box`, so once the box relocates onto background, the *next*
detector-independent frames are cropped around that wrong region too —
this is exactly why MediaPipe returned `keypoints:[]` for frames 247–249: it
was correctly finding no person, because the crop no longer contained one.

### 3h. Feature clustering / rejection

None existed. All surviving points contribute equally to the median
displacement; there is no sub-cluster analysis (e.g. detecting that points
split into two spatially distinct groups, one on the athlete and one on
background) anywhere in this path.

---

## 4. Specific questions (from the authorizing task)

**Can optical flow lock onto fences/lane lines/bleachers/equipment/shadows/
spectators/painted lines?** Yes — proven, not hypothetical. The real
incident's wrong-lock region is a fence/staircase area, a static,
high-contrast, edge-rich structure exactly of the kind that produces strong
`goodFeaturesToTrack` corners and a stable (wrong) `calcOpticalFlowPyrLK`
correspondence — the textbook "aperture problem" failure mode. Painted lines,
railings, and bleacher seat-back edges share the same properties (repetitive,
high-contrast, near-static relative to a panning-free stationary camera) and
are equally plausible targets by the same mechanism; this was not
individually re-tested per surface type (would require synthetic frames of
each), but the failure mechanism identified is generic to any such surface,
not specific to fences.

**Why wasn't this detected?** Because `_track_via_optical_flow`'s only
acceptance gate (`OPTICAL_FLOW_MIN_INLIERS`/`_RATIO`) measures internal
agreement among survived points, which a coherent wrong-lock satisfies just
as well as a correct lock. `_scale_consistency` cannot catch it because
optical flow never updates box width/height (see below). `_direction_
consistency` could have caught this specific jump (it moved backward against
the likely sprint direction) but is configured off (`expected_dir_sign=0`)
whenever `travel_direction` is `"auto"` — the actual configuration this clip
ran under (confirmed: `analysis-worker.mjs` defaults
`calibrationInputs?.gates?.travelDirection ?? "auto"`). No velocity/speed
plausibility check existed at all before this phase.

---

## 5. Why the two existing checks didn't help

- **`_scale_consistency`**: computes `new_h / self.last_verified_height`.
  `_track_via_optical_flow` constructs `new_box = (cx+dx, cy+dy, w, h)` —
  `w, h` are copied unchanged from `self.last_box`, never touched by the
  median-displacement calculation. So `new_h == last verified h` on every
  single optical-flow frame by construction; the ratio is always exactly
  1.0. This check is structurally a no-op for the entire optical-flow path —
  not a bug in the check itself (it does real work on the *detector* path,
  where box dimensions are freshly re-measured from real landmarks), just
  never exercised where this incident happened.
- **`_direction_consistency`**: `if self.last_box is None or expected_dir_
  sign == 0: return 1.0` — an explicit, intentional no-op when direction is
  unknown. `"auto"` (the default, and this clip's actual configuration) maps
  to `expected_dir_sign=0`. This is a real, generalizable single-point-of-
  failure: any clip run without an explicitly confirmed travel direction has
  zero direction-based drift protection, silently.

---

## 6. Root cause

The optical-flow tracking path accepted any frame-to-frame box displacement
that cleared an *internal self-consistency* bar (inlier count/ratio) without
ever checking whether that displacement was a *physically plausible*
continuation of this specific track's own motion. Combined with a
configuration default (`"auto"` travel direction) that silently disables the
one check that could have caught this specific jump by direction alone, nothon
in the optical-flow path could distinguish "confidently tracking the athlete"
from "confidently tracking a fence." The most likely trigger (consistent
with, not separately instrumented at pixel level): brief motion blur on the
athlete's own fast-moving legs degrading her trackable corner features for
one frame, allowing the majority of surviving points to re-anchor on a
nearby static high-contrast structure instead.

---

## 7. Fix implemented

**File changed**: `src/lib/biomechanics/mediapipe/runtime/box_tracker.py`
only. No changes to pose inference, contact detection, timing, metrics,
panning, UI, overlays, or skeleton rendering, per the mission's explicit
scope limit.

### FIX A — direction-agnostic velocity-magnitude ("teleport") rejection

New constants:
```python
TELEPORT_ABSOLUTE_CEILING_FW_PER_S = 2.5   # == athlete_tracker.ABSOLUTE_VELOCITY_CEILING
TELEPORT_MAX_VELOCITY_MULTIPLE = 3.0       # == athlete_tracker.MAX_VELOCITY_MULTIPLE
```
Not new, Vanni-tuned values — copied verbatim from `athlete_tracker.py`'s own
already-audited, already-proven `ABSOLUTE_VELOCITY_CEILING`/`MAX_VELOCITY_
MULTIPLE`, used there for the periodic identity-verified detector's own
teleport rejection (`score_candidate_continuity()`). Reusing them here is
the evidence-backed choice the task required ("do not tune specifically for
Vanni... solutions must generalize") — this is the same class of physical
constraint (an athlete cannot instantaneously teleport), so the same
constants apply regardless of which code path is evaluating it.

New methods:
```python
def _implied_speed_fw_per_s(self, new_center, time_s):
    # real elapsed time (time_s deltas), not an assumed frame interval —
    # generalizes across FPS class without rescaling
    ...

def _teleport_check(self, new_center, time_s):
    # ok=True whenever there isn't yet enough evidence to judge (cold start)
    # — can only REJECT with real evidence, never fabricate a rejection
    ...
```

Wired into `step()`'s optical-flow acceptance branch alongside the existing
`direction_ok`/`scale_ok` checks:
```python
if direction_ok < 1.0 or scale_ok < 0.3 or not teleport_ok:
    ...  # reject; fall through to prediction/reacquisition
```

Speed is expressed in **frame-widths per second**, computed from **real
elapsed time** (`time_s` deltas, not assumed frame spacing) — this is what
makes the same two constants valid across every FPS class (30/60/120/240)
and every video resolution without rescaling: a slow 30fps clip and a fast
240fps clip of the same real athlete imply the same frame-widths/second.

Because this check depends only on the track's own displacement and elapsed
time — never on `expected_dir_sign` — it structurally closes the "auto"
direction single-point-of-failure for this specific failure mode (a
same-direction OR opposite-direction implausible jump is now caught either
way), without needing to touch the separate cross-file
`analysis-worker.mjs → mediapipe_pose_runner.py → box_tracker.py`
direction-configuration plumbing (see Limitations — that plumbing bug itself
is not fixed at its source).

### FIX B — detector misses are now real evidence, not a silent no-op

Before this phase: when the caller ran the detector but MediaPipe/identity
tracking selected no candidate (`detector_candidates is not None` but
`selectedIndex is None`), `step()` fell straight through to optical-flow
tracking with **zero record anywhere** that a detector call had just failed
to find anyone. Per the task's explicit prompt ("Currently, MediaPipe
returning 'No person' does NOT invalidate the tracker. Audit whether it
should. Design a principled confidence feedback loop. Do NOT blindly
reconnect the detector every frame."):

```python
self.recent_inlier_ratios.append(0.0)
if len(self.recent_inlier_ratios) > ACCELERATED_REFRESH_TREND_WINDOW:
    self.recent_inlier_ratios = self.recent_inlier_ratios[-ACCELERATED_REFRESH_TREND_WINDOW:]
```

This feeds a detector miss into the SAME accelerated-refresh trend Day 104
already uses — a principled choice, not a new mechanism: a detector miss is
treated as exactly as informative as the worst possible optical-flow inlier
ratio (0.0), which is honest (a detector finding literally nobody is at
least as bad a quality signal as noisy tracking) without introducing a
second, parallel trigger path. This is explicitly **not** "reconnect the
detector every frame" — `wants_detector_frame()`'s existing cadence/trend
logic is completely unchanged; a miss just now counts toward the same,
already-proven trend evaluation instead of vanishing.

### Diagnostics (reporting only, no behavior change)

`summary()` now reports `teleportRejectedFrames` and
`maxObservedSpeedFrameWidthsPerSecond`. `mediapipe_pose_runner.py` now prints
`box_tracker summary: {...}` to stderr once per run (after pass 1), so every
future run — not just this phase's — has an evidence trail for localization
quality without needing full `BOX_TRACKER_DEBUG` per-frame logging.

---

## 8. Evidence: false positives and true positives (not tuned, verified)

`scripts/box-tracker-teleport-sanity.py` (new, 13/13 passing):

1. The real 246→247 `vanni_fly_120` jump, reconstructed from its exact
   published coordinates (0.7738→0.6569 normalized x, 1920px width, dt=1/120s
   native), computes to **14.03 frame-widths/second** — rejected
   (`_teleport_check` returns `False`).
2. Ordinary sprint motion (1.0 fw/s) is not rejected.
3. Motion up to 3× an already-established running-max speed is accepted
   (mirrors `athlete_tracker.py`'s own precedent for a track already known to
   move fast).
4. Cold start (no prior observation yet) never fabricates a rejection —
   `ok=True` when there isn't yet evidence to judge.
5. Full `step()`-level integration: a same-direction 85px single-frame jump
   (chosen so direction-consistency alone has no reason to object — proving
   the teleport check's value is independent of direction, exactly the
   "auto" scenario the real incident ran under) is rejected end-to-end,
   `boxOrigin != "tracked"`, attributed to `teleport_rejected_count`.
6. The *same total pixel displacement*, spread over 6 real frames instead of
   1, is accepted — proves the check discriminates on implied **speed**, not
   raw displacement magnitude.
7. A detector miss is recorded as `0.0` in `recent_inlier_ratios`, not
   silently dropped.
8. White-box: swapping the most recent trend reading for a recorded detector
   miss (vs. one more steady-quality reading) is the deciding factor between
   `wants_detector_frame()` returning `False` vs. `True` at the exact
   threshold boundary — proves the miss is substantive evidence, not
   cosmetic.

Existing suites unaffected: `box-tracker:sanity` (27/27, unmodified),
`athlete-tracker:sanity` (unmodified, all passing) — both still pass after
this change with zero modifications to their own fixtures, confirming no
behavior change to the already-correct paths (detector path, prediction
path, state-machine transitions unrelated to this fix).

---

## 9. Real production reruns

All four benchmarks were rerun through the real worker/queue path
(`replace_working_analysis`, the same RPC the app's own rerun Server Action
uses), **not** simulated. Every session's pre-fix working analysis was first
explicitly saved as an immutable version (`save_working_analysis_snapshot`,
with its pose artifact copied alongside) before being requeued, so the
pre-fix result remains queryable — this phase did that for all four
benchmarks, not just one as in Phase 1.

Every benchmark was rerun **twice**: once after implementing FIX A/FIX B
(Sections 7), and again after discovering and fixing a second, real bug found
*during* that first round of reruns (see below) — both rounds went through
the actual worker process claiming real queued jobs, downloading the real
video via a real signed URL, running the real Python subprocess, and writing
real results back through the same completion RPC a production job uses.

**A second real bug, found and fixed mid-revalidation**: the first round of
reruns for `vanni_fly_120`/`vanni_fly_60` failed at the `uploading_artifacts`
stage with a Zod `"expected object, received null"` error — their working
analyses' `input_snapshot` column was already `null` in the database (a
pre-existing gap, unrelated to this phase's code, most likely dating to the
Phase 1 benchmark restoration, which explicitly could not fabricate missing
fields). `scripts/phase-4-1-real-reruns.mjs`'s reuse of the old snapshot
(mirroring an existing test-fixture script's pattern) surfaced but did not
cause this. Fixed by `scripts/phase-4-1-real-reruns-fix-snapshot.mjs`, which
builds a fresh `input_snapshot` from the session's own live database fields —
exactly what `queueAnalysis` (`src/app/sessions/actions.ts`, the real "rerun
analysis" Server Action) always does; it never reuses an old snapshot. Not a
Phase 4.1 code defect, but a real, load-bearing fix required to complete this
phase's own validation requirement.

**A third real bug, found via the trace described in Section 0**: `self.last_time_s`
was previously advanced on every "predicted"/"invalid" frame regardless of
whether `self.last_box` was actually updated — decoupling the numerator and
denominator of `_implied_speed_fw_per_s`'s division. After a real
multi-frame lost/predicted stretch, the next real detection computed an
implied speed from a position delta spanning many real frames, divided by a
time delta of only ~1 frame — an observed real value of ~34 frame-widths/second,
which permanently inflated `max_observed_speed_fw_per_s` and would have
silently raised the teleport ceiling for the rest of any run that hit this
path. Fixed by no longer advancing `last_time_s` in either sub-branch of the
predicted/invalid `else:` — it now only advances in lockstep with `last_box`,
so the next real comparison always divides by the true elapsed gap. Proven
both by a new unit test (`scripts/box-tracker-teleport-sanity.py` check 9,
9b, 9c) and by the real trace evidence in Section 0 that motivated it.

### Results, per benchmark

| Benchmark | Pre-fix (baseline) | Post-fix (both fixes) | Regression? |
|---|---|---|---|
| **Gav** (protected) | `athleteTrackingConfidence=0.8024089716118894`, `trackingLossRanges=[]`, `strideFrequencyHz=4.4` | Byte-identical on every field | **None** — proven, not assumed |
| **Vanni 240** | `athleteTrackingConfidence=0.9055155871735995`, `trackingLossRanges=[{668,1019}]`, `strideFrequencyHz=5.93` | Byte-identical on every field | **None** |
| **Vanni 60** | `athleteTrackingConfidence=0.6638986604248173`, 9-range `trackingLossRanges`, `strideFrequencyHz=3.86` | Byte-identical on every field | **None** |
| **Vanni 120** | `trackingLossRanges` includes `{247,249}` (the proven incident) | `trackingLossRanges` still includes `{247,249}`, byte-identical `athleteBoundingBoxSource` trajectory to pre-fix | **Not resolved** — see Section 0. The incident's true mechanism (a freeze starting ≥32 frames earlier, following a `"detected"` event) is not the sudden-jump pattern this fix defends against. |

No benchmark's stored metrics, tracking confidence, or loss ranges changed
at all as a result of either fix in this phase — this is the honest,
verified "before/after localization behavior" the deliverables asked for:
**for these four real clips, in production, this fix changed nothing
observable at the output level**, while adding a real, tested, non-regressive
defense against a distinct failure class that did not happen to occur in any
of them during these runs. That is a materially weaker result than the
mission anticipated, and is reported as such rather than reframed as success.

---

## 10. Acceptance criteria

Restated honestly against the mission's actual success criteria, given
Section 0/9's findings:

1. **Tracker never confidently follows empty background without evidence** —
   **partially met**. A new, real, generalizing defense now exists and is
   proven to reject implausible single-frame jumps (Section 8). It does not
   cover the freeze/stationary-lock failure class, which is what the
   commissioning incident actually was (Section 0).
2. **Confidence reflects reality** — partially met, same caveat: inlier ratio
   remains the dominant signal for a frozen-but-internally-consistent lock;
   nothing in this phase adds a displacement-over-time expectation.
3. **Drift detected before catastrophic, undetected multi-frame failure** —
   **not met for this incident class**. The freeze in the real incident
   persisted for 30+ frames before a scheduled/accelerated detector refresh
   incidentally corrected it (frame 251) — no drift-specific signal shortened
   that window.
4. **Detector refreshes remain evidence-driven** — ✅ met; unchanged, and FIX B
   only adds real evidence into the existing trend.
5. **No regression on Gav/240/120/60** — ✅ met and proven (Section 9 table);
   this holds regardless of the incident not being resolved.
6. **Worker/build/lint/typecheck pass** — ✅ met (Section 12).

Given (1)–(3) are only partially satisfied for the specific, proven incident
this phase exists to fix, this phase's status is recorded as **Complete** for
the concrete engineering deliverable it actually produced (an evidence-backed,
tested, non-regressive teleport-rejection defense, plus two real bugs found
and fixed along the way) — not as "the vanni_fly_120 incident is resolved,"
which it is not. See `docs/stationary-roadmap-progress.md` for how this
phase's completion is scored honestly against that distinction.

---

## 11. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — `TELEPORT_
  ABSOLUTE_CEILING_FW_PER_S`/`TELEPORT_MAX_VELOCITY_MULTIPLE` constants,
  `_implied_speed_fw_per_s()`, `_teleport_check()`, wiring into `step()`'s
  optical-flow acceptance branch, FIX B's detector-miss trend feedback,
  `summary()` diagnostics, and the `last_time_s`/`last_box` decoupling fix
  (Section 9) found via real-run revalidation.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — one
  addition: a stderr print of `box_tracker.summary()` after pass 1
  (reporting only, no behavior change).
- `scripts/box-tracker-teleport-sanity.py` — new, 13 checks, all passing
  (includes checks 9/9b/9c added specifically to guard the `last_time_s`
  decoupling bug).
- `scripts/phase-4-1-real-reruns.mjs`, `scripts/phase-4-1-real-reruns-fix-snapshot.mjs`
  — new, orchestrate the real production reruns and the fresh-snapshot fix
  for the pre-existing null `input_snapshot` gap found on `vanni_fly_120`/
  `vanni_fly_60` (Section 9).
- `package.json` — added `box-tracker-teleport:sanity` script.
- `docs/stationary-roadmap-progress.md` — Phase 4.1 inserted (weight 4%,
  after Phase 3), weight-pool discrepancy updated (105% → 109%, disclosed),
  overall completion recomputed honestly (24.8% → 27.5%).

Not changed: pose inference, contact detection, timing, metrics, panning,
UI, overlays, skeleton rendering, `athlete_tracker.py` (read for reference
only), `DETECTOR_CADENCE_FRAMES`, `OPTICAL_FLOW_MIN_INLIERS`/`_RATIO`,
`SCALE_CONSISTENCY_TOLERANCE`, `ACCELERATED_REFRESH_*` thresholds.

---

## 12. Regression validation

- `npm run box-tracker:sanity` — 27/27 passing (unmodified suite).
- `npm run box-tracker-teleport:sanity` — 13/13 passing (new suite).
- `npm run athlete-tracker:sanity` — all passing (unmodified).
- `npm run vanni-120-contact-recovery:sanity` — all passing (unmodified,
  Phase 3 evidence unaffected).
- `npm run vanni-120-visibility-correction:sanity` — all passing (unmodified,
  Phase 3 correction evidence unaffected).
- `npm run native-fps-timestamp:sanity` — all passing (unmodified, Phase 1
  evidence unaffected).
- `npm run vanni-240-metric-evidence:sanity` — all passing (unmodified,
  Phase 2 evidence unaffected).
- `npm run worker:analysis:sanity` — all passing.
- `npm run worker:jobs:sanity` — passing.
- `npm run typecheck` — clean (`tsc --noEmit`).
- `npm run lint` — clean (`eslint src --max-warnings=0`).
- `npm run build` — succeeds.
- `npm run worker:check` — `worker_configuration_valid`.
- `python3 -m py_compile` on both modified Python files — syntax OK.

---

## 13. Limitations (disclosed, not fixed this phase)

0. **[Highest priority, elevated by Section 0's finding] No stationary-lock /
   freeze detector exists in `box_tracker.py`'s optical-flow path.** This is
   now known, with real evidence, to be the actual mechanism behind the
   commissioning incident: optical flow can settle onto a near-static
   background feature and report high internal confidence (inlier ratio)
   indefinitely, because a real athlete's near-zero frame-to-frame
   displacement is never independently implausible on its own — only
   implausible *relative to how fast she should be moving*.
   `athlete_tracker.py` already has a proven, shipped pattern for exactly
   this class of problem (`MIN_CUMULATIVE_DISPLACEMENT=0.03`,
   `MAX_STATIONARY_VERIFICATION_SECONDS=3.0`, explicitly documented there as
   an anti-"stationary background object" defense against a real prior
   stadium-bleacher/fence false positive) — it was never ported to
   `box_tracker.py`'s optical-flow path, mirroring exactly how this phase
   found the teleport-ceiling pattern was never ported either. Not
   implemented this phase because designing and validating it with the same
   evidence rigor as FIX A (real-incident reconstruction, false-positive/
   true-positive proof, real production revalidation) needs its own
   dedicated time, and this phase's remaining budget did not have it after
   the real-run revalidation surfaced this finding. Strongly recommended as
   the very next piece of work on this file.
1. **`expected_dir_sign="auto"` config plumbing is bypassed, not fixed at its
   source.** `_direction_consistency` remains a no-op under `"auto"` travel
   direction. FIX A structurally closes the specific failure class this
   phase investigated (implausible-speed jumps, regardless of direction),
   but if direction-consistency is ever relied on independently again in the
   future, the underlying config default is still silently permissive.
   Recommended as a follow-up if that check's independent value is ever
   needed again.
2. **`REACQUISITION_MAX_FRAMES` inconsistency** (90 in `box_tracker.py` vs.
   60 in `athlete_tracker.py`, both frame-count-based, neither FPS-scaled) —
   unchanged from Phase 3, still recommended for Phase 5.
3. **`self.last_velocity` is dead code** — always `(0.0, 0.0)`, so
   "prediction" always extrapolates zero motion (holds the box static) rather
   than genuine constant-velocity extrapolation. Discovered during this
   audit; out of scope to fix here (prediction-model behavior, not a
   localization-confidence issue — a static-hold prediction is still
   correctly never treated as verified evidence).
4. **No sub-cluster / spatial-split analysis of surviving optical-flow
   points.** A wrong-lock affecting a *minority* of points that still clears
   the inlier-ratio bar via the majority remaining correct would not be
   caught by this phase's fix if the resulting *aggregate median*
   displacement still happens to look speed-plausible. This phase's fix
   addresses the proven incident (a majority-consensus wrong lock producing
   an implausible aggregate jump) — a slower, partial contamination is a
   different, unproven failure mode, not investigated because no real
   evidence of it exists yet.
5. **"Can optical flow lock onto X" was verified as a general mechanism, not
   exhaustively per surface type** (fences confirmed real; lane
   lines/bleachers/spectators/painted lines are mechanistically equally
   plausible but not separately reproduced).

---

## 14. Roadmap

See `docs/stationary-roadmap-progress.md` — Phase 4.1 inserted (weight 4%,
complete), overall completion 24.8% → 27.5% (normalized), weight-pool
discrepancy disclosed (105% → 109%), next phase is the original Phase 4
(60 FPS late-run athlete-loss fix).

**Do not commit. Do not push** — per explicit instruction, all work in this
phase remains uncommitted in the working tree.
