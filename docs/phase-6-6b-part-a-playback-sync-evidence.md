# Phase 6.6B — Part A: Continuous-Playback Skeleton Synchronization Evidence

**Date:** 2026-08-07  
**Status:** PART A COMPLETE — instrumentation and evidence only  
**Production synchronization fix:** none  
**Roadmap completion:** 29.5% (unchanged)

## 1. Executive summary

The remaining scrub-versus-live difference was reproduced at the scheduling
boundary, without changing pose selection or rendering policy.

Pose selection is not lagging. Across every valid Vanni 240 and Vanni 60 paint,
scrub and continuous playback selected the pose at the rVFC `mediaTime` to within
0.000000334 seconds. Every paint classified **EXACT**; there were no one-frame-old,
two-frame-old, three-plus-frame-old, or future-pose paints.

The remaining distinction is when the correct canvas pose is painted relative to
the decoded video frame's `expectedDisplayTime`:

- settled scrub paint completed after the video presentation boundary (median
  12.0 ms after it on Vanni 240 and 8.2 ms after on Vanni 60);
- live paint normally completed before the associated video presentation
  boundary (median 16.1 ms before it at Vanni 240 1× and 15.8 ms before it at
  Vanni 60 1×).

Thus the Phase 6.1 `mediaTime` correction remains valid: AVA chooses the right
pose. What remains is an independent canvas/video presentation-phase difference.
The closest requested classification is **D — pose selection correct but render
scheduling differs**, refined here because the observed live canvas paint is
usually early relative to `expectedDisplayTime`, not late. This task does not
change that behavior.

## 2. Exact user-observed issue

The user reports relatively attached joints while paused/scrubbing, but visible
trailing or detachment during continuous playback, especially at wrists, knees,
and ankles. Phase 6.1 materially improved the display by replacing
`video.currentTime` pose lookup with rVFC `metadata.mediaTime`; this audit accepts
that finding and investigates only the residual.

## 3. Scope

Only DEV-only, query-enabled instrumentation, capture tooling, trace analysis,
and documentation changed. No pose coordinates, artifact, selector policy,
interpolation, prediction, smoothing, localization, contacts, metrics, gates,
timing, calibration, Auto Follow algorithm, zone presentation, or source-start
behavior changed.

Enable tracing in development with `?avaPlaybackSyncDebug=1`. Captures are held
in `window.__AVA_PLAYBACK_SYNC_DEBUG__`; its `trace`, `clear()`, and `download()`
members are developer-only. Production builds reject the flag.

## 4. Scrub render path

```text
custom seek / step
  → OverlaySurface writes video.currentTime
  → seeking → timeupdate → seeked
  → browser decodes the selected image
  → rVFC updates presentedMediaTimeS
  → continuous rAF draw loop reads that value
  → selectOverlayFrame(nearest to mediaTime)
  → Canvas2D clear + overlay paint
```

`OverlaySurface` also updates React transport state from media events. That can
rerender controls, but pose selection and canvas drawing remain imperative inside
`VideoOverlay`; React does not choose a pose. Toggle/selection/calibration values
are live refs. In captured scrub runs, each rVFC arrived after the sought frame's
expected presentation time and the canvas painted after that callback.

## 5. Continuous-playback render path

```text
Play
  → browser decode/composition pipeline
  → rVFC callback(mediaTime, expectedDisplayTime, presentedFrames)
       updates presentedMediaTimeS only
  → independent rAF loop
  → selectOverlayFrame(nearest to saved mediaTime)
  → Canvas2D clear + overlay paint
  → browser reaches video expectedDisplayTime
```

The rVFC callback and rAF paint loop are separate generations. During live runs,
rVFC was normally delivered approximately one refresh interval before
`expectedDisplayTime`, and the next canvas paint completed within about 0.4–0.6
ms median. The code does not defer canvas submission to the metadata display
deadline. This is the measured scrub/live distinction.

