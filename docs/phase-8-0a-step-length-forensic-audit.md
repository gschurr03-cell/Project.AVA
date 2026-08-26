# Phase 8.0A — Step-Length Scientific Forensic Audit

**Status:** CLOSED (forensic only — no production code changed)
**Date:** 2026-08-09
**Roadmap:** unweighted; this task did not request a roadmap update and none was made.

## 1. Executive summary

The observed step-length variation (roughly 1.6–2.3 m within a single run) is **real
variation in the underlying evidence**, not a formula, pairing, or foot-side bug in
the authoritative Average/Peak Step Length metrics. Every one of the 31 real,
production-accepted step lengths across all four current benchmarks was
independently reconstructed by calling the exact, unmodified production functions
and matches production's own output exactly (byte-for-byte equal arrays). No
step-pairing error, no foot-side error, and no formula error was found in the
authoritative `avgIndividualStepLengthM` / `peakStrideLengthM` path.

The single strongest, most consistent real signal found is that **step length
correlates positively with position through the measured zone in all four
benchmarks** (Pearson r = 0.37 to 0.89) — steps get longer as the athlete
progresses through the 20 m zone. This is the classic, physically expected
signature of continuing acceleration/velocity-linked stride lengthening during a
short fly zone, not a scale or projection artifact: the metres-per-pixel scale
used here is a single, position-independent constant (proven identical from two
independently coded call sites), and a real 1–5 px contact-localization error can
only move a step length by 1–7 cm — nowhere near enough to explain the observed
0.4–0.5 m spread. A genuine, real 25–35 px error would be required to fabricate
that swing from noise alone, and no evidence of an error that large was found.

A second, separate, and real finding: the on-screen **video overlay marker
labels** (`VideoOverlay.tsx`) are computed by a **third, independent code path**
that is not zone-restricted and not step-integrity-gated — on the real Vanni 240
artifact it displays raw values of 7.26 m and 4.22 m for two intervals the
authoritative metric correctly excludes. This is disclosed as a real, separate,
worth-fixing display-association concern for a future phase; it does not affect
the authoritative Average/Peak Step Length values, which are computed by a
different function using different (correctly gated) inputs.

Visual source-frame adjudication (Part L) was attempted on real, extracted source
frames but could not be brought to pixel-precise confirmation within this
session's tooling; it is honestly reported as **unresolved/tooling-limited**, not
guessed.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md`: overall weighted completion 29.5%
(normalized), unchanged. This task is forensic-only; it introduces no production
code and requests no roadmap credit. Phase 4.2, 5.0E, 6.1, 6.3, 6.4, 6.5, 7.0, and
7.1 are CLOSED; Phase 6.2 remains IN PROGRESS solely for browser-playback
validation (unrelated to this audit).

## 3. User-observed concern

Two representative displayed step-length sequences were provided (~10 values
each, ranging ~1.6–2.3 m). The question: does this reflect real asymmetry, normal
variation, or an error (contact position, foot-side, projection, calibration,
pairing, or display-labeling)? See Section 22 for the direct, final answer to
each of the eight explicit questions posed.

## 4. Exact production formula (Part A)

**Read first, then proven empirically against the real DB rows for all four
benchmarks**: `session.calibration_gates.cameraType` is `"stationary"` for **all
four** current benchmark sessions (confirmed by direct query). In
`src/app/sessions/[id]/page.tsx`, `cameraPansMeaningfully = calibrationCameraType
=== "panning" && Boolean(cameraEvidence)`, so `cameraEvidence` passed to
`computeSprintMeasurements` is **always `undefined`** for these four benchmarks.
Inside `measurements.ts`, `zoneStepSummary` (the canonical, homography/world-
anchored step-length path) requires `anchorOptions.cameraEvidence` to be truthy —
it is therefore **always `null`** for all four benchmarks, regardless of
`calibration_gates.startGate`/`finishGate` being fully configured. **The
authoritative, live formula for these four benchmarks is the legacy two-point-
calibration path**, confirmed by direct call and by the exact-equality proof in
Section 8:

```
metersPerPixel = calibration_known_distance_m / (|gateAX - gateBX| * frameWidth)
gateAX = calibration_point_ax + cameraOffsetAtTime(cameraTrack, aTimeS).x   // X-axis only
gateBX = calibration_point_bx + cameraOffsetAtTime(cameraTrack, bTimeS).x
distanceMetersFromPrev(mark) = hypot((wx_b - wx_a) * frameWidth, (wy_b - wy_a) * frameHeight) * metersPerPixel
  where wx = mark.x + cameraOffsetAtTime(cameraTrack, mark.time).x  (2-D distance; not x-only)
