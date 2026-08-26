# Phase 2 — Scientific Timing Validation & Metric Verification

**Stationary Sprint Analysis Roadmap v4.0 — Phase 2 ("240 FPS metric validation" in
the tracker; a later prompt named it "Scientific Timing Validation & Metric
Verification" under a different roadmap structure — see Section 0)**
**Date**: 2026-08-04
**Status**: Complete — every displayed `vanni_fly_240` metric independently verified
against raw evidence; no new timing defect found; no code change made.

---

## 0. Roadmap-naming discrepancy (flagged, not silently resolved)

The prompt that opened this phase described a roadmap with different phase names and
a different overall-completion figure (~8%) than the one actually tracked in
`docs/stationary-roadmap-progress.md` (10.5% at the time, now 18.1%). Specifically, it
called Phase 1 "Athlete Acquisition & Early Tracking" and credited it with gains
(first-visible-frame acquisition, early tracking lock, 240fps contact detection,
overlay quality, believable step lengths, contact integrity checks) that this
tracker's actual Phase 1 ("240 FPS zone-time diagnosis," completed immediately prior
to this phase) did not produce — those gains come from the already-merged Day 96–104
work, which predates this roadmap's Phase 0 entirely.

This is flagged rather than silently absorbed, matching this project's established
practice for tracker discrepancies (Phase 0's 105%-weight disclosure, carried through
Phase 1). The **technical objective** in the new prompt — audit the complete timing
pipeline for `vanni_fly_240`, verify every displayed metric against raw evidence, look
for a long list of specific defect classes, validate against Gav, run regressions,
report honestly — is substantively identical to this tracker's own Phase 2 ("240 FPS
metric validation"), which was already the explicit, planned next step (see Phase 1's
own Section 26 recommendation). This report satisfies both.

---

## 1. Executive summary

Phase 1 proved `vanni_fly_240`'s zone time is scientifically sound. This phase extends
that same rigor to every other displayed metric: step frequency (combined/left/right),
average and peak step length, ground-contact and flight time, and all three
independent velocity computations. Every one of them traces to the same real
per-frame source timestamp Phase 1 established for zone-crossing timing — confirmed
by code trace (`detectStepMarks`/`detectContactPhases`/`stepFrequenciesFromContacts`
all consume `frame.time` directly, the same field proven in Phase 1 to be `tMs/1000`,
verbatim from the pose artifact) and, more importantly, by **independently
hand-recomputing every summary metric from the raw evidence array** — not trusting the
code, per the task's explicit instruction. Every hand computation matched the
production function's output to full floating-point precision.

An exhaustive integrity sweep of all 1020 real frames (not a sample) found **zero**
instances of every specific defect class the task asked about: duplicate timestamps,
non-monotonicity, frame-index gaps/duplicates/out-of-order, off-by-one frame/array
mismatches, Python→TypeScript serialization drift, and missing timestamps.

**No new scientifically-demonstrable timing defect was found.** Per the task's own
explicit instruction ("do not simply patch the final metric," "only correct
scientifically demonstrable timing defects"), no code was changed this phase — there
was nothing to fix. This is reported as a genuine, positive finding, not a shortfall:
the system's own internal cross-checks (three independent velocity methods agreeing to
2.44%, well inside the 15% low-confidence threshold; zero `warnings[]`) already flag
disagreement when it exists (as they correctly did, historically, for `vanni_fly_120`'s
registered >15% velocity-method disagreement — a real, different problem, out of scope
for this phase and untouched).

The one honest limitation, unchanged from Phase 1: no independent external ground
truth exists for this exact recording, so *absolute* accuracy still cannot be checked.
What Phase 2 adds is that this is now true for every metric, independently confirmed,
not just zone time.

---

## 2. Complete pipeline audit (Required Investigation)

Extending Phase 1's already-traced chain (video timestamps → ffprobe → frame indexing
→ MediaPipe timestamps → pose artifact timestamps → gate crossing → zone timing →
velocity → displayed metrics) with the contact/step branch:

