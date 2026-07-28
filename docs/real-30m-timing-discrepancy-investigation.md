# Real 30 m timing discrepancy investigation

Investigation date: 2026-07-16
Status: physical validation failed; production result must be withheld

## Scope and decision

This was a read-only forensic investigation of immutable V1. No timing policy, FPS
classification, production calculation, gate model, stored analysis, or zone version was
changed. The deterministic `2.2438791599639187 s` arithmetic is correct for the saved
analytical planes, but those planes do not constitute an independently verified 30 m timing
zone. The result therefore must not be presented as a credible 30 m fly time.

This is decision-tree **Case D**, with an additional invalid-orientation finding: physical
30 m separation is unverified, and the selected start paint dash is unsuitable as the
infinite crossing plane that was derived from it. A new physically surveyed zone and new
analysis version are required; immutable V1 remains historical evidence.

## Physical-mark audit

| Gate | Saved selection | Visible physical evidence | Finding |
| --- | --- | --- | --- |
| Start | Frame 72, `(847,524)`–`(943,503)` px, `start-v1` | A short white paint dash beside a yellow cone. No distance label is visible. The segment is oriented largely along the athlete's left-to-right path. | It is not a transverse line spanning the athlete's lane. Extending it creates a diagonal plane that can be crossed through vertical gait motion after the athlete has already passed the dash longitudinally. |
| Finish | Frame 170, `(1023,459)`–`(1105,496)` px, `finish-v1` | A diagonal painted line beside large numerals `3–7`. Those are lane numbers, not 10/20/30 m labels. | The propagated plane remains aligned with this painted line. Separate tripod/cone timing equipment is visible farther down-track, so this line is not proven to be the external timer's finish trigger. |

The athlete's lane number cannot be identified confidently from the protected view. No
visible 10 m, 20 m, or 30 m distance labels were found in the 197-frame source. The video
does not independently establish that the saved marks are 30 m apart. `zoneDistanceMeters`
is metadata, not a physical survey.

## Start-plane defect

The saved start segment and extended analytical plane share the same anchor and orientation;
there is no stale endpoint or midpoint-only substitution. That faithful extension is the
problem. Frames 95–103 show the green physical dash well behind the athlete while the cyan
infinite plane still intersects his vertical reference trajectory. The torso transition at
99–100 is mathematically valid against that plane but is not a credible crossing of the
physical dash in the running direction.

As an independent visual clue—not a replacement timing result—the torso passes the
propagated dash midpoint longitudinally at frames 88–89, timestamp
`2.957948966193712 s`. By frames 99–100 it has been beyond that marker for roughly ten
frames. Because the dash does not define a cross-lane plane, an authoritative manual start
timestamp cannot be recovered without specifying the intended cone/trigger geometry.

## Finish-plane audit

Frames 162–171 show the saved finish segment, its extension, and athlete references. The
plane lies on the visible diagonal paint and torso crosses at frames 166–167. Rendering and
crossing detection use the same propagated endpoints. The later tripod/cone is distinct
from the saved finish line and prevents assuming that this is the external 2.77 finish.

## Body-reference diagnostics

These results use the unchanged saved planes and are diagnostic only:

| Reference | Start | Finish | Duration |
| --- | ---: | ---: | ---: |
| Torso | 3.308772909 s | 5.552652069 s | 2.243879160 s |
| Pelvis midpoint | 3.230631534 s | 5.603335530 s | 2.372703997 s |
| Chest center | 3.391322007 s | 5.503054995 s | 2.111732988 s |
| Estimated center of mass | 3.298223409 s | 5.559956797 s | 2.261733389 s |
| Leading shoulder | 3.388173676 s | 5.500395422 s | 2.112221746 s |
| Leading foot | 2.975795867 s | 5.670851594 s | 2.695055726 s |

The 0.58-second spread is itself evidence that the start plane is badly oriented relative
to travel. Body-reference choice is not an acceptable correction and no reference was
selected to approach 2.77.

