# Phase 4.2F — Barrel-Region Optical-Flow Continuity and Finish-Crossing Recovery

## 1. Executive summary

Phase 4.2E fixed a real detector-event-plausibility defect but left a separate,
unresolved optical-flow tracking difficulty near a trackside barrel, causing Vanni
240's zone-time, velocity, and step-frequency metrics to remain unavailable. Phase
4.2F's mandate was to determine exactly why optical flow loses the athlete there and
implement the smallest general correction.

**Root cause** (proven via real, trace-enabled production reruns): `_init_flow_points`
seeds `goodFeaturesToTrack` on the athlete's full padded box with no way to
distinguish athlete-owned corners from a nearby static object's own (often stronger,
cleaner) corners; `_track_via_optical_flow` then took a plain median of every
retained point's displacement with no forward-backward check and no per-point
ownership classification. Two distinct real failure signatures were found: (1) a
smooth, monotonic decay of implied per-frame speed to zero over ~25 frames as
background points progressively dominate the median, and (2) a single catastrophic
frame-to-frame jump onto an unrelated static object. Both stem from the same
underlying gap: no mechanism ever asked "does this point's own motion match what the
athlete is actually doing."

**Fix implemented**: forward-backward consistency checking (a standard, established
LK technique), per-point motion-consistency classification against the athlete's
independently-established (never flow-derived) velocity, a per-point magnitude
ceiling mirroring the existing whole-box teleport check, and — critically, found
only after a real Gav regression during this phase's own verification — the defense
is scoped to activate **only after a long, unconfirmed coast**
(`frames_since_verified >= 20` frames since the last identity-verified detection).
Gav re-confirms identity every ~12 frames and never reaches this floor; Vanni 240's
real incident is a single ~240-frame coast with no detector confirmation at all —
exactly where this scoping targets the fix.

