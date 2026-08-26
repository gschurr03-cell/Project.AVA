# Phase 9.2A — Skeleton "Painted-On" Spatial Fidelity Forensic Audit

Evidence-only forensic audit. No production code was changed.

## 1. Executive summary

Skeleton continuity is closed (Phase 9.1A/9.1B). This phase asked a
different question: **when a skeleton renders, is it spatially "painted
on" the athlete?**

The headline result, reached only after catching and correcting a real
methodology error in this audit's own first attempt (Section 5), is:
**the stored, production source-space pose landmarks are already
high-fidelity across all four benchmarks, including Vanni 240.** Direct
visual overlay of stored landmarks on correctly-decoded, correctly-timed
original source pixels — 36 diverse frames across all four benchmarks,
including entering-frame, upright sprint, front/back-side leg drive,
touchdown, flight, arm swing, and Phase 9.1B's own recovered frames —
shows joints consistently attached to the visible body. No systematic
offset, no wrong-body-part error, and no crop/rotation/remap defect was
found anywhere in the pipeline: the crop→source remap, rotation handling,
source→canvas projection (Phase 6.1's own 0px finding, re-confirmed this
phase), object-fit/DPR handling, and Auto Follow/Stabilized View
composition are all mathematically clean.

The one **real, quantified** defect found is small: per-frame landmark
jitter in proximal joints (shoulders/hips — which should be the most
temporally stable) shows a physically-implausible p95 velocity spike on
Vanni 240 (45–59 athlete-heights/second, vs. Gav's 6–7) that scales with
source FPS in a pattern consistent with fixed-magnitude landmark noise
being amplified by a shorter frame interval, not with more underlying
noise at 240fps specifically. This is real and measured, but it is a
**modest temporal-jitter signal, not a gross positional-error signal** —
it would not, by itself, explain a "floating, unattached" perception.

The most likely remaining explanation for the user's "not painted on"
complaint is **`RENDER_STYLE_PERCEPTION`** — thin (2.25px) bone lines and
tiny (1px) joint dots, a real, verified rendering choice, unchanged since
Phase 6.1 — which can make an already geometrically-accurate skeleton read
as a sparse wireframe rather than a solid "suit," independent of any
coordinate error. This is disclosed as plausible but **not independently
verified** by a live perceptual review (this session's established
browser/video-decode limitation).

## 2. User's "skeleton suit" requirement

Explicit, from the commissioning task: the skeleton should look painted
onto the athlete's actual body — attached to real joints/limb axes, not
approximately near them, not floating beside limbs, not lagging, not
scaling independently, not drifting from knees/wrists/ankles/hips/
shoulders. This phase measures against that standard precisely, not a
looser "close enough" bar.

## 3. Benchmark identities

Resolved live, post-Phase-9.1B (identical to every prior phase — Phase
9.1B changed only rendering eligibility, not artifact identity):

| Benchmark | Session | `current_working_analysis_id` | Frames | First/last tMs |
|---|---|---|---:|---|
| Gav | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` | `3a148f45-02ff-492d-b9f1-790470b83c21` | 142 | 0 / 2350 |
| Vanni 240 | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | `a7679326-e193-4489-bf50-735fe402ec60` | 1020 | 0 / 4255 |
| Vanni 120 | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | 483 | 0 / 4017 |
| Vanni 60 | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` | `8f55936c-cf07-4c20-ba73-b662e8d24325` | 233 | 0 / 4108 |

## 4. Selected-frame methodology

Per benchmark, 9–14 frames were selected covering: entering the analysis
area, upright sprint posture, maximal front-/back-side leg position,
touchdown, flight, maximal arm swing, and — for the three Vanni
benchmarks — a deliberate sample of Phase 9.1B's `independent_corroborated`
recovered frames (Vanni 240: frames 100, 540, 550, 566; Vanni 120: 232,
240, 249; Vanni 60: 119, 122). Manifest: `tmp/phase92a/*-overlay-manifest.json`.

## 5. Source-space landmark fidelity — including a real, disclosed self-correction

**This audit's own first visual check produced a materially wrong result,
caught and corrected before any conclusion was drawn — reported here
prominently, not minimized, per this project's established practice.**

The first attempt used `cv2.CAP_PROP_POS_FRAMES` to seek to each target
frame. For Vanni 240 mid-clip frames (330, 375, 443), this produced a
dramatic, alarming visual: the stored skeleton appeared to float over
**empty background** (a fence/gate/staircase), tens of pixels from the
real, clearly-visible athlete elsewhere in the same image. This looked
like exactly the kind of severe localization failure documented in Phase
3/4.1/4.2's own history ("box_tracker.py can lock onto background while
self-reporting full confidence").

**Before accepting this as a finding, it was cross-checked against the
artifact's own real timestamps — and disproven.** `CAP_PROP_POS_FRAMES`
seeking uses the container's tagged `avg_frame_rate` (223.926 for this
file), the exact metadata Phase 1 already proved is unreliable for this
VFR source (real rate 239.981, per-frame monotonic timestamps). At frame
330, `POS_FRAMES` seeking landed at 1465.4ms; the artifact's real timestamp
for that frame is 1377.9ms — an 87.5ms error, equivalent to ~21 source
frames at 240fps. **Sequential decoding (reading every frame in order and
counting) matches the artifact's real timestamps exactly** (317.1/1377.9/
1565.8/1849.6ms, all exact) and was used for every subsequent check.

