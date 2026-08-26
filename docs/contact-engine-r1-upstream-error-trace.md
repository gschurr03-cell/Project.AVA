# Contact Engine R1 — upstream error trace and generalized correction

## A. Result

**PARTIAL.** The correction fixes one proven, generalized startup-boundary
defect and improves Gav full-video recall from 81.8% to 90.9%. Gav remains
below the ≥95% recall and precision launch gate because of one distinct
same-side candidate-rejection/timing defect and one end-of-run false positive.

## B. Frozen baseline

The immutable human fixtures were not changed. Full-video ±1-frame baseline:

| Clip | Human | AVA | TP | FN | FP | Recall | Precision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gav 60 | 11 | 12 | 9 | 2 | 3 | 81.8% | 75.0% |
| Vanni 60 | 11 | 10 | 4 | 7 | 6 | 36.4% | 40.0% |

Zone filtering is not part of this score and was not modified.

## C. Gav error map

Primary matching is unchanged: one-to-one ±1 source frame.

| Human / AVA frame | Classification | First incorrect stage | Decisive evidence |
| --- | --- | --- | --- |
| Human ON 6 | FN before; TP at 7 after | D — candidate generation boundary defect | Frames 5–6 are correctly stripped as invalid; frame 7 is the first verified foot observation and its right foot immediately rises. Smoothing leaked that sample into virtual frame 6, so boundary recovery tried an unobserved frame and emitted no onset candidate. |
| Human ON 81 | FN | F — candidate rejection | Usable pose and left candidate exist at 81, but the 250 ms same-side guard rejects it after left 70 (183 ms apart) because its smoothed prominence is lower. |
| AVA 10 | FP before; removed after | D — candidate generation boundary defect | It was the later local maximum from the same startup stance; fixing first-observed boundary recovery emits 7 and suppresses this later event. |
| AVA 83 | FP under ±1 | E — candidate timing | It is a right-foot local maximum two frames after human ON 81. It is within ±2 but not the product's ±1 semantic requirement. |
| AVA 139 | FP | J — end-of-run crop-edge trajectory artifact | A low-prominence left local maximum is accepted 133 ms after 131 as the athlete approaches the right crop edge; it is after human OFF 135. |

All other Gav contacts are true positives after the correction: `7, 19, 31,
44, 56, 70, 93, 106, 118, 131` match human `6, 19, 31, 44, 56, 69, 93,
106, 118, 131`.

The detailed pre-change decision chain, including every frame's tracking/ROI
state, lower-limb landmarks, positions, velocities, candidate stages, dedup
stages, and emitted stream, is saved as
`validation/artifacts/gav-r1-upstream-contact-trace.json`. The equivalent
post-change artifact is `validation/artifacts/gav-r1-after-contact-trace.json`.

## D. Continuous-sequence behavior

The contact pipeline is full-video and has no zone dependency. Gav's startup
quality gate correctly withholds invalid frames 0–6, but the old boundary logic
failed to restart at the first usable frame because its smoothed series created a
virtual finite sample one frame earlier. This caused the first real contact to
appear late at 10. The fix restores the continuous sequence at 7 without using
withheld evidence.

Vanni remains upstream-limited: its first accepted event is 37 despite human
contacts at 7 and 21. This is a tracking/pose/contact-stream failure before any
zone selection.

## E. Event semantics

AVA's canonical mark is a smoothed foot-y local maximum: a lowest-foot proxy,
not independently observed visible load onset. On Gav after the boundary fix,
the matched signed offsets (AVA minus human ON, frames) are:

`+1, 0, 0, 0, 0, +1, 0, 0, 0, 0`.

Mean signed error is +0.20 frames (+3.33 ms); median signed error 0; mean
absolute error 0.20 frames; exact 80.0%; ±1 100%; ±2 100%; max absolute error
1. The remaining unmatched human ON 81 has a candidate at 81 but accepted 83
(+2), so it is not defensible to apply a clip-wide hard-coded shift: eight
matched events are already exact.

## F. Pose correlation — Gav

Pose state is assessed in the ON ±1 frame window: `GOOD` means usable foot
evidence throughout the window, `DEGRADED` means partial/edge recovery, and
`MISSING` means no usable evidence at ON.

| Pose state | Human contacts | Detected ±1 | Missed | Recall |
| --- | ---: | ---: | ---: | ---: |
| Good | 10 | 9 | 1 | 90.0% |
| Degraded | 0 | 0 | 0 | N/A |
| Missing | 1 | 1 | 0 | 100.0% recovered at first verified frame |

The only good-pose miss is ON 81 and is caused by same-side candidate rejection,
not absence of lower-limb landmarks.

## G. Root-cause distribution

Before the correction, the five scored Gav FN/FP records distribute as:

| First stage | Count |
| --- | ---: |
| D — candidate generation (boundary indexing defect) | 2 |
| F — candidate rejection | 1 |
| E — candidate timing | 1 |
| J — other/end-of-run crop-edge artifact | 1 |

The highest-leverage single defect was the startup boundary bug (one FN and its
corresponding late FP), so R1 was limited to that subsystem.

## H. Production correction

`boundaryAwareMaxima` now finds the first **actually observed** finite foot
sample from the unsmoothed series. It still uses the smoothed trajectory for
prominence, but it requires the first observed sample and its next observed
sample to prove a rising foot. This prevents smoothing from leaking a later
sample backwards across an invalid/withheld frame.

The change does not relax localization safeguards, synthesize a contact in a
gap, alter zone filtering, add fixture data, add frame-number constants, or
change confidence semantics. A new full-run sanity test covers delayed pose
availability followed by a planted, rising foot.

## I. Gav before vs after

