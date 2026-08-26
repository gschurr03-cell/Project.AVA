# Phase 6.6D — Part B: Continuous Stabilized Presentation Camera

**Status:** CLOSED  
**Date:** 2026-08-07  
**Roadmap:** 29.5% (unchanged; presentation phase is unweighted)  
**Scope:** Presentation camera only

## 1. Executive summary

Phase 6.6D Part B corrects the proven presentation-only Auto Follow jump mechanism without changing scientific localization, pose evidence, source timestamps, crop planning, contacts, timing, calibration, gates, world transforms, or metrics.

The camera now separates the irregular raw athlete target from a bounded presentation target trajectory. Horizontal thresholding is removed. Pan, target, forward-look, scale, uncertainty, and reacquisition state evolve in source time with independent bounded velocities and accelerations. Scale changes are composed around an explicit athlete presentation anchor so zoom cannot silently add a second anchor displacement.

The entire presentation-camera path is pre-resolved over the existing pose timeline. Playback selects that immutable path with `requestVideoFrameCallback().metadata.mediaTime`; 0.25×, 0.5×, and 1× therefore cannot integrate different camera paths merely because the display presented different subsets of high-speed source frames.

The design materially reduces recurring motion spikes while preserving containment:

- median steady-state transform displacement falls from 23.23–28.77 px to 11.13–23.44 px;
- p95 falls from 55.68–58.82 px to 31.70–44.93 px;
- disputed hold-release corrections fall from approximately 49 px to 5.04–10.12 px;
- scale p95 falls from 0.0200 to 0.0050 per displayed frame;
- Vanni athlete containment remains 97.93–99.27%, head 99.31–100%, feet 99.82–100%;
- Gav remains 100% contained for athlete, head, and feet.

Real authenticated Chromium playback completed for Vanni 240, Vanni 120, and Vanni 60 at 1×, 0.5×, and 0.25×, plus Gav at 1×, using clearly test-only H.264 playback copies. Matched source-frame camera transforms have median and p95 differences of 0 px across playback rates. Representative screenshots retain shared video, skeleton, contacts, step numbers, gates, and zones alignment.

## 2. Part A inherited evidence

Part A proved:

- the jump was presentation-only;
- scientific localization, React rendering, and sparse detector/localization refresh were not causes;
- camera evaluation occurred on essentially every presented frame;
- recurring motion came from presentation-camera state transitions, discrete pan, and zoom/translation coupling;
- approximately 1,000 px startup acquisitions were a separate event class;
- median jumps were 23.23–28.77 px, p95 55.68–58.82 px, and longest measured holds 42–48 displayed frames.

Part B retains a frozen Part A controller snapshot in the audit harness. Replaying it reproduces the four accepted Part A JSON hashes exactly, including summary SHA-256 `321b6bc0e5321a2d388417297308b4b4ca34981c7bfc44c2af454fa4be387d87`.

## 3. Existing state machine

The inherited implementation contains these states:

| State | Trigger/evidence | Target behavior | Current camera behavior | Reset/discontinuity |
|---|---|---|---|---|
| `full_frame` | Auto Follow disabled | center 0.5, scale 1 | identity viewport | state replaced with identity |
| `following` | verified torso/envelope; negligible forward lead | raw anchor target | bounded pan/scale | no reset |
| `anticipating` | verified evidence; forward lead above label threshold | anchor plus bounded lead | bounded pan/scale | no reset |
| `holding` | unsupported presentation evidence for ≤0.35 s | inherited last verified target | velocity decelerates; scale held | no position reset |
| `degraded` | unsupported longer than 0.35 s | neutral center/scale | returns toward full frame | no direct reset, but inherited target changed abruptly |
| `reacquiring` | verified evidence after hold/degraded, or `boxOrigin=reacquired` | newly verified target | inherited bounded controller | state label changes; direct seek was the only positional reset |
| `returning_to_full_frame` | `trackState=terminated` | neutral center/scale | bounded return | no position reset |

There is no separate `exited` state in live code. Exit is represented by `returning_to_full_frame` with `fallbackReason=athlete_exited_frame`. This documentation corrects the requested state inventory rather than inventing a nonexistent state.

The prior controller also reused camera center velocity while estimating athlete target velocity. It had no explicit raw-target trajectory state. Horizontal movement used the equivalent of “remain stationary inside the deadband, then apply an acceleration-bounded correction.” Zoom and center were then composed into one origin-relative CSS translation.