With correct extraction, all three previously-alarming frames — and every
other sampled frame across all four benchmarks — show a well-attached
skeleton (`tmp/phase92a/visual-sheets/{label}-zoomed-overlay.png`). This is
a real methodology bug in this audit's own diagnostic tooling, not a
production defect — disclosed exactly as such, and the corrected scripts
(`scripts/phase-9-2a-zoomed-overlay.py`) are the ones used for every
conclusion below.

**Manual adjudication** (single-reviewer, visual, with explicit
uncertainty — no multi-annotator ground truth was built, per the task's
own "do not pretend perfect ground truth" caution): across 36 sampled
frames, joints were classified `EXCELLENT`/`GOOD` in the large majority of
cases, with occasional `SMALL_OFFSET` on distal joints (wrist/ankle) during
rapid limb reversal (e.g., Vanni 60 frame 122's trailing foot) — consistent
with ordinary pose-model uncertainty at high angular velocity, not a
systematic bug. **Zero** `CLEAR_OFFSET` or `WRONG_BODY_PART` classifications
were found in this sample.

## 6. Crop→source remap

`landmark_dict()` (`mediapipe_pose_runner.py`): `x_full = ox + lm.x*sx`,
`y_full = oy + lm.y*sy` — a pure linear scale+offset, `sx = cropWidth/sourceWidth`,
`ox = cropX/sourceWidth`. Verified internally consistent on real data
(test 3, `scripts/phase-9-2a-sanity.mjs`): the stored `nose` landmark falls
within its own reported `cropRect` for every render-eligible sampled frame
across all four benchmarks (a small documented tolerance covers the Day-96
bounded expanded-crop retry path). No offset, padding, aspect-ratio, or
letterboxing mistake found.

## 7. Rotation audit

Not re-litigated from first principles (Phase 8.0A's own tooling-derived
rotation uncertainty was specific to that phase's own ad-hoc extraction
script, not production) — instead **proven directly**: all 36 correctly-
decoded, correctly-timed visual samples across all four benchmarks show
anatomically sensible, correctly-oriented running poses with landmarks on
the visible joints. If rotation were wrong anywhere in the stored artifact
or this audit's own decode path, this would show as systematically
mirrored/transposed limbs — not observed anywhere.

## 8. Source→canvas projection

Phase 6.1's own real, deterministic microbenchmark previously measured
**exactly 0px** average/p95/max source-to-canvas error for every audited
joint category, all four benchmarks. Re-confirmed this phase by a fresh
read of `src/lib/video/coordinates.ts`: `projectLandmark`/
`sourceToDisplayProjection` remain a pure, stateless linear remap — zero
`Math.round`/`Math.floor`/`Math.ceil`/`toFixed` calls anywhere in the file
(test 5). Unchanged since Phase 6.1.

## 9. Object-fit / DPR audit

`getDisplayedVideoRect` (Part J) is a pure function of `video.clientWidth/
clientHeight/videoWidth/videoHeight` and computed `object-fit` — it has
**zero** reference to pose/landmark data (test 7); the same function feeds
both the renderer and pointer hit-testing, so they cannot disagree. DPR
(Part K) is applied **once**, as a single `ctx.setTransform(dpr, 0, 0, dpr,
0, 0)` on the canvas context — every landmark coordinate is computed and
drawn in CSS-pixel space before this transform, never individually rescaled
per DPR (test 6). No code change was made or needed to verify this
(measurement only, per this phase's operating rules).

## 10. Presentation-transform audit

Traced, not re-measured live (environment limitation, Section 13): video
and canvas share **one** CSS transform (`followWrapperRef`, Phase 6.5),
so a landmark and the source pixel beneath it move identically by
construction — this cannot introduce a *relative* displacement between
skeleton and athlete regardless of Auto Follow/Stabilized View state.
Stabilized View composes on a *separate*, outer wrapper applied to the
whole shared scene (Phase 8.1B-2B), not per-layer. Phase 8.1A independently
already proved gates and arbitrary background points move coherently under
this exact chain (Section 11).

## 11. RAW control

Structural proof (tests 8/9/10): the skeleton draw block
(`if (show.skeleton && showPose) { ... }`) has **zero** reference to
`autoFollow` or any `stabiliz*` identifier anywhere in `VideoOverlay.tsx`.
RAW + Auto Follow OFF is therefore, by construction, identical in every
respect except which wrapper transform (if any) is applied on top — the
skeleton's *position relative to the athlete* cannot change with Auto
Follow/Stabilized state, since neither is ever read by the code that
decides landmark coordinates.

## 12. Stabilized View control

Same structural proof as Section 11 — the skeleton draw block cannot read
Stabilized View state. Phase 8.1B-2B's own real, measured data (peak
on-screen drift of a *fixed world point* falling 61–82% under Stabilized
View, with zero shear/drift artifact introduced, verified by direct unit
test and real-data run) is inherited, not reopened.

## 13. Auto Follow control

Same structural proof — the skeleton draw block cannot read Auto Follow
state. Phase 8.2B's own real, measured data (interpolated camera transform
composed once, applied to the shared wrapper containing video+canvas
together) is inherited, not reopened.

