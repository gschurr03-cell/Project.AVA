# Project AVA
## Phase 0 — Validation Registry and Benchmark Identification
### Stationary Sprint Analysis Roadmap v4.0

Status: identification, evidence-labeling, and roadmap-tracking only. No
athlete detection, identity tracking, box tracking, optical flow, pose
estimation, contact detection, step/velocity/timing calculation, gate
geometry, gate stabilization, overlay, playback, auto-follow, panning, or
Athlete Intelligence code was modified. The protected Gav benchmark was
touched only by read-only queries. No database reset. No sessions deleted.
No analyses rerun (all 4 already had complete, real analyses from the
user's own real production runs). Nothing committed or pushed.

---

## 1. Executive summary

All four required benchmark sessions were identified with certainty from
live database + ffprobe evidence, not from titles. Every current
production metric was traced to its exact session by literally re-running
the real, unmodified `computeSprintMeasurements` function against the real
persisted pose artifacts — the same function `page.tsx` calls at render
time. The user's `vanni_fly_240` screenshot (2.21s / 1.91m / 2.06m / 4.85Hz
/ 9.05 m/s / 10.58 m/s) matched **exactly**, on all six numbers, confirming
the mapping with certainty. Two real, load-bearing findings surfaced along
the way and are reported honestly rather than smoothed over:

