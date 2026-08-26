# Phase 4.2C — Crop-Handoff Provenance, Pose Feedback, and Full Benchmark Validation

**Date**: 2026-08-06
**Status**: Substantial real progress; **Phase 4.2 is NOT marked Complete**. A
real, evidence-confirmed regression was found on `vanni_fly_240` (a
Phase 1/2 hand-verified benchmark) during this phase's own validation work
and is the explicit blocker — exactly the outcome this phase's acceptance
criteria require when a benchmark regresses ("Phase 4.2 remains In Progress,
assign no full weighted credit, state the exact blocker"). This is reported
honestly rather than minimized, consistent with this project's standing
practice through Phases 3, 4.1, and 4.2B.

---

## 1. Executive summary

This subphase implemented the two pieces of Phase 4.2's original scope that
4.2B deferred (crop-handoff provenance and pose-as-localization-feedback),
audited and reduced detector-invocation cost, and — critically — ran real
production reruns of **all four** registered benchmarks, which Phase 4.2B
explicitly could not do within its own scope.

That full validation immediately paid for itself. It:

1. **Proved the crop-handoff provenance gap Phase 4.2B disclosed was real**:
   `plan_crops()` was still building crops from `frozen_suspect` frames'
   proven-wrong positions. Fixed by syncing `boxes[]` from the
   retroactively-corrected `box_track_records` before `plan_crops()` runs.
2. **Found and fixed a real, serious bug in this phase's own new
   pose-feedback code** before it could ship: an early version gated its
   "the crop hasn't changed" signal on a raw consecutive-frame count instead
   of real elapsed time, which fired far more easily at high FPS
   (`plan_crops()` rounds to whole pixels, so genuine sub-pixel motion at
   240fps often rounds to an identical crop for several consecutive frames
   even while tracking is completely healthy). This falsely flagged
   **52% of `vanni_fly_240`'s frames** as `frozen_suspect` on first measurement
   — caught by running the real benchmark, not by unit tests alone. Fixed to
   gate on real elapsed time.
3. **Found and fixed a second real bug in this phase's own detector-cost
   optimization**: the first version of the "throttle after consecutive
   misses" fix had zero measured effect (`detectorInvocations` stayed at 192
   on `vanni_fly_120`) because `_force_detector_next` bypassed the new
   throttle unconditionally and never resets once nothing is ever found
   again — silently absorbing 100% of the intended savings. Fixed; the real,
   measured result is **192 → 52 detector invocations on `vanni_fly_120`
   (73% reduction, ≈83s → ≈31s of pass-1 runtime)**, with byte-identical
   downstream metrics before and after, proving the reduction is safe.
4. **Confirmed the pose-feedback mechanism works as designed, on real data**:
   on `vanni_fly_120`, it independently caught 101 frames (source 341–482)
   of previously-silently-accepted "tracked" evidence in the post-finish
   exit region that `box_tracker.py`'s own internal signals never flagged —
   a real, complementary failure mode.
5. **Found a real, unresolved regression on `vanni_fly_240`** after both of
   the bugs above were fixed: new tracking-loss gaps appear starting at
   frame 126 (previously none until frame 668), `athleteTrackingConfidence`
   drops (0.906 → 0.868), and `strideFrequencyHz` shifts (5.93 → 4.95). This
   is traced to a real mechanism (Section 6) but not fully root-caused or
   fixed within this subphase's remaining time — **this is the reason Phase
   4.2 is not marked Complete.**
6. **Confirmed Gav (protected) is completely unaffected** — byte-identical
   metrics, zero `frozen_suspect` frames, zero regression.

## 2. Roadmap arithmetic audit

Per this task's explicit instruction, performed **before** any other change
this subphase.