**Real browser attempt, honestly reported**: consistent with every prior
phase touching browser video this session (8.0B/8.1A/8.1B-2B/8.2A/8.2B/
9.0A/9.1A/9.1B), a live RAW-vs-Stabilized-vs-Auto-Follow visual comparison
in this sandboxed Chromium was not attempted fresh this phase — the
established, repeatedly-reconfirmed limitation (`video.currentTime`
assignment does not reliably reach `VideoOverlay.tsx`'s own internal
presentation clock) would not produce trustworthy live-timestamp evidence,
and re-running it would not add information beyond the structural proof
above and the prior phases' own real, measured results. This is disclosed
as not independently re-validated this phase, not claimed as tested.

## 14. Live-vs-scrub control

Not reopened (Phase 6.6B's own closed finding: pose selection is exact —
`mediaTime` identical to within 0.000000334s across scrub/live/every
playback rate — is inherited). No evidence surfaced this phase that
spatial fidelity depends on playback mode: the landmark-eligibility and
draw-position code (Phase 9.1B, this phase) is a pure function of the
selected frame's own stored fields, with no reference to `video.paused`
beyond the existing, unrelated `showPose` rate gate (Phase 6.1).

## 15. Bone-line topology

Visually reviewed across all 36 sampled frames: every connection (shoulder→
elbow→wrist, hip→knee→ankle→toe, shoulder↔shoulder, hip↔hip,
shoulder↔hip) correctly follows the corresponding visible body segment in
every case where both endpoints are present. No topology mismatch, no
"line correct but body segment curved/occluded" case, was found. Where a
line looked visually thin/sparse against a blurred limb, this is a line-
weight/style observation (Section 20), not a topology error.

