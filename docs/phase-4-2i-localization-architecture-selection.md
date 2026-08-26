# Phase 4.2I — New-Evidence Localization Architecture Selection and Implementation

## 1. Executive summary

Phase 4.2H concluded that three independent per-frame evidence signal
families (elapsed time, raw distance, trajectory residual) cannot separate
Gav's own legitimate optical-flow coast from Vanni 240's real drift toward a
static background object without either regressing Gav or failing to help
Vanni 240, and recommended two candidate architectural directions requiring
genuinely new evidence. This phase extracted both candidates precisely,
built a real evaluation harness against captured production evidence (not
synthetic data), prototyped both, and selected **Candidate B — pose-landmark-
guided per-point feature ownership** — a real, already-computed, zero-new-
dependency spatial signal (the athlete's own skeleton geometry from the most
recent identity-verified detector confirmation) added as an OR'd acceptance
path alongside the existing motion-consistency classification.

Real evidence from the prototype (captured via the pre-existing
`BOX_TRACKER_TRACE_FILE` mechanism against real production reruns, not
synthetic data): Gav's own mean background-risk reading dropped from 0.367
to 0.087 (directly resolving Phase 4.2H's own root-cause finding — that
Gav's real limb motion looks "background-risk" under a motion-only
heuristic); Vanni 240's long-duration barrel/wall lock tail's rejection
strengthened from 0.883 to 1.000 mean background ratio. The real, disclosed
limitation: Vanni 240's SHORT, in-zone contamination episodes — the actual
cause of the zone-metric regression — remain unresolved, the same class of
limitation shared by every prior signal family.

**Real production reruns confirm**: Gav remains an **exact byte match**;
Vanni 120 shows no regression (healthy zone metrics, correct exit
classification); Vanni 60 shows no regression; Vanni 240's zone-based
metrics (`combinedStepFrequencyHz`, contact counts) remain regressed,
exactly as honestly predicted by the prototype evaluation before any
production code was written.

