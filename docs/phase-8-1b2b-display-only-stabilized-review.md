# Phase 8.1B-2B — Display-Only Stabilized Review View

**Status:** Implemented, presentation-only. Zero scientific code changed.

## 1. Executive summary

Phases 8.1A/8.1B-1/8.1B-2A proved that AVA's scientific `cameraPath` world-lock
transform correctly tracks real, small, physical post-exit camera motion
(source-vs-independent residuals sub-pixel to a few pixels across all three
Vanni benchmarks; no Phase 6.2 defect). This phase adds a **display-only**
"Stabilized View" that visually smooths that real motion for coach review,
without touching the scientific transform underneath it in any way.

A new, isolated module (`src/lib/video/displayStabilization.ts`) reads the
SAME already-validated per-frame `cameraPath.framePaths[i].frameToGlobalMatrix`
gates/contacts already consume, applies a small, deterministic, source-time
based low-pass filter to it, and exposes the difference between the raw and
filtered value as one small corrective CSS transform. That correction is
applied to a new wrapper `<div>` placed OUTSIDE (on top of) the existing Auto
Follow wrapper, so video, gates, zones, skeleton, contacts, step numbers, and
step-length labels all move together as one shared, coherently-transformed
scene — exactly as the task's Part K requires — with zero changes to
`VideoOverlay.tsx`'s own per-point projection logic.

Real, current-data validation (`scripts/phase-8-1b2b-motion-metrics.mjs`,
calling the real production module against the real, live-verified
`cameraPath` artifacts) shows the peak on-screen drift of a fixed world point
falls from **6.6 px → 2.6 px** (Vanni 120), **6.6 px → 1.2 px** (Vanni 240),
and **3.0 px → 1.1 px** (Vanni 60) — a 61–82% reduction — while frame-to-frame
motion (the visually "jittery" component) drops even further (75–93%
reduction in the p95 step size). No cumulative drift, no catch-up snap, and
no rotation-induced artificial translation were introduced (proven both by
direct unit test and by the real-data run).

RAW mode remains available (default-off toggle) and is proven, both
structurally and by test, to be byte-identical to pre-phase behavior.

## 2. Prior evidence

- Phase 8.1A: end-of-clip drift is real, small (2–10 px), time-proportional,
  and Auto Follow/browser-geometry/stale-evidence were all ruled out as
  causes.
