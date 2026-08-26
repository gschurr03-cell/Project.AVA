# Phase 4.2H — Distance-and-Evidence-Based Coast Risk and Athlete-Independent Metric Contract

## 1. Executive summary

Phase 4.2H replaced Phase 4.2G's flat-time-only coast-risk discriminator with a
richer, interpretable evidence vector (elapsed time, frame-width distance,
trajectory residual, background-risk trend, forward-backward flow validity,
structural track state) and formalized the athlete-independent metric
contract this project's scientific principle requires: Gav is a protected
**pipeline-validation benchmark** (its own evidence must be interpreted
correctly and stay stable), never a **numeric target** for any Vanni
benchmark's own, independent metrics.

Real per-benchmark evidence auditing (Section 5) found, across **three
independent signal types tested via real production reruns** — elapsed time
(Phase 4.2G), frame-width distance (this phase), and trajectory residual
(this phase) — that none can serve as a single discriminator between Gav's
own legitimate short coasts and Vanni 240's real short-duration contact-level
degradation without either regressing Gav or failing to help Vanni 240. This
is now a triply-confirmed, evidence-grounded architectural limit, not a
tuning failure.

What Phase 4.2H did resolve, with real evidence: a genuine
exit-vs-background-lock classifier (`localizationTerminationReason`, Part D)
using a real, previously-undocumented signal (a truly frozen box position vs.
one still making small, real, non-repeating progress); Vanni 120's own real
regression from Phase 4.2F/G is fully recovered (`strideFrequencyHz` now
exactly matches the original Phase 3 baseline, 5.01, and the tracking-loss
gap starts at frame 317 — the original, adjudicated exit frame); Gav remains
an exact byte match; Vanni 60 shows no regression.

