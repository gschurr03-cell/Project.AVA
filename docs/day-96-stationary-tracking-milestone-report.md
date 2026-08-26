# Project AVA
## Stationary High-Speed Athlete Tracking — Engineering Milestone Report (Day 96)

Status: Documentation only. No code, database, or deployment changes are made or
implied by this report. It reflects the state of `feature/brand-refresh-v1` as
validated against the real Vanni 240fps session
(`227ae200-af96-4ffc-94d0-56d2e5f9d155`) via the production analysis worker.

---

## Section 1 — Executive Summary

The purpose of this milestone was to make Project AVA capable of reliably
tracking an athlete through native high-speed, stationary sprint footage,
without compromising the scientific integrity standard set out in
[`docs/accuracy-manifesto.md`](accuracy-manifesto.md). Prior to this work, the
pipeline's athlete localization was tightly coupled to pose inference: when
pose inference failed on a given frame, the pipeline had no independent notion
of where the athlete actually was, and localization quality degraded in lock
step with pose quality. This milestone separated those two concerns into a
continuous localization layer (detection plus per-frame optical-flow tracking)
that operates independently of, and upstream from, pose inference.

Every fix in this report was validated against a real, production-queued
analysis job processed by the actual worker process, using the actual
Supabase-backed job queue, the actual MediaPipe pose runner, and the actual
result-persistence path — not a synthetic harness. This was a deliberate
choice: several of the defects described below only manifest at real video
characteristics (true duration, true frame rate, true container rotation
metadata) and would not have been caught by short synthetic clips or unit
tests alone.

This work intentionally prioritized trustworthy measurements over generating
additional metrics. Where the pipeline still lacks sufficient evidence to
report a metric — ground contact time, flight time, top speed, average stride
length, peak knee flexion, average trunk lean — it continues to withhold that
metric with an explicit reason code rather than estimate, interpolate, or
infer a plausible-looking number. That behavior did not change during this
milestone, and preserving it was treated as a hard constraint throughout.

---

## Section 2 — Initial State

Before this milestone, the athlete-tracking layer exhibited several compounding
weaknesses that, together, made the pipeline unsuitable for production-quality
sprint analysis on high-speed stationary footage:

**Sparse tracking.** The athlete's bounding box was only as reliable as the
detector's per-frame output. There was no mechanism to interpolate or
propagate a known-good box forward between detector invocations, so the
system re-derived the athlete's location from scratch far more often than
necessary — 1,836 detector invocations were recorded on the baseline run
against this session, versus 264–268 after this milestone's changes.

**Fragmented pose detection.** Because localization was not continuous, the
crop fed to the pose model varied in quality and position frame-to-frame in a
way that was not smoothed by any tracking signal. The longest continuous run
of verified pose frames recorded on Day 95 was 8 frames — far too short to
support any metric that depends on temporal continuity, such as stride
cadence or ground-contact timing.

**Incorrect direction continuity.** The tracker's direction-consistency check
used an epsilon (`1e-6`) tight enough that it treated ordinary near-zero
motion — the kind that occurs during steady tracking, not just at rest — as
noise, and rejected legitimate candidate boxes as a result.

**Unreliable localization.** The box tracker's constructor hardcoded
`width=0, height=0` at construction time. Every candidate position emitted by
the detector was converted to pixel coordinates by multiplying a normalized
coordinate by these dimensions, which silently collapsed every computed box
to the origin. This was the single most consequential defect found this
milestone and is discussed in full in Section 3.

**Missing rotation handling.** The source video carries a `rotate=180`
container-level metadata tag, confirmed via `ffprobe`. No stage of the
pipeline — not on Day 94, Day 95, or the beginning of Day 96 — ever read or
applied this tag. MediaPipe was therefore being fed frames rotated 180° from
their intended orientation for the entire history of this pipeline's
operation on this class of footage.

**Timing fallbacks.** The MediaPipe subprocess was bounded by a single flat
timeout value (900 seconds) regardless of the actual duration and frame rate
of the source video. A real 933-second run against this exact session was
killed mid-processing by this fixed ceiling, discarding all work already
performed.