## 4. Hold-release analysis

Every Part A hold of at least ten displayed frames was traced.

| Clip | Hold (source time) | Frames | Cause | Target/athlete during hold | Release | First correction before → after |
|---|---:|---:|---|---|---|---:|
| V240 | 0.067–0.750 s | 42 | left crop boundary at 2.5×, then unsupported evidence | target advances from the source edge; legal camera center pinned at 0.2 | degraded return | 17.37 → 0.78 px |
| V240 | 2.200–2.367 s | 11 | unsupported short uncertainty | no verified athlete anchor; last verified target retained | verified reacquisition | 18.02 px; new controller blends and no ≥10-frame corresponding snap remains |
| V240 | 2.800–3.117 s | 20 | right boundary plus unsupported evidence | camera pinned near 0.8; no hidden verified anchor | degraded return | 48.95 → 10.01 px |
| V120 | 0.083–0.533 s | 28 | left boundary during entry | athlete/target advances until legal pan becomes possible | normal follow | 12.15 → 0.99 px |
| V120 | 2.200–2.983 s | 48 | right boundary plus uncertainty | target stops when evidence becomes unavailable | degraded return | 49.03 → 5.04 px |
| V60 | 0.083–0.483 s | 25 | left boundary during entry | target advances; camera is geometrically pinned | verified reacquisition | 16.00 → 3.42 px |
| V60 | 2.200–2.933 s | 45 | right boundary plus uncertainty | target stops when evidence becomes unavailable | degraded return | 49.14 → 10.12 px |

The hidden-error hypothesis is disproved for unsupported intervals: no verified raw athlete target continues accumulating behind the hold. The long zero-motion runs are primarily legal viewport-boundary pinning. The jump occurred when degraded scale/center return began together, or when a returned target replaced the inherited target. Part B blends those changes.

The V240 41-frame entry hold remains as an honest geometric boundary condition, not a tracking bridge. Its release correction is now subpixel (0.78 px), so it no longer produces the disputed hold-release snap. Recurring late holds fall from 45–48 frames to 36 frames on V120/V60 and their release corrections fall by 79–90%.

## 5. Pan-motion root cause

The old horizontal path combined:

1. raw anchor and forward lead recomputation;
2. a 0.012 normalized horizontal deadband;
3. a bounded positional controller with up to 1.8 normalized units/s velocity and 12 units/s² acceleration;
4. immediate per-presented-frame CSS application.

At 2.5× zoom those limits permitted tens of rendered pixels per display interval. The deadband produced thresholded starts. More importantly, raw-target velocity and camera velocity shared one state variable, so target and camera dynamics were not independently interpretable.

The selected design removes the horizontal deadband, stores separate raw-target and target-trajectory velocities, and limits camera center velocity to 0.9 normalized units/s and acceleration to 4.5 units/s². A slower 0.3/1.8 candidate reduced p95 further but was rejected: Vanni containment collapsed to 48.68–76.45%. Scientific-quality source evidence was not traded for cosmetic smoothness.

## 6. Zoom/translation coupling root cause

The shared wrapper uses:

```text
translate(0.5 - scale × cameraCenter) scale(scale)
```

With origin `(0,0)`, changing scale changes the translation term even if pan intent is unchanged. Part A measured approximately 30–33 px zoom-only contributions during degraded return.

Part B defines the verified athlete source anchor as the zoom-composition anchor. Given the pan-only desired center, it solves the next camera center so the anchor retains the screen position produced by pan alone. Source-edge clamping still applies, so no pixels outside the source are fabricated. Deterministic tests prove:

```text
same source anchor + scale-only change → identical anchor screen position
```

Scale rate is reduced from 1.2/s to 0.3/s. Hysteresis remains 0.06.

## 7. New continuous target model

The camera state now explicitly contains:

- raw athlete target center and raw scale;
- independently filtered raw-target horizontal velocity;
- bounded presentation-target center and velocity;
- actual camera center, velocity, scale, and scale velocity.

The raw target remains direct evidence from the verified torso/envelope plus continuous bounded forward lead. The presentation target follows it with a source-time exponential/bounded-acceleration trajectory (`targetTimeConstantS=0.08`, maximum target velocity `0.9`, maximum target acceleration `6`). No frame count, source FPS, athlete identity, or benchmark-specific constant participates.