## 6. Instrumentation architecture

Every paint records session/analysis/source identity; video pause/seeking/rate/
currentTime; rVFC metadata; callback, selection, and paint clocks; selected pose
timestamp and all adjacent pose timestamps; artifact/source frame identities;
signed and absolute delta; native-frame-equivalent delta; pose age; React render
version; effect/rVFC/rAF generation; presentation-camera timestamp/frame; and
canvas/display/intrinsic geometry.

Separate lifecycle records cover video events, rVFC registrations/callbacks,
effect identity, and loop identity. `phase-6-6b-part-a-trace-summary.mjs` produces
distribution, cadence, callback-ordering, and source-frame-matched outputs.

## 7. Benchmark/session identities

| Benchmark | Session | Analysis | Source FPS | Captured interval |
|---|---|---|---:|---:|
| Vanni 240 | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | `a7679326-e193-4489-bf50-735fe402ec60` | 239.981 | 1.00–1.25 s |
| Vanni 60 | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` | `8f55936c-cf07-4c20-ba73-b662e8d24325` | 56.53006510915358 | 1.00–1.50 s |

The installed browsers could not decode the original HEVC MOVs reliably for
rVFC evidence. Test-only H.264 MP4 copies were therefore made from the exact
local sources and range-served into the real authenticated AVA session player.
They preserve 1920×1080 dimensions, zero origin, and exact frame counts (1020
and 233). The real immutable pose artifacts, session identity, timestamps,
renderer, and scientific path were unchanged. These MP4s are UI-test media only.

## 8. Scrub trace results

Vanni 240 captured 59 active decoded callbacks, 58 unique selections, and 843
paints across 60 settled seek targets. Vanni 60 captured 29 callbacks, 30 unique
selections, and 567 paints across 30 targets. Repeated paints per selected paused
frame are expected because the rAF loop remains active for resize/hover/other
layers.

Every scrub paint was EXACT. No callback-counter skip occurred. Median first-
paint completion relative to expected display was −12.0 ms for Vanni 240 and
−8.2 ms for Vanni 60, where negative means the canvas paint happened after the
video deadline.

## 9. Live 1× trace results

| Benchmark | rVFC callbacks | Unique selections | Paints | Presented-frame counter skips | Paints/presented frame |
|---|---:|---:|---:|---:|---:|
| Vanni 240 | 11 | 11 | 46 | 5 | 4.18 |
| Vanni 60 | 28 | 29 | 66 | 3 | 2.36 |

Every live paint was EXACT. The extra repeated paints reuse the same correct
selection; no stale older selection overwrote a newer selection. Median first
canvas paint completion was 16.1 ms before expected display on Vanni 240 and
15.8 ms before expected display on Vanni 60.

## 10. Live slow-motion results

Vanni 240 0.5×: 19 callbacks, 19 selections, 60 paints, 11 presented-counter
skips, every pose EXACT, median paint completion 15.9 ms before display.

Vanni 240 0.25×: 59 callbacks, 60 selections, 89 paints, one counter skip, every
pose EXACT, median paint completion 16.0 ms before display. Slower playback
increases unique displayed source evidence but does not change pose-selection
accuracy.

## 11. `mediaTime` versus selected-pose distributions

All values below use real artifact timestamps. Absolute maximum across all six
datasets was 0.000000334 s.

| Dataset | Count | Signed mean | Signed p50 | Signed p95 | Signed max | Absolute p95/max |
|---|---:|---:|---:|---:|---:|---:|
| V240 scrub | 843 | −0.000000014 | 0 | 0.000000333 | 0.000000333 | 0.000000333 / 0.000000334 |
| V240 1× | 46 | −0.000000246 | −0.000000333 | 0 | 0.000000333 | 0.000000333 / 0.000000334 |
| V240 0.5× | 60 | −0.000000172 | −0.000000333 | 0.000000333 | 0.000000333 | 0.000000333 / 0.000000333 |
| V240 0.25× | 89 | 0.000000105 | 0.000000333 | 0.000000333 | 0.000000333 | 0.000000333 / 0.000000334 |
| V60 scrub | 567 | 0.000000009 | 0 | 0.000000333 | 0.000000333 | 0.000000333 / 0.000000334 |
| V60 1× | 66 | −0.000000146 | −0.000000333 | 0.000000333 | 0.000000333 | 0.000000333 / 0.000000334 |

The p90/p99 values are in the generated timing summaries. Frame-equivalent
absolute maxima are approximately 0.00008 of a 240 FPS frame and 0.00002 of a
60 FPS frame—effectively timestamp identity, not a one-frame error.

## 12. Pose-age distribution

| Dataset | EXACT | One old | Two old | Three+ old | Future | Unknown |
|---|---:|---:|---:|---:|---:|---:|
| V240 scrub | 843 | 0 | 0 | 0 | 0 | 0 |
| V240 1× | 46 | 0 | 0 | 0 | 0 | 0 |
| V240 0.5× | 60 | 0 | 0 | 0 | 0 | 0 |
| V240 0.25× | 89 | 0 | 0 | 0 | 0 | 0 |
| V60 scrub | 567 | 0 | 0 | 0 | 0 | 0 |
| V60 1× | 66 | 0 | 0 | 0 | 0 | 0 |

## 13. Callback-to-paint latency

Latency uses only the first paint associated with each decoded callback; paused
repeat paints are excluded.

| Dataset | Callback→selection median/p95/max ms | Selection→paint median/p95/max ms | Callback→paint median/p95/max ms |
|---|---|---|---|
| V240 scrub | 0.40 / 0.80 / 31.40 | 0.20 / 0.40 / 2.60 | 0.60 / 1.30 / 31.50 |
| V240 1× | 0.20 / 0.60 / 1.20 | 0.20 / 0.50 / 0.60 | 0.40 / 1.10 / 1.40 |
| V240 0.5× | 0.30 / 0.70 / 1.00 | 0.20 / 0.30 / 0.40 | 0.50 / 0.80 / 1.10 |
| V240 0.25× | 0.20 / 0.40 / 54.60 | 0.20 / 0.30 / 0.70 | 0.40 / 0.60 / 54.80 |
| V60 scrub | 0.10 / 0.60 / 34.20 | 0.20 / 0.30 / 0.50 | 0.40 / 0.70 / 34.50 |
| V60 1× | 0.20 / 1.70 / 53.00 | 0.20 / 0.40 / 0.50 | 0.60 / 1.90 / 53.40 |

Typical rendering work is sub-millisecond. Isolated main-thread outliers exist,
but they are not accompanied by wrong pose timestamps and do not explain the
systematic scrub/live presentation-phase reversal.

## 14. Frame-drop and callback cadence

At 239.981 FPS, a 60 Hz-class display cannot present every captured source image
at 1×. The V240 1× callback counter skipped five times in this interval; 0.25×
reduced that to one. V60 1× skipped three counters. AVA does not assume one rAF
paint equals one source frame: every callback carries its own media timestamp,
and selection is repeated from that timestamp until newer decoded evidence
arrives.

## 15. High-FPS playback behavior

The browser/display cadence controls which high-speed source images become
presented images. AVA correctly selects from the source timeline using
`metadata.mediaTime`; it does not increment an assumed frame index per paint.
Skipped source images are therefore a physical display constraint, not an AVA
timestamp mapping error. Slow motion exposes more unique 240 FPS frames as
expected.

## 16. Matched visual comparison

The generated source-time/source-frame matcher found 16 V240 scrub/live pairs and
32 V60 pairs. Representative screenshots show Auto Follow OFF and the skeleton
visually attached at the captured paused endpoint; they do not independently
constitute manual joint ground truth. Head, shoulder, hip, knee, ankle, and wrist
were categorized **ALIGNED to SMALL OFFSET** where visible. No screenshot alone
supports anatomical-model correction. The user-reported transient live
detachment is consistent with the measured one-refresh presentation phase but
was not converted into a per-joint manual annotation claim.

## 17. Duplicate-callback audit

Each valid dataset contains exactly one effect identity, one rAF loop identity,
and one rVFC generation. There were no stale-after-cleanup callback records, no
generation reversals, and no paint that selected an older pose after a newer
media timestamp. React render versions changed as transport state updated, but
the loop identity remained stable and refs supplied current display state.

The hypothesized “correct N, then old callback repaints N−1” sequence was
**disproved in these captures**.

## 18. Root-cause classification

Primary: **D, refined — pose selection correct, but canvas/video presentation
phase differs between scrub and live**. Supporting: **A — scrub and live pose
timestamps match**.

Disproved in the captured runs: B, C, E, F, G, and H. Presentation-camera frame
indices could trail the pose in trace state, but Auto Follow was OFF, so the
actual transform remained identity and could not detach the skeleton. Zones,
contacts, and step labels share the selected `frame`/`currentTime` draw call and
do not alter skeleton selection.

## 19. Files changed

- `src/lib/video/playbackSyncDebug.ts` — DEV/query-gated trace collector.
- `src/components/video/VideoOverlay.tsx` — instrumentation only.
- `src/components/video/OverlaySurface.tsx`, `OverlayVideoPlayer.tsx`, and the
  session page — identity/provenance plumbing only.
- `scripts/phase-6-6b-part-a-instrumentation-sanity.mjs` — isolation tests.
- `scripts/phase-6-6b-part-a-browser-capture.mjs` — authenticated browser capture.
- `scripts/phase-6-6b-part-a-trace-summary.mjs` — deterministic analysis.
- `package.json` — sanity command.
- this report. Temporary traces/media/screenshots remain gitignored.

## 20. Tests

- Phase 6.6B instrumentation: **5/5 passed**.
- Phase 6.1 overlay fidelity: **13/13 passed**.
- Phase 6.5 presentation camera: **26/26 passed**.
- Typecheck: passed.
- Lint: passed with zero warnings.
- Production build: passed.

## 21. Scientific regression

Phase 7.0 scientific-evidence checks passed **26/26** and Phase 7.1 explanation/
payload checks passed **24/24**. The instrumentation module is absent from the
measurement path, scientific artifacts are never mutated, and no scientific
source was changed in Part A. Canonical reference frequencies remain Gav
4.848484848484849 Hz, Vanni 240 3.103448275862069 Hz, Vanni 120
3.6206896551724137 Hz, and Vanni 60 4.385953327434329 Hz.

The separate Phase 7.2 Vanni 60 current-worker discrepancy remains pre-existing
and was not attributed to this task.

## 22. Remaining unknowns

- Canvas API call completion is not proof of the exact GPU/compositor scan-out
  instant. A Part B browser compositor trace is required to prove whether the
  early canvas submission is visible for the full measured interval.
- The test-only H.264 media preserves source frames/timing but is not the original
  HEVC bitstream and was not used scientifically.
- No independent per-joint visual ground truth exists.
- The automated screenshot is a representative endpoint, not a high-speed screen
  recording of the transient mismatch.

## 23. Exact recommended scope for Phase 6.6B Part B

Part B should address only the proven video/canvas presentation-phase boundary:
capture compositor evidence around rVFC `expectedDisplayTime`, then make one
shared, generation-safe video-frame-driven paint decision so the correct pose is
submitted for the same display boundary as its decoded image. It must preserve
`metadata.mediaTime` selection, source timestamps, stale-evidence rejection,
paused responsiveness, resize repaint, Auto Follow OFF/identity semantics, and
all scientific behavior. Part B should not add interpolation, prediction,
smoothing, pose changes, or metric changes.

No Part B implementation was begun. No commit, push, database reset, or database
mutation was performed.