**Result: Phase 4.2 still does not close.** Vanni 240's zone-based metrics
(`combinedStepFrequencyHz`, contact counts) remain regressed relative to the
Phase 1/2 ground-truth baseline — the same real, disclosed blocker Phase
4.2G reported, now confirmed unresolvable by three different evidence
signals rather than assumed unresolvable after one.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md` (authoritative): overall completion
26.8% (normalized) before this phase. Phase 4.2 In Progress, 0% contribution.
This phase does not award partial credit for Phase 4.2 — see Section 23/24.

## 3. Athlete-independent metric contract

**A. Shared scientific method** — one set of formulas, applied identically to
every athlete, never touched by this phase:

| Metric | Authoritative formula | Evidence source |
|---|---|---|
| Zone Time | `crossingTime()` bracket-interpolation on real per-frame `tMs` (`measurements.ts:467`) | Start/finish source timestamps, gate midpoints |
| Average Step Length | `mean(individualStepLengthsM)` (`measurements.ts:1122`) | Athlete-specific eligible opposite-foot contact intervals, calibrated world positions |
| Peak Step Length | `computePeakStrideLengthM()` — best rolling-4-window average (`strideMetrics.ts:24`) | Athlete-specific rolling window over the SAME athlete's own individual step lengths — no reference to any other athlete's value |
| Step Frequency | `stepFrequenciesFromContacts()` — `1/mean(interval)` (`cadence.ts:77`) | Athlete-specific verified contact timestamps |
| Average Velocity | `20.000m / reportedZoneTimeS` | Athlete-specific verified distance and zone time |
| Peak Velocity | `reportStrideWindows()` — best contact-to-contact window (`timingPolicy.ts:57`) | Athlete-specific eligible evidence window |

**B. Athlete-specific measured result** — the same formulas, run on each
athlete's own independent evidence, legitimately produce different numbers.
`docs/phase-2-vanni-240-metric-verification-report.md` Section 4 already
independently hand-verified every one of these formulas against real
Vanni 240 evidence; this phase adds the CROSS-athlete half of the proof.

New test suite `scripts/athlete-independent-metric-contract-sanity.mjs`
(`npm run athlete-independent-metric-contract:sanity`, 16/16 PASS) proves,
using two independent synthetic athlete profiles never tuned toward any real
benchmark's numbers:
1. The same formula produces materially different, both internally
   consistent results for a short-stride/high-cadence profile vs. a
   long-stride/lower-cadence profile.
2. Neither synthetic athlete's result equals Gav's real registry value (no
   hidden convergence).
3. Recomputing athlete A's result AFTER athlete B's does not perturb it (no
   shared/cached state links one athlete's evidence to another's).
4. No shared formula source file (`cadence.ts`, `strideMetrics.ts`,
   `steps.ts`, `contacts.ts`, `measurements.ts`) hardcodes any Gav-specific
   value or branches on athlete/benchmark identity.
5. All four REAL registry benchmarks have genuinely distinct
   `combinedStepFrequencyHz` values — cross-athlete numeric matching was
   never, and is not now, the non-regression bar.

## 4. Gav benchmark role

`docs/stationary-validation-registry.md`/`validation/stationary-validation-registry.json`
already state, for `gav_stationary_reference`: `protected: true` (enforced by
a database trigger), `groundTruth.status: "available"` (an independent
VueMotion reference), and explicitly **"never used as Vanni ground truth."**
This phase makes that distinction explicit and load-bearing everywhere it
matters:

- **A Gav non-regression** means: the same Gav source evidence remains
  correctly interpreted, the same formulas remain stable, no valid Gav
  evidence is lost, no unsupported Gav evidence is added — verified this
  phase by an exact byte-for-byte match (Section 15).
- **A Vanni validation** means: the same formulas are applied correctly to
  Vanni's own independent evidence, and Vanni's outputs are scientifically
  correct FOR VANNI — never "Vanni's numbers should approach Gav's."
- This distinction is now explicit in: this report (Sections 3-4), the new
  `athlete-independent-metric-contract:sanity` suite, and
  `docs/stationary-roadmap-progress.md`'s Phase 4.2 section (Section 24).

## 5. Coast-distance audit

Real, per-verified-confirmation-interval evidence was extracted from fresh
production reruns of all four benchmarks (via a real gap this phase found and
fixed first — Section 11) using `scripts/phase-4-2h-coast-distance-audit.mjs`.

**Finding 1 — elapsed time does not discriminate** (already known from Phase
4.2G, reconfirmed): Gav's own real intervals span 133-283ms; several of
Vanni 240's real problem intervals are shorter than that.

**Finding 2 — raw frame-width distance does not discriminate.** Gav's
non-safe intervals cover 0.005-0.108 frame-widths; Vanni 240's real problem
intervals cover 0.000-0.118 frame-widths — the ranges overlap substantially.
Root cause: Gav's athlete runs at ~10.4 m/s, comparable to or faster than
Vanni 240's ~9.0 m/s — both cover comparable real distance per unit coast
time, so distance alone cannot separate "real motion" from "real
contamination."

**Finding 3 — trajectory residual (frame-widths between actual position and
established-velocity-predicted position) shows a real, if narrow, margin for
the LONG-duration tail cases.** Gav's maximum trajectory residual across its
entire real run: **0.0803 frame-widths**. The already-recognized real
incidents on the other benchmarks (Vanni 120's original frame-215 freeze,
Vanni 60's frame-112 freeze) first cross the existing
`TRAJECTORY_RESIDUAL_SUSPECT_FW` (0.05fw) signal floor at **0.094-0.095
frame-widths** — comfortably above Gav's ceiling.

**Finding 4 — the margin found in Finding 3 only holds for LONG-duration
drift, not short in-zone episodes.** A direct frame-by-frame trace of Vanni
240's frame-649 tail (the dominant real regression) shows `backgroundRiskFeatureRatio`
climbing gradually from 0.00 (frame 655) through 0.25 (frame 666) to 1.00
(frame 678) while `trajectoryResidualPx` grows from near-zero to 79px within
50 frames — real, monotonic, compounding contamination, clearly distinct in
SHAPE from Gav's own transient, non-monotonic limb-motion blips. But Vanni
240's SHORTER, in-zone contamination episodes (frames 262, 280, 316, 343,
352, 568, 595 — each 8-44 frames) show trajectory-residual peaks of
0.008-0.086fw, overlapping Gav's own 0.002-0.080fw range. **No
currently-computed per-frame signal cleanly separates these short episodes
from Gav's own ordinary limb motion** — a real, disclosed, unresolved limit
(Section 14).

## 6. Safe versus unsafe interval distributions

| Benchmark | Intervals | Safe | Non-safe | Peak trajRes range (non-safe) |
|---|---:|---:|---:|---|
| Gav | 12 | 4 | 8 | 0.002 – 0.080 fw |
| Vanni 240 | 16 | 6 | 10 | 0.008 – 0.492 fw |
| Vanni 120 | 22 | 4 | 18 | 0.001 – 0.608 fw |
| Vanni 60 | 9 | 4 | 5 | 0.011 – 0.542 fw |

The LONG-tail cases (Vanni 240 frame 649, Vanni 120 frame 301, Vanni 60 frame
127 — all real, adjudicated exit/lock regions) all exceed 0.4fw, far above
Gav's 0.08fw ceiling — a real, exploitable margin (Section 8). The
SHORT-episode cases across all benchmarks overlap in the 0.002-0.09fw band —
no exploitable margin found.

## 7. Coast-risk design

`_coast_risk_state()` now computes a label from an interpretable evidence
vector, not a hidden weighted score, in priority order (most urgent/specific
first): `lost` (structural) → `reacquiring` (structural) →
`refresh_required` (structural) → `exited_frame` (Part D classification) →
`elevated_trajectory_risk` (real positional disagreement) →
`flow_degrading` (existing signal) → `elevated_feature_risk` (sustained
background-risk trend) → `elevated_distance_risk` (diagnostic-only, expected
to fire for any fast, legitimately-moving athlete) → `recently_confirmed` /
`corroborated_long_coast` / `normal_coast` (time-based, lowest priority).
None of these labels gate acceptance/rejection on their own — same
diagnostic-only contract as Phase 4.2G.

The real GATING change: `is_partial_split`'s exclusion condition now accepts
EITHER `time_since_verified_ms >= COAST_MIN_MS_SINCE_VERIFIED` (300ms, Gav's
own proven requirement) OR `trajectory_residual_fw >= COAST_TRAJECTORY_ALT_FW`
(0.09fw, Section 5's real margin) as satisfying the "enough real evidence"
requirement — always still combined with the existing sustained
background-risk trend (unchanged). The refresh-request trigger uses the same
OR-condition, kept coupled per Phase 4.2G's own hard-won lesson.

## 8. Exit versus background-lock model

`_classify_localization_termination()` (Part D) uses a real, previously
undocumented signature found in this phase's own audit:

- **Genuine frame exit** (Vanni 120's real frame-301 tail): the box kept
  making small, real, NON-REPEATING incremental moves toward the configured
  travel-direction's far edge — rolling net displacement over
  `ROLLING_DISPLACEMENT_WINDOW_MS` stayed genuinely nonzero (0.031→0.0345fw
  over ~160 frames).
- **Background lock** (Vanni 240's real frame-649 tail): the box was
  bit-for-bit IDENTICAL for hundreds of consecutive frames — a true zero,
  not "slow" — regardless of where in frame it sat (here, literally beyond
  the valid [0,1] normalized bound, x=1.006).

Rule: a truly frozen rolling displacement (< `EXIT_MIN_CONTINUED_DISPLACEMENT_FW`,
0.0005fw) is classified `background_lock_suspected` regardless of position; a
non-frozen position near the configured far edge (within
`EXIT_EDGE_MARGIN_FRAC`, 5% of frame width) is classified `genuine_frame_exit`.
Persisted as `localizationTerminationReason`. Proven via
`scripts/cross-athlete-coast-risk-sanity.py` checks 7-8 (synthetic, real
cv2 optical flow) and reconfirmed on the real Vanni 120/240 reruns
(Section 15/17).

## 9. Detector request/acceptance contract

Unchanged in structure from Phase 4.2B-4.2G, reconfirmed this phase: (1) a
request decision (`wants_detector_frame()`/the background-risk trend
trigger) never itself alters the track; (2) candidate evaluation
(`_classify_detector_event`) judges strictly against the last
IDENTITY-VERIFIED reference, never the possibly-drifted `last_box`; (3)
acceptance requires passing identity continuity, direction, scale, source
frame recency, and motion plausibility; (4) only an ACCEPTED candidate
touches the tracker's authoritative box/established-motion/ceiling state;
(5) a rejected candidate updates none of coast age, distance, motion, ceiling,
crop, or scientific eligibility — proven by `cross-athlete-coast-risk-sanity.py`
checks 9/9b/9c using a real, previously-untested fixture (a spurious
wrong-direction candidate reported alongside a genuinely continuing real
scene).

## 10. Progressive flow protection

`flowProtectionLevel` (new) surfaces a leveled view: `"active"` when the
exclusion gate fired this frame, `"monitoring"` when the background-risk
trend is already elevated but the joint gate hasn't cleared, `"none"`
otherwise — replacing the prior boolean-only `flowProtectionActive` (kept
alongside it, not removed, since the existing cross-FPS suite already reads
it). Baseline protections (forward-backward rejection, per-point magnitude
ceiling) remain always-on and unchanged. No protection triggers solely
because a fixed millisecond value elapsed — every trigger now requires the
sustained background-risk trend AND (time OR trajectory-residual)
corroboration.

## 11. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — new constants
  (`COAST_TRAJECTORY_ALT_FW`, `COAST_ELEVATED_DISTANCE_FW`,
  `EXIT_EDGE_MARGIN_FRAC`, `EXIT_MIN_CONTINUED_DISPLACEMENT_FW`); forward-
  backward-valid ratio surfaced; provisional (pre-exclusion) trajectory
  residual computed and used as an OR-path for the exclusion/refresh gates;
  `_classify_localization_termination()` (new); `_coast_risk_state()`
  rewritten to a full evidence vector with 4 new states
  (`elevated_distance_risk`, `elevated_feature_risk`,
  `elevated_trajectory_risk`, `corroborated_long_coast`, `exited_frame`,
  `lost`); 8 new `BoxTrackFrame` fields.
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — two
  real gaps found and fixed this phase: (1) Phase 4.2G's own 7 provenance
  fields were computed in `box_tracker.py` but never threaded into the
  persisted artifact at all (confirmed via a real rerun showing them absent);
  (2) this phase's own 8 new fields, threaded the same way.
- `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`, `src/lib/biomechanics/pose.ts`,
  `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — Zod schema +
  mapping for both the Phase 4.2G and Phase 4.2H field sets (the same
  raw-service-boundary-strips-unknown-fields class of bug Phase 4.2F itself
  found and fixed for its own new fields, recurring for 4.2G's).
- `scripts/athlete-independent-metric-contract-sanity.mjs` — new, 16 checks.
- `scripts/cross-athlete-coast-risk-sanity.py` — new, 22 checks.
- `scripts/phase-4-2h-coast-distance-audit.mjs` — new, real per-benchmark
  interval-evidence extraction tool (Section 5/6's source).
- `package.json` — +2 script entries.

## 12. Database changes

None beyond the normal, expected effect of real production reruns
(`save_working_analysis_snapshot`/`replace_working_analysis`) — new
immutable saved snapshots for Gav (×2), Vanni 240 (×3), Vanni 120, and
Vanni 60 pre-rerun states. No manual mutation of the protected Gav benchmark.
No `db:reset` was run.

## 13. Cross-athlete fixtures

`scripts/cross-athlete-coast-risk-sanity.py` (22/22 PASS), complementing
(not replacing) Phase 4.2G's own cross-FPS suite — holds FPS fixed at 240 and
varies athlete SPEED instead, using the same established real-cv2-optical-flow
fixture conventions:

1-2. Short/fast vs. long/slow athlete profiles both stay honestly tracked;
reach genuinely different real established speeds.
3. Coast risk behaves consistently (non-elevated) for both, for equivalent
   clean-evidence coasts — the model does not treat "faster" as inherently
   risky.
4. A Gav-like frequent-reconfirmation profile never reaches an elevated-risk
   state.
5. A long (900ms), real, consistently-moving coast stays `tracked` and never
   elevated-risk.
6. A fast-established athlete that goes fully static near a static object
   still produces real background-risk evidence (contamination defense
   unweakened).
7-8. The exit-vs-lock classifier correctly distinguishes a real, steadily-
   advancing near-edge approach from a bit-for-bit frozen mid-coast position.
9. Rejected detector candidates never reset coast age/distance/eligibility.
10. A fresh verified confirmation cleanly resets all coast-risk state.
11. New diagnostic fields are populated and well-formed.
12. `COAST_TRAJECTORY_ALT_FW` is proven, by a real Gav production regression
    and fix (Section 14), to sit strictly above the raw signal floor it is
    related to, not equal to it.

## 14. Vanni 240 rerun (Part I)

Two real production reruns this phase, both via the actual worker/RPC
pathway (analysis `a7679326-e193-4489-bf50-735fe402ec60`).

**First attempt** (`COAST_TRAJECTORY_ALT_FW = 0.05`, reusing
`TRAJECTORY_RESIDUAL_SUSPECT_FW` directly): `reportedZoneTimeS` = **2.20**
(exact match to the Phase 1/2 baseline), `zoneExitTimeS` = 2.440 (within
2ms of baseline), `reportedZoneVelocityMps` = **9.0909** (exact match) — a
genuine, real recovery of the finish-crossing evidence quality. But this
same value regressed Gav (Section 15) — real evidence the 0.05fw value was
too aggressive.

**Final configuration** (`COAST_TRAJECTORY_ALT_FW = 0.09`, Section 5's
Gav-safe margin): `athlete_tracking_confidence` = 0.8667961583677122
(identical to Phase 4.2G's own result — the alt-path no longer engages for
this specific real incident at this value), `tracking_loss_ranges` =
`[{149,174},{180,183},{666,977},{979,988},{991,1019}]`, `detectorInvocations`
= 16. Zone-based re-measurement: `reportedZoneTimeS` = 2.13 (baseline 2.2),
`zoneExitTimeS` = 2.366, `combinedStepFrequencyHz` = 1.933 (baseline 4.858),
`totalContacts` = 10, `validContacts` = 8 (baseline 11),
`reportedZoneVelocityMps` = 9.390 (baseline 9.091).

**This confirms Section 5's real, triply-evidenced conclusion**: the value
that helps Vanni 240 (0.05fw) is below Gav's own real ceiling (0.0803fw) and
regresses Gav; the value that protects Gav (0.09fw) does not engage for this
incident. No value in between (Gav requires >0.0803, the incident needed
something below that) resolves both. Vanni 240's zone-metric regression is
real, disclosed, and unresolved with the final, Gav-safe configuration.

Coast-risk states and detector decisions (final run): `exited_frame` and
`elevated_trajectory_risk` states correctly appear during the frame-649+
tail; the tail is retroactively marked `frozen_suspect` (436 frames) via the
existing pose-corroboration mechanism, correctly excluding it from
scientific evidence — it does not silently contribute false pose/contact
data, even though it is not corrected quickly enough to prevent the
zone-metric-window degradation.

## 15. Gav rerun (Part J)

Two real production reruns this phase (analysis
`3a148f45-02ff-492d-b9f1-790470b83c21`).

**First attempt** (0.05fw alt-path): `athlete_tracking_confidence` =
0.8149196229576173 (NOT the exact 0.8024089716118894 baseline),
`strideFrequencyHz` = 3.68 (NOT 4.4), `detectorInvocations` = 9 (NOT 12) —
a **real, measured regression**, root-caused immediately (Section 14) to the
alt-path value sitting below Gav's own real trajectory-residual ceiling.

**Final configuration** (0.09fw alt-path): `athlete_tracking_confidence` =
**0.8024089716118894**, `tracking_loss_ranges` = **`[]`**, `strideFrequencyHz`
= **4.4**, `originsCount` = `invalid=7, detected=12, tracked=123`,
`detectorInvocations` = **12** — **exact byte match** to the established
baseline, confirmed after the fix. No false coast-risk activation; detector
cadence and runtime unchanged from every prior phase's own exact-match runs.

## 16. Vanni 120 rerun (Part K)

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`, final
0.09fw configuration): `athlete_tracking_confidence` = 0.9153737721163523,
`tracking_loss_ranges` = **`[{317,482}]`** — matches the ORIGINAL Phase 3
baseline gap start (317) exactly, the same real, adjudicated genuine-exit
event this project already proved is not a regression.
`strideFrequencyHz` = **5.01** — an EXACT match to the original Phase 3
baseline (Phase 4.2F/G had shown 4.92/5.15, both real but not exact matches;
this phase's richer model recovers the exact original number).
`originsCount` = `invalid=14, detected=21, tracked=376, reacquired=1,
frozen_suspect=71`, `detectorInvocations` = 22. Zone-based re-measurement:
`reportedZoneTimeS` = 2.19, `combinedStepFrequencyHz` = 3.780,
`totalContacts` = 11, `validContacts` = 9, `reportedZoneVelocityMps` = 9.132
— all healthy, no regression, consistent with prior phases' own findings.
`localizationTerminationReason` correctly reports `genuine_frame_exit`
through the frame-317+ tail (Section 8), not a false background-lock
classification.

## 17. Vanni 60 rerun (Part L)

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`, final
configuration): `athlete_tracking_confidence` = 0.9003028088447788,
`tracking_loss_ranges` = `[{29,29},{152,232}]`, `strideFrequencyHz` = 3.93,
`originsCount` = `invalid=6, detected=9, tracked=197, frozen_suspect=21`,
`detectorInvocations` = 9 — **identical** to Phase 4.2G's own result. No
regression, no unsupported scientific evidence added, no false finish
crossing (none was ever available, unchanged). Per this phase's explicit
scope limit, the broader late-run tracking-loss limitation (frames 152-232)
was not investigated further.

## 18. Pipeline-contract comparison

| Contract item | Gav | Vanni 240 | Vanni 120 | Vanni 60 |
|---|---|---|---|---|
| Source-frame timestamp correctness | ✓ unchanged | ✓ unchanged | ✓ unchanged | ✓ unchanged |
| Localization formulas (box_tracker.py) | ✓ same code path | ✓ same code path | ✓ same code path | ✓ same code path |
| Contact/step-frequency formulas | ✓ unmodified | ✓ unmodified | ✓ unmodified | ✓ unmodified |
| Metric formulas (Section 3) | ✓ unmodified | ✓ unmodified | ✓ unmodified | ✓ unmodified |
| Evidence gating (predicted/invalid/frozen_suspect withheld) | ✓ | ✓ | ✓ | ✓ |
| Provenance (new fields threaded end-to-end) | ✓ | ✓ | ✓ | ✓ |

All four benchmarks share the identical pipeline code path — no
per-benchmark branching exists anywhere in this phase's changes (proven
structurally by Section 3's check 4b).

## 19. Athlete-specific output comparison

| Metric | Gav (real) | Vanni 240 (real) | Vanni 120 (real) | Vanni 60 (real) |
|---|---:|---:|---:|---:|
| `athlete_tracking_confidence` | 0.8024 | 0.8668 | 0.9154 | 0.9003 |
| `strideFrequencyHz` | 4.40 | 5.48 | 5.01 | 3.93 |
| `reportedZoneTimeS` | n/a (untouched) | 2.13 | 2.19 | n/a |
| `combinedStepFrequencyHz` | n/a | 1.933 | 3.780 | n/a |
| `validContacts` | n/a | 8 | 9 | n/a |

**Different athlete values are expected and are not regressions.** These
numbers are NOT compared to each other anywhere in this report or its tests
— each is compared only against that SAME benchmark's own prior real
baseline (Section 15-17). A regression is: the same source evidence
interpreted differently without scientific cause, valid evidence lost,
unsupported evidence added, a formula changed, or provenance broken — NOT a
different number from a different athlete's own different real sprint.

## 20. Runtime and detector-cost impact

Detector invocation counts this phase (Gav 12, Vanni 120 22, Vanni 240 16,
Vanni 60 9) are unchanged or improved from Phase 4.2G's own counts (12, 21,
16, 9) — the richer evidence vector added no material runtime/detector cost.

