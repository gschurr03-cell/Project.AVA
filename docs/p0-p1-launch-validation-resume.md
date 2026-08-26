# P0/P1 launch-validation resume

## A. Overall status

**REVIEW.** The dominant proven launch risk is not Auto Follow: it is
lower-limb pose coverage on the Vanni 240 wide-shot benchmark. No new product
code was changed in this validation synthesis.

## B–C. Media inventory and high-value batch

| Clip | Athlete | Camera/run | FPS | Useful characteristics | Status |
| --- | --- | --- | --- | --- | --- |
| Gav reference | Gav | stationary sprint | verified ~60 | clean control, external aggregate reference | usable |
| Vanni 60 | Vanni | stationary fly | verified 60 | known pose/contact loss/reacquisition | usable |
| Vanni 120 | Vanni | stationary fly | verified 120 | smaller athlete/noisy intervals | usable, not V1 FPS |
| Vanni 240 | Vanni | stationary fly | verified 240 | distant athlete, wide frame, difficult lower limbs | usable, diagnostic |
| real-side-pan-fly-001 | other | smooth pan, fly | verified 30 experimental | multiple people, pan | metadata/artifacts only; protected video absent |
| IMG_4848 | Vanni | unknown camera/run | verified ~60 | tracking-failure control | local source/artifact; host validation blocked |

Minimum batch: Gav + Vanni 60 for V1-supported 60-FPS coverage, Vanni 240
as the known-failure control, and the panning fixture as a non-production
camera-motion control. Do not claim a 30-FPS pan validates the supported V1
path.

## D. Tracking and pose results

| Clip | Tracking | Pose | Contacts | Metrics | Auto Follow | Overall |
| --- | --- | --- | --- | --- | --- |
| Gav | PASS | PASS (95.1% ankle presence) | REVIEW (no manual contact truth) | PASS for aggregate external comparison | REVIEW / fixture blocked | PASS for clean supported control |
| Vanni 60 | PASS for existing artifact | REVIEW (60.5% ankle presence) | REVIEW | REVIEW | REVIEW / fixture blocked | REVIEW |
| Vanni 120 | PASS for existing artifact | REVIEW (60.9% ankle presence) | REVIEW | REVIEW | REVIEW / fixture blocked | REVIEW |
| Vanni 240 | PASS for localization contract | FAIL for launch-quality lower-limb coverage (45.2–45.5% ankle presence) | FAIL for complete metrics | FAIL / insufficient evidence | REVIEW / fixture blocked | FAIL as a launch-quality analysis example |
| real-side-pan-fly-001 | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | REVIEW / fixture blocked | NOT TESTABLE |

The Vanni 240 first evidence loss is pose production: 37.4% of foot-joint
samples are never produced, principally during crop-containment/pose
availability loss. The downstream chain is `no foot landmarks -> NaN foot-y
series -> no candidate peak -> no contact -> invalid/missing interval`, not a
contact threshold or clustering defect. The known frame-964 phantom was
rejected as a crop-shift artifact rather than output as a real contact.

## E. R5B.4V

**HOST BLOCKED.** The native pass-1 locator process does not reach the
post-change Vanni artifact through frame 105 before host termination. The
required Gav/Vanni production comparison is still outstanding; this is not a
reason to modify tracker code in this batch.

## F–G. Ground contacts and root cause

No clip has manual per-contact ground truth, so recall and precision cannot
honestly be calculated against the ≥95% target. The strongest source-video
adjudicated Vanni 240 timeline has 8 plausible contacts (6 valid in-zone),
but it is not a substitute for manual ground truth. The exact dominant root
cause is lower-limb pose absence; partial-foot fusion is not promising because
partial configurations occur in only 0.0–0.49% of benchmark foot samples.

## H. Metric accuracy

Gav is the only aggregate external-reference comparison (VueMotion): its
combined step frequency matches 4.8475 Hz to the reported precision in the
existing validation. All other metric comparisons are **REFERENCE NOT
AVAILABLE**. Vanni 240's current 2.367 Hz is an insufficient-evidence output,
not a basis for reducing the accuracy target.

## I. Metric integrity

AVA generally **rejects/withholds** intervals with missing/invalid evidence:
foot absence produces no contact candidate, same-foot/excessive-gap intervals
are guarded for step length, and the contact-flight summary now withholds
merged same-foot/missing-intermediate intervals. Unsupported/experimental FPS
is classified rather than silently treated as supported. The remaining gap is
consolidated result status, not the absence of individual guards.

## J. Result confidence

Specification only, to avoid result-schema/UI churn: aggregate existing
signals into `HIGH_CONFIDENCE` only when supported FPS, verified tracking,
contact-ready pose coverage, valid contact sequence, and calibration/metric
integrity all pass; `REVIEW` when a metric is available but any quality signal
is degraded; `FAILED` when tracking/pose/contact evidence makes the requested
metric unavailable. Preserve per-metric reasons; never collapse a withheld
spatial metric into a failed timing metric.

## K. Auto Follow

Frozen. **Auto Follow V1 Visual Validation = REVIEW / FIXTURE BLOCKED** for
the missing decoded intentional-pan and confirmed shaky fixtures; it is not a
product failure.

## L. Launch blockers

- **P0:** no validated manual-contact ground truth and no robust V1-quality
  lower-limb pose coverage for difficult/distant footage. Do not market
  universally reliable step metrics without an evidence/status layer.
- **P1:** R5B.4V host-capable Vanni/Gav production replay; decoded pan/shake
  fixtures for presentation validation; minimal consolidated result confidence.
- **P2:** Auto Follow fixture completion once the media exists.

## M–N. Files and tests

Only this report was added. Evidence reused: Phase 5.0A/5.0C/5.0D/5.0E,
Phase 4.2K, R5B.4V, and the Auto Follow browser reports. No new production
test was run because the outstanding blockers are missing ground truth/media
or the known native-host cutoff.

## O. Next task

Create a small, immutable manual ground-contact annotation set for the clean
Gav and Vanni 60 60-FPS clips, then run the actual contact pipeline against
it to calculate recall and precision. This removes the greatest launch-risk
uncertainty with less scope than a new pose backend.

**Tracking reliability:** not remeasured; no percentage increase
**Measurement reliability:** not remeasured; no percentage increase
**Auto Follow V1:** engineering PASS; visual REVIEW / fixture blocked
**Core MVP completion:** unchanged
**Launch readiness:** unchanged
**Overall AVA Performance launch completion:** unchanged