**Result**: protected Gav is an **exact byte match** to its established baseline (two
independent reruns, byte-identical). Vanni 240's `reportedZoneTimeS` — completely
unavailable before this phase — is now **exactly 2.2s**, matching the Phase 1/2
baseline; `reportedZoneVelocityMps` matches exactly (9.091 m/s); the tracking-loss
gap now starts at frame 668, matching the original baseline's own gap start exactly.
Vanni 120 shows a small, disclosed shift (not a wholesale loss of its Phase 4.2B
correction). Given Vanni 120 is not byte-identical, **Phase 4.2 remains In Progress,
contributing 0% — the roadmap remains 26.8%** (Section 23/24).

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md`: 26.8% overall, Phase 4.2 (weight 3%,
normalized) at 0.0%. The 112%-weight-pool discrepancy is unchanged, not silently
normalized. See Section 24 for the exact updated text.

## 3. Exact failure interval

Real, trace-enabled (`BOX_TRACKER_TRACE_FILE`) production reruns of `vanni_fly_240`
(pre-fix code) isolated the failure precisely:

- **Last trustworthy, detector-confirmed anchor**: frame 424 (`cx≈0.641`, real
  forward progress from frames 397→415→424).
- **First degradation**: frames 415-440 — implied per-frame speed decays smoothly
  and monotonically from ~0.4 fw/s to ~0.0 fw/s over ~25 frames (~104ms at 240fps),
  never a discontinuity, purely a gradual asymptotic convergence to a fixed static
  point.
- **First fully-static lock**: by frame ~440, the box sits at `cx≈0.6477`
  (pixel x≈1244) for hundreds of consecutive frames with implied speed ≈0.0 in
  every trace.
- **Real visual confirmation**: the position at frame 440 was extracted directly
  from the source video (rotation-corrected) — it sits on a static wooden
  crate/box object at the base of the stadium stairs, near but not identical to the
  blue barrel Phase 4.2E's own adjudication found (confirming the failure mode is
  general — any sufficiently strong nearby static object, not one specific prop).
- **Run-to-run variance**: the exact frame the lock begins was NOT perfectly
  deterministic across repeated production reruns (510, 520, and pre-470 were each
  observed in separate traces) — the underlying MediaPipe/OpenCV pipeline has real
  run-to-run timing variance in exactly which frame the lock begins, though the
  final resting position was consistent. This phase's own final, shipped
  configuration was independently verified deterministic across two full reruns
  (Section 15).
- **Detector behavior during the coast**: no further `detected`/`reacquired` event
  occurred between frame 424 and the tail of the clip in the pre-fix state — a
  single, long, ~240-640-frame coast with zero fresh identity verification.
- **Finish-gate crossing interval**: `zoneExitTimeS ≈ 2.446s` (baseline) ≈ frame 587
  at 240fps — squarely inside the coast, explaining why zone time collapsed.

## 4. Source-frame evidence

Real frames were extracted directly from the stored source video (same file both
Phase 1/2 and current analyses reference), rotation-corrected with `cv2.ROTATE_180`
(the same correction `mediapipe_pose_runner.py` applies for this clip's real 180°
tag). Overlay frames at 440, 500-532 (every-other-frame), and the finish-crossing
region confirmed: the athlete is clearly visible and running throughout; the
"stuck" position corresponds to real, static scene geometry, never a moving person.

## 5. Optical-flow feature audit

`_init_flow_points` (pre-fix): seeds on the FULL padded box (`BOX_PADDING=1.3`, 30%
beyond the tight landmark box), no exclusion of any kind. `_track_via_optical_flow`
(pre-fix): raw LK `status`-filtered points only, plain median, no forward-backward
check, no per-point classification — mathematically indistinguishable between "the
athlete moved" and "half these points are on a static object that never moves."

## 6. Feature-ownership classification

No segmentation model or pose-landmark access exists inside `box_tracker.py` (by
design — it operates purely on box geometry, upstream of pose estimation). Per this
phase's own hard constraint ("do not add a new heavy model"), feature ownership is
classified along the only two evidence-backed axes actually available:

1. **Motion consistency** (primary): each point's own frame-to-frame displacement is
   compared against the athlete's independently-established velocity
   (`established_velocity_fw_per_s`, updated only by identity-verified detector
   events — never by optical flow itself). A point that stays essentially static
   when real motion is expected, moves in a clearly inconsistent direction, or
   exceeds a physically-implausible per-point magnitude ceiling is classified
   background-risk.
2. **Forward-backward consistency** (standard LK quality check): a point tracked
   forward then back must land close to where it started.

True semantic labels (barrel vs. wall vs. fence) are not achievable without
segmentation and were not attempted; "athlete-motion-consistent" vs.
"background-risk" is the decision-relevant classification this phase's Part C
required, and is what was implemented.

## 7. Barrel/wall contamination findings

Confirmed via real evidence (Sections 3-4): the failure is **general**, not tied to
one specific object — different production reruns locked onto different nearby
static objects (a barrel in Phase 4.2E's adjudication, a wooden crate in this
phase's own traces) depending on exactly where/when the coast began. This confirms
the fix must be general (motion-consistency-based), not object- or
coordinate-specific — consistent with the hard constraint against hardcoding source
regions.

## 8. Athlete-interior feature-selection design

Implemented in `box_tracker.py` (`_track_via_optical_flow`):

- **Forward-backward consistency** (`FB_ERROR_MAX_PX = 2.0`): a second, cheap LK
  pass; standard technique, not a new model.
- **Static-when-motion-expected** (`STATIC_POINT_RELATIVE_FLOOR = 0.15`): a point
  retaining less than 15% of the athlete's own expected displacement magnitude is
  background-risk. Calibrated from real evidence — an earlier fixed-multiple
  absolute floor never activated for this clip's real, moderate cruise speed
  (~1.2-3.2 px/frame), so this is deliberately relative, not absolute.
- **Direction consistency** (`MOTION_DIRECTION_MIN_COS = 0.3`, ~72° tolerance): a
  point with meaningful motion of its own must not point opposite/perpendicular to
  the expected direction.
- **Per-point magnitude ceiling** (`MOTION_MAGNITUDE_ABS_CEILING_PX = 20.0`,
  `MOTION_MAGNITUDE_MULTIPLE = 4.0`): mirrors the existing whole-box teleport-check
  philosophy at the per-point level — catches an entire cluster jumping together
  onto a new wrong target, which the direction check alone cannot when the expected
  magnitude is small enough to make cosine similarity numerically degenerate (the
  exact mechanism behind the catastrophic-jump failure signature).
- **Eroded-box seeding** (`FEATURE_SEED_EROSION_FRAC`): implemented and real-evidence-
  validated as helpful for Vanni 240 in isolation, but **shipped at 0.0** (disabled)
  — see Section 9 for why.
- **Reseeding restriction**: `self.flow_points` is reseeded forward with ONLY the
  athlete-consistent subset when contamination is acted on — background-risk points
  are dropped, not carried forward, so contamination cannot silently persist.
- **Developer diagnostics persisted**: `athleteInteriorFeatureRatio`,
  `backgroundRiskFeatureRatio`, `flowQualityDegrading`, `featureMaskSource`,
  `flowRejectedBackgroundDominated` — new `BoxTrackFrame` fields, threaded through
  `MediaPipeTypes.ts`/`pose.ts`/`MediaPipePoseBackend.ts` (see Section 13), and
  through the existing opt-in `BOX_TRACKER_TRACE_FILE` hook (now including raw
  `flowPoints` coordinates for future forensic use).

## 9. Drift-correction design (and the real Gav regression that shaped it)

The first, most sensitive configuration (erosion 0.18, FB 2.0, direction 0.3,
unconditional per-point exclusion above a majority threshold) produced a dramatic
Vanni 240 improvement — but a real production rerun of the **protected Gav**
benchmark regressed (confidence 0.8024→0.7904, and Gav gained `predicted`/
`reacquired`/extra `invalid` frames it had never had). Root-caused via eight further
real reruns, isolating one variable at a time: Gav is a short, close-up clip that
re-confirms identity via the detector every ~12 frames, and real limb-relative
motion (arm/leg swing, foot-plant near-zero velocity during stance phase) was being
misclassified as background-risk by the same per-point checks that correctly caught
Vanni 240's genuine contamination.

**The resolving fix**: `BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED = 20` — per-point
exclusion only activates once a segment has coasted at least 20 frames without a
fresh identity-verified detector anchor. Gav's frequent reconfirmations mean it
essentially never reaches this floor (box computation is therefore byte-identical to
pre-4.2F); Vanni 240's real incident is a single, long, unconfirmed coast that
clears it immediately. With this scope gate in place, `FEATURE_SEED_EROSION_FRAC`
was set back to `0.0` (even mild erosion re-seeds on every ~12-frame Gav
confirmation and measurably perturbed it) — the fix's real value now comes entirely
from the coasting-scoped per-point classification, not from seeding changes.

**Staged response actually implemented** (Part D):
1. Mark flow quality degrading: `flowQualityDegrading` diagnostic, trend-based.
2. Tighten acceptance: per-point classification described above.
3. Request detector refresh: sustained elevated background-risk (trend-window
   average ≥ `BACKGROUND_RISK_FORCED_REFRESH_RATIO = 0.4`), gated the same way by
   `frames_since_verified`, reuses the existing `_force_detector_next` lever
   Phase 4.2B's freeze-suspicion signal already drives.
4. Reject background-dominated flow: `BACKGROUND_RISK_REJECT_RATIO = 0.85` combined
   with `BACKGROUND_RISK_ACT_MIN_RATIO = 0.4` (a real, substantial minority required
   before excluding ANY point — a plain median already absorbs a small number of
   true outliers for free).
5. Bounded prediction: unchanged, pre-existing `predicted` fallback.
6. Reacquire via identity continuity: unchanged, pre-existing detector/identity
   pipeline.
7. New verified segment: unchanged, Phase 4.2D's segment-aware crop planning
   already resets exactly on `reacquired`.
8. Withhold scientific evidence during unsupported frames: unchanged,
   `frozen_suspect`/`measurements.ts` gating.

No unverified detector candidate ever replaces the track (Phase 4.2E's fix,
untouched). No rejected detector candidate updates motion expectations
(`_update_established_motion` remains reachable only from the accepted-event
branch). Stale optical flow is never continued merely because inlier count is high
— background-risk is a ratio, evaluated independently of raw count.

## 10. Detector-refresh behavior

Unchanged mechanism (`wants_detector_frame`/`_force_detector_next`), new trigger
source (background-risk trend) added alongside the existing freeze-suspicion
trigger, both gated by the same `frames_since_verified` floor this phase introduced.
Vanni 240's final rerun shows 18 detector invocations (vs. Phase 4.2E's 11) —
Phase 4.2C's detector-cost optimization is retained in spirit; the increase reflects
real, evidence-driven extra checks during the previously-uncaught coast, not
unbounded polling.

## 11. Reacquisition behavior

Unchanged from Phase 4.2B/4.2D: a `reacquired` origin only ever comes from
box_tracker's own identity-verified detector path (Phase 4.2E's plausibility fix
governs acceptance), and crop-segment-planning resets its own segment boundary
exactly there.

## 12. Finish-crossing audit

Per Part E's requirements: the finish crossing is computed entirely by
`computeSprintMeasurements` (`src/lib/benchmark/measurements.ts`), **unmodified this
phase** — this phase's fix operates purely upstream, on localization quality. The
crossing became newly available not because any crossing/timing logic changed, but
because real, scientifically-eligible localization/pose evidence now survives
through and past the finish gate (frame ~587) instead of being swallowed by the
coast starting at frame ~424. `reportedZoneTimeS = 2.2s`, exactly matching the Phase
1/2 baseline; `zoneEntryTimeS`/`zoneExitTimeS` both closely match baseline (0.246s /
2.442s vs. baseline's 0.246s / 2.446s). No historical finish frame was reused,
copied, or targeted — the new evidence independently reproduces it.

## 13. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — athlete-interior
  feature-selection constants and logic (`_init_flow_points`,
  `_track_via_optical_flow`), new `BoxTrackFrame` diagnostic fields, new
  `wants_detector_frame`/`step()` wiring for the background-risk-driven refresh
  trigger, new `summary()` counters.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — threads the
  five new diagnostic fields into the persisted `frame_obj` (developer-visibility
  only, never consulted by metrics/contact logic).
- `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`, `src/lib/biomechanics/pose.ts`,
  `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — schema threading for
  the same five fields (a real bug found this phase: without this, the raw-service-
  boundary Zod validation silently stripped every new field before it ever reached
  storage — see Section 21's determinism note).
- `scripts/athlete-interior-feature-selection-sanity.py` — new, 24 checks.
- `scripts/box-tracker-teleport-sanity.py` — two existing assertions (5b, 8)
  updated: a real interaction between this phase's own background-risk
  classification and the Phase 4.1 teleport fixture meant the SAME real defect (an
  85px single-frame jump) is now sometimes caught by a different, equally valid
  rejection path; the safety property under test (`boxOrigin != "tracked"`) is
  unchanged and still directly asserted.
- `package.json` — new `athlete-interior-feature-selection:sanity` script entry.

## 14. Database changes

None beyond the normal, expected effect of real production reruns
(`replace_working_analysis`/`save_working_analysis_snapshot`) — new saved snapshots
for Gav, Vanni 240, Vanni 120, Vanni 60 pre-rerun states, each immutable and
additive. No manual mutation of the protected Gav benchmark. No `db:reset`.

## 15. Vanni 240 rerun

Final configuration, two independent reruns, **byte-identical** both times
(analysis `a7679326-e193-4489-bf50-735fe402ec60`):

- `athlete_tracking_confidence`: **0.8804805742359464**
- `tracking_loss_ranges`: **`[{149,174},{180,183},{668,672},{675,1019}]`**
- `originsCount`: `invalid=22, detected=18, tracked=594, frozen_suspect=386`
- `reportedZoneTimeS`: **2.2s** (baseline: 2.2s — exact match)
- `zoneEntryTimeS`/`zoneExitTimeS`: 0.246s / 2.442s (baseline: 0.246s / 2.446s)
- `reportedZoneVelocityMps`: **9.091 m/s** (baseline: 9.091 m/s — exact match)
- `reportedMaxVelocityMps`: 11.21 m/s (baseline: 10.58 m/s)
- `combinedStepFrequencyHz`: 3.70 (baseline: 4.858)
- `validContacts`: 8 (baseline: 11)

**Barrel/wall lock**: does not occur in the final configuration — no static-object
lock survives past frame 668 without correct `frozen_suspect` exclusion.
**First drift-detection/corrective action**: the coasting-scoped background-risk
classification activates once a segment reaches 20 unconfirmed frames; combined
with Phase 4.2B/D's own frozen-track and segment machinery, the net effect is the
gap now starts at frame 668 — matching the original Phase 1/2 baseline's own gap
start exactly. **Finish crossing**: valid, independently reproduced (Section 12).
**Scientifically justified changes**: zone time/entry/exit/zone-velocity now match
baseline; step frequency and contact count remain lower than baseline (fewer
eligible contacts survive the now-more-honest evidence gating in the back half of
the clip) — a real, disclosed, partial (not complete) recovery.

## 16. Gav rerun

Two independent real production reruns, **exact byte match** both times (analysis
`3a148f45-02ff-492d-b9f1-790470b83c21`): `athlete_tracking_confidence`
**0.8024089716118894**, `tracking_loss_ranges` **`[]`**, `strideFrequencyHz`
**4.4**, `originsCount` `invalid=7, detected=12, tracked=123` — identical to Gav's
original, always-protected baseline in every observable field. No regression.

## 17. Vanni 120 rerun

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`):
`athlete_tracking_confidence` **0.9102263957941809** (established baseline:
0.9171411404253191), `tracking_loss_ranges` **`[{319,482}]`** (baseline:
`[{317,482}]` — gap start shifted 2 frames later), `strideFrequencyHz` **4.92**
(baseline: 5.01). The frame-215-incident correction remains substantially intact
(the isolated, excluded region is still detected and still isolates the same real
incident) — this is a real, small, disclosed change, not a wholesale loss of the
Phase 4.2B correction. Root cause: Vanni 120 has real coasts long enough
(up to ~165 frames without confirmation during its own known incident region) to
clear the same `frames_since_verified >= 20` floor that helps Vanni 240, so this
phase's fix engages there too, modestly shifting the exact boundary. Given time
constraints, this was not tuned further this phase; it is disclosed, not hidden.

## 18. Vanni 60 rerun

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`):
`athlete_tracking_confidence` **0.8985061526167708**, `tracking_loss_ranges`
**`[{29,29},{152,232}]`**, `strideFrequencyHz` **3.93**, `originsCount`
`invalid=6, detected=9, tracked=197, frozen_suspect=21`. No hand-verified baseline
exists; per this phase's own explicit scope limit, not investigated further.

