# Phase R4C — Ground-Truth Scientific Validation Harness & Field Protocol

Status: **complete**. This phase built the infrastructure to compare
LEGACY_2D against CANONICAL_LONGITUDINAL against real, independently
measured ground truth. **It did not run that comparison on real data**,
because no real ground-truth trial has been collected yet. No commit, push,
or `db:reset` was performed; the default measurement model remains
`LEGACY_2D`, unchanged from R4B.

## IMPLEMENTED VALIDATION INFRASTRUCTURE vs ACTUAL SCIENTIFIC VALIDATION

This distinction is the point of the phase and is restated up front:

**Implemented (this phase, real code, real tests):**
- A ground-truth trial schema, deterministic contact-matching algorithm,
  error-metric functions, a pre-registered model-selection policy, a
  standalone validation runner, and a 23-check sanity suite proving all of
  the above works correctly — including one true end-to-end run through the
  real, compiled `computeSprintMeasurements()`.

**Not done (requires Tuesday, or a later session, and real equipment):**
- No real ground-truth trial exists. The one trial fixture produced this
  phase (`validation/fixtures/ground-truth/synthetic-gav-mixed-scenarios.trial.json`)
  is hand-constructed and explicitly labeled `SYNTHETIC` in its own `notes`
  field — it proves the validator's logic paths work, not that either
  model is more accurate. **No conclusion about LEGACY_2D vs
  CANONICAL_LONGITUDINAL accuracy can be drawn from anything in this
  phase.** The model-selection policy has not been evaluated against real
  data and cannot be — `INSUFFICIENT_DATA` is the only honest verdict it
  could currently produce.

## Part A — R4B baseline preserved

Re-ran `scripts/phase-r4b-dual-mode-benchmark.mjs` unmodified before touching
anything. Canonical determinism SHA-256 reproduced exactly:
`18f6988efe100de39f3f90a8c665fb020a7c5e286c32b8e69e38a42f66040b64` (matches
R4B's own recorded value). `DEFAULT_MEASUREMENT_MODEL_VERSION` is still
`LEGACY_2D`; `page.tsx`/`loadContext.ts` still omit
`measurementModelVersion`, confirmed by grep. Neither model was changed this
phase — `git status` shows zero modifications to `measurements.ts`,
`measurementModel.ts`, or any calibration/contact/timing file since R4B
closed (bonus check `B3` in the R4C sanity suite enforces this with an mtime
guard).

## Ground truth vs AVA estimate (Part B)

New schema: `src/lib/validation/groundTruthTrial.ts` — a zod contract,
`GroundTruthTrial`, entirely separate from any `SprintMeasurements` type.
Every field except `trialId`/`zoneLengthMeters`/each contact's
`contactNumber`/`sGroundTruthM` is optional — a trial degrades to whatever
was actually measured, per the existing `fieldValidation.ts` philosophy
(reused, not reinvented) but with genuine per-contact position/timestamp
fields that coarser trial shape doesn't have.

## Contact-position ground truth (Part C)

`s = 0` at the start-gate midpoint, `s = zoneLengthMeters` at the finish-gate
midpoint — the identical convention R4A documented and R4B implemented.
`sGroundTruthM` is stored as full float; `sToCm()` is `× 100` with no
rounding (sanity check `[17]` proves a 7.438291 m value round-trips to
743.8291 cm exactly, not 744).

## Field protocol (Parts D, E, F, Y, Z)

`docs/ava-ground-truth-field-testing-protocol.md` — practical, at-the-track
checklist. Key decisions:

- **Gate origin (Part F)**: two-point midpoint for both start and finish,
  identical to what the calibration UI already captures — documented as an
  explicit measure-and-mark procedure so a coach doing it with a tape measure
  produces a number that means the same thing as AVA's `startBoundary`/
  `finishBoundary`.
- **Marker spacing (Part E)**: recommend keeping the existing protocol's
  0.5 m tape grid as the physical marker density, with a hand tape measure
  used per-touchdown to read the actual offset to the nearest cm from the
  nearest marker. Explicitly recommends against marking every 1 cm or 5 cm —
  AVA's own precision ceiling (~3–7 cm, per R4A/R4B) makes that density
  false precision, not a genuine accuracy gain. This separates *marker
  spacing* (coarse, cheap to lay) from *measurement accuracy* (fine, from
  the tape read), per the task's explicit ask.
- **Trial matrix (Part Z)**: 60/120/240 fps × 2 trials each = 6 trials, same
  athlete, same camera position, back-to-back same day. Sized to match the
  model-selection policy's own coverage minimum (`minIndependentTrials: 6`)
  rather than picked independently — running fewer would guarantee
  `INSUFFICIENT_DATA`, running dozens more wouldn't change the verdict
  criteria. A second athlete repeating the same matrix is the highest-value
  next addition (satisfies `minDistinctAthletes: 2`) but isn't required to
  start.

## Step-length / position / frequency / timing / velocity ground truth (Parts G–N)

All in `src/lib/validation/groundTruthMetrics.ts`, pure functions, no I/O:

- **Step length (Part G)**: `GT_stepLength_i = s_GT(i) − s_GT(i−1)` for
  consecutive numbered ground-truth contacts (`computeGroundTruthStepLengths`).
  Aligned to a model's own step intervals only through the pre-computed
  contact matches — never by searching for the AVA interval that minimizes
  error (`alignStepLengthErrors`). An interval is marked non-comparable, not
  force-aligned, when its endpoints didn't both match or aren't themselves
  adjacent in AVA's own step sequence (e.g. a false-positive AVA contact
  sits between them).
