# Phase 6.4 — Modular Overlay Controls and Presentation System

**Date:** 2026-08-07  
**Status:** **CLOSED** (unweighted presentation phase)  
**Roadmap:** 29.5% (unchanged)  
**Phase 6.2:** remains IN PROGRESS for real browser-playback validation

## 1. Executive summary

AVA now has one authoritative, metadata-driven overlay registry and one
session-local visibility state. Consumer controls are grouped into Athlete,
Performance, and Course; developer diagnostics are hidden unless the existing
non-production developer presentation is explicitly enabled. Availability is
derived from real pose, contact, COM, velocity, gate, crop, camera, and comparison
evidence. An unavailable control is disabled with a concise reason.

Skeleton is one connected torso/arms/legs/joints overlay. Joint Angles is a
separate state and defaults off. Gates/Zones and Contacts/Step Numbers are fully
independent. No scientific, timing, pose, localization, calibration, gate, camera,
or world-transform calculation changed.

## 2. Roadmap status

Phase 6.1 and Phase 6.3 remain CLOSED. Phase 6.2 remains IN PROGRESS solely for
the existing real-browser `.mov` decoding blocker. Phase 6.4 has no assigned
weight, receives no invented credit, and leaves weighted completion at **29.5%**.

## 3. Existing control audit

All inherited controls lived in `OverlaySurface` React state, defaulted per mount,
and had no database/account persistence.

| Prior label | State | Default | Rendered concept | Evidence/dependency | Problem |
|---|---|---:|---|---|---|
| Skeleton | `skeleton` | on | all base bones and joints | pose | correct base, but overlapped Arms |
| Joint angles | `angles` | on | six lower-body labels | pose | upper angles not owned here; cluttered default |
| Arms | `arms` | on | duplicate shoulder/arm strokes, arm joints, four angle labels | pose | mixed skeleton and angles; duplicated base skeleton |
| COM trail | `comTrail` | on | COM point plus 30-frame trail | pose/COM | mixed point/trail concept; cluttered default |
| Velocity | `velocity` | on | COM velocity arrow | pose/COM/velocity | cluttered default |
| Foot labels | `footLabels` | on | current foot contact/flight rings and labels | pose | separate from accepted historical contacts |
| Step marks | `stepMarks` | on | accepted contact dots plus length labels | contact evidence | mixed contacts and sequence labels |
| Compare RTMPose | `compare` | off | comparison pose and HUD | comparison pose | experimental diagnostic in consumer list |
| Engineering debug | `debug` | off | camera/crop/anchor HUD, paths, labels | multiple | many developer concepts coupled together |

Auto Follow, calibration editing, transport, and telestration are separate tools,
not overlay visibility controls. The Timing Workspace has a separate calibration-
authoring overlay system and was not repurposed as analysis-playback state.

## 4. Overlay registry

`OVERLAY_REGISTRY` declares, for every analysis-playback overlay: `id`,
`displayName`, `category`, Phase 6.3 `layer`, `defaultVisible`, `consumerVisible`,
`developerOnly`, `evidenceRequirement`, dependencies, render ownership, and
optional description/shortcut. IDs are unique and order is deterministic.

Registered IDs are `skeleton`, `joint_angles`, `center_of_mass`, `step_numbers`,
`contacts`, `velocity`, `gates`, `zones`, `tracking_box`, `crop_box`,
`pose_diagnostics`, and `camera_motion_debug`.

## 5. Layer/category model

Categories control menu organization; Phase 6.3 layers control paint order. They
are intentionally separate. Athlete and Performance visuals paint in the Athlete
layer, Course zones/gates retain World Polygons/World Geometry, and developer
items remain Diagnostics. The six Phase 6.3 layer values are unchanged.

## 6. Skeleton unification

The existing base `bones` graph already connected shoulders, arms, torso, hips,
legs, ankles, and feet. The duplicated arm-emphasis pass was removed. One
`skeleton` condition now owns the graph and joint points. No landmark coordinate,
line projection, radius, or Phase 6.1 clock behavior changed.

## 7. Joint-angle control

Angle calculation remains in `buildOverlayFrames`: knee, hip, ankle, elbow, and
shoulder angles use the inherited three-point formula and are rounded to whole
degrees before persistence in `OverlayFrame`. Phase 6.4 changed visibility only.

