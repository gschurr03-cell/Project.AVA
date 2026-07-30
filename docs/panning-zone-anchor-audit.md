# Panning zone-anchor audit

Audit date: 2026-07-16

## Connected-surface stabilization audit

The connected yellow surface is created only in `VideoOverlay.tsx`. After start and
finish have each been propagated independently, the renderer joins their current
midpoints, calculates an artificial visual height as
`9 / distanceM * currentPixelSeparation`, constructs a quadrilateral, and fills it.
When the gates originate in different setup frames or only one physical location is
meaningfully visible, this derived quadrilateral stretches and rotates between two
unrelated projections.

The filled shape is presentation-only. It is not stored in the zone contract, is not
used by signed-plane crossing detection, and does not determine the physical distance.
The authoritative record already stores independent start/finish boundaries and a fixed
`distanceM`. No CSS, viewport clipping, crop transform, auto-follow transform, or
perspective interpolation constructs the polygon; the defect is the canvas fill block.

Stabilization decision: delete the connected fill and its distance label from the normal
overlay. Render only each short propagated gate when that line segment intersects the
source viewport. Preserve the infinite analytical line solely for signed crossing tests.
Legacy gate records remain readable through the existing source-frame migration adapter;
they do not regain a connected visual surface.

## Current coordinate path

1. `OverlaySurface.groundPointAtPointer` removes browser layout, video
   letterboxing, and display auto-follow transforms. The click becomes normalized
   original source-frame coordinates.
2. Four clicks are persisted in `sessions.calibration_gates` as two endpoint pairs
   plus one placement timestamp per bar. No setup frame, compensated anchor,
   propagation model, confidence, orientation, direction, or schema version is
   authoritative.
3. The MediaPipe runtime independently estimates background-feature partial-affine
   transforms from previous source frame to current source frame. These transforms
   are stored in the pose artifact as `cameraEvidence`.
4. The overlay loader validates the evidence but drops it before constructing the
   player. `VideoOverlay` instead recalculates a translation-only camera track from
   athlete stance-foot movement.
5. `gateFrameXAt` propagates only endpoint X. Endpoint Y, line orientation, and
   scale stay fixed at their setup-frame values. When that unrelated estimate is
   unavailable or classifies the clip as static, the gate is exactly screen-fixed.
6. Display auto-follow wraps both video and canvas and is visually separate, but
   the old analytical gate estimate is still athlete-derived. Detection crop data
   is correctly mapped back to source coordinates and is not intentionally used.
7. Measurement crossing reduces each bar to a midpoint and uses the legacy
   translation-only compensated athlete X series. It does not consume a propagated
   physical line, signed 2-D side test, affine confidence, or unsafe ranges.

## Coordinate-space contract

| Space | Definition | Authority rule |
| --- | --- | --- |
| Viewport | Browser pointer/layout coordinates | Input only; never persisted |
| Display video | Coordinates inside the displayed video picture after letterboxing | Projection only |
| Original source frame | Normalized/pixel coordinates in the immutable uploaded frame | Persist setup endpoints here |
| Dynamic crop | Detection-only MediaPipe ROI | Never use for boundary motion |
| Camera compensated | Frame-zero reference obtained by composing/inverting production background affine transforms | Authoritative anchor identity |
| Ground/world anchor | Persisted line attached to a physical marking, represented in compensated coordinates with setup evidence | Timing authority |
| Physical distance | User-confirmed metres between start and finish planes | Fixed; never inferred from current screen separation |

Display auto-follow and dynamic crop are presentation/inference conveniences and must
never participate in ground-anchor propagation or crossing detection.

## Implementation decision

Preserve the production camera model and its emitted artifact. Introduce one versioned
ground-boundary contract and explicit transform helpers around that evidence. A transform
at frame `i` maps original source frame `i-1` to original source frame `i`; forward
propagation composes in ascending order and backward propagation composes inverses.

The same contract covers static video: identity transforms leave the source endpoints
unchanged. Propagation never clamps endpoints. Low support/confidence, excessive residual,
or an unsafe frame range makes the crossing unavailable; there is no screen-fixed fallback.

