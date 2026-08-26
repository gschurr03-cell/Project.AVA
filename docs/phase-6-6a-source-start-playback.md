# Phase 6.6A — Authoritative Source-Start Playback

**Date:** 2026-08-07  
**Status:** **CLOSED without weighted credit** (deterministic implementation complete; required real HEVC browser validation remains tracked exclusively by Phase 6.2, the only remaining in-progress roadmap item)  
**Roadmap mapping:** weighted roadmap Phase 11, “Default playback starts at frame zero”  
**Scope:** presentation playback initialization only

## Executive summary

The analyzed player had no authoritative source-start initialization. The
browser-owned `HTMLVideoElement.currentTime` was accepted as-is after metadata,
so a reused media element/lifecycle could retain a later playback position.
Separately, the custom scrubber used the first analysis-frame timestamp as its
minimum, conflating the review timeline with scientific evidence availability.
No current production analyzed-player code was found that automatically seeks
to first pose, contact, measurement start, or gate crossing.

The implemented Phase 6.6A change initializes the analyzed video exactly once per stable source identity after
metadata, using `sourcePlaybackStartSeconds`. It is normally zero and uses the
first playable media range when the browser exposes a non-zero timeline origin.
The scrubber now spans the source-media timeline rather than the pose-artifact
timeline. Later artifact/rerender changes do not repeat initialization, and
explicit user seeks, pause/resume, overlays, and Auto Follow remain authoritative
after initialization. A refreshed signed URL for the same stable session source
also does not reload the live media element and discard the user's position.

The original Vanni 240, 120, and 60 MOV files were probed read-only. Each
container and video stream reports `start_time=0.000000`; their authoritative
playback start is therefore 0 seconds.

## Inherited architecture

- `OverlaySurface` owns the analyzed `HTMLVideoElement` and exposes explicit
  transport operations through `OverlaySurfaceHandle`.
- `OverlayVideoPlayer` owns the single-player transport state and custom
  `PlayerControls`.
- `VideoOverlay` reads the presented-frame clock and draws evidence; it does not
  own playback position.
- Analysis selection is server-side in `src/app/sessions/[id]/page.tsx`; changing
  the selected immutable analysis replaces evidence props for the same source.
- Scientific evidence timestamps and presentation camera state were already
  separate from scientific metric calculation.

## Independently verified root cause

Two live-code facts form the defect:

1. `OverlaySurface` previously handled `loadedmetadata` only as a presentation-
   camera direct-selection signal. It did not establish source playback time.
   Consequently, browser/React preservation of a live video element's later
   `currentTime` was not corrected when an analyzed view was opened/reused.
2. `OverlayVideoPlayer` set `PlayerControls.firstTime = frames[0].time`. That
   made analysis evidence start the visible/interactive beginning of the custom
   timeline even when the recording began earlier.

The failure was therefore a playback-initialization and timeline-domain defect,
not a pose, contact, gate, metric, or analysis-start defect. There is no poster
or generated analysis thumbnail on the analyzed `<video>`; the visible image is
the video frame itself.

The dormant comparison component is a deliberate exception: it seeks both clips
to alignment anchors on mount. It is not referenced by the current session page
and is not the analyzed single-player root cause. Its comparison semantics were
not changed in this phase.

## Playback-position write inventory

| File / operation | Trigger and value source | Mount / metadata / artifact / rerender behavior |
|---|---|---|
| `src/components/video/OverlaySurface.tsx` `initializeSourcePlayback` | `loadedmetadata`; first playable source second | New Phase 6.6A one-shot write per stable source identity; not evidence-derived |
| `OverlaySurface.seek` | Explicit parent transport or evidence-link request | Never automatic on ordinary mount/artifact/rerender |
| `OverlaySurface.stepTo` / `stepBy` | Explicit frame-step control; selected pose-frame time | User action only |
| `src/components/video/OverlayVideoPlayer.tsx` `ava:evidence-seek` | Explicit “View evidence” action | User action, not mount or analysis completion |
| `src/components/video/ComparisonPlayer.tsx` alignment effect | Comparison anchor (`start`, contact, or COM) | Runs on comparison mount/alignment change; dormant on current session page and intentionally comparison-only |
| `src/components/VideoPlayer.tsx` `handleSeek` | Original-player range input | User action only |
| `src/app/sessions/[id]/AccelerationCalibrationPanel.tsx` | Explicit calibration-frame selection | User action in calibration UI |
| `src/app/sessions/[id]/timing/TimingWorkspace.tsx` | Explicit workspace seek | User action in timing workspace |

Repository-wide search found no `fastSeek()`, `seekTo()`, `initialTime`, or
automatic single-player assignment sourced from first pose, first contact,
first supported frame, measurement start, or analysis start.

## Initialization states and contract

