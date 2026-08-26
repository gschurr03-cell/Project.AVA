# R5B.1 — Frame-by-Frame Athlete Tracking & Pose-Loss Forensic Audit (IMG_4848)

Continuation of the R5A FPS investigation (`docs/r5a1`–`r5a6`, all kept
immutable). FPS is proven correct and controlled for on this file
(`docs/r5a3-vanni-60fps-part2-source-metadata.md`; `validated_60_fps_class`,
real ~60fps decoded timestamps). This phase investigates why the athlete
skeleton is still lost for a large fraction of this correctly-classified
clip. Investigation only — no production code, thresholds, or database
state changed.

## Methodology note (read before the findings)

This audit uses the **actual, already-persisted production pose artifact**
for this exact session (`analyses.keypoints_path`, fetched read-only from
local storage) rather than re-running the pipeline — that artifact already
contains extremely rich per-frame diagnostics (`trackState`, `cropRect`,
`boxOrigin`, `identityContinuityScore`, `coastRiskState`,
`cropRejectedReason`, plus a separate `trackingDebug.frames` array with
candidate-level data) because production instruments its own tracker far
more heavily than the metrics it eventually surfaces to a coach. This
turned out to answer the majority of this phase's questions directly from
real production output, without needing new instrumentation.

Visual ground truth was established by extracting all 163 decoded frames
from `tmp/phaseR5/source-videos/IMG_4848.mov` with OpenCV, applying the
**same 180° rotation correction production applies** (the raw decode is
upside-down — confirmed and corrected before any visual judgment was made,
after an initial contact sheet revealed the error), then reviewing:
nine full-clip overview contact sheets (20 frames each, all 163 frames
covered), plus four zoomed, cropRect-anchored close-up sheets over the
failure region (frames 55–119), plus one additional close-up sheet using
linear position interpolation between the last known-good and first
recovered pose to center the crop independent of the tracker's own
(frozen) position estimate. This is full-clip visual coverage via contact
sheets, not literal single-frame-at-a-time review of all 163 images
individually — stated plainly, since the task's methodology section asked
for exactly this distinction to be honest about.

## R5B.1.1 — Production pipeline trace

`analysis-worker.mjs` → `MediaPipePoseBackend.ts` →
`PythonMediaPipePoseService.ts` (subprocess) →
`mediapipe_pose_runner.py` `main()`:

- **Decoder**: OpenCV `cv2.VideoCapture`, frame-by-frame `cap.read()`, with
  `apply_rotation()` correcting the container's `rotate: 180` tag.
- **Detector cadence** (`box_tracker.py` `AthleteBoxTracker.wants_detector_frame()`):
  the expensive full-frame multi-pose MediaPipe call (`loc.detect_for_video`)
  is **not run every frame**. It always runs when `track_state` is
  `acquiring`/`reacquiring`/`lost`; otherwise it runs on a scheduled cadence
  (`detector_cadence_frames`, default 8), throttled ×4 after
  `CONSECUTIVE_MISS_THROTTLE_COUNT` (5) consecutive misses, or immediately
  on a freeze-suspicion trigger. Every other frame is carried forward by
  cheap optical flow inside `box_tracker.py`, never re-invoking MediaPipe.
- **Candidate construction** (`athlete_tracker.py` `candidate_from_landmarks`,
  `_human_shaped`, `_torso_complete`): when the detector *does* run, each
  returned MediaPipe pose is turned into a `Candidate` and scored for
  plausibility (torso completeness/geometry, human-shape checks).
- **Identity/continuity** (`athlete_tracker.py` `AthleteTracker.step()`,
  `TrackedState`): scores candidates against the last known state
  (`score_candidate_continuity`), promotes a `PendingIdentity` to locked
  once corroborated, tracks `identityContinuityScore`.
- **Box carry-forward + freeze detection** (`box_tracker.py`
  `AthleteBoxTracker.step()`, `_evaluate_freeze_suspicion()`,
  `_resolve_freeze_run()`): between detector frames, the box is carried by
  optical flow (`boxOrigin: "tracked"`/`"forward_tracking"`). If a run of
  frames shows suspicious signals (e.g. `spread_growth`, `trajectory_residual`)
  persisting past `FREEZE_MIN_SUSPECT_MS` (100ms), and a later fresh,
  verified detection disagrees with the frozen position by more than
  `FREEZE_DISAGREEMENT_FW` (0.04, i.e. 4% of frame width), the **entire**
  suspect run is retroactively relabeled `boxOrigin: "frozen_suspect"` —
  deliberately excluded from being used as pose evidence downstream
  (`measurements.ts` withholds `frozen_suspect` frames, mirroring how it
  already treats `predicted`/`invalid`).
