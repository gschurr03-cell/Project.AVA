# Human contact precision/recall validation

## Result

**Gav 60: full-video contact engine FAIL. Vanni 60: full-video contact engine
FAIL.** No contact, pose, zone, or metric production logic was changed.

The frozen annotations are complete source-video contact truth. Zone membership
is deliberately downstream: it cannot remove a human contact from the
full-video contact-engine score.

## Frozen truth and production path

The immutable human-reviewed fixtures are under
`validation/fixtures/ground-truth/`. They preserve the supplied definition:
contact-on is the first visible loaded foot-ground frame; contact-off is the
first fully off-ground frame, with toe contact still active. Side remains
`unknown` for every contact.

The audit uses the unchanged production sequence:

```text
continuous pose/athlete frames
  -> buildFullRunEvents / detectStepMarks (full-video contact stream)
  -> computeSprintMeasurements (authoritative zone membership)
  -> in-zone metric contacts
```

`buildFullRunEvents` already exposes the pre-zone stream, so no production
instrumentation or zone-filter change was necessary. The audit was rerun using
the pinned pose artifacts and current calibrated session geometry:

```sh
node --env-file=.env.local scripts/phase-5-0a-contact-audit.mjs gav-gt tmp/phase94/gav.pose.json e04a7983-7406-4a00-bb89-8ada7b10bf9f
node --env-file=.env.local scripts/phase-5-0a-contact-audit.mjs vanni60-gt tmp/phase94/vanni60.pose.json 3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d
```

AVA's contact mark is a source-frame local maximum of smoothed downward foot-y
(a lowest-foot proxy), not a separately measured pressure/load onset. The
comparison below is consequently the required operational baseline, not two
identically defined physical events.

## Layer 1 — full-video contact engine

One-to-one greedy matching uses ±1 source frame as primary and ±2 only as
sensitivity. Every frozen human ON is eligible, including before and after the
measurement zone.

| Clip | Human ON | Pre-zone AVA contacts | TP | FP | FN | Recall | Precision | ±2 recall / precision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gav 60 | 11 | 12 | 9 | 3 | 2 | 81.8% | 75.0% | 90.9% / 83.3% |
| Vanni 60 | 11 | 10 | 4 | 6 | 7 | 36.4% | 40.0% | 45.5% / 50.0% |

The ≥95% full-video precision-and-recall gate would require all 11 eligible
human contacts to match. Neither clip passes.

### Full-video timing error

| Clip | Exact | Exact % | ±1 % | ±2 % | MAE frames (ms) | Median | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gav | 8/9 | 88.9% | 100% | 100% | 0.11 (1.85) | 0 | 1 |
| Vanni | 1/4 | 25.0% | 100% | 100% | 0.75 (12.5) | 1 | 1 |

The Vanni audit normalizes detector cadence to 56.5301 Hz, but its pinned
`sourceTimestampMs` timeline is 60 Hz. The timing conversion above uses the
canonical source-frame timestamps (16.67 ms/frame).

### Full-video contact continuity

Gav produces a continuous pre-zone sequence from frames 10 through 139,
including contacts on both sides of the calibrated interval. It has two
full-video truth failures: startup ON 6 has no usable pose evidence, and ON 81
is displaced to accepted mark 83 (outside primary tolerance). The longest
accepted inter-mark gap is 14 frames versus 13 frames in human ON truth.

Vanni does not achieve the required pre-zone initialization: its first accepted
contact is frame 37 while human contacts occur at 7 and 21. It also loses ONs
at 34, 60, 87, 112, and 125 under primary tolerance. Its longest accepted
inter-mark gap is 19 frames versus 14 frames in human truth. Thus its contact
continuity failure is a contact-engine/pose-coverage issue, not a zone-filter
effect.

### Full-video failure inventory

Gav ON 6: **A — TRACK/ROI**. The raw foot series is unavailable through frame
6 while the crop is invalid/reacquiring. Gav ON 81: **E — TEMPORAL
CLUSTERING/DEDUP**. A raw candidate exists at 81, but accepted cross-side mark
83 is retained instead. Accepted 10 is within the human 6–11 stance window;
its primary-score disagreement is timing/proxy semantics, not evidence of an
extra physical contact. Accepted 139 is after the final annotated OFF 135.