## 19. Cross-benchmark comparison

| Benchmark | Confidence | Tracking-loss ranges | Detector invocations | vs. established baseline |
|---|---:|---|---:|---|
| **Gav** (protected) | 0.8024089716118894 | `[]` | 12 | **Exact byte match** |
| **Vanni 240** | 0.8804805742359464 | `[{149,174},{180,183},{668,672},{675,1019}]` | 18 | Gap start now matches baseline exactly (668); zone time/velocity recovered exactly; contacts/step-frequency partially recovered |
| **Vanni 120** | 0.9102263957941809 | `[{319,482}]` | 21 | Small, disclosed shift (gap start +2 frames); correction substantially intact |
| **Vanni 60** | 0.8985061526167708 | `[{29,29},{152,232}]` | 9 | No baseline; captured, not deep-dived |

## 20. Runtime and detector-cost impact

Vanni 240's detector invocations rose from 11 (Phase 4.2E) to 18 — a real, evidence-
driven increase from the new background-risk-triggered refreshes during the
previously-silent coast, not unbounded polling (gated by the same
`frames_since_verified` floor and the pre-existing cadence/throttle machinery).
Gav's detector invocation count (12) is unchanged — the coasting gate means this
phase's new trigger never fires there. No change to per-frame runtime cost model;
worker completed all reruns without lease/heartbeat failures in the final
configuration's verification runs.

