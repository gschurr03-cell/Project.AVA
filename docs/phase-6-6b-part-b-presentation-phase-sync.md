# Phase 6.6B — Part B: Presentation-Phase Synchronization

**Date:** 2026-08-07  
**Status:** CLOSED  
**Roadmap completion:** 29.5% (unchanged; this presentation correction is unweighted)

## 1. Executive summary

Phase 6.6B Part B is complete. The pose selected from rVFC `metadata.mediaTime`
was already correct; the fix changes only when that pose becomes displayable.
AVA now keeps the prior overlay visible while a decoded-frame candidate is
early, then promotes the candidate at the metadata-defined presentation
boundary. The rAF loop remains for continuous responsive painting and fallback.

Across the required real Chromium matrix, early live paints fell from
8/11, 17/19, 59/60, and 28/29 to **0** in every run. Every rendered live and
scrub pose remained `EXACT` (maximum timestamp difference
0.000000334 seconds). No scientific code or output changed.

## 2. Part A inherited findings

Part A established, and Part B preserves, these findings: scrub and live select
the correct pose timestamp; all captured poses were `EXACT`; no one-frame-old,
stale-callback, duplicate-rAF, duplicate-rVFC-generation, interpolation, or
high-FPS timestamp-mapping defect existed. Phase 6.1's media-time selection is
valid. Auto Follow was OFF. The defect was classification D: correct pose
selection with an **early live canvas paint** relative to video presentation.

## 3. Browser presentation semantics

The real Part A traces show that rVFC commonly arrives one display refresh
before `expectedDisplayTime`, but the distribution is not a fixed delay:

| Run | callback lead mean | p50 | p90 | p95 | p99 | min / max |
|---|---:|---:|---:|---:|---:|---:|
| Vanni 240 1× | 9.91 ms | 16.40 | 16.50 | 16.50 | 16.50 | -16.70 / 16.50 |
| Vanni 240 0.5× | 14.03 ms | 16.30 | 16.50 | 16.50 | 16.50 | -9.20 / 16.50 |
| Vanni 240 0.25× | 16.33 ms | 16.40 | 16.50 | 16.50 | 16.60 | 13.70 / 16.60 |
| Vanni 60 1× | 16.04 ms | 16.40 | 16.50 | 16.50 | 16.50 | 11.50 / 16.60 |

`presentationTime`/`expectedDisplayTime` describe the frame's presentation
opportunity; `mediaTime` identifies its source media timestamp. A callback can
therefore provide the right pose before that pose is safe to show.

## 4. Existing paint policy

The inherited continuous rAF loop was singular and useful for resize,
fullscreen, hover, and non-pose repainting. Its defect was that rVFC immediately
overwrote `presentedMediaTimeS`; the next rAF—often in the same refresh
update—painted the new pose roughly 16 ms before the associated video boundary.
It could repaint that future pose multiple times before the browser presented
the video frame.

## 5. Root cause

The root cause remains a presentation-clock mismatch, not pose-coordinate or
pose-selection error. Correct pose N was made visible while video N-1 could
still be the composed video image.

## 6. New paint contract

```text
POSE SELECTION TIME      = rVFC metadata.mediaTime
OVERLAY PRESENTATION TIME = that frame's metadata presentation boundary
```

Knowing a pose does not authorize displaying it. Until N is eligible, AVA keeps
displaying N-1. This introduces no smoothing, interpolation, extrapolation,
prediction, or limb compensation.

## 7. Scheduling implementation

`overlayPresentationScheduler.ts` separates displayed, latest-eligible, and
latest-future state. rVFC supplies the exact candidate and boundary. rAF
promotes only an eligible candidate. If rAF ran earlier in the same browser
rendering update, rVFC can submit the just-eligible prior candidate immediately,
avoiding an extra refresh of lateness.

The submission window is 0.5 ms, derived from the trace's 0.1 ms clock buckets
and the minimum measured 0.2 ms canvas work. It is a canvas-submission allowance,
not a guessed playback delay: completed paints did not advance early. No
`setTimeout(16)` or playback-rate constant exists.

## 8. High-FPS coalescing

