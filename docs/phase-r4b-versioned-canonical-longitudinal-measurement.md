# Phase R4B — Versioned Canonical Longitudinal Measurement Activation

Status: **complete**. Scope: narrow model migration justified by
[Phase R4A](phase-r4a-canonical-longitudinal-measurement-model-audit.md). No
commit, push, or `db:reset` was performed. Contact detection, step detection,
calibration, gate-crossing math, and Average Velocity were not touched.

## 1. What changed

A new versioned scientific measurement model lets `computeSprintMeasurements()`
run in one of two modes:

- **`LEGACY_2D`** (default, unchanged behavior) — step length is full 2D
  Euclidean contact-to-contact displacement; Peak Velocity's distance term is
  the same 2D Euclidean stride displacement.
- **`CANONICAL_LONGITUDINAL`** (new, opt-in) — step length and Peak Velocity's
  distance term both use the same longitudinal coordinate already implemented
  in `zoneStepAnalysis.ts`'s `analyzeZoneSteps`, previously only reachable for
  panning cameras via real camera-motion evidence.

The version is a new field, `measurementModelVersion`, added to
`src/lib/benchmark/measurementModel.ts`:

```ts
export const MEASUREMENT_MODEL_LEGACY_2D = "LEGACY_2D" as const;
export const MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL = "CANONICAL_LONGITUDINAL" as const;
export type MeasurementModelVersion = typeof MEASUREMENT_MODEL_LEGACY_2D | typeof MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL;
export const DEFAULT_MEASUREMENT_MODEL_VERSION: MeasurementModelVersion = MEASUREMENT_MODEL_LEGACY_2D;
```

This mirrors the repo's existing small-versioned-constants-file pattern
(`CONSERVATIVE_TIMING_POLICY_V1` in `timingPolicy.ts`,
`ZONE_STEP_MEASUREMENT_VERSION` in `zoneStepAnalysis.ts`) rather than
inventing new architecture (Part A).

## 2. The equations

Canonical longitudinal coordinate, reused unmodified from `zoneStepAnalysis.ts`:

```
S = midpoint(startGate),  F = midpoint(finishGate)
u = normalize(F - S)                          (unit running-axis vector)
s(P) = dot(P - S, u) × metersPerAxisUnit       (s(S)=0, s(F)=zoneLengthMeters)
```

Step length:

```
LEGACY_2D:            L_i = hypot((x_i-x_{i-1})×frameWidth, (y_i-y_{i-1})×frameHeight) × metersPerPixel
CANONICAL_LONGITUDINAL: L_i = s(contact_i) - s(contact_{i-1})
```

Peak Velocity's distance term (window/temporal logic unchanged — see
`timingPolicy.ts`'s `reportStrideWindows`):

```
LEGACY_2D:            dist = hypot((b.wx-a.wx)×frameWidth, (b.wy-a.wy)×frameHeight) × metersPerPixel
CANONICAL_LONGITUDINAL: dist = s(b) - s(a)
v_i = dist / Δt_i
```

Average Velocity and Step Frequency are untouched in both modes:
`V_avg = zoneLengthMeters / zoneTimeS`; `stepFrequencyHz` from the existing
contact-count/zone-time computation.

## 3. How stationary cameras reach the canonical coordinate

Before this phase, `zoneStepSummary` (the object that carries the canonical
coordinate) only activated when real camera-motion evidence
(`anchorOptions.cameraEvidence`) was supplied — which production only does for
`cameraType === "panning"`. All 4 protected benchmarks are stationary, so this
path was completely dormant for them (R4A finding).

R4B adds a second, stationary-only route into the same, unmodified
`analyzeZoneSteps()` pure function. It does **not** invent a new
camera-projection system or fabricate homography/camera evidence — it reuses
values the legacy path already computes and already gracefully degrades for a
stationary camera (`off(t) = {x:0, y:0}` when no camera track is available):

- `gateWorldX` (existing) and a new mirror, `gateWorldY`, give the gates' full
  2D camera-compensated position (previously only X was needed, for the
  legacy scalar scale).
- `WorldMark.wx / wy` (existing, computed unconditionally for every contact)
  give each contact's camera-compensated position.

