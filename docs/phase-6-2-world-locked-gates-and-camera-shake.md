# Phase 6.2 — World-Locked Gates and Camera-Shake Compensation

**Date:** 2026-08-07  
**Status:** CLOSED — implementation, scientific validation, and real browser playback validation complete  
**Roadmap:** 29.5% (unchanged; Phase 6.2 has no assigned weight)

## 1. Executive summary

Stationary mode previously meant “draw the stored gate at a fixed screen/source
coordinate.” That bypassed real background transforms and could not compensate
wind/tripod motion. In addition, the inherited 0.75-CSS-pixel deadband operated
independently on each endpoint and each gate, so it did not enforce a rigid zone.

The display renderer now uses existing background/world evidence for stationary
and panning recordings. Confirmed gates prefer the existing pre-resolved global
camera path (direct setup-frame→global→current-frame lookups, no browser chain
accumulation). One 0.5-source-pixel decision holds or accepts all four gate
endpoints atomically. Larger real movement passes immediately; there is no EMA or
delayed display interpolation. Scientific gate propagation and every timing/
measurement function remain unchanged.

All four real production metric replays are byte-identical. Twenty-three new
deterministic checks and the relevant existing suites pass, except the known
registry weight-total failure and an inherited worker standalone-compile path
alias failure. Phase closure is withheld because installed Chromium cannot decode
the existing benchmark `.mov` sufficiently to complete actual playback testing.

## 2. Roadmap status

Phases 4.2, 5.0E, and 6.1 remain CLOSED. Phase 6.2 receives no invented weight.
Weighted completion remains **29.5%**, including the existing 112-point pool
discrepancy. Phase 6.3 was not started.

## 3. Current gate architecture

| Stage | Module/function | Coordinates/provenance | Behavior | Role |
|---|---|---|---|---|
| Coach input | `TimingWorkspace` / save actions | normalized source points; setup time/frame | user-confirmed | scientific authority |
| Calibration artifact | `gates.ts`, `authority.ts` | immutable c1/c2, reference/setup frame, revision | no smoothing/prediction | scientific |
| Reference/world gate | `worldProjection.ts`, `cameraPath.ts` | setup source → global reference | background transform only | shared source evidence |
| Per-frame scientific gate | `propagateAnchorFromSetupToFrame` | target source frame; confidence/reliability | ≤6-frame bounded hold; unsafe thereafter | scientific |
| Crossing | `detectWorldBoundaryCrossing`, `measurements.ts` | torso vs propagated boundary, source timestamps | existing interpolation unchanged | scientific |
| Display gate | `VideoOverlay.tsx` | global/current source → CSS canvas | display-only atomic deadzone | visual only |
| Canvas | `coordinates.ts`, Phase 6.1 media clock | CSS px + DPR backing store | subpixel, no rounding | visual only |

No display geometry feeds back into crossing or metrics. Scientific gate geometry
is not stabilized by the new display code. The worker’s pre-existing background
transform EMA remains inherited upstream behavior and was not changed here.

## 4. Camera-motion architecture

`estimate_background_transform` uses Shi–Tomasi
`goodFeaturesToTrack` (300 corners), pyramidal Lucas–Kanade optical flow, a
conservative expanded athlete exclusion mask, and RANSAC
`estimateAffinePartial2D`. The model is translation + rotation + uniform scale.
Persisted evidence includes confidence, supporting feature count, inlier ratio,
median reprojection residual, and transform type.

The worker globally resolves a keyframe graph in `camera_path.py`. Reliable local
steps require confidence ≥0.45, ≥12 features, and residual ≤4 px. Lost segments
fail closed; ORB/RANSAC relock requires distributed background matches. Browser
gate rendering now prefers this O(1) global path. Athlete pose is not an estimator
input; its box is used only to exclude the athlete from feature detection.

| Benchmark | reliable transform % | confidence p50/p95 | features p50 | inlier p50 | residual p50/p95 px | rejected | bounded-held |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gav | 99.296 | .996/.999 | 300 | 1.000 | .017/.029 | 1 | 1 |
| Vanni 240 | 99.902 | 1.000/1.000 | 300 | 1.000 | .002/.064 | 1 | 1 |
| Vanni 120 | 99.793 | .995/.999 | 300 | 1.000 | .024/.079 | 1 | 1 |
| Vanni 60 | 99.571 | .994/.999 | 300 | 1.000 | .024/.102 | 1 | 1 |