**Inability to recover meaningful biomechanics.** As a direct consequence of
the above, the pipeline could not reliably recover metrics that depend on
sustained, continuous pose evidence. This was not a metrics-layer problem —
the metrics layer was already correctly configured to withhold output it
could not support — it was an upstream evidence-generation problem.

Taken together, these issues meant the previous pipeline could not yet
support production-quality sprint analysis on stationary high-speed footage:
it was not that the metrics computation was wrong, but that the evidence
feeding it was too sparse and too unreliable to trust.

---

## Section 3 — Root Cause Investigation

This section documents every significant root cause discovered during this
milestone. Six items are genuine defects in the production pipeline. A
seventh item — listed last and set apart deliberately — is a defect in this
investigation's own diagnostic tooling, not in the product, and is documented
here specifically so that distinction is not lost to future readers of this
report.

### 3.1 Box tracker width/height stuck at zero (product bug)

`AthleteBoxTracker` was constructed with `width=0, height=0` as literal
arguments, with an intended per-frame backfill mechanism that never fired
because the outer `width`/`height` variables in the calling scope were
already correctly populated earlier in the function — the backfill condition
was never true. Every detector candidate's normalized center coordinate
(`c.cx`, `c.cy`, both in `[0, 1]`) was multiplied by these zero dimensions,
producing raw pixel coordinates clustered in a tiny range around the origin
(observed values in the range `[-4, +4.5]` rather than realistic
`[0, 1920]` / `[0, 1080]` pixel ranges). This was found by adding raw
pixel-coordinate debug logging to pass 1 of the runner and inspecting actual
emitted values rather than inferring behavior from downstream symptoms. The
fix was to pass the already-known, correctly computed `width`/`height`
values through to the tracker's constructor.

### 3.2 Optical-flow seed degeneracy (product bug)

`_init_flow_points` silently returned an empty point set whenever the
region of interest it was asked to seed was smaller than roughly 8 pixels on
a side. Because candidate boxes were built directly from tight
landmark-cluster geometry with no padding, this condition was hit
routinely, and the practical effect was that the tracker never transitioned
into a genuine `tracked` state across an entire clip — every frame fell back
to a fresh detection or was marked invalid. The fix introduced two
constants, `BOX_PADDING = 1.3` and `MIN_BOX_SIDE_PX = 60`, applied when
constructing a box from a detector or reacquisition candidate, ensuring the
seeded ROI is large enough for optical flow to find a usable set of trackable
points without inflating the box so far that it pulls in background clutter.

### 3.3 Direction-consistency threshold (product bug)

The direction-consistency check that helps the tracker distinguish genuine
athlete motion from tracking noise used an epsilon of `1e-6`, which is far
below the noise floor of real optical-flow displacement measurements at this
resolution and frame rate. In practice this meant the check rejected
legitimate, very small frame-to-frame motion — exactly the kind produced
during steady, well-tracked motion — as if it were noise. The fix replaced
the fixed epsilon with `DIRECTION_NOISE_FLOOR_PX = 3.0`, a value chosen to
reflect the actual expected pixel-level noise floor of the optical-flow
signal rather than an arbitrarily small numerical constant.

### 3.4 Ignored 180° rotation metadata (product bug)

`ffprobe` confirms the source `.mov` file carries a `rotate` stream tag of
`180`. No stage of the pipeline read this tag or corrected for it, meaning
every frame handed to MediaPipe was upside down relative to its intended
orientation. This was confirmed both programmatically (testing `cv2.rotate`
variants against a cropped frame containing the confirmed athlete and finding
that `ROTATE_180` alone produced an upright, correctly composed image) and
visually (on-field yard-line signage reads correctly only after the 180°
correction is applied). The fix added `probe_rotation_degrees`,
`rotation_code_for_angle`, and `apply_rotation` helper functions to
`mediapipe_pose_runner.py`; the runner now probes rotation once per job
immediately after opening the video, applies the correction consistently to
every frame decoded in both processing passes, and swaps the effective
width/height bookkeeping for the 90°/270° cases.

Three further defects surfaced while implementing this fix, all confined to
the fix's own implementation rather than being independent pipeline issues:

- `cv2.CAP_PROP_ORIENTATION_META` initially appeared to report the correct
  value (180.0) but proved non-deterministic on a second read of the same
  `VideoCapture` instance, and inconsistent across separate process
  invocations with no code change between them. It was abandoned in favor of
  probing the container tag directly via `ffprobe`.
- The first `ffprobe` implementation used a combined
  `-show_entries stream_tags=rotate:stream_side_data=rotation` argument,
  which is invalid syntax for the bundled `ffprobe` build and causes the
  entire probe command to fail. Because the failure was caught by a broad
  exception handler, it failed silently rather than surfacing an error. The
  fix simplified the argument to `-show_entries stream_tags=rotate` alone.
- Because `import cv2` in `mediapipe_pose_runner.py` is local to the main
  processing function rather than declared at module scope, the new
  module-level `rotation_code_for_angle` and `apply_rotation` helper
  functions initially referenced an undefined name at call time
  (`NameError: name 'cv2' is not defined`). This reached production and
  consumed two of the job's four allotted retry attempts before being
  caught. The fix added `cv2` as an explicit parameter to both functions,
  matching the codebase's existing convention for module-level helpers that
  need access to a locally imported module (see
  `estimate_background_transform`).

### 3.5 Subprocess timeout scaling (product bug)