- **ROI crop → pose landmarks** (`plan_crops`, Pass 2 in `main()`): a padded
  crop is built around the tracked box and MediaPipe's landmarker runs on
  *that* crop to produce the actual 33-point pose used for measurements.
  If the box is `frozen_suspect`, the crop is rejected
  (`cropRejectedReason: "crop_rejected_frozen_localization"`) and no pose
  is attempted for that frame at all.
- **Persistence**: per-frame diagnostics are captured into
  `tracking_diagnostics` during pass 1 and shaped into the final artifact by
  `build_tracking_debug_artifact()` — **not every diagnostic field survives
  this shaping**: `searchSource`/`primaryFallbackReason` (which would
  distinguish "detector ran and found nothing" from "detector wasn't
  invoked this frame") are captured during the run but are **not present in
  the persisted JSON** — confirmed by a direct grep of the stored artifact.
  This is a real, honest instrumentation gap, marked `NOT_CURRENTLY_INSTRUMENTED`
  below rather than guessed at.

## R5B.1.2 — Reproduction of the known result

Fetched the actual stored artifact
(`analyses.keypoints_path` for session `dcad7ae9-94b5-4cbc-8656-0ad08616a121`,
read-only from local Supabase Storage — the same artifact AVA itself
produced and persisted, not a re-run). Confirmed exactly:

| Metric | R5A.6 report | This phase, reproduced |
| --- | --- | --- |
| Total frames | 163 | **163** ✅ |
| Pose-missing frames | 55 | **55** ✅ |
| Longest contiguous gap | 44 frames | **44 frames** (61–104) ✅ |
| `reacquiring`-state frames | 23 | **23** ✅ (see correction below) |

**Correction to a framing carried over from R5A.6**: the 23 `reacquiring`
frames are **entirely the startup acquisition window (frames 0–22)**, not
the 44-frame gap. `trackState` stays `"tracking"` continuously through
frames 61–104 — the box tracker's own state machine never recognized this
gap as a re-acquisition event while it was happening. This is itself an
important finding, addressed in R5B.1.15/22.

Production's own `recordingAssessment.trackingLossRanges` — computed by a
completely independent part of the pipeline from this phase's own
frame-by-frame reconstruction — lists the identical four ranges:
`[0,4], [61,104], [110,114], [121,121]`, and separately labels this
recording's `recordingMode` as **`"athlete_tracking_lost"`** with the
warning *"The athlete temporarily left the frame or could not be tracked
reliably."* Camera motion is independently confirmed negligible
(`cameraMotionConfidence: 0.97`, mean per-frame translation ~8×10⁻⁶) —
ruling out camera shake as a contributor.

## R5B.1.3 — Canonical 163-frame audit

Written to `tmp/phaseR5/r5b1/frame-audit.json` (163 entries). Every field
listed in the task is present; fields production doesn't persist in a
form that survives to the final artifact are explicitly marked
`NOT_CURRENTLY_INSTRUMENTED` (specifically: per-frame raw-candidate
coordinates/scores for rejected candidates, and whether the detector was
actually invoked vs skipped by cadence on a given frame).

## R5B.1.4/5 — Visual inspection vs production pose

**Athlete first becomes visible in frame at approximately frame 21** (confirmed
via the overview_000/overview_020 contact sheets — frames 0–20 show only
the empty track/field; the runner is a small but clear figure from ~frame
21 onward). From frame 21 through the end of the clip (frame 162), the
athlete remains continuously, unambiguously visible in every reviewed
contact sheet and close-up — including throughout the entire 44-frame major
gap (directly confirmed via zoomed close-ups anchored at frames 61, 65, 70,
75, 80, and via the wide overview sheets for 80–119).

| Classification | Frame count |
| --- | --- |
| `ATHLETE_NOT_VISIBLE` (pre-entry, frames 0–20) | 21 |
| `CLEARLY_VISIBLE` (frames 21–162) | 142 |
| `PARTIALLY_VISIBLE` / `OCCLUDED` / `AMBIGUOUS` | 0 — no occlusion or ambiguous frame was found anywhere in the reviewed material |

**Human-visible-but-pose-missing: `VISIBLE_POSE_MISSING` = 50 of 163
frames.** Of the 55 total pose-missing frames, 5 (frames 0–4) fall in the
legitimate pre-entry window (`ATHLETE_NOT_VISIBLE` — correctly not
producing pose, since there is no athlete in frame yet); the other **50**
occur while the athlete is clearly, visually present. This is the single
most important number from this phase: **the overwhelming majority of pose
loss on this clip is not explained by the athlete's absence.**

## R5B.1.6 — Every pose-loss interval

| Interval | Frames | Length | Duration | Visibility during interval |
| --- | --- | --- | --- | --- |
| 1 | 0–4 | 5 | 56.7ms | `ATHLETE_NOT_VISIBLE` (pre-entry) |
| 2 | 61–104 | **44** | **716.7ms** | `CLEARLY_VISIBLE` throughout |
| 3 | 110–114 | 5 | 66.7ms | `CLEARLY_VISIBLE` |
| 4 | 121 | 1 | 0ms (single frame) | `CLEARLY_VISIBLE` |

Matches production's own `trackingLossRanges` exactly (R5B.1.2).

## R5B.1.7 — Deep audit of the major 44-frame gap (61–104)

10 frames before (51–60): pose present, confidence declining (see
R5B.1.19), athlete clearly visible, moving at a steady rightward pace.

Every frame 61–104: no pose, athlete visually present and running
continuously (confirmed via close-ups at 61/65/70/75/80 and wide-frame
review through 104), `trackingConfidence: 0.000`, `boxOrigin` sequence:
`tracked` (frames 61–69, 9 frames) → `frozen_suspect` (frames 70–104, the
remainder — 35 frames, retroactively applied per `_resolve_freeze_run`'s
documented behavior of correcting an entire confirmed suspect run, not just
its post-confirmation tail). `cropRejectedReason: crop_rejected_frozen_localization`
for the `frozen_suspect` portion. **`candidateCount = 0` for 42 of the 44
frames, `= 1` for 2 frames — and zero `rejectedCandidates` recorded in any
gap frame** (i.e. no evidence of a plausible candidate being found and then
explicitly rejected during this window).

10 frames after recovery (105–114): pose returns at frame 105
(`trackingConfidence: 0.678`), then two further brief single/short losses
(110–114, 121) before fully stabilizing.

## R5B.1.8 — LAST_GOOD_FRAME → FIRST_BAD_FRAME

**`LAST_GOOD_FRAME = 60`**, **`FIRST_BAD_FRAME = 61`**.

| | Frame 60 | Frame 61 |
| --- | --- | --- |
| Pose present | yes (17 landmarks) | no |
| `trackingConfidence` | 0.857 | 0.000 |
| Athlete center X (norm, from real landmarks) | 0.3383 | — (no landmarks) |
| Crop-rect center X | 0.2511 | 0.2503 |
| `boxOrigin` | `tracked` | `tracked` |
| `trackState` | `tracking` | `tracking` (unchanged) |

**The most important observed change is not at frame 60→61 itself, but
what happens immediately after**: the crop-rect center X, which had been
moving continuously with the athlete (matching real landmark position
closely — 0.2511 vs 0.2503, a 0.0008 gap), **freezes at exactly `0.2503`
for the next 39 consecutive frames (61 through 100), to four decimal
places, literally unchanged** — while the real athlete continued moving at
the same rate established over the preceding frames (median ≈0.0059
normalized-width/frame, ≈10.6 px/frame at 60fps). By the time real
tracking resumes (frame 103–106, crop-center X jumping 0.2503 → 0.4192 →
0.4754 → 0.5318 → 0.5880 in four frames), the athlete has moved roughly
0.25–0.28 normalized units past the frozen position — **4–5× the crop's
own width**. `trackingConfidence` itself drops to exactly `0.000` at the
same frame the crop freezes, an instantaneous, not gradual, transition in
that specific signal.

## R5B.1.9 — ROI/crop involvement

ROI/crop logic is confirmed active for this session (non-trivial `cropRect`/
`cropScale` present on every frame, `frozen_suspect`/`cropRejected` fields
populated) — this is **not** a full-frame-only run.

Given the frozen crop-center evidence above:

- Frames 60 and earlier: `ATHLETE_INSIDE_ROI` (crop tracks the athlete
  closely — sub-1%-of-frame-width gap).
- Frames ~61–~85: the athlete is initially still inside or near the frozen
  ROI (confirmed visually — close-ups at 61/65/70/75/80 all show the
  athlete clearly within the crop bounds used for that close-up).
- Frames ~85–104: `ATHLETE_OUTSIDE_ROI` — a wider un-cropped overview
  confirmed the athlete continuing rightward in the full frame while a
  crop anchored at the frozen position (0.2503) shows only empty
  background (directly visually confirmed: the `zoom_085_104` contact
  sheet is empty track/fence/trees for its first ~15 cells, with the
  athlete only reappearing at the very edge of the last row as real
  tracking resumes).

`athlete_center_x − roi_center_x` grows roughly linearly from ≈0 at frame
61 to ≈0.28 (normalized) by frame ~100–103, at the athlete's own steady
screen-space velocity, since the ROI term is constant (frozen) over that
entire span. **The sprinter does outrun the tracking region** — but the
mechanism is not "the ROI's own expansion/prediction logic was too narrow
for the true velocity" so much as **the ROI stopped updating entirely for
~40 frames**, which no amount of a wider *static* region would fully
survive at sprint speed over 0.7 seconds.

## R5B.1.10 — Raw MediaPipe failure vs AVA rejection

**`NOT_DISTINGUISHABLE`** for the majority of the gap, with a documented,
specific reason — not a shrug: the persisted artifact does not retain
whether the detector was actually invoked on a given frame
(`searchSource`/`primaryFallbackReason` are computed during the run but
stripped before serialization — confirmed by grep, R5B.1.1). What *can* be
said precisely:

- **No frame in the gap shows a rejected-but-plausible candidate**
  (`rejectedCandidates` is empty on all 44 frames) — ruling out
  **C (CANDIDATE_SELECTION_FAILURE)** as the primary mechanism: AVA is not
  finding the athlete and then choosing wrong.
- Given the detector cadence (default every 8 frames, throttled to every 32
  after 5 consecutive misses) and a 44-frame gap, the full-frame detector
  was almost certainly invoked at least once, plausibly several times,
  during this window — and each time reported `candidateCount: 0` if it
  ran. Whether those specific invocations genuinely found nothing in the
  full frame (**A — RAW_INFERENCE_FAILURE**, plausible given the athlete's
  small on-screen scale, ~85–100px tall in a 1016px-tall frame — see
  R5B.1.12) or whether the gap is dominated by frames where the detector
  simply wasn't asked at all because `track_state` stayed `"tracking"`
  (**D — ROI/INPUT_FAILURE**, the state machine's own confidence not
  degrading fast enough to trigger more frequent checks) cannot be
  separated with current instrumentation.
- **E (IDENTITY_FAILURE)** is ruled out: `identitySwitches: 0` for the
  entire clip (production's own summary), and no wrong-subject pose was
  observed anywhere in the visual review.

Best-supported summary: **primarily D, compounded by A** — the ROI/state
machine failed to recognize degraded confidence and re-request the
detector promptly (D), and on the occasions the detector likely did run,
the athlete's small real screen scale plausibly also made raw detection
difficult (A) — but the exact split cannot be proven from what production
currently persists.

## R5B.1.11 — Raw landmark degradation

Landmark data (17 named keypoints per frame — the tracker's own reduced
set, not full 33-point MediaPipe output) is present or fully absent per
frame; there is no partial/degraded landmark state persisted (no frame
shows e.g. upper body present but lower body missing) — when pose exists,
all 17 tracked points exist together; when it doesn't, `keypoints: {}` is
empty. **Degradation is visible in the confidence and derived-scale
signal, not in which landmarks are present**: `trackingConfidence` declines
from a segment mean of 0.916 (frames 25–54) to 0.785 in the six frames
immediately before loss (55–60), and the loss itself is a hard cut
(0.857 → 0.000 in one frame), not a gradual fade. **Degradation begins
observably by frame 55**, five frames before total loss.

## R5B.1.12 — Athlete scale analysis

| Segment | Frames | Mean pixel-height (normalized) | Mean pixel-height (px, 1016h) |
| --- | --- | --- | --- |
| Stable early tracking | 25–54 | 0.0954 | ~97 px |
| Immediate pre-failure | 55–60 | 0.0682 | ~69 px |
| Reacquisition | 105–134 | 0.0829 | ~84 px |
| Stable recovery | 135–162 | 0.0947 | ~96 px |

The athlete is consistently small on screen throughout the clip — never
exceeding ~100px tall in a 1016px-tall frame (under 10% of frame height) —
consistent with this codebase's own documented history of small/distant
athlete detection difficulty (`mediapipe_pose_runner.py`'s ROI-mode
comments explicitly describe this exact problem class). The apparent drop
to ~69px in the immediate pre-failure segment is notable but should be
read cautiously: per-frame landmark spread at this scale is itself noisy
(frame-to-frame height estimates swing considerably even within the stable
segment, e.g. 0.035–0.102 in frames 55–60 alone) — this may reflect real
shrinkage, landmark noise, or both. **No single hard pixel threshold could
be cleanly identified** from this one clip's data; the direction (small
scale throughout, especially just before failure) is the reportable
finding, not a precise cutoff.

## R5B.1.13 — Horizontal position analysis

The athlete crosses roughly the horizontal middle of the frame during the
major gap: real position at loss onset (frame 60) ≈0.34 normalized,
continuing to ≈0.53–0.59 by full recovery (105–106) — i.e., **failure
clusters in the middle of the frame's horizontal extent**, not at an edge,
not during entry, not during exit. This rules out "athlete near frame
edge" as the trigger for *this* gap (edges are a separate, real concern for
the very different pre-entry window at frames 0–20, which is not part of
the loss being investigated here since the athlete is genuinely absent
then).

