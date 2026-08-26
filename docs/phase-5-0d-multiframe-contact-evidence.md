# Phase 5.0D — Multi-Frame Contact Evidence and Lower-Limb Temporal Continuity

## 1. Executive summary

This phase set out to test one hypothesis: that AVA's contact detector makes
touchdown/toe-off decisions too locally (isolated-frame, isolated-landmark),
and that a bounded, multi-frame lower-limb evidence window could recover
real contact evidence current per-frame gating silently drops.

**That hypothesis is not supported by real data.** Parts A-D traced the
actual pipeline (`detectStepMarks`/`detectContactPhases`/`buildFullRunEvents`,
`src/lib/video/steps.ts`/`contacts.ts`/`events.ts`) and audited real,
per-landmark (ankle/heel/toe) trajectories from the current production pose
artifacts for all four benchmarks. Two decisive, real findings:

1. **Partial (1-2 of 3) foot-landmark configurations are already vanishingly
   rare** — 0 of 284 foot-samples on Gav, 10 of 2040 on Vanni 240 (0.49%), 1
   of 966 on Vanni 120 (0.10%), 2 of 466 on Vanni 60 (0.43%). MediaPipe, in
   this real pipeline, behaves close to a binary per-frame detector for the
   foot region: it finds all three joints together, or none at all. The
   existing `footSample()`/`footY()` fusion (`steps.ts`/`contacts.ts`) already
   averages whatever subset clears the 0.4 visibility floor — it does **not**
   require all three landmarks on one frame, and never has. There is very
   little partial-landmark population for a new evidence-fusion mechanism to
   safely act on.
2. **The one real near-threshold population found (34-36 frames on Vanni
   240, frames 493-527) is a single, already-known MediaPipe confidence-decay
   tail** — a monotonic fade from ~0.37 to ~0.015 visibility over 142ms,
   overlapping exactly the deep-lock-tail localization-degradation window
   Phase 4.2/5.0B/5.0C already documented. This is the temporal-filter
   signature of tracking being LOST, not a real touchdown obscured by a
   strict threshold — using it would reproduce exactly the false-positive
   class Phase 5.0C's Part A already found and excluded (`crop_shift_artifact`).

So Outcome A holds for candidate generation: no new secondary evidence-fusion
mechanism is implemented (Part I's own explicit branch — implement only if
A-H prove real evidence is being lost; it is not). **Outcome D holds for one
specific, real, previously-disclosed defect**: `summariseContactFlight()`
(`contacts.ts`) computed flight between two time-adjacent `ContactPhase`s
with no same-foot or missing-intermediate-contact guard — the exact gap
Phase 3 disclosed and left unfixed (`docs/phase-3-vanni-120-contact-recovery-report.md`
Section 10, a real `flightLeftMs: 20ms` observation). Re-proven this phase
on real, current production data across **three of four benchmarks** (Vanni
240, Vanni 120, Vanni 60 all have same-foot-adjacent phase pairs in their
real contact sequences; Gav does not), where the same defect **inflates**
flight time 40-75% by silently merging two real steps' worth of evidence
into one interval. Fixed with the smallest correct change: a same-foot /
excessive-duration guard mirroring `stepIntegrity.ts`'s own already-proven
Day 103 guard for step length. Real production reruns of all four
benchmarks confirm the fix corrects exactly the affected field
(`flightLeftMs`/`flightRightMs`/`flightCombinedMs`) and nothing else —
contacts, step frequency, zone time, step length, and ground-contact time
are byte-identical before/after on all four benchmarks.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md` (authoritative): overall
completion 26.8% (normalized). Phase 4.2 remains In Progress, 0%
contribution. Phase 5.0A/5.0B/5.0C are complete but carry no defined roadmap
weight. Per this task's explicit instruction, **no roadmap credit is
invented for Phase 5.0D** — Section 23 records status/evidence only, without
altering the weighted percentage.

## 3. Current contact architecture (Part A)

Real pipeline, traced by direct code reading (no reimplementation):

```
pose frame (worker artifact keypoints, per-joint x/y/visibility)
  -> OverlayFrame (loadOverlayFrames.ts -> overlay.ts:buildOverlayFrames,
     positional MediaPipe-index mapping)
  -> boxOrigin strip gate (measurements.ts:computeSprintMeasurements,
     "predicted"/"invalid"/"frozen_suspect" -> landmarks={})
  -> STAGE 1 (calibration-independent): buildFullRunEvents(frames)
       -> detectStepMarks(frames)   [steps.ts]
            - per foot, per frame: footSample() averages whichever of
              {ankle, heel, toe} clears minVisibility (0.4); NOT all-3-required
            - smoothSeries() (3-frame moving average, NaN-tolerant: a single
              missing frame is silently bridged if a neighbour within the
              half-window is finite)
            - findLocalMaxima() / boundaryAwareMaxima() on the smoothed
              per-foot y-series (image-y grows downward -> local maxima =
              lowest point = ground contact)
            - per-side minSameSideSpacingMs (250ms) suppression, then
              suppressDuplicates() (cross-side minStepSpacingMs, 130ms)
       -> detectContactPhases(frames, marks)   [contacts.ts]
            - per accepted mark, expand a "contact band" around the peak
              (contactReleaseFraction=0.13 of the GLOBAL per-side amplitude)
            - sub-frame interpolate touchdown/toe-off from REAL frame.time
              values (source timestamps, never index/fps)
  -> STAGE 2 (measurements.ts): zone restriction
       - simple two-point zone (points-based) or canonical world-anchored
         zoneStepSummary (analyzeZoneSteps, zoneStepAnalysis.ts) when gates
         are configured
       - stepIntegrity.ts:evaluateStepInterval guards STEP LENGTH against
         same-foot adjacency / excessive gaps (Day 103) for both the legacy
         two-point path and the canonical interval path
       - summariseContactFlight(contactPhases) [contacts.ts] computes GCT +
         flight; canonical path OVERRIDES this with a per-interval,
         per-contact-id-anchored recomputation restricted to "full_event"
         contacts/flights (already safe); the legacy/initial call was NOT
         similarly guarded (Section 11)
