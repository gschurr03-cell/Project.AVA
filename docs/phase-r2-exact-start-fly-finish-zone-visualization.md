# Phase R2 — Exact Start / Fly / Finish Zone Visualization

**Status: implementation complete. User acceptance: PENDING.**

## 1. Executive summary

The prior zone design (from the earlier R0-R2 work) rendered three full-height
regions split at the two gate midpoints: green filled everything from the
picture's left edge to the start gate, red filled everything from the finish
gate to the picture's right edge. The user's explicit requirement is
different: green and red must be **bounded bands** anchored to their gate,
not indefinite fills to the screen edge, with light blue occupying only the
space between the two bands.

This phase audited the actual gate data model (confirmed: a single line per
gate, no scientific band/thickness exists) and implemented a presentation-
only bounded-band geometry, centered on each gate's already-authoritative,
already-stabilized midpoint, with width derived from the on-screen fly-zone
span (so it scales sanely at any zoom level) rather than an arbitrary fixed
pixel constant. Verified live in a real browser session on all four
benchmarks, in both travel directions, under Auto Follow/Stabilized View,
scrub/resize, with zero console errors and byte-identical scientific output.

## 2. Prior architecture inherited

- Phase 6.2's stabilized world gate scene (`gateStabilization.ts`, atomic
  0.5-source-px deadzone), unchanged.
- Phase 6.3's `worldVisualization.ts` layer/registry contract and
  `WORLD_ZONE_THEME` palette (green/light-blue/red, already correct colors
  from the prior R0-R2 phase), unchanged.
- Day 104 / R0-R2's `stationaryGateGeometry.ts` module and its
  `stationaryGateLine`/`stationaryZoneRect` functions (still used, untouched)
  and `stationaryThreeZoneRects` (the function this phase modifies).
- R1C's authoritative-contact render alignment (`fullRunContacts`,
  `authoritativeContacts` prop), unchanged and still correct — visible in
  this phase's own screenshots (`3.44 m` label on Vanni 240's Case 1 contact).
- The panning-camera zone path (`worldZonePolygons`, perspective clipping)
  — explicitly out of scope per this task's "do not work on panning"
  instruction, and per the earlier R0-R2 phase's own established scoping.

## 3. Prior findings independently verified

- The R0-R2 doc's claim that `stationaryThreeZoneRects` produced
  screen-edge-anchored `pre`/`post` fills — confirmed by direct source read
  (`{x: 0, width: startMidX}` / `{x: finishMidX, width: pictureWidth - finishMidX}`)
  before any change.
- The roadmap's own "Phase 10 — Four-boundary green/blue/red zone system:
  Not Started, 0%" entry — confirmed consistent with the actual calibration
  schema audit (Part 4 below): no second longitudinal boundary exists
  anywhere in `calibration_gates`.

## 4. Findings corrected/disproved

None from prior phases — the prior work was accurately documented as
intentional (screen-edge zones), not a defect; this phase changes that
intentional design per the user's new, more specific requirement.

## 5. Exact gate model discovered (Part A/B/C)

`src/lib/calibration/gates.ts` — `GateBar`: `{c1, c2, timeS, setupFrameIndex?}`.
`c1`/`c2` are the coach's two cone clicks, **spanning lane width** (the doc
comment: "a bar drawn cone-to-cone across the lane"), reduced by
`gateMidpoint()` to one representative point — the gate's single
along-travel x position. `src/lib/calibration/zoneAnchors.ts` —
`GroundBoundary.sourceFrameLine`: the same `{c1, c2}` shape, world-propagated
per frame for panning cameras; still one line.

**No near/far edge, no entry/exit boundary, no gate depth field exists
anywhere in the calibration data model.** The scientific gate is a line, not
a band. This is corroborated by `docs/stationary-roadmap-progress.md`'s own
"Phase 10 — Four-boundary green/blue/red zone system: Not Started, 0%"
entry — a genuine 4-boundary system is future, unbuilt scope, not something
this phase may retroactively assume exists. Per the task's explicit
instruction, no scientific gate thickness was invented.

Full audit: `tmp/phaseR2/gate-model-audit.json`.

## 6. Exact band derivation rule (Part D/F)

