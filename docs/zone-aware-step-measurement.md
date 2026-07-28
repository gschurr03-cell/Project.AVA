# Zone-aware step measurement

## Audit

The full-run contact detector in `src/lib/video/events.ts` remains the sole
contact-event source. `computeSprintMeasurements` previously filtered those
events with stabilized image-x or gate-crossing time. It then inherited each
in-zone contact's Euclidean distance from the preceding full-run contact. That
made two boundary errors possible:

- a temporally in-window contact could count despite landing outside a gate;
- the pre-zone contact to first-in-zone contact gap could enter step-length
  aggregates.

The worker biomechanics engine, contact detector, world-locked gate-crossing
timer, FPS policy, and stored analysis result contract are unchanged.

## Measurement contract

`analyzeZoneSteps` is a pure, deterministic layer over canonical contacts and
the world-locked Start/Finish gate midpoints.

1. Start→Finish defines the positive longitudinal sprint axis.
2. The known zone distance maps canonical axis units to metres.
3. Each contact exposes signed distance from Start and Finish, longitudinal
   position, lateral offset, projection confidence, membership, and flags.
4. `stepCountInZone` counts contacts whose longitudinal centre lies within the
   closed interval `[Start, Finish]`.
5. The length window begins at the first in-zone contact. It contains all
   consecutive in-zone intervals plus one final interval from the last in-zone
   contact to the first post-zone contact.
6. The pre-zone→first-in-zone interval and every contact after the first
   post-zone contact are excluded.
7. If no post-zone contact exists, only `N - 1` internal intervals are
   available and `missing_post_zone_contact` is emitted.
8. Step length is signed longitudinal displacement. Lateral displacement is
   reported separately and is never folded into length with `abs` or Euclidean
   distance.

The contract version is `zone-step-metrics-v1`. Gate ambiguity uses a deterministic
5 cm tolerance. A boundary contact is always flagged; its unrounded centre
position deterministically decides inclusion. Reverse, same-foot, low-confidence,
and implausible 0.25–4.00 m intervals are withheld and flagged.

## Integration and validation

`SprintMeasurements.zoneStepSummary` exposes the evidence without duplicating
stored analysis results. Existing fields consume its spatial membership and
valid longitudinal intervals when world-locked gates are available, and retain
the legacy fallback for older calibrations without canonical camera evidence.

## Authoritative downstream semantics

- Step frequency is the reciprocal of the mean duration of the same valid
  authoritative intervals used for step length, including a valid trailing-exit
  interval.
- Each interval belongs to its landing foot. Left/right averages are arithmetic
  means, and asymmetry is withheld until each side has at least two samples.
- Contact time includes only full contacts beginning inside the zone. A contact
  crossing Finish is labeled `partial_event` and excluded from the average.
- Flight time includes only complete internal flights. The flight landing at the
  first post-zone endpoint is labeled `partial_event` and excluded.
- Intelligence evidence carries the metric source, sample window, contact IDs,
  interval IDs, valid sample count, confidence, and quality flags.
- Benchmark and trusted-summary adapters read `zoneMetrics.summaries`; they no
  longer choose independently between competing step-length averages.
- Persisted worker results remain explicitly `legacy` until authoritative contact
  evidence is serialized. Reports and PB inputs fail closed instead of mixing
  legacy values with `zone-step-metrics-v1`.

Run:

```sh
npm run zone-step-counting:sanity
```

The suite covers no contacts, contacts entirely before/after the zone, one
contact, pre-zone exclusion, internal intervals, the first post-zone interval,
later post-zone exclusion, missing post-zone evidence, both boundary decisions,
right-to-left travel, lateral separation, alternating-foot validation, and
non-forward rejection.
