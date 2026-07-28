# Real-world panning validation: `real-side-pan-fly-001`

Validation date: 2026-07-16  
Status: **completed experimentally; validation evidence incomplete**  
Governing standard: [AVA Accuracy Manifesto](./accuracy-manifesto.md)

## Outcome

> Experimental addendum: the validated-60 rejection below remains correct. The isolated
> `ava-sprint-30-experimental-v1` profile now completes this source as `smooth_pan` while
> withholding timing, length, velocity, contact/flight, and frequency. See
> [Experimental 30 FPS performance analysis](./experimental-30fps-analysis.md).

The exact uploaded recording was identified and safely registered, but this pass is not
complete. The file is a genuine constant-30 FPS recording. AVA correctly rejected it before
pose inference because production biomechanics require 60 FPS-class capture or higher.
Changing or bypassing that gate would violate the validated analysis policy.

No production panning classification, athlete-track statistics, crop/remapping result,
biomechanics, or camera-motion statistics exist for this fixture. Those values are
**unavailable**, not zero. The fixture is protected capture-gate and manual-review evidence;
it cannot become the requested biomechanics regression fixture until a 60 FPS-class source
is supplied.

## Exact fixture and source evidence

| Field | Evidence |
| --- | --- |
| Fixture | `real-side-pan-fly-001` |
| Athlete ID (internal) | `11111111-1111-4111-8111-111111111111` |
| Session ID (internal) | `2f1c901b-a5e2-4682-9049-1aa1fe8e89fb` |
| Canonical analysis ID (internal) | `0a30b56d-354b-490c-b3c6-af9eb6834094` |
| Initial job ID (internal) | `1bb44584-c130-45ca-9c0e-6f377e03870c` |
| Session label | `panning 30m fly, stands view, 2.77` |
| Source filename | `IMG_6371 2.mov` |
| Upload timestamp | `2026-07-16T23:27:40.141189Z` |
| Duration / frames | 6.566667 s / 197 |
| Frame rates / class | nominal `30/1`; average `30/1`; `unsupported_below_60_fps_class` |
| Resolution / codec | 1280×720, HEVC in MOV |
| VFR evidence | none; duration, frame count, nominal rate, and average rate agree |
| Initial state | analysis failed; job permanently failed during validation |

The manifest references the athlete-scoped private storage object; the video is not copied
into the repository. Migration `0022_validation_fixtures.sql` creates a service-role-only
registry with RLS enabled and no authenticated-user policy.

### Full timestamp investigation

The source time base is `1/600`. The first decoded frame is timestamped `0.000000 s` and the
last `6.533333 s`. Across all 196 adjacent frame intervals:

| Statistic | Interval |
| --- | ---: |
| Minimum / p5 | 0.033333 s |
| Median | 0.033333 s |
| p95 / maximum | 0.033334 s |
| Mean | 0.0333333316 s |
| Timestamp-derived rate | 30.00000153 FPS |

There are 131 rounded `0.033333 s` intervals and 65 rounded `0.033334 s` intervals, exactly
what the 1/600 time base requires to represent a 30 Hz cadence. There are zero duplicate
timestamps, zero gaps greater than 1.5 times the median, zero `repeat_pict` frames, and no
missing timestamps. No dropped-frame or material timestamp-irregularity evidence exists.
This is true 30 FPS CFR footage, not nominal-60 VFR, a 60 Hz source with metadata drift, or a
60 Hz source reduced by sporadic dropped frames.

### Policy audit and decision

The centralized `fpsPolicy.json` policy accepts detected average FPS from 59.0 through 60.5,
promotes a lower average only when both independent timestamp evidence and nominal/real
metadata prove the 60 FPS class, and normalizes rates above 60.5 onto the 60 Hz analysis
clock. This source supplied average, nominal, real, and timestamp-derived evidence at 30 FPS.
The promotion logic ran and correctly found neither required proof. Rejection code
`source_fps_below_minimum` was therefore correct; timestamp evidence was not ignored.

Option A—retain the 60 FPS-class production minimum—remains the only evidence-supported
choice. Option B would enable lower-rate biomechanics without validation. Option C may be a
future research direction, but this visually clean 30 FPS clip does not establish safe error
bounds for a lower tier. The global threshold and policy version are unchanged.

At 30 FPS, each frame spans about 33.33 ms. That does not validate contact/flight events,
zone crossings, event-aligned angles, fly timing, velocity, or acceleration. Body-relative
technique, athlete tracking, and camera diagnostics might eventually support a separately
validated lower-FPS diagnostic tier, but none is promoted to production eligibility from
this single recording. Accordingly every metric family remains unavailable for this video.

## External 2.77-second reference