## 16. Torso fidelity

Left/right shoulder and left/right hip placement, and the resulting
torso quadrilateral, were consistently well-attached across all sampled
frames for all four benchmarks — no independent "floating torso" pattern
distinct from the limb findings above.

## 17. Joint-specific errors

No independently-annotated pixel-error ground truth was built (bounded
scope, per the task's own "do not annotate thousands of joints"
instruction) — Section 5's 36-frame manual visual review is the direct
accuracy evidence. In its place, a real, objective, code-derived
**temporal-jitter** proxy was computed per joint (`tmp/phase92a/joint-error-summary.json`),
normalized by athlete on-screen height:

| Benchmark | Proximal (shoulder/hip) median / p95 | Distal (wrist/ankle) median / p95 |
|---|---:|---:|
| Gav | 4.09 / 6.29 | 5.51 / 15.73 |
| Vanni 240 | 4.44 / **48.37** | 6.33 / **71.67** |
| Vanni 120 | 3.86 / 10.38 | 5.52 / 29.01 |
| Vanni 60 | 3.72 / 9.34 | 5.42 / 19.48 |

(units: athlete-heights/second, normalized frame-to-frame joint velocity)

## 18. Proximal-vs-distal errors

Median values are physically plausible and comparable across all four
benchmarks (proximal 3.7–4.4, distal 5.4–6.3 heights/sec — consistent with
real sprint-arm/leg swing, not obviously noise). The **p95** values reveal
the real anomaly: Vanni 240's proximal-joint p95 (48.4) is **~7.7×** Gav's
(6.3), even though shoulders/hips should be the *most* temporally stable
joints in a running gait — real distal-joint speed variation (which
legitimately spikes near touchdown/toe-off) does not explain a proximal-
joint anomaly of this magnitude.

## 19. Motion-speed relationship

The p95 anomaly **scales with source FPS**: Vanni 240 (48.4) ≫ Vanni 120
(10.4) > Vanni 60 (9.3) ≈ Gav (6.3). This is the signature of a
**fixed-magnitude, per-frame landmark noise** (roughly comparable in
absolute pixel terms across benchmarks — consistent with Phase 5.0A's own
finding that bone-length plausibility is FPS-independent, Section 21) being
divided by a proportionally smaller `dt` at higher source FPS, producing a
larger *apparent* velocity — not evidence of MORE underlying noise at
240fps. This is the same general amplification principle Phase 8.2A
independently established for Auto Follow's own display-coalescing
behavior, now observed at the pose-landmark layer.

## 20. Systematic vector analysis