## 5. Source-pixel shake audit

Real decoded background features, excluding each athlete box, prove the current
system can see small shake. Eight annotated PNGs and full JSON are in
`tmp/phase62/`.

| Benchmark | transform movement p50/p95/max px | |rotation| p95/max deg | scale deviation p95/max | cumulative step translation px |
|---|---:|---:|---:|---:|
| Gav | .028/.045/.050 | .001/.001 | .000069/.000079 | 4.007 |
| Vanni 240 | .001/.238/.973 | .003/.011 | .000019/.000165 | 4.361 |
| Vanni 120 | .009/.208/.360 | .006/.014 | .000075/.000201 | 9.516 |
| Vanni 60 | .009/.129/.299 | .001/.004 | .000037/.000150 | 3.420 |

Representative independently re-estimated background flow reached 0.956 px on
Vanni 240, 0.466 px on Vanni 120, and 0.484 px on Vanni 60. Motion is dominated
by translation, not rotation or scale. “Cumulative step translation” is disclosed
as a sequential diagnostic, not world-position truth; production display uses the
global path to avoid accumulating it.

## 6. Scientific gate contract

Scientific gates derive only from coach calibration, its authoritative setup/
reference frame, and validated background transforms. `gateLockDebug.ts` now
records per sampled frame:

- `scientificStartGate`, `scientificFinishGate`;
- `transformSourceFrame`, `transformConfidence`;
- `transformValid`, `transformHeld`, `transformRejectedReason`.

Crossing continues to use only `propagateAnchorFromSetupToFrame`. Neither
`gateStabilization.ts` nor `worldLockedZoneGeometry.ts` is imported by
`measurements.ts`.

## 7. Display gate contract

Display input is the freshly projected scientific/canonical world scene. Display
output may hold all four endpoints when maximum movement is below 0.5 source px.
It cannot alter calibration, persisted gates, body reference, distance, crossing
frames, timestamps, or metrics. A global-path gap fails closed rather than
silently substituting a screen-fixed identity gate.

## 8. Stabilization design

`stabilizeGateZone` converts CSS displacement back to original-source pixels,
measures all start/finish endpoints, and makes one atomic decision. Under the
deadzone it returns the previous entire scene; outside it returns the new entire
scene immediately. There is no filter state beyond the last displayed scene, no
velocity prediction, and no per-endpoint acceptance.

## 9. Deadzone evidence

The threshold is **0.5 source px**. It is above all four measured transform p95s
(.045–.238 px) but below observed real peaks (up to .973 px). It is not FPS-,
athlete-, CSS-size-, or DPR-specific.

| Benchmark | raw endpoint motion p50/p95/max px | display p50/p95/max px | held frames |
|---|---:|---:|---:|
| Gav | .273/.530/.560 | 0/.530/.560 | 127/141 |
| Vanni 240 | .178/.486/1.088 | 0/0/1.088 | 980/1019 |
| Vanni 120 | .057/.499/.964 | 0/0/.964 | 458/482 |
| Vanni 60 | .283/.407/.618 | 0/0/.618 | 226/232 |

Gav’s p95 is unchanged because accumulated subpixel movement periodically crosses
the threshold and is then passed exactly; mean displayed motion falls from .278
to .053 px. This is preferable to freezing genuine drift merely to optimize p95.

## 10. Pan-vs-shake behavior

- tiny shake: atomic deadzone hold;
- slow drift: accumulated difference eventually crosses 0.5 px and updates;
- intentional pan: every >0.5 px movement passes immediately through the global path;
- sudden bump: valid movement passes; invalid global path fails closed;
- transform failure: no bad transform is composed; existing tracking states expose it;
- athlete occlusion: athlete is masked and RANSAC/background support gates validity.

## 11. Gate endpoint coherence

Start/finish endpoints now share one update decision. Real audit maximum per-gate
length variation is 0.235 px and maximum per-gate angle variation is 0.308°.
Full-height stationary lines derive only from the stabilized boundary midpoint;
they do not use independent screen anchors.