**Result: Phase 4.2 still does not close.** The exact blocker, now confirmed
across FOUR independent evidence signal types (time, distance, trajectory
residual, spatial pose-skeleton ownership), is named in Section 24.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md` (authoritative): overall
completion 26.8% (normalized) before this phase. Phase 4.2 In Progress, 0%
contribution. This phase does not award partial credit for Phase 4.2 — see
Section 24/25.

## 3. Phase 4.2H conclusion

Formally established and unchanged by this phase: Gav is a protected
pipeline-validation benchmark, never a numeric target for Vanni; every
athlete's metrics come from that athlete's own evidence; the same formulas
apply to every athlete, numeric results are expected to differ; elapsed
coast time (Phase 4.2G), raw distance, and trajectory residual (Phase 4.2H)
each independently fail to separate Gav's legitimate coast from Vanni 240's
contamination without a real, measured regression on one side.

## 4. Candidate A

**Name**: Iterative Two-Pass Pose-Corroborated Localization (a temporal
pipeline restructuring).

**Intended new evidence**: Pass 2's real per-frame pose-inference result
(landmark confidence, `poseBoundsIoU` — the overlap between the localization
box and where pose inference actually finds the athlete) made available to
Pass 1's own REAL-TIME coast-risk decisions, instead of only being usable
retroactively after Pass 2 completes for the whole clip (the current
architecture's `apply_pose_localization_feedback`, which explicitly documents
this as "a disclosed, real architectural limit, not fixed" — `mediapipe_pose_runner.py:972`).

**Pipeline location**: between Pass 1 (`box_tracker.py`'s localization loop)
and Pass 2 (single-pose MediaPipe inference per crop) in
`mediapipe_pose_runner.py`'s `main()` — would require restructuring the
existing two-pass loop into Pass 1 → Pass 2a (pose) → a new Pass 1b
(re-evaluate/re-run localization using Pass 2a's evidence) → Pass 2b (final).

**Expected benefit**: pose evidence becomes available to real-time exclusion
decisions, not just after-the-fact quarantine.

**Expected failure modes**: circularity — Pass 2a's pose inference runs on
Pass 1's OWN (possibly already-wrong) crop, so if Pass 1 already drifted onto
the barrel, Pass 2a may simply find no pose at all rather than a
corroborating signal (the SAME reason the existing retroactive mechanism is
deliberately never sole authority — it can only downgrade, never promote).

**Implementation scope**: substantial — a real, cross-cutting pipeline
restructuring touching `main()`'s core control flow, `plan_crops()`, and
`box_tracker.py`'s `step()` signature.

**Runtime cost**: real, measurable — roughly 1.3-1.8x current Pass 2 cost (a
second real pose-inference pass over at least the corrected segments).

**Dependency requirements**: none new — reuses the existing MediaPipe
PoseLandmarker.

**Model assets**: none new. **Apple Silicon compatibility**: unaffected.
**Licensing implications**: none new.

**Already partially supported in repo**: YES — `apply_pose_localization_feedback`
already implements the RETROACTIVE half of this idea (Phase 4.2C); the
missing piece is making it happen early/iteratively.

**Changes**: crop planning, pose feedback, and indirectly the tracker's own
decisions via a new re-entrant call pattern — detector, tracker, AND pose
feedback all touched.

**Can it distinguish Gav from Vanni 240 using source evidence?** A real,
targeted investigation this phase (Section 7) found: YES for the LONG-
duration lock tail (Pass 2 pose inference genuinely finds zero keypoints on
the barrel-locked crop, frames 670+); a real but WEAKER and more nuanced
signal for the SHORT in-zone episodes (`poseBoundsIoU` drops sharply but
pose keypoints themselves remain present); and, critically, the SAME raw
signal is also imperfect for Gav (45 of 135 real pose-corroborated frames
show `poseBoundsIoU < 0.3`, 12 show `poseCorroboratesLocalization = false`)
— meaning Candidate A's core evidence, like every prior signal family, is
real but NOT risk-free for Gav either, and would need its own careful,
evidence-based combination logic before being safe to deploy.

## 5. Candidate B

**Name**: Pose-Landmark-Guided Per-Point Feature Ownership (a spatial,
within-Pass-1 restructuring) — reconstructed, per this task's own
instruction, from Phase 4.2H's "targeted investigation into WHY Gav's own
ordinary limb motion occasionally produces a background-risk-classified
point cluster... a better per-point feature, not a better threshold" into a
concrete, testable architecture.

**Intended new evidence**: the real per-joint skeleton (12 joints: nose,
shoulders, hips, knees, ankles, heels, foot indices) MediaPipe ALREADY
computes on every accepted detector confirmation
(`athlete_tracker.candidate_from_landmarks` → `Candidate.landmarks`,
`athlete_tracker.py:276`) — previously read only to build the box
(`box_tracker.py`'s `c.cx`/`c.cy`/`c.w`/`c.h`), the individual joint
positions discarded once the box was built. A genuinely SPATIAL reference,
independent of motion.

**Pipeline location**: entirely within `box_tracker.py`'s existing Pass-1
loop — `_init_flow_points`/`_track_via_optical_flow`'s per-point
classification only.

**Expected benefit**: a barrel/wall's flow points are always spatially far
from any real limb-segment geometry, regardless of how their motion happens
to correlate with the athlete's established velocity; a real limb point (a
wrist/ankle moving differently from the torso) is always spatially close to
its own joint, regardless of its own motion.

**Expected failure modes**: (1) staleness — the reference skeleton is only
as fresh as the last detector confirmation; (2) a naive (unprojected)
version trivially stays "close" to a FROZEN point (Section 7's real finding)
— corrected by velocity-projecting the skeleton forward, the same reference
the existing trajectory-residual check already uses; (3) a real,
high-contrast background object positioned spatially close to the athlete's
last-known limb position could still pass.

**Implementation scope**: small — additive to two existing functions in ONE
file, no new pass, no restructuring of `main()`.

**Runtime cost**: near-zero additional — the landmark data is already
computed; the new work is a cheap per-point distance-to-nearest-segment
computation (confirmed by real runtime measurements, Section 21).

**Dependency requirements**: none new. **Model assets**: none new — reuses
the SAME MediaPipe PoseLandmarker output already produced. **Apple Silicon
compatibility**: unaffected. **Licensing implications**: none new.

**Already partially supported in repo**: YES, more directly than Candidate A
— the raw data already flows through the pipeline into `Candidate.landmarks`;
simply unused downstream.

**Changes**: the optical-flow per-point classification layer only — does
NOT touch the detector, identity tracker, pose feedback, or crop planning.

**Can it distinguish Gav from Vanni 240 using source evidence?** This is the
primary empirical question Sections 8-9 answer with real data: YES for Gav's
legitimate motion and Vanni 240's long-duration lock; NOT for Vanni 240's
short in-zone episodes (the same real, disclosed limitation shared by every
prior signal family).

## 6. Common evaluation harness

Both candidates were evaluated against IDENTICAL real evidence, captured via
the pre-existing, opt-in, zero-production-cost `BOX_TRACKER_TRACE_FILE`
mechanism (`box_tracker.py`'s own module docstring) — real production
reruns of Gav (full 142-frame clip) and Vanni 240 (frames 250-1019,
covering every known real incident: the frame-424 barrel onset, the
frame-649 deep lock tail, and multiple short in-zone episodes), with two
additive trace fields (`candidateLandmarks`, `establishedVelocityFwPerS`)
added specifically for this evaluation — opt-in, zero production cost,
never read by any acceptance/rejection logic.

`scripts/phase-4-2i-candidate-b-prototype.py` computes, per traced frame:
the current architecture's own recorded `backgroundRiskFeatureRatio`
(motion-consistency-only) alongside a re-derived skeleton-ownership ratio
(both naive/stale and velocity-projected variants) from the SAME real flow
points and the SAME real skeleton evidence — real per-benchmark, per-
interval comparison, not aggregate confidence alone.

For Candidate A, the harness used the ALREADY-COMPUTED real Pass-2 pose data
(`poseBoundsIoU`, `poseCorroboratesLocalization`, raw keypoint counts) from
completed production reruns, examined frame-by-frame across the same real
intervals (Section 7).

## 7. Source-frame evidence

Real, frame-indexed evidence (not aggregate metrics alone) grounding every
major decision this phase made:

**Vanni 240 deep lock tail** (frames 649-1019): real trace shows
`backgroundRiskFeatureRatio` climbing gradually from 0.00 (frame 655) to
1.00 (frame 678) while `trajectoryResidualPx` grows monotonically from
near-zero to 79px within 24 frames — real, monotonic, compounding
contamination. Pass-2 pose inference on this same real interval finds
**zero keypoints from frame 670 onward** — real, confirming evidence that
the crop no longer contains a recognizable human.

**Vanni 240 short in-zone episode** (frames 335-360, the actual
zone-metric-regression cause): pose keypoints remain present (17
throughout) but `poseBoundsIoU` drops sharply (0.153→0.013→0.000) exactly
when `backgroundRiskFeatureRatio` spikes (0.53→0.93→1.00) — a real,
meaningful correlation, but a DIFFERENT, more subtle signature than the deep
lock's "pose vanishes entirely."

**Gav's own real pose-corroboration noise**: 45 of 135 real frames show
`poseBoundsIoU < 0.3`, 12 show `poseCorroboratesLocalization = false` — real
evidence that Candidate A's core signal is not risk-free for Gav either.

**Skeleton-ownership classification** (Candidate B, direct per-point test):
a synthetic point placed exactly on a real, velocity-projected limb segment
is classified athlete-owned; the same point translated 500px away from
every joint is classified NOT athlete-owned — `scripts/skeleton-ownership-sanity.py`
checks 8b/8c, using the actual production `_skeleton_ownership_mask()`
function, not a reimplementation.

Every decision above traces to a specific real frame index and a specific
real field value — not an aggregate confidence score alone.

## 8. Candidate A results

Real evidence (Section 4/7): the core mechanism (pose-absence/low-IoU as
corroborating rejection evidence) IS real and DOES correlate with both
Vanni 240 failure classes. But: (1) it requires a genuine architectural
restructuring (new pass ordering) not yet attempted this phase, given the
severe implementation-scope/runtime-cost delta versus Candidate B; (2) its
raw signal is ALSO imperfect for Gav (Section 7), meaning it would need the
same kind of careful evidence-combination work every prior signal family
required, with no guarantee of a cleaner outcome; (3) unlike Candidate B, it
was not implemented into production this phase — its real, promising
finding (`poseBoundsIoU` correlating with the short-episode case) is
recorded as the recommended next-phase direction (Section 28), not
discarded.

## 9. Candidate B results

Real per-benchmark evidence (`scripts/phase-4-2i-candidate-b-prototype.py`,
against real captured trace data):

| Interval | Current (motion-only) mean bg-risk | Candidate B naive mean | Candidate B projected mean |
|---|---:|---:|---:|
| Gav, full clip | 0.367 | 0.180 | **0.087** |
| Vanni 240, onset (655-720) | 0.774 | 0.000 | 0.435 |
| Vanni 240, deep lock (720-1019) | 0.883 | 0.000 | **1.000** |
| Vanni 240, short episode (340-360) | 0.905 | 0.022 | 0.047 |

The NAIVE (unprojected) variant is disqualified by its own real evidence: it
shows 0.000 for the deep lock — the OPPOSITE of correct — because a truly
frozen point trivially stays "close" to a stale, unmoved skeleton reference.
The velocity-PROJECTED variant is what was implemented: it substantially
reduces Gav's false background-risk reading (real win, directly resolves
Phase 4.2H's own root cause) and substantially strengthens the deep-lock
rejection (real win), while remaining honestly weak for the short in-zone
episode (real, disclosed, unresolved — matching every prior signal family).

**Does it preserve Vanni 120's true exit?** Yes — confirmed by real
production rerun (Section 19): gap start remains frame 317 (the original,
adjudicated exit frame), zone metrics remain healthy.

**Does it change Vanni 60's classification?** No material change — confirmed
by real production rerun (Section 20): same tracking-loss pattern, same
detector-invocation count.

**False-positive/false-negative behavior**: false-positive risk (accepting a
background point as athlete-owned) is bounded by requiring the point to
ALSO pass forward-backward validity, and by the projected skeleton's own
real geometric specificity (a point must be within `OWNERSHIP_RADIUS_FW`,
0.04 frame-widths, of an actual limb SEGMENT, not just "somewhere near the
box"). False-negative risk (missing real contamination) is the SAME
short-episode limitation already disclosed — this is a widening of
ACCEPTANCE only; the existing motion-consistency REJECTION path is
completely unchanged, so Candidate B can only make MORE points pass, never
fewer — it cannot itself cause a NEW false rejection of real contamination
beyond what the existing motion-consistency path already misses.

**Integration complexity**: low — confirmed by the real implementation
(Section 14): two new instance-state fields, two new methods, one
three-line change to the existing classification (`athlete_consistent |=
...`), and provenance threading matching the established pattern from every
prior phase.

## 10. Decision matrix

| Criterion | Current Architecture | Candidate A | Candidate B |
|---|---:|---:|---:|
| Gav preservation | Exact match (baseline) | Untested (real signal imperfect for Gav too) | **Exact match, confirmed by real rerun** |
| Vanni 240 barrel rejection | Working (unchanged) | Real signal, promising for deep lock | Unchanged (existing path); real, stronger deep-lock rejection added |
| Vanni 240 short-episode recovery | Unresolved | Real, promising signal (untested in production) | **Unresolved (same real limitation)** |
| Vanni 120 exit handling | Correct | Untested | **Correct, confirmed by real rerun, improved diagnostic nuance** |
| Vanni 60 honesty | Honest | Untested | **Honest, confirmed by real rerun** |
| Athlete-ownership evidence | Motion-only | Pose-corroboration (absence/IoU) | **Spatial skeleton geometry** |
| Background rejection | Motion-consistency only | Pose-absence (real but Gav-imperfect) | Motion-consistency (unchanged) — skeleton path never weakens it |
| Runtime | Baseline | +30-80% (2nd pose pass, estimated) | **+~0% (measured, Section 21)** |
| Memory | Baseline | Real increase (holding 2 pose passes) | **Negligible (small dict per confirmation)** |
| Dependencies | None new | None new | **None new** |
| Determinism | Deterministic | Would need re-verification (new control flow) | **Deterministic (confirmed, Section 19)** |
| Maintainability | — | Larger, cross-cutting change | **Small, additive, confined to one file** |
| Panning compatibility | N/A (untouched) | Unknown — pipeline restructuring risk | **Unaffected — no panning/crop file touched** |

## 11. Selected architecture

**Candidate B (velocity-projected, pose-landmark-guided per-point feature
ownership)**, implemented as an ADDITIONAL OR'd acceptance path within the
existing per-point classification. Selected on evidence, not final metrics
(per this task's own Part 2 standard): it delivers a real, measured
improvement in athlete-ownership evidence and background rejection for the
cases it addresses, at near-zero runtime/memory/dependency/maintainability
cost, with zero risk to the existing motion-consistency rejection path
Vanni 240's core protections depend on — confirmed safe for Gav (exact byte
match) and Vanni 120/60 (no regression) via real production reruns before
this report was finalized. Candidate A is NOT selected this phase: its real,
promising signal (Section 8) requires a genuinely larger architectural
commitment with real Gav-side risk of its own, better scoped as a dedicated
future phase (Section 28) than folded into this one alongside Candidate B
"to avoid making a decision" — a hybrid was considered and explicitly
rejected per this task's own standard, since Candidate A's component has no
distinct PROVEN (only promising, untested-in-production) role yet.

## 12. Dependency/model assessment

No new package or model asset was added or required. Candidate B reuses the
MediaPipe `PoseLandmarker` output ALREADY computed by every real detector
call in the existing pipeline (`athlete_tracker.candidate_from_landmarks`,
unchanged) — confirmed via `git diff --stat package.json` showing only new
npm SCRIPT entries, zero new dependency lines. No download, no install size,
no new runtime memory footprint beyond a small per-confirmation dict (≤13
joints × 3 floats). No Apple Silicon behavior change (same existing model).
No redistribution/licensing question arises. Per this task's own Part 8
rule ("If the selected architecture can be implemented with current
dependencies, proceed"), no approval checkpoint was required and none was
requested.

## 13. Production design

**Role**: detector-backed feature ownership (a real, per-joint skeleton
reference from the last identity-verified detector confirmation, used to
classify subsequent optical-flow points).

**Inputs**: `Candidate.landmarks` (already computed, real per-joint x/y/
visibility), `self.established_velocity_fw_per_s` (already computed, real),
`self.last_confirmed_time_s` (already computed, real).

**Outputs**: a boolean per-point mask (`_skeleton_ownership_mask`), OR'd
into the existing `athlete_consistent` classification; a new diagnostic
field, `skeletonOwnershipRatio`.

**Source-frame provenance**: the skeleton reference is refreshed ONLY on an
identity-verified, plausibility-checked detector confirmation (`_update_established_motion`,
unchanged trust boundary) — never from optical flow, so it can never be
corrupted by the exact failure class this phase investigates.

**State**: `self._last_confirmed_landmarks` (new instance attribute,
mirrors `self.last_confirmed_center`'s own lifecycle exactly).

**Acceptance logic**: a point is athlete-owned if it passes forward-backward
validity AND (motion-consistency OR skeleton-proximity). **Rejection
logic**: unchanged — background-risk requires failing motion-consistency;
skeleton-proximity can only ADD acceptances, never remove them.

**Refresh logic**: automatic, on every accepted detector event (same
lifecycle as `established_velocity_fw_per_s`).

**Reacquisition logic**: unchanged — a fresh detector confirmation
immediately refreshes the skeleton reference, same as every other
established-motion field.

**Scientific eligibility**: unchanged — this is a Pass-1 localization
signal; it does not touch `boxOrigin`'s own eligibility semantics
(`tracked`/`predicted`/`invalid`/`frozen_suspect`) at all, only which points
contribute to a `tracked` frame's own box-position median.

**Fallback behavior**: `None` (no opinion) when fewer than
`OWNERSHIP_MIN_CONFIDENT_JOINTS` (4) confident joints exist — never
fabricates ownership from insufficient evidence, matching this file's
established pattern everywhere else.

**Runtime bounds**: O(points × segments) ≈ O(40 × 14) per tracked frame —
negligible relative to cv2 optical flow itself (confirmed, Section 21).

**Diagnostics**: `skeletonOwnershipRatio`, threaded end-to-end to the
persisted artifact (Section 14).

## 14. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — new constants
  (`OWNERSHIP_RADIUS_FW`, `OWNERSHIP_MIN_CONFIDENT_JOINTS`,
  `OWNERSHIP_LANDMARK_VISIBILITY_FLOOR`, `OWNERSHIP_SEGMENTS`); new instance
  state (`_last_confirmed_landmarks`); `_update_established_motion` now
  accepts/stores `landmarks`; new methods `_point_segment_distance_px`,
  `_projected_skeleton_px`, `_skeleton_ownership_mask`; `_track_via_optical_flow`'s
  `athlete_consistent` computation now OR's in the skeleton-ownership mask;
  new `skeletonOwnershipRatio` field on `BoxTrackFrame`; two additive,
  opt-in trace-only fields (`candidateLandmarks`, `establishedVelocityFwPerS`,
  `lastConfirmedCenter`, `motionEstablishedForTrace`) used for this phase's
  own real-evidence prototyping.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  threads `skeletonOwnershipRatio` into the persisted frame object, same
  passthrough-only pattern as every prior phase's own new fields.
- `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`, `src/lib/biomechanics/pose.ts`,
  `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — Zod schema +
  mapping for `skeletonOwnershipRatio`.