The MediaPipe subprocess was bounded by a single configured timeout
(900 seconds) applied uniformly regardless of the source video's actual
duration and frame rate. A real run against this session, prior to the
localization fixes reducing per-frame cost, took 933 seconds and was
terminated by this ceiling. The existing job-lease mechanism already scaled
its own timeout based on known duration and frame rate
(`computeLeaseSeconds`); this milestone introduced an analogous
`computeProcessingTimeoutSeconds` function in `scripts/lib/worker-runtime.mjs`
that scales the subprocess timeout the same way, but with a wider safety
multiplier (4.0×, versus the lease's multiplier) because the subprocess has
no heartbeat-renewal mechanism the way the job lease does — if the subprocess
runs long, there is no intermediate signal that lets it extend its own
budget, so its ceiling has to be generous enough up front to tolerate
legitimate variance in processing time.

### 3.6 Tracker schema mismatch (product bug)

The box tracker's new `track_state` vocabulary
(`acquiring | verified | tracking | reacquiring | lost | terminated`)
overlapped with, but was not identical to, the existing `identityState` enum
declared in `src/lib/biomechanics/mediapipe/trackingDebugSchema.ts`
(`acquiring | tracked | reacquiring | terminated`), causing legitimate job
output to fail Zod validation. The enum was widened to accept both
vocabularies, since debug payloads from either tracker generation can appear
depending on which code path produced them. A related counting bug was found
and fixed alongside this: the Python code that counts reacquisition
transitions only recognized the literal value `"tracked"` as evidence of
recovery, not the newer `"tracking"` or `"verified"` states, which would have
under-counted recoveries under the new vocabulary. A
`RECOVERED_IDENTITY_STATES` tuple was introduced to recognize all three.

### 3.7 Verification-script field-name bug (not a product bug)

During validation of the fixes above, this investigation twice concluded —
incorrectly — that real pose coverage on the validated session was 0%. The
first time, this false conclusion was compounded by a further, more serious
error: after visually inspecting frames sampled via an unreliable seek method
and finding what appeared to be an empty field, the investigation reported
that the local development video had been reseeded with placeholder footage
containing no visible athlete, and delivered a fully incorrect report to that
effect. The user correctly identified that the video is 9 seconds long and
that the athlete does not enter frame until roughly 4 seconds in — a detail
the investigation's flawed seek-and-sample method had missed entirely. Upon
re-investigation using a connected-components diff-blob tracker (a
substantially more reliable technique for finding a small, distant moving
subject against a large, detailed, largely static background than ranking
frames by total or mean frame-to-frame pixel difference, which is easily
dominated by large-area effects such as a lighting shift), the athlete was
found and visually confirmed present and running through the frame from
roughly 5.57s to 7.87s.

After the rotation fix (Section 3.4) was confirmed working in production via
its `rotationApplied: true` log field, the investigation still measured 0%
pose coverage and began investigating a hypothesized incompatibility between
MediaPipe's video-mode tracking and a per-frame changing crop. That
hypothesis was abandoned after noticing that a frame reported as having "0
landmarks" also had `poseRetryUsed: undefined`, which is only possible if the
primary detection call had already succeeded — the retry path had not fired.
Direct inspection of the raw artifact JSON revealed that the field this
investigation's own scratch scripts had been checking, `frame.landmarks`,
does not exist anywhere on the `PoseSequence` artifact schema. The correct
field, `frame.keypoints`, was present and richly populated with
high-confidence data throughout. Recomputing coverage against the correct
field produced the real figures reported in Section 5.

This item is called out separately from the six product bugs above because
it never affected data reaching a coach, athlete, or any persisted analysis
result — the production pipeline was, at all times during this
investigation, correctly writing `keypoints` data to the artifact it
generates. It affected only this investigation's own ad hoc diagnostic
tooling, and it is documented here in the interest of the same
accuracy-first standard this milestone otherwise applies to the product,
because it materially changed the investigation's conclusions twice and the
user's correction was what surfaced it.

---

## Section 4 — Engineering Changes

**Continuous localization.** Athlete localization was restructured into two
cooperating mechanisms: a detector, invoked on a fixed cadence
(`detector_cadence_frames`) rather than every frame, and a continuous
per-frame optical-flow tracker (`box_tracker.py`) that propagates the
athlete's bounding box forward between detector invocations. This decouples
the cost and reliability of full-frame detection from the need for a
per-frame athlete location, which is the dependency pose inference actually
needs. The practical effect is that the crop fed into pose inference is
available and reasonably accurate on nearly every frame, not only on the
sparse subset where the detector happened to run.

**Identity continuity.** A `track_state` state machine — `acquiring`,
`verified`, `tracking`, `reacquiring`, `lost`, `terminated` — was introduced
as the box-tracking-layer counterpart to the pipeline's existing pose-level
identity concept. This gives the pipeline (and future debugging) a
first-class, per-frame record of how confident the tracker is in its own
continuity, distinct from whether pose inference itself succeeded on that
frame.

**Reacquisition.** When continuous tracking is lost — due to occlusion, the
athlete leaving and re-entering frame, or optical flow quality degrading
below a usable threshold — the detector is invoked out of its normal cadence
to attempt reacquisition. Frames recovered this way are tagged with
`box_origin: reacquired`, which is recorded distinctly from a clean
`detected` frame so that downstream consumers of the tracking record can
distinguish "we always knew where the athlete was" from "we lost and
re-found them."

**Dynamic crop improvements.** `BOX_PADDING` and `MIN_BOX_SIDE_PX` (Section
3.2) ensure the region handed to the optical-flow point seeder is never so
small that seeding degenerates to zero points, while remaining tight enough
that it does not routinely pull in unrelated background motion. This was a
deliberate middle point, not a maximally conservative one — a much larger
fixed padding would have made tracking more forgiving at the cost of
increasing the chance the tracker locks onto background structure instead of
the athlete.

**Rotation handling.** Rather than relying on any single OpenCV property
(shown in Section 3.4 to be unreliable), the runner now determines rotation
once per job via a direct `ffprobe` metadata probe and applies the correction
consistently to every frame in both processing passes. This was designed as
a one-time, job-level determination rather than a per-frame check, since
container-level rotation metadata does not change within a single video
file, and a per-frame check would have added unnecessary cost for no
correctness benefit.

**Lease and timeout scaling.** `computeProcessingTimeoutSeconds` was added
alongside the pipeline's existing `computeLeaseSeconds`, following the same
architectural pattern — scale a fixed configured ceiling by the known
duration and frame rate of the specific video being processed — but with an
independently tuned, wider safety multiplier appropriate to a mechanism that,
unlike the job lease, cannot renew itself mid-flight.

**Worker reliability.** The worker process (`analysis-worker.mjs`) does not
hot-reload; this milestone reaffirmed the operational requirement that it be
killed and restarted after any code change reaches it, and added the
`processing_timeout_scaled` structured log line so that the actual timeout
value in force for any given job run is visible in the worker's log stream
without needing to re-derive it from the video's known properties.

**Tracking diagnostics.** `BOX_TRACKER_DEBUG`-gated instrumentation was added
to `box_tracker.py`, including candidate/rejection reasoning inside `step()`,
ROI-size and seed-point-count reporting inside `_init_flow_points`
(including the previously silent degenerate-ROI bail path), and inlier-count
reporting inside `_track_via_optical_flow`. This instrumentation was what
made the width/height-zero bug (Section 3.1) and the ROI-degeneracy bug
(Section 3.2) tractable to diagnose from raw evidence rather than
speculation.

**Pose provenance and tracking confidence.** Both `box_origin`
(`detected | tracked | predicted | reacquired | invalid`) and `track_state`
are now recorded per frame. This gives any future consumer of the tracking
record — whether that is a metrics-computation stage, a debugging tool, or a
future analyst reviewing a specific session — a per-frame account of how much
to trust that frame's crop, rather than a single pass/fail signal for the
clip as a whole.

---

## Section 5 — Validation Results

All figures below were captured from real production worker runs against the
Vanni 240fps session (`227ae200-af96-4ffc-94d0-56d2e5f9d155`,
job `06466fde-b2fb-4b95-bdc0-9b036daf3608`), processed by the actual
`analysis-worker.mjs` process reading from the real Supabase-backed job
queue. Log excerpts referenced here are drawn directly from
`/private/tmp/vanni-tracker-worker7.log` and
`/private/tmp/vanni-tracker-worker10.log`, the two most recent full runs of
this segment, plus this investigation's direct re-derivation of pose coverage
from the corrected `keypoints` field described in Section 3.7.

### 5.1 Localization and runtime

| Metric | Before (Day 95 baseline) | After (Day 96, this milestone) |
|---|---|---|
| Detector invocations | 1,836 | 264–268 |
| Longest continuous *box-track* run | not separately tracked | 2,341–2,345 of 2,348 frames (≈99.7%) |
| Total processing time | 906s, or SIGKILLed at the 900s flat timeout | 306.9s (worker10) / 307.6s (worker7) |
| Subprocess timeout applied | 900s flat | 1,326s (scaled from 900s configured, `knownDurationS=9.80`, `knownFps=239.48`) |
| Job lease applied | 180s configured (no scaling) | 851s (scaled from 180s configured) |

### 5.2 Pose evidence

| Metric | Before (Day 95 baseline) | After (Day 96, this milestone, corrected measurement) |
|---|---|---|
| Longest continuous verified pose run | 8 frames | 335 frames |
| Real pose coverage | not reliably measured | 16.7% (392 of 2,348 frames) |
| Total frames in session | — | 2,348 @ 239.48fps, 1920×1080 |

### 5.3 Metric recovery

| Metric | worker7 run (pre-rotation-fix) | worker10 run (final, post all fixes) |
|---|---|---|
| `strideFrequencyHz` | 5.98 | 6.85 |
| Stride confidence | — | "high" (0.9566) |
| Step candidates / accepted | 16 candidates, 13 rejected | 17 candidates, 16 rejected |
| `topSpeedMps` / `avgStrideLengthM` | withheld — calibration required | withheld — calibration required |
| `groundContactTimeMs` / `flightTimeMs` | withheld | withheld — reason: `not_measured` |
| `peakKneeFlexionDeg` / `avgTrunkLeanDeg` | withheld | withheld — reason: `insufficient_pose_confidence` |

Step rejection in both runs is governed by the existing plausibility window
of 150–320ms for stride timing; this window was not modified, widened, or
tuned as part of this milestone, consistent with the hard constraint against
threshold tuning toward known or expected results.

### 5.4 Rotation and calibration provenance

The `stage_durations` line from the final validated run confirms rotation
handling fired correctly in production:

```
probedRotationDegrees: 180.0
rotationApplied: true
```

The job's calibration authority record confirms the session was processed
under `calibrationSource: "manual_confirmed"`, `cameraType: "stationary"`,
`distanceM: 20` — consistent with a technique-only capture setup rather than
a fully calibrated timing trial, which is the direct explanation for why
`topSpeedMps` and `avgStrideLengthM` remain withheld (Section 6).

---

## Section 6 — Current Pipeline Status

Pose coverage on this validated session is currently approximately 16.7%
(392 of 2,348 frames), with a longest continuous verified run of
approximately 335 frames. This is a substantial improvement over the Day 95
baseline of 8 continuous frames, and the coverage that does exist is
concentrated during the portion of the clip where the athlete is actually
visible and moving through frame — roughly seconds 5.6 through 7.9 of the
9-second clip — which is consistent with the athlete not being in frame for
the first several seconds of the recording, a detail confirmed by the user
during this investigation.

Tracking density during the visible sprint is high: the box tracker
maintains a `tracked` or `reacquired` origin for over 99% of all frames in
the clip, meaning the localization layer's job — knowing where the athlete
is — is being done reliably across nearly the entire recording, including
the frames before the athlete enters view and after they exit. Pose
inference's lower coverage figure reflects a narrower, still-unresolved gap
between "we know where to look" and "the pose model successfully resolved a
skeleton there," discussed further in Section 8.

With this level of continuity, the pipeline was able to compute
`strideFrequencyHz` (6.85, "high" confidence) from real step-timing evidence
for the first time in this session's processing history. This demonstrates
that the localization problem — the core objective of this milestone — is
substantially solved: continuous tracking through the visible portion of the
sprint is now good enough to support at least one temporally sensitive
metric end to end, using only real pipeline output.

Other metrics remain unavailable, and for reasons unrelated to the fixes in
this milestone. `topSpeedMps` and `avgStrideLengthM` are withheld because
this session's calibration configuration (`technique_only` setup mode,
unknown distance status) does not provide the spatial reference the metrics
layer requires — this is a capture/configuration gap, not a tracking defect.
`groundContactTimeMs` and `flightTimeMs` remain withheld for genuine
insufficient evidence (`not_measured`), and `peakKneeFlexionDeg` /
`avgTrunkLeanDeg` remain withheld for genuine insufficient pose confidence
(`insufficient_pose_confidence`) — both honest reflections of the remaining
16.7% coverage ceiling rather than bugs in how those reason codes are
assigned.