- **Video source start:** actual beginning of playable source media;
  `sourcePlaybackStartSeconds`, normally 0.
- **Analysis evidence start:** first artifact/evidence timestamp; may be later.
- **Measurement zone start:** calibrated measurement boundary/crossing; may be later.
- **Pose start:** first supported pose; may be later.
- **Contact start:** first accepted contact; may be later.

Only video source start initializes playback.

The resulting contract is:

1. Fresh load, refresh, or return navigation creates a media lifecycle at source
   start unless a future explicit product-state feature says otherwise.
2. First Play proceeds from source start.
3. Analysis completion or selection can update evidence without deriving a seek
   from that evidence.
4. Explicit scrub/frame-step/evidence-seek actions are respected.
5. Pause/resume preserves the selected position.
6. Initialization does not continuously reset playback and is guarded against
   duplicate metadata events, rerenders, artifact updates, and Strict Mode effects.

## Code changed in Phase 6.6A

- `src/lib/video/sourcePlaybackStart.ts`: added the source-media-origin resolver.
- `src/components/video/OverlaySurface.tsx`: added stable-source-identity, one-shot metadata initialization,
  source duration/origin playback state, and metadata preload.
- `src/components/video/OverlayVideoPlayer.tsx`: changed the custom scrubber domain
  from analysis-frame bounds to source-media bounds.
- `src/components/video/ComparisonPlayer.tsx`: initialized the two additive
  `SurfaceState` fields; comparison alignment behavior is unchanged.
- `package.json`: registered the Phase 6.6A sanity command.

No scientific calculation, pose, localization, contact, gate, crop, worker, or
database file was changed by Phase 6.6A.

## Tests added and run

`scripts/phase-6-6a-source-start-playback-sanity.mjs` adds the requested 12
deterministic checks. Result: **12/12 passed**.

Additional verification performed:

- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm run build` — passed. The first sandboxed attempt could not resolve
  `fonts.googleapis.com`; the network-enabled rerun completed with only the
  pre-existing Supabase Edge Runtime warning.
- `npm run phase-6-1-overlay-fidelity:sanity` — **13/13 passed**.

## Real media and scientific regression checks

Read-only ffprobe results using the repository-installed binary:

| Source | Video codec | Container start | Video-stream start |
|---|---|---:|---:|
| Vanni 240 | HEVC | 0.000000 s | 0.000000 s |
| Vanni 120 | HEVC | 0.000000 s | 0.000000 s |
| Vanni 60 | HEVC | 0.000000 s | 0.000000 s |

The Phase 6.6A diff is presentation-only and the deterministic isolation check
proves `sourcePlaybackStartSeconds` is absent from the scientific measurement
module. No real worker rerun was required or performed. The inherited canonical
production replay values remain the scientific regression reference:

- Gav: 4.848484848484849 Hz
- Vanni 240: 3.103448275862069 Hz
- Vanni 120: 3.6206896551724137 Hz
- Vanni 60: 4.385953327434329 Hz

This phase did **not** independently reproduce those four values through new
worker jobs. Phase 7.2's separately documented current Vanni 60 output discrepancy
(4.5224052087322875 Hz) remains open and was neither hidden nor modified.

## Real browser validation

No manual browser-playback validation is claimed. The installed Chromium/WebKit
environment still cannot decode/reach metadata for the original HEVC benchmark
MOV files, the exact blocker already documented for Phase 6.2. No test-only H.264
transcodes of these three clips were present, and none were created in this phase.
The real files were metadata-probed, not visually played in a browser.

## Corrections to inherited findings

No prior closed-phase conclusion was disproved. The roadmap's earlier Phase 11
description correctly recorded the symptom but called the issue “not
investigated”; Phase 6.6A replaces that finding with a live-code diagnosis and
implemented candidate fix. Phase 6.6A is now administratively closed without
weighted credit; its required browser acceptance check is consolidated under
Phase 6.2.

## Remaining limitations

- Real browser verification on Vanni 240/120/60 remains unavailable until the
  existing browser-test-media problem is solved without substituting transcoded
  media into scientific analysis.
- The comparison player intentionally starts at a selected comparison alignment
  anchor; that specialized behavior is not the session analyzed-player contract.
- Phase 6.2 remains IN PROGRESS for its separate browser playback validation.
- Phase 7.2 is CLOSED. Its historical Vanni 60 discrepancy is permanently
  classified as a “Scientific artifact-generation difference,” not “Runtime
  lifecycle,” and does not reopen Phase 7.2.

## Git status / provenance

The worktree was already heavily modified and contained many untracked prior-phase
files. This phase preserved those inherited changes. Phase 6.6A made only the
files listed under “Code changed in Phase 6.6A” plus this report and the roadmap
status update. No commit, push, database reset, or database mutation was performed.
