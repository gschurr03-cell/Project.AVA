# Phase R2B — Exact Gate Geometry + Longitudinal Coordinate Origin Audit

**Status: evidence-first audit COMPLETE. No production code changed.**

## 1. Executive summary

This phase audited, end-to-end, exactly what a "gate" is in Project AVA — from
the workspace's draggable circles/bar through the calibration schema to the
scientific crossing math and the R2 presentation band — to establish one
unambiguous longitudinal (along-travel) coordinate foundation for future
distance/step-length/velocity math. Finding: **the gate is, and has only ever
been, a single lane-width LINE at every layer** (workspace UI, calibration
schema, scientific crossing detection). No along-travel depth/thickness field
exists anywhere. The scientifically correct origin is the **midpoint** of
that line, exactly as the user specified — proven deterministic and
computable to full floating-point precision for all 4 real benchmarks,
directly from live `calibration_gates` records (read-only DB query, no row
mutated).

Separately, R2's current green/red presentation band width
(`clamp(flySpan×0.12, 24, 140)px`) was found to be **6–7× wider than the
workspace's own gate drag-handle (16px) and 24–28× wider than the gate bar's
own render stroke (4px)** — quantified per-benchmark. Recommendation:
**Option B, AUTHORITATIVE_PRESENTATION_WIDTH** — no existing scientific or
workspace visual width can be reused (Option A is unavailable), and building
a genuine physical gate band (Option C) requires the not-yet-built
four-boundary calibration model (roadmap Phase 10, explicitly Not Started).
No code was changed to act on this recommendation — it is documented for a
future R2C, per this task's explicit "do not implement" instruction.

## 2. Exact workspace gate model

`GateBar` (`src/lib/calibration/gates.ts`): `{c1, c2, timeS, setupFrameIndex?}`.
`c1`/`c2` are the coach's two cone clicks, normalized `[0,1]` **source image**
coordinates, spanning **lane width** (perpendicular to the running direction)
— confirmed by the module's own doc comment ("a bar drawn cone-to-cone across
the lane") and by the workspace UI itself (Section 3). `gateMidpoint(bar)`
reduces the bar to one point: `{x: (c1.x+c2.x)/2, y: (c1.y+c2.y)/2}` — the
gate's single representative longitudinal position.

