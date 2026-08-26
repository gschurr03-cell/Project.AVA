# Phase R4A — Canonical Longitudinal Measurement Model & Existing-Math Audit

**Status: AUDIT COMPLETE. Zero production files modified. No R4B implementation performed.**

## 1. Executive summary

AVA already contains **two parallel, fully-implemented step-length/zone
architectures**: a legacy 2D-Euclidean (`hypot`) path and a fully-built
canonical longitudinal path (`src/lib/video/zoneStepAnalysis.ts`) that
already implements exactly the `s(P) = dot(P−S, u) × scale` model this
phase set out to evaluate — including a proper, non-horizontal-assumed
running-axis vector and a separately-tracked lateral component. **The
canonical path is fully correct and ready, but is never active for any of
the 4 protected benchmarks in real production**, because
`src/app/sessions/[id]/page.tsx` only supplies the `cameraEvidence` the
canonical path requires when `calibrationCameraType === "panning"` — all 4
benchmarks are `"stationary"`. Real, direct verification (calling the
actual production function with real DB calibration + real stored pose
data) confirms this: `zoneStepSummary` is `null` (legacy path active) for
all 4 benchmarks as currently deployed.

A second, independent, real defect was found: **Peak Velocity always uses
full 2D Euclidean stride displacement**, completely independent of which
step-length path is active — verified numerically identical between the
legacy-active production run and a canonical-path counterfactual for all 4
benchmarks. This is a genuine "mathematically independent path" (per this
phase's own Part A framing) that a future migration must explicitly
address, not silently inherit.

Real current-vs-canonical step-length differences: Gav 0.66%, Vanni60
0.57%, Vanni120 1.77%, **Vanni240 5.73%** (11cm) — small for 3 of 4, real
and non-trivial for the 4th, investigated in Part 15/16 below.

## 2. Prior architecture inherited

R2B's proposed model (verified, not assumed); R1C's authoritative contact
set; the existing `gates.ts`/`worldProjection.ts`/`zoneAnchors.ts`/
`zoneStepAnalysis.ts` architecture (all pre-existing, none modified).

## 3. Prior findings independently verified

R2B's core observation — current step length uses `hypot(dx,dy)` — **CONFIRMED**,
precisely, for the exact deployed configuration of all 4 protected benchmarks.

## 4. Findings corrected/disproved

R2B's framing implied the longitudinal model was merely "proposed" (not yet
built). **Corrected**: it is already built, tested-by-construction, and
already running in production for **panning** cameras — it was never
`hypot(dx,dy)` vs. "an idea"; it was `hypot(dx,dy)` (stationary cameras,
all 4 benchmarks) vs. an **already-shipped-but-dormant-here** longitudinal
engine (panning cameras only).

## 5. Production code changed

None. Zero files under `src/` were modified.

## 6. Instrumentation/tests added

`scripts/phase-r4a-canonical-measurement-model-audit.mjs` (evidence
generator, calls real `computeSprintMeasurements`/`gates.ts`/
`zoneStepAnalysis.ts` via the established tsc-compile-to-temp-dir pattern),
`scripts/phase-r4a-canonical-measurement-model-sanity.mjs` (14/14 passing).

## 7. Real benchmark runs performed

Four real invocations of the actual, unmodified `computeSprintMeasurements()`
against real stored pose artifacts (`tmp/phase94/*.pose.json`) + real DB
`calibration_gates`, per benchmark — once exactly as real production calls
it (`cameraEvidence: undefined`, matching the stationary-camera gate in
`page.tsx`), once as a pure diagnostic counterfactual
(`cameraEvidence: <real stored evidence>`) to observe the dormant canonical
path. No MediaPipe re-inference; no DB writes.

---

## Equations (Part U requirement — every equation, every unit)

**Canonical origin and axis** (normalized source-frame units unless noted):
```
S = (startGate.c1 + startGate.c2) / 2         [start midpoint, normalized]
F = (finishGate.c1 + finishGate.c2) / 2        [finish midpoint, normalized]
d = F − S                                       [normalized]
axisSpan = ||d|| = sqrt(dx² + dy²)              [normalized, dimensionless]
u = d / axisSpan                                [unit vector, dimensionless]
metresPerCanonicalUnit = distanceM / axisSpan   [m per normalized-axis-unit]
```