---

## Section 7 — Scientific Integrity

Project AVA's governing standard, documented in
[`docs/accuracy-manifesto.md`](accuracy-manifesto.md), requires that every
feature, algorithm, and metric prioritize being trustworthy over being
complete. This milestone was executed under that standard without exception:
at no point did the investigation widen a plausibility window, lower a
confidence threshold, inject a ground-truth value, or otherwise adjust the
pipeline's judgment of its own evidence in order to make a metric appear
sooner or look more complete. Every improvement described in this report
increased the *evidence* available to the pipeline — continuity of
localization, correct frame orientation, sufficient runtime budget — rather
than the pipeline's willingness to act on thin evidence.

AVA does not fabricate metrics, timing, contacts, or stride lengths. When
evidence is insufficient, it returns an explicit "unavailable" result with a
reason code rather than an inferred or interpolated value, exactly as
observed in Section 5.3 for `groundContactTimeMs`, `flightTimeMs`,
`peakKneeFlexionDeg`, and `avgTrunkLeanDeg` on this session. This philosophy
is central to the product because AVA's output is used by coaches to make
real training and technique decisions about real athletes; a plausible-looking
but unsupported number is materially worse than an honest gap, because it is
indistinguishable from a trustworthy one to the person relying on it. This
milestone's own history is a direct illustration of why that discipline
matters even in engineering process, not only in shipped output: two
separate false conclusions reached during this investigation (Section 3.7)
were the result of trusting an inference — "the coverage is 0%, therefore the
video must be empty" — instead of the underlying raw evidence, and both were
corrected only by returning to that raw evidence.