State is bounded to one displayed, one latest eligible, and one latest future
candidate. New source frames replace the future slot; no FIFO exists. Thus a
240 fps source cannot create a lagging overlay queue. The real 240 runs honestly
show presented-frame counter skips of 4 at 1×, 9 at 0.5×, and 1 at 0.25×; AVA
follows the frames Chromium actually reports rather than attempting 240 canvas
updates per second.

## 9. Pause behavior

Pause invalidates future pending work but retains the displayed exact pose for
responsive repaint. A settled paused rVFC callback from the unchanged source is
allowed to become authoritative for the current generation. This is required
because browsers commonly reuse a pre-seek callback registration.

## 10. Scrub behavior

Seek invalidates pending work. Once the newly decoded, settled frame arrives,
its exact `mediaTime` pose can paint without a live-playback delay. Final scrub
captures contained 812 Vanni 240 paints and 593 Vanni 60 paints; every one was
`EXACT`, with maximum pose-time difference 0.000000334 seconds.

## 11. Playback-rate behavior

The same metadata contract passed at 0.25×, 0.5×, and 1×. No wall-clock delay
is scaled or tuned by playback rate.

## 12. Fallback behavior

Primary path: rVFC `mediaTime` plus metadata-aware presentation scheduling.
Compatibility path: the inherited `video.currentTime`/rAF behavior when rVFC is
unavailable. Responsive rAF painting remains active on both paths.

## 13. Race and cancellation handling

Generation invalidation covers pause, seek, source `emptied`, playback-rate
change, effect cleanup/unmount, analysis/effect replacement, and source change.
Stale generations cannot enqueue. The paused-seek exception requires the same
`currentSrc`, so an old-source callback cannot cross a source replacement.

## 14. Before/after timing distributions

Signed time is `overlay paint end - expectedDisplayTime`; negative is early.
The ±2.5 ms tolerance is derived from Part A's real Vanni 240 scrub paint-work
p99 of 2.3 ms, rounded by two 0.1 ms scheduling-resolution buckets.

| Run | Before mean / p50 / p90 / p95 / p99 / max (ms) | After mean / p50 / p90 / p95 / p99 / max (ms) | Before E/W/L | After E/W/L |
|---|---|---|---:|---:|
| V240 1× | -9.36 / -16.10 / 7.40 / 7.40 / 7.40 / 17.80 | 4.90 / 1.30 / 17.70 / 17.70 / 17.70 / 18.40 | 8/1/2 | 0/7/2 |
| V240 0.5× | -13.50 / -15.90 / -13.60 / 1.00 / 1.00 / 10.00 | 2.44 / 1.60 / 2.00 / 2.60 / 2.60 / 17.40 | 17/1/1 | 0/15/2 |
| V240 0.25× | -14.66 / -16.00 / -15.80 / -15.40 / -13.20 / 59.70 | 0.93 / 0.60 / 1.50 / 1.60 / 1.60 / 9.40 | 59/0/1 | 0/51/1 |
| V60 1× | -12.95 / -15.80 / -14.40 / -10.90 / -10.00 / 56.10 | 0.81 / 0.70 / 1.30 / 1.50 / 2.00 / 2.20 | 28/0/1 | 0/26/0 |

The few full-refresh late Vanni 240 samples occur when Chromium itself delivers
the rVFC callback after its recorded expected boundary; AVA promotes and paints
immediately rather than building a backlog. Callback-to-paint after the fix had
medians of 17.60, 17.70, 17.10, and 17.10 ms respectively—approximately the
measured callback lead plus canvas work, which is intentional latency to the
correct boundary rather than artificial visual lag.

## 15. Visual validation

The authenticated application path ran with Auto Follow OFF against test-only
H.264 copies that preserve the benchmark dimensions, orientation, frame count,
and timing mapping. Captured frame inspection covered head, shoulder, wrist,
hip, knee, and ankle. The after-live skeleton is attached to the same athlete
frame selected by the scrub control, and the traces show convergence from a
roughly one-refresh early phase to the presentation interval. Screenshots and
traces are in `tmp/phase66b-part-b/{before,after}`.