- Phase 8.1B-1: Vanni 120's apparent Y-axis disagreement with an independent
  raw-source estimate was itself a tooling bug (missing rotation correction);
  corrected, AVA matches the independent estimate to ~0.67 px max residual.
  The drift is dominated by a small (~0.32°) real rotation, whose visible
  displacement is amplified by lever-arm distance from the rotation origin
  (pixel (0,0), per `camera_path.py`'s own convention).
- Phase 8.1B-2A: the same corrected methodology, applied to Vanni 240 and
  Vanni 60, found the identical result (sub-few-pixel AVA-vs-independent
  agreement) — no world-lock defect exists in any of the three benchmarks —
  and explicitly recommended the architecture this phase implements
  (Sections 12–15 of that report).

## 3. Raw-vs-stabilized architecture

Traced current production order before implementing (per the task's own
instruction), confirmed by direct code reading:

```
source video (decoded by the <video> element)
  → cameraPath (worker-resolved, scientific, immutable per frame)
  → VideoOverlay.tsx's canonicalGeom()/projectWorldStep()
      (world-locked gate/contact/zone/label source-pixel positions —
       UNCHANGED by this phase)
  → project() (source-normalized → CSS display rect — UNCHANGED)
  → canvas paint (VideoOverlay's <canvas>, inside followWrapperRef)
  → [NEW] Stabilized View correction (stabilizationWrapperRef, OUTSIDE/on
       top of followWrapperRef)
  → Auto Follow (followWrapperRef's own CSS transform — UNCHANGED)
  → shared final rendered scene (video + canvas, both children of the same
       two nested wrappers)
```

Two explicit modes, both selectable via one toggle (`stabilizedView` state
in `OverlaySurface.tsx`):

- **RAW**: `stabilizationWrapperRef`'s CSS `transform` is never written —
  the element keeps its untouched CSS default (no transform at all). This is
  provably byte-identical to the DOM/behavior that existed before this phase
  (verified by static source check, `phase-8-1b2b-stabilization-sanity.mjs`
  check 1b).
- **STABILIZED**: the wrapper's transform is set every animation frame to
  the small corrective transform described in Section 4.

Neither mode changes any scientific value, gate coordinate, contact, step,
evidence, or timing value — the correction is applied entirely downstream of
`VideoOverlay.tsx`'s existing, unmodified draw logic.

**Default: STABILIZED.** Documented decision: Auto Follow defaults OFF
because it is a significant, first-validated-then-still-opt-in framing/zoom
change (Phase 6.5's own explicit convention). Stabilized View is not that —
it is a sub-pixel-to-few-pixel correction with no framing change, closer in
kind to Phase 6.2's own gate deadzone (which ships with no toggle at all,
always on). Given the task's own instruction ("Default mode: STABILIZED
unless existing product conventions strongly justify RAW") and that no
existing convention argues for RAW-by-default, this phase defaults ON. RAW
remains one click away (Part O).

## 4. Input signal

The stabilizer's ONLY input is the existing, already-validated `cameraPath`
artifact — specifically `cameraPath.framePaths[i].frameToGlobalMatrix`
(`{translationX, translationY, rotationDeg, scale}`, already decomposed by
the worker in the exact same convention this module reuses). `OverlaySurface.tsx`
reads it via the SAME `indexCameraFramePaths` helper `VideoOverlay.tsx`
already uses for gate/contact rendering — no new artifact, no new browser-side
computation. `displayStabilization.ts` performs **zero** I/O, has **zero**
dependency on optical flow / feature matching / phase correlation / any new
motion detection — verified directly by static source check (Part B, task's
explicit prohibition) and by the module's own doc comment.

## 5. Motion classification

A small, intentionally minimal contract (`DisplayMotionClass = "stable" |
"micro_shake" | "small_drift" | "intentional_motion"`), based purely on the
current worst-case pixel divergence between the raw and already-smoothed
transform (computed at 5 reference points: all 4 frame corners plus center,
taking the max — the corners carry the largest rotation lever-arm
amplification, Part G/H):

| Class | Divergence | Behavior |
|---|---|---|
| `stable` | < 0.5 px | Smoothed value held exactly still (deadzone) |
| `micro_shake` | 0.5–2 px | Smoothed via the ordinary time constant |
| `small_drift` | 2–58 px | Smoothed via the same ordinary time constant |
| `intentional_motion` | ≥ 58 px | Passed through immediately (no lag) |

Real data (Section 15): across all three Vanni benchmarks' full post-exit
tails, motion never once reached `intentional_motion` — every real frame
classified `stable`/`micro_shake`/`small_drift`, confirming the 58 px
threshold sits comfortably above real evidence (max ~10 px) while remaining
available as a genuine safety valve.

## 6. Deadzone

`deadzoneSourcePx = 0.5` — deliberately reuses Phase 6.2's own evidence-backed
atomic gate deadzone value exactly (`docs/phase-6-2-world-locked-gates-and-camera-shake.md`
Section 9: "above all four measured transform p95s (.045–.238 px) but below
observed real peaks (up to .973 px)"). Expressed in SOURCE pixels (via the
same 5-point worst-case divergence measure), so it is resolution-, DPR-, and
CSS-size-independent, and computed from the per-frame `cameraPath` value
directly — never adjusted per athlete or FPS (verified: the same constant is
used for 240/120/56.5 fps benchmarks in Section 15 with no per-clip tuning).

## 7. Temporal smoothing

`timeConstantS = 0.6`, applied via exponential smoothing
(`1 - exp(-dt/tau)`, `dt` from real source-time deltas between consecutive
resolved frames — never a frame-count or FPS constant). Evidence basis: real
post-exit drift (Phase 8.1A/8.1B-1/8.1B-2A) grows smoothly over ~1.5–1.9s of
elapsed source time; 0.6s comfortably smooths that out within about one real
settle cycle. Evaluated and rejected: a two-speed model (fast-track above the
`intentional_motion` threshold, reverting to the slow constant once back
inside the ordinary band) — real testing (Section 15/`stabilization-sanity`
check 5) showed this produces a visible deceleration "kink" exactly as
motion is being correctly resolved. Replaced with: motion classified
`intentional_motion` passes through **immediately** (single-step, like a
direct-selection reset) rather than continuing to ease — eliminating the
kink entirely and satisfying "no catch-up snap" more robustly.

## 8. Rotation handling

`SimilarityTransform = {translationX, translationY, rotationDeg, scale}` is
smoothed and applied as **one coherent transform**, never per-axis
independently (Part H). The module's 3×3 matrix helpers
(`toMatrix`/`fromMatrix`/`multiply`/`invert`) deliberately mirror
`camera_path.py`'s own `similarity_to_np`/`np_to_similarity`/`compose_np`
convention EXACTLY — rotation applied in raw pixel space around the origin
(0,0), then translate — so the correction is mathematically consistent with
the real `frameToGlobalMatrix` values it consumes. Proven, not assumed
(`stabilization-sanity` checks 6/7/7b):

- A pure-rotation raw signal (no translation) produces a smoothed state
  whose translation component stays at machine-precision zero — smoothing
  itself introduces no artificial translation.
- When raw equals smoothed exactly, the correction is the identity transform
  at **every** one of the 5 reference points (corners + center) — proving
  the correction is not silently pivot-dependent.
- `composeSimilarity(t, invertSimilarity(t))` round-trips to identity to
  within floating-point precision — the matrix algebra itself is correct.

## 9. Transform composition (Part K)

**One shared transform, applied once**, to a wrapper containing the video
element AND `VideoOverlay`'s canvas (which draws gates, zone polygons,
skeleton, contacts, step numbers, and step-length labels) — verified directly
against the real JSX (`stabilization-sanity` checks 8/9): `stabilizationWrapperRef`
contains `followWrapperRef`, which contains both `<video>` and `<VideoOverlay>`.
No per-overlay stabilization exists or was added — `VideoOverlay.tsx` itself
was not modified at all.

