# Phase 8.2A — 240 FPS Auto Follow Smoothness Forensic Audit

Evidence-only forensic audit. No production code was changed. This phase
inherits the Auto Follow architecture from Phase 6.5/6.6B/6.6D and the
display-only "Stabilized View" layer from Phase 8.1B-2B; both are treated as
given, not re-litigated, except where explicitly re-verified below.

## 1. Question

Auto Follow and Stabilized View both work (Phase 8.1B-2B), but 240 FPS
footage still *feels* skippier than 60 FPS footage during Auto Follow
playback — small digital hops / micro-recentering rather than a smooth,
broadcast-like pan. Is the underlying camera math actually less smooth at
240 FPS, or is something else responsible?

## 2. Architecture inherited (not re-derived)

- `src/lib/video/presentationCamera.ts` (`buildPresentationCameraPath` /
  `stepPresentationCamera`) is the **sole live Auto Follow system**. It is a
  pure, source-time-based state machine: `buildPresentationCameraPath`
  resolves it once over every real (FPS-normalized) source frame, producing
  a fine-grained per-frame array. `OverlaySurface.tsx`'s `tick()` does an
  O(1) lookup (`resolvedCameraPath[frameIndex]`) rather than re-stepping
  live.
- `src/lib/video/follow.ts`'s older smoothing helpers
  (`smoothFollowStable`, `computeFollowTarget`, `anticipateFollowTarget`,
  `DEFAULT_FOLLOW_SMOOTHING`) are **dead code** — zero references outside
  `follow.ts` itself (verified by repo-wide grep). Only `FollowBox`,
  `IDENTITY_FOLLOW`, `followTransform`, `followsDiffer`, `clampFollow`
  remain live.
- `src/lib/video/displayStabilization.ts` (Phase 8.1B-2B) smooths a
  **different signal** — the world-lock `frameToGlobalMatrix` (real camera
  micro-shake/drift, a few px) — composed in a wrapper *outside* the Auto
  Follow wrapper. It does not read or affect the athlete-tracking
  `cx/cy/scale` chain this audit investigates, and its own contribution was
  already independently measured in Phase 8.1B-2B (60–82% peak drift
  reduction, no jerk introduced). Out of scope here; not re-derived.

## 3. Methodology

Real, unmodified production code (`buildPresentationCameraPath`) was
compiled standalone (tsc-to-tmp-dir + `Module._resolveFilename` patch) and
run against the real, current pose artifacts for all three Vanni benchmarks
(`tmp/phase80a/vanni{60,120,240}.pose.json`), producing the exact
fine-grained camera path production resolves once per clip. Display
sampling was simulated by a byte-for-byte copy of `OverlaySurface.tsx`'s
exported `frameIndexForTime` binary search, advancing `presentedTime` by
`(1/displayHz) * playbackRate` per simulated repaint — reproducing exactly
what a real `<video>` playhead maps to a discrete camera-path index. This
works around this sandboxed environment's established inability to decode
video pixels in headless Chromium (confirmed again in Part N below;
consistent with Phase 8.0B/8.1A/8.1B-2B).