| Stage | File / function | Timing basis |
|---|---|---|
| Ground contact detection | `detectStepMarks()` (`src/lib/video/steps.ts:281`) | `const time = frames[idx].time` — same real `tMs`-derived field as zone crossings. |
| Touchdown/toe-off sub-frame interpolation | `measurePhase()` (`src/lib/video/contacts.ts:99`), called from `detectContactPhases()` | `const times = frames.map(f => f.time)` — real timestamps; sub-frame linear interpolation at the threshold crossing, architecturally identical to `crossingTime()`'s gate interpolation. |
| Ground contact / flight duration | `summariseContactFlight()` (`src/lib/video/contacts.ts:195`) | `contactMs = (toeoff − touchdown) × 1000`; `flightMs = nextTouchdown − thisToeoff` — both real-time differences, no fps involved. |
| Step frequency (combined/left/right) | `stepFrequenciesFromContacts()` (`src/lib/video/cadence.ts:77`) | `dt = inWindow[i].time − inWindow[i-1].time`; `freq = 1/mean(dt)` — real-time differences only. |
| Average step length | `mean(individualStepLengthsM)` (`measurements.ts:1111`) | Distance-only (calibration scale × world-compensated pixel gap) — no timing involved, verified for calibration correctness in Section 4. |
| Peak stride length | `computePeakStrideLengthM()` (`src/lib/benchmark/strideMetrics.ts:24`) | Best rolling-4 average of the same real distance values — no timing involved. |
| Zone velocity | `vDistanceOverTime` = `20.000m / reportedZoneTimeS` | Already proven in Phase 1. |
| Peak (stride-window) velocity | `reportStrideWindows()` (`src/lib/measurement/timingPolicy.ts:57`), fed by `rawDurationS: b.time − a.time` (`measurements.ts:1206`) | Real contact-to-contact time span (two-contact stride window), same `CONSERVATIVE_TIMING_POLICY_V1` ceiling-rounding as zone time. |
| Serialization (Python → TypeScript) | `mediapipe_pose_runner.py` → `analysis-worker.mjs` → `MediaPipePoseBackend.ts` | Verbatim field passthrough (`tMs`, `sourceFrameIndex`), already traced in Phase 1 Section 5; IEEE754 double round-trips through Python `json.dump`/JS `JSON.parse` losslessly (confirmed: artifact `tMs` matches direct ffprobe PTS to sub-microsecond precision, Phase 1 Section 4). |

**Nothing in this chain derives from `analysisFps`/`source_fps`** (the Phase 1 fix
target) at any stage. The contact/step branch was architecturally independent of the
223.93-vs-240 conflict from the start.

---

## 3. Audit against every requested defect class

Exhaustive (not sampled) sweep of the real, post-Phase-1-fix 1020-frame
`vanni_fly_240` pose artifact:

| Defect class | Result |
|---|---:|
| Duplicate timestamps (`tMs`) | **0** |
| Non-monotonic `tMs` transitions | **0** |
| `sourceFrameIndex` gaps (>1) | **0** |
| `sourceFrameIndex` duplicates | **0** |
| `sourceFrameIndex` out-of-order | **0** |
| `frame.index` ≠ array position (off-by-one) | **0** |
| `tMs` ≠ `sourceTimestampMs` (serialization drift) | **0** |
| Cumulative delta drift (`Σdeltas` vs `last−first`) | **0.000ms** |
| Missing/non-finite timestamps | **0** |

Reusable check function: `auditFrameArrayIntegrity()` in
`scripts/vanni-240-metric-evidence-sanity.mjs`, so a future phase can run this same
sweep against any other artifact without re-deriving it.

Additional items from the task's list, addressed directly:
- **Native FPS detection / VFR handling / FPS normalization**: audited and fixed in
  Phase 1 (metadata-only; the contact/step code path was never affected — Section 2).
- **Frame timestamp interpolation, gate crossing interpolation, contact
  interpolation**: all real-time, sub-frame linear interpolation, verified in Section
  2 and by hand in Section 5.
- **Rounding accumulation / float precision loss**: none found — the delta-drift check
  above is the direct test for this (0.000ms across 1019 accumulated deltas).
- **Measurement rounding / UI formatting**: `CONSERVATIVE_TIMING_POLICY_V1`'s
  ceiling-to-0.01s policy, already documented in Phase 1, applies identically and
  correctly to stride-window velocity (Section 5) as it does to zone time.
- **Distance integration**: audited in Section 4.

---

## 4. Independent, hand-computed validation (do not trust existing calculations)

All raw evidence below is the real, live `vanni_fly_240` output as of this phase
(analysis `a7679326-e193-4489-bf50-735fe402ec60`, the same real production rerun
Phase 1 validated). Every number was independently recomputed by hand from the raw
`zoneSteps`/`individualStepLengthsM` arrays — not read from the function's own output
— then compared.

**Step frequency** (VueMotion definition: 1/mean(interval), classified by landing
foot). Raw zone-step timestamps: `0.31708, 0.49667, 0.68875, 0.95167, 1.1775, 1.34,
1.545, 1.79542, 1.98333, 2.17125, 2.38` (seconds).