## Production blockers selected for implementation

1. Preserve `cameraEvidence` through the overlay loader.
2. Add explicit affine composition/inversion and ground-anchor propagation.
3. Persist setup frame/time, endpoints, compensated endpoints, model/schema versions,
   direction, confidence, and physical reference for independent start/finish frames.
4. Render the complete propagated line and expose confidence/unsafe diagnostics.
5. Route zone crossing through the propagated analytical plane and fail closed when
   propagation is unsafe.
6. Add deterministic left/right/static/crop/follow/out-of-view/crossing regressions and
   a real-fixture alignment diagnostic without changing FPS or metric-trust policy.

## Completed implementation

- Added `ava-ground-anchor-v1`, storing independent start/finish setup frame and
  timestamp, normalized source endpoints, frame-zero compensated endpoints, user
  selection evidence, signed crossing side, model version, confidence, body reference,
  direction, fixed physical distance, and zone version.
- Added explicitly named previous→current affine forward/inverse helpers and propagation
  through the production `ava-background-affine-v1` evidence. Endpoints, midpoint,
  orientation, and scale propagate; output is never clamped to the viewport.
- Preserved source-frame indices through the overlay adapter and preserved raw camera
  evidence through the artifact loader. Analysis crop and display auto-follow are not
  inputs to anchor propagation.
- Replaced new-zone rendering with full partial-affine propagation. Unsafe lines render
  red/dashed with confidence; production timing has no screen-fixed fallback.
- Added editor actions for setting/editing start and finish on independent frames,
  live propagation preview, versioned save, and engineering camera/crop/anchor diagnostics.
- Added signed 2-D infinite-plane crossing with real timestamps and sub-frame
  interpolation. A crossing is withheld if any required transform is missing, lacks
  feature support, has excessive residual, or falls in an unsafe range.
- Static recordings use the same contract. Identity evidence leaves endpoints unchanged.

## Real panning fixture validation

The protected source remains outside the repository. Existing user selections were the
painted 30 m start/finish references at source frames 72 and 170. Ten original-resolution
manual annotations cover beginning, early, middle, late, and near-crossing views.

| Result | Value |
| --- | ---: |
| Mean midpoint error | 7.60 px |
| Maximum midpoint error | 15.26 px |
| Mean endpoint error | 9.20 px |
| Maximum angular error | 0.93° |
| Minimum annotated propagation confidence | 0.682 |
| Start crossing bracket | frames 99–100, safe |
| Finish crossing bracket | frames 166–167, safe |

The roughly 15 px start error is a stable source-selection offset: it is already present
on the setup frame and varies by less than one pixel over the five annotated frames. It is
not accumulated camera drift. The finish midpoint error remains below 0.5 px over its five
frames. The generated private diagnostic strip is
`/tmp/ava-zone-anchor-diagnostic.jpg` (green propagated, magenta manual).

The fixture was upgraded without changing its source path or 30 m physical distance.
Analysis V7 captured the immutable anchor definition and completed with its own pose
artifact. The 2.77 external value remains unvalidated because its historical boundary and
timing definitions are still unknown; this pass validates physical anchor propagation,
not that external timing claim.

## Validation completed

Passed: zone-anchor fixture diagnostic, zone-anchor sanity, panning sanity, camera sanity,
gates sanity, overlay-alignment sanity, calibration sanity, metric-trust sanity,
experimental-30fps sanity, analysis-fps sanity, worker-analysis sanity, fullrun sanity,
typecheck, lint, production build, and `git diff --check`.

The existing `VideoOverlay` exhaustive-deps warning, deprecated `next lint` command, and
Supabase Edge Runtime build warning remain pre-existing debt.

## Render-path regression: manual-confirmed zones drifted with the athlete (fixed)