## R5B.1.14 — Screen-space velocity analysis

Median athlete center-X velocity across the stable pre-gap segment
(frames 25–60): **≈0.0059 normalized-width/frame ≈ 10.6 px/frame at 60fps**
(≈638 px/s, ≈0.35 frame-widths/second). This is a real, steady sprint
velocity, not a spike. Nothing in `athlete_tracker.py`'s
`_search_radius()` (`REACQUISITION_BASE_RADIUS` +
`REACQUISITION_EXPANSION_PER_FRAME × frames_since_lost`, capped at
`REACQUISITION_MAX_RADIUS`) was exercised here in the way its docstring
describes, because `track_state` never transitioned to a state that would
invoke reacquisition search logic — it stayed `"tracking"` throughout,
so the reacquisition-radius mechanism, whatever its tuning, was **never
engaged** during this 44-frame gap. This is a significant structural
finding in itself: the sprint speed didn't overwhelm a reacquisition
search radius — it overwhelmed a state machine that never recognized it
needed to start searching.

## R5B.1.15 — Tracking state machine

`trackState` transitions across the full clip (7 total):

| Frame | Timestamp | Previous | New | Note |
| --- | --- | --- | --- | --- |
| 0 | 0ms | (start) | `reacquiring` | Pre-lock, athlete not yet in frame |
| 23 | 373ms | `reacquiring` | `verified` | First corroborated candidate |
| 25 | 407ms | `verified` | `tracking` | Lock confirmed |
| 135 | 2240ms | `tracking` | `verified` | Brief 1-frame confidence dip |
| 136 | 2257ms | `verified` | `tracking` | Immediate return |
| 153 | 2542ms | `tracking` | `verified` | Brief 1-frame confidence dip |
| 154 | 2558ms | `verified` | `tracking` | Immediate return |

