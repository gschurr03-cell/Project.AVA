# Real 30 m experimental timing validation

Audit date: 2026-07-16
Status: implementation complete; physical validation failed and result withheld

## Current implementation audit

| Component | Finding | Decision |
| --- | --- | --- |
| Immutable input | Analysis snapshots already capture `calibrationInputs.gates`, timing direction/body reference, FPS request, and physical distance. The latest fixture snapshot predates some independent-gate aliases. | Require the complete v1 independent-gate snapshot and fail closed. Never read mutable gate geometry for timing. |
| Source timeline | Experimental artifacts preserve 197 real source frames/timestamps at native CFR 30 with zero synthetic frames. | Keep unchanged and use raw source timestamps. |
| Crossing geometry | `detectWorldBoundaryCrossing` uses independently propagated analytical lines and signed transitions but currently returns only timestamp/frame/confidence. | Extend its immutable evidence result; do not change the gate model. |
| Experimental result | `buildExperimental30Result` already preserves raw/reported zone time and raw/reported velocity under the conservative policy. | Supply the real zone and add a versioned timing-validation envelope. |
| Worker integration | The worker unconditionally calls the experimental builder with `zone: null`, so real calibrated timing can never persist. | Build timing solely from the claimed analysis input snapshot plus the pose artifact. |
| Uncertainty | Generic experimental metrics use one frame interval, with no gate/body/affine/manual-alignment components. | Add a conservative, decomposed v1 fixture timing uncertainty model without claiming timing-gate accuracy. |
| Persistence/history | `experimental_result` is immutable per analysis and completion is transactional/idempotent. | Extend JSON compatibly; legacy results remain readable and explicitly lack timing validation. |
| UI | Session page fetches `experimental_result` but has no consumer panel. | Add an experimental-only result card with reported values and advanced raw evidence. |
| External 2.77 | Repository, fixture manifest, notes, and prior documentation identify 2.77 s and now confirm 30 m, but original trigger/body/rounding definitions remain unknown. | Store independently as `partially_compatible`; never use it as an input or tuning target. |

## Implementation plan

1. Extend independent crossing output with raw signed distances, timestamps, interpolation,
   body/gate/transform confidence, feature support, affine residual, and model version.
2. Define a versioned experimental 30 m timing envelope with immutable snapshot identity,
   uncertainty decomposition, distance invariants, external reference compatibility, and
   deterministic result hash.
3. Make the worker validate every required snapshot/provenance field, calculate two world-
   gate crossings, and fail closed on inconsistency or unsafe evidence.
4. Persist the envelope transactionally inside `experimental_result` and render reported
   time/velocity prominently while keeping unsupported metric families null.
5. Generate an auditable crossing strip, run three identical immutable analyses, compare
   hashes/evidence, rerun the trusted nominal-60 control, and execute all regression gates.

## Completed validation

- Used immutable V1 analysis `da5d8219-1cb3-45a4-bb23-6b264ea9cfec`; the later mutable
  V2 draft (73/168) was not read or changed. V1 preserves 30 m, independent gate IDs and
  anchor versions, setup frames 72/170, left-to-right torso timing, CFR 30, 197 source
  frames, zero synthetic frames, and the original source-rate evidence.
- Start crossed between frames 99/100 at `3.308772908993173 s` (fraction
  `0.2631872697951886`); finish crossed between 166/167 at `5.552652068957092 s`
  (fraction `0.5795620687127262`). Complete signed-distance, gate/body/transform
  confidence, feature-support, residual, model, and uncertainty evidence is immutable.
- Raw time is `2.2438791599639187 s`; conservative reported time is `2.25 s`. Raw average
  velocity is `13.369703919565078 m/s`; consumer velocity is
  `13.333333333333334 m/s`. Both distance invariants reproduce 30 m within `1e-9`.
- Start uncertainty is `0.03058385427716577 s`, finish uncertainty is
  `0.01870447794320461 s`, and RSS combined uncertainty is
  `0.03585009954762663 s`. Overall confidence is `0.4676489045107069` (`low`); this is
  experimental video timing, not timing-gate-level accuracy.
- The engineering strip `/tmp/ava-real-30m-crossings.jpg` shows both source frames for
  each gate, the propagated gate, torso point, interpolated position, signed values,
  timestamps, interpolation fraction, confidence, and uncertainty. It is generated from
  the exact persisted pose artifact and immutable V1 snapshot.
- Analyses V10/V11/V12 produced byte-equivalent timing envelopes and hash `237392ec`.
  No crossing, result, warning, confidence, or uncertainty nondeterminism was observed.
- External `2.77 s / 30 m` remains independent and `partially_compatible`; trigger, body
  reference, method, and rounding remain unknown. The reported difference is `0.52 s`
  (`18.772563176895307%`) and is outside AVA's uncertainty.
- Static V16 exactly matched V15 metrics and deterministic result content after excluding
  expected analysis identity/timestamps. It remained validated at 60 FPS with
  `static_precision` and no experimental badge. The 60/120/240 analysis-clock sanity and
  independent/no-polygon regressions passed unchanged.

## Completion assessment

The requested evidence, persistence, UI, history, repeatability, artifact, and regression
gates are complete for this fixture. Zone timing is assessed at **88%**, experimental
30 FPS at **75%**, panning at **86%**, and overall AVA Sprint MVP at **83%**. These are
engineering completion estimates; one fixture does not scientifically validate the model.

## Forensic correction to validation status

A subsequent source-pixel audit found that V1's selected start segment is a longitudinal
paint dash, not a transverse timing gate. Its infinite extension triggers the torso at
frames 99–100 after the athlete has already passed the visible marker. The saved finish
aligns with a painted diagonal beside lane numbers, while separate timing equipment appears
farther down-track. Neither physical separation nor equivalence to the external 2.77
triggers is established.

The stored calculations and repeatability evidence remain immutable, but `2.25 s` must be
withheld as a 30 m performance result. No production math or historical analysis was
changed. See `docs/real-30m-timing-discrepancy-investigation.md` for the evidence. Overall
MVP completion remains 83%; this investigation does not raise any completion percentage.
