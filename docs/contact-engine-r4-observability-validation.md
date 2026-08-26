# Contact Engine R4 — temporal contact-on observability validation

## A. Result

**RESULT C — OBSERVABILITY LIMIT** for the disputed Gav timing event. The
available 60-FPS side-view source does not localize the 81–83 transition with
enough independent visual certainty to justify redefining the contact engine.
This does not clear the broader contact pipeline: Vanni still has independently
traced pose and contact-selection failures.

## B. Reference dataset

R4 reviewed the canonical source, independently of AVA candidate output:

| Clip | Frames | Purpose |
| --- | --- | --- |
| Gav 60 | 78–86 | disputed temporal transition |
| Gav 60 | 135–141 | terminal emitted event |

Source-frame review assets are under `validation/artifacts/r4/`:
`gav-78-86-right-foot.png`, `gav-78-86-athlete.png`,
`gav-135-141-terminal.png`, and `gav-135-141-athlete.png`.

No additional independent human reviewer or independently supplied side labels
were available in this workspace. Consequently R4 does **not** claim a new
side-labelled ground-truth dataset, inter-rater statistics, or a revision to
the existing authoritative fixtures.

## C. Side-labelled truth

No side labels were added to frozen truth. The source images make leg identity
in this side view materially less certain during crossover; using AVA's inferred
side to fill that gap would violate the R4 protocol.

## D. Human repeatability

Not measured: a blinded repeat review or second independent reviewer was not
available. This is an evidence limitation, not a zero-disagreement result.

## E. Gav frame-81/83 adjudication

The athlete is visible across frames 78–86, but the relevant foot passes through
a short crossover/near-ground sequence. Source pixels show a plausible
transition in this range, yet do not make frame 81 versus 82 versus 83
independently repeatable as the first visible load frame at this resolution and
viewing geometry. The source does not support calling frame 83 a
high-confidence observable CONTACT ON.

**Answer: no — human CONTACT ON at frame 83 is not high-confidence observable
from the available source evidence.** The existing frozen ON 81 remains
authoritative for the current metric; this R4 conclusion only prevents treating
the two-frame disagreement as proof of a universal engine-timing defect.

## F. Gav frame-139 adjudication

The late source frames show rapid stride motion near the source boundary. A
near-ground foot configuration is visible around 139–141, but the exact contact
status is not independently decisive at 60 FPS; it cannot establish either a
confident “no contact” or a distinct late stance without a separate reviewer or
higher temporal/source detail. Therefore R4 cannot authorize terminal-event
suppression.

## G. Vanni observability map

No independent Vanni side-labelled source review was completed because R4 lacks
the required reviewer evidence. The existing instrumented result remains the
only defensible map: ON 7, 21, and 125 are pose/tracking-coverage failures;
ON 34, 60, 87, and 112 are contact timing/selection failures. R4 does not
reclassify these from AVA output alone.

## H. AVA performance by observability

Not statistically computable from the available independent evidence. The
frozen truth lacks observability labels, and R4 must not infer them from AVA.
The existing all-contact scores remain Gav 90.9% recall / 83.3% precision and
Vanni 36.4% / 40.0%.

## I. Side-label accuracy

Not scored. There is no independent side-labelled reference set.

## J. Validation-standard recommendation

Keep the current primary ±1-frame metric unchanged until repeatability evidence
exists. For future adjudication, record HIGH/MEDIUM/LOW onset observability and
report exact-frame and ±1 agreement separately. LOW-observability disagreements
must remain visible rather than quietly excluded, but should not alone justify a
new canonical event model.

## K. Production changes

**None.** No contact, pose, tracking, zone, metric, or truth change was made.

## L. Files added

- `validation/artifacts/r4/gav-78-86-right-foot.png` — full source contact sheet.
- `validation/artifacts/r4/gav-78-86-athlete.png` — athlete crop review sheet.
- `validation/artifacts/r4/gav-135-141-terminal.png` — full terminal source sheet.
- `validation/artifacts/r4/gav-135-141-athlete.png` — terminal athlete crop sheet.
- This report.

## M. NEXT TASK

**HUMAN TEMPORAL CONTACT REVIEW R1:** obtain a blinded repeat annotation or a
second independent reviewer for a side-labelled representative set, including
the Gav 81–83 and 139–141 sequences plus Vanni windows. This is the only
evidence-backed next task before changing validation semantics or contact-on
production logic.

Tracking reliability: 90.9% on Gav ON frames after R1; unchanged in R4.

Pose reliability: 72.7% good-pose Vanni windows; unchanged in R4.

Contact reliability: Gav 90.9% recall / 83.3% precision; launch gate not met.

Measurement reliability: unchanged; not re-estimated by R4.

Core MVP completion: unchanged; annotation evidence does not meet an acceptance criterion.

Launch readiness: unchanged; blocked by the Gav contact gate.

Overall AVA Performance launch completion: unchanged; not re-estimated by R4.
