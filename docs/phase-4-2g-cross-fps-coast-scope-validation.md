# Phase 4.2G — Cross-FPS Coast-Scope Validation and Real Benchmark Closure Review

## 1. Executive summary

Phase 4.2G replaced Phase 4.2F's raw-frame-count coast-scope gate
(`BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED = 20`, an FPS-inconsistent value —
333ms at 60fps, 167ms at 120fps, 83ms at 240fps) with a time-normalized gate
(`COAST_MIN_MS_SINCE_VERIFIED`), added diagnostic coast-risk states and
provenance fields, built a deterministic cross-FPS fixture suite proving the new
gate produces equivalent behavior at equivalent elapsed time regardless of
source FPS, and reran all four required benchmarks against the real
worker/queue pipeline.

**Result: Phase 4.2 still does NOT close.** Gav (protected) is an exact
byte-identical match at `COAST_MIN_MS_SINCE_VERIFIED = 300.0`. Vanni 120 and
Vanni 60 show no regression. **Vanni 240's zone-based metrics
(`combinedStepFrequencyHz`, `reportedZoneTimeS`, contact counts) regress**
relative to both the Phase 1/2 ground-truth baseline and Phase 4.2F's own
already-imperfect ending state, because the 300ms floor Gav's exact-match
requirement demands is too conservative for Vanni 240's real drift timing.

This phase also attempted, tested, and **disproved** a natural refinement —
decoupling the exclusion gate from the soft early-detector-refresh trigger into
two separate constants — with real evidence: the "non-destructive" refresh
trigger, when lowered independently, still regressed Gav AND made Vanni 240
measurably worse (tracking fragmented into five loss ranges, confidence
collapsed to 0.554). That result is preserved in this report and in
`box_tracker.py`'s own constant docstrings as a disclosed, evidence-backed dead
end, not silently discarded.

## 2. Resumed-work scope

This phase resumed a prior session's Parts A–I (time-normalized gate design,
new coast-risk states, new provenance fields — already implemented, compiling,
and passing existing suites before this session began) without redoing them,
per the authorizing task's explicit instruction. This session's own work
covered Parts J (cross-FPS fixtures), J2 (17 time-normalization tests), K–N
(four real benchmark reruns), the decoupling experiment and its reversal, O
(cross-benchmark comparison and full Phase 4.2 closure review), the required
test suite, this report, and the roadmap update.

## 3. Vanni 120 source adjudication recap

Not redone this phase (no contrary evidence arose). The frame-317-vs-319
divergence between the Phase 3 baseline and Phase 4.2F's rerun was previously
adjudicated via real source-video frame extraction and proven to be the
athlete genuinely exiting the right side of frame — both frame numbers
identify the same real event. This phase's final rerun (Section 10 below)
independently reproduces a gap starting at frame 317, matching the original
Phase 3 baseline exactly.

## 4. The previous 20-frame rule's problem

`BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED = 20` was a raw frame count applied
uniformly across all source FPS. At 60fps that is 333ms; at 120fps, 167ms; at
240fps, 83ms. Gav (60fps) and Vanni 240 (240fps) happened to be protected by
this coincidence of scale, but Vanni 120 (120fps) shifted by 2 frames when the
same fix that helped Vanni 240 was applied — later proven a legitimate
evidence correction (Section 3), but the underlying design remained a real,
disclosed architectural risk: nothing guarantees 20 frames keeps scaling
correctly at a fifth benchmark's FPS, and the coincidence could just as easily
have broken a benchmark instead of correcting one.

## 5. The new time-normalized coast contract

`COAST_MIN_MS_SINCE_VERIFIED` (currently 300.0) gates both the per-point
background-risk EXCLUSION path (`is_partial_split` inside
`_track_via_optical_flow`) and the soft early-detector-REQUEST trigger inside
`step()`, computed from real elapsed time (`time_s - self.last_confirmed_time_s`)
rather than a frame count. It is a NECESSARY, not sufficient, condition: it
must combine with the pre-existing sustained background-risk TREND
(`recent_background_risk_ratios` averaged over `BACKGROUND_RISK_TREND_WINDOW=4`
frames, ≥ `BACKGROUND_RISK_ACT_MIN_RATIO`/`BACKGROUND_RISK_FORCED_REFRESH_RATIO`
depending on the path) before anything acts. Time alone never triggers
anything; sustained real evidence does, and that evidence is derived from
per-frame flow geometry, so it naturally normalizes across FPS.

## 6. Coast-risk states