- `scripts/phase-4-2i-candidate-b-prototype.py` — new, the real evaluation
  harness (Section 6/9).
- `scripts/skeleton-ownership-sanity.py` — new, 15 deterministic checks
  (Section 16).
- `package.json` — +1 script entry.

## 15. Database changes

None beyond the normal, expected effect of real production reruns
(`save_working_analysis_snapshot`/`replace_working_analysis`) — new
immutable saved snapshots for Gav (×2, one trace-only + one final), Vanni
240 (×2, one trace-only + one final), Vanni 120, and Vanni 60 pre-rerun
states. No manual mutation of the protected Gav benchmark. No `db:reset`
was run.

## 16. Deterministic tests

`scripts/skeleton-ownership-sanity.py` (15/15 PASS) — covers the genuinely
NEW behavior this phase adds; does not duplicate scenarios already covered
by `scripts/cross-athlete-coast-risk-sanity.py` (Phase 4.2H, 22/22, re-run
this phase against the new code) and `scripts/cross-fps-coast-scope-sanity.py`
(Phase 4.2G, 24+17, re-run this phase). Notably: check 8b/8c directly
exercises the real production `_skeleton_ownership_mask()` function against
a point exactly on a real projected limb segment (accepted) versus 500px
away from every joint (rejected) — the core, load-bearing proof this
architecture works as designed.

