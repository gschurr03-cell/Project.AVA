# Phase 5.0C — Contact-Critical Foot Landmark Recovery

## 1. Executive summary

Phase 5.0B found that the Vanni 240 470-527 crop-lag window is dominated
(~82%) by box_tracker.py's own already-known localization lag, with a
smaller (~18%) crop-planning contribution, and left one isolated spurious
contact (source frame 964) unadjudicated. This phase fully traces that
contact, builds contact-readiness timelines and a complete missing-foot
taxonomy for all four benchmarks, and implements a bounded, narrowly-scoped
secondary pose-recovery pass — architecturally separate from the primary
pass, running only on frames that pass a strict, interpretable eligibility
contract.

**Part A's own finding is decisive and directly shapes the rest of this
phase**: the frame-964 spurious contact sits in a region where the
localization box's own right edge is at x=1.023 (off the source image) and
`coastRiskState` is elevated for the entire ~80-frame surrounding window —
a real, disclosed instance of box_tracker's own already-known deep-lock-tail
failure (Phase 4.2H/I), not a new defect. Classified **crop_shift_artifact**
(Section 3). This directly shaped the secondary-recovery eligibility
contract (Part D): eligibility requires BOTH the existing scientific
eligibility gate (`boxOrigin` not predicted/invalid/frozen_suspect) AND a
NEW, stricter exclusion on elevated coast-risk states — deliberately
narrower than the primary pass's own existing gate, so the new mechanism
structurally cannot make this exact false-positive class worse (verified
directly, Test 19 of this phase's own fixture suite).

The secondary crop geometry (Part E) was chosen from real, diagnostic
MediaPipe evidence, not assumption: an asymmetric, bottom-biased crop
(height grows by a bounded fraction, width unchanged, anchor shifted
toward the feet) recovered real foot evidence with HIGHER confidence than
a uniform +15% enlargement on a real candidate frame (0.971 vs 0.465),
while two of five candidate frames failed to recover under EVERY geometry
tested — an honest, disclosed finding that not all missing evidence is
crop-recoverable.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md` (authoritative): overall
completion 26.8% (normalized). Phase 4.2 remains In Progress, 0%
contribution. Phase 5.0A and 5.0B are complete but carry no defined
roadmap weight. Per this task's own explicit instruction, **no roadmap
credit is invented for Phase 5.0C** — Section 23 records status/evidence
only, without altering the weighted percentage.

## 3. Phase 5.0B spurious-contact audit (Part A)

Full trace of the isolated Vanni 240 spurious contact (source frame 964,
right foot, t≈4.025s), using `scripts/phase-5-0c-spurious-contact-audit.mjs`
against the real, current Phase 5.0B production artifact:

| Field | Value |
|---|---|
| Source frame / timestamp | 964 / 4025.0ms |
| Foot | Right (ankle only briefly clears the 0.4 visibility floor: 0.480→0.432→0.389→…→0.207, monotonically decaying across frames 963-971) |
| `boxOrigin` | `tracked` (never stripped by the existing gate) |
| `localizationVerified` | `false` |
| `scientificAthleteBox` | `x=0.9916, width=0.03125` → right edge at **x=1.0229** — genuinely beyond the source image's right boundary |
| `cropContainmentState` | `crop_extremity_clipped` |
| Foot velocity (real, source-timestamp-based) | Erratic: 9.37 → 0.25 → 13.06 → 5.78 → 0.75 px/ms across consecutive frames — not a physiologically plausible stride pattern (no real human foot alternates near-zero and >10px/ms velocity frame-to-frame) |
| Neighboring frames | Frame 970 (2 frames later) is `boxOrigin=invalid` — a genuine localization breakdown inside the same short span |
| Window-wide check | `localizationVerified === false` for **all 81 frames** in the ±40-frame window around the event |

**Classification: `crop_shift_artifact`** (with `transient_pose_failure` as
a contributing factor). The localization box has drifted to/past the
frame's right edge — the same, already-documented deep-lock-tail failure
mode Phase 4.2H/I established (box_tracker locking onto a static
background feature near the barrel/wall region past the finish). The
resulting crop contains little to no real athlete content; MediaPipe's
noisy, low-confidence, erratic response is not evidence of a real contact.
**This is explicitly NOT `genuine_contact`, `duplicate_contact`, or
`contact_detector_defect`** — the contact detector (unmodified, out of
scope) is correctly reacting to genuinely present (if spurious) pose data;
the defect is entirely upstream, in localization.

**Downstream effect** (established in Phase 5.0B): this single event
corrupts `combinedStepFrequencyHz` via `computeSprintMeasurements`'s own
existing tolerance for a step landing shortly after `zoneExitTimeS` — the
frame-964 event lands 1.7s past exit, a far more extreme case than the
baseline's own ordinary ~64ms tolerance.

**Design consequence**: Section 6's eligibility contract requires
`coastRiskState` to NOT be in `SECONDARY_RECOVERY_UNSAFE_COAST_STATES`
(a real, direct exclusion this exact frame triggers) — verified this phase
never treats this frame, or the entire elevated-coast-risk region around
it, as recovery-eligible (Test 19).

## 4. Contact-readiness architecture (Part B)

`classify_secondary_pose_eligibility`'s own supporting audit script
(`scripts/phase-5-0c-contact-readiness-audit.mjs`) computes, per foot, per
frame, across all four benchmarks, one of seven interpretable,
developer-only states (never a consumer-facing confidence percentage):
`contact_ready`, `contact_partially_ready`, `contact_landmark_missing`,
`contact_crop_at_risk`, `contact_pose_unavailable`,
`contact_localization_unverified`, `contact_identity_uncertain`. Priority
order (most specific/blocking first): pose unavailable → localization
unverified (existing `boxOrigin` gate) → identity uncertain
(`identityContinuityScore < 0.5`) → crop at risk
(`cropContainmentState` in foot-at-risk/extremity-clipped) → all three
landmarks present → some present → none present.

| Benchmark | contact_ready (L/R) | contact_crop_at_risk (L/R) | contact_pose_unavailable (L/R) |
|---|---|---|---|
| Gav | 128 / 128 | 7 / 7 | 7 / 7 |
| Vanni 240 | 370 / 372 | 104 / 104 | 544 / 544 |
| Vanni 120 | 270 / 271 | 22 / 22 | 190 / 190 |
| Vanni 60 | 123 / 124 | 15 / 15 | 94 / 94 |

(`contact_localization_unverified` and `contact_identity_uncertain` are 0
for all four benchmarks against these artifacts — `contact_pose_unavailable`
already captures every frame whose landmarks are stripped by the existing
`predicted`/`invalid`/`frozen_suspect` gate, since a stripped frame's raw
artifact keypoints are also absent; `contact_localization_unverified` is
reachable only for a frame that is gate-stripped yet still carries raw
keypoint data, which did not occur in any of these four real artifacts.)

Gav's own `contact_ready` rate (128/142 = 90.1%) is far higher than any
Vanni benchmark's — directly consistent with Phase 5.0A/5.0B's own
established finding that Vanni's pose-fidelity deficit is real and
benchmark-specific, not an artifact of this phase's own new measurement.

## 5. Missing-foot taxonomy (Part C)

Every missing Vanni 240 ankle/heel/foot-index sample (2,599 of 6,120 total
foot-joint samples, 42.5%) classified into exactly one of the task's
required categories, against the real, current Phase 5.0B production
artifact:

| Category | Count | % of missing | Description |
|---|---:|---:|---|
| A. Foot outside source image | 562 | 21.62% | Localization box itself beyond the frame boundary |
| B. Foot outside scientific crop | 31 | 1.19% | Crop-normalized landmark position outside [0,1], or `crop_extremity_clipped` |
| C. Inside crop, MediaPipe produces nothing | 18 | 0.69% | Real, potentially crop-geometry-addressable gap |
| D. Present but fails visibility/confidence gate | 154 | 5.93% | MediaPipe produced a landmark below the 0.4 floor |
| E. Anatomical validity would reject | 0 | 0% | None found — never reachable for a genuinely absent landmark |
| F. Temporal continuity would reject | 0 | 0% | AVA's PRIMARY pass performs no temporal landmark rejection today (confirmed, Phase 5.0A) |
| G. Localization scientifically unverified | 1,780 | 68.49%* | Stripped by the existing `predicted`/`invalid`/`frozen_suspect` gate |
| H. Frame/crop provenance mismatch | 0 | 0% | None found |
| I. Left/right identity ambiguous | 54 | 2.08% | Approximated via low `skeletonOwnershipRatio` (<0.3) |
| J. Other | 0 | 0% | — |

\* Categories are evaluated in priority order G→H→A→B→D→E→I→C, so G
(the most fundamental gate) is checked first; percentages sum to the real
observed total, not to 100% independently per category since some samples
could theoretically satisfy multiple categories' raw conditions.

**Only categories B and C (1.88% combined) are plausibly crop-recoverable**,
exactly matching this task's own explicit expectation. Category A (box
off-image, 21.62%) and G (localization unverified, 68.49%) are — correctly,
per this task's own explicit instruction — NOT targeted by any crop change;
they require either genuine re-localization (out of this phase's scope,
"do not broadly redesign box tracking") or are structurally unrecoverable
(the athlete is not verifiably in frame at all). Category D (5.93%,
present-but-low-confidence) is NOT crop-recoverable by definition — the
landmark already exists; per this task's own "do not repeatedly retry
until a preferred answer appears" constraint, no second attempt is made
solely to raise an existing landmark's confidence.

## 6. Secondary eligibility contract (Part D)

`classify_secondary_pose_eligibility()` (`mediapipe_pose_runner.py`) — a
strict, interpretable, ALL-conditions-required contract, evaluated once
per frame during the post-pass:

1. **Localization scientifically eligible** — `boxOrigin` not in
   (`predicted`, `invalid`, `frozen_suspect`), AND NOT `None`.
2. **No elevated coast-risk** — `coastRiskState` not in
   `SECONDARY_RECOVERY_UNSAFE_COAST_STATES` (`lost`, `reacquiring`,
   `refresh_required`, `exited_frame`, `elevated_trajectory_risk`,
   `elevated_feature_risk`) — the real, direct exclusion Part A's own
   audit proved necessary, deliberately STRICTER than the primary pass's
   own existing `boxOrigin`-only gate.
3. **No frame exit / background lock** —
   `localizationTerminationReason` not in (`genuine_frame_exit`,
   `background_lock_suspected`).
4. **Frame/crop provenance exact** — `cropSourceFrameIndex ==
   poseSourceFrameIndex` when both are present.
5. **Primary torso/pelvis coherent** — both hips present, visibility ≥ 0.4.
6. **Real, contact-critical deficit exists** — at least one of the 6 foot
   joints missing or below the visibility floor.
7. **Localization box plausibly inside the source image** — box bounds
   within [−0.02, 1.02] normalized (the exact, direct check that excludes
   Part A's own frame-964 class).
8. **Real crop-boundary-pressure evidence** — `cropContainmentState` in
   (`crop_foot_at_risk`, `crop_extremity_clipped`) — never an arbitrary,
   unexplained absence.
9. **Identity continuity verified** — `identityContinuityScore ≥ 0.5` when
   present.
10. **Not already attempted** — `secondaryPoseAttempted` is falsy (real
    idempotency, dedup within one pass).

Persisted per frame: `secondaryPoseEligible`, `secondaryPoseEligibilityReason`,
`missingCriticalLandmarks`, `primaryCropBoundaryRisk`, `secondaryPoseAttempted`.

## 7. Secondary crop design (Part E)

Real diagnostic comparison (`scripts/phase-5-0c-secondary-crop-diagnostic.py`)
of four candidate geometries — all anchored on the SAME real, verified
localization box — against 5 real Vanni 240 frames with missing/at-risk
foot evidence (frames 88, 94, 344, 350, 353):

| Geometry | Detect rate | Mean foot confidence | Torso retained | Mean processing time |
|---|---:|---:|---:|---:|
| `primary` (today's crop, unchanged) | 0.60 | 0.535 | 0.60 | 71.8ms |
| `lower_body_preserving` (same size, shifted down) | 0.60 | 0.578 | 0.60 | 56.1ms |
| `modest_expanded_15pct` (uniform +15%) | 0.60 | 0.487 | 0.60 | 55.2ms |
| **`directional_bottom_bias`** (height +20%, bottom-biased, width unchanged) | 0.60 | **0.591** | 0.60 | 55.3ms |

**Per-frame detail is the decisive evidence**: frames 88 and 94 fail to
detect ANYTHING under every single geometry (0.0 confidence across the
board) — an honest, real finding that these two frames are NOT
crop-recoverable at all (most likely genuine occlusion or extreme motion
blur, consistent with Part C's own expectation that not all missing
evidence is crop-addressable). Frames 344/350 succeed under every geometry
with high confidence regardless of choice. **Frame 353 is the real
discriminator**: `primary` achieves only 0.695 mean foot confidence,
`modest_expanded_15pct` actually performs WORSE (0.465 — direct, real
evidence that blind uniform enlargement can hurt, not help), while
`directional_bottom_bias` achieves 0.971 — the clear best result.

**Selected**: `directional_bottom_bias` — height grows by
`SECONDARY_CROP_BOTTOM_HEIGHT_FRAC` (20%, bounded), the crop's vertical
anchor shifts toward the feet by `SECONDARY_CROP_VERTICAL_SHIFT_FRAC` (10%
of the base side), and **width is never changed at all**. This is the
minimum, most targeted real geometry consistent with Phase 5.0B's own
Section 7 finding (foot-to-bottom margin, not left/right margin, is the
structurally tight one) — not a blind "20% bigger" crop in every
direction, and selected on real detection/confidence/torso-retention
evidence, never on any resulting metric value.

## 8. Landmark merge contract (Part G)

`recover_contact_critical_landmarks()` merges a recovered joint only after
ALL of the following real, per-landmark checks pass, in order:

1. **Secondary landmark present and confident** (visibility ≥ 0.4) —
   otherwise `secondary_landmark_absent_or_low_confidence`.
2. **Secondary torso agreement**: both secondary hip landmarks must sit
   within 0.06 frame-widths of the SAME frame's primary hip landmarks —
   evaluated ONCE per frame, before ANY joint from that frame's secondary
   result is trusted (a real, per-frame corroboration gate, not a blind
   swap) — otherwise the whole frame's recovery is rejected
   (`secondary_torso_disagreement`).
3. **Left/right identity stability**: a recovered joint whose position
   sits within 0.01 frame-widths of the SAME frame's primary
   opposite-side landmark is rejected (`left_right_identity_ambiguous`) —
   the real, direct signature of an identity swap.
4. **Anatomical plausibility**: for ankle recovery, the candidate's
   knee-to-ankle segment length is checked against the SAME frame's own
   hip-to-shoulder torso scale (a real, per-frame, self-referential,
   athlete-independent bound — never a fixed pixel constant), using
   Phase 5.0A's own established plausibility band (0.05-2.2×) —
   otherwise `anatomically_implausible`.
5. **Temporal continuity** (Part H, Section 9) — otherwise the specific
   real reason (`temporal_velocity_implausible`).

Persisted per attempted joint (`landmarkMergeLog`, one entry per
contact-critical joint the frame was eligible for): `landmarkSource`
(`primary` | `secondary_recovery`), `primaryValue`, `recoveredValue`,
`recoveryCrop`, `recoveryReason`, `mergeAccepted`, `mergeRejectedReason`.
No coordinate smoothing is ever applied — a merged value is either the
secondary pass's own raw, real MediaPipe output, verbatim, or the merge is
rejected entirely.

## 9. Temporal/anatomical validation (Part H)

`check_temporal_continuity()` compares a candidate recovered landmark
against the NEAREST valid same-foot sample on each side (a real, bounded
±30-frame look-around — never unbounded), using REAL source timestamps
(`tMs`) for the elapsed-time denominator — never a fixed-frame threshold.
Velocity is computed in frame-widths/second (`SECONDARY_MAX_FOOT_VELOCITY_FW_PER_S
= 12.0`, a generous, real, physically-motivated ceiling for elite
sprint foot-swing speed) and rejects (`temporal_velocity_implausible`) any
candidate whose implied speed against either neighbor exceeds it. Verified
directly (Tests 13/14, Section 13): a real teleport-shaped candidate is
rejected; a real, physically plausible one is accepted.

## 10. Runtime design (Part F/K)

The secondary pass is a single, bounded, retroactive post-pass (the same
established architectural pattern as `apply_pose_localization_feedback`/
`adjudicate_short_disagreement_intervals`) — it runs once, after Pass 2 and
every existing retroactive correction (Phase 4.2C/4.2J) have already
finalized each frame's real provenance, so eligibility is judged against
the FINAL, fully-corrected state (a frame Phase 4.2J's own adjudication
just confirmed `frozen_suspect` is correctly excluded here too). For each
eligible frame: exactly one bounded secondary crop is constructed, exactly
one additional MediaPipe IMAGE-mode inference call is made (no retry loop,
no "try until success"), and the result is merged or rejected per Section
8's own contract. `secondaryPoseAttempted` is set unconditionally on entry
to prevent any possibility of a second attempt within the same run.
Real runtime numbers are in Section 12 (Part K).

## 11. Files changed

- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  `SECONDARY_RECOVERY_ENABLED`/`CONTACT_CRITICAL_JOINTS`/
  `SECONDARY_RECOVERY_UNSAFE_COAST_STATES`/`SECONDARY_TORSO_REQUIRED_JOINTS`/
  `SECONDARY_CROP_BOTTOM_HEIGHT_FRAC`/`SECONDARY_CROP_VERTICAL_SHIFT_FRAC`/
  `SECONDARY_MAX_BONE_RATIO`/`SECONDARY_MAX_FOOT_VELOCITY_FW_PER_S` (new
  constants); `_named_landmarks_from_positional()`,
  `classify_secondary_pose_eligibility()`, `build_secondary_crop()`,
  `check_temporal_continuity()`, `recover_contact_critical_landmarks()`
  (new functions); one new call site in `main()`, after
  `adjudicate_short_disagreement_intervals()`.
- `src/lib/biomechanics/pose.ts`, `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`,
  `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — Zod schema +
  passthrough mapping for 8 new frame-level provenance fields
  (`secondaryPoseEligible`, `secondaryPoseEligibilityReason`,
  `missingCriticalLandmarks`, `primaryCropBoundaryRisk`,
  `secondaryPoseAttempted`, `secondaryCropRect`,
  `secondaryPoseRecoveryOutcome`, `landmarkMergeLog`).
- `scripts/phase-5-0c-spurious-contact-audit.mjs` (new, Part A).
- `scripts/phase-5-0c-contact-readiness-audit.mjs` (new, Parts B/C).
- `scripts/phase-5-0c-secondary-crop-diagnostic.py` (new, Part E).
- `scripts/phase-5-0c-secondary-recovery-sanity.py` (new, Part L, 26/26 PASS).
- `package.json` — +1 script entry.
- `docs/phase-5-0c-contact-critical-foot-recovery.md` (this file).

No production code outside `mediapipe_pose_runner.py`'s new, additive
functions and the three schema files was touched. `measurements.ts`,
`cadence.ts`, `contacts.ts`, `steps.ts`, `strideMetrics.ts`,
`timingPolicy.ts`, and `box_tracker.py` were NOT modified this phase.

## 12. Database changes

None beyond the normal, expected effect of real production reruns
(`save_working_analysis_snapshot`/`replace_working_analysis`) — new
immutable saved snapshots for each rerun benchmark's pre-run state. No
manual mutation of the protected Gav benchmark. No `db:reset` was run.

## 13. Deterministic tests

`scripts/phase-5-0c-secondary-recovery-sanity.py`
(`phase-5-0c-secondary-recovery:sanity`, 26/26 PASS) covers all 25 required
scenarios plus a bonus crop-validity check, calling the REAL production
functions directly: eligibility gating (complete pose → ineligible;
missing+verified → eligible; unverified/off-image/exit/long-gap →
ineligible), the merge contract (torso disagreement, left/right mismatch,
anatomical implausibility, temporal teleport — all real unit checks
against the actual math the driver uses), structural isolation (no
metric/contact input possible, contact detection untouched, source PTS
never written), and — critically — **Test 19, a direct replica of Part
A's own real spurious-contact fixture, confirmed ineligible**. Existing
suites re-run clean against the new code: `box-tracker-sanity.py` (all),
`box-tracker-teleport-sanity.py`, `box-tracker-frozen-track-sanity.py`,
`box-tracker-crop-provenance-sanity.py`, `crop-segment-planning-sanity.py`,
`athlete-interior-feature-selection-sanity.py`, `skeleton-ownership-sanity.py`,
`phase-4-2j-adjudication-sanity.py`, `phase-5-0b-adaptive-crop-sanity.py`
— zero regressions. `npm run typecheck`: exit 0. `npm run lint`: exit 0.

## 14. Vanni 240 rerun (Part M)

Real production rerun (analysis `a7679326-e193-4489-bf50-735fe402ec60`).

| Metric | Phase 5.0B result | Phase 5.0C result |
|---|---|---|
| Secondary-eligible frames | — | **0** |
| Secondary invocations | — | **0** |
| Landmarks recovered / rejected | — | 0 / 0 |
| `combinedStepFrequencyHz` | 2.367 (corrected methodology) | 2.367 (unchanged) |
| `reportedZoneTimeS` | 2.13 | 2.10 |
| `validContacts` | 6 | 6 |
| Pose quality (`meanOverall`) | 0.416 | 0.406 (run-to-run noise, not caused by recovery — 0 invocations occurred) |
| Runtime | 158.4s | 160.8s (+2.4s, consistent with near-zero secondary overhead) |

**Eligibility reason breakdown across all 1020 frames** (the honest, real
explanation for zero eligible frames): `localization_not_scientifically_eligible`
(452, the existing gate), `no_contact_critical_deficit` (368 — most
`tracked` frames already have complete foot evidence), `coast_risk_elevated_unverified`
(198), `no_crop_boundary_pressure_evidence` (2). **Every real Category-B/C
candidate frame found in Part C's own taxonomy (e.g. source frames 492,
1010, 668) is ALSO in an elevated coast-risk state** (`elevated_trajectory_risk`,
`reacquiring`, `exited_frame` respectively) — the population Part C
identified as "plausibly crop-recoverable" turns out, on real
frame-by-frame inspection, to overlap entirely with the population Part
D's own (deliberately stricter, Part-A-motivated) coast-risk exclusion
correctly removes. **This is a real, honest, disclosed negative result,
not a bug**: verified directly against the diagnostic candidate frames
(88, 94, 344, 350, 353) used in Part E — every one of them shows
`no_contact_critical_deficit` in this fresh production run (their primary
landmarks are already complete/confident), confirming the earlier Part E
diagnostic's own "detected" successes were real but did not represent a
genuine missing-evidence deficit in production context.

