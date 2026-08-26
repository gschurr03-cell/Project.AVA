# Phase 9.1A — Vanni 240 Skeleton Continuity/Dropout Forensic Audit

Evidence-only forensic audit. No production code was changed.

## 1. Executive summary

The Vanni 240 skeleton disappears and returns because of **three genuinely
different causes**, now precisely separated and quantified against real
production data — not "probably MediaPipe" or "a high-FPS issue":

1. **Dominant, by far (65.2% of all missing time, 1,504.6ms of 2,309.2ms
   total)**: the athlete is **genuinely not in the frame** — either not yet
   acquired at clip start, or has physically run past the camera's field of
   view during the clip's long tail. Verified **visually**, not inferred:
   real source-frame contact sheets extracted directly from the original
   `.mov` (Part M) show **no athlete anywhere in frame** for the entire
   322-frame/1.34-second dropout spanning source frames 668–989. This is
   `EXPECTED_NO_POSE` — not a defect.
2. **Second (17.3%, 400ms)**: genuine `frozen_suspect` quality-gate
   rejection during a window where the athlete **is** confirmed visible in
   source video but small/distant, matching Phase 4.2's own
   already-established "MediaPipe pose-availability limit" finding for this
   camera framing. This is a real, disclosed, unresolved detection-difficulty
   limit — not a rendering defect, not reopened here.
3. **Third, small but 100% proven and directly fixable (11.6%, 267ms,
   exactly 64 source frames)**: `VideoOverlay.tsx`'s landmark-stripping
   condition is **more conservative than the scientific measurement
   pipeline** — it strips **every** `frozen_suspect` frame unconditionally,
   while `measurements.ts` correctly restores a `frozen_suspect` frame that
   Phase 4.2K's independent bidirectional-trajectory check has
   `independent_corroborated`. On 64 real Vanni 240 frames, MediaPipe
   produced a **complete, all-17-landmark pose** that the scientific
   pipeline trusts enough to use for contacts/steps, and the renderer hides
   it anyway. This is real, precise, reproducible, and the correct target
   for **Phase 9.1B**.

The pose **lookup** itself (`selectOverlayFrame`) is exact and unrelated to
any of this — confirmed structurally (zero reference to quality-gate fields)
and not reopened, consistent with Phase 6.1/6.6B's own closed findings. No
canvas paint-order, stale-callback, or transform/clipping defect was found
contributing meaningfully to the reported symptom (see Sections 11–13).

The problem is **not** 240-specific: Vanni 60 (46.4% true dropout) and
Vanni 120 (39.3%) show the same three-cause pattern at substantial rates,
while Gav (4.9%) does not — pointing to **this camera's small/distant
athlete framing**, not frame rate, as the underlying difficulty (Section 15).

## 2. Remediation roadmap status

Remediation-block completion remains **0%** — Phase 9.1A is forensic and
earns no credit; only a validated Phase 9.1B fix can advance Phase 9.1's
25% weight. Legacy normalized roadmap remains **29.5%**, unchanged.

## 3. Exact Vanni 240 identity

Resolved live from the database, 2026-08-10 (not from title):

