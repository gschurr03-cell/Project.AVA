# Phase R1B — Presentation-Only Physical Step-Length Recovery

## 1. Executive summary

Implemented the exact, narrow correction R1A proved was needed: `ZoneStep`
now carries a new, additive `physicalStepLengthM` field, distinct from the
existing, semantically-unchanged `stepLengthM`. `physicalStepLengthM` is the
same already-computed calibrated physical distance (no second formula),
shown whenever an interval represents a legitimate single step — even if it
is rejected from aggregation by the existing cruise-phase plausibility
ceiling — but never shown when the rejection proves a genuine evidence gap
(same-foot sequence, missing intermediate contact, non-forward/non-finite
geometry, low projection confidence). `VideoOverlay.tsx`'s label lookup now
reads `physicalStepLengthM`.

**Real, proven result**: Vanni 240's R1A Case 1 (`contact-119-left-2`) now
has `physicalStepLengthM = 3.442099399668491` (the exact value R1A
identified) with `stepLengthM` still `null`. R1A Case 2
(`contact-278-left-3`) correctly has both fields `null`. All previously-
working values are **byte-identical** before/after across all 4 benchmarks
— zero scientific regression, verified two ways (whole-file diff and a
dedicated 24-test suite).

**One honest, additional, out-of-scope finding, discovered during real UI
validation and not glossed over**: Case 1's restored value, while 100%
correct and present in the authoritative data model, **does not yet have a
matching dot to attach to in the live renderer** for this one specific
contact. This is a separate, deeper, pre-existing divergence between the
render path's own independent contact detection (unstripped frames) and the
authoritative path's (stripped frames) — Section 9 explains this in full,
with real evidence. It does not affect any other case: every one of the
render path's own detected contacts across all 4 benchmarks that has a
matching authoritative entry renders its `physicalStepLengthM` correctly,
confirmed with zero regressions.

## 2. R1A findings inherited

Not reopened. R1A's two classifications are treated as given: Case 1
(`contact-119-left-2`, physical distance 3.4421m/454ms, rejected only by
`implausible_step_duration`/`implausible_step_distance` — a cruise-phase-
ceiling mismatch, no evidence gap) and Case 2 (`contact-278-left-3`,
physical distance 5.6332m/662ms, additionally rejected by
`foot_sequence_discontinuity`/`missing_intermediate_contact`/
`contact_sequence_gap` — a genuine missing right-foot contact).

## 3. Exact architecture change

`src/lib/benchmark/measurements.ts`:

- `ZoneStep` gains `physicalStepLengthM: number | null` and
  `physicalStepLengthState: "accepted_for_metrics" | "presentation_only" |
  "missing_contact" | "invalid_interval"`.
- A new module-level constant `PHYSICAL_STEP_EVIDENCE_GAP_REASONS` (a
  `Set` of the reasons that prove a genuine evidence gap) and helper
  `hasPhysicalStepEvidenceGap()`.
- Inside the `zoneSteps: ZoneStep[] = gapMarks.map(...)` block: computes
  `physicalCandidateM` (the SAME already-computed value —
  `interval.rawLongitudinalDisplacementM` on the canonical/panning path,
  `legacy.distanceM` on the legacy two-point path, the one active for all 4
  current benchmarks), checks it against the evidence-gap reason set, and
  assigns `physicalStepLengthM`/`physicalStepLengthState` accordingly.
  `stepLengthM`'s own computation is **completely untouched**.