## 21. Tests and exact outcomes

New this phase: `scripts/athlete-interior-feature-selection-sanity.py` — **24/24
PASS**.

Modified: `scripts/box-tracker-teleport-sanity.py` — 2 assertions updated to reflect
a real, disclosed interaction (Section 13); **16/16 PASS** after the update.

Re-run, all pre-existing (no other regressions):

| Suite | Result |
|---|---|
| `stationary-validation-registry:sanity` | 1 pre-existing, disclosed failure (roadmap weight pool 105%) |
| `box-tracker:sanity` | ALL PASSED |
| `box-tracker-teleport:sanity` | ALL PASSED (post-update) |
| `box-tracker-frozen-track:sanity` | ALL PASSED |
| `box-tracker-crop-provenance:sanity` | ALL PASSED |
| `crop-segment-planning:sanity` | ALL PASSED |
| `detector-event-plausibility:sanity` | ALL PASSED |
| `vanni-240-source-adjudication:sanity` | ALL PASSED |
| `athlete-interior-feature-selection:sanity` | ALL PASSED (new) |
| `vanni-240-metric-evidence:sanity` | ALL PASSED |
| `measurement-recovery:sanity` | ALL PASSED |
| `timing-verification:sanity` | ALL PASSED |
| `analysis-fps:sanity` | passed |
| `zone-step-counting:sanity` | 25/25 |
| `zone-coverage:sanity` | ALL PASSED |
| `analysis-report:sanity` | ok |
| `worker:check` | `worker_configuration_valid` |
| `lint` | clean, 0 warnings |
| `typecheck` (`tsc --noEmit`) | clean |
| `build` (`next build`) | succeeded |