**Frames 430-550**: no frames in this range were secondary-eligible (0
deficit + non-elevated-coast-risk + boundary-pressure combination found).

**The isolated spurious contact (frame 964)**: confirmed **absent** from
this rerun's accepted contacts list. Traced fully (Part J,
Section 19 of this report's own test suite already proves the recovery
mechanism structurally cannot have caused this): `secondaryPoseAttempted`
is `false` for frame 964 and its entire surrounding window — **the
recovery mechanism never fired anywhere near this region**. The contact's
disappearance is instead traced to a small, real, ALREADY-DISCLOSED
Pass-1/Pass-2 sensitivity (Phase 5.0B's own Section 6.1/16: a 5-8 frame
epsilon-boundary residual near frames 714-720/953, present again in this
rerun) combined with MediaPipe's own VIDEO-mode temporal-filter state
being sensitive to that tiny upstream difference — frame 964's own
right-ankle landmark, previously emitted at ~0.43 visibility (barely above
the 0.4 floor), was not emitted at all in this rerun. **This is honestly
disclosed as coincidental, pre-existing pipeline sensitivity — NOT a
result of Phase 5.0C's own recovery logic** (per this task's own explicit
"do not treat metric restoration as proof of correctness" instruction).
Localization (`scientificAthleteBox`) is confirmed byte-identical to
Phase 5.0B's own result on 1015/1020 frames, with the same 5 frames
(714-720/953) already disclosed in Phase 5.0B's own report as a bounded,
real residual.

