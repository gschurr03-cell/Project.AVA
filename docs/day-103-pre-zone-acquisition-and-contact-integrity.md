# Project AVA
## Pre-Zone Acquisition Corridor and Contact-Sequence Integrity — Vanni 240fps Stationary Fly (Day 103)

Status: Two real, validated production-path fixes, implemented and confirmed
against the real Vanni clip with a live worker end-to-end (not simulated).
No panning logic was touched. No Athlete Intelligence code was touched. No
evidence threshold was relaxed — one distance ceiling was tightened (4 m →
evidence-based, ≈3 m fallback) and new checks were added, nothing loosened.
No database schema/migration/manual row changes were made — the only writes
were the existing, unmodified `replace_working_analysis`/worker RPCs queuing
and completing two ordinary reruns of the same real session. Nothing was
committed or pushed.

This is a direct continuation of [Day 100](day-100-early-zone-evidence-recovery-audit.md)/
[101](day-101-identity-acquisition-redesign.md)/[102](day-102-identity-persistence-and-overlay-alignment.md):
those audits fixed *false-lock* acquisition and characterized (but did not
fix) post-lock optical-flow drift. This audit found and fixed a third,
distinct defect — the acquisition *region* itself was defined relative to
the raw video frame, not the coach's calibrated start gate — and a fourth,
independent defect in step-length computation that let a gap containing a
missed contact be displayed as one physically-impossible step.

---

## 1. Exact cause of late acquisition

`_near_entry()` (`src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`,
pre-Day-103) gated acquisition purely on **normalized SOURCE-FRAME position**:

```python
def _near_entry(c, direction):
    if direction == "left_to_right":
        return c.cx <= ACQUISITION_ENTRY_BAND   # 0.4
    if direction == "right_to_left":
        return c.cx >= (1.0 - ACQUISITION_ENTRY_BAND)
    return True
```