## 12. Zone primitive architecture

`worldLockedZoneGeometry.ts` defines a boundary, a two-boundary scene, rigid
length/orientation diagnostics, and a polygon derived in the fixed order
start.p1→finish.p1→finish.p2→start.p2. This is preparation only; Phase 6.3’s
green/blue/red UX was not implemented.

## 13. Files changed

Changed by this phase:

- `src/components/video/VideoOverlay.tsx`;
- `src/lib/video/gateStabilization.ts`;
- `src/lib/video/worldLockedZoneGeometry.ts` (new);
- `src/lib/calibration/gateLockDebug.ts`;
- `scripts/phase-6-2-world-lock-sanity.mjs` (new);
- `scripts/phase-6-2-camera-shake-audit.py` (new);
- `scripts/phase-6-2-fetch-calibrations.mjs` (new);
- `scripts/phase-6-2-playback-validation.mjs` (new, currently exposes codec blocker);
- `package.json`, this report, and roadmap.

No scientific calculation file changed.

## 14. Database changes

None. Four calibration records were queried read-only. No row, storage object,
migration, or schema was mutated.

## 15. Deterministic tests

`phase-6-2-world-lock:sanity`: **23/23 passed**, covering the required zero,
translation, vertical bounce, rotation/combined movement, deadzone, larger
movement, rejection/hold/recovery, athlete isolation, shared transforms,
rigidity, scientific isolation, 60/120/240 behavior, DPR, Phase 6.1 mediaTime,
stationary evidence, panning contract, and zone polygon.

Existing gate display, gate smoothing, stationary gate, timing, world-lock repair,
zone anchor, camera, camera path, panning, analysis-FPS, and analysis-report suites
passed (fixture-dependent skips retained exactly as those suites report).

## 16. Gav validation

Transform movement p95 .045 px; display movement p50 0 px; max .560 px; angle
range .075°; length range .235 px. Scientific replay: 9 valid contacts, zone time
1.92 s, step frequency **4.848484848484849 Hz**, unchanged.

## 17. Vanni 240 validation

Transform movement p95 .238 px; display p50/p95 0 px; max 1.088 px; angle range
.223°; length range .072 px. Scientific replay: 7 valid contacts, zone time
2.12 s, step frequency **3.103448275862069 Hz**, unchanged.

## 18. Vanni 120 validation

Transform movement p95 .208 px; display p50/p95 0 px; max .964 px; angle range
.308°; length range .075 px. Scientific replay: 8 valid contacts, zone time
2.19 s, step frequency **3.6206896551724137 Hz**, unchanged.

## 19. Vanni 60 validation

Transform movement p95 .129 px; display p50/p95 0 px; max .618 px; angle range
.023°; length range .023 px. Scientific replay: 10 valid contacts, zone time
2.40 s, step frequency **4.385953327434329 Hz**, unchanged.

## 20. Scientific measurement regression check

All four replays invoked the real, unmodified `computeSprintMeasurements` path
against the Phase 4.2K artifacts and existing calibration records. Valid contacts,
zone time, step frequency, GCT, flight time, peak velocity, and zone-step outputs
match the closed baselines. Display code cannot be imported by that path.

## 21. UI playback validation

Phase 6.1’s `requestVideoFrameCallback().metadata.mediaTime` code and deterministic
test remain intact. Paused/resize/DPR geometry is covered by pure tests and build.
However, the attempted installed Chromium and WebKit harnesses cannot decode/reach
metadata on the real benchmark `.mov` codec. Therefore actual playback at 0.25×/0.5×/1×,
scrub, resize, and fullscreen is **not personally validated**, and no subjective
“no bobbing” claim is made.

## 22. Acceptance table

| Criterion | Result |
|---|---|
| Pipeline mapped | Pass |
| Camera shake measured | Pass |
| Science/display separated | Pass |
| Background-based motion | Pass |
| Athlete cannot control transform | Pass |
| Micro-jitter measurably reduced | Pass |
| Rigid gate scene | Pass |
| Genuine movement not frozen | Pass |
| Scientific crossings unchanged | Pass |
| Primary metrics unchanged | Pass |
| Phase 6.1 clock retained | Pass |
| Actual playback validation | **Blocked — Chromium benchmark codec** |
| Deterministic tests | Pass |
| Roadmap honest | Pass |