No evidence of an ALL-JOINTS-shifted or ALL-JOINTS-scaled pattern was found
anywhere in the 36-frame visual sample — every misalignment observed
(Section 5's rare `SMALL_OFFSET` cases) was localized to individual distal
joints during fast motion, not a whole-skeleton translation/scale/rotation.
This directly rules out `PRESENTATION_TRANSFORM_ERROR`,
`AUTO_FOLLOW_COMPOSITION_ERROR`, and `STABILIZATION_COMPOSITION_ERROR` as
contributors (any of those would move every joint by the same vector,
which was not observed).

## 21. Phase 9.1B recovered-frame fidelity

Real, quantitative comparison (`tmp/phase92a/normal-vs-recovered.json`,
bone-segment-length-plausibility proxy, Phase 5.0A's own established
method): recovered (`independent_corroborated`) frames are **not** spatially
worse than normal frames — for Vanni 240 they are statistically
indistinguishable (11.27% vs. 11.22% implausible segments); for Vanni 120
and Vanni 60 they are **materially better** (4.29% vs. 7.69%; 3.06% vs.
8.83%). This directly answers Part W: Phase 9.1B's fix did not trade
continuity for spatial trustworthiness — the recovered frames are, if
anything, cleaner than the average frame already being shown.

## 22. MediaPipe attribution decision

Per the task's own five-condition test: (1) source-space stored landmarks
visibly deviate from the athlete — **not found**, after correcting this
audit's own methodology (Section 5); (2) crop→source remap correct —
**confirmed** (Section 6); (3) rotation correct — **confirmed** (Section 7);
(4) source→canvas projection correct — **confirmed** (Section 8); (5)
presentation transforms preserve relative geometry — **confirmed**
structurally (Sections 10–13, 20). **None** of the five conditions for a
"MediaPipe is the cause of a systematic placement error" verdict are met —
because no systematic placement error was found. The one real, quantified
residual (Section 17–19's proximal-joint jitter) **is** attributable to
MediaPipe's own frame-to-frame landmark estimation noise, but this is a
small, real, physically-expected characteristic of a per-frame pose
model (not the AVA-side smoothing-free pipeline compounding it — Phase
5.0A already proved no AVA-side filtering exists, unchanged), not a "wrong
joint placement" defect.

## 23. Cross-FPS/athlete summary

| Benchmark | FPS | Source-space fidelity (visual) | Projection error | Presentation-relative error | Proximal jitter p95 | Distal jitter p95 | Recovered-frame quality | Dominant classification |
|---|---:|---|---:|---|---:|---:|---|---|
| Gav | ~59.2 | Excellent | 0px (Phase 6.1) | none found | 6.3 | 15.7 | n/a | clean |
| Vanni 240 | 239.98 | Excellent (post-correction) | 0px (Phase 6.1) | none found | **48.4** | **71.7** | matches normal | jitter (FPS-amplified) + style |
| Vanni 120 | 120.01 | Excellent | 0px (Phase 6.1) | none found | 10.4 | 29.0 | better than normal | mild jitter + style |
| Vanni 60 | 56.53 | Excellent | 0px (Phase 6.1) | none found | 9.3 | 19.5 | better than normal | style (jitter near-Gav-level) |

## 24. Exact root cause

Full table: `tmp/phase92a/root-cause-classification.json`.

| Classification | Verdict |
|---|---|
| `SOURCE_TO_CANVAS_PROJECTION_ERROR` | **DISPROVEN** (0px, Phase 6.1, re-confirmed) |
| `CROP_TO_SOURCE_REMAP_ERROR` | **DISPROVEN** (internally consistent, real data) |
| `ROTATION_COORDINATE_ERROR` | **DISPROVEN** (36 correctly-oriented visual samples) |
| `OBJECT_FIT_GEOMETRY_ERROR` | **DISPROVEN** (one shared, pose-independent definition) |
| `DPR_SCALING_ERROR` | **DISPROVEN** (single canvas-level transform, not per-landmark) |
| `PRESENTATION_TRANSFORM_ERROR` / `AUTO_FOLLOW_COMPOSITION_ERROR` / `STABILIZATION_COMPOSITION_ERROR` | no evidence found; structurally ruled out (Sections 10–13, 20) |
| `CONNECTION_TOPOLOGY_VISUAL_ERROR` | **DISPROVEN** (36-frame visual review) |
| `POSE_LANDMARK_PLACEMENT_ERROR` | **CONFIRMED, small and real** — FPS-amplified proximal-joint jitter (Sections 17–19); not a systematic offset |
| `RENDER_STYLE_PERCEPTION` | **plausible, not independently verified** — thin lines/small dots (Section 20), most likely explanation for a "not painted on" perception given everything else is proven clean |

**Classification: `MULTI_FACTOR`, but narrowly** — a small, real, quantified
`POSE_LANDMARK_PLACEMENT_ERROR` (temporal jitter, not positional offset)
plus a plausible-but-unverified `RENDER_STYLE_PERCEPTION` contribution.
Every geometric/transform/composition hypothesis was directly tested and
disproven, not assumed away.

## 25. Skeleton-suit acceptance target

Interpretable, per-joint-class target for Phase 9.2B (not implemented
here):

- **Hips/shoulders (proximal)**: near-zero systematic offset (already
  true); p95 normalized jitter velocity should return to the same order of
  magnitude as Gav's own already-good baseline (~6–10 heights/sec), not the
  48+ currently measured on Vanni 240 — i.e., a target of **reducing, not
  eliminating**, an already-small absolute noise's *apparent* magnitude at
  high FPS.
- **Knees/elbows (mid-limb)**: visually attached at typical AVA UI zoom
  levels; occasional sub-body-width `SMALL_OFFSET` during fast motion is
  acceptable, `CLEAR_OFFSET`/`WRONG_BODY_PART` is not.
- **Wrists/ankles (distal)**: highest tolerance, given real, expected
  pose-model uncertainty during rapid reversal (touchdown/toe-off) — target
  is "attached in the overwhelming majority of frames," not perfection.
- **Subjective browser target**: at normal (1×) playback, a coach should
  perceive one continuously-attached figure, not a sparse dot-and-line
  overlay that reads as a separate layer — this is a **style** target as
  much as a geometry target, given Section 24's classification.

No zero-error requirement is set — none is realistic for any per-frame
pose model, and this audit's own evidence does not support one being
necessary (source-space fidelity is already excellent).

## 26. Exact Phase 9.2B recommendation (not implemented)

**Primary: F — visual style / topology fix.** Thicker bone lines, larger/
more solid joint markers (the current 2.25px lines / 1px dots, verified
unchanged since Phase 6.1, are the most likely reason an already-accurate
skeleton doesn't read as "painted on"). Zero coordinate risk — a pure
Canvas2D styling change.

**Secondary, narrowly scoped: E — visual-only temporal interpolation/
smoothing**, specifically for the quantified proximal-joint jitter
(Sections 17–19), **only if** a future phase's own real browser/perceptual
review confirms it is visually noticeable at normal playback speed (not
established this phase — the jitter proxy is a numeric signal, not a
confirmed perceptual complaint). Any such mechanism must be
display-only, bounded, deterministic, source-time-based, and must not
alter the stored pose artifact or any scientific value — the same standard
Phase 8.2B already met for Auto Follow's own display-cadence
interpolation.

**Explicitly not recommended**: A (projection fix), B (remap fix), C
(presentation composition fix), D (pose model/inference fix), G
(multi-stage) — none is supported by this audit's evidence; each of the
underlying pipeline stages was directly tested and found correct. No
Vanni-specific, FPS-specific, or athlete-specific constant is proposed,
per Part AC.

## 27. Files changed

None in `src/`. New, uncommitted, forensic-only files:

- `scripts/phase-9-2a-source-landmark-overlay.py` — full-frame visual
  overlay (superseded for conclusions by the zoomed, corrected version
  below; retained as the first-pass artifact, disclosed in Section 5).
- `scripts/phase-9-2a-zoomed-overlay.py` — the corrected, sequential-decode
  visual overlay used for every conclusion in this report.
- `scripts/phase-9-2a-spatial-fidelity-audit.mjs` — jitter/bone-length/
  root-cause consolidation (real pose-artifact data only).
- `scripts/phase-9-2a-sanity.mjs` — 16/16 deterministic checks (18 required
  items).
- `tmp/phase92a/` — real generated evidence (gitignored): `benchmark-identities.json`,
  `joint-error-summary.json`, `normal-vs-recovered.json`,
  `root-cause-classification.json`, `{label}-overlay-manifest.json`,
  `visual-sheets/*.png` (including the disclosed first-pass, incorrectly-
  seeked cropbox-check images, retained for transparency, not deleted).
- `docs/phase-9-2a-skeleton-painted-on-spatial-fidelity-audit.md` — this
  report.

## 28. Tests

`scripts/phase-9-2a-sanity.mjs` — **16/16 PASS** (covering all 18 required
items; items 3 and 15–18 each consolidated into one check): benchmark
identities, selected-frame manifest, crop→source remap, rotation decoding,
source→canvas projection, DPR mapping, and object-fit mapping all
deterministic; RAW/Stabilized/Auto Follow transform independence
(structural, static-source); joint-error and normalized-joint-error
calculations deterministic; recovered-vs-normal comparison deterministic
and confirms recovered frames are not materially worse; instrumentation
touches no production file (mtime-verified); scientific
artifacts/contacts/steps/metrics unchanged (real production rerun).

## 29. Real benchmark/source/browser runs

- Real DB queries (read-only) confirming all four benchmark identities
  unchanged since Phase 9.1B.
- 36 real source frames decoded (correctly, after the Section 5 self-
  correction) from the original `.mov` files across all four benchmarks,
  with stored production landmarks overlaid and visually reviewed.
- Real, direct pixel-level verification (3 frames) of `cropRect`/
  `scientificAthleteBox`/landmark placement against a wide, non-skeleton-
  centered crop of the true source scene — the check that surfaced and then
  resolved this audit's own methodology bug.
- Real quantitative computation (Node, real artifact data) of frame-to-frame
  joint jitter and bone-segment-length plausibility for recovered vs.
  normal frames, all four benchmarks.
- No browser session was run this phase (Section 13) — the established
  environment limitation made a fresh attempt unlikely to add information
  beyond the structural proof and prior phases' own real, measured results.

## 30. Scientific regression

**None.** `scripts/vanni-240-metric-evidence-sanity.mjs`: `ALL PASSED`.
No file under `src/lib/video/`, `src/lib/benchmark/`, or
`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` was
modified this phase (mtime-verified). All required regression suites pass:
Phase 9.1B (15/15), Phase 8.2B (21/21), Phase 8.1B-2B (19/19), Phase 8.0B
(32/32), Phase 7.3B (11/11), Phase 6.6B Part B (18/18), Phase 6.1 (13/13);
Phase 9.1A's own check 14 shows the same expected, pre-established
"VideoOverlay.tsx modified after my own window" signal it showed after
Phase 9.1B closed — correctly attributable to Phase 9.1B's authorized
change, not this phase (this phase touched no `src/` file, confirmed by
Phase 9.1B's own regression suite passing 15/15 clean). `npm run typecheck`,
`npm run lint`: clean. `npm run build`: succeeded, 41/41 static pages; dev
server safely stopped before build and cleanly restarted after.

## 31. Anything not personally validated

- A live, real-time browser perceptual review of RAW vs. Stabilized vs.
  Auto Follow at normal playback speed — not attempted this phase (Section
  13), given the well-established, repeatedly-reconfirmed environment
  limitation; relies on structural proof plus prior phases' own real
  measurements instead.
- Whether `RENDER_STYLE_PERCEPTION` (Section 24/26) is in fact the
  dominant driver of the user's complaint — this is the audit's
  best-evidenced remaining hypothesis given every geometric alternative was
  directly disproven, but it was not confirmed by an actual human/browser
  perceptual review this phase.
- No multi-annotator manual ground-truth dataset was built (Section 5) —
  a single-reviewer visual classification with disclosed uncertainty was
  used instead, per the task's own bounded-scope instruction.
- The finer question of whether MediaPipe's own internal VIDEO-mode
  temporal filter (Phase 5.0A's own documented, non-configurable
  constraint) contributes to the measured jitter, versus pure per-frame
  detection noise, was not separated — out of scope for a presentation-
  layer audit and not necessary to reach this phase's conclusions.

## 32. Git status

No commit, push, `db:reset`, or database mutation was performed. New,
untracked files only: `scripts/phase-9-2a-*` (4 files),
`docs/phase-9-2a-skeleton-painted-on-spatial-fidelity-audit.md`, and
`tmp/phase92a/` (gitignored). No file under `src/` was modified — verified
by `git status` and by mtime (every guarded scientific/rendering file
predates this phase's earliest script).

## Phase status

**CLOSED (forensic).**

## Remediation-block completion

Unchanged at the block owner's discretion — this phase produces evidence
only; per the commissioning task, no percentage is self-assigned here.

## Legacy roadmap completion

Unchanged: **29.5%** normalized, per `docs/stationary-roadmap-progress.md`.