Each band is a presentation-only rectangle **centered on that same gate's
already-authoritative, already-stabilized midpoint** (`startG.mid.x` /
`finishG.mid.x` — the identical point the existing full-height gate *line*
already draws from; no new geometry resolved). Width is a fraction of the
on-screen fly-zone span (`|finishMidX - startMidX|`), not a fixed pixel
value, so it stays visually proportionate at any zoom (Auto Follow) level:

```
halfBand = min(clamp(flySpan * 0.12, 24px, 140px) / 2, flySpan / 2)

startGateOuterEdge  = startMidX  - halfBand   (left-to-right travel)
startGateInnerEdge  = startMidX  + halfBand
finishGateInnerEdge = finishMidX - halfBand
finishGateOuterEdge = finishMidX + halfBand

GREEN  = [startGateOuterEdge,  startGateInnerEdge]
BLUE   = [startGateInnerEdge,  finishGateInnerEdge]
RED    = [finishGateInnerEdge, finishGateOuterEdge]
```

Mirrored automatically for right-to-left travel
(`travelIsLeftToRight = finishMidX >= startMidX`) — not hardcoded. If the two
gates are close enough on screen that both full bands would overlap,
`halfBand` shrinks (never negative) so bands meet edge-to-edge with zero fly
width, instead of an inverted/negative region. Every region is `y=0,
height=pictureHeight` by construction. Full derivation:
`tmp/phaseR2/band-derivation.json`.

## 7. Code changed by Claude

- **`src/lib/video/stationaryGateGeometry.ts`** — added
  `stationaryGateBandWidth()`; rewrote `stationaryThreeZoneRects()` to
  produce bounded, gate-centered bands instead of screen-edge-anchored
  fills. `stationaryGateLine()` and `stationaryZoneRect()` (Day 104's
  original functions) are byte-unchanged. `VideoOverlay.tsx`'s existing call
  site (`stationaryThreeZoneRects(startG.mid.x, finishG.mid.x, picture.width,
  picture.height)`) required **no changes** — same signature, same call,
  new (correct) output.
