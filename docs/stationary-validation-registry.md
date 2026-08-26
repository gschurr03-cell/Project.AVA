# Project AVA
## Stationary Validation Registry (Phase 0)

Status: identification and labeling only. No algorithm — athlete detection,
identity tracking, box tracking, optical flow, pose estimation, contact
detection, step/velocity/timing calculations, gate geometry, gate
stabilization, overlays, playback, auto-follow, panning, or Athlete
Intelligence — was modified to produce this registry. All values below are
either read directly from the live local database/storage, or computed by
running the real, unmodified `computeSprintMeasurements` production function
against the real, already-persisted pose artifacts (the same function
`src/app/sessions/[id]/page.tsx` calls at render time) — never
reinterpreted or recomputed with different logic.

Machine-readable counterpart: `validation/stationary-validation-registry.json`.

---

## Purpose

This registry exists so that no future report, screenshot, metric, artifact,
or prompt about stationary sprint analysis needs to guess which real
recording it came from. Every benchmark below has a **stable key** — use it
in prompts and reports instead of a session ID or a title like "the 120fps
run."

---

## `gav_stationary_reference` — the protected source-of-truth benchmark

| Field | Value |
|---|---|
| Athlete | Gav (`0510a4cb-9344-449b-97c3-ec65475e9cc0`) |
| Session | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` — "Gav 20m Fly Baseline video" |
| Analysis | `3a148f45-02ff-492d-b9f1-790470b83c21` (complete) |
| Source file | `FullSizeRender.mov`, 652,218 bytes, etag `2570f1725cc2b6bd675cc834dceadd18` |
| Verified FPS | 59.16 avg / **60.00 timestamp-derived** → analyzed at 60fps, `validated_60_fps_class` — no conflict |
| Resolution / duration / frames | 1920×1080, 2.37s, 142 frames, no rotation |
| Protected | **Yes** — `sessions.is_reference_benchmark = true`, enforced by a `BEFORE DELETE` trigger (migrations 0072/0073) |
| Recording mode | `static_precision` / `spatial_metric_eligibility: eligible` |
| Ground truth | **VueMotion** (external), linked via `benchmarks` row "AVA Calab Vid 1" — zoneTimeS 1.93s, avgStepLengthM 2.15m, avgVelocityMps 10.36, maxVelocityMps 10.74, combinedStepFrequencyHz 4.86 |
| Current production output | zoneTimeS **1.93s** (exact match to VueMotion), avgStepLengthM 2.155m, peakStrideLengthM 2.174m, stepFrequency 4.848Hz, avgVelocity 10.363 m/s, peakVelocity 10.621 m/s, 86.2% zone coverage |
| Known failures | None material — this is the reference. |
| Roadmap role | Phase 0 identity anchor; Phase 2/16 external ground-truth cross-check. **Never used as Vanni ground truth.** |

This session's production output reproduces its own external VueMotion
reference to within ~1%, confirming the pipeline is well-calibrated on this
exact clip.

---

## `vanni_fly_240` — Vanni 240fps fly (strongest new run)

| Field | Value |
|---|---|
| Athlete | Vanni (`5df6454c-950f-4162-b756-42c353cb28ab`) |
| Session | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` — "Vanni 240fps fly" |
| Analysis | `a7679326-e193-4489-bf50-735fe402ec60` (complete) |
| Source file | `IMG_4557 2.mov`, 32,693,376 bytes, etag `cff31d89142356ebbad3de832a789795` |
| Verified FPS | **239.981** (corrected in Phase 1; was 223.93 avg vs 239.98 timestamp-derived — see below) |
| Resolution / duration / frames | 1920×1080, 4.26s, 1095 frames (container tag; only 1020 are actually decodable — see Phase 1 report), 180° rotation (corrected) |
| Protected | No |
| Recording mode | `athlete_tracking_lost` / `spatial_metric_eligibility: withheld` |
| Ground truth | **Unavailable** (confirmed again in Phase 1 — `benchmark_id` is null; no external timing-gate/VueMotion reference exists for this exact recording) |
| Current production output | zoneTimeS **2.21s**, avgStepLengthM **1.913m**, peakStepLengthM **2.061m**, stepFrequency **4.848Hz**, avgVelocity **9.050 m/s**, peakVelocity **10.580 m/s**, 96.0% zone coverage — matches the user's reported screenshot (2.21/1.91/2.06/4.85/9.05/10.58), **unchanged** by the Phase 1 fix (reproduced to full floating-point precision on a real production rerun). |
| Known failures | Skeleton occasionally drifts (user observation, not independently re-verified). No independent ground truth exists to check the absolute value against. |
| Roadmap role | **Phase 1 (240 FPS zone-time diagnosis) COMPLETE** — see `docs/phase-1-vanni-240-zone-time-report.md`. Primary evidence for **Phase 2** (240 FPS metric validation). |

