# Phase 6.6C — Authoritative World-Zone Visualization

**Date:** 2026-08-07  
**Status:** **CLOSED**  
**Roadmap:** 29.5% (unchanged; Phase 6.6C is unweighted)

## 1. Executive summary

The world-zone overlay now renders visibly distinct presentation regions: green
before the start gate, AVA blue inside the measurement zone, and red after the
finish gate. The defect was not zone classification, world geometry, draw order,
or Auto Follow. The intended colors were hardcoded in `VideoOverlay` at only
4.5–6.5% opacity, which made green and red effectively disappear against real
track footage and left the familiar blue guide as the only readily perceived
cue.

The smallest fix moved the palette into the authoritative visualization contract
and set all three display-only fills to 18% opacity. The renderer still consumes
the exact same resolved, atomically stabilized start/finish boundary scene. No
scientific calculation, timing, localization, camera, pose, contact, metric,
gate, zone, or world-transform behavior changed.

## 2. Current rendering pipeline

```text
theme: WORLD_ZONE_THEME
  -> overlay registry: zones / World Polygons layer
  -> resolved startG + finishG
  -> worldZonePolygons(startG, finishG, viewport)
  -> start / fly / finish polygon registrations
  -> drawWorldPolygon
  -> Canvas2D destination-over composition
  -> shared presentation wrapper (Auto Follow OFF or ON)
```

`zones` remains one default-on Course control. Evidence availability requires
the same world-locked gates used by gate rendering. No CSS class supplies or
overrides the canvas fill.

## 3. Root cause

Classification was correct: points before start, between the gates, and after
finish map deterministically to `pre`, `measurement`, and `post`. All three
polygons were submitted on every eligible paint.

The failure was presentation propagation and contrast. The palette existed only
as component-local literals:

- green: alpha 0.055;
- blue: alpha 0.065;
- red: alpha 0.045.

Those opacities were too subtle on the benchmark backgrounds. No wrong state was
received and no later full-frame overlay repainted the regions.

## 4. Color propagation

`WORLD_ZONE_THEME` in `worldVisualization.ts` is now authoritative:

| Region | Display color |
|---|---|
| pre-zone | `rgba(34, 197, 94, 0.18)` |
| measurement zone | `rgba(47, 128, 237, 0.18)` |
| post-zone | `rgba(239, 68, 68, 0.18)` |

`VideoOverlay` references these three keys directly. The stale low-alpha literals
are absent. `classifyWorldZonePoint` exposes the same oriented-boundary
classification for deterministic diagnostics without entering scientific zone
membership.

## 5. Draw-order audit

World polygons retain layer 20, gates layer 30, athlete evidence layer 40, and
diagnostics layer 50. `destination-over` places the fills behind already-painted
skeleton/contact evidence. `ctx.save()` / `ctx.restore()` contains the blend
mode. Gate strokes follow polygon submission, and no later operation paints a
full-frame opaque rectangle. Alpha, blend mode, registration order, and CSS were
therefore ruled out as overwrite mechanisms.

## 6. Theme audit

Before Phase 6.6C there was no authoritative zone theme: three RGBA strings were
embedded in the component despite the authoritative registry living in
`worldVisualization.ts`. The renderer now imports and consumes the central
palette. General AVA-blue gate strokes remain intentionally separate; they do
not replace or override region fills.

## 7. Implementation

- Added `WORLD_ZONE_THEME` and the presentation-only
  `classifyWorldZonePoint` diagnostic to `worldVisualization.ts`.
- Replaced three component-local fill literals with the authoritative theme.
- Added a 13-check Phase 6.6C deterministic suite and package command.
- Reconciled three inherited Phase 6.2/6.3/6.4 test assertions with the already
  closed Phase 6.6B media-time scheduler. This was test maintenance only.

No polygon, gate, projection, stabilization, camera, or scientific algorithm was
rewritten.

## 8. Browser validation

Authenticated headless Chromium ran the real application with clearly test-only
H.264 copies. These copies preserved 1920×1080 dimensions/orientation and were
used only for browser display; scientific artifacts and calculations remained
the original sources.

| Benchmark | Auto Follow OFF | Auto Follow ON | Result |
|---|---|---|---|
| Vanni 240 | pass | pass | green / blue / red visible |
| Vanni 120 | pass | pass | green / blue / red visible |
| Vanni 60 | pass | pass | green / blue / red visible |

All six continuous captures preserved green before start, blue between the same
two gate boundaries, and red after finish. Auto Follow changed only the shared
presentation viewport; it did not change classification, colors, or geometry.
No blank layer, color flicker, or incorrect region reordering was observed.

Evidence is under `tmp/phase66c/browser/`, including:

- `vanni240-zones-off-live1.png` / `vanni240-zones-on-live1.png`;
- `vanni120-zones-off-live1.png` / `vanni120-zones-on-live1.png`;
- `vanni60-zones-off-live1.png` / `vanni60-zones-on-live1.png`;
- corresponding presentation traces.

## 9. Files changed