`src/components/video/VideoOverlay.tsx`: the label lookup map
(`authoritativeStepLengthByFrameSide`) now filters/reads
`step.physicalStepLengthM` instead of `step.stepLengthM` — the render loop
itself, the `sourceFrameIndex-side` matching (Phase R1's own fix), and the
label draw calls are otherwise unchanged.

## 4. `physicalStepLengthM` semantic definition

"A real, calibrated physical distance between two contacts that represent a
legitimate single step — regardless of whether that interval also clears
the cruise-phase-calibrated plausibility ceiling `stepLengthM` requires."
Never fabricated: `null` whenever no candidate interval exists at all, or
whenever any evidence-gap reason (proven missing contact, same-foot
sequence, non-forward/non-finite geometry, low-confidence world projection)
disqualifies it.

## 5. `stepLengthM` preserved semantic definition

Unchanged from every prior phase: the scientifically **accepted** value,
eligible for Average/Peak Step Length, Step Frequency, and every other
aggregate metric. Its own computation (`usableScale && legacy?.valid ? legacy.distanceM
: null` on the legacy path; `interval?.longitudinalLengthM ?? null` on the
canonical path) was not touched by this phase.

## 6. Physical interval eligibility rules

A candidate physical distance is accepted for presentation when **all** of:

- a real predecessor contact/interval candidate was found (not the run's
  first-ever contact with nothing to measure against);
- the raw distance is finite and strictly positive;
- **none** of these reasons are present: `missing_intermediate_contact`,
  `contact_sequence_gap`, `foot_sequence_discontinuity` (legacy path);
  `non_alternating_sequence`, `non_forward_interval`, `low_projection_confidence`
  (canonical/panning path — the same concepts, that path's own vocabulary).

Explicitly **not** disqualifying: `implausible_step_duration`,
`implausible_step_distance`, `implausible_step_length` — the cruise-phase-
neighbor-ceiling-only reasons R1A proved can reject a real, legitimate
interval.

## 7. Vanni 240 Case 1 before/after

| | Before R1B | After R1B |
|---|---|---|
| `stepLengthM` | `null` | `null` (unchanged) |
| `physicalStepLengthM` | *(field did not exist)* | `3.442099399668491` |
| `physicalStepLengthState` | *(field did not exist)* | `presentation_only` |
| Overlay lookup source | `stepLengthM` (never matched, always excluded) | `physicalStepLengthM` (matched, value available) |

The exact value matches R1A's own identified `distanceMetersFromPrevPhysical`
(3.4421m) to full precision — no new calculation (Part F, C).

## 8. Vanni 240 Case 2 before/after

| | Before R1B | After R1B |
|---|---|---|
| `stepLengthM` | `null` | `null` (unchanged) |
| `physicalStepLengthM` | *(field did not exist)* | `null` |
| `physicalStepLengthState` | *(field did not exist)* | `missing_contact` |

Correctly excluded from presentation — no length is shown, no fabrication,
no interpolation, no division of the merged multi-step gap (Part G).

## 9. Real UI validation — an honest, additional finding

Real, authenticated, decoded-video Playwright session (the established
H.264 test-copy technique), seeking directly to source time `119/239.981 =
0.4959s` (Case 1's exact contact instant). **Directly, empirically verified**
that the render path's own `detectStepMarks()` call (on unstripped frames,
exactly matching `loadOverlayFrames.ts`'s real production behavior) does
**not** produce a mark at `sourceFrameIndex=119, side=left` at all — its
nearest marks are at frame 76 (left) and frame 123 (right), neither the same
physical contact. This is a genuine, separate, deeper divergence between the
render path's contact SET (not merely its numbering, which Phase R1 already
fixed) and the authoritative path's contact set — both call `detectStepMarks`
but on differently-stripped input frames, and near the zone's low-confidence
entry region the two can produce genuinely different detected footfalls, not
just differently-numbered ones.

**Practical consequence**: `physicalStepLengthM` for `contact-119-left-2` is
correctly computed and available in the authoritative data (proven,
Section 7), and the overlay lookup mechanism correctly prefers it — but
because no dot is drawn for that exact physical contact identity in the
current live renderer, there is nothing for the restored value to visibly
attach to for this **one specific** R1A-identified example.

**This is not a regression and not specific to R1B's own logic.** Direct,
real screenshots (`tmp/phaseR1B/browser/vanni240-autofollow-closeup.png`,
re-captured fresh against the post-R1B build) confirm every render-path
contact that **does** have a matching authoritative entry (frames 443, 475,
543, 583 — visible as render-numbered marks 9–12) shows its correct,
unchanged meter value (`2.18 m`, `1.82 m`, `2.23 m`, `1.99 m`) exactly as
before R1B — zero regression for the cases the render path already detects
correctly. `contact-278-left-3` (Case 2) **does** have a matching render-path
mark (frame 278 exists in both paths) and correctly shows no meter value.

This gap is a candidate for a future, narrowly-scoped phase (tentatively
"render-path/science-path contact-set reconciliation") — **not** addressed
here, since resolving it would mean changing which contacts the renderer
draws at all, squarely inside this phase's explicit "do not change contact
detection" boundary.

## 10. Cross-benchmark counts

`tmp/phaseR1B/cross-benchmark-summary.json`:

| Benchmark | Contact marks | Step numbers | Physical lengths | Aggregate-eligible | Presentation-only | No valid length |
|---|---:|---:|---:|---:|---:|---:|
| Gav | 12 | 9 | 9 | 9 | 0 | 0 |
| Vanni 60 | 10 | 9 | 8 | 8 | 0 | 1 |
| Vanni 120 | 12 | 10 | 10 | 10 | 0 | 0 |
| Vanni 240 | 10 | 8 | 7 | 6 | **1** | 1 |

`allAcceptedValuesMatchPhysical: true` for all 4 benchmarks (Part H — every
accepted interval's `physicalStepLengthM === stepLengthM` exactly). Vanni
60's one "no valid length" is `contact-37-right-1`, `invalid_interval`
(structurally the run's first-ever contact, unrelated to the R1A cases).

## 11. Overlay behavior

Contact marker: unchanged, still gated by `show.contacts` and existing
contact-presentation evidence. Step number: unchanged, still gated by
`show.step_numbers` alone, drawn unconditionally of any length value. Step
length: now gated on `physicalStepLengthM != null` instead of
`stepLengthM != null` — strictly broader (a superset), so no previously
visible label can disappear.

## 12. Consumer/import isolation

Grep-verified across all of `src/`: `physicalStepLengthM` is referenced in
exactly two files — its own definition/computation in `measurements.ts`, and
the one new consumer in `VideoOverlay.tsx`. Every other `.stepLengthM`
consumer (`AccelerationAnalysisPanel.tsx`, `BenchmarkPanel.tsx`,
`src/lib/acceleration/*.ts`, `src/lib/intelligence/recommendations.ts`)
reads the untouched `stepLengthM` field — several of those (`acceleration/*`)
operate on an entirely unrelated `AccelerationStep` type, not `ZoneStep`,
confirmed by file/module boundary. `metricEvidence.ts`/`scientificEvidence.ts`
contain zero references to the new field (`tmp/phaseR1B/field-consumer-audit.json`).

## 13. Tests

`scripts/phase-r1b-presentation-step-length-sanity.mjs` — **24/24 passing**,
covering: field distinctness, accepted-interval value equality (all 4
benchmarks), the exact R1A Case 1/Case 2 values and states, evidence-gap
enforcement, contact/step identity preservation, before/after byte-identical
snapshots for Average/Peak Step Length/Step Frequency/every other field (all
4 benchmarks), overlay lookup source verification, and Auto Follow/
Stabilized View non-interference (structural, no transform-state reference
in the lookup construction).

## 14. Scientific before/after comparison

`tmp/phaseR1B/{before,after}-scientific-snapshot-*.json` — real production
`computeSprintMeasurements` output, before (Phase 9.4's own rerun) vs. after
(this phase's rerun), for all 4 benchmarks. **Byte-identical**, confirmed by
whole-file diff (Section 14/Part R) — contact identities, contact count,
step identities, Average Step Length, Peak Step Length, Step Frequency, and
every other field are unchanged.

## 15. Regression results

`phase-r1a-sanity.mjs`: 9/10 (the 1 failure is the expected, correct
mtime-guard — R1A's own script asserts `measurements.ts` wasn't touched
during *R1A's* window, and this phase, R1B, was explicitly authorized to
touch it). `phase-8-0a-step-length-forensic-sanity.mjs`,
`phase-8-0b-overlay-label-sanity.mjs`, `phase-9-1b-sanity.mjs`,
`phase-9-2b-sanity.mjs`, `phase-7-3b-temporal-state-sanity.mjs`,
`measurement-recovery-sanity.mjs`, `zone-step-counting-sanity.mjs`,
`timing-verification-sanity.mjs`, `analysis-report-sanity.mjs`: all pass
clean. `phase-9-0a-sanity.mjs`: 7/9 (same expected mtime-guard pattern for
`VideoOverlay.tsx`, from an earlier phase's own self-referential check).
`npm run typecheck`: clean. `npm run lint`: clean (0 warnings). `npm run
build`: production build succeeded (dev server safely stopped/restarted,
`curl` 200 confirmed).

## 16. Files changed

**Modified:**
- `src/lib/benchmark/measurements.ts` — new `physicalStepLengthM`/
  `physicalStepLengthState` fields + computation (additive only;
  `stepLengthM` untouched).
- `src/components/video/VideoOverlay.tsx` — label lookup now reads
  `physicalStepLengthM`.

**New:**
- `scripts/phase-r1b-manifest.mjs` (Part L, cross-benchmark manifest)
- `scripts/phase-r1b-presentation-step-length-sanity.mjs` (Part P, 24/24 tests)
- `scripts/phase-r1b-targeted-verification.mjs` (Part O, real UI validation)
- `docs/phase-r1b-presentation-only-physical-step-length-recovery.md` (this file)
- `tmp/phaseR1B/` (all deliverables, gitignored)

## 17. Anything not personally validated

Vanni 120, Vanni 60, and Gav were validated at the data layer (real
production reruns, byte-identical before/after, correct field values in the
manifest) but were **not** individually screenshotted with real decoded
video in this phase (Vanni 240 was prioritized as the only benchmark with a
real R1A case to demonstrate; Vanni 60/120/Gav's own render-path/science-path
contact-set alignment was not independently re-verified frame-by-frame the
way Vanni 240's was). Whether the Section 9 render-detection gap also
affects any contact in those other 3 benchmarks was not checked (none of
them currently have any `presentation_only` case to test in the first
place, so the question is moot for their current real data, but is not
proven never to occur there in general).

## 18. Git status

No commit, push, `db:reset`, or database mutation was performed. Modified:
`src/lib/benchmark/measurements.ts`, `src/components/video/VideoOverlay.tsx`.
New: 3 scripts under `scripts/phase-r1b-*`, this report, `tmp/phaseR1B/`
(gitignored). Dev server was safely stopped before the production build and
cleanly restarted after (`curl` 200 confirmed).

## 19. Phase closure decision

**CLOSED**, with one honestly-disclosed caveat. Success criteria review:

- ✅ Vanni 240 Case 1: meter value **is restored in the authoritative data
  model and the overlay lookup mechanism** — confirmed by direct code
  execution, exact matching value, correct state classification.
- ⚠️ Vanni 240 Case 1: **not yet visually confirmed on screen** for this
  specific contact, due to a separate, deeper, pre-existing render-path/
  science-path contact-set divergence (Section 9) — outside this phase's
  scope to fix (would require changing which contacts the renderer detects,
  not just how their values are looked up).
- ✅ Vanni 240 Case 2: meter value correctly remains absent.
- ✅ All previously-valid meter labels remain unchanged (byte-identical,
  zero regression, confirmed both by data diff and real screenshot).
- ✅ No fake/interpolated/estimated step length introduced anywhere.
- ✅ Scientific metrics remain unchanged (byte-identical before/after, all 4
  benchmarks).
- ✅ The UI consumes the authoritative presentation value
  (`physicalStepLengthM`) rather than independently recalculating distance.

R1B's own engineering scope — the data-model distinction and its correct,
isolated, tested wiring into the overlay — is complete and correct. The one
remaining gap is a newly-discovered, narrower, separate issue recommended
for a future phase, not silently absorbed into this one's claimed scope.