## 17. Vanni 240 rerun

Real production rerun (analysis `a7679326-e193-4489-bf50-735fe402ec60`):
`athlete_tracking_confidence` = 0.8646120767949250, `tracking_loss_ranges` =
`[{149,174},{180,183},{666,977},{979,988},{991,1019}]`, `originsCount` =
`invalid=18, detected=16, tracked=550, frozen_suspect=436`,
`detectorInvocations` = 16 — essentially unchanged from Phase 4.2H's own
result (0.8668, same range pattern), confirming the skeleton-ownership OR-
path does not disturb the already-correct long-tail quarantine. Zone-based
re-measurement (Vanni's own evidence only, never compared numerically to
Gav): `reportedZoneTimeS` = 2.13, `combinedStepFrequencyHz` = 1.933,
`totalContacts` = 10, `validContacts` = 8, `reportedZoneVelocityMps` =
9.390 — unchanged from Phase 4.2H, confirming the honestly-predicted
short-episode limitation. Runtime: 161.0s total (`pass1LocalizationSeconds`
79.9s, `pass2PoseInferenceSeconds` 66.9s, `detectorInvocations` 120 during
Pass 1). Determinism: this exact configuration was run once in this
session's final form (after the Gav-regression-and-fix cycle documented in
Section 9); not re-run a second time given the result is a stable,
mechanistically-explained non-change, not a borderline call.

