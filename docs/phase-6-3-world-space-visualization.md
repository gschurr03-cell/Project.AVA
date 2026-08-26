# Phase 6.3 — World-Space Visualization Architecture

**Date:** 2026-08-07  
**Status:** Complete (unweighted visualization architecture phase)  
**Roadmap:** 29.5% (unchanged)  
**Phase 6.2:** remains IN PROGRESS for real browser-playback validation

## 1. Executive Summary

Project.AVA now has one explicit visualization contract instead of an implicit
collection of Canvas2D draw blocks. Six ordered layers, stable overlay
registration, shared world primitives, and a complete ownership manifest define
where every current or future visual belongs. New green/blue/red zone regions are
not screen rectangles: they are polygons produced by clipping the visible world
viewport against the same transformed and atomically stabilized gate boundaries
Phase 6.2 renders.

The effective render order is video → world polygons → world geometry → athlete →
diagnostics → UI. The new zones are composited behind existing athlete/contact
graphics and use subtle opacity. No localization, pose, crop, contact, timing,
calibration, camera, gate propagation, world-lock, or metric code changed.

All four production measurement replays remain byte-identical. Phase 6.1’s
presented-frame clock and Phase 6.2’s global-path/0.5-source-pixel atomic
stabilization remain intact.

## 2. Existing visualization audit

Before Phase 6.3, `VideoOverlay.tsx` performed nearly every Canvas2D operation
inline. Its actual paint order was skeleton/joints/arms → COM/angles/foot state →
contacts/steps → gates/zone → comparison/debug. Projection was partly shared
through `project()`, but world contacts and gates each resolved their own world
path, colors lived in the component, clipping was ad hoc, and z-order depended on
source-code position.

| Visual | Source | Coordinates | Transform | Prior order/dependency |
|---|---|---|---|---|
| video | `OverlaySurface` | media element | browser media presentation | base |
| gates/calibration | `VideoOverlay` | canonical world → current source → CSS | global camera path / fallback evidence | late inline block |
| old zone tint | `VideoOverlay`, `stationaryGateGeometry` | gate midpoint CSS rectangle | post-gate projection | late; stationary only |
| skeleton/joints/arms | `VideoOverlay` | current source-normalized pose | presented pose frame | first canvas content |
| COM/trail/velocity | `VideoOverlay` | athlete source | presented pose frame | athlete block |
| contacts/step path | `VideoOverlay`, world-anchor helpers | canonical world | global path/evidence | after athlete |
| comparison pose | `VideoOverlay` | athlete source | presented pose frame | diagnostics |
| crop/tracking/debug | `VideoOverlay` | source + screen | current source / screen | last |
| labels/HUD | `VideoOverlay`, controls/cards elsewhere | screen | identity | top/UI |

Dependency graph:

```text
scientific calibration + canonical contacts + presented pose
                 │
          global camera path
                 │
       Phase 6.2 world gate scene
          ┌──────┴────────┐
   world boundaries    zone polygons
          │                 │
       gate lines       green/blue/red
          └──────┬──────────┘
             shared canvas
        athlete → diagnostics → UI
```

## 3. New rendering architecture

`worldVisualization.ts` defines `VisualizationOverlay`:

- `coordinateSpace`: `world`, `athlete_source`, or `screen`;
- `layer` and numeric `zOrder`;
- `visible` boolean/predicate;
- explicit `dependencies`;
- `transformSource`: global camera path, presented pose frame, or screen identity;
- `render(context)`.

`orderedVisibleOverlays` sorts by layer, z-order, then stable registration order.
`renderRegisteredOverlays` executes the resulting list without a switch statement.
`CURRENT_VISUALIZATION_MANIFEST` assigns every current visual exactly once.

## 4. Layer definitions

| Order | Layer | Contents | Transform authority |
|---:|---|---|---|
| 0 | Video | decoded presented video | media element |
| 20 | World Polygons | start/fly/finish regions | global camera path via stabilized gate scene |
| 30 | World Geometry | gates, boundaries, calibration references | global camera path |
| 40 | Athlete | skeleton, joints, COM, contacts/strides | presented source frame or canonical world as declared |
| 50 | Diagnostics | tracking/crop boxes, confidence, camera/debug vectors | declared source/screen path |
| 60 | User Interface | labels, controls, metric cards | screen identity |

The effective order deliberately keeps translucent regions behind the athlete,
keeps precise gates above their fills, preserves readable athlete evidence, and
reserves diagnostics/UI for the top.

## 5. World polygon system

`worldZonePolygons(start, finish, viewport)` accepts two already-world-locked
boundary lines. It evaluates the oriented half-plane of each line and uses
deterministic polygon clipping to return:

- start polygon: visible world before the start boundary;
- fly polygon: visible world between start and finish;
- finish polygon: visible world after the finish boundary.

This handles either travel direction, angled boundaries, rotation, translation,
resize, and pan. The three polygon areas exactly partition the visible viewport
in deterministic tests. No gate x-coordinate or rectangular zone is hardcoded.

## 6. Shared primitives

Reusable exports now exist for:

- `drawWorldLine`;
- `drawWorldPolygon`;
- `drawWorldPoint`;
- `drawWorldLabel`;
- `drawWorldArrow`;
- `drawWorldPath`.

Each consumes resolved geometry and a Canvas2D context. Projection is deliberately
absent from primitive APIs: one upstream transform resolves world coordinates,
then every primitive paints that result.

## 7. Zone visualization

The implemented display-only palette is:

- before start: green, alpha 0.055;
- timed fly zone: AVA blue, alpha 0.065;
- after finish: red, alpha 0.045.