```

Per-stage evidence (required fields):

| Stage | Module/function | Required landmarks | Optional | Threshold | Source-time use | Gap handling |
|---|---|---|---|---|---|---|
| Foot sample | `footSample`/`footY` | none — averages whichever of ankle/heel/toe is present | all 3 | visibility ≥ 0.4 | — | a frame with zero visible foot joints contributes `NaN`, not a fabricated position |
| Smoothing | `smoothSeries` | — | — | 3-frame window | — | bridges 1-frame `NaN` gaps via a finite neighbour; ≥2-frame gaps stay `NaN` |
| Peak detection | `findLocalMaxima`/`boundaryAwareMaxima` | 3 consecutive finite smoothed samples (or a finite-then-rising boundary sample) | — | — | uses `frames[i].time` for the mark's `time` field | a peak inside a ≥2-frame all-missing gap is structurally undetectable — correctly unavailable, never invented |
| Phase measurement | `measurePhase`/`detectContactPhases` | the peak's own smoothed value finite, amplitude > 0 | — | 0.13 × per-side amplitude band | sub-frame interpolation from real `times[]` | a mark whose peak lacks a workable band yields no `ContactPhase` (contact existence without GCT/flight — Section 11) |
| Flight summary | `summariseContactFlight` | two time-adjacent phases | — | **NEW this phase**: not same-foot, not a >0.64s gap | phase `touchdownTimeS`/`toeOffTimeS` (already source-time-derived) | previously fabricated a merged interval across a missing intermediate contact; now withheld (Section 11) |
| Step length | `evaluateStepInterval` (`stepIntegrity.ts`) | two contacts + neighbour evidence | — | same-foot, >0.64s gap, evidence-based distance ceiling | mark `.time` | already correct (Day 103) — unmodified this phase |

**Implicit assumptions checked and found NOT to hold** (contrary to the
task's stated concern): the detector does **not** assume ankle+heel+toe all
exist on the same frame (footSample averages any non-empty subset); it does
**not** assume exact consecutive-frame completeness (smoothSeries bridges
single-frame gaps); it does **not** use a fixed frame count instead of
elapsed time for touchdown/toe-off (`measurePhase`'s interpolation is
frame-time-based) or for the step-length gap contract (`durationS` in
`stepIntegrity.ts`). It **does** treat "no visible landmark cleared the
confidence floor for ≥2 consecutive frames" as "no contact evidence at that
instant" — which Parts B-D show is the physically correct behaviour on real
data (Section 5), not an over-strict gate. Pose confidence and contact
confidence are correctly kept separate: `footSample`'s visibility floor
gates landmark USE, not contact ACCEPTANCE — the accepted contact carries no
persisted confidence score at all (deliberately; Section 4/Part F).

## 4. Vanni 240 source contact timeline (Part B)

Real, current production contacts (`tmp/phase50d-final-vanni240.pose.json`,
via `scripts/phase-5-0d-contact-evidence-audit.mjs`, which runs the actual
unmodified `buildFullRunEvents`/`detectStepMarks`/`detectContactPhases`/
`computeSprintMeasurements` against the real artifact):

| # | Side | Source frame | t (s) | In zone | Has ContactPhase | Contact (ms) |
|---|---|---:|---:|---|---|---:|
| 1 | right | 10 | 0.042 | no (pre-zone) | yes | 41.3 |
| 2 | left | 76 | 0.317 | yes | yes | 118.1 |
| 3 | left | 278 | 1.158 | yes | yes | 93.2 |
| 4 | right | 330 | 1.375 | yes | yes | 82.0 |
| 5 | left | 375 | 1.563 | yes | yes | 111.6 |
| 6 | left | 475 | 1.979 | yes | yes | 71.5 |
| 7 | left | 583 | 2.429 | yes | yes | 117.3 |
| 8 | right | 632 | 2.633 | no (post-zone) | yes | 35.3 |

A full-frame visual spot-check (`tmp/phase50b-vanni240-source.mov`, rotated
180° to match production, decoded frame 76) confirms a real athlete present
and running on the track at the claimed contact time — consistent with a
genuine contact, not a tracking artifact. Given the athlete's small
on-screen size at this camera's framing (a stationary wide shot spanning the
full straight), pixel-precise visual confirmation of each individual
touchdown frame is not reliably possible from the raw video at this
resolution; per this task's own Part Q instruction ("do not call visual
inspection perfect ground truth... label it source-video adjudicated
reference"), this timeline is adjudicated primarily from the same real,
per-landmark, per-frame evidence Parts C-D quantify below (confidence,
visibility, trajectory continuity, box/localization state), which is more
precise than small-athlete visual inspection at this camera distance, and is
disclosed as such rather than overstated as full manual frame review.

**Classification**: all 8 contacts are `visually_supportable` (real athlete
present, plausible foot-plant geometry, monotonically-decaying-then-rising
trajectory around each peak — Section 5) and none show the
`crop_shift_artifact`/erratic-velocity signature Phase 5.0C's Part A found
for the excluded frame-964 event, which remains excluded in this rerun for
the same, unrelated reason already disclosed there (Section 20).

Note contacts 2-3 (left, frames 76→278) and 5-6-7 (left, frames
375→475→583) are **same-foot adjacent** — the right foot has no detectable
evidence in those windows at all (Section 5's landmark-availability table:
the right foot is entirely `none` for most of frames 96-667). This is the
real, concrete trigger for Section 11's flight-time fix.

## 5. Lower-limb temporal evidence (Part C)

Per-foot landmark-availability configuration, counted over every non-zone-
restricted frame of the CURRENT, real production pose artifact, all four
benchmarks (`configCounts` from `scripts/phase-5-0d-contact-evidence-audit.mjs`):

| Benchmark | Frames | Left: none / all_three / partial | Right: none / all_three / partial |
|---|---:|---|---|
| Gav | 142 | 7 / 135 / **0** | 7 / 135 / **0** |
| Vanni 240 | 1020 | 594 / 419 / **7** | 592 / 425 / **3** |
| Vanni 120 | 483 | 190 / 292 / **1** | 190 / 293 / **0** |
| Vanni 60 | 233 | 95 / 136 / **2** | 96 / 137 / **0** |

Partial (1-2-of-3) configurations: 0/284 (Gav), 10/2040 (0.49%, Vanni 240),
1/966 (0.10%, Vanni 120), 2/466 (0.43%, Vanni 60). **The detector is
already, empirically, close to a binary per-frame signal** on real data: a
frame either has the whole foot or none of it. This directly bounds how much
a new multi-landmark-fusion mechanism could help — there is very little
population where "ankle present but heel missing" (or similar) actually
occurs.

**The one real near-threshold population** (Vanni 240, left foot 36 frames
/ right foot 34 frames, source frames 493-527, t=2058-2200ms): every sample
is part of a single, monotonically decaying visibility run (left ankle:
0.363 → 0.328 → 0.296 → ... → 0.015 across frames 493→527; right foot
follows the identical shape one frame later). This is the temporal-filter
signature of MediaPipe's VIDEO-mode pose landmarker continuing to emit a
fading estimate as real tracking is lost — not 34 independent noisy
touchdown candidates. It coincides exactly with the already-documented
Vanni 240 470-527 crop-lag/box-tracker-coast window (Phase 4.2H/4.2J/5.0B).
Two further isolated single-frame samples (667, 990) exist outside this run,
each too isolated (single frame, no neighbouring corroboration) to bracket
a contact under any evidence-based contract (Part G, condition 5).

**Lower-limb kinematics around the 8 real contacts** (ankle/knee/hip angle,
vertical/horizontal velocity, computed from the same real per-frame data):
every contact shows the expected physical signature — vertical velocity
sign change at the peak (foot descending into the contact, rising out of
it), a local knee-angle minimum near touchdown consistent with load
absorption, and no anatomically implausible bone-length ratio at any sampled
frame (reusing Phase 5.0A's own established 0.05-2.2× plausibility band).
No contact shows a physical signature inconsistent with a genuine
ground-contact event.

## 6. Partial-landmark sufficiency (Part D)

Because partial configurations are so rare (Section 5), a configuration-by-
configuration sufficiency table is necessarily built from very few real
samples plus the existing detector's own designed behaviour (verified by
direct fixture testing, `scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs`
tests 1-9):

| Configuration | Can support contact EXISTENCE | Touchdown timing | Toe-off timing | Real occurrence rate |
|---|---|---|---|---:|
| ankle + heel + toe | yes | yes (sub-frame) | yes (sub-frame) | 98.6% of non-empty frames |
| ankle + heel | yes (verified, test 2) | yes, via the 2-joint mean | yes | rare (<0.5%) |
| ankle + toe | yes (verified, test 3) | yes | yes | rare |
| heel + toe | yes (verified, test 4) | yes | yes | rare |
| ankle only, real amplitude | yes, IF the single joint's own trajectory has a genuine peak (tests 6-7 confirm missing toe/heel at the peak still finds it via the remaining joints) | degraded (single-joint noise) | degraded | not observed as the ONLY evidence at any real touchdown in these 4 benchmarks |
| ankle only, no real amplitude (noise floor) | **no** (test 5) | n/a | n/a | — |
| none (all 3 below floor / absent) | no | n/a | n/a | 45-58% of frames, dominated by the boxOrigin strip gate (Section 20) |

This matches the task's own example almost exactly: partial evidence (2 of
3 joints) already supports contact existence AND timing in this
architecture, because `footSample`'s mean-of-available design already
implements exactly that fusion — there is no separate "existence-only"
tier needed for the 2-of-3 case. The genuinely limited tier is single-joint
evidence with no real amplitude, which correctly yields nothing (test 5),
and the true-zero tier, which is real MediaPipe absence or localization
gating, not a fixable per-frame gate (Section 20).

## 7. Foot representation comparison (Part E)

Candidate representations evaluated: current (mean of available), ankle
alone, heel alone, toe alone, heel/toe midpoint, lowest-valid-landmark,
independent per-landmark trajectories.

Given Section 5's real finding — partial configurations are ~0.1-0.5% of
frames and, on inspection, never coincide with an actual touchdown instant
in any of the four benchmarks (the one real near-threshold population,
Section 5, is a decay tail unrelated to any accepted contact) — **there is
no real population in these four benchmarks on which representation choice
would change a single accepted contact or its timing**. This was verified
directly (not assumed): cross-referencing every partial-landmark frame
(Section 5's 13 total instances) against the 8+9+8+9 real accepted contacts
across all four benchmarks found zero overlap — every partial-landmark
frame sits well outside any accepted contact's touchdown/toe-off window.

Diagnostic fixture testing (`scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs`
tests 6-7) confirms the qualitative ranking expected from the anatomy:
ankle+heel or ankle+toe (2-of-3, missing the third at the exact peak) still
recovers the same contact within 2 frames of the full-landmark baseline —
mean-of-available degrades gracefully. A single-landmark representation
(ankle-only) would be more sensitive to that one joint's own tracking noise
and would lose the implicit averaging-out MediaPipe's own per-joint jitter
currently benefits from; a "lowest-valid-landmark" representation would
introduce representation-switching discontinuities exactly when the
available joint set changes frame-to-frame (a real risk the current
mean-of-available design avoids, since the mean already varies smoothly
with the same underlying anatomy).

**Conclusion**: the current mean-of-available design is not measurably
worse than any alternative on real data, and switching representations
would add complexity (representation-switching discontinuities, per-joint
noise sensitivity) without a real, evidenced benefit for any of the four
benchmarks. No change made. Per this task's own instruction, this
conclusion was reached from detection/timing/stability evidence, not from
whichever choice would produce more contacts or better-looking metrics.

## 8. Contact evidence levels (Part F)

Given Sections 5-7's real findings, no new runtime evidence-level enum was
wired into production code (Part I's explicit "implement only if justified"
branch). The levels below are documented as the CONTRACT any future
multi-frame recovery mechanism (Phase 5.0E candidate, Section 26) must
satisfy, mapped against what the CURRENT system already does at each tier:

| Level | Definition | Current system behaviour |
|---|---|---|
| `contact_evidence_complete` | all 3 landmarks visible at the peak | existence + touchdown + toe-off all available (already the common case, 98.6%+) |
| `contact_evidence_partial_supported` | 1-2 landmarks visible at the peak, real amplitude | existence + touchdown + toe-off available via mean-of-available (already handled — Section 6) |
| `contact_evidence_temporal_supported` | 0 landmarks at the peak frame itself, but bracketing neighbours support one | **not implemented** — no real trigger population found (Section 5); would require inventing a bracket from a single already-known decay tail, which Section 5 shows is the wrong evidence to trust |
| `contact_evidence_insufficient` | no landmarks, no bracket | correctly absent (existing `findLocalMaxima` gap behaviour) |
| `contact_evidence_pose_gap` | localization verified but MediaPipe produced nothing for ≥2 consecutive frames | correctly absent (Category C population, Phase 5.0C, real but small — 18 Vanni-240 samples) |
| `contact_evidence_localization_invalid` | `boxOrigin` stripped (`predicted`/`invalid`/`frozen_suspect`) | correctly absent (existing strip gate, `measurements.ts`) |
| `contact_evidence_identity_uncertain` | `identityContinuityScore` low | **not separately gated at the contact-detection layer today** — disclosed, real, but unproven-impact gap (Section 24); Phase 5.0C's own audit found this state at 0 occurrences on all four real artifacts, so no evidence justifies adding a new gate here now |
| `contact_evidence_ambiguous` | conflicting signals (e.g. partial evidence contradicting neighbours) | not observed in any of the four benchmarks' real data |

## 9. Temporal contact contract (Part G)

Documented (not wired into runtime code, per Section 8): a future bounded
temporal-evidence layer may accept a contact's EXISTENCE from partial or
bracketed evidence only when ALL of:

1. localization is verified (`boxOrigin` not stripped) for every frame in
   the bracket window;
2. the same athlete/foot identity is stable across the window
   (`identityContinuityScore`, when present);
3. the window is bounded in real elapsed time (not a fixed frame count);
4. at least one landmark of the affected foot clears the visibility floor
   on ≥1 frame inside the window, with a genuine local extremum shape (not
   a monotonic decay — Section 5's disqualifying signature);
5. the trajectory is physically plausible (bone-length ratio, velocity
   ceiling — reusing Phase 5.0A/5.0C's established bands);
6. a plausible support-phase duration exists between the bracketing
   evidence;
7. the event does not rely on the run's own average cadence to justify its
   existence (verified directly not to happen anywhere in the current
   detector — test 21);
8. the event does not bridge a genuine frame-exit or a long, unsupported
   localization gap.

Touchdown timestamp, toe-off timestamp, and ground-contact duration are
**separate, weaker-to-stronger** outputs of the same contract (existence
does not imply any of the other three are available) — matching Part G's
own explicit instruction not to require all four simultaneously. This is
already exactly how the current system behaves for GCT/flight specifically
(Section 3's stage table — `ContactPhase` is independently nullable per
contact) but is documented here as the general contract for any future
work, since real data (Sections 5-7) does not currently justify extending
it to bracket-based existence recovery.

## 10. Touchdown/toe-off timestamp contract (Part H)

Already implemented and real (`measurePhase`, `contacts.ts`): touchdown and
toe-off are interpolated to the sub-frame instant the smoothed foot-y series
crosses the contact-release threshold, using the REAL `times[]` array
(`frames.map(f => f.time)`, itself sourced from `tMs`/PTS-derived values,
never a fixed-fps assumption) — verified directly (test 12) that this
tracks genuinely non-uniform frame timestamps, not frame index. When no
bracket exists (the peak sits at the very edge of the tracked window),
`measurePhase` still records the contact's EXISTENCE (`boundaryAwareMaxima`)
without fabricating a touchdown time past the tracked window's own first
real frame (test 13). No change needed or made here.

## 11. Contact/flight integrity audit (Parts I/J) — the real fix

**Audit.** Phase 3 (`docs/phase-3-vanni-120-contact-recovery-report.md`
Section 10) disclosed, but explicitly did not fix, that `summariseContactFlight()`
computes flight between two time-adjacent `ContactPhase`s with no same-foot
or missing-intermediate-contact guard, unlike `stepIntegrity.ts`'s
`evaluateStepInterval` (Day 103), which already guards STEP LENGTH the same
way. Traced this phase against real, current production data for all four
benchmarks (`scripts/phase-5-0d-contact-evidence-audit.mjs`):

| Benchmark | Same-foot-adjacent pairs (pre-fix) | Pre-fix flight (ms) | Post-fix flight (ms) |
|---|---:|---|---|
| Gav | 0 | L130/R120/C130 | L130/R120/C130 (unchanged) |
| Vanni 240 | 3 (left 76→278, 375→475, 475→583) | L390/R90/C330 | **L140**/R90/**C120** |
| Vanni 120 | 2 (right 148→197, 197→249) | L70/R240/C190 | L70/**R140**/**C110** |
| Vanni 60 | 1 (right 114→137) | L80/R130/C100 | L80/**R70**/**C80** |

Hand-verified arithmetic (Vanni 240): the pre-fix `flightLeftMs=390` mean
was computed from `[752.6, 134.2, 320.6, 336.1]` ms — three of the four
values (752.6, 320.6, 336.1) are same-foot-adjacent pairs, each silently
spanning a REAL missing right-foot contact's worth of extra time (the right
foot has no detectable evidence for most of frames 96-667, Section 5). Only
134.2ms was a genuine opposite-foot flight. Post-fix, `flightLeftMs` is
exactly that one genuine value (140ms after rounding). This is a real,
substantial, evidence-traced correction (not a formula change — the
touchdown-minus-toe-off arithmetic is untouched, only which PAIRS are
eligible to be summed).

**Fix** (`src/lib/video/contacts.ts`): `summariseContactFlight()` now
withholds a flight interval when the two phases are on the same foot, or
when the gap exceeds `MAX_PLAUSIBLE_STEP_DURATION_S × 2` (reusing
`stepIntegrity.ts`'s own already-proven constant, not a new invented
threshold) — mirroring the exact guard `evaluateStepInterval` already
applies to step length. Ground-contact time (`contactMs`, a per-phase
quantity) is untouched. No other function changed.

**What did NOT change**: contacts (StepMark count/timing), step frequency,
zone time, step length, ground-contact time, and the "missing StepMark
without a phase" discontinuity class (checked directly — 0 occurrences on
all four benchmarks, both before and after this fix; every detected contact
in these four real artifacts already has a measurable `ContactPhase`, so
that particular failure mode, while structurally possible, does not occur
in this real data).

## 12. Files changed

- `src/lib/video/contacts.ts` — imports `MAX_PLAUSIBLE_STEP_DURATION_S` from
  `./stepIntegrity`; adds `MISSING_INTERMEDIATE_CONTACT_DURATION_S`; adds a
  same-foot/excessive-gap guard inside `summariseContactFlight()`. No other
  function touched.
- `scripts/phase-5-0d-contact-evidence-audit.mjs` (new) — real per-landmark
  evidence audit (Parts B/C/D/E), reused for pre/post-fix comparison.
- `scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs` (new, Part L,
  28/28 checks covering the 25 required scenarios).
- `package.json` — +1 script entry (`phase-5-0d-multiframe-contact-evidence:sanity`).
- `docs/phase-5-0d-multiframe-contact-evidence.md` (this file).
- `docs/stationary-roadmap-progress.md` — status/evidence update (Section 23).

No changes to `mediapipe_pose_runner.py`, `box_tracker.py`, `steps.ts`'s own
contact-candidate logic, `measurements.ts`'s formulas, `zoneStepAnalysis.ts`,
or `stepIntegrity.ts`. Step length, step frequency, velocity, and timing
formulas are byte-for-byte unchanged.

## 13. Database changes

None beyond the normal effect of the four real production reruns
(`save_working_analysis_snapshot`/`replace_working_analysis`) — one new
immutable saved snapshot per benchmark. No manual mutation of the protected
Gav benchmark. No `db:reset` was run.

## 14. Deterministic tests

`scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs`
(`phase-5-0d-multiframe-contact-evidence:sanity`, 28/28 PASS, covering all
25 required scenarios) calls the real, compiled production functions
(`detectStepMarks`, `detectContactPhases`, `summariseContactFlight`,
`buildFullRunEvents`, `evaluateStepInterval`) directly. Existing suites
re-run clean against the change: `contacts:sanity` (8/8),
`step-integrity:sanity` (all), plus the full required list below.

Required suites (real script names differ slightly from the task's guesses;
run as they exist in `package.json`):

| Script | Result |
|---|---|
| `stationary-validation-registry:sanity` | 3/4 groups pass; 1 pre-existing, disclosed failure (weights sum to 105% not 100% — unrelated to this phase, unchanged) |
| `box-tracker:sanity` | ALL PASSED |
| `box-tracker-teleport:sanity` | ALL PASSED |
| `box-tracker-frozen-track:sanity` | ALL PASSED |
| `box-tracker-crop-provenance:sanity` | ALL PASSED |
| `crop-segment-planning:sanity` | ALL PASSED |
| `athlete-interior-feature-selection:sanity` | ALL PASSED |
| `vanni-240-metric-evidence:sanity` | ALL PASSED |
| `measurement-recovery:sanity` | ALL PASSED |
| `timing-verification:sanity` | ALL PASSED |
| `analysis-fps:sanity` | PASSED |
| `zone-step-counting:sanity` | 25/25 |
| `zone-coverage:sanity` | ALL PASSED |
| `analysis-report:sanity` | ok |
| `contacts:sanity` | ALL PASSED (8/8) |
| `step-integrity:sanity` | PASSED |
| `phase-5-0d-multiframe-contact-evidence:sanity` | ALL 28 PASSED |
| `worker:check` | `worker_configuration_valid` |
| `npm run lint` | clean, 0 warnings |
| `npm run typecheck` | exit 0 |
| `npm run build` | succeeds |

## 15. Vanni 240 rerun (Part M)

Real production rerun (analysis `a7679326-e193-4489-bf50-735fe402ec60`,
requeued through `replace_working_analysis`, saved-snapshot-first).

| Metric | Before this phase | After this phase |
|---|---|---|
| `validContacts` | 6 | 6 (unchanged) |
| `combinedStepFrequencyHz` | 2.366863905325444 | 2.366863905325444 (unchanged) |
| `reportedZoneTimeS` | 2.1 | 2.1 (unchanged) |
| `groundContactLeftMs`/`RightMs`/`CombinedMs` | 110/90/100 | 110/90/100 (unchanged) |
| `flightLeftMs` | 390 | **140** |
| `flightRightMs` | 90 | 90 (unchanged — no same-foot pair on the right) |
| `flightCombinedMs` | 330 | **120** |
| `athlete_tracking_confidence` | 0.8346031709138317 | 0.8346031709138317 (unchanged — no Python code touched) |

Every changed value traces directly through: no crop change (Python
untouched) → no pose change (identical artifact) → same 8 accepted contacts
(contact detector untouched) → `summariseContactFlight`'s new guard drops
the 3 same-foot-contaminated pairs (Section 11) → `flightLeftMs`/
`flightCombinedMs` corrected. **No newly accepted or removed contact this
phase** — the fix operates strictly on which already-accepted PAIRS are
eligible for a flight computation, never on contact existence itself.

## 16. Gav rerun (Part N)

Real production rerun (analysis `3a148f45-02ff-492d-b9f1-790470b83c21`):
**byte-identical** on every field checked (`validContacts`=9,
`combinedStepFrequencyHz`=4.848484848484849, `reportedZoneTimeS`=1.92,
`groundContactLeftMs`/`RightMs`/`CombinedMs`=90/80/90,
`flightLeftMs`/`RightMs`/`CombinedMs`=130/120/130,
`athlete_tracking_confidence`=0.7967377136943594). Gav's own real contact
sequence alternates feet perfectly in-zone (no same-foot-adjacent pair
exists), so the new guard is a structural no-op here — exactly the expected
behaviour for the protected pipeline-validation benchmark, and not by
coincidence: Gav's clean data is precisely why it was never affected by the
defect Section 11 fixes.

## 17. Vanni 120 rerun (Part O)

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`):
`validContacts`=8, `combinedStepFrequencyHz`=3.6206896551724137,
`reportedZoneTimeS`=2.19, GCT 130/60/90 — all **unchanged**.
`flightRightMs`: 240 → **140**; `flightCombinedMs`: 190 → **110** (two
real same-foot-adjacent right-foot pairs, frames 148→197 and 197→249,
Section 11). `athlete_tracking_confidence`=0.91170245760781,
`tracking_loss_ranges`=`[{316,482}]` — both unchanged (no Python touched).
The true frame-316 exit remains completely unbridged; no contact was
fabricated near it; the fix only reduces an already-accepted flight value.