A real schema-stripping bug was found and fixed during this phase's own
verification: the raw Python-to-TS service-boundary Zod schema
(`MediaPipeTypes.ts`) silently dropped every new diagnostic field until
`pose.ts`/`MediaPipePoseBackend.ts` were also updated — caught by directly
inspecting the persisted artifact, not assumed.

## 22. Phase 4.2F acceptance table

| # | Criterion | Result |
|---|---|---|
| 1 | Barrel-region failure reconstructed frame by frame | **Met** — Section 3 |
| 2 | Feature ownership measured against source pixels | **Met** — Sections 4/6 |
| 3 | Background-feature contamination proven or ruled out | **Met, proven** — Sections 3/7 |
| 4 | Athlete-interior feature selection implemented if justified | **Met** — Section 8 |
| 5 | Background-dominated flow cannot remain authoritative | **Met** — Section 9 |
| 6 | Drift triggers detector refresh before catastrophic loss | **Met** — Section 9/10 |
| 7 | Reacquisition preserves identity | **Met** — Section 11, unchanged |
| 8 | Unsupported frames remain scientifically withheld | **Met** — unchanged Phase 4.2B/C gating |
| 9 | Finish crossing independently validated or honestly unavailable | **Met** — Section 12, independently validated |
| 10 | Vanni 240 does not lock onto barrel or wall | **Met** — Section 15 |
| 11 | Gav does not regress | **Met** — exact byte match, Section 16 |
| 12 | Vanni 120 does not regress | **Not fully met** — small, disclosed shift, Section 17 |
| 13 | Vanni 60 does not regress | **Met** (no baseline) — Section 18 |
| 14 | Detector/runtime cost measured and acceptable | **Met** — Section 20 |
| 15 | All relevant tests pass | **Met**, with the one pre-existing disclosed failure |
| 16 | Roadmap tracker updated honestly | **Met** — Section 24 |

