# Phase R0/R1/R2 — Live User-Facing Route Reconciliation

**This task's own explicit premise: "PROVE IT IN THE ACTUAL USER-FACING
ROUTE."** Every claim below is backed by either a direct read of the exact
mounted-route source, a real production-function execution, or a real
decoded-video browser screenshot of the actual `/sessions/:id` page — not a
unit test or headless canvas interceptor alone.

## 1. Executive summary

Two real, user-visible defects were found and fixed in the actual mounted
render path, plus one real environment issue that plausibly explains part of
"nothing from the last several hours appears changed":

1. **Step-length meter labels never rendered, for any step, ever** — a
   genuine data-matching bug. `VideoOverlay.tsx`'s render-path step marks and
   `measurements.ts`'s authoritative `zoneSteps` both number contacts using
   `detectStepMarks()`, but on **different frame sets** (the render path uses
   raw unstripped frames; `measurements.ts` strips `predicted`/`invalid`/
   `frozen_suspect` frames first) — so their `mark.index` sequences diverge,
   and the reconstructed `contact-${sourceFrameIndex}-${side}-${index}`
   lookup key almost never matches. **Proven with real Vanni 240 data: 0 of 8
   authoritative contacts matched under the old lookup.** Fixed by matching
   on `sourceFrameIndex-side` (a physical-contact identity both sides already
   agree on) instead of the divergent reconstructed index.

2. **Zone color regions were angled perspective quadrilaterals, not the
   requested full-height vertical panes** — even though a `stationaryZoneRect`
   helper implementing exactly the requested full-height-rectangle geometry
   already existed in the codebase (`stationaryGateGeometry.ts`, used only
   for the gate *lines*), it was never wired into the zone *fill* rendering.
   Fixed by wiring a new three-region variant of that same, already-existing
   geometry into the zone fill for stationary cameras.

3. **Two independent `next dev` processes were running against the same
   worktree on different ports (3000 and 3001)**, sharing one `.next/` build
   directory — a real, concrete, plausible contributor to "nothing appears
   changed" if the user's browser was pointed at the stale/second instance.
   Both were stopped, `.next` was cleared, and exactly one clean instance was
   restarted on port 3000.

Both fixes are proven live on the actual mounted route via real, decoded-
video screenshots (Section 12): step numbers now show their meter value
directly beneath them, and zone regions now span the full displayed video
height as straight, non-angled vertical bands — including under real Auto
Follow zoom.

**Engineering implementation: COMPLETE. User acceptance: PENDING** (Section
15/16) — per this task's own explicit rule, this cannot be marked accepted
until the user manually confirms it in their own browser.

## 2. Why prior validation failed to predict user-visible state

Three real, distinct, now-identified reasons:

- **The step-length bug (Section 6/7) was never actually exercised by any
  prior phase's regression suite.** Phase 8.0B's own sanity script asserts
  the label *formula* is correct (`meters.toFixed(2)`, no independent
  recomputation) and that the `contactId` *format* is well-formed — it never
  asserted that the lookup **actually resolves to a non-null value** for a
  real contact using the render path's own independently-detected marks. The
  bug lived entirely in a gap between two correct-in-isolation pieces of
  code.
- **The zone geometry was never actually a defect from any single phase's
  own narrow point of view** — Day 104 built the full-height rectangle
  helper (`stationaryZoneRect`) and used it for gate *lines*; Phase 6.3/6.6C
  built the perspective-polygon zone *fill* and never revisited it after Day
  104's own redesign. Neither phase's own regression suite could have caught
  the other phase's incomplete migration, because each only tested its own
  piece.
- **The dual dev-server instance** (Section 4) is an environment condition no
  amount of source-code testing or headless instrumentation could ever
  detect — it depends entirely on which port a human's browser happens to be
  pointed at.

## 3. Actual mounted route/component chain

Traced directly from live source (not assumed from filenames in prior
reports):