- **Position error (Part H)** — `computePositionErrors`, `s_AVA − s_GT`.
  **Only available under CANONICAL_LONGITUDINAL.** LEGACY_2D has no native
  per-contact longitudinal coordinate in the codebase — it only ever computes
  pairwise 2D distances between two consecutive contacts, never an absolute
  position. The validator does not invent one for LEGACY_2D just to force a
  symmetric comparison (that would be a new, untested formula, forbidden by
  this phase's own "do not modify scientific formulas" instruction). This
  asymmetry is real and is itself a finding: **position-error decomposition
  — telling whether an error comes from absolute localization vs interval
  subtraction — is only possible for CANONICAL_LONGITUDINAL.** Under
  LEGACY_2D you can only ever grade step length as a whole.
- **Step Frequency (Part K)** — `computeGroundTruthFrequencyHz`:
  `numberOfIntervals / (tn − t0)` over adjudicated ground-truth timestamps,
  compared to AVA's own displayed `combinedStepFrequencyHz`
  (`compareStepFrequency`).
- **Timing (Part L)** — `compareTiming`: entry/exit/zone-time error in ms
  and %, each independently null-safe.
- **Average Velocity (Part M)** — `compareAverageVelocity`:
  `zoneLength / independentZoneTime` vs AVA's `zoneVelocityMps`. Documented
  explicitly (in the function itself) that since AVA's Average Velocity is
  already `zoneLength/zoneTime`, this primarily validates AVA's
  crossing-time estimation, not a separate velocity formula.
- **Peak Velocity (Part N)** — `comparePeakVelocity` defaults to
  `available: false`. It only produces a comparison when the trial declares
  an independent method (radar/laser/short segment) **and** that method
  string doesn't reference AVA itself (a literal safeguard: sanity check
  `[12]` proves a declared method of `"AVA displayed value"` is rejected). A
  full-zone timing gate is explicitly insufficient for this — matches the
  task's own warning verbatim.

## Contact matching and detection quality (Parts I, J)

`src/lib/validation/groundTruthMatching.ts` — `matchContacts()` is fixed
**before** any error is computed: it uses only timestamp proximity (a fixed
60 ms window — half the ~200 ms minimum spacing between real contacts at
plausible elite cadence, chosen once, not fit to any data since none existed
yet), declared foot side, and contact order. It never looks at spatial
distance to decide a pairing — doing so would let a model win by picking its
own most favorable match. A side conflict inside an otherwise-eligible time
window is reported `AMBIGUOUS`, never silently resolved either way (sanity
check `[6]`).

**A real bug was found and fixed during this phase's own smoke test**: the
first implementation had the `AVA_FALSE_POSITIVE`/`AVA_FALSE_NEGATIVE`
branches swapped (an AVA contact arriving *after* a GT contact's window had
closed was mis-classified as if it preceded it). A hand-run smoke test
against real Gav pose data caught this immediately (`TP=0` when 5 of 5
ground-truth contacts should have matched) before the sanity suite was even
written; fixed and reconfirmed (`TP=5, FP=7, FN=0` against real data).

`contactDetectionStats()` computes precision/recall/F1 from classification
counts alone — scientifically separate from step-length accuracy, per the
task's explicit requirement that a model can't get credit for an accurate
step length attached to a wrong contact.

## Uncertainty (Part O)

`classifyAgainstUncertainty()` — `WITHIN_GROUND_TRUTH_UNCERTAINTY` /
`OUTSIDE_GROUND_TRUTH_UNCERTAINTY` / `UNCERTAINTY_UNKNOWN`. A missing
`uncertaintyM` is `UNCERTAINTY_UNKNOWN`, never treated as zero uncertainty
(sanity check `[10]`).