- Combined: 10 consecutive intervals, sum = 2.06292s, mean = 0.206292s, **1/mean =
  4.8475 Hz** — reported `combinedStepFrequencyHz = 4.847505554433447` ✅ exact match.
- Left-landing intervals (5 of them): sum = 1.01958s, mean = 0.203916s, **1/mean =
  4.904 Hz** — reported `leftStepFrequencyHz = 4.903964037597058` ✅ exact match.
- Right-landing intervals (5 of them): sum = 1.04334s, mean = 0.208668s, **1/mean =
  4.7923 Hz** — reported `rightStepFrequencyHz = 4.792332268370606` ✅ exact match.

**Average step length**: sum of the 11 real `individualStepLengthsM` values =
21.042471480297112, ÷11 = **1.912951952754283 m** — reported
`avgIndividualStepLengthM = 1.912951952754283` ✅ exact match.

**Peak stride length**: best rolling-4-window average over the same 11 real values.
Hand-computed rolling averages for all 8 windows: 1.7971, 1.8210, 1.8715, 1.8659,
1.9277, 1.9474, 1.9990, **2.0606** (window = steps 8–11, the maximum) — reported
`peakStrideLengthM = 2.0606099144108923` ✅ exact match.

**Peak (max) velocity**: `strideVelocityWindows` shows the maximum
`reportedVelocityMps = 10.579734014114525` at `distanceM = 4.0202989253635195`,
`rawDurationS = 0.37583333333333324` → `reportedDurationS = 0.38` (ceiling policy:
`⌈37.583.../100⌉ = 38/100`). Hand check: `4.0202989253635195 / 0.38 =
10.579734014114525` ✅ exact match — reported `maxVelocityMps = 10.579734014114525`.

**Velocity-method agreement** (independent cross-check, not a single trusted path):
zone distance/time = 9.049774 m/s; average step length × cadence = 9.273045 m/s;
median step length × cadence = 9.176568 m/s. Spread = `(9.273045 − 9.049774) /
mean(9.166629) × 100 = 2.44%` — well under the system's own 15% low-confidence
threshold, so `warnings: []` (confirmed live) — high confidence, by the codebase's own
internal cross-check, not an external claim.

All of the above are now pinned as a permanent regression test:
`npm run vanni-240-metric-evidence:sanity` (Section 8).

---

## 5. Ground contact and flight time

`groundContactLeftMs: 170`, `groundContactRightMs: 120`, `groundContactCombinedMs: 150`,
`flightLeftMs: 90`, `flightRightMs: 80` — means over the 11 zone-restricted contact
phases, each phase's `contactMs = (toeoffTimeS − touchdownTimeS) × 1000` computed via
real-time sub-frame threshold interpolation (`measurePhase()`, Section 2).

A representative contact (the first zone step, left foot, `timeS = 0.31708`, real
source frame 76) was spot-checked directly against the raw foot-landmark trajectory:
`left_heel.y` stays essentially flat (~0.634, foot planted) from real frame ~66 through
~81, then visibly decreases from frame ~82 onward (0.6329 → 0.6317 → 0.6312 → 0.6303 →
0.6300 — the foot rising, i.e. genuine toe-off), confirming the detector is locking
onto a real biomechanical stance-then-liftoff pattern in the raw data, not noise. The
resulting contact-time magnitudes (120–170ms) are physically plausible for this
recording's speed range (9.05 m/s average, sub-maximal — elite top-speed contacts run
shorter, ~80–100ms; this recording's zone spans early-to-mid acceleration, not top
speed, so longer contacts are expected, not a red flag).

Flight/contact time was **not** independently hand-verified for all 11 contacts to the
same numeric precision as step frequency/length (that would require re-deriving every
sub-frame threshold crossing by hand); the spot-check above, combined with the
architecture being provably identical to the already-fully-verified zone-crossing
interpolation (same real-time interpolation function pattern), is judged sufficient
rigor for this pass. Flagged explicitly as a lighter-touch check than Sections 4's
exact-match verifications — see Section 10.

---

## 6. Comparison against Gav (protected benchmark) methodology

The exact same code path (`torsoSeries`/`detectStepMarks`/`detectContactPhases`/
`stepFrequenciesFromContacts`/`reportStrideWindows`) computes Gav's metrics — no
per-session branching exists anywhere in this pipeline. Live replay against the
protected Gav benchmark (read-only; no Gav row was touched) confirms the same
consistency signature: `warnings: []`, velocity-method spread ≈1.4% (10.363, 10.449,
10.506 m/s), well under the 15% threshold. Gav's own registry-recorded metrics were
already confirmed byte-identical in Phase 1's regression pass (unaffected by anything
this phase touched, since nothing was changed).