## Manual-versus-AVA table

| Evidence | Start | Finish | Duration | Interpretation |
| --- | ---: | ---: | ---: | --- |
| AVA saved-plane torso | 3.308772909 s | 5.552652069 s | 2.243879160 s | Deterministic but physically invalid as a 30 m result. |
| Independent longitudinal midpoint clue | 2.957948966 s | 5.552652069 s | 2.594703103 s | Shows the athlete passed the start dash much earlier; not authoritative because the dash does not define a transverse trigger. |
| Authoritative manual physical timing | unavailable | unavailable | unavailable | Cannot be created without confirmed trigger planes and surveyed distance. |

The midpoint clue differs from AVA by `0.350823943 s`. It is not used to correct V1.

## Frame-count and distance clues

- The crossing brackets are 67 source-frame intervals apart: `67 / 30 = 2.233333333 s`.
- Sub-frame interpolation produces `2.243879160 s`, only `10.545827 ms` longer.
- Interpolation cannot explain the approximately 0.526-second external discrepancy.
- At AVA's calculated velocity, 2.77 s would imply `37.034079857 m`.
- At the external 30 m / 2.77 s velocity, AVA's duration would imply
  `24.301940361 m`.

These are forensic clues only and do not establish either distance.

## Camera propagation

Start frame 72 → 99 uses 27 forward previous-to-current transforms. The composed pixel
affine is approximately `[[1.013337, 0.018466, -647.032], [-0.018466, 1.013337,
-43.167]]`, or −1.04399° rotation and 1.01351 scale. Minimum confidence is 0.47524 and
maximum residual 0.89963 px.

Finish frame 170 → 166 correctly uses four inverse transforms. Its composed pixel affine
is approximately `[[1.005405, -0.012933, 157.940], [0.012933, 1.005405, -31.550]]`, or
+0.73700° rotation and 1.00549 scale. Minimum confidence is 0.50911 and maximum residual
0.77129 px.

Both render and crossing code consume the same propagated geometry. No wrong pivot,
normal formula, transform direction, or stale endpoint defect was found.

## External 2.77 evidence

The only discoverable evidence is the session title `panning 30m fly, stands view, 2.77`,
filename `IMG_6371 2.mov`, product-owner fixture metadata, and repeated documentation of
the same claim. No original start/finish trigger, body reference, timing system, hand/gate
method, or rounding definition exists. Visible tripod/cone equipment differs from at least
the saved finish line. The reference remains `partially_compatible` by claimed distance
only and cannot validate or tune AVA.

## Artifacts

- `/tmp/ava-track-map-contact-sheet.jpg`: complete-source contact map.
- `/tmp/ava-track-mark-map-annotated.jpg`: selected marks and separate equipment.
- `/tmp/ava-start-raw-strip.jpg` and `/tmp/ava-finish-raw-strip.jpg`: unmodified pixels.
- `/tmp/ava-start-crossing-forensic.jpg` and
  `/tmp/ava-finish-crossing-forensic.jpg`: segment, plane, normal, references, and sides.
- `/tmp/ava-athlete-reference-trajectories.jpg`: reference paths versus both planes.

## Required next action

Do not mutate V1. Survey or otherwise prove two physical trigger locations 30 m apart,
identify the intended lane and timing equipment, select transverse planes at those triggers,
and create a new zone/analysis version. Until then, withhold the 2.24 result and keep
accuracy validation unresolved.

## Gate-lock stabilization follow-up

The failed V1 result is now durably `invalid_gate_propagation` and excluded downstream.
A hybrid local tracker substantially improves annotated alignment and rejects cones,
athletes, discontinuous corrections, offscreen projections, and missing local evidence.
Full homography performed worse and was not selected. The finish line meets spatial error
targets, but the start crossing neighborhood still lacks a trusted manual correction
keyframe and remains limited. Timing revalidation is therefore still prohibited.
