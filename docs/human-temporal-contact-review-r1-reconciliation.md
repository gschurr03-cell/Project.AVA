# Human temporal contact review R1 — reconciliation

## A. Result

**RESULT A — HIGH HUMAN REPEATABILITY, for submitted ON/OFF frame labels.** The
completed review reproduces every frozen ON and OFF frame exactly across the 22
reviewed contacts. The primary frame-level validation standard remains justified;
no tolerance or scoring change is recommended.

This result is deliberately scoped to what the submitted file contains. It
contains contact-indexed ON/OFF frames but no side labels, confidence,
observability, `contactExists`, or terminal-event fields; those quantities are
reported as unmeasured, not inferred.

## B. Review method

Reconciled the supplied completed
`/Users/imac/Downloads/blinded-review-template.json` against the immutable Gav
and Vanni fixtures. The submitted records identify contacts by original ordinal
rather than the randomized review code, so the restricted key was used only to
confirm the corresponding ordering/clip mapping. No fixture or submitted review
was edited.

## C. Gav repeatability

| Measure | Result |
| --- | ---: |
| Contacts | 11 |
| ON exact / ±1 / ±2 | 11/11 (100%) / 100% / 100% |
| ON mean / median / max absolute disagreement | 0 / 0 / 0 frames |
| OFF exact / ±1 / ±2 | 11/11 (100%) / 100% / 100% |
| OFF mean / median / max absolute disagreement | 0 / 0 / 0 frames |
| Signed ON disagreement | 0 frames for every contact |

## D. Vanni repeatability

| Measure | Result |
| --- | ---: |
| Contacts | 11 |
| ON exact / ±1 / ±2 | 11/11 (100%) / 100% / 100% |
| ON mean / median / max absolute disagreement | 0 / 0 / 0 frames |
| OFF exact / ±1 / ±2 | 11/11 (100%) / 100% / 100% |
| OFF mean / median / max absolute disagreement | 0 / 0 / 0 frames |
| Signed ON disagreement | 0 frames for every contact |

## E. Side-label agreement

**Not measured.** The completed review has no side fields. No side agreement or
side-label accuracy is claimed.

## F. Gav 81–83

The submitted repeat review selects **ON 81 / OFF 85**, exactly matching frozen
Gav contact 7. Thus the disputed onset reproduces at the same frame (exact,
within ±1, and within ±2); it is not annotation noise in the submitted review.
Frame 81 is now defensibly treated as a real production contact-selection/timing
error when AVA emits the corresponding right-foot event at 83.

## G. Gav 139–141

**Not adjudicated by the submitted review.** It contains only the 11 frozen
contacts and no terminal `contactExists` record. The existing AVA 139 false
positive remains a production-score FP, but this reconciliation does not add an
independent human event-existence conclusion for 139–141.

## H. Human noise floor

For the submitted 22-contact sample: zero ON-frame and zero OFF-frame
disagreement — 0 ms at the 60-FPS source frame convention. This is an observed
repeatability result, not a claim that every future low-observability video has
zero annotation noise.

## I. Observability breakdown

**Not measured.** No observability categories were supplied. The exact
repeatability result should not be retroactively converted into HIGH/MEDIUM/LOW
labels.

## J. Recommended validation standard

Keep the frozen **±1 source-frame primary matching standard** unchanged. The
review also shows exact-frame repeatability in this sample, so exact onset error
remains a meaningful diagnostic metric; it should not replace the established
±1 launch gate without a separate policy decision. ±2 remains sensitivity only.

Contact existence and exact onset remain separate reports: for Gav contact 7,
AVA produces a nearby physical-event proxy at 83 but fails the reproducible
contact-on frame standard at 81.

## K. Production changes

**None.** Frozen truth, submitted blinded annotations, contact logic, pose,
tracking, zone filtering, and metrics are unchanged.

## L. Files added

- This reconciliation report only. The completed review remains at the supplied
  Downloads path and was not copied over or modified.

## M. NEXT TASK

**CONTACT ENGINE R5 — reproducible right-foot contact-on timing:** isolate and
correct only the validated Gav 81→83 right-foot temporal-selection error while
preserving the other exact Gav contacts. Do not include terminal-event
suppression: 139–141 was not independently adjudicated in the submitted review.

Tracking reliability: 90.9% on Gav ON frames after R1; unchanged by reconciliation.

Pose reliability: 72.7% good-pose Vanni windows; unchanged by reconciliation.

Contact reliability: Gav 90.9% recall / 83.3% precision; launch gate not met.

Measurement reliability: unchanged; not re-estimated by reconciliation.

Core MVP completion: unchanged; annotation work does not meet a production acceptance criterion.

Launch readiness: unchanged; blocked by the Gav contact gate.

Overall AVA Performance launch completion: unchanged; not re-estimated by reconciliation.