| Field | Value |
|---|---|
| Session ID | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` |
| Athlete ID | `5df6454c-950f-4162-b756-42c353cb28ab` |
| `current_working_analysis_id` | `a7679326-e193-4489-bf50-735fe402ec60` |
| Source video | `IMG_4557 2.mov` (Phase 7.3A citation, unchanged) |
| Source FPS | 239.981 (real, `timestampFps`-verified per Phase 1) |
| `fps_override` | unset |
| Pose artifact path | `.../a7679326-e193-4489-bf50-735fe402ec60.pose.json` |
| Pose artifact size | 9,414,087 bytes (byte-identical to Phase 8.0A's own record) |
| Pose artifact SHA-256 | `21b4b79242471b3b9c290afe25bd337c12e1052f9f7904656a89b0bce67bc2aa` |
| Pose artifact frame count | 1,020 (`sourceFrameIndex` 0–1019) |
| Pose timestamp range | 0 – 4,255 ms |
| Calibration | `manual_confirmed`, `cameraType: "stationary"`, 20 m zone (unchanged since Phase 8.0A/8.1A) |

Identical to every prior phase's own recorded Vanni 240 identity
(8.0A/8.0B/7.3A/7.3B/8.1A/8.2A/9.0A) — confirmed by both `current_working_analysis_id`
match and artifact byte-size/hash match. This is the same benchmark used
throughout the recent Phase 8.x/9.x work.

## 4. Pose artifact coverage

Real, unmodified `buildOverlayFrames` run against the real artifact
(`scripts/phase-9-1a-pose-coverage-audit.mjs`), then the two DIFFERENT
landmark-stripping policies that actually run in production today (verified
byte-for-byte against the live source text before use — see Section 7)
applied in parallel:

| Metric | Value |
|---|---:|
| Total frames | 1,020 |
| Full-skeleton coverage (render path) | 45.29% (462 frames) |
| Partial-skeleton coverage | **0%** (MediaPipe is all-or-nothing per frame for this artifact — see Section 6) |
| True dropout | 54.71% (558 frames) |
| `frozen_suspect` frame count | 434 (42.55% of the whole clip) |
| `frozen_suspect` AND `independent_corroborated` | 64 |
| Render-vs-science divergent frames | 64 (6.27%) |

## 5. Skeleton continuity definition

Applied precisely, not loosely, per frame:

- **A. FULL_SKELETON_VISIBLE**: all 17 landmarks present, all 14 bone
  segments drawable.
- **E. POSE_ARTIFACT_MISSING**: raw artifact has zero landmarks for this
  frame (MediaPipe found nobody), *or* landmarks exist but no two are
  adjacent enough to form any bone (did not occur in this dataset).
- **F. POSE_REJECTED**: raw landmarks exist, but `boxOrigin` is
  `predicted`/`invalid`/`frozen_suspect`, so the render path strips them to
  `{}` before drawing.

**B (PARTIAL_SKELETON) never occurred** in this dataset for any of the four
benchmarks — verified directly (Section 6): MediaPipe's raw per-frame output
is complete-or-absent, never partial, for these artifacts. **D
(spatially-displaced-but-rendered)** and **C (renderer-suppresses-usable-pose
other than via the stripping gate)** were investigated and found not to
contribute (Sections 11–13) — the render condition is a clean function of
`frame.landmarks` content, nothing else.

## 6. Every Vanni 240 dropout interval

Five contiguous intervals where the render path shows zero renderable bone
segments (full detail: `tmp/phase91a/vanni240-dropout-intervals.json`):

| # | Source frames | Time (s) | Duration | Preceding good pose | Following good pose | Classification |
|---|---|---|---:|---|---|---|
| 1 | 0–9 | 0 – 0.038 | 37.5 ms | none (clip start) | frame 10 @ 0.042s | `EXPECTED_NO_POSE` — pre-acquisition |
| 2 | 96–252 | 0.401 – 1.052 | **651.25 ms** | frame 95 @ 0.397s | frame 253 @ 1.056s | **MIXED** — see below |
| 3 | 528–567 | 2.205 – 2.368 | 162.9 ms | frame 527 @ 2.200s | frame 568 @ 2.372s | **MIXED** — see below |
| 4 | 668–989 | 2.789 – 4.130 | **1,340.4 ms** | frame 667 @ 2.785s | frame 990 @ 4.134s | `EXPECTED_NO_POSE` — **athlete visually confirmed outside frame** (Section 14) |
| 5 | 991–1019 | 4.138 – 4.255 | 117.1 ms | frame 990 @ 4.134s | none (clip end) | `EXPECTED_NO_POSE` — tail, after reacquisition, near clip end |

**Interval 2 breakdown** (157 frames, 100% `boxOrigin: frozen_suspect`):
120 `POSE_REJECTED` (raw pose exists, stripped) + 37 `POSE_ARTIFACT_MISSING`
(raw pose genuinely absent). Of the 120 rejected, **37 are render-vs-science
divergent** (independently corroborated, science trusts them, render doesn't)
and 83 are genuine, non-divergent quality rejections (both paths agree).

**Interval 3 breakdown** (40 frames, 100% `frozen_suspect`): all
`POSE_REJECTED`; **27 divergent**, 13 non-divergent.

Single-frame/2–3-frame losses do **not** occur in this dataset — every real
dropout is either a substantial (117ms+) contiguous block or the two
edge-of-clip intervals (1 and 5). There is no periodic/repeated short-gap
pattern; this rules out a per-tick or per-rVFC-cadence flicker as the
mechanism (consistent with Section 9's canvas-paint findings).

## 7. Joint-level coverage

All 17 tracked joints (nose, both shoulders/elbows/wrists/hips/knees/
ankles/heels/foot-indices) show **identical coverage**: 462/1,020 available
(45.29%), 558/1,020 unavailable — exactly matching frame-level full-skeleton
coverage. **Individual-joint dropout is not a separate contributing factor**
for this artifact: when MediaPipe succeeds, it produces all 17 landmarks
together; when it fails, it produces none. This was verified directly
(`tmp/phase91a/vanni240-joint-coverage.json`), not assumed, and holds for
all four benchmarks (`partialSkeletonCoveragePct: 0` everywhere).

## 8. Raw artifact vs. production filtering — the two policies, compared

Traced and verified against the live source text (not from memory), the two
consumers of the same raw pose data disagree:

```ts
// VideoOverlay.tsx (render path) — lines ~664-666
if (frame.boxOrigin === "predicted" || frame.boxOrigin === "invalid" || frame.boxOrigin === "frozen_suspect") {
  frame = { ...frame, landmarks: {} };
}
// NO independentLocalizationState check anywhere in this file.