1. **An FPS discrepancy on both `vanni_fly_240` and `vanni_fly_120`**: the
   production system analyzed them at 223.926fps and 108.307fps
   respectively (the container's `avg_frame_rate`), while independent
   real per-frame timestamp evidence indicates true capture was ~240fps and
   ~120fps. This is the leading, evidence-backed hypothesis for the user's
   "zone time was slightly inaccurate" observation on the 240fps run —
   **not corrected this phase** (timing calculations are out of scope), but
   documented precisely for Phase 1.
2. **The 2.7–3.5m screenshot values could not be matched to any current
   live session.** Traced through the real production computation for all
   4 benchmarks — no individually-computed step length reaches that range
   anywhere. The most likely explanation is that those screenshots are from
   an older Vanni 60fps session deleted during the Aug 4 cleanup (documented
   in `docs/day-104-...md` but its artifacts no longer exist to re-verify).
   Stated plainly rather than guessed at.
3. **The roadmap's stated phase weights sum to 105%, not 100%** as claimed
   in the task instructions. Not silently corrected — flagged, and the
   registry sanity test deliberately fails on this one check so it stays
   visible until a human resolves it.

Phase 0's own 13 acceptance criteria are all met (Section 14). Overall
roadmap completion: **3.8%** (Section 15).

---

## 2. Exact protected Gav benchmark

- **Session**: `e04a7983-7406-4a00-bb89-8ada7b10bf9f` — "Gav 20m Fly Baseline video"
- **Athlete**: Gav (`0510a4cb-9344-449b-97c3-ec65475e9cc0`)
- **Coach/profile owner**: `efe6fd18-19d4-4dbb-bf5a-f5fb47df3531` ("Atreides Commander", admin)
- **Analysis**: `3a148f45-02ff-492d-b9f1-790470b83c21` (complete)
- **Job**: `2b8409b2-99c5-4f9e-afcc-9e324bdcd218`
- **Original filename**: `FullSizeRender.mov`
- **Storage path**: `0510a4cb-9344-449b-97c3-ec65475e9cc0/e04a7983-7406-4a00-bb89-8ada7b10bf9f.mov` (verified to exist; 652,218 bytes; storage etag `2570f1725cc2b6bd675cc834dceadd18`, matching the DB's `size_bytes` exactly)
- **Recording mode / eligibility**: `static_precision` / `eligible`
- **Protected status**: `is_reference_benchmark = true`, re-verified still true after this phase; DB `BEFORE DELETE` trigger confirmed still in place (migrations 0072/0073, from the prior cleanup phase — not re-tested destructively this phase, only re-queried).
- **Created**: 2026-08-04T04:17:03.122407+00

---

## 3. Exact Vanni 240 benchmark

- **Session**: `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` — "Vanni 240fps fly"
- **Athlete**: Vanni (`5df6454c-950f-4162-b756-42c353cb28ab`)
- **Analysis**: `a7679326-e193-4489-bf50-735fe402ec60` (complete)
- **Job**: `e1a0a55c-4cc4-4b00-a05c-20239be2eeaf`
- **Original filename**: `IMG_4557 2.mov`
- **Storage path**: `5df6454c-950f-4162-b756-42c353cb28ab/31fe352b-f00f-4a80-b20a-17c2ab08ec5a.mov` (verified to exist; 32,693,376 bytes; etag `cff31d89142356ebbad3de832a789795`)
- **Created**: 2026-08-04T19:44:15.456939+00
- **Identified by ffprobe-backed evidence, not title**: see Section 6 — `r_frame_rate` (2400/1) is a codec artifact; the real evidence (`averageFps`=223.93, `timestampFps`=239.98) required tracing, not trusting "240" from the session name.

---

## 4. Exact Vanni 120 benchmark

- **Session**: `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` — "Vanni 120fps fly"
- **Athlete**: Vanni (`5df6454c-950f-4162-b756-42c353cb28ab`)
- **Analysis**: `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` (complete)
- **Job**: `e3c69617-628c-41d7-af40-0624c6f302b2`
- **Original filename**: `IMG_4556 2.mov`
- **Storage path**: `5df6454c-950f-4162-b756-42c353cb28ab/160a86a2-c0db-4e7d-9fbe-82aedd6d3eff.mov` (verified to exist; 15,554,170 bytes; etag `41bc63f0b018ab45fc9b8fa2c8d02e6a`)
- **Created**: 2026-08-04T19:52:00.522389+00

---

## 5. Exact Vanni 60 benchmark

- **Session**: `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` — "Vanni 60fps fly"
- **Athlete**: Vanni (`5df6454c-950f-4162-b756-42c353cb28ab`)
- **Analysis**: `8f55936c-cf07-4c20-ba73-b662e8d24325` (complete)
- **Job**: `fee8f2dc-71d4-40c3-8c6a-652dde0e6360`
- **Original filename**: `IMG_4555 2.mov` — note this is a **different file** from `vanni_fly_120`'s `IMG_4556 2.mov` despite adjacent camera-roll numbering; do not rely on filename alone.
- **Storage path**: `5df6454c-950f-4162-b756-42c353cb28ab/3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d.mov` (verified to exist; 8,306,130 bytes; etag `0b693cfefe4759f2d31e5d555b53bf83`)
- **Created**: 2026-08-04T19:56:35.413194+00

All four sessions: `distance_m` column is null but `calibration_gates` (jsonb) carries `distanceM: 20`/`zoneDistanceMeters: 20`, `calibrationSource: manual_confirmed`, `cameraType: stationary`, `travelDirection: left_to_right` for all four — consistent, verified live.

---

## 6. Source-video metadata (real ffprobe evidence)

All 4 source files were downloaded fresh from Storage and probed with the
project's own pinned ffprobe binary. Byte sizes matched `sessions.size_bytes`
exactly for all 4, confirming no corruption/truncation. FPS evidence was
additionally cross-checked using the repository's own authoritative
`probe_fps_evidence`/`classify_fps` functions (`mediapipe_pose_runner.py`)
rather than a hand-rolled re-implementation, per this task's explicit
preference for "the repository's existing authoritative media-inspection
path."

| Field | Gav | Vanni 240 | Vanni 120 | Vanni 60 |
|---|---|---|---|---|
| Codec | h264 High | hevc Main | hevc Main | hevc Main 10 (DOVI HDR) |
| Resolution | 1920×1080 | 1920×1080 | 1920×1080 | 1920×1080 |
| Pixel format | yuv420p | yuv420p | yuv420p | yuv420p10le |
| `r_frame_rate` | 60/1 | 2400/1 *(codec artifact)* | 120/1 | 60/1 |
| `avg_frame_rate` (used by production) | 59.159 | **223.926** | **108.307** | 56.530 |
| `timestampFps` (real per-frame evidence) | 59.999 | **239.981** | **120.005** | 59.999 |
| Time base | 1/15360 | 1/2400 | 1/2400 | 1/600 |
| Frame count | 142 | 1095 | 540 | 246 |
| Duration | 2.366667s | 4.260000s | 4.033333s | 3.896667s |
| Rotation | none | 180° | 180° | 180° |
| Variable frame rate | true | true | true | true |
| Classification | `validated_60_fps_class` | `native_source_class` | `native_source_class` | `validated_60_fps_class` |
| Analysis FPS actually used | 60 | **223.926** | **108.307** | 60 |

### Conflicts found — reported, not silently corrected

**`vanni_fly_240`**: the system's own `classify_fps` used `averageFps`
(223.926) as the analysis rate for this `native_source_class` clip. Real
per-frame timestamp evidence (`timestampFps` = 239.98) — the same gold-
standard, median-inter-frame-delta method the codebase already uses to
confirm the 60fps/30fps bands — indicates the true capture rate was
essentially exactly 240fps. **~7.2% discrepancy.** No unrelated field is
stale here; this is a genuine gap in `classify_fps`'s own logic: the
timestamp cross-check that already protects the validated-60/experimental-
30 bands (`timestamps_support and metadata_supports`) is never applied to
the `native_source_class` branch, which just trusts `averageFps` directly.
No safe narrow production pathway exists to correct this without touching
FPS-classification/timing code, which is explicitly out of scope this
phase — flagged for **Phase 1**.

**`vanni_fly_120`**: same class of conflict, larger relative size —
analyzed at 108.307fps vs. real timestamp evidence of 120.005fps (**~10.8%
discrepancy**). Flagged for **Phase 1/3**.

**`vanni_fly_60`**: raw `averageFps` (56.53) is below the validated-60 band
on its own, but `classify_fps`'s existing cross-check correctly forced this
to `validated_60_fps_class` and an exact 60fps analysis rate (reason:
`timestamp_and_metadata_prove_nominal_60`). **No unresolved conflict** — the
existing mechanism worked correctly here, which is itself useful evidence
that the mechanism *could* be extended to the native-source path.

**Gav**: analyzed at 60fps, `timestampFps`=59.999 — fully consistent, no
conflict.

---

## 7. Current analysis IDs

| Benchmark | Analysis ID | Job ID | Pipeline version | Worker version | Pose backend |
|---|---|---|---|---|---|
| `gav_stationary_reference` | `3a148f45-02ff-492d-b9f1-790470b83c21` | `2b8409b2-99c5-4f9e-afcc-9e324bdcd218` | `ava-sprint-60-v1` | `ava-worker-1.0.0` | `mediapipe-sprint-0.1` |
| `vanni_fly_240` | `a7679326-e193-4489-bf50-735fe402ec60` | `e1a0a55c-4cc4-4b00-a05c-20239be2eeaf` | `ava-sprint-60-v1` | `ava-worker-1.0.0` | `mediapipe-sprint-0.1` |
| `vanni_fly_120` | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | `e3c69617-628c-41d7-af40-0624c6f302b2` | `ava-sprint-60-v1` | `ava-worker-1.0.0` | `mediapipe-sprint-0.1` |
| `vanni_fly_60` | `8f55936c-cf07-4c20-ba73-b662e8d24325` | `fee8f2dc-71d4-40c3-8c6a-652dde0e6360` | `ava-sprint-60-v1` | `ava-worker-1.0.0` | `mediapipe-sprint-0.1` |

Each session has exactly one analysis (its current working analysis) — no
version history/reruns to disambiguate.

---

## 8. Current production metrics by session

Two genuinely different persisted/computed layers exist and must not be
conflated (confirmed by direct inspection, matching CLAUDE.md's documented
architecture):

**Server-persisted `analyses.metrics`** (worker-computed, minimal for all 4
— everything except `strideFrequencyHz` is withheld):

| Benchmark | `strideFrequencyHz` (persisted) | Everything else |
|---|---:|---|
| Gav | 4.4 | null/withheld |
| Vanni 240 | 5.93 | null/withheld |
| Vanni 120 | 4.9 | null/withheld |
| Vanni 60 | 3.86 | null/withheld |

**Client-side production output** (the real, unmodified
`computeSprintMeasurements`, run against the real persisted pose artifacts +
calibration gates — exactly what `page.tsx` renders; for stationary
sessions this is the *only* path, since `cameraEvidence` is only passed
when `calibrationCameraType === "panning"`, confirmed by reading `page.tsx`
directly):

| Field | Gav | Vanni 240 | Vanni 120 | Vanni 60 |
|---|---:|---:|---:|---:|
| Zone time | 1.93s | **2.21s** | 2.19s | **unavailable** (`finish_crossing_unavailable`) |
| Avg Step Length | 2.155m | **1.913m** | 1.871m | 1.767m |
| Peak Step Length | 2.174m | **2.061m** | 1.907m | 1.963m |
| Step Frequency | 4.848Hz | **4.848Hz** | 3.781Hz | 4.404Hz |
| Avg Velocity | 10.363 m/s | **9.050 m/s** | 9.132 m/s | **unavailable** |
| Peak Velocity | 10.621 m/s | **10.580 m/s** | 10.319 m/s | 10.663 m/s |
| Total / valid contacts | 11 / 9 | 13 / 11 | 11 / 8 | 10 / 9 |
| Coverage | 86.2% | 96.0% | 87.8% | 66.9% (ends at 14.8m/20m) |
| Warnings | none | none | "velocity methods disagree by more than 15%" | "zone time unavailable: finish_crossing_unavailable" |
| Pose-valid frames (top-level) | 142/142 (100%) | 668/1020 (65.5%) | 319/483 (66.1%) | 216/233 (92.7%) |
| Longest continuous pose run | 142 (0–141) | 668 (0–667) | 247 (0–246) | 99 (30–128) |
| Backward recovery (Day 104) | n/a (locks too fast) | anchor=10, 0 recovered, stopped at frame 9 (`teleport_implausible_velocity`) | anchor=8, 0 recovered, stopped at frame 7 (`teleport_implausible_velocity`) | anchor=4, 0 recovered, stopped at frame 3 (`implausible_human_aspect`) |

**measurementStartPositionM / measurementEndPositionM**: Gav 0.92m→18.16m;
Vanni 240 0.47m→19.68m; Vanni 120 1.47m→19.03m; Vanni 60 1.43m→**14.80m**
(the direct, quantified evidence of "lost during the second half").

---

## 9. Screenshot-to-session mapping

| User-reported result | Matching benchmark | Confidence | Why |
|---|---|---|---|
| 2.21s / 1.91m / 2.06m / 4.85Hz / 9.05 m/s / 10.58 m/s | **`vanni_fly_240`** | **Definitive** | All 6 numbers match the real production replay to 2–3 decimal places (2.21 / 1.913 / 2.061 / 4.848 / 9.050 / 10.580). No other session's output is close on even one of these six numbers simultaneously. |
| "Approximately accurate timing but some steps dropped" | **`vanni_fly_120`** | **High** | zoneTimeS=2.19s (plausible/"approximately correct"); 3 of 11 contacts excluded, only 8 eligible (matches "some steps were dropped"); the only session with a persisted velocity-disagreement warning. |
| "Late-run athlete loss, timing unavailable" | **`vanni_fly_60`** | **Definitive** | The only session where `zoneTimeS` is null and `timingProvenance.timingAvailabilityReason = "finish_crossing_unavailable"`; measurement coverage physically ends at 14.8m of 20m — direct, unambiguous evidence of losing the athlete before the finish gate. |
| Values around 2.72m / 3.10m / 3.22m / 3.50m | **Could not be matched with certainty** | **None** | Every individually-computed step length across all 4 live sessions was enumerated (Gav: 2.06–2.24m; Vanni 240: 1.64–2.12m; Vanni 120: 1.78–2.05m; Vanni 60: 0.78–2.06m) — **none reach 2.7m**, let alone 3.5m. These screenshots almost certainly belong to a session that no longer exists (the original, pre-trim Vanni 60fps session documented in `docs/day-104-...md`, deleted during the Aug 4 cleanup — its artifacts cannot be re-verified). Stated plainly rather than guessed. |

---

## 10. Ground-truth inventory

| Metric | Value | Source | Recording | Independent? | Confidence in match |
|---|---|---|---|---|---|
| zoneTimeS | 1.93s | VueMotion | `gav_stationary_reference` | Yes — external system | High (linked via `benchmarks` row "AVA Calab Vid 1", same 20m distance, same athlete) |
| avgStepLengthM | 2.15m | VueMotion | `gav_stationary_reference` | Yes | High |
| avgVelocityMps | 10.36 | VueMotion | `gav_stationary_reference` | Yes | High |
| maxVelocityMps | 10.74 | VueMotion | `gav_stationary_reference` | Yes | High |
| combinedStepFrequencyHz | 4.86 | VueMotion | `gav_stationary_reference` | Yes | High |
| (all metrics) | — | — | `vanni_fly_240` | — | `groundTruthStatus: unavailable` |
| (all metrics) | — | — | `vanni_fly_120` | — | `groundTruthStatus: unavailable` |
| (all metrics) | — | — | `vanni_fly_60` | — | `groundTruthStatus: unavailable` |

No Freelap, Brower, manual frame-timing, tape measurement, or other
external reference exists in this database or documentation for any Vanni
recording. **The Gav VueMotion reference was not transferred to any Vanni
benchmark** — confirmed both by design (registry structure) and by a
dedicated sanity check. AVA's real production output for Gav reproduces
its own VueMotion reference to within ~1% on every available metric
(zoneTimeS and avgVelocityMps match exactly; avgStepLengthM/
combinedStepFrequencyHz within 0.3%; maxVelocityMps within 1.1%) — real,
useful evidence that the pipeline is well-calibrated on this exact clip,
reported here as context, not as license to assume the same accuracy holds
for the Vanni benchmarks.

---

## 11. Validation registry files

- `docs/stationary-validation-registry.md` — human-readable.
- `validation/stationary-validation-registry.json` — machine-readable,
  `schemaVersion: ava-stationary-validation-registry-v1`. Considered
  reusing `validation/datasets/ava-validation-dataset-v1.json`'s schema
  more literally, but that schema is purpose-built for ML train/holdout
  dataset tracking (`split`, `leakageEvents`, `checksumSha256` computed by
  hand) — a different job from session/analysis identification + roadmap
  linkage. Built a purpose-fit schema instead, at the exact path this
  task specified, storing the Storage-backend's own ETag as the "source
  hash" (real, already-computed, no need to download+hash the files
  myself) rather than inventing a new checksum step.

---

## 12. Developer identification UI change

Added `src/app/sessions/[id]/SessionDevIdentityCard.tsx` — a new, separate,
server-rendered, dev-only (`process.env.NODE_ENV === "production"` →
renders `null`) card on the session page showing session ID, analysis ID,
verified source FPS, source filename, registered benchmark key (looked up
from the JSON registry by session ID), protected status, pipeline version,
pose backend/model version, and analysis status.

**Deliberately not added to `VideoOverlay.tsx`'s existing debug HUD**, even
though that would have been the more obvious/minimal-diff location: this
phase's own instructions explicitly forbid modifying "overlays." A brand
new, separate component was the correct, compliant choice instead. Two
already-fetched-but-previously-unselected columns were added to `page.tsx`'s
existing session/analysis queries (`is_reference_benchmark`, `model_version`)
— no new query, no algorithm/analysis behavior change, verified via a clean
`tsc`/`lint`/`build`.

---

## 13. Roadmap progress tracker

`docs/stationary-roadmap-progress.md` — full 18-phase table with status,
weight, phase-completion fraction, weighted contribution, acceptance
criteria, evidence links, blocking issues, and next actions per phase.
**Only Phase 0 is complete.** Phases 1–17 are explicitly `Not Started`, with
proposed (not yet validated) acceptance criteria drafted from this
document's own real findings — prior Day 96–104 work is linked as
foundation evidence throughout, never auto-credited as completing a v4.0
phase.

---

## 14. Phase 0 acceptance results

All 13 criteria met — see `docs/stationary-roadmap-progress.md`'s Phase 0
section for the itemized checklist. Summary: all 4 benchmarks identified
with certainty (ffprobe-backed for all 4, cross-checked against the
project's own `classify_fps`); every current production metric mapped to
its session; screenshots mapped where evidence permits (3 of 4 groupings
matched, 1 explicitly reported as unmatchable); ground truth linked only to
Gav; both registries exist; roadmap tracker exists and computes weighted
completion; no algorithm touched; Gav verified still protected; tests/
typecheck/lint/build all run with results reported honestly (Section 18).

---

## 15. Overall weighted roadmap completion

**3.8%** (normalized to the stated weights summing to 100%; also 3.8% on
the literal as-specified 105% basis, since only one phase currently
contributes — see `docs/stationary-roadmap-progress.md` for why the two
bases will diverge once more phases are underway).

Remaining: **96.2%**.

---

## 16. Files changed

**New**: `docs/stationary-validation-registry.md`,
`validation/stationary-validation-registry.json`,
`docs/stationary-roadmap-progress.md`,
`scripts/stationary-validation-registry-sanity.mjs`,
`src/app/sessions/[id]/SessionDevIdentityCard.tsx`,
`docs/phase-0-validation-registry-report.md`.

**Modified**: `src/app/sessions/[id]/page.tsx` (added `is_reference_benchmark`
to the sessions select, `model_version` to the analyses select, rendered
`SessionDevIdentityCard`), `package.json` (1 new script:
`stationary-validation-registry:sanity`).

No other files were touched by this phase — every other entry in `git
status` predates it (Days 90–104 and the prior cleanup phase's carryover
work).

---

## 17. Database changes

**None.** This phase performed read-only queries only (sessions, analyses,
analysis_jobs, athletes, profiles, storage.objects, benchmarks). No
migration, no RPC, no table, no row was created or modified. The
`is_reference_benchmark` column and protection RPCs/trigger referenced
throughout this report were added in the prior cleanup phase
(`docs/local-validation-dataset-cleanup.md`, migrations 0072/0073), not this
one.

---

## 18. Tests and exact results

| Command | Result |
|---|---|
| `npm run stationary-validation-registry:sanity` (new) | **45/46 passed.** The 1 failure is deliberate and disclosed: `roadmap phase weights total exactly 100% (got 105%)` — reflects the real discrepancy in the task's own stated weights (Section 15 / roadmap doc header), not a bug in the registry or the test. |
| `npm run session-protection:sanity` (from the prior phase, re-run for confidence) | 16/16 passed — protection mechanism still intact. |
| `npm run worker:check` | Passed (`worker_configuration_valid`). |
| `npm run lint` | Passed (0 warnings). |
| `npm run typecheck` | Passed (0 errors). |
| `npm run build` | Passed (production build, all routes, including `/sessions/[id]` with the new card). |

No MediaPipe analysis was rerun — all 4 sessions already had real, complete
analyses from the user's own production runs; all evidence in this report
came from re-reading already-persisted artifacts and re-running the
existing, unmodified TypeScript measurement function against them.

---

## 19. Remaining ambiguities

- **The 2.7–3.5m screenshot values remain unmatched** (Section 9) — most
  likely from a now-deleted session; cannot be re-verified without the
  original artifacts. Recommend confirming with the user whether these
  screenshots can be reproduced from a still-available source, or should be
  treated as historical/moot.
- **The roadmap's phase weights sum to 105%, not 100%** — needs a human
  decision on which weight(s) to correct; not guessed at.
- **The FPS conflicts on `vanni_fly_240`/`vanni_fly_120`** are documented
  with high confidence but not yet proven to be THE cause of the user's
  "zone time was slightly inaccurate" observation — Phase 1's job, not
  Phase 0's.
- **No independent ground truth exists for any Vanni benchmark** — Phase 16
  (full scientific validation) is blocked on obtaining some until then.

---

## 20. Git status

Working tree only — **nothing was committed or pushed.** `git status
--short` before and after this phase confirms only the files in Section 16
were touched; every other untracked/modified file predates this phase
(carryover from Days 90–104 and the prior local-validation-dataset-cleanup
phase, none of it created or altered here).

---

## 21. Exact recommended Phase 1 prompt scope

> Phase 1 — 240 FPS zone-time diagnosis. Using `vanni_fly_240`
> (`benchmarkKey` in `validation/stationary-validation-registry.json`,
> session `31fe352b-f00f-4a80-b20a-17c2ab08ec5a`), investigate why
> `classify_fps` (`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`)
> trusts `averageFps` (223.926) for the `native_source_class` branch
> instead of cross-checking `timestampFps` (239.98) the way the
> validated-60/experimental-30 bands already do. Determine whether
> correcting this (a) is safe without weakening any existing FPS-validation
> threshold, (b) actually improves `vanni_fly_240`'s zone-time accuracy —
> which will likely require establishing some independent reference for
> this specific clip first, since none currently exists. Do not touch
> `vanni_fly_120`/`vanni_fly_60`/Gav's classification logic path speculatively
> — validate on `vanni_fly_240` first, then decide if the same fix applies
> to `vanni_fly_120`'s analogous (larger, ~10.8%) conflict. Update
> `docs/stationary-roadmap-progress.md` Phase 1's status/evidence only after
> real validation against this exact benchmark, not because related code
> was written.