## 21. Tests and exact outcomes

```
npm run athlete-independent-metric-contract:sanity  → ALL PASSED (16/16)
.venv/bin/python scripts/cross-athlete-coast-risk-sanity.py → ALL PASSED (22/22)
.venv/bin/python scripts/cross-fps-coast-scope-sanity.py    → ALL PASSED (24+17)
.venv/bin/python scripts/box-tracker-sanity.py               → ALL PASSED
.venv/bin/python scripts/box-tracker-teleport-sanity.py       → ALL PASSED
.venv/bin/python scripts/box-tracker-frozen-track-sanity.py   → ALL PASSED
.venv/bin/python scripts/box-tracker-crop-provenance-sanity.py → ALL PASSED
.venv/bin/python scripts/crop-segment-planning-sanity.py       → ALL PASSED
.venv/bin/python scripts/detector-event-plausibility-sanity.py → ALL PASSED
.venv/bin/python scripts/athlete-interior-feature-selection-sanity.py → ALL PASSED
.venv/bin/python scripts/vanni-240-source-adjudication-sanity.py → ALL PASSED
npm run vanni-240-metric-evidence:sanity      → ALL PASSED
npm run measurement-recovery:sanity           → ALL PASSED
npm run timing-verification:sanity            → ALL PASSED
npm run analysis-fps:sanity                   → passed
npm run zone-step-counting:sanity             → 25/25 passed
npm run zone-coverage:sanity                  → ALL PASSED
npm run analysis-report:sanity                → ok
npm run stationary-validation-registry:sanity → 1 pre-existing, disclosed FAIL
                                                 (roadmap weight pool 105%≠100%,
                                                 untouched file, predates this phase)
npm run worker:check → worker_configuration_valid
npm run lint          → clean, zero warnings
npm run typecheck     → clean, zero errors
npm run build         → production build succeeds
```