## 10. Intentional-motion preservation (Part J)

Covered by Sections 5 and 7: motion beyond the evidence-based 58 px threshold
passes through in a single step (verified: `stabilization-sanity` check 5, a
200 px synthetic jump resolves to <0.01 px residual in one frame). Real Auto
Follow panning/zooming is entirely unaffected — it is a completely separate
transform on a separate, inner DOM element (Section 11).

## 11. Auto Follow interaction (Part L)

`stabilizationWrapperRef` is OUTSIDE `followWrapperRef` — Auto Follow's own
transform code (unchanged) never reads stabilization state, and the
stabilization tick (added to the SAME existing rAF loop, evaluated at the
SAME resolved `frameIndex`/source time every tick) never reads Auto Follow
state (verified: `stabilization-sanity` check 10, and by direct code
inspection — the two `if` blocks in `tick()` are independent). All four
combinations are deterministic and were exercised in real browser validation
(Section 17) with zero console errors:

| | Auto Follow OFF | Auto Follow ON |
|---|---|---|
| **RAW** | identity both wrappers | identity stabilization wrapper, Auto Follow's own pan/zoom |
| **STABILIZED** | small correction only | small correction (source-normalized) composed with Auto Follow's pan/zoom (correction scales correctly with Auto Follow's own zoom, since it sits OUTSIDE/on top of it) |

Per the task's explicit Part M: Auto Follow itself was not redesigned or
touched in this phase; its own separate 240 FPS smoothing issue (if any)
remains out of scope for a later phase.

## 12. User control (Part N)

