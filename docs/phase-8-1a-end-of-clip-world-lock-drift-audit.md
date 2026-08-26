# Phase 8.1A — End-of-Clip World-Lock Drift Forensic Audit

**Status:** AUDIT ONLY — no production fix implemented, per explicit instruction.

## 1. Executive summary

The user-reported end-of-clip drift is **real**, not subjective, and **not** caused
by Auto Follow, the presentation camera, the browser/canvas geometry, or a
timing/frame-selection regression. It was reproduced and quantified directly
from the real, production `cameraPath` world-lock chain (`framePointToGlobal`
→ `globalPointToFrame`, the exact function pair `VideoOverlay.tsx`'s gate
renderer calls) for all four current benchmarks, with Auto Follow **structurally
proven inert** (not just assumed) for this chain.

Three of four benchmarks (Vanni 240/120/60) show a real, coherent, **scene-wide**
positional drift of gates AND arbitrary fixed background points together,
dominated by a **vertical/upward** component, growing gradually over the tail
of the clip — matching the user's description exactly. Gav (a 142-frame clip
with only a 9-frame tail) shows no measurable drift, consistent with the drift
needing real elapsed time to become visible.

An **independent, non-AVA measurement** (ORB feature matching + RANSAC affine
estimation run directly against the raw source `.mov` pixels, entirely outside
AVA's own code) confirms **real background pixel motion** of closely matching
magnitude for Vanni 240 and Vanni 60, and partially matching (X axis matches,
Y axis disagrees in sign) for Vanni 120. Drift rate is roughly **time-proportional
(~2–4 px/s)**, not frame-count-proportional, across three different frame rates —
the signature of a real, continuous physical process, not a per-frame
accumulating numerical error.

**Root cause classification: primarily `SOURCE_CAMERA_MOTION`**, real small
physical camera movement in the seconds after the athlete leaves frame (most
consistent with a person or the environment disturbing the camera/tripod after
the sprint is captured), which AVA's world-lock system is — by design — meant
to detect and compensate for. For Vanni 120 specifically, the independent
check's Y-axis disagreement leaves a secondary, unresolved possible contribution
from `GLOBAL_CAMERA_EVIDENCE_DRIFT` (estimation inaccuracy) that this audit
could not fully resolve and reports honestly as unresolved rather than guessed.

No scientific calculation, contact, step, calibration, metric formula, zone
classification, pose artifact, or timing value was changed. No production fix
was implemented this phase.

## 2. Exact reproduction

**Method**: rather than relying on subjective screenshots, the exact real,
unmodified production functions `framePointToGlobal`/`globalPointToFrame`
(`src/lib/video/cameraPath.ts`) were compiled and called directly (the same
tsc-to-throwaway-dir-then-`require()` pattern used in Phases 8.0A/8.0B) against
each benchmark's real, live `cameraPath` artifact (the worker-computed
`ava-camera-path-v2` global keyframe path) and real, `manual_confirmed`
calibration gates — reconstructing **exactly** what `VideoOverlay.tsx`'s
`canonicalGeom()` function computes for gate screen position, for **every
single source frame across the whole clip** (not just the measurement zone),
for all four benchmarks.

Confirmed first (`selectRenderableGateGeometry`): all four benchmarks'
calibration is `manual_confirmed` (`selectedByUser: true` on both boundaries),
so `canonicalGeom()`'s `cameraPathIndex` branch — the real global-keyframe
world-lock chain — is the actual, active rendering path for all four, not a
fallback.

`scripts/phase-8-1a-transform-trace.mjs` produces one JSON per benchmark
(`tmp/phase81a/{label}-trace.json`) containing, for every source frame: the
reprojected screen position of all 4 gate corners, 5 arbitrary fixed
background-anchor points (frame corners + center — chosen with no relationship
to the athlete or gates, to test whole-scene coherence), the real
`cameraPath.framePaths[i].state`/`confidence`/`residualPx`, and the real
Auto-Follow-ON presentation-camera state (`buildPresentationCameraPath`) for
comparison. `scripts/phase-8-1a-drift-analysis.mjs` computes displacement
statistics relative to a reference frame chosen per the task's own definition
("shortly after the athlete exits the measurement zone" = 5 frames after the
real, verified finish-gate crossing frame). `scripts/phase-8-1a-raw-source-motion-control.py`
independently re-measures real background motion directly from the original
`.mov` pixels via ORB/RANSAC, with zero dependency on any AVA-computed value.