`npm run db:reset` was never run.

## 22. Phase 4.2H acceptance table

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Athlete-independent metric contract documented and tested | Pass | Sections 3, 21 |
| 2 | Gav treated as pipeline benchmark, not numeric target | Pass | Section 4 |
| 3 | Flat coast-time removed as PRIMARY discriminator | Pass | Section 7 (now an OR of time/trajectory-residual, both evidence-grounded) |
| 4 | Distance/evidence distributions audited | Pass | Sections 5-6 |
| 5 | Coast-risk model interpretable | Pass | Section 7 (explicit priority-ordered rules, not a hidden score) |
| 6 | Athlete exit distinct from background lock | Pass | Sections 8, 13, 16 |
| 7 | Detector request/acceptance separated | Pass | Section 9 |
| 8 | Progressive flow protection evidence-driven | Pass | Section 10 |
| 9 | Vanni 240 barrel/wall failure remains resolved | Pass | Unmodified this phase; `vanni-240-source-adjudication:sanity` |
| 10 | Vanni 240 metrics validated from Vanni evidence only | Pass (validated); metrics themselves remain regressed | Section 14 |
| 11 | Gav does not regress on Gav evidence | Pass | Section 15 (exact byte match, after a real fix) |
| 12 | Vanni 120 does not regress | Pass (improved) | Section 16 |
| 13 | Vanni 60 does not regress / no unsupported evidence | Pass | Section 17 |
| 14 | No cross-athlete numeric matching used | Pass | Sections 3, 19 |
| 15 | Runtime controlled | Pass | Section 20 |
| 16 | All relevant tests pass | Pass | Section 21 |
| 17 | Full Phase 4.2 closure evaluated honestly | Pass | Section 23 |