`_coast_risk_state(time_since_verified_ms, flow_quality_degrading)` returns a
purely diagnostic label — never read back by any acceptance/rejection logic —
with priority order: `reacquiring` (track_state) > `refresh_required`
(`_force_detector_next`) > `flow_degrading` > `recently_confirmed` (time is
`None` or below the floor) > `long_coast` (≥ `COAST_LONG_MS = 700.0`) >
`elevated_coast_risk` (≥ `COAST_ELEVATED_MS = 400.0`) > `normal_coast`
(default). Both boundary constants were raised alongside
`COAST_MIN_MS_SINCE_VERIFIED`'s own rise to 300 to keep the state ordering
reachable (`COAST_ELEVATED_MS` must exceed the floor or `elevated_coast_risk`
becomes an unreachable state).

## 7. New provenance fields

`BoxTrackFrame` gained seven new fields this engagement:
`timeSinceVerifiedDetectorMs`, `distanceSinceVerifiedDetectorPx`,
`distanceSinceVerifiedDetectorFrameWidths`, `coastRiskState`,
`coastRiskSignals`, `flowProtectionActive`, `flowProtectionReason` (values:
`"sustained_background_risk_during_coast"`, `"insufficient_coast_time"`,
`"risk_not_sustained"`, or `None`). All are additive to `__slots__` and
threaded through `mediapipe_pose_runner.py`'s persisted frame object as
developer-visibility diagnostics — never consulted by metrics/contact logic
downstream, matching the same non-scientific-evidence contract every prior
diagnostic field in this module follows.

## 8. Cross-FPS fixture design

`scripts/cross-fps-coast-scope-sanity.py` (new this phase) builds fully
synthetic, deterministic tracker fixtures at 60/120/240fps covering 8 required
scenarios: frequent re-confirmation, legitimate short coast, long-safe-coast
(real consistent motion), long-unsafe-coast (background contamination),
high-speed-coast-near-static-structure, rejected-detector-events-during-coast,
verified-reacquisition, and genuine-athlete-exit-from-frame. Each scenario
loops over all three FPS values and asserts the SAME qualitative outcome
(state, `flowProtectionActive`, exclusion behavior) regardless of FPS, proving
equivalent elapsed time — not identical frame counts — drives the gate.

A real off-by-one bug was found and fixed in the test harness itself (not
production code): `lock_in()`'s returned frame/time already represents one
frame-interval past the confirming frame's own timestamp, so `coast()`'s naive
`duration_ms → frame count` conversion silently added one extra frame-interval
of real elapsed time — enough to move specific test points across a threshold
boundary inconsistently by FPS. Fixed by subtracting one frame from the
computed frame count; verified this does not exist in `box_tracker.py` itself,
which always computes elapsed time directly from two real timestamps.

## 9. Cross-FPS fixture results

All 8 scenarios × 3 FPS values (24 checks) plus the 17 Part J2 time-
normalization checks pass on the final code state (single coupled
`COAST_MIN_MS_SINCE_VERIFIED = 300.0`, no decoupled second constant):

```
$ npm run cross-fps-coast-scope:sanity
... 24 scenario checks + 17 J2 checks ...
ALL PASSED
```

Key proof (J2.1-3): a 100ms coast produces `recently_confirmed` at all three
FPS; a 167ms coast produces `recently_confirmed` at all three FPS; a 333ms
coast produces `normal_coast` at all three FPS — identical qualitative state
at identical elapsed time, regardless of source FPS or raw frame count (J2.4
separately proves the same 3-frame count produces different real elapsed time,
and therefore can produce different states, at 60fps vs 240fps — confirming
state is keyed on source time, not frame count).

## 10. Vanni 120 rerun (Part K)

Real production rerun via the normal worker/RPC pathway (analysis
`6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`, session `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff`,
120fps, 483 frames):

- `athlete_tracking_confidence`: **0.9083771695135671**
- `tracking_loss_ranges`: **`[{317,482}]`** — matches the ORIGINAL Phase 3
  baseline gap start (317) exactly, an improvement over Phase 4.2F's shifted
  319 start
- `strideFrequencyHz`: **5.15** (Phase 3 baseline: 5.01; Phase 4.2F: 4.92)
- `originsCount`: `invalid=12, detected=22, tracked=363, frozen_suspect=86`
- `detectorInvocations`: **22**
- Zone-based measurements (`computeSprintMeasurements`, real session
  calibration): `zoneEntryTimeS=0.236`, `zoneExitTimeS=2.419`,
  `reportedZoneTimeS=2.19`, `totalContacts=11`, `validContacts=9`,
  `avgIndividualStepLengthM=1.860`, `peakStrideLengthM=1.925`,
  `combinedStepFrequencyHz=3.794`, `reportedZoneVelocityMps=9.132`,
  `reportedMaxVelocityMps=10.854`