Selection is now `measurementModelVersion === CANONICAL_LONGITUDINAL &&
!cameraEvidence` for the new stationary route, or `cameraEvidence != null` for
the pre-existing panning route (byte-identical, untouched) — replacing the
`cameraType === "panning"` coupling (Part D). Camera-type eligibility for
*input* (still only panning cameras carry real `cameraEvidence`) is
unaffected; only *scientific model selection* no longer reads `cameraType`
directly.

## 4. The isolation bug found and fixed mid-phase

Initial implementation gated step length **and** three metrics that were
explicitly out of scope — `validMarks`/zone membership, Step Frequency, and
ground-contact/flight time — on the same bare `zoneStepSummary != null` check.
Because the new stationary route makes `zoneStepSummary` non-null far more
often than before, this leaked into Step Frequency, which the dual-mode
benchmark script caught immediately (`freqUnchanged=false` for all 4
benchmarks).

Fix: `zoneStepSummaryGovernsLegacyMetrics = zoneStepSummary != null &&
cameraEvidence != null` — true only on the pre-existing panning route.
`validMarks`/frequency/contact-flight-time are gated on this flag and so keep
their original computation under the new stationary-canonical route, exactly
as Parts I/J/T require. Step-length and Peak-Velocity fields remain gated on
bare `zoneStepSummary`, since migrating those is in scope for both routes.

## 5. Dual-mode benchmark results (real data, all 4 protected benchmarks)

| Benchmark | Legacy avg step length (m) | Canonical avg step length (m) | Δ | % | Contacts/Freq/Vel/ZoneTime unchanged |
|---|---|---|---|---|---|
| Gav      | 2.14716 | 2.17303 | +0.02588 | **1.21%** | yes |
| Vanni60  | 1.98203 | 1.99307 | +0.01104 | **0.56%** | yes |
| Vanni120 | 1.93667 | 1.97110 | +0.03444 | **1.78%** | yes |
| Vanni240 | 1.91918 | 2.02869 | +0.10950 | **5.71%** | yes |

Consistent in order of magnitude and ranking with R4A's independently-derived
figures (0.66% / 0.57% / 1.77% / 5.73%) — not materially different (Part M).

| Benchmark | Legacy peak velocity (m/s) | Canonical peak velocity (m/s) | Δ | % |
|---|---|---|---|---|
| Gav      | 11.09215 | 11.09113 | -0.00102 | 0.009% |
| Vanni60  | 10.66229 | 10.66204 | -0.00025 | 0.002% |
| Vanni120 | 9.74468  | 9.74407  | -0.00061 | 0.006% |
| Vanni240 | 10.22622 | 10.22103 | -0.00519 | 0.051% |

Peak Velocity moves far less than step length. Cause: Peak Velocity is
computed over a full-stride (2-interval) window; lateral positional noise that
directly inflates a single-step 2D hypot distance partially cancels over the
longer window, so the 2D-vs-longitudinal distinction has much less effect
there than on individual step length (Part N).

Zone crossing, Average Velocity, Step Frequency, contact identities, and
contact timestamps were confirmed unchanged (byte-identical) for all 4
benchmarks in both modes.

## 6. Legacy replay

A call to `computeSprintMeasurements()` with no `measurementModelVersion`
field — i.e. every existing call site (`page.tsx`, `loadContext.ts`) and every
historical analysis artifact — defaults to `LEGACY_2D` and reproduces
byte-identical output to the pre-R4B production baseline independently
captured during R4A (`tmp/phaseR4A/contact-longitudinal-manifest.json`),
confirmed for all 4 benchmarks: `tmp/phaseR4B/legacy-compatibility.json`.
Panning-camera sessions (which already used the canonical coordinate before
this phase, via real `cameraEvidence`) are also unaffected — that code path
is untouched.

## 7. Cross-metric coherence

Under `CANONICAL_LONGITUDINAL`, step length and Peak Velocity's distance term
both read from the same `longitudinalM` values on `zoneStepSummary.contacts`
(`longitudinalByContactId` map in `measurements.ts`). No other 2D
hypot-distance calculation feeding scientific output was found in a
repo-wide search of `stepLength`, `peakVelocity`, `hypot`, and `velocity`
call sites outside `measurements.ts`.

## 8. Precision / provenance