## 8. Follow controller

The selected controller is the existing interpretable bounded velocity/acceleration family, extended into two explicit stages:

```text
verified raw anchor
  → bounded presentation target trajectory
  → bounded presentation camera center
  → anchor-preserving zoom composition
  → source-edge clamp
```

This was selected over adding a new spring system because the smaller change materially reduced median, p95, acceleration, jerk, and release snaps while preserving containment. It also keeps Phase 6.5's asymmetric horizontal/vertical authority.

## 9. Uncertainty behavior

Short unsupported evidence remains honest. The camera decelerates its already-established motion and holds scale. Raw-target velocity decays toward zero; it does not consume invalid/frozen athlete coordinates or manufacture verified motion.

After 0.35 source seconds without supported evidence, the raw target becomes neutral. The presentation target and actual camera independently transition toward neutral with bounded dynamics. Long loss is still exposed as `degraded`/`returning_to_full_frame`; Part B does not conceal tracking loss.

## 10. Reacquisition

On returned verification, the new raw target is recorded immediately but is not copied into the actual camera. The presentation target trajectory closes the source-space distance under its own velocity/acceleration bounds; the camera follows that trajectory. Scale remains hysteretic and rate-bounded. No accumulated hidden target delta is applied in one frame.

## 11. Initial acquisition

Initial Auto Follow activation and a manual source-time discontinuity select the already-resolved appropriate camera state at the current source frame. They do not animate across skipped/full-frame positions. The approximately 1,000 px full-frame-to-follow change remains classified as initialization and excluded from steady-state motion statistics.

## 12. Seek, pause, and playback-rate behavior

- Seek/scrub selects the resolved camera state at the selected presented source time immediately.
- Pause retains the exact current path state. It no longer repeatedly invokes direct selection and zeroes velocity.
- Resume continues selection from the same immutable source-time path.
- The camera path resolves once over every existing pose timestamp, then rVFC media time selects it. Display rate affects how many intermediate states are visible, not the state at a given source frame.

Authenticated browser matched-frame comparisons:

| Clip/rate | Median difference from 1× | p95 | Maximum |
|---|---:|---:|---:|
| V240 0.5× | 0 px | 0 px | 0 px |
| V240 0.25× | 0 px | 0.190 px | 0.346 px |
| V120 0.5× | 0 px | 0 px | 0.346 px |
| V120 0.25× | 0 px | 0 px | 0.346 px |
| V60 0.5× | 0 px | 0 px | 0 px |
| V60 0.25× | 0 px | 0 px | 0 px |

The subpixel V240/V120 maxima come from the CSS transform's printed decimal precision, not divergent camera state.

## 13. Zoom stabilization

| Benchmark | Scale delta median before → after | p95 before → after | maximum before → after |
|---|---:|---:|---:|
| V240 | 0.00311 → 0.00066 | 0.0200 → 0.0050 | 0.0200 → 0.00513 |
| V120 | 0 → 0 | 0.0200 → 0.0050 | 0.0200 → 0.00513 |
| V60 | 0 → 0 | 0.0200 → 0.0050 | 0.0200 → 0.0050 |

No state transition directly assigns a steady-state scale. Initial acquisition/seek remains a direct special case.

## 14. Before/after motion statistics

Startup acquisition is excluded.

### Frame-to-frame translation

| Benchmark | Median before → after | p90 before → after | p95 before → after | p99 before → after | Max before → after |
|---|---:|---:|---:|---:|---:|
| V240 | 23.23 → 11.13 px | 48.95 → 32.27 | 58.82 → 44.93 | 72.95 → 68.40 | 87.31 → 72.01 |
| V120 | 25.51 → 21.69 px | 48.00 → 30.62 | 57.61 → 31.70 | 66.84 → 47.56 | 75.85 → 48.57 |
| V60 | 28.77 → 23.44 px | 47.79 → 31.60 | 55.68 → 32.45 | 64.38 → 42.17 | 67.21 → 49.22 |

### Acceleration and jerk

Finite differences are rendered-transform diagnostics, not physical athlete measurements.