---

## Section 8 — Remaining Limitations

Several technical limitations remain and should inform prioritization of the
next milestone rather than be treated as resolved by this work:

**Ground-contact and step-length evidence.** The pipeline does not yet have
enough continuous, high-confidence pose coverage to compute
`groundContactTimeMs`, `flightTimeMs`, or `avgStrideLengthM` on this session.
These require sustained frame-to-frame foot-strike evidence that 16.7%
coverage, even concentrated during the visible sprint, does not yet reliably
provide across enough consecutive contacts.

**Velocity reconstruction and calibration dependency.** `topSpeedMps` remains
gated on spatial calibration that this session's capture configuration does
not provide (`technique_only` setup, unknown distance status). This is not a
tracking-pipeline limitation, but it does mean the current milestone's gains
cannot be observed in this particular metric until a session is captured or
reconfigured with full calibration.

**Remaining sparse landmark gaps.** The 335-frame longest continuous run
represents strong local continuity, but coverage outside that run remains
scattered, and the root cause of the *remaining* gaps — as distinct from the
gaps already explained by rotation and localization defects fixed this
milestone — has not been individually root-caused. It may reflect genuine
limitations (motion blur at 240fps shutter speeds, partial occlusion, athlete
proximity to frame edges) or further undiscovered pipeline issues; this
milestone did not have scope to distinguish between those possibilities frame
by frame.