All three consume the same `startG`/`finishG` scene after Phase 6.2’s global-path
projection and atomic deadzone. If either boundary is unsafe, no colored world
region is rendered. `destination-over` places polygons behind athlete, contact,
gate, and diagnostic paint without duplicating gate resolution.

## 8. Future overlay contract

A future overlay registers one object and declares its coordinate space, layer,
z-order, visibility, dependencies, transform source, and renderer. Toggles become
changes to `visible`; they do not require a new giant conditional dispatcher.
World overlays must depend on the global camera path or an existing resolved world
scene. Athlete overlays must depend on the presented pose frame. Screen overlays
must explicitly declare screen identity.

The legacy component’s existing draw blocks remain operational and are mapped by
the manifest; migration to individual registered overlays can now be incremental
without changing their geometry. New overlays should use the registry immediately.

## 9. Files changed

- `src/lib/video/worldVisualization.ts` — new layer contract, stable registry,
  clipping/polygon system, primitives, and complete ownership manifest.
- `src/components/video/VideoOverlay.tsx` — shared world-zone integration and
  deterministic behind-athlete compositing.
- `scripts/phase-6-3-world-visualization-sanity.mjs` — 16 deterministic checks.
- `package.json` — Phase 6.3 sanity command.
- this report and roadmap.

No database or scientific calculation file changed.

### Agent-handoff provenance

- **Prior architecture inherited:** Phase 6.1's presented-frame media clock;
  Phase 6.2's global camera path, atomic stabilized gate scene, and 0.5
  source-pixel display deadzone; the existing Canvas2D renderer and scientific
  replay harnesses. These are preserved, not claimed as Phase 6.3 work.
- **Prior findings independently verified here:** the renderer's actual paint
  order and coordinate paths; continued presence of the Phase 6.1 clock and
  Phase 6.2 stabilization; all four closed scientific replay outputs.
- **Findings disproved or corrected here:** none. Live code and benchmark
  artifacts did not contradict the inherited Phase 6.1/6.2 conclusions.
- **Code changed in Phase 6.3:** the visualization contract, layers, manifest,
  shared primitives, polygon clipping, and three-zone renderer integration
  listed above.
- **Tests added in Phase 6.3:** the 16-check deterministic visualization sanity
  suite listed below.
- **Real benchmark runs performed in Phase 6.3:** all four production
  measurement replays listed in Section 11.
- **Not personally validated in Phase 6.3:** subjective playback in a real
  browser against the benchmark media. That remains Phase 6.2's explicit codec
  blocker; no no-bobbing or fullscreen/scrubbing claim is made.

## 10. Tests

- `phase-6-3-world-visualization:sanity`: **16/16 passed**.
- `phase-6-2-world-lock:sanity`: **23/23 passed**.
- `phase-6-1-overlay-fidelity:sanity`: **13/13 passed**.
- actual TypeScript typecheck: passed.
- lint: passed.
- optimized production build: passed.

The Phase 6.3 suite proves polygon partitioning, reverse travel, shared transform,
layer and stable z-order, visibility, registration, ownership uniqueness, all six
layers, global transform declarations, scientific isolation, Phase 6.1 mediaTime,
and Phase 6.2 atomic stabilization.

## 11. Benchmark validation

The real production measurement path was replayed against all four Phase 4.2K
artifacts and existing calibration evidence after Phase 6.3:

| Benchmark | contacts | zone time | combined step frequency | result |
|---|---:|---:|---:|---|
| Gav | 9 | 1.92 s | 4.848484848484849 Hz | byte-identical |
| Vanni 240 | 7 | 2.12 s | 3.103448275862069 Hz | byte-identical |
| Vanni 120 | 8 | 2.19 s | 3.6206896551724137 Hz | byte-identical |
| Vanni 60 | 10 | 2.40 s | 4.385953327434329 Hz | byte-identical |

GCT, flight, peak velocity, and zone-step output also reproduce the closed
baselines. Scientific code cannot import the visualization module.

World-lock behavior is structurally identical across the four artifacts: zones
consume the exact same safe, stabilized gate scene as their rendered boundaries.
Phase 6.2’s separate real-browser codec blocker still prevents a subjective
live-playback “no bobbing” claim and is not silently treated as resolved here.

## 12. Roadmap update

Phase 6.3 is recorded Complete as an unweighted visualization architecture phase.
No roadmap credit is invented; weighted completion remains **29.5%**. Phase 6.2
remains IN PROGRESS solely for its test-media/browser playback closure plan.
Phases 4.2, 5.0E, and 6.1 remain CLOSED.

## 13. Remaining limitations

- Real-browser playback of benchmark media remains blocked exactly as Phase 6.2
  reports; Phase 6.3 does not close it.
- Existing legacy draw blocks are assigned to layers by the manifest but have not
  all been mechanically moved into individual registration objects. Their current
  behavior is preserved; new overlays have the modular contract.
- The three visual regions are based on the current two authoritative timing
  boundaries. A future true four-boundary scientific concept would require its own
  separately authorized calibration design; visualization must not invent it.
- Partial-affine world-lock limitations documented in Phase 6.2 remain.

## 14. Exact recommended Phase 6.4 scope

First complete Phase 6.2’s test-only H.264 playback plan without changing gate or
visualization algorithms. Then Phase 6.4 should incrementally register the
remaining legacy athlete/contact/diagnostic draw blocks and expose declarative
visibility toggles. It must retain the six layers, stable sorting, one global
camera-path authority, Phase 6.1 mediaTime, Phase 6.2 atomic scene, and the strict
scientific/display separation.
