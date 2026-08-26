# Contact Engine R2 — same-side candidate rejection and terminal-event trace

## A. Result

**FAIL.** R2 found no defensible generalized production correction for either
proposed mechanism. The trace refutes the premise that the Gav frame-81
same-side candidate is the missed physical contact, and it does not prove a
safe crop-edge predicate that distinguishes the terminal false positive from a
valid late contact. No production event behavior changed.

## B. R1 baseline

| Clip | Recall | Precision |
| --- | ---: | ---: |
| Gav 60 after R1 | 90.9% | 83.3% |
| Vanni 60 after R1 | 36.4% | 40.0% |

Frozen human truth, tracking, pose thresholds, calibration, and zone filtering
remain unchanged.

## C. Remaining Gav FN

The only primary-tolerance FN is human ON **81**. Its decision chain is:

| Evidence | Observation |
| --- | --- |
| Prior accepted stream | right 56 → left 70 → right 83 |
| Candidate at 81 | left; prominence 0.59395; visibility 0.92666 |
| Prior same-side mark | left 70, 183.33 ms earlier |
| Same-side decision | correctly rejected: below the existing 250 ms same-side stride guard and lower prominence than left 70 (0.61451) |
| Relevant opposite-side candidate | right 83; prominence 0.61028; visibility 0.94872; emitted |
| Human comparison | AVA right 83 is +2 frames from human ON 81 |

Lower-limb pose is complete and high-confidence at 79–84; track state is
`tracking`, crop containment is `crop_full_body_verified`, and crop-boundary
risk is false. The left candidate at 81 is not evidence that the guard deleted
the real event: it is a wrong-side/duplicate extremum between the left 70 and
right 83 sequence. Accepting it would add a same-side left contact only 183 ms
after the prior left mark and would create a fourth nearby event rather than
repair the right event's +2-frame timing.

Therefore the real remaining mechanism is **E — candidate timing / event
semantics**, not same-side candidate rejection. A same-side-retention change
would be both unsupported and likely reduce precision.

## D. Same-side fix

**None.** The existing same-side guard is correct for the traced candidate.
R2 intentionally does not weaken alternation, reassign sides, or preserve a
candidate merely because it falls near a human contact. The next contact task
must investigate why the valid right-foot trajectory first peaks at 83 while
visible load onset is 81.

## E. Remaining Gav FP

The sole post-R1 terminal false positive is **AVA 139** (left). It follows the
valid human/AVA right contact at 131 and occurs after human OFF 135.

| Evidence | Observation |
| --- | --- |
| Candidate | left 139; prominence 0.59476; visibility 0.84165 |
| Timing | 133.33 ms after 131, just beyond global 130 ms dedup spacing |
| Crop | crop right edge is clamped at source x=1.0 for frames 137–141 |
| Athlete box | moves right from x=0.900 at 137 to x=0.925 at 141; no explicit crop-invalid state |
| Pose | all left foot landmarks present; visibility 0.76–0.90; `tracked` / `crop_full_body_verified` |
| Temporal anomaly | left-foot mean y changes 0.597 (138) → 0.584 (139) → 0.603 (140) → 0.583 (141), creating a small smoothed local maximum amid high horizontal motion near the boundary |

The trace supports a **terminal trajectory-jitter candidate in a
boundary-clamped crop**, but it does *not* prove foot-landmark collapse,
truncation, stale reuse, a rejected crop, or a low-confidence pose. In
particular, the only available boundary-risk flag is false while the crop is
clamped, so using that flag would not catch this event; inventing a new fixed
edge distance or deleting terminal events would be speculative.

## F. Crop-edge fix

**None.** R2 does not suppress frame 139 with an unvalidated “late crop edge”
rule. Such a rule could reject real contacts near the frame boundary, violating
the requirement to distinguish valid late contacts from degraded evidence.

## G. Gav before vs after

There is no R2 code change, so post-R1 and post-R2 values are identical.

| Metric | R1 / R2 |
| --- | ---: |
| Human contacts / AVA contacts | 11 / 12 |
| TP / FN / FP | 10 / 1 / 2 |
| Recall / precision | 90.9% / 83.3% |
| Exact-frame % | 80.0% |
| ±1 / ±2 among primary matches | 100% / 100% |
| ±2 full-match recall / precision | 100.0% / 91.7% |
| Mean signed / absolute error | +0.20 / 0.20 frames |
| Median / max absolute error | 0 / 1 frames |

Gav remains below 95/95.

## H. Vanni before vs after

Vanni is unchanged because no R2 implementation was justified.

| Metric | R1 / R2 |
| --- | ---: |
| Human contacts / AVA contacts | 11 / 10 |
| TP / FN / FP | 4 / 7 / 6 |
| Recall / precision | 36.4% / 40.0% |
| Exact-frame % | 25.0% |
| ±1 / ±2 among primary matches | 100% / 100% |
| Mean signed / absolute error | −0.75 / 0.75 frames |
| Median / max absolute error | 1 / 1 frames |

## I. Vanni residual failure distribution

Unchanged from R1: three pose-coverage failures (ON 7, 21, 125) and four
contact timing/selection failures (ON 34, 60, 87, 112). The frame-81 Gav
finding reinforces that candidate-side labels cannot be assumed to establish
physical contact identity without side-labelled human truth or a temporally
aligned onset model.

## J. Pose-conditional Vanni performance

| Pose state | Human contacts | Detected | Missed | Recall |
| --- | ---: | ---: | ---: | ---: |
| Good | 8 | 4 | 4 | 50.0% |
| Degraded | 1 | 0 | 1 | 0% |
| Missing | 2 | 0 | 2 | 0% |

**No.** Contact R2 does not work reliably with usable lower-limb pose; no R2
change occurred and good-pose recall remains 50.0%.

## K. Regression results

No production behavior was changed in R2. The R1 regression results remain
valid: full-run boundary, steps, contacts, step integrity, multi-frame contact
evidence (28/28), TypeScript, fixture parsing, and diff validation all passed.
The R2 trace was taken from the saved post-R1 Gav decision artifact.

## L. Overfitting safeguards

No fixture-specific exception was introduced. R2 explicitly rejected two
plausible-looking but unsupported changes: accepting a wrong-side candidate at
81 and suppressing all boundary-clamped terminal candidates.

## M. Files changed

- This report only. No production code, truth fixture, zone geometry, or zone
  selection file changed during R2.

## N. NEXT TASK

**CONTACT ENGINE R3 focused only on contact-on temporal semantics:** derive a
general, observable onset event from the valid foot trajectory (rather than
retaining the lowest-foot local maximum as the canonical contact mark), and
validate it against the unchanged full-video truth. R3 must separately establish
a terminal-evidence predicate before altering any late-event behavior.

Tracking reliability: 90.9% on Gav ON frames after R1; unchanged in R2.

Pose reliability: 72.7% good-pose Vanni windows; unchanged in R2.

Contact reliability: Gav 90.9% recall / 83.3% precision; launch gate not met.

Measurement reliability: unchanged; not re-estimated by R2.

Core MVP completion: unchanged; no acceptance criterion improved in R2.

Launch readiness: unchanged; blocked by the Gav contact gate.

Overall AVA Performance launch completion: unchanged; not re-estimated by R2.
