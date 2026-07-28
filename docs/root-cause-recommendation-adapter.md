# Root Cause-to-Recommendation Adapter

The adapter connects immutable `RootCauseState` evidence to recommendations only after
the existing Recommendation Engine completes eligibility, safety, catalog selection,
duplicate handling, and contraindication checks.

It can classify an existing recommendation as addressing a possible root cause, symptom,
consequence, maintenance need, monitoring need, conflict, unrelated finding, or unknown
relationship. It cannot create content, eligibility, cues, drills, prescriptions, or
causal certainty.

`OFF` returns the baseline unchanged. `SHADOW` computes comparisons only. `ADVISORY`
attaches structured context without order or eligibility changes. `BOUNDED_INFLUENCE`
may attach a clamped relevance modifier to an already eligible recommendation when an
explicit approved mapping passes every gate. Default mode is `SHADOW`.

The adapter records `downstreamReapplicationAllowed: false`. Priority, Optimization, and
Adaptive Coaching must treat the context as provenance and never apply its modifier again.