Vanni ON 7: **A — TRACK/ROI** (initial raw-pose gap 0–20). ON 21 and 125:
**B — POSE COVERAGE** (125 ends at gap 119–125). ON 34 and 60: **C —
CANDIDATE TIMING** (nearest accepted marks 37 and 62). ON 87 and 112:
**E — TEMPORAL CLUSTERING/DEDUP** (raw nearby candidates exist, but retained
marks are 83 and 109). The unmatched accepted 37, 62, 109, and 128 occur
within human stance windows; their ON-score false-positive status principally
reflects proxy timing/meaning. Mark 152 is after the final annotated OFF 144.

## Layer 2 — in-zone measurement selection

This layer uses the authoritative calibrated geometry emitted by
`computeSprintMeasurements`, not reviewer assumptions. A selection result is
assessed only after a contact has been generated; a missing full-video contact
is reported as an upstream engine failure, not relabelled as a zone-selection
exclusion.

| Clip | Authoritative zone time | Human in-zone contacts | Human out-of-zone contacts |
| --- | --- | --- | --- |
| Gav 60 | 0.2173–2.1362 s | 2–10 (9) | 1, 11 (2) |
| Vanni 60 | 0.2079–2.5565 s | 2–11 (10) | 1 (1) |

### Gav 60 zone selection

AVA retains 12 pre-zone contacts and passes 9 (`19, 31, 44, 56, 70, 83, 93,
106, 118`) to in-zone metrics. It keeps `10, 131, 139` out of the metric
stream. Of nine human in-zone contacts, eight have a primary-tolerance detected
counterpart and all eight are correctly included; contact 7 is an upstream
timing/dedup failure (83 is in-zone but +2), not an exclusion by geometry.
There are zero detected in-zone contacts incorrectly excluded by the zone
selector.

Of the two human out-of-zone contacts, contact 11 has matching accepted 131
and is correctly excluded from metrics while retained in the full contact
stream. Contact 1 is an upstream full-video timing failure (human 6 versus
accepted 10), though the generated 10 is correctly classified out of zone.
No out-of-zone accepted mark is incorrectly included in metrics. Extra mark
139 is also correctly excluded and does not contaminate in-zone steps.

### Vanni 60 zone selection

AVA retains 10 pre-zone contacts and passes 9 (`37, 47, 62, 73, 83, 99, 109,
128, 137`) to in-zone metrics; it excludes 152. Of ten human in-zone contacts,
four have a primary-tolerance detected counterpart and all four are correctly
included. The other six are upstream full-video engine failures, not zone
membership rejections. There are zero detected in-zone contacts incorrectly
excluded by the zone selector.

Human out-of-zone contact 1 is not retained as a detected contact at all: this
is a Layer 1 startup/coverage failure, so it cannot count as a successful
downstream exclusion. No accepted out-of-zone contact is incorrectly included
in metrics; extra mark 152 is correctly excluded. Consequently the selector
does not contaminate metrics with out-of-zone marks, but the full-video engine
still fails to establish the required continuous pre-zone sequence.

## Contact-off and cadence

**CONTACT-OFF VALIDATION NOT CURRENTLY SUPPORTED.** AVA has no source-frame
event semantically identical to the supplied fully-off-ground definition; its
phase release/toe-off estimate needs a dedicated matcher.

Human full-video inter-contact cadence is Gav 4.80 Hz (10 intervals over
2.083 s) and Vanni 4.59 Hz (10 intervals over 2.183 s). Production full-run
combined step frequency is 4.85 Hz for Gav and 4.52 Hz for Vanni. Those
production figures are appropriately derived from the unfiltered sequence, but
they do not cure the failed per-contact precision/recall gate.

## Next task

Persist a read-only per-human-contact trace with pose state, raw candidates,
dedup/rejection decision, accepted full-stream mark, and zone decision. This
will make contact-engine remediation independently testable without changing
the zone filter or allowing out-of-zone contacts into in-zone metrics.
