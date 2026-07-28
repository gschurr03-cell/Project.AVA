# Athlete memory

## Historical truth

Athlete memory is an append-only event ledger. Corrections are new events referencing the
original source; existing payloads are not edited. Each source retains its engine or
contract version so a later AVA release cannot silently reinterpret past conclusions.

Stored event families include analyses, recommendations, priorities, reports, benchmark
comparisons, projections, validated changes, seasons, verified performance results,
training blocks and interruptions, reported health context, and coach interactions.

Reported health context records only the fact and source supplied to AVA. It is not an
injury diagnosis or injury-risk prediction.

## Recommendation memory

Recommendation memory preserves context, implementation status, compatible follow-up
evidence, signed relative effect, confidence, and future applicability. An effect is an
observed before/after association. The contract permanently sets
`causalClaimAllowed: false`; AVA must not say the recommendation caused the change.

No effect is calculated without a nonzero baseline, explicit compatible follow-up, and
linked evidence IDs. Missing follow-up remains `unknown`.

## Coach memory

Typed coach interactions support accepted or ignored recommendations, notes,
corrections, manual priorities, overrides, ratings, and reminders. They are versioned
events, scoped by athlete ownership, and included in twin snapshots. An override does not
delete the original AVA conclusion.

## Performance memory

Performance events support 60 m, 100 m, 200 m, 400 m, hurdles, relays, and a forward
compatible field-event category. PBs, season bests, meet results, splits, and readiness
records retain occurrence time and verification status instead of overwriting a single
profile value.