`ACQUISITION_ENTRY_BAND = 0.4` — a flat 40% of the raw video frame width,
with **no reference at all** to `sessions.calibration_gates` (the coach's
actual confirmed start gate), no y-bound, and no relationship to where the
gate sits relative to the frame edge. This is confirmed directly from the
code, not inferred: no `calibration_gates`/gate coordinates were passed into
the Python pose runner at all before this session — `mediapipe_pose_runner.py`
took only `--travel-direction`, never a gate position (verified by reading
`main()`'s `argparse` definitions and every `AthleteTracker(...)` call site).

On the real Vanni clip, the calibrated start gate sits at **x≈0.137**
(midpoint of `startGate.c1`/`c2`, normalized source-frame x — see §2), well
inside the frame, not near either edge. The 0–0.4 frame-edge band happened to
*contain* that gate, so on this clip the acquisition region wasn't
categorically wrong, but it was accidentally right for the wrong reason: it
extended 0.4 of the way across the *whole frame* regardless of where the
gate actually was, including a large stretch already *inside* the 20 m zone
(x 0.137–0.4), while giving zero special priority to the genuine pre-zone
approach corridor. On a session with a different camera framing (gate
further from the edge, or on the opposite side than the band assumes), this
same code would silently fail to include the real pre-zone region at all.

Direct visual confirmation (real frames extracted from the real source
video, `sprint-videos/…/227ae200-….mov`): at source frame 1300 (t=5.43s) the
athlete is genuinely visible, standing at the actual start blocks next to
the yellow start-gate cones, at pixel x≈15–85 of 1920 (≈x=0.02–0.04
normalized) — comfortably inside both the old band and the new corridor —
but *tiny* (≈70×80px). The identity tracker's own `MIN_LANDMARK_COMPLETENESS`
requirement (unchanged, Day 100/101-verified) is what actually delays
acquisition at that distance, not the region gate. The real, measured
improvement from this session's fix (§4/§11) shows this bottleneck is not
absolute — a corridor that also tolerates the athlete first becoming fully
resolvable a short distance *after* the gate (§3) recovers substantially
more real evidence than the old frame-edge band did on this same clip.

---

## 2. Old acquisition-region geometry

| Property | Value |
|---|---|
| Basis | Raw source-frame edge (`cx`), no calibration input |
| Left-to-right region | `cx ∈ [0.0, 0.4]` |
| Right-to-left region | `cx ∈ [0.6, 1.0]` |
| Vertical (y) bound | None |
| Relationship to calibrated gate | None — gate coordinates were never passed to Python |
| Rejection reason logged | `"outside_entry_region"` (no bounds, no distance-to-gate, no candidate center in the diagnostic) |

---

## 3. New pre-zone corridor geometry

Threaded end-to-end: `sessions.calibration_gates.startGate` (the same gate
bar `gateMidpoint()`/`gatesToManualPoints()` already reduce for the
measurement engine, `src/lib/calibration/gates.ts`) → `analysis-worker.mjs`
reduces it to a midpoint (`entryGate = {x, y}`) exactly the same way → new
`PoseEstimateOptions.entryGate` → `PythonMediaPipePoseService.ts` appends
`--entry-gate-x`/`--entry-gate-y` → `mediapipe_pose_runner.py` passes it into
`AthleteTracker(entry_gate=(x, y))` → `_near_entry()`.

```python
ENTRY_CORRIDOR_DEPTH_BEFORE_GATE = 0.35   # backward from the gate (pre-zone)
ENTRY_CORRIDOR_DEPTH_AFTER_GATE  = 0.15   # forward, into the zone (bounded tolerance)
ENTRY_CORRIDOR_HALF_HEIGHT       = 0.30   # vertical band around the gate's own y

def _near_entry(c, direction, entry_gate=None):
    if entry_gate is not None and direction in ("left_to_right", "right_to_left"):
        gate_x, gate_y = entry_gate
        if direction == "left_to_right":
            lo, hi = gate_x - DEPTH_BEFORE, gate_x + DEPTH_AFTER
        else:
            lo, hi = gate_x - DEPTH_AFTER, gate_x + DEPTH_BEFORE
        if not (lo <= c.cx <= hi):
            return False
        if gate_y is not None and abs(c.cy - gate_y) > HALF_HEIGHT:
            return False
        return True
    # No calibrated gate available (e.g. uncalibrated preview run) — unchanged fallback.
    ...
```

For the real Vanni gate (x≈0.1369, y≈0.5873, `left_to_right`): corridor =
`x ∈ [0.0 (clipped from −0.213), 0.287]`, `y ∈ [0.287, 0.887]` — bounded,
gate-relative, and **narrower** on the upper x-bound than the old band
(0.287 vs 0.4), while extending the *pre-zone* concept the old band never
had at all.

`ENTRY_CORRIDOR_DEPTH_AFTER_GATE` (into the zone) exists specifically
because a strictly pre-zone-only corridor would have been a regression on
this real clip: the athlete's first fully-resolvable position (§1) sits a
short distance past the gate, not before it, on this camera framing. A
corridor that ONLY extended backward would have excluded exactly the
position where real acquisition succeeds, making things *worse*. This is
reported plainly, not hidden: the "pre-zone" framing in this task's
objective is the acquisition **intent** (earn identity before the gate
whenever the evidence supports it — §11 shows the real per-run pose-window
timeline does now begin well before crossing); the small forward allowance
is a deliberately bounded tolerance for cases where full complete/confident
detection genuinely lags the gate crossing itself, not a second acquisition
zone.

**Diagnostics persisted** (`_entry_corridor_bounds()` /
`_entry_rejection_diagnostics()`, new): every corridor rejection now carries
`candidateCenter`, `corridorBounds` (`{kind, xMin, xMax, yMin, yMax, gateX,
gateY}`), `distanceToGate`, and `configuredDirection` — `rejectionReason` is
`"outside_entry_corridor"` when a calibrated gate is active, `"outside_entry_region"`
for the legacy frame-edge fallback (distinguishable in logs/artifacts).

---

## 4. First detection/lock/pose frames before vs. after

| Milestone | Before | After |
|---|---|---|
| First frame with ANY pose landmark | 1487 (t=6.209s) | **1179 (t=4.923s)** |
| First identity CANDIDATE/VERIFYING pose evidence | 1487–1520 (sparse) | 1179–1520 (sparse, same mechanism: `plan_crops` extrapolation around eventual lock) |
| Identity LOCKED (first TRACKED frame) | 1521 (t=6.351s) | **1521 (t=6.351s) — unchanged** |
| Main contiguous real-pose window | 1488–1648 (161 frames) | **1501–1995 (495 frames)** |
| First accepted contact | 1504 (t=6.280s) | 1585\* (t=6.618s, anchor — see §6) |
| Last usable contact | 1646 (t=6.873s) | 1960 (t=8.184s) |

\* The first *counted* contact shifts later even though evidence starts much
earlier, because more real contacts now survive between the gate and the
first fully-valid interval — see §6/§11 for the full sequence.

The lock frame itself (1521) is **unchanged** — on this specific clip the
position where the athlete first becomes a verifiable candidate happens to
fall inside both the old band and the new corridor, so this fix's dominant,
measured effect on this clip is not an earlier lock instant but
**dramatically better evidence density both before and after it**
(1179 vs 1487 first landmark; 495 vs 161 frames of contiguous real pose
data). This is reported exactly as measured, not reframed to claim an
earlier lock that didn't happen on this clip.

---

## 5. Contact timeline (before vs. after, full-run detector — calibration-independent)

**Before** (`buildFullRunEvents`, no zone filter — 3 total contacts across the whole clip):

| # | Side | Frame | Time (s) | Gap to prev |
|---|---|---|---|---|
| 1 | left | 1504 | 6.280 | — |
| 2 | right | 1544 | 6.447 | 167 ms |
| 3 | left | 1646 | 6.873 | 426 ms |

**After** (8 total contacts):

| # | Side | Frame | Time (s) | Gap to prev |
|---|---|---|---|---|
| 1 | left | 1585 | 6.618 | — |
| 2 | right | 1648 | 6.881 | 263 ms |
| 3 | left | 1702 | 7.107 | 226 ms |
| 4 | right | 1738 | 7.257 | 150 ms |
| 5 | left | 1809 | 7.554 | 297 ms |
| 6 | right | 1850 | 7.725 | 171 ms |
| 7 | left | 1909 | 7.971 | 246 ms |
| 8 | right | 1960 | 8.184 | 213 ms |

Every after-fix gap is within the project's established 150–320 ms
plausible-step-duration window (`SprintAnalyzer.ts`) — a real, physically
coherent alternating-foot cadence, not an artifact of the fix. Contact #8
(frame 1960) lies past the finish gate (x≈0.882) and is correctly excluded
from in-zone step math by existing zone-classification logic (unchanged).

---

## 6. Exact origin of the pathological interval (the "3.79 m" pattern; 7.19 m on this exact artifact)

Using the real, currently-stored production artifact for this session
(analysis `27ed40b1-…`, before this session's fix) replayed through the
real, unmodified `computeSprintMeasurements`:

- **Contact A**: frame 1544, **right** foot, t=6.447s
- **Contact B**: frame 1646, **left** foot, t=6.873s
- Elapsed time: **426 ms** (plausible single-step ceiling: 320 ms)
- World distance: **7.19 m** (physically impossible for one ground contact —
  elite sprint step length tops out around 2.5–2.8 m)
- Foot sequence: **opposite feet** (right → left) — this is exactly why it
  passed every check that existed before this session: it is not a same-foot
  duplicate (`non_alternating_sequence` would have caught that), and 7.19 m
  was under the old flat 4 m ceiling used by `zoneStepAnalysis.ts` — but the
  **legacy, unanchored fallback path in `measurements.ts`** (active for this
  session, because camera-tracking coverage was too sparse for the
  world-anchored path) had **no plausibility check of any kind** — it
  reported `distanceMetersFromPrev` directly, however large.
- All possible intermediate candidates between A and B: **none** — the
  full-run detector (`detectStepMarks`, calibration-independent) found
  exactly 3 contacts in the entire clip before this session's fix; there is
  no rejected/lower-confidence intermediate contact to recover — the real
  intermediate foot-strike was never detected at all, consistent with
  Day 102's finding that real pose evidence for this clip collapses hard
  after frame 1648.
- Expected classification: this is exactly a **merged interval** — the
  athlete's real cadence (confirmed post-fix, §5) is ~150–300 ms per step;
  426 ms/7.19 m is what two (or more) real steps look like once one
  intermediate contact goes undetected, not one long stride.

---

## 7. Missing-contact integrity fix

New module: `src/lib/video/stepIntegrity.ts` — pure, deterministic,
shared by both call sites that turn a contact gap into a step length.

```ts
export function evaluateStepInterval(input: {
  fromSide, toSide, durationS, distanceM, neighborDistancesM?: number[]
}): { valid: boolean; reasons: StepIntegrityReason[] }
```

Checks (mirrors, never substitutes, this project's own established
constants — `SprintAnalyzer.ts`'s `150–320ms`):

- `foot_sequence_discontinuity` — same-foot-to-same-foot.
- `implausible_step_duration` — duration > 320 ms.
- `missing_intermediate_contact` + `contact_sequence_gap` — duration > 640 ms
  (two full plausible-step durations — long enough that a whole extra
  contact could fit in the gap).
- `implausible_step_distance` — distance exceeds an **evidence-based**
  ceiling: 1.6× the median of the athlete's OTHER already-accepted step
  lengths in the same run, falling back to a fixed 3.0 m only when there is
  no other in-run evidence yet (tighter than the pre-existing flat 4 m
  ceiling, and never invents a number — a rejected interval's
  `longitudinalLengthM`/`stepLengthM` is set to `null`, never guessed).

Wired into:
- **`src/lib/video/zoneStepAnalysis.ts`** (`analyzeZoneSteps`) — added
  alongside (not replacing) the existing `non_alternating_sequence` /
  `non_forward_interval` / `implausible_step_length` flags; a two-pass
  interval build so each interval's integrity check uses every *other*
  interval's distance as neighbor evidence (never itself).
- **`src/lib/benchmark/measurements.ts`** — the **legacy, unanchored
  fallback path** (`individualStepLengthsM`/`zoneSteps`/`leftGaps`/`rightGaps`),
  which is what was actually active for this real session and had **zero**
  integrity checking before this fix. Same evaluation, same neighbor-evidence
  construction, same "mark unavailable, never guess" contract.

On the real "before" artifact, replayed through the fixed code with no
other change: the 7.19 m interval is now `stepLengthM: null`,
`qualityFlags: ["implausible_step_duration", "implausible_step_distance"]`,
and `avgIndividualStepLengthM` correctly reports `null` (honestly
unavailable) instead of 7.19 m.

---

## 8. Step-versus-stride semantics

Verified, not assumed:

- **Average Step Length** (`BenchmarkPanel.tsx:302-315`): the primary
  displayed value is `m.avgIndividualStepLengthM` (the real per-contact
  average this session's fix protects); it falls back to `m.avgZoneStepLengthM`
  (a separate, coarser "zone distance ÷ contact count" metric, Method 1 in
  `measurements.ts`'s own docstring) **only** when the individual average is
  unavailable. This fallback pre-dates this session and was not changed —
  flagged as a real, separate consideration in §14.
- **Peak Step Length**: `computePeakStrideLengthM` (`strideMetrics.ts`) —
  untouched this session; still the rolling four-step average, not a raw
  max. Confirmed via `zone-coverage:sanity` check 15 (unchanged, still
  passing) and this session's new integration test (§10, "Peak/Average Step
  Length machinery is untouched here").
- **Step Frequency**: `stepFrequencyHz`/`combinedStepFrequencyHz` derive
  from *valid* interval durations (`intervals.filter(valid)`), same
  machinery, unaffected by this session's changes beyond now excluding the
  merged-contact interval's duration too.
- **Same-foot stride vs. opposite-foot step**: `foot_sequence_discontinuity`
  (new) is additive to the pre-existing `non_alternating_sequence` — a
  same-foot pair is never counted as a step in either code path.
- **Missing-contact gap**: now has its own explicit vocabulary
  (`missing_intermediate_contact`/`contact_sequence_gap`), distinguishable
  from an ordinary "too far"/"too slow" rejection in diagnostics.

No product metric definition was changed. No panning code, Athlete
Intelligence code, or evidence threshold was touched beyond the one
tightened distance ceiling described in §7.

---

## 9. Files changed

- **New**: `src/lib/video/stepIntegrity.ts`, `scripts/step-integrity-sanity.mjs`,
  this report.
- **Modified**:
  - `src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py` — pre-zone
    corridor (`_near_entry`, `entry_gate`, `_entry_corridor_bounds`,
    `_entry_rejection_diagnostics`), additive; no continuity/verification
    rule removed or loosened.
  - `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
    `--entry-gate-x`/`--entry-gate-y` CLI args, passed into `AthleteTracker`.
  - `src/lib/biomechanics/pose-backend.ts` — `PoseEstimateOptions.entryGate`.
  - `src/lib/biomechanics/mediapipe/PythonMediaPipePoseService.ts` — forwards
    `entryGate` to the CLI.
  - `scripts/analysis-worker.mjs` — reduces `calibration_gates.startGate` to
    `entryGate` (same midpoint math as `gateMidpoint()`), passes it to
    `backend.estimate`; also carries this session's unrelated observability
    addition from the prior task in this same working tree
    (`queue_idle_lease_held` — untouched this session).
  - `src/lib/video/zoneStepAnalysis.ts` — wires `evaluateStepInterval` into
    `analyzeZoneSteps`'s interval build.
  - `src/lib/benchmark/measurements.ts` — wires the same check into the
    legacy unanchored step-length fallback.
  - `scripts/athlete-tracker-sanity.py` — 12 new Day 103 corridor checks.
  - `scripts/zone-step-counting-sanity.mjs` — fixed the test fixture's
    default contact spacing (200 ms/contact, matching this file's own
    existing explicit convention in check 21) so synthetic multi-contact
    fixtures reflect a realistic cadence instead of a literal 1-second/unit
    gap the new integrity check correctly flagged as implausible.
  - `package.json` — new `step-integrity:sanity` script entry.

Not modified: `box_tracker.py` (optical-flow continuation — Day 102's
already-characterized, unfixed limitation remains exactly as documented),
any Athlete Intelligence module, any panning/camera-path module.

---

## 10. Tests

**`scripts/athlete-tracker-sanity.py`** — 43 checks, all passing (31
pre-existing + 12 new):

| # | Check |
|---|---|
| 1 | Pre-zone corridor, left-to-right gate: a candidate before the gate but outside the OLD frame-edge band is now eligible |
| 2 | Pre-zone corridor, right-to-left gate: mirrors correctly |
| 3 | Athlete visible away from the frame edge reaches TRACKED |
| 4 | Candidate outside the corridor rejected outright, with full diagnostics (`candidateCenter`/`corridorBounds`/`distanceToGate`/`configuredDirection`) |
| 5 | Stationary background texture INSIDE the corridor still never locks (Day 101 protection independent of corridor) |
| 6 | No calibrated gate → byte-identical legacy frame-edge behavior (no silent change) |
| (existing 1/9/entry/bg/motion/recover-a/b) | Day 101 multi-stage verification still required — unchanged, still passing |

**`scripts/step-integrity-sanity.mjs`** (new) — 17 checks, all passing:
alternating-foot violation, implausible duration (both the "just past
ceiling" and "long enough for 2 steps" cases), implausible distance (with
and without neighbor evidence), same-foot stride never mislabeled a step,
constants verified against `SprintAnalyzer.ts`'s values, pre-zone contact
retained as context but excluded from zone metrics/window start, and a
full `analyzeZoneSteps` integration replay of the real Vanni-shaped
merged-contact scenario (valid first interval kept, merged second interval
rejected with explicit reasons, no 3rd contact fabricated, Peak/Average
Step Length machinery untouched).

**Regression** (all pass, unmodified-scope suites): `measurement-recovery:sanity`,
`timing-verification:sanity`, `analysis-report:sanity`, `analysis-fps:sanity`,
`zone-coverage:sanity`, `zone-step-counting:sanity` (25/25 — one fixture
default fixed, see §9), `worker:check`, `npm run lint` (0 warnings),
`npm run build` (succeeds), `npx tsc --noEmit` (0 errors).

Not independently re-verified this session: the broader Day 100–102 suite
list (`experimental-30fps:sanity`, `acceleration-analysis:sanity`,
`world-lock-repair:sanity`, etc.) — none of their source files were touched
this session, and this session's own required-script list (below) was run
in full.

---

## 11. Real rerun results (Part 9) — real worker, real video, twice

Queued via the same production `replace_working_analysis` RPC a real
in-app rerun uses, processed by a real, unmodified `scripts/analysis-worker.mjs`
process end to end (not a synthetic simulation). Run **twice** back-to-back
specifically to rule out run-to-run non-determinism as an alternative
explanation for the improvement — **the two runs' pose artifacts are
byte-for-byte identical (MD5 `70c27916daaa3169dfa457c91211a2ac`, both
runs)**, confirming the recovered evidence is a real, reproducible effect of
this session's fix, not noise.

| Field | Before (Part 7 fix only, same acquisition data) | After (corridor + Part 7, real rerun) |
|---|---|---|
| First visible-athlete frame (visual, source video) | 1300 (t=5.43s), tiny/distant | unchanged — same video |
| First candidate/pose evidence frame | 1487 | **1179** |
| First identity LOCK frame | 1521 | 1521 (unchanged) |
| Main contiguous real-pose window | 1488–1648 (161 frames) | **1501–1995 (495 frames)** |
| First pre-zone contact | none detected | none detected (first contact is already in-zone on this clip's framing) |
| First in-zone contact | frame 1544 (right) | frame 1648\* (right) |
| All in-zone contacts | 1544, 1646 (2) | 1648, 1702, 1738, 1809, 1850, 1909 (6 counted; 1585 is the anchor) |
| Eligible steps | 0 (the only interval was implausible) | **6** |
| Rejected contact gaps | 1 (the 7.19 m interval) | 0 |
| `measurementStartPositionM` | 5.80 m | **7.48 m** |
| `measurementEndPositionM` | 12.91 m | **19.96 m** |
| `coveragePercent` | 35.6% (low confidence) | **62.4% (high confidence)** |
| Individual step lengths | `[]` | **`[2.11, 1.93, 1.79, 2.24, 2.01, 2.43]` m — all physically plausible** |
| Average Step Length | unavailable (null) | **2.09 m** |
| Peak Step Length (rolling 4-step) | unavailable | 2.12 m |
| Step Frequency | 2.35 Hz (raw contact spacing only) | 4.43 Hz |
| Peak Velocity | unavailable | **10.53 m/s** |
| Average Velocity | unavailable (no verified start crossing) | unavailable (same reason, unchanged — genuinely not this session's evidence) |

\* The first anchor contact (1585) is retained as `Step 1 (anchor)` per this
codebase's existing convention (`measurements.ts:1247-ish`, unchanged) — its
own length is `null` by design (nothing to measure it from yet); the first
*measured* interval lands on the second contact.

For direct comparison, the ORIGINAL unfixed behavior (before this session's
Part 7 fix, i.e. what was actually in production) would have shown **Average
Step Length = 7.19 m** for this same "before" acquisition data — a
fabricated, physically-impossible number. This session's two fixes together
replace that with a smaller set of contacts that is honest either way:
fewer counted steps but *zero* invented ones when evidence is thin, and, on
this real clip, substantially *more* real evidence recovered overall.

---

## 12. Metric values before vs. after (summary)

See §11's table — reproduced here for the report's requested structure.
`avgZoneStepLengthM` (the separate Method 1 metric, §8): 10.0 → 2.86 (moved
in the same honest direction, though this metric family itself remains
unprotected by this session's integrity check — see §14).

---

## 13. Overlay coverage before vs. after

| | Before | After |
|---|---|---|
| Frames with any pose landmark | 161 (isolated + one 161-frame run) | 500 (one 495-frame run + 3 sparse pre-lock hits) |
| Skeleton coverage (of 2348 total frames) | 6.9% | 21.3% |
| Foot-marker coverage (contacts detected) | 3 | 8 |

---

## 14. Remaining limitations

- **Day 102's post-lock optical-flow drift is still real and still
  unfixed.** The main pose window now ends at frame 1995 instead of 1648 —
  a real, measured improvement — but `box_tracker.py`'s `boxOrigin` is
  expected to still report "tracked" well past where real pose evidence
  stops (this session did not re-instrument that specific boundary in
  detail; the underlying mechanism Day 102 characterized was not touched).
- **`avgZoneStepLengthM`** (`measurements.ts`'s separate "zone distance ÷
  contact count" Method 1, surfaced by `BenchmarkPanel.tsx` as a fallback
  when the individual average is unavailable) has **no** integrity
  protection from this session's fix — it is a coarser, pre-existing metric
  family, out of this session's scope, but worth flagging: it can still
  produce a misleadingly smooth number when contact density is very low
  relative to the zone.
- **Corridor depth constants** (`0.35`/`0.15`/`0.30`) are reasoned from this
  real clip's evidence and this project's existing plausible-step-duration
  constant, but — following this project's own established discipline
  (Day 100/101/102) — have only been validated against **one** real clip.
  Broader validation against a second real stationary session (ideally
  different camera framing/distance) is the responsible next step before
  treating these as final.
- The exact mechanism by which the corridor narrowing produced a *better*
  (not just different) post-lock pose window on this clip was not fully
  reverse-engineered this session — plausibly fewer wasted SEARCHING/CANDIDATE
  cycles on marginal near-boundary candidates, but this is a reasoned
  hypothesis, not independently instrumented proof.
- `avgIndividualStepLengthM`'s fallback to `avgZoneStepLengthM` in
  `BenchmarkPanel.tsx` (§8) means a user could still see a number when the
  individual average is correctly withheld — not a fabrication (the
  fallback is its own real, distinctly-labeled metric, "Avg (individual)" vs
  the primary stat), but a UX nuance worth a dedicated look, not addressed
  here to avoid scope creep into UI redesign.

---

## 15. Git status

Working tree only; no commits made this session. New this session:
`src/lib/video/stepIntegrity.ts`, `scripts/step-integrity-sanity.mjs`, this
report. Modified this session (see §9 for the full list and reasons):
`athlete_tracker.py`, `mediapipe_pose_runner.py`, `pose-backend.ts`,
`PythonMediaPipePoseService.ts`, `analysis-worker.mjs`,
`zoneStepAnalysis.ts`, `measurements.ts`, `athlete-tracker-sanity.py`,
`zone-step-counting-sanity.mjs`, `package.json`. Several other files in the
working tree carry unrelated, pre-existing modifications from other,
separate work already in progress in this repository (acceleration-analysis
feature work, worker queue observability) — not touched or claimed by this
session.
