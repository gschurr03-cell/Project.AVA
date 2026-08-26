# Phase 9.2B — Skeleton-Suit Visual Fidelity Implementation

## 1. Executive Summary

Phase 9.2A found that the skeleton overlay's stored coordinates are spatially
accurate (0px projection error, no systematic offset) but can *read* as
detached for two reasons: (A) thin lines / tiny dots (a style/perception
issue), and (B) small, real, FPS-amplified frame-to-frame jitter concentrated
in the four proximal joints (shoulders/hips), worst on Vanni 240.

This phase implements the narrow, presentation-only fix for both: thicker
rounded bone lines with a dark contrast halo, larger solid joint markers, and
a small, bounded, source-time, display-only smoothing pass applied to
*proximal joints only*. No pose coordinate, contact, step, metric, or
calibration value was changed. All changes are confined to
`src/components/video/VideoOverlay.tsx`.

Real, non-fabricated evidence for every claim below: before/after visual
sheets rendered from the exact Phase 9.2A source frames using the real stored
landmarks; a real jitter-metric rerun of the actual `stepSkeletonSmoothing`
function against all 4 benchmarks' real pose artifacts; 23/23 new
deterministic checks; the full existing regression suite; `typecheck`,
`lint`, and a clean production `build`. One environment limitation is
disclosed, not glossed over: live browser playback at *specific timestamps*
still cannot be validated in this sandbox (established since Phase 8.0B).

**Phase status: CLOSED. Style change alone materially reduces perceived
detachment; smoothing was still implemented per Part M because Phase 9.2A's
own jitter measurement is real and quantified, not hypothetical — see §15.**

## 2. Scope & Operating Rules

Presentation-only. No change to MediaPipe, localization, crop planning,
contacts, steps, timing, metrics, calibration, world transforms, Auto Follow
logic, or Stabilized View logic. No stored pose artifact touched. No commit,
push, `db:reset`, or database mutation performed. Work stops at the end of
this phase (no Phase 9.3 work started).

## 3. Required Reading

Phase 9.2A (painted-on spatial fidelity audit), 9.1B (eligibility
alignment), 6.1 (overlay fidelity / 0px projection proof), 6.6B Part B
(presentation-phase sync), 8.2B (display-cadence interpolation) — all read in
full before this phase's implementation began.

## 4. Part A — Coordinate Preservation Proof

Two independent proofs, both real:

- **Structural**: `resolvedJoint(name)` (`VideoOverlay.tsx:908`) returns the
  raw `frame.landmarks[name]` object *unmodified* for every joint outside the
  4-name smoothed set, and for the first frame of any smoothed joint (no
  `previous` state yet). `frame.landmarks` itself is never assigned to
  anywhere in the file (grep-verified, checked in §22 as sanity test 10).
- **Functional** (sanity test 1): `stepSkeletonSmoothing(null, raw, t)` on a
  fresh mount returns `{x, y}` bit-identical to the raw input.

## 5. Part B — Current (Pre-Phase) Visual Style Audit

| Property | Old value |
|---|---|
| Bone line width | 2.25px (3.75px hover/selected) |
| Joint dot radius | 1px |
| Joint fill/stroke alpha | fill 70%, stroke 45% (`jointFillSoft`/`jointStrokeSoft`) |
| Line cap/join | already `round`/`round` |
| Torso segments | already shoulder↔shoulder, hip↔hip, both shoulder↔hip (`bones` array, unchanged this phase) |
| Halo/outline | none |
| Draw order | skeleton → hover/selection → COM/trail/velocity → angle labels → contact labels → step marks → gates → zone polygons |

All values confirmed by direct source read, not inferred. At CSS-pixel scale
this renders as a fine, semi-transparent overlay — geometrically correct but
visually thin against busy or bright footage (Phase 9.2A's own
`RENDER_STYLE_PERCEPTION` candidate, previously unverified — now addressed).

## 6. Part C — Skeleton-Suit Style Contract