**The major 44-frame gap (61–104) produces zero `trackState` transitions —
the state stays `"tracking"` the entire time.** This directly explains why
`wants_detector_frame()`'s unconditional-request branch
(`if track_state in ("acquiring","reacquiring","lost")`) never fired during
the gap: the state machine's own belief that it was still confidently
tracking suppressed the very escalation path designed to catch exactly
this situation. Why it never reflected the confidence collapse (trackingConfidence
0.857→0.000 in one frame) into a state change is not fully answerable from
persisted data — the state machine and the confidence signal appear
architecturally decoupled during this stretch, which is itself a candidate
root cause (R5B.1.23).

## R5B.1.16 — Reacquisition candidate audit

> Is AVA unable to find Vanni, or does it find a plausible Vanni candidate and refuse to reacquire it?

**`CANNOT_FIND`** — with the caveat from R5B.1.10 about detector-invocation
visibility. Every frame in the gap shows `rejectedCandidates: []` — there
is no recorded instance of a plausible candidate being found and then
declined. Where `candidateCount > 0` (2 of 44 frames), no rejection is
logged either, suggesting even those weak signals were not evaluated as
serious candidates (or the field simply wasn't populated for a low-count
case) rather than being found-and-refused.

## R5B.1.17 — Identity switching

**`IDENTITY_STABLE`**. Production's own `trackingDebug.summary.identitySwitches: 0`
for the entire clip; the per-frame `identitySwitch` flag is `false` on every
single frame; no wrong-subject or background-object pose was observed in
any reviewed contact sheet.