```
src/app/sessions/[id]/page.tsx
  measurements = computeSprintMeasurements(overlayFrames, ...)   // src/lib/benchmark/measurements.ts
  <OverlayVideoPlayer authoritativeSteps={measurements?.zoneSteps ?? null} ... />
    src/components/video/OverlayVideoPlayer.tsx
    <OverlaySurface authoritativeSteps={authoritativeSteps} ... />
      src/components/video/OverlaySurface.tsx
      <VideoOverlay authoritativeSteps={authoritativeSteps} ... />
        src/components/video/VideoOverlay.tsx  -- <canvas> draw loop
```

Exactly one definition of `VideoOverlay` and exactly one of `OverlaySurface`
exist in `src/` (grep-verified) — **no duplicate/alternate renderer found**.
A second player, `<VideoPlayer>`, exists on the same page but is a plain,
overlay-free preview for the "Permanent Source / Original Uploaded Video"
panel — a legitimately different UI purpose, not a competing implementation
of the analysis view.

## 4. Dev server/worktree verification

`git rev-parse --show-toplevel` / `git worktree list`: exactly one worktree,
`/Users/imac/Projects/Project.AVA`, branch `feature/brand-refresh-v1` — no
second clone or worktree involved.

**Found**: two `next dev` processes running concurrently, both with `cwd`
`/Users/imac/Projects/Project.AVA` (same worktree — ruling out "wrong
worktree" specifically, but not "wrong port"):

| PID | Port | Started | Terminal |
|---|---|---|---|
| 69439 | 3000 | 11:40PM | background (this session's own restart) |
| 73098 | 3001 | 11:52PM | `ttys003` (a real interactive terminal) |

Both processes read/write the same `.next/` directory — a real, concrete
risk of stale or conflicting compiled output, and a real, concrete
possibility that the user's own browser tab was pointed at port 3001's
independently-timed compilation. **Action taken**: both processes stopped;
`.next/` (477MB of disposable build output, confirmed nothing but generated
artifacts) removed; `npm run build` rerun clean; exactly one dev server
restarted on port 3000. **The user should use `http://localhost:3000` and
should not run a second `npm run dev` in another terminal.**

## 5. Feature-flag/alternate-renderer audit

Searched for feature flags, developer-mode branches, legacy/new overlay
switches, mobile renderers, and analysis-version renderers that could route
the user's session to different code. Found: `presentationMode` (consumer
vs. developer overlay visibility — a toggle within the one real renderer, not
a different renderer) and `ANALYSIS_SUBMISSION_ENABLED` (gates new analysis
submission, unrelated to rendering). No conditional path was found that
would route a completed analysis to a different overlay implementation.

## 6. Step marker data path

Real Vanni 240 example, `contactId: "contact-375-left-5"`, authoritative
`stepLengthM = 1.862572391195754`:

```
measurements.ts's own detectStepMarks() (stripped frames)  -> mark.index = 5  -> contactId = "contact-375-left-5"
VideoOverlay.tsx's own detectStepMarks() (unstripped frames) -> mark.index = 8  -> reconstructed id = "contact-375-left-8"
```

`"contact-375-left-5" !== "contact-375-left-8"` — the lookup silently
returned `undefined` for **every** contact, not just this one. Verified
directly, not inferred: a real script (`scripts/phase-9-4-corrected-metrics.mjs`-
style production-function harness) ran both `detectStepMarks()` calls
against the real, current Vanni 240 artifact and compared the resulting
`contactId` sets — **0 of 8 authoritative contacts matched**.

## 7. Exact live step-marker correction

`src/components/video/VideoOverlay.tsx`, in the step-mark draw loop:

- **Before**: `authoritativeStepLengthById` keyed by the full, divergent
  `contactId` string; lookup via the render path's own reconstructed
  `markId`.
- **After**: `authoritativeStepLengthByFrameSide`, keyed by
  `${sourceFrameIndex}-${side}` parsed out of each authoritative
  `ZoneStep.contactId` (a stable, documented, physical-contact identity both
  sides already agree on — two contacts cannot share a source frame); lookup
  via `${mark.sourceFrameIndex}-${mark.side}`, values the render loop already
  has natively, no reconstruction needed.

Still reads **only** `authoritativeStep.stepLengthM` — no independent
`VideoOverlay` distance computation was reintroduced (verified: `O1` in the
updated `phase-8-0b-overlay-label-sanity.mjs` still passes). Ordinal and
meter draws remain two separately-gated `placeLabel` calls (ordinal always
draws when `show.step_numbers`; meter draws additionally only when a real
value resolves) — never fabricated, never replacing the other.

## 8. Zone design contract

Formalized per the user's explicit Part R2 instruction, not the prior
perspective-polygon assumption:

- Three regions: **pre/entry (green)**, **fly/measurement (light blue)**,
  **post/exit (red)**.
- Each region spans **canvas Y=0 to the full displayed picture height** —
  always, by construction (the new geometry function has no Y-axis
  computation to get wrong).
- X boundaries come from the same two already-authoritative, already-
  stabilized gate midpoints (`startG.mid.x`/`finishG.mid.x`) the existing
  full-height gate *lines* (`stationaryGateLine`, Day 104) already draw from
  — no new geometry, no invented distances.
- Direction-aware: "pre" is always the side of the start gate away from the
  finish gate; "post" is always the side of the finish gate away from the
  start gate — correct whether travel runs left-to-right or right-to-left.
- Explicitly scoped to **stationary cameras only** (`!useCameraProjection`)
  — panning keeps the prior `worldZonePolygons` perspective-quadrilateral
  behavior completely unchanged, per this task's "do not work on panning"
  instruction.

## 9. Exact live zone correction

New function `stationaryThreeZoneRects()` in
`src/lib/video/stationaryGateGeometry.ts` (a pure, presentation-only,
already-established module — see its own header doc comment: "never
computes, derives, or feeds back into the crossing-detection geometry"),
returning `{ pre, fly, post }` rectangles. `fly` is byte-identical to the
already-existing `stationaryZoneRect()` (unchanged, still used). `VideoOverlay.tsx`'s
zone-fill block now branches on `stationaryZoneDisplay` (the exact same
condition the gate-line rendering already branches on): stationary cameras
get a new `drawStationaryZoneRect()` (a plain `ctx.fillRect`), panning
cameras keep `drawWorldPolygon()`/`worldZonePolygons()` unchanged.

Colors (`WORLD_ZONE_THEME`, `src/lib/video/worldVisualization.ts`): the
`measurement` (fly) color changed from AVA's medium/vivid brand blue
(`rgba(47, 128, 237, 0.18)`, which could read as grayish over darker footage)
to a genuinely pale sky-blue (`rgba(125, 211, 252, 0.22)`) — matching the
user's explicit "LIGHT BLUE" request. `pre`/`post` keep the same green/red
hues; alpha raised 0.18→0.22 across all three for clearer visibility, per
the task's own explicit permission ("do not make the video hard to
inspect" — still translucent; verified visually, Section 12).

## 10. Skeleton code-path verification

Direct source read of the live, current `VideoOverlay.tsx` (not recalled
from a prior phase's memory):

- **9.1B eligibility exception**: present —
  `frame.boxOrigin === "frozen_suspect" && frame.independentLocalizationState === "independent_corroborated"`.
- **9.2B skeleton-suit style**: present — `SKELETON_BONE_WIDTH = 3.5`,
  `SKELETON_JOINT_RADIUS = 3`, `boneHalo: "rgba(6, 10, 18, 0.55)"`,
  `resolvedJoint()` used consistently for both bone and joint-dot draws.
- **Proximal display-only smoothing**: present —
  `SKELETON_SMOOTHING_TIME_CONSTANT_S = 0.025`, `stepSkeletonSmoothing()`.

**Real, human-visible confirmation** (Section 12): the skeleton renders with
the full 9.2B "skeleton suit" style (thick bones, dark halo, solid joints) in
every captured screenshot, including under real Auto Follow zoom.

## 11. Auto Follow code-path verification

Direct source read of the live, current `OverlaySurface.tsx`: `export
function resolveDisplayCameraState(...)` present and called at the real
tick-loop call site: `resolveDisplayCameraState(resolvedCameraPath, frames,
presentedTime, frameIndex)` — the Phase 8.2B interpolation path, not an
older discrete nearest-frame lookup. **Real, live confirmation**: toggling
the actual "Auto Follow" button in a real browser session produced a real
zoomed-in framing change (`autoFollowPressed: true`, visible zoom in the
Section 12 screenshots) — the code is not just present in source, it
executes and visibly changes the rendered scene.

## 12. Real production-component screenshots

Real, authenticated Playwright session against `http://localhost:3000` (the
single clean instance, Section 4), using the Phase 6.2B/9.4 real-decode
technique (locally range-served H.264 test copies — still frame-timeline-
accurate against the current artifacts). `videoWidth: 1920, videoHeight:
1080, readyState: 4` (real decoded pixels) confirmed for all three
benchmarks; zero console errors. The dev-only build marker
(`data-ava-overlay-build="phase-r0-r2-live-ui-reconciliation"`, Section 3's
R0-C requirement) was found on the live canvas in every capture, directly
proving the mounted component is this exact, current source.

Screenshots (`tmp/phaseR0R2/browser/`):

- **`vanni240-static-closeup.png`**: step numbers 7–11 each show their real
  meter value directly beneath (`1.92 m`, `1.86 m`, `2.18 m`, `1.82 m`,
  `2.23 m`); green/light-blue/red regions span the full picture height with
  straight vertical boundaries at the Start/Finish gate lines.
- **`vanni120-static-closeup.png`**: step numbers 3–9 each show their real
  meter value (`1.71 m` through `1.92 m`); same full-height zone geometry.
- **`vanni60-static-closeup.png`**: full-height zone geometry confirmed at a
  frame before the athlete reaches a detected contact.
- **`vanni240-autofollow-closeup.png`**: with Auto Follow real-toggled ON and
  real playback, meter values remain correctly attached to their step
  numbers (`2.18 m`, `1.82 m`, `2.23 m`, `1.99 m`) and the full-height red
  zone pane stays perfectly vertical under the live zoom transform —
  confirming label and zone stability under Auto Follow (Part R2-F).

## 13. Tests

`scripts/phase-r0-r2-sanity.mjs` — **20/20 passing**, covering: route import
chain (items 1–2), authoritative prop wiring (3), ordinal/meter
draw-independence including the real reproduced index-mismatch fix (4–7),
full-height zone geometry in both travel directions (8–11), gate-science
non-interference (12), Auto Follow/Stabilized View non-interference with the
meter lookup (13–14), skeleton 9.1B/9.2B and Auto Follow 8.2B code presence
on the live route (15–17), and scientific metrics/contacts/steps unchanged
via real production pipeline reruns (18–20).

Three pre-existing sanity scripts required legitimate updates (not
work-arounds — each pinned to the OLD, buggy/incomplete behavior this phase
intentionally and correctly changed): `phase-8-0b-overlay-label-sanity.mjs`
(lookup variable name), `phase-6-6c-authoritative-zone-visualization-sanity.mjs`
(new zone theme colors, explicitly requested), `phase-6-4-overlay-controls-sanity.mjs`
(zone-block occurrence count doubled from 3 to 6 by the new stationary/
panning branch, both branches still correct).

## 14. Scientific regression

`npm run typecheck`: clean. `npm run lint`: clean (0 warnings). `npm run
build`: production build succeeded (`.next` cleared and rebuilt fresh,
Section 4), `/sessions/[id]` bundle grew 39.9kB→40.8kB confirming the new
code compiled in. Regression suites: 9.4-era suites (`pose-sanity`,
`contacts-sanity`, `timing-verification-sanity`, `analysis-report-sanity`,
`worker-lease-sanity`, `vanni-240-metric-evidence-sanity`) all pass clean;
9.2B/9.1B/8.2B/8.1B-2B/8.0A suites pass clean; 9.3A/9.2A/9.1A/9.0A/8.2A show
only the same, single, already-well-understood pre-existing mtime-staleness
guard (each phase's own "no guarded file changed since MY scripts were
written" self-check, now correctly firing because this phase legitimately
edited `VideoOverlay.tsx`) — not a new regression, the identical pattern
documented and correctly classified in every regression section since Phase
8.2B. `scripts/vanni-240-metric-evidence-sanity.mjs`: **ALL PASSED** —
contacts, steps, and metrics are unchanged by this presentation-only phase.

## 15. User manual acceptance steps

1. Open `http://localhost:3000` (not 3001 — close any other `npm run dev`
   terminal you may have open).
2. Open the Vanni 240 (or 120/60) analysis session.
3. In the Layers panel, confirm **Step Numbers** and **Zones** are checked.
4. Look at any step mark inside the measurement zone: confirm you see BOTH
   the ordinal number (e.g. `6`) AND a metre value directly below it (e.g.
   `1.91 m`) — not just one or the other.
5. Look at the background: confirm you see three color bands — **green** on
   one side, **light blue** in the middle, **red** on the other — and that
   each band visibly spans from the **top of the video to the bottom**, with
   straight (not diagonal/angled) boundaries.
6. Toggle **Auto Follow** on and let it play briefly: confirm the meter
   values and zone bands stay attached and full-height under the zoom.
7. Toggle **Stabilized View** off and on: confirm the same.

## 16. User acceptance status: **PENDING**

Per this task's explicit rule, engineering implementation is reported
complete and is backed by real, live-route, decoded-video evidence — but
**human acceptance has not yet been manually confirmed by the user** and
must not be assumed. This status remains PENDING until the user performs
Section 15's steps and confirms.

## 17. Files changed

**Modified:**
- `src/components/video/VideoOverlay.tsx` — step-length lookup fix (R1),
  zone-fill branch + `drawStationaryZoneRect` (R2), dev identity marker (R0-C).
- `src/lib/video/stationaryGateGeometry.ts` — new `stationaryThreeZoneRects()`.
- `src/lib/video/worldVisualization.ts` — `WORLD_ZONE_THEME` color/alpha update.
- `scripts/phase-8-0b-overlay-label-sanity.mjs`,
  `scripts/phase-6-6c-authoritative-zone-visualization-sanity.mjs`,
  `scripts/phase-6-4-overlay-controls-sanity.mjs` — updated to match the
  intentional, correct behavior changes above.

**New:**
- `scripts/phase-r0-r2-sanity.mjs` (Part Z, 20/20 tests)
- `scripts/phase-r0-r2-live-verification.mjs` (Part R5, real browser capture)
- `docs/phase-r0-r2-live-ui-reconciliation.md` (this file)
- `tmp/phaseR0R2/` (real screenshots + results, gitignored)

**Not changed**: any scientific formula, contact/step detection algorithm,
timing logic, pose science, calibration, authoritative step-length
computation, or gate scientific geometry.

## 18. Git status

No commit, push, `db:reset`, or database mutation was performed. One
routine housekeeping action beyond source edits: two stray `next dev`
processes were stopped and the disposable `.next/` build directory was
removed and regenerated (Section 4) — no source or user data was touched.
The working tree was already substantially dirty from many prior, unrelated,
uncommitted phases in this same session; none of that was discarded.
