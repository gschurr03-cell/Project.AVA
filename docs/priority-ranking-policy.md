# AVA Priority ranking policy

## Philosophy

Priority emerges from evidence and applicability, not metric magnitude, wording, or an
arbitrary displayed score. Numeric weights are private implementation details used only
to produce deterministic ordering.

## Ranking factors

The model considers:

- recommendation confidence;
- intervention evidence quality;
- compatible cross-session persistence;
- repeatability/directional consistency;
- compatible personal-baseline deviation;
- athlete-goal relevance;
- primary event;
- sprint phase;
- multi-observation agreement;
- coach relevance;
- recording confidence;
- safety tier;
- training applicability.

Missing signals are neutral. They are never replaced with guesses.

## Factor effects

The trace exposes only:

- `increased`: the factor adds support;
- `decreased`: the factor limits support;
- `neutral`: no compatible signal exists or the factor does not distinguish the action.

Internal point totals and weights are not serialized or rendered.

## Missing evidence

Recording, calibration, and evidence-collection actions receive additional applicability
when the alternative is a limited, experimental, or phase-uncertain mechanical change.
This allows “collect a compatible recording” to outrank a speculative cue.

## Strengths and not-priorities

Preserve-only recommendations become supporting strengths and explicit not-priorities for
change. If a preserve recommendation conflicts with a change recommendation in the same
family and has equal or stronger confidence, the change is suppressed.

## Conflict order

Competing actions prefer:

1. safer tier;
2. higher recommendation confidence;
3. stronger intervention evidence quality;
4. stronger athlete relevance and context;
5. repeated/persistent evidence;
6. deterministic stable ID ordering.

## Duplicate families

Semantic families include:

- front-side position, thigh recovery, and knee-height actions;
- asymmetry actions;
- posture/torso actions;
- cadence/rhythm actions;
- timing/velocity actions.

Only the strongest candidate in a family remains ranked. Other actions become explicit
not-priorities with a merge explanation.

## Ranking limits

- Top priorities: maximum 3
- Secondary priorities: maximum 5

This is ordering of existing candidate actions, not a new recommendation or
performance-impact scoring system.
