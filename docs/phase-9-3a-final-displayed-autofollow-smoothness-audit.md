# Phase 9.3A — Final Displayed-Frame Auto Follow Smoothness Audit

Evidence-only forensic audit. **No production code was changed.** This
phase inherits the Auto Follow/Stabilized View architecture from Phases
6.5/6.6B/8.1B-2B/8.2A/8.2B and treats it as given except where explicitly
re-verified below.

## 1. Executive summary

Phase 8.2A proved the presentation-camera path itself is already smooth and
correctly source-time-based, and diagnosed the residual 240fps "skippiness"
as `DISPLAY_REFRESH_COALESCING` (a real display Hz ceiling). Phase 8.2B
fixed the camera-path *sampling method* (interpolation instead of
nearest-frame) but explicitly could not, and did not claim to, fix the
underlying per-tick pixel span at a fixed 60Hz display. Both phases analyzed
the **camera path in isolation**.

This phase asks a different, narrower question: what does the user actually
see after **every** transform is composed — Stabilized View correction ∘
Auto Follow pan/zoom ∘ the athlete's own real screen position — sampled at
the real, freshly-remeasured display cadence? Real production functions
(`resolveDisplayCameraState`, `stabilizationCorrection`,
`buildPresentationCameraPath`, `buildDisplayStabilizationPath`) were run,
unmodified, against real pose/cameraPath artifacts for all 4 benchmarks,
composed exactly as `OverlaySurface.tsx`'s own CSS transform strings compose
them, and sampled at a freshly, independently remeasured real rAF cadence
(**59.88Hz**, confirming Phase 8.2A's own prior measurement).

**Finding: the residual is real, but it is not an AVA compositing defect.**
Camera-side reconstruction accuracy at the full composed level is
**94–98% (median) / 84–98% (p95)** across all 4 benchmarks — i.e. the
displayed trajectory sits within a few percent of the theoretically perfect
reconstruction of the already-resolved path at the same display rate.
Stabilized View's own contribution to velocity variance/jerk is
**statistically indistinguishable from RAW** (<0.1% difference). Every
detected skip event decomposes to translation ("pan"), never scale
("zoom") — 0/19 events across all 4 benchmarks classified zoom-dominant.
The dominant, quantified driver of the remaining large per-tick pixel
deltas (20–41px p95, expressed in representative CSS px) is genuine,
physically-real motion — the athlete's own fast screen displacement
(confirmed present even with Auto Follow fully OFF) combined with the
unavoidable ~1/60s display-refresh ceiling — not a fixable presentation
bug.

**One genuinely new finding this phase surfaces, beyond 8.2A/8.2B's own
camera-only scope**: the athlete's own screen *anchor* position is drawn
from the real, discrete, per-source-frame pose landmarks — it is **not**
interpolated the way the camera path has been since Phase 8.2B. At very
high simulated display rates this discrete step function becomes the
binding constraint, not the (already-interpolated, already-near-ideal)
camera. This is disclosed honestly below (Section 19) as a real, secondary,
quantified contributor — not proposed as a fix target in this phase.

**Recommendation: Phase 9.3B is NOT justified.** Case A applies (Section
23). Phase 9.3 closes with a documented display-refresh/real-motion limit.

## 2. User-observed failure

"Auto Follow remains perceptually skippy, especially on the Vanni 240 FPS
clip," despite Phase 8.2B's interpolation fix. This phase's job was to
determine whether that residual complaint reflects an actual fixable
uneven final on-screen trajectory, or the normal physical limitation of
displaying fast motion on a ~60Hz screen — measuring the **final** visible
result, not re-litigating the camera path's own smoothness (already
answered by 8.2A).

## 3. Current transform stack

Traced directly from `src/components/video/OverlaySurface.tsx`'s live JSX
and `tick()` function (read in full this phase; not assumed from prior
docs), DOM order outer → inner:

```
containerRef  <div overflow-hidden bg-black>                         [clip container, no transform]
  stabilizationWrapperRef  <div origin-top-left will-change-transform>  [Stabilized View correction, or CSS default/no transform if RAW]
    followWrapperRef  <div origin-top-left will-change-transform>       [Auto Follow interpolated transform, or FULL_FRAME_PRESENTATION_CAMERA (cx=cy=0.5, scale=1) if OFF]
      <video object-contain object-center>                              [base video geometry, intrinsic letterboxing]
      <VideoOverlay> canvas                                             [skeleton/gates/zones/contacts, drawn in UNTRANSFORMED source-normalized coords via project()/getDisplayedVideoRect(video)]
      {overlaySlot}
```