## Comparison statistics (Part P)

`summarizeErrors()` — MAE, RMSE, median absolute error, p95 absolute error,
mean signed bias, max absolute error, over any signed-error array. Used
identically for step-length and position errors; step-length is additionally
reported in cm in the runner's console output, per the task's explicit ask
for field-intuitive units.

## Per-trial and cross-trial structure (Parts Q, R)

`scripts/validate-ground-truth-trial.mjs` produces one JSON per trial with a
`STEP | GT | LEGACY-equivalent | CANONICAL-equivalent` shape (run once per
model, both grades in one file — see `tmp/phaseR4C/sample-validation-result.json`).
`src/lib/validation/aggregateTrials.ts` reduces an array of such per-trial
summaries, grouped by athlete/fps/cameraPosition/zoneLength/travelDirection,
into the `AggregateModelStats` shape the model-selection policy consumes —
implemented and typed, but not yet exercised on real trials (there's only
one trial, and it's synthetic).

## Pre-registered model-selection rule (Part S)

`src/lib/validation/modelSelectionPolicy.ts`, written and fixed **before**
any real trial exists, specifically so it can't be shaped by which model
looks better once data arrives:

CANONICAL_LONGITUDINAL may become the default only if, simultaneously:
1. **Coverage**: ≥6 independent real trials, ≥2 distinct athletes, all of
   60/120/240 fps represented. *The four existing protected benchmarks do
   not count toward this* — they're stationary-camera regression fixtures,
   not independently-measured ground truth, and counting them would be
   exactly the overfitting the task explicitly forbade.
2. **Contact detection F1 identical** between models — they share contact
   detection by construction (R4B never touched it); any difference halts
   the decision for investigation rather than being scored as a tradeoff.
3. **Step Frequency / Average Velocity / zone timing drift ≤0.5%** between
   models — these are designed to be model-invariant; more than that means
   something outside R4B's intended scope broke.
4. **Step-length improvement**: CANONICAL_LONGITUDINAL's median absolute
   ground-truth step-length error is ≥15% relatively lower than LEGACY_2D's.
5. **No material position regression**: CANONICAL_LONGITUDINAL's median
   absolute position error does not exceed LEGACY_2D's comparable figure by
   more than 1.0 cm (LEGACY_2D typically has no comparable figure at all —
   see Part H — so this mostly guards against a future LEGACY_2D-side
   change, not today's asymmetry).

Below the coverage minimum, `evaluateModelSelectionPolicy()` returns
`INSUFFICIENT_DATA` and nothing else — it never approves a default change
from a preview or a handful of trials. Sanity check `[18]` proves the
function is pure/deterministic and correctly gates on both branches.

## Validation runner (Parts T, U, V, W)

`scripts/validate-ground-truth-trial.mjs` — accepts `--trial`, `--pose`,
`--gates`; recomputes AVA via the real, compiled `computeSprintMeasurements()`
in both `LEGACY_2D` and `CANONICAL_LONGITUDINAL` (same tsc-to-temp-dir
compile pattern R4A/R4B's own scripts use — no production code imported or
mutated at runtime), grades each independently, and writes both a
human-readable console table (`STEP | GT | MODEL | ERROR(cm) | %ERR`) and a
deterministic JSON result. Fixture location follows the existing repo
convention (`validation/fixtures/<category>/`, matching the pre-existing
`validation/fixtures/panning/` directory) — a new
`validation/fixtures/ground-truth/` was added rather than inventing a
different top-level layout.

`tmp/phaseR4C/` deliverables: `schema.json`, `sample-ground-truth-trial.json`,
`sample-validation-result.json`, `model-selection-policy.json`,
`validation-manifest.json`, plus the full labeled result
(`validation-result-synthetic-gav-mixed-scenarios.json`).

## Sample/synthetic validation (Part X)

`validation/fixtures/ground-truth/synthetic-gav-mixed-scenarios.trial.json`
reuses Gav's real pose artifact as a realistic substrate but with
hand-constructed ground-truth values, and its own `notes` field states
plainly it is synthetic and must never be reported as scientific validation.
Run through the real runner, it exercises: an exact match, a small (+1 cm)
spatial error, a large (+8 cm, outside declared uncertainty) error, a
deliberately mistimed contact (proving `AVA_FALSE_NEGATIVE` classification
and, via the resulting extra real AVA contact, `AVA_FALSE_POSITIVE`), a
missing `side`, a missing `uncertaintyM`, a small timing offset, and
`peakVelocity.available: false`. Left/right alternation is inherent to the
real pose data used. A right-to-left travel direction is proven separately
via a fully synthetic 12-frame pose sequence in the sanity suite (check
`[16]`) rather than a second fixture file, since no real right-to-left
benchmark pose exists to build a file-based fixture from — documented here
so the coverage claim is traceable to where it's actually proven.

Real output (both models, abridged):

```
-- LEGACY_2D --          TP=5 FP=7 FN=1  P=0.417 R=0.833 F1=0.556
  1->2  GT 2.073  MODEL 2.083  ERROR +1.0cm  0.5%
  4->5  GT 2.018  MODEL 2.098  ERROR +8.0cm  4.0%   (deliberately outside uncertainty)
  position error: unavailable (LEGACY_2D has no native coordinate)

-- CANONICAL_LONGITUDINAL --   TP=5 FP=7 FN=1  P=0.417 R=0.833 F1=0.556 (identical — same contacts)
  1->2  GT 2.073  MODEL 2.083  ERROR +1.0cm  0.5%
  4->5  GT 2.018  MODEL 2.098  ERROR +8.0cm  4.0%
  position |error| cm: mean=2.19 median=0.96 max=8.00 n=5
```

Contact detection is identical between models (expected — R4B never touched
contact detection), step-length errors are near-identical (both models are
grading against the same hand-picked GT numbers, so this is expected and
not a finding about relative accuracy), and position error is only
computable for CANONICAL_LONGITUDINAL — exactly the asymmetry documented in
Part H above, now demonstrated rather than just asserted.

**Harness determinism**: the same fixture run twice produced byte-identical
result JSON: SHA-256 `b4c9a9cfa036a2c42d3fc91c8a5cbad8ad37fe4c77c77b41eb61c163cb9715e3`
both times (`tmp/phaseR4C/validation-manifest.json`). This is a harness
self-check, not a scientific claim.

## Tests

`scripts/phase-r4c-ground-truth-validation-sanity.mjs` — 18 required checks
+ 5 bonus (2 sub-checks, 3 additional), **23/23 passing**. Includes one true
integration test (`[16]`) that runs a synthetic pose sequence through the
real, compiled `computeSprintMeasurements()` with `travelDirection:
"right_to_left"` and `measurementModelVersion: CANONICAL_LONGITUDINAL`,
proving the runner's compile-and-invoke path itself works, not just the
pure comparison functions in isolation.

## Regression sweep

| Suite | Result |
| --- | --- |
| R4A canonical measurement model sanity | 13/14 — same single expected mtime-guard fail as R4B closed with (check `[12]`, unchanged, not a new failure) |
| R4B versioned longitudinal measurement sanity | 24/24 + 2 bonus — **fully clean** (R4C touched none of R4B's guarded files) |
| Measurement recovery sanity | all pass |
| Zone step counting sanity | 25/25 |
| Timing verification sanity | all pass |
| Vanni240 metric evidence sanity | all pass |
| R1C contact/render alignment sanity | 17/17 |
| R3D contact detector replay | pass |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | succeeds (dev server stopped before, restarted after) |

No database mutation at any point. No production scientific file
(`measurements.ts`, `measurementModel.ts`, `steps.ts`, `zoneStepAnalysis.ts`,
`gates.ts`, `zoneAnchors.ts`) was modified this phase — enforced by sanity
check `B3`'s mtime guard.

## What remains before Tuesday

1. Run the 6-trial matrix in `docs/ava-ground-truth-field-testing-protocol.md`
   for one athlete across 60/120/240 fps.
2. Fill in a real `GroundTruthTrial` JSON per trial (schema in
   `src/lib/validation/groundTruthTrial.ts`).
3. Run each through `scripts/validate-ground-truth-trial.mjs`.
4. Feed the six per-trial results into `aggregateTrials.ts` and
   `evaluateModelSelectionPolicy()` — expect `INSUFFICIENT_DATA` on trial
   count alone until a second athlete's matrix also exists; that's the
   policy working as designed, not a bug.
5. Only then — never before — does a CANONICAL_LONGITUDINAL-as-default
   decision become possible, and only if the policy's verdict says so.

## Deliverables

`docs/ava-ground-truth-field-testing-protocol.md`,
`validation/fixtures/ground-truth/synthetic-gav-mixed-scenarios.trial.json`,
`src/lib/validation/{groundTruthTrial,groundTruthMatching,groundTruthMetrics,modelSelectionPolicy,aggregateTrials}.ts`,
`scripts/validate-ground-truth-trial.mjs`,
`scripts/phase-r4c-ground-truth-validation-sanity.mjs`,
`tmp/phaseR4C/{schema,sample-ground-truth-trial,sample-validation-result,model-selection-policy,validation-manifest,validation-result-synthetic-gav-mixed-scenarios}.json`.
