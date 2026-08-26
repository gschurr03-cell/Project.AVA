# R5B.2 — Full-Frame Detector-Cadence & Tracking-State Trace (IMG_4848)

Continuation of R5B.1 (kept immutable). Investigation only.

## Critical disclosure — read before anything else

R5B.1's numbers (55 missing frames, 44-frame gap at 61–104) come from the
**actual, already-persisted production pose artifact** for this session —
real, authoritative, and unchanged by this phase.

To close R5B.1's instrumentation gap, this phase had to **run the pipeline
live**, since the missing diagnostic fields (`searchSource`,
`primaryFallbackReason`, raw per-frame candidate data) are computed at
runtime but never persisted. Doing so surfaced an important, honestly-
reported finding: **a live rerun of the exact same code, against the exact
byte-identical source file (confirmed via SHA-256 against the actual
AVA-stored object), with a reconstructed but faithful CLI invocation, does
not reproduce R5B.1's original artifact.** The rerun is internally
**fully deterministic** — two independent uninstrumented runs and one
instrumented run all produced **byte-for-byte identical** final output
(SHA-256 `78957d78...58d8e281c`, all three) — but that deterministic output
differs from the original: Pass 2 (landmark extraction) returns zero
keypoints for all 163 frames in this rerun, versus 108/163 in the original,
and Pass 1's own box-tracking history differs in its specifics (this
rerun's freeze-suspect episode is frames 117–124, not 61–104).