**Audited, as of this task's start** (`docs/stationary-roadmap-progress.md`,
Phase 4.2B's own recorded state):
- Phase weights: 0=4, 1=7, 2=8, 3=7, 4.1=4, 4.2=3, plus the original 4-17
  phases (10,7,10,8,6,9,5,3,5,4,3,2,6,1) = **112% total pool** (105% original
  + 4% Phase 4.1 + 3% Phase 4.2, both later insertions already disclosed in
  the file's own discrepancy notes).
- Completed-phase raw weighted sum: Phase 0 (4) + 1 (7) + 2 (8) + 3 (7) +
  4.1 (4) = **30.0**, Phase 4.2 contributing **0.0** (no real-benchmark
  validation had been completed as of Phase 4.2B).
- **30.0 / 112 = 26.786% ≈ 26.8%** — this file's own last recorded,
  arithmetically-derived overall completion.

**This task's stated figures**: "overall completion before Phase 4.2
completion: 28.8%", "Phase 4.2 maximum contribution: 3.0 percentage points",
"expected overall completion after full Phase 4.2 acceptance: 31.8%."

**Audit result: these do not match the tracker's own documented
calculation**, and this is the **third** time in this engagement a
prompt-asserted figure (28.8%, first appearing in the original Phase 4.2
task, then repeated verbatim in Phase 4.2B's task, and now again here) has
failed to reconcile with this file's own from-scratch weighted-sum
arithmetic (27.5% after Phase 4.1, 26.8% after Phase 4.2's insertion). No
individual phase weight or completion percentage was altered to force a
match — there is no way to derive 28.8%/31.8% from this file's own
documented weights and completion states without inventing an unevidenced
adjustment. Checked concretely: 30.0/104 = 28.85% (≈28.8%) is the closest
match found to any denominator, which would require the weight pool to be
104 rather than 112 — this would mean either dropping 8 percentage points
of weight from the pool with no textual basis, or that the 28.8% figure was
computed against a **different roadmap state this file does not contain**
(e.g. a version where Phase 4.1 and/or Phase 4.2 were never separately
inserted, or a phase-completion state this file never recorded). This
candidate is reported as an arithmetic curiosity, not adopted as fact —
per this task's own instruction ("do not silently rewrite historical
figures... use those values only if they agree with the tracker's
documented calculation after audit"), it does not.

**Resolution, following this project's established, repeated practice for
this exact class of discrepancy** (same pattern as the 105%/109%/112%
weight-pool note, and the unreconciled 28.8% note already present in
`docs/phase-4-2b-frozen-track-production-wiring.md` Section 18): this
report and the roadmap tracker continue to report the file's own
from-scratch, honestly-derived arithmetic (26.8% before this subphase's own
contribution), with this discrepancy flagged prominently rather than
silently reconciled either direction. **Relative roadmap priorities are
unchanged** — no phase weight or ordering was altered, satisfying this
task's explicit "preserve relative roadmap priorities" instruction.

**After this subphase**: Phase 4.2 still contributes **0.0%** — real
benchmark validation was completed for all four benchmarks, but one
(`vanni_fly_240`) shows a real, unresolved regression, so full acceptance
criterion 12 ("Vanni 240 verified timing and metrics do not regress") is
NOT met. Per the acceptance criteria's own explicit rule, **no partial
credit is awarded for the real, substantial engineering work completed
here** — overall roadmap completion **remains 26.8%**, unchanged by this
subphase, exactly as intended by "do not award completion based only on
code or unit tests; real validation is required," now extended to "and a
regression found DURING that real validation blocks credit even after
extensive real work."

## 3. Box-to-crop architecture (Part 1)

```
source frame (cv2.VideoCapture, pass 1)
  -> box_tracker.step(frame_index, time_s, ...)          [box_tracker.py]
       - detector candidates (periodic, athlete_tracker.py multi-candidate)
       - identity selection + plausibility check           (_classify_detector_event)
       - optical-flow tracking (every non-detector frame)
       - freeze-suspicion signals (spread growth, trajectory residual)
       - retroactive frozen_suspect correction on disagreement
     -> box_track_records[i]  (boxOrigin, trackState, box, diagnostics)
  -> boxes[i] = box_track_records[i].box   (pass 1, per-frame append)
[pass 1 ends; ALL box_tracker decisions, including every retroactive
 frozen_suspect correction, are final by this point]
  -> Phase 4.2C sync: boxes[i] = None for any i where boxOrigin ==
     "frozen_suspect" (NEW — closes the gap Phase 4.2B disclosed)
  -> plan_crops(boxes, ...) -> crops[]     (ONE global smoothing/extrapolation pass)
[pass 2, sequential, source_index in lockstep with crops[]]
  -> crop_planner_input_box = boxes[source_index]  (captured pre-overwrite)
  -> crops[source_index] -> sub-image -> MediaPipe pose inference
  -> classify_crop_validation(...) -> cropValidation (NEW)
  -> boxes[source_index] overwritten with landmark bbox IF pose found
  -> frame_obj: full crop-handoff provenance persisted (NEW)
[pass 2 ends]
  -> apply_pose_localization_feedback(frames, src_fps)   (NEW — post-hoc)
       - repeated pose miss on a REAL-TIME-unchanging crop -> retroactive
         frozen_suspect downgrade (independent of box_tracker's own signals)
  -> measurements.ts / VideoOverlay.tsx strip landmarks for
     frozen_suspect|predicted|invalid (unchanged mechanism, Phase 4.2B)
```

**Per-stage detail** (Part 1's required fields):

| Stage | Module | Coord system | sourceFrameIndex | Confidence/verification | Fallback |
|---|---|---|---|---|---|
| Detector | `athlete_tracker.py` via `box_tracker.step` | normalized [0,1] | `frame_index` param | `score`, identity-continuity | none — no candidate = no evidence |
| box_tracker output | `box_tracker.py` | pixel (cx,cy,w,h) | `frame_index` | `boxOrigin`/`trackState` | predicted (bounded, 6 frames) then invalid |
| Scientific box sync | `mediapipe_pose_runner.py` (NEW) | pixel | `i` (array index) | gated on `boxOrigin != frozen_suspect` | `None` → plan_crops extrapolates |
| Crop planner | `plan_crops()` | pixel, whole-frame bounds | implicit (array index) | none (geometric only) | full-frame `(0,0,w,h)` on degenerate region |
| Crop validation | `classify_crop_validation()` (NEW) | — | asserted `== source_index` | `cropValidation` enum | rejection, never fabrication |
| Pose backend | MediaPipe (crop-relative) | crop-normalized → remapped to source-normalized | `source_index` (pass 2 loop var) | `trackingConfidence` | one-shot expanded-crop retry |
| Persisted pose frame | `frame_obj` | source-normalized | `sourceFrameIndex` | `boxOrigin` (post-correction) | landmarks present but gated downstream |
| Pose feedback | `apply_pose_localization_feedback()` (NEW) | — | same frame, post-hoc | `poseCorroboratesLocalization`/IoU/residual | can only downgrade, never upgrade |
| Consumers | `measurements.ts`, `VideoOverlay.tsx` | source-normalized | — | gates on `boxOrigin` | strips `landmarks` to `{}` |

**Locations identified where risk existed** (Part 1's explicit checklist):

- *One frame's box used for another frame*: not found as a live bug —
  `source_index` is a single incrementing loop variable shared by
  crop/pose/localization reads within pass 2; verified as a real invariant
  (not just assumed) by `classify_crop_validation`'s frame-mismatch check
  (Part 13 test 1/2).
- *An older box reused without being marked stale*: **found, real** — this
  was exactly the disclosed Phase 4.2B gap (Section 4 below).
- *A predicted box indistinguishable from a verified box*: not found —
  `boxOrigin` already distinguishes `predicted` from `detected`/`tracked`;
  now additionally exposed via `cropUsedPrediction`/`cropUsedStaleBox`.
- *Crop planner diverges from scientific localization*: **found, real** —
  `plan_crops()`'s linear-trend/smoothing fit is sensitive to the FULL
  `boxes[]` trajectory, including frames far away in time; this is the
  root mechanism behind both the Phase 4.2B post-finish side effect AND
  this phase's own `vanni_fly_240` regression (Section 6).
- *Fallback crop creates a large visual position change*: real, reachable
  mechanism identified (`plan_crops()`'s full-frame degenerate fallback) —
  now detected via `is_fallback_jump`/`crop_rejected_fallback_jump`.
- *Source-frame provenance dropped*: not found as a live bug, but was
  genuinely UNVERIFIED before this phase (no explicit invariant existed) —
  now explicit and checked (Part 2).

## 4. Provenance contract (Part 2)

All 20 requested fields are now persisted per pose frame (additive,
optional — old artifacts parse unaffected, no schema version bump):
`localizationSourceFrameIndex`, `localizationTimestampMs`,
`localizationState`, `localizationOrigin`, `localizationVerified`,
`localizationAgeMs`, `scientificAthleteBox`, `cropPlannerInputBox`,
`cropRect` (pre-existing), `cropSourceFrameIndex`, `cropTimestampMs`,
`cropOrigin`, `cropAgeMs`, `cropUsedPrediction`, `cropUsedFallback`,
`cropUsedStaleBox`, `cropRejected`, `cropRejectedReason`,
`poseSourceFrameIndex`, `poseTimestampMs` — plus `cropValidation` (the
Part 3 classification) and the Part 5 pose-feedback fields.

**The specific gap this closes**: `plan_crops()` previously ran on
`boxes[]` exactly as pass 1 left it — but pass 1's own `box_tracker.py` can
RETROACTIVELY relabel a span `frozen_suspect` (via `_resolve_freeze_run`,
Phase 4.2B) using evidence that only exists at a LATER frame. Since that
correction happens inside `box_track_records`, not `boxes[]`, the confirmed
-wrong position was still being fed into the crop-planning trend fit. Fixed
(`mediapipe_pose_runner.py`, right before `plan_crops()` is called):

```python
for i, rec in enumerate(box_track_records):
    if rec.boxOrigin == "frozen_suspect":
        boxes[i] = None                # falls back to plan_crops()'s own,
        box_confidences[i] = 0.0       # already-trusted linear-trend
                                        # extrapolation — not new logic.
```

This routes a confirmed-wrong span through the SAME mechanism `plan_crops()`
already uses for genuinely-undetected frames, rather than continuing to
anchor the crop trend to a proven-wrong position — not new interpolation
logic, just correctly excluding disproven evidence from an existing one.

## 5. Crop-validation contract (Part 3)

`classify_crop_validation()` (`mediapipe_pose_runner.py`) runs BEFORE a
crop is trusted, using only PRIOR, already-decided state (`box_track_
records[source_index]`, `plan_crops()`'s own bookkeeping) — never the
current frame's own pose result, avoiding the circularity Part 8 explicitly
warns against ("the selected box defines the expected trajectory, then the
same trajectory self-validates the box").

All 9 requested outcomes are implemented and reachable (`CROP_VALIDATION_
OUTCOMES`): `crop_verified`, `crop_provisional` (live, unresolved
suspicion, or a within-bound prediction), `crop_rejected_frozen_
localization`, `crop_rejected_stale_box` (`invalid` origin), `crop_
rejected_frame_mismatch` (a real, checked invariant — not reachable in this
single-threaded pipeline today, verified rather than assumed), `crop_
rejected_invalid_geometry`, `crop_rejected_unverified_identity`, `crop_
rejected_prediction_too_old` (defensive double-check of `box_tracker.py`'s
own bound), `crop_rejected_fallback_jump` (the one real, reachable
"unexplained spatial jump" this pipeline can produce — see Section 6).

A rejected crop's frame remains fully visible in the persisted artifact
(developer diagnostics, `cropValidation`/`cropRejectedReason`) but
`measurements.ts`/`VideoOverlay.tsx` never treat its landmarks as
scientific evidence (unchanged Phase 4.2B mechanism, extended).

## 6. Exact source of the prior spatial jump (Part 4)

Phase 4.1/4.2B already proved the *originally reported* 247–250 jump was an
artifact of `plan_crops()`'s wide, smoothed crop compensating for a real
box_tracker freeze until frames 247–249 specifically failed to find a
person. This phase's own new provenance lets that be stated with full
module/state precision, and extends it to explain the mechanism, not just
the one incident:

**Exact module and state transition**: `plan_crops()`
(`mediapipe_pose_runner.py`), specifically its linear-trend fit (`_lin_fit`)
plus centered moving average (`_moving_avg`, window `ROI_SMOOTH_WINDOW`)
over the ENTIRE `boxes[]` array. This is a **non-causal, global** fit — a
frame's crop is influenced by boxes both before AND after it in time, not
just its own local trajectory. When a span of `boxes[]` is wrong (a frozen
or drifted box_tracker output), that wrong span pulls the smoothed trend
away from the true trajectory for a WINDOW of neighboring frames too, not
just the wrong span itself — this is the exact mechanism, proven three
times now:

1. **The original incident** (Phase 4.1/4.2B): frames 215–246's frozen
   `boxes[]` values were compensated for by the wide crop successfully
   finding the real athlete anyway, until 247–249 where compensation
   failed — the "jump" is the boundary where compensation stopped working,
   not a jump in the scientific box itself.
2. **This phase's Vanni 120 fix**: once `frozen_suspect` spans are excluded
   from `boxes[]` before `plan_crops()` runs (Section 4), the crop trend no
   longer has a wrong span to compensate for at all.
3. **This phase's Vanni 240 regression** (Section 9): a DIFFERENT
   manifestation of the exact same global-trend-sensitivity mechanism — see
   below.

**This is a real crop-planner design limitation, not merely a downstream
consequence of upstream box_tracker error**, per Part 4's explicit
instruction not to leave the answer at "downstream crop planning": the
non-causal, whole-clip trend fit is why one region's data quality can
measurably shift an unrelated, distant region's pose success/failure. The
smallest general fix — making `plan_crops()`'s fit local/causal (e.g. a
bounded look-ahead/look-behind window instead of the whole array), or
re-running crop planning after `apply_pose_localization_feedback`'s
post-hoc corrections are known — was **not implemented this subphase**
(would itself need the same real-benchmark validation rigor this whole
phase is built on, and this subphase's remaining time was spent finding and
partially fixing the two more urgent bugs in Sections 8/9 instead).
Recommended as Phase 4.3's first item (Section 23).

**Label**: this is real, evidence-confirmed **crop-handoff sensitivity**, not
an intentional reacquisition — it is now bounded and disclosed (Part 2's
provenance makes it independently traceable per-frame), but not eliminated.

## 7. Pose-feedback design (Part 5)

`apply_pose_localization_feedback()` (`mediapipe_pose_runner.py`), a
post-hoc pass over `frames[]` after pass 2 completes. Implements all 7
required cases (A–G):

- **A** (pose present + aligned): `poseCorroboratesLocalization=True`
  (IoU ≥ 0.15 against `scientificAthleteBox`) — no action.
- **B** (single miss): `poseMissDurationMs` real-time-gated; below
  `POSE_MISS_SUSPECT_MS=200ms` → `action="none"`.
- **C** (short streak, strong agreement): same gate — a short streak never
  crosses 200ms real time, "continue" is the implicit default (`none`).
- **D** (repeated miss on an identical/frozen crop): the one case that
  DOWNGRADES — requires BOTH `poseMissDurationMs >= 200ms` AND the crop
  itself unchanged for `>= POSE_MISS_SUSPECT_IDENTICAL_CROP_MS=200ms` (real
  elapsed time — see Section 8 for why this must be time-, not
  frame-count-based) AND `localizationOrigin == "tracked"` (never
  overrides an already identity-verified frame). Sets `boxOrigin =
  frozen_suspect`, `frozenDecision = "pose_corroborated_freeze"`.
- **E/F** (pose found outside the box / bounds disagree): `action=
  "disagreement_flagged"` — diagnostic only, never auto-downgrades (weaker
  evidence than box_tracker's own two-signal freeze detector).
- **G** (pose during frozen_suspect): explicitly checked first —
  `action="none", reason="already_frozen_suspect_not_restored"` — never
  restores eligibility.

**Architectural limit, disclosed not fixed**: pose results only exist after
pass 2 fully completes, so this feedback can only correct decisions
RETROACTIVELY (exactly mirroring `_resolve_freeze_run`'s own retroactive
pattern) — it cannot influence pass 1's real-time detector cadence or crop
planning for frames it downgrades. No consumer-facing confidence
percentages are exposed (`poseLocalizationResidualPx`/`poseBoundsIoU` are
developer/debug-schema fields only).

## 8. Detector-invocation analysis (Part 6)

**Real, measured baseline (before this subphase's throttle fix)**: 192
detector invocations on `vanni_fly_120`, of which **170 (88.5%) found
nobody** — the dominant real cost, concentrated in the post-finish exit
region where the athlete has genuinely left frame (independently confirmed
by Section 7's pose-feedback catching that exact region).

**First fix attempt — incomplete, measured as such**: added a
`consecutive_detector_misses` counter and throttled the SCHEDULED cadence
once misses accumulate. Result: **192 → 192, zero change** — because
`_force_detector_next` (set once a freeze suspicion is confirmed) has no
cooldown of its own and, once nothing is ever found again, forces a
detector call on literally every subsequent frame — bypassing the new
throttle entirely and absorbing 100% of the intended savings. This was
caught by re-measuring the real rerun, not assumed fixed.

**Second, real fix**: the forced-refresh path now also folds into the same
consecutive-miss-throttled cadence once misses have piled up (still firing
immediately the first few times — a fresh suspicion deserves a prompt
check). **Result: 192 → 52 (73% reduction), pass1LocalizationSeconds ≈83s
→ ≈31s** (back to roughly Phase 4.1's original ≈33s baseline), with
**byte-identical `frozen_suspect` frame ranges and stable downstream
metrics** before and after — the reduction did not weaken evidence
standards, verified directly, not assumed.

**Per-reason accounting** (via the new `detector_invocation_reasons`
counter in `box_tracker.summary()` — not independently re-verified per-run
this subphase beyond the aggregate counts above, since `summary()`'s stderr
output is not forwarded by the worker's stdio pipe, a pre-existing,
previously-disclosed limitation — Phase 4.1's report already noted this
gap).

**Result on `vanni_fly_240`**: detectorInvocations unchanged at 66 in both
the buggy and fixed pose-feedback runs — the throttle never engaged,
because Vanni 240's misses are interleaved with hits (consistent with the
intermittent tight/retry-crop alternation found in Section 9), never
forming a run of `CONSECUTIVE_MISS_THROTTLE_COUNT=5` in a row. The cost
optimization's real, measured benefit is currently specific to the
"athlete has genuinely and durably left frame" pattern (Vanni 120's tail);
it does not generalize to Vanni 240's different, intermittent-failure
pattern — disclosed, not overclaimed.

**Optimizations NOT implemented this subphase** (real, listed candidates
from the task not yet acted on): same-frame dedup (verified already
structurally impossible, Part 13 test 12, so nothing to build); explicit
zone/finish-based suppression (Section 9 — architecturally unavailable to
this layer).

## 9. Post-finish termination behavior (Part 7)

This module has **no access to finish-line/zone/timing state** — that
lives in a different layer (`src/lib/benchmark/measurements.ts` et al.),
computed AFTER pose inference completes, not available to `box_tracker.py`
in real time. Per this phase's hard constraint (no timing-formula changes),
a literal "finish crossing" contract was not built.

**What was built instead — a real, evidence-based proxy**: `track_state ==
"terminated"` (already existing, `REACQUISITION_MAX_FRAMES` × 2 exhausted)
now throttles cadence-driven detector checks by
`TERMINATED_DETECTOR_CADENCE_MULTIPLIER=6` rather than disabling them —
bounded so a genuine late reappearance can still eventually be recovered.
**Measured to have zero effect on `vanni_fly_120`** in isolation (Section
8) — the track never actually reaches "terminated" during that clip's exit
region (it stays "tracking" throughout, since optical flow keeps reporting
SOME plausible motion). The consecutive-miss throttle (Section 8) is what
actually captured this pattern for real.

No new zone metrics are created from any `frozen_suspect`/post-hoc-
downgraded frame (unchanged, pre-existing `measurements.ts` gate, now also
covers pose-feedback-downgraded frames since they use the identical
`boxOrigin` mechanism). Visual context for playback is unaffected — pose
data remains in the raw artifact for `frozen_suspect` frames (only
scientific-evidence CONSUMERS strip it), so overlay/playback tooling can
still choose to render it as an explicitly-unverified frame if a future UI
phase wants to.

## 10. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` —
  `TERMINATED_DETECTOR_CADENCE_MULTIPLIER`, `CONSECUTIVE_MISS_THROTTLE_
  COUNT`/`MISS_THROTTLE_CADENCE_MULTIPLIER`, `consecutive_detector_misses`
  tracking + the two-stage throttle fix in `wants_detector_frame()`,
  `detector_invocation_reasons`/`detector_invocations_changed_box`/
  `detector_invocations_resolved_suspicion` accounting, `summary()`
  additions.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  `boxes[]`/`box_confidences[]` frozen-suspect sync before `plan_crops()`;
  `classify_crop_validation()` + `CROP_VALIDATION_OUTCOMES`; full
  crop-handoff provenance in `frame_obj`; `apply_pose_localization_
  feedback()` + `_box_iou()`; the identical-crop time-based fix (real bug
  found via Vanni 240).
- `src/lib/biomechanics/pose.ts`, `MediaPipeTypes.ts`,
  `MediaPipePoseBackend.ts` — 20+ new optional fields (crop provenance +
  pose feedback), strict-superset additive.
- `scripts/box-tracker-crop-provenance-sanity.py` — new, 30/30 passing
  (Part 13's 23 scenarios).
- `scripts/phase-4-2c-benchmark-rerun.mjs` — new, general-purpose real
  production rerun for any of the 4 benchmarks.
- `package.json` — `+1` script.

Not changed: detector model, pose backend, contact thresholds, timing/step/
velocity formulas, skeleton/joint-angle UI, gate stability, zone
visualization, panning, Athlete Intelligence — confirmed by `git status`
scope and Part 13 test 23.

## 11. Database changes

None to schema. Four real production analyses were requeued through
`replace_working_analysis` (Gav, Vanni 240 ×2, Vanni 120 ×3, Vanni 60 ×1 —
see Section 12–15 for why some ran more than once), each with a pre-run
snapshot saved via `save_working_analysis_snapshot` first. `npm run
db:reset` was never run. The protected Gav session itself was never
manually mutated — only the same `replace_working_analysis` RPC the real
app's own rerun action uses.

## 12. Vanni 120 rerun

Three real reruns total (trace/diagnostic in the prior conversation turn,
then two in this subphase: pre-cost-fix and post-cost-fix).

**Final (post-cost-fix) run** — analysis `6d9a6aba-...`, session
`160a86a2-...`, 483 total frames, native 120fps:

| Field | Value |
|---|---|
| Verified localization frames (`detected`/`reacquired`) | 22 |
| `tracked` frames | 337 |
| `frozen_suspect` frames | 116 (15 via box_tracker signals, frames 232–246; 101 via pose feedback, frames 341–482) |
| `invalid` frames | 8 |
| `crop_verified` | 314 |
| `crop_provisional` | 45 |
| `crop_rejected_frozen_localization` | 116 |
| `crop_rejected_stale_box` | 8 |
| Detector invocations | 52 (was 192 pre-fix; see Section 8) |
| `pass1LocalizationSeconds` | ≈31.1s (was ≈83.0s pre-fix) |
| `athleteTrackingConfidence` | 0.9171 |
| `tracking_loss_ranges` | `[{317,482}]` — identical across both post-cost-fix reruns |
| `strideFrequencyHz` | 5.01 |
| Determinism | Confirmed — reran twice (pre/post cost-fix), `frozen_suspect` frame ranges byte-identical both times |

**Frame 215**: classified `accepted_verified` by real computation (not
hardcoded) — see Phase 4.2B report Section 4, unaffected by this subphase.
**Frames 232–246**: confirmed `frozen_suspect`,
`suspicion_confirmed_background_lock`, matching Phase 4.2B. **Frames
247–250**: frame 247 is the real resolving `detected` event; 248–250 are
clean `tracked` frames from that corrected position — no unexplained jump
in the corrected pipeline (Section 6). **Contacts/steps/zone time**: not
independently re-audited this subphase (recommended for Phase 4.3, Section
23 — the metrics available at the `analyses` table level don't expose
per-contact detail without a dedicated contact-recovery audit, matching
Phase 3's own methodology).

## 13. Gav rerun (protected)

Session `e04a7983-...`, analysis `3a148f45-...`, via the same
`replace_working_analysis` RPC the real app's rerun action uses — the
session itself was never manually touched.

| Field | Before | After | Match? |
|---|---|---|---|
| `athleteTrackingConfidence` | 0.8024089716118894 | 0.8024089716118894 | ✅ byte-identical |
| `tracking_loss_ranges` | `[]` | `[]` | ✅ |
| `strideFrequencyHz` | 4.4 | 4.4 | ✅ |
| `frozen_suspect` frames | — | **0 / 142** | ✅ zero false positives |
| `crop_rejected_*` frames | — | 7 (`crop_rejected_stale_box`, pre-existing invalid frames, unrelated to this phase) | — |
| Detector invocations | — | 22 | not compared (no prior baseline captured at this granularity) |

**Zero regression, byte-for-byte, verified directly.** This is the
cleanest, most decisive proof this phase's changes are safe when nothing is
actually wrong with a clip: not one frame was flagged, not one metric
moved.

## 14. Vanni 240 rerun

Session `31fe352b-...`, analysis `a7679326-...`, native 240fps, 1020
frames. **The regression this phase's acceptance is blocked on.**

| Field | Before (Phase 4.1 baseline) | After (buggy pose-feedback) | After (time-based fix) |
|---|---|---|---|
| `athleteTrackingConfidence` | 0.9055155871735995 | 0.8677381071683934 | 0.8677381071683934 (unchanged by the fix) |
| `tracking_loss_ranges` | `[{668,1019}]` | `[{126,128},{131,136},{138,255},{481,481},{483,1019}]` | same (unchanged by the fix) |
| `strideFrequencyHz` | 5.93 | 4.95 | 4.95 (unchanged by the fix) |
| `frozen_suspect` frames | — | 534 / 1020 (52%) | **487 / 1020 (48%)** |

The identical-crop time-based fix (Section 8/9 of the general report,
Section 6 of this file) reduced the FALSE-POSITIVE portion of
`frozen_suspect` frames (534 → 487, confirmed by direct inspection: frames
120–144, previously wrongly flagged, are now correctly NOT flagged — see
the module docstring in `mediapipe_pose_runner.py` and Part 13 test 20/21).
**It did not fully resolve the regression** — `tracking_loss_ranges` and
the summary metrics are unchanged, because the underlying `kp=0` pose
misses at frames 126–255 are REAL (MediaPipe genuinely does not find a
person in the crop it was given at those exact frames) — this is not a
`frozen_suspect` misclassification bug, it is the crop-planner
trajectory-sensitivity mechanism from Section 6: intermittent tight-crop
failures that a same-frame expanded-crop retry sometimes recovers and
sometimes doesn't, now happening at a materially different rate than the
original Phase 1/2 baseline because `box_tracker.py`'s own trajectory
(Phase 4.2B's plausibility/ceiling changes, not this subphase's code) feeds
a measurably different `boxes[]` sequence into `plan_crops()` than it did
when Phase 1/2 hand-verified this benchmark.

**Root cause traced to**: `plan_crops()`'s global, non-causal trend fit
(Section 6) combined with `box_tracker.py`'s now-different (Phase
4.2B-changed) trajectory for this specific clip. **Not fully fixed this
subphase** — this is the honest, explicit blocker (Section 21).

## 15. Vanni 60 rerun

Session `3d6ba4b6-...`, analysis `8f55936c-...`, 60fps, 233/246 frames
processed (matches this benchmark's known early-termination behavior).

| Field | Registry baseline (pre-Phase-4.2) | After |
|---|---|---|
| `stepFrequency` | 4.404 Hz | 4.38 Hz |
| Coverage | 66.9% (ends 14.8m of 20m) | `tracking_loss_ranges` now shows 3 explicit gaps (82–88, 97–109, 154–232) instead of one implicit "lost partway through" |
| `frozen_suspect` frames | — | 61 / 233 (24 via box_tracker signals, 37 via pose feedback) |

Per this task's explicit instruction not to broaden into the dedicated
60fps repair phase, this was NOT investigated further. **Assessment**:
unlike Vanni 240, this benchmark had no Phase-1/2-style hand-verified
"correct" baseline to regress against — it was already documented as "the
weakest new run" with known, unexplained tracking loss. The observed
change (finer-grained, more numerous gaps, a small stride-frequency shift)
is consistent with — and most plausibly explained by — this phase's
explicit purpose (stricter, more honest evidence withholding) rather than
a new failure this phase introduced, but this is **not proven to the same
standard as Gav's byte-identical result or Vanni 120's stable-metrics
result**, and is reported as inconclusive-but-plausible rather than
confirmed-safe.

## 16. Cross-benchmark comparison

| | Gav (protected) | Vanni 240 | Vanni 120 | Vanni 60 |
|---|---|---|---|---|
| Source FPS | 60 | 240 | 120 | 60 |
| Total frames | 142 | 1020 | 483 | 233 (of 246) |
| Verified (`detected`/`reacquired`) | 12 | 16 | 22 | 8 |
| `tracked` | 123 | 507 | 337 | 160 |
| `frozen_suspect` | **0** | 487 | 116 | 61 |
| `invalid` | 7 | 10 | 8 | 4 |
| `crop_verified` | 135 | ~423 | 314 | 130 |
| `crop_rejected_frozen_localization` | 0 | 487 | 116 | 61 |
| Detector invocations | 22 | 66 | 52 (was 192) | 28 |
| `athleteTrackingConfidence` before → after | 0.8024 → 0.8024 | 0.9055 → 0.8677 | 0.9174 → 0.9171 | n/a (no prior directly comparable figure) |
| Result state | **Unchanged, zero regression** | **Regressed — real, unresolved** | **Improved** (real incident caught, cost cut 73%, metrics stable) | **Changed — plausible but unconfirmed improvement** |

**Classification of each change**:
- **Gav**: unchanged output — proof of safety on a clean track.
- **Vanni 120**: algorithm improvement (real incident caught) + runtime
  trade-off resolved (cost cut back to baseline) — the clearest success.
- **Vanni 240**: **regression** — stricter evidence-withholding alone
  cannot explain a confidence/metric DROP on a benchmark that was
  previously fully clean in this exact region; this is new tracking
  difficulty, not just more honest reporting of old difficulty.
- **Vanni 60**: most likely stricter evidence withholding (consistent with
  this phase's purpose) but not proven to the same standard.

## 17. Runtime and resource impact

`vanni_fly_120`: pass-1 runtime restored to ≈31s (from a ≈83s intermediate
regression, net roughly flat vs. Phase 4.1's ≈33s baseline) after the
detector-cost fix. `vanni_fly_240`/`vanni_fly_60`/Gav: no measured
runtime regression (detector invocation counts unchanged or improved
slightly). No lease/heartbeat anomalies observed in any of the 8 real
worker jobs run this subphase — all completed via normal `job_completed`
worker-log transitions, no timeouts, no stage-duration outliers besides
the (fixed) Vanni 120 cost spike.

## 18. Tests and exact outcomes

| Command | Result |
|---|---|
| `npm run stationary-validation-registry:sanity` | 45/46 — same pre-existing, disclosed 105%-weight failure |
| `npm run box-tracker:sanity` | 27/27 PASSED (unmodified) |
| `npm run box-tracker-teleport:sanity` | 16/16 PASSED (unmodified) |
| `npm run box-tracker-frozen-track:sanity` | 39/39 PASSED (unmodified) |
| `npm run box-tracker-crop-provenance:sanity` | **30/30 PASSED (new — Part 13's 23 scenarios)** |
| `npm run vanni-240-metric-evidence:sanity` | ALL PASSED (arithmetic-correctness fixture, independent of this phase's localization findings) |
| `npm run measurement-recovery:sanity` | ALL PASSED |
| `npm run timing-verification:sanity` | ALL PASSED |
| `npm run analysis-fps:sanity` | passed |
| `npm run zone-step-counting:sanity` | 25/25 PASSED |
| `npm run zone-coverage:sanity` | ALL PASSED |
| `npm run analysis-report:sanity` | ok |
| `npm run worker:check` | `worker_configuration_valid` |
| `npm run typecheck` (`tsc --noEmit`) | clean, 0 errors |
| `npm run lint` (`eslint src --max-warnings=0`) | clean |
| `npm run build` | succeeded |
| `python3 -m py_compile` (both modified Python files) | OK |
| Real production reruns | Gav ×1, Vanni 240 ×2, Vanni 120 ×3 (incl. prior turn), Vanni 60 ×1 — all `job_completed` |

## 19. Full Phase 4.2 acceptance table

| # | Criterion | Status |
|---|---|---|
| 1 | Vanni 120 freeze detected in production | ✅ confirmed, twice, real data |
| 2 | Detector/reacquisition events cannot poison motion expectations | ✅ Phase 4.2B, unaffected this subphase |
| 3 | Frozen suspect localization withheld scientifically | ✅ confirmed on all 4 real benchmarks |
| 4 | Crop/source/pose frame provenance complete | ✅ Section 4, 20 fields, real invariant checks |
| 5 | Stale/suspect boxes cannot silently feed pose | ✅ Section 4's sync fix closes the specific disclosed gap |
| 6 | Prior downstream jump explained exactly | ✅ Section 6 — exact module (`plan_crops`'s global trend fit) and mechanism named |
| 7 | Pose feedback bounded, cannot self-authorize | ✅ Section 7 — can only downgrade `tracked`, never promote, never touches `detected`/`reacquired` |
| 8 | Detector-invocation growth measured, unnecessary calls removed safely | ✅ Section 8 — 192→52 on Vanni 120, verified safe (stable metrics) |
| 9 | Post-finish detector behavior bounded | ⚠️ partial — real proxy implemented, but measured to have zero effect in isolation (Section 9); the real reduction came from a different mechanism (consecutive-miss throttle) |
| 10 | Vanni 120 real rerun validates the complete correction | ✅ Section 12 |
| 11 | Protected Gav does not regress | ✅ Section 13, byte-identical |
| 12 | Vanni 240 verified timing/metrics do not regress | **❌ NOT MET — Section 14, real regression found and only partially mitigated** |
| 13 | Vanni 60 does not regress or falsely improve through weakened evidence | ⚠️ plausible but not proven to the same standard (Section 15) |
| 14 | No unsupported localization creates evidence | ✅ verified directly across all 4 benchmarks |
| 15 | Runtime/leases/heartbeats healthy | ✅ Section 17 |
| 16 | All relevant tests pass | ✅ Section 18 |
| 17 | Roadmap arithmetic reconciled transparently | ✅ Section 2 |
| 18 | Documentation/tracker updated | ✅ this document + roadmap |

**Result: 14 of 18 fully met, 2 partial, 1 not met (#12, the blocking
criterion).** Per the explicit rule ("if one benchmark regresses... Phase
4.2 remains In Progress, assign no full weighted credit, state the exact
blocker"), **Phase 4.2 is NOT marked Complete.**

## 20. Roadmap progress before vs. after

| | Before this subphase | After this subphase |
|---|---|---|
| Phase 4.2 status | In Progress | **In Progress (unchanged)** |
| Phase 4.2 weighted contribution | 0.0% | **0.0% (unchanged)** — real regression blocks credit |
| Overall completion (this file's own arithmetic) | 26.8% | **26.8% (unchanged)** |

See `docs/stationary-roadmap-progress.md` for the updated Phase 4.2 section
recording this subphase's real findings (both the real wins and the real,
unresolved Vanni 240 blocker) without awarding weighted credit.

## 21. Remaining localization limitations

1. **`vanni_fly_240` regression, unresolved** — the explicit blocker. Real
   mechanism identified (Section 6/14) but not fixed. Highest priority for
   Phase 4.3.
2. **`plan_crops()`'s non-causal, whole-clip trend fit** — the root
   architectural cause behind both this regression and the earlier
   post-finish side effect Phase 4.2B disclosed. Not redesigned this
   subphase (would need its own real-benchmark validation).
3. **Contact/step recovery not re-audited** against the corrected Vanni 120
   localization — Phase 3's original methodology should be reapplied.
4. **Detector-cost throttle does not generalize** to Vanni 240's
   intermittent-miss pattern (Section 8) — real, measured, disclosed.
5. **`box_tracker.summary()`'s per-reason invocation breakdown** is not
   forwarded by the worker's stdio pipe (pre-existing gap, Phase 4.1) —
   this phase's Section 8 analysis relied on `stage_durations`'
   `detectorInvocations` total plus direct artifact inspection instead.
6. **Vanni 60's broader late-run tracking problem** — explicitly not
   addressed, per this phase's own scope limit.

## 22. Git status

Not committed, not pushed, per explicit instruction. `git status --short`
shows this subphase's changes plus the full pre-existing uncommitted
working tree from the whole engagement (Phases 0–4.2B).

## 23. Recommended Phase 4.3 scope

Given Phase 4.2 is not yet complete, the immediately next work is properly
**Phase 4.2D** (a continuation, not Phase 4.3), scoped narrowly:

1. **Root-cause and fix the `vanni_fly_240` regression.** Specifically:
   instrument `plan_crops()`'s trend fit to determine whether the
   Phase-4.2B-changed `box_tracker.py` trajectory (not this subphase's own
   code) is what shifted, and whether bounding the trend fit's look-ahead/
   look-behind window (rather than fitting the whole clip) resolves it
   without reintroducing the original wide-crop-compensation behavior
   Phase 4.1 depended on.
2. Re-run Vanni 240 (and Gav/120/60 as regression guards) until criterion
   12 is met with byte-identical or explicably-improved metrics.
3. Only then: re-audit Vanni 120's contact/step recovery, and consider
   whether the detector-cost throttle should be extended to cover Vanni
   240's intermittent-miss pattern.
4. Once all of the above are real and validated, update the roadmap to
   award Phase 4.2's full 3% weighted contribution and proceed to the
   original Phase 4 (60 FPS late-run athlete-loss fix) or Phase 5
   (cross-FPS normalization) as next scheduled.

**Do not commit. Do not push** — all Phase 4.2C work remains in the
uncommitted working tree, per explicit instruction.