Meters are stored as full float; centimeter figures in this document and in
`tmp/phaseR4B/*.json` are `× 100` for display only — no rounding, no
centimeter buckets, no claim of 1cm accuracy (current physical precision
remains ~3–7cm per R4A). `measurementModelVersion` is serialized on every
`SprintMeasurements` result, for both modes, on all 4 benchmarks
(`tmp/phaseR4B/provenance-audit.json`). No consumer-facing confidence
percentage was added.

## 9. Determinism

`CANONICAL_LONGITUDINAL` was run twice, independently, across all 4
benchmarks; the full result-set SHA-256 hash matched exactly:

```
18f6988efe100de39f3f90a8c665fb020a7c5e286c32b8e69e38a42f66040b64
```

(`tmp/phaseR4B/determinism-manifest.json`.)

## 10. Tests

`scripts/phase-r4b-versioned-longitudinal-measurement-sanity.mjs` — 24
required checks + 2 bonus checks (determinism manifest, mtime guard on
untouched files `steps.ts`/`contacts.ts`/`zoneAnchors.ts`). All pass.

`scripts/phase-r4b-dual-mode-benchmark.mjs` — generates the
`tmp/phaseR4B/*.json` deliverables from real compiled production code run
against real stored pose artifacts and real DB calibration gates (no
synthetic scientific data for the 4 protected benchmarks).

## 11. Regression sweep (Part W)

| Suite | Result |
|---|---|
| R4A canonical measurement model sanity | 13/14 pass — 1 expected mtime-guard fail (see below) |
| R3A contact acquisition sanity | 15/16 pass — 1 expected mtime-guard fail (see below) |
| R1B presentation step length sanity | 24/24 pass |
| R1C contact/render alignment sanity | 17/17 pass |
| R3D contact detector replay | pass |
| 7.3B temporal state sanity | 11/11 pass |
| Measurement recovery sanity | all pass |
| Zone step counting sanity | 25/25 pass |
| Timing verification sanity | all pass |
| Ground calibration sanity | all pass |
| Vanni240 metric evidence sanity | all pass |
| Analysis report sanity | ok |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | succeeds |

**The two non-passing checks, diagnosed:**

- R4A suite check `[12]`, *"no production mutation (all scientific source
  files predate this phase's own new files)"* — an mtime guard asserting
  *R4A's own* phase left `measurements.ts` untouched. It fails now because
  R4B legitimately modified that file — this is R4B's entire purpose, not a
  defect in R4A's findings or logic.
- R3A suite check `[16]`, *"zero production scientific code changed this
  phase (mtime guard on steps.ts/measurements.ts/stepIntegrity.ts/overlay.ts/
  gates.ts)"* — same pattern, same file, same cause.

No other check failed in either suite. Both are historical "nothing changed
since I ran" guards tripping on this phase's own intentional, in-scope edit
to `measurements.ts` — consistent with the same pattern seen across earlier
phases in this effort (a later legitimate phase naturally trips an earlier
phase's own frozen-in-time assertion). Neither indicates a regression in
contact detection, step detection, calibration, or gate-crossing math — none
of which were touched.

## 12. Closure decision: CASE B

Canonical longitudinal measurement is implemented, deterministic, and proven
backward-compatible — but is **not** made the default for new analyses this
phase. `page.tsx` and `loadContext.ts` still call `computeSprintMeasurements()`
without a `measurementModelVersion`, so every analysis today — new or old —
continues to get `LEGACY_2D` by omission. Rationale:

- Step length materially changes (0.56%–5.71% across real benchmarks); this
  is a real scientific difference, not a bug, but changing default behavior
  for new analyses is a product/scientific decision outside this phase's
  "narrow model migration" scope (task explicitly forbade changing UI
  presentation and forbade auto-defaulting to canonical).
- The recommended rollout (support-both → dual-run → prove deterministic →
  inspect differences → decide default) has completed steps 1–4. Step 5
  (deciding the default) needs a human call on which model's step-length
  values coaches/athletes should see, informed by field-validation data
  (`docs/field-validation-protocol.md`), not just internal consistency.

## Deliverables

`tmp/phaseR4B/`: `legacy-baseline.json`, `canonical-results.json`,
`dual-mode-comparison.json`, `step-length-deltas.json`,
`peak-velocity-deltas.json`, `provenance-audit.json`,
`legacy-compatibility.json`, `determinism-manifest.json`.