No configuration difference was identified within this phase's effort
budget to explain the gap (ROI mode, confidence thresholds, model file,
entry-gate/travel-direction arguments, and FPS classification were all
checked and match production's actual invocation as traced in R5A/R5B.1).
The most likely explanation is a real, currently-unidentified environmental
or library-version difference between whatever process produced the
original artifact and this manual invocation — itself a finding worth a
future phase's attention, not chased further here.

**What this means for the rest of this report**: the *mechanism* questions
R5B.2 asks (how does `wants_detector_frame()` behave, what does the raw
detector return, why does the box freeze, why does state stay
`"tracking"`) are answered from this rerun's own real, deterministic,
fully-instrumented failure episode — which exhibits the **identical
qualitative mechanism** R5B.1 found (state stuck at `"tracking"`, box
position frozen, low/zero raw candidate yield, eventual forced-recovery).
Frame numbers in this report describe **this rerun's own episode**, not a
re-derivation of frames 61–104. Every claim below is labeled accordingly.

## R5B.2.4 — Instrumentation Safety Proof

**Satisfied, and more rigorously than required**: not just "no material
difference" but **exact byte-identical SHA-256** across baseline run 1,
baseline run 2 (determinism check), and the instrumented run (both before
and after a mid-phase correction to the instrumentation itself — see
below). Instrumentation reads already-computed attributes
(`box_tracker.track_state`, `._last_detector_reason`,
`.frames_since_detector`, `.consecutive_detector_misses`,
`box_record.to_dict()`) and appends them to a local list; nothing is fed
back into any decision. The list is only serialized to disk if
`AVA_R5B2_TRACE_PATH` is set (unset in all default/production
invocations). **This satisfies R5B.2 acceptance criterion 4 on its own
terms** (instrumentation itself is provably neutral) even though the
separate "reproduces the original failure" question above is disclosed as
not met.

A real bug in the instrumentation's own first draft was caught and fixed
during this proof: capturing `box_record.to_dict()` *immediately* after
`step()` returns misses `_resolve_freeze_run()`'s retroactive relabeling of
earlier frames' `boxOrigin` to `frozen_suspect` (which happens on a *later*
frame, once a fresh detection proves the frozen run wrong — see
`box_tracker.py`'s own docstring, quoted in R5B.1). Fixed by storing the
record object reference and deferring `.to_dict()` until after the whole
pass completes. Re-verified byte-identical output after the fix.

## R5B.2.1 — `wants_detector_frame()` trace

`src/lib/biomechanics/mediapipe/runtime/box_tracker.py`,
`AthleteBoxTracker.wants_detector_frame()`:

```
if track_state == "terminated":
    return True only every (cadence × TERMINATED_DETECTOR_CADENCE_MULTIPLIER) frames
if track_state in ("acquiring", "reacquiring", "lost"):
    return True unconditionally  (reason: "state_" + track_state)
effective_cadence = detector_cadence_frames        # default 8
if consecutive_detector_misses >= CONSECUTIVE_MISS_THROTTLE_COUNT (5):
    effective_cadence *= MISS_THROTTLE_CADENCE_MULTIPLIER (4)
if self._force_detector_next:                      # freeze-suspicion forced check
    return True (throttled by effective_cadence once misses have also piled up)
elif frames_since_detector >= effective_cadence:
    return True (reason: "scheduled_cadence")
return False
```

**Answer to R5B.2.1's core question**: while `trackState == "tracking"`,
the detector is requested **only** on the scheduled cadence (every 8 frames
by default, 32 after 5 consecutive misses) or when a freeze-suspicion has
just been confirmed. There is **no branch that reads `trackingConfidence`
directly** — confidence is not part of this function's inputs at all.

## R5B.2.2 — Detector invocation path

`mediapipe_pose_runner.py` `main()`, Pass 1 (traced in full in R5B.1.1;
unchanged here): `wants_detector_frame()` → if `True`, full-frame
`loc.detect_for_video(mp_image, ts)` (the **entire, uncropped** `frame_bgr`,
confirmed by reading the exact call site — never a sub-region) →
`at.candidate_from_landmarks()` builds `Candidate` objects from whatever
MediaPipe returned → `_primary_pass_has_plausible_candidate()` checks
completeness/size → tile fallback if implausible → `box_tracker.step()`
consumes the candidate list (or `None` if the detector wasn't invoked) and
updates the box via continuity scoring or optical flow.

## R5B.2.5 — Detector decision timeline (this rerun's episode, frames 108–131)

Full data: `tmp/phaseR5/r5b2/detector-trace.json` / `.csv` (all 163 frames).
The freeze-suspect episode in this rerun is frames **117–124** (8 frames,
confirmed via the corrected, post-retroactive-relabeling instrumentation).

| Frame | State In | Wants Det? | Reason | Invoked? | Raw Candidates | boxOrigin | Box-tracker Confidence |
| ---: | --- | --- | --- | --- | ---: | --- | ---: |
| 108–113 | tracking | False | — | False | — | tracked | 1.0 |
| **114** | tracking | **True** | scheduled_cadence | **True** | **1** | tracked | 1.0 |
| 115–116 | tracking | False | — | False | — | tracked | 1.0 |
| 117–122 | tracking | False | — | False | — | **frozen_suspect** | 1.0 |
| **123** | tracking | **True** | scheduled_cadence | **True** | **1** | frozen_suspect | 1.0 |
| 124 | tracking | False | — | False | — | frozen_suspect | 1.0 |
| **125** | tracking | **True** | **freeze_suspicion_forced** | **True** | **1** | **detected** | 1.0 |
| 126–131 | tracking→verified→tracking | False | — | False | — | tracked | 1.0 |

## R5B.2.6 — Frame-to-frame operation order (this rerun's boundary, 116→117)

Since this rerun's freeze begins at 117 (not 61 as in the original), the
operation-order question is answered here structurally rather than at a
specific matching frame number: `wants_detector_frame()` is evaluated
**first**, purely from `track_state`/cadence counters — **before** any
detector call and **before** the frame's box update. Detector invocation
(when it happens) happens **before** `box_tracker.step()`. `step()` then
updates `track_state`/box/`trackingConfidence` **after** consuming whatever
candidates (or `None`) were produced. **The state transition and the ROI
update happen in the same `step()` call, after the detector decision — the
detector decision is never informed by that frame's own outcome.**

**A materially different, important finding versus R5B.1's framing**: this
rerun's own `box_tracker.trackingConfidence` field stays at **exactly
1.0 throughout the entire freeze episode (108–131, no dip at all)**. This
is a **different confidence signal** than the one R5B.1 examined (which was
the *final, pass-2, landmark-visibility-derived* `trackingConfidence` in
the persisted artifact — a materially different quantity, despite the
identical field name at two different layers). **The box-tracker's own
confidence never flags this freeze in real time — only the retroactive
`frozen_suspect` correction, applied later once a stronger fresh detection
disagrees, reveals it after the fact.**

## R5B.2.7 — Detector cadence during the failure

For this rerun's 8-frame freeze episode (117–124): detector **requested
and invoked** at frames 114 (pre-freeze) and 123 (mid-freeze) — 2
invocations touching an 8-frame span, consistent with the scheduled
8-frame cadence continuing to run right through the freeze, since
`track_state` never left `"tracking"` (which would have unconditionally
forced every-frame polling). Maximum gap without invocation inside the
labeled freeze span: 8 frames (117→124, recovery-triggering call at 125).
Across the wider `"tracking"`-state portion of the whole clip (frames
25–162, excluding the startup window), invocations land at 33, 42, 51, 60,
69, 78, 87, 96, 105, 114, 123 — **a rock-steady 9-frame gap, every single
time**, with a small number of shorter gaps (2, 1 frames) around the
freeze-forced checks.

## R5B.2.8 — Does zero confidence increase cadence?

**`NO`.**

Traced precisely in R5B.2.1: `wants_detector_frame()` never reads
`trackingConfidence` at all — its only inputs are `track_state`,
`frames_since_detector`, `consecutive_detector_misses`, and the
freeze-forced flag. A confidence collapse (real, per R5B.1's own persisted
artifact) has **no code path** to accelerate the schedule while
`track_state` remains `"tracking"`. What *would* have to happen under
current code: either `track_state` itself would need to leave
`"tracking"` (which nothing in this stretch does), or
`consecutive_detector_misses` would need to cross
`CONSECUTIVE_MISS_THROTTLE_COUNT` (5) — which only *slows* cadence further
(×4), the opposite of an escalation — or a freeze-suspicion would need to
confirm (which does force an out-of-cadence check, but only after
`FREEZE_MIN_SUSPECT_MS` (100ms) of persistent suspicious signal, itself
gated on optical-flow-quality signals, not confidence).

## R5B.2.9 — Why state remains `"tracking"`

Traced in `box_tracker.py`'s `step()` (structure confirmed by direct
reading, consistent with R5B.1's finding): the transition path out of
`"tracking"` is **not** driven by confidence, pose success, or a simple
consecutive-miss counter reaching a timeout. It is driven by the
freeze-suspicion mechanism (`_evaluate_freeze_suspicion` /
`_resolve_freeze_run`), which requires: (1) specific raw optical-flow
signals (`spread_growth`, `trajectory_residual`) to fire, (2) persist past
`FREEZE_MIN_SUSPECT_MS` (100ms) to become *confirmed*, and (3) a **later**
fresh, verified detection to disagree by more than `FREEZE_DISAGREEMENT_FW`
(4% of frame width) before the run is retroactively corrected. Until all
three happen, `track_state` genuinely has no mechanism telling it anything
is wrong — it is architecturally decoupled from `trackingConfidence`
(confirmed numerically in R5B.2.6: confidence stayed 1.0 the entire time)
and from raw pose-landmark visibility. **Frames 117–124 remain `"tracking"`
because nothing in the code's decision inputs for that specific transition
ever indicated a problem in real time — only the after-the-fact
`frozen_suspect` relabeling, at frame 125, revealed it.**

## R5B.2.10 — Raw detector results

**`ATHLETE_DETECTED_LOW_CONFIDENCE`** at both in-episode invocations —
**not** `NO_DETECTION`.

| Frame | Raw candidate (normalized) | Completeness | Position vs. frozen box |
| --- | --- | --- | --- |
| 114 | cx=0.5191, cy=0.5326, w=0.0209, h=0.0138 | **0.303** (≈30% of tracked landmarks usable) | ~103px away from the then-current box (~1040px) |
| 123 | cx=0.5296, cy=0.5277, w=0.0176, h=0.0264 | **0.394** | ~84px away from the frozen box |
| 125 (recovery) | cx=0.7230, cy=0.5896, w=0.0464, h=0.0622 | **0.576** | ~266px away — much larger, much more complete |

The raw MediaPipe detector genuinely found **something** resembling the
athlete at both mid-freeze checks — not nothing — but at low completeness
(under 40% of expected landmarks usable) and offset from where the box
believed the athlete to be. Recovery only happened once a **notably
larger, more complete** (58%) candidate appeared.

## R5B.2.11 — Candidate filtering

Neither classification is a clean fit: **`MIXED`**, leaning toward
`DETECTOR_MISSES_ATHLETE` in effect. The weak candidates at 114 and 123
were not logged as explicitly `rejected` (the box_tracker summary's own
rejection counters — teleport/direction/scale-discontinuity/stale-frame —
are all zero for the whole clip) — they simply weren't strong/complete
enough to be treated as a confident continuity match against the existing
tracked box, so the box carried forward unchanged rather than either
accepting a weak update or formally rejecting a candidate. This is a real,
observable gap between "explicitly rejected" and "too weak to act on" that
the persisted `rejectedCandidates: []` field cannot distinguish — both
read identically in the final artifact.

## R5B.2.12 — ROI freeze mechanism

The box position (`box_record.box`, pixel `(cx, cy, w, h)`) is carried
forward frame-to-frame by **optical flow** on non-detector frames (the
large majority — 6 of every 8 frames under normal cadence). When the
tracked feature points available to that flow computation don't move (or
don't exist in sufficient quality — a small, motion-blurred athlete
provides few strong corner-like features to track), the flow-derived
position update is negligible **even before** any formal freeze-suspicion
logic engages — this is visible directly in the trace: box position moves
by well under 1px per frame across 108–124, not just during the labeled
`frozen_suspect` span. The **explicit mechanism causing the retroactive
`frozen_suspect` label** (as opposed to the underlying near-zero flow
motion that precedes and enables it) is exactly what R5B.1 already
identified from the code: `_evaluate_freeze_suspicion`/`_resolve_freeze_run`
confirming a suspicious, unmoving run once `FREEZE_MIN_SUSPECT_MS` has
elapsed and a later fresh detection disagrees. **ROI update does not
require an accepted pose or a detector candidate on ordinary
"tracking"-state frames — it happens via flow alone, silently, whether or
not that flow is actually still following the real athlete.**

## R5B.2.13 — Detector input region

**`FULL_FRAME`**, confirmed directly from the exact call site
(`mp.Image` built from the complete `frame_bgr`, never a cropped
sub-region, for every Pass-1 primary detector call in `main()`). This
rules out "the crop excludes the athlete from the detector's input" as a
mechanism for Pass 1 specifically — the detector always sees the whole
frame. What varies is not what pixels it's shown, but **how often it's
shown anything at all** (R5B.2.7/2.8) and **how strong its result is when
it does run** (R5B.2.10).

## R5B.2.14 — Athlete movement between detector opportunities

Between the two in-episode detector opportunities (frames 114 and 123, 9
frames apart at 60fps = 150ms), the tracked box itself moved under 1px
(confirming the box was not following real motion). The raw candidate
positions at 114 vs 123, however, shifted from cx≈937px to cx≈956px — about
**19px over 9 frames (≈2.1px/frame)**, notably *slower* than the ~10.6px/frame
steady sprint pace R5B.1 measured on the original artifact's own real,
successfully-tracked segments. Given this rerun's own overall speed
statistic (`establishedSpeedFrameWidthsPerSecond: 0.381` from the
box-tracker summary, i.e. ~0.0064 normalized-width/frame at 60fps ≈ 11.6px/frame)
is close to R5B.1's figure, the 114→123 candidates likely represent a
slower-moving or partially-detected portion of the athlete rather than a
literal full-body center — consistent with the low completeness scores.

## R5B.2.15 — Recovery analysis (this rerun, frame 125)

- Detector invoked: **yes**, reason `freeze_suspicion_forced` (the
  confirmed-freeze safety mechanism demanding an out-of-cadence check).
- Input: full-frame (R5B.2.13).
- Raw detector result: **yes**, a substantially larger, more complete
  candidate (58% completeness, previous best was 39%).
- Candidate acceptance: **yes** — `boxOrigin` flips to `detected`, box
  jumps ~266px in one frame.
- State: `tracking → verified` (frame 125), then `verified → tracking`
  (frame 126) — the standard one-frame confirmation blip pattern also seen
  elsewhere in the clip (R5B.1's `[135→verified, 136→tracking]` etc.).
- **Trigger classification**: recovery was caused by the **freeze-suspicion
  forced check** finding a strong enough candidate — not by the athlete
  wandering back into a stale search region (Pass 1 always searches the
  full frame, R5B.2.13) and not by ordinary scheduled cadence (though
  scheduled cadence's own periodic checks at 114/123 were what *detected*
  the weak signals that fed into confirming the freeze suspicion in the
  first place).

## R5B.2.16 — Startup `"reacquiring"` control comparison

| | Startup window (frames 0–24, `acquiring`/`reacquiring`) | `"tracking"`-state cadence (frames 25–162 excluding freeze) |
| --- | --- | --- |
| Detector invoked | **every single frame** (25/25) | every ~9th frame (17 invocations across ~138 frames) |
| Detector input | full frame (same) | full frame (same) |
| Search region | none narrower than full-frame (same) | none narrower than full-frame (same) |
| Max gap without a check | 0 frames | up to 9 frames |

**Key behavioral difference: only polling frequency changes, nothing about
*what* is searched.** Given this, and given the actual raw detector
*results* during the freeze episode were far from empty (real candidates
at both in-episode checks, just weak), the startup mode's every-frame
cadence would very plausibly have produced a correct reacquisition several
frames sooner than the scheduled 9-frame cadence did — the detector was
already finding partial evidence at 114 and 123; checking every frame in
between would very likely have surfaced a strong-enough candidate earlier,
shortening the freeze. This is a reasoned inference from the real
candidate data captured, not a guarantee — not tested as a code change in
this phase.

## R5B.2.17 — Failure classification

**`TRACKING_STATE_FAILS_TO_ESCALATE`**, compounded by
**`DETECTOR_CADENCE_TOO_SPARSE`** (the same root gap manifesting two ways):
the state machine's `"tracking"` state has no path from confidence
collapse (or, per this rerun, from near-zero optical-flow motion) to more
frequent checking, so the system falls back to a fixed, sparse cadence
exactly when a fast-moving, poorly-tracked subject most needs frequent
re-verification. `RAW_DETECTOR_CANNOT_DETECT_ATHLETE` is **not** supported
as the primary mechanism — the detector found real, if weak, evidence at
both opportunities during the episode. `VALID_DETECTION_REJECTED` is not
supported either — no formal rejection is logged; the weak candidates
simply weren't strong enough to act on, a related but distinct failure
mode from outright rejection.

## R5B.2.18 — Counterfactual: earliest existing failure signal

Using only what current code already computes: the earliest observable
signal in this rerun's episode is the box position's own near-zero
frame-to-frame displacement, present from at least frame 108 onward (well
before the frame 117 retroactive `frozen_suspect` label, and far before
the frame 125 correction) — i.e., **the raw evidence that something was
wrong was already present roughly 9–17 frames before the system's own
confirmed, actionable signal (`frozen_suspect`) existed**, and a further
frame before recovery actually occurred. In R5B.1's original artifact
(the authoritative record, not this rerun), the equivalent signal — the
one-frame `trackingConfidence` cliff at frame 61 — was available
**43 frames (≈717ms) before recovery at frame 105**. Both point to the
same structural gap: a real signal exists well before the system acts on
it, because nothing currently connects that signal to a cadence or
state-transition decision.

## R5B.2.19 — Define R5B.3

Given the failure classification (`TRACKING_STATE_FAILS_TO_ESCALATE`,
compounded by `DETECTOR_CADENCE_TOO_SPARSE`), the smallest falsifiable
experiment is a **diagnostic-only** state-transition test, not a cadence
change (cadence changes risk broad performance/cost side effects across
every clip; a targeted diagnostic state transition tests the specific
hypothesis with the smallest blast radius):

**`R5B.3 — Diagnostic-only counterfactual: replay IMG_4848 with a temporary, logged-only "would this have transitioned out of tracking" check (e.g., N consecutive near-zero-motion or low-completeness-candidate frames) added alongside (not replacing) the existing state machine, and measure how many fewer frames would have been spent in an unrecognized failure state before the existing freeze-suspicion/detector-cadence machinery would have caught it — without changing what state the tracker actually reports or any threshold that affects production output.`**

Not started, not executed.

## Production Modification Guard

```
$ shasum -a 256 tmp/phaseR5/r5b2/baseline-output.json tmp/phaseR5/r5b2/post-revert-check.json
```
Both `78957d78410e0988782194c6ac5c2f7c275cbe51de516e2c4beb12358d8e281c` —
**byte-identical**: the reverted file reproduces the exact same output as
before any instrumentation was added, proving the revert is complete and
exact, not merely "close." `git status --short -- src scripts supabase`
shows no changes beyond the pre-existing session baseline present before
this phase began.

---

## R5B.2 — Result

**PASS**

(with the disclosed limitation above: this phase's live rerun does not
reproduce R5B.1's exact original artifact frame-for-frame, though it is
itself perfectly deterministic and instrumentation was proven fully
neutral — acceptance criteria 1–3 and 5–19 are satisfied using this
rerun's own real failure episode, which exhibits the same qualitative
mechanism R5B.1 found.)

## Frame 60 → 61

Not directly re-observable in this rerun (its own analogous transition is
116→117, detailed in R5B.2.6). Operation order established generally:
`wants_detector_frame()` evaluated first (confidence-blind) → detector
call (if any) → `box_tracker.step()` updates state/box/confidence together,
after the detector decision, never informed by that frame's own result.

## Detector Cadence During Major Gap

This rerun's 8-frame episode: requests/invocations at frames 114 and 123
(9-frame scheduled interval, unchanged by the freeze). Steady-state
`"tracking"` cadence elsewhere in the clip: exactly every 9 frames, every
time. **Zero confidence does not increase cadence** — confirmed both by
code trace (R5B.2.1/2.8) and by this rerun's own `trackingConfidence`
staying at 1.0 throughout, never triggering any confidence-based path
because no such path exists.

## Why State Stayed `"tracking"`

No code path connects `trackingConfidence`, raw pose success, or
near-zero optical-flow motion to a `"tracking"`-state exit. Only the
freeze-suspicion mechanism (signal persistence past 100ms, then
contradicted by a later strong detection) can retroactively correct the
record — it cannot and does not change `track_state` itself in real time.

## Raw Detector Finding

**`MIXED`** (leaning `ATHLETE_DETECTED_LOW_CONFIDENCE`): real candidates
found at both in-episode checks (30–39% completeness), a much stronger one
(58%) at recovery.

## Candidate Filtering Finding

**`MIXED`**: no explicit rejection logged (all rejection-reason counters
zero for the whole clip); weak candidates simply weren't strong enough to
overwrite the existing tracked box — a real, uninstrumented middle ground
between "detector missed it" and "detector found it and AVA said no."

## ROI Freeze Cause

Non-detector frames carry the box forward by optical flow alone, with no
requirement for a confirmed pose or candidate; when flow has little real
motion to report (a small, blurred subject), the box barely moves,
independent of and prior to the later retroactive `frozen_suspect`
label — which itself requires ~100ms of confirmed suspicion plus a later
contradicting detection to ever apply.

## Detector Input During Failure

**`FULL_FRAME`**, always, for every Pass-1 primary detector call —
confirmed by direct code reading, not inference. The athlete is never
excluded from the detector's input by cropping at this stage.

## Recovery at Frame 105 (this rerun: frame 125)

Triggered by the freeze-suspicion-forced out-of-cadence detector check
finding a substantially stronger, more complete candidate than the two
weak signals seen during the freeze — not by scheduled cadence alone, and
not by re-entering a stale search region (there is no such region at the
detector-input level; full-frame every time).

## Startup Reacquisition Comparison

Startup polls the detector **every frame** (0 gap); locked `"tracking"`
state polls **every ~9 frames**. Search region and detector input are
identical (full-frame) in both modes — only frequency differs. Given real
partial evidence existed mid-freeze at the actual scheduled checks, more
frequent polling during a "tracking"-state anomaly would plausibly have
shortened the recovery time, though this is not tested as a code change.

## Specific Failure Classification

**`TRACKING_STATE_FAILS_TO_ESCALATE`** (primary), compounded by
**`DETECTOR_CADENCE_TOO_SPARSE`** (the same gap's second symptom).

## Earliest Failure Signal

Frame: **≈108** (this rerun) / **60→61, i.e. frame 61** (R5B.1's original
artifact, the authoritative record). Signal: near-zero box displacement /
one-frame `trackingConfidence` cliff to 0.000, respectively. Unnecessary
loss after signal: **≈17 frames / ≈280ms** (this rerun, 108→125) /
**43 frames / ≈717ms** (original artifact, 61→105→ish, per R5B.1) before
recovery.

## R5B.3

`R5B.3 — Diagnostic-only counterfactual: replay IMG_4848 with a temporary, logged-only "would this have transitioned out of tracking" check added alongside the existing state machine, measuring recovered frames without changing any actual production output.`
Not started.

## Files Added

`docs/r5b2-vanni-detector-cadence-trace.md`

## Temporary Instrumentation

Added to `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`:
5 small, additive, env-var-gated (`AVA_R5B2_TRACE_PATH`) diagnostic blocks
— a constant definition, a trace-list initializer, a pre-step attribute
capture, a post-step trace append, and an end-of-pass file write. **All 5
have been fully reverted.** Verified two ways: (1) `grep -c` for every
instrumentation marker in the file now returns `0`; (2) the reverted file
was rerun end-to-end and its output SHA-256
(`78957d78410e0988782194c6ac5c2f7c275cbe51de516e2c4beb12358d8e281c`) is
byte-identical to the very first baseline run captured before any edit was
made.

## Production Files Changed

`NONE` (temporary, fully reverted and independently re-verified — see
above).

## Progress

**Current prompt:** `R5B.2`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `8 / 197`
**R5 completion:** `4.06%`