All ten labels now require `joint_angles && skeleton`. Thus Skeleton ON / Angles
OFF is a clean connected skeleton; both ON shows all configured labels; Skeleton
OFF / Angles ON retains the independent checkbox state but deliberately renders
no labels because their visual anchors depend on skeleton joints. Neither toggle
mutates the other. Existing pill backgrounds, 10 px offsets, and arm-label
collision avoidance are retained.

## 8. Evidence-aware availability

The registry maps controls to explicit evidence requirements. Missing data never
creates fake visuals: controls are disabled and state the reason. Examples include
“No renderable pose data,” “No accepted contact evidence,” and “No world-locked
gates.” The separate Tracking Box remains disabled because current artifacts do
not persist a distinct tracking box; Crop Box is enabled only when its real crop
evidence exists.

## 9. Gates/zones controls

`gates` controls only the existing gate strokes/status labels. `zones` controls
only the Phase 6.3 green/blue/red world polygons. Both consume the same already-
resolved, atomically stabilized `startG`/`finishG`; no geometry is duplicated.
All four ON/OFF combinations are supported.

## 10. Contacts/steps controls

`contacts` owns accepted historical contact dots and the current contact/flight
foot presentation. `step_numbers` owns sequence numbers and calibrated distance
labels. The shared immutable contact list is still calculated once; visibility
does not recalculate or alter contact science. Either visual can render alone.

## 11. Consumer/developer modes

Consumer mode exposes only polished Athlete, Performance, and Course controls.
In non-production builds an explicit presentation button reveals Developer mode,
where crop, comparison-pose, and camera-motion diagnostics appear. Raw confidence
percentages were not added to consumer mode. Production consumer UI cannot expose
the developer group accidentally.

## 12. Default presentation

Defaults are deterministic: Skeleton, Contact Events, Step Numbers, Gates, and
Zones ON; Joint Angles, Center of Mass, Velocity, and every diagnostic OFF. This
preserves useful evidence while avoiding a wall of angle/COM/debug annotations.

## 13. State-management architecture

One `OverlayVisibility` record lives in `OverlaySurface` for the mount lifetime.
`toggleOverlayVisibility` changes exactly one key. `effectiveOverlayVisibility`
applies evidence availability without mutating user intent. UI reads registry
metadata and does not know drawing details. No state is persisted to the database,
and no toggle calls play, pause, seek, frame selection, or analysis actions.

## 14. Files changed

- `src/lib/video/worldVisualization.ts` — registry metadata, evidence contract,
  defaults, presentation filtering, availability, and pure state toggle.
- `src/components/video/OverlaySurface.tsx` — grouped accessible controls,
  evidence bridge, consumer/developer presentation, and single state model.
- `src/components/video/VideoOverlay.tsx` — unified skeleton ownership and
  independent visibility boundaries for angles, contacts/steps, gates/zones,
  COM/velocity, and diagnostics.
- `src/lib/video/overlayAvailability.ts` — compatibility helper updated to the
  registry IDs.
- `scripts/phase-6-4-overlay-controls-sanity.mjs` — 20 deterministic checks.
- `scripts/timing-verification-sanity.mjs` — existing availability assertions
  updated from removed legacy IDs to the authoritative IDs.
- `package.json`, this report, and roadmap.

### Agent-handoff provenance

- **Inherited:** Phase 6.1 media clock, Phase 6.2 world scene/stabilization,
  Phase 6.3 layers/polygons/primitives, render formulas, playback, and evidence.
- **Independently verified:** prior control coupling/defaults, angle ownership,
  renderer branches, all four scientific outputs, and Phase 6.1–6.3 invariants.
- **Corrected:** the prior Arms control duplicated skeleton lines and owned angle
  labels; the prior Step Marks and debug controls mixed independent concepts.
- **Changed personally:** only the Phase 6.4 files and behavior listed above.
- **Not personally validated:** real benchmark playback in a browser remains the
  Phase 6.2 codec blocker.

## 15. Database changes

None. Four calibration records were queried read-only for measurement replay. No
row, artifact, storage object, migration, or schema was mutated.

## 16. Deterministic tests

- Phase 6.4 overlay controls: **20/20 passed**.
- Phase 6.3 world visualization: **16/16 passed**.
- Phase 6.2 world lock: **23/23 passed**.
- Phase 6.1 overlay fidelity: **13/13 passed**.
- timing verification and analysis report sanity: passed.
- actual project typecheck, lint, and optimized production build: passed.

`worker:check` was run and reproduced its previously documented standalone
TypeScript path-alias compilation failure while compiling the worker entries.
Full project typecheck/build pass, and Phase 6.4 does not touch worker code. This
inherited failure is disclosed rather than called a pass.