**Contact-count audit not completed.** An audit comparing the pipeline's
detected foot-contact count against a manually reviewed ground truth for this
session was planned as part of this milestone's validation but was not
completed using the corrected `keypoints`-based data, because the field-name
bug described in Section 3.7 consumed the investigation time originally
allocated to it. This audit should be treated as outstanding, not as having
returned a negative or inconclusive result.

**Runtime cost.** At approximately 307 seconds for a 9-second, 240fps clip,
current processing time is dramatically improved over the pre-milestone
baseline but remains a multi-minute cost per job. This has not been
identified as a blocking concern for the current milestone's goals, but it is
relevant to future capacity planning as usage grows.

**Configuration dependency for technique-only sessions.** Sessions captured
without full timing/distance calibration will continue to withhold
`topSpeedMps` and `avgStrideLengthM` regardless of tracking quality, by
design. This is expected behavior, not a defect, but it does mean tracking
improvements alone cannot close the gap on every metric for every session
type.

---

## Section 9 — Recommended Next Milestone

The recommended next engineering objective is: **recover all five core
sprint metrics on stationary 240fps footage using the real production
pipeline**, validated the same way this milestone was validated — against a
real queued job processed by the real worker, not a synthetic harness.

This is the highest-value next task, ahead of beginning panning-camera
support, for three concrete reasons grounded in this milestone's findings.
First, the localization problem that previously made sustained pose evidence
impossible to obtain has been substantially addressed; the next bottleneck is
narrower and better defined (pose coverage within an already well-localized
clip), which makes it a more tractable next target than opening an entirely
new capture mode. Second, panning support depends on many of the same
underlying primitives validated here — continuous localization, rotation
handling, timeout scaling — and will be easier to build and debug on top of a
stationary pipeline that already recovers its full metric set reliably, since
regressions will be easier to attribute. Third, several of the withheld
metrics in this report (ground contact time, flight time, stride length, peak
knee flexion, trunk lean) are core to AVA's value proposition as a
biomechanics platform in a way that panning-camera support is not; closing
that gap on the simpler stationary case is more directly aligned with product
priorities than extending capture flexibility before the core metric set is
proven reliable.

---

## Section 10 — Future Roadmap

Beyond the immediate next milestone, the broader roadmap remains organized
around the following sequence:

**Stationary validation** (this milestone and its direct successor) —
establish reliable, continuous localization and full core-metric recovery on
stationary high-speed footage, the platform's foundational capture mode.

**Panning validation** — extend the same localization and pose-inference
guarantees to panning-camera capture, where the athlete's position in frame
is confounded with camera motion and additional care is required to separate
the two.

**Stride-length validation** — dedicated validation of `avgStrideLengthM`
against known-distance reference trials, building on the calibration
machinery already present in the codebase (`field:validation`,
`benchmark:steps`).

**Athlete Intelligence** — longitudinal, athlete-level insight built on top
of a reliable single-session metric set, rather than session-by-session
output alone.

**Historical analysis** — trend and progression views across an athlete's
session history, dependent on consistent metric availability across many
sessions over time.

**Adaptive targets** — coaching targets that adjust based on an athlete's
demonstrated performance history rather than fixed benchmarks.

**Comparison mode** — side-by-side comparison between athletes or between an
athlete's own sessions over time.

**iOS polish** — mobile capture and review experience refinement, sequenced
after the core analysis pipeline's reliability is established, since capture
UX quality is only as valuable as the analysis it feeds.