**FPS conflict — RESOLVED in Phase 1 (2026-08-04)**: the container's
`r_frame_rate` (2400/1) is a codec/timebase artifact and was correctly
ignored. The *production system* previously used `avg_frame_rate` = 223.926fps
as `analysis_fps`/`source_fps` — but that container tag proved to be a
metadata artifact of this specific VFR HEVC file, not a real measurement:
independent ffprobe frame-level PTS extraction (this phase) confirms every
decoded frame's real timestamp matches `timestampFps` = 239.98fps evidence
(inter-frame deltas quantize to 10 or 11 ticks of the container's 1/2400s
timebase — i.e. genuine ~240fps spacing). `classify_fps()`'s
`native_source_class` branch now prefers `timestampFps` over a disagreeing
container average, matching the same evidence-based pattern the
validated-60/experimental-30 branches already used. Critically, this was a
**metadata-only bug**: `crossingTime()`/`torsoSeries()` in `measurements.ts`
never consumed this label — they interpolate directly from each frame's real
persisted `tMs`, traced end-to-end from `cv2.CAP_PROP_POS_MSEC` through
`loadOverlayFrames.ts`. A real production rerun (same analysis id, original
result preserved as saved version `4b425ebf-6998-42d3-8105-0b5dfedcf93b`)
reproduced all 6 reported metrics to full floating-point precision after the
fix — proof the fix is metadata-correctness-only, not a timing change. Full
frame-by-frame audit, alternate-timeline recomputation, and the exact fix are
in `docs/phase-1-vanni-240-zone-time-report.md`.

---

## `vanni_fly_120` — Vanni 120fps fly

| Field | Value |
|---|---|
| Athlete | Vanni (`5df6454c-950f-4162-b756-42c353cb28ab`) |
| Session | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` — "Vanni 120fps fly" |
| Analysis | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` (complete) |
| Source file | `IMG_4556 2.mov`, 15,554,170 bytes, etag `41bc63f0b018ab45fc9b8fa2c8d02e6a` |
| Verified FPS | **108.31 avg (what analysis actually used) vs 120.00 timestamp-derived** — same conflict class as the 240fps clip, larger relative gap (~10.8%) |
| Resolution / duration / frames | 1920×1080, 4.03s, 540 frames, 180° rotation (corrected) |
| Protected | No |
| Recording mode | `athlete_tracking_lost` / `spatial_metric_eligibility: withheld` |
| Ground truth | **Unavailable** |
| Current production output | zoneTimeS **2.19s**, avgStepLengthM 1.871m, peakStepLengthM 1.907m, stepFrequency 3.781Hz, avgVelocity 9.132 m/s, peakVelocity 10.319 m/s, 87.8% zone coverage, persisted warning: "Velocity methods disagree by more than 15%." |
| Known failures | 3 of 11 detected contacts excluded (before-start-crossing/outside-zone); only 8 eligible — matches the user's "some steps were dropped." |
| Roadmap role | Primary evidence for **Phase 3** (120 FPS contact recovery). |

---

## `vanni_fly_60` — Vanni 60fps fly (weakest new run)

| Field | Value |
|---|---|
| Athlete | Vanni (`5df6454c-950f-4162-b756-42c353cb28ab`) |
| Session | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` — "Vanni 60fps fly" |
| Analysis | `8f55936c-cf07-4c20-ba73-b662e8d24325` (complete) |
| Source file | `IMG_4555 2.mov` — **note**: same original filename string as the 120fps clip's source (`IMG_4555 2.mov` vs `IMG_4556 2.mov` — different files, adjacent camera-roll numbering; do not confuse by filename alone, always cross-check the session/storage path) |
| Verified FPS | 56.53 raw average, but `classify_fps`'s existing timestamp+metadata cross-check correctly forced this to **60.00fps**, `validated_60_fps_class` — **no unresolved conflict** |
| Resolution / duration / frames | 1920×1080, 3.90s, 246 frames, 180° rotation (corrected) |
| Protected | No |
| Recording mode | `static_precision` / `spatial_metric_eligibility: eligible` — despite the weak second half, overall coverage passed the trust threshold; only the *finish-gate crossing specifically* failed |
| Ground truth | **Unavailable** |
| Current production output | zoneTimeS **unavailable** (`finish_crossing_unavailable`), avgStepLengthM 1.767m, peakStepLengthM 1.963m, stepFrequency 4.404Hz, avgVelocity **unavailable**, peakVelocity 10.663 m/s, coverage 66.9% (measurement ends at 14.8m of the 20m zone) |
| Known failures | Tracking lost partway through, finish gate never crossed by tracked evidence, zone/average-velocity timing withheld as a direct result. **No individually-computed step length in this live session's current output falls in the 2.7–3.5m range** the user recalled from screenshots — see Part 4 of the Phase 0 report for why those screenshots could not be matched to this session with certainty. |
| Roadmap role | Primary evidence for **Phase 4** (60 FPS late-run athlete-loss fix). |

---

## Notes on filenames

Original filenames alone are **not reliable** for identification —
`IMG_4555 2.mov`/`IMG_4556 2.mov`/`IMG_4557 2.mov` are sequential camera-roll
names that carry no FPS information, and titles like "Vanni 240fps fly" are
coach-entered labels, not verified metadata (confirmed: the 240fps and
120fps titles are both measurably off from their own file's real capture
rate per the FPS conflicts above). Always resolve to a `benchmarkKey` via
session ID, never via filename or title alone.