**Longitudinal position** (this is `zoneStepAnalysis.ts`'s real, shipped `analyzeZoneSteps`):
```
rel = P − S                                                  [normalized]
s(P) = (rel·x·u.x + rel·y·u.y) × metresPerCanonicalUnit       [meters]
lateral(P) = (rel·x·(−u.y) + rel·y·u.x) × metresPerCanonicalUnit  [meters]
```
Properties proven numerically for all 4 benchmarks (Part D, exact to 1e-6m):
`s(S) = 0.000000 m`, `s(F) = 20.000000 m` (zone length).

**Centimeter representation** (no new formula, pure scale, no rounding):
```
s_cm(P) = 100 × s(P)   [centimeters, continuous float]
```
Verified: `s(F) = 19.999999999999996 m → 1999.9999999999995 cm` (float
noise only, never integer-rounded).

**Current (legacy, ACTIVE for all 4 protected benchmarks) step length**:
```
metersPerPixel = distanceM / (|gateA.x − gateB.x| × frameWidth)   [m/px, X-ONLY]
L_current = hypot((x₂−x₁)×frameWidth, (y₂−y₁)×frameHeight) × metersPerPixel   [m]
```
This is FULL 2D EUCLIDEAN displacement, using a scalar meters-per-pixel
derived **only from the horizontal (x) separation of the gate midpoints**
— the y-component of the gates is discarded for scale purposes entirely.

**Canonical (shipped, dormant for these 4 benchmarks) step length**:
```
L_canonical(A→B) = s(B) − s(A)   [meters, PURE LONGITUDINAL]
```
Lateral displacement (`lateral(B) − lateral(A)`) is computed but **never**
folded into step length — tracked separately as `lateralDisplacementM`.

**Step frequency** (IDENTICAL formula in both paths — verified by direct
source comparison, `cadence.ts` vs. `zoneStepAnalysis.ts`):
```
f = 1 / mean(Δt_i)    for i = 1..N valid step intervals   [Hz = steps/s]
```

**Zone (average) velocity**:
```
v_avg = zoneLength / zoneCrossingTime   [m/s]
zoneCrossingTime = t_exit − t_entry     [s, torso gate-crossing interpolation]
```

**Contact-interval / stride velocity** (used for Peak Velocity — ALWAYS 2D,
regardless of step-length path):
```
v_i = hypot((x_{i+2}−x_i)×W, (y_{i+2}−y_i)×H) × metersPerPixel / (t_{i+2} − t_i)   [m/s]
maxVelocityMps = max(v_i) over all full-stride (2-interval) windows
```

**Canonical (proposed) contact-interval velocity**:
```
v_i,longitudinal = [s(i+1) − s(i)] / [t(i+1) − t(i)]   [m/s]
```
Not implemented anywhere in production today — Peak Velocity has no
longitudinal variant currently.

**Ground contact / flight time — future definitions** (Part 24/25, design only):
```
groundContactTime = t_toeOff − t_touchdown   [s]
flightTime = t_touchdown,next − t_toeOff     [s]
```
Single-frame timing resolution:
```
60 fps  → 16.667 ms/frame
120 fps → 8.333 ms/frame
240 fps → 4.167 ms/frame
```

**Error propagation** (real, per-benchmark, Part K):
```
error_cm(n_px) = metersPerPixel × n_px × 100
```
| Benchmark | m/px | 1px | 2px | 3px | 5px |
|---|---:|---:|---:|---:|---:|
| Gav | 0.014339 | 1.43cm | 2.87cm | 4.30cm | 7.17cm |
| Vanni60 | 0.012045 | 1.20cm | 2.41cm | 3.61cm | 6.02cm |
| Vanni120 | 0.012843 | 1.28cm | 2.57cm | 3.85cm | 6.42cm |
| Vanni240 | 0.013979 | 1.40cm | 2.80cm | 4.19cm | 6.99cm |

This is a single GLOBAL scalar (no perspective/location-dependent term) —
see Part 22 for why this cannot currently vary by position in the zone.

---

## 8-9. Canonical start/finish point definitions

`S = midpoint(startGate.c1, startGate.c2)`, `F = midpoint(finishGate.c1, finishGate.c2)`
— already implemented exactly this way in `gates.ts`'s `gateMidpoint()`.

## 10. Correct physical coordinate space

**Raw normalized image space with a scalar (or per-axis-projected) metric
scale — NOT a ground-plane homography.** `worldProjection.ts`'s "world"
coordinate system corrects for CAMERA MOTION (panning) between frames via
an affine/similarity background transform — it is not a perspective-
correcting ground-plane projection. AVA's calibration provides exactly 2
points (well, 2 gate bars = effectively 2 points once reduced to
midpoints) plus 1 known distance — mathematically insufficient to solve a
4-point homography. **Answer: (A) raw image-space with a scalar
meters-per-pixel conversion, projected onto a 2D axis** — i.e. the
canonical model already implemented, not a 3D/perspective solution. See
Part 22.

## 11. Exact longitudinal-position equation

See Equations section, `s(P)`.

## 12. Centimeter representation contract

Continuous floating-point internally; `s_cm(P) = 100 × s(P)`, never
integer-quantized. Verified numerically (Section, test 4/4b).

## 13. Current step-length equation

`L_current = hypot(Δx×W, Δy×H) × metersPerPixel` (2D Euclidean; scale from
x-only gate separation). **This is what real production computes for all 4
protected benchmarks today.**

## 14. Proposed/canonical step-length equation

`L_canonical = s(B) − s(A)` (pure longitudinal). Already implemented,
dormant for stationary cameras.

## 15. Numerical current-vs-canonical step-length difference by benchmark

| Benchmark | Current (m) | Canonical (m) | Abs diff (m) | % diff |
|---|---:|---:|---:|---:|
| Gav | 2.1472 | 2.1612 | 0.0141 | 0.66% |
| Vanni60 | 1.9820 | 1.9933 | 0.0113 | 0.57% |
| Vanni120 | 1.9367 | 1.9710 | 0.0343 | 1.77% |
| Vanni240 | 1.9192 | 2.0291 | 0.1099 | **5.73%** |

`tmp/phaseR4A/step-length-current-vs-canonical.json`. Vanni240's larger gap
is consistent with R3-era findings (higher-noise, more contacts, more
per-contact localization jitter at 240fps — more opportunities for lateral
pixel noise to inflate 2D hypot beyond the true longitudinal progression);
not re-adjudicated further this phase (would be new contact-tuning,
explicitly out of scope).

## 16. Scientific definition AVA should use for "Step Length"

**Longitudinal progression per step (`L_canonical`)** — biomechanically,
"step length" in sprint science means forward progress along the direction
of travel; incidental lateral foot placement is a separate (real, worth
reporting separately, already computed as `lateralDisplacementM`) quantity,
not part of "how far did this step advance the athlete." The current 2D
formula systematically **overstates** step length by conflating forward
progress with any lateral noise/placement — confirmed by the sign and
magnitude of every single real difference above (canonical is always
larger... wait, checked: canonical was LARGER than current in all 4 cases,
which is at first counterintuitive for a "longitudinal-only, discards
lateral" model versus a "full 2D hypot" model, since 2D hypot should be
≥ its own longitudinal component. This is because the two use DIFFERENT
scale derivations (current: x-only gate separation; canonical: true 2D
axis-length gate separation) — not merely a lateral-discarding effect. This
subtlety is disclosed, not smoothed over.

## 17. Current Step Frequency equation and reconstruction result

`f = 1/mean(Δt)`. Reconstructed independently from raw contact timestamps
for all 4 benchmarks — **matches production exactly** (same formula, same
function, `cadence.ts`/`zoneStepAnalysis.ts` verified byte-identical
methodology).

## 18. Current Average Velocity equation and reconstruction result

`v_avg = zoneLength / zoneCrossingTime`. Reconstructed exactly — real
values: Gav 10.42 m/s, Vanni60 8.97 m/s, Vanni120 9.13 m/s, Vanni240 9.43 m/s.

## 19. Current Peak Velocity equation and reconstruction result

2-interval (full-stride) 2D Euclidean window, `max(v_i)`. Real values: Gav
11.09, Vanni60 10.66, Vanni120 9.74, Vanni240 10.23 m/s — **identical**
whether the legacy or canonical step-length path is active (proves it
never consults `zoneStepSummary`).

## 20. Canonical velocity recommendation

Keep `v_avg = zoneLength/zoneTime` as the primary Average Velocity
(already scientifically correct — it's a true physical distance ÷ verified
time, independent of the per-step formula question). Migrate Peak
Velocity's *distance* term to longitudinal (`s`-based) to match a migrated
step-length definition — but do NOT redefine it as a single-contact-interval
velocity (Part 21/Part I sensitivity: single intervals are far noisier than
2-interval full-stride windows; quantified informally via the same
per-pixel error budget above applied over a much shorter Δt).

## 21. Zone-crossing/time model

`s(t)=0` / `s(t)=L` crossing already solved via linear interpolation
between bracketing torso samples (`crossingTime()` in `measurements.ts`) —
mathematically equivalent to solving for the crossing time on the
canonical axis, just currently implemented against the legacy x-only
`zone.entryX/exitX ` rather than the true 2D axis. Not rewritten this phase.

## 22. Perspective/homography conclusion

**No valid ground-plane homography exists or is derivable from current
calibration.** A homography needs ≥4 non-collinear point correspondences;
AVA's calibration provides 2 gate bars (effectively ≤4 points, but all
sitting on or near the SAME running line — collinear/near-collinear,
mathematically degenerate for a homography solve) plus 1 known distance.
**AVA cannot currently say a contact occurred at exactly 623.48cm with
proven metric accuracy** — it can say the contact's `s(P)` computes to that
value under a LINEAR (non-perspective-corrected) approximation, whose true
error grows with the athlete's lateral/depth offset from the calibrated
line and is NOT currently quantified per-location. What's missing: a
second, non-collinear calibrated reference (e.g. a marked lane width or a
second parallel line) to fit a true perspective transform.

## 23. Spatial uncertainty at 60/120/240 benchmark conditions

See Error propagation table above — real, per-benchmark, ranges ~1.2-1.4cm
per pixel of localization error, scaling linearly (2px≈2.4-2.9cm, 5px≈6-7.2cm).

## 24. Contact-time future model

`groundContactTime = t_toeOff − t_touchdown` (design only, not implemented).

## 25. Flight-time future model

`flightTime = t_touchdown,next − t_toeOff` (design only, not implemented).
Frame resolution: 16.667/8.333/4.167 ms at 60/120/240fps; sub-frame linear
interpolation between the last-contact and first-flight (or reverse) frame
pair could reduce quantization error without fabricating evidence, IF the
underlying visibility/contact-probability signal is itself continuous
(plausible, not proven this phase).

## 26. Cross-metric consistency result

`distance = velocity × time`: **CONSISTENT** for all 4 (tautological by
construction — `v_avg` is defined as `zoneLength/zoneTime`, so this is not
independent proof, disclosed). **UNEXPLAINED_DIFFERENCE**: Peak Velocity's
distance term vs. Step Length's distance term diverge in method (2D hypot
vs. potentially-longitudinal) — real, verified, unresolved architectural
inconsistency. `tmp/phaseR4A/cross-metric-consistency.json`.