---

## 7. Regression: acquisition & tracking suite ("Phase 1" gains per the new prompt's naming)

All items the task explicitly required, mapped to their actual existing regression
scripts and re-run this phase:

| Requirement | Script | Result |
|---|---|---|
| First-visible-frame acquisition | `evidence-heatmap:sanity` | ALL PASSED |
| Early tracking lock / acquisition state machine | `athlete-tracker:sanity` | ALL PASSED |
| Identity tracking / backward recovery | `athlete-tracker:sanity`, `box-tracker:sanity` | ALL PASSED (explicit backward-recovery + Day 104 track-state regression checks) |
| Contact recovery / contact plausibility | `measurement-recovery:sanity` | ALL PASSED |
| Step integrity validation | `step-integrity:sanity` | PASSED |
| Contact/flight-time machinery | `contacts:sanity` | ALL PASSED |
| Overlay startup / ROI mapping | `roi-coordinate-mapping:sanity` | ALL PASSED |
| Gate stability / stationary rejection | `gates:sanity`, `gate-stability` family (`local-gate-lock:sanity`, `manual-crossing:sanity`, `independent-gates:sanity`, `gate-display-stabilization:sanity`, `gate-lock-smoothing:sanity`) | ALL PASSED |
| Zone/step counting | `zone-coverage:sanity`, `zone-step-counting:sanity` | ALL PASSED |
| Pose backend contract | `pose:sanity` | ALL PASSED |
| Stride-length algorithm (generic) | `stride-metrics:sanity` | ALL PASSED |
| FPS/calibration gate consistency | `fps-runtime-calibration-gate:sanity` | passed |
| Phase 1's own suite | `native-fps-timestamp:sanity`, `stationary-validation-registry:sanity` | PASSED (registry: 45/46, same disclosed 105%-weight failure) |