All delta/acceleration/jerk statistics exclude the one-time legitimate
acquisition-transient jump (identity → athlete's first observed position)
and are expressed in "representative CSS px" (a fixed 1280px player-width
constant, purely for human interpretability; the underlying math is
normalized/unit-agnostic).

Scripts (all read-only, standalone, not imported by any `src/` file):
`scripts/phase-8-2a-autofollow-trace.mjs`,
`scripts/phase-8-2a-autofollow-analysis.mjs`,
`scripts/phase-8-2a-deep-analysis.mjs` (Parts H/I/J/K/P),
`scripts/phase-8-2a-same-trajectory-control.mjs` (Part J),
`scripts/phase-8-2a-part-l-synchronized-export.mjs` (Part L),
`scripts/phase-8-2a-part-n-browser-check.mjs` (Part N),
`scripts/phase-8-2a-sanity.mjs` (9 deterministic checks). Raw evidence under
`tmp/phase82a/` (gitignored).

## 4. Findings by part

**Part E — source-time normalization audit.** Every time-based constant in
`DEFAULT_PRESENTATION_CAMERA_CONFIG` is expressed in seconds or per-second
rates; grep for frame-count-dependent patterns
(`frameIndex|rafCount|updateCount|frameCount|% |frames\.length`) in
`presentationCamera.ts` → **zero matches**. The three deadbands
(`horizontalDeadband=0, verticalDeadband=0.045, scaleDeadband=0.06`) are
dimensionless spatial/scale thresholds, correctly not frame-count units —
but are re-evaluated once per real source frame, so their *emergent*
hold/release frequency is implicitly denser at higher FPS. This subtlety
feeds Part H.

**Part F/G — target quantization + CSS transform precision.** Grep for
`Math.round|Math.floor|Math.ceil|toFixed|parseInt|\| 0|>>> 0` across
`presentationCamera.ts`, `follow.ts`, `displayStabilization.ts` → **zero
matches**. `followTransform` interpolates full floating-point strings, no
rounding. The only `Math.round` near this pipeline is an unrelated canvas
backing-store DPR-sizing line in `VideoOverlay.tsx`. **Conclusion: zero
JS-side numerical quantization exists anywhere in the live
target/camera-state/CSS-transform-writing path.** (Real
browser-computed-style verification was attempted in Part N but blocked by
the environment's video-decode limitation — see caveat below.)

**Part H — deadband hold/release isolation (real internal state).** Using
the actual `targetCenterSourceY` state (not a screen-delta proxy), for
every benchmark's top-decile largest display-tick jumps:

| benchmark | topDecile events | coalescing-only | involves target change |
|---|---|---|---|
| vanni60 | 22 | 22 (100%) | 0 (0%) |
| vanni120 | 23 | 23 (100%) | 0 (0%) |
| vanni240 | 25 | 25 (100%) | 0 (0%) |

**0% of the large visible jumps involve a deadband release, for all three
benchmarks.** `DEADBAND_HOLD_RELEASE` is not a meaningful contributor.

**Part I — counterfactual display sampling (30/60/90/120/144/240 Hz).**
Sampling each benchmark's real fine path at increasing display rates:

- vanni60 (native ~56.5fps): flat from 60Hz onward (median 6.18px, p95
  8.61px at every rate ≥60Hz) — plateaus at its own native rate, a
  methodology sanity check.
- vanni120: decreases with rate, plateaus at 120Hz (p95: 30Hz→19.14,
  60Hz→8.65, 90Hz→7.90, 120Hz+→4.22).
- vanni240: decreases **smoothly and monotonically all the way to 240Hz,
  never plateauing** in the tested range (p95: 30Hz→24.03, 60Hz→12.41,
  90Hz→8.33, 120Hz→6.21, 144Hz→5.16, 240Hz→3.13).

This is the clearest single piece of evidence: perceived motion for the
same real trajectory gets progressively smoother purely as a function of
display sampling rate, with no plateau short of matching the source's own
FPS — the signature of a display-refresh limitation, not a defect in the
underlying (already fine and smooth) trajectory.

**Part J — same-trajectory, different-source-FPS control.** To separate
SOURCE FPS from ATHLETE/RUN-SPECIFIC effects, the real Vanni 240 input pose
frames were decimated (every 2nd / 4th real frame) to simulate the *same*
athlete run captured at ~120fps / ~60fps, re-run through the real
`buildPresentationCameraPath`, then all three (native 240, sim-120, sim-60)
display-sampled at the **same fixed 60Hz**:

| input | fine p95 (px) | display@60Hz p95 (px) |
|---|---|---|
| native 240fps | 3.13 | 12.41 |
| simulated 120fps (same run) | 6.23 | 12.66 |
| simulated 60fps (same run) | 12.45 | 12.45 |

Once held to the same 60Hz display, the displayed statistics for the *same*
real motion are nearly identical (median 2.69/2.83/3.69px, p95
12.41/12.66/12.45px) **regardless of source FPS**. This rules out an
athlete/run-specific confound: the visible skip is a property of the
source-FPS-to-display-FPS *ratio*, not of which recording was used, and not
of source FPS being fed to the algorithm.

**Part K — zoom/translation coupling.** Every top-decile display-tick event,
across all three benchmarks, decomposed to translation vs. scale
contribution: **100% classified "pan", 0% "zoom", 0% "both"** (75/75
events). `ZOOM_TRANSLATION_COUPLING` is not a contributor.

**Part L — synchronized signal export + localization.** Built a
display-sampled timeline (raw target → smoothed target → camera cx/cy/scale)
annotated with `presentationState` transitions, deadband holds (Part H), and
large display-tick jumps (Part K). Cross-referencing each large jump against
the fine-frame span it coalesces: **all examined large jumps (8/8 per
benchmark) localize to `ordinary_multi_frame_coalescing`** — zero coincide
with a `presentationState` transition or a deadband-release boundary. (Note:
this check covers the 8 events retained per benchmark in the Part K sample
set, not the full top-decile population; consistent with, not contradicted
by, Part H's full-population 0% figure above.)

**Part M — presentation-phase timing (static + real).** Static trace of
`OverlaySurface.tsx`'s `tick()`: `frameIndex` is derived fresh each tick
from `presentedTimeRef.current` (rVFC-driven) or `video.currentTime`
(fallback), and the Auto Follow wrapper transform *and* the Stabilized View
correction are computed and written **in the same tick, from the same
`frameIndex`** — they cannot desync from each other by construction. No
`Math.floor`/frame-count-indexed staleness found. Real end-to-end
rVFC-vs-rAF skew measurement was attempted in Part N but blocked by video
decode (see below); the architecture itself shows no off-by-one-frame
pattern.

**Part N — real browser validation (required before closure).** Logged in
as the permanent local dev account, opened all three benchmark sessions,
Auto Follow ON, both RAW and Stabilized View, at 1x/0.5x/0.25x, and
instrumented the page directly (rVFC hook, rAF hook, `MutationObserver`-free
polling of the wrapper's `style.transform`) — **before** playback started,
observing the real, unmodified production tick loop.

Result, consistent across all 18 combinations (3 benchmarks × 2 views × 3
rates): `videoWidth: 0`, `readyState: 4` (`HAVE_ENOUGH_DATA`), `rvfcCount:
0`. This confirms the same headless-Chromium video-decode limitation already
disclosed in Phase 8.0B/8.1A/8.1B-2B — the browser never actually decodes a
video frame, so `requestVideoFrameCallback` never fires, and the tick loop
(which prefers the rVFC-driven `presentedTimeRef.current` whenever
`requestVideoFrameCallback` exists) sees `presentedTime` frozen, so no
further transform writes are observed after the loop's own first paint. This
is an environment limitation, not a reproduction of the user-reported
issue.

One genuinely new, useful real measurement did come out of this: **`rAF`
itself fires at a real, empirically measured ~59.9 Hz** in this browser
engine (39 samples, median inter-frame delta 16.7ms, min 15.7ms, max
17.7ms, over ~2.5s of wall time) — directly, empirically validating the
"nominal 60Hz display" assumption Parts A–L's offline simulation was built
on, rather than leaving it as an assumption. `video.currentTime` does
advance correctly in this environment (0.05s → 2.494s over ~2.5s at 1x),
confirming the video element's own timeline is real even though pixel
decode is not — full end-to-end transform-write cadence could not be
captured, and this is disclosed as a real gap, not glossed over.

**Part O — perceptual classification.** Because Part N could not produce a
direct, pixel-level visual capture, this classification is an **inference**
from the offline-simulated, now real-rAF-cadence-cross-validated evidence
chain (H/I/J/K/L), not a literal frame-by-frame observation — stated
explicitly, not implied.

| benchmark | fine p95 (px) | display@60Hz p95 (px) | ratio | classification |
|---|---|---|---|---|
| vanni60 | 8.61 | 8.60 | ~1.0 | SMOOTH |
| vanni120 | 4.22 | 8.65 | ~2.0 | MINOR_MICRO_SKIP |
| vanni240 | 3.13 | 12.41 | ~4.0 | CLEAR_SKIP |

None show a HOLD_RELEASE, ZOOM_PULSE, or PRESENTATION_TIMING_ERROR
signature (each explicitly measured and excluded above, not assumed).

**Part P — robust smoothness proxy.** Rebuilt to use median/p95 absolute
acceleration and jerk, source-time normalized, computed only within
contiguous runs of `following`/`anticipating`/`reacquiring` states (length
>3), explicitly excluding state-transition boundaries and the acquisition
transient. Fine vs. display@60Hz p95 jerk: vanni60 146,770→1,881,769 (12.8x);
vanni120 75,862→145,477 (1.9x); vanni240 83,574→207,059 (2.5x). Directionally
consistent (display always noisier than fine) but not as cleanly
FPS-proportional as the Part I delta-px metric — acceleration/jerk are
higher-order derivatives and inherently more sensitive to exactly where
discrete samples land with fewer retained samples per run. The delta-px
metric (Part I/J) is treated as the primary, most reliable quantitative
signal; jerk/acceleration is a secondary, directionally-corroborating one.

## 5. Root-cause classification (Part Q)

| candidate cause | verdict | evidence |
|---|---|---|
| `TARGET_QUANTIZATION` | ruled out | Part F: zero rounding calls in the live code path |
| `CSS_TRANSFORM_QUANTIZATION` | ruled out (code-level) | Part G: zero rounding in transform string construction; real browser-computed-style confirmation blocked by video decode (disclosed gap) |
| `DEADBAND_HOLD_RELEASE` | ruled out | Part H: 0% of top-decile jumps involve a target change, all 3 benchmarks |
| `ZOOM_TRANSLATION_COUPLING` | ruled out | Part K: 100% pan-classified, 0% zoom, all 3 benchmarks |
| `PRESENTATION_PHASE_MISMATCH` | no evidence found | Part M: camera transform + stabilization correction always resolved from the same `frameIndex` in the same tick; real rVFC-vs-rAF skew unmeasurable in this environment (disclosed gap) |
| `STABILIZATION_COMPOSITION_INTERACTION` | out of scope / no evidence | different signal (world-lock), independently validated in 8.1B-2B |
| `SOURCE_TIME_SMOOTHING_DEFECT` | ruled out | Part E: all constants correctly time-based; Part J: same real motion decimated to different source FPS produces near-identical displayed output once display-rate-limited |
| **`DISPLAY_REFRESH_COALESCING`** | **strongly supported — dominant cause** | Part I: monotonic, non-plateauing counterfactual curve for vanni240 all the way to 240Hz; Part J: cross-FPS control confirms it's a ratio effect, not an algorithmic defect; Part L: 100% of examined large jumps localize to ordinary coalescing; Part N: real rAF cadence (~59.9Hz) empirically confirms the display-rate ceiling driving this |

**Classification: `DISPLAY_REFRESH_COALESCING`** (equivalently
`NORMAL_DISPLAY_REFRESH_LIMIT`), with high confidence at the algorithmic /
source-time layer (multiple independent methods converge: I, J, K, L) and
medium confidence for the full real-browser rendering pipeline specifically
(Part N's end-to-end transform-cadence measurement was blocked by this
sandboxed environment's video-decode limitation; the offline simulation,
now cross-validated by a real rAF cadence measurement, is the best evidence
available here). Not multi-factor, not insufficient evidence — every
alternative candidate was explicitly measured and excluded rather than
assumed away.

Underlying mechanism: `presentationCamera.ts`'s smoothing is correctly
source-time-based and produces a genuinely finer, smoother trajectory at
240fps than at 60fps (fine p95: 3.13px vs. 8.61px — 240fps is the
*smoothest* of the three in its own native resolution). But
`OverlaySurface.tsx`'s `tick()` samples that fine path with a
nearest-source-frame-at-or-before lookup once per real display repaint
(~60Hz). At 240fps, roughly 4 fine steps get coalesced into each displayed
tick, so each visible jump is the *cumulative* effect of ~4 real steps
rather than 1 — producing a larger per-tick displayed delta even though the
underlying motion is smoother, not less smooth, than 60fps's own.

## 6. Should Phase 8.2B proceed? (Part R)

**Yes, but narrowly.** Since the underlying camera math is already correct
and, if anything, unusually smooth at high source FPS, the RESUME
directive's own guidance applies directly: do not add smoothing/easing to
already-correct camera math (that would introduce lag). The appropriate fix
is **display-cadence interpolation of the already-resolved path**, not a
new state machine, not new time constants, not touching
`presentationCamera.ts`.

## 7. Phase 8.2B spec (design only — NOT implemented)

- **File**: `src/components/video/OverlaySurface.tsx`, only inside `tick()`
  — the `camera = frame && autoFollowRef.current ? resolvedCameraPath[frameIndex] : ...`
  line and what it feeds into `next`/`target`. No change to
  `presentationCamera.ts`, `follow.ts`, or `displayStabilization.ts`.
- **Mechanism**: given `presentedTime`, instead of nearest-frame-at-or-before
  (`resolvedCameraPath[frameIndex]`), find the bracketing entries at
  `frameIndex` and `frameIndex + 1` and linearly interpolate `cx`, `cy`,
  `scale` by `t = clamp((presentedTime - frames[frameIndex].time) / (frames[frameIndex+1].time - frames[frameIndex].time), 0, 1)`.
  Purely a display-time interpolation of the algorithm's *already-computed*
  discrete output — no recomputation of the state machine, no new lag.
- **Guard**: do not interpolate across a `presentationState` change between
  the two bracketing entries (snap to the earlier state's exact value until
  the transition frame itself is reached) — avoids a technically-incorrect
  "creep" through what should be a strict hold; likely low-impact in
  practice but should be verified, not assumed, when implemented.
- **Expected effect**: vanni240 display-sampled p95 should move from ~12.4px
  toward something closer to its own fine-trace p95 (~3.1px), scaled by how
  the interpolated point sits between bracketing frames each tick. vanni60
  (native FPS already below display rate) should see no material change —
  there's rarely more than one fine frame between display ticks to
  interpolate.
- **Risks**: off-by-one/wrong-direction lerp (needs a small deterministic
  unit test against a synthetic path with a known fractional `t`);
  interaction with the separately-timed Stabilized View correction (same
  nearest-frame pattern today — likely deserves the identical treatment for
  consistency, though its own contribution is already small per 8.1B-2B).
- **Tests** (for 8.2B, not written here): interpolation reduces to the exact
  nearest-frame value at `t=0`/`t=1`; interpolation is monotonic and bounded
  by the two bracketing frames; `presentationState`-boundary guard verified;
  scientific/contact/timing outputs unchanged (interpolation only touches
  the CSS-transform-writing `tick()`, never analysis/metrics code).
- **Acceptance metric**: re-run this phase's own Part I/J counterfactual
  methodology against the interpolated `tick()` output and confirm
  display-sampled p95 delta drops materially for vanni240/120 while vanni60
  stays materially unchanged; a live browser check once video decode is
  available in a non-sandboxed environment.

## 8. Tests (9/9 passing)

`scripts/phase-8-2a-sanity.mjs` — source-time constants audit determinism;
target quantization measurement determinism; deadband hold/release detector
determinism; multi-refresh sampling determinism; zoom/translation
decomposition determinism; browser trace parsing determinism; smoothness
proxy discontinuity exclusion; instrumentation read-only (no writes to
Auto Follow files; mtime-verified untouched during this phase — see script
comments for why git-HEAD diff is not the right check here, given
legitimate uncommitted prior-phase changes in the working tree);
`buildPresentationCameraPath` output determinism.

## 9. Regression (all passing)

`phase-6-5-presentation-camera-sanity.mjs`,
`phase-6-6b-part-a-instrumentation-sanity.mjs`,
`phase-6-6b-part-b-presentation-sync-sanity.mjs`,
`phase-6-6d-part-b-continuous-auto-follow-sanity.mjs`,
`phase-7-3b-temporal-state-sanity.mjs`,
`phase-8-0b-overlay-label-sanity.mjs`,
`phase-8-1b2b-stabilization-sanity.mjs`, `npm run typecheck`, `npm run
lint`, `npm run build` (production build succeeded, 41/41 static pages).
Dev server was stopped before the build and cleanly restarted after
(`curl` 200 confirmed).

## 10. Explicitly not done here

Phase 8.2B is **not implemented** (by directive). Full real-browser
end-to-end transform-cadence / rVFC-vs-rAF skew measurement remains blocked
by this sandboxed environment's inability to decode video pixels — every
prior phase touching this (8.0B/8.1A/8.1B-2B) hit the same wall, and it is
disclosed here rather than papered over with a simulation presented as a
live capture.
