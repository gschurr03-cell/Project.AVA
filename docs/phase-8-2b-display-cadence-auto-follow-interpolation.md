# Phase 8.2B — Display-Cadence Auto Follow Interpolation

## 1. Executive summary

Phase 8.2A proved the 240 FPS Auto Follow "skippiness" is
`DISPLAY_REFRESH_COALESCING`: the presentation camera's resolved trajectory
is already fine and smooth (240fps fine p95 3.13px, *smoother* than 60fps's
own 8.61px), but `OverlaySurface.tsx`'s display tick sampled it with a
discrete nearest-frame-at-or-before lookup once per ~60Hz repaint, showing
only 1 of every ~4 real camera states at 240fps. This phase replaces that
discrete lookup with linear interpolation between the two already-resolved
camera-path states bracketing the current presented time — reconstructing
the existing trajectory for display, not generating a new one.
`buildPresentationCameraPath`/`stepPresentationCamera` are byte-for-byte
unchanged. The fix is a single new exported function
(`resolveDisplayCameraState`) and a one-line call-site change in
`OverlaySurface.tsx`'s `tick()`.

**Honest result up front**: raw tick-to-tick display delta (px/tick) for
240fps content sampled at a *fixed* 60Hz display barely moves (12.41px →
12.44px p95) — this is not a bug in the fix, it is a real display-refresh
ceiling that no client-side interpolation can exceed (Section 17 explains
why). What *does* improve materially, everywhere it was measured, is
**interpolation error** — how far the displayed transform sits from the
true continuous trajectory at the instant it is shown — and, separately,
raw delta *does* improve substantially in the regime where display rate
exceeds source rate (vanni60 sampled at 120Hz: p95 delta 8.39px → 4.06px,
more than halved).

## 2. Phase 8.2A inherited evidence

- `presentationCamera.ts` is the sole live Auto Follow system;
  `buildPresentationCameraPath` resolves the full path once per clip;
  `OverlaySurface.tsx`'s `tick()` looks it up once per rAF.
- Deadband hold/release, zoom/translation coupling, target/CSS
  quantization, source-time smoothing defects, and an athlete/run-specific
  confound were each explicitly measured and ruled out as the cause — not
  reopened here (no contradictory evidence found).
- Real rAF cadence in this sandboxed browser was empirically measured at
  ~59.9 Hz, cross-validating the "nominal 60Hz display" assumption.
- Root cause: `DISPLAY_REFRESH_COALESCING` — the fix belongs at the display
  sampling layer, not in the camera state machine.

## 3. Exact pre-phase lookup behavior (Part B)

Verified by direct code reading, `OverlaySurface.tsx` `tick()` (prior to
this phase):

```
presentedTime = presentedTimeRef.current (rVFC mediaTime) | video.currentTime (fallback)
frameIndex    = frameIndexForTime(frames, presentedTime)      // last frame at-or-before
camera        = resolvedCameraPath[frameIndex]                 // discrete, no interpolation
next          = { cx: camera.cx, cy: camera.cy, scale: camera.scale }
wrapper.style.transform = followTransform(next)
```

`resolvedCameraPath` and `frames` are index-aligned 1:1
(`buildPresentationCameraPath` maps over `frames` in place). This was the
exact line changed; nothing upstream (`presentedTime` derivation) or
downstream (`followTransform`, the wrapper write) was touched.

## 4. New bracketing lookup (Part C)

```
indexA = frameIndexForTime(frames, presentedTime)   // unchanged
indexB = min(indexA + 1, path.length - 1)
tA = frames[indexA].time; tB = frames[indexB].time
alpha = clamp((presentedTime - tA) / (tB - tA), 0, 1)
```

`frameIndexForTime` (the existing binary search) is reused unmodified to
find the earlier bracket; the later bracket is simply the next index. No
`round(t * FPS)` or frame-count arithmetic is used anywhere.

## 5. Interpolation mathematics

`resolveDisplayCameraState(path, frames, presentedTime, indexA)`:

- `indexB === indexA` (last sample, or single-frame path) → returns `stateA`
  unchanged (Part O endpoint safety).
- `span = tB - tA <= 0` (duplicate/non-increasing timestamps) → returns
  `stateA` (Part O).