- **`scripts/phase-r0-r2-sanity.mjs`** — updated one stale assertion
  (check #11) that pinned the OLD screen-edge-anchored region boundaries;
  now asserts the new bounded-band values. All other 19 checks in that
  suite were unaffected and still pass.

No scientific file touched (verified: `stationaryGateGeometry.ts` is
imported ONLY by `VideoOverlay.tsx`, grep-confirmed; `measurements.ts` never
imports it or `worldVisualization.ts`).

## 8. Tests added

`scripts/phase-r2-zone-band-visualization-sanity.mjs` — **18/18 passing**:
gate-line/band determinism (1–3), green/blue/red band correspondence and
correct blue containment (4–6), no fill outside the bands (7–8), full-height
fill (9), both travel directions (10–11), Auto Follow/Stabilized View
structural independence (12–13), pause/scrub determinism (14), resize
recomputation (15), and gate science/zone timing/metrics unchanged against a
real production regression run (16–18).

`scripts/phase-r2-scientific-regression.mjs` — real production
`computeSprintMeasurements` rerun for all 4 benchmarks, diffed against the
R1C baseline.

## 9. Real benchmark/browser runs

`scripts/phase-r2-ui-validation.mjs` — real, authenticated Playwright/
Chromium session (H.264 test-copy technique, `page.route()` interception of
the real signed video URL so React's normal load path runs unmodified — the
Phase R1C-established fix for this sandbox's direct-`.src`-mutation draw-loop
stall). Zero console errors across all captures. Screenshots:
`tmp/phaseR2/screenshots/`.

## 10. Vanni 240 zone result

`vanni240-raw-autofollow-off.png`: unmistakable green band on the left
(bounded — dark unfilled area visible beyond it toward the picture edge),
large light-blue fly region filling the middle, bounded red band on the
right (dark unfilled area beyond it toward the picture edge). No fill
reaches either screen edge.

`vanni240-autofollow-on.png`: real Auto Follow zoom; green band stays
correctly aligned and bounded at the new zoom level; step markers "1" and
"2 / 3.44 m" (R1C's own result) render correctly alongside the new zone
bands — confirming no interaction/regression between the two features.

`vanni240-stabilized-toggled.png`, `vanni240-scrub-forward-1.5s.png`,
`vanni240-scrub-backward-then-1.5s.png`, `vanni240-resized-1100.png`: all
captured with zero console errors; band geometry recomputed correctly at
each new viewport/zoom/scrub position (full detail:
`tmp/phaseR2/vanni240-zone-layout.json`).

## 11. Cross-benchmark result

Vanni 120, Vanni 60, and Gav (`tmp/phaseR2/screenshots/{vanni120,vanni60,gav}-zone-layout.png`)
all show the same bounded green/blue/red band layout, correct step-marker
meter labels, correct skeleton, zero console errors. No benchmark-specific
constant exists in `stationaryThreeZoneRects` — the same pure function
handles all four. Full detail: `tmp/phaseR2/cross-benchmark-zone-layout.json`.

## 12. Scientific before/after

All 4 benchmarks byte-identical to the R1C baseline
(`tmp/phaseR2/scientific-before-after.json`, `allMatch: true`): contacts,
`zoneTimeS`/`zoneEntryTimeS`/`zoneExitTimeS`, `combinedStepFrequencyHz`,
`avgIndividualStepLengthM`, `peakStrideLengthM`, `zoneVelocityMps`,
`maxVelocityMps` all unchanged. This is expected by construction: the only
file changed (`stationaryGateGeometry.ts`) is imported exclusively by
`VideoOverlay.tsx` and is unreachable from `measurements.ts`.

## 13. Not personally validated

- Real wind/outdoor camera-shake conditions (Phase 9, unrelated, separately
  tracked as Not Started).
- A genuine 4-boundary scientific model (Phase 10, unrelated, separately
  tracked as Not Started — this phase deliberately does not build it,
  exactly as instructed).
- Other browsers/GPUs/color profiles beyond the installed Chromium.
- `phase-6-3-world-visualization-sanity.mjs`'s one failing assertion
  (`transformSource: "global_camera_path"` count 6 vs. expected 3) —
  confirmed **pre-existing** (mtime of `VideoOverlay.tsx`, the file that
  check reads, predates this phase's own edits; the file was last touched
  during the earlier R1C phase, not this one) and traces to the SAME
  stationary/panning zone-overlay branch duplication the R0-R2 doc already
  documented for the analogous `phase-6-4-overlay-controls-sanity.mjs`
  staleness. Not a new regression from this phase; not fixed here (out of
  this phase's stated scope, which is `stationaryGateGeometry.ts` only).

## 14. Phase status: implementation COMPLETE

## 15. User acceptance status: **PENDING**

Per this task's explicit rule, this cannot be marked accepted until the user
manually confirms it. Manual acceptance steps:

1. Open `http://localhost:3000`, open the Vanni 240 session.
2. In the Layers panel, confirm **Gates** and **Zones** are checked.
3. Confirm green appears ONLY in a bounded band around the start gate — not
   filling everything before it.
4. Confirm light blue fills everything between the start and finish bands.
5. Confirm red appears ONLY in a bounded band around the finish gate — not
   filling everything after it.
6. Confirm there is visibly plain (uncolored) video beyond the green band
   toward the near edge of the picture, and beyond the red band toward the
   far edge.
7. Toggle **Auto Follow** ON/OFF: confirm all three regions stay aligned to
   the gates at any zoom.
8. Toggle **Stabilized View** ON/OFF: confirm the same.
9. Repeat on Vanni 120, Vanni 60, and Gav.

## 16. Current remediation-roadmap status

R1A, R1B, R1C: CLOSED (unchanged by this phase). R2 (this phase):
implementation complete, user acceptance PENDING. Roadmap Phase 10
("Four-boundary green/blue/red zone system") remains explicitly Not
Started — this phase's bounded presentation bands are NOT that scientific
4-boundary system and are not represented as such.

## 17. Legacy roadmap completion

Unweighted visualization/presentation work (matching Phase 6.3/6.6C's own
precedent) — no roadmap percentage claimed or changed.

## Git status

No commit, push, `db:reset`, or database mutation performed. Worktree
remains intentionally dirty with all prior uncommitted phases' work
preserved.

**STOP AFTER PHASE R2.**