| Metric | Before | After |
| --- | ---: | ---: |
| Human contacts | 11 | 11 |
| AVA events | 12 | 12 |
| TP / FN / FP | 9 / 2 / 3 | 10 / 1 / 2 |
| Recall | 81.8% | 90.9% |
| Precision | 75.0% | 83.3% |
| Exact-frame % | 88.9% | 80.0% |
| ±1 frame % | 100% | 100% |
| ±2 frame % | 100% | 100% |
| Mean signed error | +0.11 frames | +0.20 frames |
| Mean absolute error | 0.11 frames | 0.20 frames |
| Median absolute error | 0 | 0 |
| Max absolute error | 1 | 1 |

The after score is intentionally still a fail: 90.9% recall and 83.3% precision
do not satisfy the 95/95 gate.

## J. Vanni before vs after

The generalized boundary correction has no effect on Vanni because its initial
usable signal does not satisfy the same first-observed planted-and-rising case.

| Metric | Before | After |
| --- | ---: | ---: |
| Human / AVA contacts | 11 / 10 | 11 / 10 |
| TP / FN / FP | 4 / 7 / 6 | 4 / 7 / 6 |
| Recall / precision | 36.4% / 40.0% | 36.4% / 40.0% |
| Exact / ±1 / ±2 among primary matches | 25.0% / 100% / 100% | 25.0% / 100% / 100% |
| Mean signed / absolute error | −0.75 / 0.75 frames | −0.75 / 0.75 frames |
| Median / max absolute error | 1 / 1 frames | 1 / 1 frames |

## K. Vanni residual error map

| Human ON | First stage | Branch |
| ---: | --- | --- |
| 7 | A — TRACK/ROI initial invalid/reacquiring span | Pose coverage |
| 21 | B — pose coverage at end of startup transition | Pose coverage |
| 34 | E — nearest accepted mark 37 (+3) | Contact logic/timing |
| 60 | E — nearest accepted mark 62 (+2) | Contact logic/timing |
| 87 | F/G — raw candidates 86/88/90 but accepted mark 83 | Contact logic/selection |
| 112 | F/G — raw candidates 112/114/115 but accepted mark 109 | Contact logic/selection |
| 125 | B — frozen-suspect pose gap 119–125 | Pose coverage |

Residual count: four contact-logic/selection failures and three
tracking/pose-coverage failures. Unmatched 37, 62, 109, and 128 fall within a
human stance window and are mainly timing/semantic disagreement; 83 is early
of 87–92 and 152 is after final OFF 144.

## L. Pose-conditional Vanni performance

| Pose state | Human contacts | Detected ±1 | Missed | Recall |
| --- | ---: | ---: | ---: | ---: |
| Good | 8 | 4 | 4 | 50.0% |
| Degraded | 1 | 0 | 1 | 0% |
| Missing | 2 | 0 | 2 | 0% |

**No.** Lower-limb pose usability alone does not currently make Vanni contact
detection reliable: even on good-pose windows its recall is 50.0%. Pose
coverage is a real branch, but contact selection/timing remains the larger
residual branch in this fixture.

## M. Regression results

Passed after the change:

- `node scripts/fullrun-sanity.mjs` (including new delayed-pose boundary case)
- `node scripts/steps-sanity.mjs`
- `node scripts/contacts-sanity.mjs`
- `node scripts/step-integrity-sanity.mjs`
- `node scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs` (28/28)
- `npm run typecheck`
- frozen-fixture structural validation and `git diff --check`

## N. Overfitting safeguards

The correction is based on a detector invariant, not Gav: a contact cannot be
at a frame with no foot observation. The first usable directly observed foot
sample is the only valid boundary candidate; its immediate raw rise is required.
No athlete, clip, source frame, human label, calibration zone, or new numerical
threshold enters the implementation.

## O. Files changed

- `src/lib/video/steps.ts` — fixes boundary indexing and exposes read-only stage
  trace data for offline diagnostics.
- `scripts/fullrun-sanity.mjs` — regression test for delayed pose availability.
- `scripts/phase-5-0a-contact-audit.mjs` — optional diagnostic artifact output,
  exact stage trace, and per-frame lower-limb evidence; production behavior is
  untouched.
- `validation/artifacts/gav-r1-upstream-contact-trace.json` — frozen-baseline
  Gav diagnostic evidence.
- `validation/artifacts/gav-r1-after-contact-trace.json` and
  `validation/artifacts/vanni-r1-after-contact-trace.json` — post-change evidence.
- This report.

## P. Remaining launch blockers

Gav has one good-pose contact lost by the same-side candidate-rejection policy
and one end-of-run false positive; it therefore fails the 95/95 contact gate.
Vanni additionally has three direct track/pose coverage failures and four
contact timing/selection failures. Zone filtering is not a blocker.

## Q. NEXT TASK

**CONTACT ENGINE R2 focused only on the remaining proven candidate-selection
mechanism:** distinguish a real adjacent/alternate-foot event from the
same-side 250 ms rejection and handle end-of-run crop-edge peaks without
weakening pose/tracking safeguards. Do not begin pose coverage R1 yet because
Gav has not reached 95/95.

Tracking reliability: 90.9% on Gav ON frames after boundary recovery (10/11
stable-at-ON; no global claim).

Pose reliability: 72.7% good-pose windows on Vanni (8/11; no global claim).

Contact reliability: Gav 90.9% recall / 83.3% precision after R1; gate not met.

Measurement reliability: unchanged; not re-estimated by this contact-only R1.

Core MVP completion: unchanged; no percentage increase is evidenced by R1.

Launch readiness: unchanged; blocked by the Gav contact gate.

Overall AVA Performance launch completion: unchanged; not re-estimated by R1.