One button, styled identically to the existing "Auto Follow" toggle, labeled
**"Stabilized View"** (`◉`/`○` + label, `aria-pressed`), with a plain-language
tooltip ("Smooth out small, real camera shake for calmer review — never
hides real camera movement, only how it's displayed"). No technical language
("cameraPath," "deadzone," "transform smoothing") is exposed in the UI.

## 13. Pause/scrub behavior (Part P)

`stepDisplayStabilization` is a pure function of `(previous, raw, timestampMs,
sourceFrameIndex, options)` — identical inputs always produce an identical
output (`stabilization-sanity` check 11/12). `directSelection` (used for the
first frame and available for seek/pause callers) resets the smoothed value
directly to the raw value with no animation, matching `presentationCamera.ts`'s
own established pattern for the same purpose. Real browser validation
(Section 17) confirms scrubbing forward then backward returns to the exact
same transform value, and pausing and re-reading twice produces identical
values.

## 14. Playback-rate behavior (Part Q)

`buildDisplayStabilizationPath` resolves the entire stabilization path once,
over every real source frame's own `(sourceFrameIndex, timeS)` — never wall-
clock time (verified: no `Date.now()`/`performance.now()` anywhere in the
module, `stabilization-sanity` check 13b). A scrub/seek to a given source
time always resolves to the exact same precomputed path entry regardless of
what playback rate was used to reach it, exactly mirroring
`buildPresentationCameraPath`'s own already-proven source-time design.

## 15. Before/after motion metrics (Part S)

Real data, real production module, real current `cameraPath` artifacts
(`scripts/phase-8-1b2b-motion-metrics.mjs`, `tmp/phase81b2b/motion-metrics.json`).
Fixed-anchor screen motion measured at two reference points (frame center,
translation-dominated; far corner (0.95,0.95), rotation-lever-arm-dominated),
relative to each anchor's own first-frame-in-window position:

| Benchmark | Window (frames) | RAW bg-center max (px) | STABILIZED bg-center max (px) | RAW far-anchor max (px) | STABILIZED far-anchor max (px) | Reduction |
|---|---|---:|---:|---:|---:|---:|
| Vanni 120 | 295–482 (188) | 6.60 | 2.59 | 8.04 | 1.94 | 61–76% |
| Vanni 240 | 560–1019 (460) | 6.60 | 1.20 | 6.47 | 0.77 | 82–88% |
| Vanni 60 | 145–232 (88) | 2.97 | 1.10 | 2.77 | 1.10 | 63% |

Frame-to-frame delta (the visually "jittery" component), p95:

| Benchmark | RAW translation p95 (px) | STABILIZED translation p95 (px) | RAW rotation p95 (°) | STABILIZED rotation p95 (°) |
|---|---:|---:|---:|---:|
| Vanni 120 | 0.235 | 0.059 (75% ↓) | 0.0064 | 0.0027 (58% ↓) |
| Vanni 240 | 0.384 | 0.026 (93% ↓) | 0.0063 | 0.0007 (89% ↓) |
| Vanni 60 | 0.113 | 0.050 (56% ↓) | 0.0017 | 0.0003 (82% ↓) |

**Stabilization lag** (how far the smoothed value trails the true resolved
value — the cost of smoothing): median well under 0.3 px for all three;
worst-case (at the single peak moment of each clip's real drift event) 8.17
px (Vanni 120), 6.94 px (Vanni 240), 2.14 px (Vanni 60) — i.e. at the single
worst instant, the stabilized view can lag the true position by up to ~8 px,
converging back down within the 0.6s time constant. No benchmark ever
triggered `intentional_motion` (Section 5) — all real drift stayed inside the
smoothed band throughout.

## 16. Vanni 240 validation

See Section 15 table. Largest relative reduction (82–93%) of the three,
consistent with Phase 8.1B-2A's finding that Vanni 240's real motion is a mix
of translation and a real ~0.16° rotation — both components are damped
coherently by the same filter.

## 17. Vanni 120 validation

See Section 15 table. The benchmark with the largest absolute real rotation
(~0.32°, Phase 8.1B-1); reduction is smaller in relative terms (61–76%) than
Vanni 240 because the underlying real motion itself is larger, but the
absolute stabilized peak (2.59 px) is comparable across all three benchmarks
— the filter normalizes the review experience regardless of how much real
motion a given clip happens to have.

## 18. Vanni 60 validation

See Section 15 table. Smallest real motion of the three (Phase 8.1A);
correspondingly the smallest absolute reduction, but still a genuine 63%
peak-motion reduction and a 56–82% reduction in frame-to-frame jitter.

## 19. Browser validation (Part U)

Real, authenticated Playwright session (`scripts/phase-8-1b2b-browser-check.mjs`)
against Vanni 120/240/60. For each benchmark, all 4 RAW/STABILIZED ×
Auto-Follow-OFF/ON combinations were exercised: the toggle buttons were
clicked and their `aria-pressed` state confirmed to flip correctly; the new
two-wrapper DOM structure (`stabilizationWrapperRef` containing
`followWrapperRef` containing `<video>` and the canvas) was confirmed present
with its live dataset diagnostic hooks (`data-stabilization-motion-class`,
`data-stabilization-divergence-px`) in every combination; **zero console
errors were introduced across all 12 combinations**; a resize (1400×1000 →
900×700) was performed with Stabilized View on and the structure remained
intact. Screenshots captured for all combinations plus before/after resize
under `tmp/phase81b2b/screenshots/`.

**Disclosed environment limitation** (consistent with, and not new relative
to, Phase 8.0B's and Phase 8.1A's own disclosed browser-check limitations):
this headless Chromium session never successfully decodes real pixels for
these benchmark `.mov` files — `video.videoWidth` stays `0` and
`requestVideoFrameCallback` never fires a real callback, even during active
`.play()` with `currentTime` genuinely advancing. Since the presentation tick
loop (an existing, Phase-6.6B-owned design, unchanged by this phase) prefers
`requestVideoFrameCallback`'s presented-time whenever the browser exposes
that API, the LIVE, per-frame dataset VALUE (e.g. the stabilization
correction actually changing as playback proceeds) could not be captured
changing in real time in this specific sandboxed environment. This is a
real, pre-existing, environment-only constraint — not a defect in this
phase's code — and the authoritative before/after quantitative evidence is
Section 15's real-data analysis, which calls the exact same production
module directly against real, current `cameraPath` data with no browser
involved at all.

## 20. Files changed

**New:**
- `src/lib/video/displayStabilization.ts` — the stabilization module
  (Sections 4–10).
- `scripts/phase-8-1b2b-stabilization-sanity.mjs` — deterministic tests.
- `scripts/phase-8-1b2b-motion-metrics.mjs` — real before/after motion
  metrics (Part S).
- `scripts/phase-8-1b2b-browser-check.mjs` — real browser validation (Part U).
- `docs/phase-8-1b2b-display-only-stabilized-review.md` (this file).

**Modified:**
- `src/components/video/OverlaySurface.tsx` — new `stabilizationWrapperRef`,
  `stabilizedView` state (default `true`) + toggle button, new
  `stabilizedViewRef`/`stabilizationRef`, extended the existing Auto-Follow
  rAF tick loop to also resolve and apply the stabilization correction
  (reusing the same `frameIndex`/source time already computed each tick), new
  outer wrapper `<div>` in the render tree. `VideoOverlay.tsx` and every
  scientific file: **untouched**.

## 21. Tests

`scripts/phase-8-1b2b-stabilization-sanity.mjs` — **19/19 PASS**, covering:
RAW-path identity (1/1b), input-signal purity (2, 3/3b), micro-motion
reduction (4), intentional-motion pass-through (5/5b), coherent rotation
handling with no artificial translation (6, 7/7b), determinism for
pause/seek (11/12) and playback-rate/source-time independence (13/13b), no
seek capability (14), and the real production wiring (2b, 8/9, 10).

## 22. Scientific regression

All rerun against current, live artifacts — zero failures, zero value changes:

| Suite | Result |
|---|---|
| Phase 6.2 world-lock (`phase-6-2-world-lock:sanity`) | 23/23 PASS |
| Phase 6.5 presentation camera (`phase-6-5-presentation-camera:sanity`) | 26/26 PASS |
| Phase 6.6B Part A (`phase-6-6b-part-a-instrumentation:sanity`) | 5/5 PASS |
| Phase 6.6B Part B (`phase-6-6b-part-b-presentation-sync:sanity`) | 18/18 PASS |
| Phase 6.6C (`phase-6-6c-authoritative-zone-visualization:sanity`) | 13/13 PASS |
| Phase 7.3B (`phase-7-3b-temporal-state:sanity`) | 11/11 PASS |
| Phase 8.0A forensic reconstruction (rerun) | 28/28 PASS |
| Phase 8.0B overlay-label sanity (rerun) | 32/32 PASS |
| Phase 8.1A drift-forensic sanity (rerun) | 33/33 PASS |
| Phase 8.1B-1 adjudication sanity (rerun) | 15/15 PASS |
| Phase 8.1B-2A cross-benchmark sanity (rerun) | 20/20 PASS |
| Phase 8.1B-2B stabilization sanity (new) | 19/19 PASS |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | succeeds (dev server safely stopped first, then restarted) |

## 23. Remaining limitations

- Live, dynamic, per-frame browser dataset capture was not possible in this
  session's sandboxed Chromium (Section 19) — the authoritative evidence is
  the direct real-data module run (Section 15), not a live browser capture.
- The `maxDivergencePx=58` "intentional motion" threshold was never exercised
  by any of the three real benchmarks' actual data (all real motion stayed
  well inside the smoothed band) — it is evidence-informed (set an order of
  magnitude above observed real drift) but not itself validated against a
  real large-motion clip, since none exists in the current benchmark set.
- Gav was not included in Section 15's metrics — its post-exit tail (Phase
  8.1A: 9 frames, ~0.15s, 0.05 px max drift) is too short to produce a
  meaningful stabilization comparison; the module handles it identically
  (nothing to smooth), just with no evidence worth tabulating.
