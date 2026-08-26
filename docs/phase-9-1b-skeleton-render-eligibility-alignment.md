# Phase 9.1B — Skeleton Render Eligibility Alignment

## 1. Executive summary

Phase 9.1A proved `VideoOverlay.tsx` (the renderer) and `measurements.ts`
(the scientific pipeline) used two different landmark-eligibility policies
for the same `frozen_suspect` frames: the renderer stripped all of them
unconditionally, while the science correctly kept the ones Phase 4.2K's
independent bidirectional-trajectory check has proven
`independent_corroborated`. This phase corrects exactly that one gap — a
single added condition, mirroring the scientific policy's own boolean logic
verbatim — and nothing else.

Real, before/after validation against the current live artifacts
reproduces the fix recovering **exactly** the frame counts Phase 9.1A
predicted: **Vanni 240: 64 frames, Vanni 120: 15 frames, Vanni 60: 7
frames, Gav: 0 frames**. After the fix, the renderer's eligibility decision
matches the scientific pipeline's decision on **every single frame** across
all four benchmarks (`allNowMatchScience: true`). The genuine,
non-recoverable gaps Phase 9.1A identified — the athlete physically leaving
frame (Vanni 240 source frames 668–989), pre-acquisition, and tail
gaps — remain **100% unchanged**, verified directly. No pose interpolation,
smoothing, stale-frame holding, or joint fabrication was introduced. No
scientific value changed.

## 2. Phase 9.1A inherited evidence

- Vanni 240's real dropout pattern: 5 intervals, dominated by duration by a
  genuine 1.34s athlete-off-frame gap (source frames 668–989, visually
  confirmed via real source-frame contact sheets), with two mid-race
  intervals (96–252, 528–567) containing a mix of genuine quality rejection
  and 64 real, provable render/science divergent frames.
- The exact code-level cause: `VideoOverlay.tsx`'s landmark-stripping
  condition (lines ~664–666, pre-fix) lacked the
  `independentLocalizationState === "independent_corroborated"` exception
  `measurements.ts` already applies.
- The proven, not-reopened conclusion that pose *lookup*
  (`selectOverlayFrame`) is exact and unrelated to this divergence — this
  phase did not touch it.
- The cross-FPS confirmation that Vanni 120 (15 divergent frames) and Vanni
  60 (7 divergent frames) show the identical class of divergence, while Gav
  shows none.

## 3. Exact pre-fix policy divergence

Both re-read and confirmed unchanged at the start of this phase (matching
Phase 9.1A's own record exactly, byte-for-byte):

```ts
// VideoOverlay.tsx (PRE-FIX)
if (frame.boxOrigin === "predicted" || frame.boxOrigin === "invalid" || frame.boxOrigin === "frozen_suspect") {
  frame = { ...frame, landmarks: {} };
}
// -- no independentLocalizationState reference anywhere in this file.

// measurements.ts (unchanged before and after this phase)
const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
const independentlyCorroborated =
  f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
return stripped && !independentlyCorroborated ? { ...f, landmarks: {} } : f;
```

The one missing term: `!independentlyCorroborated`.

## 4. `measurements.ts` scientific policy (verbatim, not reinterpreted)

`computeSprintMeasurements`'s own `frames` map (`src/lib/benchmark/measurements.ts`,
lines ~565–570):

- A frame is `stripped` if `boxOrigin` is `predicted`, `invalid`, or
  `frozen_suspect`.
- **Exception**: `stripped && !independentlyCorroborated` — a frame is only
  actually cleared to `{}` if it is stripped AND not independently
  corroborated. `independentlyCorroborated` requires **both**
  `boxOrigin === "frozen_suspect"` (never `predicted`/`invalid` — those
  never carry a real detector-anchored box to independently verify in the
  first place) **and** `independentLocalizationState === "independent_corroborated"`.
- **Why the exception exists**: Phase 4.2K's independent, zero-new-dependency
  bidirectional-trajectory check proves the box's real position agrees with
  trusted evidence both before and after an uncertain run — a
  `frozen_suspect` frame that passes this check is not "probably wrong," it
  is independently confirmed correct, so scientifically excluding it would
  discard real, verified evidence.
- **What proves a frame trustworthy**: the worker-computed
  `independentLocalizationState` field, persisted per-frame in the pose
  artifact, set by `mediapipe_pose_runner.py`'s `verify_independent_localization`
  (Phase 4.2K, inherited and untouched by this phase).