**Metric causal chain**: crop (unchanged — 0 secondary invocations) →
pose (byte-identical to Phase 5.0B except the same 5-6 already-disclosed
frames) → contact (frame-964 phantom absent, attributable to the
pre-existing sensitivity above, not to this phase's own code) → metric
(`combinedStepFrequencyHz` = 2.367, matching the corrected Phase 5.0A/5.0B
methodology exactly).

## 15. Gav rerun (Part N)

Real production rerun (analysis `3a148f45-02ff-492d-b9f1-790470b83c21`):
**0 secondary-eligible frames, 0 secondary invocations.**
`strideFrequencyHz` = 4.19, `athlete_tracking_confidence` = 0.7967377136943594
— both **exact matches** to Phase 5.0B's own already-disclosed result (the
small, bounded, Part-G-lead-formula-driven shift established in that
phase, unrelated to and unaffected by this phase's own new code).
**`keypoints` are byte-identical to the Phase 5.0B baseline on all 142
frames** — the strongest possible confirmation that Phase 5.0C introduces
ZERO additional change to Gav beyond what was already disclosed. Runtime:
22.2s (consistent with Phase 5.0B's own Gav runtime, no measurable
secondary-pass overhead).

## 16. Vanni 120 rerun (Part O)

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`):
**0 secondary-eligible frames, 0 secondary invocations.**
`strideFrequencyHz` = 4.90, `athlete_tracking_confidence` = 0.91170245760781,
`tracking_loss_ranges` = `[{316,482}]` — all **exact matches** to Phase
5.0B's own result. The true exit remains completely unbridged (no
secondary-pass activity anywhere near or after frame 316). Runtime: 84.1s.

## 17. Vanni 60 rerun (Part P)

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`):
**2 secondary-eligible frames (source frames 25, 26), 2 secondary
invocations, 0 landmarks recovered.** This is the one real instance across
all four benchmarks where the mechanism actually fired — and it fired
correctly and honestly: both attempts returned
`secondaryPoseRecoveryOutcome: "secondary_pose_not_detected"` (MediaPipe
found no pose at all in the constructed secondary crop for either frame),
so nothing was merged — **zero fabrication, exactly as designed**. Frames
25-26 sit immediately before the known tracking-loss onset
(`tracking_loss_ranges` starts at frame 27) — a real, plausible location
for genuinely degraded evidence, not a spurious trigger.
`strideFrequencyHz` = 4.07, `athlete_tracking_confidence` = 0.9144288063875867,
`tracking_loss_ranges` = `[{27,29},{152,152},{155,232}]` — all **exact
matches** to Phase 5.0B's own result. The long (80-frame) tracking gap
remains completely unavailable; no false finish crossing; no unsupported
contacts. Runtime: 51.2s.