- Fullscreen was not separately exercised in this session (resize was); the
  stabilization wrapper's CSS is dimension-agnostic (percentage-based,
  matching `followTransform`'s own established pattern) so no
  fullscreen-specific behavior is expected, but this was not directly
  observed.
- The exact perceptual/UX quality of the stabilization (does it *feel* right
  to a human reviewer) was not evaluated by a human viewer in this session —
  only the quantitative motion-reduction evidence (Section 15) and the
  absence of introduced artifacts (shear, drift, snap — Sections 8/10) were
  verified.

## 24. Phase status

CLOSED.

## 25. Roadmap status

No roadmap percentage claimed or updated (unweighted presentation phase,
consistent with Phases 6.5/6.6B/8.1A/8.1B-1/8.1B-2A precedent). Overall
stationary roadmap completion remains **29.5%**.

## 26. Git status

- `HEAD` unchanged; no commit made.
- No push, no `db:reset`, no database mutation.
- New files: `src/lib/video/displayStabilization.ts`, four scripts under
  `scripts/`, this report under `docs/`.
- Modified: `src/components/video/OverlaySurface.tsx` only (additive: new
  refs/state/wrapper/tick-loop extension; every existing line of Auto Follow
  logic is unchanged). `VideoOverlay.tsx` and all scientific files: zero
  changes.
- `tmp/phase81b2b/` (motion metrics, browser-check results, screenshots) is
  gitignored (`/tmp/` in `.gitignore`), matching all prior phase precedent.
- Regression build procedure followed the task's explicit safety
  instruction: the live `npm run dev` process was stopped before `npm run
  build` ran, and cleanly restarted afterward (verified `200` on `/` and
  `/login` post-restart) — no `.next` corruption.