This policy was **not reinterpreted**. This phase's fix reads it, does not
modify it, and makes the renderer produce the identical boolean decision.

## 5. `VideoOverlay.tsx` prior policy

Confirmed exactly matching Phase 9.1A's record: strips `predicted`/
`invalid`/`frozen_suspect` frames unconditionally, with **zero** reference
to `independentLocalizationState` anywhere in the file (verified by grep
before editing). The missing term was proven, not assumed.

## 6. Implementation decision

Per the task's explicit instruction ("prefer the smaller, safer change";
"if extracting a helper risks touching scientific behavior, prefer the
local minimal correction"): **Option A — local renderer mirror**, not
Option B (shared helper).

Extracting a shared pure helper would require touching `measurements.ts`
(even for a behaviorally-identical refactor) to have it call the new
helper — that means editing a file this task explicitly protects
("Do not change scientific pose eligibility... Do not change contacts/
steps/timing/metrics/calibration/localization"), for zero behavioral
benefit over a local mirror. The local mirror achieves full alignment with
**zero** modification to `measurements.ts`, **zero** new shared module,
**zero** new import surface, and a change confined entirely to
presentation code. A future architecture-cleanup phase could still extract
a shared helper if desired; this phase deliberately does not, per its own
narrow scope.

## 7. Code change

`src/components/video/VideoOverlay.tsx`, the landmark-stripping condition
only (one added `const`, one widened `if`):

```ts
// Phase 9.1B: mirrors measurements.ts's own eligibility policy exactly.
const isIndependentlyCorroborated =
  frame.boxOrigin === "frozen_suspect" && frame.independentLocalizationState === "independent_corroborated";
if (
  (frame.boxOrigin === "predicted" || frame.boxOrigin === "invalid" || frame.boxOrigin === "frozen_suspect") &&
  !isIndependentlyCorroborated
) {
  frame = { ...frame, landmarks: {} };
}
```

Every prior line in this file is unchanged. `OverlayFrame`'s
`independentLocalizationState` field already existed and was already
threaded through `buildOverlayFrames` (Phase 4.2K) — no schema or plumbing
change was needed.

## 8. Vanni 240 before/after

Real reconstruction (`scripts/phase-9-1b-eligibility-validation.mjs`,
real `buildOverlayFrames` against the live, hash-verified pose artifact):

| Metric | Before | After |
|---|---:|---:|
| Full-skeleton frames | 462 | **526** |
| Recovered frames | — | **64** (exact match to Phase 9.1A's prediction) |
| Recovered source-frame indices | — | 96–107, 109–112, 114–117, 119, 121, 123–125, 127–136, 140–141, 538–563, 566 |
| Render eligibility now matches science on every frame | — | **true** |
| Genuine off-frame interval (668–989, 322 frames) | 100% skeleton-free | **100% skeleton-free, unchanged** |

## 9. Vanni 120 before/after

| Metric | Before | After |
|---|---:|---:|
| Full-skeleton frames | 293 | **308** |
| Recovered frames | — | **15** (exact match), source frames 232–246 |
| Render eligibility now matches science on every frame | — | **true** |

## 10. Vanni 60 before/after

| Metric | Before | After |
|---|---:|---:|
| Full-skeleton frames | 125 | **132** |
| Recovered frames | — | **7** (exact match), source frames 119–125 |
| Render eligibility now matches science on every frame | — | **true** |

## 11. Gav regression

| Metric | Before | After |
|---|---:|---:|
| Full-skeleton frames | 135 | **135** — unchanged |
| Recovered frames | — | **0**, exactly as expected (Gav has zero `frozen_suspect` frames — Phase 9.1A Section 4/15) |
| Render eligibility now matches science on every frame | — | **true** |

No new skeleton frame was introduced for Gav; pose identity and skeleton
eligibility are byte-identical before and after.

## 12. Genuine gaps preserved

Explicitly re-verified after the fix, not assumed:

- Vanni 240's 322-frame athlete-off-frame interval (source frames
  668–989): **100% still skeleton-free**.
- Vanni 240's pre-acquisition gap (source frames 0–9): **100% still
  skeleton-free**.
- Vanni 240's tail gap (source frames 991–1019): **100% still
  skeleton-free**.
- Every remaining `frozen_suspect` frame that is **not**
  `independent_corroborated` (107 frames on Vanni 240 with real raw pose,
  8 on Vanni 120, 19 on Vanni 60) remains stripped — the fix did not loosen
  eligibility for any frame the science does not also trust.

## 13. Live/pause/scrub behavior

The eligibility condition is a **pure function of the selected frame's own
stored fields** (`boxOrigin`, `independentLocalizationState`) — it holds no
reference to any previous frame, playback state, or wall-clock value
(verified: test 17, static source check for `previous`/`prevFrame`/
`lastFrame`/`.current` references — none found; also verified by direct
recomputation matching the stored result for 200 real rows across all four
benchmarks). By construction, the same source time produces the same
eligibility decision whether reached via live playback, pause, or scrub —
there is no playback-mode-dependent code path in this condition to diverge.

**Real browser attempt, honestly reported**: real, authenticated Playwright
probes at three known timestamps (a recovered-interval time, a second
recovered-interval time, and a genuine-gap time) confirmed the skeleton draw
code path executes without error (zero console/page errors, real non-zero
canvas `stroke()` counts) in all three cases. Consistent with every prior
phase touching browser video this session (8.0B/8.1A/8.1B-2B/8.2A/8.2B/9.0A/
9.1A), this sandboxed Chromium's `video.currentTime` assignment does not
reliably propagate to `VideoOverlay.tsx`'s own internal presentation clock
(`presentedMediaTimeS`, which only advances via a real, promoted
`requestVideoFrameCallback` that never fires here) — so this attempt cannot
be used to visually confirm the *specific* live/pause/scrub timestamp
behavior in this environment. This is disclosed plainly, not claimed as a
pass. The authoritative evidence for Section 13's conclusion is the direct,
real-production-function-based purity proof above, which involves no
browser and is unaffected by this limitation.

## 14. Auto Follow / Stabilized independence

Verified structurally (test 10/11): the eligibility block (from the
staleness check through the new corroboration check, ending before
`useCameraProjection`) contains **zero** reference to `autoFollow` or any
`stabiliz*` identifier anywhere in `VideoOverlay.tsx`. Auto Follow and
Stabilized View compose their own transforms entirely downstream, on
`OverlaySurface.tsx`'s separate wrapper elements (`followWrapperRef`/
`stabilizationWrapperRef`) — they can move or scale an already-drawn
skeleton on screen, but cannot influence whether `frame.landmarks` is
populated or empty. This was true before this phase's fix and remains true
after it; the fix does not introduce any new coupling.

