# Contact Engine R3 — temporal contact-on audit

## A. Result

**FAIL.** The available Gav trace does not establish a repeatable frame-level
swing-to-stance signature that can safely replace the existing local-maximum
event. No production behavior changed.

## B. Current baseline

| Clip | Recall | Precision | TP / FN / FP |
| --- | ---: | ---: | --- |
| Gav after R1/R2 | 90.9% | 83.3% | 10 / 1 / 2 |
| Vanni after R1/R2 | 36.4% | 40.0% | 4 / 7 / 6 |

## C. Existing contact-event semantics

AVA marks a per-foot local maximum of a three-frame-smoothed foot-y trajectory,
then applies same-side spacing, cross-foot deduplication, and recovery. Image y
increases downward, so this is a lowest-foot proxy. It is not a direct pressure
or visible-load measurement.

## D. Temporal signature audit

The complete temporal lower-limb trace is already persisted in
`validation/artifacts/gav-r1-after-contact-trace.json`: every source frame
includes ankle/heel/toe x/y/visibility, foot mean velocity, tracking/crop
provenance, and every candidate/acceptance stage. Frozen OFF windows were used
only to confirm that emitted marks lie near stance starts rather than to create
an event rule.

Across the ten primary matched Gav events, signed AVA-minus-human-ON offsets
are `+1, 0, 0, 0, 0, +1, 0, 0, 0, 0`: eight exact and two one frame late.
There is therefore no consistent onset-to-lowest-foot delay that supports a
global shift. The trace contains pose jitter and short extrema on both sides;
using raw velocity reversal, acceleration, heel/toe order, or first-near-peak
frame would move several currently exact events without an independently
verified pressure signal.

## E. Frame-83 miss

At the remaining human ON 81, the correct right foot is fully observed and its
y series is approximately `0.608, 0.588, 0.609, 0.611, 0.610, 0.609` for
frames 79–84. The right-foot local maximum is emitted at 83; human visible
loading begins at 81. This is a two-frame plateau/timing disagreement, not a
missing event or a side-acceptance failure. The left candidate at 81 is a
separate wrong-side duplicate and remains correctly rejected.

The trace does not prove which of frames 81–83 is a generalized temporal onset:
the right foot has an earlier downward excursion at 79, followed by a brief
up/down fluctuation before the selected maximum. Selecting the first reversal
would be a fixture-driven choice and would not be stable under the observed
pose noise.

## F. Frame-139 false positive

The terminal left event has no clean swing-to-stance signature: its y trajectory
is discontinuous near a boundary-clamped crop (`0.597, 0.584, 0.603, 0.583` at
138–141). That explains why a three-frame local maximum exists, but it does not
provide a general replacement criterion: foot visibility remains 0.76–0.90 and
the crop is still marked tracked/full-body-verified. A temporal rule that
rejects this pattern has not been proven not to reject valid late contacts.

## G. Proposed generalized event model

**None.** R3 rejects a hard-coded or weakly inferred “first plateau frame”
model. The product needs either a validated stance-onset signal beyond the
current 2-D trajectory, or additional independently annotated clips showing a
repeatable onset signature before a canonical event redefinition is safe.

## H. Production change

None. The immutable truth, contact algorithm, zone pipeline, tracking, and pose
thresholds are unchanged.

## I. Gav before vs after

No R3 implementation was justified; values remain 11 human contacts, 12 AVA
events, 10 TP, 1 FN, 2 FP, 90.9% recall, and 83.3% precision. Matched timing:
80.0% exact, 100% ±1, 100% ±2, +0.20 mean signed frames, 0.20 mean absolute
frames, 0 median absolute frames, 1 max absolute frame.

## J. Vanni before vs after

Unchanged: 4 TP, 7 FN, 6 FP; 36.4% recall and 40.0% precision. Matched timing
remains 25.0% exact, 100% ±1, 100% ±2, −0.75 mean signed frames, 0.75 mean
absolute frames, median/max absolute error 1 frame.

## K. Vanni residual distribution

Unchanged: 3 tracking/pose-coverage failures (7, 21, 125) and 4 contact
timing/selection failures (34, 60, 87, 112). This does not establish that pose
coverage is the sole next blocker.

## L. Regression

No production code changed. R1 regression results remain the applicable clean
baseline: full-run boundary, steps, contacts, step integrity, multi-frame
contact evidence (28/28), TypeScript, fixture parsing, and diff validation.

## M. Overfitting safeguards

R3 adds no fixture lookup, frame shift, cadence rule, threshold, or edge rule.
It explicitly declines to treat one ambiguous right-foot plateau as a universal
contact-on signature.

## N. Files changed

- This report only.

## O. NEXT TASK

**CONTACT ENGINE R4 — temporal contact-on observability validation:** collect
and freeze side-labelled, frame-by-frame temporal reference evidence across
additional supported clips, then test whether a stance-onset signature is
repeatable before changing the canonical event model. This is required because
the present two-dimensional pose trace cannot distinguish loading onset from
the short plateau/noise pattern safely.

Tracking reliability: 90.9% on Gav ON frames after R1; unchanged in R3.

Pose reliability: 72.7% good-pose Vanni windows; unchanged in R3.

Contact reliability: Gav 90.9% recall / 83.3% precision; launch gate not met.

Measurement reliability: unchanged; not re-estimated by R3.

Core MVP completion: unchanged; no acceptance criterion improved in R3.

Launch readiness: unchanged; blocked by the Gav contact gate.

Overall AVA Performance launch completion: unchanged; not re-estimated by R3.