| Benchmark | Acceleration median / p95 / max before | After | Jerk median / p95 / max before | After |
|---|---:|---:|---:|---:|
| V240 | 2,395 / 51,361 / 3,607,849 px/s² | 458 / 21,150 / 124,481 | 6,361 / 3,333,809 / 432,941,825 px/s³ | 10,815 / 1,054,476 / 7,465,963 |
| V120 | 2,606 / 56,051 / 3,590,611 | 777 / 16,177 / 114,547 | 6,957 / 3,437,151 / 430,873,351 | 9,181 / 391,548 / 6,872,816 |
| V60 | 2,270 / 57,600 / 3,751,321 | 378 / 20,816 / 104,736 | 8,118 / 3,456,000 / 450,158,558 | 5,481 / 344,587 / 6,284,139 |

Median V240/V120 jerk rises modestly because formerly stationary segments now make small continuous corrections. The scientifically relevant high-jerk tail falls materially: p95 by 68–90% and maxima by more than 96%.

### Holds, residual, and containment

| Benchmark | Longest hold before → after | Release snap before → after | Residual median / p95 after | Athlete / head / feet containment |
|---|---:|---:|---:|---:|
| V240 | 42 → 41 frames (entry boundary); late 20 → 21 | 48.95 → 10.01 px; entry release 17.37 → 0.78 | 0.0682 / 0.1728 source | 98.20 / 100 / 100% |
| V120 | 48 → 36 | 49.03 → 5.04 px | 0.0638 / 0.1469 | 97.93 / 99.31 / 100% |
| V60 | 45 → 36 | 49.14 → 10.12 px | 0.0610 / 0.1422 | 99.27 / 100 / 99.82% |
| Gav | n/a → 18 | n/a | 0.0594 / 0.1155 | 100 / 100 / 100% |

The remaining V240 entry hold is legal crop-boundary pinning and no longer releases into a jump. Eliminating it would require exposing pixels outside the source or compromising containment; neither is acceptable.

Motion plots:

- [Gav](../tmp/phase66d-part-b/gav-camera-trajectory.png)
- [Vanni 240](../tmp/phase66d-part-b/vanni240-camera-trajectory.png)
- [Vanni 120](../tmp/phase66d-part-b/vanni120-camera-trajectory.png)
- [Vanni 60](../tmp/phase66d-part-b/vanni60-camera-trajectory.png)

Two consecutive Part B audit runs produced byte-identical traces and summary. Summary SHA-256: `ef05b6cb3e9817abf97859322f23e8035b33436e7df162134b361db60422cb34`.

## 15. Real-browser validation

Authenticated Chromium ran the actual session UI with Auto Follow ON:

| Clip | 1× | 0.5× | 0.25× | Coverage |
|---|---|---|---|---|
| Vanni 240 | pass | pass | pass | entry, steady run, uncertainties, reacquisition, late run, exit |
| Vanni 120 | pass | pass | pass | entry, steady run, uncertainty, degraded return |
| Vanni 60 | pass | pass | pass | entry, steady run, multiple short uncertainties, exit |
| Gav | pass | not required | not required | clean benchmark path |

The browser used test-only H.264 copies preserving 1920×1080 dimensions and source orientation. They were used only for UI playback; pose, camera paths, scientific transforms, and metrics came from the original artifacts/sources. V120 and Gav transcodes are under `tmp/phase66d-part-b/`; V240/V60 reuse the previously documented Phase 6.6B test-only media.

Representative screenshots were inspected for containment and shared overlay attachment:

- [Vanni 240 1×](../tmp/phase66d-part-b/browser/vanni240-autofollow-live1.png)
- [Vanni 120 1×](../tmp/phase66d-part-b/browser/vanni120-autofollow-live1.png)
- [Vanni 60 1×](../tmp/phase66d-part-b/browser/vanni60-autofollow-live1.png)
- [Gav 1×](../tmp/phase66d-part-b/browser/gav-autofollow-live1.png)

The actual browser trajectory no longer depends on playback rate at matched source frames. The remaining visible motion corresponds to continuous authoritative path progression or honest source-edge/unsupported-evidence behavior, not stepwise digital recentering.

## 16. Gav validation

Gav completed deterministic and browser validation:

- athlete/head/feet containment: 100/100/100%;
- vertical bounce reduction: 100%;
- scale remained stable during steady validated motion;
- skeleton, contacts, step numbers, and gate stayed attached under the shared transform;
- scientific Step Frequency remained `4.848484848484849 Hz`.

## 17. Files changed

Production presentation files:

- `src/lib/video/presentationCamera.ts`
- `src/components/video/OverlaySurface.tsx`