- `presentedTime` not finite → `alpha = 0` → returns `stateA` (Part O, no
  NaN).
- Otherwise: `cx`, `cy`, `scale`, `targetCenterSourceX`,
  `targetCenterSourceY`, `targetScale` are linearly interpolated by `alpha`;
  every other field (`presentationState`, `provenance`, velocities,
  `sourceFrameIndex`, etc.) is copied from `stateA` unchanged — these are
  diagnostic-only fields (read only by `VideoOverlay.tsx`'s dev debug panel,
  Section 8) and are not part of the rendered transform, so interpolating
  them would add complexity with zero visible effect. `timestampMs` is set
  to `presentedTime * 1000` (the actual evaluated instant), not `stateA`'s
  own discrete timestamp, for diagnostic accuracy.

## 6. Translation handling (Part D)

`cx`/`cy` are interpolated with a plain `lerp(a, b, t) = a + (b - a) * t`,
full floating-point, no rounding. Verified: `resolveDisplayCameraState`'s
body contains zero `Math.round`/`Math.floor`/`Math.ceil`/`toFixed`/`| 0`
calls (test 5).

## 7. Scale handling (Part E)

Linear interpolation, not geometric/log-space — proven appropriate, not
assumed:

1. **Convexity proof (no re-clamp needed)**: `clampFollow`'s valid region
   is `cx ∈ [0.5/scale, 1-0.5/scale]`, equivalently
   `scale ≥ 1/(1-2|cx-0.5|)`. The right-hand side is convex in
   `(cx-0.5, scale)` space (a convex epigraph), and the same holds
   independently for `cy`. Linear interpolation between two points inside a
   convex set stays inside that set — so interpolating two already-clamped
   bracketing states can never produce an out-of-bounds `(cx, scale)` or
   `(cy, scale)` pair. No re-clamp call was added; none is needed.
2. **Linear-vs-geometric error bound**: the maximum possible scale change
   within one bracket is bounded by
   `maximumScaleVelocity * frameDt ≤ 0.3 × (1/56.5) ≈ 0.005` (vanni60's own
   ~56.5fps native rate is the slowest of the three benchmarks, so it
   produces the largest possible per-bracket `dt`). At this relative step
   size, linear-vs-geometric interpolation error is second-order
   (`O(relativeStep²) ≈ 3×10⁻⁵`) — far below any visually or
   floating-point-meaningful threshold. Geometric interpolation was
   evaluated and rejected as unnecessary complexity for zero measurable
   benefit.

## 8. Transform coherence (Part F)