This was headless real Chromium playback, not a human-scored headed usability
study; subjective perception across other GPU/display/browser combinations
remains a limitation.

## 16. Files changed by this Part B work

- `src/lib/video/overlayPresentationScheduler.ts` — bounded pure scheduler.
- `src/components/video/VideoOverlay.tsx` — presentation-aware promotion and
  invalidation; pose lookup unchanged.
- `src/lib/video/playbackSyncDebug.ts` — additive scheduling trace kinds.
- `scripts/phase-6-6b-part-b-presentation-sync-sanity.mjs` — 18 deterministic checks.
- `scripts/phase-6-6b-part-b-timing-summary.mjs` — before/after distributions.
- `scripts/phase-6-1-overlay-fidelity-sanity.mjs` and
  `scripts/phase-6-5-presentation-camera-sanity.mjs` — update inherited source
  assertions to the new promotion assignment without weakening their contracts.
- `package.json` — Part B sanity command.
- this report and the roadmap status note.

## 17. Tests

- Phase 6.6B Part B: **18/18 pass**.
- Phase 6.1: **13/13 pass**.
- Phase 6.5: **26/26 pass**.
- Phase 6.6B Part A isolation: **5/5 pass**.
- Phase 7.0: **26/26 pass**.
- Phase 7.1: **24/24 pass**.
- Typecheck, lint, and production build: pass.

## 18. Scientific regression

Four real Phase 4.2K artifacts were replayed read-only through the unmodified
production measurement path:

| Benchmark | Frequency | Zone time | Peak velocity |
|---|---:|---:|---:|
| Gav | 4.848484848484849 Hz | 1.92 s | 11.092149424565784 m/s |
| Vanni 240 | 3.103448275862069 Hz | 2.12 s | 9.591178790487021 m/s |
| Vanni 120 | 3.6206896551724137 Hz | 2.19 s | 9.416358925269277 m/s |
| Vanni 60 | 4.385953327434329 Hz | 2.40 s | 10.881288775005759 m/s |

All values are byte-identical to the accepted production replays. No pose
artifact, metric, timing, localization, contact, gate, Auto Follow, worker, or
database behavior changed.

## 19. Agent-handoff accountability and remaining limitations

### Prior architecture inherited

Phase 6.1's rVFC `mediaTime` pose selection, continuous responsive rAF loop,
pure nearest-frame selector, fallback clock, overlay renderer, and Part A debug
harness were inherited. They are not claimed as Part B implementation work.

### Prior findings independently verified

The Part A exact-selection result, absence of stale/duplicate loops, early live
paint mechanism, scrub/live difference, and Auto Follow OFF condition were
verified against the source and preserved traces.

### Findings disproved or corrected

No accepted Part A conclusion was disproved. During implementation, an initial
single-slot prototype was rejected by real 240 fps evidence because successive
future callbacks could replace a newly eligible candidate; a bounded eligible
slot corrected it. A first invalidation policy was also corrected when real
scrub captures proved it rejected reused paused-seek callbacks. Neither
prototype is the final implementation.

### Code and tests changed by this agent

The files in Sections 16–17 are the changes and tests performed in Part B.

### Real benchmark runs performed by this agent

This work performed the four required live Chromium runs, Vanni 240 and Vanni
60 scrub controls, representative screenshot inspection, and four read-only
production scientific replays listed above.

### Not personally validated

No headed human subjective study, alternate monitor refresh rate, WebKit,
Firefox, or browser without rVFC was run. Fallback behavior is deterministically
preserved but not visually benchmarked. Gav/Vanni 120 live UI playback was not
needed after the required matrix passed; both were scientifically replayed.

## 20. Phase 6.6B closure decision

**Phase 6.6B Part B is CLOSED.** Pose selection remains exact; early live paint
was eliminated in the required captures; high-FPS coalescing has no queue;
pause, scrub, slow-motion, resize repaint, fallback, and cancellation contracts
are covered; and scientific outputs remain unchanged. Roadmap completion stays
**29.5%** because this presentation correction is unweighted. Phase 6.2 remains
IN PROGRESS solely for its separately documented browser-playback blocker.

No commit, push, or database mutation was performed.