Validation/documentation files:

- `scripts/phase-6-6d-part-a-auto-follow-motion-audit.mjs`
- `scripts/phase-6-6d-part-a-motion-plots.py`
- `scripts/phase-6-6d-part-b-continuous-auto-follow-sanity.mjs`
- `scripts/phase-6-6d-part-b-browser-motion-summary.mjs`
- `scripts/phase-6-6b-part-a-browser-capture.mjs`
- `scripts/phase-6-5-presentation-camera-sanity.mjs`
- `package.json`
- this report
- roadmap closeout entry

No scientific source, tracker, worker, calibration, metric, contact, pose, or database file was changed by Part B.

## 18. Tests

- Phase 6.6D Part B deterministic suite: 24/24 pass.
- Phase 6.5 camera suite: 26/26 pass.
- Phase 6.6B presentation sync: 18/18 pass.
- Phase 7.0 scientific evidence: 26/26 pass.
- Phase 7.1 explanations: 24/24 pass.
- Phase 7.3B contact regression: 11/11 pass.
- Part A frozen audit replay: exact accepted hashes pass.
- Part B deterministic audit: two byte-identical passes.
- Typecheck: pass.
- Lint: pass.
- Production build: pass (41/41 static pages generated).

## 19. Scientific regression

Read-only production measurement replays against the original pose artifacts and configured benchmark calibration metadata remain:

| Benchmark | Valid contacts | Zone time | Step Frequency |
|---|---:|---:|---:|
| Gav | 9 | 1.92 s | 4.848484848484849 Hz |
| Vanni 240 | 8 | 2.12 s | 3.6206896551724137 Hz |
| Vanni 120 | 10 | 2.19 s | 4.655172413793103 Hz |
| Vanni 60 | 10 | 2.40 s | 4.385953327434329 Hz |

These are the immediate pre-Part-B, post-Phase-7.3B values. The legitimate Phase 7.3B recovered contacts were not reverted. All scientific outputs are unchanged.

## 20. Remaining limitations

- Source-edge crop limits can still create an honest stationary camera interval when an athlete is too near the source edge at maximum permitted zoom. Part B removes the release snap; it does not reveal nonexistent source pixels.
- A 60 Hz display necessarily shows fewer intermediate states at 1× than at slow motion for a 120/240 fps source. The selected states are the same authoritative path, but display hardware cannot show source frames it never presents.
- Browser validation used test-only H.264 media because the installed browser cannot reliably decode the original benchmark MOV/HEVC files. Scientific analysis continued to use original evidence.

## 21. Phase 6.6D closure decision

All Part B acceptance criteria are satisfied:

- state-transition release snaps are materially corrected;
- normal pan and the target trajectory evolve continuously in source time;
- zoom is anchor-preserving and rate-bounded;
- forward look remains direction-aware;
- vertical stabilization and containment remain strong;
- reacquisition is blended;
- seek is immediate and pause/resume retains state;
- the path is playback-rate independent;
- all overlays share one transform;
- real browser playback completed for all required clips/rates;
- scientific outputs and required regressions remain unchanged.

**Phase 6.6D is CLOSED.** Roadmap completion remains **29.5%** because this presentation phase is unweighted.

No commit was created. Nothing was pushed. The database was not reset or mutated.

## Agent handoff

### Prior architecture inherited

Presentation-only camera; rVFC presented clock; shared video/overlay wrapper; Phase 6.5 containment/vertical stabilization; Phase 6.6B exact overlay promotion.

### Prior findings independently verified

Part A root cause, update cadence, Part A hashes, shared-transform isolation, Phase 7.3B scientific baseline.

### Findings corrected or refined

Long holds were proven to be crop-boundary pinning rather than accumulating hidden verified target error. Browser testing additionally proved that integrating only displayed high-speed frames made the old camera path playback-rate dependent.

### Code changed in Part B

Only the presentation camera, its UI selector, diagnostic capture, and validation/report files listed above.

### Tests added in Part B

The 24-check continuous-camera suite and browser-motion summarizer, plus rate-equivalence assertions and frozen Part A replay support.

### Real benchmark runs performed in Part B

Four original-artifact deterministic camera replays, ten authenticated browser playback captures, and four original-artifact scientific measurement replays.

### Not personally validated

No original MOV/HEVC file was used for browser playback; the limitation and test-only transcode boundary are explicit. No production deployment was performed.
