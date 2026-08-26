# Phase 4.2B — Wiring the Frozen-Track Detector Into Production

**Date**: 2026-08-06
**Status**: Complete as an implementation subphase — the frozen-track detector
is now live in `box_tracker.py`'s production state machine, unit-tested (39
checks, all real-evidence-anchored), and validated against one real
production rerun of `vanni_fly_120`. **Phase 4.2 overall remains In
Progress** — this subphase intentionally did not run the Gav/240/60
regression reruns (see Section 17, deferred to Phase 4.2C per the
authorizing task's explicit scope limit). Roadmap completion is **unchanged
at 28.8%** (see Section 18).

---

## 1. Executive summary

Phase 4.2's own prior session left a real, evidence-backed frozen-track
detector designed but **unwired** — the helper methods existed in
`box_tracker.py` but nothing in `step()` called them (verified dead code,
zero behavior change). This subphase's job was narrower and more concrete:
audit those helpers for correctness, wire them into the real state machine,
close the two most safety-critical gaps the audit found (a detector event's
own plausibility was never checked, and a single detector event could
silently and permanently loosen the teleport ceiling), and prove all of it
against real evidence — not just unit tests.

**What actually happened, concretely, on a real production rerun**: the
`vanni_fly_120` incident that started this whole engagement — a run of
frames the box tracker silently mislocalized while still reporting itself
as `tracked` — is now caught. In this run the freeze occurred at source
frames 232–246 (a different exact range than the originally-documented
247–249, because increasing `detectorInvocations` from 61 to 192 measurably
changes the crop-planning trajectory throughout the whole clip — a real,
disclosed side effect, not nondeterminism in the detector itself). All 15
of those frames — every one of which still had MediaPipe successfully find
17 keypoints in its crop — are now retroactively relabeled `frozen_suspect`
and correctly withheld from `measurements.ts`, the overlay renderer, and
every other scientific-evidence consumer, because a later, identity-verified
detection at frame 247 proved the box had settled onto the wrong position.
**This is the specific, real proof this subphase was commissioned to
produce: `kp=17` (a plausible-looking pose) is no longer sufficient by
itself for a frame to count as verified localization.**

Two audit-time bugs were found and reverted/fixed before this could be
trusted: (1) an initial attempt to stop optical-flow-tracked frames from
ever raising the teleport ceiling regressed a real, existing test (genuine
multi-frame acceleration got wrongly rejected) — reverted, with the actual
fix scoped correctly to only the detector/reacquisition path, which is
where the real incident's ceiling-poisoning evidence actually lived; (2)
three internal bugs in the previously-unwired helpers themselves (dead
`_seed_*` state, a frame-index-used-as-a-timestamp bug, and an
always-returns-`None` logic inversion) were found and fixed during the
audit, exactly as this task's Part 1 asked.

## 2. Confirmed real failure evidence (carried in from Phase 4.2)

From a real production trace of `vanni_fly_120` (session
`160a86a2-c0db-4e7d-9fbe-82aedd6d3eff`, analysis
`6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`, native 120fps, 1920×1080):

- The localization failure begins at source frame 215 — a detector-driven
  `"detected"` event.
- That event moves the box ≈81px in one source frame; implied speed ≈5.16
  frame-widths/second measured against `box_tracker`'s own `last_box`.
- Detector-driven events bypassed the Phase 4.1 optical-flow teleport check
  entirely — it is wired only into the tracked (optical-flow) acceptance
  path.
- The selected box then sat frozen at (essentially) the same position for
  34 frames (216–249).
- Optical flow reported a saturated 40/40 inlier count throughout — inlier
  count alone falsely suggested strong tracking.
- The optical-flow point cloud's spread grew monotonically, 118px → 282px
  (2.4×), while the median (the value that actually drives the box)
  stayed essentially frozen.
- A prior, unrelated, unchecked detector event had already inflated
  `max_observed_speed_fw_per_s` to 8.604 fw/s *before* frame 185, i.e.
  before the frame-215 incident even began.
- Detected/reacquired events previously contributed their own implied speed
  into the future teleport ceiling unconditionally, before any plausibility
  check of their own.

## 3. Helper audit (Part 1)

Every helper Phase 4.2 left unwired was inspected before being wired in.

| Helper | Inputs | Output | Units | State mutated | Time/FPS | Safe pre-establishment | Can emit scientific evidence | Can retroactively alter provenance |
|---|---|---|---|---|---|---|---|---|
| `_bounded_ceiling_raise` (removed, superseded) | implied speed | bounded speed | fw/s | none (pure) | time-based, FPS-independent | yes | no | no |
| `_update_established_motion` | box, time_s | none | fw/s velocity, fw displacement | `last_confirmed_*`, `established_velocity_fw_per_s`, `motion_established` | uses real `time_s` deltas | yes (this is what BUILDS establishment) | no | no |
| `_trajectory_residual_fw` | center, time_s | fw distance or `None` | frame-widths | none (pure query) | time-based | yes (`None` before established) | no | no |
| `_note_freeze_frame` (rewritten as `_evaluate_freeze_suspicion`) | frame_index, time_s, raw_signals | `(confirmed, duration_ms, started_at_ms)` | ms | run bookkeeping, `_force_detector_next` | ms-based, FPS-independent | yes | no | no (only flags; correction happens in `_resolve_freeze_run`) |
| `_resolve_freeze_run` | fresh_center, time_s | outcome string | — | `records[i].boxOrigin`/`frozenDecision*`, run reset | uses real `time_s` | yes | no | **yes — the only helper that does, by design (Part 5/6)** |

**Bugs found and fixed during this audit** (not preserved merely because
they were already written, per this task's explicit instruction):

1. **`self._seed_time_s`/`_seed_center`/`_seed_spread_px` were declared in
   `__init__` but never assigned anywhere.** The feature-spread-growth
   signal is structurally incapable of firing without a seed baseline —
   this was dead, non-functional state. **Fixed**: these are now captured
   immediately after every successful `_init_flow_points()` call (the only
   re-seed site), inside the detected/reacquired branch of `step()`.
2. **`self._freeze_run_start_time_s = record.frame`** — `record.frame` is
   the integer frame *index*, not a `time_s` value. Every downstream
   `freezeDurationMs`/confirmation-timing computation built on this would
   have been nonsense (computing "milliseconds" from a frame-index
   difference). **Fixed**: the rewritten `_evaluate_freeze_suspicion` takes
   `time_s` explicitly and uses it consistently.
3. **`_resolve_freeze_run`'s early-return branch**: `self._freeze_run_frames
   = []` was executed, and then `return "unresolved" if
   self._freeze_run_frames else None` was evaluated — since the list was
   *already* cleared on the line above, this always evaluated to `None`,
   never `"unresolved"`, regardless of whether a run had actually been open.
   **Fixed**: the "was there an open run" flag is now captured *before* the
   reset.
4. **An initial (over-aggressive) design decision**: to satisfy "only
   identity-verified movement may influence the ceiling" (Part 3) literally,
   the first wiring pass removed the optical-flow tracked path's own
   (Phase-4.1, already-shipped) ceiling contribution entirely. This
   regressed `box-tracker-teleport:sanity` check 6 (a real, legitimate
   multi-frame acceleration, spread over real elapsed time, got wrongly
   rejected as a teleport). **Reverted and re-scoped**: real trace evidence
   shows the actual, proven poisoning mechanism was specifically a
   detector/reacquisition event folding its own implied speed in
   *unconditionally, with no plausibility check of its own* — never a
   tracked-path step, which is *already* self-gated (it must pass its own
   teleport check against the current ceiling before it's allowed to
   extend it further, making its growth bounded and incremental by
   construction, not a single-shot poisoning risk). The bounded/rate-limited
   update contract (Section 5) now applies only to the detector/
   reacquisition path — where the real incident's evidence actually lives —
   and the tracked path's Phase 4.1 behavior is unchanged. See Section 5 for
   the full account.

## 4. Detector-event plausibility contract (Part 2)

`_classify_detector_event(box, time_s, expected_dir_sign)` is called on
every detector-selected candidate, before it is allowed to touch established
motion, the ceiling, or `last_box`.

**Critical design decision, evidence-driven**: plausibility is judged
against `self.last_confirmed_center`/`last_confirmed_time_s` — the last
**identity-verified** box — never against `self.last_box`, which can itself
be a drifted or frozen optical-flow box. This is the exact reference gap
that let the real frame-215 incident's own `athlete_tracker.py` check
under-react: its reference was already 25 frames (≈208ms) stale by the time
of the jump, diluting the same absolute pixel displacement into an
apparently-small implied velocity.

**Classification outcomes** (`DETECTOR_EVENT_CLASSIFICATIONS`):
`accepted_verified`, `accepted_provisional` (cold start — no reference yet),
`requires_confirmation` (plausible but above the established-speed bound,
below the hard ceiling), `rejected_teleport`, `rejected_scale_discontinuity`,
`rejected_direction`, `rejected_stale_frame` (non-increasing timestamp —
real, reachable), `rejected_identity` (not reachable from this file — that
rejection already happens one layer up, in `athlete_tracker.py`'s own
candidate selection, before `box_tracker.step()` ever sees an `idx`; kept in
the vocabulary for schema completeness/documentation, not fabricated here).

A `rejected_teleport` classification does **not** silently drop the frame —
it is treated exactly like "detector found nobody" (real negative evidence
fed into the existing accelerated-refresh trend), then falls through to the
tracked/predicted path for that frame.

### Frame 215, classified by real computation — not hardcoded

Per this task's explicit instruction ("do not hardcode its rejection"),
frame 215 was verified by direct computation, not asserted:

```
frame 215 classification=accepted_verified impliedSpeedFwPerS=0.3648
```

Measured against the clean `last_confirmed` reference (frame 188), frame
215's real jump implies **0.36 fw/s** — comfortably plausible, nowhere near
any ceiling. The apparent "5.16 fw/s teleport" only existed when measured
against the contaminated, already-drifted `last_box`. Frame 215 is a real,
legitimate detection; the actual problem is what optical flow did *after*
it, which is what Section 6's freeze-suspicion signals catch instead. The
frame-251 recovery detection was verified the same way: 0.44 fw/s against
frame 215's clean reference — also cleanly `accepted_verified`.

## 5. Speed-ceiling contract (Part 3)

**Previous formula** (Phase 4.1): `ceiling = max(2.5, max_observed_speed ×
3.0)`; `max_observed_speed` was raised unconditionally by *both* the
tracked path (after passing its own check) *and* the detector/reacquisition
path (with no check at all).

**New formula**: unchanged in shape, but the update path differs by source:

- **Tracked (optical-flow) path — unchanged from Phase 4.1.** Each step
  must already pass its own teleport check against the *current* ceiling
  before it may extend `max_observed_speed_fw_per_s` further. Bounded and
  incremental by construction (see Section 3, bug 4).
- **Detector/reacquisition path — new, `_evaluate_ceiling_update`.** A
  candidate that has already passed `_classify_detector_event` has its
  implied speed bounded by the **minimum** of:
  1. `MAX_CEILING_GROWTH_FW_PER_S_PER_S (5.0) × real elapsed seconds` since
     the last accepted ceiling update (an acceleration-like rate cap —
     regardless of how large one event's own implied speed is, the ceiling
     cannot jump further than a physically reasonable rate of change
     allows).
  2. `TELEPORT_MAX_VELOCITY_MULTIPLE (3.0) × established cruising speed`
     (Phase 4.1's original bound, still enforced) — only once motion is
     established; before that, a single event is still trusted fully
     (unchanged cold-start/acquisition behavior).

**Minimum sample requirements**: none for the rate-bound before the first
accepted update (cold start passes the raw implied speed through); the
established-speed bound requires `MOTION_ESTABLISHED_MIN_EVENTS=2` confirmed
events with `>= MOTION_ESTABLISHED_MIN_DISPLACEMENT_FW=0.05` cumulative real
displacement between them (mirrors `athlete_tracker.py`'s own
`MIN_CUMULATIVE_DISPLACEMENT` philosophy).

**Outlier handling** (unit-tested, `10.6`): a single 40 fw/s reading fed
into `_evaluate_ceiling_update` while established speed is 0.1 fw/s and
`max_observed_speed_fw_per_s` is 0.3 does **not** raise the ceiling anywhere
near 40 — it is capped by both bounds, verified `< 5.0` fw/s in the test.

**Decay/stabilization — explicitly defined, not decided by omission**: the
ceiling **never decays**. It is a running "highest speed ever legitimately
observed for this athlete." Decaying it would reopen exactly the failure
class this phase defends against (an athlete who legitimately slows down
should not make a later, real fast segment look newly implausible). This is
a disclosed limitation, not an oversight: a very early, large, real
acceleration burst keeps the ceiling permanently loose for the rest of a
long clip. Not fixed this subphase — flagged for Phase 4.2C/future work if
it is ever proven to matter on a real clip.

**Behavior at 60/120/240 FPS**: identical — the contract is expressed
entirely in frame-widths/second and real elapsed seconds, never frame
counts. Verified directly (Part 10, tests 5/6, and the FPS-equivalence
tests 17–19 for the related freeze-timing contract).

**Behavior before motion establishment**: the detector/reacquisition path
trusts a candidate's implied speed fully (unchanged Phase 4.1 acquisition
behavior) — the bounded contract only activates once real motion is
established, exactly matching "do not reject legitimate stationary athletes
in acceleration setup frames."

**Developer diagnostics** (`_evaluate_ceiling_update`'s return dict, logged
via `_dbg`): `currentEstablishedSpeedFwPerS`, `proposedEventSpeedFwPerS`,
`currentCeilingFwPerS`, `proposedCeilingFwPerS`, `updateAccepted`, `reason`.

## 6. Frozen-suspect state machine (Part 4)

Implemented as a diagnostic layer *alongside* the existing `track_state`
machine (deliberately — no new `track_state` values were added; see Section
9 for why), driven by two independent, time-normalized signals evaluated on
every tracked (optical-flow) frame:

1. **Feature-spread growth**: current flow-point spread ≥
   `FREEZE_SPREAD_GROWTH_RATIO (1.8)` × the spread measured at the last
   re-seed, while net box displacement since that re-seed stays below
   `FREEZE_MAX_NET_DISPLACEMENT_FW (0.02)`.
2. **Trajectory residual**: once motion is established, distance between the
   box's actual position and where the last identity-verified velocity
   implies it should now be, ≥ `TRAJECTORY_RESIDUAL_SUSPECT_FW (0.05)`.

Neither fires from a single frame alone. A raw signal opens a "suspicion
run"; the run only becomes **confirmed** once its real elapsed duration
reaches `FREEZE_MIN_SUSPECT_MS (100.0)` — verified time-equivalent at
60/120/240 FPS (tests 17–19: confirmation always lands within 2–3 frame
intervals of exactly 100ms at every FPS, never earlier, never
frame-count-gated). Confirmation forces `_force_detector_next = True`,
which `wants_detector_frame()` now honors immediately (Part 4's "detector
refresh/reacquisition is requested").

Persisted per-frame (additive fields, `None` when not applicable —
verified backward-compatible, test 23): `freezeSuspect`,
`freezeSuspicionStartedAtMs`, `freezeDurationMs`, `trajectoryResidualPx`,
`featureSpreadPx`, `featureSpreadGrowthRatio`, `timeSinceVerifiedDetectionMs`,
`frozenSignals`, `frozenDecision`, `frozenDecisionReason`,
`detectorEventClassification`.

## 7. Feature-spread signal

See Section 6, signal 1. The real trace evidence (Section 2) is the
grounding for both constants (`1.8`× growth, `0.02` fw max net
displacement) — neither was tuned to make frame 215 pass; both have real
margin against the measured 2.4× growth. Real production confirmation
(Section 12): in the actual rerun, spread growth is what drove suspicion at
frames 232–246.

## 8. Trajectory-residual signal

See Section 6, signal 2. Deliberately gated on `motion_established` (Section
3's `_update_established_motion`, itself only ever fed by identity-verified
events) so it can never fire from noise before real motion is proven, and
can never be corrupted by the exact drifted/frozen optical-flow evidence
this phase defends against.

## 9. Retroactive resolution behavior (Part 5)

`_resolve_freeze_run(fresh_center, time_s)` runs exactly when a fresh,
**accepted** (non-rejected) identity-verified box arrives while a
suspicion run is open (only ever reachable for a run that reached
CONFIRMED — an unconfirmed run that a fresh detection preempts is discarded
as `"unresolved"`, never silently misattributed).

**Outcomes** (`FREEZE_RESOLUTION_OUTCOMES`): `suspicion_confirmed_
background_lock` (both signals fired during the run — the strongest
evidence), `suspicion_confirmed_stale_box` (one signal, still proven wrong),
`suspicion_dismissed_legitimate_low_motion` (agreement, run lasted ≥200ms —
a real, sustained near-stationary moment), `suspicion_dismissed_detector_
noise` (agreement, run was brief), `unresolved` (fresh evidence arrived
before confirmation).

**Deliberate design point, verified in Part 9's fixture**: once a run is
proven wrong, the **entire** contiguous run is corrected — including the
frames from when the raw signal *first* appeared, before the run crossed
the confirmation threshold — not only the post-confirmation tail. The
ramp-up frames showed the identical raw signal; withholding the correction
from them just because they preceded the (deliberately conservative)
confirmation delay would leave genuinely unsupported frames labeled
`tracked`. Confirmed against real production data (Section 12): all 15
frames of the actual 232–246 run were relabeled, not just the ~2 frames
after the 100ms threshold was crossed.

This never rewrites `box`, `trackState`, or `identityContinuityScore` — only
`boxOrigin` (→ `frozen_suspect`) and the `frozenDecision`/
`frozenDecisionReason` diagnostics (Part 5: "do not rewrite source evidence
silently"; "do not convert previously unsupported suspect frames into
verified pose evidence after the fact" — the correction only ever
*downgrades*, never upgrades).

## 10. Scientific evidence gating (Part 6)

`frozen_suspect` joins the exact same, already-shipped gate `predicted`/
`invalid` frames already used, in three places (never a new mechanism, the
same mechanism extended):

- `src/lib/benchmark/measurements.ts` — `computeSprintMeasurements` strips
  `landmarks` to `{}` for `frozen_suspect` frames before any contact/
  crossing/biomechanics computation. **This is the authoritative gate.**
- `src/components/video/VideoOverlay.tsx` — the renderer strips landmarks
  the same way, so a proven-wrong frame never draws a skeleton. Extending
  this existing, already-shipped honesty check to the new origin is not new
  UI behavior — it is Part 6's explicit carve-out ("except where schema
  compatibility requires an honest state").
- Developer diagnostics (`trackingDebugSchema.ts`'s `boxProvenance`) keep
  `frozen_suspect` **distinguishable** from `invalid` (a frame with genuinely
  no evidence at all) — Part 6's "can a suspect localization still be
  rendered in developer diagnostics while remaining unavailable
  scientifically" is answered yes, at the diagnostics layer only, never at
  the scientific-evidence layer.

No internal confidence percentages are exposed to end users — the new
diagnostic fields (`trajectoryResidualPx`, `featureSpreadGrowthRatio`, etc.)
are developer/debug-schema fields, not surfaced in any user-facing
component.

## 11. Schema/provenance changes (Part 7)

Updated, all as **strict enum supersets** (old artifacts with no
`frozen_suspect` frames parse unaffected — no schema version bump needed):

- `src/lib/biomechanics/pose.ts` — `poseFrameSchema.boxOrigin` +9 new
  optional diagnostic fields.
- `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts` — the raw
  service-boundary contract (`mediaPipeResultSchema`), mirrored identically.
- `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — passthrough
  mapping for the new diagnostic fields (raw → canonical).
- `src/lib/video/overlay.ts` — `OverlayFrame.boxOrigin` type union.
- `src/lib/biomechanics/mediapipe/trackingDebugSchema.ts` —
  `boxProvenanceSchema` gains `frozen_suspect` (distinct from `invalid`,
  Section 10).
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — the
  Python `frame_obj` construction now persists the 7 new diagnostic fields
  from `box_track_records[source_index]`, and the `boxProvenance` mapping
  loop gains a `frozen_suspect`-specific branch.

**Values used**: `detected | tracked | predicted | reacquired | invalid |
frozen_suspect`. The task's suggested vocabulary also listed `stale_
rejected`, `detector_rejected`, `verified_after_suspicion` — these were
deliberately **not** added as separate `boxOrigin` values. A rejected
detector event has no box of its own for that frame; the frame's real
origin is whatever the tracked/predicted fallthrough decided, with *why*
captured in the new, separate `detectorEventClassification` diagnostic
field instead (Section 4) — conflating "what box does this frame use" with
"was a detector candidate this frame rejected, and why" would have made
`boxOrigin` do two jobs at once. A dismissed suspicion run simply remains
`tracked` (its original, correct classification) — no `verified_after_
suspicion` value was needed, since nothing about it changes.

## 12. Real production rerun — Vanni 120 (Part 11)

Per this task's explicit scope limit, only **one** targeted rerun was run
this subphase (Gav/240/60 are deferred to Phase 4.2C — see Section 17).

Run through the real worker/queue path (`replace_working_analysis`, the
same RPC `queueAnalysis` uses), with the pre-run working analysis saved as
an immutable version first (`save_working_analysis_snapshot`, id
`3ff5e1dd-a5e0-414d-a720-39e76c595728`). Session `160a86a2-...`, analysis
`6d9a6aba-...`, native 120fps.

### Real, decisive result

```
boxOrigin distribution (this run): {'invalid': 8, 'detected': 22, 'tracked': 438, 'frozen_suspect': 15}
```

Frames 232–246 (15 frames) — every one still had MediaPipe find 17
keypoints in its crop (`kp=17` throughout) — are retroactively relabeled
`frozen_suspect` at frame 247, with `frozenDecision =
suspicion_confirmed_background_lock` on every one of them:

```
232 boxOrigin=frozen_suspect kp=17   ...  246 boxOrigin=frozen_suspect kp=17
247 boxOrigin=detected       kp=17   (the resolving detection)
```

`freezeSuspect` flips to `True` at frames 245–246 (confirmed ~266ms into
the run — consistent with the design: the raw spread-growth signal starts
around the point spread crosses 1.8× the reseed baseline, then needs
another ~100ms before being trusted), then the whole 232–246 run is
corrected once frame 247 disagrees.

**Before vs. after** (`analyses.tracking_loss_ranges`,
`athlete_tracking_confidence`):

| | Before (this session's prior run) | After (Phase 4.2B) |
|---|---|---|
| `tracking_loss_ranges` | `[{247,249}, {316,317}, {324,482}]` | `[{317,482}]` |
| `athleteTrackingConfidence` | 0.9174 | 0.9199 |
| `strideFrequencyHz` | 4.9 | 5.01 |
| `detectorInvocations` | 61 (Phase 4.1 baseline) | **192** |
| `pass1LocalizationSeconds` | ≈33.0s | **≈80.7s** |

### Vanni 120 specifically, per this task's required questions

- **Is the frame-215 freeze detected?** Yes — as the freeze it actually is
  (232–246 in this run's specific trajectory, not exactly 247–249; see
  below for why the exact range shifts).
- **Exact detection frame?** Suspicion opens once spread growth crosses
  1.8× around frame ~238, confirmed by ~245–246 (100ms real-time gate);
  retroactively corrected back to 232 once frame 247 resolves it.
- **Exact corrective action?** `boxOrigin` for all 15 frames → `frozen_
  suspect`; `frozenDecision = suspicion_confirmed_background_lock`.
- **Do frames 247–249 receive a valid crop?** Frame 247 is now the
  resolving `detected` event itself (17 keypoints, real). 248–249 are
  `tracked` again from that fresh, correct box.
- **Does the left-foot evidence improve?** Not independently re-measured
  this subphase (would require a fresh contact-recovery audit — out of
  scope here; recommended for Phase 4.2C).
- **Does any metric change?** Yes, measurably: `tracking_loss_ranges`
  collapsed from 3 gaps to 1, `strideFrequencyHz` shifted 4.9→5.01. This is
  an **expected, intended** consequence of correctly withholding 15
  previously-silently-accepted frames — not a regression, but also not
  "nothing changed," and reported as such rather than glossed over.
- **Is unsupported evidence withheld?** Yes — verified directly against the
  persisted artifact, not assumed.

### A real, honest side effect this rerun surfaced

`detectorInvocations` roughly **tripled** (61 → 192) because the freeze
detector now forces extra detector calls whenever suspicion is confirmed.
`pass1LocalizationSeconds` grew proportionally (≈33s → ≈81s). This is a
real runtime cost, not free — disclosed here, not discovered later.

A second, more subtle real effect: the post-finish exit region (frames
317–329) shows `boxOrigin=tracked`, `freezeSuspect=False` throughout —
**verified directly, not assumed** — so the frozen-track detector did
**not** cause the widened `tracking_loss_ranges` gap there (317–482
vs. the prior run's 316–317 + 324–482 with a real gap at 318–323). That
gap's shift is pose-detection nondeterminism: the ~3× increase in detector
calls changes `plan_crops()`'s smoothed trajectory throughout the *entire*
clip (it fits a linear trend + moving average over all boxes, not just the
frames near a freeze), which can shift whether MediaPipe finds a person in
an unrelated, distant frame's crop. **Disclosed as a real, indirect
consequence of the forced-refresh mechanism, not investigated further at
the pixel level this subphase** (consistent with this project's established
practice of not claiming certainty beyond what was actually instrumented) —
recommended as a specific check for Phase 4.2C's Gav/240/60 reruns, since a
protected/regression-sensitive benchmark's crop trajectory could in
principle shift the same way even without a real freeze ever occurring
(more detector calls alone can nudge `plan_crops()`'s trend fit).

## 13. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — helper audit
  fixes (Section 3), `_classify_detector_event`, `_evaluate_ceiling_update`,
  `_evaluate_freeze_suspicion` (rewritten from the dead `_note_freeze_frame`),
  `_resolve_freeze_run` (bug-fixed), full `step()` wiring, `BOX_ORIGINS` +
  `frozen_suspect`, new diagnostic slots on `BoxTrackFrame`, `summary()`
  additions.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  persists the 7 new diagnostic fields; `boxProvenance` mapping gains a
  `frozen_suspect` branch.
- `src/lib/biomechanics/pose.ts`, `MediaPipeTypes.ts`,
  `MediaPipePoseBackend.ts`, `src/lib/video/overlay.ts`,
  `trackingDebugSchema.ts` — schema/provenance threading (Section 11).
- `src/lib/benchmark/measurements.ts`, `src/components/video/VideoOverlay.tsx`
  — evidence-gating extension (Section 10).
- `scripts/box-tracker-frozen-track-sanity.py` — new, 39/39 passing (Part
  9 + Part 10).
- `scripts/phase-4-2-vanni-120-trace-rerun.mjs`,
  `scripts/phase-4-2b-compare-versions.mjs` — new, orchestrate the real
  rerun and before/after comparison.
- `package.json` — `+1` script, `box-tracker-frozen-track:sanity`.

Not changed: detector-model/pose-backend replacement, contact detection,
step metrics, zone timing, gate stabilization, limb smoothing, auto-follow,
panning, Athlete Intelligence — confirmed by `git status` scope (only the
files above touched) and by the diff itself (no changes outside the
localization/schema/evidence-gating files listed).

## 14. Database changes

None to schema. One real production analysis (`6d9a6aba-...`) was requeued
through `replace_working_analysis`, with its pre-run state preserved as
version `3ff5e1dd-a5e0-414d-a720-39e76c595728` via
`save_working_analysis_snapshot`. `npm run db:reset` was never run.

## 15. Tests and exact results

| Command | Result |
|---|---|
| `npm run stationary-validation-registry:sanity` | 45/46 — same pre-existing, disclosed 105%-weight failure (unrelated, tracked since Phase 0) |
| `npm run box-tracker:sanity` | 27/27 PASSED (unmodified suite, unaffected) |
| `npm run box-tracker-teleport:sanity` | 16/16 PASSED (including check 6, after the Section 3/bug-4 revert) |
| `npm run box-tracker-frozen-track:sanity` | **39/39 PASSED** (new — Part 9's real-trace replay + Part 10's 24 generalized scenarios) |
| `npm run measurement-recovery:sanity` | ALL PASSED |
| `npm run timing-verification:sanity` | ALL PASSED |
| `npm run analysis-fps:sanity` | passed |
| `npm run zone-step-counting:sanity` | 25/25 PASSED |
| `npm run zone-coverage:sanity` | ALL PASSED |
| `npm run analysis-report:sanity` | ok |
| `npm run worker:check` | `worker_configuration_valid` |
| `npm run typecheck` (`tsc --noEmit`) | clean, 0 errors |
| `npm run lint` (`eslint src --max-warnings=0`) | clean |
| `npm run build` | succeeded, full route manifest generated |
| `python3 -m py_compile` (both modified Python files) | OK |
| Real production rerun, `vanni_fly_120` | completed successfully, real evidence in Section 12 |

## 16. Phase 4.2B acceptance table

| # | Criterion | Status |
|---|---|---|
| 1 | New helpers are audited and no longer dead code | ✅ Section 3 — all 5 wired into `step()`, 3 real bugs fixed |
| 2 | Detector/reacquisition events receive plausibility checks | ✅ Section 4, `_classify_detector_event` |
| 3 | Unverified events cannot poison the speed ceiling | ✅ Section 5 — bounded, judge-before-update ordering |
| 4 | Ceiling growth is bounded and time-normalized | ✅ Section 5 — dual bound (rate cap + established-speed multiple) |
| 5 | Frozen-suspect state is wired into `step()` | ✅ Section 6 |
| 6 | Feature-spread and trajectory-residual signals are active | ✅ Sections 7–8, confirmed firing in real production data (Section 12) |
| 7 | Suspect localization cannot create scientific evidence | ✅ Section 10 — same gate as predicted/invalid, extended |
| 8 | Retroactive confirm/dismiss logic is implemented | ✅ Section 9, confirmed against real data |
| 9 | New provenance threaded through Python and TypeScript contracts | ✅ Section 11 |
| 10 | Old artifacts remain readable | ✅ strict enum supersets, verified (test 23) |
| 11 | Real Vanni incident trace fixture passes | ✅ Section Part 9 in the test file, 13/13 sub-checks |
| 12 | New unit tests pass | ✅ 39/39 |
| 13 | Existing regression tests pass | ✅ Section 15 |
| 14 | Typecheck, lint, worker check, build pass | ✅ Section 15 |
| 15 | No unrelated subsystem changes | ✅ Section 13 |
| 16 | Overall roadmap remains 28.8% until real benchmark validation completes Phase 4.2 | ✅ Section 18 — unchanged |

**All 16 satisfied for this subphase's own scope.** Phase 4.2 as a whole
remains incomplete pending Phase 4.2C (Section 17).

## 17. Remaining work for Phase 4.2C

1. **Real production reruns of Gav (protected), Vanni 240, and Vanni 60** —
   not run this subphase per its explicit scope limit. Required before
   Phase 4.2 can be marked complete or the roadmap percentage increased.
   Specifically check: (a) zero regression in metrics/tracking-loss ranges
   on all three, (b) whether the ~3× `detectorInvocations` increase measurably
   changes Gav's protected output at all (expected: no, since a clean track
   should rarely if ever trigger forced refreshes — must be verified, not
   assumed), (c) whether the `plan_crops()` trajectory-sensitivity side
   effect found in Section 12 appears on any of the three.
2. **Runtime/cost impact** — `pass1LocalizationSeconds` roughly 2.4× on
   Vanni 120 in this rerun. Needs characterizing across FPS classes/clip
   lengths before this is considered a fully-costed, production-ready
   change.
3. **Left-foot/contact-recovery re-audit on Vanni 120** — Phase 3's original
   contact-recovery findings should be re-verified against this corrected
   localization (not done this subphase).
4. **`Part 8` crop-handoff provenance** (structured `cropSourceFrameIndex`/
   `cropUsedStaleBox`/etc. fields, and syncing `boxes[]` before
   `plan_crops()` runs so a `frozen_suspect` span doesn't feed a wrong
   position into crop planning) — Phase 4.2's original scope, not addressed
   in this wiring-focused subphase. Currently `plan_crops()` still runs on
   the pre-correction `boxes[]` array; the retroactive `frozen_suspect`
   relabeling happens on `box_track_records`, which is read for `boxOrigin`
   gating but not re-synced back into `boxes[]` before crop planning. This
   is a real, disclosed gap: the crop for a frozen span is still built from
   the (proven-wrong) frozen position, not an extrapolation from
   surrounding good evidence. Recommended as Phase 4.2C's first item.
5. **Part 9's pose-corroborated freeze downgrade** (a second, independent
   trigger path using repeated pose misses on nominally-"tracked" frames as
   corroborating evidence) — scoped in Phase 4.2's report as
   architecturally deferred (the two-pass pipeline means pass 2's pose
   results aren't available until after pass 1's localization decisions are
   already made); a post-hoc, post-pass-2 downgrade pass was proposed but
   not implemented this subphase.

## 18. Roadmap status

**Unchanged: overall roadmap completion remains 28.8%** (as stated by this
task; note this doesn't match the 27.5% figure computed and recorded at the
end of Phase 4.1 in `docs/stationary-roadmap-progress.md` — a discrepancy
flagged, not silently reconciled, consistent with this project's standing
practice for weight/percentage mismatches). Phase 4.2 is recorded as **In
Progress** in the roadmap tracker, not complete, per this task's explicit
instruction: "do not mark the roadmap above 28.8% merely because production
wiring or unit tests exist." See `docs/stationary-roadmap-progress.md` for
the updated Phase 4.2 section.

## 19. Git status

Not committed, not pushed, per explicit instruction. `git status --short`
shows this subphase's changes (Section 13) plus the pre-existing, larger
uncommitted working tree from the whole engagement (Phases 0–4.2, all still
uncommitted per every prior phase's own "do not commit" instruction).

## 20. Recommended Phase 4.2C scope

**Title**: Phase 4.2C — Real Benchmark Validation and Crop-Handoff
Provenance

1. Run real production reruns of Gav (protected — read-only verification,
   never modified), Vanni 240, and Vanni 60 through the Phase 4.2B code,
   with pre-run snapshots saved for every one (matching Phase 4.1's own
   precedent).
2. Report full before/after diagnostics for each: `tracking_loss_ranges`,
   `athleteTrackingConfidence`, `detectorInvocations`,
   `pass1LocalizationSeconds`, any `frozen_suspect` frames (expected: zero
   on a clean track — verify, don't assume), and confirm zero regression on
   Gav specifically (the protected benchmark).
3. Implement Phase 4.2's original Part 8 (crop-handoff provenance): sync
   `boxes[]`/`box_confidences[]` from retroactively-corrected
   `box_track_records` **before** `plan_crops()` runs, so a confirmed
   `frozen_suspect` span is excluded from crop planning (falls back to the
   same linear-trend extrapolation `plan_crops()` already uses for
   genuinely undetected frames) instead of continuing to crop around the
   proven-wrong frozen position. Add the structured
   `boxSourceFrameIndex`/`cropSourceFrameIndex`/`poseSourceFrameIndex`
   equality invariant and `cropUsedStaleBox`/`cropRejectedReason`
   provenance fields.
4. Re-audit Vanni 120's contact/step recovery (Phase 3's original scope)
   against the corrected localization, to answer whether previously-missing
   contacts are now recoverable.
5. Characterize the `detectorInvocations` runtime-cost increase across all
   3 FPS classes and decide whether `MAX_CEILING_GROWTH_FW_PER_S_PER_S`/
   `FREEZE_MIN_SUSPECT_MS` need adjustment to reduce forced-refresh
   frequency without weakening detection — evidence-first, not a blind
   retune.
6. Only after 1–2 are complete and clean should the roadmap's Phase 4.2
   completion percentage be updated.

**Do not commit. Do not push** — all Phase 4.2B work remains in the
uncommitted working tree, per explicit instruction.