Both wrapper transforms are computed **and written in the same `tick()`
call**, from the same resolved `frameIndex`/`presentedTime` (unchanged
since Phase 8.1B-2B/8.2A — re-verified by direct source read, not assumed).
`followTransform`/`stabilizationTransform` (both read from
`src/lib/video/follow.ts`/`displayStabilization.ts`) are plain
floating-point CSS-string builders with zero `Math.round`/`toFixed`/`| 0`
calls (re-confirmed by direct source read this phase).

Final composed point mapping (source-normalized athlete anchor `p` →
representative screen position), reconstructed directly from those two CSS
formulas, not invented:

```
follow-only:  fx = 0.5 + cameraScale * (p.x - cameraCx)
              fy = 0.5 + cameraScale * (p.y - cameraCy)
stabilized:   final = correctionTranslation + correctionScale * rotate(correctionRotationDeg, [fx, fy])
```

## 4. Measured display cadence (Part D)

Real rAF measurement, freshly captured this phase (not reused from Phase
8.2A), 181 samples over ~3s wall time, this exact sandboxed browser:

| Metric | Value |
|---|---|
| Median interval | 16.7ms |
| Measured Hz | **59.88Hz** |
| p95 interval | 17.6–17.8ms |
| Max interval | 17.7–17.8ms |

Cross-validates Phase 8.2A's own independent measurement (~59.9Hz) — the
"~60Hz display" assumption is confirmed again, in this environment, not
merely inherited.

## 5. Final screen-space trajectories

All 4 benchmarks × all 4 view-mode combinations (RAW/STABILIZED ×
AutoFollow OFF/ON) were sampled at the measured 59.88Hz using the real
composed-transform formula above, driven by real
`resolveDisplayCameraState`/`stabilizationCorrection` output and the real
per-frame torso anchor (`midpoint(hip-mid, shoulder-mid)`, the same stable
anchor `follow.ts#computeFollowTarget` itself uses). Full per-tick traces:
`tmp/phase93a/final-transform-trace.json`,
`tmp/phase93a/athlete-screen-anchor.json`. Synthetic replay plots (Part T,
Section 22): `tmp/phase93a/plots/synthetic-*.png`.

## 6. Vanni 60 result

STABILIZED+AutoFollowON, final delta p95 **20.39px**, velocity CV **1.90**,
p95 acceleration 62,093 px/s², p95 jerk 4.62M px/s³, 4 skip events (all
pan-dominant), camera-reconstruction accuracy 94.4% (median) / 97.5% (p95).

## 7. Vanni 120 result

Final delta p95 **29.68px**, velocity CV **0.96** (most uniform of the
four), 5 skip events (all pan-dominant), camera-reconstruction accuracy
98.3% (median) / 98.4% (p95) — the best reconstruction accuracy of the four
benchmarks. One real methodological finding here (Section 20): the clip's
tail enters a genuine `degraded` tracking regime (athlete exiting frame)
which was explicitly excluded from steady-state statistics, matching Phase
8.2A's own established exclusion convention.

## 8. Vanni 240 result

Final delta p95 **41.24px** — the largest of the four in absolute terms —
velocity CV **1.15** (better/more-uniform than Vanni 60's 1.90 and Gav's
1.48, despite the larger absolute delta), 4 skip events (all pan-dominant),
camera-reconstruction accuracy 94.0% (median) / **83.6% (p95, the weakest
of the four)**. The p95 gap is real and disclosed, not minimized — see
Section 23's honest accounting of why it still does not justify 9.3B.

## 9. Gav control

Stationary/handheld reference clip. Final delta p95 **22.03px**, velocity
CV **1.48**, 6 skip events (all pan-dominant), camera-reconstruction
accuracy 97.1% (median) / 97.8% (p95). Included as a non-sprint-camera-path
sanity check; results are in the same range as the three Vanni benchmarks,
confirming nothing benchmark-specific to the sprint recordings is at play.

## 10. Velocity uniformity (Part G)

`tmp/phase93a/velocity-uniformity.json`. Coefficient of variation (lower =
more uniform motion) at STABILIZED+AutoFollowON:

| Benchmark | Velocity CV |
|---|---|
| Vanni 120 | 0.96 |
| Vanni 240 | 1.15 |
| Gav | 1.48 |
| Vanni 60 | 1.90 |