## 17. Benchmark validation

The real unmodified production measurement functions were replayed read-only
against all four Phase 4.2K artifacts and current calibration evidence:

| Benchmark | contacts | zone time | combined step frequency | peak velocity | result |
|---|---:|---:|---:|---:|---|
| Gav | 9 | 1.92 s | 4.848484848484849 Hz | 11.092149424565784 m/s | byte-identical |
| Vanni 240 | 7 | 2.12 s | 3.103448275862069 Hz | 9.591178790487021 m/s | byte-identical |
| Vanni 120 | 8 | 2.19 s | 3.6206896551724137 Hz | 9.416358925269277 m/s | byte-identical |
| Vanni 60 | 10 | 2.40 s | 4.385953327434329 Hz | 10.881288775005759 m/s | byte-identical |

GCT, flight, and zone-step sequences also match the closed outputs.

## 18. Static visual review

Representative Gav/Vanni source and pose-adjudication frames were inspected.
The small long-distance Vanni athlete benefits from removing the duplicate arm
stroke and default angle labels. Whole-degree pill labels remain readable when
enabled; default-off angles produce the clean skeleton requested. Existing zone
alphas remain subtle, and contact colors remain visible against track footage.
The grouped menu language is direct and consumer mode is not overloaded.

This is static/source-frame review only. No 0.25×/0.5×/1×, scrub, resize, or
fullscreen claim is made because Phase 6.2's real `.mov` browser blocker remains.

## 19. Phase 6.4 acceptance table

| Criterion | Result |
|---|---|
| all controls inventoried | Pass |
| registry authoritative | Pass |
| arms/legs unified under Skeleton | Pass |
| Joint Angles independent | Pass |
| evidence-aware UI | Pass |
| consumer/developer separation | Pass |
| Gates/Zones independent | Pass |
| Contacts/Step Numbers independent | Pass |
| modular deterministic state | Pass |
| Phase 6.3 layers preserved | Pass |
| Phase 6.1 synchronization preserved | Pass |
| Phase 6.2 world lock preserved | Pass |
| scientific measurements unchanged | Pass |
| Phase 6.4 and inherited UI suites | Pass |
| roadmap honest | Pass |

The inherited `worker:check` limitation is recorded in Section 16 and does not
represent a Phase 6.4 overlay regression.

## 20. Roadmap progress

Phase 6.4 is **CLOSED** as an unweighted presentation phase. Weighted roadmap
completion remains **29.5%**. Phase 6.2 remains IN PROGRESS; closed phases remain
closed.

## 21. Remaining limitations

- Real browser playback validation remains blocked by benchmark `.mov` support.
- Tracking Box is reserved but unavailable until a distinct artifact exists.
- Camera debug remains a combined legacy diagnostic renderer internally, though
  it is isolated from consumer presentation.
- The Timing Workspace retains its separate authoring overlays by design.
- The inherited worker standalone alias failure remains.

## 22. Git status

No commit, push, or database reset was performed. The worktree was already
substantially dirty; unrelated changes were preserved.

## 23. Closure conclusions

1. Phase 6.4 is **CLOSED**.
2. Roadmap completion remains **29.5%** because Phase 6.4 is currently unweighted.
3. Phase 6.2 remains **IN PROGRESS** solely because of its browser-playback
   validation blocker.
4. AVA now has one authoritative overlay registry and one session-local overlay
   state model.
5. Skeleton is one unified control covering torso, arms, legs, and joints.
6. Separate consumer-facing arm and leg skeleton toggles must not return.
7. Joint Angles are independently controlled from Skeleton and default **OFF**.
   Enabling Skeleton does not automatically enable Joint Angles.
8. Contacts and Step Numbers remain independently controllable.
9. Gates and Zones remain independently controllable.
10. Evidence-unavailable overlays expose honest disabled/unavailable behavior
    rather than appearing broken.
11. Consumer controls remain separated from developer diagnostics.
12. No scientific calculations, timing, pose inference, localization,
    calibration, world transforms, or metrics changed.
13. Production measurement replays remain exactly: Gav
    **4.848484848484849 Hz**, Vanni 240 **3.103448275862069 Hz**, Vanni 120
    **3.6206896551724137 Hz**, and Vanni 60 **4.385953327434329 Hz**.
14. The documented `worker:check` limitation is pre-existing and unrelated: its
    standalone TypeScript path-alias compilation fails, full project compilation
    passes, and no worker code changed in Phase 6.4.

No Phase 6.5 work was begun.