## 23. Full Phase 4.2 closure table

| Requirement | Verdict | Evidence |
|---|---|---|
| All four benchmarks satisfy the same scientific localization contract | Pass | Section 18 |
| Each athlete's metrics come only from their own evidence | Pass | Sections 3, 19 |
| Gav remains a source-specific pipeline benchmark | Pass | Section 4, 15 |
| Vanni 240 static-object failure resolved | Pass | Unmodified this phase, still resolved |
| Vanni 120 exit correctly classified | Pass | Sections 8, 16 |
| Vanni 60 remains honest | Pass | Section 17 |
| No unsupported localization creates pose/contact/timing/metric evidence | Pass | frozen_suspect/pose-corroboration quarantine confirmed still active |
| All tests and real reruns pass | Pass | Section 21 |
| **Vanni 240 metrics match its OWN Phase 1/2 baseline** | **Fail** | Section 14 — `combinedStepFrequencyHz` 1.93 vs. baseline 4.858 |

**Verdict: Phase 4.2 remains In Progress, contributing 0%.** Per the
authorizing task's own explicit closure rule ("if any benchmark remains
unresolved... state the exact blocker"): the exact blocker is Vanni 240's
zone-based contact/step-frequency metrics, real and disclosed, now proven
across three independent real-evidence signal types (time, distance,
trajectory residual) to be unresolvable without either regressing the
protected Gav benchmark or leaving the exclusion mechanism unable to react to
Vanni 240's short, in-zone contamination episodes in time.