Vanni 240 is **not** the least uniform of the four — Vanni 60 is. This
directly answers Part U's own framing question: Vanni 240 is not
"uniquely broken," it simply moves through more representative pixels
per tick (larger absolute p95 delta) because Auto Follow zooms in further
on faster, closer motion — its *proportional* smoothness is comparable to
or better than the other benchmarks.

## 11. Acceleration/jerk (Part H)

Computed only within the longest contiguous run of a steady
`following`/`anticipating`/`full_frame` presentationState (Phase 8.2A's own
Part P exclusion convention, applied consistently here — see Section 20).
Full stats: `tmp/phase93a/acceleration-jerk.json`. p95 jerk is
benchmark-comparable in order of magnitude (4.6M–16.4M px/s³ across all
four) — not a clean FPS-proportional signal (consistent with Phase 8.2A's
own Part P finding that jerk is a noisier, secondary indicator relative to
the primary delta-px metric).

## 12. Skip events (Part J)

Deterministic detector: any tick-to-tick delta exceeding the clip's own
p95 threshold, ranked by ratio-to-local-expected-displacement. 4–6 events
retained per benchmark (top 10 cap, fewer available in shorter runs);
full records with previous/current/next position, local expected vs.
actual displacement, ratio, presentationState, and scale:
`tmp/phase93a/skip-events.json`. Every recorded event occurs during a
`following` presentationState — none coincide with a deadband release or
state transition (consistent with, and re-confirming, Phase 8.2A's Part H
finding at the full composed level).

## 13. Layer decomposition (Part K)