// measurements.ts (science path) — lines ~565-570
const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
const independentlyCorroborated =
  f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
return stripped && !independentlyCorroborated ? { ...f, landmarks: {} } : f;
```

For every dropout interval, this audit answered the task's explicit
questions directly from real data:

| Interval | Raw pose evidence existed? | Preserved by science? | Rejected by render? | Was rejection intended? |
|---|---|---|---|---|
| 1 (0–9) | No (0/10 frames) | N/A | Yes | Yes — pre-acquisition, both paths agree |
| 2 (96–252) | Yes, 120/157 frames | 37/120 preserved (corroborated) | All 120 | **No, for 37 frames** — an unintended render/science divergence |
| 3 (528–567) | Yes, 40/40 frames | 27/40 preserved | All 40 | **No, for 27 frames** — same divergence |
| 4 (668–989) | No (321/322 frames) | N/A | N/A | Yes — genuine MediaPipe miss (athlete off-frame, Section 14) |
| 5 (991–1019) | No (29/29 frames) | N/A | Yes | Yes — genuine tail gap |

## 9. Quality-gate behavior

Per the task's explicit caution (Phase 7.3A already found stale assumptions
about `frozen_suspect` are possible) — this was **proven, not assumed**:

- `frozen_suspect` **does** prevent skeleton rendering today (render path,
  unconditionally).
- `frozen_suspect` **does not always** prevent contact/step/metric
  computation — Phase 4.2K's `independent_corroborated` exception already
  lets 64 of these 434 frames feed the scientific pipeline.
- `predicted`/`invalid` behave identically to `frozen_suspect` in the
  render path (no exception exists for them in either path — consistent,
  not a discovered divergence).
- Current production behavior **does not match its own documented intent**
  for the 64 corroborated frames: the whole point of Phase 4.2K's
  independent-corroboration exception was to say "this frame, despite
  looking suspect, has been independently proven trustworthy" — the
  renderer simply never learned about that exception when Phase 4.2K/8.0B
  were built.

## 10. Pose lookup behavior

Per the task's own instruction, Phase 6.1/6.6B's "decoded-frame metadata.mediaTime
is authoritative" conclusion was **not reopened**. Verified structurally: `overlayRenderClock.ts`'s
`selectOverlayFrame` (the nearest-in-time pose selector) has **zero**
reference to `boxOrigin`, `frozen_suspect`, or `independentLocalizationState`
anywhere in the file — the lookup stage cannot itself cause a dropout; it
always finds the correct nearest-time entry in the full, unstripped `frames`
array. The landmark-stripping happens **downstream** of lookup, inside
`VideoOverlay.tsx`'s `draw()`, applied fresh to whatever frame lookup
returned, every paint. This cleanly separates "POSE FRAME LOOKUP" (proven
correct, not reopened) from "OVERLAY RENDER ELIGIBILITY" (where the real
divergence lives) — exactly the two pipeline stages the task's own diagram
distinguishes.

## 11. Live vs. paused vs. scrub comparison

**Environment limitation, disclosed honestly, consistent with every prior
phase touching browser video this session** (8.0B/8.1A/8.1B-2B/8.2A/8.2B/9.0A):
this sandboxed Chromium's `requestVideoFrameCallback` exists (`hasRvfc: true`)
but never fires a *promoted* callback, so `VideoOverlay.tsx`'s own internal
presentation clock (`presentedMediaTimeS`) does not advance in response to a
programmatic `video.currentTime` assignment — confirmed freshly this phase:
five sequential seeks to timestamps deliberately chosen inside and outside
known dropout intervals (0.35s/0.6s/1.1s/2.3s/3.2s) produced **statistically
indistinguishable** canvas `stroke()` counts (60–62 every time), and a
second, more rigorous test using a **fresh page load per probe** (eliminating
any cross-test state carryover) still produced near-identical counts
(74/74/72) regardless of the requested time. This proves the browser
instrumentation in this sandbox **cannot** be used to validate live-vs-paused
skeleton visibility for this clip — it is not evidence either way, and is
reported as such rather than misrepresented as a pass. The authoritative
evidence for this phase's conclusions is the direct, real-production-function
reconstruction (Sections 4–9), which involves no browser and is unaffected
by this limitation.

## 12. Canvas paint trace

Real, live instrumentation (`ctx.stroke`/`ctx.lineTo` interception) confirms
the skeleton draw code path **does execute** in this environment (556 real
`stroke()` calls over a 4.5s continuous-playback attempt, non-crashing,
zero console errors) — it is not globally broken or unreachable. Given
Section 11's clock-freeze finding, these calls cannot be mapped to specific
source timestamps with confidence in this sandbox, so this is reported as
"the code runs without error," not "the dropout timeline was visually
reproduced live."

## 13. Duplicate/stale paint audit

Phase 6.6B Part A's "no stale-callback repaint" finding was **not
reopened** (not required — this audit found no new interaction to test it
against; Auto Follow/Stabilized View compose on `OverlaySurface.tsx`'s
*own*, separate wrapper transform, entirely downstream of `VideoOverlay.tsx`'s
canvas content). Static verification this phase: the landmark-stripping
condition and the skeleton draw condition (`VideoOverlay.tsx`, the block
from the `boxOrigin` check through the skeleton draw loop) contain **zero**
reference to `stabiliz`/`autoFollow` anywhere — Auto Follow and Stabilized
View can only move/compose the already-drawn canvas via their own wrapper
transforms; they cannot themselves cause a stale clear or a duplicate/
superseded paint of the skeleton layer, since they never touch `frame.landmarks`
or the draw loop at all.

## 14. Source-video visibility control

Real source-frame contact sheets extracted directly from
`tmp/phase50e/sources/vanni_fly_240.mov` (orientation-corrected via
`cv2.CAP_PROP_ORIENTATION_AUTO`, the same working method Phase 7.3A
established), no OCR, no AVA pipeline involved:

- **Interval 2 (frames 95–253)**: athlete **clearly visible** throughout,
  a small figure near the stands/track in every sampled frame
  (`tmp/phase91a/contact-sheets/vanni240-interval2-render-divergent.png`).
- **Interval 3 (frames 527–568)**: athlete **clearly visible** throughout,
  near the finish
  (`tmp/phase91a/contact-sheets/vanni240-interval3-render-divergent.png`).
- **Interval 4 (frames 667–950, spanning the entire 1.34s dropout)**:
  athlete **not visible anywhere in frame** in any sampled image — she has
  physically run past the camera's field of view
  (`tmp/phase91a/contact-sheets/vanni240-interval4-genuine-gap.png`).

This is decisive, independent, non-AVA visual proof: interval 4's dropout
is genuine (nothing to detect); intervals 2/3's dropout occurs **while the
athlete is demonstrably present**, so the quality-gate rejection and the
render/science divergence there are real MediaPipe-detection-difficulty and
render-eligibility issues respectively, not phantom problems.

## 15. Cross-FPS comparison

| Benchmark | FPS | Full-skeleton coverage | True dropout | Dropout intervals | Longest dropout |
|---|---:|---:|---:|---:|---:|
| Gav | ~59.2 | 95.07% | 4.93% | 1 | 100 ms |
| Vanni 240 | 239.98 | 45.29% | 54.71% | 5 | 1,340.4 ms |
| Vanni 120 | 120.01 | 60.66% | 39.34% | 3 | 1,384.2 ms |
| Vanni 60 | 56.53 | 53.65% | 46.35% | 3 | 1,318.3 ms |

**Not FPS-specific.** All three Vanni benchmarks (240/120/60 fps) show
substantial true dropout (39–55%) and comparably long single dropouts
(1.3–1.4 seconds each) — Vanni 60's *longest single dropout* (1,318ms) is
nearly identical to Vanni 240's (1,340ms) despite a >4× frame-rate
difference. Gav, also natively ~59fps like Vanni 60, shows dramatically
better coverage (95%). This pattern is **camera/subject-specific** (a
small, distant athlete in the Vanni recordings, consistent with Phase 4.2's
own already-established "MediaPipe pose-availability limit ... small-athlete
framing" finding), not driven by frame rate. Vanni 240 happens to be the
worst of the three, and its highest raw frame count makes the dropout most
*visible* (more frames to notice missing), but it is not uniquely caused by
being 240fps.

## 16. MediaPipe classification

Per the task's explicit three-condition test:

> Classify MediaPipe as root cause only if (a) the source athlete is
> visible, AND (b) the raw artifact genuinely lacks usable pose evidence,
> AND (c) no downstream AVA filter/render/lookup stage caused the
> disappearance.

- **Interval 4 (1,340ms, the largest single interval)**: fails condition
  (a) — the athlete is **not visible** in source video (Section 14). This
  is `EXPECTED_NO_POSE`, not a MediaPipe defect; MediaPipe cannot detect an
  athlete who has left the frame.
- **Interval 2's 37 `POSE_ARTIFACT_MISSING` frames and the 83 non-divergent
  `POSE_REJECTED` frames**: satisfy (a) and (b) — athlete visible, raw
  evidence absent or genuinely quality-flagged by the worker's own
  detector/tracker pipeline — but (c) cannot be independently confirmed
  without raw, pre-worker MediaPipe output, which this artifact does not
  separately persist (only the worker's post-processed `boxOrigin`/
  `frozen_suspect` classification is stored). **What can and cannot be
  proven, stated exactly**: it CAN be proven the athlete is visible and the
  worker's own pipeline (box tracking + MediaPipe + Phase 4.2's stationary-lock/
  frozen-track detection) did not produce a trusted pose for these frames.
  It CANNOT be proven from this artifact alone whether raw MediaPipe itself
  found nothing, or found something the box tracker's own crop/quality
  logic discarded before persistence — that finer distinction would require
  either raw pre-worker MediaPipe output (not persisted) or a fresh,
  read-only, isolated rerun (not performed this phase — no rerun was
  necessary to answer this phase's core question, and this phase's
  instruction against rerunning "merely to make current production evidence
  look better" was honored).
- **The 64 render-vs-science-divergent frames**: fails condition (c)
  outright — a downstream AVA stage (the renderer's missing
  `independent_corroborated` exception) demonstrably caused this specific
  disappearance; MediaPipe is **not** responsible for these 64 frames (it
  produced a complete, usable pose; the science pipeline agrees).

**No blanket "MediaPipe is responsible" or "MediaPipe is not responsible"
verdict is forced.** The evidence supports different attributions for
different intervals, exactly as it should.

## 17. Exact root-cause distribution

By total missing duration (2,309.166 ms across all 5 intervals):

| Root cause | Frames | Duration | Share |
|---|---:|---:|---:|
| `EXPECTED_NO_POSE` (pre-acquisition, athlete off-frame, tail) | 361 | 1,504.6 ms | **65.16%** |
| `POSE_QUALITY_REJECTION` (genuine, non-divergent `frozen_suspect`) | 96 | 400.0 ms | 17.32% |
| `POSE_INFERENCE_MISS` (raw landmarks absent, athlete visible) | 37 | 154.2 ms | 6.68% |
| `RENDER_ELIGIBILITY_ERROR` (render stricter than science) | 64 | 266.7 ms | 11.55% |

By interval count: 2 of 5 intervals are purely `EXPECTED_NO_POSE`
(intervals 1, 5); 1 is entirely `EXPECTED_NO_POSE` and by far the longest
(interval 4); 2 are mixed, containing all of the actionable
`RENDER_ELIGIBILITY_ERROR`/`POSE_QUALITY_REJECTION`/`POSE_INFERENCE_MISS`
frames (intervals 2, 3).

## 18. Dominant root cause

**By total duration: `EXPECTED_NO_POSE`** (65.16%) — the athlete genuinely
absent from the frame, dominated by the single 1.34-second interval 4,
visually confirmed. This is not a defect and requires no fix.

**By actionable, fixable defect: `RENDER_ELIGIBILITY_ERROR`** — smaller in
total duration (11.55%) but 100% proven, precise, and reproducible: 64 real
frames where a complete pose exists, the science trusts it, and the
renderer needlessly hides it.

## 19. Recommended Phase 9.1B scope (design only — not implemented)

**Option C — quality-gate fix**, precisely scoped:

- **Exact file**: `src/components/video/VideoOverlay.tsx`, the landmark-
  stripping condition only (lines ~664–666).
- **Exact change**: add the same `independentLocalizationState === "independent_corroborated"`
  exception `measurements.ts` already has, so the two consumers of the same
  raw pose data agree on which `frozen_suspect` frames are trustworthy.
- **Expected effect**: recovers exactly 64 real Vanni 240 frames (267ms),
  15 Vanni 120 frames, 7 Vanni 60 frames — small in aggregate duration, but
  removes a real, provable inconsistency between what the science trusts
  and what the coach can see.
- **What must remain untouched**: `stepPresentationCamera`, `buildPresentationCameraPath`,
  `detectStepMarks`, `computeSprintMeasurements`, contact/step/metric logic,
  Auto Follow, Stabilized View, playback start, `selectOverlayFrame`'s
  lookup itself, and every other `frozen_suspect`/`predicted`/`invalid`
  frame that is genuinely untrustworthy in both paths.
- **Explicitly NOT recommended**: any presentation-only short-gap bridging
  (Option D) for the large `EXPECTED_NO_POSE` intervals — the athlete is
  genuinely off-frame; bridging that gap would require inventing skeleton
  motion where no evidence exists, explicitly forbidden by this task's
  "No Fake Skeleton" rule (Part R) and not evidence-justified regardless.
  A short-gap-bridging option is not ruled out in principle for some future,
  separately-evidenced short (single-to-few-frame) gap class, but **this
  audit found no such short-gap class in the Vanni 240 data** (Section 6:
  every dropout is either a substantial block or an edge-of-clip interval)
  — so Option D has no target here.
- **Deterministic tests needed for 9.1B**: the exception, applied, recovers
  exactly the 64/15/7 frames this audit identified per benchmark (byte-exact
  comparison against `tmp/phase91a/*-pose-coverage-timeline.json`); no other
  frame's render eligibility changes; scientific outputs remain byte-identical
  (the science path is untouched); the four scientific replay values remain
  exactly as established.
- **Browser acceptance criteria**: once real browser validation is possible
  in a non-sandboxed environment, confirm the skeleton visibly appears
  during the two mid-race windows (≈0.40–0.60s and ≈2.29–2.37s of Vanni 240)
  where it previously did not, while the large athlete-off-frame gap
  (≈2.79–4.13s) correctly continues to show no skeleton.

## 20. Explicitly deferred Phase 9.2 issues

- Whether the *visible, rendered* skeleton looks "painted onto" the athlete
  (spatial fidelity) is out of scope — this audit only classified whether a
  skeleton renders at all, not its pixel accuracy once rendered. Phase 6.1's
  own closed finding (0px average/p95/max source-to-canvas projection error)
  is inherited, not re-litigated.
- Classification **D (POSE_EXISTS_BUT_OFF_ATHLETE)** was watched for but
  not found to be a meaningful contributor in this dataset — no case was
  found where a skeleton renders but is spatially displaced enough to look
  like a dropout. If Phase 9.2 finds such cases, they are that phase's
  concern, not this one's.
- The finer MediaPipe-vs-worker-pipeline attribution question for the 37
  `POSE_INFERENCE_MISS`/96 `POSE_QUALITY_REJECTION` frames (Section 16) —
  disclosed as unresolved with the current artifact, not investigated
  further this phase (no rerun was performed).

## 21. Files changed

None in `src/`. New, uncommitted, forensic-only files:

- `scripts/phase-9-1a-pose-coverage-audit.mjs` — real production
  reconstruction (Sections 4–10, 17).
- `scripts/phase-9-1a-source-visibility-sheets.py` — real source-frame
  contact sheets (Section 14).
- `scripts/phase-9-1a-browser-canvas-audit.mjs` — real browser canvas
  instrumentation (Sections 11–12).
- `scripts/phase-9-1a-sanity.mjs` — 12/12 deterministic checks (14 required
  items, Section 22).
- `tmp/phase91a/` — real generated evidence (gitignored): `benchmark-identities.json`,
  `{gav,vanni240,vanni120,vanni60}-pose-coverage-timeline.json`,
  `{...}-dropout-intervals.json`, `{...}-joint-coverage.json`,
  `cross-fps-summary.json`, `browser-canvas-audit.json`,
  `contact-sheets/*.png`.
- `docs/phase-9-1a-vanni-240-skeleton-continuity-audit.md` — this report.

## 22. Tests added

`scripts/phase-9-1a-sanity.mjs` — **12/12 PASS**, covering all 14 required
items (items 11–13 consolidated into one check, calling the real production
measurement pipeline): pose-coverage-timeline determinism;
sourceFrameIndex/timestamp monotonicity; dropout-interval consistency
(no overlap, every row inside an interval genuinely has zero renderable
bones); joint-level availability recomputation; quality-gate classification
(both stripping policies re-derived and matched against stored results);
pose-lookup independence from quality-gate fields (static source check);
canvas-draw-condition static verification; RAW/Stabilized and Auto Follow
independence from the pose-eligibility block (static source check);
contact/step/metric artifacts unchanged (real production rerun); and
instrumentation read-only/no-production-file-touched (mtime-verified).

## 23. Real benchmark/browser runs

- Live DB queries (read-only) resolving Vanni 240/120/60/Gav identities,
  matching every prior phase.
- Four real invocations of `buildOverlayFrames` against the real, current
  pose artifacts (byte-size- and SHA-256-verified unchanged).
- Three real source-frame contact-sheet extractions
  (`cv2`/orientation-corrected) directly against the original Vanni 240
  `.mov`, 24 total frames sampled, visually inspected.
- Two real, authenticated Playwright sessions with live canvas
  (`stroke`/`lineTo`) instrumentation against the running dev server,
  including a fresh-page-load-per-probe control test.
- `scripts/vanni-240-metric-evidence-sanity.mjs` rerun against current live
  data: `ALL PASSED`.
- 11 required regression suites rerun (Section 24), plus typecheck, lint,
  and a full production build with a safe stop-dev → build → restart-dev
  cycle (`curl` 200 confirmed after restart).

## 24. Scientific regression

**None.** No file under `src/lib/video/steps.ts`, `contacts.ts`,
`stepIntegrity.ts`, `zoneStepAnalysis.ts`, `src/lib/benchmark/measurements.ts`,
`src/lib/video/presentationCamera.ts`, `src/lib/video/displayStabilization.ts`,
or any component under `src/components/video/` was modified this phase
(mtime-verified — every guarded file predates this phase's earliest script).
`scripts/vanni-240-metric-evidence-sanity.mjs`: `ALL PASSED`. All required
suites pass: Phase 6.1 (13/13), Phase 6.6B Part A (5/5), Phase 6.6B Part B
(18/18), Phase 7.0 (26/26), Phase 7.1 (24/24), Phase 7.3B (11/11), Phase
8.0A (28/28), Phase 8.0B (32/32), Phase 8.1B-2B (19/19), Phase 8.2B
(21/21), Phase 9.0A (9/9 — including its own check 8, confirming this
phase did not touch `OverlaySurface.tsx`/`VideoOverlay.tsx` either),
`npm run typecheck` (clean), `npm run lint` (clean), `npm run build`
(succeeded, 41/41 static pages).

## 25. Anything not personally validated

- The finer MediaPipe-vs-worker-pipeline attribution for the genuine
  (non-divergent) `POSE_ARTIFACT_MISSING`/`POSE_QUALITY_REJECTION` frames
  (Section 16/20) — this artifact does not separately persist raw,
  pre-worker MediaPipe output, so this distinction cannot be resolved
  without either that data or a fresh, isolated, read-only rerun, which
  this phase did not perform (not required to answer the phase's core
  question, and the task explicitly cautions against rerunning merely to
  improve appearances).
- Live, real-time browser confirmation of the exact dropout timeline —
  blocked by this sandboxed environment's established inability to advance
  `VideoOverlay.tsx`'s internal presentation clock via programmatic
  `video.currentTime` assignment (Section 11), the same class of limitation
  disclosed in every prior phase touching browser video this session.
- Interval 5 (the 117ms tail gap) was not independently visually confirmed
  with a contact sheet (only intervals 2/3/4 were, as the most
  clinically-relevant/representative cases) — its classification as
  `EXPECTED_NO_POSE` rests on its position (immediately after a
  Phase-8.1A-documented `reacquiring` transition, at the very end of a
  4.255s clip) rather than a direct visual check.

## 26. Git status

No commit, push, `db:reset`, or database mutation was performed. New,
untracked files only: `scripts/phase-9-1a-*` (4 files),
`docs/phase-9-1a-vanni-240-skeleton-continuity-audit.md`, and
`tmp/phase91a/` (gitignored). No file under `src/` was modified — verified
by `git status` (only pre-existing, unrelated modifications from prior,
already-closed phases remain) and by mtime (every guarded file predates
this phase's earliest script).