- `src/lib/video/worldVisualization.ts`
- `src/components/video/VideoOverlay.tsx`
- `scripts/phase-6-6c-authoritative-zone-visualization-sanity.mjs`
- `scripts/phase-6-2-world-lock-sanity.mjs` (stale assertion only)
- `scripts/phase-6-3-world-visualization-sanity.mjs` (stale assertion only)
- `scripts/phase-6-4-overlay-controls-sanity.mjs` (stale assertion only)
- `package.json`
- this report and the roadmap

## 10. Tests

- Phase 6.6C: **13/13 passed**.
- Phase 6.3: **16/16 passed**.
- Phase 6.4: **20/20 passed**.
- Phase 6.5: **26/26 passed**.
- Phase 6.6B Part B: **18/18 passed**.
- Phase 7.0: **26/26 passed**.
- Phase 7.1: **24/24 passed**.
- Phase 7.3B: **11/11 passed**.
- Typecheck: passed.
- Lint: passed with zero warnings.
- Production build: passed; 41/41 static pages generated.

The new suite covers region classification in both travel directions, exact
palette propagation, viewport partition, shared boundaries, layer/draw order,
Auto Follow independence, and scientific-module isolation.

## 11. Scientific regression

Phase 6.6C changed no scientific source. The accepted post-Phase-7.3B production
contracts remain:

| Benchmark | Step Frequency |
|---|---:|
| Gav | 4.848484848484849 Hz |
| Vanni 240 | 3.6206896551724137 Hz |
| Vanni 120 | 4.655172413793103 Hz |
| Vanni 60 | 4.385953327434329 Hz |

The Vanni 240/120 values correctly include the legitimate Phase 7.3B recovered
contacts. No formula, timing, zone logic, or contact identity was changed here.

The personally executed read-only Phase 5.0D audit harness produced:

| Benchmark | This task's legacy-harness replay | Evidence assessment |
|---|---:|---|
| Gav | 4.848484848484849 Hz | matches accepted value |
| Vanni 240 | 2.840236686390533 Hz | does not match; the older harness strips every `frozen_suspect` frame and does not implement the live `independent_corroborated` exception, so it cannot exercise the accepted Phase 7.3B evidence path |
| Vanni 120 | 4.655172413793103 Hz | matches accepted value |
| Vanni 60 | 4.5224052087322875 Hz | does not match; this is the pre-existing Phase 7.2 artifact/runtime discrepancy already keeping that separate phase IN PROGRESS |

This discrepancy is reported rather than silently selecting documentation over
live artifacts. The strongest Phase 6.6C independence evidence is that the diff
touches only visualization/theme code, `measurements.ts` cannot import the
visualization module, the Phase 7.3B contact-identity suite remains 11/11, and
the same read-only replay outputs are unaffected by the palette. I therefore do
not claim to have personally reproduced all four canonical values in this task.

## 12. Remaining limitations

- Color contrast was validated in the installed Chromium/browser environment;
  other GPU, display, HDR, and color-profile combinations were not personally
  tested.
- The system still has two authoritative timing boundaries and therefore three
  visual regions. Phase 6.6C does not invent a four-boundary scientific model.
- Test-only browser media is not scientific evidence and was not substituted
  into analysis.

## 13. Closure decision

All Phase 6.6C criteria pass. Green renders before the measurement zone, blue
inside it, and red after finish; geometry is unchanged; Auto Follow is color-
independent; browser captures and deterministic regressions pass; scientific
outputs remain unchanged. **Phase 6.6C is CLOSED.** Roadmap completion remains
**29.5%** because this phase is unweighted.

### Agent-handoff provenance

1. **Prior architecture inherited:** Phase 6.2 stabilized world gate scene,
   Phase 6.3 polygon/layer registry, Phase 6.4 overlay state, Phase 6.5/6.6D
   shared presentation transform, and Phase 6.6B presentation clock.
2. **Prior findings independently verified:** three-polygon partition, shared
   gate boundaries, layer order, theme absence, Auto Follow independence, and
   the post-Phase-7.3B regression contracts.
3. **Findings disproved or corrected:** the live renderer was not hardcoding
   blue alone and classification was not missing. The real defect was the
   component-local, extremely low-alpha palette. Three stale tests were corrected
   to recognize the approved Phase 6.6B scheduler.
4. **Code changed personally:** only the palette/classifier integration and test
   maintenance listed in Sections 7 and 9.
5. **Tests added personally:** the 13-check Phase 6.6C suite.
6. **Real benchmark runs performed personally:** six authenticated browser runs
   covering Vanni 240/120/60 with Auto Follow OFF/ON; four read-only legacy-
   harness scientific replays, with the two discrepancies documented above; and
   all regression suites listed above. No production rerun or database mutation
   occurred.
7. **Not personally validated:** all four canonical scientific numbers through
   one current authoritative production replay (only Gav and Vanni 120 matched
   in the available legacy harness), other browsers/displays, original MOV
   browser decode, or a new production worker analysis.

## Git status

The worktree remains intentionally dirty with extensive inherited uncommitted
Project.AVA work. Phase 6.6C changes are the files listed in Section 9 plus
test-only artifacts under `tmp/phase66c/`. Nothing was committed or pushed, and
the database was not reset or mutated.