For every detected skip event: `sourceVideoMotion` (the athlete's own real
displacement, camera-independent), `autoFollowContribution` (full
Auto-Follow-only composed delta), `stabilizedViewContribution` (the
correction's own isolated contribution), `interpolationContribution`
(interpolated vs. pre-8.2B nearest-neighbor camera, same ticks — consistently
tiny, well under 1px in the large majority of events), and
`translationOnlyPx`/`scaleOnlyPx` (Phase 8.2A's own precedented pan/zoom
isolation formula, generalized from a generic frame-center point to the
actual tracked anchor). Full records: `tmp/phase93a/layer-decomposition.json`.

**19/19 examined events across all 4 benchmarks classified `dominant: "pan"`
— zero classified "zoom" or "both"** (Section 8's Vanni 240 table:
`{pan: 4}`; identical pattern for all others). `stabilizedViewContribution`
is consistently small relative to `autoFollowContribution` (often ≤50% and
frequently much less), confirming Stabilized View is not a meaningful
amplifier of these events.

## 14. Stabilized View interaction (Part P)

RAW+AutoFollowON vs. STABILIZED+AutoFollowON, identical display timestamps,
real data (`tmp/phase93a/velocity-uniformity.json`,
`tmp/phase93a/acceleration-jerk.json`):

| Benchmark | Velocity CV (RAW → STAB) | p95 jerk (RAW → STAB) |
|---|---|---|
| Gav | 1.4846 → 1.4845 | 8,569,570 → 8,581,944 |
| Vanni 60 | 1.9040 → 1.9040 | 4,622,451 → 4,622,344 |
| Vanni 120 | 0.9569 → 0.9569 | 16,392,906 → 16,394,155 |
| Vanni 240 | 1.1526 → 1.1526 | 14,932,920 → 14,929,901 |

Differences are all <0.1% — **Stabilized View composition does not
measurably increase velocity variance or jerk when composed with Auto
Follow**, consistent with Phase 8.1B-2B's own finding that its correction
magnitude is small (1–3px peak). `STABILIZATION_COMPOSITION_DEFECT`: ruled
out.

## 15. Scale/translation contribution (Part Q)

Re-verified at the FINAL composed output (not just the camera path, as
Phase 8.2A tested): 100% of examined skip events are pan-dominant, 0% zoom
or mixed, across every benchmark (Section 13). `SCALE_TRANSLATION_INTERACTION`
as a dominant cause of the residual skippiness: not reopened, Phase 8.2A's
finding holds at the full composed level too.

## 16. CSS/compositor audit (Part R)

Real Playwright instrumentation
(`scripts/phase-9-3a-browser-cadence-compositor.mjs`,
`tmp/phase93a/display-cadence.json`): the same disclosed environment
limitation from every prior phase (headless Chromium here never decodes
real video pixels, `videoWidth: 0`) was pinned to its **exact mechanism**
this time, not just re-asserted: `requestVideoFrameCallback` exists
(`hasRvfc: true`) so the tick loop always prefers `presentedTimeRef.current`
over `video.currentTime`, but rVFC never fires a real callback here, so
`presentedTimeRef.current` stays frozen at its mount-time value — confirmed
directly by reading `wrapper.dataset.presentationCameraTimeMs` (written
**every** tick, unconditionally, before the `followsDiffer`-gated style
write) before and after 2.5s of real `.play()` with `video.currentTime`
genuinely advancing to ~2.47s: the dataset value never changed
(`"0"→"0"` in all 3 benchmarks tested). This means the write-gating logic
(`followsDiffer`/`stabilizationDiffers`) correctly produced **zero**
additional style writes after mount in this specific environment — not a
defect, a direct, expected consequence of the frozen presented-time. Live,
continuously-varying transform-write-count-vs-rAF-paint-count could **not**
be captured in this environment; disclosed here rather than fabricated.

## 17. Subpixel precision (Part S)

Two distinct, real findings:

1. **JS-side write path**: `followTransform`/`stabilizationTransform`
   perform plain floating-point string interpolation with zero rounding
   calls (re-confirmed by direct source read, Section 3) — re-confirming
   Phase 8.2A's own Part F/G code-level finding.
2. **New this phase — CSSOM read-back precision**: writing a real
   `followTransform`-formula-produced value
   (`translate(-18.36394110370767%, -45.66152523762994%) scale(1.638271359)`)
   into a live element's `style.transform` and reading it back via
   `el.style.transform`/`getComputedStyle` shows Chromium's own CSSOM
   **serializes to ~6 significant figures**
   (`translate(-18.3639%, -45.6615%) scale(1.63827)`) — a real, general,
   documented browser string-serialization behavior, not an AVA defect.
   This is functionally irrelevant to AVA's actual rendering: the app never
   reads back the applied style string (`followRef.current`/
   `stabilizationRef.current` are separate, full-precision JS-side state
   used for the `followsDiffer` comparison and the *next* write), so the
   value the GPU compositor actually paints is the full-precision string
   that was written, not the rounded string a later read would return.
   `SUBPIXEL_QUANTIZATION`: no evidence of an actual rendering-precision
   defect; a real, narrow, disclosed CSSOM-serialization curiosity that
   does not affect AVA.

## 18. Ideal continuous trajectory comparison (Part L)

"Ideal" = the real, unmodified `resolveDisplayCameraState` interpolation
(the exact function production ships) sampled at 2000Hz — as close to the
true continuous camera-path curve as this simulation can represent, not a
new curve-fit. Camera-side interpolation error (distance between the
actual composed position at the measured 59.88Hz tick and the ideal curve
at that same instant): median <1px for 3 of 4 benchmarks, p95 0.48–6.78px
across all four (`tmp/phase93a/ideal-vs-actual.json`). Small relative to
the total per-tick delta (20–41px p95) in every case — the camera-side
reconstruction is close to ideal; the residual delta is dominated by real
motion, not reconstruction inaccuracy.

## 19. Refresh-rate counterfactual (Part M)

`tmp/phase93a/refresh-counterfactual.json`, sampled at 60/90/120/144/165/240Hz.
p95 displacement generally decreases as display Hz rises toward source FPS
(e.g. Vanni 240: 37.3px@60Hz → 21.1px@240Hz), reproducing Phase 8.2A's own
directional finding — but **not as cleanly monotonic** as 8.2A's
camera-path-only sweep (e.g. Vanni 240: 60→90→120→144→165→240Hz shows
37.3→31.6→31.5→38.0→26.7→21.1px, not strictly decreasing). This is a real,
honestly-disclosed difference from 8.2A, traced to its exact cause: unlike
the camera path (continuously interpolated since Phase 8.2B), **the
athlete's own screen anchor is drawn from the real, discrete, per-source-
frame pose landmarks — never interpolated**. At simulated rates well above
a benchmark's own native FPS, many consecutive samples land on the same
held real frame (zero anchor motion) punctuated by a real jump when the
next source frame's landmarks become available — a genuine step function,
not a simulation artifact (verified: this pattern is absent in Auto-Follow-
OFF-only camera-free checks and present specifically where the discrete
anchor lookup dominates). This is a real, secondary, honestly-disclosed
finding beyond 8.2A/8.2B's original camera-only scope — **not** a new defect
introduced by this phase's own measurement, and **not** proposed as a Phase
9.3B fix target (see Section 23 — smoothing the athlete's own rendered
position would reopen exactly the kind of joint-position tradeoffs Phase
9.2B already carefully scoped and closed for the skeleton specifically).

## 20. Physical-limit analysis (Part N)

"Ideal lower bound at the measured 60Hz rate" = the real interpolated
camera path evaluated at exactly the measured display ticks (already the
best achievable reconstruction, since pose evidence itself only exists at
the source's own native rate — there is no finer ground truth to compare
against for the athlete's own position). Reconstruction accuracy
(`1 - interpolationErrorPx / actualDeltaPx`, 1.0 = perfect):

| Benchmark | Accuracy (median) | Accuracy (p95) |
|---|---|---|
| Vanni 120 | 0.983 | 0.984 |
| Gav | 0.971 | 0.978 |
| Vanni 60 | 0.944 | 0.975 |
| Vanni 240 | 0.940 | **0.836** |

All four are at or above 94% at the median; three of four are at or above
97.5% at p95; Vanni 240 alone drops to 83.6% at p95 — real, disclosed,
still the majority (84%) of its own residual delta being genuine motion,
not reconstruction error. One real methodological note found and corrected
during this phase (Section 7's own doc-worthy exclusion issue): Vanni 120's
clip tail enters a real `degraded` tracking regime near the end (athlete
exiting frame); the analysis keeps only the single **longest contiguous
run** of a steady tracking state (not a scattered filter, which would
otherwise fabricate a cross-gap jump that never appeared on screen) — this
matches, and is directly modeled on, Phase 8.2A's own Part P precedent.

## 21. Cross-benchmark table (Part U)

`tmp/phase93a/cross-benchmark-summary.csv`:

| benchmark | source FPS | measured Hz | p95 delta (px) | velocity CV | p95 accel | p95 jerk | skip events | recon. accuracy (median/p95) | dominant cause |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| gav | 60 | 59.88 | 22.03 | 1.48 | 77,924 | 8,581,944 | 6 | 0.971 / 0.978 | pan |
| vanni60 | 56.53 | 59.88 | 20.39 | 1.90 | 62,093 | 4,622,344 | 4 | 0.944 / 0.975 | pan |
| vanni120 | 120.0 | 59.88 | 29.68 | **0.96** | 167,654 | 16,394,155 | 5 | **0.983** / 0.984 | pan |
| vanni240 | 239.98 | 59.88 | **41.24** | 1.15 | 123,888 | 14,929,901 | 4 | 0.940 / **0.836** | pan |

Vanni 240 has the largest absolute p95 delta and the weakest p95
reconstruction accuracy of the four — but its velocity CV (proportional
uniformity) is better than two of the other three benchmarks, and its
median reconstruction accuracy (94.0%) is in the same range as Vanni 60's
(94.4%). Vanni 240 is not categorically "worse" once normalized for its
own larger absolute zoom/motion scale — it has a real, quantified, but
narrow p95 weak point in reconstruction accuracy, not a systemic defect.

## 22. Synthetic transform visualization (Part T)

Headless Chromium in this sandbox cannot decode real video pixels
(Section 16); a genuine human-visible screen recording of the composed
scene could not be produced here, and is **not fabricated**. Instead,
`scripts/phase-9-3a-synthetic-visualization.py` replays the real,
measured final composed athlete-anchor trajectory (the same real numbers
underlying every table above) as a moving marker on a plain scene, clearly
labeled "SYNTHETIC" in every title and filename:
`tmp/phase93a/plots/synthetic-{gav,vanni60,vanni120,vanni240}-trajectory.png`
(2×2 grid, all 4 view modes) and
`tmp/phase93a/plots/synthetic-cross-benchmark-x-vs-time.png` (X-position
vs. time, all 4 benchmarks, STABILIZED+AutoFollowON). The latter visibly
shows the well-known acquisition transient (a single large jump as Auto
Follow first locks onto the athlete, ~0.05–0.12s into each clip) followed
by evenly, closely spaced ticks during steady following — directly,
visually corroborating the quantitative velocity-uniformity findings above.

## 23. Whether 9.3B is justified (Part W)

**CASE A applies: Phase 9.3B is NOT justified.**

- Camera-side reconstruction accuracy is 94–98% (median) across all 4
  benchmarks, 84–98% at p95 — close to the achievable ideal at the measured
  display rate, not "materially more uneven."
- Stabilized View composition contributes <0.1% difference to velocity
  CV/jerk relative to RAW — no compositional defect to fix.
- 100% of skip events are pan-dominant with zero zoom contribution — no
  zoom-pulse artifact to fix.
- No JS-side or CSS-string-writing quantization exists; the one real
  CSSOM-serialization rounding found is provably irrelevant to actual
  rendering.
- The residual large per-tick deltas trace, by direct decomposition, to
  genuine athlete motion (present even with Auto Follow fully OFF) and the
  ~1/60s display-refresh ceiling — both physically irreducible without
  introducing prediction/lag, which this project's own established
  principle (Phase 6.5 onward) explicitly rejects.
- Vanni 240's one real weak point (83.6% p95 reconstruction accuracy) is
  still majority-real-motion, not majority-reconstruction-error, and its
  proportional (CV) smoothness is not the worst of the four benchmarks.

Adding smoothing/prediction now would reintroduce exactly the lag this
project's Auto Follow line has repeatedly, deliberately avoided (Phases
6.5, 8.2A, 8.2B all reached and stated this same conclusion for the camera
path specifically; this phase extends that conclusion to the full composed
scene and finds no new evidence to overturn it).

## 24. Exact Phase 9.3B recommendation

Not applicable — Phase 9.3B is not recommended. If a future phase revisits
this with new evidence (e.g. a genuinely higher-refresh test environment,
or a product report specifically about Vanni-240-class high-FPS clips),
the one concrete, narrow, evidence-backed lead worth investigating first
is Section 19/20's finding: the athlete's own screen anchor is
discretely, not continuously, sampled. Any future work there would need
to weigh it directly against Phase 9.2B's own already-closed skeleton
jitter-smoothing scope (same underlying tension: smoothing display-only
athlete position vs. preserving true contact/timing fidelity) — explicitly
out of scope for this phase to design.

## 25. Human acceptance target (Part Y)

Not "240 FPS should look like 240Hz on a 60Hz monitor." Evidence-derived
target: **AVA's final composed scene trajectory should sit within 10% of
the ideal continuous reconstruction of its own already-resolved camera path,
sampled at the actual display refresh, at the median** (i.e.
reconstruction accuracy ≥ 0.90). All 4 current benchmarks already meet this
at the median (0.940–0.983); 3 of 4 meet a p95 version of the same bar
(0.975–0.984); Vanni 240 alone falls under it at p95 (0.836) while still
majority-real-motion. Secondary target: no local-window irregularity
(150ms window, max-step/mean-step ratio) materially exceeding what the
resolved trajectory's own real motion requires — current p95 range across
all 4 benchmarks is a tight 3.6–4.0, with no benchmark a clear outlier
(Section 10's local-window data).

## 26. Files changed

**None in `src/`.** This is an evidence-only phase; `presentationCamera.ts`,
`displayStabilization.ts`, `follow.ts`, `cameraPath.ts`, `OverlaySurface.tsx`,
and `VideoOverlay.tsx` were all read but never edited (confirmed by
`git diff --stat`: none of the first four core files appear in the diff at
all; `OverlaySurface.tsx`/`VideoOverlay.tsx` show only their pre-existing,
prior-phase diffs, unchanged by this phase).

**New:**
- `scripts/phase-9-3a-browser-cadence-compositor.mjs` (Parts D/R/S)
- `scripts/phase-9-3a-final-trace-analysis.mjs` (Parts A–K, U)
- `scripts/phase-9-3a-refresh-counterfactual.mjs` (Parts L–N)
- `scripts/phase-9-3a-synthetic-visualization.py` (Part T)
- `scripts/phase-9-3a-sanity.mjs` (Part Z, 12/12 passing)
- `docs/phase-9-3a-final-displayed-autofollow-smoothness-audit.md` (this file)
- `tmp/phase93a/` (all JSON/CSV/plots deliverables, gitignored)

## 27. Tests

`scripts/phase-9-3a-sanity.mjs` — **12/12 passing**: final-transform-trace
determinism, athlete-anchor-trace determinism, delta-calculation
determinism, velocity-uniformity-calculation determinism,
acceleration/jerk exclusion correctness, skip-event-detector determinism,
layer-decomposition determinism, refresh-counterfactual determinism,
ideal-lower-bound-calculation determinism, RAW/Stabilized comparison
determinism, instrumentation-does-not-alter-presentation (no writes to any
guarded production file, mtime-verified), and scientific-outputs-unchanged
(real rerun of `scripts/vanni-240-metric-evidence-sanity.mjs` against real
production data → `ALL PASSED`).

## 28. Browser/benchmark runs

Real, authenticated Playwright session
(`scripts/phase-9-3a-browser-cadence-compositor.mjs`): rAF cadence
measurement (181 samples), per-benchmark compositor/dataset probes (Vanni
60/120/240), and a CSSOM precision round-trip test — all against the real
Next.js dev bundle, zero console errors. Real Node module runs against real
production functions and real pose/cameraPath artifacts for all 4
benchmarks: `phase-9-3a-final-trace-analysis.mjs`,
`phase-9-3a-refresh-counterfactual.mjs`. Real matplotlib rendering of real
measured data: `phase-9-3a-synthetic-visualization.py`.

## 29. Scientific regression

`npm run typecheck`: clean. `npm run lint`: clean (0 warnings).
`npm run build`: production build succeeded, 41/41 static pages (dev server
safely stopped before build, cleanly restarted after — `curl` 200
confirmed). Full regression suite rerun, real:

| Suite | Result |
|---|---|
| Phase 8.2A sanity | 8/9 (check 8 is an expected, pre-existing, already-documented non-regression — see below) |
| Phase 8.2B sanity | 21/21 |
| Phase 8.1B-2B stabilization sanity | 19/19 |
| Phase 9.2B sanity | 23/23 |
| Phase 9.1B sanity | 15/15 |
| Phase 8.0B overlay-label sanity | 32/32 |
| Phase 7.3B temporal-state sanity | 11/11 |
| Phase 6.6B Part B presentation-sync sanity | 18/18 |
| Phase 6.5 presentation-camera sanity | pass |
| `scripts/vanni-240-metric-evidence-sanity.mjs` | ALL PASSED |

Phase 8.2A check 8 ("instrumentation does not alter Auto Follow" — asserts
`OverlaySurface.tsx`'s mtime predates Phase 8.2A's own scripts) has been an
expected, already-documented non-regression since Phase 8.2B itself
(explicitly stated in that phase's own regression section: 8.2B is
"explicitly authorized to modify that file"); it is not caused by this
phase (confirmed: `git diff --stat` shows zero changes to
`OverlaySurface.tsx` from this phase's own work — the file's diff is
entirely pre-existing, from 8.1B-2B/8.2B's own prior, already-closed edits).

## 30. Anything not personally validated

Live, continuously-advancing transform-write behavior over real decoded
video playback could not be captured in this sandboxed browser (Section
16/17) — `requestVideoFrameCallback` never fires a real callback here, so
`presentedTimeRef.current` stays frozen after mount, pinned to this exact
mechanism this phase (not merely re-asserted). A genuine human-visible
screen recording of the composed video+overlay scene was not possible for
the same reason; the synthetic transform replay (Section 22) is explicitly
labeled as such, not presented as a substitute for real visual validation.
The refresh-rate counterfactual's non-monotonic pattern (Section 19) is
explained by a real, identified mechanism (discrete athlete-anchor
sampling) but was not independently re-verified through a second,
different methodology within this phase's own scope.

## 31. Phase status

**CLOSED.**

## 32. Remediation-roadmap status

9.0A CLOSED · 9.1A CLOSED · 9.1B CLOSED · 9.2A CLOSED · 9.2B CLOSED ·
**9.3A CLOSED (this phase)** · 9.3B NOT STARTED, not recommended (Section
23) · 9.4 NOT STARTED. No roadmap credit invented beyond this phase's own
closure.

## 33. Legacy roadmap status

Unweighted evidence-only phase, consistent with every prior Auto
Follow/Stabilized View phase in this line (6.5, 6.6B, 8.1B-2B, 8.2A, 8.2B).
No roadmap percentage claimed or changed — legacy stationary roadmap
remains **29.5%**.

## 34. Git status

No commit, push, `db:reset`, or database mutation was performed. Zero
`src/` files changed by this phase (verified, Section 26). New: 5 scripts
under `scripts/phase-9-3a-*`, this report, `tmp/phase93a/` (gitignored).
The working tree was already substantially dirty from many prior,
unrelated, uncommitted phases in this same session (see `git status`);
none of that was touched or discarded.