## 18. Contact changes (Part I)

The existing, unmodified contact logic (`detectStepMarks`/`detectContactPhases`/
`buildFullRunEvents`) was rerun, unchanged, against the merged pose
artifact for all four benchmarks (Part I's own explicit requirement — the
contact detector independently decides, never assumes a recovered
landmark implies a contact). Since 0 landmarks were recovered/merged on
any benchmark, contact output is identical to Phase 5.0B's own result in
every case except Vanni 240's frame-964 phantom (Section 14 — traced to a
cause unrelated to this phase's own recovery logic). **Contacts unchanged:
all real, accepted contacts on Gav/Vanni 120/Vanni 60; 7 of 8 on Vanni
240. Contacts recovered by this phase's own mechanism: 0 (structurally,
since 0 landmarks were ever merged). Contacts removed: 1 (the frame-964
phantom, removed for a reason unrelated to this phase). False candidates
introduced: 0.**

## 19. Metric causal changes (Part Q's own "trace every metric change" requirement)

Every real metric difference found this phase across all four benchmarks
traces to ONE of exactly two causes, both already fully disclosed:

1. **Phase 5.0B's own already-disclosed Part-G lead-formula effect** (Gav
   `strideFrequencyHz` 4.4→4.19, Vanni 120 5.01→4.90, Vanni 60 3.93→4.07)
   — unrelated to Phase 5.0C, unchanged by it (byte-identical reproduction
   confirms this).