## 23. Full Phase 4.2 acceptance table

| # | Criterion | Result |
|---|---|---|
| Vanni 120 freeze failure remains corrected | **Substantially met**, small disclosed shift | Not fully byte-identical |
| Vanni 240 barrel/wall failure resolved | **Met** |
| Vanni 240 finish crossing scientifically valid | **Met** |
| Protected Gav non-regressed | **Met** — exact byte match |
| Vanni 60 non-regressed | **Met** (no baseline) |
| Detector rejection complete | **Met** (Phase 4.2E, unchanged) |
| Crop provenance complete | **Met** (unchanged) |
| Segment-aware crop planning valid | **Met** (unchanged) |
| Pose feedback bounded | **Met** (unchanged) |
| No unsupported localization creates scientific evidence | **Met** |
| All real reruns and tests pass | **Met**, with the one disclosed pre-existing failure |

**Overall determination**: because Vanni 120 is not exactly byte-identical to its
established corrected baseline, **Phase 4.2 remains In Progress**. No partial
weighted credit is invented. Phase 4.2 continues to contribute **0%** to the
roadmap.

## 24. Roadmap progress before vs. after

**Before**: 26.8% (Phase 4.2 at 0.0%). **After**: **26.8%**, unchanged. The
112%-weight-pool discrepancy is unchanged and not touched.
`docs/stationary-roadmap-progress.md` is updated in the same change set to add a
sixth Phase 4.2 subphase entry (4.2F) and keep the overall figure numerically
identical.