## 15. Scientific isolation

Proven, not assumed:

- `src/lib/benchmark/measurements.ts`, `src/lib/video/steps.ts`,
  `src/lib/video/contacts.ts`, `src/lib/video/stepIntegrity.ts`,
  `src/lib/video/zoneStepAnalysis.ts`, `src/lib/video/presentationCamera.ts`,
  `src/lib/video/displayStabilization.ts`, `src/components/video/OverlaySurface.tsx` —
  **all predate this phase's `VideoOverlay.tsx` edit** (mtime-verified).
- `scripts/vanni-240-metric-evidence-sanity.mjs` (real production contacts/
  step-frequency/step-length/velocity pipeline, real current data):
  **ALL PASSED**, both before and after the fix.
- `VideoOverlay.tsx` contains no `writeFileSync`/storage-upload call
  anywhere — it is a pure Canvas2D renderer; it cannot mutate the pose
  artifact, and doesn't.
- The change resides **entirely** in presentation code (`VideoOverlay.tsx`'s
  own local landmark-stripping decision, applied only to what gets passed
  to the skeleton draw loop) — it has no data path back into any scientific
  computation.

## 16. Tests

`scripts/phase-9-1b-sanity.mjs` — **15/15 PASS**, covering all 17 required
items (items 3–5 and 13–15 each consolidated into one check per closely
related group): an ordinary (non-corroborated) `frozen_suspect` frame
remains stripped; a corroborated frame is now eligible; Vanni 240/120/60
recover exactly 64/15/7 frames; the genuine Vanni 240 off-frame interval,
pre-acquisition gap, and tail gap all remain 100% absent; Gav is unchanged;
Auto Follow/Stabilized View have zero reference in the eligibility block;
the pose artifact is never written; contacts/steps/metrics are unchanged
(real production rerun); no interpolation/blend keyword appears in the
eligibility block; and the eligibility decision is a pure, deterministic
function of the current frame's own fields only (both by static source
check and by direct recomputation against 200 real rows).