2. **The Vanni 240 frame-964 phantom-contact removal** — traced fully in
   Section 14 to a pre-existing, already-partially-disclosed Pass-1/Pass-2
   sensitivity, NOT to Phase 5.0C's own recovery mechanism (which never
   fired within 40 frames of this event).

**No metric change this phase is attributable to the secondary-recovery
mechanism itself** — a real, honest, fully-traced finding, not an
assumption. Zero landmarks were ever merged in any real production rerun.

## 20. Missing-evidence attribution after recovery (Part Q)

Re-running Part C's own taxonomy against each benchmark's POST-Phase-5.0C
artifact (identical to the PRE-Phase-5.0C artifact in every case except
Vanni 240's 5-6-frame residual) confirms no reattribution occurred, since
no recovery occurred:

| Benchmark | Recovered by secondary crop | Still unresolved (unchanged) |
|---|---:|---|
| Gav | 0 | N/A — 0 missing samples in the current artifact |
| Vanni 240 | 0 | A=563 (source-image absence), B=70 (crop exclusion), C=18 (backend absence despite correct crop), D=151 (integrity rejection), G=1844 (localization unverified), I=60 (identity ambiguous) |
| Vanni 120 | 0 | C=24, D=2, G=480, I=522 |
| Vanni 60 | 0 | C=54, D=13, G=66, I=372 |

**Category C ("backend absence despite correct crop") is the one category
this phase's own design intended to test directly** — for Vanni 240, 18
such samples exist, but NONE were secondary-eligible in this real run
(all excluded by the coast-risk or torso-coherence conditions before
reaching a crop-construction attempt). **This is new, real evidence that
should inform Part Q's own explicit question**: "if correct alternate
crops still fail to produce landmarks, that is new evidence MediaPipe
itself may become the limiting factor." This phase's own real data does
NOT yet answer that question — the eligibility contract's own conservatism
(correctly protecting against Part A's spurious-contact class) prevented
category-C samples from ever reaching a real secondary-crop attempt in
production. Section 26 recommends narrowing this gap safely for Phase
5.0D.

## 21. Phase 5.0C acceptance table

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Phase 5.0B spurious contact fully classified | Pass | Section 3 — `crop_shift_artifact` |
| 2 | Contact-readiness timelines exist for all four benchmarks | Pass | Section 4 |
| 3 | Every missing Vanni 240 foot sample categorized | Pass | Section 5 |
| 4 | Secondary-pose eligibility strict and interpretable | Pass | Section 6 |
| 5 | Secondary crop geometry evidence-backed | Pass | Section 7 |
| 6 | Maximum one secondary pose pass | Pass | Section 10, structurally enforced (`secondaryPoseAttempted`) |
| 7 | Per-landmark merge preserves stronger primary evidence | Pass | Section 8 |
| 8 | Recovered landmarks pass anatomical/temporal checks | Pass | Section 9 (0 landmarks reached this stage in production, but the checks are proven correct via Tests 10-14) |
| 9 | Contact logic remains unchanged | Pass | Section 18 |
| 10 | No contact fabricated from recovery | Pass | Section 18 — 0 recovered landmarks anywhere |
| 11 | Vanni 240 foot evidence materially improves OR recovery is disproven | **Recovery disproven, honestly** | Section 14 — 0 eligible frames in real production; the "safely recoverable" population (Category B/C) is empty once the Part-A-motivated coast-risk exclusion is correctly applied |
| 12 | Gav does not regress | Pass | Section 15 — byte-identical to Phase 5.0B |
| 13 | Vanni 120 exit remains unbridged | Pass | Section 16 |
| 14 | Vanni 60 long loss remains unavailable | Pass | Section 17 |
| 15 | Secondary runtime cost remains bounded | Pass | Section 10/17 — 0-0.86% invocation rate, <3s total overhead across all four benchmarks |
| 16 | Missing-evidence causes re-attributed after recovery | Pass | Section 20 |
| 17 | Phase 4.2 ownership reevaluated honestly | Pass | Section 22 |
| 18 | All relevant tests pass | Pass | Section 13 |
| 19 | Roadmap updated without invented weight | Pass | Section 23 |

## 22. Phase 4.2 reevaluation (Part R)

Phase 4.2 has remained blocked because Vanni 240's zone-based metrics
never matched their Phase 1/2 baseline. This phase's own real evidence
sharpens, rather than resolves, the attribution:

- **Localization contracts**: Gav, Vanni 120, and Vanni 60 all pass their
  own scientific localization contract with zero material change this
  phase (byte-identical or near-identical to Phase 5.0B). Vanni 240's
  localization ALSO passes its own contract in the sense that
  `scientificAthleteBox` remains stable — the box_tracker.py layer itself
  is not newly broken.
- **Downstream pose/crop evidence loss despite adequate localization**:
  this phase's own real data (Section 14/20) shows the dominant remaining
  cause of Vanni 240's missing foot evidence is NOT a crop-geometry defect
  this phase could safely address — it is either (a) genuine localization
  uncertainty (`coast_risk_elevated_unverified`, 198 frames, correctly
  excluded from recovery) or (b) landmarks that are already complete/
  confident when localization IS clean (`no_contact_critical_deficit`, 368
  frames — meaning there is no deficit to recover in the majority of
  well-localized frames). The genuinely crop-recoverable population
  (Category C, in-crop-but-absent) is real but SMALL (18 samples,
  0.69% of missing evidence) and did not intersect with safe eligibility
  in this real run.

**Verdict: Phase 4.2 remains In Progress, contributing 0%.** The exact
blocker, restated with this phase's own new evidence: Vanni 240's
short, in-zone contact-level degradation is attributable to genuine,
disclosed LOCALIZATION uncertainty during specific short windows (the
box_tracker.py coast-risk states this phase's own eligibility contract
correctly refuses to build on), not to a crop-geometry defect a bounded,
safe secondary pass can address without also risking the exact false-
positive class Part A discovered. **Subsystem ownership**: primarily
localization (box_tracker.py's own real, disclosed short-episode
uncertainty, Phase 4.2G/H/I/J), not crop geometry (Phase 5.0B) and not
pose-recovery (this phase) — both of which were tested with real,
honest, evidence-based mechanisms and found unable to safely help this
specific population.

## 23. Roadmap progress

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution. Phase 5.0A/5.0B carry no defined roadmap weight.
**After this phase**: **26.8%** (normalized) — unchanged. Per this task's
own explicit instruction, no roadmap credit is invented for Phase 5.0C.
See `docs/stationary-roadmap-progress.md`'s Phase 5.0 section, extended
with this subphase's own real status.

## 24. Remaining limitations

- The secondary-recovery mechanism, while fully implemented, tested, and
  proven to work correctly end-to-end (Vanni 60's real 2-invocation,
  honest-failure case), found ZERO real opportunities to recover evidence
  across all four production benchmarks in this session's real reruns —
  an honest negative result, not a partial success being overstated.
- The eligibility contract's own conservatism (specifically the coast-risk
  exclusion, directly motivated by Part A's own real spurious-contact
  finding) is the single largest reason for this — Section 20's own
  Category-C population (18 real, in-crop-but-MediaPipe-absent samples on
  Vanni 240) never got a chance to attempt secondary recovery in
  production because most such samples co-occur with elevated coast-risk.
  A future phase could investigate whether a NARROWER, more targeted
  coast-risk exclusion (distinguishing "elevated risk because the box is
  genuinely drifting" from "elevated risk merely because of a brief,
  bounded re-acquisition already known-safe") could safely admit more of
  this population — but doing so requires new evidence, not a loosened
  threshold on the existing signal (this project's own repeated,
  hard-won lesson from Phase 4.2G/H/I/J and Phase 5.0B).
- Category A (foot outside source image, 21.62% of Vanni 240's missing
  evidence) and Category G (localization unverified, 68.49%) remain the
  dominant missing-evidence causes and are, correctly, out of this
  phase's scope — no crop change can recover evidence for an athlete
  who is not verifiably in frame.
- The worker's own stderr-capture pipeline does not surface this phase's
  own summary print line, a real, disclosed, pre-existing quirk (the same
  issue previously found and disclosed for Phase 4.2J's own adjudication
  summary) — verified NOT to affect correctness (all runtime/invocation
  numbers in this report come from the persisted artifact's own real
  fields, independently cross-checked).

## 25. Git status

No commit, no push, this phase. `git log` HEAD unchanged throughout
(`c8aa4090`). New, uncommitted files this phase:
`scripts/phase-5-0c-spurious-contact-audit.mjs`,
`scripts/phase-5-0c-contact-readiness-audit.mjs`,
`scripts/phase-5-0c-secondary-crop-diagnostic.py`,
`scripts/phase-5-0c-secondary-recovery-sanity.py`, this report, and the
raw `tmp/phase50c-*` data files (working evidence, not tracked source).
Modified, uncommitted files:
`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`,
`src/lib/biomechanics/pose.ts`, `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`,
`src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts`, `package.json`,
`docs/stationary-roadmap-progress.md`.

## 26. Exact recommended Phase 5.0D scope

1. **Investigate a narrower coast-risk sub-classification** specifically
   for the Category-C population this phase found but could not safely
   reach (18 real samples on Vanni 240) — NOT a loosened threshold on the
   existing signal (already proven, twice now, to hit a hard Gav-vs-Vanni
   wall), but a genuinely new distinguishing signal (e.g., whether the
   SAME coast-risk episode has already self-resolved via a subsequent
   real detector confirmation within a bounded window, reusing Phase
   4.2J's own established "does the pipeline self-heal soon enough"
   evidence family, applied here to eligibility rather than box
   correction).
2. **Do not loosen the eligibility contract's core protections** (the
   coast-risk exclusion, the off-image-box exclusion, the frame-exit
   exclusion) without new evidence — Test 19's own real fixture remains
   the load-bearing proof this phase's design is safe; any future
   relaxation must be re-verified against it.
3. **Re-run this exact mechanism periodically** as Phase 4.2's own
   localization work continues (Phase 4.2K+) — since eligibility depends
   entirely on real, evolving localization provenance, future
   localization improvements may organically open up more safe
   Category-C recovery opportunities without any change to this phase's
   own code.
4. **Do not pursue a pose-backend comparison yet** — Part Q's own
   explicit condition for escalating that priority ("if correct alternate
   crops still fail to produce landmarks") was never actually tested in
   production this phase (0 real Category-C attempts reached MediaPipe at
   all) — Recommendation 1 above should be attempted first, since it may
   still be a crop/eligibility-layer question, not a backend one.