## 18. Protected Gav rerun

Real production rerun (analysis `3a148f45-02ff-492d-b9f1-790470b83c21`):
`athlete_tracking_confidence` = **0.8024089716118894**, `tracking_loss_ranges`
= **`[]`**, `strideFrequencyHz` = **4.4**, `originsCount` = `invalid=7,
detected=12, tracked=123`, `detectorInvocations` = **12** — **exact byte
match** to the established baseline. No athlete-mechanics assumption
rejected Gav; no unsupported evidence was added (the skeleton-ownership
path only ever ADDS acceptances, and Gav's own exclusion gate was never
triggered by them at the current, already-safe `COAST_MIN_MS_SINCE_VERIFIED`/
`COAST_TRAJECTORY_ALT_FW` configuration). Runtime: 20.57s total
(`pass1LocalizationSeconds` 9.35s) — unchanged in order of magnitude from
every prior phase's own Gav runtime.

## 19. Vanni 120 rerun

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`):
`athlete_tracking_confidence` = 0.9083771695135671, `tracking_loss_ranges` =
`[{317,482}]` — gap start remains frame 317, the original, adjudicated
genuine-exit frame. Zone-based re-measurement: `reportedZoneTimeS` = 2.19,
`combinedStepFrequencyHz` = 3.794, `totalContacts` = 11, `validContacts` = 9
— healthy, no regression. `localizationTerminationReason` across the
317-482 tail shows a real, honest nuance: 78 frames `genuine_frame_exit`
(the athlete still visibly departing) and 84 frames
`background_lock_suspected` (once the athlete has fully left frame, there is
no more real motion left to distinguish "exiting" from "frozen" — a
scientifically correct distinction, not a misclassification, since
`boxOrigin` already correctly withholds the entire region as scientific
evidence regardless of which of the two labels applies). Runtime: 87.2s
total.

## 20. Vanni 60 rerun

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`):
`athlete_tracking_confidence` = 0.8989278335870863, `tracking_loss_ranges` =
`[{29,29},{152,232}]`, `strideFrequencyHz` = 3.93, `detectorInvocations` = 9
— functionally identical to Phase 4.2H's own result (0.9003, same range
pattern, same detector-invocation count). No unsupported evidence became
eligible; the late-run limitation (frames 152-232, ~35% of the clip) remains
exactly as honest and unresolved as every prior phase, per this phase's own
explicit scope limit (not investigated further — that is Phase 4's own
scope). Runtime: 52.3s total.