`GroundBoundary` (`src/lib/calibration/zoneAnchors.ts`) — the world-lock/
panning-camera variant — wraps the SAME `{c1, c2}` line as `sourceFrameLine`
(verified byte-identical to `GateBar.c1`/`c2` via a real DB read of Vanni
240's `calibration_gates.startBoundary`), adding only propagation metadata
(`groundAnchorVersion`, `propagationModelVersion`,
`physicalLineOrientationDeg` — the bar's own cross-lane tilt angle, a
**different** quantity from the running-axis tilt this phase computes in
Section 6). No second longitudinal boundary exists in either type.

## 3. UI-to-data gate trace

Full trace with real field names: `tmp/phaseR2B/gate-ui-to-data-trace.json`.
Summary, `src/app/sessions/[id]/timing/TimingWorkspace.tsx`:

- **Bar** (line 680): `<line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y}
  strokeWidth="4" vectorEffect="non-scaling-stroke"/>` — a straight line
  between the two cone points, constant ~4 CSS px render thickness at any
  zoom (perpendicular thickness of the drawn stroke, not an along-travel
  measurement).
- **Circles** (lines 691–697): draggable `<button>` handles,
  `className="h-4 w-4 rounded-full"` (16×16 CSS px), positioned **exactly**
  at `c1`/`c2` — zero along-travel offset from the bar's own endpoints. Pure
  drag affordances, not a physical gate dimension.
- **Stored calibration**: `calibration_gates` jsonb column on `sessions`
  (`src/app/sessions/actions.ts`), written via `saveGateCalibration`/
  `saveGateCalibrationAction`.
- **Scientific consumption**: `measurements.ts`'s `gatesToManualPoints()`
  reduces both gates to `{ax, ay, bx, by, distanceM}` (gate midpoints); the
  metersPerPixel **scale** uses only the X-component
  (`|ax−bx| × frameWidth`); zone-entry/exit crossing is a torso-X-track
  line-crossing test (or, for panning footage with world-lock evidence, a
  `detectWorldBoundaryCrossing` test against the propagated boundary
  **line**) — never a region/band-membership test, at any point in the
  pipeline.

## 4. Start midpoint definition

`START_MIDPOINT = gateMidpoint(calibration_gates.startGate)` — computed in
normalized source-image coordinates, denormalized to source pixels via
`× sourceFrameWidth` / `× sourceFrameHeight`. Verified deterministic (same
input → byte-identical output) for all 4 real benchmarks
(`tmp/phaseR2B/benchmark-midpoints.json`, Part Q check #1).

| Benchmark | c1 | c2 | Midpoint (normalized) |
|---|---|---|---|
| Gav | (0.14204, 0.60897) | (0.16119, 0.60514) | (0.15162, 0.60705) |
| Vanni 240 | (0.11869, 0.59053) | (0.15486, 0.58667) | (0.13677, 0.58860) |
| Vanni 120 | (0.08585, 0.58970) | (0.12570, 0.58672) | (0.10577, 0.58821) |
| Vanni 60 | (0.06066, 0.59503) | (0.10219, 0.59009) | (0.08143, 0.59256) |

## 5. Finish midpoint definition

`FINISH_MIDPOINT = gateMidpoint(calibration_gates.finishGate)`, same
construction. Verified deterministic for all 4 benchmarks (Part Q check #2).

| Benchmark | c1 | c2 | Midpoint (normalized) |
|---|---|---|---|
| Gav | (0.86805, 0.60581) | (0.88810, 0.60839) | (0.87808, 0.60710) |
| Vanni 240 | (0.86322, 0.58604) | (0.90065, 0.58990) | (0.88194, 0.58797) |
| Vanni 120 | (0.89624, 0.58972) | (0.93749, 0.59461) | (0.91686, 0.59217) |
| Vanni 60 | (0.92406, 0.59641) | (0.96840, 0.60329) | (0.94623, 0.59985) |

All four sessions: `travelDirection: "left_to_right"`, `distanceM`/
`zoneDistanceMeters: 20` (session-configured, read live, never hardcoded).

## 6. Running-axis definition

Full data: `tmp/phaseR2B/running-axis.json`. Two candidate models were
compared:

- **Production (today)**: 1D, X-axis-only. `metersPerPixel = distanceM /
  (|startMid.x − finishMid.x| × frameWidth)`. Direction/scale ignore the Y
  component entirely.
- **Proposed (Part F)**: 2D. `D = finishMidPx − startMidPx; u = D/|D|`,
  `metersPerPixel = distanceM / |D|`.

These are **not exactly equivalent** — real gate placements are not
perfectly horizontal (the coach doesn't click pixel-identical heights for
both gates). Quantified gate tilt and the resulting divergence, all 4
benchmarks:

| Benchmark | Running-axis tilt from horizontal | Zone length under 2D model (at production's scale) | Divergence from configured 20m |
|---|---:|---:|---:|
| Gav | 0.0021° | 20.000000 m | 0.000000 m (0.0000%) |
| Vanni 240 | −0.0274° | 20.000002 m | 0.000002 m (0.0000%) |
| Vanni 120 | 0.1572° | 20.000075 m | 0.000075 m (0.0004%) |
| Vanni 60 | 0.2714° | 20.000224 m | 0.000224 m (0.0011%) |

The divergence is real but negligible for current real footage (max
0.0011%). This is an honest inequivalence, not rounding noise: it would grow
if a gate were ever placed with deliberate vertical offset (e.g. a camera
angle where the two gates sit at visibly different screen heights).

## 7. Continuous longitudinal coordinate design (not yet wired to science)

```
D = finishMidpointPx − startMidpointPx
u = D / |D|
s(P) = dot(P_px − startMidpointPx, u) × metersPerPixel
```

`s(startMidpoint) = 0`, `s(finishMidpoint) = zoneLengthMeters`, by
construction, for ANY travel direction (left-to-right or right-to-left) —
proven for both orderings (Part Q checks #4–6; reversing which gate is
"start" flips `u`'s sign but `s(start)=0`/`s(finish)=zoneLength` still hold
exactly). Full design: `tmp/phaseR2B/longitudinal-coordinate-design.json`.

## 8. Zone-length anchoring

`tmp/phaseR2B/zone-length-comparison.json`. Production's derived zone length
matches the configured value **exactly**, by algebraic construction —
`metersPerPixel` is *defined* as `configuredZoneLengthM / pixelGapX`, so
`pixelGapX × metersPerPixel = configuredZoneLengthM` is a tautology, not an
empirical result. The true 2D geometric distance between the midpoints
(Section 6) is what would differ from the configured length under a
2D-axis model, for the reason given there.

## 9. Centimeter interpretation

Internal storage/calculation stays IEEE-754 double precision always;
`Math.round(m * 100)` is explicitly rejected as a storage representation.
`metersToCentimeters(m) = m * 100` is a **display-only** conceptual helper —
verified: `6.234 m × 100 = 623.4 cm` retains full precision (Part Q check
#7), and the internal coordinate function contains no `Math.round` call
anywhere (Part Q check #8).

## 10. Future step-length equation

`L = sB − sA` (direction-aware); `stepLengthMeters = L`;
`stepLengthCentimeters = 100L`. **Not mathematically identical to current
production** — production computes step distance as a full 2D Euclidean
`Math.hypot` between consecutive world-compensated contact positions
(capturing lateral/vertical foot-strike variation), while the proposed `s(P)`
model is a strict 1D projection onto the running axis only. For real running
form (feet don't land exactly on the centerline), the two would differ by a
small, unevaluated-in-this-phase amount. **Not rewritten this phase.**

## 11. Future velocity equation

`v = Δs / Δt`. Production's velocity methods are already conceptually
`Δdistance/Δtime` — the same shape — but whether they're numerically
identical to a pure `s(P)`-based version depends on the same 2D-vs-1D
step-length caveat above. **Partially equivalent conceptually; not proven
numerically identical; not rewritten this phase.**

## 12. Future contact/time/frequency dependency map

See `tmp/phaseR2B/longitudinal-coordinate-design.json`'s
`futureDependencyMap`: CONTACT (unchanged), STEP_TIME = `t(i+1)−t(i)`,
STEP_FREQUENCY (unchanged today's definition), CONTACT_TIME =
`toeOff(i)−touchdown(i)` (unchanged), FLIGHT_TIME (unchanged), STEP_LENGTH =
`s(i+1)−s(i)` (future), VELOCITY = `Δs/Δt` (future), ZONE_TIME (unchanged).

## 13. Current green/red band-size problem

R2's `clamp(flySpan×0.12, 24, 140)px` band is tied to the **fly span** (an
unrelated quantity — the distance between the two gates), not to the gate's
own visual size — producing inconsistent-looking results purely because
zone lengths differ in screen space, and producing bands far larger than
anything the workspace itself ever depicts as "the gate." Quantified at a
real 1092px reference display width (`tmp/phaseR2B/current-band-width-audit.json`):

| Benchmark | R2 band width | % of frame | vs. workspace handle (16px) | vs. workspace bar stroke (4px) |
|---|---:|---:|---:|---:|
| Gav | 95.2px | 8.7% | 5.9× wider | 23.8× wider |
| Vanni 240 | 97.6px | 8.9% | 6.1× wider | 24.4× wider |
| Vanni 120 | 106.3px | 9.7% | 6.6× wider | 26.6× wider |
| Vanni 60 | 113.3px | 10.4% | 7.1× wider | 28.3× wider |

## 14. Whether an existing gate visual width exists

**No.** Audited every candidate the task named: circle marker radius (16px
drag handle — a UI affordance sitting exactly on the line's own endpoint,
not an along-travel size), bar thickness (4px SVG stroke — perpendicular
render thickness only), handle geometry (same as circles), calibration UI
geometry (the dashed "search window" diagnostic overlay — screen-space
percentage padding for gate-search visualization, unrelated to gate
physical size), stored visual-size metadata (none — `calibration_gates`
schema has no such field, confirmed by full-object DB read). Full detail:
`tmp/phaseR2B/workspace-gate-visual-bounds.json`.

## 15. Exact R2C recommendation

**Option B — AUTHORITATIVE_PRESENTATION_WIDTH.** No existing scientific or
workspace-visual width exists to reuse (rules out Option A). Faking a
physically meaningful longitudinal gate band would misrepresent geometry
that genuinely doesn't exist in the calibration model (rules out silently
doing Option C); a true four-boundary scientific gate model is legitimate
future scope (roadmap Phase 10, "Four-boundary green/blue/red zone system,"
explicitly Not Started/0%) and must not be faked here. The recommended next
step for a future R2C: replace the fly-span-relative `×0.12` heuristic with
one explicit presentation constant tied directly to the gate's own
rendering (e.g., a fixed multiple of the existing gate-line's own stroke
weight, or a fixed CSS-pixel constant independent of fly span) so the band
means "this is the gate marker," consistently, across every benchmark,
rather than "this is 12% of an unrelated distance." **Not implemented this
phase**, per explicit instruction.

## 16. Cross-benchmark geometry summary

`tmp/phaseR2B/cross-benchmark-summary.json` — no benchmark-specific
constant anywhere in the audit; the same formulas apply uniformly to all 4.

## 17. Files changed

**None in `src/`.** New, audit-only additions:

- `scripts/phase-r2b-gate-origin-audit.mjs` — real DB-sourced midpoint/axis/
  zone-length computation.
- `scripts/phase-r2b-band-width-audit.mjs` — band-width-vs-workspace-visual
  quantification.
- `scripts/phase-r2b-sanity.mjs` — 14 forensic tests.
- `docs/phase-r2b-exact-gate-geometry-and-longitudinal-origin-audit.md` (this
  file).
- `tmp/phaseR2B/` — all 8 required JSON deliverables.

## 18. Tests

`scripts/phase-r2b-sanity.mjs` — **14/14 passing**: midpoint/axis
determinism (1–3), origin contract in both travel directions (4–6), cm
precision and no internal rounding (7–8), proposed step-length/velocity
formula determinism (9–10), current scientific outputs/contacts/timing
unchanged against a real production rerun (11–13), current calibration
files untouched by this phase (14).

## 19. Scientific regression

Zero production files changed this phase, so this is expected to be (and
was verified to be) a no-op regression: `phase-r2-zone-band-visualization-sanity.mjs`
18/18, `phase-r1c-contact-render-alignment-sanity.mjs` 17/17, Phase 6.2
23/23, Phase 6.6C 13/13, timing-verification-sanity PASS, zone-step-counting-sanity
25/25, measurement-recovery-sanity PASS, `npm run typecheck` clean, `npm run
lint` clean (0 warnings), `npm run build` clean production build (stop
dev → build → restart dev sequence followed).

One pre-existing, **not caused by this phase** failure:
`phase-6-3-world-visualization-sanity.mjs`'s `transformSource:
"global_camera_path"` occurrence-count assertion (expects 3, finds 6) —
confirmed via mtime that `VideoOverlay.tsx` (the file that check reads) was
last modified during the earlier R1C phase, before this phase started; this
traces to the same stationary/panning zone-overlay branch duplication the
R0-R2 doc already documented for the analogous `phase-6-4` staleness. Not
fixed here (out of this audit-only phase's scope).

## 20. Anything not personally validated

- Whether current production step-length/velocity are numerically identical
  to the proposed `s(P)`-based formulas for real lateral-foot-placement
  variation — explicitly deferred (Sections 10–11), not computed this
  phase.
- Real-world validation of the recommended R2C band-width redesign — not
  implemented, so nothing to validate yet.
- The four-boundary scientific gate model (roadmap Phase 10) — confirmed
  absent, not built here.

## 21. Git status

No commit, push, `db:reset`, or database mutation. `calibration_gates` was
queried **read-only** via the service-role client for all 4 benchmark
sessions (Section 5/6 tables) — no row written. Worktree remains
intentionally dirty with all prior phases' uncommitted work preserved.

## 22. Phase status: COMPLETE (audit only)

**DO NOT START R2C. DO NOT START R3. DO NOT IMPLEMENT THE MATHEMATICAL
MEASUREMENT ENGINE. STOP AFTER R2B.**