## R5B.1.18 — Analysis-zone coupling

Gate geometry (`gateLockDebug.referenceGates`): start gate midpoint
x≈0.093, finish gate midpoint x≈0.876 (normalized). Athlete's real
horizontal position during the gap spans roughly x≈0.34→0.59 — computing
zone-fraction `(x−0.093)/(0.876−0.093)`, that's **≈31%→59% of the way
through the zone** — squarely mid-zone, nowhere near either gate boundary.
**No coupling found**: this tracking failure is not associated with
entering, crossing, or leaving any analysis-zone or timing boundary.

## R5B.1.19 — Five-segment comparison

| Segment | Frames | Pose % | Mean height (norm) | Mean confidence | Mean candidateCount |
| --- | --- | --- | --- | --- | --- |
| 1. Stable early | 25–54 | 100% | 0.0954 | 0.916 | 0.10 |
| 2. Immediate pre-failure | 55–60 | 100% | 0.0682 | 0.785 | 0.17 |
| 3. Major pose-loss | 61–104 | **0%** | — | — (0.000) | 0.05 |
| 4. Reacquisition | 105–134 | 80% | 0.0829 | 0.744 | 0.00 |
| 5. Stable recovery | 135–162 | 100% | 0.0947 | 0.850 | 0.14 |