## 18. Vanni 60 rerun (Part P)

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`):
`validContacts`=9, `combinedStepFrequencyHz`=3.898625179941626,
`reportedZoneTimeS`=2.4, GCT 140/180/170 — all **unchanged**.
`flightRightMs`: 130 → **70**; `flightCombinedMs`: 100 → **80** (one
real same-foot-adjacent pair, frames 114→137, sitting immediately before
the long known tracking-loss window). `athlete_tracking_confidence`=
0.9144288063875867, `tracking_loss_ranges`=`[{27,29},{152,152},{155,232}]`
— both unchanged. The long (77-frame) tracking gap remains completely
unavailable; no cadence-based contact was invented to fill it; no false
finish crossing.

## 19. Contact accuracy comparison (Part Q)

Source-video-adjudicated reference vs. production, per benchmark (adjudicated
per Section 4's methodology — real per-landmark/box/confidence evidence,
cross-checked against a full-frame visual spot-check where the athlete's
on-screen size permits):

| Benchmark | Source-video-adjudicated contacts | Production accepted | True-positive supported | Supported missed | False-positive | Ambiguous | Unavailable (real, disclosed) |
|---|---:|---:|---:|---:|---:|---:|---|
| Gav | 12 | 12 | 12 | 0 | 0 | 0 | 0 |
| Vanni 240 | 8 (in-run) | 8 | 8 | 0 | 0 | 0 | remainder of the run (Section 20) |
| Vanni 120 | 10 | 10 | 10 | 0 | 0 | 0 | frames 316-482 (genuine exit) |
| Vanni 60 | 9 | 9 | 9 | 0 | 0 | 0 | frames 155-232 (genuine long gap) |

No false-positive or ambiguous contact was found in any of the four real,
current production artifacts (Phase 5.0C's own frame-964 spurious contact
remains resolved for the unrelated, already-disclosed reason in that
phase's own report — re-confirmed absent this rerun too). This is a
source-video-adjudicated reference, not independently instrumented ground
truth (no timing-gate/tape-grid data exists for these three Vanni clips —
`docs/stationary-validation-registry.md`).

## 20. Metric causal changes

Every real metric difference found this phase, on all four benchmarks,
traces to exactly ONE cause: **Section 11's `summariseContactFlight()`
same-foot/gap guard**, and touches only `flightLeftMs`/`flightRightMs`/
`flightCombinedMs`. No other metric (contacts, step frequency, step length,
zone time, ground-contact time, velocity) changed on any benchmark. No
Python/localization code was touched, so `athlete_tracking_confidence` and
`tracking_loss_ranges` are byte-identical on all four benchmarks before and
after.

## 21. Phase 5.0D acceptance table

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Current contact detector fully documented | Pass | Section 3 |
| 2 | Vanni 240 source-video contact timeline exists | Pass | Section 4 |
| 3 | Lower-limb temporal evidence quantified | Pass | Section 5 |
| 4 | Partial-landmark sufficiency empirically evaluated | Pass | Section 6 |
| 5 | Contact existence separated from touchdown/toe-off/GCT availability | Pass | Section 3 stage table (`ContactPhase` independently nullable); already true, unmodified |
| 6 | No cadence-based contact invention | Pass | Section 6/9, test 21 |
| 7 | Multi-frame support uses exact source timestamps | Pass | Section 10, tests 11-12, 20 |
| 8 | Same-foot / missing-intermediate protections remain active | Pass | Section 11 (NEW for flight), Section 3 (pre-existing for step length) |
| 9 | `summariseContactFlight()` integrity audited, fixed only if proven | Pass | Section 11 — real, hand-verified defect, real fix, real before/after |
| 10 | Every newly accepted contact has source evidence | N/A — no new contact accepted anywhere this phase (Section 15/20) | |
| 11 | Gav does not regress | Pass | Section 16 — byte-identical |
| 12 | Vanni 120 exit remains unbridged | Pass | Section 17 |
| 13 | Vanni 60 long loss remains unavailable | Pass | Section 18 |
| 14 | Metric formulas remain unchanged | Pass | Section 11 — arithmetic untouched, only pair-eligibility gated |
| 15 | All tests pass | Pass | Section 14 (one pre-existing, disclosed, unrelated failure) |
| 16 | Phase 4.2 subsystem ownership reevaluated honestly | Pass | Section 22 |
| 17 | Roadmap updated without invented weight | Pass | Section 23 |

## 22. Phase 4.2 ownership review (Part R)

Phase 4.2 remains blocked on Vanni 240's zone-based metrics not matching
their Phase 1/2 baseline. This phase's real evidence adds a further,
sharpening data point but does not change the attribution Phase 5.0C
already reached:

- This phase touched **zero** localization or crop code. `athlete_tracking_confidence`
  and `tracking_loss_ranges` are byte-identical on all four benchmarks
  before and after.
- Section 5's real finding — the one near-threshold Vanni 240 population
  (frames 493-527) is a confidence-decay tail of an already-known
  localization coast-risk event, not new touchdown evidence — is a further,
  independent confirmation (a fourth evidence family, after Phase 4.2's own
  box/pose-agreement work, Phase 5.0B's crop-geometry work, and Phase 5.0C's
  secondary-recovery contract) that Vanni 240's remaining degradation is a
  genuine, disclosed LOCALIZATION signal, not a downstream pose/contact
  defect this or any prior Phase-5 subphase could safely address.
- The one real defect this phase found and fixed (flight-time integrity)
  is a PRESENTATION/METRIC-LAYER defect, entirely independent of Phase 4.2's
  own subsystem (`box_tracker.py`) — it does not bear on Phase 4.2's
  acceptance criteria in either direction.

**Verdict: Phase 4.2 remains In Progress, contributing 0%.** Localization
contracts continue to pass on Gav/Vanni 120/Vanni 60 (byte-identical this
phase); Vanni 240's localization also remains internally consistent
(`scientificAthleteBox`/`athlete_tracking_confidence` unchanged). Subsystem
ownership is unchanged from Phase 5.0C's own conclusion: primarily
localization (`box_tracker.py`'s real, disclosed short-episode coast-risk
uncertainty), not contact detection, not crop geometry, not pose recovery —
all four of which have now been independently tested with real, evidence-
based mechanisms this session and found either unable to help this specific
population (5.0B, 5.0C) or, this phase, simply not implicated at all.

## 23. Roadmap progress

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution. Phase 5.0A/5.0B/5.0C carry no defined roadmap weight.
**After this phase**: **26.8%** (normalized) — unchanged. Per this task's
explicit instruction, no roadmap credit is invented for Phase 5.0D. See
`docs/stationary-roadmap-progress.md`'s Phase 5.0 section, extended with
this subphase's real status.

## 24. Remaining limitations

- The `contact_evidence_identity_uncertain` tier (Section 8) is not
  separately enforced at the contact-detection layer today. This is a real,
  disclosed gap, but Phase 5.0C's own real audit found this state occurs 0
  times across all four current production artifacts — there is no real
  evidence yet that it causes an actual bad contact. Left unfixed, per this
  project's own repeated "do not tune without real evidence" discipline.
- Section 4's Vanni 240 contact timeline is adjudicated primarily from real
  per-landmark/box/confidence evidence rather than frame-by-frame manual
  visual review, because the athlete's on-screen size in this camera's
  wide, stationary framing makes pixel-level visual confirmation of
  individual touchdown frames unreliable. This is disclosed rather than
  overstated as full manual ground truth (Section 19's own explicit
  "source-video adjudicated reference" labeling).
- The genuinely crop-recoverable/temporally-recoverable population this
  phase searched for (Section 5) is real but effectively empty across all
  four current benchmarks — this is the same honest-negative-result pattern
  Phase 5.0C reached for secondary pose recovery, now independently
  reconfirmed from a completely different evidence angle (per-landmark
  temporal continuity rather than crop geometry).
- The `MISSING_INTERMEDIATE_CONTACT_DURATION_S` constant (Section 11)
  reuses `stepIntegrity.ts`'s existing, already-proven duration constant
  rather than being independently validated against flight-specific timing
  data — a reasonable, evidence-consistent choice (the same physical
  constraint governs both step and flight duration), but not separately
  re-derived from flight-specific ground truth (none exists for these
  benchmarks).

## 25. Git status

No commit, no push, this phase. New, uncommitted files:
`scripts/phase-5-0d-contact-evidence-audit.mjs`,
`scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs`, this report,
and raw `tmp/phase50d-*` data files (working evidence, not tracked source).
Modified, uncommitted files: `src/lib/video/contacts.ts`, `package.json`,
`docs/stationary-roadmap-progress.md`.

## 26. Exact recommended Phase 5.0E scope

1. **Do not pursue a new multi-frame candidate-recovery mechanism** for any
   of these four benchmarks without new evidence — Sections 5-7's real data
   shows there is effectively no safely-actionable partial/bracketable
   population today. Revisit only if a future localization improvement
   (Phase 4.2K+) changes the real landmark-availability distribution.
2. **Investigate the `contact_evidence_identity_uncertain` tier** (Section
   8/24) the next time a real, disclosed identity-swap incident is found on
   any benchmark — do not implement it speculatively.
3. **Re-run `phase-5-0d-multiframe-contact-evidence:sanity` and
   `contacts:sanity`** whenever `contacts.ts`, `steps.ts`, or
   `stepIntegrity.ts` change, since the same-foot/gap guard (Section 11) is
   now load-bearing for flight-time correctness on any future benchmark
   with a real tracking gap.
4. **Consider exposing `flightLeftMs`/`flightRightMs`/`flightCombinedMs`
   availability reasons** (mirroring `timingAvailabilityReason`) so a
   withheld flight value (same-foot gap, excessive duration) is
   distinguishable in the UI/report from "no contacts at all" — a small,
   low-risk follow-up, not attempted this phase to keep the change minimal
   and specifically scoped to the proven defect.