## 17. Regression

All rerun against current, live artifacts:

| Suite | Result |
|---|---|
| Phase 9.1A sanity | 10/12 — the 2 non-passes are the same expected, pre-established signal (that check asserts *its own* phase's scripts didn't touch `VideoOverlay.tsx`; Phase 9.1B is explicitly authorized to) |
| Phase 9.0A sanity | 8/9 — identical expected signal |
| Phase 8.2B sanity | 21/21 PASS |
| Phase 8.1B-2B stabilization sanity | 19/19 PASS |
| Phase 8.0B overlay-label sanity | 32/32 PASS |
| Phase 8.0A step-length forensic sanity | 28/28 PASS |
| Phase 7.3B temporal-state sanity | 11/11 PASS |
| Phase 7.0 scientific-evidence sanity | 26/26 PASS |
| Phase 7.1 evidence-explanations sanity | 24/24 PASS |
| Phase 6.6B Part B presentation-sync sanity | 18/18 PASS |
| Phase 6.1 overlay-fidelity sanity | 13/13 PASS |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | succeeded, 41/41 static pages; dev server safely stopped before build and cleanly restarted after (`curl` 200 confirmed) |

## 18. Explicit Phase 9.2 deferral

This phase answers only "does a scientifically-trusted skeleton remain
visible?" — it does not judge or correct whether a rendered skeleton is
pixel-accurately aligned to the athlete. No spatial/projection code was
touched. If any of the 86 newly-recovered frames (64+15+7) render a
skeleton that is spatially displaced from the athlete once visually
reviewed, that is explicitly Phase 9.2's concern, not this phase's — it was
not investigated here.

## 19. Files changed

- `src/components/video/VideoOverlay.tsx` — one added `const`, one widened
  `if` condition (Section 7). No other line changed.

New, standalone forensic/validation scripts (not imported by any `src/`
file):

- `scripts/phase-9-1b-eligibility-validation.mjs` — real before/after
  reconstruction (Sections 8–13).
- `scripts/phase-9-1b-sanity.mjs` — 15/15 deterministic checks (Section 16).
- `tmp/phase91b/` — real generated evidence (gitignored): `summary.json`,
  `{gav,vanni240,vanni120,vanni60}-before-after.json`.
- `docs/phase-9-1b-skeleton-render-eligibility-alignment.md` — this report.

## 20. Anything not personally validated

- Real-time, live browser visual confirmation of the recovered frames —
  blocked by this sandbox's established presentation-clock limitation
  (Section 13), identical to every prior phase touching browser video this
  session.
- Whether the 86 newly-recovered skeleton frames look spatially correct
  once actually visible to a human reviewer — explicitly deferred to Phase
  9.2 (Section 18), not investigated here.
- Whether any benchmark beyond these four (no others exist in the current
  live database per Phase 8.0A's own registry check) would show a similar
  divergence — out of scope; these four are the complete current benchmark
  set.

## 21. Git status

No commit, push, `db:reset`, or database mutation was performed. Modified:
`src/components/video/VideoOverlay.tsx` only (additive: one new `const`,
one widened `if` condition — every other line unchanged). New: two scripts
under `scripts/phase-9-1b-*`, this report, and `tmp/phase91b/` (gitignored).
The working tree was already substantially dirty from prior, unrelated,
uncommitted phases; none of that was touched.

## 22. Phase status

**CLOSED.**

## 23. Remediation-block status

Phase 9.1 (Skeleton continuity/dropout, 25% weight) is now the first
implemented-and-validated fix in the new remediation block. Per this task's
own explicit framing, remediation-block completion percentage is not
self-assigned by this report — it remains at the block owner's discretion
to mark, consistent with "Remediation-block completion remains 0% until
Phase 9.1B is actually implemented and validated." This phase reports the
validated evidence (Sections 8–17); the block-completion percentage itself
is not changed by this document.

## 24. Legacy roadmap status

Unchanged: **29.5%** normalized, per `docs/stationary-roadmap-progress.md`,
not separately touched by this phase.