The variables that change most strongly at failure: **`trackingConfidence`**
(0.785 → 0.000, an instant cliff, not a slope) and **pose presence itself**
(100% → 0%). Athlete scale shows a real but noisier decline heading into
failure. `candidateCount` stays low across *every* segment including fully
successful ones (confirming it's dominated by detector-cadence skipping,
not failure-specific, per R5B.1.10's caveat) — it is not, by itself, a
useful discriminator between success and failure segments with current
instrumentation.

## R5B.1.20 — Ground contacts during pose loss

Visual inspection of the crisp close-ups available for frames 61, 65, 70,
75, 80 (all within the major gap) shows the athlete in continuous,
recognizable sprint stride mechanics — swing phase, toe-off, and at least
one frame (≈70) with a front foot low and close to the track surface
consistent with an approaching foot-strike. Given a ~60fps clip and a
0.72-second gap, and typical sprint cadence (~4–5 Hz combined, i.e. a
single foot striking roughly every 12–15 frames), **this window plausibly
contains 3–4 real ground contacts** that were never available to AVA's
contact-detection logic, since contact detection requires foot landmarks
from a successful pose — which never existed for any of these 44 frames.

| Approx. frame | Foot visible? | Contact visually clear? | Production pose present? | Production contact event? |
| --- | --- | --- | --- | --- |
| ~61 | yes (mid-swing) | `AMBIGUOUS` (foot airborne) | no | no |
| ~65 | yes (mid-swing) | `AMBIGUOUS` | no | no |
| ~70 | yes, low/near surface | `PROBABLE_CONTACT` | no | no |
| ~75 | yes (mid-swing) | `AMBIGUOUS` | no | no |
| ~80 | yes, partial (edge of crop) | `AMBIGUOUS` | no | no |
| 85–99 | not resolvable at reviewed zoom level | `AMBIGUOUS` | no | no |

No `CLEAR_CONTACT` was confidently identified at the zoom levels used in
this pass — this would benefit from a purpose-built, real-time-anchored
(not interpolated-position) close-up pass in a future phase if precise
contact timing during this gap is needed. What is established with
confidence: **real stride cycles, and therefore real ground contacts, were
occurring throughout this window, and none were captured.**

## R5B.1.21 — Causal chain to step-marker failure

**`TRACKING_DOMINATED`**. The chain is direct and fully supported by this
phase's evidence: athlete visually present and striding →
`trackState` fails to reflect the confidence collapse → ROI freezes →
no pose landmarks for 44 frames → no foot landmarks → no contact events →
no step markers, for a span containing several real strides. There is no
evidence in this clip of contact/step-marker logic failing *independently*
while valid pose existed — every step-marker gap traces back to a
pose-availability gap, which traces back to the tracking-state/ROI failure
documented above.

## R5B.1.22 — Primary failure layer

**`ROI_TRACKING`**

Supported specifically by: the crop-rect center freezing at an exact,
unchanging value (0.2503) for 39 consecutive frames while the athlete
continued moving at a steady, previously-well-tracked velocity (R5B.1.8);
the `trackState` machine never transitioning out of `"tracking"` despite
`trackingConfidence` collapsing to exactly 0.000 (R5B.1.15); the
reacquisition-radius mechanism never engaging because no state transition
ever invoked it (R5B.1.14); and the athlete being confirmed visually
present and un-occluded throughout (ruling out `ATHLETE_DETECTION`-as-scale-alone
or `IDENTITY_TRACKING`, and no `POSE_FILTERING`/rejected-candidate evidence
ruling out `ATHLETE_SELECTION`). `POSE_INFERENCE` (raw MediaPipe
scale/blur difficulty) is very likely a **contributing**, not primary,
factor — see R5B.1.23.

## R5B.1.23 — Root-cause ranking

| Rank | Hypothesis | Supporting evidence | Contradicting evidence | Confidence |
| --- | --- | --- | --- | --- |
| 1 | ROI/box-tracking state machine fails to recognize confidence collapse and doesn't escalate to more frequent detector checks while `track_state` remains `"tracking"` | Crop frozen at an exact value for 39 frames; `trackingConfidence` cliff to 0.000 with zero state transition; `wants_detector_frame()`'s unconditional branch never triggered because state stayed `"tracking"` | None found | **HIGH** |
| 2 | MediaPipe raw inference also struggles on this athlete's small on-screen scale (~70–100px tall) when the detector is invoked | Consistently small scale across the whole clip, including successfully-tracked segments; documented prior history of this exact difficulty class in the codebase's own ROI-mode comments | Athlete is clearly, cleanly visible to a human at the same or lower effective resolution in every reviewed close-up — not obviously "undetectable" | MEDIUM |
| 3 | Athlete approaches frame edge | Real for the pre-entry window (0–20) | Directly refuted for the 44-frame gap — failure is mid-frame, mid-zone (R5B.1.13/18) | **LOW** (for this gap specifically) |
| 4 | Tracker displacement/reacquisition-radius assumptions too restrictive for sprint speed | Athlete moves ~10.6 px/frame, a real, fast, steady rate | The reacquisition-radius mechanism was never actually invoked during this gap — can't blame a threshold that never ran | LOW |
| 5 | Candidate-selection logic rejects the correct athlete | — | Zero rejected candidates recorded anywhere in the gap | **REFUTED** |
| 6 | Identity continuity rejects the correct athlete | — | `identitySwitches: 0`, no switch flagged anywhere | **REFUTED** |
| 7 | Confidence thresholds too aggressive | `trackingConfidence` does decline before loss (0.916→0.785) | The actual loss is an instant cliff to 0.000, not a threshold-driven gradual exclusion — doesn't look like a simple "just below cutoff" case | LOW |
| 8 | Motion blur | Sprint speed at close range could plausibly blur a small subject | Not independently verifiable from the JPEG-quality frames reviewed; visual close-ups show reasonably crisp form | LOW / UNPROVEN |
| 9 | Analysis-zone coupling | — | Directly refuted, failure is mid-zone | **REFUTED** |

## R5B.1.24 — Minimum next experiment

**`R5B.2 — Full-frame detector-cadence trace on IMG_4848: instrument and log every wants_detector_frame() decision and every raw detector invocation's actual result (found/not-found, full-frame) for frames 55–115, using real production code, without changing any threshold or behavior.`**

This is the smallest experiment that can directly falsify or confirm
Rank-1 vs Rank-2 above: it would reveal, for the first time, exactly which
gap frames had the expensive detector actually invoked and what it
returned — resolving the R5B.1.10/R5B.1.22 "not distinguishable" gap
without guessing. It requires only *read* instrumentation (logging, not
behavior change) added around the existing `wants_detector_frame()` /
`loc.detect_for_video()` call sites, run once against this exact file. Not
executed in this phase.

## Production Modification Guard

```
$ git status --short -- src scripts supabase
```
No changes beyond the pre-existing session baseline. Only
`docs/r5b1-vanni-60fps-frame-tracking-forensics.md` and git-ignored
`tmp/phaseR5/r5b1/*` diagnostics were added. No threshold, no tracking
code, no MediaPipe configuration, no contact-detection logic was touched.
All database/storage access was read-only.

---

## R5B.1 — Result

**PASS**

## Production Reproduction

Total frames: **163**. Pose-present: **108**. Pose-missing: **55**.
Longest gap: **44 frames** (61–104, 716.7ms). `reacquiring`-state frames:
**23** (all in the frames 0–22 startup window, not the major gap —
correction to prior framing, see R5B.1.2).

## Major Failure Window

Frames: **61–104**. Timestamps: **1006.7–1723.3ms**.

## Athlete Visible During Major Failure?

**YES** — all 44 frames.

## Human-Visible But Pose-Missing

**50 frames** (of 55 total pose-missing frames; the other 5 are the
legitimate pre-entry window where the athlete genuinely isn't in frame yet).

## Last Good → First Bad

Frame **60 → 61**. Most important observed change: `trackingConfidence`
collapses 0.857→0.000 in one frame, and the ROI crop-rect center — which
had been closely tracking the athlete — **freezes at an exact, unchanging
value for the next 39 frames** while the athlete continues moving at a
steady, previously well-tracked velocity.

## Raw MediaPipe vs AVA

**`NOT_DISTINGUISHABLE`** (with documented reason: `searchSource`/
`primaryFallbackReason`, which would resolve this, are computed at runtime
but not persisted in the final artifact). Best-supported reading: primarily
an ROI/state-machine failure to escalate detector checks (Rank 1),
plausibly compounded by genuine raw-detection difficulty on a small subject
when the detector was invoked (Rank 2). Candidate-selection and identity
failures are ruled out.

## Reacquisition Finding

The 23 `reacquiring`-state frames are the startup window only; the major
gap never enters a `reacquiring` state at all — `trackState` stays
`"tracking"` throughout, which is itself the core finding: the mechanism
meant to escalate search behavior on real loss never activated.

## Identity Stability

**`IDENTITY_STABLE`** — zero identity switches recorded or observed.

## Ground Contacts During Pose Loss

Real sprint stride cycles are visually confirmed throughout the gap,
plausibly containing 3–4 real ground contacts; one frame (~70) shows a
probable near-contact. Zero of these were captured as production contact
events or step markers, because no pose (and therefore no foot landmarks)
existed for any frame in the gap.

## Step-Marker Failure Relationship

**`TRACKING_DOMINATED`**.

## Primary Failure Layer

**`ROI_TRACKING`**

## Highest-Confidence Root Cause

The box-tracking state machine's `"tracking"` state did not respond to a
one-frame collapse in `trackingConfidence` (0.857→0.000) — it never
transitioned to a state that would trigger more frequent detector
re-invocation, so the ROI crop position froze at an exact value for 39
consecutive frames while a real, steadily-moving, clearly-visible athlete
ran on. Strongest evidence: the crop-rect center is bit-for-bit identical
across 39 consecutive frames, and a `trackingConfidence` value of exactly
`0.000` appears the instant this freeze begins with no intervening state
change.

## R5B.2

`R5B.2 — Full-frame detector-cadence trace on IMG_4848: instrument and log every wants_detector_frame() decision and every raw detector invocation's actual result for frames 55–115, using real production code, without changing any threshold or behavior.`
Not started.

## Files Added

`docs/r5b1-vanni-60fps-frame-tracking-forensics.md`

## Temporary Artifacts

Under git-ignored `tmp/phaseR5/r5b1/`: `img4848-pose-artifact.json` (the
real fetched production artifact), `merged-frames.json` (163-frame merged
diagnostic table), `frame-audit.json` (the required canonical audit),
`frames/` (163 extracted, correctly-rotated JPEG frames),
`contact-sheets/` (9 full-clip overview sheets, all 163 frames),
`zoom/` (5 cropRect-anchored and interpolated-position close-up sheets
covering the failure region in detail).

## Production Files Changed

`NONE`

## Progress

**Current prompt:** `R5B.1`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `7 / 197`
**R5 completion:** `3.55%`