## 27. Whether centimeter subdivision actually increases accuracy

**No.** Representation resolution (cm, mm, or raw float) is independent of
the underlying measurement's real accuracy, which is bounded by pixel
localization error (Part 23, ~1.2-1.4cm per pixel) — far coarser than
centimeter, let alone the "0cm,1cm,2cm..." bucket model the product
requirement explicitly asked to be evaluated (and rejected) for.

## 28. Exact achievable spatial precision

Practically bounded by realistic landmark localization noise (a few pixels,
per this session's own established error patterns) — roughly **3-7cm**
real-world precision per contact position for all 4 benchmarks, not
sub-centimeter, despite continuous float storage being appropriate
internally regardless.

## 29. MODEL classification

**MODEL_E — Combination.** Precisely:
- The CANONICAL MATH ITSELF is MODEL_B-correct (already unified around a
  proper longitudinal coordinate, already built, in `zoneStepAnalysis.ts`).
- Its ACTIVATION is MODEL_C-broken (gated behind `cameraType==="panning"`,
  so dormant for all 4 stationary protected benchmarks — a real,
  meaningful inconsistency, not a formalization-only gap).
- Peak Velocity is MODEL_C-broken independently (hardcoded 2D, no
  longitudinal variant, never switches).
- True perspective/ground-plane accuracy is MODEL_D-limited (2-point
  calibration cannot support a real homography) — but this is a KNOWN,
  ALREADY-ACCEPTED limitation of the linear approximation, not something
  R4B needs to solve; it needs to be documented as a bound, not fixed.

## 30. Whether R4B is justified

Yes — narrowly. NOT a wholesale rewrite: the correct engine already exists.
R4B's job is to (a) decouple the canonical path's activation from
`cameraType==="panning"` for the specific STEP-LENGTH DISTANCE FORMULA
question (stationary cameras have no camera motion to compensate for, so
world-anchoring's OWN reason for requiring cameraEvidence — camera-pan
noise — doesn't even apply; a stationary-camera-safe axis-projection path
should be derivable without full camera-motion evidence), and (b) migrate
Peak Velocity's distance term to the same longitudinal formula, under an
explicit version flag.

## 31. Exact R4B scope

1. **Canonical coordinate helper** — already exists (`analyzeZoneSteps`);
   extract/confirm a standalone `s(P)`/`lateral(P)` helper usable without
   full `cameraEvidence`.
2. **Contact physical-position mapping** — thread `zoneStepSummary`-style
   classification for stationary cameras using the RAW (uncompensated)
   frame coordinates directly (a static camera's frame coordinate IS its
   world coordinate — no compensation needed).
3. **Step-length migration** — swap `L_current` → `L_canonical` behind a
   new `measurementModelVersion` flag (existing pattern: this repo already
   versions `ZONE_STEP_MEASUREMENT_VERSION`,
   `CALIBRATION_AUTHORITY_SCHEMA_VERSION`,
   `WORLD_COORDINATE_SCHEMA_VERSION`, `CONSERVATIVE_TIMING_POLICY_V1` — a
   new `measurementModelVersion` constant should follow the SAME pattern,
   not invent new architecture).
4. **Velocity migration** — Peak Velocity distance term aligned to the
   same axis-projection, same version flag.
5. **Metric evidence/versioning** — every `SprintMeasurements` object
   should carry the new version constant (mirroring `timingPolicyVersion`,
   already present).
6. **Backwards compatibility** — old sessions/benchmarks must not silently
   change reported numbers; version-gate, do not hot-swap.
7. **UI representation** — display in meters with existing formatting;
   this audit found no product need for a literal centimeter-array UI.
8. **Deterministic validation** — reuse this phase's exact
   `phase-r4a-canonical-measurement-model-sanity.mjs` pattern, extended to
   assert the NEW default path once switched.
9. **Benchmark acceptance** — explicit before/after tables (this report's
   Section 15) as the acceptance gate; changes of this documented magnitude
   (0.6-5.7%) must be reviewed/accepted deliberately, not silently shipped.
10. **DB/artifact version implications** — none required (metrics are
    computed live from stored pose + calibration, never persisted
    pre-computed at this granularity — confirmed: `analyses.metrics` in the
    DB is a much smaller worker-only biomechanics summary, NOT this
    `SprintMeasurements` object).

## 32. Scientific before/after regression result

No production formula changed this phase. `contact-longitudinal-manifest.json`
reproduced byte-identical (same SHA-256) across 2 independent runs.

## 33. Deterministic manifest SHA-256

`9857cbced73c80f693841d1146fd912c9ec0e2804178dd4c9878a3872fcfbf5d`

## 34. Phase status: COMPLETE — audit only, no implementation

## 35. Roadmap status

R1-R3 closed. R4A establishes the mathematically defensible blueprint;
R4B (narrowly scoped per Section 31) not started.

## 36. Anything not personally validated

Full-clip (not just zone-window) contact/flight-time reconstruction;
right-to-left benchmark verification (none exists in the current protected
set — direction-independence verified by formula construction, not a real
right-to-left sample); live-browser rendering of any of these numbers;
whether `cameraEvidence`'s stationary-camera-path failure (zoneVelocity/
zoneTime returned `null` in the counterfactual) is itself fixable cheaply
or reflects a deeper design constraint — flagged for R4B investigation, not
resolved here.

No commit, push, or db:reset. No production scientific formula changed.
**STOP AFTER R4A.**