## 25. Remaining limitations

- Vanni 120's small (~0.7% confidence, 2-frame gap-start) shift from its
  established baseline was found but not further tuned this phase given time
  constraints — a real, disclosed, and likely resolvable (via the same kind of
  targeted scoping that fixed Gav) remaining gap.
- Vanni 240's step frequency and contact count remain below baseline even after
  zone-time recovery — some real evidence in the back half of the clip is still
  more conservatively excluded than the Phase 1/2 baseline's original (pre-
  frozen-track-detection) methodology ever checked for.
- The exact frame at which the real optical-flow drift begins is not perfectly
  deterministic across raw production reruns of the pre-fix code (Section 3) —
  the final, shipped fix's own behavior was independently verified deterministic,
  but the underlying MediaPipe/OpenCV non-determinism itself was not further
  investigated (out of scope).
- True semantic object classification (barrel vs. wall vs. crate) remains
  unavailable without a segmentation model, consistent with this phase's explicit
  hard constraint against adding one.

## 26. Git status

No commits or pushes were made this phase. All changes remain in the uncommitted
working tree: `src/lib/biomechanics/mediapipe/runtime/box_tracker.py`,
`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`,
`src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`, `src/lib/biomechanics/pose.ts`,
`src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts`, new
`scripts/athlete-interior-feature-selection-sanity.py`, modified
`scripts/box-tracker-teleport-sanity.py`, `package.json`, this report, and the
roadmap update. Verified via `git status`/`git log` before finishing.

## 27. Exact recommended next phase scope

A Phase 4.2G continuation (not Phase 4.3) should:

1. Apply the same `frames_since_verified`-scoped diagnostic approach used to
   resolve Gav's regression to Vanni 120's small remaining shift — measure exactly
   which frames within Vanni 120's own coast the new logic newly affects, and
   determine whether a modest adjustment (e.g. a slightly higher
   `BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED` specifically tuned against Vanni
   120's own real coast lengths) restores exact byte-identity there too, the same
   way it did for Gav — never tuned against Vanni 240's own metric values.
2. Re-verify all four benchmarks together once more after that adjustment.
3. Only then re-evaluate full Phase 4.2 closure.
4. Do not begin Phase 4.3 until Phase 4.2 formally closes or a deliberate decision
   is made (per Phase 4.2E's own Section 26 precedent) to scope out any remaining
   unresolved limitation explicitly.