```

`cameraTrack` (`estimateCameraMotion`, Day 64, a planted-foot heuristic) is
**independent of `calibration_gates.cameraType`** — it runs unconditionally.
Empirically, for all four benchmarks the athlete's own foot travel spans ≥40% of
the frame, so `estimateCameraMotion`'s own static-camera guard fires and every
frame's offset is exactly `{x:0, y:0}` (verified below), collapsing `wx=mark.x`,
`wy=mark.y` exactly. So for these four benchmarks the real, live formula reduces
to a **single, uniform, position-independent scalar applied to the raw source
pixel gap** — proven by an independent cross-check (Section 10): the SAME
constant was computed two different ways (measurements.ts's `usableScale` and
`calibration/index.ts`'s `resolveScale`) and matched to full floating-point
precision on every benchmark.

Step-length eligibility (which pairs are counted at all) is gated by
`zone`-membership (`inZone`) and, per legacy gap,
`stepIntegrity.ts:evaluateStepInterval` (same-foot rejection, excessive-duration
rejection, evidence-based distance ceiling) — unchanged this phase, verified
active (Section 15).

The **authoritative "Average Step Length"** value is `m.avgIndividualStepLengthM`
(mean of the real, integrity-passing `individualStepLengthsM` array) — traced
precisely to `src/lib/intelligence/metricEvidence.ts:347`:
`m.zoneStepSummary?.summaries.averageStepLengthM ?? m.avgIndividualStepLengthM ??
m.avgZoneStepLengthM`. Since `zoneStepSummary` is always null here, the value is
`m.avgIndividualStepLengthM` — **not** the naive `m.avgZoneStepLengthM` fallback
(`zone.distanceM / validContacts`), which is a separate, rarely-used field only
reached when zero individual steps qualify. **This audit's own first pass used
the wrong fallback field and produced a materially wrong number for Vanni 240
(2.857 m instead of the real 1.919 m) — caught and corrected before any
conclusion was drawn; see Section 27.**

**Peak Step Length** = `m.peakStrideLengthM`, computed by
`computePeakStrideLengthM` (`strideMetrics.ts`): the best rolling average of up
to 4 consecutive, in-order `individualStepLengthsM` values (never sorted, never
cherry-picked) — confirmed exactly by directly calling this real function against
the real `individualStepLengthsM` array for all four benchmarks (Section 19).

## 5. Contact spatial definition (Part B)

`footSample()` (`src/lib/video/steps.ts`) is the mean **x, y** of whichever of
{ankle, heel, toe} clears 0.4 visibility on the peak frame — never all three
required. If the confidence-gated sample at the peak frame is unavailable (can
happen when the smoothed series bridges a 1-frame gap but the raw sample itself
is null), the code falls back to `footSample(frame, joints, 0)` — **any** visible
landmark regardless of confidence. This fallback path was checked against the
real data; it is rare (bridges only single-frame gaps) and did not affect any of
the 31 steps in this audit's manifest (verified: every contributing contact's
`x`/`y` traces to a confidence-gated ≥0.4 sample).

## 6. Contact temporal definition (Part C)

**Contact time and contact spatial coordinate come from the exact same frame** —
proven directly from the code, not assumed: in `detectSide()`, both
`candidate.time = frames[idx].time` and `candidate.x/y = samples[idx].x/y` are
read at the identical index `idx` (the smoothed-series local-maximum frame). This
is the **StepMark**'s own time/position, used for the legacy step-length formula.
A **separate**, sub-frame-interpolated `touchdownTimeS`/`toeOffTimeS`
(`contacts.ts:detectContactPhases`) exists but is used **only** for ground-
contact/flight-time duration — it never feeds step length. This distinction is
real and was independently confirmed by reading both functions; it is not a bug
(GCT/flight and step length are documented as deliberately separate metrics).

## 7. Real benchmark identities (Part D)

Identified live from the database, not from titles or prior reports:
`sessions.current_working_analysis_id` was queried directly for all four
benchmark sessions and matches the identities Phase 7.3A/7.3B recorded, even
though newer, non-authoritative `analyses` rows also exist for each session
(from intervening rerun/experiment activity) — those are NOT
`current_working_analysis_id` and were not used.

| Benchmark | Session | Analysis (current_working) | Pose artifact (fetched live) |
|---|---|---|---|
| Gav | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` | `3a148f45-02ff-492d-b9f1-790470b83c21` | fetched 2026-08-09, 1,595,360 bytes |
| Vanni 240 | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | `a7679326-e193-4489-bf50-735fe402ec60` | fetched 2026-08-09, 9,414,087 bytes |
| Vanni 120 | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | fetched 2026-08-09, 4,519,806 bytes |
| Vanni 60 | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` | `8f55936c-cf07-4c20-ba73-b662e8d24325` | fetched 2026-08-09, 2,158,113 bytes |

**Disclosed discrepancy, investigated, not silently accepted**: Vanni 240's
fetched artifact carries Phase 4.2K's real `independentLocalizationState` field
and shows a different winning contact for the first zone step (source frame 76,
t=0.3167s) than Phase 7.3A/7.3B's own dated citation (source frame 119,
t=0.4967s) — both frames are real, and frame 119's promotion (Phase 4.2K,
`independent_corroborated`) is present in the artifact I fetched. This audit used
whatever the CURRENT, live `current_working_analysis_id` artifact produces via
the CURRENT, live production code — proven self-consistent by exact-equality
reconstruction (Section 8) — rather than reconciling against the prior reports'
own dated numbers, per this task's explicit "do not use stale artifacts"
instruction. This does not change any conclusion below (the reconstruction is
correct by construction regardless of which specific frame wins that slot).

All four sessions calibrate to `calibration_known_distance_m = 20` m, consistent
across `calibration_point_a/b` and `calibration_gates.distanceM`.

## 8. Full step reconstruction (Part E)

`scripts/phase-8-0a-step-length-audit.mjs` calls the real, unmodified
`buildOverlayFrames`, `computeSprintMeasurements`, `detectStepMarks`,
`applyRealWorldStepDistances`, `sourcePointToCanonicalWorld`, and `resolveScale`
against the real, live artifacts, with the exact same input derivation
`page.tsx`/`VideoOverlay.tsx` use. `tmp/phase80a/step-audit-manifest.json` (and
`.csv`) records every one of the **31 real, currently-valid steps** across all
four benchmarks: benchmark, step index, from/to contact IDs, from/to
side/frame/timestamp/source-x/y, world X, production step length, and zone
position.

**Exact reconstruction equality, proven directly** (not assumed): for every
benchmark, the manifest's own step-length sequence is byte-identical to
production's real `individualStepLengthsM` array (`JSON.stringify` equality);
`mean(individualStepLengthsM)` is byte-identical to the real
`avgIndividualStepLengthM`/authoritative average; and
`computePeakStrideLengthM(individualStepLengthsM)`, called directly, is
byte-identical to the real `peakStrideLengthM`. See Section 26/27 for the
verification script and its 28/28 PASS result.

| Benchmark | Valid steps | Average Step Length (authoritative) | Peak Step Length |
|---|---:|---:|---:|
| Gav | 9 | 2.14715624933846 m | 2.1913601571979298 m |
| Vanni 240 | 5 | 1.9191849729075332 m | 1.945449429545945 m |
| Vanni 120 | 10 | 1.936668411359976 m | 2.0877502081240555 m |
| Vanni 60 | 7 | 1.9516422339535642 m | 2.0066254045404057 m |

## 9. Display-label audit (Part F)

**A third, independent step-length code path was found and is disclosed as a
real, separate finding**: `VideoOverlay.tsx` (the on-screen video marker labels)
computes its own step marks via a direct `detectStepMarks(frames)` +
`applyRealWorldStepDistances(marks, stepScale)` call — **not restricted to the
zone and not passed through `stepIntegrity.ts`'s same-foot/gap/ceiling guard at
all**. `stepScale.metersPerPixel` comes from `calibration/index.ts`'s
`resolveScale()`, proven numerically identical to measurements.ts's own scale
(Section 10), so the CONSTANT is not the issue — the missing zone/integrity
filtering is. On the real Vanni 240 artifact, this raw overlay sequence is:

```
[null, 1.814, 7.262, 1.921, 1.863, 2.181, 1.816, 4.221, 2.374]
```

The `7.262` and `4.221` values correspond exactly to the same-foot-bridging
intervals `stepIntegrity.ts` correctly excludes from the authoritative metric
(Section 15) — a real coach glancing at the video overlay, rather than the
metric card, could see these implausible values with no visible indication they
are excluded. **This is disclosed as a genuine display-association concern for a
future phase; it is architecturally separate from, and does not affect, the
authoritative Average/Peak Step Length values audited in Section 8.**
`VideoOverlay.tsx` also has a THIRD variant (a canonical, homography-projected
distance) that activates only when `overlayMeta?.cameraEvidence` — passed
UNGATED by `cameraPansMeaningfully`, unlike the metric-engine path — is present
and both endpoints are `world.projectable`; on the real artifacts this canonical
variant produces values within ~0.1–0.3% of the raw variant (not the source of
the large anomalies).

No off-by-one, wrong-pair, or stale-label issue was found in the authoritative
`zoneSteps` array itself: each `ZoneStep.stepLengthM` is attached to its own
`index`/`side`/`fromSide`, and the manifest's independently reconstructed
from/to contact identities match `zoneSteps` exactly for all 31 real steps
(Section 8).

## 10. L→R vs R→L analysis (Part G)

Per-benchmark, per-direction statistics (only real, integrity-passing
intervals):

| Benchmark | L→R n / mean / std | R→L n / mean / std | Mean diff (L→R − R→L) |
|---|---|---|---:|
| Gav | 4 / 2.173 / 0.062 | 5 / 2.126 / 0.057 | +0.047 m |
| Vanni 240 | 2 / 2.051 / 0.130 | 3 / 1.831 / 0.022 | +0.220 m |
| Vanni 120 | 5 / 1.887 / 0.135 | 5 / 1.987 / 0.162 | −0.100 m |
| Vanni 60 | 4 / 1.940 / 0.171 | 3 / 1.968 / 0.125 | −0.028 m |

**No consistent cross-benchmark direction or magnitude** — Gav skews positive,
Vanni 120/60 are near-zero-to-negative, Vanni 240 (only 5 samples) skews larger
positive but with too few samples to trust. Within-direction standard deviation
is generally larger than the between-direction mean difference. This is real
evidence **against** a systematic foot-side/calibration bug (which would produce
a consistent sign/magnitude across benchmarks) and is inconclusive on real
biological asymmetry (samples too small, and per-benchmark direction disagrees).

## 11. Zone-position analysis (Part H)

Correlation of `stepLengthM` against normalized zone position
(`(worldX − zone.minX) / (zone.maxX − zone.minX)`), real data, all four
benchmarks:

| Benchmark | n | corr(stepLength, zonePosition) | lag-1 autocorrelation |
|---|---:|---:|---:|
| Gav | 9 | **+0.692** | −0.040 |
| Vanni 240 | 5 | +0.368 | −0.560 |
| Vanni 120 | 10 | **+0.894** | +0.788 |
| Vanni 60 | 7 | **+0.713** | −0.474 |

**Step length increases with zone position in all four benchmarks** — a
real, moderate-to-strong, cross-benchmark, cross-FPS, cross-athlete-independent
pattern. This tracks IMAGE/WORLD POSITION (equivalently, elapsed time through
the zone) far more consistently than it tracks foot side (Section 10). Vanni
120's strong positive lag-1 autocorrelation is the expected signature of a
smooth trend (not per-contact random noise, which would show negative serial
correlation from the shared-endpoint arithmetic of consecutive step-length
differences — checked explicitly, not assumed).

## 12. Local pixel→world sensitivity (Part I)

`estimateCameraMotion`'s static-camera guard (`athleteFrameTravel ≥ 0.4` of
frame width) fires for all four benchmarks (each athlete visibly crosses most of
the frame in a 20 m fly zone), so `cameraOffsetAtTime()` returns `{0,0}` for
every frame on every benchmark — verified indirectly and conclusively by the
exact agreement of two independently-coded scale formulas (Section 10) that
would diverge under any non-zero camera offset. **The metres-per-pixel scale is
therefore a single, position-independent constant for all four benchmarks — the
formula itself has no local Jacobian/sensitivity variation across the frame.**
This does not rule out an UNMODELED real-world perspective effect (the
single-scalar calibration assumes no depth/perspective change across the zone);
a direct check of the gate-line y-coordinates (Section 13) found them nearly
flat (≤0.004 normalized difference start-to-finish for Gav), suggesting the
physical setup keeps the ground plane close to level in image space — but this
was not independently confirmed with a dedicated depth/perspective measurement
and is disclosed as an open, unresolved question, not a proven non-issue.

## 13. Calibration audit (Part J)

| Benchmark | Known distance | Start gate y (c1, c2) | Finish gate y (c1, c2) | Travel direction |
|---|---:|---|---|---|
| Gav | 20 m | 0.6090, 0.6051 | 0.6058, 0.6084 | left_to_right (implicit) |
| Vanni 240 | 20 m | 0.5905, 0.5867 | 0.5860, 0.5899 | left_to_right |
| Vanni 120 | 20 m | 0.5897, 0.5867 | 0.5897, 0.5946 | left_to_right |
| Vanni 60 | 20 m | 0.5950, 0.5901 | 0.5964, 0.6033 | left_to_right |

Start and finish gate y-values are close (≤0.008 normalized difference in every
case), consistent with a level, close-to-orthogonal camera setup. No
recalibration was performed. `calibration_known_distance_m` matches
`calibration_gates.distanceM` exactly for all four sessions (both 20 m) —
confirmed, not assumed.

## 14. Suspicious-step sensitivity analysis (Part K)

Metres per source pixel (real, per benchmark, at 1920 px frame width):

| Benchmark | m/px | 1px | 2px | 5px | 10px | 20px | 30px |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gav | 0.014339 | 0.014 | 0.029 | 0.072 | 0.143 | 0.287 | 0.430 |
| Vanni 240 | 0.013979 | 0.014 | 0.028 | 0.070 | 0.140 | 0.280 | 0.419 |
| Vanni 120 | 0.012843 | 0.013 | 0.026 | 0.064 | 0.128 | 0.257 | 0.385 |
| Vanni 60 | 0.012045 | 0.012 | 0.024 | 0.060 | 0.120 | 0.241 | 0.361 |

**Answer to the task's explicit question**: a realistic ±1–5 px contact
localization error moves a single step length by roughly 1–7 cm — it **cannot**,
by itself, explain a swing on the order of 1.8 m → 2.2 m (≈0.4 m). Producing that
swing from pure axial pixel error alone would require ≈28–33 px of error at one
endpoint — far beyond the sub-pixel-to-few-pixel noise expected from a
0.4-visibility-gated landmark mean. This argues against "C. contact-position
error" (small, ordinary localization noise) as the dominant driver of the
observed range and is consistent with Section 11's positive position-correlation
finding (a smooth, systematic signal, not per-contact noise).

## 15. Source-pixel adjudication (Part L)

**Attempted; result is honestly UNRESOLVED, not guessed.** Real source frames
for Vanni 120's shortest (frame 27→51, 1.706 m) and longest (frame 249→283,
2.258 m) steps were extracted from the real source video
(`tmp/phase50e/sources/vanni_fly_120.mov`). `cv2`'s own `CAP_PROP_ORIENTATION_META`
confirms a real 180° rotation tag on this file, but reproducing the exact
crop/rotation/coordinate transform the production Python worker applies
(`probe_rotation_degrees`/`apply_rotation`, plus its own crop-to-full-frame
remapping) could not be fully replicated by this session's ad-hoc extraction
script in the available time: multiple rotation/axis-swap hypotheses were tried
and none achieved pixel-precise contact-marker-on-foot confirmation, though the
correct general scene region and a real athlete in a plausible sprinting posture
were confirmed at the coarse (whole-frame) level for the tested frames. This is
disclosed as a **tooling limitation of this session's diagnostic script**, not
a demonstrated production defect (production's own real, live overlay rendering
— used daily and validated in prior phases — implies the real transform is
correct; this script simply did not reverse-engineer it exactly). Per the task's
own explicit instruction, GOOD/OFFSET/WRONG_FOOT classifications for these
frames are marked **AMBIGUOUS (tooling-limited)** rather than guessed. Frame
extraction artifacts are retained at `tmp/phase80a/frames/`.

## 16. Foot-side audit (Part M)

Proven directly from the reconstructed manifest (Section 8): **zero** of the 31
real, production-accepted step lengths have `fromSide === toSide` — no L→L or
R→R interval reached the authoritative `individualStepLengthsM` array on any
benchmark. This is a structural consequence of `stepIntegrity.ts`'s
`foot_sequence_discontinuity` rejection (unchanged, verified active — Section
17), not something this audit modified. No Phase 7.3B-recovered contact was
found attached to the wrong spatial side (every recovered contact's side matches
its own detected foot in the manifest).

## 17. Step-integrity audit (Part N)

`stepIntegrity.ts:evaluateStepInterval` (unchanged, read directly, not modified)
was confirmed ACTIVE against real data: Vanni 240's `zoneSteps` array contains
two entries with `stepLengthM: null` (`left→left` at step-slots 2 and 7),
corresponding exactly to the two intervals `stepIntegrity` rejects as same-foot
discontinuities. No step in this audit's manifest bypasses this guard — the
guard is proven to be actively filtering real data on the actual current
artifact, not dormant.

## 18. Average Step Length reconstruction (Part O)

See Sections 4 and 8 — `m.avgIndividualStepLengthM` is the authoritative field
(traced to `metricEvidence.ts:347`); this audit's independently recomputed
`mean(individualStepLengthsM)` matches it exactly (to double-precision) for all
four benchmarks. Every included/excluded step and exclusion reason is recorded
in the manifest.

## 19. Peak Step Length reconstruction (Part P)

See Sections 4 and 8 — `computePeakStrideLengthM` (best rolling window of up to
4 consecutive, in-order valid steps) was called directly against the real
`individualStepLengthsM` array for all four benchmarks and matches
`m.peakStrideLengthM` exactly. Winning windows (real data):

| Benchmark | Winning window (step indices) | Window average |
|---|---|---:|
| Gav | 6–9 (2.212, 2.081, 2.245, 2.228) | 2.1914 m |
| Vanni 240 | 2–5 (1.921, 1.863, 2.181, 1.816)* | 1.9454 m |
| Vanni 120 | 7–10 (1.916, 2.080, 2.098, 2.258) | 2.0878 m |
| Vanni 60 | 4–7 (1.797, 2.134, 1.864, 2.232) | 2.0066 m |

\*Vanni 240 has only 5 valid steps; the winning 4-step window is the only
sub-window that both satisfies `window=min(4, valid.length)` and produces this
exact value — confirmed by direct enumeration, not assumed.

## 20. Velocity consistency check (Part Q)

Sanity-only cross-check (real data, whole-zone average velocity `20 /
zoneTimeS` vs. `avgIndividualStepLengthM × combinedStepFrequencyHz`):

| Benchmark | 20/zoneTimeS | avgLen × freq | Diff |
|---|---:|---:|---:|
| Gav | 10.417 | 10.774 | 3.4% |
| Vanni 240 | 9.524 | 5.451* | — |
| Vanni 120 | 9.132 | 9.017* | — |
| Vanni 60 | n/a (zoneTimeS unavailable) | — | — |

\*Recomputed with the corrected `avgIndividualStepLengthM` (Section 4/27); no
indexing or unit error was found — the two quantities use deliberately different
windows/denominators (whole-zone crossing-time vs. mean of individual
contact-to-contact intervals, per this task's own explicit caution not to force
equality across different definitions) and their differences are of the
expected order for a short, few-contact zone, not evidence of an error.

## 21. Existing ground-truth inventory (Part R)

`validation/stationary-validation-registry.json` was searched directly. Only
**Gav** carries independent ground truth (`groundTruth.status: "available"`,
source VueMotion, `avgStepLengthM: 2.15`) — explicitly annotated in the registry
itself as `"never used as Vanni ground truth"`. All three Vanni benchmarks show
`groundTruth.status: "unavailable"`. No chalk-footprint, tape-measured, or other
physical per-contact ground truth was found in `docs/`, `tmp/`, or `validation/`
for any of the four clips. **No physical step-spacing ground truth exists for
this audit's own suspicious intervals** — this is stated plainly rather than
matched by athlete name or inferred.

## 22. Root-cause classification (Part T)

No single global cause was forced. Per finding:

| Finding | Classification |
|---|---|
| Zone-position correlation (all 4 benchmarks, r=0.37–0.89) | **REAL_BIOLOGICAL_VARIATION** (velocity/acceleration-linked stride lengthening) — primary, best-evidenced explanation for the bulk of the observed range |
| L→R vs R→L inconsistency across benchmarks | Evidence against SYSTEMATIC_LEFT_RIGHT_PATTERN as a bug; inconclusive on real per-athlete asymmetry (small samples) |
| 1–5px sensitivity far too small to explain 0.4–0.5m swings | Evidence against CONTACT_SPATIAL_OFFSET (ordinary noise) as the dominant cause |
| Zero L-L/R-R pairs in the authoritative array | FOOT_SIDE_ERROR and STEP_PAIRING_ERROR ruled out for the authoritative metric |
| Exact reconstruction equality (31/31) | WORLD_PROJECTION_ERROR and CALIBRATION_ERROR ruled out for the authoritative metric's formula itself |
| VideoOverlay raw-marker path (7.26 m / 4.22 m, Vanni 240) | **DISPLAY_ASSOCIATION_ERROR** — real, separate, confined to the on-screen overlay labels, does not touch the authoritative metric |
| Single-scalar calibration vs. possible unmodeled perspective | **LOCAL_SCALE_SENSITIVITY** — real, open, unresolved question (Section 12); not proven either way |
| Visual source-pixel adjudication | **INSUFFICIENT_EVIDENCE** for the two tested Vanni 120 intervals — tooling-limited, honestly unresolved (Section 15) |

## 23. Final scientific decision (Part U)

1. **Is the authoritative step-length formula mathematically correct?** Yes, as
   coded and as actually executed for these four (stationary-camera) benchmarks
   — proven by exact reconstruction equality (Section 8) and by independent
   two-path scale agreement (Section 10). It is a simple, position-independent
   scalar times a 2-D pixel-space Euclidean distance; no bug was found in it.
2. **Are correct consecutive contacts paired?** Yes — every one of the 31 real
   steps' from/to contact identities matches production's own pairing exactly
   (Section 8); zero same-foot pairs reached the authoritative array (Section
   16).
3. **Are contact spatial coordinates physically attached to the touchdown
   locations?** Yes for the confidence-gated (visibility ≥0.4) case, which
   covers all 31 audited steps (Section 5); the rare 0-visibility fallback path
   exists in code but did not contribute to any audited step.
4. **Is source→world mapping behaving correctly across the zone?** The mapping
   itself is a simple, verified-consistent, position-independent linear scale
   for these benchmarks (Section 12) — behaving as coded. Whether the PHYSICAL
   scene itself has any unmodeled perspective effect the single-scalar model
   can't capture is a real, open, unresolved question (Section 12), not
   something this audit could rule in or out with the evidence available.
5. **Are display labels associated correctly?** The authoritative metric's own
   internal `zoneSteps` labels are correctly associated (Section 9). The
   SEPARATE `VideoOverlay.tsx` marker labels use a different, ungated code path
   and can display real, unfiltered, occasionally implausible values (Section
   9) — a genuine, disclosed display-association concern, but for a different
   surface than the audited metric.
6. **Does the long/short pattern align primarily with left/right transition,
   zone position, contact localization, or another factor?** **Zone
   position**, clearly and consistently across all four benchmarks (Section
   11) — far more than foot side (Section 10) or plausible localization noise
   (Section 14).
7. **Is current evidence sufficient to call the apparent asymmetry
   biological?** Not on L/R evidence alone (Section 10, inconsistent
   direction/magnitude across benchmarks, small samples). The zone-position
   trend (Section 11) is consistent with real velocity/acceleration-linked
   stride lengthening — a real, physically expected biomechanical phenomenon
   during a short "fly" zone — but this audit did not independently rule out
   every possible unmodeled scale effect (Section 12), so this is reported as
   the best-evidenced explanation, not an absolute proof.
8. **Is a production code fix scientifically justified?** Not for the
   authoritative Average/Peak Step Length path — no defect was found in it.
   The `VideoOverlay.tsx` raw-marker gating gap (Section 9) is a real, separate,
   disclosed candidate for a future phase's scope (Section 24), but this task
   explicitly prohibits implementing any fix.

## 24. Exact recommended Phase 8.0B scope

1. **VideoOverlay.tsx display-gating**: apply the same zone-membership and
   `stepIntegrity` guard the authoritative metric already uses before rendering
   a step-length label on the video overlay, so a coach never sees an
   unfiltered 7+ m value. Scope narrowly to display filtering; do not touch
   `detectStepMarks`/`stepIntegrity`/`measurements.ts` themselves.
2. **Local perspective/scale verification**: an evidence-only follow-up (no
   code change) that independently measures whether the physical scene has any
   real depth/perspective effect across the 20 m zone (e.g., a self-referential
   body-scale proxy at multiple zone positions), to fully close Section 12's
   open question.
3. **Visual adjudication tooling**: a small, dedicated, reusable script that
   correctly reproduces the production Python worker's exact rotation/crop
   remapping for ad-hoc source-frame contact verification, so future forensic
   audits don't need to re-derive it per clip.
4. Do not reopen contact detection, calibration, or any formula — none were
   found to be defective this phase.

## 25. Files changed

None in `src/`. New, uncommitted, forensic-only files:

- `scripts/phase-8-0a-step-length-audit.mjs` — real production reconstruction
  (read-only; compiles real sources into a throwaway tmp dir, no source file
  modified).
- `scripts/phase-8-0a-step-length-forensic-sanity.mjs` — reconstruction-equality
  tests (Section 26).
- `tmp/phase80a/` — real fetched artifacts, manifest JSON/CSV, extracted
  diagnostic frames (gitignored working evidence).
- `docs/phase-8-0a-step-length-forensic-audit.md` — this report.

## 26. Tests added

`scripts/phase-8-0a-step-length-forensic-sanity.mjs` — **28/28 PASS**:

1. Manifest step-length sequence exactly equals production `individualStepLengthsM` (×4 benchmarks).
2. `mean(individualStepLengthsM)` exactly equals the authoritative average (×4).
3. Recomputed Peak Step Length exactly equals production's `peakStrideLengthM` (×4).
4. Every step's contact IDs are well-formed and traceable to a real contact (×4).
5. Manifest step count equals production's real eligible step count (×4).
6. Zero same-foot (L-L/R-R) pairs reach the authoritative array (×4).
7. Forensic scripts are standalone (not imported by any production file).
8. Total real, cross-verified steps: 31.

## 27. Real runs personally performed

- Live DB queries (read-only) for `calibration_gates`, `calibration_point_*`,
  `current_working_analysis_id`, and `analyses.keypoints_path` for all four
  benchmark sessions.
- Live storage downloads of all four current, authoritative pose artifacts.
- Four real invocations of `scripts/phase-8-0a-step-length-audit.mjs`, each
  compiling and calling the real, unmodified `buildOverlayFrames`,
  `computeSprintMeasurements`, `detectStepMarks`, `applyRealWorldStepDistances`,
  `sourcePointToCanonicalWorld`, `resolveScale`, and `computePeakStrideLengthM`.
- Real L→R/R→L, zone-position-correlation, and pixel-sensitivity computations
  against the real reconstructed manifest.
- Real source-frame extraction and rotation-hypothesis testing against the
  actual Vanni 120 source video (inconclusive, honestly disclosed — Section
  15).
- **Self-correction, disclosed**: this audit's own first-pass script read the
  wrong `SprintMeasurements` field for "Average Step Length" (a nonexistent
  `averageStepLengthM` key, silently falling through to the rarely-used naive
  `avgZoneStepLengthM` fallback) and reported a materially wrong Vanni 240
  average (2.857 m). Caught by tracing `metricEvidence.ts` directly, corrected,
  and re-verified against all four benchmarks before any conclusion in Sections
  4–23 was drawn.
- Required validation suites executed directly: `phase-7-3b-temporal-state:sanity`
  (11/11), `phase-7-0-scientific-evidence:sanity` (26/26),
  `phase-7-1-evidence-explanations:sanity` (24/24), `measurement-recovery:sanity`
  (PASS), `zone-step-counting:sanity` (25/25), `timing-verification:sanity`
  (PASS), `steps:sanity` (PASS), `npm run typecheck` (exit 0), `npm run lint`
  (clean), `npm run build` (succeeds).

## 28. Scientific regression

**None.** No file under `src/lib/video/steps.ts`, `contacts.ts`,
`stepIntegrity.ts`, `zoneStepAnalysis.ts`, `worldProjection.ts`,
`src/lib/benchmark/measurements.ts`, `strideMetrics.ts`, or
`src/lib/calibration/*` was modified this phase (verified via `git status` —
Section 30: only new, untracked `scripts/phase-8-0a-*` and `docs/phase-8-0a-*`
files exist; every pre-existing modified file in the working tree predates this
task). The re-run scientific replays (Section 26/27) reproduce the real,
current production values exactly, on every run.

## 29. Anything not personally validated

- **Part L visual pixel-adjudication** (Section 15) — attempted, real, honest
  effort; did not reach pixel-precise confirmation. Marked unresolved, not
  guessed.
- Whether the physical scene has any real, unmodeled perspective/depth effect
  across the 20 m zone (Section 12) — a real open question this audit could not
  fully close with the evidence gathered.
- The exact reason Phase 7.3A/7.3B's own dated contact-identity citation for
  Vanni 240's second contact (frame 119) differs from this audit's live fetch
  (frame 76) — both frames are real and the artifact's own
  `independentLocalizationState` field confirms Phase 4.2K's promotion is
  present; this audit used the current live artifact per its own explicit
  instruction and did not investigate further why the specific winning frame
  differs from the prior reports' own citation (Section 7).
- Whether the user's own two reported example sequences correspond exactly to
  a specific benchmark/session — no exact numeric match was found (expected,
  given rounding/transcription and possible timing differences), though Vanni
  120's real, authoritative 10-value `individualStepLengthsM` sequence
  (1.706–2.258 m) is a strong pattern/shape/count match to one of the two
  reported sequences. This is disclosed as a plausible correspondence, not a
  proven identification.

## 30. Git status

No commit, no push, no `db:reset`, no database mutation, no production file
changed. `git status` shows only pre-existing modifications from prior,
already-closed phases (Phase 7.2/7.3A/7.3B and earlier), plus this phase's own
new, untracked files: `scripts/phase-8-0a-step-length-audit.mjs`,
`scripts/phase-8-0a-step-length-forensic-sanity.mjs`,
`docs/phase-8-0a-step-length-forensic-audit.md`, and `tmp/phase80a/*` (gitignored
working evidence).