After the audit above routed NEW-zone rendering through the authoritative background
model, a later change added an authority-first render directive (`selectRenderableGateGeometry`
→ `mode: "canonical_raw"`) so a **manual-confirmed** zone would draw from its exact persisted
`c1/c2` and never post-save-shift. That directive was wired in `VideoOverlay` to the
`barGeom` helper — which reprojects through `gateFrameXAt(…, cameraTrack, …)` where
`cameraTrack = estimateCameraMotion(frames)`. That is precisely the **athlete-derived**
stance-foot estimate this audit had already identified as the defect (point 4/5 of "Current
coordinate path"). So confirmed zones silently regressed to athlete-anchored rendering:

- `renderedX = storedX + cameraOffset(placementTime) − cameraOffset(currentTime)`, where
  `cameraOffset` accumulates per-frame stance-foot deltas.
- With a **static real camera** but a **moving athlete**, `estimateCameraMotion`'s
  static-travel guard only fires when the athlete crosses ≥ 40 % of the frame. On a wide
  zone / partial view the guard does not fire, the stance-foot bias accumulates a phantom
  pan, and the confirmed gate slides off its painted line **with zero user interaction** —
  the reported drift.

**Why persistence tests missed it.** `zone-anchor-sanity` exercises the *authoritative*
`propagateAnchorFromSetupToFrame`/`sourcePointToCompensated` model directly (and it is
correct); the calibration-authority/persistence tests prove the *stored* `c1/c2` are
immutable across save/refresh/rerun. Both are true — but neither connected the confirmed
zone's **render projection** to a fixed world landmark across frames, so an athlete-derived
projection over immutable coordinates passed every check.

**Fix.** `canonical_raw` now reprojects the immutable canonical anchor to the current source
frame through the authoritative camera evidence only — via `reprojectSourceLineToFrame`
(raw-endpoint sibling of `propagateAnchorFromSetupToFrame`) — with an **identity** fallback
(draw at the raw stored source coordinate) when evidence is absent. It never consults
`cameraTrack`/`estimateCameraMotion`. It is exact at the setup frame (no post-save shift),
compensates a genuine pan/zoom elsewhere, and — because a static camera emits identity
transforms — a moving athlete can no longer move a confirmed zone. Both endpoints (x and y)
propagate, not X alone.

Regression coverage: `scripts/timing-zone-world-anchor-sanity.mjs` asserts, on identical
inputs (static camera + moving athlete), that the OLD athlete-derived path drifts (> 0.01)
while the NEW authoritative path is numerically stable, plus setup-frame identity, genuine-pan
world anchoring, round-trip edit, resize invariance, shared transform, and canonical
immutability. Run: `node scripts/timing-zone-world-anchor-sanity.mjs`.

## Known limitation

The current production evidence stores aggregate feature support and the fitted affine,
not individual background feature trajectories, so diagnostics show feature count,
residual, transform vector, crop, athlete path, and manual-vs-predicted alignment but
cannot draw every RANSAC feature track. Full projective homography remains future work.
Timing is withheld when affine evidence is unsafe rather than silently degrading.

## Independent-gate stabilization completion

- Removed the only production connected-zone canvas block: no fill, corridor,
  trapezoid, midpoint connection, or viewport-centered distance label remains.
- Added independent-gate aliases (`gateId`, `type`, physical orientation, signed side,
  immutable version) while retaining the original v1 names for historical readability.
- Added explicit zone metadata (`startGateId`, `finishGateId`,
  `zoneDistanceMeters`, direction, body reference, version). Distance is never derived
  from current screen separation.
- Added unclamped line/viewport intersection testing. Each rigid gate is independently
  rendered only when its own segment intersects the source viewport.
- The visible short segment is presentation-only. The separately propagated infinite
  analytical plane continues to provide the two signed crossing events; polygon
  containment is absent from the timing path.
- Added migration 0028 to mark connected visualization deprecated and backfill the
  independent gate/distance aliases on current v1 draft records without changing
  immutable analysis snapshots.

The expanded protected-fixture strip covers frames 15, 72, 100, 130, 165, 167, and
195. It confirms: neither gate visible before start; only start around the start mark;
neither gate in the middle; only finish as it enters and is crossed. No connecting
surface is generated. See `/tmp/ava-independent-gates-diagnostic.jpg`.

Independent alignment results:

| Gate | Mean midpoint | Mean endpoint | Max angle | Drift range | Min confidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start | 14.91 px | 15.26 px | 0.93° | 0.70 px | 0.718 |
| Finish | 0.30 px | 3.14 px | 0.70° | 0.45 px | 0.682 |

The trusted nominal-60 static control was rerun as Analysis V15
`27b1aa27-20be-400a-9310-4f9f2fbd695b`. It exactly retained `static_precision`,
camera confidence `0.988414818506334`, athlete tracking confidence
`0.802061411268521`, `no_meaningful_zoom`, `eligible` spatial status, source FPS
`59.15864276221215`, and the 60 FPS analysis clock. It completed with a new immutable
artifact. No timing calculation or FPS/trust policy changed.

## Confidence-threshold/grace-period conflict resolved; affine-only decision documented

A later change lowered `MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE` from `0.45` to `0.2` and
added a bounded "brief degradation" tolerance (`MAX_SAFE_ANCHOR_DEGRADED_FRAMES`) to
`propagateSourcePoint`, without measured evidence for the lower value. The pre-existing,
untouched `scripts/zone-anchor-sanity.mjs` regression — which asserts confidence `0.2`
must withhold a crossing — started failing.

Root cause was not only the constant. The new tolerance branch left `confidence`
at its initial value (`1`) whenever a degraded transform fell within the tolerance
window, so a single low-confidence frame silently reported back as full confidence
and `safe: true` to every downstream consumer, regardless of what
`MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE` was set to. Restoring `0.45` alone did not
fix the failing test; it was verified experimentally (a standalone probe against a
copy of the pre-fix function) that the crossing still succeeded with the threshold
restored, because the tolerance branch never actually consulted the threshold at all
during a brief hold.

Fix, in `src/lib/calibration/zoneAnchors.ts`:

- `MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE` restored to `0.45`, its long-standing,
  independently-tested value. No evidence in this repository supports `0.2`; per the
  accuracy manifesto's conservative-uncertainty principle, the safer existing value
  applies.
- `propagateSourcePoint` now updates `confidence` unconditionally on every inspected
  transform (never masked during a tolerated hold), and a degraded-but-brief frame
  contributes **zero motion** — position freezes exactly where the last reliable
  frame left it, rather than either (a) composing with the current untrusted
  transform, as before this pass, or (b) an earlier draft of this fix that
  re-applied the last reliable transform's own delta on every subsequent degraded
  frame, which was caught by a new regression test in this pass
  (`scripts/zone-anchor-sanity.mjs`, "a tolerated hold freezes...") and would have
  re-accumulated real movement once per held frame. This makes "brief degradation
  may use a strictly bounded last-reliable transform" literal — a blip can now
  never inject any guessed movement, verified or not.
- A new `allFramesReliable` field on `propagateSourcePoint`'s return closes a
  second gap the same new boundary tests found: a held/degraded transform can
  report high raw `confidence` while still failing on feature count, inlier
  ratio, or residual, and the old `confidence >= MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE`
  check alone did not catch that. `propagateAnchorFromSetupToFrame` and
  `reprojectSourceLineToFrame` now additionally require `allFramesReliable` on
  both endpoints before a crossing-relevant line is considered safe. The
  lower-level "not yet fatal" grace window (governed by
  `MAX_SAFE_ANCHOR_DEGRADED_FRAMES`) is unchanged and still exists specifically to
  avoid treating a single motion-blur frame as total tracking loss; it now simply
  freezes position during that window instead of extrapolating through it.
- All five world-anchor thresholds now carry an inline comment stating what they
  control, why the value is conservative, and whether it is backed by a real fixture,
  a synthetic test, a frame-rate derivation, prior historical behavior, or is a
  temporary MVP default — per the manifesto's "permit no hidden assumptions" rule.

Separately, the worker's camera model was changed from homography-with-affine-fallback
to affine-only (`estimate_background_transform` in `mediapipe_pose_runner.py`). This is
not an unexamined simplification: `docs/local-physical-gate-lock.md`'s "Model
comparison" table already measured this on the one real panning fixture in the repo
(`real-side-pan-fly-001`, 10 independent annotations) and found full homography *less*
accurate than partial affine (8.36px vs 7.40px mean midpoint error, 9.59px vs 9.10px
mean endpoint error, 1.36° vs 1.22° max angle) — composing a projective fit amplified
perspective-coefficient noise into more drift, not less. Homography was explicitly not
adopted there either. Affine-only is therefore consistent with the strongest existing
real-world evidence, not merely a convenient default.

MVP limitation, stated explicitly per the manifesto's "permit no hidden assumptions"
rule: affine (translation + rotation + uniform scale) is validated for horizontal
sideline pans with modest scale/rotation change. It is **not** validated for strong
forward/back (dolly) motion, large true perspective shifts, curved/arcing camera
movement, or large optical zoom changes — those would need either a re-run of the same
measured comparison against footage of that type, or the repo's own hybrid global/local
gate-lock model (measured 2.41px mean midpoint error on the same fixture, the best of
the four models compared, but a materially larger per-gate subsystem out of scope for
this pass) before being reconsidered. Worker and browser are consistent going forward:
the worker only ever emits `transformType: "partial_affine"` now; the browser's
`zoneAnchors.ts` still contains a `transformType === "homography"` branch purely for
backward compatibility with any historical artifact, and falls through to the same
affine math for everything the worker currently produces — this is dead-for-new-data
compatibility code, not a live second model.

Also fixed: `VideoOverlay.tsx`'s in-progress (pending, unconfirmed) gate-placement cones
previously fell back to drawing at their raw, unprojected click coordinate whenever
panning camera evidence was absent. In panning mode that coordinate is only valid on the
frame it was clicked on — once the camera has panned, drawing it elsewhere silently
implies a stale/false location, which is exactly the screen-locked-fallback failure mode
this audit's coordinate-space contract prohibits. Pending cones are now reprojected
through the same reliability bar (`MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE` plus the
feature/inlier/residual checks) a saved gate's crossing would need; when that bar isn't
cleared the cone is hidden and a non-positional "Camera tracking unavailable" notice is
drawn instead of any specific screen coordinate. Stationary mode is unaffected (the raw
point is always valid there). The underlying click state (`pendingRef.current`) is never
touched by this — only what gets drawn changes, so in-progress placement survives a
temporary tracking gap.

Also fixed: a missing/invalid intrinsic source-video width or height previously
collapsed into the generic `"Invalid calibration gates"` schema-validation message in
`saveGateCalibration` (`src/app/sessions/actions.ts`). It is now checked explicitly,
before the general `calibrationGatesSchema` parse, and redirects with the distinct
message `"Source video dimensions are unavailable. Wait for the video to finish loading
and try again."` The schema's own `sourceFrameWidth`/`sourceFrameHeight` positivity
requirement is unchanged — this is an earlier, friendlier check in front of it, not a
replacement for it.

Known, deliberately out-of-scope observation from this pass: the manual-confirmed
`canonical_raw` render path (`canonicalGeom` in `VideoOverlay.tsx`, via
`sourceLineToCanonicalWorld`/`projectCanonicalWorldLine` in `worldProjection.ts`) marks
a gate `safe` based only on `propagateSourcePoint`'s raw "not yet fatally lost" flag, not
on `confidence >= MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE` the way
`propagateAnchorFromSetupToFrame`/`reprojectSourceLineToFrame` do. This does not affect
timing safety — `detectWorldBoundaryCrossing` goes through the stricter
`propagateAnchorFromSetupToFrame` path regardless of what the confirmed-gate overlay
renders — but it means a confirmed gate's on-screen red/dashed "degraded" styling may
under-report during a brief, tolerated hold. Left unchanged pending a deliberate decision
on whether visual styling should adopt the stricter bar too.