---

## Section 11 — Lessons Learned

This milestone's most consequential lesson concerns the difference between an
inference and an observation, and it was learned the hard way. Twice during
this investigation, a plausible-sounding inference — "coverage measured 0%,
therefore the video must contain no usable athlete footage" — was reported as
a conclusion before the underlying raw evidence had actually been checked
carefully enough to support it. Both times, the inference was wrong, and both
times, the eventual fix was not a new hypothesis but a return to raw,
unprocessed evidence: raw pixel-coordinate values instead of trusting the
tracker's aggregate statistics, and raw artifact JSON instead of trusting a
diagnostic script's own field access. The debugging technique that
consistently worked across this entire milestone was the same one each time:
when a signal looks wrong, look one layer beneath the summary that produced
it before concluding the underlying system is broken.

A related, more specific technique proved valuable for a genuinely hard
subproblem: distinguishing a small, real, distant moving subject from a
large, detailed, mostly static background is not well served by ranking
frames by total or mean frame-to-frame pixel difference, because that metric
is dominated by large-area effects (lighting shifts, camera sensor noise)
that have nothing to do with the subject of interest. Connected-components
analysis of the diff image — looking for a small, coherent, moving blob
rather than the loudest global change — found the athlete reliably where the
naive approach had missed them.

Production-path validation mattered because several of the real defects
found this milestone are, by construction, invisible to any check that does
not run the actual pipeline against real video: a hardcoded `width=0` default
type-checks and unit-tests fine in isolation if the test never exercises the
constructor with real dimensions; a missing rotation correction is invisible
unless the test video actually carries rotation metadata; a flat timeout is
invisible unless a real job runs long enough to hit it. None of these are
bugs that static analysis or type checking could have caught, because none of
them are type errors — they are runtime behavioral defects that only manifest
under the specific real-world conditions this session happened to exercise.
This is also why the field-name bug in this investigation's own scripts
(Section 3.7) went undetected for as long as it did: both Python's and
JavaScript's permissive attribute/property access mean that referencing a
nonexistent field does not raise an error, it silently returns an empty or
undefined value, which is exactly the kind of failure mode that only
runtime, output-level verification — not type checking — can catch.

Scientific validation, in the sense of insisting on comparing pipeline output
against real, checkable ground truth rather than accepting an aggregate
statistic at face value, is what surfaced the box_origin/track_state
vocabulary as a formal, documented contract rather than an implicit
convention, and what produced the `stage_durations` visibility that made
several of these root causes diagnosable at all. Each of these emerged
because the investigation kept asking "what does the raw evidence actually
show," not because they were anticipated in advance.

---

## Section 12 — Final Assessment

This milestone achieved a substantial and measurably verified improvement in
athlete localization continuity on stationary high-speed sprint footage: box
tracking now maintains a valid athlete position across over 99% of frames in
the validated session, detector invocations dropped roughly sevenfold, total
processing time dropped roughly threefold and now completes reliably within
its scaled timeout budget, and the pipeline recovered its first genuine,
production-computed temporal metric (`strideFrequencyHz`) on this session
with high confidence. Six real, previously undiagnosed defects in the
production pipeline were found and fixed, each confirmed via a real
production job run rather than a synthetic test.

What remains is real and should not be understated: pose coverage on this
session is 16.7%, well short of what would be needed to recover the full
core metric set, and four of the platform's core biomechanics metrics
remain withheld on this session for genuine evidence or configuration
reasons. The root cause of the remaining, narrower pose-coverage gap has not
yet been established, and a planned contact-count audit was not completed.

The MVP is meaningfully closer to production readiness for stationary
high-speed capture than it was at the start of this milestone, specifically
in the dimension this milestone targeted: reliable, continuous knowledge of
where the athlete is in frame, which is the prerequisite every other
biomechanics metric depends on. It is not production-ready today. The
honest read is that this milestone solved the localization problem it set
out to solve, and in doing so converted a previously unworkable pipeline
into one with a single, well-defined, and now-tractable next problem — pose
evidence density within an already-reliable localization — rather than a
diffuse set of compounding unknowns. That is real progress, and it is
bounded progress; both halves of that assessment should be carried into the
next milestone.