No regression. The frame-215-incident correction remains fully intact, and the
gap-start now matches the original baseline more closely than Phase 4.2F's own
result did — a genuine improvement, not just parity.

## 11. Vanni 240 rerun (Part L)

Real production rerun (analysis `a7679326-e193-4489-bf50-735fe402ec60`,
session `31fe352b-f00f-4a80-b20a-17c2ab08ec5a`, 240fps, 1020 frames), final
coupled-constant configuration:

- `athlete_tracking_confidence`: **0.8667961583677122**
- `tracking_loss_ranges`: **`[{149,174},{180,183},{666,977},{979,988},{991,1019}]`**
  — five ranges, fragmented in the back half of the clip; Phase 4.2F's own
  ending state had four ranges (`[{149,174},{180,183},{668,672},{675,1019}]`)
  with less internal fragmentation
- `strideFrequencyHz`: **5.48**
- `originsCount`: `invalid=18, detected=16, tracked=550, frozen_suspect=436`
- `detectorInvocations`: **16**
- Zone-based measurements: `zoneEntryTimeS=0.246`, `zoneExitTimeS=2.366`,
  **`reportedZoneTimeS=2.13`** (Phase 1/2 baseline: 2.2; Phase 4.2F: 2.2),
  `totalContacts=10`, `validContacts=8` (baseline: 14/11; Phase 4.2F: 8 valid
  — matches 4.2F, still short of baseline),
  `avgIndividualStepLengthM=2.057`, `peakStrideLengthM=2.057`,
  **`combinedStepFrequencyHz=1.933`** (baseline: 4.858; Phase 4.2F: 3.70 — a
  further regression from Phase 4.2F's own already-imperfect number),
  `reportedZoneVelocityMps=9.390` (baseline: 9.091), `reportedMaxVelocityMps=9.423`
  (baseline: 10.58)

**This is a real, disclosed regression**, both against the Phase 1/2 ground-
truth baseline and against Phase 4.2F's own ending state. Root cause: at
`COAST_MIN_MS_SINCE_VERIFIED = 300.0` (the value Gav's exact-match requirement
demands), the coasting-scope defense engages too late in Vanni 240's real long
coasts to prevent drift from compounding by the time the clip reaches its
finish zone — the same mechanism that protects Gav from a false trigger during
short, frequent reconfirmation cycles is, at this value, too slow to rescue
Vanni 240's much longer real coasts before real damage accumulates.

Determinism was not re-verified with a second identical rerun this phase
(unlike Phase 4.2F's two-rerun practice for Gav) given the result is already
understood to be a real, mechanistically-explained regression rather than a
borderline pass/fail call — reproducing the exact same regressed numbers a
second time would not change the Section 17 conclusion.

## 12. Gav rerun (Part M)

Real production rerun (analysis `3a148f45-02ff-492d-b9f1-790470b83c21`,
session `e04a7983-7406-4a00-bb89-8ada7b10bf9f`, 60fps, 142 frames), confirmed
on the final, live, reverted code state:

- `athlete_tracking_confidence`: **0.8024089716118894** — exact match to
  established baseline
- `tracking_loss_ranges`: **`[]`** — exact match
- `strideFrequencyHz`: **4.4** — exact match
- `originsCount`: `invalid=7, detected=12, tracked=123` — exact match
- `detectorInvocations`: **12** — exact match

**Exact byte match**, confirmed on the final code twice within this phase (once
via an isolation test reverting the decoupled refresh-trigger constant back to
300, once as the final post-revert confirmation rerun — both produced
identical numbers).

## 13. Vanni 60 rerun (Part N)

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`,
session `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d`, 60fps, 233 frames):

- `athlete_tracking_confidence`: **0.9003028088447788** (Phase 4.2F: 0.8985 —
  effectively unchanged)
- `tracking_loss_ranges`: **`[{29,29},{152,232}]`** — identical to Phase 4.2F
- `strideFrequencyHz`: **3.93** — identical to Phase 4.2F
- `originsCount`: `invalid=6, detected=9, tracked=197, frozen_suspect=21` —
  identical to Phase 4.2F
- `detectorInvocations`: **9** — identical to Phase 4.2F

No baseline exists to regress against (established precedent from Phase 4.2C
onward); this result is functionally identical to Phase 4.2F's own, confirming
no regression. Per this phase's explicit scope limit, Vanni 60's broader
late-run tracking-loss limitation (frames 152–232, ~35% of the clip) was not
investigated further — that is Phase 4's own scope.

## 14. The decoupling experiment (attempted, disproved, reverted)

Before arriving at the single coupled 300ms value above, this phase attempted
the natural next hypothesis: since the exclusion path changes box computation
but the soft refresh-request path merely asks for an earlier detector call
(which still has to pass the same acceptance checks as any other event),
perhaps the refresh-request floor could safely stay low (~100ms, helping Vanni
240) while the exclusion floor stayed high (~300ms, protecting Gav) as two
independent constants (`COAST_MIN_MS_SINCE_VERIFIED` /
`COAST_REFRESH_REQUEST_MIN_MS`).

Real production reruns disproved this on both sides:

- **Gav still regressed** with the refresh floor alone lowered to 100ms:
  confidence 0.8100377756583924 (vs. the exact 0.8024089716118894), 13 vs. 12
  detector invocations. Gav's own real limb motion transiently crosses the
  sustained background-risk trend bar within its first ~100–300ms of
  coasting, and an early-requested detector call, once ACCEPTED, still
  measurably shifts box state — the "request-only, non-destructive" premise
  was false in practice.
- **Vanni 240 got dramatically worse**, not better, with the same decoupled
  configuration (exclusion=300ms / request=100ms): `athlete_tracking_confidence`
  collapsed to **0.5536547840385786**, and `tracking_loss_ranges` fragmented
  from a coherent shape into five gaps including a new severe span
  (`[{149,174},{180,183},{661,661},{663,871},{881,1014}]`). Requesting a
  detector call before the exclusion floor has had a chance to clean up
  drifted flow points feeds the detector a still-contaminated prediction
  window, producing spurious rejections/reacquisitions worse than either flat
  value alone.

**Conclusion**: the exclusion and refresh-request behaviors are not
independent — they must move together as one coupled floor. Both isolation
tests are preserved as documented, disclosed evidence in `box_tracker.py`'s
own constant docstring (not silently discarded), so a future session does not
re-attempt the same disproved hypothesis without cause.

## 15. Cross-benchmark comparison

| Benchmark | Confidence | Tracking-loss ranges | Detector invocations | vs. established baseline |
|---|---:|---|---:|---|
| **Gav** (protected) | 0.8024089716118894 | `[]` | 12 | **Exact byte match** |
| **Vanni 240** | 0.8667961583677122 | `[{149,174},{180,183},{666,977},{979,988},{991,1019}]` | 16 | **Regressed**: zone time 2.13 (was 2.2), step frequency 1.93 (was 4.858/3.70), valid contacts 8 (was 11) |
| **Vanni 120** | 0.9083771695135671 | `[{317,482}]` | 22 | No regression; gap start now matches the ORIGINAL baseline more closely than Phase 4.2F did |
| **Vanni 60** | 0.9003028088447788 | `[{29,29},{152,232}]` | 9 | No regression; functionally identical to Phase 4.2F |

## 16. Runtime and detector-cost impact

Detector invocation counts this phase (Gav 12, Vanni 120 22, Vanni 240 16,
Vanni 60 9) are all within the same order of magnitude as Phase 4.2F's own
counts (Gav 12, Vanni 120 21, Vanni 240 18, Vanni 60 9) — the time-normalized
gate did not materially change detector cost relative to the frame-count gate
it replaced. No new runtime instrumentation was added this phase.

## 17. Files changed

- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — replaced
  `BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED` (frame count) with
  `COAST_MIN_MS_SINCE_VERIFIED` (elapsed time, ms); raised
  `COAST_ELEVATED_MS`/`COAST_LONG_MS` to keep diagnostic state ordering
  reachable; added `_coast_risk_state`; added seven new `BoxTrackFrame`
  provenance fields; added and then reverted a decoupled
  `COAST_REFRESH_REQUEST_MIN_MS` constant (real evidence disproved it — see
  Section 14); extensive docstring updates documenting the real cross-
  benchmark tuning history (100ms/180ms/300ms/decoupled) for future sessions.
- `scripts/cross-fps-coast-scope-sanity.py` — new, 8 scenarios × 3 FPS (24
  checks) + 17 Part J2 time-normalization checks.
- `scripts/athlete-interior-feature-selection-sanity.py` — import and two
  vestigial frame-count assignments updated to the new constant name; one
  check label updated.
- `scripts/phase-4-2g-vanni-120-measurements.mjs` — new, zone-based
  measurements for Vanni 120 (adapted from the existing Vanni 240 script).
- `package.json` — new `cross-fps-coast-scope:sanity` script entry.

## 18. Database changes

None beyond the normal, expected effect of real production reruns
(`save_working_analysis_snapshot`/`replace_working_analysis`) — new immutable
saved snapshots for Gav, Vanni 240 (×2), Vanni 120, and Vanni 60 pre-rerun
states. No manual mutation of the protected Gav benchmark. No `db:reset` was
run.

## 19. Tests and exact results

```
npm run cross-fps-coast-scope:sanity           → ALL PASSED (24 + 17 checks)
npm run athlete-interior-feature-selection:sanity → ALL PASSED (24/24)
npm run box-tracker:sanity                     → ALL PASSED
npm run box-tracker-teleport:sanity            → ALL PASSED
npm run box-tracker-frozen-track:sanity        → ALL PASSED
npm run box-tracker-crop-provenance:sanity     → ALL PASSED
npm run crop-segment-planning:sanity           → ALL PASSED
npm run detector-event-plausibility:sanity     → ALL PASSED
npm run vanni-240-source-adjudication:sanity   → ALL PASSED
npm run vanni-240-metric-evidence:sanity       → ALL PASSED
npm run measurement-recovery:sanity            → ALL PASSED
npm run timing-verification:sanity             → ALL PASSED
npm run analysis-fps:sanity                    → passed
npm run zone-step-counting:sanity              → 25/25 passed
npm run zone-coverage:sanity                   → ALL PASSED
npm run analysis-report:sanity                 → ok
npm run stationary-validation-registry:sanity  → 1 pre-existing, disclosed FAIL
                                                  (roadmap weight pool 105%≠100%
                                                  — see Section 20, not caused
                                                  by this phase, untouched file)
npm run worker:check                           → worker_configuration_valid
npm run lint                                   → clean, zero warnings
npm run typecheck                              → clean, zero errors
npm run build                                  → production build succeeds
```

The single failing check (`stationary-validation-registry:sanity`'s exact-100%
weight-pool assertion) is a pre-existing, disclosed condition from a prior
phase's roadmap-structure insertions (see `docs/stationary-roadmap-progress.md`'s
own top-of-file discrepancy note) — this phase never touched
`docs/stationary-roadmap-progress.md` before this test run, confirmed via
`git status` showing it as untracked and unmodified at that point.

## 20. Phase 4.2G acceptance table

| Item | Requirement | Verdict | Evidence |
|---|---|---|---|
| J | 8 cross-FPS deterministic fixture scenarios × 60/120/240fps | Pass | Section 9 |
| J2 | 17 time-normalization tests | Pass | Section 9 |
| K | Vanni 120 real rerun, no regression | Pass | Section 10 |
| L | Vanni 240 real rerun, zone metrics recovered | **Fail** | Section 11 |
| M | Gav real rerun, exact byte match | Pass | Section 12 |
| N | Vanni 60 real rerun, no regression | Pass | Section 13 |
| O | Cross-benchmark comparison + closure review | Pass (this section/Section 21) | Sections 15, 21 |
| — | No per-FPS magic numbers introduced | Pass | Single `COAST_MIN_MS_SINCE_VERIFIED` used identically at all FPS |
| — | Vanni 240 barrel protections not weakened | Pass | `is_partial_split`'s athlete-interior classification logic unchanged this phase |
| — | Vanni 120 source adjudication not redone without cause | Pass | Section 3 — no contrary evidence arose |
| — | No commit, no push | Pass | Section 24 |

## 21. Full Phase 4.2 closure review

Re-evaluating every criterion across all subphases with real, current evidence:

| Subphase | Criterion | Verdict | Evidence |
|---|---|---|---|
| 4.1 | Box tracker teleport rejection | Pass | `box-tracker-teleport:sanity` (Section 19) |
| 4.2B | Frozen-track detection wired, real Vanni 120 validation | Pass | Unmodified this phase; `box-tracker-frozen-track:sanity` |
| 4.2C | Crop-handoff provenance, bounded pose feedback | Pass | Unmodified this phase; `box-tracker-crop-provenance:sanity` |
| 4.2D | Segment-aware crop planning (whole-clip-fit distortion fixed) | Pass | Unmodified this phase; `crop-segment-planning:sanity` |
| 4.2E | Detector-event-plausibility defect (barrel/wall false-positive lock) | Pass | Unmodified this phase; `detector-event-plausibility:sanity`, `vanni-240-source-adjudication:sanity` |
| 4.2F | Athlete-interior optical-flow feature selection | Pass | Unmodified this phase; `athlete-interior-feature-selection:sanity` |
| 4.2G | Time-normalized coast-scope gate, cross-FPS proof | Pass (mechanism) / **Blocked** (Vanni 240 outcome) | Sections 9, 11 |
| 4.2 overall | Gav protected and byte-identical | Pass | Section 12 |
| 4.2 overall | Vanni 120 no regression | Pass | Section 10 |
| 4.2 overall | Vanni 60 no regression | Pass | Section 13 |
| 4.2 overall | Vanni 240 matches its Phase 1/2 baseline (zone time, step frequency, contacts) | **Fail** | Section 11 |
| 4.2 overall | No per-FPS magic numbers | Pass | Single constant, all FPS |
| 4.2 overall | ALL FOUR benchmarks pass before awarding credit | **Not met** | Vanni 240 blocks |

**Verdict: Phase 4.2 remains In Progress, contributing 0%.** The one
unresolved item — Vanni 240's zone-based metrics — is the same class of
finding this phase's own closure criteria explicitly anticipated: "do not
award completion based only on code or unit tests; real benchmark validation
is required," and "one regression blocks full credit."

## 22. Roadmap arithmetic

Unchanged from Phase 4.2F. Weight pool remains 112% as specified (105%
original + 4% Phase 4.1 insertion + 3% Phase 4.2 insertion), normalized to
100%. Phase 4.2's own weight (3%) continues to contribute 0.0% toward the
weighted sum, since it has not closed.

## 23. Roadmap progress before/after

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution, per Phase 4.2F's own recorded state.
**After this phase**: **26.8%** (normalized) — unchanged. Phase 4.2 remains In
Progress, 0% contribution. No phase weight, phase-completion percentage, or
pool total was altered by this phase's real findings.

## 24. Remaining limitations

- Vanni 240's zone-based metrics (`combinedStepFrequencyHz`,
  `reportedZoneTimeS`, contact counts) remain regressed relative to the Phase
  1/2 ground-truth baseline, and now also relative to Phase 4.2F's own
  ending state, at the coast-time floor Gav's exact-match requirement
  demands. This is a real, evidence-proven architectural tension between two
  hard requirements (Gav byte-identity vs. Vanni 240 zone-metric recovery)
  that a flat time-based floor — coupled or decoupled into two constants —
  cannot resolve. See Section 14 for the disproved decoupling attempt.
- Vanni 60's broader late-run tracking-loss limitation (frames 152–232 of
  233, ~35% of the clip) remains untouched, per this phase's explicit scope
  limit — that is Phase 4's own scope (60 FPS late-run athlete-loss fix).
- Vanni 240's `tracking_loss_ranges` fragmented into five discrete ranges
  this phase versus Phase 4.2F's four — a real, disclosed side effect of the
  same coast-time floor, not separately root-caused this phase.

## 25. Exact recommended next-phase scope

A genuinely new discriminator is needed — not another flat millisecond value.
The most promising, evidence-grounded candidate not yet attempted: gate on
real DISTANCE traveled since the last verified detector confirmation
(`distanceSinceVerifiedDetectorFrameWidths`, already computed and threaded
this phase as a provenance field, though never wired into any acceptance
decision) rather than, or in addition to, elapsed time. Gav is a stationary
reference — its box barely moves in frame-width terms regardless of how much
wall-clock time passes, so a distance floor would naturally stay dormant for
it independent of any time value; Vanni 240 is a sprinting benchmark whose box
covers real distance quickly, so a distance floor would naturally activate
protection early exactly when real drift risk from fast motion is high. This
is resolution-and-FPS-independent (frame-width normalized) and does not
introduce a per-benchmark or per-FPS magic number — but it is a genuinely new
mechanism requiring its own tuning-and-validation cycle (its own threshold
must be found via real reruns, the same iterative process this phase used for
the time floor), so it was not attempted this phase given the real risk of
repeating Section 14's outcome without dedicated scope for it. Recommended as
the explicit Phase 4.2H scope.

## Git status

No commits, no pushes made this phase. All changes remain uncommitted working-
tree modifications, per the authorizing task's explicit "do not commit, do not
push" instruction, verified via `git status` immediately before this report
was finalized.