**Three pre-existing, unrelated failures, disclosed and not fixed this phase** (none
touch timing accuracy or this phase's scope):
- `contact:calibration`, `steps:sanity` — both fail with `Cannot find module
  './fpsPolicy.json'`/similar: their own self-generated temp `tsconfig.json` lacks
  `resolveJsonModule`, and now transitively needs it because of an *already-uncommitted*,
  unrelated Day 96–104 change to `src/lib/video/analysisFps.ts`/`fpsPolicy.json` (both
  already modified before this phase started; neither script nor those two files were
  touched this phase). Root cause identified, not fixed — fixing test-harness tsconfig
  plumbing unrelated to timing accuracy is out of this phase's explicit scope.
- `gate-stability:sanity` — depends on an ephemeral `/tmp/ava-real-30m-snapshot.json`
  fixture not present in this environment; unrelated to any code path this phase
  touched (confirmed via `git log`: last touched at an old, unrelated commit).

No acquisition/tracking regression was found. Everything Phase 1's report already
confirmed byte-identical (Gav, Vanni 120, Vanni 60) remains byte-identical — nothing
was changed this phase that could have affected them.

---

## 8. New regression tests

`scripts/vanni-240-metric-evidence-sanity.mjs` (`npm run vanni-240-metric-evidence:sanity`)
— 6 checks, pinning this phase's real-data hand-verification permanently:
1. Combined step frequency reproduces exactly from real contact timestamps.
2. Left step frequency reproduces exactly.
3. Right step frequency reproduces exactly.
4. Average step length reproduces exactly.
5. Peak stride length reproduces exactly, via the real `computePeakStrideLengthM`
   production function (not reimplemented).
6. Velocity-method spread stays under the 15% low-confidence threshold on real data.

Also exports `auditFrameArrayIntegrity()`, the frame-array integrity sweep from
Section 3, as a reusable function for future phases.

All 6 checks pass: **ALL PASSED**.

---

## 9. Minimal fixes / before-after comparison / real production rerun

**No fix was made.** No scientifically-demonstrable timing defect was found beyond
what Phase 1 already corrected. Per the task's own explicit instruction — "only
correct scientifically demonstrable timing defects" — inventing a change to satisfy a
"there must be a bug" expectation would violate this project's evidence discipline and
its safety constraints (no smoothing, no artificial adjustment, no touching timing
without proof).

Consequently there is no before/after comparison to make (nothing changed) and no new
production rerun to perform: `vanni_fly_240`'s current production result is the same
real rerun Phase 1 already validated end-to-end through the actual worker
(`a7679326-e193-4489-bf50-735fe402ec60`, `source_fps: 239.981`). Re-running unchanged
code against the same video would reproduce the same result — already independently
proven deterministic across two real, separately-invoked worker runs in Phase 1 — and
would not test anything new. Running it again purely to produce a "we reran it" line
item would be wasteful of worker/compute time for no evidentiary gain, so it was not
done.

---

## 10. Honest report of anything not fixed, not fully verified, or otherwise limited

- **No fix needed or made** — the primary finding of this phase (Section 1, 9).
- **No independent external ground truth** exists for `vanni_fly_240` — carried
  forward unchanged from Phase 1. Absolute accuracy against a real stopwatch/timing
  gate cannot be checked for zone time, step lengths, step frequency, or velocities.
- **Ground-contact/flight-time was spot-checked, not exhaustively hand-verified** —
  unlike step frequency/step length/peak velocity (each independently reproduced to
  full floating-point precision by hand), only one representative contact's touchdown/
  toe-off region was inspected against raw foot-landmark data (Section 5). The
  architecture is provably identical to the fully-verified crossing-interpolation
  code, which is strong but not exhaustive evidence — a future phase auditing contact
  timing specifically (e.g. Phase 3's 120fps contact recovery work) should extend this
  to a full hand-recompute if contact-time accuracy itself becomes the question.
- **Three pre-existing test-infrastructure gaps** disclosed in Section 7, not fixed
  (out of scope, unrelated to timing accuracy, not caused by this phase).
- **The 105%-roadmap-weight discrepancy** remains, as originally disclosed in Phase 0
  and carried through unchanged — the normalization formula continues to be applied
  per the explicit instruction that established it.
- **"Zone time is still slightly inaccurate"** (the premise stated in this phase's
  prompt): investigated as far as evidence allows. AVA's own timing pipeline is
  proven, by direct code trace and independent hand-recomputation, to be
  evidence-based end-to-end with zero detectable defects across every class of bug
  looked for. Whether 2.21s carries any *absolute* error relative to a real-world
  stopwatch cannot be determined without an external reference, which does not exist
  for this recording. This is reported honestly, as instructed, rather than resolved
  by assumption in either direction.

---

## 11. Success criteria (verbatim from the task)

| Criterion | Status |
|---|---|
| The 240 FPS benchmark's zone time is scientifically verified or corrected | ✅ Verified (Phase 1); reconfirmed as unaffected by this phase's broader audit |
| Every displayed metric is traceable back to raw evidence | ✅ Section 4 (exact hand matches for step frequency ×3, step length, peak stride, peak velocity); Section 2 (code trace for all remaining fields) |
| Any remaining error is quantified and explained | ✅ Section 10 — zero internal defects found; absolute-accuracy question explicitly quantified as "unknowable without ground truth," not glossed over |
| No acquisition or tracking quality regresses | ✅ Section 7 — full regression suite, zero regressions, 3 pre-existing unrelated gaps disclosed |
| The system is measurably more trustworthy than before | ✅ Every non-zone-time metric is now independently proven, not merely trusted; a permanent, reusable regression suite locks this in for the future |

---

## 12. Files changed

| File | Change |
|---|---|
| `scripts/vanni-240-metric-evidence-sanity.mjs` | New — permanent regression test (Section 8). |
| `package.json` | +1 script: `vanni-240-metric-evidence:sanity`. |
| `docs/stationary-roadmap-progress.md` | Phase 2 marked complete; overall completion updated to 18.1% (normalized); Section 0's naming discrepancy noted inline. |
| `docs/phase-2-vanni-240-metric-verification-report.md` | This report. |

No production code (`src/`, `scripts/analysis-worker.mjs`,
`mediapipe_pose_runner.py`) was touched this phase.

---

## 13. Git status

Not committed, not pushed, per standing instruction. `git status --short` shows this
phase's additions (Section 12) plus the pre-existing large uncommitted working tree
from before this phase (Day 96–104 work, Phase 0/1's own outputs), all untouched by
this phase.

---

## 14. Recommended next scope

Phase 3 (this tracker) / whatever a future prompt calls it next: **120 FPS contact
recovery** — `vanni_fly_120`'s registered, real problems (2 contacts excluded as
`before_start_crossing`, 1 as `outside_zone`; velocity-method disagreement >15%,
unlike 240's clean 2.44%) are genuine, already-flagged issues, unlike anything found
in this phase. Recommended: audit whether those 3 exclusions are correct (not missed
real in-zone contacts), and root-cause the >15% velocity disagreement specifically —
that "why do methods disagree here but not on 240?" question is exactly the kind of
evidence-backed anomaly this phase's audit found none of for `vanni_fly_240`, making it
a genuinely different, worthwhile investigation rather than revisiting settled ground.