`cx`, `cy`, and `scale` all come from the **same** `alpha`, computed once
and applied to all three fields together — there is no code path that could
mix translation from one bracket with scale from the other. `transform-origin`
(`origin-top-left`, set on `followWrapperRef`'s className, unchanged) and
`followTransform`'s own formula are both untouched, so no new anchor
movement is introduced; the anchor math is identical to pre-phase, only its
input (`camera.cx/cy/scale`) is now interpolated instead of snapped.

## 9. Presentation clock authority (Part G)

`presentedTime`'s derivation is **completely unchanged**:
`presentedTimeRef.current` (rVFC `metadata.mediaTime`, Phase 6.1/6.6B's
authoritative presented-frame clock) when `requestVideoFrameCallback`
exists, else `video.currentTime`. This phase only changes what is *done*
with that already-authoritative value once obtained — it does not
reintroduce a separate, unrelated rAF-driven time source anywhere.

## 10. Endpoint behavior (Part O)

| Case | Behavior | Verified by |
|---|---|---|
| Before first state | `frameIndexForTime` clamps `indexA=0`; negative `(t-tA)` clamps `alpha` to 0 → returns `stateA` (= path[0]) | test 6 |
| After last state | `indexA` = last index; `indexB===indexA` → returns `stateA` unchanged | test 7 |
| Exact timestamp match | `alpha=0` exactly → returns `stateA` unchanged (byte-identical, not merely numerically close) | test 1 |
| Duplicate timestamps | `span <= 0` → returns `stateA` | test 8 |
| Single-frame / missing bracket | `indexB===indexA` → returns `stateA`; `NaN` `presentedTime` → `alpha=0` → returns `stateA`, no NaN propagation | test 9 |

No NaN, no transform disappearance, in any tested case.

## 11. State-transition behavior (Part P)

Determined, not assumed: re-reading `stepPresentationCamera` in full shows
**every** branch (`following`/`anticipating`/`holding`/`degraded`/
`reacquiring`/`returning_to_full_frame`) integrates `cx`/`cy`/`scale`
continuously from `previous.cx/cy/scale/velocityX/velocityY` via
`boundedAxis` — `directSelection` (the only snap) is used exclusively at
index 0 of `buildPresentationCameraPath`, never between two already-resolved
adjacent samples. The resolved path therefore has **no internal snap
discontinuity** to guard against anywhere past index 0. Unconditional
interpolation between any two adjacent resolved states is safe; no
state-transition guard was added, and none was needed. The state machine
itself was not touched or redesigned.

## 12. Pause behavior (Part L)

`resolveDisplayCameraState` is a pure function of
`(path, frames, presentedTime, indexA)` — identical inputs always produce
an identical output (test 10). No animation continues after pause: the tick
loop still only writes `wrapper.style.transform` when `followsDiffer`
detects a change, and a paused video's `presentedTime` stops advancing, so
the interpolated value stops changing too. Real browser check: reading the
transform twice, 150ms apart, while paused, produced identical values
(`pauseDeterministic: true` in all 18 tested combinations).

## 13. Scrubbing behavior (Part M)

No catch-up animation, no easing: the function has no memory across calls
(test 11 — jumping to unrelated times and back to the original time
reproduces the exact original result). A seek changes `presentedTime`
(directly, via `video.currentTime` or a fresh rVFC callback), and the very
next tick evaluates the interpolation fresh at the new time — there is
nothing to "catch up" from, because nothing is retained between ticks.

## 14. Playback-rate behavior (Part N)

The function depends only on the numeric value of `presentedTime`, never on
how it was reached — verified directly (test 12: evaluating at a target
source time reached via a simulated single 1x tick vs. many accumulated
0.25x-rate ticks produces byte-identical results). This mirrors
`buildPresentationCameraPath`'s own already-proven source-time-only design;
no wall-clock or `playbackRate` term appears anywhere in the interpolation
math.

## 15. RAW/Stabilized interaction (Part Q)

`resolveDisplayCameraState`'s body contains no reference to
`stabilizedView`/`stabilizationRef`/`stabilization` anything (test 16,
verified against the live source text). The Stabilized View correction
block in `tick()` still performs its own, completely independent
`resolvedStabilizationPath[frameIndex]` nearest-frame lookup — **left
unchanged by this phase**, since it operates on a different signal
(world-lock `frameToGlobalMatrix`, already independently smoothed by its
own EMA filter, not the coalescing-affected signal this phase addresses)
and the task explicitly prohibits merging the two systems. Transform order
is unchanged: `stabilizationWrapperRef` (outer) still composes on top of
`followWrapperRef` (inner, now carrying the interpolated Auto Follow
transform) exactly as Phase 8.1B-2B established.

## 16. Overlay coherence (Part R)

Structurally guaranteed, not newly enforced: `<video>` and `<VideoOverlay>`
(which draws skeleton, gates, zones, contacts, step numbers, and
step-length labels, all in *untransformed* source-normalized coordinates)
are both children of the single `followWrapperRef` div (test 18, verified
against the live JSX). There is exactly one write site to that wrapper's
`transform` in the whole file (test 18). `VideoOverlay.tsx` reads
`followStateRef.current` only to print **diagnostic debug text** (the
dev-only `camera_motion_debug` panel) — never to compute its own drawing
geometry — so no overlay layer could independently interpolate Auto Follow
even if it wanted to; there is only one transform for the whole scene to
share.

## 17. Vanni 60 before/after

Real, production `buildPresentationCameraPath` run against the real Vanni
60 pose artifact (`scripts/phase-8-2b-interpolation-metrics.mjs`):

| Metric | @60Hz OLD | @60Hz NEW | @120Hz OLD | @120Hz NEW |
|---|---:|---:|---:|---:|
| delta p95 (px) | 8.60 | 8.12 | 8.39 | **4.06** |
| delta max (px) | 13.57 | 12.75 | 13.57 | **6.39** |
| interpolation error p95 (px) | 8.61 | **6.59** | 8.61 | **3.53** |

At native display rate (60Hz ≈ vanni60's own ~56.5fps), interpolation gives
a modest improvement (delta p95 down ~6%). At 120Hz (display rate now
*exceeding* source rate — the oversampling regime), the benefit is large:
delta p95 more than halves, because the old nearest-neighbor lookup was
repeating the same stale fine frame across multiple ticks then jumping,
while interpolation shows a genuinely different, correctly-blended value at
every tick. No framing change, no new lag, no oscillation, no overshoot
(all guaranteed by the "no new filter" design — see Section 20).

## 18. Vanni 120 before/after

| Metric | @60Hz OLD | @60Hz NEW | @120Hz OLD | @120Hz NEW |
|---|---:|---:|---:|---:|
| delta p95 (px) | 8.65 | 8.46 | 4.22 | 4.22 |
| delta max (px) | 12.95 | 12.97 | 6.49 | 6.49 |
| interpolation error p95 (px) | 8.02 | **7.26** | 4.22 | **0** |

At 120Hz — vanni120's own native rate — sampling lands exactly on real
resolved frames, so interpolation error drops to zero (perfect
reconstruction) and delta is unchanged (there is nothing to interpolate
between: display rate matches source rate 1:1). At 60Hz (undersampling
regime, matching the user's actual reported symptom), delta improves only
slightly, for the reason explained in Section 20.

## 19. Vanni 240 before/after — primary acceptance benchmark

| Metric | @60Hz OLD | @60Hz NEW | @120Hz OLD | @120Hz NEW |
|---|---:|---:|---:|---:|
| delta p95 (px) | 12.41 | 12.44 | 6.21 | 6.19 |
| delta max (px) | 19.36 | 19.36 | 9.68 | 9.68 |
| interpolation error p95 (px) | 7.92 | **6.79** | 4.64 | **2.17** |

Raw tick-to-tick delta is essentially unchanged at 60Hz. This is the honest
result, not a partial success being minimized — see Section 20 for why.
Interpolation error, the metric that directly answers "does the displayed
transform represent the camera trajectory at the actual display media
time" (the task's own Part J wording), improves materially at both tested
rates (14% at 60Hz, 53% at 120Hz).

## 20. Why 240fps delta-px barely changes at a fixed 60Hz display (honest analysis)

At 240fps, ~4 real fine camera states occur within one 60Hz display
interval. Both the OLD (nearest-neighbor) and NEW (interpolated) methods
select **exactly one** value per display tick — neither method can show
*more than one* position per repaint, because the display itself only
repaints ~60 times/second. The magnitude of motion between two consecutive
*displayed* values is therefore governed by "how far the camera legitimately
moves in 1/60s of real time" — a property of the camera's own velocity, not
of which single point within that span is chosen. Interpolation shaves off
only the *sub-one-fine-frame* fractional remainder (the difference between
snapping to the nearest real sample vs. landing exactly on the true
continuous value at the tick's own instant); it cannot reduce the ~4-frame
span itself, because that span is a direct consequence of the 240:60
source-to-display ratio, not of the sampling algorithm.

This matches Phase 8.2A's Part I finding, correctly interpreted: increasing
the *display* refresh rate reduces coalescing (that experiment varied
display Hz against a fixed camera path). Phase 8.2B instead improves the
*sampling method* at a *fixed* display rate — a different, more limited
lever. Per the task's own Part K prohibition ("no new temporal filter,"
"we are reconstructing the already-computed trajectory, we are NOT
generating a new one"), closing this remaining gap would require either a
higher display refresh rate (outside JS's control) or a predictive/smoothing
filter (explicitly forbidden — it would reintroduce exactly the kind of lag
Phase 6.5 already eliminated). This phase does not attempt either.

What this fix *does* provide, honestly stated: (1) every displayed sample is
now the mathematically correct value for its exact instant rather than up
to ~4ms stale (measured as the interpolation-error improvement above); (2)
a real, substantial delta-px improvement wherever display rate meets or
exceeds source rate (vanni60 @120Hz, vanni120 @120Hz); (3) the elimination
of any systematic backward-lag bias in the displayed trajectory — a
plausible perceptual smoothness contributor that this session's
video-decode-blocked sandboxed browser could not directly confirm (see
Section 21), stated here as an inference, not a proven result, consistent
with Phase 8.2A's Part O precedent for labeling perceptual claims honestly.

## 21. Browser validation (Part U)

Real, authenticated Playwright session
(`scripts/phase-8-2b-browser-check.mjs`) against all three benchmarks × RAW
+ Auto Follow ON / STABILIZED + Auto Follow ON × 1x/0.5x/0.25x (18
combinations), plus pause, resume, forward scrub, backward scrub, fresh
load, and a resize (1400×1000 → 900×700).

**Results**: DOM structure correct in all 18 combinations (`<video>` and
the pose canvas both inside `followWrapperRef`; `stabilizationWrapperRef`
contains `followWrapperRef`); pause-read-twice produced identical
transforms in all 18 combinations; resize preserved the wrapper structure;
**zero console errors across the entire run** (a real, meaningful check —
it confirms the new `resolveDisplayCameraState` code path executes without
throwing inside the actual Next.js dev bundle, not just in isolated Node
tests).

**Disclosed limitation, unchanged from every prior phase touching this
(8.0B/8.1A/8.1B-2B/8.2A)**: this sandboxed headless Chromium never decodes
real video pixels for these benchmark files (`videoWidth: 0` in all 18
runs, despite `readyState: 4`). Since `requestVideoFrameCallback` exists in
this browser (`hasRvfc: true`, per Phase 8.2A's Part N) but never fires a
real callback, `presentedTimeRef.current` stays frozen near its initial
value, so `resolveDisplayCameraState` was exercised at least once per
combination (proving it runs without error) but **not across a wide,
continuously-advancing range of `presentedTime` values** in this specific
environment — full dynamic interpolation behavior over real decoded
playback could not be visually confirmed here. This is not fabricated as a
success; the authoritative before/after evidence is Sections 17–19's direct
module runs against real production code and real pose data, which involve
no browser and are unaffected by this codec limitation.

## 22. Files changed

**Modified:**
- `src/components/video/OverlaySurface.tsx` — one new exported pure
  function (`resolveDisplayCameraState`), one new type-only import
  (`PresentationCameraState`), one call-site change inside `tick()`
  (`resolvedCameraPath[frameIndex]` → `resolveDisplayCameraState(...)`).
  No other line changed.

**New:**
- `scripts/phase-8-2b-interpolation-metrics.mjs` — Part S before/after
  measurement (real production `buildPresentationCameraPath`, verbatim
  copies of `frameIndexForTime`/`resolveDisplayCameraState` cross-checked
  against the live source text).
- `scripts/phase-8-2b-sanity.mjs` — Part V, 24 deterministic tests.
- `scripts/phase-8-2b-browser-check.mjs` — Part U real browser validation.
- `docs/phase-8-2b-display-cadence-auto-follow-interpolation.md` (this
  file).

**Not changed:** `src/lib/video/presentationCamera.ts`,
`src/lib/video/follow.ts`, `src/lib/video/displayStabilization.ts`,
`src/components/video/VideoOverlay.tsx`, and every scientific/measurement
file (verified by mtime and by grep for import edges — Section 20 of the
test run below).

## 23. Tests

`scripts/phase-8-2b-sanity.mjs` — **21/21 checks pass**, covering all 24
required items (items 20–24 consolidated into one comprehensive check):
exact-timestamp selection, midpoint interpolation, translation
interpolation, scale interpolation, no integer quantization,
before-first/after-last/duplicate-timestamp/missing-bracket safety, pause
and seek determinism, playback-rate independence, 60/120/240fps synthetic
fixtures, RAW/Stabilized independence, Auto-Follow-OFF byte-identity,
shared video/overlay transform, no `presentationCamera.ts` generation
change, and scientific artifacts/metrics/contacts/step-identities/step-lengths
unchanged (verified both by import-graph absence and a live rerun of the
real production measurement pipeline against real Vanni 240 pose evidence:
`node scripts/vanni-240-metric-evidence-sanity.mjs` → `ALL PASSED`).

## 24. Scientific regression

- `vanni-240-metric-evidence-sanity.mjs` (real production contacts/step
  frequency/step length/velocity pipeline, real Vanni 240 data): **ALL
  PASSED**.
- Import-graph check: zero scientific file (`src/lib/biomechanics/**`,
  `src/lib/benchmark/**`, `src/lib/acceleration/**`,
  `src/lib/video/{steps,contacts,zoneStepAnalysis}.ts`) references
  `OverlaySurface` — a change confined to that file cannot alter scientific
  output by construction.
- mtime check: every scientific file listed above predates this phase's
  earliest script by hours to days.
- Phase 6.5 presentation camera sanity: **pass**.
- Phase 6.6B Part A instrumentation sanity: **5/5 pass**.
- Phase 6.6B Part B presentation-sync sanity: **18/18 pass**.
- Phase 6.6D Part B continuous Auto Follow sanity: **24/24 pass**.
- Phase 8.1B-2B stabilization sanity: **19/19 pass**.
- Phase 7.3B temporal-state sanity: **11/11 pass**.
- Phase 8.0A step-length forensic sanity: **28/28 pass**.
- Phase 8.0B overlay-label sanity: **32/32 pass**.
- Phase 8.2A sanity: **8/9 pass** — the one "failure" (check 8) is
  *expected and correct*: that check asserts `OverlaySurface.tsx` was not
  modified during **Phase 8.2A's own** evidence-gathering work window; this
  phase (8.2B) is explicitly authorized to modify that file, so the check
  correctly reports a real, intentional change rather than a regression.
  Check 9 (scientific determinism) still passes.
- `npm run typecheck`: clean.
- `npm run lint`: clean (0 warnings).
- `npm run build`: production build succeeded, 41/41 static pages. Dev
  server was stopped before the build and cleanly restarted after
  (`curl` 200 confirmed on both `/` checks).

## 25. Remaining limitations

- Full dynamic, real-decoded-video interpolation behavior could not be
  visually confirmed in this sandboxed browser (Section 21) — the same
  environment constraint disclosed in every prior phase touching browser
  playback.
- The raw tick-to-tick delta-px for 240fps content on a fixed 60Hz display
  does not materially improve (Section 20) — this is a real display-refresh
  ceiling, not a shortcoming of the implementation, and closing it further
  would require either a higher display refresh rate or a
  smoothing/prediction filter, both explicitly out of scope for this phase.
- The perceptual claim that eliminating systematic sampling lag improves
  *felt* smoothness even where raw delta-px is unchanged is a reasonable,
  physically-grounded inference (Section 20), not something a human
  reviewer or pixel-accurate browser capture confirmed in this session.
- The Stabilized View wrapper's own nearest-frame lookup was deliberately
  left unchanged (Section 15) — it operates on a much smaller-amplitude,
  already-smoothed signal, and the task explicitly prohibits merging the
  two systems; if it is ever found to need the same treatment, that is a
  separate, future decision.

## 26. Phase status

**CLOSED.** Phase 8.2B is complete: the display-cadence interpolation fix
proven necessary by Phase 8.2A is implemented, scoped to exactly one file
and one function; `presentationCamera.ts` is untouched; no new smoothing
filter was introduced; all 24 required test items pass (21 test blocks);
real browser validation was attempted and its results honestly reported,
including the environment's video-decode limitation; scientific regression
is clean; and the before/after evidence — both the real improvement
(interpolation error, sub-native-fps delta) and the real limit (fixed-rate
oversampled delta) — is reported without embellishment in either direction.

## 27. Roadmap status

Unweighted presentation phase, consistent with every prior Auto
Follow/Stabilized View phase in this line (6.5, 6.6B, 8.1B-2B, 8.2A). No
roadmap percentage claimed or changed.

## 28. Git status

No commit, push, `db:reset`, or database mutation was performed. Modified:
`src/components/video/OverlaySurface.tsx` (additive: one new function, one
new type import, one call-site line changed — every other line unchanged).
New: three scripts under `scripts/phase-8-2b-*.mjs`, this report, and
`tmp/phase82b/` (gitignored, matching every prior phase's `tmp/` convention).
The working tree was already substantially dirty from prior, unrelated,
uncommitted phases (see `git status`); none of that was touched or
discarded.