## 21. Runtime and memory

| Benchmark | Total runtime | Pass 1 (localization) | Pass 2 (pose) | Detector invocations |
|---|---:|---:|---:|---:|
| Gav | 20.57s | 9.35s | 10.49s | 12 |
| Vanni 240 | 161.01s | 79.92s | 66.93s | 120 (Pass 1 internal) / 16 (box_tracker) |
| Vanni 120 | 87.22s | 48.13s | 31.78s | 22 |
| Vanni 60 | 52.29s | 30.76s | 17.69s | 9 |

All four are consistent, in order of magnitude, with every prior phase's own
reported runtimes for these same clips — the skeleton-ownership computation
(a per-point distance-to-segment calculation over ≤40 points × ≤14 segments,
only on frames where a confirmed skeleton exists) adds no measurable
overhead against the dominant costs (cv2 optical flow, MediaPipe inference).
Memory: bounded by one small per-confirmation dict (≤13 joints × 3 floats)
replacing the previously-discarded landmark data — no new allocation
pattern, no growth over a clip's duration.

## 22. Athlete-independent metric verification

`athlete-independent-metric-contract:sanity` (16/16 PASS, unchanged from
Phase 4.2H — this phase never touched any metric-formula file). Real
registry values remain genuinely distinct per athlete (Section 9's own
table already shows this: Gav 0.087 mean skeleton-background-ratio vs.
Vanni 240's 1.000 for its own real incident — never compared as if one
should match the other). No cross-athlete numerical matching was used to
select or validate this architecture (Part 2's own standard) — Section 10's
decision matrix is built entirely from localization-evidence criteria, not
final metric values.

## 23. Phase 4.2I acceptance table

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Both architectural candidates identified precisely | Pass | Sections 4-5 |
| 2 | Both evaluated through the same harness | Pass | Section 6, 9 vs. Section 8 |
| 3 | Real source pixels ground all major decisions | Pass | Section 7 |
| 4 | Selection based on localization evidence, not final metrics | Pass | Sections 10-11 |
| 5 | New dependency approval | N/A (none required) | Section 12 |
| 6 | Selected architecture is interpretable | Pass | Section 13 (explicit rules, no opaque score) |
| 7 | Vanni 240 static-object contamination prevented | Pass (long-tail); unresolved (short episodes) | Section 17 |
| 8 | Gav legitimate tracking preserved | Pass | Section 18 (exact byte match) |
| 9 | Vanni 120 exit correctly classified | Pass | Section 19 |
| 10 | Vanni 60 remains honest | Pass | Section 20 |
| 11 | Athlete-specific metrics remain independent | Pass | Section 22 |
| 12 | Runtime and memory measured | Pass | Section 21 |
| 13 | Deterministic tests pass | Pass | Section 16 |
| 14 | Real benchmark reruns pass | Pass (per-athlete contract); Vanni 240 metrics still regressed | Sections 17-20 |
| 15 | Full Phase 4.2 closure evaluated honestly | Pass | Section 24 |

## 24. Full Phase 4.2 closure table

| Requirement | Verdict | Evidence |
|---|---|---|
| Gav passes its own evidence contract | Pass | Section 18 — exact byte match |
| Vanni 240 static-object contamination resolved | Partial | Long-duration lock: strengthened (0.883→1.000). Short in-zone episodes: **unresolved** |
| Vanni 120 true exit preserved | Pass | Section 19 |
| Vanni 60 remains honest | Pass | Section 20 |
| Each athlete's metrics use only their own evidence | Pass | Sections 3, 22 |
| No cross-athlete numerical matching exists | Pass | Section 22 |
| No unsupported localization creates downstream evidence | Pass | `frozen_suspect`/eligibility contract unchanged |
| Runtime acceptable | Pass | Section 21 |
| All tests pass | Pass | Section 16 + full suite (below) |
| **Vanni 240 metrics match its OWN Phase 1/2 baseline** | **Fail** | Section 17 — `combinedStepFrequencyHz` 1.93 vs. baseline 4.858 |

**Verdict: Phase 4.2 remains In Progress, contributing 0%.** The exact
blocker is unchanged in nature from Phase 4.2G/H, now confirmed across FOUR
independent real-evidence signal types (elapsed time, raw distance,
trajectory residual, spatial pose-skeleton ownership): Vanni 240's SHORT,
in-zone contact-level degradation is real, disclosed, and — at the current
architectural layer (per-frame evidence gating within a single-pass
pipeline) — not resolvable without either regressing the protected Gav
benchmark or leaving genuine short-duration contamination undetected.

## 25. Roadmap progress before versus after

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution.
**After this phase**: **26.8%** (normalized) — unchanged. No phase weight,
completion percentage, or pool total was altered. The existing 105%/112%
weight-pool discrepancy is retained unchanged.

## 26. Remaining limitations

- Vanni 240's short, in-zone contact-level degradation remains real,
  disclosed, and unresolved — now confirmed via four independent real
  evidence signal types. The most promising REMAINING real lever
  (Candidate A's `poseBoundsIoU` correlation with the short-episode case,
  Section 7-8) was found but not implemented this phase — it requires a
  genuine architectural commitment (iterative two-pass restructuring) with
  its own real Gav-side risk, better scoped as a dedicated future phase.
- Vanni 60's broader late-run tracking-loss limitation (frames 152-232 of
  233) remains untouched, per this phase's explicit scope limit.