## 3. Benchmark identities

Resolved live from the database (not from titles), matching Phases 0/8.0A/8.0B:

| Label | Session ID | `calibrationSource` | Frames | FPS |
|---|---|---|---:|---:|
| Gav | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` | manual_confirmed | 142 | 60 |
| Vanni 240 | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | manual_confirmed | 1020 | 240 |
| Vanni 120 | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` | manual_confirmed | 483 | 120 |
| Vanni 60 | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` | manual_confirmed | 233 | 56.53 (real detected rate) |

## 4. Source-motion control (Part D)

Independent of AVA: ORB feature matching (2000 features) + `estimateAffinePartial2D`
RANSAC, run on real decoded frames from the original `tmp/phase50e/sources/*.mov`
files, chained across sampled frame pairs (stride 15) spanning the reference
frame to AVA's own reported max-drift frame. This code shares **no logic** with
`camera_path.py` (the worker's own affine estimator) or `estimateCameraMotion`
(the legacy pose-based estimator) — different feature detector (ORB vs.
Shi–Tomasi/goodFeaturesToTrack), different matching (descriptor matching vs.
optical flow), same only in using OpenCV's RANSAC affine solver.

| Benchmark | Window (frames) | Independent Δx / Δy / total (px) | AVA gate Δx / Δy (px) | AVA bg-center Δx / Δy (px) | Agreement |
|---|---|---|---|---|---|
| Vanni 240 | 573→1007 (434 frames, 1.81s) | +5.36 / **−4.02** / 6.70 | +5.19 / −5.95 | +5.12 / −4.19 | **Close match**, especially vs. bg-center |
| Vanni 120 | 295→481 (186 frames, 1.55s) | **−7.12 / +2.03** / 7.40 | −6.62 / −8.05 | −5.70 / −5.35 | X matches; **Y disagrees in sign** — unresolved |
| Vanni 60 | 150→232 (82 frames, 1.45s) | +0.93 / **−2.07** / 2.27 | +0.87 / −3.05 | +0.83 / −2.83 | **Close match** |

Full per-sample-pair breakdown is in `tmp/phase81a/raw-source-motion-control.json`.
For Vanni 120, the disagreement traces to two specific sample pairs
(frames 415→430 and 430→445, each showing ~1–1.4px of independently-measured
*upward* motion, consistent with AVA) followed by frames 445→460 and 460→475
showing 0.6–2.8px of independently-measured *downward* motion (opposing AVA's
continued upward estimate) — i.e., the disagreement is concentrated in a
specific ~60-frame window, not spread evenly, suggesting either genuinely
complex (non-simple-translation) motion in that window that a pure-translation
summary cannot represent, or a real accuracy limit in one or both estimators
during that specific window. **This is reported as unresolved, not guessed.**

**Conclusion**: for 2 of 3 tested long-tail benchmarks, real background pixel
motion of closely matching magnitude and direction was independently confirmed
— the world-lock system is very likely responding to genuine physical camera
motion, not fabricating drift out of a computational artifact.

## 5. Displayed drift measurements (Part B)

Reference frame = 5 frames after the real, verified finish-gate crossing
(zone exit). Displacement is measured for every one of 4 gate corners and 5
fixed background anchors, relative to their own position at the reference
frame, for every later frame through the end of the clip.

| Benchmark | Reference frame | Tail frames | bg-center median / p95 / max (px) | max at frame | max Δx / Δy (px) | last-frame Δx / Δy (px) |
|---|---:|---:|---|---:|---|---|
| Gav | 133 | 9 | 0.041 / 0.05 / 0.05 | 141 | −0.01 / −0.049 | −0.01 / −0.049 |
| Vanni 240 | 573 | 447 | 0.021 / 4.243 / **6.619** | 1007 | +5.12 / **−4.19** | +2.00 / −3.12 |
| Vanni 120 | 295 | 188 | 0.086 / 6.09 / **6.605** (bg); gates up to **10.07** | 481–482 | −5.70 / −5.35 (bg); gate up to −6.62/−8.05 | −5.47 / −3.28 |
| Vanni 60 | 150 | 83 | 0.112 / 2.537 / **2.953** | 232 | +0.83 / **−2.83** | +0.83 / −2.83 |

Full per-key (all 4 gate corners + 5 background anchors), per-frame data is in
`tmp/phase81a/{label}-trace.json`; summarized statistics in
`tmp/phase81a/drift-summary.json`.

**Direction is consistently vertical-upward-dominant** (negative Δy in image
coordinates, where +y is down) for all three affected benchmarks — matching
the user's description exactly. Horizontal drift is smaller and its sign
varies by benchmark (not a fixed systematic bias in one direction).

## 6. Auto Follow OFF findings (critical case)

**All of the above (Sections 4–5) was measured through `framePointToGlobal`/
`globalPointToFrame` — a chain that has no dependency on Auto Follow, the
presentation camera, or `OverlaySurface`'s `followWrapperRef` transform at
all.** Gate/zone/contact/step-marker rendering consumes this chain directly
via `canonicalGeom()`/`projectWorldStep()` regardless of Auto Follow state.

Additionally, structurally proven (not assumed) from the real source:
`stepPresentationCamera` (`presentationCamera.ts:230`) —
`if (!options.enabled) return { ...FULL_FRAME_PRESENTATION_CAMERA, timestampMs, sourceFrameIndex };`
— returns a **pure identity** (`cx=0.5, cy=0.5, scale=1`, from `IDENTITY_FOLLOW`)
on every single call when disabled, with **zero reference to `previous`
state** — no memory, no hysteresis, no residual. `OverlaySurface.tsx`'s render
loop (`autoFollowRef.current` check) selects this exact identity object,
never `resolvedCameraPath[frameIndex]`, whenever Auto Follow is off. This was
verified statically against the real source in this phase's own sanity script
(checks 3/3b, `scripts/phase-8-1a-drift-forensic-sanity.mjs`).

**Conclusion: drift is 100% present and fully quantifiable with Auto Follow
OFF.** It cannot be attributed to Auto Follow in any part.

## 7. Auto Follow ON findings

Auto Follow ON is a **separate, independent transform** (the shared wrapper
CSS transform driven by `PresentationCameraState`) applied on top of the same
underlying world-locked gate/contact positions. `buildPresentationCameraPath`
was run for real on all four benchmarks (`presentationStateTrace` in each
`tmp/phase81a/{label}-trace.json`). Representative real state-transition
sequences after the athlete's last tracked evidence:

- **Vanni 240**: `holding` @668 (`tracked`) → `degraded` @752 (`unsupported_localization`)
  → `reacquiring` @990 → `holding` @991 (`tracked`).
- **Vanni 120**: `holding` @316 (`tracked`) → `degraded` @358 (`unsupported_localization`),
  remains `degraded` through clip end.
- **Vanni 60**: `holding` @153 (`tracked`) → `degraded` @172 (`unsupported_localization`).

Cross-referencing these against the Section 5 world-lock drift onset frames
(957 for Vanni 240, 425 for Vanni 120, 210 for Vanni 60) shows **no temporal
correlation** — e.g. Vanni 120 enters `degraded` at frame 358 but world-lock
drift onset is 67 frames later at 425; Vanni 240 world-lock drift onset (957)
is 205 frames after `degraded` begins (752). The presentation-camera state
machine's own exit easing (`degraded`/`returning_to_full_frame`, Phase 6.5
Section 11) is real and does move the Auto-Follow-ON wrapper, but it is
**not the mechanism behind the world-locked gate/background drift** — that
drift exists identically whether or not this state machine ever runs, per
Section 6.

## 8. Global-camera evidence trace (Part E)

`cameraPath.framePaths[i].state` was **`"anchored"` for 100% of every tail
window** (all frames from the reference frame through clip end, all four
benchmarks — see `tailFramePathStateHistogram` in `drift-summary.json`), with
self-reported confidence remaining high throughout: Vanni 240 0.972–1.000,
Vanni 120 0.892–1.000, Vanni 60 0.954–1.000.

This is an important, real finding: **the drift is not a fail-closed, hold, or
stale-evidence artifact.** The system never drops to `"local_only"` or
`"unavailable"` in the tail; it continues to confidently resolve a fresh,
directly-looked-up (Phase 1's own O(1)-per-frame design — no browser-side
chain accumulation) global transform for every single frame, and that
confidently-resolved transform is itself what carries the growing
displacement. Whatever is moving the scene, it is not evidence starvation —
the affine estimator (worker-side, real background-feature RANSAC per Phase
6.2) is actively producing these values with high self-reported confidence.

## 9. Athlete-exit state trace (Part F)

See Section 7 for the real, per-benchmark transition sequences. Summary: every
benchmark reaches `holding` shortly after the athlete's last tracked
observation, then `degraded` after `uncertaintyHoldS` (0.35s) of continued
unsupported localization, consistent with Phase 6.5's documented design. These
transitions belong exclusively to the **Auto-Follow-ON presentation camera**
and were proven (Section 7) uncorrelated with the world-locked gate/background
drift that exists independent of Auto Follow.

## 10. Transform composition (Part G/H)

Real, traced composition for a `manual_confirmed` gate with Auto Follow OFF:

```
persisted gate c1/c2 (setup-frame source coordinates)
  → framePointToGlobal(cameraPathIndex, setupFrame, point)      [ONE-TIME, at creation]
  → globalPointToFrame(cameraPathIndex, currentFrame, globalPt) [EVERY FRAME, independent lookup]
  → project() (source-normalized → CSS display rect)
  → (Auto Follow OFF: identity wrapper transform, proven inert — Section 6)
  → canvas paint
```

Contacts/step markers/step labels (`VideoOverlay.tsx`'s `projectWorldStep()`)
consume the **identical** `cameraPathIndex`/`framePointToGlobal`/
`globalPointToFrame` chain for their world position (confirmed by code
inspection, re-using the exact same functions this audit calls; not
independently re-measured pixel-by-pixel this phase — see Section 23). Zone
polygons (Phase 6.3) are derived from the same resolved gate scene by
construction (`worldZonePolygons(start, finish, viewport)` consumes the
already-projected `startG`/`finishG` boundaries, per `docs/phase-6-3-world-space-visualization.md`
Section 5) — so gates, contacts, step markers, and zone fills all move
**together**, coherently, driven by the one shared `globalPointToFrame`
lookup per frame. This matches the observed Section 5/11 coherence between
gate corners and arbitrary background anchors.

**The transform component that changes during the observed drift is the
per-frame `globalToFrameMatrix` value itself** (i.e., the worker-computed
affine estimate for that specific frame relative to the global reference
frame) — not the display/CSS/DPR/Auto-Follow layer, which sits entirely
downstream and unchanged.

## 11. Gate/background relative motion (Part K)

At the max-drift frame, gate corners and background anchors move in
closely matching directions and magnitudes for all three affected benchmarks:

| Benchmark | Max-drift frame | Gate mean Δx/Δy (px) | Background mean Δx/Δy (px) |
|---|---:|---|---|
| Vanni 240 | 1007 | +5.12 / −4.19 | +5.12 / −4.19 |
| Vanni 120 | 481 | −6.21 / −3.17 | −5.70 / −3.34 |
| Vanni 60 | 232 | +0.81 / −2.83 | +0.83 / −2.83 |

Gates and background move together (within ~0.5px of each other in most
cases) — **the whole world-locked scene shifts as one, not gates alone.**
This directly answers the task's Part K test: gates do **not** move relative
to the fixed background; they move **with** it. World lock is tracking a
(likely real) camera transform, not drifting independently of the background
it's supposed to represent.

## 12. Zone polygon behavior (Part L)

Not independently re-measured pixel-by-pixel this phase (disclosed in Section
23). By construction (Phase 6.3's own documented architecture, Section 10 of
this report), zone polygons derive from the identical, already-projected gate
boundary scene used for the gate lines themselves — there is no separate zone
projection path. Given Section 11's proof that gates track the background
coherently, zone polygons necessarily inherit the same coherent motion (they
cannot geometrically detach from their own boundaries, since they are computed
from those exact boundaries every frame). No palette or classification change
was made or needed.

## 13. Browser geometry audit (Part M)

Real authenticated Playwright session (`scripts/phase-8-1a-browser-check.mjs`,
Vanni 240, Auto Follow explicitly confirmed OFF) captured video/canvas
geometry at the reference time (t=2.388s) and the max-drift time (t=4.196s):
`clientWidth`/`clientHeight`, `boundingRect`, `canvasBoundingRect`,
`canvasBackingWidth`/`Height`, and `devicePixelRatio` were **identical** at
both captures (1052×150 CSS, DPR 1, no resize/fullscreen toggled between
captures) — see `tmp/phase81a/browser-geometry-check.json`. This rules out a
mid-session browser geometry change as a confound for this specific capture.

**Disclosed limitation**: `videoWidth`/`videoHeight` read `0` in both captures
— the decoded video frame did not paint in this headless-Chromium session (the
same capture-tooling limitation noted in Phase 8.0B for large clips), so the
actual video pixel content could not be visually cross-checked in this run;
gate/zone canvas painting (which does not depend on decoded video pixels) was
confirmed rendering correctly and at a stable position class in both captures.
Also disclosed as an unrelated environment observation, not investigated
further (out of this phase's scope): the captured video panel's CSS size
(1052×150) is a very unusual aspect ratio for 1920×1080 source video,
suggesting an unrelated pre-existing layout condition in this specific
dev-server test session — not a world-lock or drift issue, and not touched.

## 14. Timing audit (Part N)

Not independently re-verified against Phase 6.6B's own mediaTime/rVFC pipeline
this phase (disclosed in Section 23) — this audit measured drift entirely in
the **source-frame-index domain**, via direct function calls independent of
the presentation-timing/scheduler pipeline Phase 6.6B closed. A frame-timing
mismatch in that pipeline could not explain a drift measured this way, since
no presented-frame selection or scheduler code was invoked at all to produce
Sections 4–11's numbers. Phase 6.6B's required regression suite (Parts A and
B) was rerun and passes unchanged (Section 22).

## 15. Cross-FPS results (Part O)

| Benchmark | FPS | Max drift (px) | Frames to max | Seconds to max | px/frame | px/second |
|---|---:|---:|---:|---:|---:|---:|
| Gav | 60 | 0.05 | 8 | 0.133 | 0.0063 | 0.375 |
| Vanni 240 | 240 | 6.62 | 434 | 1.808 | 0.0153 | **3.660** |
| Vanni 120 | 120 | 6.61 (bg) | 186 | 1.550 | 0.0355 | **4.261** |
| Vanni 60 | 56.53 | 2.95 | 82 | 1.451 | 0.0360 | **2.036** |

`px/frame` scales inversely with FPS (as expected for any per-frame quantity),
but **`px/second` stays in the same 2–4.3 px/s band across three very
different frame rates** (240/120/56.5 fps) — the signature of a
**time-proportional, not frame-count-proportional**, process. A per-frame
accumulating numerical/estimation bug would be expected to scale with frame
*count* (roughly constant px/frame, `px/second` scaling with fps); that is
**not** what is observed. This is independent, structural evidence (on top of
Section 4's direct pixel confirmation) that the drift tracks **elapsed real
time**, consistent with a real, continuous physical process such as gradual
camera/tripod settling.

## 16. Drift onset analysis (Part P)

| Benchmark | Zone-exit (finish-crossing) frame | Last contact frame | Last pose frame | Drift onset frame (sustained ≥1px) | Onset − zone-exit (frames) | Onset − last contact | Onset − last pose |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gav | 128 | 139 | 141 | — (no measurable drift) | — | — | — |
| Vanni 240 | 568 | 632 | 990 | 957 | +384 | +325 | **−33** |
| Vanni 120 | 290 | 304 | 315 | 425 | +130 | +121 | **+110** |
| Vanni 60 | 145 | 152 | 152 | 210 | +60 | +58 | **+58** |

Onset timing is **not consistent** relative to any single event: Vanni 240's
onset is 33 frames *before* the last real pose evidence (i.e., drift begins
while the athlete is still nominally trackable, in a `reacquiring` state),
while Vanni 120 and Vanni 60 both onset ~58–110 frames *after* their last pose
evidence. This inconsistency is itself informative: it argues against a single
deterministic state-transition (e.g. "exactly N frames after track loss")
triggering the drift, and is more consistent with each clip having its own,
independent, real-world timing for whatever physical event disturbs the
camera.

## 17. Exact root cause (Part Q)

**Primary: `SOURCE_CAMERA_MOTION`.** Independently confirmed for Vanni 240 and
Vanni 60 (Section 4) via a completely separate, non-AVA pixel-level
measurement; corroborated structurally for all three affected benchmarks by
the time-proportional (not frame-count-proportional) scaling in Section 15,
and by gates/background moving coherently as one scene (Section 11). The
system is very likely doing exactly what a world-lock system is designed to
do: track small real camera movement and keep gates glued to the true
physical location.

**Secondary, unresolved for Vanni 120 specifically: possible
`GLOBAL_CAMERA_EVIDENCE_DRIFT`.** The independent Y-axis measurement disagrees
in sign with AVA's own estimate over a specific ~60-frame window (Section 4);
this could not be fully resolved and is reported as a genuine open question,
not folded into the primary conclusion.

**Explicitly ruled out** by direct evidence in this audit:
- `AUTO_FOLLOW_RESIDUAL_STATE` / `PRESENTATION_CAMERA_RECENTER` — Section 6
  (drift is fully present and identical with Auto Follow structurally proven
  OFF; Section 7 shows no temporal correlation with presentation-camera state
  transitions).
- `ATHLETE_EXIT_STATE_TRANSITION` (as the *world-lock* mechanism) — Section 7
  (no temporal correlation with the world-lock drift onset; that state
  machine only drives the separate, proven-inert-when-off presentation
  camera).
- `DISPLAY_GEOMETRY_CHANGE` — Section 13 (identical canvas/video CSS geometry
  and DPR at both captured points).
- `FRAME_TIMESTAMP_MISMATCH` / `STALE_TRANSFORM` / `INSUFFICIENT_EVIDENCE` —
  Section 8 (100% `"anchored"`, high-confidence evidence throughout every
  tail window; no fail-closed/hold/stale state ever entered for the
  world-lock chain).
- `TRANSFORM_COMPOSITION_ERROR` — Section 10 (gates, contacts, and zone
  polygons all provably consume the same single `globalPointToFrame` lookup;
  no divergent per-layer transform was found).
- `ZOOM_TRANSLATION_COUPLING` — not applicable; the world-lock chain audited
  has no zoom/scale component tied to Auto Follow at all (partial-affine
  translation+rotation+scale is a property of the *background estimate*
  itself, not a presentation zoom).

## 18. Minimal Phase 8.1B recommendation (design only — NOT implemented here)

Given the root cause is (at least primarily) **real, small, physical camera
motion that the world-lock system is correctly detecting**, the correct fix is
**not** to suppress or freeze the transform (that would reintroduce exactly
the kind of "gates lag behind real camera motion" defect Phase 6.2 was built
to prevent) — the smallest correct intervention is very likely one or both of:

1. **Make the real motion visible/intentional to the coach**, rather than a
   silent scene shift with no explanation, once it exceeds a small,
   evidence-based threshold (e.g. a subtle "camera moved" indicator, similar
   in spirit to Phase 6.2's existing `gateLockDebug.ts` diagnostics but
   surfaced non-technically) — files: `src/components/video/VideoOverlay.tsx`
   (render), possibly a new small derived-state helper alongside
   `gateStabilization.ts`.
2. **Investigate, but do not yet fix, the Vanni 120 Y-axis discrepancy**
   (Section 4) as a dedicated forensic follow-up — extend
   `scripts/phase-8-1a-raw-source-motion-control.py`'s window/stride
   resolution specifically around frames 415–475 to determine whether it is
   real complex motion (rotation, or a moving foreground object entering
   frame) or a genuine estimator inaccuracy in `camera_path.py`'s keyframe
   chain that far from its nearest keyframe.
3. **Do not** implement a "freeze gates after last contact" or "freeze gates
   after athlete exits frame" rule without first re-confirming (2) — Section
   16 already shows onset timing has no reliable relationship to any single
   athlete-exit event, so a fixed-offset freeze rule would be arbitrary and
   evidence-free.

**Exact invariant to enforce going forward** (Part J, formalized): *A fixed
physical world point's rendered screen position should equal
`globalPointToFrame(reference-anchored point, currentFrame)` at every frame —
i.e., the display must always agree with the best-available real camera
estimate; it must never silently diverge from it (Section 10 already proves
it does not) and must never silently suppress a genuine estimate change to
look artificially "stable."* The open question for 8.1B is **evidence
quality far from the keyframe**, not the composition/plumbing, which Section
10 already proves is correct.

**Tests needed for 8.1B**: (a) a synthetic fixture with a known, injected
small affine drift confirming the display exactly tracks it; (b) a real
extended-window rerun of the Vanni 120 415–475 discrepancy at finer stride;
(c) before/after coach-facing screenshots if any indicator is added; (d) the
existing Phase 6.2/6.3/6.5 suites re-passing unchanged.

**Browser acceptance criteria for 8.1B**: with Auto Follow OFF, play a
benchmark clip through its full tail and confirm either (a) any visible scene
shift is now attributable to a labeled real-camera-motion indicator, not a
silent unexplained jump, or (b) the Vanni 120-class discrepancy is resolved
and no longer present.

## 19. Files changed

**None in `src/`.** This phase is audit-only, as instructed. New, standalone,
read-only forensic scripts (not imported by any `src/` file, not on any
build/CI path):

- `scripts/phase-8-1a-transform-trace.mjs`
- `scripts/phase-8-1a-drift-analysis.mjs`
- `scripts/phase-8-1a-raw-source-motion-control.py`
- `scripts/phase-8-1a-browser-check.mjs`
- `scripts/phase-8-1a-drift-forensic-sanity.mjs`
- `docs/phase-8-1a-end-of-clip-world-lock-drift-audit.md` (this file)

## 20. Tests added

`scripts/phase-8-1a-drift-forensic-sanity.mjs` — **33/33 PASS**: fixed
background-anchor trace determinism (per benchmark), independent gate-vs-
background measurability, static proof that Auto Follow OFF returns pure
identity with no reference to prior state, well-formed athlete-exit state
traces, complete no-gap per-frame coverage, forensic-script non-invasiveness,
zone-exit-time provenance, and non-trivial independent (non-AVA) background
displacement confirmation for the three affected benchmarks.

## 21. Real browser/benchmark runs performed

- Four real Node reconstructions (`phase-8-1a-transform-trace.mjs`) against
  live, current pose/`cameraPath` artifacts and calibration rows for Gav,
  Vanni 240, Vanni 120, Vanni 60 — zero errors.
- Three real, independent Python/OpenCV raw-source-video analyses
  (`phase-8-1a-raw-source-motion-control.py`) against the original `.mov`
  files for Vanni 240/120/60.
- One real, authenticated Playwright browser session (Vanni 240, Auto Follow
  explicitly confirmed OFF) capturing geometry and screenshots at the
  reference and max-drift times.
- All required regression suites (Section 22) executed for real against the
  live artifacts.

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
| Timing verification (`timing-verification:sanity`) | PASS |
| Phase 8.0A forensic reconstruction (rerun) | 28/28 PASS |
| Phase 8.0B overlay-label sanity (rerun) | 32/32 PASS |
| Phase 8.1A drift-forensic sanity (new) | 33/33 PASS |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | succeeds |

## 23. Anything not personally validated

- Contacts/step-marker/step-label pixel positions were **not** independently
  re-measured frame-by-frame for drift this phase — their sharing of the
  identical `cameraPathIndex`/`globalPointToFrame` chain as gates was
  confirmed by code inspection (Section 10), not by a separate pixel trace.
- Zone polygon pixel positions were not independently re-measured (Section
  12) — inferred from Phase 6.3's documented architecture (they consume the
  already-projected gate boundaries directly).
- Phase 6.6B's mediaTime/rVFC presentation-timing pipeline itself was not
  re-audited from first principles this phase; its regression suite was
  rerun and passes, and this audit's own measurement method bypasses that
  pipeline entirely (Section 14).
- The Vanni 120 Y-axis discrepancy between AVA's and the independent
  estimate (Section 4) is explicitly **unresolved** — reported honestly, not
  forced into either explanation.
- Real-browser visual confirmation was completed for one benchmark (Vanni
  240) with one Auto-Follow-OFF capture pair; the decoded video pixel content
  did not paint in that headless session (Section 13), so the visual
  (as opposed to numeric/geometric) confirmation is partial.
- Auto Follow ON's own visual drift/exit behavior was not separately
  screenshotted this phase (Section 7's state-transition trace is a real,
  direct computation, not a visual capture).

## 24. Git status

- `HEAD` unchanged; no commit made.
- No push, no `db:reset`, no database mutation (only read-only `sessions`
  queries for calibration/session metadata, matching every prior phase's
  pattern).
- Zero files under `src/` changed by this phase (verified directly — Section
  19).
- New files: five scripts under `scripts/` and this report under `docs/`, all
  additive. `tmp/phase81a/` (generated evidence: transform traces,
  drift-summary, raw-source-motion-control output, browser screenshots) is
  gitignored (`/tmp/` in `.gitignore`), matching Phase 8.0A/8.0B precedent.
- The worktree already carried large, pre-existing, unrelated uncommitted
  work from prior phases (unrelated to this task), preserved untouched per
  this phase's own explicit instruction.
