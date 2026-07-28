# Deterministic trajectory models

## Compatible history

Only points matching the target metric and the most represented compatibility key enter
the trend. Ordering is deterministic by capture timestamp and session ID. Other protocol
groups are counted and disclosed as excluded.

## Classification

The v1 engine fits value against elapsed days and normalizes the signed 30-day change by
the historical mean. “Improvement” respects metric direction: increasing velocity and
decreasing contact time can both be improvement.

- rapid improvement: normalized improvement meets the centralized rapid threshold;
- steady improvement: positive trend below the rapid threshold;
- plateau: absolute change remains within the centralized plateau band;
- regression: trend moves in the unfavorable direction;
- inconsistent: regression residuals exceed the centralized variation limit;
- unknown: history is sparse, has no usable time span, or cannot be fitted.

Return-from-injury, early-development, and late-development labels exist in the versioned
contract but v1 does not infer them from age or health data. They require future validated
models and explicit context.

## Extrapolation

Future change is damped as the horizon grows. Extrapolation is also capped to a multiple
of the observed time span. Optional metric floors and ceilings may encode validated
physical measurement bounds, never presumed elite or genetic limits.

Immediate, 30-day, 90-day, 6-month, and 12-month horizons are explicit. Season,
off-season, and evidence-bounded peak cases use conservative internal horizons and state
their assumptions. Career and injury-recovery projections currently fail closed.