The typed `ava-external-reference-v1` record stores `2.77 seconds` as product-owner evidence,
not as an AVA metric. Structured session fields contain no fly distance or timing-zone start
and finish. The title's `30m` text is not accepted as structured proof. Timing method, trigger,
body reference, boundary definitions, and raw-versus-rounded status are also unknown.

The reference therefore has `value_only` completeness and `incomplete_reference`
comparability. No reference velocity was calculated and AVA was not scored or tuned against
2.77.

## Production-worker lifecycle

The real production worker compiled, became ready, and processed the canonical job through:

`queued → claimed → downloading → validating → processing → failed`

It failed once, without retry, with permanent-input code `source_fps_below_minimum` and the
safe 60 FPS rerecording message. No placeholder metrics or pose artifacts were created. The
later result-generation, artifact-upload, and completion stages were correctly unreachable.

Three successful panning runs were not attempted because all would require bypassing the
same deterministic capture gate. Repeating permanent failures would create database noise
without adding biomechanics repeatability evidence.

## Manual review and diagnostic evidence

Manual contact-sheet inspection confirms a genuine side-view, left-to-right pan. The target
athlete remains visible through most of the clip, grows in image scale as geometry changes,
approaches the right edge, and exits near the end. Several other people and another runner
are visible, so identity-switch risk requires production pose evidence before assessment.
No obvious optical zoom was visible, but manual review cannot distinguish perspective scale
change from optical zoom with production confidence.

Representative normalized athlete boxes and centers are stored in
`validation/fixtures/panning/real-side-pan-fly-001.manual.json`. They are approximate manual
validation evidence and never production inputs. The contact sheet is stored only in the
private `pose-artifacts` bucket at
`validation/real-side-pan-fly-001/manual-contact-sheet.jpg`.

The requested full diagnostic (mask, background tracks, RANSAC inliers/outliers, transform,
pose overlay, and classifier timeline) cannot truthfully be generated because the FPS gate
precedes those algorithms. Producing it through an alternate path would not validate the
production worker.

## Validation and metric trust

| Area | Result | Reason |
| --- | --- | --- |
| Recording/camera/zoom classification | unavailable | production classifiers not reached |
| Crop and athlete-tracking statistics | unavailable | pose/ROI pass not reached |
| Box IoU and center error | unavailable | no production boxes to compare |
| Coordinate round-trip | synthetic regression passes | real-fixture crop unavailable |
| Overlay alignment | synthetic regression passes; real unavailable | no real pose artifact |
| Biomechanics plausibility | not assessable | no biomechanics output |
| Worker performance | gate-only; not comparable | pose/camera/crop never ran |

Every biomechanics family—joint and shin angles, posture, knee lift, front/back-side
mechanics, asymmetry, step/contact/flight timing, stride detection/length, velocity,
acceleration, displacement, and fly time—is **unsupported/withheld** with reason
`source_fps_below_minimum`. Camera, tracking, calibration, and event confidence are not
available. Values remain null. The external 2.77 seconds unlocks nothing.

## Defects and changes

No production analysis defect was demonstrated. The source is true 30 FPS, not a 59.94
metadata-rounding case. No classifier, tracking, crop, camera, biomechanics, threshold, or
FPS logic was changed.

The engineering gap demonstrated was durable fixture/evidence provenance. This pass added a
typed external-reference and fixture contract, protected manifest and manual annotation,
service-only registry/private artifact path, and reproducible inspection, preservation, and
schema sanity commands.

## Static regression control

After the final code state, trusted static analysis
`7f3ecf46-c31c-416c-9055-d6862b21feb5` completed through the production worker on attempt one
in 23.77 s. It produced 142 frames at the validated 60 FPS analysis clock and retained:

- source FPS `59.15864276221215`, class `validated_60_fps_class`;
- `static_precision`, camera confidence `0.988414818506334`;
- athlete-tracking confidence `0.802061411268521`;
- `no_meaningful_zoom`, confidence `0.988414818506334`;
- no tracking-loss or unstable ranges; spatial eligibility `eligible`.

This matches the preceding trusted result for those fields. No fixture-registry code enters
the production measurement path.

## Release decision and remaining evidence

After the isolated experimental profile completed this real source, panning-system completion
is assessed at **75%** and overall MVP completion at **76%**. Full validated panning support is
still not declared: calibrated timing/length, trustworthy real-fixture events, full diagnostic
review, and repeatability evidence remain incomplete. Broader validated zone-timing work is
not safe to begin on the strength of this fixture alone.

Two separate evidence gaps remain:

1. Upload a genuine 60 FPS-class-or-higher side-view panning source for production camera,
   tracking, crop, overlay, trust, repeatability, and performance validation.
2. To compare against 2.77, provide exact fly distance, entry and exit boundaries, body
   reference/trigger, timing method/system, and whether 2.77 is raw or rounded.