Because criterion 12 is not met, Phase 6.2 remains **In Progress**.

## 23. Roadmap progress

No assigned Phase 6.2 weight and no invented contribution. Completion remains
**29.5%**.

## 24. Remaining limitations

- Actual authenticated app playback with the benchmark codec remains required.
- Individual production feature trajectories are not persisted; the new source
  audit recomputes representative LK tracks from local source frames.
- Partial affine is not validated for strong perspective/dolly motion.
- Existing upstream camera-transform EMA is inherited scientific evidence and was
  not redesigned.
- `stationary-validation-registry:sanity` retains the known 105%-weight failure.
- `worker:check` exposes an inherited standalone `tsc` alias-resolution failure in
  `src/lib/calibration/index.ts`; full project typecheck/lint/build succeed.

## 25. Git status

No commit, push, or database reset. The worktree was already substantially dirty;
unrelated prior changes were preserved. Phase-owned files are listed in Section 13.

## 26. Exact recommended Phase 6.3 scope

Do not start Phase 6.3 until Phase 6.2’s actual playback blocker is cleared and
the phase can close. Once cleared, Phase 6.3 should consume only
`WorldLockedZoneScene`/`zonePolygon` to render the four-boundary color UX. It must
not introduce a second camera transform, independent polygon smoothing, or any
scientific timing dependency on display state.

## Phase 6.2 closure plan

The next validation task should solve the browser-test-media problem without
altering gate algorithms.

Preferred approach:

- create a **test-only**, browser-compatible transcode of the exact benchmark
  clip or clips, such as H.264 MP4;
- preserve source dimensions;
- preserve orientation;
- preserve frame timing as closely and explicitly as possible;
- retain a mapping back to the original source timestamps;
- use the transcoded copy only for browser/UI playback validation;
- do not substitute the transcode into scientific analysis;
- continue deriving scientific metrics and world-lock transforms from the
  original source and authoritative artifacts.

Then validate:

- 0.25× playback;
- 0.5× playback;
- 1× playback;
- pause/resume;
- scrubbing;
- frame stepping where available;
- resize;
- fullscreen;
- gate stability;
- zone stability;
- Phase 6.1 skeleton synchronization.

The UI-validation media must be clearly labeled test-only and must not change
scientific evidence. Phase 6.2B completed this plan; Phase 6.2 is **CLOSED** and
roadmap completion remains **29.5%**.

## REAL BROWSER PLAYBACK CLOSURE VALIDATION

Playwright Chromium 149.0.7827.55 exercised the actual authenticated player for
Gav, Vanni 240, Vanni 120, and Vanni 60 with the documented source-derived H.264
browser-validation copies. Copies were presentation-only; original MOV files
and persisted artifacts remained the scientific authority.

Fresh load, play, pause/resume, forward/backward scrub, 0.25×/0.5×/1×,
1100×760 and 1600×1050 resize, fullscreen enter/exit, and Auto Follow OFF/ON
passed for every benchmark. Gates, zones, skeleton, contacts, and steps
coexisted. Traces had zero gate/pose frame mismatches and zero stale paints.

At 1×, maximum displayed endpoint movement was .576 source px (Gav), .551 px
(Vanni 240), and 0 px (Vanni 120/60). Accepted movement followed the global
scene path; sub-deadzone residuals were held atomically. Matched playback-rate
geometry differed from 1× by at most .435 px, .480 px, 0 px, and 0 px. Gate
length/orientation and shared zone boundaries remained coherent. No meaningful
unresolved bobbing, lag, or detachment was observed.

Current post-Phase-7.3B frequencies remain Gav 4.848484848484849 Hz, Vanni 240
3.6206896551724137 Hz, Vanni 120 4.655172413793103 Hz, and Vanni 60
4.385953327434329 Hz. No scientific code changed. All required Phase 6/7
regressions, timing verification, analysis-report sanity, typecheck, lint, and
production build passed.

All closure criteria pass. Phase 6.2 is **CLOSED**. It is unweighted, so overall
completion remains **29.5%**. Full provenance, evidence, limitations, and agent
handoff are in `docs/phase-6-2b-browser-playback-closure.md`.