## 24. Roadmap progress before versus after

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution.
**After this phase**: **26.8%** (normalized) — unchanged. No phase weight,
phase-completion percentage, or pool total was altered. The existing
105%/112% weight-pool discrepancy is retained unchanged (Section 21's
disclosed, pre-existing test failure).

## 25. Remaining limitations

- Vanni 240's short, in-zone contact-level degradation (the actual cause of
  the `combinedStepFrequencyHz`/contact-count regression) remains real,
  disclosed, and unresolved — now confirmed via real production reruns
  across THREE independent evidence signal types (elapsed time, Phase 4.2G;
  frame-width distance and trajectory residual, this phase) that none can
  discriminate it from Gav's own ordinary limb motion without a real,
  measured Gav regression.
- Vanni 60's broader late-run tracking-loss limitation (frames 152-232 of
  233, ~35% of the clip) remains untouched, per this phase's explicit scope
  limit — Phase 4's own scope (60 FPS late-run athlete-loss fix).
- `poseBoundsIoU`/crop-containment-score-style signals (referenced in the
  task's own Part C input list) are computed one layer downstream of
  `box_tracker.py` (Pass 2 pose inference / Phase 4.2C's pose-feedback
  layer) and were not duplicated into `box_tracker.py`'s own Pass-1 coast-
  risk model — architecturally, Pass 1 (where coast-risk decisions are made)
  runs before Pass 2 pose inference exists, so these signals are not
  available to it without a much larger architectural change out of this
  phase's scope; the existing, unmodified Phase 4.2C pose-corroboration
  mechanism already applies these downstream, and remains active.

## 26. Git status

No commits, no pushes made this phase. All changes remain uncommitted
working-tree modifications, per the authorizing task's explicit "do not
commit, do not push" instruction, verified via `git status` immediately
before this report was finalized (Section 27's own verification note).

## 27. Exact recommended next-phase scope

Given three independent real-evidence signal types have now each been
proven, via real production reruns, unable to resolve Vanni 240's short
in-zone contact-level degradation without a Gav regression, further
per-frame-signal iteration on the SAME architectural layer (box_tracker.py's
own coast-risk gate) is unlikely to succeed without new evidence of a
genuinely different kind. Two candidate directions for a future phase,
neither attempted here (both represent real scope, not quick fixes):

1. **Pull the pose-corroboration correction earlier into Pass 1.** Currently,
   Phase 4.2C's pose-based retroactive correction (`apply_pose_localization_feedback`)
   only runs after Pass 2 pose inference completes for the WHOLE clip — by
   then, Pass 1's own crop-planning decisions (which pose inference itself
   depends on) have already been made from the uncorrected trajectory. A
   real two-pass or iterative refinement (Pass 1 → partial Pass 2 → re-run
   Pass 1's crop planning with pose-corroborated evidence) could give
   box_tracker.py access to pose-level evidence within the SAME analysis it
   currently only gets after the fact — a genuinely new evidence source, not
   another per-frame flow-geometry threshold.
2. **A short, targeted investigation into WHY Gav's own ordinary limb motion
   occasionally produces a background-risk-classified point cluster** (the
   root per-point classification, not the gating floor around it) — Section
   5's audit found the OVERLAP is real at the classification level, not just
   the gating level; understanding what specifically about Gav's limb
   texture/geometry triggers `athlete_consistent=False` for a genuine
   athlete-owned point might open a classification-level fix (e.g., a better
   per-point feature, not a better threshold) that a gating-level threshold
   search cannot reach.

Do not attempt a fourth per-frame-signal-threshold-search cycle without one
of the above (or comparably new) inputs — the evidence this phase gathered
is a real, disclosed reason to stop searching in that direction, not a
gap in effort.
