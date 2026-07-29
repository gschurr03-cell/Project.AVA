# Digital Twin trend detection

## Compatibility

Trend and baseline calculations use only validated or limited analysis events with a
compatibility key. Experimental and invalid analyses are retained in the timeline but
excluded from calculations. Metric, unit, and compatibility key define an independent
series; incompatible protocols are never averaged.

## Baselines

Three compatible samples are required. A baseline reports arithmetic mean, median,
sample variance, evidence/sample-size confidence, sample size, last update time, and all
source event IDs. The most represented compatibility group is selected deterministically.

## Trend classes

V1 fits metric value against elapsed days and respects whether higher or lower values are
better:

- improving: favorable compatible slope;
- stable: effectively identical values with negligible residual variation;
- plateau: small nonzero change within the centralized stability band;
- regressing: unfavorable slope;
- highly variable: residual variation exceeds the centralized threshold;
- rapid adaptation: favorable normalized slope exceeds the rapid threshold;
- delayed adaptation: an initially flat compatible series becomes favorably sloped in
  the later half;
- unknown: fewer than three usable observations or no time span.

Every trend states that it is descriptive and does not establish cause.

## Memory trends

The same versioned trend history also contains:

- recommendation adherence, derived only from recorded implemented, partial,
  not-implemented, or unknown states;
- priority recurrence, classified as recurring after three stored occurrences in the same
  category;
- strength evolution, derived only from validated improvement events or explicit
  strength-priority events.

These trends retain source event IDs and confidence. Adherence does not establish
effectiveness, recurrence does not prove a persistent cause, and strength evidence does
not create a new recommendation.

## Confidence evolution

Twin confidence combines event confidence and breadth of immutable history. It increases
as compatible evidence accumulates. After a 90-day grace period without evidence, it
decays by a centralized amount per 30 days, with a documented floor when historical
evidence still exists. New evidence recomputes the score; old snapshots remain unchanged.