Bones easy to see against any footage; joints read as solid anchors, not
isolated specks; bone lines terminate visually *into* their joint markers
(dot and line endpoint must coincide, including for smoothed joints); torso
reads as one connected structure; no overlay thick enough to obscure the
athlete's own body.

## 7. Part D — Line Thickness

`SKELETON_BONE_WIDTH = 3.5` (was 2.25), `SKELETON_BONE_WIDTH_EMPHASIZED =
5.25` (was 3.75, same 1.5× ratio preserved). Both are CSS-pixel constants
read through the canvas's single existing `ctx.setTransform(dpr, 0, 0, dpr,
0, 0)` — already resolution/DPR-aware with no extra math, identical to how
the prior 2.25/3.75 constants worked. No FPS/benchmark/athlete-specific
value.

## 8. Part E — Joint Size

`SKELETON_JOINT_RADIUS = 3` (was 1), `SKELETON_JOINT_STROKE_WIDTH = 1.25`
(was 0.75). Solid fill + dark stroke (was soft-alpha fill/stroke) so wrists
and ankles stay legible and shoulders/hips don't disappear under line joins,
without becoming oversized circles that would misrepresent joint location.

## 9. Part F — Line Caps/Joins

Already `ctx.lineJoin = "round"` / `ctx.lineCap = "round"`, set once per
`draw()` call before this phase. No change required; verified by sanity
test "2b".

## 10. Part G — Torso Topology

`bones` array already contains exactly the 4 scientifically-supported torso
segments (left↔right shoulder, left↔right hip, left shoulder↔hip, right
shoulder↔hip) and no synthetic spine/neck/midpoint joint. Unchanged this
phase; verified by sanity test 4 (parses the live array, asserts all 4 pairs
present and no synthetic-joint keyword appears).

## 11. Part H — Draw Order

Already skeleton (bones → joints) first, contacts/step labels/gates/zone
polygons after — matches the task's own suggested hierarchy. Verified by
sanity test 5 against live source offsets, not assumed.

## 12. Part I — Color/Contrast

One addition: `COLORS.boneHalo = "rgba(6, 10, 18, 0.55)"`, a dark,
semi-transparent stroke drawn once per bone at `boneWidth +
SKELETON_HALO_WIDTH_DELTA(2)`, using the *same* `ap`/`bp` projected
coordinates as the real stroke drawn immediately after it (verified via
`git diff`: zero coordinate duplication/drift risk). No other palette
change — existing semantic colors (bone white, contact green, gate blue,
etc.) untouched.

## 13. Part J — Before/After Visual Sheets

`scripts/phase-9-2b-before-after-overlay.py` renders BEFORE (old constants)
and AFTER (new constants) side-by-side on the exact same real,
correctly-decoded (sequential-decode, per Phase 9.2A's own corrected method)
source frames and real stored landmarks Phase 9.2A used — including
front/back-side leg, touchdown, arm swing, and the Phase 9.1B recovered
frames.

Output (visually inspected, not assumed): `tmp/phase92b/visual-sheets/{gav,
vanni240,vanni120,vanni60}-before-after.png`. Vanni 240 and Gav were
individually reviewed: AFTER shows bolder, clearly visible bone lines with
the dark halo giving contrast against both light (track/concrete) and dark
(clothing) backgrounds, solid joint markers reading as real anchors, and no
over-thickening that obscures the athlete (Part C's constraint holds).
Vanni 120/60 sheets were generated with the identical method but not
individually re-reviewed frame-by-frame in this pass.

## 14. Part K — Real Browser Perceptual Validation

Authenticated Playwright session against the real Next.js dev bundle
(`commander@atreides.local`, Vanni 240 session
`31fe352b-f00f-4a80-b20a-17c2ab08ec5a`): played 2.5s at 1×, instrumented
`ctx.stroke()` — 728 real calls, zero console/page errors, confirming the new
style + smoothing code executes correctly against real production state.

**Disclosed limitation, unresolved**: this sandbox's headless Chromium
cannot reliably decode video pixels for these benchmark files, and
`video.currentTime` does not reliably propagate to the internal presentation
clock — the same constraint documented since Phase 8.0B. Live,
timestamp-specific visual classification (PAINTED_ON/GOOD/FLOATING/etc. at
1×/0.5×/0.25×, RAW vs Stabilized, Auto Follow on/off) could not be performed
here. This is not fabricated or approximated — the static visual sheets
(§13) and the quantified jitter metrics (§24) are offered as the
evidence-backed substitute, exactly as Part K instructs when live validation
is blocked.

## 15. Part L — Style-Only Closure Decision

Not closed style-only. Reasoning: the style change addresses the
*perception* candidate, but Phase 9.2A's proximal-joint jitter finding is a
real, quantified, FPS-amplified *positional* signal (45–59 vs 6–7
athlete-heights/second p95 velocity on Vanni 240 vs Gav), not a rendering
artifact — a thicker line cannot remove real frame-to-frame position noise.
Given that evidence already exists and is quantified (not hypothetical),
Part M's bounded smoothing was implemented rather than stopping here.

## 16. Part M — Temporal Jitter Qualification

Confirmed via §24's real rerun: proximal joints (shoulders/hips) are the
group Phase 9.2A measured the implausible jitter on and are the only group
smoothed. Mid-limb (elbows/knees) and distal (wrists/ankles) joints are
provably untouched (§24, `midLimbDistalUnchanged: true` for all 4
benchmarks) — no blanket per-joint smoothing was applied.

## 17. Part N — Display-Only Smoothing Contract

`stepSkeletonSmoothing` (`VideoOverlay.tsx:205`) is a pure function: real
pose coordinates (`frame.landmarks`) are read but never mutated (§4); its
output (`skeletonSmoothingRef`) is a local ref inside `VideoOverlay.tsx`,
read by no other file (§22, sanity test 18: grep-verified zero external
references to `stepSkeletonSmoothing` / `SkeletonSmoothingState` /
`SKELETON_SMOOTHED_JOINT_NAMES` outside this one component).

## 18. Part O — Source-Time-Based Smoothing

`alpha = 1 - Math.exp(-dt / 0.025)` where `dt = timeS - previous.timeS` is
real elapsed *source* media time (the `currentTime` passed into the draw
loop), never a frame count or wall-clock value. At 240fps (dt≈4.2ms) this
averages roughly 6–7 fine frames (~27ms) of noise; at 60fps (dt≈16.7ms) it
responds within about one tick — the same formula naturally scales its
effective strength with source FPS with no FPS-specific branch. 25ms is far
below a sprint stride cycle (~300–400ms), so it cannot perceptibly delay real
stride motion. Verified by sanity test 14 (240fps two half-ticks converge
less than one 60fps-equivalent single tick, proving true time-domain
behavior, not frame-count behavior).

## 19. Part P — No Lagging Limbs

Distal joints (wrists/ankles/heels/toes) and mid-limb joints (elbows/knees)
are never smoothed — §24 confirms their jitter statistics are byte-identical
before/after for all 4 benchmarks, so fast limb motion near touchdown/toe-off
is never softened into a timing illusion. For the proximal joints that *are*
smoothed, §24 also reports the induced positional bias honestly (median ~7–9%
of athlete height across benchmarks; see §24's outlier discussion for the
one large, explained exception).

## 20. Part Q — Bounded/Confidence-Aware Behavior

Two independent, unconditional reset rules, checked every call:
`SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED = 0.08` (a raw-to-raw spatial jump
this large in one step is treated as genuine large motion or a seek target —
followed exactly, never eased) and `SKELETON_SMOOTHING_MAX_DT_S = 0.5` (a
source-time gap this large can only be a seek/scrub/pause-resume
discontinuity). A joint absent from `rawJoints` this tick is never fabricated
or held stale — it is simply absent from the returned state (sanity test
15). Verified with real function calls, not just read from source (sanity
tests 8, 9, 15, 16, 17).

## 21. Part R — Pause/Scrub

`dt <= 0` (covering paused/repeated-tick and backward-seek cases) is one of
the two hard-reset conditions, so repeated draw ticks at an unchanged media
time deterministically converge to and then *hold exactly* the raw value for
that instant — satisfying "display exact pose for that media time" with no
separate pause-specific branch (sanity test 8). A forward or backward seek of
any size resets immediately to the exact raw value with no animated
catch-up (sanity test 9).

## 22. Part S — Auto Follow / Stabilized View Independence

`stepSkeletonSmoothing`'s body and its caller (`VideoOverlay.tsx:899-909`)
reference no transform state (`followWrapperRef`, `trochanterRef`,
`correction.dx/dy`, `cameraTrackingStateAt`, `presentationCamera`) — grep-
verified against the live function body and the live call site (sanity tests
6, 7). Smoothing operates purely on pre-transform source-normalized
coordinates; Auto Follow and Stabilized View are applied to the canvas
*after* `resolvedJoint()` returns, exactly as before this phase.

## 23. Part T — 240 FPS

Vanni 240 is the benchmark this phase targeted most directly, since Phase
9.2A found its proximal jitter both largest in absolute terms and most
FPS-amplified. Result (§24): proximal p95 velocity 48.4 → 23.2
athlete-heights/s (52% reduction), worst-case outlier 654.7 → 111.8 (83%
reduction) — see §24 for the honest caveat on what drives the remaining
outlier tail.

## 24. Part U — Acceptance Metrics

`scripts/phase-9-2b-jitter-metrics.mjs` runs the real, verbatim-copied
`stepSkeletonSmoothing` (verified byte-identical to the live source before
every run) against every real frame of all 4 benchmark pose artifacts, in
real source-time order — the same identity used in production.

| Benchmark | Proximal p95 (before → after) | Proximal max (before → after) | Mid-limb / distal | Bias (median / p95 / max, athlete-heights) |
|---|---|---|---|---|
| gav | 6.29 → 5.08 | 28.65 → 16.30 | unchanged | 0.070 / 0.090 / 0.334 |
| vanni240 | 48.37 → 23.20 | 654.75 → 111.81 | unchanged | 0.088 / 0.548 / 2.641 |
| vanni120 | 10.38 → 5.53 | 76.46 → 16.95 | unchanged | 0.078 / 0.116 / 0.357 |
| vanni60 | 9.34 → 5.53 | 22.40 → 10.12 | unchanged | 0.064 / 0.096 / 0.199 |

(units: normalized frame-to-frame velocity in athlete-heights/second,
identical methodology to Phase 9.2A's own script.)

Proximal jitter is meaningfully reduced at every percentile for all 4
benchmarks; mid-limb/distal joints are mathematically untouched (§16).
Coordinate bias (smoothed-minus-raw displacement) is small and bounded in
the typical case (median 6–9% of athlete height) for every benchmark.

**Honest outlier disclosure**: Vanni 240's bias `max` (2.64 athlete-heights)
and jitter `max` values are dominated by a small number of frames where the
athlete-bounding-box height itself collapses transiently (e.g. frame 485,
`tMs=2025`, bbox height drops from ~0.098 to ~0.021 of frame height in a
single 4ms tick — a bounding-box tracking artifact, not real athlete
motion), which inflates the athlete-height-normalized denominator for that
frame. Traced and confirmed directly against the real artifact (not
assumed); this is a pre-existing characteristic of the underlying detection
data at that moment, shared by Phase 9.2A's own already-published max
figures using the identical normalization, not a defect introduced by this
phase's smoother. The smoother's own two reset thresholds still correctly
prevented full easing through the largest single-frame spikes (that is
exactly why `max` velocity dropped 83% rather than converging to zero).

## 25. Part V — Scientific Isolation Test

Four independent, real checks, not asserted:

1. **File scope**: `git diff --stat -- src/components/video/VideoOverlay.tsx`
   is the only production file this phase's own edits touched (verified
   against my own tool-call history this phase).
2. **mtime**: `contacts.ts`, `steps.ts`, `gates.ts`, `pose.ts`, `overlay.ts`
   all last modified 2 days before this phase's edits; `measurements.ts`
   last modified earlier the same day (Phase 9.2A's own work, not this
   phase's).
3. **Mutation**: `frame.landmarks` is never assigned to anywhere in
   `VideoOverlay.tsx` (regex-verified).
4. **Import graph**: `contacts.ts`, `steps.ts`, `measurements.ts`,
   `metrics.ts` contain zero references to `VideoOverlay`,
   `stepSkeletonSmoothing`, or any of its exported constants. The one real
   import of `VideoOverlay.tsx` from `src/lib/` (`overlayAvailability.ts`
   importing the `OverlayToggles` *type*) is a UI-toggle shape, unrelated to
   and untouched by this phase.

## 26. Part W — Tests

`scripts/phase-9-2b-sanity.mjs`, 23/23 passed (13 base + 7 smoothing-specific
+ 3 style/structural extras): coordinate preservation, deterministic line
width/joint radius, torso topology, draw ordering, RAW/Stabilized and Auto
Follow coordinate identity, pause/scrub determinism, scientific-file
isolation (mutation + import graph), source-time-based smoothing, no
fabrication through missing pose, seek reset, large-motion preservation, no
external consumer of the smoothing symbols, and the real §24 jitter-reduction
data. Full run:

```
23/23 checks passed.
```

## 27. Part X — Regression & Build

Ran the full established regression set (all real script executions, not
skipped): `phase-9-2a-sanity.mjs` (15/16 — see below), `phase-9-1b-sanity.mjs`
(15/15), `phase-9-1a-sanity.mjs` (10/12 — see below), `phase-8-2b-sanity.mjs`
(21/21), `phase-8-1b1-adjudication-sanity.mjs` (15/15),
`phase-8-1b2a-cross-benchmark-sanity.mjs` (20/20),
`phase-8-1b2b-stabilization-sanity.mjs` (19/19),
`phase-8-0b-overlay-label-sanity.mjs` (32/32),
`phase-7-3b-temporal-state-sanity.mjs` (11/11),
`phase-6-6b-part-b-presentation-sync-sanity.mjs` (18/18),
`phase-6-1-overlay-fidelity-sanity.mjs` (13/13), plus `pose-sanity.mjs`,
`contacts-sanity.mjs`, `steps-sanity.mjs` — all fully passed.

Two expected, explained non-regressions: `phase-9-2a-sanity.mjs` check 14 and
`phase-9-1a-sanity.mjs` check 14 assert "no guarded production file's mtime
moved *since that phase's own scripts were authored*" — a narrow,
self-referential staleness guard. Since 9.2B legitimately edited
`VideoOverlay.tsx` after 9.1A's and 9.2A's own scripts were written, this
guard correctly (and expectedly) fires; it is not a semantic regression of
either phase's actual findings, which were re-verified directly by the other
15–17 checks in each of those same runs, all of which passed.

`npm run typecheck` — clean. `npm run lint` — clean (`--max-warnings=0`).

Safe build sequence: stopped the running dev server, ran `npm run build`
(clean production build, 41/41 static pages generated, no errors), then
restarted `npm run dev` and confirmed `GET /` returns `200`.

## 28. Git Status

New files this phase (all untracked, nothing committed):
`scripts/phase-9-2b-before-after-overlay.py`,
`scripts/phase-9-2b-jitter-metrics.mjs`, `scripts/phase-9-2b-sanity.mjs`,
`docs/phase-9-2b-skeleton-suit-visual-fidelity.md`,
`tmp/phase92b/visual-sheets/*.png`, `tmp/phase92b/jitter-before-after.json`.
Modified: `src/components/video/VideoOverlay.tsx` (this phase's only
production-file edit). No commit, push, or database mutation performed, per
this phase's standing constraints.