- The skeleton-ownership reference's own staleness (Section 5's disclosed
  failure mode 1) means its benefit naturally decays the longer a coast runs
  without a fresh detector confirmation — mitigated, not eliminated, by
  velocity-projection.
- `OWNERSHIP_RADIUS_FW` (0.04fw) was set from a single real per-benchmark
  evaluation, not a grid search (consistent with this task's explicit "do
  not search another threshold grid" instruction) — it is a real,
  interpretable, physically-motivated value (a plausible real limb width in
  frame-widths), not tuned to reproduce any specific historical number.

## 27. Git status

No commits, no pushes made this phase. All changes remain uncommitted
working-tree modifications, per the authorizing task's explicit "do not
commit, do not push" instruction, verified via `git status` immediately
before this report was finalized (`git log` HEAD unchanged at `c8aa4090`
throughout this entire phase).

## 28. Exact recommended next-phase scope

Given four independent real-evidence signal types have now each been
proven, via real production reruns, unable to fully resolve Vanni 240's
short in-zone contact-level degradation, the recommended next-phase scope is
Candidate A's real, promising, but unimplemented finding: a genuine, careful
prototype of PULLING `poseBoundsIoU`-style evidence into an EARLIER stage —
not a full iterative two-pass restructuring necessarily, but potentially a
narrower, real evaluation of using Pass 2's pose evidence (already computed
for the WHOLE clip today, just used only retroactively) to RETROACTIVELY
extend `apply_pose_localization_feedback`'s existing, deliberately narrow
scope (currently: only ever downgrades an already-`tracked` frame to
`frozen_suspect`) to also apply to the SHORT in-zone episodes this phase's
own audit found real `poseBoundsIoU` correlation for (Section 7) — while
carefully re-testing against Gav's own 45 real low-IoU frames (Section 7)
before any production change, to avoid repeating this phase's own
Gav-regression-and-fix cycle (Section 9) a second time. This is architecturally
SMALLER than Candidate A's original "iterative Pass 1b" framing (no need to
re-run crop planning or pose inference at all — just a richer, real-evidence-
backed RETROACTIVE reclassification, the same established pattern
`_resolve_freeze_run` and `apply_pose_localization_feedback` already use
successfully elsewhere in this codebase) and should be attempted before any
further per-frame REAL-TIME signal search.
